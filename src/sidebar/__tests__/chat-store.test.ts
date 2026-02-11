import { describe, it, expect, beforeEach } from 'vitest';
import {
  siteKey,
  createConversation,
  addMessage,
  getMessages,
  listConversations,
  deleteConversation,
  getConversation,
} from '../chat-store';
import { STORAGE_KEY_CONVERSATIONS } from '../../utils/constants';

describe('siteKey', () => {
  it('extracts hostname from a full URL', () => {
    expect(siteKey('https://example.com/path?q=1')).toBe('example.com');
  });

  it('extracts hostname from URL with port', () => {
    expect(siteKey('http://localhost:3000/app')).toBe('localhost');
  });

  it('returns the input string for invalid URLs', () => {
    expect(siteKey('not-a-url')).toBe('not-a-url');
  });

  it('returns "unknown" for empty string', () => {
    expect(siteKey('')).toBe('unknown');
  });
});

describe('chat-store CRUD', () => {
  const site = 'test.example.com';

  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a conversation with default title', () => {
    const conv = createConversation(site);
    expect(conv.id).toMatch(/^conv_/);
    expect(conv.title).toBe('New chat');
    expect(conv.messages).toEqual([]);
    expect(conv.ts).toBeGreaterThan(0);
  });

  it('creates a conversation with custom title', () => {
    const conv = createConversation(site, 'My Chat');
    expect(conv.title).toBe('My Chat');
  });

  it('lists conversations for a site', () => {
    createConversation(site, 'First');
    createConversation(site, 'Second');
    const list = listConversations(site);
    expect(list).toHaveLength(2);
    // Most recent first (unshift)
    expect(list[0].title).toBe('Second');
    expect(list[1].title).toBe('First');
  });

  it('returns empty list for unknown site', () => {
    expect(listConversations('no-such-site')).toEqual([]);
  });

  it('retrieves a conversation by id', () => {
    const conv = createConversation(site);
    const found = getConversation(site, conv.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(conv.id);
  });

  it('returns null for nonexistent conversation', () => {
    expect(getConversation(site, 'fake-id')).toBeNull();
  });

  it('adds a message and updates timestamp', () => {
    const conv = createConversation(site);
    const beforeTs = conv.ts;

    // Small delay to ensure ts differs
    addMessage(site, conv.id, { role: 'user', content: 'Hello' });

    const msgs = getMessages(site, conv.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('Hello');
    expect(msgs[0].ts).toBeGreaterThan(0);

    const updated = getConversation(site, conv.id);
    expect(updated!.ts).toBeGreaterThanOrEqual(beforeTs);
  });

  it('auto-titles from first user message', () => {
    const conv = createConversation(site);
    addMessage(site, conv.id, { role: 'user', content: 'What is the weather today?' });

    const updated = getConversation(site, conv.id);
    expect(updated!.title).toBe('What is the weather today?');
  });

  it('truncates auto-title to 50 chars with ellipsis', () => {
    const conv = createConversation(site);
    const longMsg = 'A'.repeat(60);
    addMessage(site, conv.id, { role: 'user', content: longMsg });

    const updated = getConversation(site, conv.id);
    expect(updated!.title).toBe('A'.repeat(50) + '…');
  });

  it('does not auto-title from ai messages', () => {
    const conv = createConversation(site);
    addMessage(site, conv.id, { role: 'ai', content: 'I am an AI' });

    const updated = getConversation(site, conv.id);
    expect(updated!.title).toBe('New chat');
  });

  it('returns empty messages for nonexistent conversation', () => {
    expect(getMessages(site, 'fake-id')).toEqual([]);
  });

  it('silently ignores addMessage for nonexistent conversation', () => {
    addMessage(site, 'fake-id', { role: 'user', content: 'nope' });
    // No throw
  });

  it('deletes a conversation', () => {
    const conv = createConversation(site);
    deleteConversation(site, conv.id);
    expect(listConversations(site)).toHaveLength(0);
  });

  it('cleans up site entry when last conversation is deleted', () => {
    const conv = createConversation(site);
    deleteConversation(site, conv.id);

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CONVERSATIONS) ?? '{}');
    expect(raw[site]).toBeUndefined();
  });

  it('silently ignores delete for unknown site', () => {
    deleteConversation('no-site', 'no-id');
    // No throw
  });

  it('isolates conversations per site', () => {
    createConversation('site-a.com', 'Chat A');
    createConversation('site-b.com', 'Chat B');

    expect(listConversations('site-a.com')).toHaveLength(1);
    expect(listConversations('site-b.com')).toHaveLength(1);
    expect(listConversations('site-a.com')[0].title).toBe('Chat A');
    expect(listConversations('site-b.com')[0].title).toBe('Chat B');
  });

  it('persists data in localStorage', () => {
    const conv = createConversation(site, 'Persistent');
    addMessage(site, conv.id, { role: 'user', content: 'hi' });

    // Read raw localStorage
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CONVERSATIONS)!);
    expect(raw[site]).toHaveLength(1);
    expect(raw[site][0].messages).toHaveLength(1);
  });
});
