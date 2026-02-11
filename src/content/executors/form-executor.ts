/**
 * Form executor: fills fields, handles select/checkbox/radio, submits.
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
    const form = this.findElement(tool) as HTMLFormElement | null;
    if (!form) return this.fail('Form element not found');

    const parsed = this.parseArgs(args);

    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;

    for (const [key, value] of Object.entries(parsed)) {
      const input = form.querySelector<HTMLElement>(
        `[name="${key}"], #${key}`,
      );
      if (!input) continue;

      if (input instanceof HTMLSelectElement) {
        const opt = [...input.options].find(
          (o) => o.value.toLowerCase() === String(value).toLowerCase(),
        );
        if (opt) input.value = opt.value;
      } else if (
        input instanceof HTMLInputElement &&
        input.type === 'checkbox'
      ) {
        input.checked = !!value;
      } else if (
        input instanceof HTMLInputElement &&
        input.type === 'radio'
      ) {
        const radio = form.querySelector<HTMLInputElement>(
          `input[type="radio"][name="${key}"][value="${String(value)}"]`,
        );
        if (radio) radio.checked = true;
      } else if (input instanceof HTMLInputElement) {
        const setter = nativeInputSetter;
        if (setter) setter.call(input, String(value));
        else input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (input instanceof HTMLTextAreaElement) {
        const setter = nativeTextAreaSetter;
        if (setter) setter.call(input, String(value));
        else input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      input.dispatchEvent(new Event('change', { bubbles: true }));
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
}
