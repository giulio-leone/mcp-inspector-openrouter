import { describe, it, expect, beforeEach } from 'vitest';
import { ProductivityAdapter } from '../productivity-adapter';

/**
 * Helper: set location properties for happy-dom.
 */
function setLocation(url: string): void {
  const parsed = new URL(url);
  Object.defineProperty(window, 'location', {
    value: {
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      href: parsed.href,
    },
    writable: true,
    configurable: true,
  });
}

describe('ProductivityAdapter', () => {
  let adapter: ProductivityAdapter;

  beforeEach(() => {
    adapter = new ProductivityAdapter();
    document.body.innerHTML = '';
    setLocation('https://www.example.com/');
  });

  // ── detectPlatform ──

  describe('detectPlatform', () => {
    it('detects notion on www.notion.so', () => {
      setLocation('https://www.notion.so/page');
      expect(adapter.detectPlatform()).toBe('notion');
    });

    it('detects notion on notion.so', () => {
      setLocation('https://notion.so/');
      expect(adapter.detectPlatform()).toBe('notion');
    });

    it('detects notion on *.notion.site', () => {
      setLocation('https://workspace.notion.site/page');
      expect(adapter.detectPlatform()).toBe('notion');
    });

    it('detects github on github.com', () => {
      setLocation('https://github.com/owner/repo');
      expect(adapter.detectPlatform()).toBe('github');
    });

    it('detects github on subdomain of github.com', () => {
      setLocation('https://gist.github.com/');
      expect(adapter.detectPlatform()).toBe('github');
    });

    it('returns unknown on unrecognized domain', () => {
      setLocation('https://www.example.com/');
      expect(adapter.detectPlatform()).toBe('unknown');
    });

    it('detects google-docs on docs.google.com', () => {
      setLocation('https://docs.google.com/document/d/123/edit');
      expect(adapter.detectPlatform()).toBe('google-docs');
    });

    it('detects trello on trello.com', () => {
      setLocation('https://trello.com/b/abc/my-board');
      expect(adapter.detectPlatform()).toBe('trello');
    });

    it('detects slack on app.slack.com', () => {
      setLocation('https://app.slack.com/client/T123/C456');
      expect(adapter.detectPlatform()).toBe('slack');
    });
  });

  // ── isProductivityApp ──

  describe('isProductivityApp', () => {
    it('returns true on notion', () => {
      setLocation('https://www.notion.so/');
      expect(adapter.isProductivityApp()).toBe(true);
    });

    it('returns true on github', () => {
      setLocation('https://github.com/');
      expect(adapter.isProductivityApp()).toBe(true);
    });

    it('returns false on unknown domain', () => {
      setLocation('https://www.example.com/');
      expect(adapter.isProductivityApp()).toBe(false);
    });
  });

  // ── isProductivityApp ──

  describe('isProductivityApp (additional)', () => {
    it('returns true on google-docs', () => {
      setLocation('https://docs.google.com/document/d/123/edit');
      expect(adapter.isProductivityApp()).toBe(true);
    });

    it('returns true on trello', () => {
      setLocation('https://trello.com/b/abc');
      expect(adapter.isProductivityApp()).toBe(true);
    });

    it('returns true on slack', () => {
      setLocation('https://app.slack.com/');
      expect(adapter.isProductivityApp()).toBe(true);
    });
  });

  // ── Sub-adapters ──

  describe('sub-adapters', () => {
    it('exposes notion adapter', () => {
      expect(adapter.notion).toBeDefined();
      expect(typeof adapter.notion.isOnNotion).toBe('function');
    });

    it('exposes github adapter', () => {
      expect(adapter.github).toBeDefined();
      expect(typeof adapter.github.isOnGitHub).toBe('function');
    });

    it('exposes googleDocs adapter', () => {
      expect(adapter.googleDocs).toBeDefined();
      expect(typeof adapter.googleDocs.isOnGoogleDocs).toBe('function');
    });

    it('exposes trello adapter', () => {
      expect(adapter.trello).toBeDefined();
      expect(typeof adapter.trello.isOnTrello).toBe('function');
    });

    it('exposes slack adapter', () => {
      expect(adapter.slack).toBeDefined();
      expect(typeof adapter.slack.isOnSlack).toBe('function');
    });
  });
});
