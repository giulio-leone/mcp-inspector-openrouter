/**
 * Navigation executor: clicks links, navigates to URLs.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class NavigationExecutor extends BaseExecutor {
  readonly category = 'navigation' as const;

  async execute(tool: Tool): Promise<ExecutionResult> {
    const link = this.findElement(tool) as HTMLAnchorElement | null;
    if (!link) return this.fail('Navigation link not found');

    const href = link.getAttribute('href');
    if (!href) return this.fail('No href found');

    link.click();
    return this.ok(`Navigated to: ${href}`);
  }
}
