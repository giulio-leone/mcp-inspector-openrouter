/**
 * chat-ui.ts — Chat bubble rendering and conversation selector UI.
 * Converted from: chat-ui.js
 */

import type { Message, ConversationSummary, MessageRole } from '../types';
import { formatAIText } from '../utils/formatting';

// ── Helpers ──

function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

// ── Public API ──

/** Clear all bubbles from the chat container */
export function clearChat(container: HTMLElement): void {
  container.innerHTML = '';
}

/** Add a bubble to the chat UI and scroll */
export function appendBubble(
  container: HTMLElement,
  role: MessageRole,
  content: string,
  meta: Partial<Message> = {},
): void {
  const bubble = document.createElement('div');
  bubble.className = `bubble bubble-${role}`;

  const body = document.createElement('div');
  body.className = 'bubble-body';

  switch (role) {
    case 'user':
      body.textContent = content;
      break;
    case 'ai':
      body.innerHTML = formatAIText(content);
      break;
    case 'tool_call':
      body.innerHTML = `<span class="tool-icon">⚡</span> <strong>${meta.tool ?? ''}</strong> <code>${JSON.stringify(meta.args ?? {})}</code>`;
      break;
    case 'tool_result':
      body.innerHTML = `<span class="tool-icon">✅</span> <strong>${meta.tool ?? ''}</strong> → <code>${content}</code>`;
      break;
    case 'tool_error':
      body.innerHTML = `<span class="tool-icon">❌</span> <strong>${meta.tool ?? ''}</strong> → <code>${content}</code>`;
      break;
    case 'error':
      body.innerHTML = `<span class="tool-icon">⚠️</span> ${content}`;
      break;
  }

  bubble.appendChild(body);

  const time = document.createElement('div');
  time.className = 'bubble-time';
  time.textContent = new Date(meta.ts ?? Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  bubble.appendChild(time);

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
