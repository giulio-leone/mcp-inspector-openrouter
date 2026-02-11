/**
 * E-commerce Scanner — discovers add-to-cart buttons and quantity inputs.
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

export class EcommerceScanner extends BaseScanner {
  readonly category = 'ecommerce' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];

    // ── Add to Cart buttons ──
    const addToCart = (root as ParentNode).querySelectorAll(
      '[data-action="add-to-cart"], button[class*="add-to-cart" i], button[id*="add-to-cart" i], ' +
        'button[aria-label*="add to cart" i], [data-mcp-type="add-to-cart"]',
    );
    for (const btn of addToCart) {
      const product = btn.closest(
        '[itemtype*="Product"], [data-product-id], .product',
      );
      const productName =
        product?.querySelector('[itemprop="name"]')?.textContent?.trim() || '';
      const productId =
        (product as HTMLElement)?.dataset?.productId ||
        this.slugify(productName) ||
        'item';

      tools.push(
        this.createTool(
          `shop.add-to-cart-${this.slugify(productId)}`,
          `Add to cart: ${productName || productId}`,
          btn,
          this.makeInputSchema([
            {
              name: 'quantity',
              type: 'number',
              description: 'Quantity to add',
              default: 1,
            },
          ]),
          0.9,
          {
            title: `Add to Cart: ${productName || productId}`,
            annotations: this.makeAnnotations({ destructive: true, idempotent: false }),
          },
        ),
      );
    }

    // ── Quantity inputs ──
    const qtyInputs = (root as ParentNode).querySelectorAll(
      'input[name*="quantity" i], input[name*="qty" i], [data-mcp-type="quantity"]',
    );
    for (const inp of qtyInputs) {
      const product = (inp as Element).closest(
        '[itemtype*="Product"], [data-product-id], .product',
      );
      const label =
        product?.querySelector('[itemprop="name"]')?.textContent?.trim() || 'item';

      tools.push(
        this.createTool(
          `shop.set-quantity-${this.slugify(label)}`,
          `Set quantity for: ${label}`,
          inp,
          this.makeInputSchema([
            {
              name: 'quantity',
              type: 'number',
              description: 'Desired quantity',
              required: true,
            },
          ]),
          0.8,
          {
            title: `Set Quantity: ${label}`,
            annotations: this.makeAnnotations({ destructive: false, idempotent: true }),
          },
        ),
      );
    }

    return tools;
  }
}
