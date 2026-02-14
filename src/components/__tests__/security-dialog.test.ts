/**
 * Tests for <security-dialog> Lit component.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p) },
});

import '../security-dialog';
import type { SecurityDialog } from '../security-dialog';

async function createDialog(
  props: Partial<SecurityDialog> = {},
): Promise<SecurityDialog> {
  const el = document.createElement('security-dialog') as SecurityDialog;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

describe('SecurityDialog', () => {
  let el: SecurityDialog;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('security-dialog')).toBeDefined();
  });

  it('renders dialog content when open', async () => {
    el = await createDialog({
      open: true,
      toolName: 'form.submit',
      securityTier: 2,
    });
    const title = el.querySelector('.dialog-title');
    expect(title).toBeTruthy();
    expect(title!.textContent).toContain('form.submit');
    const desc = el.querySelector('.dialog-desc');
    expect(desc).toBeTruthy();
    expect(desc!.textContent).toContain('mutation');
  });

  it('is hidden when not open', async () => {
    el = await createDialog({ open: false, toolName: 'nav.click' });
    const dialog = el.querySelector('dialog');
    expect(dialog).toBeNull();
  });

  it('dispatches security-approve event', async () => {
    el = await createDialog({
      open: true,
      toolName: 'form.submit',
      securityTier: 2,
    });
    const received = new Promise<CustomEvent>((resolve) => {
      el.addEventListener('security-approve', (e) => resolve(e as CustomEvent), {
        once: true,
      });
    });

    (el as any)._approve();

    const event = await received;
    expect(event.detail.toolName).toBe('form.submit');
    expect(event.detail.securityTier).toBe(2);
  });

  it('dispatches security-deny event', async () => {
    el = await createDialog({
      open: true,
      toolName: 'nav.click',
      securityTier: 1,
    });
    const received = new Promise<CustomEvent>((resolve) => {
      el.addEventListener('security-deny', (e) => resolve(e as CustomEvent), {
        once: true,
      });
    });

    (el as any)._deny();

    const event = await received;
    expect(event.detail.toolName).toBe('nav.click');
    expect(event.detail.securityTier).toBe(1);
  });

  it('shows tool name and details', async () => {
    el = await createDialog({
      open: true,
      toolName: 'page.delete',
      details: 'This will permanently delete the page.',
      securityTier: 2,
    });
    const toolNameEl = el.querySelector('.security-dialog-tool-name');
    expect(toolNameEl).toBeTruthy();
    expect(toolNameEl!.textContent).toBe('page.delete');
    const desc = el.querySelector('.dialog-desc');
    expect(desc!.textContent).toBe('This will permanently delete the page.');
  });

  it('closes dialog on approve', async () => {
    el = await createDialog({
      open: true,
      toolName: 'test.tool',
      securityTier: 1,
    });
    (el as any)._approve();
    expect(el.open).toBe(false);
  });

  it('closes dialog on deny', async () => {
    el = await createDialog({
      open: true,
      toolName: 'test.tool',
      securityTier: 1,
    });
    (el as any)._deny();
    expect(el.open).toBe(false);
  });

  it('show() method opens the dialog with config', async () => {
    el = await createDialog();
    el.show({ toolName: 'nav.goto', securityTier: 1, details: 'Navigate away' });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    expect(el.open).toBe(true);
    expect(el.toolName).toBe('nav.goto');
    expect(el.details).toBe('Navigate away');
  });
});
