import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleDocsAdapter } from '../google-docs-adapter';

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

describe('GoogleDocsAdapter', () => {
  let adapter: GoogleDocsAdapter;

  beforeEach(() => {
    adapter = new GoogleDocsAdapter();
    document.body.innerHTML = '';
    setLocation('https://docs.google.com/document/d/123/edit');
  });

  // ── Platform detection ──

  it('detects Google Docs by hostname', () => {
    expect(adapter.isOnGoogleDocs()).toBe(true);
  });

  it('returns false for non-Google Docs', () => {
    setLocation('https://example.com');
    expect(adapter.isOnGoogleDocs()).toBe(false);
  });

  // ── Document ──

  it('gets document title from input', () => {
    const input = document.createElement('input');
    input.className = 'docs-title-input';
    input.value = 'My Document';
    document.body.appendChild(input);
    expect(adapter.getDocTitle()).toBe('My Document');
  });

  it('throws when title input not found', () => {
    expect(() => adapter.getDocTitle()).toThrow('Google Docs element not found');
  });

  it('sets document title', async () => {
    const input = document.createElement('input');
    input.className = 'docs-title-input';
    document.body.appendChild(input);
    await adapter.setDocTitle('New Title');
    expect(input.value).toBe('New Title');
  });

  it('rejects empty title', async () => {
    await expect(adapter.setDocTitle('  ')).rejects.toThrow('title must be non-empty');
  });

  // ── Formatting ──

  it('clicks bold button', async () => {
    const btn = addElement('button', { 'aria-label': 'Bold (Ctrl+B)' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.formatBold();
    expect(clicked).toBe(true);
  });

  it('clicks italic button', async () => {
    const btn = addElement('button', { 'aria-label': 'Italic (Ctrl+I)' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.formatItalic();
    expect(clicked).toBe(true);
  });

  it('rejects invalid heading level', async () => {
    await expect(adapter.formatHeading(0 as 1)).rejects.toThrow('heading level must be between 1 and 6');
  });

  it('clicks heading selector', async () => {
    const btn = addElement('button', { 'aria-label': 'Styles dropdown' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.formatHeading(1);
    expect(clicked).toBe(true);
  });

  // ── Editor ──

  it('clicks editor area for insertText', async () => {
    const editor = addElement('div', { class: 'kix-appview-editor' });
    let clicked = false;
    editor.addEventListener('click', () => { clicked = true; });
    await adapter.insertText('hello');
    expect(clicked).toBe(true);
  });

  it('rejects empty text for insertText', async () => {
    await expect(adapter.insertText('')).rejects.toThrow('text must be non-empty');
  });

  // ── Links ──

  it('clicks insert link button', async () => {
    const btn = addElement('button', { 'aria-label': 'Insert link' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.insertLink('https://example.com');
    expect(clicked).toBe(true);
  });

  it('rejects empty url for insertLink', async () => {
    await expect(adapter.insertLink('')).rejects.toThrow('url must be non-empty');
  });

  // ── Comments ──

  it('clicks add comment button', async () => {
    const btn = addElement('button', { 'aria-label': 'Comment' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.addComment('note');
    expect(clicked).toBe(true);
  });

  it('clicks resolve comment button', async () => {
    const btn = addElement('button', { 'aria-label': 'Resolve' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.resolveComment();
    expect(clicked).toBe(true);
  });

  // ── Navigation ──

  it('clicks go to beginning', async () => {
    const el = addElement('div', { class: 'kix-appview-editor' });
    let clicked = false;
    el.addEventListener('click', () => { clicked = true; });
    await adapter.goToBeginning();
    expect(clicked).toBe(true);
  });

  it('rejects empty find for findAndReplace', async () => {
    await expect(adapter.findAndReplace('', 'b')).rejects.toThrow('find must be non-empty');
  });

  it('rejects empty replace for findAndReplace', async () => {
    await expect(adapter.findAndReplace('a', '  ')).rejects.toThrow('replace must be non-empty');
  });

  // ── Sharing ──

  it('clicks share button', async () => {
    const btn = addElement('button', { 'aria-label': 'Share' });
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });
    await adapter.shareDoc();
    expect(clicked).toBe(true);
  });

  it('returns current URL as share link', () => {
    expect(adapter.getShareLink()).toBe('https://docs.google.com/document/d/123/edit');
  });

  // ── Error paths ──

  it('throws when bold button not found', async () => {
    await expect(adapter.formatBold()).rejects.toThrow('Google Docs element not found');
  });

  it('throws when comment button not found', async () => {
    await expect(adapter.addComment('test')).rejects.toThrow('Google Docs element not found');
  });
});
