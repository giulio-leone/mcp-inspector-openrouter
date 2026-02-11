/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Allows users to open the side panel by clicking the action icon.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Inject content script in all tabs first.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const contentScripts = [
    'wmcp-inference-engine.js',
    'wmcp-tool-executor.js',
    'wmcp-merge.js',
    'wmcp-ai-classifier.js',
    'content.js'
  ];
  tabs.forEach(({ id: tabId }) => {
    chrome.scripting
      .executeScript({
        target: { tabId },
        files: contentScripts,
      })
      .catch(() => { });
  });
});

// Update badge text with the number of tools per tab.
chrome.tabs.onActivated.addListener(({ tabId }) => updateBadge(tabId));
chrome.tabs.onUpdated.addListener((tabId) => updateBadge(tabId));

async function updateBadge(tabId) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.id !== tabId) return;
  chrome.action.setBadgeText({ text: '', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  chrome.tabs.sendMessage(tabId, { action: 'LIST_TOOLS' }).catch(({ message }) => {
    chrome.runtime.sendMessage({ message });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Badge update from content script
  if (msg.tools && sender.tab) {
    const text = msg.tools.length ? `${msg.tools.length}` : '';
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    return false;
  }

  // AI Classification request from content script
  if (msg.action === 'AI_CLASSIFY') {
    handleAIClassify(msg).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // async response
  }
});

/**
 * Handle AI classification requests from the content script.
 * Retrieves the API key from chrome.storage.local and calls OpenRouter.
 */
async function handleAIClassify({ model, prompt }) {
  // Try to get API key from storage (synced by sidebar)
  const { openrouter_api_key } = await chrome.storage.local.get('openrouter_api_key');
  if (!openrouter_api_key) {
    throw new Error('OpenRouter API key not configured. Set it in the sidebar settings.');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouter_api_key}`,
      'Content-Type': 'application/json',
      'X-Title': 'WMCP AI Classifier'
    },
    body: JSON.stringify({
      model: model || 'google/gemini-2.0-flash-lite-001',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return { text: data.choices?.[0]?.message?.content || '' };
}
