/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Guard against duplicate injection (manifest + programmatic)
if (window.__wmcp_loaded) {
  console.debug('[WebMCP] Content script already loaded, skipping');
} else {
  window.__wmcp_loaded = true;
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
      if (action == 'SET_LOCK_MODE') {
        const locked = inputArgs?.locked ?? true;
        if (locked) {
          stopDomObserver();
          console.debug('[WebMCP] DOM observer STOPPED (locked)');
        } else {
          startDomObserver();
          console.debug('[WebMCP] DOM observer STARTED (live mode)');
        }
        reply({ locked });
        return false;
      }
      if (action == 'GET_PAGE_CONTEXT') {
        reply(extractPageContext());
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

  /**
   * Extract a live snapshot of the page: products, cart, form values, etc.
   * Uses generic selectors (Schema.org, data-mcp-type) to work on any site.
   */
  function extractPageContext() {
    const ctx = { url: location.href, title: document.title };

    // Products via Schema.org microdata or data-mcp-type
    const productEls = document.querySelectorAll('[data-mcp-type="product"], [itemtype*="schema.org/Product"]');
    if (productEls.length) {
      ctx.products = [...productEls].slice(0, 20).map(el => {
        const name = el.querySelector('[itemprop="name"], .product-name')?.textContent?.trim();
        const price = el.querySelector('[itemprop="price"], .product-price')?.textContent?.trim();
        const id = el.dataset.productId || el.id || null;
        return { id, name, price };
      });
    }

    // Cart state (look for common cart indicators)
    const cartBadge = document.querySelector('#cart-count, [data-cart-count], .cart-count, .cart-badge');
    if (cartBadge) {
      ctx.cartCount = parseInt(cartBadge.textContent) || 0;
    }

    // Current form values for each tool form
    const forms = document.querySelectorAll('form[toolname]');
    if (forms.length) {
      ctx.formDefaults = {};
      forms.forEach(f => {
        const toolName = f.getAttribute('toolname');
        ctx.formDefaults[toolName] = Object.fromEntries(new FormData(f).entries());
      });
    }

    // Key visible headings for general context
    const h1 = document.querySelector('h1');
    if (h1) ctx.mainHeading = h1.textContent.trim();

    console.debug('[WebMCP] Page context extracted:', ctx);
    return ctx;
  }

  /**
   * Enrich tool schemas with enum values from <select> and radio inputs.
   * Chrome's WebMCP API omits enum arrays, so the AI can't know valid values.
   */
  function enrichToolSchemas(tools) {
    return tools.map(tool => {
      const form = document.querySelector(`form[toolname="${tool.name}"]`);
      if (!form || !tool.inputSchema) return tool;

      let schema;
      try { schema = JSON.parse(tool.inputSchema); } catch { return tool; }
      if (!schema.properties) return tool;

      for (const [propName, propDef] of Object.entries(schema.properties)) {
        // <select> → enum from option values
        const select = form.querySelector(`select[name="${propName}"]`);
        if (select) {
          const vals = [...select.options].map(o => o.value).filter(Boolean);
          if (vals.length) propDef.enum = vals;
          continue;
        }
        // radio group → enum from radio values
        const radios = form.querySelectorAll(`input[type="radio"][name="${propName}"]`);
        if (radios.length) {
          propDef.enum = [...radios].map(r => r.value).filter(Boolean);
        }
      }

      return { ...tool, inputSchema: JSON.stringify(schema) };
    });
  }

  function listTools() {
    let tools = navigator.modelContextTesting.listTools();
    tools = enrichToolSchemas(tools);
    console.debug(`[WebMCP] Got ${tools.length} tools`, tools);
    chrome.runtime.sendMessage({ tools, url: location.href });
  }

  // --- DOM Mutation Observer ---
  let domObserver = null;
  let domObserverDebounce = null;

  function startDomObserver() {
    if (domObserver) return; // already running
    domObserver = new MutationObserver((mutations) => {
      // Check if any mutation is relevant to WebMCP forms
      const relevant = mutations.some(m => {
        // Added or removed nodes that contain or are form[toolname]
        for (const node of [...m.addedNodes, ...m.removedNodes]) {
          if (node.nodeType === 1 && (node.matches?.('form[toolname]') || node.querySelector?.('form[toolname]'))) {
            return true;
          }
        }
        // Attribute changes on form[toolname] or its children
        if (m.type === 'attributes' && m.target.closest?.('form[toolname]')) {
          return true;
        }
        // Text/characterData changes inside form[toolname] (label edits, etc.)
        if (m.type === 'characterData' && m.target.parentElement?.closest?.('form[toolname]')) {
          return true;
        }
        return false;
      });
      if (relevant) {
        // Debounce to avoid rapid-fire updates
        clearTimeout(domObserverDebounce);
        domObserverDebounce = setTimeout(() => {
          console.debug('[WebMCP] DOM change detected, refreshing tools...');
          listTools();
        }, 300);
      }
    });
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['toolname', 'tooldescription', 'name', 'value', 'type']
    });
    console.debug('[WebMCP] DOM observer initialized');
  }

  function stopDomObserver() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    clearTimeout(domObserverDebounce);
  }

  window.addEventListener('toolactivated', ({ toolName }) => {
    console.debug(`[WebMCP] Tool "${toolName}" started execution.`);
  });

  window.addEventListener('toolcancel', ({ toolName }) => {
    console.debug(`[WebMCP] Tool "${toolName}" execution is cancelled.`);
  });
} // end guard
