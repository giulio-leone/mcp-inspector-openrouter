/**
 * Navigation Scanner — discovers navigation links inside <nav> or [role="navigation"].
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

export class NavigationScanner extends BaseScanner {
  readonly category = 'navigation' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const navLinks = (root as ParentNode).querySelectorAll(
      'nav a[href], [role="navigation"] a[href]',
    );

    for (const link of navLinks) {
      const href = link.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) continue;
      const label = this.getLabel(link) || link.textContent?.trim() || '';
      if (!label) continue;

      tools.push(
        this.createTool(
          `nav.go-${this.slugify(label)}`,
          `Navigate to: ${label}`,
          link as Element,
          this.makeInputSchema([]),
          this.computeConfidence({
            hasAria: !!link.getAttribute('aria-label'),
            hasLabel: true,
            hasName: true,
            isVisible: this.isVisible(link as Element),
            hasRole: true,
            hasSemanticTag: true,
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
