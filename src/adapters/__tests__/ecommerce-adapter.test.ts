import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EcommerceAdapter, requireNonEmpty } from '../ecommerce-adapter';
import type { EcommercePlatform } from '../../ports/ecommerce.port';

/**
 * Helper: reset DOM and window globals.
 */
function resetGlobals(): void {
  document.body.innerHTML = '';
  document.body.className = '';
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-wf-site');
  delete (window as Record<string, unknown>)['Shopify'];
  delete (window as Record<string, unknown>)['wc_add_to_cart_params'];
  delete (window as Record<string, unknown>)['wixBiSession'];
}

/**
 * Helper: add a meta tag to <head>.
 */
function addMeta(name: string, content: string): void {
  const meta = document.createElement('meta');
  meta.setAttribute('name', name);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

/**
 * Helper: add a script tag.
 */
function addScript(src: string): void {
  const script = document.createElement('script');
  script.setAttribute('src', src);
  document.head.appendChild(script);
}

/**
 * Helper: create an element and append to body.
 */
function addElement(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  if (text) el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe('EcommerceAdapter', () => {
  let adapter: EcommerceAdapter;

  beforeEach(() => {
    resetGlobals();
    adapter = new EcommerceAdapter();
  });

  // ── requireNonEmpty ──

  describe('requireNonEmpty', () => {
    it('returns trimmed value for valid input', () => {
      expect(requireNonEmpty('  hello  ', 'test')).toBe('hello');
    });

    it('throws on empty string', () => {
      expect(() => requireNonEmpty('', 'param')).toThrow('param must be non-empty');
    });

    it('throws on whitespace-only string', () => {
      expect(() => requireNonEmpty('   ', 'param')).toThrow('param must be non-empty');
    });

    it('throws with correct param name in message', () => {
      expect(() => requireNonEmpty('', 'query')).toThrow('query must be non-empty');
    });
  });

  // ── Platform detection ──

  describe('detectPlatform', () => {
    it('detects Shopify via window.Shopify', () => {
      (window as Record<string, unknown>)['Shopify'] = {};
      expect(adapter.detectPlatform()).toBe('shopify');
    });

    it('detects Shopify via meta tag', () => {
      addMeta('shopify-checkout-api-token', 'abc123');
      expect(adapter.detectPlatform()).toBe('shopify');
    });

    it('detects Shopify via CDN script', () => {
      addScript('https://cdn.shopify.com/s/files/theme.js');
      expect(adapter.detectPlatform()).toBe('shopify');
    });

    it('detects WooCommerce via body class', () => {
      document.body.classList.add('woocommerce');
      expect(adapter.detectPlatform()).toBe('woocommerce');
    });

    it('detects WooCommerce via window.wc_add_to_cart_params', () => {
      (window as Record<string, unknown>)['wc_add_to_cart_params'] = {};
      expect(adapter.detectPlatform()).toBe('woocommerce');
    });

    it('detects WooCommerce via .woocommerce-page element', () => {
      addElement('div', { class: 'woocommerce-page' });
      expect(adapter.detectPlatform()).toBe('woocommerce');
    });

    it('detects Wix via window.wixBiSession', () => {
      (window as Record<string, unknown>)['wixBiSession'] = {};
      expect(adapter.detectPlatform()).toBe('wix');
    });

    it('detects Wix via meta generator', () => {
      addMeta('generator', 'Wix.com Website Builder');
      expect(adapter.detectPlatform()).toBe('wix');
    });

    it('detects Webflow via data-wf-site attribute', () => {
      document.documentElement.setAttribute('data-wf-site', '123');
      expect(adapter.detectPlatform()).toBe('webflow');
    });

    it('detects Webflow via meta generator', () => {
      addMeta('generator', 'Webflow');
      expect(adapter.detectPlatform()).toBe('webflow');
    });

    it('returns unknown when no platform detected', () => {
      expect(adapter.detectPlatform()).toBe('unknown');
    });
  });

  // ── isEcommerce ──

  describe('isEcommerce', () => {
    it('returns true when platform is detected', () => {
      (window as Record<string, unknown>)['Shopify'] = {};
      expect(adapter.isEcommerce()).toBe(true);
    });

    it('returns false when platform is unknown', () => {
      expect(adapter.isEcommerce()).toBe(false);
    });
  });

  // ── getProductInfo ──

  describe('getProductInfo', () => {
    it('returns null when no product elements exist', async () => {
      const result = await adapter.getProductInfo();
      expect(result).toBeNull();
    });

    it('extracts product info from DOM', async () => {
      const h1 = document.createElement('h1');
      h1.className = 'product-title';
      h1.textContent = 'Test Product';
      document.body.appendChild(h1);

      const price = document.createElement('span');
      price.className = 'product-price';
      price.textContent = '$29.99';
      document.body.appendChild(price);

      const result = await adapter.getProductInfo();
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test Product');
      expect(result!.price).toBe('$29.99');
      expect(result!.currency).toBe('$');
      expect(result!.inStock).toBe(true);
    });

    it('detects out-of-stock products', async () => {
      addElement('h1', { class: 'product-title' }, 'OOS Product');
      addElement('span', { class: 'product-price' }, '€10.00');
      addElement('span', { class: 'out-of-stock' }, 'Out of Stock');

      const result = await adapter.getProductInfo();
      expect(result).not.toBeNull();
      expect(result!.inStock).toBe(false);
    });

    it('reads quantity from input', async () => {
      addElement('h1', { class: 'product-title' }, 'Qty Product');
      addElement('span', { class: 'product-price' }, '$5.00');
      const input = addElement('input', { name: 'quantity', value: '3' }) as HTMLInputElement;
      input.value = '3';

      const result = await adapter.getProductInfo();
      expect(result).not.toBeNull();
      expect(result!.quantity).toBe(3);
    });
  });

  // ── addToCart ──

  describe('addToCart', () => {
    it('clicks Shopify add-to-cart button', async () => {
      (window as Record<string, unknown>)['Shopify'] = {};
      const btn = addElement('button', { class: 'product-form__submit' }, 'Add to cart');
      const clickSpy = vi.spyOn(btn, 'click');

      await adapter.addToCart();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('clicks WooCommerce add-to-cart button', async () => {
      document.body.classList.add('woocommerce');
      const btn = addElement('button', { class: 'single_add_to_cart_button' }, 'Add to cart');
      const clickSpy = vi.spyOn(btn, 'click');

      await adapter.addToCart();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('throws when no add-to-cart button found', async () => {
      await expect(adapter.addToCart()).rejects.toThrow('Add to cart button not found');
    });

    it('sets quantity before adding', async () => {
      (window as Record<string, unknown>)['Shopify'] = {};
      addElement('button', { class: 'product-form__submit' });
      const input = addElement('input', { name: 'quantity', type: 'number' }) as HTMLInputElement;

      await adapter.addToCart(5);
      expect(input.value).toBe('5');
    });
  });

  // ── selectVariant ──

  describe('selectVariant', () => {
    it('sets value on variant select for Shopify', async () => {
      (window as Record<string, unknown>)['Shopify'] = {};
      const container = addElement('div', { class: 'product__variants' });
      const select = document.createElement('select');
      const option = document.createElement('option');
      option.value = 'Large';
      option.textContent = 'Large';
      select.appendChild(option);
      container.appendChild(select);
      const changeSpy = vi.fn();
      select.addEventListener('change', changeSpy);

      await adapter.selectVariant('Large');
      expect(select.value).toBe('Large');
      expect(changeSpy).toHaveBeenCalled();
    });

    it('throws on empty variant string', async () => {
      await expect(adapter.selectVariant('')).rejects.toThrow('variant must be non-empty');
    });

    it('throws on whitespace-only variant', async () => {
      await expect(adapter.selectVariant('   ')).rejects.toThrow('variant must be non-empty');
    });

    it('throws when variant selector not found', async () => {
      await expect(adapter.selectVariant('XL')).rejects.toThrow('Variant selector not found');
    });

    it('throws when variant value not in available options', async () => {
      (window as Record<string, unknown>)['Shopify'] = {};
      const container = addElement('div', { class: 'product__variants' });
      const select = document.createElement('select');
      const option = document.createElement('option');
      option.value = 'Small';
      option.textContent = 'Small';
      select.appendChild(option);
      container.appendChild(select);

      await expect(adapter.selectVariant('NonExistent')).rejects.toThrow('not found in available options');
    });
  });

  // ── setQuantity ──

  describe('setQuantity', () => {
    it('sets quantity input value', async () => {
      const input = addElement('input', { name: 'quantity', type: 'number' }) as HTMLInputElement;
      await adapter.setQuantity(3);
      expect(input.value).toBe('3');
    });

    it('throws on quantity <= 0', async () => {
      await expect(adapter.setQuantity(0)).rejects.toThrow('quantity must be a positive integer');
    });

    it('throws on negative quantity', async () => {
      await expect(adapter.setQuantity(-1)).rejects.toThrow('quantity must be a positive integer');
    });

    it('throws on NaN quantity', async () => {
      await expect(adapter.setQuantity(NaN)).rejects.toThrow('quantity must be a positive integer');
    });

    it('throws on Infinity quantity', async () => {
      await expect(adapter.setQuantity(Infinity)).rejects.toThrow(
        'quantity must be a positive integer',
      );
    });

    it('throws on fractional quantity', async () => {
      await expect(adapter.setQuantity(1.5)).rejects.toThrow('quantity must be a positive integer');
    });

    it('throws when quantity input not found', async () => {
      await expect(adapter.setQuantity(2)).rejects.toThrow('Quantity input not found');
    });
  });

  // ── viewCart ──

  describe('viewCart', () => {
    it('navigates to cart page for Shopify', async () => {
      (window as Record<string, unknown>)['Shopify'] = {};
      await adapter.viewCart();
      expect(window.location.href).toContain('/cart');
    });

    it('navigates to cart page for WooCommerce', async () => {
      document.body.classList.add('woocommerce');
      await adapter.viewCart();
      expect(window.location.href).toContain('/cart/');
    });
  });

  // ── getCartItems ──

  describe('getCartItems', () => {
    it('returns empty array when no cart items', async () => {
      const items = await adapter.getCartItems();
      expect(items).toEqual([]);
    });

    it('extracts cart items from DOM', async () => {
      const row = addElement('div', { class: 'cart-item' });
      const nameEl = document.createElement('span');
      nameEl.className = 'cart-item__name';
      nameEl.textContent = 'Widget';
      row.appendChild(nameEl);

      const priceEl = document.createElement('span');
      priceEl.className = 'cart-item__price';
      priceEl.textContent = '$10.00';
      row.appendChild(priceEl);

      const qtyInput = document.createElement('input');
      qtyInput.setAttribute('name', 'quantity');
      qtyInput.value = '2';
      row.appendChild(qtyInput);

      const items = await adapter.getCartItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Widget');
      expect(items[0].quantity).toBe(2);
      expect(items[0].price).toBe('$10.00');
    });
  });

  // ── removeFromCart ──

  describe('removeFromCart', () => {
    it('throws on empty item name', async () => {
      await expect(adapter.removeFromCart('')).rejects.toThrow('itemName must be non-empty');
    });

    it('throws when item not found', async () => {
      await expect(adapter.removeFromCart('Nonexistent')).rejects.toThrow('not found');
    });
  });

  // ── updateCartQuantity ──

  describe('updateCartQuantity', () => {
    it('throws on empty item name', async () => {
      await expect(adapter.updateCartQuantity('', 1)).rejects.toThrow('itemName must be non-empty');
    });

    it('throws on invalid quantity', async () => {
      await expect(adapter.updateCartQuantity('Widget', 0)).rejects.toThrow(
        'quantity must be a positive integer',
      );
    });

    it('throws when item not found', async () => {
      await expect(adapter.updateCartQuantity('Missing', 5)).rejects.toThrow('not found');
    });
  });

  // ── goToCheckout ──

  describe('goToCheckout', () => {
    it('navigates to checkout for Shopify', async () => {
      (window as Record<string, unknown>)['Shopify'] = {};
      await adapter.goToCheckout();
      expect(window.location.href).toContain('/checkout');
    });
  });

  // ── searchProducts ──

  describe('searchProducts', () => {
    it('throws on empty query', async () => {
      await expect(adapter.searchProducts('')).rejects.toThrow('query must be non-empty');
    });

    it('throws on whitespace-only query', async () => {
      await expect(adapter.searchProducts('   ')).rejects.toThrow('query must be non-empty');
    });

    it('throws when search input not found', async () => {
      await expect(adapter.searchProducts('shoes')).rejects.toThrow('Search input not found');
    });

    it('fills search input and submits form', async () => {
      const form = document.createElement('form');
      const submitSpy = vi.fn((e: Event) => e.preventDefault());
      form.addEventListener('submit', submitSpy);
      const input = document.createElement('input');
      input.setAttribute('name', 'q');
      form.appendChild(input);
      document.body.appendChild(form);

      const formSubmitSpy = vi.spyOn(form, 'submit').mockImplementation(() => {});

      await adapter.searchProducts('shoes');
      expect(input.value).toBe('shoes');
      expect(formSubmitSpy).toHaveBeenCalled();
    });
  });

  // ── filterByCategory ──

  describe('filterByCategory', () => {
    it('throws on empty category', async () => {
      await expect(adapter.filterByCategory('')).rejects.toThrow('category must be non-empty');
    });

    it('throws when category link not found', async () => {
      await expect(adapter.filterByCategory('electronics')).rejects.toThrow('not found');
    });

    it('clicks matching category link', async () => {
      const link = addElement('a', { href: '/collections/shoes' }, 'Shoes');
      const clickSpy = vi.spyOn(link, 'click');

      await adapter.filterByCategory('shoes');
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  // ── sortProducts ──

  describe('sortProducts', () => {
    it('throws when sort select not found', async () => {
      await expect(adapter.sortProducts('price-asc')).rejects.toThrow('Sort select not found');
    });

    it('sets sort value and dispatches change', async () => {
      const select = document.createElement('select');
      select.setAttribute('name', 'sort_by');
      const opt = document.createElement('option');
      opt.value = 'price-ascending';
      opt.textContent = 'Price: Low to High';
      select.appendChild(opt);
      document.body.appendChild(select);

      const changeSpy = vi.fn();
      select.addEventListener('change', changeSpy);

      await adapter.sortProducts('price-asc');
      expect(select.value).toBe('price-ascending');
      expect(changeSpy).toHaveBeenCalled();
    });

    it('throws when no option matches any candidate', async () => {
      const select = document.createElement('select');
      select.setAttribute('name', 'sort_by');
      const opt = document.createElement('option');
      opt.value = 'custom-value';
      select.appendChild(opt);
      document.body.appendChild(select);

      await expect(adapter.sortProducts('newest')).rejects.toThrow('Sort option "newest" not available');
    });
  });
});
