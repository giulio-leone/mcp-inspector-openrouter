/**
 * <tool-table> — Tool list table, copy buttons, and manual execution card.
 * Uses Light DOM so existing CSS from tools.css applies.
 */
import { html, nothing } from 'lit';
import { BaseElement } from './base-element';
import { generateTemplateFromSchema, type JsonSchema } from '../sidebar/config-builder';
import { toolsAsScriptToolConfig, toolsAsJSON } from '../sidebar/tool-list-handler';
import type { CleanTool } from '../types';

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

  // ── Render sections ──

  private _renderStatus(): unknown {
    if (!this.statusMessage) return nothing;
    return html`<div id="status">${this.statusMessage}</div>`;
  }

  private _renderEmptyState(): unknown {
    return html`<tr><td colspan="100%"><i>${this.loading
      ? 'Loading tools...'
      : `No tools registered yet in ${this.pageUrl}`}</i></td></tr>`;
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
      ? 'AI'
      : src.charAt(0).toUpperCase() + src.slice(1);
    const conf = item.confidence ?? 1;
    const pct = Math.round(conf * 100);
    const colorClass =
      conf < 0.5 ? 'confidence-low' : conf < 0.7 ? 'confidence-med' : 'confidence-high';

    return html`
      <tr class="category-group-item">
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
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
        <table id="resultsTable">
          <thead>
            <tr>
              ${hasTools ? html`<th>Source</th><th>Name</th><th>Description</th><th>Confidence</th>` : nothing}
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
          <div id="copyToClipboard">
            <span @click=${() => this._onCopy('script')}>📝 Copy as ScriptToolConfig</span>
            <span @click=${() => this._onCopy('json')}>📝 Copy as JSON</span>
            <span @click=${this._onExportManifest}>📦 Export Manifest Archive</span>
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
    return html`
      <div class="card">
        <div class="card-title">Manual Tool Execution</div>
        <div class="form-group">
          <label for="toolNames">Tool</label>
          <select id="toolNames" ?disabled=${!hasTools} @change=${this._onToolChange}>
            ${Array.from(grouped).map(([category, items]) => html`
              <optgroup label=${category}>
                ${items.map(item => this._renderToolOption(item))}
              </optgroup>`)}
          </select>
        </div>
        <div class="form-group">
          <label for="inputArgsText">Input Arguments</label>
          <textarea id="inputArgsText" ?disabled=${!hasTools}
            .value=${this._inputArgs}
            @input=${this._onInputArgsChange}></textarea>
        </div>
        <div class="form-group">
          <button id="executeBtn" ?disabled=${!hasTools} @click=${this._onExecute}>Execute Tool</button>
        </div>
        <pre id="toolResults">${this._toolResults}</pre>
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
