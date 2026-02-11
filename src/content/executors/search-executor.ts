/**
 * Search executor: fills search input, submits form or simulates Enter.
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

    el.value = query;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    const form =
      (tool._form as HTMLFormElement | null) ?? el.closest('form');
    if (form) {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    } else {
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
        }),
      );
    }

    return this.ok(`Searched for: "${query}"`);
  }
}
