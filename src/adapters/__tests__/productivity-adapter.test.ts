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
  });
});
