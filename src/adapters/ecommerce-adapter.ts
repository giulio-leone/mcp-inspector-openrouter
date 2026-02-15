/**
 * EcommerceAdapter — DOM-based adapter for e-commerce platform interactions.
 * Supports Shopify, WooCommerce, Wix, and Webflow with platform-specific selectors.
 */

import type {
  IEcommercePort,
  EcommercePlatform,
  ProductInfo,
  CartItem,
  OrderSummary,
  OrderDetails,
  OrderTracking,
  TrackingEvent,
  InventoryItem,
  ProductCreateData,
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

/** Validate quantity is a non-negative integer (0 allowed for out-of-stock). */
function requireNonNegativeQuantity(qty: number): void {
  if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
    throw new Error('quantity must be a non-negative integer');
  }
}

/** Validate price is a positive finite number. */
function requirePositivePrice(price: number): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('price must be a positive number');
  }
}

/** Validate product create data. */
function requireProductData(data: ProductCreateData): void {
  requireNonEmpty(data.name, 'name');
  requirePositivePrice(data.price);
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

/** Platform-specific admin URL patterns. */
const ADMIN_URL_PATTERNS: Record<EcommercePlatform, RegExp[]> = {
  shopify: [/\/admin\b/, /myshopify\.com\/admin/],
  woocommerce: [/\/wp-admin\b/, /\/wp-admin\/.*wc/],
  wix: [/\/dashboard\b/, /manage\.wix\.com/],
  webflow: [/\/designer\b/, /webflow\.com\/design/],
  unknown: [/\/admin\b/, /\/dashboard\b/],
};

/** Platform-specific order row selectors. */
const ORDER_ROW_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['.order-list__item', 'tr.order-row', '[data-order-id]'],
  woocommerce: ['.woocommerce-orders-table__row', 'tr.woocommerce-orders-table__row'],
  wix: ['[data-hook="order-row"]', '.order-item'],
  webflow: ['.w-commerce-commerceorderitem', '.order-row'],
  unknown: ['.order-item', '.order-row', 'tr[data-order-id]'],
};

/** Platform-specific order detail selectors. */
const ORDER_DETAIL_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['.order-details', '#order-details', '[data-order-detail]'],
  woocommerce: ['.woocommerce-order-details', '.order-details'],
  wix: ['[data-hook="order-details"]', '.order-details'],
  webflow: ['.w-commerce-commerceorderconfirmationcontainer', '.order-details'],
  unknown: ['.order-details', '#order-details'],
};

/** Platform-specific tracking container selectors. */
const TRACKING_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['.tracking-info', '[data-tracking]', '.shipment-tracking'],
  woocommerce: ['.tracking-info', '.order-tracking', '.shipment-tracking'],
  wix: ['[data-hook="tracking-info"]', '.tracking-info'],
  webflow: ['.tracking-info', '.shipment-tracking'],
  unknown: ['.tracking-info', '.shipment-tracking', '[data-tracking]'],
};

/** Platform-specific inventory row selectors (admin pages). */
const INVENTORY_ROW_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['.inventory-item', 'tr[data-product-id]', '.product-inventory-row'],
  woocommerce: ['.inventory-item', 'tr.inventory-row', '.stock-management-row'],
  wix: ['[data-hook="inventory-row"]', '.inventory-item'],
  webflow: ['.inventory-item', '.cms-inventory-row'],
  unknown: ['.inventory-item', 'tr.inventory-row'],
};

/** Platform-specific product form selectors (admin pages). */
const PRODUCT_FORM_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['form#product-form', 'form[action*="/admin/products"]', '.product-form'],
  woocommerce: ['form#post', 'form.product-form', '#woocommerce-product-data'],
  wix: ['[data-hook="product-form"]', 'form.product-form'],
  webflow: ['.w-commerce-commerceaddtocartform', 'form.product-form'],
  unknown: ['form.product-form', 'form#product-form'],
};

/** Platform-specific product name input selectors (admin). */
const PRODUCT_NAME_INPUT_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['input#product-name', 'input[name="title"]', 'input[name="product[title]"]'],
  woocommerce: ['input#title', 'input[name="post_title"]'],
  wix: ['[data-hook="product-name-input"] input', 'input[name="productName"]'],
  webflow: ['input[data-field="name"]', 'input[name="name"]'],
  unknown: ['input[name="name"]', 'input[name="title"]'],
};

/** Platform-specific product description selectors (admin). */
const PRODUCT_DESC_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['[name="description"]', '#product-description', '.product-description textarea'],
  woocommerce: ['#content', 'textarea[name="excerpt"]', '#wp-content-editor-container textarea'],
  wix: ['[data-hook="product-description"] textarea', 'textarea[name="description"]'],
  webflow: ['textarea[data-field="description"]', 'textarea[name="description"]'],
  unknown: ['textarea[name="description"]', '#description'],
};

/** Platform-specific product price input selectors (admin). */
const PRODUCT_PRICE_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['input[name="price"]', 'input[name="product[price]"]', '#product-price'],
  woocommerce: ['input#_regular_price', 'input[name="_regular_price"]'],
  wix: ['[data-hook="price-input"] input', 'input[name="price"]'],
  webflow: ['input[data-field="price"]', 'input[name="price"]'],
  unknown: ['input[name="price"]', 'input#price'],
};

/** Platform-specific delete button selectors (admin). */
const DELETE_PRODUCT_SELECTORS: Record<EcommercePlatform, string[]> = {
  shopify: ['.product-delete-btn', 'button[data-action="delete"]', '#delete-product'],
  woocommerce: ['.submitdelete', 'a.submitdelete', '#delete-action a'],
  wix: ['[data-hook="delete-product"]', 'button[data-action="delete"]'],
  webflow: ['button.delete-product', 'button[data-action="delete"]'],
  unknown: ['button.delete', '[data-action="delete"]'],
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

  // ── Admin detection ──

  isAdminPage(): boolean {
    const platform = this.detectPlatform();
    const patterns = ADMIN_URL_PATTERNS[platform];
    const url = window.location.href;
    return patterns.some((p) => p.test(url));
  }

  // ── Order management ──

  async getOrders(): Promise<OrderSummary[]> {
    const platform = this.detectPlatform();
    const rows = document.querySelectorAll<HTMLElement>(
      ORDER_ROW_SELECTORS[platform].join(', '),
    );
    const orders: OrderSummary[] = [];
    rows.forEach((row) => {
      const idEl = row.querySelector<HTMLElement>('.order-id, [data-order-id], .order-number');
      const dateEl = row.querySelector<HTMLElement>('.order-date, [data-order-date], time');
      const totalEl = row.querySelector<HTMLElement>('.order-total, [data-order-total], .total');
      const statusEl = row.querySelector<HTMLElement>('.order-status, [data-order-status], .status');
      if (idEl) {
        orders.push({
          orderId: idEl.textContent?.trim() ?? row.getAttribute('data-order-id') ?? '',
          date: dateEl?.textContent?.trim() ?? '',
          total: totalEl?.textContent?.trim() ?? '',
          status: statusEl?.textContent?.trim() ?? '',
        });
      }
    });
    return orders;
  }

  async getOrderDetails(orderId: string): Promise<OrderDetails | null> {
    requireNonEmpty(orderId, 'orderId');
    const platform = this.detectPlatform();
    const container = queryFirst<HTMLElement>(ORDER_DETAIL_SELECTORS[platform]);
    if (!container) return null;

    const idEl = container.querySelector<HTMLElement>('.order-id, [data-order-id], .order-number');
    const dateEl = container.querySelector<HTMLElement>('.order-date, [data-order-date], time');
    const totalEl = container.querySelector<HTMLElement>('.order-total, [data-order-total], .total');
    const statusEl = container.querySelector<HTMLElement>('.order-status, [data-order-status], .status');
    const addressEl = container.querySelector<HTMLElement>('.shipping-address, [data-shipping-address], address');
    const trackingEl = container.querySelector<HTMLElement>('.tracking-number, [data-tracking-number]');

    const itemRows = container.querySelectorAll<HTMLElement>('.order-item, .line-item, tr.order-line');
    const items: CartItem[] = [];
    itemRows.forEach((row) => {
      const nameEl = row.querySelector<HTMLElement>('.item-name, .product-name');
      const qtyEl = row.querySelector<HTMLElement>('.item-quantity, .quantity');
      const priceEl = row.querySelector<HTMLElement>('.item-price, .price');
      if (nameEl) {
        items.push({
          name: nameEl.textContent?.trim() ?? '',
          quantity: parseInt(qtyEl?.textContent?.trim() ?? '1', 10) || 1,
          price: priceEl?.textContent?.trim() ?? '',
        });
      }
    });

    return {
      orderId: idEl?.textContent?.trim() ?? orderId,
      date: dateEl?.textContent?.trim() ?? '',
      total: totalEl?.textContent?.trim() ?? '',
      status: statusEl?.textContent?.trim() ?? '',
      items,
      shippingAddress: addressEl?.textContent?.trim() || undefined,
      trackingNumber: trackingEl?.textContent?.trim() || undefined,
    };
  }

  async trackOrder(orderId: string): Promise<OrderTracking | null> {
    requireNonEmpty(orderId, 'orderId');
    const platform = this.detectPlatform();
    const container = queryFirst<HTMLElement>(TRACKING_SELECTORS[platform]);
    if (!container) return null;

    const carrierEl = container.querySelector<HTMLElement>('.carrier, [data-carrier]');
    const trackingNumEl = container.querySelector<HTMLElement>('.tracking-number, [data-tracking-number]');
    const statusEl = container.querySelector<HTMLElement>('.tracking-status, [data-tracking-status], .status');
    const etaEl = container.querySelector<HTMLElement>('.estimated-delivery, [data-estimated-delivery]');

    const eventEls = container.querySelectorAll<HTMLElement>('.tracking-event, [data-tracking-event]');
    const events: TrackingEvent[] = [];
    eventEls.forEach((ev) => {
      const dateEl = ev.querySelector<HTMLElement>('.event-date, time');
      const descEl = ev.querySelector<HTMLElement>('.event-description, .description');
      const locEl = ev.querySelector<HTMLElement>('.event-location, .location');
      events.push({
        date: dateEl?.textContent?.trim() ?? '',
        description: descEl?.textContent?.trim() ?? '',
        location: locEl?.textContent?.trim() || undefined,
      });
    });

    return {
      orderId,
      carrier: carrierEl?.textContent?.trim() || undefined,
      trackingNumber: trackingNumEl?.textContent?.trim() || undefined,
      status: statusEl?.textContent?.trim() ?? '',
      estimatedDelivery: etaEl?.textContent?.trim() || undefined,
      events,
    };
  }

  // ── Inventory (admin) ──

  async getInventoryStatus(): Promise<InventoryItem[]> {
    const platform = this.detectPlatform();
    const rows = document.querySelectorAll<HTMLElement>(
      INVENTORY_ROW_SELECTORS[platform].join(', '),
    );
    const items: InventoryItem[] = [];
    rows.forEach((row) => {
      const idEl = row.querySelector<HTMLElement>('.product-id, [data-product-id]');
      const nameEl = row.querySelector<HTMLElement>('.product-name, [data-product-name]');
      const skuEl = row.querySelector<HTMLElement>('.sku, [data-sku]');
      const qtyEl = row.querySelector<HTMLElement>('.stock-quantity, [data-quantity], .quantity');
      const statusEl = row.querySelector<HTMLElement>('.stock-status, [data-stock-status]');

      if (idEl || row.getAttribute('data-product-id')) {
        const rawQty = parseInt(qtyEl?.textContent?.trim() ?? '0', 10);
        const qty = Number.isNaN(rawQty) ? 0 : rawQty;
        const rawStatus = statusEl?.textContent?.trim().toLowerCase() ?? '';
        let status: 'in_stock' | 'low_stock' | 'out_of_stock';
        if (rawStatus.includes('out') || qty === 0) {
          status = 'out_of_stock';
        } else if (rawStatus.includes('low') || (qty > 0 && qty <= 5)) {
          status = 'low_stock';
        } else {
          status = 'in_stock';
        }

        items.push({
          productId: idEl?.textContent?.trim() ?? row.getAttribute('data-product-id') ?? '',
          productName: nameEl?.textContent?.trim() ?? '',
          sku: skuEl?.textContent?.trim() || undefined,
          quantity: qty,
          status,
        });
      }
    });
    return items;
  }

  async updateInventory(productId: string, quantity: number): Promise<void> {
    requireNonEmpty(productId, 'productId');
    requireNonNegativeQuantity(quantity);
    const platform = this.detectPlatform();
    const rows = document.querySelectorAll<HTMLElement>(
      INVENTORY_ROW_SELECTORS[platform].join(', '),
    );
    for (const row of rows) {
      const idEl = row.querySelector<HTMLElement>('.product-id, [data-product-id]');
      const rowId = idEl?.textContent?.trim() ?? row.getAttribute('data-product-id') ?? '';
      if (rowId === productId) {
        const qtyInput = row.querySelector<HTMLInputElement>(
          'input[name*="quantity"], input[name*="stock"], input.stock-quantity',
        );
        if (!qtyInput) throw new Error(`Stock input not found for product "${productId}"`);
        qtyInput.value = String(quantity);
        qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
    throw new Error(`Product "${productId}" not found in inventory`);
  }

  // ── Product CRUD (admin) ──

  async createProduct(data: ProductCreateData): Promise<void> {
    requireProductData(data);
    const platform = this.detectPlatform();

    const nameInput = queryFirst<HTMLInputElement>(PRODUCT_NAME_INPUT_SELECTORS[platform]);
    if (!nameInput) throw new Error(`Product name input not found (platform: ${platform})`);
    nameInput.value = data.name;
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    const priceInput = queryFirst<HTMLInputElement>(PRODUCT_PRICE_SELECTORS[platform]);
    if (!priceInput) throw new Error(`Product price input not found (platform: ${platform})`);
    priceInput.value = String(data.price);
    priceInput.dispatchEvent(new Event('input', { bubbles: true }));

    if (data.description !== undefined) {
      const descInput = queryFirst<HTMLTextAreaElement>(PRODUCT_DESC_SELECTORS[platform]);
      if (descInput) {
        descInput.value = data.description;
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    const form = queryFirst<HTMLFormElement>(PRODUCT_FORM_SELECTORS[platform]);
    if (!form) throw new Error(`Product form not found (platform: ${platform})`);
    form.submit();
  }

  async updateProduct(productId: string, data: Partial<ProductCreateData>): Promise<void> {
    requireNonEmpty(productId, 'productId');
    if (data.name !== undefined) requireNonEmpty(data.name, 'name');
    if (data.price !== undefined) requirePositivePrice(data.price);

    const platform = this.detectPlatform();

    if (data.name !== undefined) {
      const nameInput = queryFirst<HTMLInputElement>(PRODUCT_NAME_INPUT_SELECTORS[platform]);
      if (!nameInput) throw new Error(`Product name input not found (platform: ${platform})`);
      nameInput.value = data.name;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (data.price !== undefined) {
      const priceInput = queryFirst<HTMLInputElement>(PRODUCT_PRICE_SELECTORS[platform]);
      if (!priceInput) throw new Error(`Product price input not found (platform: ${platform})`);
      priceInput.value = String(data.price);
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (data.description !== undefined) {
      const descInput = queryFirst<HTMLTextAreaElement>(PRODUCT_DESC_SELECTORS[platform]);
      if (descInput) {
        descInput.value = data.description;
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    const form = queryFirst<HTMLFormElement>(PRODUCT_FORM_SELECTORS[platform]);
    if (!form) throw new Error(`Product form not found (platform: ${platform})`);
    form.submit();
  }

  async deleteProduct(productId: string): Promise<void> {
    requireNonEmpty(productId, 'productId');
    const platform = this.detectPlatform();

    // Verify page context matches the target product
    const idEl = document.querySelector<HTMLElement>(
      '[data-product-id], .product-id, input[name="product-id"], input[name="id"]',
    );
    const pageProductId = idEl?.getAttribute('data-product-id')
      ?? (idEl as HTMLInputElement | null)?.value
      ?? idEl?.textContent?.trim()
      ?? '';
    if (pageProductId && pageProductId !== productId) {
      throw new Error(
        `Page context mismatch: expected product "${productId}" but page shows "${pageProductId}"`,
      );
    }

    const btn = queryFirst<HTMLElement>(DELETE_PRODUCT_SELECTORS[platform]);
    if (!btn) throw new Error(`Delete button not found (platform: ${platform})`);
    btn.click();
  }
}
