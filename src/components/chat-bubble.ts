/**
 * <chat-bubble> — Renders a single chat message bubble.
 * Uses Light DOM so existing chat.css styles apply.
 *
 * NOTE: render() is intentionally flat (no nested TemplateResult interpolation)
 * because happy-dom does not commit nested Lit template results to the DOM.
 */
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from './base-element';
import { formatAIText } from '../utils/formatting';
import { ICONS } from '../sidebar/icons';
import type { MessageRole } from '../types';

import './reasoning-accordion';

export class ChatBubble extends BaseElement {
  static properties = {
    role: { type: String },
    content: { type: String },
    timestamp: { type: Number },
    toolName: { type: String, attribute: 'tool-name' },
    toolArgs: { type: Object, attribute: 'tool-args' },
    reasoning: { type: String },
    editable: { type: Boolean },
    index: { type: Number },
    _editing: { type: Boolean, state: true },
  };

  declare role: MessageRole;
  declare content: string;
  declare timestamp: number;
  declare toolName: string;
  declare toolArgs: Record<string, unknown>;
  declare reasoning: string;
  declare editable: boolean;
  declare index: number;
  declare _editing: boolean;

  constructor() {
    super();
    this.role = 'user';
    this.content = '';
    this.timestamp = 0;
    this.toolName = '';
    this.toolArgs = {};
    this.reasoning = '';
    this.editable = false;
    this.index = 0;
    this._editing = false;
  }

  /** Light DOM — inherits chat.css styles */
  override createRenderRoot(): this {
    return this;
  }

  protected override updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has('role')) {
      this.className = `bubble bubble-${this.role}`;
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.className = `bubble bubble-${this.role}`;
  }

  private async _saveEdit(): Promise<void> {
    await this.updateComplete;
    const textarea = this.querySelector('.bubble-edit-input') as HTMLTextAreaElement;
    if (!textarea) return;
    const newContent = textarea.value.trim();
    if (newContent && newContent !== this.content) {
      this.dispatchEvent(new CustomEvent('bubble-edit', {
        bubbles: true,
        composed: true,
        detail: { index: this.index, content: newContent },
      }));
    }
    this._editing = false;
  }

  private _cancelEdit(): void {
    this._editing = false;
  }

  private _startEdit(): void {
    this._editing = true;
  }

  private _handleDelete(): void {
    this.dispatchEvent(new CustomEvent('bubble-delete', {
      bubbles: true,
      composed: true,
      detail: { index: this.index },
    }));
  }

  protected override render(): unknown {
    const time = new Date(this.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (this._editing) {
      const rows = Math.min(6, Math.max(2, this.content.split('\n').length));
      return html`<div class="bubble-body"><textarea class="bubble-edit-input" .value=${this.content} rows=${rows}></textarea><div class="bubble-edit-btns"><button class="bubble-edit-save" @click=${this._saveEdit}>${unsafeHTML(ICONS.check)} Save</button><button class="bubble-edit-cancel" @click=${this._cancelEdit}>${unsafeHTML(ICONS.x)} Cancel</button></div></div><div class="bubble-time">${time}</div>`;
    }

    switch (this.role) {
      case 'user':
        return html`<div class="bubble-body">${this.content}</div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Edit message" @click=${this._startEdit}>${unsafeHTML(ICONS.edit)}</button><button class="bubble-action-btn" title="Delete this and all subsequent messages" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      case 'ai':
        if (this.reasoning && this.content) {
          return html`<div class="bubble-body"><reasoning-accordion .content=${this.reasoning}></reasoning-accordion><div>${unsafeHTML(formatAIText(this.content))}</div></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this and all subsequent messages" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;
        }
        if (this.reasoning && !this.content) {
          return html`<div class="bubble-body"><reasoning-accordion .content=${this.reasoning}></reasoning-accordion><div class="reasoning-notice">${unsafeHTML(ICONS.alertTriangle)} The model used all output tokens for reasoning. Check the reasoning above for details.</div></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this and all subsequent messages" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;
        }
        return html`<div class="bubble-body"><div>${unsafeHTML(formatAIText(this.content))}</div></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this and all subsequent messages" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      case 'tool_call':
        return html`<div class="bubble-body"><span class="tool-icon">${unsafeHTML(ICONS.zap)}</span> <strong>${this.toolName}</strong> <code>${JSON.stringify(this.toolArgs)}</code></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this and all subsequent messages" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      case 'tool_result':
        return html`<div class="bubble-body"><span class="tool-icon">${unsafeHTML(ICONS.checkCircle)}</span> <strong>${this.toolName}</strong> → <code>${this.content}</code></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this and all subsequent messages" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      case 'tool_error':
        return html`<div class="bubble-body"><span class="tool-icon">${unsafeHTML(ICONS.xCircle)}</span> <strong>${this.toolName}</strong> → <code>${this.content}</code></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this and all subsequent messages" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      case 'error':
        return html`<div class="bubble-body"><span class="tool-icon">${unsafeHTML(ICONS.alertTriangle)}</span> ${this.content}</div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this and all subsequent messages" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      default:
        return html`<div class="bubble-body">${this.content}</div><div class="bubble-time">${time}</div>`;
    }
  }
}

customElements.define('chat-bubble', ChatBubble);
