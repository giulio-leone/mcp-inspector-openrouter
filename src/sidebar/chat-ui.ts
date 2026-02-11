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
    case 'ai': {
      if (meta.reasoning) {
        const details = document.createElement('details');
        details.className = 'reasoning-accordion';

        const summary = document.createElement('summary');
        summary.className = 'reasoning-summary';
        summary.innerHTML = '💭 <span>Reasoning</span>';
        details.appendChild(summary);

        const reasoningBody = document.createElement('div');
        reasoningBody.className = 'reasoning-body';
        reasoningBody.textContent = meta.reasoning;
        details.appendChild(reasoningBody);

        body.appendChild(details);
      }

      if (content) {
        const textDiv = document.createElement('div');
        textDiv.innerHTML = formatAIText(content);
        body.appendChild(textDiv);
      } else if (meta.reasoning) {
        const notice = document.createElement('div');
        notice.className = 'reasoning-notice';
        notice.textContent = '⚠️ The model used all output tokens for reasoning. Check the reasoning above for details.';
        body.appendChild(notice);
      }
      break;
    }
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
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    appendBubbleWithActions(container, msg.role, msg.content, msg, i, actions);
  }
}

function appendBubbleWithActions(
  container: HTMLElement,
  role: MessageRole,
  content: string,
  meta: Partial<Message>,
  index: number,
  actions: MessageActions,
): void {
  appendBubble(container, role, content, meta);

  const bubble = container.lastElementChild as HTMLElement;
  if (!bubble) return;

  const actionsBar = document.createElement('div');
  actionsBar.className = 'bubble-actions';

  // Edit button (only for user messages)
  if (role === 'user') {
    const editBtn = document.createElement('button');
    editBtn.className = 'bubble-action-btn';
    editBtn.title = 'Edit message';
    editBtn.textContent = '✏️';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      const currentText = content;
      const bodyEl = bubble.querySelector('.bubble-body') as HTMLElement;
      if (!bodyEl) return;

      const textarea = document.createElement('textarea');
      textarea.className = 'bubble-edit-input';
      textarea.value = currentText;
      textarea.rows = Math.min(6, Math.max(2, currentText.split('\n').length));

      const btnRow = document.createElement('div');
      btnRow.className = 'bubble-edit-btns';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = '✅ Save';
      saveBtn.className = 'bubble-edit-save';
      saveBtn.onclick = () => {
        const newContent = textarea.value.trim();
        if (newContent && newContent !== currentText) {
          actions.onEdit(index, newContent);
        } else {
          bodyEl.textContent = currentText;
          btnRow.remove();
        }
      };

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '❌ Cancel';
      cancelBtn.className = 'bubble-edit-cancel';
      cancelBtn.onclick = () => {
        bodyEl.textContent = currentText;
        btnRow.remove();
      };

      btnRow.appendChild(saveBtn);
      btnRow.appendChild(cancelBtn);

      bodyEl.textContent = '';
      bodyEl.appendChild(textarea);
      bodyEl.appendChild(btnRow);
      textarea.focus();
    };
    actionsBar.appendChild(editBtn);
  }

  // Delete button (for all message types)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'bubble-action-btn';
  deleteBtn.title = 'Delete this and all subsequent messages';
  deleteBtn.textContent = '🗑️';
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    actions.onDelete(index);
  };
  actionsBar.appendChild(deleteBtn);

  bubble.appendChild(actionsBar);
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
