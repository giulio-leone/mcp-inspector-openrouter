import { describe, it, expect, beforeEach } from 'vitest';
import { TrelloAdapter } from '../trello-adapter';

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

describe('TrelloAdapter', () => {
  let adapter: TrelloAdapter;

  beforeEach(() => {
    adapter = new TrelloAdapter();
    document.body.innerHTML = '';
    setLocation('https://trello.com/b/abc/my-board');
  });

  // ── Platform detection ──

  it('detects Trello by hostname', () => {
    expect(adapter.isOnTrello()).toBe(true);
  });

  it('detects www.trello.com', () => {
    setLocation('https://www.trello.com/b/abc');
    expect(adapter.isOnTrello()).toBe(true);
  });

  it('returns false for non-Trello', () => {
    setLocation('https://example.com');
    expect(adapter.isOnTrello()).toBe(false);
  });

  // ── Cards ──

  it('clicks add card button', async () => {
    const btn = addElement('button', { class: 'js-add-a-card' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.createCard('New Task');
    expect(clicked).toBe(true);
  });

  it('rejects empty card title', async () => {
    await expect(adapter.createCard('  ')).rejects.toThrow('title must be non-empty');
  });

  it('clicks move card button', async () => {
    const btn = addElement('button', { class: 'js-move-card' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.moveCard('Done');
    expect(clicked).toBe(true);
  });

  it('clicks archive card button', async () => {
    const btn = addElement('button', { class: 'js-archive-card' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.archiveCard();
    expect(clicked).toBe(true);
  });

  it('clicks add label button', async () => {
    const btn = addElement('button', { class: 'js-add-label' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.addLabel('urgent');
    expect(clicked).toBe(true);
  });

  it('rejects empty label', async () => {
    await expect(adapter.addLabel('')).rejects.toThrow('label must be non-empty');
  });

  // ── Comments ──

  it('adds a comment to a card', async () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-testid', 'card-comment-input');
    document.body.appendChild(textarea);
    const saveBtn = addElement('button', { 'data-testid': 'card-comment-save' });
    let saved = false;
    saveBtn.addEventListener('click', () => { saved = true; });
    await adapter.addComment('Nice work!');
    expect(textarea.value).toBe('Nice work!');
    expect(saved).toBe(true);
  });

  it('rejects empty comment', async () => {
    await expect(adapter.addComment('')).rejects.toThrow('text must be non-empty');
  });

  // ── Members & Due Dates ──

  it('clicks assign member button', async () => {
    const btn = addElement('button', { class: 'js-change-card-members' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.assignMember('Alice');
    expect(clicked).toBe(true);
  });

  it('clicks due date button', async () => {
    const btn = addElement('button', { class: 'js-add-due-date' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.setDueDate('2025-03-01');
    expect(clicked).toBe(true);
  });

  // ── Lists ──

  it('clicks add list button', async () => {
    const btn = addElement('button', { class: 'js-add-list' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.createList('Backlog');
    expect(clicked).toBe(true);
  });

  it('clicks archive list button', async () => {
    const btn = addElement('button', { class: 'js-close-list' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.archiveList();
    expect(clicked).toBe(true);
  });

  // ── Search & Filter ──

  it('searches cards', async () => {
    const input = document.createElement('input');
    input.setAttribute('data-testid', 'board-search-input');
    document.body.appendChild(input);
    await adapter.searchCards('bug');
    expect(input.value).toBe('bug');
  });

  it('rejects empty search query', async () => {
    await expect(adapter.searchCards('')).rejects.toThrow('query must be non-empty');
  });

  it('clicks filter by label', async () => {
    const btn = addElement('button', { class: 'js-filter-cards' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.filterByLabel('red');
    expect(clicked).toBe(true);
  });

  it('clicks filter by member', async () => {
    const btn = addElement('button', { class: 'js-filter-by-member' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.filterByMember('Bob');
    expect(clicked).toBe(true);
  });

  // ── Error paths ──

  it('throws when add card button not found', async () => {
    await expect(adapter.createCard('test')).rejects.toThrow('Trello element not found');
  });

  it('throws when comment textarea not found', async () => {
    await expect(adapter.addComment('test')).rejects.toThrow('Trello element not found');
  });
});
