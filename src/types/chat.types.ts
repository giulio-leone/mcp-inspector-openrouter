/**
 * Chat and conversation types.
 * Extracted from: chat-store.js, chat-ui.js, sidebar.js
 */

// ── Message Roles ──

/** Roles for stored/rendered chat messages */
export type MessageRole =
  | 'user'
  | 'ai'
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  | 'error';

// ── Messages ──

/** A chat message as stored in conversation history */
export interface Message {
  readonly role: MessageRole;
  readonly content: string;
  /** Timestamp (epoch ms) — added by chat-store on save */
  readonly ts?: number;
  /** Tool name (for tool_call / tool_result / tool_error roles) */
  readonly tool?: string;
  /** Tool arguments (for tool_call role) */
  readonly args?: Record<string, unknown>;
}

// ── Conversations ──

/** A full conversation with all messages */
export interface Conversation {
  readonly id: string;
  title: string;
  ts: number;
  messages: Message[];
}

/** Summary of a conversation for the selector dropdown */
export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly ts: number;
}

/** All conversations organized by site key (hostname) */
export type ConversationStore = Record<string, Conversation[]>;
