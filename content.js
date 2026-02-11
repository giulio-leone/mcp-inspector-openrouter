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
        listToolsAlwaysAugment();
        // Register native callback if available
        if (navigator.modelContextTesting?.registerToolsChangedCallback) {
          navigator.modelContextTesting.registerToolsChangedCallback(() => listToolsAlwaysAugment());
        }
        reply({ queued: true });
        return false;
      }
      if (action == 'EXECUTE_TOOL') {
        // Check if this is an inferred tool
        const inferredTool = window.__wmcpInferredToolsMap?.get(name);
        if (inferredTool) {
          // Execute inferred tool directly (no confirmation prompt)
          console.debug(`[WebMCP] Execute INFERRED tool "${name}" with`, inputArgs);
          window.__wmcpExecutor.execute(inferredTool, inputArgs)
            .then(result => reply(result))
            .catch(err => {
              console.error('[WebMCP] Inferred execution error:', err);
              reply(JSON.stringify(err.message || err));
            });
          return true;
        }

        // Native/declarative tool execution
        if (!navigator.modelContextTesting) {
          reply(JSON.stringify('WebMCP native API not available for native tool execution'));
          return false;
        }
        const normalizedArgs = normalizeToolArgs(name, inputArgs);
        console.debug(`[WebMCP] Execute NATIVE tool "${name}" with`, normalizedArgs);
        let targetFrame, loadPromise;
        const formTarget = document.querySelector(`form[toolname="${name}"]`)?.target;
        if (formTarget) {
          targetFrame = document.querySelector(`[name=${formTarget}]`);
          if (targetFrame) {
            loadPromise = new Promise((resolve) => {
              targetFrame.addEventListener('load', resolve, { once: true });
            });
          }
        }
        const promise = navigator.modelContextTesting.executeTool(name, normalizedArgs);
        promise
          .then(async (result) => {
            if (result === null && targetFrame && loadPromise) {
              console.debug(`[WebMCP] Waiting for form target ${targetFrame} to load`);
              await loadPromise;
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

  // ── Map to store inferred tools for execution lookup ──
  window.__wmcpInferredToolsMap = new Map();

  /**
   * ALWAYS-AUGMENT model:
   *  1. Collect native tools (Tier 1) — if WebMCP API available
   *  2. Collect declarative tools (Tier 2) — form[toolname]
   *  3. ALWAYS run inference scan (Tier 3)
   *  4. Merge: Native ∪ Declarative ∪ Inferred (native wins ties)
   */
  async function listToolsAlwaysAugment() {
    let nativeTools = [];
    let declarativeTools = [];
    let inferredTools = [];

    // Tier 1: WMCP Native API
    if (navigator.modelContextTesting) {
      try {
        nativeTools = navigator.modelContextTesting.listTools() || [];
        nativeTools = enrichToolSchemas(nativeTools);
      } catch (e) {
        console.warn('[WebMCP] Native API failed:', e);
      }
    }

    // Tier 2: Declarative HTML (form[toolname])
    const declForms = document.querySelectorAll('form[toolname]');
    if (declForms.length > 0) {
      declarativeTools = [...declForms].map(f => ({
        name: f.getAttribute('toolname'),
        description: f.getAttribute('tooldescription') || '',
        inputSchema: extractFormSchema(f)
      }));
      declarativeTools = enrichToolSchemas(declarativeTools);
    }

    // Tier 3: Auto-Inference — ALWAYS runs
    try {
      inferredTools = await window.__wmcpInferenceEngine.scanPage();
    } catch (e) {
      console.warn('[WebMCP] Inference scan failed:', e);
    }

    // Store inferred tools for execution routing
    window.__wmcpInferredToolsMap.clear();
    for (const t of inferredTools) {
      window.__wmcpInferredToolsMap.set(t.name, t);
    }

    // Union merge (native wins on name collision)
    const { mergeToolSets } = window.__wmcpMerge;
    let tools = mergeToolSets(nativeTools, declarativeTools, inferredTools);

    // Strip internal properties before sending to sidebar
    const cleanTools = tools.map(({ _el, _form, _schemaAction, ...rest }) => rest);

    const sources = {
      native: cleanTools.filter(t => t._source === 'native').length,
      declarative: cleanTools.filter(t => t._source === 'declarative').length,
      inferred: cleanTools.filter(t => t._source === 'inferred').length,
    };
    console.debug(
      `[WebMCP] ${cleanTools.length} tools (${sources.native}N + ${sources.declarative}D + ${sources.inferred}I)`,
      cleanTools
    );
    chrome.runtime.sendMessage({ tools: cleanTools, url: location.href });
  }

  /** Extract schema from a declarative form[toolname] */
  function extractFormSchema(form) {
    const props = {};
    const required = [];
    for (const inp of form.querySelectorAll('input, select, textarea')) {
      if (inp.type === 'hidden' || inp.type === 'submit') continue;
      const name = inp.name || inp.id;
      if (!name) continue;
      const prop = { type: inp.type === 'number' ? 'number' : 'string' };
      if (inp.tagName === 'SELECT') {
        prop.enum = [...inp.options].map(o => o.value).filter(Boolean);
      }
      props[name] = prop;
      if (inp.required) required.push(name);
    }
    return JSON.stringify({
      type: 'object',
      properties: props,
      ...(required.length ? { required } : {})
    });
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
          // Invalidate inference cache on DOM mutation
          if (window.__wmcpInferenceEngine) {
            window.__wmcpInferenceEngine.invalidateCache();
          }
          listToolsAlwaysAugment();
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

  // ── SPA Navigation Interception ──
  // Detect route changes in SPAs that use history.pushState/replaceState
  let _lastSpaUrl = location.href;
  let _spaDebounce = null;

  function onSpaNavigation() {
    if (location.href === _lastSpaUrl) return;
    _lastSpaUrl = location.href;
    clearTimeout(_spaDebounce);
    _spaDebounce = setTimeout(() => {
      console.debug('[WebMCP] SPA navigation detected →', location.href);
      if (window.__wmcpInferenceEngine) {
        window.__wmcpInferenceEngine.invalidateCache();
      }
      listToolsAlwaysAugment();
    }, 500);
  }

  // Intercept pushState & replaceState
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    onSpaNavigation();
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    onSpaNavigation();
  };

  window.addEventListener('popstate', onSpaNavigation);

  window.addEventListener('toolactivated', ({ toolName }) => {
    console.debug(`[WebMCP] Tool "${toolName}" started execution.`);
  });

  window.addEventListener('toolcancel', ({ toolName }) => {
    console.debug(`[WebMCP] Tool "${toolName}" execution is cancelled.`);
  });
} // end guard
