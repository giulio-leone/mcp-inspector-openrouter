/**
 * Interactive executor: button clicks, toggles, tab switches, combobox selection.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class InteractiveExecutor extends BaseExecutor {
  readonly category = 'interactive' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const el = this.findElement(tool) as HTMLElement | null;
    if (!el) return this.fail('Interactive element not found');

    // Toggle
    if (tool.name.includes('.toggle-')) {
      const parsed = this.parseArgs(args ?? {});
      if (
        (el instanceof HTMLInputElement && el.type === 'checkbox') ||
        el.getAttribute('role') === 'switch'
      ) {
        const checkbox = el as HTMLInputElement;
        const desired =
          parsed.checked !== undefined
            ? !!parsed.checked
            : !checkbox.checked;
        if (checkbox.checked !== desired) el.click();
        return this.ok(
          `Toggled "${tool.name}" to ${desired ? 'ON' : 'OFF'}`,
        );
      }
    }

    // Select option (combobox / listbox)
    if (tool.name.includes('.select-') && args) {
      const parsed = this.parseArgs(args);
      const value = parsed.value as string | undefined;
      if (value) {
        el.click();
        setTimeout(() => {
          const opts = [
            ...document.querySelectorAll('[role="option"]'),
          ];
          const match = opts.find(
            (o) =>
              (o.textContent ?? '').trim().toLowerCase() ===
              value.toLowerCase(),
          );
          if (match instanceof HTMLElement) match.click();
        }, 100);
        return this.ok(`Selected "${value}" from ${tool.name}`);
      }
    }

    // Default: click
    el.click();
    return this.ok(`Clicked: ${tool.name}`);
  }
}
