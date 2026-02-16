/**
 * ToolRegistry — owns scanner/executor registries, 3-tier tool
 * discovery, schema enrichment, DOM observation, and result caching.
 *
 * Supports an optional IToolCachePort for persistent cross-session
 * caching of tool manifests per site (WebMCP cache layer).
 */

import type {
  Tool,
  CleanTool,
  ToolInputSchema,
  SchemaProperty,
} from '../types';
import { DOM_OBSERVER_DEBOUNCE_MS } from '../utils/constants';
import { ScannerRegistry } from './scanners';
import { ExecutorRegistry } from './executors';
import { mergeToolSets } from './merge';
import { AIClassifier } from './ai-classifier';
import type { IToolCachePort } from '../ports/tool-cache.port';
import type { IToolManifestPort } from '../ports/tool-manifest.port';
import type { IManifestPersistencePort } from '../ports/manifest-persistence.port';
import { extractSite } from '../adapters/indexeddb-tool-cache-adapter';

const SCANNER_CACHE_TTL_MS = 2000;

export class ToolRegistry {
  private scannerRegistry = new ScannerRegistry();
  readonly executorRegistry = new ExecutorRegistry();
  private aiClassifier = new AIClassifier();

  /** Inferred tools keyed by name — used for execution routing */
  readonly inferredToolsMap = new Map<string, Tool>();

  // DOM observer state
  private domObserver: MutationObserver | null = null;
  private domObserverDebounce: ReturnType<typeof setTimeout> | null = null;

  // Scanner result cache (in-memory, 2s TTL)
  private scannerCacheTime = 0;
  private scannerCacheResult: Tool[] | null = null;

  /** Optional persistent tool cache (IndexedDB) */
  private toolCache: IToolCachePort | null = null;
  /** Optional tool manifest for MCP JSON export */
  private toolManifest: IToolManifestPort | null = null;
  /** Track if a background diff is already running to avoid duplicates */
  private diffInProgress = false;
  /** Callback invoked after manifest updates */
  private manifestUpdateCallback: (() => void) | null = null;
  /** Optional persistent manifest storage (IndexedDB) */
  private manifestPersistence: IManifestPersistencePort | null = null;

  constructor() {
    void this.aiClassifier;
  }

  /** Inject a persistent tool cache adapter. */
  setToolCache(cache: IToolCachePort): void {
    this.toolCache = cache;
  }

  /** Inject a tool manifest adapter. */
  setToolManifest(manifest: IToolManifestPort): void {
    this.toolManifest = manifest;
  }

  /** Inject a manifest persistence adapter. */
  setManifestPersistence(persistence: IManifestPersistencePort): void {
    this.manifestPersistence = persistence;
  }

  /** Get the tool manifest port (for message handler access). */
  getToolManifest(): IToolManifestPort | null {
    return this.toolManifest;
  }

  /** Register a callback invoked after each manifest update. */
  onManifestUpdate(callback: () => void): void {
    this.manifestUpdateCallback = callback;
  }

  /**
   * Load persisted manifest into the in-memory adapter on startup.
   * Call after setToolManifest and setManifestPersistence.
   */
  async loadPersistedManifest(): Promise<void> {
    if (!this.manifestPersistence || !this.toolManifest) return;
    const site = extractSite(location.href);
    try {
      const persisted = await this.manifestPersistence.load(site);
      if (persisted) {
        // Replay each page into the in-memory manifest adapter
        for (const [, page] of Object.entries(persisted.pages)) {
          const pageTools = persisted.tools.filter(t =>
            page.tools.includes(t.name),
          );
          const asClean: CleanTool[] = pageTools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema as unknown as CleanTool['inputSchema'],
            category: t.category as CleanTool['category'],
            annotations: t.annotations as CleanTool['annotations'],
            _source: 'manifest' as const,
          }));
          // Use a synthetic URL from the pattern to restore state
          this.toolManifest.updatePage(site, `https://${site}${page.urlPattern}`, asClean);
        }
        this.manifestUpdateCallback?.();
        console.debug(`[WebMCP] Restored persisted manifest for ${site}`);
      }
    } catch (e) {
      console.warn('[WebMCP] Failed to load persisted manifest:', e);
    }
  }

  /** Update manifest and persist in background. */
  private updateManifestAndPersist(site: string, url: string, tools: CleanTool[]): void {
    if (!this.toolManifest) return;
    const manifest = this.toolManifest.updatePage(site, url, tools);
    this.manifestUpdateCallback?.();
    if (this.manifestPersistence) {
      this.manifestPersistence.save(site, manifest).catch(e => {
        console.warn('[WebMCP] Manifest persistence save failed:', e);
      });
    }
  }

  // ── Public API ──

  invalidateCache(): void {
    this.scannerCacheResult = null;
  }

  async listToolsAlwaysAugment(): Promise<CleanTool[]> {
    const currentUrl = location.href;
    const site = extractSite(currentUrl);

    // ── Fast path: persistent cache hit ──
    if (this.toolCache) {
      try {
        const cached = await this.toolCache.get(site, currentUrl);
        if (cached && cached.length > 0) {
          console.debug(`[WebMCP] Cache hit for ${site} (${cached.length} tools)`);
          // Populate inferredToolsMap so tool execution routing works
          // before background diff completes. Inferred tools need DOM
          // elements for execution, so trigger a background diff that
          // will run fullScan() and re-populate with live DOM refs.
          this.inferredToolsMap.clear();
          for (const t of cached) {
            if (t._source === 'inferred') {
              this.inferredToolsMap.set(t.name, t as unknown as Tool);
            }
          }
          chrome.runtime.sendMessage({ tools: cached, url: currentUrl });
          // Update manifest with cached tools
          this.updateManifestAndPersist(site, currentUrl, cached as CleanTool[]);
          this.scheduleBackgroundDiff(site, currentUrl);
          return cached as CleanTool[];
        }
      } catch (e) {
        console.warn('[WebMCP] Cache read failed, falling back to scan:', e);
      }
    }

    // ── Full scan path ──
    let nativeTools: Tool[] = [];
    let declarativeTools: Tool[] = [];
    let inferredTools: Tool[] = [];

    // Tier 1: WMCP Native API
    if (navigator.modelContextTesting) {
      try {
        const raw = navigator.modelContextTesting.listTools() || [];
        nativeTools = this.enrichToolSchemas(raw as Tool[]);
      } catch (e) {
        console.warn('[WebMCP] Native API failed:', e);
      }
    }

    // Tier 2: Declarative HTML (form[toolname])
    const declForms = document.querySelectorAll('form[toolname]');
    if (declForms.length > 0) {
      declarativeTools = [...declForms].map((f) => {
        const form = f as HTMLFormElement;
        return {
          name: form.getAttribute('toolname') ?? '',
          description: form.getAttribute('tooldescription') ?? '',
          inputSchema: ToolRegistry.extractFormSchema(form),
        } as Tool;
      });
      declarativeTools = this.enrichToolSchemas(declarativeTools);
    }

    // Tier 3: Auto-Inference — use cache if fresh
    const now = Date.now();
    if (this.scannerCacheResult && (now - this.scannerCacheTime) < SCANNER_CACHE_TTL_MS) {
      inferredTools = this.scannerCacheResult;
      console.debug('[WebMCP] Using cached scanner results');
    } else {
      try {
        const scanStart = performance.now();
        inferredTools = this.scannerRegistry.scanAll();
        const scanMs = (performance.now() - scanStart).toFixed(1);
        console.debug(`[WebMCP] Scanner scan completed in ${scanMs}ms (${inferredTools.length} tools)`);
        this.scannerCacheResult = inferredTools;
        this.scannerCacheTime = now;
      } catch (e) {
        console.warn('[WebMCP] Inference scan failed:', e);
      }
    }

    // Store inferred tools for execution routing
    this.inferredToolsMap.clear();
    for (const t of inferredTools) {
      this.inferredToolsMap.set(t.name, t);
    }

    // Union merge (native wins on name collision)
    let tools = mergeToolSets(nativeTools, declarativeTools, inferredTools);

    // Post-merge cleanup: deduplicate by name (keep highest confidence),
    // filter out low-confidence tools, sort by category
    const dedupMap = new Map<string, Tool>();
    for (const tool of tools) {
      const existing = dedupMap.get(tool.name);
      if (!existing || (tool.confidence ?? 0) > (existing.confidence ?? 0)) {
        dedupMap.set(tool.name, tool);
      }
    }
    tools = [...dedupMap.values()]
      .filter((t) => (t.confidence ?? 1) >= 0.3)
      .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''));

    // Strip internal properties before sending to sidebar
    const cleanTools: CleanTool[] = tools.map(
      ({ _el, _form, _schemaAction, ...rest }) => rest,
    );

    const sources = {
      native: cleanTools.filter((t) => t._source === 'native').length,
      declarative: cleanTools.filter((t) => t._source === 'declarative')
        .length,
      inferred: cleanTools.filter((t) => t._source === 'inferred').length,
      manifest: cleanTools.filter((t) => t._source === 'manifest').length,
    };
    console.debug(
      `[WebMCP] ${cleanTools.length} tools (${sources.native}N + ${sources.declarative}D + ${sources.inferred}I + ${sources.manifest}M)`,
      cleanTools,
    );

    chrome.runtime.sendMessage({ tools: cleanTools, url: location.href });

    // ── Persist to cache in background ──
    if (this.toolCache) {
      this.toolCache.put(site, currentUrl, cleanTools).catch((e) => {
        console.warn('[WebMCP] Cache write failed:', e);
      });
    }

    // ── Update tool manifest ──
    this.updateManifestAndPersist(site, currentUrl, cleanTools);

    return cleanTools;
  }

  // ── Background Diff ──

  /**
   * Schedules a background diff: scans DOM and compares with cached tools.
   * If differences found, updates the cache and broadcasts updated tools.
   */
  private scheduleBackgroundDiff(site: string, url: string): void {
    if (this.diffInProgress || !this.toolCache) return;
    this.diffInProgress = true;

    queueMicrotask(async () => {
      try {
        const liveTools = await this.fullScan();
        const diff = await this.toolCache!.diff(site, url, liveTools);

        const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
        if (hasChanges) {
          console.debug(
            `[WebMCP] Diff: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length} =${diff.unchanged}`,
          );
          await this.toolCache!.applyDiff(site, url, diff);
          chrome.runtime.sendMessage({ tools: liveTools, url });
          // Update manifest with live tools after diff
          this.updateManifestAndPersist(site, url, liveTools);
        }
      } catch (e) {
        console.warn('[WebMCP] Background diff failed:', e);
      } finally {
        this.diffInProgress = false;
      }
    });
  }

  /** Run full 3-tier scan and return clean tools (no caching side effects). */
  private fullScan(): CleanTool[] {
    let nativeTools: Tool[] = [];
    let declarativeTools: Tool[] = [];
    let inferredTools: Tool[] = [];

    if (navigator.modelContextTesting) {
      try {
        const raw = navigator.modelContextTesting.listTools() || [];
        nativeTools = this.enrichToolSchemas(raw as Tool[]);
      } catch { /* ignore */ }
    }

    const declForms = document.querySelectorAll('form[toolname]');
    if (declForms.length > 0) {
      declarativeTools = [...declForms].map((f) => {
        const form = f as HTMLFormElement;
        return {
          name: form.getAttribute('toolname') ?? '',
          description: form.getAttribute('tooldescription') ?? '',
          inputSchema: ToolRegistry.extractFormSchema(form),
        } as Tool;
      });
      declarativeTools = this.enrichToolSchemas(declarativeTools);
    }

    inferredTools = this.scannerRegistry.scanAll();

    this.inferredToolsMap.clear();
    for (const t of inferredTools) this.inferredToolsMap.set(t.name, t);

    let tools = mergeToolSets(nativeTools, declarativeTools, inferredTools);
    const dedupMap = new Map<string, Tool>();
    for (const tool of tools) {
      const existing = dedupMap.get(tool.name);
      if (!existing || (tool.confidence ?? 0) > (existing.confidence ?? 0)) {
        dedupMap.set(tool.name, tool);
      }
    }
    tools = [...dedupMap.values()]
      .filter((t) => (t.confidence ?? 1) >= 0.3)
      .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''));

    return tools.map(({ _el, _form, _schemaAction, ...rest }) => rest);
  }

  // ── DOM Observer ──

  startDomObserver(): void {
    if (this.domObserver) return;

    this.domObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => {
        for (const node of [...m.addedNodes, ...m.removedNodes]) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (
              el.matches?.('form[toolname]') ||
              el.querySelector?.('form[toolname]')
            )
              return true;
            if (
              el.matches?.('[contenteditable="true"]') ||
              el.querySelector?.('[contenteditable="true"]')
            )
              return true;
            if (
              el.matches?.('[role="textbox"]') ||
              el.querySelector?.('[role="textbox"]')
            )
              return true;
            if (
              el.matches?.('input[type="file"]') ||
              el.querySelector?.('input[type="file"]')
            )
              return true;
            if (
              el.matches?.(
                '[aria-label*="like" i], [aria-label*="share" i], [aria-label*="follow" i]',
              )
            )
              return true;
          }
        }
        if (
          m.type === 'attributes' &&
          (m.target as Element).closest?.('form[toolname]')
        )
          return true;
        if (
          m.type === 'attributes' &&
          (m.attributeName === 'contenteditable' ||
            m.attributeName === 'role')
        )
          return true;
        if (
          m.type === 'characterData' &&
          (m.target as Node).parentElement?.closest?.('form[toolname]')
        )
          return true;
        return false;
      });

      if (relevant) {
        if (this.domObserverDebounce) clearTimeout(this.domObserverDebounce);
        this.domObserverDebounce = setTimeout(() => {
          console.debug('[WebMCP] DOM change detected, refreshing tools...');
          this.listToolsAlwaysAugment();
        }, DOM_OBSERVER_DEBOUNCE_MS);
      }
    });

    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: [
        'toolname',
        'tooldescription',
        'name',
        'value',
        'type',
      ],
    });
    console.debug('[WebMCP] DOM observer initialized');
  }

  stopDomObserver(): void {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    if (this.domObserverDebounce) clearTimeout(this.domObserverDebounce);
  }

  // ── Tool argument normalisation ──

  normalizeToolArgs(
    toolName: string,
    inputArgs: string | Record<string, unknown>,
  ): string {
    try {
      const args: Record<string, unknown> =
        typeof inputArgs === 'string' ? JSON.parse(inputArgs) : inputArgs;
      const form = document.querySelector(
        `form[toolname="${CSS.escape(toolName)}"]`,
      ) as HTMLFormElement | null;
      if (!form)
        return typeof inputArgs === 'string'
          ? inputArgs
          : JSON.stringify(inputArgs);

      const normalized = { ...args };

      for (const [key, value] of Object.entries(normalized)) {
        if (typeof value !== 'string') continue;

        const select = form.querySelector(
          `select[name="${CSS.escape(key)}"]`,
        ) as HTMLSelectElement | null;
        if (select) {
          const match = [...select.options].find(
            (opt) => opt.value.toLowerCase() === value.toLowerCase(),
          );
          if (match) {
            normalized[key] = match.value;
            continue;
          }
        }

        const radios = form.querySelectorAll(
          `input[type="radio"][name="${CSS.escape(key)}"]`,
        ) as NodeListOf<HTMLInputElement>;
        if (radios.length > 0) {
          const match = [...radios].find(
            (r) => r.value.toLowerCase() === value.toLowerCase(),
          );
          if (match) {
            normalized[key] = match.value;
            continue;
          }
        }
      }

      return JSON.stringify(normalized);
    } catch (e) {
      console.warn('[WebMCP] Normalization failed, using original args:', e);
      return typeof inputArgs === 'string'
        ? inputArgs
        : JSON.stringify(inputArgs);
    }
  }

  // ── Private helpers ──

  private enrichToolSchemas(tools: Tool[]): Tool[] {
    return tools.map((tool) => {
      const form = document.querySelector(
        `form[toolname="${CSS.escape(tool.name)}"]`,
      ) as HTMLFormElement | null;
      if (!form || !tool.inputSchema) return tool;

      let schema: ToolInputSchema;
      try {
        schema =
          typeof tool.inputSchema === 'string'
            ? JSON.parse(tool.inputSchema)
            : tool.inputSchema;
      } catch {
        return tool;
      }
      if (!schema.properties) return tool;

      const mutableProps = {
        ...schema.properties,
      } as Record<string, SchemaProperty>;

      for (const [propName, propDef] of Object.entries(mutableProps)) {
        const select = form.querySelector(
          `select[name="${CSS.escape(propName)}"]`,
        ) as HTMLSelectElement | null;
        if (select) {
          const vals = [...select.options]
            .map((o) => o.value)
            .filter(Boolean);
          if (vals.length) {
            mutableProps[propName] = { ...propDef, enum: vals };
          }
          continue;
        }
        const radios = form.querySelectorAll(
          `input[type="radio"][name="${CSS.escape(propName)}"]`,
        ) as NodeListOf<HTMLInputElement>;
        if (radios.length) {
          const vals = [...radios].map((r) => r.value).filter(Boolean);
          mutableProps[propName] = { ...propDef, enum: vals };
        }
      }

      const enrichedSchema: ToolInputSchema = {
        ...schema,
        properties: mutableProps,
      };

      return {
        ...tool,
        inputSchema: JSON.stringify(enrichedSchema),
      };
    });
  }

  private static extractFormSchema(form: HTMLFormElement): string {
    const props: Record<string, SchemaProperty> = {};
    const required: string[] = [];

    for (const inp of form.querySelectorAll(
      'input, select, textarea',
    ) as NodeListOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
      if (
        (inp as HTMLInputElement).type === 'hidden' ||
        (inp as HTMLInputElement).type === 'submit'
      )
        continue;
      const name = inp.name || inp.id;
      if (!name) continue;

      const prop: SchemaProperty = {
        type: (inp as HTMLInputElement).type === 'number' ? 'number' : 'string',
      };
      if (inp.tagName === 'SELECT') {
        const selectEl = inp as HTMLSelectElement;
        const enumVals = [...selectEl.options]
          .map((o) => o.value)
          .filter(Boolean);
        if (enumVals.length) {
          props[name] = { ...prop, enum: enumVals };
        } else {
          props[name] = prop;
        }
      } else {
        props[name] = prop;
      }

      if (inp.required) required.push(name);
    }

    return JSON.stringify({
      type: 'object',
      properties: props,
      ...(required.length ? { required } : {}),
    });
  }
}
