/**
 * <chat-header> — Conversation selector toolbar + API key hint banner.
 * Uses Light DOM so existing CSS targets (.chat-header, .icon-btn, etc.) apply.
 */
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from './base-element';
import { ICONS } from '../sidebar/icons';
import type { ConversationSummary } from '../types';

export class ChatHeader extends BaseElement {
  static properties = {
    conversations: { type: Array },
    activeConversationId: { type: String },
    planActive: { type: Boolean },
    showApiKeyHint: { type: Boolean },
  };

  declare conversations: ConversationSummary[];
  declare activeConversationId: string;
  declare planActive: boolean;
  declare showApiKeyHint: boolean;

  constructor() {
    super();
    this.conversations = [];
    this.activeConversationId = '';
    this.planActive = false;
    this.showApiKeyHint = false;
  }

  /** Light DOM — inherits existing CSS */
  override createRenderRoot(): this {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('chat-header-wrapper');
  }

  /** Update the dropdown options and active selection. */
  setConversations(conversations: ConversationSummary[], activeId: string | null): void {
    this.conversations = conversations;
    this.activeConversationId = activeId ?? '';
  }

  /** Show or hide the API key hint banner. */
  setApiKeyHint(show: boolean): void {
    this.showApiKeyHint = show;
  }

  /** Sync the <select> value after Lit re-renders to avoid stale selectedIndex. */
  override updated(): void {
    const sel = this.querySelector('select');
    if (sel && this.activeConversationId) {
      sel.value = this.activeConversationId;
    }
  }

  // ── Render ──

  private _renderToolbar(): unknown {
    return html`
      <div class="chat-header">
        <select @change=${this._onConversationChange}>
          ${this.conversations.length === 0
            ? html`<option disabled selected value="">No chats yet</option>`
            : nothing}
          ${this.conversations.map(c => html`
            <option value=${c.id} ?selected=${c.id === this.activeConversationId}>${c.title}</option>
          `)}
        </select>
        <button class="icon-btn" title="Start new chat" @click=${this._onNewChat}>＋</button>
        <button class="icon-btn danger" title="Delete this chat" @click=${this._onDeleteChat}>🗑</button>
        <button class="plan-mode-toggle icon-btn ${this.planActive ? 'active' : ''}"
          title="Guided mode" @click=${this._onTogglePlan}>
          ${unsafeHTML(ICONS.clipboard)} Guided mode
        </button>
      </div>
    `;
  }

  override render(): unknown {
    return html`
      ${this.showApiKeyHint
        ? html`<div class="api-key-hint">
            ⚠️ Setup needed before you can chat.
            <a href="#" @click=${this._onOpenOptions}>Open settings</a> to finish setup.
          </div>`
        : nothing}
      ${this._renderToolbar()}
    `;
  }

  // ── Private handlers ──

  private _onConversationChange(e: Event): void {
    if (this.conversations.length === 0) return;
    const select = e.target as HTMLSelectElement;
    this.dispatchEvent(new CustomEvent('conversation-change', {
      bubbles: true,
      composed: true,
      detail: { conversationId: select.value },
    }));
  }

  private _onNewChat(): void {
    this.dispatchEvent(new CustomEvent('new-conversation', {
      bubbles: true,
      composed: true,
    }));
  }

  private _onDeleteChat(): void {
    this.dispatchEvent(new CustomEvent('delete-conversation', {
      bubbles: true,
      composed: true,
    }));
  }

  private _onTogglePlan(): void {
    this.planActive = !this.planActive;
    this.dispatchEvent(new CustomEvent('toggle-plan', {
      bubbles: true,
      composed: true,
      detail: { active: this.planActive },
    }));
  }

  private _onOpenOptions(e: Event): void {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('open-options', {
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('chat-header', ChatHeader);
