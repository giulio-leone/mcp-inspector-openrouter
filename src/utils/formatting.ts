/**
 * Text formatting utilities extracted from chat-ui.js.
 * Markdown-to-HTML rendering for AI chat bubbles.
 */

/** Escape HTML special characters */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Truncate text to maxLen characters, appending ellipsis if truncated */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

/** Inline formatting: bold, italic, inline code, links */
export function inlineFormat(text: string): string {
  return (
    text
      // Bold + italic: ***text***
      .replace(
        /\*\*\*(.+?)\*\*\*/g,
        '<strong><em>$1</em></strong>',
      )
      // Bold: **text**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic: *text* (not inside words)
      .replace(
        /(?<!\w)\*([^*]+?)\*(?!\w)/g,
        '<em>$1</em>',
      )
      // Inline code: `text`
      .replace(/`([^`]+?)`/g, '<code>$1</code>')
      // Links: [text](url) — only allow safe protocols
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_match: string, text: string, url: string) => {
          const trimmed = url.trim().toLowerCase();
          if (/^https?:|^mailto:/.test(trimmed)) {
            return `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
          }
          return text;
        },
      )
  );
}

/**
 * Lightweight markdown → HTML renderer for AI chat bubbles.
 * Supports: headings, bold, italic, fenced code blocks, inline code,
 *           ordered/unordered lists, links, and paragraph breaks.
 */
export function formatAIText(text: string): string {
  if (!text) return '';

  // 1. Extract fenced code blocks to protect from further processing
  const codeBlocks: string[] = [];
  let processed = text.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_match: string, lang: string, code: string) => {
      const escaped = escapeHtml(code).trimEnd();
      codeBlocks.push(
        `<pre class="md-codeblock"><code class="lang-${lang || 'text'}">${escaped}</code></pre>`,
      );
      return `\x00CB${codeBlocks.length - 1}\x00`;
    },
  );

  // 2. Escape remaining HTML
  processed = escapeHtml(processed);

  // 3. Process block-level elements line by line
  const lines = processed.split('\n');
  const out: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  for (const line of lines) {
    // Code block placeholder
    const cbMatch = line.match(/^\x00CB(\d+)\x00$/);
    if (cbMatch) {
      if (inList) {
        out.push(`</${inList}>`);
        inList = null;
      }
      out.push(codeBlocks[+cbMatch[1]]);
      continue;
    }

    // Headings: ### heading
    const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      if (inList) {
        out.push(`</${inList}>`);
        inList = null;
      }
      const level = hMatch[1].length + 2;
      out.push(
        `<h${level} class="md-heading">${inlineFormat(hMatch[2])}</h${level}>`,
      );
      continue;
    }

    // Unordered list: - item or * item
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        if (inList) out.push(`</${inList}>`);
        out.push('<ul>');
        inList = 'ul';
      }
      out.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list: 1. item
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        if (inList) out.push(`</${inList}>`);
        out.push('<ol>');
        inList = 'ol';
      }
      out.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Close any open list
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }

    // Empty line → paragraph break
    if (line.trim() === '') {
      out.push('<br>');
      continue;
    }

    // Regular paragraph
    out.push(`<p class="md-p">${inlineFormat(line)}</p>`);
  }

  if (inList) out.push(`</${inList}>`);
  return out.join('');
}
