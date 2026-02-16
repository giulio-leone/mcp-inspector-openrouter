/**
 * ThemeProvider — <theme-provider> Web Component.
 * Manages dark/light/auto theme with CSS custom properties.
 * Auto-detect respects prefers-color-scheme.
 * Persists preference in chrome.storage.local.
 */
import { LitElement, html, css } from 'lit';

type Theme = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'wmcp_theme';

const lightTokens: Record<string, string> = {
  '--primary': '#2563eb',
  '--primary-hover': '#1d4ed8',
  '--primary-soft': 'rgba(37, 99, 235, 0.08)',
  '--primary-glow': 'rgba(37, 99, 235, 0.15)',
  '--bg': '#f8f9fb',
  '--bg-card': '#ffffff',
  '--bg-elevated': '#f1f3f5',
  '--text': '#1a1d23',
  '--text-secondary': '#5f6b7a',
  '--text-muted': '#6b7280',
  '--border': '#e2e5ea',
  '--border-light': '#edf0f3',
  '--success': '#10b981',
  '--success-soft': 'rgba(16, 185, 129, 0.1)',
  '--error': '#ef4444',
  '--error-soft': 'rgba(239, 68, 68, 0.1)',
  '--warning': '#f59e0b',
  '--warning-soft': 'rgba(245, 158, 11, 0.1)',
  '--shadow-xs': '0 1px 2px rgba(0,0,0,0.04)',
  '--shadow': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  '--shadow-md': '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
  '--shadow-lg': '0 8px 24px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)',
};

const darkTokens: Record<string, string> = {
  '--primary': '#3b82f6',
  '--primary-hover': '#2563eb',
  '--primary-soft': 'rgba(59, 130, 246, 0.12)',
  '--primary-glow': 'rgba(59, 130, 246, 0.2)',
  '--bg': '#0f1117',
  '--bg-card': '#1a1d23',
  '--bg-elevated': '#252830',
  '--text': '#e5e7eb',
  '--text-secondary': '#9ca3af',
  '--text-muted': '#9ca3af',
  '--border': '#2d3139',
  '--border-light': '#252830',
  '--success': '#34d399',
  '--success-soft': 'rgba(52, 211, 153, 0.15)',
  '--error': '#f87171',
  '--error-soft': 'rgba(248, 113, 113, 0.15)',
  '--warning': '#fbbf24',
  '--warning-soft': 'rgba(251, 191, 36, 0.15)',
  '--shadow-xs': '0 1px 2px rgba(0,0,0,0.2)',
  '--shadow': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
  '--shadow-md': '0 4px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
  '--shadow-lg': '0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)',
};

export class ThemeProvider extends LitElement {
  static properties = {
    theme: { type: String, reflect: true },
  };

  declare theme: Theme;
  private mediaQuery: MediaQueryList | null = null;
  private mediaHandler = () => this.applyTheme();

  constructor() {
    super();
    this.theme = 'auto';
  }

  static styles = css`
    :host {
      display: contents;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', this.mediaHandler);
    this.loadSavedTheme();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.mediaQuery?.removeEventListener('change', this.mediaHandler);
  }

  private async loadSavedTheme(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY];
      if (stored === 'light' || stored === 'dark' || stored === 'auto') {
        this.theme = stored;
      }
    } catch {
      // Not in extension context — use auto
    }
    this.applyTheme();
  }

  async setTheme(newTheme: Theme): Promise<void> {
    this.theme = newTheme;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: newTheme });
    } catch {
      // Not in extension context
    }
    this.applyTheme();
  }

  private getResolvedTheme(): 'light' | 'dark' {
    if (this.theme === 'auto') {
      return this.mediaQuery?.matches ? 'dark' : 'light';
    }
    return this.theme;
  }

  applyTheme(): void {
    const resolved = this.getResolvedTheme();
    const tokens = resolved === 'dark' ? darkTokens : lightTokens;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value);
    }
    root.setAttribute('data-theme', resolved);
  }

  protected render(): unknown {
    return html`<slot></slot>`;
  }
}

customElements.define('theme-provider', ThemeProvider);
