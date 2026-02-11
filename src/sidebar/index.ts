/**
 * Sidebar entry — thin controller wiring up all modules.
 */

import type {
  CleanTool,
  PageContext,
  ScreenshotResponse,
  ContentPart,
} from '../types';
import { OpenRouterAdapter, OpenRouterChat } from '../services/adapters';
import {
  STORAGE_KEY_LOCK_MODE,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_MODEL,
  STORAGE_KEY_SCREENSHOT_ENABLED,
  DEFAULT_MODEL,
} from '../utils/constants';
import * as Store from './chat-store';
import { buildChatConfig, generateTemplateFromSchema, type JsonSchema } from './config-builder';
import { PlanManager } from './plan-manager';
import { executeToolLoop } from './tool-loop';
import { ConversationController } from './conversation-controller';

// ── DOM refs ──

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const statusDiv = $<HTMLDivElement>('status');
const tbody = $<HTMLTableSectionElement>('tableBody');
const thead = $<HTMLTableRowElement>('tableHeaderRow');
const copyToClipboard = $<HTMLDivElement>('copyToClipboard');
const copyAsScriptToolConfig = $<HTMLSpanElement>('copyAsScriptToolConfig');
const copyAsJSON = $<HTMLSpanElement>('copyAsJSON');
const toolNames = $<HTMLSelectElement>('toolNames');
const inputArgsText = $<HTMLTextAreaElement>('inputArgsText');
const executeBtn = $<HTMLButtonElement>('executeBtn');
const toolResults = $<HTMLPreElement>('toolResults');
const userPromptText = $<HTMLTextAreaElement>('userPromptText');
const promptBtn = $<HTMLButtonElement>('promptBtn');
const traceBtn = $<HTMLButtonElement>('traceBtn');
const lockToggle = $<HTMLInputElement>('lockToggle');
const lockLabel = $<HTMLSpanElement>('lockLabel');
const conversationSelect = $<HTMLSelectElement>('conversationSelect');
const newChatBtn = $<HTMLButtonElement>('newChatBtn');
const deleteChatBtn = $<HTMLButtonElement>('deleteChatBtn');
const securityDialog = $<HTMLDialogElement>('securityDialog');
const dialogToolName = $<HTMLSpanElement>('dialogToolName');
const dialogDesc = $<HTMLParagraphElement>('dialogDesc');
const dialogCancel = $<HTMLButtonElement>('dialogCancel');
const dialogConfirm = $<HTMLButtonElement>('dialogConfirm');
const chatContainer = $<HTMLDivElement>('chatContainer');
const apiKeyHint = $<HTMLDivElement>('apiKeyHint');
const openOptionsLink = $<HTMLAnchorElement>('openOptionsLink');
const planToggle = $<HTMLButtonElement>('plan-toggle');

// ── Tab switching ──

const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
const tabPanels = document.querySelectorAll<HTMLDivElement>('.tab-panel');

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    tabPanels.forEach((p) =>
      p.classList.toggle('active', p.id === `tab-${target}`),
    );
  });
});

openOptionsLink.onclick = (e: Event): void => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

// ── State ──

let currentTools: CleanTool[] = [];
let genAI: OpenRouterAdapter | undefined;

const planManager = new PlanManager(planToggle, chatContainer);

const convCtrl = new ConversationController(chatContainer, conversationSelect, {
  currentSite: '',
  currentConvId: null,
  chat: undefined,
  trace: [],
});

// ── Helpers ──

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'PING' });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  }
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Lock mode ──

const savedLock = localStorage.getItem(STORAGE_KEY_LOCK_MODE) === 'true';
lockToggle.checked = savedLock;
updateLockUI(savedLock);

function updateLockUI(locked: boolean): void {
  lockLabel.textContent = locked ? '🔒 Locked' : '🔓 Live';
  lockLabel.className = locked ? 'lock-label locked' : 'lock-label live';
}

lockToggle.onchange = async (): Promise<void> => {
  const locked = lockToggle.checked;
  localStorage.setItem(STORAGE_KEY_LOCK_MODE, String(locked));
  updateLockUI(locked);
  try {
    const tab = await getCurrentTab();
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'SET_LOCK_MODE',
        inputArgs: { locked },
      });
    }
  } catch {
    /* tab may not be ready */
  }
};

// ── Conversation wiring ──

newChatBtn.onclick = (): void => convCtrl.createNewConversation();
deleteChatBtn.onclick = (): void => convCtrl.deleteConversation();
conversationSelect.onchange = (): void => convCtrl.onSelectChange();

// ── Initial connection ──

(async (): Promise<void> => {
  try {
    const tab = await getCurrentTab();
    if (!tab?.id || !tab.url) return;
    convCtrl.state.currentSite = Store.siteKey(tab.url);
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
    const locked = lockToggle.checked;
    await chrome.tabs.sendMessage(tab.id, {
      action: 'SET_LOCK_MODE',
      inputArgs: { locked },
    });
    convCtrl.loadConversations();
  } catch (error) {
    statusDiv.textContent = `Initialization error: ${(error as Error).message}`;
    statusDiv.hidden = false;
  }
})();

// ── Tab change listeners ──

chrome.tabs.onUpdated.addListener(
  async (
    _tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab,
  ): Promise<void> => {
    if (changeInfo.status !== 'loading') return;
    const newSite = Store.siteKey(tab.url ?? '');

    currentTools = [];
    tbody.innerHTML =
      '<tr><td colspan="100%"><i>Refreshing...</i></td></tr>';
    toolNames.innerHTML = '';

    const sameSite = convCtrl.handleSiteChange(newSite);
    if (!sameSite) {
      convCtrl.loadConversations();
    }
  },
);

chrome.tabs.onActivated.addListener(
  async (activeInfo: chrome.tabs.TabActiveInfo): Promise<void> => {
    currentTools = [];
    tbody.innerHTML =
      '<tr><td colspan="100%"><i>Switched tab, refreshing tools...</i></td></tr>';
    toolNames.innerHTML = '';
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      const newSite = Store.siteKey(tab.url ?? '');

      const sameSite = convCtrl.handleSiteChange(newSite);

      await ensureContentScript(activeInfo.tabId);
      await chrome.tabs.sendMessage(activeInfo.tabId, {
        action: 'LIST_TOOLS',
      });
      const locked = lockToggle.checked;
      await chrome.tabs.sendMessage(activeInfo.tabId, {
        action: 'SET_LOCK_MODE',
        inputArgs: { locked },
      });

      if (!sameSite) {
        convCtrl.loadConversations();
      }
    } catch {
      /* tab may not be ready */
    }
  },
);

// ── Tool list handling ──

let userPromptPendingId = 0;
let lastSuggestedUserPrompt = '';

interface ToolBroadcast {
  message?: string;
  tools?: CleanTool[];
  url?: string;
}

chrome.runtime.onMessage.addListener(
  async (
    msg: ToolBroadcast & { action?: string },
    sender: chrome.runtime.MessageSender,
  ): Promise<void> => {
    if (msg.action === 'CONFIRM_EXECUTION') {
      handleConfirmExecution(
        msg as unknown as {
          toolName: string;
          description: string;
          tier: number;
        },
        sender,
      );
      return;
    }

    const tab = await getCurrentTab();
    if (sender.tab && tab?.id && sender.tab.id !== tab.id) return;

    const { message, tools, url } = msg;

    tbody.innerHTML = '';
    thead.innerHTML = '';
    toolNames.innerHTML = '';
    statusDiv.textContent = message ?? '';
    statusDiv.hidden = !message;

    const haveNewTools =
      JSON.stringify(currentTools) !== JSON.stringify(tools);
    currentTools = tools ?? [];

    if (!tools || tools.length === 0) {
      tbody.innerHTML = `<tr><td colspan="100%"><i>No tools registered yet in ${url ?? tab?.url ?? ''}</i></td></tr>`;
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
      const headerRow = document.createElement('tr');
      headerRow.className = 'category-group-header';
      const headerCell = document.createElement('td');
      headerCell.colSpan = 4;
      headerCell.innerHTML = `<span class="category-group-name">${category}</span> <span class="category-group-count">${items.length}</span>`;
      headerRow.appendChild(headerCell);
      tbody.appendChild(headerRow);

      if (category === 'navigation') {
        const subGrouped = new Map<string, CleanTool[]>();
        for (const item of items) {
          const parts = item.name.split('.');
          const section = parts.length >= 3 ? parts[1] : 'page';
          if (!subGrouped.has(section)) subGrouped.set(section, []);
          subGrouped.get(section)!.push(item);
        }
        const sectionIcons: Record<string, string> = {
          header: '🔝', nav: '��', main: '📄', sidebar: '📌', footer: '🔻', page: '📃',
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

      const optgroup = document.createElement('optgroup');
      optgroup.label = category;

      for (const item of items) {
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
          conf < 0.5
            ? 'confidence-low'
            : conf < 0.7
              ? 'confidence-med'
              : 'confidence-high';
        tdConf.innerHTML = `
          <span class="confidence-bar">
            <span class="confidence-bar-track">
              <span class="confidence-bar-fill ${colorClass}" style="width:${pct}%"></span>
            </span>
            ${pct}%
          </span>`;
        row.appendChild(tdConf);
        tbody.appendChild(row);

        const option = document.createElement('option');
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
        optgroup.appendChild(option);
      }

      toolNames.appendChild(optgroup);
    }

    updateDefaultValueForInputArgs();
    if (haveNewTools) suggestUserPrompt();
  },
);

tbody.ondblclick = (): void => {
  tbody.classList.toggle('prettify');
};

// ── Copy buttons ──

copyAsScriptToolConfig.onclick = async (): Promise<void> => {
  const text = currentTools
    .map(
      (tool) =>
        `script_tools {\n  name: "${tool.name}"\n  description: "${tool.description}"\n  input_schema: ${JSON.stringify(typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema || { type: 'object', properties: {} })}\n}`,
    )
    .join('\r\n');
  await navigator.clipboard.writeText(text);
};

copyAsJSON.onclick = async (): Promise<void> => {
  const tools = currentTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema:
      typeof tool.inputSchema === 'string'
        ? JSON.parse(tool.inputSchema)
        : tool.inputSchema || { type: 'object', properties: {} },
  }));
  await navigator.clipboard.writeText(JSON.stringify(tools, null, '  '));
};

// ── AI init ──

async function initGenAI(): Promise<void> {
  const result = await chrome.storage.local.get([
    STORAGE_KEY_API_KEY,
    STORAGE_KEY_MODEL,
  ]);
  let savedApiKey = (result[STORAGE_KEY_API_KEY] as string) ?? '';
  const savedModel =
    (result[STORAGE_KEY_MODEL] as string) ?? DEFAULT_MODEL;

  if (!savedApiKey) {
    try {
      const res = await fetch('./.env.json');
      if (res.ok) {
        const env = (await res.json()) as { apiKey?: string; model?: string };
        if (env?.apiKey) {
          savedApiKey = env.apiKey;
          await chrome.storage.local.set({
            [STORAGE_KEY_API_KEY]: savedApiKey,
            [STORAGE_KEY_MODEL]: env.model ?? savedModel,
          });
        }
      }
    } catch {
      /* no env file */
    }
  }

  if (savedApiKey) {
    genAI = new OpenRouterAdapter({
      apiKey: savedApiKey,
      model: savedModel,
    });
    promptBtn.disabled = false;
    apiKeyHint.style.display = 'none';
  } else {
    genAI = undefined;
    promptBtn.disabled = true;
    apiKeyHint.style.display = '';
  }
}

void initGenAI();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[STORAGE_KEY_API_KEY] || changes[STORAGE_KEY_MODEL])) {
    convCtrl.state.chat = undefined;
    void initGenAI();
  }
});

// ── User prompt suggestion ──

async function suggestUserPrompt(): Promise<void> {
  if (
    currentTools.length === 0 ||
    !genAI ||
    userPromptText.value !== lastSuggestedUserPrompt
  )
    return;

  const userPromptId = ++userPromptPendingId;
  const response = await genAI.sendMessage([
    {
      role: 'user',
      content: [
        '**Context:**',
        `Today's date is: ${getFormattedDate()}`,
        '**Task:** Generate one natural user query for the tools below. Output the query text only.',
        '**Tools:**',
        JSON.stringify(currentTools),
      ].join('\n'),
    },
  ]);

  if (
    userPromptId !== userPromptPendingId ||
    userPromptText.value !== lastSuggestedUserPrompt
  )
    return;

  const rawContent = response.choices?.[0]?.message?.content;
  const text = typeof rawContent === 'string' ? rawContent : (rawContent ?? '').toString();
  lastSuggestedUserPrompt = text;
  userPromptText.value = '';
  for (const chunk of text) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    userPromptText.value += chunk;
  }
}

// ── AI Prompt ──

userPromptText.onkeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    promptBtn.click();
  }
};

promptBtn.onclick = async (): Promise<void> => {
  try {
    await promptAI();
  } catch (error) {
    convCtrl.state.trace.push({ error });
    convCtrl.addAndRender('error', `⚠️ Error: "${error}"`);
  }
};

async function promptAI(): Promise<void> {
  const tab = await getCurrentTab();
  if (!tab?.id) return;
  convCtrl.ensureConversation();

  let chat = convCtrl.state.chat as OpenRouterChat | undefined;
  if (!chat) {
    const result = await chrome.storage.local.get([STORAGE_KEY_API_KEY, STORAGE_KEY_MODEL]);
    const apiKey = (result[STORAGE_KEY_API_KEY] as string) ?? '';
    const model = (result[STORAGE_KEY_MODEL] as string) ?? DEFAULT_MODEL;
    chat = new OpenRouterChat(apiKey, model);
    convCtrl.state.chat = chat;
    if (convCtrl.state.currentConvId && convCtrl.state.currentSite) {
      const msgs = Store.getMessages(convCtrl.state.currentSite, convCtrl.state.currentConvId);
      for (const m of msgs) {
        if (m.role === 'user') {
          chat.history.push({ role: 'user', content: m.content });
        } else if (m.role === 'ai') {
          chat.history.push({ role: 'assistant', content: m.content });
        }
      }
    }
  }

  const message = userPromptText.value;
  userPromptText.value = '';
  lastSuggestedUserPrompt = '';

  convCtrl.addAndRender('user', message);

  let pageContext: PageContext | null = null;
  try {
    pageContext = (await chrome.tabs.sendMessage(tab.id, {
      action: 'GET_PAGE_CONTEXT',
    })) as PageContext;
  } catch (e) {
    console.warn('[Sidebar] Could not fetch page context:', e);
  }

  const config = buildChatConfig(pageContext, currentTools, planManager.planModeEnabled);
  convCtrl.state.trace.push({ userPrompt: { message, config } });

  let screenshotDataUrl: string | undefined;
  try {
    const screenshotSettings = await chrome.storage.local.get([STORAGE_KEY_SCREENSHOT_ENABLED]);
    if (screenshotSettings[STORAGE_KEY_SCREENSHOT_ENABLED]) {
      const res = (await chrome.runtime.sendMessage({ action: 'CAPTURE_SCREENSHOT' })) as ScreenshotResponse;
      if (res?.screenshot) {
        screenshotDataUrl = res.screenshot;
      }
    }
  } catch (e) {
    console.warn('[Sidebar] Screenshot capture failed:', e);
  }

  const userMessage: string | ContentPart[] =
    screenshotDataUrl
      ? [
          { type: 'text' as const, text: message },
          { type: 'image_url' as const, image_url: { url: screenshotDataUrl } },
        ]
      : message;

  chat.trimHistory(20);

  const initialResult = await chat.sendMessage({
    message: userMessage,
    config,
  });

  const loopResult = await executeToolLoop({
    chat,
    tabId: tab.id,
    initialResult,
    pageContext,
    currentTools,
    planManager,
    trace: convCtrl.state.trace,
    addMessage: (role, content, meta) => convCtrl.addAndRender(role, content, meta),
    getConfig: (ctx) => buildChatConfig(ctx, currentTools, planManager.planModeEnabled),
    onToolsUpdated: (tools) => { currentTools = tools; },
  });

  currentTools = loopResult.currentTools;
}

traceBtn.onclick = async (): Promise<void> => {
  await navigator.clipboard.writeText(JSON.stringify(convCtrl.state.trace, null, ' '));
};

// ── Manual tool execution ──

executeBtn.onclick = async (): Promise<void> => {
  toolResults.textContent = '';
  const tab = await getCurrentTab();
  if (!tab?.id) return;
  const name = toolNames.selectedOptions[0]?.value;
  if (!name) return;
  const inputArgs = inputArgsText.value;
  const result = await chrome.tabs.sendMessage(tab.id, {
    action: 'EXECUTE_TOOL',
    name,
    inputArgs,
  });
  if (result !== null) {
    toolResults.textContent = String(result);
    return;
  }
  await waitForPageLoad(tab.id);
  toolResults.textContent = String(
    await chrome.tabs.sendMessage(tab.id, {
      action: 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT',
    }),
  );
};

toolNames.onchange = updateDefaultValueForInputArgs;

function updateDefaultValueForInputArgs(): void {
  const selected = toolNames.selectedOptions[0];
  if (!selected) return;
  const inputSchema = selected.dataset.inputSchema ?? '{}';
  inputArgsText.value = JSON.stringify(
    generateTemplateFromSchema(JSON.parse(inputSchema) as JsonSchema),
    null,
    ' ',
  );
}

function waitForPageLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ): void => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── Security confirmation dialog ──

let _pendingConfirm: {
  tabId: number | undefined;
  toolName: string;
} | null = null;

function handleConfirmExecution(
  msg: { toolName: string; description: string; tier: number },
  sender: chrome.runtime.MessageSender,
): void {
  dialogToolName.textContent = msg.toolName;
  dialogDesc.textContent = `This tool performs a ${msg.tier === 2 ? 'mutation' : 'navigation'} action: ${msg.description || msg.toolName}. Are you sure you want to execute it?`;
  _pendingConfirm = { tabId: sender.tab?.id, toolName: msg.toolName };
  securityDialog.showModal();
}

dialogCancel.onclick = (): void => {
  securityDialog.close();
  if (_pendingConfirm?.tabId) {
    chrome.tabs.sendMessage(_pendingConfirm.tabId, {
      action: 'CANCEL_EXECUTE',
      toolName: _pendingConfirm.toolName,
    });
  }
  _pendingConfirm = null;
};

dialogConfirm.onclick = (): void => {
  securityDialog.close();
  if (_pendingConfirm?.tabId) {
    chrome.tabs.sendMessage(_pendingConfirm.tabId, {
      action: 'CONFIRM_EXECUTE',
      toolName: _pendingConfirm.toolName,
    });
  }
  _pendingConfirm = null;
};
