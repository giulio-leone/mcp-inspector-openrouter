/**
 * Interactive Scanner — discovers buttons, tabs, toggles, dropdowns.
 * Runs AFTER social-action, richtext, and file-upload scanners so that
 * _claimedElements dedup prevents double-counting.
 */

import type { Tool } from '../../types';
import { BaseScanner, isSocialKeyword } from './base-scanner';

export class InteractiveScanner extends BaseScanner {
  readonly category = 'interactive' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];

    // ── Buttons ──
    const buttons = (root as ParentNode).querySelectorAll(
      'button:not(form[toolname] button), [role="button"]:not(a), input[type="button"]',
    );
    for (const btn of buttons) {
      if (tools.length >= this.maxTools) break;
      const inputBtn = btn as HTMLButtonElement;
      if (inputBtn.type === 'submit' && btn.closest('form:not([toolname])')) continue;
      if (this.isClaimed(btn)) continue;
      if (!this.isVisible(btn)) continue;
      if (!this.hasMeaningfulSize(btn, 30, 20)) continue;

      const label = this.getLabel(btn);
      if (!label || label.length < 2 || label.length > 60) continue;
      // Skip social actions — they belong to the social-action scanner
      if (isSocialKeyword(label)) continue;
      // Skip generic accessibility skip-links
      if (/^(vai a|skip to|go to content)/i.test(label)) continue;

      this.claim(btn);
      tools.push(
        this.createTool(
          `ui.click-${this.slugify(label)}`,
          `Click: ${label}`,
          btn,
          this.makeInputSchema([]),
          this.computeConfidence({
            hasAria: !!btn.getAttribute('aria-label'),
            hasLabel: true,
            hasName: !!btn.id,
            isVisible: true,
            hasRole: btn.getAttribute('role') === 'button' || btn.tagName === 'BUTTON',
            hasSemanticTag: btn.tagName === 'BUTTON',
          }),
          {
            annotations: this.makeAnnotations({ destructive: false, idempotent: false }),
          },
        ),
      );
    }

    // ── Tabs ──
    const tabs = (root as ParentNode).querySelectorAll('[role="tab"]');
    for (const tab of tabs) {
      if (this.isClaimed(tab)) continue;
      const label = this.getLabel(tab);
      if (!label) continue;
      this.claim(tab);
      tools.push(
        this.createTool(
          `ui.select-tab-${this.slugify(label)}`,
          `Select tab: ${label}`,
          tab,
          this.makeInputSchema([]),
          0.85,
          {
            title: `Tab: ${label}`,
            annotations: this.makeAnnotations({ readOnly: true, idempotent: true }),
          },
        ),
      );
    }

    // ── Toggle switches ──
    const toggles = (root as ParentNode).querySelectorAll(
      '[role="switch"], input[type="checkbox"][role="switch"]',
    );
    for (const toggle of toggles) {
      if (this.isClaimed(toggle)) continue;
      const label = this.getLabel(toggle);
      if (!label) continue;
      this.claim(toggle);
      tools.push(
        this.createTool(
          `ui.toggle-${this.slugify(label)}`,
          `Toggle: ${label}`,
          toggle,
          this.makeInputSchema([
            { name: 'checked', type: 'boolean', description: 'Desired state' },
          ]),
          0.9,
          {
            annotations: this.makeAnnotations({ destructive: false, idempotent: true }),
          },
        ),
      );
    }

    // ── Dropdowns / comboboxes ──
    const combos = (root as ParentNode).querySelectorAll(
      '[role="combobox"], [role="listbox"]',
    );
    for (const combo of combos) {
      if (this.isClaimed(combo)) continue;
      const label = this.getLabel(combo);
      if (!label) continue;
      this.claim(combo);
      const options = [...combo.querySelectorAll('[role="option"]')].map(
        o => o.textContent?.trim() ?? '',
      );
      tools.push(
        this.createTool(
          `ui.select-${this.slugify(label)}`,
          `Select option from: ${label}`,
          combo,
          this.makeInputSchema([
            {
              name: 'value',
              type: 'string',
              description: 'Option to select',
              ...(options.length ? { enum: options } : {}),
            },
          ]),
          0.85,
          {
            title: `Select: ${label}`,
            annotations: this.makeAnnotations({ destructive: false, idempotent: true }),
          },
        ),
      );
    }

    return tools;
  }
}
