/**
 * Chrome Messenger adapter — implements IMessenger using chrome.runtime / chrome.tabs.
 */

import type { IMessenger } from '../ports';
import type { ExtensionMessage } from '../../types';

export class ChromeMessengerAdapter implements IMessenger {
  async sendToBackground(message: ExtensionMessage): Promise<unknown> {
    return chrome.runtime.sendMessage(message);
  }

  async sendToTab(
    tabId: number,
    message: ExtensionMessage,
  ): Promise<unknown> {
    return chrome.tabs.sendMessage(tabId, message);
  }

  onMessage(
    handler: (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
    ) => void | Promise<unknown>,
  ): void {
    chrome.runtime.onMessage.addListener(
      (
        message: ExtensionMessage,
        sender: chrome.runtime.MessageSender,
        _sendResponse: (response?: unknown) => void,
      ) => {
        handler(message, sender);
      },
    );
  }
}
