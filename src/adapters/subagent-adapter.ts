/**
 * SubagentAdapter — ISubagentPort implementation for browser-based child agents.
 *
 * Manages lightweight subagent tasks with AbortController-based cancellation,
 * configurable depth limits, and timeout enforcement. Subagent execution is
 * delegated to the IAgentPort provided at construction time, enabling
 * recursive agent composition without circular dependencies.
 */

import type { ISubagentPort } from '../ports/subagent.port';
import type { IAgentPort } from '../ports/agent.port';
import type {
  AgentContext,
  SubagentInfo,
  SubagentResult,
  SubagentTask,
} from '../ports/types';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT = 3;

/** Generate a unique subagent ID */
function generateId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export class SubagentAdapter implements ISubagentPort {
  private readonly active = new Map<string, { info: SubagentInfo; abort: AbortController }>();
  private readonly maxDepth: number;

  constructor(private readonly agentFactory: () => IAgentPort, maxDepth = 2) {
    this.maxDepth = maxDepth;
  }

  async spawn(task: SubagentTask): Promise<SubagentResult> {
    const depth = task.depth ?? 0;
    if (depth >= this.maxDepth) {
      return {
        subagentId: '',
        text: '',
        success: false,
        stepsCompleted: 0,
        error: `Max subagent depth (${this.maxDepth}) reached`,
      };
    }

    if (this.active.size >= MAX_CONCURRENT) {
      return {
        subagentId: '',
        text: '',
        success: false,
        stepsCompleted: 0,
        error: `Max concurrent subagents (${MAX_CONCURRENT}) reached`,
      };
    }

    const id = generateId();
    const abort = new AbortController();
    const timeoutMs = task.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const info: SubagentInfo = {
      id,
      task: task.prompt.slice(0, 100),
      startedAt: Date.now(),
      status: 'running',
    };

    this.active.set(id, { info, abort });

    const timer = setTimeout(() => abort.abort(), timeoutMs);

    let agent: IAgentPort | null = null;

    try {
      agent = this.agentFactory();
      const context: AgentContext = task.context ?? {
        pageContext: null,
        tools: task.tools ?? [],
        conversationHistory: [],
        liveState: null,
        tabId: 0,
      };

      const result = await Promise.race([
        agent.run(task.prompt, context),
        new Promise<never>((_, reject) => {
          const onAbort = () => reject(new Error('Subagent cancelled'));
          abort.signal.addEventListener('abort', onAbort);
          if (abort.signal.aborted) onAbort();
        }),
      ]);

      this.updateStatus(id, 'completed');
      return {
        subagentId: id,
        text: result.text,
        success: true,
        stepsCompleted: result.stepsCompleted,
      };
    } catch (e) {
      const error = (e as Error).message;
      const wasCancelled = abort.signal.aborted;
      this.updateStatus(id, wasCancelled ? 'cancelled' : 'failed');

      return {
        subagentId: id,
        text: '',
        success: false,
        stepsCompleted: 0,
        error,
      };
    } finally {
      clearTimeout(timer);
      if (agent) {
        try { await agent.dispose(); } catch { /* best-effort cleanup */ }
      }
      this.active.delete(id);
    }
  }

  getActiveSubagents(): readonly SubagentInfo[] {
    return [...this.active.values()].map((entry) => entry.info);
  }

  async cancel(subagentId: string): Promise<void> {
    const entry = this.active.get(subagentId);
    if (entry) {
      entry.abort.abort();
    }
  }

  // ── Private ──

  private updateStatus(id: string, status: SubagentInfo['status']): void {
    const entry = this.active.get(id);
    if (entry) {
      // SubagentInfo is readonly, so we create a new object
      this.active.set(id, {
        ...entry,
        info: { ...entry.info, status },
      });
    }
  }
}
