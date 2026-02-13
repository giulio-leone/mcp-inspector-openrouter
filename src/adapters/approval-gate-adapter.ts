/**
 * ApprovalGateAdapter — decorator wrapping IToolExecutionPort.
 *
 * Intercepts Tier 2 (mutation) tool calls, requesting user approval
 * before execution. Implements both IToolExecutionPort and IApprovalGatePort,
 * following the Decorator pattern (OCP: extend behavior without modifying original).
 */

import type { IToolExecutionPort } from '../ports/tool-execution.port';
import type {
  IApprovalGatePort,
  ApprovalDecision,
  ApprovalRequest,
} from '../ports/approval-gate.port';
import type { ToolCallResult, ToolDefinition, ToolTarget } from '../ports/types';
import { SecurityTierLevel } from '../utils/constants';

export type ApprovalCallback = (request: ApprovalRequest) => Promise<ApprovalDecision>;
export type TierResolver = (toolName: string) => number;

export class ApprovalGateAdapter implements IToolExecutionPort, IApprovalGatePort {
  private autoApprove = false;

  constructor(
    private readonly inner: IToolExecutionPort,
    private readonly resolveTier: TierResolver,
    private readonly onApprovalNeeded: ApprovalCallback,
  ) {}

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    target: ToolTarget,
  ): Promise<ToolCallResult> {
    const tier = this.resolveTier(toolName);

    if (tier >= SecurityTierLevel.MUTATION && !this.autoApprove) {
      const decision = await this.onApprovalNeeded({
        toolName,
        args,
        tier,
        description: `Execute ${toolName}`,
      });

      if (decision === 'denied') {
        return {
          success: false,
          error: `Tool "${toolName}" execution denied by user.`,
        };
      }
    }

    return this.inner.execute(toolName, args, target);
  }

  async getAvailableTools(tabId: number): Promise<readonly ToolDefinition[]> {
    return this.inner.getAvailableTools(tabId);
  }

  onToolsChanged(callback: (tools: readonly ToolDefinition[]) => void): () => void {
    return this.inner.onToolsChanged(callback);
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    if (this.autoApprove) return 'approved';
    return this.onApprovalNeeded(request);
  }

  setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  isAutoApprove(): boolean {
    return this.autoApprove;
  }
}
