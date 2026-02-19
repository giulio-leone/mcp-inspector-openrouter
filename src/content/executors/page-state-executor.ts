/**
 * Page-state executor: scroll (absolute & incremental), theme toggle, back-to-top.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

/** Detect user prefers-reduced-motion. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Wait for lazy-loaded content after a scroll (settles early if quiet). */
function waitForLazyContent(): Promise<number> {
  return new Promise((resolve) => {
    let added = 0;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) added += m.addedNodes.length;
      clearTimeout(timer);
      timer = setTimeout(() => { observer.disconnect(); resolve(added); }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => { observer.disconnect(); resolve(added); }, 2000);
  });
}

function pageHeight(): number {
  return Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
  );
}

function scrollPosition(): string {
  const total = pageHeight() - window.innerHeight;
  const pct = total > 0 ? Math.round((window.scrollY / total) * 100) : 100;
  return `${pct}% of page`;
}

export class PageStateExecutor extends BaseExecutor {
  readonly category = 'page-state' as const;

  async execute(tool: Tool): Promise<ExecutionResult> {
    const behavior = scrollBehavior();

    if (tool.name === 'page.scroll-to-top') {
      window.scrollTo({ top: 0, behavior });
      return this.ok('Scrolled to top');
    }

    if (tool.name === 'page.scroll-to-bottom') {
      window.scrollTo({ top: pageHeight(), behavior });
      return this.ok('Scrolled to bottom');
    }

    if (tool.name === 'page.scroll-down') {
      const before = window.scrollY;
      window.scrollBy({ top: window.innerHeight * 0.85, behavior });
      const added = await waitForLazyContent();
      const pos = scrollPosition();
      const lazyNote = added > 5 ? ` — new content loaded` : '';
      const atEnd = window.scrollY === before && added <= 5;
      if (atEnd) return this.ok(`Already at the bottom (${pos})`);
      return this.ok(`Scrolled down to ${pos}${lazyNote}`);
    }

    if (tool.name === 'page.scroll-up') {
      const before = window.scrollY;
      window.scrollBy({ top: -window.innerHeight * 0.85, behavior });
      await new Promise((r) => setTimeout(r, 400));
      const pos = scrollPosition();
      if (window.scrollY === before) {
        return this.ok(`Already at the top (${pos})`);
      }
      return this.ok(`Scrolled up to ${pos}`);
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
