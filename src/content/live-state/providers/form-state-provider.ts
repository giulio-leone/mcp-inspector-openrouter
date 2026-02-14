/**
 * FormStateProvider — collects live state for forms on the page.
 *
 * Enumerates all <form> elements, counts fields, detects dirty/invalid
 * state, and computes a completion percentage.
 */

import type { IStateProvider, FormLiveState, FormFieldDetail } from '../../../types/live-state.types';

/** Input-like elements whose value can be inspected */
const FIELD_SELECTOR = 'input, select, textarea';

/** Max fields per form */
const MAX_FIELDS_PER_FORM = 30;

/** Max orphan fields */
const MAX_ORPHAN_FIELDS = 20;

/** Truncate a string to a maximum length */
function truncate(value: string, max = 100): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Check whether a form field has a non-empty value */
function isFilled(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    return el.value.trim().length > 0;
  }
  return el.value.trim().length > 0;
}

/** Derive a human-readable label for a field */
function fieldLabel(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return truncate(ariaLabel);

  const id = el.id;
  if (id) {
    try {
      const labelEl = el.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelEl?.textContent?.trim()) return truncate(labelEl.textContent.trim());
    } catch { /* malformed selector — skip */ }
  }

  const placeholder = (el as HTMLInputElement).placeholder;
  if (placeholder) return truncate(placeholder);

  const name = (el as HTMLInputElement).name;
  if (name) return truncate(name);

  if (id) return truncate(id);

  return '';
}

/** Get field value, masking passwords with fixed-length mask */
function getFieldValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  if (el instanceof HTMLInputElement && el.type === 'password') {
    return el.value ? '******' : '';
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el.checked ? 'checked' : '';
  }
  return el.value;
}

/** Collect options for select elements */
function getSelectOptions(el: HTMLSelectElement): string[] {
  return Array.from(el.options)
    .filter(opt => opt.value !== '')
    .map(opt => opt.text?.trim() || opt.value);
}

/** Collect option labels for radio groups */
function getRadioOptions(el: HTMLInputElement, root: Document | Element): string[] {
  if (!el.name) return [];
  try {
    const radios = root.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
    return Array.from(radios).map(r => fieldLabel(r) || (r as HTMLInputElement).value);
  } catch {
    return [];
  }
}

/** Build a FormFieldDetail for a single element */
function buildFieldDetail(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  root: Document | Element,
): FormFieldDetail | null {
  if (el instanceof HTMLInputElement && el.type === 'hidden') return null;
  const name = (el as HTMLInputElement).name || el.id || '';
  if (!name) return null;

  const type = el instanceof HTMLSelectElement
    ? 'select'
    : el instanceof HTMLTextAreaElement
      ? 'textarea'
      : (el as HTMLInputElement).type || 'text';

  let options: string[] | undefined;
  if (el instanceof HTMLSelectElement) {
    options = getSelectOptions(el);
  } else if (el instanceof HTMLInputElement && el.type === 'radio') {
    options = getRadioOptions(el, root);
  }

  return {
    name,
    label: fieldLabel(el),
    type,
    value: getFieldValue(el),
    filled: isFilled(el),
    required: el.required || el.getAttribute('aria-required') === 'true',
    valid: !el.matches(':invalid'),
    ...(options?.length ? { options } : {}),
  };
}

export class FormStateProvider implements IStateProvider<FormLiveState> {
  readonly category = 'form' as const;

  collect(root: Document | Element): FormLiveState[] {
    const forms = root.querySelectorAll('form');
    const results: FormLiveState[] = [];
    const formFieldElements = new Set<Element>();

    forms.forEach((form, index) => {
      const fieldEls = form.querySelectorAll(FIELD_SELECTOR);
      const totalFields = fieldEls.length;
      let filledFields = 0;
      const dirtyFields: string[] = [];
      let hasValidationErrors = false;
      const fields: FormFieldDetail[] = [];

      fieldEls.forEach((field) => {
        const el = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        formFieldElements.add(el);

        if (isFilled(el)) filledFields++;

        if (
          el instanceof HTMLInputElement &&
          (el.type === 'checkbox' || el.type === 'radio')
        ) {
          if (el.checked !== el.defaultChecked) dirtyFields.push(fieldLabel(el));
        } else if (el instanceof HTMLSelectElement) {
          const isDirty = Array.from(el.options).some(
            (opt) => opt.selected !== opt.defaultSelected,
          );
          if (isDirty) dirtyFields.push(fieldLabel(el));
        } else if ('defaultValue' in el && el.value !== (el as HTMLInputElement).defaultValue) {
          dirtyFields.push(fieldLabel(el));
        }

        if (el.matches(':invalid')) {
          hasValidationErrors = true;
        }

        if (fields.length < MAX_FIELDS_PER_FORM) {
          const detail = buildFieldDetail(el, root);
          if (detail) fields.push(detail);
        }
      });

      const completionPercent =
        totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

      results.push({
        formId: form.id || form.getAttribute('toolname') || String(index),
        toolName: form.getAttribute('toolname') || '',
        totalFields,
        filledFields,
        dirtyFields,
        hasValidationErrors,
        completionPercent,
        fields,
      });
    });

    // Orphan inputs (not inside any <form>)
    const allFieldEls = root.querySelectorAll(FIELD_SELECTOR);
    const orphanFields: FormFieldDetail[] = [];
    let orphanFilled = 0;
    let orphanTotal = 0;
    let orphanErrors = false;
    const orphanDirty: string[] = [];

    allFieldEls.forEach((field) => {
      if (formFieldElements.has(field)) return;
      const el = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (el instanceof HTMLInputElement && el.type === 'hidden') return;

      orphanTotal++;
      if (isFilled(el)) orphanFilled++;
      if (el.matches(':invalid')) orphanErrors = true;

      if ('defaultValue' in el && el.value !== (el as HTMLInputElement).defaultValue) {
        orphanDirty.push(fieldLabel(el));
      }

      if (orphanFields.length < MAX_ORPHAN_FIELDS) {
        const detail = buildFieldDetail(el, root);
        if (detail) orphanFields.push(detail);
      }
    });

    if (orphanFields.length > 0) {
      results.push({
        formId: 'orphan',
        toolName: '',
        totalFields: orphanTotal,
        filledFields: orphanFilled,
        dirtyFields: orphanDirty,
        hasValidationErrors: orphanErrors,
        completionPercent: orphanTotal > 0 ? Math.round((orphanFilled / orphanTotal) * 100) : 0,
        fields: orphanFields,
      });
    }

    return results;
  }

  dispose(): void {
    /* no-op */
  }
}
