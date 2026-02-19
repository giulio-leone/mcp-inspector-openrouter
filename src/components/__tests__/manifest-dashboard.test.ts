/**
 * Tests for <manifest-dashboard> Lit component.
 *
 * Uses happy-dom. Verifies rendering, filtering, events, and states.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p) },
});

import '../manifest-dashboard';
import type { ManifestDashboard } from '../manifest-dashboard';

const SAMPLE_MANIFEST = JSON.stringify({
  tools: [
    { name: 'search', description: 'Search the page', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
    { name: 'click_button', description: 'Click a button', inputSchema: { type: 'object', properties: {} } },
    { name: 'fill_form', description: 'Fill out a form', inputSchema: { type: 'object', properties: { field: { type: 'string' } } } },
  ],
  _meta: {
    origin: 'example.com',
    version: 3,
    generatedAt: 1700000000000,
    pageCount: 2,
    toolCount: 3,
  },
});

async function createElement(props: Partial<ManifestDashboard> = {}): Promise<ManifestDashboard> {
  const el = document.createElement('manifest-dashboard') as ManifestDashboard;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

describe('ManifestDashboard', () => {
  let el: ManifestDashboard;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('manifest-dashboard')).toBeDefined();
  });

  it('shows empty message when no manifest', async () => {
    el = await createElement();
    expect(el.textContent).toContain('No page action report yet');
  });

  it('shows loading state', async () => {
    el = await createElement({ loading: true });
    expect(el.textContent).toContain('Scanning this page');
  });

  it('shows error message', async () => {
    el = await createElement({ error: 'Connection failed' });
    expect(el.textContent).toContain('Connection failed');
  });

  it('renders meta info from manifest', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    expect(el.textContent).toContain('example.com');
    expect(el.textContent).toContain('3'); // toolCount and version
    expect(el.textContent).toContain('2'); // pageCount
  });

  it('renders tool list', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const tools = el.querySelectorAll('.manifest-tool-item');
    expect(tools.length).toBe(3);
  });

  it('shows tool names in list', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const names = el.querySelectorAll('.manifest-tool-name');
    const nameTexts = [...names].map(n => n.textContent?.trim());
    expect(nameTexts).toContain('search');
    expect(nameTexts).toContain('click_button');
    expect(nameTexts).toContain('fill_form');
  });

  it('expands tool detail on click', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const header = el.querySelector('.manifest-tool-header') as HTMLElement;
    expect(header).not.toBeNull();
    header.click();
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    const detail = el.querySelector('.manifest-tool-detail');
    expect(detail).not.toBeNull();
  });

  it('filters tools by name', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const input = el.querySelector('.manifest-search-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = 'search';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    const tools = el.querySelectorAll('.manifest-tool-item');
    expect(tools.length).toBe(1);
  });

  it('shows no-match message when filter has no results', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const input = el.querySelector('.manifest-search-input') as HTMLInputElement;
    input.value = 'nonexistent_tool_xyz';
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    expect(el.textContent).toContain('No actions match');
  });

  it('dispatches copy-manifest event', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const handler = vi.fn();
    el.addEventListener('copy-manifest', handler);
    const btn = [...el.querySelectorAll('.manifest-btn')].find(b => b.textContent?.includes('Copy'));
    expect(btn).toBeTruthy();
    (btn as HTMLElement).click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatches refresh-manifest event', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const handler = vi.fn();
    el.addEventListener('refresh-manifest', handler);
    const btn = [...el.querySelectorAll('.manifest-btn')].find(b => b.textContent?.includes('Scan again'));
    expect(btn).toBeTruthy();
    (btn as HTMLElement).click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('shows copy feedback after clicking copy', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const btn = [...el.querySelectorAll('.manifest-btn')].find(b => b.textContent?.includes('Copy'));
    (btn as HTMLElement).click();
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    expect(el.textContent).toContain('Copied');
  });

  it('renders action buttons', async () => {
    el = await createElement({ manifestJson: SAMPLE_MANIFEST });
    const buttons = el.querySelectorAll('.manifest-btn');
    expect(buttons.length).toBe(2);
  });

  it('handles malformed JSON gracefully', async () => {
    el = await createElement({ manifestJson: '{invalid json' });
    expect(el.textContent).toContain('No page action report yet');
  });
});
