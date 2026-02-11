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
  '[data-testid="post-composer" i]',
  '[aria-label*="post" i][contenteditable]',
  '[aria-label*="What\'s on your mind" i]',
  '[aria-label*="Start a post" i]',
  '[aria-label*="write a comment" i]',
  '[aria-label*="write a reply" i]',
  '[aria-label*="scrivi un post" i]',
  '[aria-label*="componi" i]',
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

      // Build a unique key for local dedup
      const label = this.getLabel(el);
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
      const isComment = /comment|reply|risposta|commento/i.test(label || '');
      const toolType = isComment ? 'comment' : 'compose';

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
            title: `${descPrefix}${isComment ? 'Comment' : 'Compose'}: ${label || 'text editor'}`,
            annotations: this.makeAnnotations({ destructive: false, idempotent: true }),
          },
        ),
      );
    }

    return tools;
  }
}
