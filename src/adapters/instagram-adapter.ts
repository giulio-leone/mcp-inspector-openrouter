/**
 * InstagramAdapter — DOM-based adapter for Instagram platform interactions.
 * Uses resilient selector strategies with multiple fallbacks.
 */

import type { IInstagramPort, InstagramSection } from '../ports/instagram.port';

/** Check whether the current page is Instagram */
export function isInstagram(): boolean {
  const h = location.hostname;
  return h === 'instagram.com' || h.endsWith('.instagram.com');
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
  throw new Error(`Instagram element not found: ${description} (tried: ${selectors.join(', ')})`);
}

function clickElement(selectors: string[], description: string): void {
  const el = queryElement<HTMLElement>(selectors, description);
  el.click();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Set input/textarea value in a way compatible with React-controlled inputs.
 * Uses the native prototype setter to bypass React's value interception.
 */
function setReactInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export class InstagramAdapter implements IInstagramPort {
  // ── Stories ──

  async viewStory(username: string): Promise<void> {
    const safe = CSS.escape(username);
    const selectors = [
      `[role="button"] img[alt*="${safe}" i]`,
      `canvas[aria-label*="${safe}" i]`,
      `[aria-label*="story" i][aria-label*="${safe}" i]`,
    ];
    clickElement(selectors, `story for @${username}`);
    await sleep(300);
  }

  async nextStory(): Promise<void> {
    clickElement(
      ['button[aria-label*="Next" i]', '[aria-label*="Next story" i]'],
      'next story button',
    );
  }

  async previousStory(): Promise<void> {
    clickElement(
      ['button[aria-label*="Previous" i]', '[aria-label*="Go back" i]'],
      'previous story button',
    );
  }

  async replyToStory(message: string): Promise<void> {
    const input = queryElement<HTMLTextAreaElement>(
      ['[role="dialog"] textarea[placeholder*="Reply" i]', '[role="dialog"] textarea'],
      'story reply input',
    );
    input.focus();
    setReactInputValue(input, message);
    await sleep(100);
    clickElement(
      ['[role="dialog"] button[type="submit"]', '[role="dialog"] [aria-label*="Send" i]'],
      'story reply send button',
    );
  }

  // ── Feed ──

  async likePost(): Promise<void> {
    clickElement(
      ['[aria-label*="Like" i]:not([aria-label*="Unlike" i])', 'svg[aria-label*="Like" i]:not([aria-label*="Unlike" i])'],
      'like button',
    );
  }

  async unlikePost(): Promise<void> {
    clickElement(['[aria-label*="Unlike" i]', 'svg[aria-label*="Unlike" i]'], 'unlike button');
  }

  async savePost(): Promise<void> {
    clickElement(
      ['[aria-label*="Save" i]:not([aria-label*="Unsave" i])', 'svg[aria-label*="Save" i]:not([aria-label*="Unsave" i])'],
      'save button',
    );
  }

  async unsavePost(): Promise<void> {
    clickElement(
      ['[aria-label*="Remove" i]', '[aria-label*="Unsave" i]'],
      'unsave button',
    );
  }

  async commentOnPost(text: string): Promise<void> {
    const input = queryElement<HTMLTextAreaElement>(
      ['textarea[aria-label*="comment" i]', 'textarea[placeholder*="comment" i]'],
      'comment input',
    );
    input.focus();
    setReactInputValue(input, text);
    await sleep(100);
    clickElement(
      ['button[type="submit"]', '[data-testid="post-comment-button"]'],
      'post comment button',
    );
  }

  async sharePost(username: string): Promise<void> {
    clickElement(
      ['[aria-label*="Share" i]', '[aria-label*="Send" i]'],
      'share button',
    );
    await sleep(300);
    const input = queryElement<HTMLInputElement>(
      ['input[placeholder*="Search" i]', 'input[aria-label*="Search" i]'],
      'share search input',
    );
    input.focus();
    setReactInputValue(input, username);
  }

  async scrollFeed(direction: 'up' | 'down'): Promise<void> {
    const amount = direction === 'down' ? 800 : -800;
    window.scrollBy({ top: amount, behavior: 'smooth' });
  }

  // ── Reels ──

  async likeReel(): Promise<void> {
    clickElement(
      ['[aria-label*="Like" i]:not([aria-label*="Unlike" i])', 'svg[aria-label*="Like" i]:not([aria-label*="Unlike" i])'],
      'reel like button',
    );
  }

  async commentOnReel(text: string): Promise<void> {
    clickElement(
      ['[aria-label*="Comment" i]', 'svg[aria-label*="Comment" i]'],
      'reel comment icon',
    );
    await sleep(300);
    const input = queryElement<HTMLTextAreaElement>(
      ['textarea[aria-label*="comment" i]', 'textarea[placeholder*="comment" i]'],
      'reel comment input',
    );
    input.focus();
    setReactInputValue(input, text);
    await sleep(100);
    clickElement(
      ['button[type="submit"]', '[data-testid="post-comment-button"]'],
      'post reel comment button',
    );
  }

  async nextReel(): Promise<void> {
    clickElement(
      ['[aria-label*="Next" i]', '[aria-label*="Down" i]'],
      'next reel button',
    );
  }

  async shareReel(username: string): Promise<void> {
    clickElement(
      ['[aria-label*="Share" i]', '[aria-label*="Send" i]'],
      'reel share button',
    );
    await sleep(300);
    const input = queryElement<HTMLInputElement>(
      ['input[placeholder*="Search" i]', 'input[aria-label*="Search" i]'],
      'reel share search input',
    );
    input.focus();
    setReactInputValue(input, username);
  }

  // ── DM ──

  async sendDM(username: string, message: string): Promise<void> {
    await this.openConversation(username);
    await sleep(300);
    const input = queryElement<HTMLTextAreaElement>(
      ['textarea[placeholder*="Message" i]', 'textarea[aria-label*="Message" i]'],
      'DM message input',
    );
    input.focus();
    setReactInputValue(input, message);
    await sleep(100);
    clickElement(
      ['button[type="submit"]', '[aria-label*="Send" i]'],
      'DM send button',
    );
  }

  async openConversation(username: string): Promise<void> {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/direct/"]'));
    const match = links.find((a) => a.textContent?.toLowerCase().includes(username.toLowerCase()));
    if (match) {
      match.click();
      return;
    }
    throw new Error(
      `Instagram element not found: conversation with @${username} (tried: a[href*="/direct/"])`,
    );
  }

  // ── Profile ──

  async followUser(_username: string): Promise<void> {
    // Look for Follow button by data-testid or by text content
    const testIdBtn = document.querySelector<HTMLElement>('[data-testid="follow-button"]');
    if (testIdBtn) { testIdBtn.click(); return; }

    // Fallback: find button whose trimmed text is exactly "Follow"
    const buttons = document.querySelectorAll<HTMLButtonElement>('header button, [role="banner"] button');
    for (const btn of buttons) {
      if (btn.textContent?.trim() === 'Follow') { btn.click(); return; }
    }
    throw new Error('Instagram element not found: follow button (tried: [data-testid="follow-button"], header button with text "Follow")');
  }

  async unfollowUser(_username: string): Promise<void> {
    clickElement(
      ['[data-testid="unfollow-button"]', 'button[aria-label*="Following" i]'],
      'unfollow button',
    );
  }

  // ── Navigation ──

  async goToExplore(): Promise<void> {
    clickElement(['a[href="/explore/"]', 'a[href*="explore"]'], 'explore link');
  }

  async goToReels(): Promise<void> {
    clickElement(['a[href="/reels/"]', 'a[href*="reels"]'], 'reels link');
  }

  async goToProfile(username?: string): Promise<void> {
    if (username) {
      window.location.href = `https://www.instagram.com/${username}/`;
    } else {
      clickElement(
        ['a[href*="/accounts/"]', 'img[data-testid="user-avatar"]'],
        'profile link',
      );
    }
  }

  async searchUser(query: string): Promise<void> {
    clickElement(
      ['a[href="/explore/"]', '[aria-label*="Search" i]'],
      'search input trigger',
    );
    await sleep(300);
    const input = queryElement<HTMLInputElement>(
      ['input[aria-label*="Search" i]', 'input[placeholder*="Search" i]'],
      'search input',
    );
    input.focus();
    setReactInputValue(input, query);
  }

  // ── State detection ──

  isOnInstagram(): boolean {
    return isInstagram();
  }

  getCurrentSection(): InstagramSection {
    const path = location.pathname;
    if (path.startsWith('/direct')) return 'dm';
    if (path.startsWith('/explore')) return 'explore';
    if (path.startsWith('/reels')) return 'reels';
    if (path.startsWith('/stories')) return 'stories';
    if (path === '/' || path === '') return 'feed';
    // Known non-profile single-segment paths
    const nonProfilePrefixes = ['/p/', '/reel/', '/tv/', '/accounts/', '/nametag/', '/settings/'];
    if (nonProfilePrefixes.some((p) => path.startsWith(p))) return 'unknown';
    // Profile pages: /<username>/
    if (/^\/[^/]+\/?$/.test(path)) return 'profile';
    return 'unknown';
  }
}
