/**
 * Tests for <tab-navigator> Lit component.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p) },
});

import '../tab-navigator';
import type { TabNavigator, TabConfig } from '../tab-navigator';

const TABS: TabConfig[] = [
  { id: 'tools', label: 'Tools', icon: '<svg></svg>' },
  { id: 'chat', label: 'Chat', icon: '<svg></svg>' },
];

async function createElement(props: Partial<TabNavigator> = {}): Promise<TabNavigator> {
  const el = document.createElement('tab-navigator') as TabNavigator;
  Object.assign(el, { tabs: TABS, activeTab: 'tools', ...props });
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

describe('TabNavigator', () => {
  let el: TabNavigator;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('tab-navigator')).toBeDefined();
  });

  it('renders tab buttons for each tab config', async () => {
    el = await createElement();
    const buttons = el.querySelectorAll('.tab-btn');
    expect(buttons.length).toBe(2);
  });

  it('marks the active tab with active class', async () => {
    el = await createElement({ activeTab: 'chat' });
    const buttons = el.querySelectorAll('.tab-btn');
    const activeButtons = el.querySelectorAll('.tab-btn.active');
    expect(activeButtons.length).toBe(1);
    expect((activeButtons[0] as HTMLElement).dataset.tab).toBe('chat');
    // The other button should not be active
    const toolsBtn = Array.from(buttons).find(b => (b as HTMLElement).dataset.tab === 'tools');
    expect(toolsBtn?.classList.contains('active')).toBe(false);
  });

  it('dispatches tab-change event on click', async () => {
    el = await createElement({ activeTab: 'tools' });

    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('tab-change', (e) => resolve(e as CustomEvent), { once: true });
    });

    // Call handler directly (happy-dom limitation with Lit event bindings)
    (el as any)._onTabClick('chat');

    const event = await received;
    expect(event.detail.tab).toBe('chat');
  });

  it('switches active state when a different tab is clicked', async () => {
    el = await createElement({ activeTab: 'tools' });

    (el as any)._onTabClick('chat');
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    expect(el.activeTab).toBe('chat');
    const activeButtons = el.querySelectorAll('.tab-btn.active');
    expect(activeButtons.length).toBe(1);
    expect((activeButtons[0] as HTMLElement).dataset.tab).toBe('chat');
  });

  it('defaults activeTab to chat', async () => {
    const el2 = document.createElement('tab-navigator') as TabNavigator;
    document.body.appendChild(el2);
    await el2.updateComplete;
    expect(el2.activeTab).toBe('chat');
    el2.remove();
  });
});
