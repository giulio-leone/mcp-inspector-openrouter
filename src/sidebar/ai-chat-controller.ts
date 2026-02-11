/**
 * ai-chat-controller.ts — Handles AI chat initialization, prompt suggestion, and message sending.
 */

import type {
  CleanTool,
  PageContext,
  ScreenshotResponse,
  ContentPart,
} from '../types';
import { OpenRouterAdapter, OpenRouterChat } from '../services/adapters';
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_MODEL,
  STORAGE_KEY_SCREENSHOT_ENABLED,
  DEFAULT_MODEL,
} from '../utils/constants';
import * as Store from './chat-store';
import { buildChatConfig } from './config-builder';
import type { PlanManager } from './plan-manager';
import { executeToolLoop } from './tool-loop';
import type { ConversationController } from './conversation-controller';
import { createMentionAutocomplete, type MentionAutocomplete, type TabMention } from './tab-mention';
import { logger } from './debug-logger';

export interface AIChatDeps {
  userPromptText: HTMLTextAreaElement;
  promptBtn: HTMLButtonElement;
  apiKeyHint: HTMLDivElement;
  getCurrentTab: () => Promise<chrome.tabs.Tab | undefined>;
  getCurrentTools: () => CleanTool[];
  setCurrentTools: (tools: CleanTool[]) => void;
  convCtrl: ConversationController;
  planManager: PlanManager;
}

export class AIChatController {
  private genAI: OpenRouterAdapter | undefined;
  private userPromptPendingId = 0;
  private lastSuggestedUserPrompt = '';
  private readonly deps: AIChatDeps;
  private mentionAC: MentionAutocomplete | undefined;
  private activeMentions: TabMention[] = [];

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
      this.deps.promptBtn.disabled = false;
      this.deps.apiKeyHint.style.display = 'none';
    } else {
      this.genAI = undefined;
      this.deps.promptBtn.disabled = true;
      this.deps.apiKeyHint.style.display = '';
    }
  }

  setupListeners(): void {
    const { userPromptText, promptBtn, convCtrl } = this.deps;

    userPromptText.onkeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        promptBtn.click();
      }
    };

    promptBtn.onclick = async (): Promise<void> => {
      try {
        await this.promptAI();
      } catch (error) {
        convCtrl.state.trace.push({ error });
        convCtrl.addAndRender('error', `⚠️ Error: "${error}"`);
      }
    };

    // @mention autocomplete
    this.mentionAC = createMentionAutocomplete(
      userPromptText,
      userPromptText.parentElement!,
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes[STORAGE_KEY_API_KEY] || changes[STORAGE_KEY_MODEL])) {
        convCtrl.state.chat = undefined;
        void this.init();
      }
    });
  }

  async suggestUserPrompt(): Promise<void> {
    const { userPromptText } = this.deps;
    const currentTools = this.deps.getCurrentTools();

    if (
      currentTools.length === 0 ||
      !this.genAI ||
      userPromptText.value !== this.lastSuggestedUserPrompt
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
      userPromptText.value !== this.lastSuggestedUserPrompt
    )
      return;

    const rawContent = response.choices?.[0]?.message?.content;
    const text = typeof rawContent === 'string' ? rawContent : (rawContent ?? '').toString();
    this.lastSuggestedUserPrompt = text;
    userPromptText.value = '';
    for (const chunk of text) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      userPromptText.value += chunk;
    }
  }

  async promptAI(): Promise<void> {
    const { getCurrentTab, convCtrl, planManager, getCurrentTools, setCurrentTools, userPromptText } =
      this.deps;

    const tab = await getCurrentTab();
    if (!tab?.id) return;
    convCtrl.ensureConversation();

    let chat = convCtrl.state.chat as OpenRouterChat | undefined;
    if (!chat) {
      const result = await chrome.storage.local.get([STORAGE_KEY_API_KEY, STORAGE_KEY_MODEL]);
      const apiKey = (result[STORAGE_KEY_API_KEY] as string) ?? '';
      const model = (result[STORAGE_KEY_MODEL] as string) ?? DEFAULT_MODEL;
      chat = new OpenRouterChat(apiKey, model);
      convCtrl.state.chat = chat;
      if (convCtrl.state.currentConvId && convCtrl.state.currentSite) {
        const msgs = Store.getMessages(convCtrl.state.currentSite, convCtrl.state.currentConvId);
        for (const m of msgs) {
          if (m.role === 'user') {
            chat.history.push({ role: 'user', content: m.content });
          } else if (m.role === 'ai') {
            chat.history.push({ role: 'assistant', content: m.content });
          }
        }
      }
    }

    // Parse @mentions
    let message = userPromptText.value;
    if (this.mentionAC) {
      const parsed = this.mentionAC.parseMentions(message);
      message = parsed.cleanText;
      this.activeMentions = parsed.mentions;
      logger.info('Mention', `Parsed ${parsed.mentions.length} mentions from prompt`, parsed.mentions.map(m => ({ title: m.title, tabId: m.tabId })));
    } else {
      this.activeMentions = [];
    }
    userPromptText.value = '';
    this.lastSuggestedUserPrompt = '';

    convCtrl.addAndRender('user', message);

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

    // Merge current page tools + mentioned tab tools (dedup by name, mentioned wins)
    const allTools = mentionedTools.length > 0
      ? [...currentTools, ...mentionedTools.filter(mt => !currentTools.some(ct => ct.name === mt.name))]
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

    chat.trimHistory(20);

    const initialResult = await chat.sendMessage({ message: userMessage, config });

    // Determine target tab for tool execution
    const targetTabId = this.activeMentions.length > 0 ? this.activeMentions[0].tabId : tab.id;

    const loopResult = await executeToolLoop({
      chat,
      tabId: targetTabId,
      originTabId: tab.id,
      initialResult,
      pageContext,
      currentTools: allTools,
      planManager,
      trace: convCtrl.state.trace,
      addMessage: (role, content, meta) => convCtrl.addAndRender(role, content, meta),
      getConfig: (ctx) => buildChatConfig(ctx, allTools, planManager.planModeEnabled, mentionContexts),
      onToolsUpdated: (tools) => { setCurrentTools(tools); },
    });

    setCurrentTools(loopResult.currentTools);
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
