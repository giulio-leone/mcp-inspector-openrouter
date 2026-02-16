import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '../../../types';
import { FormExecutor } from '../form-executor';

function makeTool(name: string, el: Element): Tool {
  return {
    name,
    description: 'test tool',
    category: 'form',
    inputSchema: { type: 'object', properties: {} },
    _el: el,
  };
}

describe('FormExecutor', () => {
  let executor: FormExecutor;

  beforeEach(() => {
    document.body.innerHTML = '';
    executor = new FormExecutor();
  });

  // ── form.fill-* tests ──

  it('form.fill-* sets text input value', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    const tool = makeTool('form.fill-username', input);
    const result = await executor.execute(tool, { value: 'alice' });

    expect(result.success).toBe(true);
    expect(input.value).toBe('alice');
    expect(result.message).toBe('Field "form.fill-username" set to "alice"');
  });

  it('form.fill-* sets select value', async () => {
    const select = document.createElement('select');
    const opt1 = document.createElement('option');
    opt1.value = 'us';
    opt1.textContent = 'United States';
    const opt2 = document.createElement('option');
    opt2.value = 'uk';
    opt2.textContent = 'United Kingdom';
    select.append(opt1, opt2);
    document.body.appendChild(select);

    const tool = makeTool('form.fill-country', select);
    const result = await executor.execute(tool, { value: 'uk' });

    expect(result.success).toBe(true);
    expect(select.value).toBe('uk');
  });

  it('form.fill-* sets checkbox value', async () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.appendChild(checkbox);

    const tool = makeTool('form.fill-agree', checkbox);
    const result = await executor.execute(tool, { value: true });

    expect(result.success).toBe(true);
    expect(checkbox.checked).toBe(true);
  });

  it('form.fill-* sets the correct radio option by value for standalone radio group', async () => {
    const male = document.createElement('input');
    male.type = 'radio';
    male.name = 'gender';
    male.value = 'male';
    const female = document.createElement('input');
    female.type = 'radio';
    female.name = 'gender';
    female.value = 'female';
    document.body.append(male, female);

    const tool = makeTool('form.fill-gender', male);
    const result = await executor.execute(tool, { value: 'female' });

    expect(result.success).toBe(true);
    expect(male.checked).toBe(false);
    expect(female.checked).toBe(true);
  });

  it('form.fill-* returns failure when radio option value does not exist', async () => {
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'tier';
    radio.value = 'basic';
    document.body.appendChild(radio);

    const tool = makeTool('form.fill-tier', radio);
    const result = await executor.execute(tool, { value: 'pro' });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Radio option "pro" not found for group "tier"');
  });

  it('form.fill-* dispatches change event', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    const changeSpy = vi.fn();
    input.addEventListener('change', changeSpy);

    const tool = makeTool('form.fill-email', input);
    await executor.execute(tool, { value: 'a@b.com' });

    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it('form.fill-* returns failure when element not found', async () => {
    const tool = makeTool('form.fill-missing', null as unknown as Element);
    (tool as { _el: Element | null })._el = null;

    const result = await executor.execute(tool, { value: 'x' });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Field element not found');
  });

  it('form.fill-* returns failure when value argument is missing', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    const tool = makeTool('form.fill-name', input);
    const result = await executor.execute(tool, {});

    expect(result.success).toBe(false);
    expect(result.message).toBe('Missing "value" argument for form.fill-*');
  });

  // ── form.submit-* regression test ──

  it('form.submit-* still works (regression test)', async () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'username';
    input.type = 'text';
    const btn = document.createElement('button');
    btn.type = 'submit';
    form.append(input, btn);
    document.body.appendChild(form);

    const clickSpy = vi.fn();
    btn.addEventListener('click', clickSpy);

    const tool = makeTool('form.submit-login', form);
    const result = await executor.execute(tool, { username: 'bob' });

    expect(result.success).toBe(true);
    expect(input.value).toBe('bob');
    expect(result.message).toContain('submitted with 1 fields');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
