/**
 * conversation-controller.ts — Manages conversation CRUD and DOM wiring.
 */

import type { MessageRole, Message } from '../types';
import type { OpenRouterChat } from '../services/adapters';
import type { ChatHeader } from '../components/chat-header';
import * as Store from './chat-store';
import * as ChatUI from './chat-ui';

export interface ConversationState {
  currentSite: string;
  currentConvId: string | null;
  chat: OpenRouterChat | undefined;
  trace: unknown[];
}

export class ConversationController {
  private readonly chatContainer: HTMLElement;
  private readonly chatHeader: ChatHeader;

  state: ConversationState;

  constructor(
    chatContainer: HTMLElement,
    chatHeader: ChatHeader,
    initialState: ConversationState,
  ) {
    this.chatContainer = chatContainer;
    this.chatHeader = chatHeader;
    this.state = initialState;
  }

  refreshConversationList(): void {
    const convs = Store.listConversations(this.state.currentSite);
    this.chatHeader.setConversations(convs, this.state.currentConvId);
  }

  switchToConversation(convId: string): void {
    this.state.currentConvId = convId;
    this.state.trace = [];
    const msgs = Store.getMessages(this.state.currentSite, convId);
    ChatUI.renderConversationWithActions(this.chatContainer, msgs, {
      onEdit: (i, content) => this.editMessage(i, content),
      onDelete: (i) => this.deleteMessage(i),
    });
    this.refreshConversationList();
    this.state.chat = undefined;
  }

  ensureConversation(): void {
    if (this.state.currentConvId) return;
    const conv = Store.createConversation(this.state.currentSite);
    this.state.currentConvId = conv.id;
    this.refreshConversationList();
  }

  createNewConversation(): void {
    const conv = Store.createConversation(this.state.currentSite);
    this.state.currentConvId = conv.id;
    this.state.chat = undefined;
    this.state.trace = [];
    ChatUI.clearChat(this.chatContainer);
    this.refreshConversationList();
  }

  deleteConversation(): void {
    if (!this.state.currentConvId) return;
    Store.deleteConversation(this.state.currentSite, this.state.currentConvId);
    this.state.currentConvId = null;
    this.state.chat = undefined;
    this.state.trace = [];
    ChatUI.clearChat(this.chatContainer);
    const convs = Store.listConversations(this.state.currentSite);
    if (convs.length > 0) {
      this.switchToConversation(convs[0].id);
    } else {
      this.refreshConversationList();
    }
  }

  /** Handle site change (tab navigation / switch). Resets state if site changed. */
  handleSiteChange(newSite: string): boolean {
    const sameSite = newSite === this.state.currentSite;
    if (!sameSite) {
      this.state.currentSite = newSite;
      this.state.chat = undefined;
      this.state.currentConvId = null;
      ChatUI.clearChat(this.chatContainer);
    }
    return sameSite;
  }

  /** Load conversations for the current site, opening the first one if any exist. */
  loadConversations(): void {
    const convs = Store.listConversations(this.state.currentSite);
    if (convs.length > 0) {
      this.switchToConversation(convs[0].id);
    } else {
      this.refreshConversationList();
    }
  }

  /** Edit a message and truncate conversation after it */
  editMessage(index: number, newContent: string): void {
    if (!this.state.currentConvId) return;
    const msgs = Store.editMessageAt(this.state.currentSite, this.state.currentConvId, index, newContent);

    // Reset OpenRouter chat history to match
    this.rebuildChatHistory(msgs);

    // Re-render
    ChatUI.renderConversationWithActions(this.chatContainer, msgs, {
      onEdit: (i, content) => this.editMessage(i, content),
      onDelete: (i) => this.deleteMessage(i),
    });
  }

  /** Delete a message and all messages after it */
  deleteMessage(index: number): void {
    if (!this.state.currentConvId) return;
    const msgs = Store.deleteMessageAt(this.state.currentSite, this.state.currentConvId, index);

    // Reset OpenRouter chat history to match
    this.rebuildChatHistory(msgs);

    // Re-render
    ChatUI.renderConversationWithActions(this.chatContainer, msgs, {
      onEdit: (i, content) => this.editMessage(i, content),
      onDelete: (i) => this.deleteMessage(i),
    });
  }

  /** Rebuild OpenRouter chat history from stored messages */
  private rebuildChatHistory(msgs: Message[]): void {
    if (!this.state.chat) return;
    const chat = this.state.chat as OpenRouterChat;
    chat.history = [];
    for (const m of msgs) {
      if (m.role === 'user') {
        chat.history.push({ role: 'user', content: m.content });
      } else if (m.role === 'ai') {
        chat.history.push({ role: 'assistant', content: m.content });
      }
    }
  }

  /** Add a message and render it in the chat.
   *  When `pinned` is provided, the message is stored against that
   *  site/convId regardless of the current mutable state — this prevents
   *  cross-tab routing bugs when the user switches tabs mid-request.
   */
  addAndRender(
    role: MessageRole,
    content: string,
    meta: Record<string, unknown> = {},
    pinned?: { site: string; convId: string },
  ): void {
    const site = pinned?.site ?? this.state.currentSite;
    const convId = pinned?.convId ?? this.state.currentConvId;

    const msg = { role, content, ...meta };
    if (convId) {
      Store.addMessage(site, convId, msg);
    }
    ChatUI.appendBubble(this.chatContainer, role, content, {
      role,
      content,
      ts: Date.now(),
      ...(meta.tool ? { tool: meta.tool as string } : {}),
      ...(meta.args ? { args: meta.args as Record<string, unknown> } : {}),
      ...(meta.reasoning ? { reasoning: meta.reasoning as string } : {}),
    });
  }
}
