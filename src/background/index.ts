/**
 * Background service worker (Manifest V3).
 * Handles: side panel setup, content script injection, badge updates, AI classification bridge.
 */

import type {
  AIClassifyMessage,
  AIClassifyResponse,
  AIResponse,
  CleanTool,
} from '../types';
import {
  CONTENT_SCRIPTS,
  OPENROUTER_CHAT_ENDPOINT,
  DEFAULT_CLASSIFIER_MODEL,
  AI_CLASSIFIER_TITLE,
  STORAGE_KEY_API_KEY,
} from '../utils/constants';
import { ChromeStorageAdapter } from '../services/adapters';

const storage = new ChromeStorageAdapter();

// ── Side Panel ──

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── Content Script Injection ──

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id == null) continue;
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: [...CONTENT_SCRIPTS] })
      .catch(() => { /* tab not scriptable (e.g. chrome://) */ });
  }
});

// ── Badge Update ──

const BADGE_COLOR = '#2563eb';

async function updateBadge(tabId: number): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== tabId) return;

  chrome.action.setBadgeText({ text: '', tabId });
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });

  chrome.tabs.sendMessage(tabId, { action: 'LIST_TOOLS' }).catch(() => {
    // Content script not ready — ignore silently
  });
}

chrome.tabs.onActivated.addListener(({ tabId }) => updateBadge(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') updateBadge(tabId);
});

// ── AI Classification Bridge ──

async function handleAIClassify(msg: AIClassifyMessage): Promise<AIClassifyResponse> {
  const apiKey = await storage.get<string>(STORAGE_KEY_API_KEY);
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured. Set it in the sidebar settings.');
  }

  const response = await fetch(OPENROUTER_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': AI_CLASSIFIER_TITLE,
    },
    body: JSON.stringify({
      model: msg.model || DEFAULT_CLASSIFIER_MODEL,
      messages: [{ role: 'user', content: msg.prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = (await response.json()) as AIResponse;
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : '';
  return { text };
}

// ── Message Listener ──

interface ToolsBroadcast {
  readonly tools: readonly CleanTool[];
}

function isToolsBroadcast(msg: unknown): msg is ToolsBroadcast {
  return typeof msg === 'object' && msg !== null && 'tools' in msg;
}

function isAIClassifyMessage(msg: unknown): msg is AIClassifyMessage {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).action === 'AI_CLASSIFY';
}

function isCaptureScreenshotMessage(msg: unknown): boolean {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).action === 'CAPTURE_SCREENSHOT';
}

chrome.runtime.onMessage.addListener(
  (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void): boolean | undefined => {
    // Badge update from content script
    if (isToolsBroadcast(msg) && sender.tab?.id != null) {
      const text = msg.tools.length ? `${msg.tools.length}` : '';
      chrome.action.setBadgeText({ text, tabId: sender.tab.id });
      return false;
    }

    // AI Classification request
    if (isAIClassifyMessage(msg)) {
      handleAIClassify(msg)
        .then(sendResponse)
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true; // async response
    }

    // Screenshot capture (requires activeTab permission)
    if (isCaptureScreenshotMessage(msg)) {
      chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 70 })
        .then(dataUrl => sendResponse({ screenshot: dataUrl }))
        .catch(err => sendResponse({ error: (err as Error).message }));
      return true; // async response
    }

    return undefined;
  },
);
