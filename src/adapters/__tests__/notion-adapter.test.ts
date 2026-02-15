import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotionAdapter } from '../notion-adapter';

/**
 * Helper: set location properties for happy-dom.
 */
function setLocation(url: string): void {
  const parsed = new URL(url);
  Object.defineProperty(window, 'location', {
    value: {
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      href: parsed.href,
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Helper: add an element to document.body.
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

describe('NotionAdapter', () => {
  let adapter: NotionAdapter;

  beforeEach(() => {
    adapter = new NotionAdapter();
    document.body.innerHTML = '';
    setLocation('https://www.notion.so/');
  });

  // ── isOnNotion ──

  describe('isOnNotion', () => {
    it('returns true on www.notion.so', () => {
      setLocation('https://www.notion.so/');
      expect(adapter.isOnNotion()).toBe(true);
    });

    it('returns true on notion.so', () => {
      setLocation('https://notion.so/page');
      expect(adapter.isOnNotion()).toBe(true);
    });

    it('returns true on *.notion.site', () => {
      setLocation('https://myworkspace.notion.site/page');
      expect(adapter.isOnNotion()).toBe(true);
    });

    it('returns false on other domains', () => {
      setLocation('https://www.google.com/');
      expect(adapter.isOnNotion()).toBe(false);
    });

    it('rejects spoofed domains containing notion', () => {
      setLocation('https://notnotion.so/');
      expect(adapter.isOnNotion()).toBe(false);
    });

    it('rejects domains ending with notion.so but not matching', () => {
      setLocation('https://evilnotion.so/');
      expect(adapter.isOnNotion()).toBe(false);
    });

    it('rejects notion.so.evil.com', () => {
      setLocation('https://notion.so.evil.com/');
      expect(adapter.isOnNotion()).toBe(false);
    });
  });

  // ── Pages ──

  describe('createPage', () => {
    it('clicks the new page button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'New page' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.createPage('My Page');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty title', async () => {
      await expect(adapter.createPage('')).rejects.toThrow('title must be non-empty');
    });

    it('throws on whitespace-only title', async () => {
      await expect(adapter.createPage('   ')).rejects.toThrow('title must be non-empty');
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.createPage('Test')).rejects.toThrow('Notion element not found');
    });

    it('uses first matching selector', async () => {
      const btn1 = addElement('button', { class: 'notion-topbar-more-button' });
      addElement('button', { 'aria-label': 'New page' });
      const spy = vi.spyOn(btn1, 'click');
      await adapter.createPage('Test');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('duplicatePage', () => {
    it('clicks duplicate button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'Duplicate' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.duplicatePage();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.duplicatePage()).rejects.toThrow('Notion element not found');
    });
  });

  describe('deletePage', () => {
    it('clicks delete button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'Delete' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.deletePage();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.deletePage()).rejects.toThrow('Notion element not found');
    });
  });

  // ── Blocks ──

  describe('addBlock', () => {
    it('clicks block element when found', async () => {
      const el = addElement('div', { 'data-block-type': 'text' });
      const spy = vi.spyOn(el, 'click');
      await adapter.addBlock('text', 'Hello');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty content', async () => {
      await expect(adapter.addBlock('text', '')).rejects.toThrow('content must be non-empty');
    });

    it('throws on whitespace-only content', async () => {
      await expect(adapter.addBlock('heading', '  ')).rejects.toThrow('content must be non-empty');
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.addBlock('code', 'x')).rejects.toThrow('Notion element not found');
    });

    it('works with different block types', async () => {
      const el = addElement('div', { 'data-block-type': 'todo' });
      const spy = vi.spyOn(el, 'click');
      await adapter.addBlock('todo', 'item');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('toggleTodo', () => {
    it('clicks todo checkbox when found', async () => {
      const container = addElement('div', { class: 'notion-to_do-block' });
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      container.appendChild(checkbox);
      const spy = vi.spyOn(checkbox, 'click');
      await adapter.toggleTodo();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no checkbox found', async () => {
      await expect(adapter.toggleTodo()).rejects.toThrow('Notion element not found');
    });
  });

  // ── Database ──

  describe('addDatabaseRow', () => {
    it('clicks new row button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'New row' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.addDatabaseRow();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.addDatabaseRow()).rejects.toThrow('Notion element not found');
    });
  });

  describe('filterDatabase', () => {
    it('clicks filter button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'Filter' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.filterDatabase('Status', 'Done');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty property', async () => {
      await expect(adapter.filterDatabase('', 'val')).rejects.toThrow('property must be non-empty');
    });

    it('throws on empty value', async () => {
      await expect(adapter.filterDatabase('Status', '')).rejects.toThrow('value must be non-empty');
    });
  });

  describe('sortDatabase', () => {
    it('clicks sort button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'Sort' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.sortDatabase('Name', 'asc');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty property', async () => {
      await expect(adapter.sortDatabase('', 'asc')).rejects.toThrow('property must be non-empty');
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.sortDatabase('Name', 'desc')).rejects.toThrow('Notion element not found');
    });
  });

  // ── Navigation ──

  describe('searchPages', () => {
    it('clicks search button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'Search' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.searchPages('meeting notes');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty query', async () => {
      await expect(adapter.searchPages('')).rejects.toThrow('query must be non-empty');
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.searchPages('test')).rejects.toThrow('Notion element not found');
    });
  });

  describe('goToPage', () => {
    it('clicks page link when found via data-testid', async () => {
      const link = addElement('a', {
        'data-testid': 'page-link',
        'aria-label': 'My Page',
      });
      const spy = vi.spyOn(link, 'click');
      await adapter.goToPage('My Page');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty title', async () => {
      await expect(adapter.goToPage('')).rejects.toThrow('title must be non-empty');
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.goToPage('Nonexistent')).rejects.toThrow('Notion element not found');
    });
  });

  describe('toggleSidebar', () => {
    it('clicks sidebar toggle when found', async () => {
      const btn = addElement('button', { 'data-testid': 'sidebar-toggle' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.toggleSidebar();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.toggleSidebar()).rejects.toThrow('Notion element not found');
    });
  });
});
