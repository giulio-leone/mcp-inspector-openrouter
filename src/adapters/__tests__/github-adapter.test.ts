import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubAdapter } from '../github-adapter';

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

/**
 * Helper: add an element to document.body.
 */
function addElement(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  if (text) el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;

  beforeEach(() => {
    adapter = new GitHubAdapter();
    document.body.innerHTML = '';
    setLocation('https://github.com/');
  });

  // ── isOnGitHub ──

  describe('isOnGitHub', () => {
    it('returns true on github.com', () => {
      setLocation('https://github.com/');
      expect(adapter.isOnGitHub()).toBe(true);
    });

    it('returns true on subdomain of github.com', () => {
      setLocation('https://gist.github.com/');
      expect(adapter.isOnGitHub()).toBe(true);
    });

    it('returns false on other domains', () => {
      setLocation('https://www.gitlab.com/');
      expect(adapter.isOnGitHub()).toBe(false);
    });

    it('rejects spoofed domains', () => {
      setLocation('https://notgithub.com/');
      expect(adapter.isOnGitHub()).toBe(false);
    });

    it('rejects github.com.evil.com', () => {
      setLocation('https://github.com.evil.com/');
      expect(adapter.isOnGitHub()).toBe(false);
    });

    it('rejects evil-github.com', () => {
      setLocation('https://evil-github.com/');
      expect(adapter.isOnGitHub()).toBe(false);
    });
  });

  // ── Repository ──

  describe('starRepo', () => {
    it('clicks star button when found', async () => {
      const btn = addElement('button', { id: 'repo-stars-counter-star' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.starRepo();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.starRepo()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('unstarRepo', () => {
    it('clicks unstar button when found', async () => {
      const btn = addElement('button', { id: 'repo-stars-counter-unstar' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.unstarRepo();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.unstarRepo()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('forkRepo', () => {
    it('clicks fork button when found', async () => {
      const btn = addElement('button', { id: 'fork-button' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.forkRepo();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.forkRepo()).rejects.toThrow('GitHub element not found');
    });
  });

  // ── Issues ──

  describe('createIssue', () => {
    it('clicks new issue button when found', async () => {
      const link = addElement('a', { href: '/owner/repo/issues/new' });
      const spy = vi.spyOn(link, 'click');
      await adapter.createIssue('Bug report');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty title', async () => {
      await expect(adapter.createIssue('')).rejects.toThrow('title must be non-empty');
    });

    it('throws on whitespace-only title', async () => {
      await expect(adapter.createIssue('   ')).rejects.toThrow('title must be non-empty');
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.createIssue('Test')).rejects.toThrow('GitHub element not found');
    });
  });

  describe('closeIssue', () => {
    it('clicks close issue button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'Close issue' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.closeIssue();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.closeIssue()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('reopenIssue', () => {
    it('clicks reopen issue button when found', async () => {
      const btn = addElement('button', { 'aria-label': 'Reopen issue' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.reopenIssue();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.reopenIssue()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('addComment', () => {
    it('fills textarea and clicks submit', async () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'new_comment_field';
      document.body.appendChild(textarea);
      const submitBtn = addElement('button', { type: 'submit', class: 'btn-primary' });
      const clickSpy = vi.spyOn(submitBtn, 'click');
      await adapter.addComment('Great work!');
      expect(textarea.value).toBe('Great work!');
      expect(clickSpy).toHaveBeenCalled();
    });

    it('throws on empty text', async () => {
      await expect(adapter.addComment('')).rejects.toThrow('text must be non-empty');
    });

    it('throws on whitespace-only text', async () => {
      await expect(adapter.addComment('  ')).rejects.toThrow('text must be non-empty');
    });

    it('throws when textarea not found', async () => {
      await expect(adapter.addComment('test')).rejects.toThrow('GitHub element not found');
    });
  });

  describe('addLabel', () => {
    it('clicks label element when found', async () => {
      const el = addElement('span', { 'data-name': 'bug' });
      const spy = vi.spyOn(el, 'click');
      await adapter.addLabel('bug');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty label', async () => {
      await expect(adapter.addLabel('')).rejects.toThrow('label must be non-empty');
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.addLabel('enhancement')).rejects.toThrow('GitHub element not found');
    });
  });

  // ── PRs ──

  describe('approvePR', () => {
    it('clicks approve button when found', async () => {
      const input = addElement('input', { value: 'approve' });
      const spy = vi.spyOn(input, 'click');
      await adapter.approvePR();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.approvePR()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('requestChanges', () => {
    it('clicks request changes button when found', async () => {
      const input = addElement('input', { value: 'request_changes' });
      const spy = vi.spyOn(input, 'click');
      await adapter.requestChanges('Please fix');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on empty comment', async () => {
      await expect(adapter.requestChanges('')).rejects.toThrow('comment must be non-empty');
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.requestChanges('fix')).rejects.toThrow('GitHub element not found');
    });
  });

  describe('mergePR', () => {
    it('clicks merge button when found', async () => {
      const btn = addElement('button', { 'data-testid': 'merge-pr-button' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.mergePR();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.mergePR()).rejects.toThrow('GitHub element not found');
    });
  });

  // ── Navigation ──

  describe('goToIssues', () => {
    it('clicks issues tab when found', async () => {
      const link = addElement('a', { 'data-tab': 'issues' });
      const spy = vi.spyOn(link, 'click');
      await adapter.goToIssues();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.goToIssues()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('goToPullRequests', () => {
    it('clicks pull requests tab when found', async () => {
      const link = addElement('a', { 'data-tab': 'pull-requests' });
      const spy = vi.spyOn(link, 'click');
      await adapter.goToPullRequests();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.goToPullRequests()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('goToActions', () => {
    it('clicks actions tab when found', async () => {
      const link = addElement('a', { 'data-tab': 'actions' });
      const spy = vi.spyOn(link, 'click');
      await adapter.goToActions();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.goToActions()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('searchRepo', () => {
    it('fills search input when found', async () => {
      const input = document.createElement('input');
      input.name = 'q';
      document.body.appendChild(input);
      await adapter.searchRepo('fix bug');
      expect(input.value).toBe('fix bug');
    });

    it('throws on empty query', async () => {
      await expect(adapter.searchRepo('')).rejects.toThrow('query must be non-empty');
    });

    it('throws when no search input found', async () => {
      await expect(adapter.searchRepo('test')).rejects.toThrow('GitHub element not found');
    });
  });

  // ── Code ──

  describe('toggleFileView', () => {
    it('clicks toggle button when found', async () => {
      const btn = addElement('button', { 'data-testid': 'file-tree-toggle' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.toggleFileView();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.toggleFileView()).rejects.toThrow('GitHub element not found');
    });
  });

  describe('copyPermalink', () => {
    it('clicks copy permalink button when found', async () => {
      const btn = addElement('button', { 'data-testid': 'copy-permalink' });
      const spy = vi.spyOn(btn, 'click');
      await adapter.copyPermalink();
      expect(spy).toHaveBeenCalled();
    });

    it('throws when no matching element is found', async () => {
      await expect(adapter.copyPermalink()).rejects.toThrow('GitHub element not found');
    });
  });
});
