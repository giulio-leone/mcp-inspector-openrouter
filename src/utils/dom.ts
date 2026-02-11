/**
 * DOM utility functions extracted from content.js and wmcp-inference-engine.js.
 */

import { SHADOW_DOM_MAX_DEPTH } from './constants';

/** Check if an element is visible (not display:none, visibility:hidden, or opacity:0) */
export function isVisible(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  if (!htmlEl.offsetParent && htmlEl.style?.display !== 'fixed') return false;
  const style = getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

/**
 * Get an accessible label for an element.
 * Checks: aria-label → aria-labelledby → label[for] → title → placeholder →
 * data-placeholder → short textContent.
 */
export function getLabel(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = document.getElementById(labelledBy);
    if (ref) return ref.textContent?.trim() ?? '';
  }

  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent?.trim() ?? '';
  }

  const htmlEl = el as HTMLElement;
  if (htmlEl.title) return htmlEl.title.trim();

  const inputEl = el as HTMLInputElement;
  if (inputEl.placeholder) return inputEl.placeholder.trim();

  const dataset = (el as HTMLElement).dataset;
  if (dataset?.placeholder) return dataset.placeholder.trim();

  const txt = el.textContent?.trim();
  if (txt && txt.length < 60 && !txt.includes('\n')) return txt;

  return '';
}

/** Convert text to a URL/tool-name-safe slug (max 64 chars) */
export function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * Traverse shadow DOM boundaries to query elements.
 * Searches up to `maxDepth` shadow roots deep.
 */
export function querySelectorDeep(
  root: Document | Element | ShadowRoot,
  selector: string,
  maxDepth: number = SHADOW_DOM_MAX_DEPTH,
): Element[] {
  const results: Element[] = [];

  function walk(node: Document | Element | ShadowRoot, depth: number): void {
    const matches = node.querySelectorAll(selector);
    for (const el of matches) {
      results.push(el);
    }

    if (depth >= maxDepth) return;

    const allElements = node.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        walk(el.shadowRoot, depth + 1);
      }
    }
  }

  walk(root, 0);
  return results;
}

/**
 * Extract all form field name/value pairs from a form element.
 * Uses FormData for standard form serialization.
 */
export function getFormValues(
  form: HTMLFormElement,
): Record<string, string> {
  return Object.fromEntries(new FormData(form).entries()) as Record<
    string,
    string
  >;
}
