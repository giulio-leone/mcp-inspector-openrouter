/**
 * ChromeToolAdapter — IToolExecutionPort implementation for Chrome Extension.
 *
 * Routes tool calls through chrome.tabs.sendMessage (content tools) and
 * chrome.runtime.sendMessage (browser tools), translating between the
 * hexagonal port contract and Chrome Extension messaging.
 */

import type { IToolExecutionPort } from '../ports/tool-execution.port';
import type { ToolCallResult, ToolDefinition, ToolTarget } from '../ports/types';
import type { CleanTool } from '../types';
import { logger } from '../sidebar/debug-logger';
import { waitForTabFocus } from '../utils/adaptive-wait';
import { tool } from 'ai';
import { z } from 'zod';

/** Determine whether a tool runs in the background service worker */
function isBrowserTool(name: string): boolean {
  return name.startsWith('browser.');
}

/** Ensure the content script is loaded in the target tab */
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

/** Convert a CleanTool to the port-layer ToolDefinition */
function toToolDefinition(tool: CleanTool): ToolDefinition {
  const schema = typeof tool.inputSchema === 'string'
    ? JSON.parse(tool.inputSchema) as Record<string, unknown>
    : tool.inputSchema as unknown as Record<string, unknown>;

  return {
    name: tool.name,
    description: tool.description ?? '',
    parametersSchema: schema ?? {},
    category: tool.category,
  };
}

/** Creates a dynamic AI SDK compatible tool set using the adapter */
export function createChromeToolSet(target: ToolTarget, adapter = new ChromeToolAdapter()): Record<string, any> {
  const tools: Record<string, any> = {};

  // For now, these are wrappers around the adapter's generic execute method.
  // The actual parametersSchema is provided by the frontend chat builder but 
  // DeepAgent requires tools to be registered upfront. 
  // Normally we would generate tools with z.object() schemas here if we knew them ahead of time.
  // We can return a Proxy that dynamically creates tools as they are accessed by GaussFlow.
  return new Proxy({}, {
    get(targetObj, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;

      // Lazily create an ai.tool wrapper
      return tool({
        description: `Execute chrome tool: ${prop}`,
        parameters: z.object({}), // AI SDK requires a Zod schema here, using a generic permissive one
        execute: async (args: any, context?: any) => {
          const res = await adapter.execute(prop, args, target);
          if (!res.success) throw new Error(res.error || 'Unknown error');
          return res.data;
        }
      } as any);
    }
  });
}

export class ChromeToolAdapter implements IToolExecutionPort {
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    target: ToolTarget,
  ): Promise<ToolCallResult> {
    const { tabId, originTabId } = target;
    const isCrossTab = originTabId !== undefined && originTabId !== tabId;

    if (isBrowserTool(toolName)) {
      return this.executeBrowserTool(toolName, args);
    }
    return this.executeContentTool(toolName, args, tabId, isCrossTab);
  }

  async getAvailableTools(tabId: number): Promise<readonly ToolDefinition[]> {
    try {
      await ensureContentScript(tabId);
      const result = await chrome.tabs.sendMessage(tabId, {
        action: 'GET_TOOLS_SYNC',
      }) as { tools?: CleanTool[] };

      return (result?.tools ?? []).map(toToolDefinition);
    } catch (e) {
      logger.warn('ChromeToolAdapter', 'getAvailableTools failed', e);
      return [];
    }
  }

  onToolsChanged(callback: (tools: readonly ToolDefinition[]) => void): () => void {
    const handler = (msg: { tools?: CleanTool[] }): void => {
      if (msg.tools) {
        try {
          callback(msg.tools.map(toToolDefinition));
        } catch (e) {
          logger.warn('ChromeToolAdapter', 'onToolsChanged conversion failed', e);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handler);

    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }

  // ── Private ──

  private async executeBrowserTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    try {
      logger.info('ChromeToolAdapter', `Browser tool "${toolName}"`, args);
      const raw = await chrome.runtime.sendMessage({
        action: 'EXECUTE_BROWSER_TOOL',
        name: toolName,
        args,
      });
      const result = raw as { success: boolean; message?: string; data?: unknown };
      return result.success
        ? { success: true, data: result.data ?? result.message }
        : { success: false, error: result.message ?? 'Browser tool failed' };
    } catch (e) {
      const error = (e as Error).message;
      logger.error('ChromeToolAdapter', `Browser tool "${toolName}" failed`, e);
      return { success: false, error };
    }
  }

  private async executeContentTool(
    toolName: string,
    args: Record<string, unknown>,
    tabId: number,
    isCrossTab: boolean,
  ): Promise<ToolCallResult> {
    try {
      if (isCrossTab) {
        logger.info('ChromeToolAdapter', `Cross-tab: focusing tab ${tabId}`);
        await chrome.tabs.update(tabId, { active: true });
        await waitForTabFocus(tabId, { maxWaitMs: 2000, settleMs: 200 });
      }

      logger.info('ChromeToolAdapter', `Content tool "${toolName}" on tab ${tabId}`, args);
      await ensureContentScript(tabId);
      const rawResult = await chrome.tabs.sendMessage(tabId, {
        action: 'EXECUTE_TOOL',
        name: toolName,
        inputArgs: JSON.stringify(args),
      });

      // Content executors return { success, message, data? }
      // Error paths return a plain string
      if (typeof rawResult === 'object' && rawResult !== null && 'success' in rawResult) {
        const structured = rawResult as { success: boolean; message: string; data?: unknown };
        return structured.success
          ? { success: true, data: structured.data ?? structured.message }
          : { success: false, error: structured.message };
      }

      // Fallback: treat raw string/unknown as data (matches existing tool-loop behavior)
      return {
        success: true,
        data: typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult),
      };
    } catch (e) {
      const error = (e as Error).message;
      logger.error('ChromeToolAdapter', `Content tool "${toolName}" failed`, e);
      return { success: false, error };
    }
  }
}
