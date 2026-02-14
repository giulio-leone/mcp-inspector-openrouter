/**
 * <tab-session-indicator> — Shows active browser tab session info.
 * Displays session count badge and current tab title in the sidebar.
 * Uses Light DOM so existing CSS from styles.css applies.
 */
import { html, nothing } from 'lit';
import { BaseElement } from './base-element';

export interface SessionInfo {
  tabId: number;
  title: string;
  active: boolean;
}

export class TabSessionIndicator extends BaseElement {
  static properties = {
    sessions: { type: Array },
    sessionActive: { type: Boolean, attribute: 'session-active' },
  };

  declare sessions: SessionInfo[];
  declare sessionActive: boolean;

  constructor() {
    super();
    this.sessions = [];
    this.sessionActive = false;
  }

  override createRenderRoot(): this {
    return this;
  }

  get activeSession(): SessionInfo | undefined {
    return this.sessions.find(s => s.active);
  }

  get sessionCount(): number {
    return this.sessions.length;
  }

  override render(): unknown {
    if (!this.sessionActive || this.sessions.length === 0) return nothing;

    const active = this.activeSession;
    const title = active?.title ?? 'Unknown tab';
    const truncated = title.length > 30 ? title.slice(0, 27) + '…' : title;

    return html`
      <div class="session-indicator">
        <span class="session-indicator__badge">${this.sessionCount}</span>
        <span class="session-indicator__label" title="${title}">${truncated}</span>
      </div>
    `;
  }
}

customElements.define('tab-session-indicator', TabSessionIndicator);
