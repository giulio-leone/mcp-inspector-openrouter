/**
 * Tests for <status-bar> Lit component.
 *
 * NOTE: happy-dom does not render Lit conditional/nested TemplateResults.
 * Tests verify behavior via property setting and DOM inspection
 * (same pattern as chat-input tests).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Stub chrome for modules that reference it at import time
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p) },
});

import '../status-bar';
import type { StatusBar } from '../status-bar';

/** Helper: create a status-bar, attach, and wait for render */
async function createElement(props: Partial<StatusBar> = {}): Promise<StatusBar> {
  const el = document.createElement('status-bar') as StatusBar;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

describe('StatusBar', () => {
  let el: StatusBar;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('status-bar')).toBeDefined();
  });

  it('renders message text', async () => {
    el = await createElement({ message: 'Connected successfully' });
    const div = el.querySelector('.status-bar');
    expect(div).not.toBeNull();
    expect(div!.textContent).toBe('Connected successfully');
  });

  it('applies type class modifier', async () => {
    el = await createElement({ message: 'Error occurred', type: 'error' });
    const div = el.querySelector('.status-bar');
    expect(div).not.toBeNull();
    expect(div!.classList.contains('status-bar--error')).toBe(true);
  });

  it('defaults type to info', async () => {
    el = await createElement({ message: 'Some info' });
    const div = el.querySelector('.status-bar');
    expect(div).not.toBeNull();
    expect(div!.classList.contains('status-bar--info')).toBe(true);
  });

  it('renders nothing when message is empty', async () => {
    el = await createElement({ message: '' });
    const div = el.querySelector('.status-bar');
    expect(div).toBeNull();
  });

  it('renders nothing by default (no message)', async () => {
    el = await createElement();
    const div = el.querySelector('.status-bar');
    expect(div).toBeNull();
  });

  it('updates reactively when message changes', async () => {
    el = await createElement({ message: 'First' });
    expect(el.querySelector('.status-bar')!.textContent).toBe('First');

    el.message = 'Second';
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    expect(el.querySelector('.status-bar')!.textContent).toBe('Second');
  });

  it('updates reactively when type changes', async () => {
    el = await createElement({ message: 'msg', type: 'info' });
    expect(el.querySelector('.status-bar')!.classList.contains('status-bar--info')).toBe(true);

    el.type = 'warning';
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    const div = el.querySelector('.status-bar')!;
    expect(div.classList.contains('status-bar--warning')).toBe(true);
    expect(div.classList.contains('status-bar--info')).toBe(false);
  });

  it('supports all type values', async () => {
    for (const type of ['info', 'success', 'error', 'warning'] as const) {
      el = await createElement({ message: 'test', type });
      const div = el.querySelector('.status-bar');
      expect(div!.classList.contains(`status-bar--${type}`)).toBe(true);
      el.remove();
    }
  });
});
