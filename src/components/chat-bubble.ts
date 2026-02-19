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
      return html`<div class="bubble-body"><textarea class="bubble-edit-input" .value=${this.content} rows=${rows}></textarea><div class="bubble-edit-btns"><button class="bubble-edit-save" @click=${this._saveEdit}>${unsafeHTML(ICONS.check)} Save changes</button><button class="bubble-edit-cancel" @click=${this._cancelEdit}>${unsafeHTML(ICONS.x)} Discard changes</button></div></div><div class="bubble-time">${time}</div>`;
    }

    switch (this.role) {
      case 'user':
        return html`<div class="bubble-body">${this.content}</div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Edit your message" @click=${this._startEdit}>${unsafeHTML(ICONS.edit)}</button><button class="bubble-action-btn" title="Delete this message and everything after it" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      case 'ai':
        if (this.reasoning && this.content) {
          return html`<div class="bubble-body"><reasoning-accordion .content=${this.reasoning}></reasoning-accordion><div>${unsafeHTML(formatAIText(this.content))}</div></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this message and everything after it" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;
        }
        if (this.reasoning && !this.content) {
          return html`<div class="bubble-body"><reasoning-accordion .content=${this.reasoning}></reasoning-accordion><div class="reasoning-notice">${unsafeHTML(ICONS.alertTriangle)} I used my full response on thinking steps. Please review "How I worked this out" above.</div></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this message and everything after it" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;
        }
        return html`<div class="bubble-body"><div>${unsafeHTML(formatAIText(this.content))}</div></div><div class="bubble-time">${time}</div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this message and everything after it" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      case 'tool_call': {
        const ac = this._describeAction();
        return html`<div class="action-step action-step--running"><div class="action-step-icon action-step-icon--running">${unsafeHTML(ICONS.refresh)}</div><div class="action-step-info"><span class="action-step-label">${ac.label}</span>${ac.detail ? html`<span class="action-step-detail">${ac.detail}</span>` : nothing}</div><span class="action-step-time">${time}</span></div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this message and everything after it" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;
      }

      case 'tool_result': {
        const rc = this._describeResult();
        return html`<div class="action-step action-step--done"><div class="action-step-icon action-step-icon--done">${unsafeHTML(ICONS.checkCircle)}</div><div class="action-step-info"><span class="action-step-label">${rc.label}</span>${rc.detail ? html`<span class="action-step-detail">${rc.detail}</span>` : nothing}</div><span class="action-step-time">${time}</span></div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this message and everything after it" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;
      }

      case 'tool_error': {
        return html`<div class="action-step action-step--error"><div class="action-step-icon action-step-icon--error">${unsafeHTML(ICONS.xCircle)}</div><div class="action-step-info"><span class="action-step-label">${this.toolName ? this._friendlyName(this.toolName) + ' failed' : 'Action failed'}</span><span class="action-step-detail">${this.content}</span></div><span class="action-step-time">${time}</span></div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this message and everything after it" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;
      }

      case 'error':
        return html`<div class="action-step action-step--error"><div class="action-step-icon action-step-icon--error">${unsafeHTML(ICONS.alertTriangle)}</div><div class="action-step-info"><span class="action-step-label">Something went wrong</span><span class="action-step-detail">${this.content}</span></div><span class="action-step-time">${time}</span></div>${this.editable ? html`<div class="bubble-actions"><button class="bubble-action-btn" title="Delete this message and everything after it" @click=${this._handleDelete}>${unsafeHTML(ICONS.trash)}</button></div>` : nothing}`;

      default:
        return html`<div class="bubble-body">${this.content}</div><div class="bubble-time">${time}</div>`;
    }
  }

  // ── Action humanization helpers ──

  private _friendlyName(toolName: string): string {
    const verb = toolName.split(/[._-]/).pop() || toolName;
    const map: Record<string, string> = {
      tab: 'Open page', click: 'Click', submit: 'Submit form',
      fill: 'Fill field', scroll: 'Scroll', navigate: 'Navigate',
      type: 'Type text', select: 'Select', hover: 'Hover',
      extract: 'Extract data', search: 'Search', close: 'Close',
      top: 'Scroll to top', bottom: 'Scroll to bottom',
      down: 'Scroll down', up: 'Scroll up',
    };
    return map[verb] || toolName.replace(/[._-]/g, ' ');
  }

  private _describeAction(): { label: string; detail: string } {
    const label = this._friendlyName(this.toolName || '');
    let detail = '';
    try {
      const args = this.toolArgs ?? {};
      if (typeof args.url === 'string') {
        try { const u = new URL(args.url); detail = u.hostname + u.pathname; }
        catch { detail = String(args.url).substring(0, 60); }
      } else if (typeof args.text === 'string') { detail = args.text.substring(0, 60);
      } else if (typeof args.selector === 'string') { detail = args.selector.substring(0, 60);
      } else if (typeof args.query === 'string') { detail = args.query.substring(0, 60);
      }
    } catch { /* ignore */ }
    return { label, detail };
  }

  private _describeResult(): { label: string; detail: string } {
    const name = this.toolName || '';
    const verb = name.split(/[._-]/).pop() || name;
    const doneMap: Record<string, string> = {
      tab: 'Page opened', click: 'Clicked', submit: 'Submitted',
      fill: 'Filled', scroll: 'Scrolled', navigate: 'Navigated',
      type: 'Typed', select: 'Selected', extract: 'Extracted',
      search: 'Searched', close: 'Closed',
      top: 'Scrolled to top', bottom: 'Scrolled to bottom',
      down: 'Scrolled down', up: 'Scrolled up',
    };
    const label = doneMap[verb] || `${this._friendlyName(name)} done`;
    let detail = '';
    // Try extracting context from original args (merged from tool_call)
    const args = this.toolArgs ?? {};
    if (typeof args.url === 'string') {
      try { const u = new URL(args.url as string); detail = u.hostname + u.pathname; }
      catch { detail = String(args.url).substring(0, 60); }
    } else if (typeof args.text === 'string') { detail = (args.text as string).substring(0, 60);
    } else if (typeof args.selector === 'string') { detail = (args.selector as string).substring(0, 60);
    } else if (typeof args.query === 'string') { detail = (args.query as string).substring(0, 60);
    }
    // Fallback to content if no args detail
    if (!detail) {
      try {
        const parsed = JSON.parse(this.content);
        if (typeof parsed.message === 'string') detail = parsed.message.substring(0, 80);
        else if (parsed.success === true) detail = 'Completed';
        else if (parsed.success === false) detail = 'Failed';
      } catch { detail = (this.content || '').substring(0, 80); }
    }
    return { label, detail };
  }
}

customElements.define('chat-bubble', ChatBubble);
