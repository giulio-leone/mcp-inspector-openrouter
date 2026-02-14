/**
 * ai-chat-controller.ts — Handles AI chat initialization, prompt suggestion, and message sending.
 */

import type {
  CleanTool,
  PageContext,
  ScreenshotResponse,
  ContentPart,
} from '../types';
import type { ToolDefinition } from '../ports/types';
import { OpenRouterAdapter, OpenRouterChat } from '../services/adapters';
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_MODEL,
  STORAGE_KEY_SCREENSHOT_ENABLED,
  STORAGE_KEY_ORCHESTRATOR_MODE,
  STORAGE_KEY_YOLO_MODE,
  DEFAULT_MODEL,
} from '../utils/constants';
import * as Store from './chat-store';
import { buildChatConfig } from './config-builder';
import type { PlanManager } from './plan-manager';
import { executeToolLoop } from './tool-loop';
import { AgentOrchestrator } from '../adapters/agent-orchestrator';
import { ChromeToolAdapter } from '../adapters/chrome-tool-adapter';
import { ApprovalGateAdapter } from '../adapters/approval-gate-adapter';
import { PlanningAdapter } from '../adapters/planning-adapter';
import { TabSessionAdapter } from '../adapters/tab-session-adapter';
import { getSecurityTier } from '../content/merge';
import { showApprovalDialog } from './security-dialog';
import type { SecurityDialog } from '../components/security-dialog';
import type { ConversationController } from './conversation-controller';
import type { ChatHeader } from '../components/chat-header';
import type { ChatInput } from '../components/chat-input';
import { createMentionAutocomplete, type MentionAutocomplete, type TabMention } from './tab-mention';
import { logger } from './debug-logger';

export interface AIChatDeps {
  readonly chatInput: ChatInput;
  readonly chatHeader: ChatHeader;
  readonly getCurrentTab: () => Promise<chrome.tabs.Tab | undefined>;
  readonly getCurrentTools: () => CleanTool[];
  readonly setCurrentTools: (tools: CleanTool[]) => void;
  readonly convCtrl: ConversationController;
  readonly planManager: PlanManager;
  readonly securityDialogEl: SecurityDialog;
}

export class AIChatController {
  private genAI: OpenRouterAdapter | undefined;
  private userPromptPendingId = 0;
  private lastSuggestedUserPrompt = '';
  private readonly deps: AIChatDeps;
  private mentionAC: MentionAutocomplete | undefined;
  private activeMentions: TabMention[] = [];
  /** Pinned conversation coordinates for the in-flight request. */
  private pinnedConv: { site: string; convId: string } | null = null;

  constructor(deps: AIChatDeps) {
    this.deps = deps;
  }

  async init(): Promise<void> {
    const result = await chrome.storage.local.get([STORAGE_KEY_API_KEY, STORAGE_KEY_MODEL]);
    let savedApiKey = (result[STORAGE_KEY_API_KEY] as string) ?? '';
    const savedModel = (result[STORAGE_KEY_MODEL] as string) ?? DEFAULT_MODEL;

    if (!savedApiKey) {
      try {
        const res = await fetch('./.env.json');
        if (res.ok) {
          const env = (await res.json()) as { apiKey?: string; model?: string };
          if (env?.apiKey) {
            savedApiKey = env.apiKey;
            await chrome.storage.local.set({
              [STORAGE_KEY_API_KEY]: savedApiKey,
              [STORAGE_KEY_MODEL]: env.model ?? savedModel,
            });
          }
        }
      } catch { /* no env file */ }
    }

    if (savedApiKey) {
      this.genAI = new OpenRouterAdapter({ apiKey: savedApiKey, model: savedModel });
      this.deps.chatInput.disabled = false;
      this.deps.chatHeader.setApiKeyHint(false);
    } else {
      this.genAI = undefined;
      this.deps.chatInput.disabled = true;
      this.deps.chatHeader.setApiKeyHint(true);
    }
  }

  setupListeners(): void {
    const { chatInput, convCtrl } = this.deps;

    chatInput.addEventListener('send-message', async (e: Event): Promise<void> => {
      const message = (e as CustomEvent<{ message: string }>).detail.message;
      try {
        await this.promptAI(message);
      } catch (error) {
        convCtrl.state.trace.push({ error });
        convCtrl.addAndRender('error', `⚠️ Error: "${error}"`, {}, this.pinnedConv ?? undefined);
      }
    });

    // @mention autocomplete — clean up previous instance
    this.mentionAC?.destroy();
    this.mentionAC = createMentionAutocomplete(
      chatInput.querySelector('textarea')!,
      chatInput,
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes[STORAGE_KEY_API_KEY] || changes[STORAGE_KEY_MODEL])) {
        convCtrl.state.chat = undefined;
        void this.init();
      }
    });
  }

  async suggestUserPrompt(): Promise<void> {
    const { chatInput } = this.deps;
    const currentTools = this.deps.getCurrentTools();

    if (
      currentTools.length === 0 ||
      !this.genAI ||
      chatInput.value !== this.lastSuggestedUserPrompt
    )
      return;

    const userPromptId = ++this.userPromptPendingId;
    const response = await this.genAI.sendMessage([
      {
        role: 'user',
        content: [
          '**Context:**',
          `Today's date is: ${this.getFormattedDate()}`,
          '**Task:** Generate one natural user query for the tools below. Output the query text only.',
          '**Tools:**',
          JSON.stringify(currentTools),
        ].join('\n'),
      },
    ]);

    if (
      userPromptId !== this.userPromptPendingId ||
      chatInput.value !== this.lastSuggestedUserPrompt
    )
      return;

    const rawContent = response.choices?.[0]?.message?.content;
    const text = typeof rawContent === 'string' ? rawContent : (rawContent ?? '').toString();
    this.lastSuggestedUserPrompt = text;
    chatInput.value = '';
    for (const chunk of text) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      chatInput.value += chunk;
    }
    chatInput.syncState();
  }

  async promptAI(providedMessage?: string): Promise<void> {
    const { getCurrentTab, convCtrl, planManager, getCurrentTools, setCurrentTools, chatInput } =
      this.deps;

    const tab = await getCurrentTab();
    if (!tab?.id) return;
    convCtrl.ensureConversation();

    // Pin conversation coordinates immediately (before any async yield)
    // so that tab switches during the request don't mis-route messages.
    const pinnedConv = {
      site: convCtrl.state.currentSite,
      convId: convCtrl.state.currentConvId!,
    };
    this.pinnedConv = pinnedConv;

    let chat = convCtrl.state.chat as OpenRouterChat | undefined;
    if (!chat) {
      const result = await chrome.storage.local.get([STORAGE_KEY_API_KEY, STORAGE_KEY_MODEL]);
      const apiKey = (result[STORAGE_KEY_API_KEY] as string) ?? '';
      const model = (result[STORAGE_KEY_MODEL] as string) ?? DEFAULT_MODEL;
      chat = new OpenRouterChat(apiKey, model);
      convCtrl.state.chat = chat;
      if (pinnedConv.convId && pinnedConv.site) {
        const msgs = Store.getMessages(pinnedConv.site, pinnedConv.convId);
        for (const m of msgs) {
          if (m.role === 'user') {
            chat.history.push({ role: 'user', content: m.content });
          } else if (m.role === 'ai') {
            chat.history.push({ role: 'assistant', content: m.content });
          }
        }
      }
    }

    // Parse @mentions — use provided message or read from input
    let message = providedMessage ?? chatInput.value;
    if (!message) return;
    if (this.mentionAC) {
      const parsed = this.mentionAC.parseMentions(message);
      message = parsed.cleanText;
      this.activeMentions = parsed.mentions;
      logger.info('Mention', `Parsed ${parsed.mentions.length} mentions from prompt`, parsed.mentions.map(m => ({ title: m.title, tabId: m.tabId })));
    } else {
      this.activeMentions = [];
    }
    if (!providedMessage) chatInput.clear();
    this.lastSuggestedUserPrompt = '';

    convCtrl.addAndRender('user', message, {}, pinnedConv);

    let pageContext: PageContext | null = null;
    try {
      pageContext = (await chrome.tabs.sendMessage(tab.id, {
        action: 'GET_PAGE_CONTEXT',
      })) as PageContext;
      logger.debug('Context', `Current tab context: title="${pageContext?.title}"`, { url: tab.url });
    } catch (e) {
      logger.warn('Context', `Could not fetch page context from tab ${tab.id}`, e);
    }

    const currentTools = getCurrentTools();
    logger.info('Tools', `Current tab has ${currentTools.length} tools`, currentTools.map(t => t.name));

    // Fetch context and tools from mentioned tabs
    const mentionContexts: { tabId: number; title: string; context: PageContext }[] = [];
    let mentionedTools: CleanTool[] = [];
    for (const mention of this.activeMentions) {
      logger.info('Mention', `Processing mention: "${mention.title}" (tab ${mention.tabId})`);
      try {
        // Ensure content script is injected
        try {
          await chrome.tabs.sendMessage(mention.tabId, { action: 'PING' });
          logger.debug('Mention', `PING succeeded on tab ${mention.tabId}`);
        } catch (pingErr) {
          logger.warn('Mention', `PING failed on tab ${mention.tabId}, injecting content script`, pingErr);
          await chrome.scripting.executeScript({ target: { tabId: mention.tabId }, files: ['content.js'] });
          // Wait for content script to initialize
          await new Promise(r => setTimeout(r, 500));
          logger.info('Mention', `Content script injected on tab ${mention.tabId}`);
        }

        const ctx = await chrome.tabs.sendMessage(mention.tabId, { action: 'GET_PAGE_CONTEXT' }) as PageContext;
        logger.debug('Mention', `Context from "${mention.title}": title="${ctx?.title}"`, { pageText: ctx?.pageText?.slice(0, 200) });
        if (ctx) mentionContexts.push({ tabId: mention.tabId, title: mention.title, context: ctx });

        // Fetch tools from mentioned tab
        logger.info('Mention', `Fetching tools from "${mention.title}" (tab ${mention.tabId})...`);
        const toolsResult = await chrome.tabs.sendMessage(mention.tabId, { action: 'GET_TOOLS_SYNC' }) as { tools?: CleanTool[]; url?: string };
        logger.info('Mention', `Tab "${mention.title}" returned ${toolsResult?.tools?.length ?? 0} tools from ${toolsResult?.url}`,
          toolsResult?.tools?.map(t => ({ name: t.name, category: t.category, source: t._source })));
        if (toolsResult?.tools?.length) {
          mentionedTools = [...mentionedTools, ...toolsResult.tools];
        }
      } catch (e) {
        logger.error('Mention', `Failed to fetch from mentioned tab "${mention.title}" (${mention.tabId})`, e);
      }
    }

    // When mentions are active, use only mentioned tab tools (drop current tab tools to reduce noise).
    // The mentioned tab's tools are what the user cares about; browser tools are added by buildChatConfig.
    const allTools = mentionedTools.length > 0
      ? mentionedTools
      : currentTools;

    logger.info('Tools', `Merged: ${currentTools.length} current + ${mentionedTools.length} mentioned = ${allTools.length} total`);
    if (mentionedTools.length > 0) {
      logger.info('Tools', 'Mentioned tools:', mentionedTools.map(t => t.name));
    }

    const config = buildChatConfig(pageContext, allTools, planManager.planModeEnabled, mentionContexts);
    convCtrl.state.trace.push({ userPrompt: { message, config } });

    let screenshotDataUrl: string | undefined;
    try {
      const screenshotSettings = await chrome.storage.local.get([STORAGE_KEY_SCREENSHOT_ENABLED]);
      if (screenshotSettings[STORAGE_KEY_SCREENSHOT_ENABLED]) {
        const res = (await chrome.runtime.sendMessage({
          action: 'CAPTURE_SCREENSHOT',
        })) as ScreenshotResponse;
        if (res?.screenshot) screenshotDataUrl = res.screenshot;
      }
    } catch (e) {
      console.warn('[Sidebar] Screenshot capture failed:', e);
    }

    const userMessage: string | ContentPart[] = screenshotDataUrl
      ? [
          { type: 'text' as const, text: message },
          { type: 'image_url' as const, image_url: { url: screenshotDataUrl } },
        ]
      : message;

    chat.trimHistory();

    // Determine target tab for tool execution
    const targetTabId = this.activeMentions.length > 0 ? this.activeMentions[0].tabId : tab.id;

    // Check orchestrator mode feature flag
    const orchestratorSettings = await chrome.storage.local.get([STORAGE_KEY_ORCHESTRATOR_MODE]);
    const useOrchestrator = !!orchestratorSettings[STORAGE_KEY_ORCHESTRATOR_MODE];

    if (useOrchestrator) {
      await this.runOrchestrator(
        chat, userMessage, pageContext, allTools, mentionContexts,
        tab.id, planManager, convCtrl, setCurrentTools, pinnedConv,
      );
    } else {
      const initialResult = await chat.sendMessage({ message: userMessage, config });

      const loopResult = await executeToolLoop({
        chat,
        tabId: targetTabId,
        originTabId: tab.id,
        initialResult,
        pageContext,
        currentTools: allTools,
        planManager,
        trace: convCtrl.state.trace,
        addMessage: (role, content, meta) => convCtrl.addAndRender(role, content, meta, pinnedConv),
        getConfig: (ctx) => buildChatConfig(ctx, allTools, planManager.planModeEnabled, mentionContexts),
        onToolsUpdated: (tools) => { setCurrentTools(tools); },
      });

      setCurrentTools(loopResult.currentTools);
    }
    this.pinnedConv = null;
  }

  private async runOrchestrator(
    chat: OpenRouterChat,
    userMessage: string | ContentPart[],
    pageContext: PageContext | null,
    allTools: CleanTool[],
    mentionContexts: { tabId: number; title: string; context: PageContext }[],
    originTabId: number,
    planManager: PlanManager,
    convCtrl: ConversationController,
    setCurrentTools: (tools: CleanTool[]) => void,
    pinnedConv: { site: string; convId: string },
  ): Promise<void> {
    const chromeToolPort = new ChromeToolAdapter();
    const planningAdapter = new PlanningAdapter(planManager);
    const tabSession = new TabSessionAdapter();
    tabSession.startSession();

    // Build tool name → security tier lookup from current tools
    const toolMap = new Map(allTools.map((t) => [t.name, t]));
    const resolveTier = (name: string): number => {
      const tool = toolMap.get(name);
      return tool ? getSecurityTier(tool) : 1; // default: navigation
    };

    // Read YOLO mode setting
    const yoloSettings = await chrome.storage.local.get([STORAGE_KEY_YOLO_MODE]);
    const yoloMode = !!yoloSettings[STORAGE_KEY_YOLO_MODE];

    // Wrap tool port with approval gate
    const { securityDialogEl } = this.deps;
    const approvalGate = new ApprovalGateAdapter(
      chromeToolPort,
      resolveTier,
      (req) => showApprovalDialog(securityDialogEl, req.toolName, req.tier),
    );
    if (yoloMode) approvalGate.setAutoApprove(true);

    const orchestrator = new AgentOrchestrator({
      toolPort: approvalGate,
      contextPort: {} as any, // Not used during run() — context is passed inline
      planningPort: planningAdapter,
      tabSession,
      chatFactory: () => chat,
      buildConfig: (ctx, tools) =>
        buildChatConfig(ctx, tools as unknown as CleanTool[], planManager.planModeEnabled, mentionContexts),
    });

    // Subscribe to events for UI rendering
    orchestrator.onEvent((event) => {
      switch (event.type) {
        case 'tool_call':
          convCtrl.addAndRender('tool_call', '', { tool: event.name, args: event.args }, pinnedConv);
          break;
        case 'tool_result':
          convCtrl.addAndRender(
            'tool_result',
            typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
            { tool: event.name },
            pinnedConv,
          );
          break;
        case 'tool_error':
          convCtrl.addAndRender('tool_error', event.error, { tool: event.name }, pinnedConv);
          break;
        case 'ai_response':
          convCtrl.addAndRender('ai', event.text, { reasoning: event.reasoning }, pinnedConv);
          break;
        case 'timeout':
          convCtrl.addAndRender('error', '⚠️ Tool execution loop timed out after 60s.', {}, pinnedConv);
          break;
        case 'max_iterations':
          convCtrl.addAndRender('error', '⚠️ Reached maximum tool iterations (10).', {}, pinnedConv);
          break;
        case 'navigation':
          logger.info('Orchestrator', `Navigation detected (${event.toolName})`);
          break;
      }
    });

    const result = await orchestrator.run(userMessage, {
      pageContext,
      tools: allTools as unknown as ToolDefinition[],
      conversationHistory: [],
      liveState: null,
      tabId: originTabId,
      mentionContexts: mentionContexts.length > 0
        ? mentionContexts.map((mc) => ({ tabId: mc.tabId, title: mc.title, context: mc.context }))
        : undefined,
    });

    setCurrentTools(result.updatedTools as unknown as CleanTool[]);
    planManager.markRemainingStepsDone();

    await orchestrator.dispose();
  }

  private getFormattedDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
