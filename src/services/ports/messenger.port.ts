/**
 * Messenger port — abstract interface for Chrome extension messaging.
 * Implementations: ChromeMessengerAdapter (Phase 3)
 */

import type { ExtensionMessage } from '../../types';

/** Abstract messenger interface (hexagonal port) */
export interface IMessenger {
  /** Send a message to the background service worker */
  sendToBackground(message: ExtensionMessage): Promise<unknown>;

  /** Send a message to a specific tab's content script */
  sendToTab(tabId: number, message: ExtensionMessage): Promise<unknown>;

  /** Register a handler for incoming messages */
  onMessage(
    handler: (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
    ) => void | Promise<unknown>,
  ): void;
}
