/**
 * <tab-navigator> — Light DOM Lit component for sidebar tab switching.
 * Renders tab buttons with active state and dispatches `tab-change` events.
 */
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from './base-element';

export interface TabConfig {
  id: string;
  label: string;
  icon: string;
}

export class TabNavigator extends BaseElement {
  static properties = {
    activeTab: { type: String },
    tabs: { type: Array },
  };

  declare activeTab: string;
  declare tabs: TabConfig[];

  constructor() {
    super();
    this.activeTab = 'chat';
    this.tabs = [];
  }

  /** Light DOM — inherits existing CSS */
  override createRenderRoot(): this {
    return this;
  }

  override render(): unknown {
    return html`
      <nav class="tab-bar">
        ${this.tabs.map(tab => html`
          <button
            class="tab-btn ${tab.id === this.activeTab ? 'active' : ''}"
            data-tab="${tab.id}"
            @click=${() => this._onTabClick(tab.id)}
          ><span class="tab-icon">${this._renderIcon(tab.icon)}</span> ${tab.label}</button>
        `)}
      </nav>
    `;
  }

  /** Validate icon string starts with '<svg' before using unsafeHTML. */
  private _renderIcon(iconSvg: string): unknown {
    if (iconSvg && iconSvg.trimStart().toLowerCase().startsWith('<svg')) {
      return unsafeHTML(iconSvg);
    }
    return nothing;
  }

  private _onTabClick(tabId: string): void {
    this.activeTab = tabId;
    this.dispatchEvent(new CustomEvent('tab-change', {
      bubbles: true,
      composed: true,
      detail: { tab: tabId },
    }));
  }
}

customElements.define('tab-navigator', TabNavigator);
