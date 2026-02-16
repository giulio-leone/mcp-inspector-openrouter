/**
 * Form executor: fills fields, handles select/checkbox/radio, submits.
 *
 * Supports two tool prefixes:
 * - `form.submit-*` — fills all fields of a <form> and submits
 * - `form.fill-*`   — fills a single standalone input field
 *
 * Uses native value setter for React/Vue compatibility.
 * Submits via submit button click > form.submit() > submit event.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class FormExecutor extends BaseExecutor {
  readonly category = 'form' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    // ── form.fill-* : single standalone field ──
    if (tool.name.startsWith('form.fill-')) {
      const el = this.findElement(tool);
      if (!el) return this.fail('Field element not found');

      const parsed = this.parseArgs(args);
      const value = parsed.value;
      if (value === undefined) return this.fail('Missing "value" argument for form.fill-*');

      this.setFieldValue(el, value);

      return this.ok(`Field "${tool.name}" set to "${String(value)}"`);
    }

    // ── form.submit-* : fill + submit a <form> ──
    const form = this.findElement(tool) as HTMLFormElement | null;
    if (!form) return this.fail('Form element not found');

    const parsed = this.parseArgs(args);

    for (const [key, value] of Object.entries(parsed)) {
      const input = form.querySelector<HTMLElement>(
        `[name="${CSS.escape(key)}"], #${CSS.escape(key)}`,
      );
      if (!input) continue;

      if (
        input instanceof HTMLInputElement &&
        input.type === 'radio'
      ) {
        const radio = form.querySelector<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(key)}"][value="${CSS.escape(String(value))}"]`,
        );
        if (radio) this.setFieldValue(radio, value);
      } else {
        this.setFieldValue(input, value);
      }
    }

    // Small delay for frameworks to process value changes
    await new Promise((r) => setTimeout(r, 100));

    // Strategy 1: find and click a submit button
    const submitBtn = form.querySelector<HTMLElement>(
      'input[type="submit"], button[type="submit"], button:not([type])',
    );

    if (submitBtn) {
      submitBtn.click();
    } else {
      // Strategy 2: native form.submit()
      form.submit();
    }

    const fieldCount = Object.keys(parsed).length;
    return this.ok(
      `Form "${tool.name}" submitted with ${fieldCount} fields`,
    );
  }

  /** Set the value of a single form field with React/Vue-compatible native setters. */
  private setFieldValue(el: Element, value: unknown): void {
    if (el instanceof HTMLSelectElement) {
      const opt = [...el.options].find(
        (o) => o.value.toLowerCase() === String(value).toLowerCase(),
      );
      if (opt) el.value = opt.value;
    } else if (
      el instanceof HTMLInputElement &&
      el.type === 'checkbox'
    ) {
      el.checked = !!value;
    } else if (
      el instanceof HTMLInputElement &&
      el.type === 'radio'
    ) {
      el.checked = true;
    } else if (el instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      if (setter) setter.call(el, String(value));
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      if (setter) setter.call(el, String(value));
      else el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
