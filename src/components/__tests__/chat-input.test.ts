/**
 * Tests for <chat-input> Lit component.
 *
 * NOTE: happy-dom does not render Lit conditional/nested TemplateResults.
 * Tests verify behavior via imperative method calls and event dispatch
 * (same pattern as chat-header tests).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Stub chrome for modules that reference it at import time
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p) },
});

import '../chat-input';
import type { ChatInput } from '../chat-input';

/** Helper: create a chat-input, attach, and wait for render */
async function createElement(props: Partial<ChatInput> = {}): Promise<ChatInput> {
  const el = document.createElement('chat-input') as ChatInput;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

/** Helper: get the textarea inside the component */
function getTextarea(el: ChatInput): HTMLTextAreaElement {
  return el.querySelector('textarea')!;
}

/** Helper: get the send button inside the component */
function getSendButton(el: ChatInput): HTMLButtonElement {
  return el.querySelector('.chat-input-row button')!;
}

describe('ChatInput', () => {
  let el: ChatInput;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('chat-input')).toBeDefined();
  });

  it('renders default state: disabled=false, empty value, placeholder set', async () => {
    el = await createElement();
    expect(el.disabled).toBe(false);
    expect(el.value).toBe('');
    expect(el.placeholder).toBe('Send a message...');
    expect(el.classList.contains('chat-input-area')).toBe(true);
  });

  it('value getter returns raw textarea content', async () => {
    el = await createElement();
    const ta = getTextarea(el);
    ta.value = '  hello world  ';
    expect(el.value).toBe('  hello world  ');
  });

  it('value setter sets textarea content', async () => {
    el = await createElement();
    el.value = 'test message';
    const ta = getTextarea(el);
    expect(ta.value).toBe('test message');
  });

  it('clear() empties textarea and updates _hasContent', async () => {
    el = await createElement();
    el.value = 'something';
    (el as any)._hasContent = true;
    el.clear();
    expect(getTextarea(el).value).toBe('');
    expect((el as any)._hasContent).toBe(false);
  });

  it('disabled property disables send button', async () => {
    el = await createElement({ disabled: true });
    // Set content so only `disabled` prop prevents sending
    el.value = 'content';
    (el as any)._hasContent = true;
    await el.updateComplete;
    const btn = getSendButton(el);
    expect(btn.disabled).toBe(true);
  });

  it('send button disabled when textarea empty', async () => {
    el = await createElement();
    const btn = getSendButton(el);
    expect(btn.disabled).toBe(true);
  });

  it('_onSend dispatches send-message with trimmed content', async () => {
    el = await createElement();
    const ta = getTextarea(el);
    ta.value = '  hello  ';
    (el as any)._hasContent = true;

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('send-message', (e) => resolve(e as CustomEvent), { once: true });
    });

    (el as any)._onSend();
    const event = await received;
    expect(event.detail.message).toBe('hello');
  });

  it('_onSend clears textarea after dispatch', async () => {
    el = await createElement();
    const ta = getTextarea(el);
    ta.value = 'hello';
    (el as any)._hasContent = true;

    (el as any)._onSend();
    expect(ta.value).toBe('');
    expect((el as any)._hasContent).toBe(false);
  });

  it('Enter key (no Shift) triggers send', async () => {
    el = await createElement();
    const ta = getTextarea(el);
    ta.value = 'hello';
    (el as any)._hasContent = true;

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('send-message', (e) => resolve(e as CustomEvent), { once: true });
    });

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
    const spy = vi.spyOn(event, 'preventDefault');
    (el as any)._onKeydown(event);

    const sentEvent = await received;
    expect(sentEvent.detail.message).toBe('hello');
    expect(spy).toHaveBeenCalled();
  });

  it('Shift+Enter does NOT trigger send', async () => {
    el = await createElement();
    const ta = getTextarea(el);
    ta.value = 'hello';
    (el as any)._hasContent = true;

    let sent = false;
    el.addEventListener('send-message', () => { sent = true; }, { once: true });

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
    (el as any)._onKeydown(event);

    await new Promise(r => setTimeout(r, 50));
    expect(sent).toBe(false);
  });

  it('_onCopyTrace dispatches copy-trace', async () => {
    el = await createElement();

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('copy-trace', (e) => resolve(e as CustomEvent), { once: true });
    });

    (el as any)._onCopyTrace();
    const event = await received;
    expect(event.type).toBe('copy-trace');
  });

  it('_onDownloadDebug dispatches download-debug-log', async () => {
    el = await createElement();

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('download-debug-log', (e) => resolve(e as CustomEvent), { once: true });
    });

    (el as any)._onDownloadDebug();
    const event = await received;
    expect(event.type).toBe('download-debug-log');
  });
});
