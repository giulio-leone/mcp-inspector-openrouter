/**
 * <manifest-dashboard> — MCP manifest viewer for the sidebar.
 *
 * Lit 3.3.2 component (NON-decorator, Light DOM) showing:
 * - Current site origin, tool count, page count, last updated
 * - Expandable tool list with name, description, inputSchema preview
 * - Filter/search by tool name
 * - "Copy JSON" and "Refresh" buttons
 */

import { html, nothing } from 'lit';
import { BaseElement } from './base-element';

interface ManifestMeta {
  origin: string;
  version: number;
  generatedAt: number;
  pageCount: number;
  toolCount: number;
}

interface ManifestToolEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
}

interface ParsedManifest {
  tools: ManifestToolEntry[];
  _meta?: ManifestMeta;
}

export class ManifestDashboard extends BaseElement {
  static properties = {
    manifestJson: { type: String },
    loading: { type: Boolean },
    error: { type: String },
    _filter: { type: String, state: true },
    _expandedTools: { type: Object, state: true },
    _copyFeedback: { type: Boolean, state: true },
  };

  declare manifestJson: string;
  declare loading: boolean;
  declare error: string;
  declare _filter: string;
  declare _expandedTools: Set<string>;
  declare _copyFeedback: boolean;

  constructor() {
    super();
    this.manifestJson = '';
    this.loading = false;
    this.error = '';
    this._filter = '';
    this._expandedTools = new Set();
    this._copyFeedback = false;
  }

  override createRenderRoot(): this {
    return this;
  }

  private _parsed(): ParsedManifest | null {
    if (!this.manifestJson) return null;
    try {
      return JSON.parse(this.manifestJson) as ParsedManifest;
    } catch {
      return null;
    }
  }

  private _filteredTools(manifest: ParsedManifest): ManifestToolEntry[] {
    if (!this._filter) return manifest.tools;
    const q = this._filter.toLowerCase();
    return manifest.tools.filter(
      t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }

  private _formatTime(ts: number): string {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleTimeString();
  }

  override render(): unknown {
    if (this.loading) {
      return html`<div class="manifest-dashboard"><p class="manifest-loading">Scanning this page…</p></div>`;
    }

    if (this.error) {
      return html`<div class="manifest-dashboard"><p class="manifest-error">${this.error}</p></div>`;
    }

    const manifest = this._parsed();
    if (!manifest) {
      return html`<div class="manifest-dashboard"><p class="manifest-empty">No page action report yet. Click Scan again.</p></div>`;
    }

    const meta = manifest._meta;
    const tools = this._filteredTools(manifest);

    return html`
      <div class="manifest-dashboard">
        ${meta ? html`
          <div class="manifest-meta">
            <div class="manifest-meta-row"><strong>Website:</strong> <span>${meta.origin}</span></div>
            <div class="manifest-meta-row"><strong>Actions:</strong> <span>${meta.toolCount}</span></div>
            <div class="manifest-meta-row"><strong>Pages found:</strong> <span>${meta.pageCount}</span></div>
            <div class="manifest-meta-row"><strong>Last scan:</strong> <span>${this._formatTime(meta.generatedAt)}</span></div>
            <div class="manifest-meta-row"><strong>Report version:</strong> <span>${meta.version}</span></div>
          </div>
        ` : nothing}

        <div class="manifest-actions">
          <button class="manifest-btn" @click=${this._onCopy}>
            ${this._copyFeedback ? 'Copied' : 'Copy report'}
          </button>
          <button class="manifest-btn" @click=${this._onRefresh}>Scan again</button>
        </div>

        <div class="manifest-search">
          <input
            type="text"
            class="manifest-search-input"
            placeholder="Search actions…"
            .value=${this._filter}
            @input=${this._onFilterChange}
          />
        </div>

        ${tools.length === 0
          ? html`<p class="manifest-empty">No actions match "${this._filter}"</p>`
          : html`
            <div class="manifest-tool-list">
              ${tools.map(t => this._renderTool(t))}
            </div>
          `}
      </div>
    `;
  }

  private _renderTool(tool: ManifestToolEntry): unknown {
    const expanded = this._expandedTools.has(tool.name);
    return html`
      <div class="manifest-tool-item">
        <div class="manifest-tool-header" @click=${() => this._toggleTool(tool.name)}>
          <span class="manifest-tool-chevron">${expanded ? '▼' : '▶'}</span>
          <span class="manifest-tool-name">${tool.name}</span>
        </div>
        ${expanded ? html`
          <div class="manifest-tool-detail">
            <p class="manifest-tool-desc">${tool.description}</p>
            ${tool.inputSchema ? html`
              <pre class="manifest-schema-preview">${JSON.stringify(tool.inputSchema, null, 2)}</pre>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _toggleTool(name: string): void {
    const next = new Set(this._expandedTools);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this._expandedTools = next;
  }

  private _onFilterChange(e: Event): void {
    this._filter = (e.target as HTMLInputElement).value;
  }

  private _onCopy(): void {
    this.dispatchEvent(new CustomEvent('copy-manifest', { bubbles: true, composed: true }));
    this._copyFeedback = true;
    setTimeout(() => { this._copyFeedback = false; }, 1500);
  }

  private _onRefresh(): void {
    this.dispatchEvent(new CustomEvent('refresh-manifest', { bubbles: true, composed: true }));
  }
}

customElements.define('manifest-dashboard', ManifestDashboard);
