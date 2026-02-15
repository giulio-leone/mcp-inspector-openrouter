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
import type { IContextManagerPort } from '../ports/context-manager.port';
import type { ITabSessionPort } from '../ports/tab-session.port';
import type { ISubagentPort } from '../ports/subagent.port';
import type {
  AgentContext,
  AgentResult,
  ToolCallRecord,
  ToolTarget,
  ToolDefinition,
  OrchestratorEvent,
  OrchestratorEventListener,
  AgentEventMap,
} from '../ports/types';
import { TypedEventBus } from './event-bus';
import type { OpenRouterChat } from '../services/adapters';
import type { ChatConfig } from '../services/adapters/openrouter';
import type { ToolResponse, ParsedFunctionCall, PageContext, CleanTool, ContentPart } from '../types';
import { isNavigationTool, waitForPageAndRescan } from '../sidebar/tool-loop';
import { logger } from '../sidebar/debug-logger';

const MAX_ITERATIONS = 10;
const LOOP_TIMEOUT_MS = 60_000;

export interface OrchestratorDeps {
  readonly toolPort: IToolExecutionPort;
  readonly contextPort: IContextPort;
  readonly planningPort: IPlanningPort;
  readonly contextManager?: IContextManagerPort;
  readonly tabSession?: ITabSessionPort;
  readonly subagentPort?: ISubagentPort;
  readonly depth?: number;
  readonly chatFactory: () => OpenRouterChat;
  readonly buildConfig: (ctx: PageContext | null, tools: readonly ToolDefinition[]) => ChatConfig;
}

export class AgentOrchestrator implements IAgentPort {
  private chat: OpenRouterChat | null = null;

  /** Typed event bus for granular subscriptions. */
  readonly eventBus = new TypedEventBus<AgentEventMap>();

  constructor(private readonly deps: OrchestratorDeps) {}

  /**
   * Subscribe to orchestrator events (legacy API).
   * Internally delegates to the typed event bus.
   * Returns an unsubscribe function.
   */
  onEvent(listener: OrchestratorEventListener): () => void {
    const unsubs: Array<() => void> = [];

    unsubs.push(this.eventBus.on('tool:call', (data) => {
      listener({ type: 'tool_call', name: data.name, args: data.args });
    }));
    unsubs.push(this.eventBus.on('tool:result', (data) => {
      listener({ type: 'tool_result', name: data.name, data: data.data, success: data.success });
    }));
    unsubs.push(this.eventBus.on('tool:error', (data) => {
      listener({ type: 'tool_error', name: data.name, error: data.error });
    }));
    unsubs.push(this.eventBus.on('ai:response', (data) => {
      listener({ type: 'ai_response', text: data.text, reasoning: data.reasoning });
    }));
    unsubs.push(this.eventBus.on('navigation', (data) => {
      listener({ type: 'navigation', toolName: data.toolName });
    }));
    unsubs.push(this.eventBus.on('subagent:started', (data) => {
      listener({ type: 'subagent_started', subagentId: data.subagentId, task: data.task });
    }));
    unsubs.push(this.eventBus.on('subagent:completed', (data) => {
      listener({ type: 'subagent_completed', subagentId: data.subagentId, text: data.text, stepsCompleted: data.stepsCompleted });
    }));
    unsubs.push(this.eventBus.on('subagent:failed', (data) => {
      listener({ type: 'subagent_failed', subagentId: data.subagentId, error: data.error });
    }));
    unsubs.push(this.eventBus.on('timeout', () => {
      listener({ type: 'timeout' });
    }));
    unsubs.push(this.eventBus.on('max_iterations', () => {
      listener({ type: 'max_iterations' });
    }));

    return () => { for (const u of unsubs) u(); };
  }

  async run(prompt: string | ContentPart[], context: AgentContext): Promise<AgentResult> {
    const { toolPort, contextPort, planningPort, buildConfig, chatFactory, tabSession } = this.deps;

    /** Wraps buildConfig to inject multi-tab session context into the system prompt. */
    const enrichedBuildConfig = (ctx: PageContext | null, t: readonly ToolDefinition[]): ChatConfig => {
      const config = buildConfig(ctx, t);
      if (tabSession) {
        const summary = tabSession.buildContextSummary();
        if (summary && config.systemInstruction) {
          return { ...config, systemInstruction: [...config.systemInstruction, '', '**MULTI-TAB SESSION CONTEXT:**', summary] };
        }
      }
      return config;
    };
    const { tabId, mentionContexts } = context;

    // Clear offloaded content from prior run to prevent unbounded growth
    this.deps.contextManager?.reset();

    const chat = chatFactory();
    this.chat = chat;
    const target: ToolTarget = {
      tabId: mentionContexts?.[0]?.tabId ?? tabId,
      originTabId: tabId,
    };

    let pageContext = context.pageContext;
    let tools = [...context.tools] as ToolDefinition[];
    const toolCallRecords: ToolCallRecord[] = [];

    // Seed initial tab context so storeData() works from the first tool call
    if (tabSession && pageContext) {
      tabSession.setTabContext(target.tabId, {
        url: pageContext.url ?? '',
        title: pageContext.title ?? '',
        extractedData: {},
      });
    }

    const config = enrichedBuildConfig(pageContext, tools);
    let currentResult = await chat.sendMessage({ message: prompt, config });

    const loopStart = performance.now();
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      if (performance.now() - loopStart > LOOP_TIMEOUT_MS) {
        logger.warn('Orchestrator', 'Tool loop timed out after 60s');
        this.eventBus.emit('timeout');
        break;
      }

      const functionCalls = currentResult.functionCalls ?? [];

      if (functionCalls.length === 0) {
        const text = currentResult.text?.trim() ?? '';
        this.eventBus.emit('ai:response', { text, reasoning: currentResult.reasoning });
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

        // Subagent delegation handled locally
        if (fc.name === 'delegate_task' && this.deps.subagentPort) {
          const delegateArgs = fc.args as { prompt: string; instructions?: string; timeoutMs?: number };
          const taskDescription = delegateArgs.prompt.slice(0, 100);

          try {
            this.eventBus.emit('subagent:started', { subagentId: '', task: taskDescription });

            const subResult = await this.deps.subagentPort.spawn({
              prompt: delegateArgs.prompt,
              instructions: delegateArgs.instructions,
              timeoutMs: delegateArgs.timeoutMs,
              depth: (this.deps.depth ?? 0) + 1,
              tools: tools,
              context: { pageContext, tools, conversationHistory: [], liveState: null, tabId: target.tabId },
            });

            if (subResult.success) {
              this.eventBus.emit('subagent:completed', {
                subagentId: subResult.subagentId,
                text: subResult.text,
                stepsCompleted: subResult.stepsCompleted,
              });
              toolResponses.push(this.toToolResponse(fc, { result: subResult.text }));
            } else {
              this.eventBus.emit('subagent:failed', {
                subagentId: subResult.subagentId,
                error: subResult.error ?? 'Subagent failed',
              });
              toolResponses.push(this.toToolResponse(fc, { error: subResult.error ?? 'Subagent failed' }));
            }
          } catch (spawnErr) {
            const errorMsg = (spawnErr as Error).message ?? 'Subagent spawn failed';
            this.eventBus.emit('subagent:failed', { subagentId: '', error: errorMsg });
            toolResponses.push(this.toToolResponse(fc, { error: errorMsg }));
          }
          continue;
        }

        try {
          this.eventBus.emit('tool:call', { name: fc.name, args: fc.args as Record<string, unknown> });
          const result = await toolPort.execute(fc.name, fc.args as Record<string, unknown>, target);

          if (result.success) {
            planningPort.markStepDone();
            this.eventBus.emit('tool:result', { name: fc.name, data: result.data, success: true });
          } else {
            planningPort.markStepFailed(result.error);
            this.eventBus.emit('tool:result', { name: fc.name, data: result.error, success: false });
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

          // Offload large tool results if contextManager is wired
          if (result.success && this.deps.contextManager && typeof responseData.result === 'string') {
            (responseData as Record<string, unknown>).result =
              this.deps.contextManager.processToolResult(fc.name, responseData.result as string);
          }

          toolResponses.push(this.toToolResponse(fc, responseData));

          // Store successful tool result data in tab session
          if (result.success && tabSession && result.data != null) {
            tabSession.storeData(target.tabId, fc.name, result.data);
          }

          // Navigation triggers rescan — skip remaining calls
          if (result.success && isNavigationTool(fc.name)) {
            this.eventBus.emit('navigation', { toolName: fc.name });
            logger.info('Orchestrator', `Navigation detected (${fc.name}), rescanning`);
            const rescan = await waitForPageAndRescan(target.tabId, tools as unknown as CleanTool[]);
            pageContext = rescan.pageContext;
            tools = rescan.tools as unknown as ToolDefinition[];
            navigatedAtIndex = i;

            // Update tab session with new page context after navigation
            if (tabSession && pageContext) {
              tabSession.setTabContext(target.tabId, {
                url: pageContext.url ?? '',
                title: pageContext.title ?? '',
                extractedData: {},
              });
            }
            break;
          }
        } catch (e) {
          const error = (e as Error).message;
          planningPort.markStepFailed(error);
          this.eventBus.emit('tool:error', { name: fc.name, error });

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

      const updatedConfig = enrichedBuildConfig(pageContext, tools);
      chat.trimHistory();
      currentResult = await chat.sendMessage({
        message: toolResponses,
        config: updatedConfig,
      });
    }

    // Reached max iterations
    this.eventBus.emit('max_iterations');
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
    this.deps.tabSession?.endSession();
    this.eventBus.dispose();
  }

  // ── Private ──

  private buildResult(
    text: string,
    reasoning: string | undefined,
    toolCalls: readonly ToolCallRecord[],
    tools: readonly ToolDefinition[],
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
