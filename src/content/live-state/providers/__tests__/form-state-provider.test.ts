import { describe, it, expect } from 'vitest';
import { FormStateProvider } from '../form-state-provider';

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = html;
  return doc;
}

describe('FormStateProvider', () => {
  const provider = new FormStateProvider();

  it('collects basic form fields', () => {
    const doc = makeDoc(`
      <form id="login">
        <input name="username" type="text" value="alice" />
        <input name="password" type="password" value="secret" />
        <button type="submit">Login</button>
      </form>
    `);
    const results = provider.collect(doc);
    expect(results).toHaveLength(1);
    expect(results[0].formId).toBe('login');
    expect(results[0].totalFields).toBe(2);
    expect(results[0].filledFields).toBe(2);
    expect(results[0].fields).toHaveLength(2);
  });

  it('masks password field values', () => {
    const doc = makeDoc(`
      <form>
        <input name="pass" type="password" value="abc123" />
      </form>
    `);
    const results = provider.collect(doc);
    const passField = results[0].fields.find(f => f.name === 'pass');
    expect(passField).toBeDefined();
    expect(passField!.value).toBe('******');
    expect(passField!.value).not.toContain('abc');
    expect(passField!.filled).toBe(true);
  });

  it('shows empty string for empty password', () => {
    const doc = makeDoc(`
      <form>
        <input name="pass" type="password" value="" />
      </form>
    `);
    const results = provider.collect(doc);
    const passField = results[0].fields.find(f => f.name === 'pass');
    expect(passField!.value).toBe('');
    expect(passField!.filled).toBe(false);
  });

  it('collects orphan inputs not inside any form', () => {
    const doc = makeDoc(`
      <input name="search" type="text" value="test" />
      <select name="lang">
        <option value="en">English</option>
        <option value="fr">French</option>
      </select>
    `);
    const results = provider.collect(doc);
    expect(results).toHaveLength(1);
    expect(results[0].formId).toBe('orphan');
    expect(results[0].fields).toHaveLength(2);
  });

  it('resolves label from aria-label', () => {
    const doc = makeDoc(`
      <form>
        <input name="q" type="text" aria-label="Search query" />
      </form>
    `);
    const results = provider.collect(doc);
    expect(results[0].fields[0].label).toBe('Search query');
  });

  it('resolves label from label[for]', () => {
    const doc = makeDoc(`
      <form>
        <label for="email-input">Email Address</label>
        <input id="email-input" name="email" type="email" />
      </form>
    `);
    const results = provider.collect(doc);
    expect(results[0].fields[0].label).toBe('Email Address');
  });

  it('resolves label from placeholder', () => {
    const doc = makeDoc(`
      <form>
        <input name="q" type="text" placeholder="Enter search term" />
      </form>
    `);
    const results = provider.collect(doc);
    expect(results[0].fields[0].label).toBe('Enter search term');
  });

  it('falls back to name for label', () => {
    const doc = makeDoc(`
      <form>
        <input name="first_name" type="text" />
      </form>
    `);
    const results = provider.collect(doc);
    expect(results[0].fields[0].label).toBe('first_name');
  });

  it('collects select options', () => {
    const doc = makeDoc(`
      <form>
        <select name="country">
          <option value="">Choose</option>
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
        </select>
      </form>
    `);
    const results = provider.collect(doc);
    const field = results[0].fields[0];
    expect(field.type).toBe('select');
    expect(field.options).toContain('United States');
    expect(field.options).toContain('United Kingdom');
    expect(field.options).not.toContain('Choose');
  });

  it('skips hidden inputs', () => {
    const doc = makeDoc(`
      <form>
        <input type="hidden" name="csrf" value="token123" />
        <input name="name" type="text" value="Alice" />
      </form>
    `);
    const results = provider.collect(doc);
    expect(results[0].fields).toHaveLength(1);
    expect(results[0].fields[0].name).toBe('name');
  });

  it('detects required fields', () => {
    const doc = makeDoc(`
      <form>
        <input name="email" type="email" required />
        <input name="phone" type="tel" />
      </form>
    `);
    const results = provider.collect(doc);
    const email = results[0].fields.find(f => f.name === 'email');
    const phone = results[0].fields.find(f => f.name === 'phone');
    expect(email!.required).toBe(true);
    expect(phone!.required).toBe(false);
  });

  it('caps fields per form at 30', () => {
    const inputs = Array.from({ length: 40 }, (_, i) =>
      `<input name="f${i}" type="text" />`
    ).join('');
    const doc = makeDoc(`<form>${inputs}</form>`);
    const results = provider.collect(doc);
    expect(results[0].fields.length).toBeLessThanOrEqual(30);
    expect(results[0].totalFields).toBe(40);
  });

  it('caps orphan fields at 20', () => {
    const inputs = Array.from({ length: 25 }, (_, i) =>
      `<input name="o${i}" type="text" />`
    ).join('');
    const doc = makeDoc(inputs);
    const results = provider.collect(doc);
    expect(results[0].formId).toBe('orphan');
    expect(results[0].fields.length).toBeLessThanOrEqual(20);
  });

  it('handles checkbox fields', () => {
    const doc = makeDoc(`
      <form>
        <input name="agree" type="checkbox" checked />
      </form>
    `);
    const results = provider.collect(doc);
    const field = results[0].fields[0];
    expect(field.type).toBe('checkbox');
    expect(field.filled).toBe(true);
    expect(field.value).toBe('checked');
  });

  it('handles textarea fields', () => {
    const doc = makeDoc(`
      <form>
        <textarea name="bio">Hello world</textarea>
      </form>
    `);
    const results = provider.collect(doc);
    const field = results[0].fields[0];
    expect(field.type).toBe('textarea');
    expect(field.value).toBe('Hello world');
    expect(field.filled).toBe(true);
  });

  it('returns empty array when no forms or orphan inputs', () => {
    const doc = makeDoc('<div>No forms here</div>');
    const results = provider.collect(doc);
    expect(results).toHaveLength(0);
  });

  // ── Regression: field recognition improvements ──

  describe('field recognition by attribute', () => {
    it('recognizes field with only name attribute', () => {
      const doc = makeDoc(`
        <form>
          <input name="username" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields).toHaveLength(1);
      expect(results[0].fields[0].name).toBe('username');
    });

    it('recognizes field with only id attribute', () => {
      const doc = makeDoc(`
        <form>
          <input id="my-field" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields).toHaveLength(1);
      expect(results[0].fields[0].name).toBe('my-field');
    });

    it('recognizes field with only aria-label (regression)', () => {
      const doc = makeDoc(`
        <form>
          <input aria-label="Search box" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields).toHaveLength(1);
      expect(results[0].fields[0].name).toBe('Search box');
      expect(results[0].fields[0].label).toBe('Search box');
    });

    it('recognizes field with only placeholder (regression)', () => {
      const doc = makeDoc(`
        <form>
          <input placeholder="Type here..." type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields).toHaveLength(1);
      expect(results[0].fields[0].name).toBe('Type here...');
    });

    it('recognizes field with only data-testid (regression)', () => {
      const doc = makeDoc(`
        <form>
          <input data-testid="email-input" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields).toHaveLength(1);
      expect(results[0].fields[0].name).toBe('email-input');
    });

    it('assigns auto-generated name to field with no attributes (regression)', () => {
      const doc = makeDoc(`
        <form>
          <input type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields).toHaveLength(1);
      expect(results[0].fields[0].name).toBe('field-0');
    });
  });

  describe('hidden inputs are still filtered out', () => {
    it('does not include hidden inputs regardless of attributes', () => {
      const doc = makeDoc(`
        <form>
          <input type="hidden" name="token" value="abc" />
          <input type="hidden" data-testid="secret" value="xyz" />
          <input name="visible" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields).toHaveLength(1);
      expect(results[0].fields[0].name).toBe('visible');
    });
  });

  describe('form with mixed named and unnamed fields', () => {
    it('recognizes all fields regardless of attribute presence', () => {
      const doc = makeDoc(`
        <form id="mixed">
          <input name="named" type="text" />
          <input id="has-id" type="text" />
          <input aria-label="Has aria" type="text" />
          <input placeholder="Has placeholder" type="text" />
          <input data-testid="has-testid" type="text" />
          <input type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields).toHaveLength(6);
      expect(results[0].fields[0].name).toBe('named');
      expect(results[0].fields[1].name).toBe('has-id');
      expect(results[0].fields[2].name).toBe('Has aria');
      expect(results[0].fields[3].name).toBe('Has placeholder');
      expect(results[0].fields[4].name).toBe('has-testid');
      expect(results[0].fields[5].name).toBe('field-5');
    });
  });

  describe('orphan fields with no name/id (regression)', () => {
    it('recognizes orphan fields with fallback naming', () => {
      const doc = makeDoc(`
        <input type="text" aria-label="Orphan aria" />
        <input type="text" placeholder="Orphan placeholder" />
        <input type="text" />
      `);
      const results = provider.collect(doc);
      expect(results).toHaveLength(1);
      expect(results[0].formId).toBe('orphan');
      expect(results[0].fields).toHaveLength(3);
      expect(results[0].fields[0].name).toBe('Orphan aria');
      expect(results[0].fields[1].name).toBe('Orphan placeholder');
      expect(results[0].fields[2].name).toBe('field-2');
    });
  });

  describe('field label derivation priority', () => {
    it('prefers aria-label over label[for]', () => {
      const doc = makeDoc(`
        <form>
          <label for="f1">Label Text</label>
          <input id="f1" name="f1" aria-label="Aria Text" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields[0].label).toBe('Aria Text');
    });

    it('prefers label[for] over placeholder', () => {
      const doc = makeDoc(`
        <form>
          <label for="f2">Label Text</label>
          <input id="f2" name="f2" placeholder="Placeholder Text" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields[0].label).toBe('Label Text');
    });

    it('prefers placeholder over name', () => {
      const doc = makeDoc(`
        <form>
          <input name="field_name" placeholder="Placeholder Text" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields[0].label).toBe('Placeholder Text');
    });

    it('falls back to name when no other label source', () => {
      const doc = makeDoc(`
        <form>
          <input name="field_name" type="text" />
        </form>
      `);
      const results = provider.collect(doc);
      expect(results[0].fields[0].label).toBe('field_name');
    });
  });
});
