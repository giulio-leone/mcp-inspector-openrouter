/**
 * AgentOrchestrator — IAgentPort implementation wiring all hexagonal adapters.
 *
 * Replaces the manual tool-loop pattern with a structured agent that:
 *  1. Sends user prompt to AI via OpenRouterChat
 *  2. Processes tool calls through IToolExecutionPort
 *  3. Manages plans through IPlanningPort
 *  4. Provides context awareness through IContextPort
 *  5. Supports recursive subagent spawning through ISubagentPort
 */

import type { IAgentPort } from '../ports/agent.port';
import type { IToolExecutionPort } from '../ports/tool-execution.port';
import type { IPlanningPort } from '../ports/planning.port';
import type { IContextPort } from '../ports/context.port';
import type {
  AgentContext,
  AgentResult,
  ToolCallRecord,
  ToolTarget,
  OrchestratorEvent,
  OrchestratorEventListener,
} from '../ports/types';
import type { OpenRouterChat } from '../services/adapters';
import type { ChatConfig } from '../services/adapters/openrouter';
import type { ToolResponse, ParsedFunctionCall, PageContext, CleanTool } from '../types';
import { isNavigationTool, waitForPageAndRescan } from '../sidebar/tool-loop';
import { logger } from '../sidebar/debug-logger';

const MAX_ITERATIONS = 10;
const LOOP_TIMEOUT_MS = 60_000;

export interface OrchestratorDeps {
  readonly toolPort: IToolExecutionPort;
  readonly contextPort: IContextPort;
  readonly planningPort: IPlanningPort;
  readonly chatFactory: () => OpenRouterChat;
  readonly buildConfig: (ctx: PageContext | null, tools: readonly CleanTool[]) => ChatConfig;
}

export class AgentOrchestrator implements IAgentPort {
  private chat: OpenRouterChat | null = null;
  private readonly listeners = new Set<OrchestratorEventListener>();

  constructor(private readonly deps: OrchestratorDeps) {}

  /** Subscribe to orchestrator events. Returns an unsubscribe function. */
  onEvent(listener: OrchestratorEventListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async run(prompt: string, context: AgentContext): Promise<AgentResult> {
    const { toolPort, contextPort, planningPort, buildConfig, chatFactory } = this.deps;
    const { tabId, mentionContexts } = context;

    const chat = chatFactory();
    this.chat = chat;
    const target: ToolTarget = {
      tabId: mentionContexts?.[0]?.tabId ?? tabId,
      originTabId: tabId,
    };

    let pageContext = context.pageContext;
    let tools = [...context.tools] as CleanTool[];
    const toolCallRecords: ToolCallRecord[] = [];

    const config = buildConfig(pageContext, tools);
    let currentResult = await chat.sendMessage({ message: prompt, config });

    const loopStart = performance.now();
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      if (performance.now() - loopStart > LOOP_TIMEOUT_MS) {
        logger.warn('Orchestrator', 'Tool loop timed out after 60s');
        this.emit({ type: 'timeout' });
        break;
      }

      const functionCalls = currentResult.functionCalls ?? [];

      if (functionCalls.length === 0) {
        const text = currentResult.text?.trim() ?? '';
        this.emit({ type: 'ai_response', text, reasoning: currentResult.reasoning });
        return this.buildResult(
          text,
          currentResult.reasoning,
          toolCallRecords,
          tools,
          pageContext,
          iteration,
        );
      }

      const toolResponses: ToolResponse[] = [];
      let navigatedAtIndex = -1;

      for (let i = 0; i < functionCalls.length; i++) {
        const fc = functionCalls[i];

        // Plan tools handled locally
        if (fc.name === 'create_plan' || fc.name === 'update_plan') {
          const args = fc.args as { goal: string; steps?: Array<{ id: string; title: string }> };
          const steps = (args.steps ?? []).map((s) => ({
            ...s, status: 'pending' as const,
          }));
          if (fc.name === 'create_plan') {
            planningPort.createPlan(args.goal, steps);
          } else {
            planningPort.updatePlan(args.goal, steps);
          }
          const verb = fc.name === 'create_plan' ? 'created' : 'updated';
          toolResponses.push(this.toToolResponse(fc, { result: `Plan "${args.goal}" ${verb}` }));
          continue;
        }

        try {
          this.emit({ type: 'tool_call', name: fc.name, args: fc.args as Record<string, unknown> });
          const result = await toolPort.execute(fc.name, fc.args as Record<string, unknown>, target);

          if (result.success) {
            planningPort.markStepDone();
            this.emit({ type: 'tool_result', name: fc.name, data: result.data, success: true });
          } else {
            planningPort.markStepFailed(result.error);
            this.emit({ type: 'tool_result', name: fc.name, data: result.error, success: false });
          }

          toolCallRecords.push({
            name: fc.name,
            args: fc.args as Record<string, unknown>,
            callId: fc.id,
            result,
          });

          const responseData = result.success
            ? { result: result.data }
            : { error: result.error ?? 'Tool execution failed' };

          toolResponses.push(this.toToolResponse(fc, responseData));

          // Navigation triggers rescan — skip remaining calls
          if (result.success && isNavigationTool(fc.name)) {
            this.emit({ type: 'navigation', toolName: fc.name });
            logger.info('Orchestrator', `Navigation detected (${fc.name}), rescanning`);
            const rescan = await waitForPageAndRescan(target.tabId, tools);
            pageContext = rescan.pageContext;
            tools = rescan.tools;
            navigatedAtIndex = i;
            break;
          }
        } catch (e) {
          const error = (e as Error).message;
          planningPort.markStepFailed(error);
          this.emit({ type: 'tool_error', name: fc.name, error });

          toolCallRecords.push({
            name: fc.name,
            args: fc.args as Record<string, unknown>,
            callId: fc.id,
            result: { success: false, error },
          });

          toolResponses.push(this.toToolResponse(fc, { error }));
        }
      }

      // Skip responses for remaining calls after navigation
      if (navigatedAtIndex >= 0) {
        for (let i = navigatedAtIndex + 1; i < functionCalls.length; i++) {
          const skipped = functionCalls[i];
          toolResponses.push(this.toToolResponse(skipped, {
            result: 'Skipped: page navigated, this tool no longer exists on the new page.',
          }));
        }
      }

      planningPort.advanceStep();

      const updatedConfig = buildConfig(pageContext, tools);
      chat.trimHistory();
      currentResult = await chat.sendMessage({
        message: toolResponses,
        config: updatedConfig,
      });
    }

    // Reached max iterations
    this.emit({ type: 'max_iterations' });
    return this.buildResult(
      '⚠️ Reached maximum tool iterations.',
      undefined,
      toolCallRecords,
      tools,
      pageContext,
      iteration,
    );
  }

  async dispose(): Promise<void> {
    this.chat = null;
    this.listeners.clear();
  }

  // ── Private ──

  private emit(event: OrchestratorEvent): void {
    const snapshot = [...this.listeners];
    for (const cb of snapshot) {
      try {
        cb(event);
      } catch {
        // Isolate listener errors so the loop continues
      }
    }
  }

  private buildResult(
    text: string,
    reasoning: string | undefined,
    toolCalls: readonly ToolCallRecord[],
    tools: readonly CleanTool[],
    pageContext: PageContext | null,
    stepsCompleted: number,
  ): AgentResult {
    return { text, reasoning, toolCalls, updatedTools: tools, updatedPageContext: pageContext, stepsCompleted };
  }

  private toToolResponse(
    fc: ParsedFunctionCall,
    response: Record<string, unknown>,
  ): ToolResponse {
    return {
      functionResponse: {
        name: fc.name,
        response,
        tool_call_id: fc.id,
      },
    };
  }
}
