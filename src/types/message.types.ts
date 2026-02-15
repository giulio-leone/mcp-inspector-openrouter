/**
 * Chrome extension message types (content ↔ background ↔ sidebar).
 * Uses discriminated unions on the `action` field.
 * Extracted from: content.js, background.js, sidebar.js
 */

import type { CleanTool } from './tool.types';

// ── Content Script Messages (sidebar/background → content) ──

export interface PingMessage {
  readonly action: 'PING';
}

export interface SetLockModeMessage {
  readonly action: 'SET_LOCK_MODE';
  readonly inputArgs: { readonly locked: boolean };
}

export interface GetPageContextMessage {
  readonly action: 'GET_PAGE_CONTEXT';
}

export interface ListToolsMessage {
  readonly action: 'LIST_TOOLS';
}

export interface ExecuteToolMessage {
  readonly action: 'EXECUTE_TOOL';
  readonly name: string;
  readonly inputArgs: string;
}

export interface GetCrossDocumentResultMessage {
  readonly action: 'GET_CROSS_DOCUMENT_SCRIPT_TOOL_RESULT';
}

export interface ConfirmExecuteMessage {
  readonly action: 'CONFIRM_EXECUTE';
  readonly toolName: string;
}

export interface CancelExecuteMessage {
  readonly action: 'CANCEL_EXECUTE';
  readonly toolName: string;
}

export interface CaptureScreenshotMessage {
  readonly action: 'CAPTURE_SCREENSHOT';
}

export interface GetToolsSyncMessage {
  readonly action: 'GET_TOOLS_SYNC';
}

export interface GetSiteManifestMessage {
  readonly action: 'GET_SITE_MANIFEST';
}

/** All messages that can be sent TO the content script */
export type ContentScriptMessage =
  | PingMessage
  | SetLockModeMessage
  | GetPageContextMessage
  | ListToolsMessage
  | GetToolsSyncMessage
  | ExecuteToolMessage
  | GetCrossDocumentResultMessage
  | ConfirmExecuteMessage
  | CancelExecuteMessage
  | CaptureScreenshotMessage
  | GetSiteManifestMessage;

// ── Background Script Messages ──

export interface AIClassifyMessage {
  readonly action: 'AI_CLASSIFY';
  readonly model: string;
  readonly prompt: string;
}

/** All messages that can be sent TO the background script */
export type BackgroundMessage = AIClassifyMessage | CaptureScreenshotMessage;

// ── Sidebar Messages (content → sidebar via runtime) ──

/** Tool list broadcast from content script */
export interface ToolListMessage {
  readonly tools: readonly CleanTool[];
  readonly url: string;
}

/** Error message from content script */
export interface ErrorMessage {
  readonly message: string;
}

/** Security confirmation dialog request */
export interface ConfirmExecutionMessage {
  readonly action: 'CONFIRM_EXECUTION';
  readonly toolName: string;
  readonly description: string;
  readonly tier: number;
}

/** All messages that can be sent TO the sidebar */
export type SidebarMessage =
  | ToolListMessage
  | ErrorMessage
  | ConfirmExecutionMessage;

// ── Union of all extension messages ──

export type ExtensionMessage =
  | ContentScriptMessage
  | BackgroundMessage
  | SidebarMessage;

// ── Response types ──

export interface PingResponse {
  readonly status: 'pong';
}

export interface LockResponse {
  readonly locked: boolean;
}

export interface QueuedResponse {
  readonly queued: true;
}

export interface AIClassifyResponse {
  readonly text?: string;
  readonly error?: string;
}

export interface ScreenshotResponse {
  readonly screenshot?: string;
  readonly error?: string;
}
