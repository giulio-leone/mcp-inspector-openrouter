/**
 * GitHubAdapter — DOM-based adapter for GitHub platform interactions.
 * Uses resilient selector strategies with multiple fallbacks.
 */

import type { IGitHubPort } from '../ports/productivity.port';

/** Validate that a string parameter is non-empty after trimming. */
function requireNonEmpty(value: string, paramName: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${paramName} must be non-empty`);
  return trimmed;
}

/**
 * Query the DOM with multiple fallback selectors, returning the first match.
 * Throws a descriptive error if no element is found.
 */
function queryElement<T extends Element>(selectors: string[], description: string): T {
  for (const sel of selectors) {
    const el = document.querySelector<T>(sel);
    if (el) return el;
  }
  throw new Error(`GitHub element not found: ${description} (tried: ${selectors.join(', ')})`);
}

function clickElement(selectors: string[], description: string): void {
  const el = queryElement<HTMLElement>(selectors, description);
  el.click();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GitHubAdapter implements IGitHubPort {
  isOnGitHub(): boolean {
    const h = location.hostname;
    return h === 'github.com' || h.endsWith('.github.com');
  }

  // ── Repository ──

  async starRepo(): Promise<void> {
    clickElement(
      ['.js-social-form button[aria-label*="Star" i]', '[data-ga-click*="star"]', '#repo-stars-counter-star'],
      'star button',
    );
  }

  async unstarRepo(): Promise<void> {
    clickElement(
      ['.js-social-form button[aria-label*="Unstar" i]', '[data-ga-click*="unstar"]', '#repo-stars-counter-unstar'],
      'unstar button',
    );
  }

  async forkRepo(): Promise<void> {
    clickElement(
      ['#fork-button', '[data-testid="fork-button"]', 'a[href$="/fork"]'],
      'fork button',
    );
    await sleep(300);
  }

  // ── Issues ──

  async createIssue(title: string, _body?: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(title, 'title'));
    clickElement(
      ['a[href$="/issues/new"]', '[data-testid="new-issue-button"]', `.btn-primary[aria-label*="New issue" i]`],
      `new issue button for "${safe}"`,
    );
    await sleep(300);
  }

  async closeIssue(): Promise<void> {
    clickElement(
      [
        '#partial-new-comment-form-actions button[name="comment_and_close"]',
        'button[aria-label*="Close issue" i]',
        '[data-testid="close-issue-button"]',
      ],
      'close issue button',
    );
  }

  async reopenIssue(): Promise<void> {
    clickElement(
      [
        'button[name="comment_and_open"]',
        'button[aria-label*="Reopen issue" i]',
        '[data-testid="reopen-issue-button"]',
      ],
      'reopen issue button',
    );
  }

  async addComment(text: string): Promise<void> {
    requireNonEmpty(text, 'text');
    const textarea = queryElement<HTMLTextAreaElement>(
      ['#new_comment_field', 'textarea[name="comment[body]"]', '[data-testid="comment-textarea"]'],
      'comment textarea',
    );
    textarea.focus();
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    clickElement(
      ['button[type="submit"].btn-primary', '[data-testid="submit-comment-button"]'],
      'submit comment button',
    );
  }

  async addLabel(label: string): Promise<void> {
    const safe = CSS.escape(requireNonEmpty(label, 'label'));
    clickElement(
      [`[data-name="${safe}"]`, '[aria-label*="Label" i]', '[data-testid="label-select"]'],
      `label "${safe}"`,
    );
  }

  // ── PRs ──

  async approvePR(): Promise<void> {
    clickElement(
      [
        'input[value="approve"]',
        '[aria-label*="Approve" i]',
        '[data-testid="approve-pr-button"]',
      ],
      'approve PR button',
    );
    await sleep(200);
  }

  async requestChanges(comment: string): Promise<void> {
    requireNonEmpty(comment, 'comment');
    clickElement(
      [
        'input[value="request_changes"]',
        '[aria-label*="Request changes" i]',
        '[data-testid="request-changes-button"]',
      ],
      'request changes button',
    );
    await sleep(200);
  }

  async mergePR(): Promise<void> {
    clickElement(
      [
        '.merge-message .btn-group-merge .btn-primary',
        '[data-testid="merge-pr-button"]',
        'button[aria-label*="Merge pull request" i]',
      ],
      'merge PR button',
    );
    await sleep(300);
  }

  // ── Navigation ──

  async goToIssues(): Promise<void> {
    clickElement(
      ['a[data-tab="issues"]', '.UnderlineNav-item[href$="/issues"]', '[data-testid="issues-tab"]'],
      'issues tab',
    );
  }

  async goToPullRequests(): Promise<void> {
    clickElement(
      ['a[data-tab="pull-requests"]', '.UnderlineNav-item[href$="/pulls"]', '[data-testid="pulls-tab"]'],
      'pull requests tab',
    );
  }

  async goToActions(): Promise<void> {
    clickElement(
      ['a[data-tab="actions"]', '.UnderlineNav-item[href$="/actions"]', '[data-testid="actions-tab"]'],
      'actions tab',
    );
  }

  async searchRepo(query: string): Promise<void> {
    requireNonEmpty(query, 'query');
    const input = queryElement<HTMLInputElement>(
      ['input[name="q"]', '[data-testid="search-input"]', '#query-builder-test'],
      'search input',
    );
    input.focus();
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
  }

  // ── Code ──

  async toggleFileView(): Promise<void> {
    clickElement(
      ['[aria-label*="Toggle file" i]', '[data-testid="file-tree-toggle"]', '.js-toggle-file-view'],
      'toggle file view button',
    );
  }

  async copyPermalink(): Promise<void> {
    clickElement(
      ['[aria-label*="Copy permalink" i]', '[data-testid="copy-permalink"]', '.js-permalink-shortcut'],
      'copy permalink button',
    );
  }
}
