/**
 * Rich-text executor: Quill, Draft.js, ProseMirror, generic contenteditable.
 * Uses paste simulation for React-based editors to keep internal state in sync.
 */

import type { Tool } from '../../types';
import { BaseExecutor, type ExecutionResult } from './base-executor';

/** Check if an element is connected and has non-zero height */
function isReady(el: Element | null | undefined): el is HTMLElement {
  return (
    !!el &&
    el.isConnected &&
    (el as HTMLElement).getBoundingClientRect().height > 0
  );
}

/** HTML-escape a string */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Find a contenteditable editor on the page (priority order) */
function findEditor(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.ql-editor[contenteditable="true"], ' +
      '.ProseMirror[contenteditable="true"], ' +
      '[contenteditable="true"][role="textbox"], ' +
      '[contenteditable="true"]',
  );
}

/** Pattern matching content-creation trigger buttons (multilingual) */
const TRIGGER_RE =
  /\b(post|compose|write|create|tweet|reply|comment|scrivi|pubblica|crea|nouveau|erstellen|escribir|rédiger)\b/i;

export class RichTextExecutor extends BaseExecutor {
  readonly category = 'richtext' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const parsed = this.parseArgs(args);
    const text = String(parsed.text ?? '');
    if (!text) return this.fail('No text provided');

    try {
      const editable = await this.resolveEditor(tool);
      if (!isReady(editable)) {
        return this.fail('Editor not found — could not activate the composer');
      }

      const isQuill =
        editable.classList.contains('ql-editor') ||
        !!editable.closest?.('.ql-container');

      // Focus & settle
      editable.focus();
      await this.delay(200);

      const lines = text.split('\n');

      if (isQuill) {
        this.insertQuill(editable, lines);
      } else {
        await this.insertPaste(editable, text, lines);
      }

      // Notify framework
      editable.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text,
        }),
      );
      editable.dispatchEvent(new Event('change', { bubbles: true }));

      return this.ok(
        `Wrote ${text.length} chars to "${tool.title ?? tool.name}"`,
      );
    } catch (e) {
      // Ultimate fallback: innerHTML with <p> tags
      return this.fallbackInsert(tool, text, e as Error);
    }
  }

  /** Resolve or activate the editable element */
  private async resolveEditor(tool: Tool): Promise<HTMLElement | null> {
    let editable = this.findElement(tool) as HTMLElement | null;

    // If _el is a container, drill down to the actual editable child
    if (editable && !editable.getAttribute?.('contenteditable')) {
      editable =
        editable.querySelector<HTMLElement>('.ql-editor') ??
        editable.querySelector<HTMLElement>('[contenteditable="true"]') ??
        editable;
    }

    if (isReady(editable)) return editable;

    // Maybe there's already an editor elsewhere on the page
    editable = findEditor();
    if (isReady(editable)) return editable;

    // No editor in DOM — scan for a trigger button
    const buttons = [
      ...document.querySelectorAll<HTMLElement>('button, [role="button"]'),
    ];
    const trigger = buttons.find((btn) => {
      if (!isReady(btn)) return false;
      const label = (
        (btn.textContent ?? '') +
        ' ' +
        (btn.getAttribute('aria-label') ?? '')
      ).toLowerCase();
      return TRIGGER_RE.test(label);
    });

    if (trigger) {
      trigger.click();
      // Poll for editor to appear (up to ~3 s)
      for (let i = 0; i < 15; i++) {
        await this.delay(200);
        editable = findEditor();
        if (isReady(editable)) break;
      }
    }

    return editable;
  }

  /** Quill: build <p> elements directly (Quill's MutationObserver syncs) */
  private insertQuill(editable: HTMLElement, lines: string[]): void {
    editable.innerHTML = '';
    for (const line of lines) {
      const p = document.createElement('p');
      if (line.trim().length === 0) {
        p.innerHTML = '<br>';
      } else {
        p.textContent = line;
      }
      editable.appendChild(p);
    }
    editable.classList.remove('ql-blank');
  }

  /** Paste simulation for Draft.js, ProseMirror, Slate, etc. */
  private async insertPaste(
    editable: HTMLElement,
    text: string,
    lines: string[],
  ): Promise<void> {
    // Select all existing content
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(editable);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Build clipboard data
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    dt.setData(
      'text/html',
      lines.map((l) => `<p>${l.trim() ? esc(l) : '<br>'}</p>`).join(''),
    );

    // Dispatch paste event
    editable.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      }),
    );

    await this.delay(500);

    // Verify: if paste didn't insert anything, fall back to execCommand
    const content = editable.innerText || editable.textContent || '';
    if (content.trim().length < 5) {
      console.warn(
        '[WMCP-Executor] Paste simulation did not take effect, falling back to execCommand',
      );
      editable.focus();
      document.execCommand('selectAll', false, undefined);
      document.execCommand('delete', false, undefined);
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          document.execCommand('insertParagraph', false, undefined);
        }
        if (lines[i].length > 0) {
          document.execCommand('insertText', false, lines[i]);
        }
        if (i % 3 === 2) {
          await this.delay(15);
        }
      }
    }
  }

  /** Last-resort fallback: innerHTML with <p> tags */
  private fallbackInsert(
    tool: Tool,
    text: string,
    originalError: Error,
  ): ExecutionResult {
    console.warn('[WMCP-Executor] richtext failed:', originalError);
    try {
      const fb = findEditor() ?? (this.findElement(tool) as HTMLElement | null);
      if (!fb) return this.fail(`Failed: ${originalError.message}`);

      const lines = text.split('\n');
      fb.innerHTML = lines
        .map((l) => `<p>${l.trim() ? esc(l) : '<br>'}</p>`)
        .join('');
      fb.classList?.remove('ql-blank');
      fb.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text,
        }),
      );
      return this.ok(
        `Wrote ${text.length} chars (fallback) to "${tool.title ?? tool.name}"`,
      );
    } catch {
      return this.fail(`Failed: ${originalError.message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
