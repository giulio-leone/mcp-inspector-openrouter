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
  '--bg': '#f5f6f8',
  '--bg-card': '#ffffff',
  '--bg-elevated': '#f1f3f5',
  '--text': '#1a1d23',
  '--text-secondary': '#5f6b7a',
  '--text-muted': '#6b7280',
  '--border': '#dfe3e8',
  '--border-light': '#e7ebf0',
  '--success': '#10b981',
  '--success-soft': 'rgba(16, 185, 129, 0.1)',
  '--error': '#ef4444',
  '--error-soft': 'rgba(239, 68, 68, 0.1)',
  '--warning': '#f59e0b',
  '--warning-soft': 'rgba(245, 158, 11, 0.1)',
  '--shadow-xs': '0 1px 2px rgba(16,24,40,0.06)',
  '--shadow': '0 1px 2px rgba(16,24,40,0.08)',
  '--shadow-md': '0 6px 16px rgba(16,24,40,0.1)',
  '--shadow-lg': '0 10px 24px rgba(16,24,40,0.14)',
  '--glass-bg': 'rgba(255, 255, 255, 0.72)',
  '--glass-border': 'rgba(255, 255, 255, 0.5)',
  '--glass-blur': '12px',
  '--glass-shadow': '0 4px 16px rgba(37, 99, 235, 0.06), 0 1px 3px rgba(0,0,0,0.04)',
};

const darkTokens: Record<string, string> = {
  '--primary': '#2563eb',
  '--primary-hover': '#1d4ed8',
  '--primary-soft': 'rgba(59, 130, 246, 0.12)',
  '--primary-glow': 'rgba(59, 130, 246, 0.2)',
  '--bg': '#111318',
  '--bg-card': '#1a1f27',
  '--bg-elevated': '#232a34',
  '--text': '#e9edf3',
  '--text-secondary': '#b0b8c6',
  '--text-muted': '#9aa5b5',
  '--border': '#2c3440',
  '--border-light': '#323b48',
  '--success': '#34d399',
  '--success-soft': 'rgba(52, 211, 153, 0.15)',
  '--error': '#f87171',
  '--error-soft': 'rgba(248, 113, 113, 0.15)',
  '--warning': '#fbbf24',
  '--warning-soft': 'rgba(251, 191, 36, 0.15)',
  '--shadow-xs': '0 1px 2px rgba(0,0,0,0.24)',
  '--shadow': '0 1px 2px rgba(0,0,0,0.32)',
  '--shadow-md': '0 8px 20px rgba(0,0,0,0.38)',
  '--shadow-lg': '0 14px 28px rgba(0,0,0,0.45)',
  '--glass-bg': 'rgba(25, 25, 35, 0.75)',
  '--glass-border': 'rgba(255, 255, 255, 0.08)',
  '--glass-blur': '12px',
  '--glass-shadow': '0 4px 16px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0,0,0,0.15)',
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
