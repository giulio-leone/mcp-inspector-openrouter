/**
 * Page State Scanner — discovers scroll, print, theme toggle controls.
 * Always emits scroll-to-top and scroll-to-bottom (virtual tools).
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

export class PageStateScanner extends BaseScanner {
  readonly category = 'page-state' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];

    // Always-available virtual scroll tools
    tools.push(
      this.createTool(
        'page.scroll-to-top',
        'Scroll to the top of the page',
        null,
        this.makeInputSchema([]),
        1.0,
        {
          title: 'Scroll to Top',
          annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
        },
      ),
    );

    tools.push(
      this.createTool(
        'page.scroll-to-bottom',
        'Scroll to the bottom of the page',
        null,
        this.makeInputSchema([]),
        1.0,
        {
          title: 'Scroll to Bottom',
          annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
        },
      ),
    );

    // ── Back to top button ──
    const backToTop = (root as ParentNode).querySelector(
      '[aria-label*="back to top" i], [class*="back-to-top" i], #back-to-top',
    );
    if (backToTop) {
      tools.push(
        this.createTool(
          'page.click-back-to-top',
          'Click the back-to-top button',
          backToTop,
          this.makeInputSchema([]),
          0.9,
          {
            title: 'Back to Top Button',
            annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
          },
        ),
      );
    }

    // ── Theme toggle ──
    const themeToggle = (root as ParentNode).querySelector(
      '[aria-label*="dark mode" i], [aria-label*="theme" i], ' +
        'button[class*="theme" i], [data-action="toggle-theme"]',
    );
    if (themeToggle) {
      tools.push(
        this.createTool(
          'page.toggle-theme',
          'Toggle dark/light mode',
          themeToggle,
          this.makeInputSchema([]),
          0.85,
          {
            title: 'Toggle Theme',
            annotations: this.makeAnnotations({ readOnly: false, idempotent: false }),
          },
        ),
      );
    }

    return tools;
  }
}
