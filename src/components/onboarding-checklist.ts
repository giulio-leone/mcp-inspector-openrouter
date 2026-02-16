import { html, nothing } from 'lit';
import { BaseElement } from './base-element';

type OnboardingStepId = 'message' | 'advanced' | 'preferences';

interface OnboardingState {
  message: boolean;
  advanced: boolean;
  preferences: boolean;
  dismissed: boolean;
}

const STORAGE_KEY = 'wmcp_onboarding_v1';

const DEFAULT_STATE: OnboardingState = {
  message: false,
  advanced: false,
  preferences: false,
  dismissed: false,
};

export class OnboardingChecklist extends BaseElement {
  static properties = {
    _state: { state: true },
  };

  declare _state: OnboardingState;

  constructor() {
    super();
    this._state = { ...DEFAULT_STATE };
  }

  override createRenderRoot(): this {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._loadState();
  }

  markMessageSent(): void {
    this._markStep('message');
  }

  markAdvancedOpened(): void {
    this._markStep('advanced');
  }

  markPreferencesOpened(): void {
    this._markStep('preferences');
  }

  private _loadState(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      this._state = {
        ...DEFAULT_STATE,
        ...parsed,
      };
    } catch (error) {
      console.warn('Failed to parse onboarding state', error);
    }
  }

  private _saveState(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
  }

  private _markStep(step: OnboardingStepId): void {
    if (this._state[step]) return;
    this._state = {
      ...this._state,
      [step]: true,
    };
    this._saveState();
  }

  private _dismiss(): void {
    this._state = {
      ...this._state,
      dismissed: true,
    };
    this._saveState();
  }

  private _completedSteps(): number {
    return [this._state.message, this._state.advanced, this._state.preferences].filter(Boolean).length;
  }

  private _allDone(): boolean {
    return this._completedSteps() === 3;
  }

  private _dispatch(name: string): void {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      composed: true,
    }));
  }

  private _onFocusInput(): void {
    this._dispatch('onboarding-focus-input');
  }

  private _onOpenAdvanced(): void {
    this._dispatch('onboarding-open-advanced');
    this.markAdvancedOpened();
  }

  private _onOpenOptions(): void {
    this._dispatch('onboarding-open-options');
    this.markPreferencesOpened();
  }

  private _renderStep(
    done: boolean,
    icon: string,
    title: string,
    description: string,
    actionLabel: string,
    action: () => void,
    actionId: string,
  ): unknown {
    return html`
      <li class="onboarding-step ${done ? 'done' : ''}">
        <span class="onboarding-step-icon" aria-hidden="true">${done ? '✅' : icon}</span>
        <div class="onboarding-step-content">
          <div class="onboarding-step-title">${title}</div>
          <div class="onboarding-step-description">${description}</div>
        </div>
        ${done
          ? html`<span class="onboarding-step-status">Done</span>`
          : html`<button type="button" class="onboarding-step-action secondary small" data-action=${actionId} @click=${action}>${actionLabel}</button>`}
      </li>
    `;
  }

  override render(): unknown {
    if (this._state.dismissed) return nothing;

    const completed = this._completedSteps();
    const allDone = this._allDone();

    return html`
      <section class="onboarding-checklist" aria-label="Getting started checklist">
        <div class="onboarding-header">
          <div>
            <div class="onboarding-title">Get started in 3 quick steps</div>
            <div class="onboarding-progress">${completed}/3 completed</div>
          </div>
          <button type="button" class="onboarding-dismiss" @click=${this._dismiss}>Hide</button>
        </div>
        <ol class="onboarding-steps">
          ${this._renderStep(
            this._state.message,
            '💬',
            'Send your first message',
            'Ask what you want to do on this page.',
            'Start now',
            this._onFocusInput,
            'focus-input',
          )}
          ${this._renderStep(
            this._state.advanced,
            '⚙️',
            'Open Advanced settings',
            'Review available actions and page report.',
            'Open',
            this._onOpenAdvanced,
            'open-advanced',
          )}
          ${this._renderStep(
            this._state.preferences,
            '🔑',
            'Check your preferences',
            'Make sure your key and model are ready.',
            'Open',
            this._onOpenOptions,
            'open-options',
          )}
        </ol>
        ${allDone ? html`<div class="onboarding-complete">🎉 You are ready to go.</div>` : nothing}
      </section>
    `;
  }
}

customElements.define('onboarding-checklist', OnboardingChecklist);
