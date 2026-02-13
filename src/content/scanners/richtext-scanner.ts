/**
 * Rich Text Scanner — discovers contenteditable surfaces, WYSIWYG editors,
 * social media post composers, and role="textbox" outside <form>.
 */

import type { Tool } from '../../types';
import { BaseScanner } from './base-scanner';

/** All rich text editing surface selectors */
const RICH_TEXT_SELECTORS = [
  // Generic contenteditable
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  // ARIA textbox not inside a standard form
  '[role="textbox"]:not(input):not(textarea)',
  // Platform-specific selectors
  '[data-testid*="tweetTextarea" i]',
  '[data-testid^="tweetTextarea_"]',
  '[data-testid*="dmComposerTextInput" i]',
  '[data-testid*="dmComposer" i]',
  '[data-testid="post-composer" i]',
  '[aria-label*="post" i][contenteditable]',
  '[aria-label*="post your reply" i]',
  '[aria-label*="post your message" i]',
  '[aria-label*="direct message" i]',
  '[aria-label*="What\'s on your mind" i]',
  '[aria-label*="Start a post" i]',
  '[aria-label*="Avvia un post" i]',
  '[aria-label*="write a comment" i]',
  '[aria-label*="write a reply" i]',
  '[aria-label*="scrivi un post" i]',
  '[aria-label*="componi" i]',
  '[aria-label*="comment" i]',
  '[aria-label*="reply" i]',
  '[aria-label*="message" i]',
  '[placeholder*="comment" i]',
  '[placeholder*="reply" i]',
  '[placeholder*="message" i]',
  // Textareas / textboxes for comment/message composers
  'textarea[aria-label*="comment" i]',
  'textarea[aria-label*="reply" i]',
  'textarea[placeholder*="comment" i]',
  'textarea[placeholder*="reply" i]',
  'textarea[placeholder*="message" i]',
  'textarea[data-testid*="comment" i]',
  // YouTube comment UI
  'ytd-comment-simplebox-renderer #contenteditable-root',
  'ytd-comment-simplebox-renderer #simplebox-placeholder',
  // WhatsApp composer surface
  'div[contenteditable="true"][data-tab]',
  'div[data-testid*="conversation-compose-box-input" i]',
  // Popular WYSIWYG editors
  '.DraftEditor-root [contenteditable]',
  '.ProseMirror',
  '.ql-editor',
  '.tox-edit-area__iframe',
  '.ck-editor__editable',
  '[data-slate-editor="true"]',
  '.CodeMirror-code',
  '.monaco-editor .inputarea',
];

/** Map of hostnames to platform display names */
const PLATFORM_MAP: ReadonlyArray<[RegExp, string]> = [
  [/linkedin/i, 'LinkedIn'],
  [/twitter|x\.com/i, 'X/Twitter'],
  [/facebook|fb\.com/i, 'Facebook'],
  [/instagram/i, 'Instagram'],
  [/threads\.net/i, 'Threads'],
  [/reddit/i, 'Reddit'],
  [/mastodon|fosstodon/i, 'Mastodon'],
];

export class RichTextScanner extends BaseScanner {
  readonly category = 'richtext' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const seen = new Set<string>(); // Local dedup

    const elements = (root as ParentNode).querySelectorAll(
      RICH_TEXT_SELECTORS.join(', '),
    );

    for (const el of elements) {
      if (tools.length >= this.maxTools) break;
      if (this.isClaimed(el)) continue;

      // Skip tiny elements (likely hidden or utility)
      const rect = el.getBoundingClientRect?.();
      if (rect && (rect.width < 50 || rect.height < 20)) continue;

      // Skip if inside a form with toolname
      if (el.closest('form[toolname]')) continue;

      // Skip elements that are NOT actual editing surfaces — aria-label selectors
      // (e.g. "[aria-label*='Start a post']") can match trigger buttons
      const label = this.getLabel(el);
      const semanticText = this.buildSemanticText(el, label);
      const isComment = /comment|reply|risposta|commento|rispondi|tweetdetail/i.test(semanticText);
      const isMessage = /message|messaggio|dm|chat|invia messaggio|composer/i.test(semanticText);
      const editable = this.isEditableSurface(el);
      const isCommentTrigger = isComment && this.isLikelyEditorTrigger(el);
      const isMessageTrigger = isMessage && this.isLikelyEditorTrigger(el);
      if (!editable && !isCommentTrigger && !isMessageTrigger) continue;

      // Build a unique key for local dedup
      const elId = el.id || el.getAttribute('data-testid') || '';
      const dedupKey = `${label}::${elId}::${el.tagName}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const slug = this.slugify(label || elId || 'editor');

      // Detect platform from hostname
      const host = location.hostname;
      let platform = '';
      for (const [re, name] of PLATFORM_MAP) {
        if (re.test(host)) {
          platform = name;
          break;
        }
      }

      const descPrefix = platform ? `${platform} — ` : '';
      const toolType = isComment ? 'comment' : isMessage ? 'message' : 'compose';

      this.claim(el);
      tools.push(
        this.createTool(
          `richtext.${toolType}-${slug}`,
          `${descPrefix}Write text in: ${label || 'rich text editor'}`,
          el,
          this.makeInputSchema([
            {
              name: 'text',
              type: 'string',
              description: `Content to write${platform ? ` on ${platform}` : ''}`,
              required: true,
            },
          ]),
          this.computeConfidence({
            hasAria: !!el.getAttribute('aria-label'),
            hasLabel: !!label,
            hasName: !!elId,
            isVisible: true,
            hasRole:
              el.getAttribute('role') === 'textbox' ||
              (el as HTMLElement).isContentEditable,
            hasSemanticTag: false,
          }),
          {
            title: `${descPrefix}${isComment ? 'Comment' : isMessage ? 'Message' : 'Compose'}: ${label || 'text editor'}`,
            annotations: this.makeAnnotations({ destructive: false, idempotent: true }),
          },
        ),
      );
    }

    return tools;
  }

  private isEditableSurface(el: Element): boolean {
    const htmlEl = el as HTMLElement;
    if (htmlEl.isContentEditable) return true;
    if (el.getAttribute('role') === 'textbox') return true;
    if (el.matches('textarea, input[type="text"], .CodeMirror-code, .ProseMirror, .ql-editor')) {
      return true;
    }
    if (el.querySelector('[contenteditable="true"], [contenteditable="plaintext-only"]')) {
      return true;
    }
    return false;
  }

  private isLikelyEditorTrigger(el: Element): boolean {
    if ((el as HTMLElement).isContentEditable) return false;
    if (el.matches('button, [role="button"], [tabindex], ytd-comment-simplebox-renderer #simplebox-placeholder')) {
      return true;
    }
    return false;
  }

  private buildSemanticText(el: Element, label: string): string {
    const ariaLabel = el.getAttribute('aria-label') || '';
    const placeholder = (el as HTMLInputElement).placeholder || '';
    const ariaPlaceholder = el.getAttribute('aria-placeholder') || '';
    const testId = el.getAttribute('data-testid') || '';
    const className = el.getAttribute('class') || '';

    return [
      label,
      ariaLabel,
      placeholder,
      ariaPlaceholder,
      testId,
      className,
    ]
      .join(' ')
      .toLowerCase();
  }
}
