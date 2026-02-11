/**
 * Navigation Scanner — discovers ALL clickable links on the page as navigation tools.
 * Scans: <nav> links, [role="navigation"] links, and all other <a[href]> elements.
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

export class NavigationScanner extends BaseScanner {
  readonly category = 'navigation' as const;

  /** Raise cap for navigation — pages often have many links */
  protected override readonly maxTools = 200;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const seen = new Set<string>();

    // Scan ALL links on the page
    const allLinks = (root as ParentNode).querySelectorAll('a[href]');

    for (const link of allLinks) {
      const href = link.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

      const label = this.getLabel(link) || link.textContent?.trim() || '';
      if (!label || label.length < 2) continue;

      // Resolve to absolute URL for deduplication
      const absoluteHref = (link as HTMLAnchorElement).href;
      if (seen.has(absoluteHref)) continue;
      seen.add(absoluteHref);

      // Determine if link is in a nav region (higher confidence)
      const inNav = !!link.closest('nav, [role="navigation"]');

      tools.push(
        this.createTool(
          `nav.go-${this.slugify(label)}`,
          `Navigate to: ${label} (${absoluteHref})`,
          link as Element,
          this.makeInputSchema([]),
          this.computeConfidence({
            hasAria: !!link.getAttribute('aria-label'),
            hasLabel: true,
            hasName: true,
            isVisible: this.isVisible(link as Element),
            hasRole: inNav,
            hasSemanticTag: inNav,
          }),
          {
            title: `Navigate: ${label}`,
            annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
          },
        ),
      );
    }
    return tools;
  }
}
