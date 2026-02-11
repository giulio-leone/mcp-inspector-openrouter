/**
 * Security dialog — handles user confirmation for tier 1/2 tool executions.
 */

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
