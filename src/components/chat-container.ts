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
    this.editable = false;
  }

  /** Replace all messages at once (used by renderConversation / renderConversationWithActions) */
  setMessages(msgs: Message[], editable = false): void {
    this.messages = [...msgs];
    this.editable = editable;
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
    const merged = this._mergeToolPairs(this.messages);
    return html`
      ${merged.map((msg, i) => html`
        <chat-bubble
          .role=${msg.role}
          .content=${msg.content}
          .timestamp=${msg.ts ?? now}
          .toolName=${msg.tool ?? ''}
          .toolArgs=${msg.args ?? {}}
          .reasoning=${msg.reasoning ?? ''}
          .editable=${this.editable}
          .index=${msg._origIndex ?? i}
          @bubble-edit=${this._onBubbleEdit}
          @bubble-delete=${this._onBubbleDelete}
        ></chat-bubble>
      `)}
    `;
  }

  /** Merge consecutive tool_call + tool_result/tool_error into a single resolved step */
  private _mergeToolPairs(msgs: Message[]): (Message & { _origIndex?: number })[] {
    const result: (Message & { _origIndex?: number })[] = [];
    let i = 0;
    while (i < msgs.length) {
      const curr = msgs[i];
      const next = msgs[i + 1];
      if (
        curr.role === 'tool_call' &&
        next &&
        (next.role === 'tool_result' || next.role === 'tool_error') &&
        curr.tool === next.tool
      ) {
        result.push({
          ...next,
          args: curr.args,
          _origIndex: i,
        });
        i += 2;
      } else {
        result.push({ ...curr, _origIndex: i });
        i += 1;
      }
    }
    return result;
  }
}

customElements.define('chat-container', ChatContainer);
