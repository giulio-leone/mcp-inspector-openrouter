/**
 * Security dialog — handles user confirmation for tier 1/2 tool executions.
 *
 * Two mutually exclusive approval paths exist:
 * - CONFIRM_EXECUTION: legacy content-script mode (handled in index.ts)
 * - showApprovalDialog: orchestrator mode (this module)
 *
 * They share a single AbortController (_pendingApprovalAC) so that starting
 * a new approval flow from either path cancels any pending one, preventing
 * cross-fire between the two.
 */

import type { ApprovalDecision } from '../ports/approval-gate.port';

/** Shared controller — aborted whenever a new approval flow starts from either path. */
let _pendingApprovalAC: AbortController | null = null;

/**
 * Abort any pending approval flow (from either CONFIRM_EXECUTION or
 * showApprovalDialog) and return a fresh AbortController for the new flow.
 * Exported so index.ts can call it from the CONFIRM_EXECUTION handler.
 */
export function resetApprovalController(): AbortController {
  _pendingApprovalAC?.abort();
  const ac = new AbortController();
  _pendingApprovalAC = ac;
  return ac;
}

/**
 * Promise-based approval dialog for the orchestrator flow.
 * Uses the <security-dialog> component's show() method and one-time event
 * listeners, avoiding direct DOM ref access that crashes when dialog is closed.
 *
 * If a previous dialog is still pending it is automatically superseded
 * (resolved as denied) before the new one opens.
 */
export function showApprovalDialog(
  dialogEl: import('../components/security-dialog').SecurityDialog,
  toolName: string,
  tier: number,
): Promise<ApprovalDecision> {
  // Abort any previous pending dialog (from either path) so its promise settles.
  const ac = resetApprovalController();

  return new Promise((resolve) => {
    const { signal } = ac;
    let settled = false;

    const done = (decision: ApprovalDecision): void => {
      if (settled) return;
      settled = true;
      ac.abort();
      resolve(decision);
    };

    // If preempted before listeners fire, resolve immediately as denied.
    signal.addEventListener('abort', () => done('denied'), { once: true });
    if (signal.aborted) {
      done('denied');
      return;
    }

    dialogEl.addEventListener('security-approve', () => done('approved'), { signal });
    dialogEl.addEventListener('security-deny', () => done('denied'), { signal });

    dialogEl.show({
      toolName,
      securityTier: tier,
      details: `This tool performs a ${tier === 2 ? 'mutation' : 'navigation'} action: ${toolName}. Allow execution?`,
    });
  });
}
