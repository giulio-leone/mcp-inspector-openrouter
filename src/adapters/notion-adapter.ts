/**
 * NotionAdapter — DOM-based adapter for Notion platform interactions.
 * Uses resilient selector strategies with multiple fallbacks.
 */

import type { INotionPort } from '../ports/productivity.port';

/** Validate that a string parameter is non-empty after trimming. */
function requireNonEmpty(value: string, paramName: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${paramName} must be non-empty`);
  return trimmed;
}

/**
 * Query the DOM with multiple fallback selectors, returning the first match.
 * Throws a descriptive error if no element is found.
 */
function queryElement<T extends Element>(selectors: string[], description: string): T {
  for (const sel of selectors) {
    const el = document.querySelector<T>(sel);
    if (el) return el;
  }
  throw new Error(`Notion element not found: ${description} (tried: ${selectors.join(', ')})`);
}

function clickElement(selectors: string[], description: string): void {
  const el = queryElement<HTMLElement>(selectors, description);
  el.click();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NotionAdapter implements INotionPort {
  isOnNotion(): boolean {
    const h = location.hostname;
    return h === 'www.notion.so' || h === 'notion.so' || h.endsWith('.notion.site');
  }

  // ── Pages ──

  async createPage(title: string, _parentId?: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(title, 'title'));
    clickElement(
      ['.notion-topbar-more-button', '[aria-label*="New page" i]', `[data-testid="new-page-button"]`],
      `new page button for "${safe}"`,
    );
    await sleep(300);
  }

  async duplicatePage(): Promise<void> {
    clickElement(
      ['[aria-label*="Duplicate" i]', '[data-testid="duplicate-page"]'],
      'duplicate page button',
    );
  }

  async deletePage(): Promise<void> {
    clickElement(
      ['[aria-label*="Delete" i]', '[data-testid="delete-page"]', '.notion-topbar-more-button'],
      'delete page button',
    );
    await sleep(200);
  }

  // ── Blocks ──

  async addBlock(type: 'text' | 'heading' | 'todo' | 'bullet' | 'code', content: string): Promise<void> {
    requireNonEmpty(content, 'content');
    const safe = CSS.escape(type);
    clickElement(
      [
        `[data-block-type="${safe}"]`,
        '[aria-label*="Add a block" i]',
        '.notion-page-content [contenteditable="true"]',
      ],
      `add ${type} block`,
    );
    await sleep(200);
  }

  async toggleTodo(): Promise<void> {
    clickElement(
      ['.notion-to_do-block input[type="checkbox"]', '[data-testid="todo-checkbox"]'],
      'todo checkbox',
    );
  }

  // ── Database ──

  async addDatabaseRow(): Promise<void> {
    clickElement(
      ['.notion-collection-view .notion-new-row', '[aria-label*="New row" i]', '[data-testid="new-row-button"]'],
      'new database row button',
    );
  }

  async filterDatabase(property: string, value: string): Promise<void> {
    requireNonEmpty(property, 'property');
    requireNonEmpty(value, 'value');
    clickElement(
      ['[aria-label*="Filter" i]', '.notion-collection-view-filter', '[data-testid="filter-button"]'],
      'database filter button',
    );
    await sleep(200);
  }

  async sortDatabase(property: string, _direction: 'asc' | 'desc'): Promise<void> {
    requireNonEmpty(property, 'property');
    clickElement(
      ['[aria-label*="Sort" i]', '.notion-collection-view-sort', '[data-testid="sort-button"]'],
      'database sort button',
    );
    await sleep(200);
  }

  // ── Navigation ──

  async searchPages(query: string): Promise<void> {
    requireNonEmpty(query, 'query');
    clickElement(
      ['.notion-topbar-search-button', '[aria-label*="Search" i]', '[data-testid="search-button"]'],
      'search button',
    );
    await sleep(300);
  }

  async goToPage(title: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(title, 'title'));
    clickElement(
      [
        `[data-testid="page-link"][aria-label="${safe}"]`,
        `[role="navigation"] a[title="${safe}"]`,
        `a[href*="${safe}"]`,
      ],
      `page link "${safe}"`,
    );
  }

  async toggleSidebar(): Promise<void> {
    clickElement(
      ['[role="navigation"] [aria-label*="toggle" i]', '[data-testid="sidebar-toggle"]', '.notion-sidebar-toggle'],
      'sidebar toggle button',
    );
  }
}
