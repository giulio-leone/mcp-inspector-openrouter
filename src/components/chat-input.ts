/**
 * <chat-input> — Sticky chat input area with send button.
 * Uses Light DOM so existing CSS targets (.chat-input-area, .chat-input-row, etc.) apply.
 */
import { html } from 'lit';
import { BaseElement } from './base-element';

export class ChatInput extends BaseElement {
  static properties = {
    disabled: { type: Boolean },
    placeholder: { type: String },
    presets: { type: Array },
    _hasContent: { type: Boolean, state: true },
  };

  declare disabled: boolean;
  declare placeholder: string;
  declare presets: string[];
  declare _hasContent: boolean;

  constructor() {
    super();
    this.disabled = false;
    this.placeholder = 'Type your question...';
    this.presets = [];
    this._hasContent = false;
  }

  /** Light DOM — inherits existing CSS */
  override createRenderRoot(): this {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('chat-input-area');
  }

  /** Returns the raw textarea value. */
  get value(): string {
    const ta = this.querySelector('textarea');
    return ta ? ta.value : '';
  }

  /** Sets the textarea value. */
  set value(v: string) {
    const ta = this.querySelector('textarea');
    if (ta) {
      ta.value = v;
    }
  }

  /** Sync _hasContent from current textarea value — call after batch value changes. */
  syncState(): void {
    const ta = this.querySelector('textarea');
    this._hasContent = ta ? ta.value.trim().length > 0 : false;
  }

  /** Focuses the textarea. */
  override focus(): void {
    this.querySelector('textarea')?.focus();
  }

  setPresets(presets: string[]): void {
    this.presets = presets;
  }

  /** Clears the textarea and resets state. */
  clear(): void {
    const ta = this.querySelector('textarea');
    if (ta) {
      ta.value = '';
      ta.style.height = 'auto';
    }
    this._hasContent = false;
  }

  override render(): unknown {
    return html`
      ${this.presets.length > 0
        ? html`<div class="chat-presets">
            ${this.presets.map((preset, index) => html`
              <button
                type="button"
                class="chat-preset-btn secondary small"
                data-preset-index=${index}
                @click=${this._onPresetClick}
              >${preset}</button>
            `)}
          </div>`
        : null}
      <div class="chat-input-row">
        <textarea
          aria-label="Message"
          placeholder=${this.placeholder}
          rows="1"
          @input=${this._onInput}
          @keydown=${this._onKeydown}
        ></textarea>
        <button
          title="Send"
          ?disabled=${this.disabled || !this._hasContent}
          @click=${this._onSend}
        >↑</button>
      </div>
    `;
  }

  // ── Private handlers ──

  private _onInput(): void {
    const ta = this.querySelector('textarea');
    if (!ta) return;
    this._hasContent = ta.value.trim().length > 0;
    // Auto-resize
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }

  private _onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !this.disabled && this._hasContent) {
      e.preventDefault();
      this._onSend();
    }
  }

  private _onSend(): void {
    const ta = this.querySelector('textarea');
    if (!ta || this.disabled) return;
    const message = ta.value.trim();
    if (!message) return;
    this.dispatchEvent(new CustomEvent('send-message', {
      bubbles: true,
      composed: true,
      detail: { message },
    }));
    this.clear();
  }

  private _onPresetClick(e: Event): void {
    const button = e.currentTarget as HTMLButtonElement | null;
    const index = Number(button?.dataset.presetIndex ?? '-1');
    const prompt = this.presets[index];
    if (!prompt) return;
    this.dispatchEvent(new CustomEvent('apply-preset', {
      bubbles: true,
      composed: true,
      detail: { prompt },
    }));
  }
}

customElements.define('chat-input', ChatInput);
