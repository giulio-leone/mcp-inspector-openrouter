/**
 * Chatbot Scanner — discovers AI chatbot input fields (ChatGPT, Claude, Gemini, Grok, etc.)
 * and their associated send buttons.
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

/** Selectors for AI chatbot input fields, ordered from specific to generic */
const CHATBOT_INPUT_SELECTORS = [
  // ChatGPT
  '#prompt-textarea',
  'textarea[data-id="root"]',
  'div[contenteditable="true"][id*="prompt"]',
  // Claude
  'div[contenteditable="true"].ProseMirror',
  'div.ProseMirror[contenteditable]',
  // Gemini
  'div[contenteditable="true"][aria-label*="prompt" i]',
  'rich-textarea',
  // Grok
  'textarea[placeholder*="Ask" i]',
  'div[contenteditable="true"][role="textbox"]',
  // Generic
  'textarea[aria-label*="message" i]',
  'textarea[placeholder*="message" i]',
].join(', ');

/** Selectors for send buttons */
const SEND_BUTTON_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[aria-label*="send" i]',
  'button[aria-label*="invia" i]',
];

export class ChatbotScanner extends BaseScanner {
  readonly category = 'chatbot' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const inputs = (root as ParentNode).querySelectorAll(CHATBOT_INPUT_SELECTORS);
    const seen = new Set<Element>();

    for (const inp of inputs) {
      if (seen.has(inp) || this.isClaimed(inp) || !this.isVisible(inp)) continue;
      seen.add(inp);

      const siteName = this.getSiteName();
      const label = this.getLabel(inp) || 'chat input';

      // Type-prompt tool
      tools.push(
        this.createTool(
          'chatbot.type-prompt',
          `Type a prompt in ${siteName} chat`,
          inp,
          this.makeInputSchema([
            {
              name: 'text',
              type: 'string',
              description: 'The text to type in the chat input',
              required: true,
            },
          ]),
          this.computeConfidence({
            hasAria: !!inp.getAttribute('aria-label'),
            hasLabel: !!label,
            hasName: !!inp.getAttribute('name'),
            isVisible: true,
            hasRole: !!inp.getAttribute('role'),
            hasSemanticTag: inp.tagName === 'TEXTAREA',
          }),
        ),
      );
      this.claim(inp);

      // Find send button near the input
      const sendBtn = this.findSendButton(inp, root);
      if (sendBtn && !this.isClaimed(sendBtn)) {
        tools.push(
          this.createTool(
            'chatbot.send-message',
            `Send message in ${siteName} chat`,
            sendBtn,
            this.makeInputSchema([]),
            this.computeConfidence({
              hasAria: !!sendBtn.getAttribute('aria-label'),
              hasLabel: !!this.getLabel(sendBtn),
              hasName: false,
              isVisible: this.isVisible(sendBtn),
              hasRole: sendBtn.tagName === 'BUTTON',
              hasSemanticTag: sendBtn.tagName === 'BUTTON',
            }),
          ),
        );
        this.claim(sendBtn);
      }

      if (tools.length >= this.maxTools) break;
    }

    return tools;
  }

  /** Derive a human-friendly site name from the hostname */
  private getSiteName(): string {
    try {
      const host = location.hostname.replace(/^www\./, '');
      if (host.includes('chat.openai') || host.includes('chatgpt')) return 'ChatGPT';
      if (host.includes('claude.ai')) return 'Claude';
      if (host.includes('gemini.google')) return 'Gemini';
      if (host.includes('grok') || host.includes('x.com')) return 'Grok';
      // Capitalize first segment
      return host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1);
    } catch {
      return 'AI chatbot';
    }
  }

  /** Find the send button closest to a chatbot input */
  private findSendButton(
    input: Element,
    root: Document | Element | ShadowRoot,
  ): Element | null {
    // Check known selectors first
    for (const sel of SEND_BUTTON_SELECTORS) {
      const btn = (root as ParentNode).querySelector(sel);
      if (btn && this.isVisible(btn)) return btn;
    }
    // Fallback: find a button with an SVG near the input's parent container
    const container = input.closest('form') || input.parentElement?.parentElement;
    if (container) {
      const btn = container.querySelector('button svg[viewBox]')?.closest('button');
      if (btn && this.isVisible(btn)) return btn;
    }
    return null;
  }
}
