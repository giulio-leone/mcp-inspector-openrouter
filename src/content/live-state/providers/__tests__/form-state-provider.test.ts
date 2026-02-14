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
});
