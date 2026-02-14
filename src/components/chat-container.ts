/**
 * <chat-container> — Manages a list of chat message bubbles.
 * Uses Light DOM so existing chat.css styles apply.
 */
import { html } from 'lit';
import { BaseElement } from './base-element';
import type { Message } from '../types';

import './chat-bubble';

export class ChatContainer extends BaseElement {
  static properties = {
    messages: { type: Array },
    editable: { type: Boolean },
  };

  declare messages: Message[];
  declare editable: boolean;

  constructor() {
    super();
    this.messages = [];
    this.editable = false;
  }

  /** Light DOM — inherits chat.css styles */
  override createRenderRoot(): this {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('chat-container');
  }

  /** Append a single message and scroll to bottom */
  async appendMessage(msg: Message): Promise<void> {
    this.messages = [...this.messages, msg];
    await this.updateComplete;
    this.scrollToBottom();
  }

  /** Remove all messages */
  clear(): void {
    this.messages = [];
  }

  /** Scroll to the bottom of this container */
  scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.scrollTop = this.scrollHeight;
    });
  }

  private _onBubbleEdit(e: Event): void {
    const detail = (e as CustomEvent).detail as { index: number; content: string };
    this.dispatchEvent(new CustomEvent('message-edit', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  private _onBubbleDelete(e: Event): void {
    const detail = (e as CustomEvent).detail as { index: number };
    this.dispatchEvent(new CustomEvent('message-delete', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  protected override render(): unknown {
    const now = Date.now();
    return html`
      ${this.messages.map((msg, i) => html`
        <chat-bubble
          .role=${msg.role}
          .content=${msg.content}
          .timestamp=${msg.ts ?? now}
          .toolName=${msg.tool ?? ''}
          .toolArgs=${msg.args ?? {}}
          .reasoning=${msg.reasoning ?? ''}
          .editable=${this.editable}
          .index=${i}
          @bubble-edit=${this._onBubbleEdit}
          @bubble-delete=${this._onBubbleDelete}
        ></chat-bubble>
      `)}
    `;
  }
}

customElements.define('chat-container', ChatContainer);
