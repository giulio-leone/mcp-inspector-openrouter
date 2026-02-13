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

export class ChromeToolAdapter implements IToolExecutionPort {
  private readonly listeners = new Set<(tools: readonly ToolDefinition[]) => void>();

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

    this.listeners.add(callback);
    chrome.runtime.onMessage.addListener(handler);

    return () => {
      this.listeners.delete(callback);
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
        await new Promise((r) => setTimeout(r, 300));
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
