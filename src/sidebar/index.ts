/** Sidebar entry — thin controller wiring up all modules. */

import '../components/theme-provider';
import '../components/tab-navigator';
import '../components/tab-session-indicator';
import '../components/chat-container';
import '../components/chat-header';
import '../components/chat-input';
import '../components/status-bar';
import '../components/tool-table';
import type { ChatHeader } from '../components/chat-header';
import type { ChatInput } from '../components/chat-input';
import type { StatusBar } from '../components/status-bar';
import type { ToolTable } from '../components/tool-table';
import type { TabNavigator } from '../components/tab-navigator';
import type { TabSessionIndicator } from '../components/tab-session-indicator';
import type { CleanTool } from '../types';
import { STORAGE_KEY_LOCK_MODE, STORAGE_KEY_PLAN_MODE } from '../utils/constants';
import { ICONS } from './icons';
import * as Store from './chat-store';
import { PlanManager } from './plan-manager';
import { ConversationController } from './conversation-controller';
import '../components/security-dialog';
import type { SecurityDialog } from '../components/security-dialog';
import { resetApprovalController } from './security-dialog';
import { AIChatController } from './ai-chat-controller';
import { TabSessionAdapter } from '../adapters/tab-session-adapter';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const toolTable = $<ToolTable>('toolTable');
const statusBar = $<StatusBar>('statusBar');
const lockToggle = $<HTMLInputElement>('lockToggle');
const lockLabel = $<HTMLSpanElement>('lockLabel');
const chatContainer = $<HTMLElement>('chatContainer');
const chatHeader = $<ChatHeader>('chatHeader');
const chatInput = $<ChatInput>('chatInput');
const tabNavigator = $<TabNavigator>('tabNavigator');
const sessionIndicator = $<TabSessionIndicator>('sessionIndicator');

// Shared tab session adapter — tracks per-browser-tab context
const tabSession = new TabSessionAdapter();
tabSession.startSession();

// Configure tab navigator with tab definitions
tabNavigator.tabs = [
  { id: 'tools', label: 'Tools', icon: ICONS.wrench },
  { id: 'chat', label: 'Chat', icon: ICONS.chat },
];
tabNavigator.activeTab = 'tools';

// Tab switching via <tab-navigator> component
const tabPanels = document.querySelectorAll<HTMLDivElement>('.tab-panel');
tabNavigator.addEventListener('tab-change', ((e: CustomEvent) => {
  const target = e.detail.tab;
  tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${target}`));
}) as EventListener);

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
// Security dialog component
const securityDialogEl = $<SecurityDialog>('securityDialog');

const aiChat = new AIChatController({
  chatInput,
  chatHeader,
  getCurrentTab,
  getCurrentTools: (): CleanTool[] => currentTools,
  setCurrentTools: (t): void => { currentTools = t; },
  convCtrl, planManager,
  securityDialogEl,
  tabSession,
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

// Helper: update session indicator UI
function updateSessionIndicator(activeTabId?: number): void {
  const contexts = tabSession.getAllContexts();
  const resolvedActiveId = activeTabId
    ?? (contexts.length > 0
      ? [...contexts].sort((a, b) => b.timestamp - a.timestamp)[0].tabId
      : undefined);
  sessionIndicator.sessions = contexts.map(ctx => ({
    tabId: ctx.tabId,
    title: ctx.title,
    active: ctx.tabId === resolvedActiveId,
  }));
  sessionIndicator.sessionActive = !!tabSession.getSessionId();
}

// Initial connection
(async (): Promise<void> => {
  try {
    const tab = await getCurrentTab();
    if (!tab?.id || !isInjectableUrl(tab.url)) return;
    convCtrl.state.currentSite = Store.siteKey(tab.url!);
    tabSession.setTabContext(tab.id, { url: tab.url!, title: tab.title ?? '', extractedData: {} });
    updateSessionIndicator(tab.id);
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
    await chrome.tabs.sendMessage(tab.id, { action: 'SET_LOCK_MODE', inputArgs: { locked: lockToggle.checked } });
    convCtrl.loadConversations();
  } catch (error) {
    statusBar.message = `Initialization error: ${(error as Error).message}`;
    statusBar.type = 'error';
  }
})();

// Tab change listeners
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    currentTools = [];
    toolTable.tools = [];
    toolTable.loading = true;
    if (!convCtrl.handleSiteChange(Store.siteKey(tab.url ?? ''))) convCtrl.loadConversations();
  }
  if (changeInfo.status === 'complete' && tab.id && tab.url && isInjectableUrl(tab.url)) {
    tabSession.setTabContext(tab.id, { url: tab.url, title: tab.title ?? '', extractedData: {} });
    updateSessionIndicator(tab.id);
  }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentTools = [];
  toolTable.tools = [];
  toolTable.loading = true;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!isInjectableUrl(tab.url)) return;
    tabSession.setTabContext(activeInfo.tabId, { url: tab.url!, title: tab.title ?? '', extractedData: {} });
    updateSessionIndicator(activeInfo.tabId);
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
      // Abort any pending approval flow (from either path) before adding new listeners
      const ac = resetApprovalController();
      const { signal } = ac;

      const payload = msg as unknown as { toolName: string; description: string; tier: number };
      securityDialogEl.show({
        toolName: payload.toolName,
        securityTier: payload.tier,
        details: `This tool performs a ${payload.tier === 2 ? 'mutation' : 'navigation'} action: ${payload.description || payload.toolName}. Are you sure you want to execute it?`,
      });
      // Wire one-shot event listeners for legacy chrome.tabs messaging
      const tabId = sender.tab?.id;
      securityDialogEl.addEventListener('security-approve', () => {
        if (tabId) chrome.tabs.sendMessage(tabId, { action: 'CONFIRM_EXECUTE', toolName: payload.toolName });
      }, { once: true, signal });
      securityDialogEl.addEventListener('security-deny', () => {
        if (tabId) chrome.tabs.sendMessage(tabId, { action: 'CANCEL_EXECUTE', toolName: payload.toolName });
      }, { once: true, signal });
      return;
    }
    const tab = await getCurrentTab();
    if (sender.tab && tab?.id && sender.tab.id !== tab.id) return;
    const haveNewTools = JSON.stringify(currentTools) !== JSON.stringify(msg.tools);
    currentTools = msg.tools ?? [];
    toolTable.tools = currentTools;
    toolTable.statusMessage = msg.message ?? '';
    statusBar.message = msg.message ?? '';
    statusBar.type = 'info';
    toolTable.pageUrl = msg.url ?? tab?.url ?? '';
    toolTable.loading = false;
    if (haveNewTools) void aiChat.suggestUserPrompt();
  },
);

// Copy buttons — handled via component event
toolTable.addEventListener('copy-tools', async (e): Promise<void> => {
  const { format } = (e as CustomEvent).detail;
  await navigator.clipboard.writeText(toolTable.getClipboardText(format));
});

// Manual tool execution — handled via component event
toolTable.addEventListener('execute-tool', async (e): Promise<void> => {
  const { name, args } = (e as CustomEvent).detail;
  const tab = await getCurrentTab();
  if (!tab?.id || !name) return;
  const result = await chrome.tabs.sendMessage(tab.id, { action: 'EXECUTE_TOOL', name, inputArgs: args });
  if (result !== null) { toolTable.setToolResults(String(result)); return; }
  await waitForPageLoad(tab.id);
  toolTable.setToolResults(String(await chrome.tabs.sendMessage(tab.id, { action: 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT' })));
});

function waitForPageLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo): void => {
      if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
