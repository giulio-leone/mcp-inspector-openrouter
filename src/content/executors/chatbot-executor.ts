/**
 * Chatbot executor: types prompts into AI chatbot inputs and clicks send buttons.
 *
 * Handles both contenteditable divs (Claude, Gemini) and textareas (ChatGPT, Grok)
 * using framework-compatible value setting.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class ChatbotExecutor extends BaseExecutor {
  readonly category = 'chatbot' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const el = this.findElement(tool);
    if (!el) return this.fail('Chatbot element not found');

    if (tool.name === 'chatbot.type-prompt') {
      return this.typePrompt(el, args);
    }
    if (tool.name === 'chatbot.send-message') {
      return this.sendMessage(el);
    }
    return this.fail(`Unknown chatbot tool: "${tool.name}"`);
  }

  private async typePrompt(
    el: Element,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const parsed = this.parseArgs(args);
    const text = String(parsed.text ?? '');

    const htmlEl = el as HTMLElement;
    htmlEl.focus();

    if (el.getAttribute('contenteditable') === 'true') {
      // Contenteditable div (Claude, Gemini, etc.)
      // Clear existing content, then insert via execCommand for React/ProseMirror compat
      const selection = window.getSelection();
      if (selection) {
        selection.selectAllChildren(htmlEl);
        selection.deleteFromDocument();
      }
      document.execCommand('insertText', false, text);
      this.dispatchEvents(el, ['input', 'change']);
    } else {
      // Textarea (ChatGPT, Grok, etc.) — use native setter for React compat
      const textarea = el as HTMLTextAreaElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(textarea, text);
      } else {
        textarea.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Let frameworks react
    await new Promise((r) => setTimeout(r, 100));

    return this.ok(`Typed prompt: "${text}"`);
  }

  private async sendMessage(el: Element): Promise<ExecutionResult> {
    (el as HTMLElement).click();
    return this.ok('Send button clicked');
  }
}
