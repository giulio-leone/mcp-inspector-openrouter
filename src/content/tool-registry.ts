/**
 * ToolRegistry — owns scanner/executor registries, 3-tier tool
 * discovery, schema enrichment, DOM observation, and result caching.
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

  // Scanner result cache
  private scannerCacheTime = 0;
  private scannerCacheResult: Tool[] | null = null;

  constructor() {
    // Keep aiClassifier referenced so tree-shaking doesn't remove it
    void this.aiClassifier;
  }

  // ── Public API ──

  invalidateCache(): void {
    this.scannerCacheResult = null;
  }

  async listToolsAlwaysAugment(): Promise<void> {
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
    };
    console.debug(
      `[WebMCP] ${cleanTools.length} tools (${sources.native}N + ${sources.declarative}D + ${sources.inferred}I)`,
      cleanTools,
    );

    chrome.runtime.sendMessage({ tools: cleanTools, url: location.href });
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
        `form[toolname="${toolName}"]`,
      ) as HTMLFormElement | null;
      if (!form)
        return typeof inputArgs === 'string'
          ? inputArgs
          : JSON.stringify(inputArgs);

      const normalized = { ...args };

      for (const [key, value] of Object.entries(normalized)) {
        if (typeof value !== 'string') continue;

        const select = form.querySelector(
          `select[name="${key}"]`,
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
          `input[type="radio"][name="${key}"]`,
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
        `form[toolname="${tool.name}"]`,
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
          `select[name="${propName}"]`,
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
          `input[type="radio"][name="${propName}"]`,
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
