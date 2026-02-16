import { describe, it, expect } from 'vitest';
import { escapeHtml, truncate, inlineFormat, formatAIText } from '../formatting';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles multiple special chars together', () => {
    expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('escapes double quotes to &quot;', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes to &#39;', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes combined XSS payload', () => {
    expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe(
      '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;',
    );
  });
});

describe('truncate', () => {
  it('returns short text unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and adds ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
  });

  it('returns exact-length text unchanged', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('inlineFormat', () => {
  it('converts bold text', () => {
    expect(inlineFormat('**bold**')).toBe('<strong>bold</strong>');
  });

  it('converts italic text', () => {
    expect(inlineFormat('*italic*')).toBe('<em>italic</em>');
  });

  it('converts bold+italic text', () => {
    expect(inlineFormat('***both***')).toBe('<strong><em>both</em></strong>');
  });

  it('converts inline code', () => {
    expect(inlineFormat('use `npm install`')).toBe('use <code>npm install</code>');
  });

  it('converts links', () => {
    expect(inlineFormat('[Google](https://google.com)')).toBe(
      '<a href="https://google.com" target="_blank" rel="noopener">Google</a>',
    );
  });

  it('handles multiple inline formats in one line', () => {
    const result = inlineFormat('**bold** and `code`');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<code>code</code>');
  });

  it('returns plain text unchanged', () => {
    expect(inlineFormat('just text')).toBe('just text');
  });
});

describe('formatAIText', () => {
  it('returns empty string for empty input', () => {
    expect(formatAIText('')).toBe('');
  });

  it('returns empty string for falsy input', () => {
    expect(formatAIText(undefined as unknown as string)).toBe('');
  });

  it('wraps plain text in paragraph', () => {
    expect(formatAIText('hello')).toBe('<p class="md-p">hello</p>');
  });

  it('renders headings', () => {
    const result = formatAIText('## Heading');
    expect(result).toBe('<h4 class="md-heading">Heading</h4>');
  });

  it('renders h1 as h3', () => {
    const result = formatAIText('# Title');
    expect(result).toBe('<h3 class="md-heading">Title</h3>');
  });

  it('renders unordered list', () => {
    const result = formatAIText('- item one\n- item two');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item one</li>');
    expect(result).toContain('<li>item two</li>');
    expect(result).toContain('</ul>');
  });

  it('renders ordered list', () => {
    const result = formatAIText('1. first\n2. second');
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>first</li>');
    expect(result).toContain('<li>second</li>');
    expect(result).toContain('</ol>');
  });

  it('renders fenced code blocks', () => {
    const result = formatAIText('```js\nconsole.log("hi")\n```');
    expect(result).toContain('<pre class="md-codeblock">');
    expect(result).toContain('<code class="lang-js">');
    expect(result).toContain('console.log(&quot;hi&quot;)');
  });

  it('renders fenced code block without language', () => {
    const result = formatAIText('```\nplain code\n```');
    expect(result).toContain('class="lang-text"');
    expect(result).toContain('plain code');
  });

  it('escapes HTML inside code blocks', () => {
    const result = formatAIText('```\n<div>test</div>\n```');
    expect(result).toContain('&lt;div&gt;test&lt;/div&gt;');
    expect(result).not.toContain('<div>test</div>');
  });

  it('converts inline bold within paragraphs', () => {
    const result = formatAIText('This is **bold** text');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('inserts br for blank lines', () => {
    const result = formatAIText('line one\n\nline two');
    expect(result).toContain('<br>');
  });

  it('closes open list before heading', () => {
    const result = formatAIText('- item\n## Title');
    expect(result).toContain('</ul>');
    expect(result).toContain('<h4');
  });

  it('closes open list at end of input', () => {
    const result = formatAIText('- item');
    expect(result).toContain('</ul>');
  });

  it('handles mixed content', () => {
    const input = '# Title\n\nSome **bold** text\n\n- list item\n\n```js\ncode\n```';
    const result = formatAIText(input);
    expect(result).toContain('<h3 class="md-heading">Title</h3>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<li>list item</li>');
    expect(result).toContain('<pre class="md-codeblock">');
  });
});
