/**
 * Search executor: fills search input, submits form or simulates Enter.
 *
 * Uses the native InputEvent setter to bypass React/framework value traps,
 * then submits via form.submit() (bypasses JS handlers that may preventDefault),
 * with fallback to submit button click, then form submit event, then Enter key.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class SearchExecutor extends BaseExecutor {
  readonly category = 'search' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const el = this.findElement(tool) as HTMLInputElement | null;
    if (!el) return this.fail('Search input not found');

    const parsed = this.parseArgs(args);
    const query = String(parsed.query ?? '');

    // Use native setter to work with React/Vue controlled inputs
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, query);
    } else {
      el.value = query;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    // Small delay to let frameworks react to the value change
    await new Promise((r) => setTimeout(r, 100));

    const form =
      (tool._form as HTMLFormElement | null) ?? el.closest('form');

    if (form) {
      // Strategy 1: find and click a submit button (most reliable)
      const submitBtn =
        form.querySelector<HTMLElement>(
          'input[type="submit"], button[type="submit"], button:not([type])',
        ) ??
        form.querySelector<HTMLElement>(
          '[role="button"], .search-submit, .search-btn, [class*="search"]',
        );

      if (submitBtn) {
        submitBtn.click();
      } else {
        // Strategy 2: native form.submit() — bypasses JS preventDefault
        form.submit();
      }
    } else {
      // No form: simulate full Enter key sequence
      const enterOpts: KeyboardEventInit = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      };
      el.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
      el.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
      el.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
    }

    return this.ok(`Searched for: "${query}"`);
  }
}
