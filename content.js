/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

console.debug('[WebMCP] Content script injected');

chrome.runtime.onMessage.addListener(({ action, name, inputArgs }, _, reply) => {
  try {
    if (!navigator.modelContextTesting) {
      throw new Error(
        'Error: You must run Chrome with the "Enables WebMCP for Testing" flag enabled.',
      );
    }
    if (action == 'PING') {
      reply({ status: 'pong' });
      return false;
    }
    if (action == 'LIST_TOOLS') {
      listTools();
      if (navigator.modelContextTesting.registerToolsChangedCallback) {
        navigator.modelContextTesting.registerToolsChangedCallback(listTools);
      }
      reply({ queued: true });
      return false;
    }
    if (action == 'EXECUTE_TOOL') {
      // Normalize AI args against actual HTML form values (case-insensitive)
      const normalizedArgs = normalizeToolArgs(name, inputArgs);
      console.debug(`[WebMCP] Execute tool "${name}" with`, normalizedArgs, '(original:', inputArgs, ')');
      let targetFrame, loadPromise;
      // Check if this tool is associated with a form target
      const formTarget = document.querySelector(`form[toolname="${name}"]`)?.target;
      if (formTarget) {
        targetFrame = document.querySelector(`[name=${formTarget}]`);
        if (targetFrame) {
          loadPromise = new Promise((resolve) => {
            targetFrame.addEventListener('load', resolve, { once: true });
          });
        }
      }
      // Execute the experimental tool with normalized args
      const promise = navigator.modelContextTesting.executeTool(name, normalizedArgs);
      promise
        .then(async (result) => {
          // If result is null and we have a target frame, wait for the frame to reload.
          if (result === null && targetFrame && loadPromise) {
            console.debug(`[WebMCP] Waiting for form target ${targetFrame} to load`);
            await loadPromise;
            console.debug('[WebMCP] Get cross document script tool result');
            result =
              await targetFrame.contentWindow.navigator.modelContextTesting.getCrossDocumentScriptToolResult();
          }
          reply(result);
        })
        .catch((err) => {
          console.error('[WebMCP] Execution error:', err);
          reply(JSON.stringify(err.message || err));
        });
      return true;
    }
    if (action == 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT') {
      console.debug('[WebMCP] Get cross document script tool result');
      const promise = navigator.modelContextTesting.getCrossDocumentScriptToolResult();
      promise.then(reply).catch(({ message }) => reply(JSON.stringify(message)));
      return true;
    }
  } catch ({ message }) {
    chrome.runtime.sendMessage({ message });
  }
});

/**
 * Normalize AI-provided tool arguments against actual HTML form values.
 * Performs case-insensitive matching for select options and radio buttons,
 * so the AI can send "ALLOW" and the extension will correct it to "allow".
 */
function normalizeToolArgs(toolName, inputArgs) {
  try {
    const args = typeof inputArgs === 'string' ? JSON.parse(inputArgs) : inputArgs;
    const form = document.querySelector(`form[toolname="${toolName}"]`);
    if (!form) return typeof inputArgs === 'string' ? inputArgs : JSON.stringify(inputArgs);

    const normalized = { ...args };

    for (const [key, value] of Object.entries(normalized)) {
      if (typeof value !== 'string') continue;

      // Check <select> options
      const select = form.querySelector(`select[name="${key}"]`);
      if (select) {
        const match = [...select.options].find(
          opt => opt.value.toLowerCase() === value.toLowerCase()
        );
        if (match) {
          normalized[key] = match.value;
          continue;
        }
      }

      // Check radio buttons
      const radios = form.querySelectorAll(`input[type="radio"][name="${key}"]`);
      if (radios.length > 0) {
        const match = [...radios].find(
          r => r.value.toLowerCase() === value.toLowerCase()
        );
        if (match) {
          normalized[key] = match.value;
          continue;
        }
      }
    }

    return JSON.stringify(normalized);
  } catch (e) {
    console.warn('[WebMCP] Normalization failed, using original args:', e);
    return inputArgs;
  }
}

function listTools() {
  const tools = navigator.modelContextTesting.listTools();
  console.debug(`[WebMCP] Got ${tools.length} tools`, tools);
  chrome.runtime.sendMessage({ tools, url: location.href });
}

window.addEventListener('toolactivated', ({ toolName }) => {
  console.debug(`[WebMCP] Tool "${toolName}" started execution.`);
});

window.addEventListener('toolcancel', ({ toolName }) => {
  console.debug(`[WebMCP] Tool "${toolName}" execution is cancelled.`);
});
