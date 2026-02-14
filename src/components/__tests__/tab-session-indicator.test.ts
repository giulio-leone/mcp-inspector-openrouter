/**
 * Tests for <tab-session-indicator> Lit component.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p) },
});

import '../tab-session-indicator';
import type { TabSessionIndicator, SessionInfo } from '../tab-session-indicator';

const SESSIONS: SessionInfo[] = [
  { tabId: 1, title: 'Google Search', active: true },
  { tabId: 2, title: 'GitHub', active: false },
];

async function createElement(props: Partial<TabSessionIndicator> = {}): Promise<TabSessionIndicator> {
  const el = document.createElement('tab-session-indicator') as TabSessionIndicator;
  Object.assign(el, { sessions: SESSIONS, sessionActive: true, ...props });
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

describe('TabSessionIndicator', () => {
  let el: TabSessionIndicator;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('tab-session-indicator')).toBeDefined();
  });

  it('renders nothing when sessionActive is false', async () => {
    el = await createElement({ sessionActive: false });
    expect(el.querySelector('.session-indicator')).toBeNull();
  });

  it('renders nothing when sessions array is empty', async () => {
    el = await createElement({ sessions: [], sessionActive: true });
    expect(el.querySelector('.session-indicator')).toBeNull();
  });

  it('renders session count badge', async () => {
    el = await createElement();
    const badge = el.querySelector('.session-indicator__badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent?.trim()).toBe('2');
  });

  it('renders active session title in label', async () => {
    el = await createElement();
    const label = el.querySelector('.session-indicator__label');
    expect(label).not.toBeNull();
    expect(label!.textContent?.trim()).toBe('Google Search');
  });

  it('truncates long titles', async () => {
    const longTitle = 'A'.repeat(50);
    el = await createElement({
      sessions: [{ tabId: 1, title: longTitle, active: true }],
    });
    const label = el.querySelector('.session-indicator__label');
    expect(label!.textContent?.trim().length).toBeLessThan(50);
    expect(label!.textContent?.trim()).toContain('…');
  });

  it('exposes sessionCount getter', async () => {
    el = await createElement();
    expect(el.sessionCount).toBe(2);
  });

  it('exposes activeSession getter', async () => {
    el = await createElement();
    expect(el.activeSession?.tabId).toBe(1);
    expect(el.activeSession?.title).toBe('Google Search');
  });

  it('returns undefined activeSession when none is active', async () => {
    el = await createElement({
      sessions: [
        { tabId: 1, title: 'Tab 1', active: false },
        { tabId: 2, title: 'Tab 2', active: false },
      ],
    });
    expect(el.activeSession).toBeUndefined();
  });
});
