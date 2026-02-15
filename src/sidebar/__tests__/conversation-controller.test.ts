import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEY_CONVERSATIONS } from '../../utils/constants';

// ── Mocks ──

vi.mock('../chat-ui', () => ({
  clearChat: vi.fn(),
  renderConversationWithActions: vi.fn(),
  appendBubble: vi.fn(),
}));

// Stub chrome API globally (happy-dom doesn't provide it)
vi.stubGlobal('chrome', {
  runtime: { id: 'test', onMessage: { addListener: vi.fn() }, sendMessage: vi.fn() },
  storage: { local: { get: vi.fn(), set: vi.fn() }, sync: { get: vi.fn(), set: vi.fn() } },
});

import { ConversationController, type ConversationState } from '../conversation-controller';
import * as ChatUI from '../chat-ui';
import * as Store from '../chat-store';

// ── Helpers ──

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    currentSite: 'example.com',
    currentConvId: null,
    chat: undefined,
    trace: [],
    ...overrides,
  };
}

function makeChatHeader() {
  return { setConversations: vi.fn() } as unknown as import('../../components/chat-header').ChatHeader;
}

function makeController(stateOverrides: Partial<ConversationState> = {}) {
  const container = document.createElement('div');
  const header = makeChatHeader();
  const state = makeState(stateOverrides);
  const ctrl = new ConversationController(container, header, state);
  return { ctrl, container, header, state };
}

// ── Tests ──

describe('ConversationController', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  // 1. New Chat flow
  describe('createNewConversation', () => {
    it('creates a new conversation and clears the chat', () => {
      const { ctrl, header } = makeController();
      ctrl.createNewConversation();

      expect(ctrl.state.currentConvId).toMatch(/^conv_/);
      expect(ctrl.state.chat).toBeUndefined();
      expect(ctrl.state.trace).toEqual([]);
      expect(ChatUI.clearChat).toHaveBeenCalledOnce();
      expect(header.setConversations).toHaveBeenCalled();

      const convs = Store.listConversations('example.com');
      expect(convs).toHaveLength(1);
    });

    it('persists the conversation in the store', () => {
      const { ctrl } = makeController();
      ctrl.createNewConversation();
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CONVERSATIONS)!);
      expect(raw['example.com']).toHaveLength(1);
    });
  });

  // 2. Delete Chat flow
  describe('deleteConversation', () => {
    it('deletes the current conversation and switches to another', () => {
      const { ctrl, header } = makeController();
      ctrl.createNewConversation();
      const firstId = ctrl.state.currentConvId!;
      ctrl.createNewConversation();
      const secondId = ctrl.state.currentConvId!;

      vi.clearAllMocks();
      // Delete second (current) conv; should switch to first
      ctrl.deleteConversation();

      expect(ctrl.state.currentConvId).toBe(firstId);
      expect(ChatUI.clearChat).toHaveBeenCalled();
      expect(ChatUI.renderConversationWithActions).toHaveBeenCalled();
      expect(header.setConversations).toHaveBeenCalled();
    });

    it('does nothing when currentConvId is null', () => {
      const { ctrl } = makeController();
      ctrl.deleteConversation();
      expect(ChatUI.clearChat).not.toHaveBeenCalled();
    });
  });

  // 3. Tab/Site switching
  describe('handleSiteChange', () => {
    it('resets state when site changes', () => {
      const { ctrl } = makeController({ currentConvId: 'conv_123' });
      const sameSite = ctrl.handleSiteChange('other-site.com');

      expect(sameSite).toBe(false);
      expect(ctrl.state.currentSite).toBe('other-site.com');
      expect(ctrl.state.currentConvId).toBeNull();
      expect(ctrl.state.chat).toBeUndefined();
      expect(ChatUI.clearChat).toHaveBeenCalledOnce();
    });

    it('keeps state when same site', () => {
      const { ctrl } = makeController({ currentConvId: 'conv_123' });
      const sameSite = ctrl.handleSiteChange('example.com');

      expect(sameSite).toBe(true);
      expect(ctrl.state.currentConvId).toBe('conv_123');
      expect(ChatUI.clearChat).not.toHaveBeenCalled();
    });
  });

  // 4. Conversation switching
  describe('switchToConversation', () => {
    it('loads messages and updates dropdown', () => {
      const { ctrl, header } = makeController();
      const conv = Store.createConversation('example.com');
      Store.addMessage('example.com', conv.id, { role: 'user', content: 'Hello' });

      ctrl.switchToConversation(conv.id);

      expect(ctrl.state.currentConvId).toBe(conv.id);
      expect(ctrl.state.chat).toBeUndefined();
      expect(ChatUI.renderConversationWithActions).toHaveBeenCalledOnce();
      const renderedMsgs = (ChatUI.renderConversationWithActions as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(renderedMsgs).toHaveLength(1);
      expect(renderedMsgs[0].content).toBe('Hello');
      expect(header.setConversations).toHaveBeenCalled();
    });
  });

  // 5. Load conversations
  describe('loadConversations', () => {
    it('loads for current site and opens first one', () => {
      const { ctrl, header } = makeController();
      Store.createConversation('example.com', 'Chat A');
      Store.createConversation('example.com', 'Chat B');

      ctrl.loadConversations();

      // listConversations returns most recent first (unshift)
      expect(ctrl.state.currentConvId).toBeTruthy();
      expect(ChatUI.renderConversationWithActions).toHaveBeenCalled();
      expect(header.setConversations).toHaveBeenCalled();
    });

    it('refreshes dropdown when no conversations exist', () => {
      const { ctrl, header } = makeController();
      ctrl.loadConversations();

      expect(ctrl.state.currentConvId).toBeNull();
      expect(header.setConversations).toHaveBeenCalledWith([], null);
    });
  });

  // 6. Multiple new chats
  describe('multiple new chats', () => {
    it('all appear in the dropdown', () => {
      const { ctrl, header } = makeController();
      ctrl.createNewConversation();
      ctrl.createNewConversation();
      ctrl.createNewConversation();

      const convs = Store.listConversations('example.com');
      expect(convs).toHaveLength(3);

      // Last call to setConversations should have all 3
      const lastCall = (header.setConversations as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
      expect(lastCall[0]).toHaveLength(3);
    });
  });

  // 7. Delete last chat
  describe('delete last chat', () => {
    it('shows empty state when only remaining chat is deleted', () => {
      const { ctrl, header } = makeController();
      ctrl.createNewConversation();
      vi.clearAllMocks();

      ctrl.deleteConversation();

      expect(ctrl.state.currentConvId).toBeNull();
      expect(ChatUI.clearChat).toHaveBeenCalled();
      // Should call refreshConversationList with empty list
      const lastCall = (header.setConversations as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
      expect(lastCall[0]).toHaveLength(0);
      expect(lastCall[1]).toBeNull();
    });
  });

  // 8. Delete middle chat
  describe('delete middle chat', () => {
    it('switches to the first remaining conversation', () => {
      const { ctrl } = makeController();
      ctrl.createNewConversation();
      const firstId = ctrl.state.currentConvId!;
      ctrl.createNewConversation();
      ctrl.createNewConversation();
      const thirdId = ctrl.state.currentConvId!;

      // Switch to second and delete it
      const convs = Store.listConversations('example.com');
      // convs[0] is third (most recent), convs[1] is second, convs[2] is first
      const secondId = convs[1].id;
      ctrl.switchToConversation(secondId);
      vi.clearAllMocks();

      ctrl.deleteConversation();

      // Should switch to first remaining (most recent = thirdId)
      expect(ctrl.state.currentConvId).toBe(thirdId);
      expect(Store.listConversations('example.com')).toHaveLength(2);
    });
  });

  // 9. Edit/delete messages
  describe('editMessage', () => {
    it('truncates messages after the edited one and re-renders', () => {
      const { ctrl } = makeController();
      const conv = Store.createConversation('example.com');
      ctrl.state.currentConvId = conv.id;
      Store.addMessage('example.com', conv.id, { role: 'user', content: 'msg1' });
      Store.addMessage('example.com', conv.id, { role: 'ai', content: 'msg2' });
      Store.addMessage('example.com', conv.id, { role: 'user', content: 'msg3' });

      ctrl.editMessage(0, 'edited-msg1');

      const msgs = Store.getMessages('example.com', conv.id);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('edited-msg1');
      expect(ChatUI.renderConversationWithActions).toHaveBeenCalled();
    });

    it('does nothing when currentConvId is null', () => {
      const { ctrl } = makeController();
      ctrl.editMessage(0, 'nope');
      expect(ChatUI.renderConversationWithActions).not.toHaveBeenCalled();
    });

    it('rebuilds chat history when chat instance exists', () => {
      const { ctrl } = makeController();
      const conv = Store.createConversation('example.com');
      ctrl.state.currentConvId = conv.id;
      const fakeChat = { history: [{ role: 'user', content: 'old' }] } as unknown as import('../../services/adapters').OpenRouterChat;
      ctrl.state.chat = fakeChat;
      Store.addMessage('example.com', conv.id, { role: 'user', content: 'msg1' });
      Store.addMessage('example.com', conv.id, { role: 'ai', content: 'msg2' });

      ctrl.editMessage(0, 'new-content');

      expect(fakeChat.history).toEqual([{ role: 'user', content: 'new-content' }]);
    });
  });

  describe('deleteMessage', () => {
    it('truncates from index and re-renders', () => {
      const { ctrl } = makeController();
      const conv = Store.createConversation('example.com');
      ctrl.state.currentConvId = conv.id;
      Store.addMessage('example.com', conv.id, { role: 'user', content: 'msg1' });
      Store.addMessage('example.com', conv.id, { role: 'ai', content: 'msg2' });
      Store.addMessage('example.com', conv.id, { role: 'user', content: 'msg3' });

      ctrl.deleteMessage(1);

      const msgs = Store.getMessages('example.com', conv.id);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('msg1');
      expect(ChatUI.renderConversationWithActions).toHaveBeenCalled();
    });

    it('does nothing when currentConvId is null', () => {
      const { ctrl } = makeController();
      ctrl.deleteMessage(0);
      expect(ChatUI.renderConversationWithActions).not.toHaveBeenCalled();
    });
  });

  // 10. Cross-site isolation
  describe('cross-site isolation', () => {
    it('conversations on site A should not appear on site B', () => {
      const { ctrl } = makeController({ currentSite: 'site-a.com' });
      ctrl.createNewConversation();
      ctrl.createNewConversation();

      ctrl.handleSiteChange('site-b.com');
      ctrl.createNewConversation();

      expect(Store.listConversations('site-a.com')).toHaveLength(2);
      expect(Store.listConversations('site-b.com')).toHaveLength(1);
    });

    it('switching sites clears current conversation', () => {
      const { ctrl } = makeController({ currentSite: 'site-a.com' });
      ctrl.createNewConversation();
      const siteAConvId = ctrl.state.currentConvId!;

      ctrl.handleSiteChange('site-b.com');
      expect(ctrl.state.currentConvId).toBeNull();

      ctrl.handleSiteChange('site-a.com');
      // After switching back, convId is still null until loadConversations
      expect(ctrl.state.currentConvId).toBeNull();

      ctrl.loadConversations();
      expect(ctrl.state.currentConvId).toBe(siteAConvId);
    });
  });

  // 11. addAndRender with pinned
  describe('addAndRender', () => {
    it('stores message to current site/convId by default', () => {
      const { ctrl } = makeController();
      const conv = Store.createConversation('example.com');
      ctrl.state.currentConvId = conv.id;

      ctrl.addAndRender('user', 'Hello world');

      const msgs = Store.getMessages('example.com', conv.id);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('Hello world');
      expect(ChatUI.appendBubble).toHaveBeenCalledOnce();
    });

    it('stores to pinned site/convId even if state changed', () => {
      const { ctrl } = makeController({ currentSite: 'site-a.com' });
      const conv = Store.createConversation('site-a.com');
      const pinnedSite = 'site-a.com';
      const pinnedConvId = conv.id;

      // Simulate state change mid-request
      ctrl.state.currentSite = 'site-b.com';
      ctrl.state.currentConvId = null;

      ctrl.addAndRender('ai', 'response', {}, { site: pinnedSite, convId: pinnedConvId });

      // Message should be stored on site-a, not site-b
      const msgsA = Store.getMessages('site-a.com', pinnedConvId);
      expect(msgsA).toHaveLength(1);
      expect(msgsA[0].content).toBe('response');

      // appendBubble should still be called (renders in current container)
      expect(ChatUI.appendBubble).toHaveBeenCalledOnce();
    });

    it('does not store message when convId is null and no pinned', () => {
      const { ctrl } = makeController();
      // No conv created, convId is null
      ctrl.addAndRender('user', 'orphan message');

      // appendBubble is called (for display) but nothing stored
      expect(ChatUI.appendBubble).toHaveBeenCalledOnce();
      expect(Store.listConversations('example.com')).toHaveLength(0);
    });

    it('passes meta fields through to appendBubble', () => {
      const { ctrl } = makeController();
      const conv = Store.createConversation('example.com');
      ctrl.state.currentConvId = conv.id;

      ctrl.addAndRender('tool_call', 'result', { tool: 'click', args: { selector: '#btn' }, reasoning: 'because' });

      const bubbleCall = (ChatUI.appendBubble as ReturnType<typeof vi.fn>).mock.calls[0];
      const meta = bubbleCall[3];
      expect(meta.tool).toBe('click');
      expect(meta.args).toEqual({ selector: '#btn' });
      expect(meta.reasoning).toBe('because');
    });
  });

  // ensureConversation
  describe('ensureConversation', () => {
    it('creates a conversation when none exists', () => {
      const { ctrl, header } = makeController();
      ctrl.ensureConversation();

      expect(ctrl.state.currentConvId).toMatch(/^conv_/);
      expect(header.setConversations).toHaveBeenCalled();
    });

    it('does nothing when a conversation already exists', () => {
      const { ctrl, header } = makeController({ currentConvId: 'existing_conv' });
      ctrl.ensureConversation();

      expect(ctrl.state.currentConvId).toBe('existing_conv');
      expect(header.setConversations).not.toHaveBeenCalled();
    });
  });

  // refreshConversationList
  describe('refreshConversationList', () => {
    it('passes conversations and activeId to header', () => {
      const { ctrl, header } = makeController();
      const conv = Store.createConversation('example.com', 'Test');
      ctrl.state.currentConvId = conv.id;

      ctrl.refreshConversationList();

      expect(header.setConversations).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: conv.id, title: 'Test' })]),
        conv.id,
      );
    });
  });
});
