import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager, type IResettable } from '../state-manager';
import { PlanManager } from '../plan-manager';

// ── Mocks ──

vi.mock('../chat-ui', () => ({
  clearChat: vi.fn(),
  renderConversationWithActions: vi.fn(),
  appendBubble: vi.fn(),
}));

vi.stubGlobal('chrome', {
  runtime: { id: 'test', onMessage: { addListener: vi.fn() }, sendMessage: vi.fn() },
  storage: { local: { get: vi.fn(), set: vi.fn() }, sync: { get: vi.fn(), set: vi.fn() } },
});

vi.mock('onecrawl', () => ({
  Crawler: class {
    async run() { return { markdown: '' }; }
  }
}));

import { ConversationController, type ConversationState } from '../conversation-controller';
import * as Store from '../chat-store';
import { AIChatController } from '../ai-chat-controller';

// ── Helpers ──

function makeResettable(): IResettable & { calls: number } {
  return {
    calls: 0,
    resetOnConversationChange() { this.calls++; },
  };
}

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

// ── StateManager unit tests ──

describe('StateManager', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = new StateManager();
  });

  it('calls resetOnConversationChange on all registered resettables', () => {
    const a = makeResettable();
    const b = makeResettable();
    sm.register(a);
    sm.register(b);

    sm.resetConversationState();

    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
  });

  it('does not double-register the same instance', () => {
    const a = makeResettable();
    sm.register(a);
    sm.register(a);

    sm.resetConversationState();

    expect(a.calls).toBe(1);
  });

  it('unregister removes the resettable', () => {
    const a = makeResettable();
    sm.register(a);
    sm.unregister(a);

    sm.resetConversationState();

    expect(a.calls).toBe(0);
  });

  it('unregister is a no-op for unknown instances', () => {
    const a = makeResettable();
    expect(() => sm.unregister(a)).not.toThrow();
  });

  it('resetConversationState is safe with no registrations', () => {
    expect(() => sm.resetConversationState()).not.toThrow();
  });
});

// ── PlanManager.resetOnConversationChange ──

describe('PlanManager.resetOnConversationChange', () => {
  it('clears activePlan and _batchStepIdx', () => {
    const container = document.createElement('div');
    const pm = new PlanManager(container);

    // Simulate having an active plan
    (pm as any).activePlan = { plan: {}, element: {}, currentStepIdx: 2 };
    (pm as any)._batchStepIdx = 3;

    pm.resetOnConversationChange();

    expect(pm.activePlan).toBeNull();
    expect((pm as any)._batchStepIdx).toBeNull();
  });

  it('preserves planModeEnabled', () => {
    const container = document.createElement('div');
    const pm = new PlanManager(container, true);

    pm.resetOnConversationChange();

    expect(pm.planModeEnabled).toBe(true);
  });
});

// ── AIChatController.resetOnConversationChange ──

describe('AIChatController.resetOnConversationChange', () => {
  it('clears activeMentions and lastSuggestedUserPrompt (pinnedConv is self-cleaning)', () => {
    const ctrl = new AIChatController({
      chatInput: { setPresets: () => { } } as any,
      chatHeader: {} as any,
      getCurrentTab: async () => undefined,
      getCurrentTools: () => [],
      setCurrentTools: () => { },
      convCtrl: {} as any,
      planManager: {} as any,
      securityDialogEl: {} as any,
    });

    // Simulate stale state
    (ctrl as any).activeMentions = [{ tabId: 1, title: 'foo' }];
    (ctrl as any).lastSuggestedUserPrompt = 'stale prompt';
    (ctrl as any).pinnedConv = { site: 'x', convId: 'y' };

    ctrl.resetOnConversationChange();

    expect((ctrl as any).activeMentions).toEqual([]);
    expect((ctrl as any).lastSuggestedUserPrompt).toBe('');
    // pinnedConv is NOT reset — it self-cleans inside promptAI() to avoid mid-flight race conditions
    expect((ctrl as any).pinnedConv).toEqual({ site: 'x', convId: 'y' });
  });
});

// ── ConversationController integration with StateManager ──

describe('ConversationController + StateManager', () => {
  let sm: StateManager;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    sm = new StateManager();
  });

  function makeController(stateOverrides: Partial<ConversationState> = {}) {
    const container = document.createElement('div');
    const header = makeChatHeader();
    const state = makeState(stateOverrides);
    const ctrl = new ConversationController(container, header, state, sm);
    return { ctrl, container, header, state };
  }

  it('switchToConversation calls stateManager.resetConversationState', () => {
    const spy = vi.spyOn(sm, 'resetConversationState');
    const { ctrl } = makeController();
    const conv = Store.createConversation('example.com');

    ctrl.switchToConversation(conv.id);

    expect(spy).toHaveBeenCalledOnce();
  });

  it('createNewConversation calls stateManager.resetConversationState', () => {
    const spy = vi.spyOn(sm, 'resetConversationState');
    const { ctrl } = makeController();

    ctrl.createNewConversation();

    expect(spy).toHaveBeenCalledOnce();
  });

  it('deleteConversation calls stateManager.resetConversationState', () => {
    const spy = vi.spyOn(sm, 'resetConversationState');
    const { ctrl } = makeController();
    ctrl.createNewConversation();
    spy.mockClear();

    ctrl.deleteConversation();

    expect(spy).toHaveBeenCalledOnce();
  });

  it('deleteConversation resets state once even when switching to remaining conversation', () => {
    const spy = vi.spyOn(sm, 'resetConversationState');
    const { ctrl } = makeController();
    ctrl.createNewConversation();
    ctrl.createNewConversation();
    spy.mockClear();

    ctrl.deleteConversation();

    expect(spy).toHaveBeenCalledOnce();
  });

  it('handleSiteChange calls stateManager.resetConversationState on site change', () => {
    const spy = vi.spyOn(sm, 'resetConversationState');
    const { ctrl } = makeController({ currentConvId: 'conv_123' });

    ctrl.handleSiteChange('other-site.com');

    expect(spy).toHaveBeenCalledOnce();
  });

  it('handleSiteChange does NOT call resetConversationState for same site', () => {
    const spy = vi.spyOn(sm, 'resetConversationState');
    const { ctrl } = makeController({ currentConvId: 'conv_123' });

    ctrl.handleSiteChange('example.com');

    expect(spy).not.toHaveBeenCalled();
  });

  it('handleSiteChange resets trace on site change', () => {
    const { ctrl } = makeController({ currentConvId: 'conv_123' });
    ctrl.state.trace.push({ foo: 'bar' });

    ctrl.handleSiteChange('other-site.com');

    expect(ctrl.state.trace).toEqual([]);
  });

  it('end-to-end: registered PlanManager is reset on conversation switch', () => {
    const container = document.createElement('div');
    const pm = new PlanManager(container);
    sm.register(pm);

    (pm as any).activePlan = { plan: {}, element: {}, currentStepIdx: 0 };

    const { ctrl } = makeController();
    const conv = Store.createConversation('example.com');
    ctrl.switchToConversation(conv.id);

    expect(pm.activePlan).toBeNull();
  });
});
