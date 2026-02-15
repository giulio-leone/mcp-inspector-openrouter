/**
 * Regression tests for ChatHeader.updated() <select> value sync.
 *
 * Verifies that after setConversations(), the updated() lifecycle
 * properly syncs a <select>.value to activeConversationId.
 *
 * NOTE: happy-dom does not render Lit conditional/nested templates,
 * so we manually inject a <select> into the element's Light DOM and
 * call updated() directly (same approach as existing chat-header tests).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p), openOptionsPage: vi.fn() },
});

import '../chat-header';
import type { ChatHeader } from '../chat-header';
import type { ConversationSummary } from '../../types';

async function createElement(props: Partial<ChatHeader> = {}): Promise<ChatHeader> {
  const el = document.createElement('chat-header') as ChatHeader;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

/** Inject a <select> with options matching conversations into the element. */
function injectSelect(el: ChatHeader, convs: ConversationSummary[]): HTMLSelectElement {
  const sel = document.createElement('select');
  convs.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.title;
    sel.appendChild(opt);
  });
  el.appendChild(sel);
  return sel;
}

describe('ChatHeader select sync (updated())', () => {
  let el: ChatHeader;

  afterEach(() => {
    el?.remove();
  });

  it('syncs select.value to 2nd conversation after setConversations', async () => {
    el = await createElement();
    const convs: ConversationSummary[] = [
      { id: 'a1', title: 'First', ts: 1000 },
      { id: 'a2', title: 'Second', ts: 2000 },
      { id: 'a3', title: 'Third', ts: 3000 },
    ];
    const sel = injectSelect(el, convs);

    el.setConversations(convs, 'a2');
    // Call updated() directly (happy-dom limitation)
    (el as any).updated();

    expect(sel.value).toBe('a2');
  });

  it('updates select.value when activeId changes', async () => {
    const convs: ConversationSummary[] = [
      { id: 'b1', title: 'Chat A', ts: 1000 },
      { id: 'b2', title: 'Chat B', ts: 2000 },
    ];
    el = await createElement();
    const sel = injectSelect(el, convs);

    el.setConversations(convs, 'b1');
    (el as any).updated();
    expect(sel.value).toBe('b1');

    // Change active conversation
    el.setConversations(convs, 'b2');
    (el as any).updated();
    expect(sel.value).toBe('b2');
  });

  it('does not crash with empty conversations', async () => {
    el = await createElement();
    // No <select> injected — simulates empty render
    el.setConversations([], null);

    // Should not throw even with no <select> in DOM
    expect(() => (el as any).updated()).not.toThrow();
    expect(el.activeConversationId).toBe('');
  });

  it('settles to correct value after rapid setConversations calls', async () => {
    el = await createElement();
    const convs: ConversationSummary[] = [
      { id: 'r1', title: 'Rapid 1', ts: 1000 },
      { id: 'r2', title: 'Rapid 2', ts: 2000 },
      { id: 'r3', title: 'Rapid 3', ts: 3000 },
    ];
    const sel = injectSelect(el, convs);

    // Fire several updates rapidly
    el.setConversations(convs, 'r1');
    el.setConversations(convs, 'r3');
    el.setConversations(convs, 'r2');

    // Only the final state matters when updated() runs
    (el as any).updated();

    expect(el.activeConversationId).toBe('r2');
    expect(sel.value).toBe('r2');
  });
});
