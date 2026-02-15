/**
 * Message handler — chrome.runtime.onMessage dispatcher for the
 * content script. Owns YOLO-mode cache and pending confirmations.
 */

import type { Tool, ContentScriptMessage } from '../types';
import { SECURITY_TIERS, STORAGE_KEY_YOLO_MODE } from '../utils/constants';
import { getSecurityTier } from './merge';
import { extractPageContext } from './page-context';
import type { ToolRegistry } from './tool-registry';
import { extractSite } from '../adapters/indexeddb-tool-cache-adapter';

export function createMessageHandler(registry: ToolRegistry): void {
  // ── YOLO mode (cached, updated on storage change) ──
  let yoloMode = true; // Default: YOLO on
  chrome.storage.local.get([STORAGE_KEY_YOLO_MODE]).then((r) => {
    yoloMode = r[STORAGE_KEY_YOLO_MODE] !== false;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (STORAGE_KEY_YOLO_MODE in changes) {
      yoloMode = changes[STORAGE_KEY_YOLO_MODE].newValue !== false;
    }
  });

  // Pending confirmation queue: toolName → { resolve, reject, tool, args }
  const pendingConfirmations = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      tool: Tool;
      args: Record<string, unknown>;
    }
  >();

  // ── Individual action handlers ──

  function handlePing(reply: (r?: unknown) => void): boolean {
    reply({ status: 'pong' });
    return false;
  }

  function handleSetLockMode(
    msg: ContentScriptMessage,
    reply: (r?: unknown) => void,
  ): boolean {
    const locked = (msg as { inputArgs?: { locked?: boolean } }).inputArgs?.locked ?? true;
    if (locked) {
      registry.stopDomObserver();
      console.debug('[WebMCP] DOM observer STOPPED (locked)');
    } else {
      registry.startDomObserver();
      console.debug('[WebMCP] DOM observer STARTED (live mode)');
    }
    reply({ locked });
    return false;
  }

  function handleGetPageContext(reply: (r?: unknown) => void): boolean {
    reply(extractPageContext());
    return false;
  }

  function handleGetToolsSync(reply: (r?: unknown) => void): boolean {
    registry.listToolsAlwaysAugment().then((tools) => {
      reply({ tools, url: location.href });
    }).catch(() => {
      reply({ tools: [], url: location.href });
    });
    return true; // async response
  }

  function handleListTools(reply: (r?: unknown) => void): boolean {
    registry.listToolsAlwaysAugment();
    if (navigator.modelContextTesting?.registerToolsChangedCallback) {
      navigator.modelContextTesting.registerToolsChangedCallback(
        () => { registry.listToolsAlwaysAugment(); },
      );
    }
    reply({ queued: true });
    return false;
  }

  function handleExecuteTool(
    msg: ContentScriptMessage,
    reply: (r?: unknown) => void,
  ): boolean {
    const execMsg = msg as { name: string; inputArgs: string | Record<string, unknown> };
    const toolName = execMsg.name;
    const inputArgs = execMsg.inputArgs;

    // Check inferred tools first
    const inferredTool = registry.inferredToolsMap.get(toolName);
    if (inferredTool) {
      console.debug(
        `[WebMCP] Execute INFERRED tool "${toolName}" with`,
        inputArgs,
      );
      const parsedArgs: Record<string, unknown> =
        typeof inputArgs === 'string'
          ? JSON.parse(inputArgs)
          : inputArgs;

      const tier = getSecurityTier(inferredTool);
      const tierInfo = SECURITY_TIERS[tier];

      if (!tierInfo.autoExecute && !yoloMode) {
        const promise = new Promise<unknown>((resolve, reject) => {
          pendingConfirmations.set(toolName, {
            resolve,
            reject,
            tool: inferredTool,
            args: parsedArgs,
          });
        });

        chrome.runtime.sendMessage({
          action: 'CONFIRM_EXECUTION',
          toolName,
          description: inferredTool.description,
          tier,
        });

        promise
          .then((result) => reply(result))
          .catch((err: Error) => reply(JSON.stringify(err.message)));
        return true;
      }

      registry.executorRegistry
        .execute(inferredTool, parsedArgs)
        .then((result) => reply(result))
        .catch((err: Error) => {
          console.error('[WebMCP] Inferred execution error:', err);
          reply(JSON.stringify(err.message || String(err)));
        });
      return true;
    }

    // Native/declarative tool execution
    if (!navigator.modelContextTesting) {
      reply(
        JSON.stringify(
          'WebMCP native API not available for native tool execution',
        ),
      );
      return false;
    }

    // Validate tool exists in native API before executing
    try {
      const nativeTools = navigator.modelContextTesting.listTools() || [];
      const exists = (nativeTools as Tool[]).some((t) => t.name === toolName);
      if (!exists) {
        reply(JSON.stringify(`Tool "${toolName}" not found`));
        return false;
      }
    } catch { /* proceed anyway if listTools fails */ }

    const normalizedArgs = registry.normalizeToolArgs(toolName, inputArgs);
    console.debug(
      `[WebMCP] Execute NATIVE tool "${toolName}" with`,
      normalizedArgs,
    );

    let targetFrame: HTMLIFrameElement | null = null;
    let loadPromise: Promise<void> | undefined;

    const formTarget = document.querySelector(
      `form[toolname="${toolName}"]`,
    )?.getAttribute('target');
    if (formTarget) {
      targetFrame = document.querySelector(
        `[name="${formTarget}"]`,
      ) as HTMLIFrameElement | null;
      if (targetFrame) {
        loadPromise = new Promise<void>((resolve) => {
          targetFrame!.addEventListener('load', () => resolve(), {
            once: true,
          });
        });
      }
    }

    navigator.modelContextTesting
      .executeTool(toolName, normalizedArgs)
      .then(async (result: unknown) => {
        let finalResult = result;
        if (
          finalResult === null &&
          targetFrame &&
          loadPromise
        ) {
          console.debug(
            `[WebMCP] Waiting for form target to load`,
          );
          await loadPromise;
          finalResult =
            await (targetFrame as HTMLIFrameElement).contentWindow
              ?.navigator?.modelContextTesting
              ?.getCrossDocumentScriptToolResult();
        }
        reply(finalResult);
      })
      .catch((err: Error) => {
        console.error('[WebMCP] Execution error:', err);
        reply(JSON.stringify(err.message || String(err)));
      });
    return true;
  }

  function handleGetCrossDocumentResult(reply: (r?: unknown) => void): boolean {
    if (!navigator.modelContextTesting) {
      reply(JSON.stringify('WebMCP native API not available'));
      return false;
    }
    console.debug('[WebMCP] Get cross document script tool result');
    navigator.modelContextTesting
      .getCrossDocumentScriptToolResult()
      .then(reply)
      .catch((err: Error) => reply(JSON.stringify(err.message)));
    return true;
  }

  function handleConfirmExecute(
    msg: ContentScriptMessage,
    reply: (r?: unknown) => void,
  ): boolean {
    const pending = pendingConfirmations.get((msg as { toolName: string }).toolName);
    if (pending) {
      pendingConfirmations.delete((msg as { toolName: string }).toolName);
      registry.executorRegistry
        .execute(pending.tool, pending.args)
        .then((result) => pending.resolve(result))
        .catch((err: Error) => pending.reject(err));
    }
    reply({ confirmed: true });
    return false;
  }

  function handleCancelExecute(
    msg: ContentScriptMessage,
    reply: (r?: unknown) => void,
  ): boolean {
    const cancelled = pendingConfirmations.get((msg as { toolName: string }).toolName);
    if (cancelled) {
      pendingConfirmations.delete((msg as { toolName: string }).toolName);
      cancelled.reject(new Error('Execution cancelled by user'));
    }
    reply({ cancelled: true });
    return false;
  }

  function handleGetSiteManifest(reply: (r?: unknown) => void): boolean {
    const manifest = registry.getToolManifest();
    if (!manifest) {
      reply({ error: 'Tool manifest not available' });
      return false;
    }
    const site = extractSite(location.href);
    reply({ manifest: manifest.toMCPJson(site) });
    return false;
  }

  // ── Register the message listener ──
  chrome.runtime.onMessage.addListener(
    (
      msg: ContentScriptMessage,
      _sender: chrome.runtime.MessageSender,
      reply: (response?: unknown) => void,
    ) => {
      try {
        switch (msg.action) {
          case 'PING':
            return handlePing(reply);
          case 'SET_LOCK_MODE':
            return handleSetLockMode(msg, reply);
          case 'GET_PAGE_CONTEXT':
            return handleGetPageContext(reply);
          case 'LIST_TOOLS':
            return handleListTools(reply);
          case 'GET_TOOLS_SYNC':
            return handleGetToolsSync(reply);
          case 'EXECUTE_TOOL':
            return handleExecuteTool(msg, reply);
          case 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT':
            return handleGetCrossDocumentResult(reply);
          case 'CONFIRM_EXECUTE':
            return handleConfirmExecute(msg, reply);
          case 'CANCEL_EXECUTE':
            return handleCancelExecute(msg, reply);
          case 'CAPTURE_SCREENSHOT':
            return false;
          case 'GET_SITE_MANIFEST':
            return handleGetSiteManifest(reply);
          default:
            return false;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        chrome.runtime.sendMessage({ message });
        return false;
      }
    },
  );
}
