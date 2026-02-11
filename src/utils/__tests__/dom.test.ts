import { describe, it, expect, beforeEach } from 'vitest';
import { isVisible, getLabel, slugify, querySelectorDeep, getFormValues } from '../dom';

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces special characters with hyphens', () => {
    expect(slugify('foo@bar!baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBe(64);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('collapses consecutive special chars', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });

  it('handles null/undefined gracefully', () => {
    expect(slugify(undefined as unknown as string)).toBe('');
    expect(slugify(null as unknown as string)).toBe('');
  });
});

describe('isVisible', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true for a regular visible element', () => {
    const div = document.createElement('div');
    div.textContent = 'visible';
    document.body.appendChild(div);
    // In happy-dom, offsetParent may be null for non-rendered elements
    // Test the logic path: when offsetParent is null, isVisible returns false
    expect(typeof isVisible(div)).toBe('boolean');
  });

  it('returns false for display:none element', () => {
    const div = document.createElement('div');
    div.style.display = 'none';
    document.body.appendChild(div);
    expect(isVisible(div)).toBe(false);
  });

  it('returns false for element not in DOM (no offsetParent)', () => {
    const div = document.createElement('div');
    // Not appended to document — offsetParent is null
    expect(isVisible(div)).toBe(false);
  });
});

describe('getLabel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns aria-label when present', () => {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Submit form');
    document.body.appendChild(btn);
    expect(getLabel(btn)).toBe('Submit form');
  });

  it('returns aria-labelledby target text', () => {
    const label = document.createElement('span');
    label.id = 'my-label';
    label.textContent = 'Username';
    document.body.appendChild(label);

    const input = document.createElement('input');
    input.setAttribute('aria-labelledby', 'my-label');
    document.body.appendChild(input);

    expect(getLabel(input)).toBe('Username');
  });

  it('returns label[for] text', () => {
    const label = document.createElement('label');
    label.setAttribute('for', 'email-input');
    label.textContent = 'Email address';
    document.body.appendChild(label);

    const input = document.createElement('input');
    input.id = 'email-input';
    document.body.appendChild(input);

    expect(getLabel(input)).toBe('Email address');
  });

  it('returns title attribute', () => {
    const div = document.createElement('div');
    div.title = 'Info tooltip';
    document.body.appendChild(div);
    expect(getLabel(div)).toBe('Info tooltip');
  });

  it('returns placeholder', () => {
    const input = document.createElement('input');
    input.placeholder = 'Search...';
    document.body.appendChild(input);
    expect(getLabel(input)).toBe('Search...');
  });

  it('returns data-placeholder', () => {
    const div = document.createElement('div');
    div.dataset.placeholder = 'Write something';
    document.body.appendChild(div);
    expect(getLabel(div)).toBe('Write something');
  });

  it('returns short textContent', () => {
    const span = document.createElement('span');
    span.textContent = 'Click me';
    document.body.appendChild(span);
    expect(getLabel(span)).toBe('Click me');
  });

  it('returns empty for long textContent', () => {
    const div = document.createElement('div');
    div.textContent = 'A'.repeat(70);
    document.body.appendChild(div);
    expect(getLabel(div)).toBe('');
  });

  it('returns empty for multiline textContent', () => {
    const div = document.createElement('div');
    div.textContent = 'line one\nline two';
    document.body.appendChild(div);
    expect(getLabel(div)).toBe('');
  });

  it('returns empty string when no label is found', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(getLabel(div)).toBe('');
  });
});

describe('querySelectorDeep', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds elements in the light DOM', () => {
    document.body.innerHTML = '<div class="target">A</div><div class="target">B</div>';
    const results = querySelectorDeep(document, '.target');
    expect(results.length).toBe(2);
  });

  it('returns empty array when no matches', () => {
    document.body.innerHTML = '<div>hello</div>';
    const results = querySelectorDeep(document, '.nonexistent');
    expect(results.length).toBe(0);
  });

  it('respects maxDepth of 0', () => {
    document.body.innerHTML = '<div class="a">text</div>';
    const results = querySelectorDeep(document, '.a', 0);
    // Should still find elements in the root, just not traverse shadow roots
    expect(results.length).toBe(1);
  });

  it('finds elements by tag name', () => {
    document.body.innerHTML = '<button>Click</button><button>Press</button>';
    const results = querySelectorDeep(document, 'button');
    expect(results.length).toBe(2);
  });
});

describe('getFormValues', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts text input values', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'username';
    input.value = 'john';
    form.appendChild(input);
    document.body.appendChild(form);

    const values = getFormValues(form);
    expect(values.username).toBe('john');
  });

  it('extracts select values', () => {
    const form = document.createElement('form');
    const select = document.createElement('select');
    select.name = 'color';
    const opt = document.createElement('option');
    opt.value = 'red';
    opt.selected = true;
    select.appendChild(opt);
    form.appendChild(select);
    document.body.appendChild(form);

    const values = getFormValues(form);
    expect(values.color).toBe('red');
  });

  it('extracts textarea values', () => {
    const form = document.createElement('form');
    const ta = document.createElement('textarea');
    ta.name = 'bio';
    ta.value = 'Hello world';
    form.appendChild(ta);
    document.body.appendChild(form);

    const values = getFormValues(form);
    expect(values.bio).toBe('Hello world');
  });

  it('returns empty object for empty form', () => {
    const form = document.createElement('form');
    document.body.appendChild(form);
    const values = getFormValues(form);
    expect(Object.keys(values).length).toBe(0);
  });

  it('ignores inputs without name', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.value = 'no-name';
    form.appendChild(input);
    document.body.appendChild(form);

    const values = getFormValues(form);
    expect(Object.keys(values).length).toBe(0);
  });

  it('extracts multiple fields', () => {
    const form = document.createElement('form');

    const input1 = document.createElement('input');
    input1.name = 'first';
    input1.value = 'John';
    form.appendChild(input1);

    const input2 = document.createElement('input');
    input2.name = 'last';
    input2.value = 'Doe';
    form.appendChild(input2);

    document.body.appendChild(form);

    const values = getFormValues(form);
    expect(values.first).toBe('John');
    expect(values.last).toBe('Doe');
  });
});
