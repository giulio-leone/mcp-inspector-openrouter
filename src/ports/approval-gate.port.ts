/**
 * IApprovalGatePort — contract for human-in-the-loop approval
 * before executing destructive (Tier 2) tools.
 */

/** Outcome of an approval request */
export type ApprovalDecision = 'approved' | 'denied';

export interface ApprovalRequest {
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly tier: number;
  readonly description: string;
}

export interface IApprovalGatePort {
  /** Check if a tool call requires approval and obtain it */
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>;

  /** Set YOLO mode (auto-approve all) */
  setAutoApprove(enabled: boolean): void;

  /** Check if YOLO mode is active */
  isAutoApprove(): boolean;
}
