/**
 * Auth executor: login form fill + submit, logout click.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class AuthExecutor extends BaseExecutor {
  readonly category = 'auth' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    if (tool.name === 'auth.login') {
      const form = this.findElement(tool) as HTMLFormElement | null;
      if (!form) return this.fail('Login form not found');

      const parsed = this.parseArgs(args);
      for (const [key, value] of Object.entries(parsed)) {
        const input = form.querySelector<HTMLInputElement>(
          `[name="${key}"], #${key}`,
        );
        if (input) {
          input.value = String(value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      return this.ok('Login form submitted');
    }

    if (tool.name === 'auth.logout') {
      const el = this.findElement(tool) as HTMLElement | null;
      if (el) el.click();
      return this.ok('Logout clicked');
    }

    return this.fail(`Unknown auth tool: ${tool.name}`);
  }
}
