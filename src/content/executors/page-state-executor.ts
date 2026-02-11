/**
 * Page-state executor: scroll, theme toggle, back-to-top.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class PageStateExecutor extends BaseExecutor {
  readonly category = 'page-state' as const;

  async execute(tool: Tool): Promise<ExecutionResult> {
    if (tool.name === 'page.scroll-to-top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return this.ok('Scrolled to top');
    }

    if (tool.name === 'page.scroll-to-bottom') {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth',
      });
      return this.ok('Scrolled to bottom');
    }

    if (
      tool.name === 'page.toggle-theme' ||
      tool.name === 'page.click-back-to-top'
    ) {
      const el = this.findElement(tool) as HTMLElement | null;
      if (el) el.click();
      return this.ok(`Executed: ${tool.name}`);
    }

    return this.fail('Unknown page state action');
  }
}
