/**
 * Schema.org Scanner — discovers potentialAction entries in JSON-LD.
 */

import type { Tool, ToolParameter } from '../../types';
import { BaseScanner } from './base-scanner';

/** Shape of a Schema.org JSON-LD item with potential actions */
interface SchemaOrgItem {
  potentialAction?:
    | SchemaOrgActionRaw
    | SchemaOrgActionRaw[];
}

interface SchemaOrgActionRaw {
  '@type'?: string;
  name?: string;
  target?: string | { 'query-input'?: string; url?: string; urlTemplate?: string };
}

export class SchemaOrgScanner extends BaseScanner {
  readonly category = 'schema-org' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];

    const ldScripts = (root as ParentNode).querySelectorAll(
      'script[type="application/ld+json"]',
    );

    for (const script of ldScripts) {
      try {
        const data: unknown = JSON.parse(script.textContent || '');
        const items: SchemaOrgItem[] = Array.isArray(data) ? data : [data as SchemaOrgItem];

        for (const item of items) {
          if (!item.potentialAction) continue;
          const actions: SchemaOrgActionRaw[] = Array.isArray(item.potentialAction)
            ? item.potentialAction
            : [item.potentialAction];

          for (const action of actions) {
            const actionType = action['@type'] || 'Action';
            const target = action.target;
            const name = this.slugify(action.name || actionType);

            const fields: ToolParameter[] = [];
            if (typeof target === 'object' && target['query-input']) {
              const match = target['query-input'].match(/name=(\w+)/);
              fields.push({
                name: match ? match[1] : 'query',
                type: 'string',
                description: `Input for ${actionType}`,
                required: true,
              });
            } else if (typeof target === 'string' && target.includes('{')) {
              const placeholders = target.match(/\{([^}]+)\}/g) || [];
              for (const ph of placeholders) {
                fields.push({
                  name: ph.replace(/[{}]/g, ''),
                  type: 'string',
                  description: `Parameter: ${ph.replace(/[{}]/g, '')}`,
                  required: true,
                });
              }
            }

            const title = `${actionType}: ${action.name || ''}`.trim();

            tools.push(
              this.createTool(
                `schema.${name}`,
                title,
                null,
                this.makeInputSchema(fields),
                0.95,
                {
                  title,
                  annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
                  schemaAction: action as unknown as Record<string, unknown>,
                },
              ),
            );
          }
        }
      } catch {
        // Invalid JSON-LD, skip
      }
    }

    return tools;
  }
}
