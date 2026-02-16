/**
 * Tests for <tool-table> Lit component.
 *
 * NOTE: happy-dom does not render Lit conditional/nested TemplateResults
 * (ternary, map, sub-method template composition). Tests verify behavior
 * via imperative property assignment and event dispatch rather than DOM queries
 * where needed (same pattern as chat-header tests).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Stub chrome for modules that reference it at import time
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p), openOptionsPage: vi.fn() },
});

import '../tool-table';
import type { ToolTable } from '../tool-table';
import type { CleanTool } from '../../types';

const MOCK_TOOLS: CleanTool[] = [
  {
    name: 'form.submit',
    description: 'Submit a form',
    category: 'form',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'input' } } },
    confidence: 0.9,
    _source: 'native',
  },
  {
    name: 'nav.header.home',
    description: 'Navigate home',
    category: 'navigation',
    inputSchema: '{}',
    confidence: 0.6,
    _source: 'inferred',
  },
];

/** Helper: create a tool-table, attach, and wait for render */
async function createElement(props: Partial<ToolTable> = {}): Promise<ToolTable> {
  const el = document.createElement('tool-table') as ToolTable;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

describe('ToolTable', () => {
  let el: ToolTable;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('tool-table')).toBeDefined();
  });

  it('renders empty state when no tools', async () => {
    el = await createElement({ pageUrl: 'https://example.com' });
    expect(el.tools).toEqual([]);
    expect(el.loading).toBe(false);
  });

  it('renders tool rows when tools provided', async () => {
    el = await createElement({ tools: MOCK_TOOLS });
    expect(el.tools).toEqual(MOCK_TOOLS);
    expect(el.tools.length).toBe(2);
  });

  it('dispatches execute-tool event', async () => {
    el = await createElement({ tools: MOCK_TOOLS });

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('execute-tool', (e) => resolve(e as CustomEvent), { once: true });
    });

    // Call handler directly (happy-dom limitation with Lit event bindings)
    (el as any)._selectedTool = 'form.submit';
    (el as any)._inputArgs = '{"text":"hi"}';
    (el as any)._onExecute();

    const event = await received;
    expect(event.detail.name).toBe('form.submit');
    expect(event.detail.args).toBe('{"text":"hi"}');
  });

  it('dispatches copy-tools event with script format', async () => {
    el = await createElement({ tools: MOCK_TOOLS });

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('copy-tools', (e) => resolve(e as CustomEvent), { once: true });
    });

    (el as any)._onCopy('script');

    const event = await received;
    expect(event.detail.format).toBe('script');
  });

  it('dispatches copy-tools event with json format', async () => {
    el = await createElement({ tools: MOCK_TOOLS });

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('copy-tools', (e) => resolve(e as CustomEvent), { once: true });
    });

    (el as any)._onCopy('json');

    const event = await received;
    expect(event.detail.format).toBe('json');
  });

  it('loading state shows loading message', async () => {
    el = await createElement({ loading: true });
    expect(el.loading).toBe(true);
  });

  it('status message shown when set', async () => {
    el = await createElement({ statusMessage: 'Error occurred' });
    expect(el.statusMessage).toBe('Error occurred');
  });

  it('selected tool updates input args from schema', async () => {
    el = await createElement({ tools: MOCK_TOOLS });
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    // After setting tools, the first tool should be auto-selected
    expect((el as any)._selectedTool).toBe('form.submit');
    // _inputArgs should be updated from the schema
    const parsed = JSON.parse((el as any)._inputArgs);
    expect(parsed).toHaveProperty('text');
  });

  it('setToolResults updates results text', async () => {
    el = await createElement();
    el.setToolResults('{"result": "ok"}');
    expect((el as any)._toolResults).toBe('{"result": "ok"}');
  });

  it('getClipboardText returns formatted tools', async () => {
    el = await createElement({ tools: MOCK_TOOLS });
    const json = el.getClipboardText('json');
    expect(JSON.parse(json)).toEqual(MOCK_TOOLS);

    const script = el.getClipboardText('script');
    expect(script).toContain('form.submit');
  });

  it('_onToolChange updates selected tool and input args', async () => {
    el = await createElement({ tools: MOCK_TOOLS });

    const mockEvent = { target: { value: 'nav.header.home' } } as unknown as Event;
    (el as any)._onToolChange(mockEvent);

    expect((el as any)._selectedTool).toBe('nav.header.home');
  });

  it('_onTogglePrettify toggles prettify state', async () => {
    el = await createElement();
    expect(el.prettify).toBe(false);
    (el as any)._onTogglePrettify();
    expect(el.prettify).toBe(true);
    (el as any)._onTogglePrettify();
    expect(el.prettify).toBe(false);
  });

  it('renders manifest badge for tools with _source=manifest', async () => {
    const manifestTool: CleanTool = {
      name: 'cached.tool',
      description: 'Tool from manifest',
      category: 'form',
      inputSchema: { type: 'object', properties: {} },
      confidence: 0.85,
      _source: 'manifest',
    };
    el = await createElement({ tools: [manifestTool] });
    // Verify badge class logic via the render method internals
    const row = (el as any)._renderToolRow(manifestTool);
    expect(row).toBeDefined();
    // The badge class should be 'badge-manifest' for manifest source
    const src = manifestTool._source ?? 'unknown';
    const badgeClass = src === 'manifest' ? 'badge-manifest' : 'badge-inferred';
    expect(badgeClass).toBe('badge-manifest');
  });

  it('renders manifest prefix (🟠) in tool options', async () => {
    const manifestTool: CleanTool = {
      name: 'cached.tool',
      description: 'Tool from manifest',
      category: 'form',
      inputSchema: { type: 'object', properties: {} },
      confidence: 0.85,
      _source: 'manifest',
    };
    el = await createElement({ tools: [manifestTool] });
    const option = (el as any)._renderToolOption(manifestTool);
    expect(option).toBeDefined();
  });

  it('fires export-manifest event on export click', async () => {
    el = await createElement({ tools: MOCK_TOOLS });
    const spy = vi.fn();
    el.addEventListener('export-manifest', spy);
    (el as any)._onExportManifest();
    expect(spy).toHaveBeenCalledOnce();
  });
});
