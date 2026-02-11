/**
 * Form Scanner — discovers non-WMCP-native forms and their fields.
 * Only infers from forms that don't already have a `toolname` attribute.
 */

import type { Tool, ToolParameter } from '../../types';
import { BaseScanner } from './base-scanner';

export class FormScanner extends BaseScanner {
  readonly category = 'form' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const forms = (root as ParentNode).querySelectorAll('form:not([toolname])');

    for (const form of forms) {
      const name =
        this.slugify(
          form.getAttribute('aria-label') ||
            form.id ||
            (form as HTMLFormElement).action?.split('/').pop() ||
            'form',
        ) || 'unnamed-form';

      const inputs = form.querySelectorAll('input, select, textarea');
      if (inputs.length === 0) continue;

      const fields: ToolParameter[] = [];
      for (const inp of inputs) {
        const inputEl = inp as HTMLInputElement;
        if (inputEl.type === 'hidden' || inputEl.type === 'submit') continue;
        const fieldName = inputEl.name || inputEl.id || this.slugify(this.getLabel(inp)) || 'field';
        const field: ToolParameter = {
          name: fieldName,
          type: inputEl.type === 'number' ? 'number' : 'string',
          description: this.getLabel(inp),
          required: inputEl.required || inp.getAttribute('aria-required') === 'true',
          // Enums for select
          ...(inp.tagName === 'SELECT'
            ? {
                enum: [...(inp as HTMLSelectElement).options]
                  .map(o => o.value)
                  .filter(Boolean),
              }
            : {}),
        };
        fields.push(field);
      }

      // Radio groups — collapse into a single enum field
      const radioGroups = new Map<string, string[]>();
      for (const radio of form.querySelectorAll('input[type="radio"]')) {
        const gName = (radio as HTMLInputElement).name || 'radio';
        if (!radioGroups.has(gName)) radioGroups.set(gName, []);
        radioGroups.get(gName)!.push((radio as HTMLInputElement).value);
      }
      for (const [gName, vals] of radioGroups) {
        const idx = fields.findIndex(f => f.name === gName);
        if (idx >= 0) fields.splice(idx, 1);
        fields.push({ name: gName, type: 'string', enum: vals });
      }

      if (fields.length === 0) continue;

      const hasAriaLabel = !!form.getAttribute('aria-label');
      const label = this.getLabel(form) || name;

      tools.push(
        this.createTool(
          `form.submit-${name}`,
          `Submit form: ${label}`,
          form as Element,
          this.makeInputSchema(fields),
          this.computeConfidence({
            hasAria: hasAriaLabel,
            hasLabel: !!this.getLabel(form),
            hasName: !!form.id,
            isVisible: this.isVisible(form as Element),
            hasRole: false,
            hasSemanticTag: true,
          }),
          {
            title: `Submit: ${label}`,
            annotations: this.makeAnnotations({ destructive: true, idempotent: false }),
          },
        ),
      );
    }
    return tools;
  }
}
