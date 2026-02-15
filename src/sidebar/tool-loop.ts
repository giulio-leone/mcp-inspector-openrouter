/**
 * tool-loop.ts — Executes the AI tool-call loop until a final text response
 * or the iteration / timeout limit is reached.
 */

import type {
  CleanTool,
  PageContext,
  ParsedFunctionCall,
  ToolResponse,
  ChatSendResponse,
  MessageRole,
} from '../types';
import type { OpenRouterChat } from '../services/adapters';
import type { ChatConfig } from '../services/adapters/openrouter';
import type { PlanManager } from './plan-manager';
import { logger } from './debug-logger';
import { waitForTabReady, waitForTabFocus } from '../utils/adaptive-wait';

// ── Helpers ──

function isBrowserTool(name: string): boolean {
  return name.startsWith('browser.');
}

export function isNavigationTool(toolName: string): boolean {
  return (
    toolName.startsWith('search.') ||
    toolName.startsWith('nav.') ||
    toolName.startsWith('form.submit-')
  );
}

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

export async function waitForPageAndRescan(
  tabId: number,
  currentTools: CleanTool[],
): Promise<{ pageContext: PageContext | null; tools: CleanTool[] }> {
  const rescanStart = performance.now();
  logger.info('Rescan', `Starting page rescan for tab ${tabId}...`);

  const elapsed = await waitForTabReady(tabId, { maxWaitMs: 10_000, settleMs: 300 });
  logger.debug('Rescan', `Page load wait took ${elapsed.toFixed(0)}ms`);

  let pageContext: PageContext | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ensureContentScript(tabId);
      pageContext = (await chrome.tabs.sendMessage(tabId, {
        action: 'GET_PAGE_CONTEXT',
      })) as PageContext;
      logger.info('Rescan', `GET_PAGE_CONTEXT succeeded (attempt ${attempt + 1}): title="${pageContext?.title}"`);
      break;
    } catch (e) {
      logger.warn('Rescan', `GET_PAGE_CONTEXT attempt ${attempt + 1}/3 failed`, e);
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  // Use GET_TOOLS_SYNC for reliable cross-tab tool fetching
  let tools = currentTools;
  try {
    await ensureContentScript(tabId);
    const toolsResult = await chrome.tabs.sendMessage(tabId, { action: 'GET_TOOLS_SYNC' }) as { tools?: CleanTool[] };
    if (toolsResult?.tools?.length) {
      tools = toolsResult.tools;
      logger.info('Rescan', `GET_TOOLS_SYNC returned ${tools.length} tools`);
    } else {
      logger.warn('Rescan', 'GET_TOOLS_SYNC returned 0 tools, keeping current');
    }
  } catch (e) {
    logger.error('Rescan', 'GET_TOOLS_SYNC failed, falling back to broadcast', e);
    // Fallback: use broadcast-based approach
    const toolsPromise = new Promise<CleanTool[]>((resolve) => {
      const onMsg = (msg: { tools?: CleanTool[] }): void => {
        if (msg.tools) {
          chrome.runtime.onMessage.removeListener(onMsg);
          resolve(msg.tools);
        }
      };
      chrome.runtime.onMessage.addListener(onMsg);
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(onMsg);
        resolve(currentTools);
      }, 3000);
    });
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'LIST_TOOLS' });
    } catch { /* Content script not ready */ }
    tools = await toolsPromise;
  }

  logger.info('Rescan', `Rescan completed in ${(performance.now() - rescanStart).toFixed(0)}ms: ${tools.length} tools`);
  return { pageContext, tools };
}

// ── Tool loop params ──

export interface ToolLoopParams {
  chat: OpenRouterChat;
  tabId: number;
  /** The original tab where the sidebar is open (for cross-tab focus management) */
  originTabId?: number;
  initialResult: ChatSendResponse;
  pageContext: PageContext | null;
  currentTools: CleanTool[];
  planManager: PlanManager;
  trace: unknown[];
  addMessage: (role: MessageRole, content: string, meta?: Record<string, unknown>) => void;
  getConfig: (ctx: PageContext | null) => ChatConfig;
  onToolsUpdated: (tools: CleanTool[]) => void;
  /** Max tool-loop iterations (0 = unlimited, default: 0). */
  maxIterations?: number;
  /** Tool-loop timeout in ms (0 = unlimited, default: 0). */
  loopTimeoutMs?: number;
}

export interface ToolLoopResult {
  pageContext: PageContext | null;
  currentTools: CleanTool[];
}

// ── Main loop ──

export async function executeToolLoop(params: ToolLoopParams): Promise<ToolLoopResult> {
  const {
    chat,
    tabId,
    originTabId,
    planManager,
    trace,
    addMessage,
    getConfig,
    onToolsUpdated,
  } = params;

  const isCrossTab = originTabId !== undefined && originTabId !== tabId;

  let { initialResult: currentResult, pageContext, currentTools } = params;
  let finalResponseGiven = false;
  const maxIterations = params.maxIterations ?? 0;
  const loopTimeoutMs = params.loopTimeoutMs ?? 0;
  const toolLoopStart = performance.now();
  let iteration = 0;

  while (!finalResponseGiven && (maxIterations === 0 || iteration < maxIterations)) {
    iteration++;

    if (loopTimeoutMs > 0 && performance.now() - toolLoopStart > loopTimeoutMs) {
      addMessage('error', `⚠️ Tool execution loop timed out after ${loopTimeoutMs}ms. Stopping.`);
      console.warn(`[Sidebar] Tool loop timed out after ${loopTimeoutMs}ms`);
      break;
    }

    const response = currentResult;
    trace.push({ response });
    const functionCalls: readonly ParsedFunctionCall[] =
      response.functionCalls ?? [];

    logger.info('ToolLoop', `Iteration ${iteration}: ${functionCalls.length} tool calls, text=${!!response.text}, tabId=${tabId}`);
    if (functionCalls.length > 0) {
      logger.info('ToolLoop', 'Tool calls:', functionCalls.map((fc) => ({ name: fc.name, args: fc.args })));
    }

    if (functionCalls.length === 0) {
      if (!response.text && !response.reasoning) {
        addMessage(
          'error',
          `⚠️ AI response has no text: ${JSON.stringify(response.candidates)}`,
        );
      } else {
        addMessage('ai', response.text?.trim() ?? '', { reasoning: response.reasoning });
      }
      planManager.markRemainingStepsDone();
      finalResponseGiven = true;
    } else {
      const toolResponses: ToolResponse[] = [];
      for (const { name, args, id } of functionCalls) {
        // Plan management tools handled locally
        if (name === 'create_plan' || name === 'update_plan') {
          toolResponses.push(
            planManager.handlePlanTool(name, args as Record<string, unknown>, id),
          );
          continue;
        }

        addMessage('tool_call', '', { tool: name, args });
        planManager.markStepInProgress();

        // Browser tools are executed via background, not content script
        if (isBrowserTool(name)) {
          logger.info('ToolLoop', `Executing BROWSER tool "${name}"`, args);
          const result = await chrome.runtime.sendMessage({
            action: 'EXECUTE_BROWSER_TOOL',
            name,
            args,
          });
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          addMessage('tool_result', resultStr, { tool: name });
          planManager.markStepDone();
          toolResponses.push({
            functionResponse: {
              name,
              response: { result },
              tool_call_id: id,
            },
          });
          continue;
        }

        let navigatedDuringBatch = false;

        try {
          // Focus the target tab if cross-tab execution (required for click/focus events)
          if (isCrossTab) {
            logger.info('ToolLoop', `Cross-tab: focusing tab ${tabId} before tool "${name}"`);
            await chrome.tabs.update(tabId, { active: true });
            await waitForTabFocus(tabId, { maxWaitMs: 2000, settleMs: 200 });
          }
          logger.info('ToolLoop', `Executing tool "${name}" on tab ${tabId}`, args);
          const rawResult = await chrome.tabs.sendMessage(tabId, {
            action: 'EXECUTE_TOOL',
            name,
            inputArgs: JSON.stringify(args),
          });
          const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
          toolResponses.push({
            functionResponse: {
              name,
              response: { result },
              tool_call_id: id,
            },
          });
          addMessage('tool_result', result, { tool: name });
          planManager.markStepDone(String(result).substring(0, 50));

          if (isNavigationTool(name)) {
            logger.info('ToolLoop', `Navigation detected (${name}), rescanning page on tab ${tabId}...`);
            const rescan = await waitForPageAndRescan(tabId, currentTools);
            pageContext = rescan.pageContext;
            currentTools = rescan.tools;
            onToolsUpdated(currentTools);
            navigatedDuringBatch = true;
          } else if (functionCalls.length > 1) {
            await new Promise((r) => setTimeout(r, 200));
          }
        } catch (e) {
          const errMsg = (e as Error).message;
          addMessage('tool_error', errMsg, { tool: name });
          planManager.markStepFailed(errMsg.substring(0, 50));
          toolResponses.push({
            functionResponse: {
              name,
              response: { error: errMsg },
              tool_call_id: id,
            },
          });
        }

        if (navigatedDuringBatch) {
          const remaining = functionCalls.slice(
            functionCalls.indexOf(
              functionCalls.find((fc) => fc.name === name && fc.id === id)!,
            ) + 1,
          );
          for (const skipped of remaining) {
            toolResponses.push({
              functionResponse: {
                name: skipped.name,
                response: { result: 'Skipped: page navigated, this tool no longer exists on the new page.' },
                tool_call_id: skipped.id,
              },
            });
            addMessage('tool_result', '⏭️ Skipped (page navigated)', { tool: skipped.name });
          }
          break;
        }
      }

      if (planManager.activePlan) {
        planManager.advancePlanStep();
      }

      const updatedConfig = getConfig(pageContext);
      trace.push({ userPrompt: { message: toolResponses, config: updatedConfig } });
      chat.trimHistory();
      currentResult = await chat.sendMessage({
        message: toolResponses,
        config: updatedConfig,
      });
    }
  }

  if (iteration >= MAX_TOOL_ITERATIONS && !finalResponseGiven) {
    addMessage('error', '⚠️ Reached maximum tool execution iterations (10). Stopping to prevent infinite loop.');
  }

  return { pageContext, currentTools };
}
