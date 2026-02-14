/**
 * Page context extraction — collects structured information about the
 * current page for the sidebar / AI layer.
 */

import type { PageContext, ProductInfo, PageLink } from '../types';
import { MAX_PAGE_CONTEXT_PRODUCTS } from '../utils/constants';
import { getFormValues } from '../utils/dom';
import { getLiveStateManager } from './live-state';

export function extractPageContext(): PageContext {
  let products: ProductInfo[] | undefined;
  let cartCount: number | undefined;
  let formDefaults: Record<string, Record<string, string>> | undefined;
  let formFields: Record<string, Record<string, string>> | undefined;
  let mainHeading: string | undefined;
  let pageText: string | undefined;
  let headings: string[] | undefined;
  let links: PageLink[] | undefined;
  let metaDescription: string | undefined;

  // Products via Schema.org microdata or data-mcp-type
  const productEls = document.querySelectorAll(
    '[data-mcp-type="product"], [itemtype*="schema.org/Product"]',
  );
  if (productEls.length) {
    products = [...productEls]
      .slice(0, MAX_PAGE_CONTEXT_PRODUCTS)
      .map((el) => {
        const name = el
          .querySelector('[itemprop="name"], .product-name')
          ?.textContent?.trim();
        const price = el
          .querySelector('[itemprop="price"], .product-price')
          ?.textContent?.trim();
        const id =
          (el as HTMLElement).dataset?.productId ||
          el.id ||
          null;
        return { id, name, price };
      });
  }

  // Cart state
  const cartBadge = document.querySelector(
    '#cart-count, [data-cart-count], .cart-count, .cart-badge',
  );
  if (cartBadge) {
    cartCount = parseInt(cartBadge.textContent ?? '0', 10) || 0;
  }

  // Current form values for each tool form
  const forms = document.querySelectorAll('form[toolname]');
  if (forms.length) {
    formDefaults = {};
    forms.forEach((f) => {
      const toolName = f.getAttribute('toolname');
      if (toolName) {
        formDefaults![toolName] = getFormValues(f as HTMLFormElement);
      }
    });
  }

  // All visible forms with their fields (capped for token budget)
  const MAX_FORMS = 10;
  const MAX_FIELDS_PER_FORM = 30;
  const MAX_VALUE_LEN = 200;
  const formElements = document.querySelectorAll('form');
  if (formElements.length) {
    formFields = {};
    let formCount = 0;
    formElements.forEach((f, i) => {
      if (formCount >= MAX_FORMS) return;
      const htmlForm = f as HTMLFormElement;
      const formId = htmlForm.id || htmlForm.getAttribute('toolname') || `form-${i}`;
      const inputs = htmlForm.querySelectorAll('input, select, textarea');
      const fields: Record<string, string> = {};
      let fieldCount = 0;
      inputs.forEach(inp => {
        if (fieldCount >= MAX_FIELDS_PER_FORM) return;
        const el = inp as HTMLInputElement;
        if (el.type === 'hidden') return;
        const name = el.name || el.id || '';
        if (!name) return;
        const raw = el.type === 'password' ? (el.value ? '••••' : '') : el.value;
        fields[name] = raw.length > MAX_VALUE_LEN ? raw.slice(0, MAX_VALUE_LEN) + '…' : raw;
        fieldCount++;
      });
      if (Object.keys(fields).length > 0) {
        formFields![formId] = fields;
        formCount++;
      }
    });
  }

  // Key heading
  const h1 = document.querySelector('h1');
  if (h1) mainHeading = h1.textContent?.trim();

  // Full visible page text via TreeWalker (avoids layout-triggering innerText)
  try {
    const MAX_TEXT_NODES = 5000;
    const MAX_TEXT_LEN = 8000;
    const chunks: string[] = [];
    let totalLen = 0;
    let nodeCount = 0;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node: Node): number {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT')
            return NodeFilter.FILTER_REJECT;
          // Skip hidden elements (offsetParent is null for display:none, except for body/fixed)
          if (!parent.offsetParent && parent !== document.body && getComputedStyle(parent).position !== 'fixed')
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    let textNode: Node | null;
    while ((textNode = walker.nextNode())) {
      if (nodeCount++ >= MAX_TEXT_NODES) break;
      const t = textNode.textContent?.trim();
      if (!t) continue;
      chunks.push(t);
      totalLen += t.length;
      if (totalLen >= MAX_TEXT_LEN) break;
    }

    const rawText = chunks.join(' ');
    if (rawText) {
      pageText = rawText.length <= MAX_TEXT_LEN
        ? rawText
        : rawText.slice(0, MAX_TEXT_LEN) + ' […truncated]';
    }
  } catch { /* ignore */ }

  // All h1-h3 headings
  const headingEls = document.querySelectorAll('h1, h2, h3');
  if (headingEls.length) {
    headings = [...headingEls]
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);
  }

  // Meta description
  const metaEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (metaEl?.content) {
    metaDescription = metaEl.content;
  }

  // Top 30 links from nav/main areas
  const linkEls = document.querySelectorAll('nav a[href], main a[href], header a[href], [role="navigation"] a[href]');
  const allLinks = linkEls.length > 0 ? linkEls : document.querySelectorAll('a[href]');
  if (allLinks.length) {
    const seen = new Set<string>();
    links = [];
    for (const a of allLinks) {
      if (links.length >= 30) break;
      const anchor = a as HTMLAnchorElement;
      const text = anchor.textContent?.trim();
      const href = anchor.href;
      if (text && href && !seen.has(href)) {
        seen.add(href);
        links.push({ text, href });
      }
    }
  }

  const liveState = getLiveStateManager().getLatestSnapshot() ?? undefined;

  const ctx: PageContext = {
    url: location.href,
    title: document.title,
    ...(products ? { products } : {}),
    ...(cartCount !== undefined ? { cartCount } : {}),
    ...(formDefaults ? { formDefaults } : {}),
    ...(formFields && Object.keys(formFields).length ? { formFields } : {}),
    ...(mainHeading ? { mainHeading } : {}),
    ...(pageText ? { pageText } : {}),
    ...(headings?.length ? { headings } : {}),
    ...(links?.length ? { links } : {}),
    ...(metaDescription ? { metaDescription } : {}),
    ...(liveState ? { liveState } : {}),
  };

  console.debug('[WebMCP] Page context extracted:', ctx);
  return ctx;
}
