/**
 * IndexedDBToolCacheAdapter — IToolCachePort implementation using IndexedDB.
 *
 * Stores per-site WebMCP manifests with URL pattern matching.
 * Supports incremental diff updates to avoid full rescans.
 */

import type {
  IToolCachePort,
  SiteManifest,
  CachedPage,
  ToolDiff,
} from '../ports/tool-cache.port';
import type { CleanTool } from '../types';

const DB_NAME = 'webmcp-tool-cache';
const DB_VERSION = 1;
const STORE_NAME = 'manifests';

/** Default cache TTL: 24 hours */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Hash a tools array for quick diff comparison. */
export function hashTools(tools: readonly CleanTool[]): string {
  const keys = tools.map((t) => `${t.name}:${t.confidence ?? 0}`).sort();
  let h = 0;
  const s = keys.join('|');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

/** Convert a concrete URL to a pattern for caching (strips query values). */
export function urlToPattern(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (!u.search) return path;
    const params = new URLSearchParams(u.search);
    const wildcarded = [...params.keys()].sort().map((k) => `${k}=*`);
    return `${path}?${wildcarded.join('&')}`;
  } catch {
    return url;
  }
}

/** Extract site origin from a URL. */
export function extractSite(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'site' });
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error);
  });
}

export class IndexedDBToolCacheAdapter implements IToolCachePort {
  private readonly ttlMs: number;

  constructor(options?: { ttlMs?: number }) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  async get(site: string, url: string): Promise<readonly CleanTool[] | null> {
    const manifest = await this.getManifest(site);
    if (!manifest) return null;

    const pattern = urlToPattern(url);
    const page = manifest.pages[pattern];
    if (!page) return null;

    if (Date.now() - page.scannedAt > this.ttlMs) return null;
    return page.tools;
  }

  async put(site: string, url: string, tools: readonly CleanTool[]): Promise<void> {
    const pattern = urlToPattern(url);
    const hash = hashTools(tools);
    const now = Date.now();

    const existing = await this.getManifest(site);
    const manifest: SiteManifest = existing
      ? { ...existing, version: existing.version + 1, pages: { ...existing.pages } }
      : { site, version: 1, lastFullScan: now, pages: {} };

    const mutablePages = manifest.pages as Record<string, CachedPage>;
    mutablePages[pattern] = { pattern, tools, hash, scannedAt: now };

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(manifest);
      tx.oncomplete = (): void => { db.close(); resolve(); };
      tx.onerror = (): void => { db.close(); reject(tx.error); };
    });
  }

  async getManifest(site: string): Promise<SiteManifest | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(site);
      req.onsuccess = (): void => { db.close(); resolve(req.result ?? null); };
      req.onerror = (): void => { db.close(); reject(req.error); };
    });
  }

  async diff(site: string, url: string, liveTools: readonly CleanTool[]): Promise<ToolDiff> {
    const cached = await this.get(site, url);
    if (!cached) {
      return { added: liveTools, removed: [], changed: [], unchanged: 0 };
    }

    const cachedMap = new Map(cached.map((t) => [t.name, t]));
    const liveMap = new Map(liveTools.map((t) => [t.name, t]));

    const added: CleanTool[] = [];
    const changed: CleanTool[] = [];
    const removed: string[] = [];

    for (const [name, tool] of liveMap) {
      const prev = cachedMap.get(name);
      if (!prev) {
        added.push(tool);
      } else if (hashTools([prev]) !== hashTools([tool])) {
        changed.push(tool);
      }
    }

    for (const name of cachedMap.keys()) {
      if (!liveMap.has(name)) removed.push(name);
    }

    const unchanged = liveTools.length - added.length - changed.length;
    return { added, removed, changed, unchanged };
  }

  async applyDiff(site: string, url: string, diff: ToolDiff): Promise<void> {
    const cached = await this.get(site, url);
    if (!cached) {
      await this.put(site, url, [...diff.added, ...diff.changed]);
      return;
    }

    const removedSet = new Set(diff.removed);
    const changedMap = new Map(diff.changed.map((t) => [t.name, t]));

    const merged = cached
      .filter((t) => !removedSet.has(t.name))
      .map((t) => changedMap.get(t.name) ?? t);

    const existingNames = new Set(merged.map((t) => t.name));
    for (const tool of diff.added) {
      if (!existingNames.has(tool.name)) merged.push(tool);
    }

    await this.put(site, url, merged);
  }

  async invalidate(site: string, url: string): Promise<void> {
    const manifest = await this.getManifest(site);
    if (!manifest) return;

    const pattern = urlToPattern(url);
    if (!(pattern in manifest.pages)) return;

    const pages = { ...manifest.pages };
    delete pages[pattern];

    const updated: SiteManifest = { ...manifest, version: manifest.version + 1, pages };

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(updated);
      tx.oncomplete = (): void => { db.close(); resolve(); };
      tx.onerror = (): void => { db.close(); reject(tx.error); };
    });
  }

  async invalidateSite(site: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(site);
      tx.oncomplete = (): void => { db.close(); resolve(); };
      tx.onerror = (): void => { db.close(); reject(tx.error); };
    });
  }

  async clear(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = (): void => { db.close(); resolve(); };
      tx.onerror = (): void => { db.close(); reject(tx.error); };
    });
  }
}
