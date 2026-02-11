/**
 * Options page controller.
 * Manages API key, model selection, and connection testing.
 */

import { OpenRouterAdapter } from '../services/adapters';
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_MODEL,
  DEFAULT_MODEL,
} from '../utils/constants';

// ── DOM refs ──

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const apiKeyInput = $<HTMLInputElement>('apiKey');
const saveTestBtn = $<HTMLButtonElement>('saveTestBtn');
const connectionStatus = $<HTMLDivElement>('connectionStatus');
const modelSelect = $<HTMLInputElement>('modelSelect');
const modelList = $<HTMLDataListElement>('modelList');
const versionLabel = $<HTMLSpanElement>('versionLabel');

// ── Load saved settings ──

async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get([
    STORAGE_KEY_API_KEY,
    STORAGE_KEY_MODEL,
  ]);
  const savedKey = (result[STORAGE_KEY_API_KEY] as string) ?? '';
  const savedModel =
    (result[STORAGE_KEY_MODEL] as string) ?? DEFAULT_MODEL;

  if (savedKey) apiKeyInput.value = savedKey;
  modelSelect.value = savedModel;

  // Load version from manifest
  const manifest = chrome.runtime.getManifest();
  versionLabel.textContent = manifest.version;

  // If we have a key, try to populate models
  if (savedKey) {
    void populateModels(savedKey);
  }
}

// ── Populate model datalist ──

async function populateModels(apiKey: string): Promise<void> {
  try {
    const adapter = new OpenRouterAdapter({ apiKey });
    const models = await adapter.listModels();
    modelList.innerHTML = '';
    for (const model of models) {
      const option = document.createElement('option');
      option.value = model.id;
      modelList.appendChild(option);
    }
  } catch {
    /* silently fail — models will use defaults */
  }
}

// ── Save & Test ──

saveTestBtn.onclick = async (): Promise<void> => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value.trim() || DEFAULT_MODEL;

  if (!apiKey) {
    connectionStatus.textContent = '❌ Please enter an API key';
    connectionStatus.className = 'status-message status-error';
    return;
  }

  connectionStatus.textContent = '⏳ Testing connection...';
  connectionStatus.className = 'status-message';
  saveTestBtn.disabled = true;

  try {
    const testAdapter = new OpenRouterAdapter({ apiKey });
    const models = await testAdapter.listModels();

    await chrome.storage.local.set({
      [STORAGE_KEY_API_KEY]: apiKey,
      [STORAGE_KEY_MODEL]: model,
    });

    // Also update localStorage for backward compatibility
    localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
    localStorage.setItem(STORAGE_KEY_MODEL, model);

    // Populate model datalist with fetched models
    modelList.innerHTML = '';
    for (const m of models) {
      const option = document.createElement('option');
      option.value = m.id;
      modelList.appendChild(option);
    }

    connectionStatus.textContent =
      '✅ Connection successful & settings saved!';
    connectionStatus.className = 'status-message status-success';
  } catch (error) {
    connectionStatus.textContent = `❌ Connection failed: ${(error as Error).message}`;
    connectionStatus.className = 'status-message status-error';
  } finally {
    saveTestBtn.disabled = false;
  }
};

// ── Save model on change ──

modelSelect.addEventListener('input', () => {
  const model = modelSelect.value.trim();
  if (model) {
    void chrome.storage.local.set({ [STORAGE_KEY_MODEL]: model });
    localStorage.setItem(STORAGE_KEY_MODEL, model);
  }
});

// ── Init ──

void loadSettings();
