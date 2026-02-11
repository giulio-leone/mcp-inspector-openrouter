/**
 * Abstract base class for all DOM scanners.
 * Provides shared helpers: confidence scoring, MCP-compliant naming,
 * visibility checks, label extraction, and element deduplication.
 */

import type {
  Tool,
  ToolCategory,
  ToolInputSchema,
  ToolAnnotations,
  ToolParameter,
  ConfidenceSignals,
  SchemaProperty,
} from '../../types';
import { MAX_TOOLS_PER_CATEGORY, SHADOW_DOM_MAX_DEPTH } from '../../utils/constants';

// ── Global element dedup across all scanners ──

/** Elements already claimed by a scanner — first scanner wins */
const _claimedElements = new WeakSet<Element>();

/** Claim an element so no other scanner can emit it */
export function claimElement(el: Element): void {
  _claimedElements.add(el);
}

/** Check whether an element has already been claimed */
export function isElementClaimed(el: Element): boolean {
  return _claimedElements.has(el);
}

// ── Social keyword regex (shared by interactive & social scanners) ──

const SOCIAL_KEYWORDS_RE =
  /\b(like|mi piace|consiglia|upvote|heart|share|condividi|diffondi|repost|retweet|follow|segui|subscribe|iscriviti|comment|commenta|reply|rispondi)\b/i;

/** Test if a label indicates a social action (like, share, follow, comment) */
export function isSocialKeyword(label: string): boolean {
  return SOCIAL_KEYWORDS_RE.test(label);
}

// ── Shadow DOM traversal ──

/** Recursively collect open Shadow DOM roots from a root element */
export function collectShadowRoots(
  root: Document | Element | ShadowRoot,
  maxDepth: number = SHADOW_DOM_MAX_DEPTH,
): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  if (maxDepth <= 0) return roots;

  const walk = (node: Document | Element | ShadowRoot, depth: number): void => {
    if (depth > maxDepth) return;
    if ('shadowRoot' in node && (node as Element).shadowRoot) {
      const sr = (node as Element).shadowRoot!;
      roots.push(sr);
      walk(sr, depth + 1);
    }
    const children =
      'children' in node ? node.children : (node as ParentNode).querySelectorAll('*');
    for (const child of Array.from(children)) {
      if (child.shadowRoot) {
        roots.push(child.shadowRoot);
        walk(child.shadowRoot, depth + 1);
      }
    }
  };

  walk(root, 0);
  return roots;
}

// ── Abstract Base Scanner ──

export abstract class BaseScanner {
  abstract readonly category: ToolCategory;

  /** Scan a root node and return discovered tools */
  abstract scan(root: Document | Element | ShadowRoot): Tool[];

  /** Per-category cap */
  protected readonly maxTools: number = MAX_TOOLS_PER_CATEGORY;

  // ── Shared helpers ──

  /** Compute a confidence score from discrete signals */
  protected computeConfidence(signals: ConfidenceSignals): number {
    let score = 0.4; // baseline
    if (signals.hasAria) score += 0.15;
    if (signals.hasLabel) score += 0.15;
    if (signals.hasName) score += 0.1;
    if (signals.hasRole) score += 0.1;
    if (signals.hasSemanticTag) score += 0.1;
    if (signals.isVisible === false) score -= 0.2;
    return Math.min(1, Math.max(0, score));
  }

  /** Build a Tool object with MCP-compliant naming */
  protected createTool(
    name: string,
    description: string,
    el: Element | null,
    schema: ToolInputSchema,
    confidence: number,
    opts: {
      title?: string;
      annotations?: ToolAnnotations;
      form?: HTMLFormElement | null;
      schemaAction?: Record<string, unknown>;
    } = {},
  ): Tool {
    return {
      name,
      title: opts.title ?? description,
      description,
      category: this.category,
      inputSchema: schema,
      annotations: opts.annotations ?? this.makeAnnotations(),
      confidence,
      _source: 'inferred' as const,
      _el: el,
      ...(opts.form !== undefined ? { _form: opts.form } : {}),
      ...(opts.schemaAction !== undefined ? { _schemaAction: opts.schemaAction } : {}),
    };
  }

  /** Slugify text for MCP-compliant tool name segments */
  protected slugify(text: string): string {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }

  /** Check if an element is visible in the viewport */
  protected isVisible(el: Element): boolean {
    const htmlEl = el as HTMLElement;
    if (!htmlEl.offsetParent && htmlEl.style?.display !== 'fixed') return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /** Check if an element has meaningful size (skips tiny/hidden utility buttons) */
  protected hasMeaningfulSize(el: Element, minW = 24, minH = 24): boolean {
    const rect = el.getBoundingClientRect?.();
    if (!rect) return true; // can't measure, assume ok
    return rect.width >= minW && rect.height >= minH;
  }

  /** Extract a human-readable label from an element */
  protected getLabel(el: Element): string {
    // 1. aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label')!.trim();
    // 2. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref) return ref.textContent?.trim() ?? '';
    }
    // 3. <label> with for= matching id
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) return lbl.textContent?.trim() ?? '';
    }
    // 4. title attribute
    const htmlEl = el as HTMLElement;
    if (htmlEl.title) return htmlEl.title.trim();
    // 5. placeholder
    if ((el as HTMLInputElement).placeholder) return (el as HTMLInputElement).placeholder.trim();
    // 6. data-placeholder (used by many rich text editors)
    if (htmlEl.dataset?.placeholder) return htmlEl.dataset.placeholder.trim();
    // 7. innerText (capped, single line only — avoids garbage from nested elements)
    const txt = el.textContent?.trim();
    if (txt && txt.length < 60 && !txt.includes('\n')) return txt;
    return '';
  }

  /** Build an MCP-compliant inputSchema from a list of parameters */
  protected makeInputSchema(fields: ToolParameter[]): ToolInputSchema {
    const props: Record<string, SchemaProperty> = {};
    const required: string[] = [];
    for (const f of fields) {
      const prop: SchemaProperty = {
        type: f.type || 'string',
        ...(f.description ? { description: f.description } : {}),
        ...(f.enum ? { enum: f.enum } : {}),
        ...(f.default !== undefined ? { default: f.default } : {}),
      };
      props[f.name] = prop;
      if (f.required) required.push(f.name);
    }
    return {
      type: 'object' as const,
      properties: props,
      ...(required.length ? { required } : {}),
    };
  }

  /** Build MCP-compliant annotations */
  protected makeAnnotations(hints: {
    readOnly?: boolean;
    destructive?: boolean;
    idempotent?: boolean;
    openWorld?: boolean;
  } = {}): ToolAnnotations {
    return {
      readOnlyHint: hints.readOnly ?? false,
      destructiveHint: hints.destructive ?? false,
      idempotentHint: hints.idempotent ?? false,
      openWorldHint: hints.openWorld ?? true,
    };
  }

  /** Claim an element for cross-scanner dedup */
  protected claim(el: Element): void {
    claimElement(el);
  }

  /** Check if an element has already been claimed */
  protected isClaimed(el: Element): boolean {
    return isElementClaimed(el);
  }
}
