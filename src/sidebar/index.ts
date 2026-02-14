/** Sidebar entry — thin controller wiring up all modules. */

import '../components/theme-provider';
import '../components/chat-container';
import '../components/chat-header';
import '../components/chat-input';
import type { ChatHeader } from '../components/chat-header';
import type { ChatInput } from '../components/chat-input';
import type { CleanTool } from '../types';
import { STORAGE_KEY_LOCK_MODE, STORAGE_KEY_PLAN_MODE } from '../utils/constants';
import { ICONS } from './icons';
import * as Store from './chat-store';
import { PlanManager } from './plan-manager';
import { ConversationController } from './conversation-controller';
import { renderToolList, updateDefaultValueForInputArgs, toolsAsScriptToolConfig, toolsAsJSON, type ToolListDomRefs } from './tool-list-handler';
import { initSecurityDialog, handleConfirmExecution, type SecurityDialogRefs } from './security-dialog';
import { AIChatController } from './ai-chat-controller';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const statusDiv = $<HTMLDivElement>('status');
const tbody = $<HTMLTableSectionElement>('tableBody');
const thead = $<HTMLTableRowElement>('tableHeaderRow');
const copyToClipboard = $<HTMLDivElement>('copyToClipboard');
const toolNames = $<HTMLSelectElement>('toolNames');
const inputArgsText = $<HTMLTextAreaElement>('inputArgsText');
const executeBtn = $<HTMLButtonElement>('executeBtn');
const toolResults = $<HTMLPreElement>('toolResults');
const lockToggle = $<HTMLInputElement>('lockToggle');
const lockLabel = $<HTMLSpanElement>('lockLabel');
const chatContainer = $<HTMLElement>('chatContainer');
const chatHeader = $<ChatHeader>('chatHeader');
const chatInput = $<ChatInput>('chatInput');

// Tab switching
const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
const tabPanels = document.querySelectorAll<HTMLDivElement>('.tab-panel');
tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${target}`));
  });
});

// Set SVG icons for tab buttons
const iconTools = document.getElementById('icon-tools');
const iconChat = document.getElementById('icon-chat');
if (iconTools) iconTools.innerHTML = ICONS.wrench;
if (iconChat) iconChat.innerHTML = ICONS.chat;

// State
let currentTools: CleanTool[] = [];

// Consolidated plan mode initialization — single storage read
const planManager = new PlanManager(chatContainer);
chrome.storage.local.get([STORAGE_KEY_PLAN_MODE]).then((result) => {
  const enabled = result[STORAGE_KEY_PLAN_MODE] === true;
  planManager.planModeEnabled = enabled;
  chatHeader.planActive = enabled;
});

const convCtrl = new ConversationController(chatContainer, chatHeader, {
  currentSite: '', currentConvId: null, chat: undefined, trace: [],
});

// Helpers
function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

async function ensureContentScript(tabId: number): Promise<void> {
  try { await chrome.tabs.sendMessage(tabId, { action: 'PING' }); }
  catch { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); }
}
async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Lock mode
const savedLock = localStorage.getItem(STORAGE_KEY_LOCK_MODE) === 'true';
lockToggle.checked = savedLock;
updateLockUI(savedLock);
function updateLockUI(locked: boolean): void {
  lockLabel.innerHTML = locked ? `${ICONS.lock} Locked` : `${ICONS.unlock} Live`;
  lockLabel.className = locked ? 'lock-label locked' : 'lock-label live';
}
lockToggle.onchange = async (): Promise<void> => {
  const locked = lockToggle.checked;
  localStorage.setItem(STORAGE_KEY_LOCK_MODE, String(locked));
  updateLockUI(locked);
  try {
    const tab = await getCurrentTab();
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { action: 'SET_LOCK_MODE', inputArgs: { locked } });
  } catch { /* tab may not be ready */ }
};

// Conversation wiring via <chat-header> events
chatHeader.addEventListener('conversation-change', ((e: CustomEvent) => {
  const convId = e.detail.conversationId;
  if (convId && convId !== convCtrl.state.currentConvId) {
    convCtrl.switchToConversation(convId);
  }
}) as EventListener);
chatHeader.addEventListener('new-conversation', () => convCtrl.createNewConversation());
chatHeader.addEventListener('delete-conversation', () => convCtrl.deleteConversation());
chatHeader.addEventListener('toggle-plan', ((e: CustomEvent) => {
  planManager.planModeEnabled = e.detail.active;
  chrome.storage.local.set({ [STORAGE_KEY_PLAN_MODE]: planManager.planModeEnabled });
}) as EventListener);
chatHeader.addEventListener('open-options', () => chrome.runtime.openOptionsPage());

// AI chat controller
const securityDialogRefs: SecurityDialogRefs = {
  dialog: $<HTMLDialogElement>('securityDialog'),
  toolName: $<HTMLSpanElement>('dialogToolName'),
  desc: $<HTMLParagraphElement>('dialogDesc'),
  cancelBtn: $<HTMLButtonElement>('dialogCancel'),
  confirmBtn: $<HTMLButtonElement>('dialogConfirm'),
};
initSecurityDialog(securityDialogRefs);

const aiChat = new AIChatController({
  chatInput,
  chatHeader,
  getCurrentTab,
  getCurrentTools: (): CleanTool[] => currentTools,
  setCurrentTools: (t): void => { currentTools = t; },
  convCtrl, planManager,
  securityDialogRefs,
});
void aiChat.init();
void chatInput.updateComplete.then(() => {
  aiChat.setupListeners();
});
chatInput.addEventListener('copy-trace', async (): Promise<void> => {
  await navigator.clipboard.writeText(JSON.stringify(convCtrl.state.trace, null, ' '));
});

// Debug log download
import { logger } from './debug-logger';
chatInput.addEventListener('download-debug-log', (): void => {
  logger.download();
});

// Module DOM refs
const toolListRefs: ToolListDomRefs = { statusDiv, tbody, thead, toolNames, inputArgsText, executeBtn, copyToClipboard };

// Initial connection
(async (): Promise<void> => {
  try {
    const tab = await getCurrentTab();
    if (!tab?.id || !isInjectableUrl(tab.url)) return;
    convCtrl.state.currentSite = Store.siteKey(tab.url!);
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
    await chrome.tabs.sendMessage(tab.id, { action: 'SET_LOCK_MODE', inputArgs: { locked: lockToggle.checked } });
    convCtrl.loadConversations();
  } catch (error) {
    statusDiv.textContent = `Initialization error: ${(error as Error).message}`;
    statusDiv.hidden = false;
  }
})();

// Tab change listeners
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return;
  currentTools = [];
  tbody.innerHTML = '<tr><td colspan="100%"><i>Refreshing...</i></td></tr>';
  toolNames.innerHTML = '';
  if (!convCtrl.handleSiteChange(Store.siteKey(tab.url ?? ''))) convCtrl.loadConversations();
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentTools = [];
  tbody.innerHTML = '<tr><td colspan="100%"><i>Switched tab, refreshing tools...</i></td></tr>';
  toolNames.innerHTML = '';
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!isInjectableUrl(tab.url)) return;
    const sameSite = convCtrl.handleSiteChange(Store.siteKey(tab.url ?? ''));
    await ensureContentScript(activeInfo.tabId);
    await chrome.tabs.sendMessage(activeInfo.tabId, { action: 'LIST_TOOLS' });
    await chrome.tabs.sendMessage(activeInfo.tabId, { action: 'SET_LOCK_MODE', inputArgs: { locked: lockToggle.checked } });
    if (!sameSite) convCtrl.loadConversations();
  } catch { /* tab may not be ready */ }
});

// Tool list message handler
interface ToolBroadcast { message?: string; tools?: CleanTool[]; url?: string }
chrome.runtime.onMessage.addListener(
  async (msg: ToolBroadcast & { action?: string }, sender): Promise<void> => {
    if (msg.action === 'CONFIRM_EXECUTION') {
      handleConfirmExecution(securityDialogRefs, msg as unknown as { toolName: string; description: string; tier: number }, sender);
      return;
    }
    const tab = await getCurrentTab();
    if (sender.tab && tab?.id && sender.tab.id !== tab.id) return;
    const haveNewTools = JSON.stringify(currentTools) !== JSON.stringify(msg.tools);
    currentTools = msg.tools ?? [];
    renderToolList(toolListRefs, currentTools, msg.message, msg.url ?? tab?.url);
    if (haveNewTools) void aiChat.suggestUserPrompt();
  },
);
tbody.ondblclick = (): void => { tbody.classList.toggle('prettify'); };

// Copy buttons
$<HTMLSpanElement>('copyAsScriptToolConfig').onclick = async (): Promise<void> => {
  await navigator.clipboard.writeText(toolsAsScriptToolConfig(currentTools));
};
$<HTMLSpanElement>('copyAsJSON').onclick = async (): Promise<void> => {
  await navigator.clipboard.writeText(toolsAsJSON(currentTools));
};

// Manual tool execution
toolNames.onchange = (): void => updateDefaultValueForInputArgs(toolNames, inputArgsText);
executeBtn.onclick = async (): Promise<void> => {
  toolResults.textContent = '';
  const tab = await getCurrentTab();
  if (!tab?.id) return;
  const name = toolNames.selectedOptions[0]?.value;
  if (!name) return;
  const result = await chrome.tabs.sendMessage(tab.id, { action: 'EXECUTE_TOOL', name, inputArgs: inputArgsText.value });
  if (result !== null) { toolResults.textContent = String(result); return; }
  await waitForPageLoad(tab.id);
  toolResults.textContent = String(await chrome.tabs.sendMessage(tab.id, { action: 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT' }));
};

function waitForPageLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo): void => {
      if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
