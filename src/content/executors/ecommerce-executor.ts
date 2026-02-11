/**
 * E-commerce executor: add-to-cart, set quantity, checkout clicks.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class EcommerceExecutor extends BaseExecutor {
  readonly category = 'ecommerce' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const el = this.findElement(tool) as HTMLElement | null;
    if (!el) return this.fail('E-commerce element not found');

    if (tool.name.includes('.add-to-cart-')) {
      el.click();
      return this.ok(`Added to cart: ${tool.description}`);
    }

    if (tool.name.includes('.set-quantity-')) {
      const parsed = this.parseArgs(args);
      const qty = parsed.quantity ?? 1;
      (el as HTMLInputElement).value = String(qty);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return this.ok(`Set quantity to ${qty}`);
    }

    el.click();
    return this.ok(`E-commerce action: ${tool.name}`);
  }
}
