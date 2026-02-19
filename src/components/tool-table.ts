/**
 * <tool-table> — Tool list table, copy buttons, and manual execution card.
 * Uses Light DOM so existing CSS from tools.css applies.
 */
import { html, nothing } from 'lit';
import { BaseElement } from './base-element';
import { generateTemplateFromSchema, type JsonSchema } from '../sidebar/config-builder';
import { toolsAsScriptToolConfig, toolsAsJSON } from '../sidebar/tool-list-handler';
import type { CleanTool } from '../types';

let toolTableInstanceCounter = 0;

export class ToolTable extends BaseElement {
  static properties = {
    tools: { type: Array },
    statusMessage: { type: String },
    loading: { type: Boolean },
    pageUrl: { type: String },
    prettify: { type: Boolean },
    _selectedTool: { type: String, state: true },
    _inputArgs: { type: String, state: true },
    _toolResults: { type: String, state: true },
  };

  declare tools: CleanTool[];
  declare statusMessage: string;
  declare loading: boolean;
  declare pageUrl: string;
  declare prettify: boolean;
  declare _selectedTool: string;
  declare _inputArgs: string;
  declare _toolResults: string;
  declare _instanceId: string;

  constructor() {
    super();
    this.tools = [];
    this.statusMessage = '';
    this.loading = false;
    this.pageUrl = '';
    this.prettify = false;
    this._selectedTool = '';
    this._inputArgs = '{"text": "hello world"}';
    this._toolResults = '';
    this._instanceId = `tool-table-${toolTableInstanceCounter++}`;
  }

  override createRenderRoot(): this {
    return this;
  }

  // ── Helpers ──

  private _grouped(): Map<string, CleanTool[]> {
    const grouped = new Map<string, CleanTool[]>();
    for (const item of this.tools) {
      const cat = item.category ?? 'other';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(item);
    }
    return grouped;
  }

  private _updateInputArgsFromTool(toolName: string): void {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) return;
    const schema = typeof tool.inputSchema === 'string'
      ? tool.inputSchema
      : JSON.stringify(tool.inputSchema);
    this._inputArgs = JSON.stringify(
      generateTemplateFromSchema(JSON.parse(schema) as JsonSchema),
      null,
      ' ',
    );
  }

  private _elId(name: string): string {
    return `${name}-${this._instanceId}`;
  }

  // ── Render sections ──

  private _renderStatus(): unknown {
    if (!this.statusMessage) return nothing;
    return html`<div id="status">${this.statusMessage}</div>`;
  }

  private _renderEmptyState(): unknown {
    return html`<tr><td colspan="100%"><i>${this.loading
      ? 'Finding actions you can use…'
      : `No actions found on this page yet (${this.pageUrl}).`}</i></td></tr>`;
  }

  private _renderCategoryHeader(category: string, count: number): unknown {
    return html`
      <tr class="category-group-header">
        <td colspan="4">
          <span class="category-group-name">${category}</span>
          <span class="category-group-count">${count}</span>
        </td>
      </tr>`;
  }

  private _renderNavigationSubgroups(items: CleanTool[]): unknown {
    const subGrouped = new Map<string, CleanTool[]>();
    for (const item of items) {
      const parts = item.name.split('.');
      const section = parts.length >= 3 ? parts[1] : 'page';
      if (!subGrouped.has(section)) subGrouped.set(section, []);
      subGrouped.get(section)!.push(item);
    }
    const sectionIcons: Record<string, string> = {
      header: '🔝', nav: '🧭', main: '📄', sidebar: '📌', footer: '🔻', page: '📃',
    };
    return Array.from(subGrouped).map(([section, sectionItems]) => html`
      <tr class="category-subgroup-header">
        <td colspan="4">
          <span class="subgroup-icon">${sectionIcons[section] ?? '📎'}</span>
          <span class="subgroup-name">${section}</span>
          <span class="category-group-count">${sectionItems.length}</span>
        </td>
      </tr>`);
  }

  private _renderToolRow(item: CleanTool): unknown {
    const src = item._source ?? 'unknown';
    const isAI = item._aiRefined;
    const badgeClass = isAI
      ? 'badge-ai'
      : src === 'native'
        ? 'badge-native'
        : src === 'declarative'
          ? 'badge-declarative'
          : src === 'manifest'
            ? 'badge-manifest'
            : 'badge-inferred';
    const badgeText = isAI
      ? 'AI-tuned'
      : src.charAt(0).toUpperCase() + src.slice(1);
    const sourceLabelMap: Record<string, string> = {
      native: 'Built-in',
      declarative: 'Form-based',
      inferred: 'Detected',
      manifest: 'Saved',
      unknown: 'Other',
    };
    const displayBadgeText = isAI ? badgeText : (sourceLabelMap[src] ?? badgeText);
    const conf = item.confidence ?? 1;
    const pct = Math.round(conf * 100);
    const colorClass =
      conf < 0.5 ? 'confidence-low' : conf < 0.7 ? 'confidence-med' : 'confidence-high';

    return html`
      <tr class="category-group-item">
        <td><span class="badge ${badgeClass}">${displayBadgeText}</span></td>
        <td style="font-weight:600;font-size:11px">${item.name}</td>
        <td style="font-size:11px;max-width:220px">${item.description ?? ''}</td>
        <td>
          <span class="confidence-bar">
            <span class="confidence-bar-track">
              <span class="confidence-bar-fill ${colorClass}" style="width:${pct}%"></span>
            </span>
            ${pct}%
          </span>
        </td>
      </tr>`;
  }

  private _renderTable(): unknown {
    const grouped = this._grouped();
    const hasTools = this.tools.length > 0;
    return html`
      <div class="table-container">
        <table id=${this._elId('resultsTable')}>
          <thead>
            <tr>
              ${hasTools ? html`<th>Type</th><th>Action</th><th>What it does</th><th>Match</th>` : nothing}
            </tr>
          </thead>
          <tbody class="${this.prettify ? 'prettify' : ''}" @dblclick=${this._onTogglePrettify}>
            ${!hasTools
              ? this._renderEmptyState()
              : Array.from(grouped).map(([category, items]) => html`
                  ${this._renderCategoryHeader(category, items.length)}
                  ${category === 'navigation' ? this._renderNavigationSubgroups(items) : nothing}
                  ${items.map(item => this._renderToolRow(item))}
                `)}
          </tbody>
        </table>
        ${hasTools ? html`
          <div class="copy-to-clipboard" role="group" aria-label="Action export controls">
            <button type="button" class="copy-action" @click=${this._onCopyScript}>Copy for setup</button>
            <button type="button" class="copy-action" @click=${this._onCopyJson}>Copy as data</button>
            <button type="button" class="copy-action" @click=${this._onExportManifest}>Download report</button>
          </div>` : nothing}
      </div>`;
  }

  private _renderToolOption(item: CleanTool): unknown {
    const src = item._source ?? 'unknown';
    const isAI = item._aiRefined;
    const prefix = isAI ? '🟣' : src === 'native' ? '🟢' : src === 'declarative' ? '🔵' : src === 'manifest' ? '🟠' : '🟡';
    return html`<option value=${item.name}>${prefix} ${item.name}</option>`;
  }

  private _renderManualExecution(): unknown {
    const grouped = this._grouped();
    const hasTools = this.tools.length > 0;
    const toolNamesId = this._elId('toolNames');
    const inputArgsTextId = this._elId('inputArgsText');
    const executeBtnId = this._elId('executeBtn');
    const toolResultsId = this._elId('toolResults');
    return html`
      <div class="card">
        <div class="card-title">Try an action manually</div>
        <div class="form-group">
          <label for=${toolNamesId}>Action</label>
          <select id=${toolNamesId} ?disabled=${!hasTools} @change=${this._onToolChange}>
            ${Array.from(grouped).map(([category, items]) => html`
              <optgroup label=${category}>
                ${items.map(item => this._renderToolOption(item))}
              </optgroup>`)}
          </select>
        </div>
        <div class="form-group">
          <label for=${inputArgsTextId}>Details (optional)</label>
          <textarea id=${inputArgsTextId} ?disabled=${!hasTools}
            .value=${this._inputArgs}
            @input=${this._onInputArgsChange}></textarea>
        </div>
        <div class="form-group">
          <button id=${executeBtnId} ?disabled=${!hasTools} @click=${this._onExecute}>Try action</button>
        </div>
        <pre id=${toolResultsId} class="tool-results">${this._toolResults}</pre>
      </div>`;
  }

  override render(): unknown {
    return html`
      ${this._renderStatus()}
      ${this._renderTable()}
      ${this._renderManualExecution()}
    `;
  }

  // Select first tool when tools list changes (runs before render)
  override willUpdate(changed: Map<string, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('tools') && this.tools.length > 0) {
      const firstName = this.tools[0].name;
      this._selectedTool = firstName;
      this._updateInputArgsFromTool(firstName);
    }
    if (changed.has('tools') && this.tools.length === 0) {
      this._inputArgs = '';
      this._selectedTool = '';
    }
  }

  /** Set tool results text (called from outside after execution). */
  setToolResults(text: string): void {
    this._toolResults = text;
  }

  // ── Event handlers ──

  private _onTogglePrettify(): void {
    this.prettify = !this.prettify;
  }

  private _onCopy(format: 'script' | 'json'): void {
    this.dispatchEvent(new CustomEvent('copy-tools', {
      bubbles: true,
      composed: true,
      detail: { format },
    }));
  }

  private _onCopyScript(): void {
    this._onCopy('script');
  }

  private _onCopyJson(): void {
    this._onCopy('json');
  }

  private _onExportManifest(): void {
    this.dispatchEvent(new CustomEvent('export-manifest', {
      bubbles: true,
      composed: true,
    }));
  }

  private _onToolChange(e: Event): void {
    const select = e.target as HTMLSelectElement;
    this._selectedTool = select.value;
    this._updateInputArgsFromTool(select.value);
  }

  private _onInputArgsChange(e: Event): void {
    this._inputArgs = (e.target as HTMLTextAreaElement).value;
  }

  private _onExecute(): void {
    this._toolResults = '';
    this.dispatchEvent(new CustomEvent('execute-tool', {
      bubbles: true,
      composed: true,
      detail: { name: this._selectedTool, args: this._inputArgs },
    }));
  }

  /** Get clipboard text for a given format. */
  getClipboardText(format: 'script' | 'json'): string {
    return format === 'script'
      ? toolsAsScriptToolConfig(this.tools)
      : toolsAsJSON(this.tools);
  }
}

customElements.define('tool-table', ToolTable);
