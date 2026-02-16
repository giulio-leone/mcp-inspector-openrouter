/**
 * chat-store.ts — Conversation persistence layer.
 * Stores conversations in localStorage, organized by site hostname.
 * Converted from: chat-store.js
 */

import type {
  Conversation,
  ConversationSummary,
  ConversationStore,
  Message,
  MessageRole,
} from '../types';
import { STORAGE_KEY_CONVERSATIONS } from '../utils/constants';

// ── Internal helpers ──

function loadAll(): ConversationStore {
  try {
    return (
      (JSON.parse(
        localStorage.getItem(STORAGE_KEY_CONVERSATIONS) ?? '{}',
      ) as ConversationStore) || {}
    );
  } catch {
    return {};
  }
}

function saveAll(data: ConversationStore): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(data));
  } catch (e) {
    console.warn('[WebMCP] localStorage.setItem failed (quota exceeded?):', e);
  }
}

// ── Public API ──

/** Get site key from URL (hostname only — all pages on same site share conversations) */
export function siteKey(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url || 'unknown';
  }
}

/** List all conversations for a site */
export function listConversations(site: string): ConversationSummary[] {
  const all = loadAll();
  return (all[site] || []).map((c) => ({
    id: c.id,
    title: c.title,
    ts: c.ts,
  }));
}

/** Get a specific conversation by id */
export function getConversation(
  site: string,
  id: string,
): Conversation | null {
  const all = loadAll();
  return (all[site] || []).find((c) => c.id === id) ?? null;
}

/** Create a new conversation, returns the conversation object */
export function createConversation(
  site: string,
  title = 'New chat',
): Conversation {
  const all = loadAll();
  if (!all[site]) all[site] = [];
  const conv: Conversation = {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    ts: Date.now(),
    messages: [],
  };
  all[site].unshift(conv);
  saveAll(all);
  return conv;
}

/** Add a message to a conversation */
export function addMessage(
  site: string,
  convId: string,
  msg: { role: MessageRole; content: string } & Record<string, unknown>,
): void {
  const all = loadAll();
  const convs = all[site] || [];
  const conv = convs.find((c) => c.id === convId);
  if (!conv) return;

  const message: Message = {
    role: msg.role,
    content: msg.content,
    ts: Date.now(),
    ...(msg.tool ? { tool: msg.tool as string } : {}),
    ...(msg.args ? { args: msg.args as Record<string, unknown> } : {}),
    ...(msg.reasoning ? { reasoning: msg.reasoning as string } : {}),
  };
  conv.messages.push(message);

  // Auto-title from first user message
  if (conv.title === 'New chat' && msg.role === 'user') {
    conv.title =
      msg.content.slice(0, 50) + (msg.content.length > 50 ? '…' : '');
  }
  conv.ts = Date.now();
  saveAll(all);
}

/** Delete a conversation */
export function deleteConversation(site: string, convId: string): void {
  const all = loadAll();
  if (!all[site]) return;
  all[site] = all[site].filter((c) => c.id !== convId);
  if (all[site].length === 0) delete all[site];
  saveAll(all);
}

/** Replace message at index and truncate all messages after it */
export function editMessageAt(site: string, convId: string, index: number, newContent: string): Message[] {
  const all = loadAll();
  const conv = (all[site] || []).find((c) => c.id === convId);
  if (!conv || index < 0 || index >= conv.messages.length) return conv?.messages ?? [];

  conv.messages[index] = { ...conv.messages[index], content: newContent, ts: Date.now() };
  conv.messages = conv.messages.slice(0, index + 1);
  conv.ts = Date.now();
  saveAll(all);
  return conv.messages;
}

/** Delete message at index and all messages after it */
export function deleteMessageAt(site: string, convId: string, index: number): Message[] {
  const all = loadAll();
  const conv = (all[site] || []).find((c) => c.id === convId);
  if (!conv || index < 0 || index >= conv.messages.length) return conv?.messages ?? [];

  conv.messages = conv.messages.slice(0, index);
  conv.ts = Date.now();
  saveAll(all);
  return conv.messages;
}

/** Get all messages for a conversation */
export function getMessages(site: string, convId: string): Message[] {
  const conv = getConversation(site, convId);
  return conv ? conv.messages : [];
}
