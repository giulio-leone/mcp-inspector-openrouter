/**
 * <reasoning-accordion> — Collapsible accordion for AI reasoning/thinking content.
 * Uses Light DOM to inherit existing chat.css styles.
 */
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from './base-element';
import { ICONS } from '../sidebar/icons';

export class ReasoningAccordion extends BaseElement {
  static properties = {
    content: { type: String },
  };

  declare content: string;

  constructor() {
    super();
    this.content = '';
  }

  /** Light DOM — inherits chat.css styles */
  override createRenderRoot(): this {
    return this;
  }

  protected override render(): unknown {
    return html`
      <details class="reasoning-accordion">
        <summary class="reasoning-summary">${unsafeHTML(ICONS.brain)} <span>How I worked this out</span></summary>
        <div class="reasoning-body">${this.content}</div>
      </details>
    `;
  }
}

customElements.define('reasoning-accordion', ReasoningAccordion);
