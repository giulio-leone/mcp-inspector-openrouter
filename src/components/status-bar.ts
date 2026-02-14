/**
 * <status-bar> — Displays a status message with type-based styling.
 * Uses Light DOM so existing CSS from styles.css applies.
 */
import { html, nothing } from 'lit';
import { BaseElement } from './base-element';

export class StatusBar extends BaseElement {
  static properties = {
    message: { type: String },
    type: { type: String },
  };

  declare message: string;
  declare type: 'info' | 'success' | 'error' | 'warning';

  constructor() {
    super();
    this.message = '';
    this.type = 'info';
  }

  override createRenderRoot(): this {
    return this;
  }

  override render(): unknown {
    if (!this.message) return nothing;
    return html`<div class="status-bar status-bar--${this.type}">${this.message}</div>`;
  }
}

customElements.define('status-bar', StatusBar);
