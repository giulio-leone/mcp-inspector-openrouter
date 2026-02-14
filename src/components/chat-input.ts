/**
 * <chat-input> — Sticky chat input area with send button and action buttons.
 * Uses Light DOM so existing CSS targets (.chat-input-area, .chat-input-row, etc.) apply.
 */
import { html } from 'lit';
import { BaseElement } from './base-element';

export class ChatInput extends BaseElement {
  static properties = {
    disabled: { type: Boolean },
    placeholder: { type: String },
    _hasContent: { type: Boolean, state: true },
  };

  declare disabled: boolean;
  declare placeholder: string;
  declare _hasContent: boolean;

  constructor() {
    super();
    this.disabled = false;
    this.placeholder = 'Send a message...';
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
      <div class="chat-input-row">
        <textarea
          placeholder=${this.placeholder}
          rows="2"
          @input=${this._onInput}
          @keydown=${this._onKeydown}
        ></textarea>
        <button
          title="Send"
          ?disabled=${this.disabled || !this._hasContent}
          @click=${this._onSend}
        >▶</button>
      </div>
      <div class="chat-input-actions">
        <button class="secondary small" @click=${this._onCopyTrace}>Copy trace</button>
        <button class="secondary small" title="Download debug log" @click=${this._onDownloadDebug}>🐛 Debug log</button>
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

  private _onCopyTrace(): void {
    this.dispatchEvent(new CustomEvent('copy-trace', {
      bubbles: true,
      composed: true,
    }));
  }

  private _onDownloadDebug(): void {
    this.dispatchEvent(new CustomEvent('download-debug-log', {
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('chat-input', ChatInput);
