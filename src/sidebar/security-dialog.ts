/**
 * Security dialog — handles user confirmation for tier 1/2 tool executions.
 */

import type { ApprovalDecision } from '../ports/approval-gate.port';

export interface SecurityDialogRefs {
  dialog: HTMLDialogElement;
  toolName: HTMLSpanElement;
  desc: HTMLParagraphElement;
  cancelBtn: HTMLButtonElement;
  confirmBtn: HTMLButtonElement;
}

interface PendingConfirmation {
  tabId: number | undefined;
  toolName: string;
}

let _pendingConfirm: PendingConfirmation | null = null;

export function initSecurityDialog(refs: SecurityDialogRefs): void {
  refs.cancelBtn.onclick = (): void => {
    refs.dialog.close();
    if (_pendingConfirm?.tabId) {
      chrome.tabs.sendMessage(_pendingConfirm.tabId, {
        action: 'CANCEL_EXECUTE',
        toolName: _pendingConfirm.toolName,
      });
    }
    _pendingConfirm = null;
  };

  refs.confirmBtn.onclick = (): void => {
    refs.dialog.close();
    if (_pendingConfirm?.tabId) {
      chrome.tabs.sendMessage(_pendingConfirm.tabId, {
        action: 'CONFIRM_EXECUTE',
        toolName: _pendingConfirm.toolName,
      });
    }
    _pendingConfirm = null;
  };
}

export function handleConfirmExecution(
  refs: SecurityDialogRefs,
  msg: { toolName: string; description: string; tier: number },
  sender: chrome.runtime.MessageSender,
): void {
  refs.toolName.textContent = msg.toolName;
  refs.desc.textContent = `This tool performs a ${msg.tier === 2 ? 'mutation' : 'navigation'} action: ${msg.description || msg.toolName}. Are you sure you want to execute it?`;
  _pendingConfirm = { tabId: sender.tab?.id, toolName: msg.toolName };
  refs.dialog.showModal();
}

/**
 * Promise-based approval dialog for the orchestrator flow.
 * Shows the security dialog and resolves when the user clicks confirm/cancel
 * or dismisses via Escape. Uses addEventListener with AbortController to avoid
 * overwriting legacy onclick handlers from initSecurityDialog.
 */
export function showApprovalDialog(
  refs: SecurityDialogRefs,
  toolName: string,
  tier: number,
): Promise<ApprovalDecision> {
  return new Promise((resolve) => {
    const ac = new AbortController();
    const { signal } = ac;

    const done = (decision: ApprovalDecision): void => {
      ac.abort();
      if (refs.dialog.open) refs.dialog.close();
      resolve(decision);
    };

    refs.toolName.textContent = toolName;
    refs.desc.textContent = `This tool performs a ${tier === 2 ? 'mutation' : 'navigation'} action: ${toolName}. Allow execution?`;

    refs.confirmBtn.addEventListener('click', () => done('approved'), { signal });
    refs.cancelBtn.addEventListener('click', () => done('denied'), { signal });
    refs.dialog.addEventListener('cancel', () => done('denied'), { signal });

    if (refs.dialog.open) refs.dialog.close();
    refs.dialog.showModal();
  });
}
