import { describe, it, expect, afterEach } from 'vitest';

import '../onboarding-checklist';
import type { OnboardingChecklist } from '../onboarding-checklist';

const STORAGE_KEY = 'wmcp_onboarding_v1';

async function createElement(): Promise<OnboardingChecklist> {
  const el = document.createElement('onboarding-checklist') as OnboardingChecklist;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

describe('OnboardingChecklist', () => {
  let el: OnboardingChecklist;

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('onboarding-checklist')).toBeDefined();
  });

  it('renders default checklist state', async () => {
    el = await createElement();
    expect(el.textContent).toContain('0/3 completed');
    const steps = el.querySelectorAll('.onboarding-step');
    expect(steps.length).toBe(3);
  });

  it('marks message step complete and persists state', async () => {
    el = await createElement();
    el.markMessageSent();
    await el.updateComplete;
    expect(el.textContent).toContain('1/3 completed');
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).toContain('"message":true');
  });

  it('dispatches onboarding-open-advanced on action click', async () => {
    el = await createElement();
    const received = new Promise<CustomEvent>(resolve => {
      el.addEventListener('onboarding-open-advanced', (e) => resolve(e as CustomEvent), { once: true });
    });
    const button = el.querySelector('[data-action="open-advanced"]') as HTMLButtonElement;
    button.click();
    const event = await received;
    expect(event.type).toBe('onboarding-open-advanced');
    expect(el.textContent).toContain('1/3 completed');
  });

  it('dismisses checklist and stores dismissed state', async () => {
    el = await createElement();
    const dismiss = el.querySelector('.onboarding-dismiss') as HTMLButtonElement;
    dismiss.click();
    await el.updateComplete;
    expect(el.querySelector('.onboarding-checklist')).toBeNull();
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).toContain('"dismissed":true');
  });
});
