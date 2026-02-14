/**
 * chat-ui.ts — Chat bubble rendering and conversation selector UI.
 * Delegates rendering to <chat-bubble> and <chat-container> Lit components.
 */

import type { Message, ConversationSummary, MessageRole } from '../types';
import type { ChatBubble as ChatBubbleElement } from '../components/chat-bubble';
import type { ChatContainer as ChatContainerElement } from '../components/chat-container';

import '../components/chat-bubble';
import '../components/chat-container';

// ── Helpers ──

function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

function isLitContainer(el: HTMLElement): el is ChatContainerElement {
  return 'clear' in el && typeof (el as ChatContainerElement).clear === 'function';
}

// ── Public API ──

/** Clear all bubbles from the chat container */
export function clearChat(container: HTMLElement): void {
  if (isLitContainer(container)) {
    container.clear();
  } else {
    container.innerHTML = '';
  }
}

/** Add a bubble to the chat UI and scroll */
export function appendBubble(
  container: HTMLElement,
  role: MessageRole,
  content: string,
  meta: Partial<Message> = {},
): void {
  const bubble = document.createElement('chat-bubble') as ChatBubbleElement;
  bubble.role = role;
  bubble.content = content;
  bubble.timestamp = meta.ts ?? Date.now();
  if (meta.tool) bubble.toolName = meta.tool;
  if (meta.args) bubble.toolArgs = meta.args;
  if (meta.reasoning) bubble.reasoning = meta.reasoning;
  container.appendChild(bubble);
  scrollToBottom(container);
}

/** Render all messages from a conversation */
export function renderConversation(
  container: HTMLElement,
  messages: readonly Message[],
): void {
  clearChat(container);
  for (const msg of messages) {
    appendBubble(container, msg.role, msg.content, msg);
  }
}

// ── Message actions (edit/delete) ──

export interface MessageActions {
  onEdit: (index: number, newContent: string) => void;
  onDelete: (index: number) => void;
}

/** Render conversation with edit/delete actions on each message */
export function renderConversationWithActions(
  container: HTMLElement,
  messages: readonly Message[],
  actions: MessageActions,
): void {
  clearChat(container);

  // Use event delegation on the container instead of per-bubble listeners
  const editHandler = ((e: CustomEvent) => {
    actions.onEdit(e.detail.index, e.detail.content);
  }) as EventListener;
  const deleteHandler = ((e: CustomEvent) => {
    actions.onDelete(e.detail.index);
  }) as EventListener;

  // Remove previous listeners (stored on element) before adding new ones
  const el = container as HTMLElement & { _editHandler?: EventListener; _deleteHandler?: EventListener };
  if (el._editHandler) container.removeEventListener('bubble-edit', el._editHandler);
  if (el._deleteHandler) container.removeEventListener('bubble-delete', el._deleteHandler);
  el._editHandler = editHandler;
  el._deleteHandler = deleteHandler;

  container.addEventListener('bubble-edit', editHandler);
  container.addEventListener('bubble-delete', deleteHandler);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const bubble = document.createElement('chat-bubble') as ChatBubbleElement;
    bubble.role = msg.role;
    bubble.content = msg.content;
    bubble.timestamp = msg.ts ?? Date.now();
    if (msg.tool) bubble.toolName = msg.tool;
    if (msg.args) bubble.toolArgs = msg.args;
    if (msg.reasoning) bubble.reasoning = msg.reasoning;
    bubble.editable = true;
    bubble.index = i;
    container.appendChild(bubble);
  }

  scrollToBottom(container);
}

/** Populate the conversation selector dropdown */
export function populateSelector(
  select: HTMLSelectElement,
  conversations: readonly ConversationSummary[],
  activeId: string | null,
): void {
  select.innerHTML = '';
  if (conversations.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No conversations';
    opt.disabled = true;
    opt.selected = true;
    select.appendChild(opt);
    return;
  }
  for (const conv of conversations) {
    const opt = document.createElement('option');
    opt.value = conv.id;
    opt.textContent = conv.title;
    if (conv.id === activeId) opt.selected = true;
    select.appendChild(opt);
  }
}
