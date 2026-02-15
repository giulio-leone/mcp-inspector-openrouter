import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstagramAdapter, isInstagram } from '../instagram-adapter';

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

describe('InstagramAdapter', () => {
  let adapter: InstagramAdapter;

  beforeEach(() => {
    adapter = new InstagramAdapter();
    document.body.innerHTML = '';
    setLocation('https://www.instagram.com/');
  });

  // ── isInstagram utility ──

  it('isInstagram() returns true on instagram.com', () => {
    setLocation('https://www.instagram.com/');
    expect(isInstagram()).toBe(true);
  });

  it('isInstagram() returns false on other domains', () => {
    setLocation('https://www.twitter.com/');
    expect(isInstagram()).toBe(false);
  });

  it('isInstagram() rejects spoofed domains containing instagram.com', () => {
    setLocation('https://notinstagram.com/');
    expect(isInstagram()).toBe(false);
    setLocation('https://evil-instagram.com/');
    expect(isInstagram()).toBe(false);
    setLocation('https://instagram.com.evil.com/');
    expect(isInstagram()).toBe(false);
  });

  it('isOnInstagram() delegates to isInstagram utility', () => {
    setLocation('https://www.instagram.com/explore/');
    expect(adapter.isOnInstagram()).toBe(true);
  });

  // ── getCurrentSection ──

  it('getCurrentSection returns "feed" for root path', () => {
    setLocation('https://www.instagram.com/');
    expect(adapter.getCurrentSection()).toBe('feed');
  });

  it('getCurrentSection returns "explore" for /explore', () => {
    setLocation('https://www.instagram.com/explore/');
    expect(adapter.getCurrentSection()).toBe('explore');
  });

  it('getCurrentSection returns "reels" for /reels', () => {
    setLocation('https://www.instagram.com/reels/');
    expect(adapter.getCurrentSection()).toBe('reels');
  });

  it('getCurrentSection returns "stories" for /stories', () => {
    setLocation('https://www.instagram.com/stories/someuser/');
    expect(adapter.getCurrentSection()).toBe('stories');
  });

  it('getCurrentSection returns "dm" for /direct', () => {
    setLocation('https://www.instagram.com/direct/inbox/');
    expect(adapter.getCurrentSection()).toBe('dm');
  });

  it('getCurrentSection returns "profile" for /<username>/', () => {
    setLocation('https://www.instagram.com/johndoe/');
    expect(adapter.getCurrentSection()).toBe('profile');
  });

  it('getCurrentSection returns "unknown" for unrecognized paths', () => {
    setLocation('https://www.instagram.com/p/ABC123/');
    expect(adapter.getCurrentSection()).toBe('unknown');
  });

  it('getCurrentSection returns "unknown" for /reel/ paths', () => {
    setLocation('https://www.instagram.com/reel/XYZ/');
    expect(adapter.getCurrentSection()).toBe('unknown');
  });

  it('getCurrentSection returns "unknown" for /accounts/ paths', () => {
    setLocation('https://www.instagram.com/accounts/edit/');
    expect(adapter.getCurrentSection()).toBe('unknown');
  });

  it('getCurrentSection returns "unknown" for /tv/ paths', () => {
    setLocation('https://www.instagram.com/tv/');
    expect(adapter.getCurrentSection()).toBe('unknown');
  });

  it('getCurrentSection returns "profile" for username starting with p', () => {
    setLocation('https://www.instagram.com/peter/');
    expect(adapter.getCurrentSection()).toBe('profile');
  });

  // ── Feed: likePost ──

  it('likePost clicks the like button', async () => {
    const btn = addElement('span', { 'aria-label': 'Like' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.likePost();
    expect(spy).toHaveBeenCalled();
  });

  it('likePost throws if no like button found', async () => {
    await expect(adapter.likePost()).rejects.toThrow(/Instagram element not found.*like button/i);
  });

  // ── Feed: unlikePost ──

  it('unlikePost clicks the unlike button', async () => {
    const btn = addElement('span', { 'aria-label': 'Unlike' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.unlikePost();
    expect(spy).toHaveBeenCalled();
  });

  it('unlikePost throws if no unlike button found', async () => {
    await expect(adapter.unlikePost()).rejects.toThrow(/Instagram element not found.*unlike/i);
  });

  // ── Feed: savePost ──

  it('savePost clicks the save button', async () => {
    const btn = addElement('span', { 'aria-label': 'Save' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.savePost();
    expect(spy).toHaveBeenCalled();
  });

  // ── Feed: unsavePost ──

  it('unsavePost clicks the unsave button', async () => {
    const btn = addElement('span', { 'aria-label': 'Remove' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.unsavePost();
    expect(spy).toHaveBeenCalled();
  });

  // ── Feed: commentOnPost ──

  it('commentOnPost fills textarea and submits', async () => {
    const textarea = addElement('textarea', { 'aria-label': 'Add a comment' }) as HTMLTextAreaElement;
    const submitBtn = addElement('button', { type: 'submit' });
    const clickSpy = vi.spyOn(submitBtn, 'click');

    await adapter.commentOnPost('Great photo!');
    expect(textarea.value).toBe('Great photo!');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('commentOnPost throws if textarea not found', async () => {
    await expect(adapter.commentOnPost('hello')).rejects.toThrow(/Instagram element not found.*comment input/i);
  });

  // ── Feed: sharePost ──

  it('sharePost clicks share and fills search', async () => {
    addElement('span', { 'aria-label': 'Share' });
    const input = addElement('input', { placeholder: 'Search', type: 'text' }) as HTMLInputElement;

    await adapter.sharePost('friend');
    expect(input.value).toBe('friend');
  });

  // ── Feed: scrollFeed ──

  it('scrollFeed calls window.scrollBy', async () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    await adapter.scrollFeed('down');
    expect(spy).toHaveBeenCalledWith({ top: 800, behavior: 'smooth' });
    spy.mockRestore();
  });

  it('scrollFeed scrolls up with negative value', async () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    await adapter.scrollFeed('up');
    expect(spy).toHaveBeenCalledWith({ top: -800, behavior: 'smooth' });
    spy.mockRestore();
  });

  // ── Stories: nextStory ──

  it('nextStory clicks next button', async () => {
    const btn = addElement('button', { 'aria-label': 'Next' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.nextStory();
    expect(spy).toHaveBeenCalled();
  });

  it('nextStory throws if button not found', async () => {
    await expect(adapter.nextStory()).rejects.toThrow(/Instagram element not found.*next story/i);
  });

  // ── Stories: previousStory ──

  it('previousStory clicks previous button', async () => {
    const btn = addElement('button', { 'aria-label': 'Previous' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.previousStory();
    expect(spy).toHaveBeenCalled();
  });

  // ── Reels: nextReel ──

  it('nextReel clicks the next reel button', async () => {
    const btn = addElement('button', { 'aria-label': 'Next' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.nextReel();
    expect(spy).toHaveBeenCalled();
  });

  // ── Navigation: goToExplore ──

  it('goToExplore clicks the explore link', async () => {
    const link = addElement('a', { href: '/explore/' });
    const spy = vi.spyOn(link, 'click');
    await adapter.goToExplore();
    expect(spy).toHaveBeenCalled();
  });

  it('goToExplore throws if link not found', async () => {
    await expect(adapter.goToExplore()).rejects.toThrow(/Instagram element not found.*explore/i);
  });

  // ── Navigation: goToReels ──

  it('goToReels clicks the reels link', async () => {
    const link = addElement('a', { href: '/reels/' });
    const spy = vi.spyOn(link, 'click');
    await adapter.goToReels();
    expect(spy).toHaveBeenCalled();
  });

  // ── Navigation: goToProfile ──

  it('goToProfile navigates to username URL when provided', async () => {
    await adapter.goToProfile('testuser');
    expect(location.href).toBe('https://www.instagram.com/testuser/');
  });

  // ── Profile: followUser ──

  it('followUser clicks the follow button', async () => {
    setLocation('https://www.instagram.com/user123/');
    const btn = addElement('button', { 'data-testid': 'follow-button' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.followUser('user123');
    expect(spy).toHaveBeenCalled();
  });

  it('followUser throws if not on correct profile', async () => {
    setLocation('https://www.instagram.com/otheruser/');
    await expect(adapter.followUser('user123')).rejects.toThrow(/not on their profile/);
  });

  it('followUser throws if button not found', async () => {
    setLocation('https://www.instagram.com/nobody/');
    await expect(adapter.followUser('nobody')).rejects.toThrow(/Instagram element not found.*follow/i);
  });

  it('followUser throws on empty username', async () => {
    await expect(adapter.followUser('')).rejects.toThrow(/non-empty/);
  });

  // ── Profile: unfollowUser ──

  it('unfollowUser clicks the unfollow button', async () => {
    setLocation('https://www.instagram.com/user123/');
    const btn = addElement('button', { 'data-testid': 'unfollow-button' });
    const spy = vi.spyOn(btn, 'click');
    await adapter.unfollowUser('user123');
    expect(spy).toHaveBeenCalled();
  });

  // ── DM: openConversation ──

  it('openConversation clicks matching DM link', async () => {
    const link = addElement('a', { href: '/direct/t/12345/' }, 'johndoe');
    const spy = vi.spyOn(link, 'click');
    await adapter.openConversation('johndoe');
    expect(spy).toHaveBeenCalled();
  });

  it('openConversation throws if no matching conversation', async () => {
    await expect(adapter.openConversation('nobody')).rejects.toThrow(
      /Instagram element not found.*conversation with @nobody/i,
    );
  });

  it('openConversation throws on empty username', async () => {
    await expect(adapter.openConversation('')).rejects.toThrow(/non-empty/);
  });

  it('viewStory throws on empty username', async () => {
    await expect(adapter.viewStory('')).rejects.toThrow(/non-empty/);
  });
});
