/**
 * Tests for <chat-container> Lit component.
 *
 * NOTE: happy-dom does not render Lit array-mapped TemplateResults.
 * Tests verify component API (properties, methods, events) rather than
 * DOM output for child bubble rendering.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Stub chrome for modules that reference it at import time
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p) },
});

import '../chat-container';
import type { ChatContainer } from '../chat-container';
import type { Message } from '../../types';

/** Helper: create a chat-container, attach, and wait for render */
async function createContainer(props: Partial<ChatContainer> = {}): Promise<ChatContainer> {
  const el = document.createElement('chat-container') as ChatContainer;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

const sampleMessages: Message[] = [
  { role: 'user', content: 'Hello', ts: Date.now() },
  { role: 'ai', content: 'Hi there', ts: Date.now() },
  { role: 'tool_call', content: '', tool: 'search', args: { q: 'test' }, ts: Date.now() },
];

describe('ChatContainer', () => {
  let el: ChatContainer;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('chat-container')).toBeDefined();
  });

  it('stores messages property', async () => {
    el = await createContainer({ messages: sampleMessages });
    expect(el.messages.length).toBe(3);
    expect(el.messages[0].role).toBe('user');
    expect(el.messages[1].role).toBe('ai');
  });

  it('clear() removes all messages', async () => {
    el = await createContainer({ messages: [...sampleMessages] });
    expect(el.messages.length).toBe(3);
    el.clear();
    expect(el.messages.length).toBe(0);
  });

  it('appendMessage() adds a message', async () => {
    el = await createContainer({ messages: [] });
    expect(el.messages.length).toBe(0);
    el.appendMessage({ role: 'user', content: 'New message', ts: Date.now() });
    expect(el.messages.length).toBe(1);
    expect(el.messages[0].content).toBe('New message');
  });

  it('message-edit event re-dispatches from bubble-edit', async () => {
    el = await createContainer({ messages: sampleMessages, editable: true });

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('message-edit', (e) => resolve(e as CustomEvent), { once: true });
    });

    // Call the handler directly (happy-dom doesn't render child bubbles)
    const fakeEvent = new CustomEvent('bubble-edit', {
      bubbles: true,
      composed: true,
      detail: { index: 0, content: 'edited' },
    });
    (el as any)._onBubbleEdit(fakeEvent);

    const event = await received;
    expect(event.detail.index).toBe(0);
    expect(event.detail.content).toBe('edited');
  });

  it('message-delete event re-dispatches from bubble-delete', async () => {
    el = await createContainer({ messages: sampleMessages, editable: true });

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('message-delete', (e) => resolve(e as CustomEvent), { once: true });
    });

    const fakeEvent = new CustomEvent('bubble-delete', {
      bubbles: true,
      composed: true,
      detail: { index: 1 },
    });
    (el as any)._onBubbleDelete(fakeEvent);

    const event = await received;
    expect(event.detail.index).toBe(1);
  });

  it('sets className to chat-container', async () => {
    el = await createContainer({ messages: [] });
    expect(el.className).toBe('chat-container');
  });

  it('editable property is set', async () => {
    el = await createContainer({ messages: sampleMessages, editable: true });
    expect(el.editable).toBe(true);
  });
});
