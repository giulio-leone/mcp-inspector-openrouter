/**
 * Search Scanner — discovers search inputs (type="search", role="search", etc.).
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

export class SearchScanner extends BaseScanner {
  readonly category = 'search' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const searchInputs = (root as ParentNode).querySelectorAll(
      'input[type="search"], [role="search"] input, input[name*="search" i], input[name*="query" i], input[name="q"], input[name="s"]',
    );

    for (const inp of searchInputs) {
      const form = (inp as Element).closest('form') as HTMLFormElement | null;
      const name = this.slugify(
        inp.getAttribute('aria-label') ||
          (inp as HTMLInputElement).placeholder ||
          'search',
      );

      tools.push(
        this.createTool(
          `search.query-${name}`,
          `Search: ${this.getLabel(inp as Element) || 'site search'}`,
          inp as Element,
          this.makeInputSchema([
            {
              name: 'query',
              type: 'string',
              description: 'Search query',
              required: true,
            },
          ]),
          this.computeConfidence({
            hasAria: !!inp.getAttribute('aria-label'),
            hasLabel: !!this.getLabel(inp as Element),
            hasName: true,
            isVisible: this.isVisible(inp as Element),
            hasRole: !!(inp as Element).closest('[role="search"]'),
            hasSemanticTag: (inp as HTMLInputElement).type === 'search',
          }),
          {
            annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
            form,
          },
        ),
      );
    }
    return tools;
  }
}
