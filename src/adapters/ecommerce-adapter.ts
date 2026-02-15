/**
 * EcommerceAdapter — DOM-based adapter for e-commerce platform interactions.
 * Supports Shopify, WooCommerce, Wix, and Webflow with platform-specific selectors.
 */

import type {
  IEcommercePort,
  EcommercePlatform,
  ProductInfo,
  CartItem,
} from '../ports/ecommerce.port';

/** Throw if value is empty or whitespace-only. */
export function requireNonEmpty(value: string, paramName: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${paramName} must be non-empty`);
  return trimmed;
}

/** Validate quantity is a positive integer. */
function requirePositiveQuantity(qty: number): void {
  if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
    throw new Error('quantity must be a positive integer');
  }
}

/** Platform-specific selector chains for add-to-cart buttons. */
const ADD_TO_CART_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: [
    '.product-form__submit',
    '[name="add"]',
    'button[type="submit"][name="add"]',
    'form[action*="/cart/add"] button[type="submit"]',
  ],
  woocommerce: [
    '.single_add_to_cart_button',
    'button[name="add-to-cart"]',
    '.add_to_cart_button',
  ],
  wix: [
    '[data-hook="add-to-cart"]',
    'button[aria-label*="Add to Cart" i]',
  ],
  webflow: [
    '.w-commerce-commerceaddtocartbutton',
    '[data-node-type="commerce-add-to-cart-button"]',
  ],
  unknown: [
    'button[type="submit"]',
    '[class*="add-to-cart" i]',
    '[class*="addtocart" i]',
  ],
};

/** Platform-specific quantity input selectors. */
const QUANTITY_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['[name="quantity"]', 'input[type="number"][id*="quantity" i]'],
  woocommerce: ['input.qty', '[name="quantity"]'],
  wix: ['[data-hook="number-input-spinner-input"]', 'input[type="number"]'],
  webflow: ['.w-commerce-commerceaddtocartquantityinput', 'input[type="number"]'],
  unknown: ['[name="quantity"]', 'input[type="number"]'],
};

/** Platform-specific variant select selectors. */
const VARIANT_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['.product__variants select', 'select[name="id"]', '[data-option-index] select'],
  woocommerce: ['.variations select', 'select[name*="attribute_"]'],
  wix: ['[data-hook="dropdown-base"] select', 'select[aria-label*="variant" i]'],
  webflow: ['.w-commerce-commerceaddtocartoptionselect', 'select[data-commerce-option]'],
  unknown: ['select[name*="variant" i]', 'select[name*="option" i]'],
};

/** Platform-specific cart page URLs. */
const CART_URLS: Record<EcommercePlatform, string> = {
  shopify: '/cart',
  woocommerce: '/cart/',
  wix: '/cart-page',
  webflow: '/checkout',
  unknown: '/cart',
};

/** Platform-specific checkout URLs. */
const CHECKOUT_URLS: Record<EcommercePlatform, string> = {
  shopify: '/checkout',
  woocommerce: '/checkout/',
  wix: '/checkout',
  webflow: '/checkout',
  unknown: '/checkout',
};

/** Query the DOM with fallback selectors. Returns null if nothing found. */
function queryFirst<T extends Element>(selectors: string[]): T | null {
  for (const sel of selectors) {
    const el = document.querySelector<T>(sel);
    if (el) return el;
  }
  return null;
}

export class EcommerceAdapter implements IEcommercePort {
  // ── Platform detection ──

  detectPlatform(): EcommercePlatform {
    // Shopify
    if (
      (window as unknown as Record<string, unknown>)['Shopify'] !== undefined ||
      document.querySelector('meta[name="shopify-checkout-api-token"]') ||
      document.querySelector('script[src*="cdn.shopify.com"]')
    ) {
      return 'shopify';
    }

    // WooCommerce
    if (
      document.body.classList.contains('woocommerce') ||
      (window as unknown as Record<string, unknown>)['wc_add_to_cart_params'] !== undefined ||
      document.querySelector('.woocommerce-page')
    ) {
      return 'woocommerce';
    }

    // Wix
    if (
      (window as unknown as Record<string, unknown>)['wixBiSession'] !== undefined ||
      document.querySelector('meta[name="generator"][content*="Wix" i]')
    ) {
      return 'wix';
    }

    // Webflow
    if (
      document.documentElement.hasAttribute('data-wf-site') ||
      document.querySelector('meta[name="generator"][content*="Webflow" i]')
    ) {
      return 'webflow';
    }

    return 'unknown';
  }

  isEcommerce(): boolean {
    return this.detectPlatform() !== 'unknown';
  }

  // ── Product actions ──

  async getProductInfo(): Promise<ProductInfo | null> {
    const nameEl = queryFirst<HTMLElement>([
      'h1.product-title',
      'h1.product_title',
      'h1[data-hook="product-title"]',
      'h1',
    ]);
    const priceEl = queryFirst<HTMLElement>([
      '.product-price',
      '.price .amount',
      'span.woocommerce-Price-amount',
      '[data-hook="product-price"]',
      '.price',
    ]);

    if (!nameEl || !priceEl) return null;

    const priceText = priceEl.textContent?.trim() ?? '';
    const currencyMatch = priceText.match(/^([^\d\s]+)/);

    const qtyInput = queryFirst<HTMLInputElement>(['[name="quantity"]', 'input.qty']);
    const variantSelects = document.querySelectorAll<HTMLSelectElement>(
      'select[name*="variant" i], select[name*="attribute_"], .product__variants select, select[name="id"]',
    );

    const variants: string[] = [];
    variantSelects.forEach((sel) => {
      sel.querySelectorAll('option').forEach((opt) => {
        if (opt.value && opt.textContent?.trim()) {
          variants.push(opt.textContent.trim());
        }
      });
    });

    const outOfStockEl = queryFirst<HTMLElement>([
      '.out-of-stock',
      '.stock.out-of-stock',
      '[data-hook="product-out-of-stock"]',
    ]);

    return {
      name: nameEl.textContent?.trim() ?? '',
      price: priceText,
      currency: currencyMatch?.[1] ?? '',
      inStock: outOfStockEl === null,
      quantity: qtyInput ? parseInt(qtyInput.value, 10) || 1 : undefined,
      variants: variants.length > 0 ? variants : undefined,
    };
  }

  async addToCart(quantity?: number, variant?: string): Promise<void> {
    const platform = this.detectPlatform();

    if (variant !== undefined) {
      await this.selectVariant(variant);
    }
    if (quantity !== undefined) {
      await this.setQuantity(quantity);
    }

    const btn = queryFirst<HTMLElement>(ADD_TO_CART_SELECTORS[platform]);
    if (!btn) throw new Error(`Add to cart button not found (platform: ${platform})`);
    btn.click();
  }

  async selectVariant(variant: string): Promise<void> {
    const safe = requireNonEmpty(variant, 'variant');
    const platform = this.detectPlatform();
    const select = queryFirst<HTMLSelectElement>(VARIANT_SELECTORS[platform]);
    if (!select) throw new Error(`Variant selector not found (platform: ${platform})`);
    select.value = safe;
    if (select.value !== safe) {
      throw new Error(`Variant "${variant}" not found in available options`);
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async setQuantity(qty: number): Promise<void> {
    requirePositiveQuantity(qty);
    const platform = this.detectPlatform();
    const input = queryFirst<HTMLInputElement>(QUANTITY_SELECTORS[platform]);
    if (!input) throw new Error(`Quantity input not found (platform: ${platform})`);
    input.value = String(qty);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ── Cart ──

  async viewCart(): Promise<void> {
    const platform = this.detectPlatform();
    window.location.href = CART_URLS[platform];
  }

  async getCartItems(): Promise<CartItem[]> {
    const rows = document.querySelectorAll<HTMLElement>(
      '.cart-item, .cart_item, tr.woocommerce-cart-form__cart-item, [data-hook="cart-widget-item"]',
    );
    const items: CartItem[] = [];
    rows.forEach((row) => {
      const nameEl = row.querySelector<HTMLElement>(
        '.cart-item__name, .product-name a, td.product-name a, [data-hook="cart-widget-item-name"]',
      );
      const qtyEl = row.querySelector<HTMLInputElement>(
        'input[name*="quantity"], input.qty, [data-hook="cart-widget-item-quantity"]',
      );
      const priceEl = row.querySelector<HTMLElement>(
        '.cart-item__price, .product-price, td.product-price, [data-hook="cart-widget-item-price"]',
      );
      if (nameEl) {
        items.push({
          name: nameEl.textContent?.trim() ?? '',
          quantity: qtyEl ? parseInt(qtyEl.value || qtyEl.textContent || '1', 10) : 1,
          price: priceEl?.textContent?.trim() ?? '',
        });
      }
    });
    return items;
  }

  async removeFromCart(itemName: string): Promise<void> {
    const safe = requireNonEmpty(itemName, 'itemName');
    const rows = document.querySelectorAll<HTMLElement>(
      '.cart-item, .cart_item, tr.woocommerce-cart-form__cart-item',
    );
    let itemFound = false;
    for (const row of rows) {
      const nameEl = row.querySelector<HTMLElement>(
        '.cart-item__name, .product-name a, td.product-name a',
      );
      if (nameEl?.textContent?.trim().toLowerCase() === safe.toLowerCase()) {
        itemFound = true;
        const removeBtn = row.querySelector<HTMLElement>('.remove, a.remove, .cart-item__remove');
        if (removeBtn) {
          removeBtn.click();
          return;
        }
      }
    }
    throw new Error(itemFound
      ? `Remove button not found for "${itemName}"`
      : `Cart item "${itemName}" not found`);
  }

  async updateCartQuantity(itemName: string, quantity: number): Promise<void> {
    requireNonEmpty(itemName, 'itemName');
    requirePositiveQuantity(quantity);
    const rows = document.querySelectorAll<HTMLElement>(
      '.cart-item, .cart_item, tr.woocommerce-cart-form__cart-item',
    );
    let itemFound = false;
    for (const row of rows) {
      const nameEl = row.querySelector<HTMLElement>(
        '.cart-item__name, .product-name a, td.product-name a',
      );
      if (nameEl?.textContent?.trim().toLowerCase() === itemName.trim().toLowerCase()) {
        itemFound = true;
        const qtyInput = row.querySelector<HTMLInputElement>('input[name*="quantity"], input.qty');
        if (qtyInput) {
          qtyInput.value = String(quantity);
          qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }
    throw new Error(itemFound
      ? `Quantity input not found for "${itemName}"`
      : `Cart item "${itemName}" not found`);
  }

  // ── Checkout ──

  async goToCheckout(): Promise<void> {
    const platform = this.detectPlatform();
    window.location.href = CHECKOUT_URLS[platform];
  }

  // ── Search & navigation ──

  async searchProducts(query: string): Promise<void> {
    const safe = requireNonEmpty(query, 'query');
    const searchInput = queryFirst<HTMLInputElement>([
      'input[name="q"]',
      'input[name="s"]',
      'input[type="search"]',
      'input[aria-label*="Search" i]',
      '.search-field',
    ]);
    if (!searchInput) throw new Error('Search input not found');
    searchInput.value = safe;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.form?.submit();
  }

  async filterByCategory(category: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(category, 'category'));
    let link = queryFirst<HTMLElement>([
      `a[href*="/collections/${safe}" i]`,
      `a[href*="/product-category/${safe}" i]`,
      `a[href*="/category/${safe}" i]`,
    ]);
    // Fallback: find category link by text content
    if (!link) {
      const lowerCategory = category.trim().toLowerCase();
      const candidates = document.querySelectorAll<HTMLAnchorElement>('.product-categories a, nav a, .categories a');
      for (const a of candidates) {
        if (a.textContent?.trim().toLowerCase() === lowerCategory) {
          link = a;
          break;
        }
      }
    }
    if (!link) throw new Error(`Category "${category}" not found`);
    link.click();
  }

  async sortProducts(by: 'price-asc' | 'price-desc' | 'newest' | 'popular'): Promise<void> {
    const sortSelect = queryFirst<HTMLSelectElement>([
      'select[name="sort_by"]',
      'select[name="orderby"]',
      'select.sort-by',
      '#SortBy',
    ]);

    if (!sortSelect) throw new Error('Sort select not found');

    const valueMap: Record<string, string[]> = {
      'price-asc': ['price-ascending', 'price', 'price_asc'],
      'price-desc': ['price-descending', 'price-desc', 'price_desc'],
      newest: ['created-descending', 'date', 'newest'],
      popular: ['best-selling', 'popularity', 'popular'],
    };

    const candidates = valueMap[by];
    const options = Array.from(sortSelect.options);
    for (const candidate of candidates) {
      const match = options.find((o) => o.value === candidate);
      if (match) {
        sortSelect.value = match.value;
        sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }

    // No matching sort option found
    throw new Error(`Sort option "${by}" not available`);
  }
}
