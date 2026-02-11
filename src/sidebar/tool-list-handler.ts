/**
 * Tool list handler — renders discovered tools in the Tools tab table and select dropdown.
 */

import type { CleanTool } from '../types';
import { generateTemplateFromSchema, type JsonSchema } from './config-builder';

export interface ToolListDomRefs {
  statusDiv: HTMLDivElement;
  tbody: HTMLTableSectionElement;
  thead: HTMLTableRowElement;
  toolNames: HTMLSelectElement;
  inputArgsText: HTMLTextAreaElement;
  executeBtn: HTMLButtonElement;
  copyToClipboard: HTMLDivElement;
}

/**
 * Render tool list into the Tools tab DOM elements.
 */
export function renderToolList(
  refs: ToolListDomRefs,
  tools: CleanTool[],
  message?: string,
  url?: string,
): void {
  const { statusDiv, tbody, thead, toolNames, inputArgsText, executeBtn, copyToClipboard } = refs;

  tbody.innerHTML = '';
  thead.innerHTML = '';
  toolNames.innerHTML = '';
  statusDiv.textContent = message ?? '';
  statusDiv.hidden = !message;

  if (!tools || tools.length === 0) {
    tbody.innerHTML = `<tr><td colspan="100%"><i>No tools registered yet in ${url ?? ''}</i></td></tr>`;
    inputArgsText.value = '';
    inputArgsText.disabled = true;
    toolNames.disabled = true;
    executeBtn.disabled = true;
    copyToClipboard.hidden = true;
    return;
  }

  inputArgsText.disabled = false;
  toolNames.disabled = false;
  executeBtn.disabled = false;
  copyToClipboard.hidden = false;

  for (const label of ['Source', 'Name', 'Description', 'Confidence']) {
    const th = document.createElement('th');
    th.textContent = label;
    thead.appendChild(th);
  }

  const grouped = new Map<string, CleanTool[]>();
  for (const item of tools) {
    const cat = item.category ?? 'other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  for (const [category, items] of grouped) {
    renderCategoryHeader(tbody, category, items.length);

    if (category === 'navigation') {
      renderNavigationSubgroups(tbody, items);
    }

    const optgroup = document.createElement('optgroup');
    optgroup.label = category;

    for (const item of items) {
      renderToolRow(tbody, item);
      optgroup.appendChild(createToolOption(item));
    }

    toolNames.appendChild(optgroup);
  }

  updateDefaultValueForInputArgs(toolNames, inputArgsText);
}

function renderCategoryHeader(tbody: HTMLTableSectionElement, category: string, count: number): void {
  const headerRow = document.createElement('tr');
  headerRow.className = 'category-group-header';
  const headerCell = document.createElement('td');
  headerCell.colSpan = 4;
  headerCell.innerHTML = `<span class="category-group-name">${category}</span> <span class="category-group-count">${count}</span>`;
  headerRow.appendChild(headerCell);
  tbody.appendChild(headerRow);
}

function renderNavigationSubgroups(tbody: HTMLTableSectionElement, items: CleanTool[]): void {
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
  for (const [section, sectionItems] of subGrouped) {
    const subHeaderRow = document.createElement('tr');
    subHeaderRow.className = 'category-subgroup-header';
    const subHeaderCell = document.createElement('td');
    subHeaderCell.colSpan = 4;
    subHeaderCell.innerHTML = `<span class="subgroup-icon">${sectionIcons[section] ?? '📎'}</span> <span class="subgroup-name">${section}</span> <span class="category-group-count">${sectionItems.length}</span>`;
    subHeaderRow.appendChild(subHeaderCell);
    tbody.appendChild(subHeaderRow);
  }
}

function renderToolRow(tbody: HTMLTableSectionElement, item: CleanTool): void {
  const row = document.createElement('tr');
  row.className = 'category-group-item';

  const tdSource = document.createElement('td');
  const src = item._source ?? 'unknown';
  const isAI = item._aiRefined;
  const badgeClass = isAI
    ? 'badge-ai'
    : src === 'native'
      ? 'badge-native'
      : src === 'declarative'
        ? 'badge-declarative'
        : 'badge-inferred';
  const badgeText = isAI
    ? 'AI'
    : src.charAt(0).toUpperCase() + src.slice(1);
  tdSource.innerHTML = `<span class="badge ${badgeClass}">${badgeText}</span>`;
  row.appendChild(tdSource);

  const tdName = document.createElement('td');
  tdName.textContent = item.name;
  tdName.style.fontWeight = '600';
  tdName.style.fontSize = '11px';
  row.appendChild(tdName);

  const tdDesc = document.createElement('td');
  tdDesc.textContent = item.description ?? '';
  tdDesc.style.fontSize = '11px';
  tdDesc.style.maxWidth = '220px';
  row.appendChild(tdDesc);

  const tdConf = document.createElement('td');
  const conf = item.confidence ?? 1;
  const pct = Math.round(conf * 100);
  const colorClass =
    conf < 0.5 ? 'confidence-low' : conf < 0.7 ? 'confidence-med' : 'confidence-high';
  tdConf.innerHTML = `
    <span class="confidence-bar">
      <span class="confidence-bar-track">
        <span class="confidence-bar-fill ${colorClass}" style="width:${pct}%"></span>
      </span>
      ${pct}%
    </span>`;
  row.appendChild(tdConf);
  tbody.appendChild(row);
}

function createToolOption(item: CleanTool): HTMLOptionElement {
  const option = document.createElement('option');
  const src = item._source ?? 'unknown';
  const isAI = item._aiRefined;
  const prefix = isAI
    ? '🟣'
    : src === 'native'
      ? '🟢'
      : src === 'declarative'
        ? '🔵'
        : '🟡';
  option.textContent = `${prefix} ${item.name}`;
  option.value = item.name;
  option.dataset.inputSchema =
    typeof item.inputSchema === 'string'
      ? item.inputSchema
      : JSON.stringify(item.inputSchema);
  return option;
}

/**
 * Update the input args textarea based on selected tool's schema.
 */
export function updateDefaultValueForInputArgs(
  toolNames: HTMLSelectElement,
  inputArgsText: HTMLTextAreaElement,
): void {
  const selected = toolNames.selectedOptions[0];
  if (!selected) return;
  const inputSchema = selected.dataset.inputSchema ?? '{}';
  inputArgsText.value = JSON.stringify(
    generateTemplateFromSchema(JSON.parse(inputSchema) as JsonSchema),
    null,
    ' ',
  );
}

/**
 * Generate copy-to-clipboard text formats.
 */
export function toolsAsScriptToolConfig(tools: CleanTool[]): string {
  return tools
    .map(
      (t) =>
        `{ name: ${JSON.stringify(t.name)}, description: ${JSON.stringify(t.description)}, inputSchema: ${typeof t.inputSchema === 'string' ? t.inputSchema : JSON.stringify(t.inputSchema)} }`,
    )
    .join(',\n');
}

export function toolsAsJSON(tools: CleanTool[]): string {
  return JSON.stringify(tools, null, 2);
}
