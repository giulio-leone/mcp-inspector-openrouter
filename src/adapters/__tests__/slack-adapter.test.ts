import { describe, it, expect, beforeEach } from 'vitest';
import { SlackAdapter } from '../slack-adapter';

function setLocation(url: string): void {
  const parsed = new URL(url);
  Object.defineProperty(window, 'location', {
    value: { hostname: parsed.hostname, pathname: parsed.pathname, href: parsed.href },
    writable: true, configurable: true,
  });
}

function addElement(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;

  beforeEach(() => {
    adapter = new SlackAdapter();
    document.body.innerHTML = '';
    setLocation('https://app.slack.com/client/T123/C456');
  });

  // ── Platform detection ──

  it('detects app.slack.com', () => {
    expect(adapter.isOnSlack()).toBe(true);
  });

  it('detects slack.com', () => {
    setLocation('https://slack.com/');
    expect(adapter.isOnSlack()).toBe(true);
  });

  it('detects subdomain.slack.com', () => {
    setLocation('https://myteam.slack.com/');
    expect(adapter.isOnSlack()).toBe(true);
  });

  it('returns false for non-Slack', () => {
    setLocation('https://example.com');
    expect(adapter.isOnSlack()).toBe(false);
  });

  // ── Messaging ──

  it('sends a message', async () => {
    const editor = addElement('div', { 'data-testid': 'message-input' });
    const sendBtn = addElement('button', { 'data-testid': 'send-button' });
    let sent = false;
    sendBtn.addEventListener('click', () => { sent = true; });
    await adapter.sendMessage('Hello!');
    expect(editor.textContent).toBe('Hello!');
    expect(sent).toBe(true);
  });

  it('rejects empty message', async () => {
    await expect(adapter.sendMessage('')).rejects.toThrow('text must be non-empty');
  });

  it('clicks reply in thread', async () => {
    const btn = addElement('button', { 'data-testid': 'reply-in-thread' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.replyInThread('reply');
    expect(clicked).toBe(true);
  });

  it('clicks add reaction', async () => {
    const btn = addElement('button', { 'data-testid': 'add-reaction' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.addReaction('thumbsup');
    expect(clicked).toBe(true);
  });

  it('clicks edit message', async () => {
    const btn = addElement('button', { 'data-testid': 'edit-message' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.editLastMessage();
    expect(clicked).toBe(true);
  });

  it('clicks delete message', async () => {
    const btn = addElement('button', { 'data-testid': 'delete-message' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.deleteLastMessage();
    expect(clicked).toBe(true);
  });

  // ── Navigation ──

  it('switches channel', async () => {
    const btn = addElement('button', { 'data-testid': 'channel-general' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.switchChannel('general');
    expect(clicked).toBe(true);
  });

  it('rejects empty channel name', async () => {
    await expect(adapter.switchChannel('')).rejects.toThrow('channel must be non-empty');
  });

  it('searches messages', async () => {
    const input = document.createElement('input');
    input.setAttribute('data-testid', 'search-input');
    document.body.appendChild(input);
    await adapter.searchMessages('important');
    expect(input.value).toBe('important');
  });

  it('rejects empty search query', async () => {
    await expect(adapter.searchMessages('')).rejects.toThrow('query must be non-empty');
  });

  it('clicks create channel', async () => {
    const btn = addElement('button', { 'data-testid': 'create-channel' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.createChannel('new-channel');
    expect(clicked).toBe(true);
  });

  // ── Status ──

  it('clicks set status', async () => {
    const btn = addElement('button', { 'data-testid': 'set-status' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.setStatus('In a meeting');
    expect(clicked).toBe(true);
  });

  it('clicks set availability', async () => {
    const btn = addElement('button', { 'data-testid': 'set-availability' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.setAvailability(true);
    expect(clicked).toBe(true);
  });

  // ── Views ──

  it('clicks upload file', async () => {
    const btn = addElement('button', { 'data-testid': 'upload-file' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.uploadFile();
    expect(clicked).toBe(true);
  });

  it('clicks threads view', async () => {
    const btn = addElement('button', { 'data-testid': 'threads-view' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.goToThreads();
    expect(clicked).toBe(true);
  });

  it('clicks DMs view', async () => {
    const btn = addElement('button', { 'data-testid': 'dms-view' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.goToDMs();
    expect(clicked).toBe(true);
  });

  it('clicks mentions view', async () => {
    const btn = addElement('button', { 'data-testid': 'mentions-view' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.goToMentions();
    expect(clicked).toBe(true);
  });

  // ── Error paths ──

  it('throws when message input not found', async () => {
    await expect(adapter.sendMessage('test')).rejects.toThrow('Slack element not found');
  });

  it('throws when send button not found', async () => {
    addElement('div', { 'data-testid': 'message-input' });
    await expect(adapter.sendMessage('test')).rejects.toThrow('Slack element not found');
  });

  it('rejects empty emoji', async () => {
    await expect(adapter.addReaction('')).rejects.toThrow('emoji must be non-empty');
  });
});
