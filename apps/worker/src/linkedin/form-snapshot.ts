import type { Page } from "playwright";
import crypto from "node:crypto";

export interface FormField {
  /** Stable per-page identifier we generate (used to find the element again to fill it). */
  id: string;
  /** Real DOM element id, name, or aria-id (for debug). */
  domId: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "file" | "typeahead" | "unknown";
  label: string;
  options?: string[];
  required: boolean;
  currentValue?: string;
  /** Stable hash for caching — based on label + type + options (sorted, lowercased). */
  hash: string;
}

export interface FormSnapshot {
  fields: FormField[];
  /** True when the modal has a "Submit application" / "Submit" button visible (final page). */
  isFinalPage: boolean;
  /** True if a "Next" / "Review" button is visible (multi-page form). */
  hasNext: boolean;
  /** Visible text of the primary advance button. */
  advanceButtonText: string | null;
}

const SNAPSHOT_FN = `
(() => {
  const modal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"][aria-labelledby*="easy-apply"], [data-test-modal="jobs-easy-apply-modal"]');
  if (!modal) return { fields: [], isFinalPage: false, hasNext: false, advanceButtonText: null };

  const form = modal.querySelector('form') || modal;

  function getLabel(el) {
    const id = el.getAttribute('id');
    if (id) {
      const lab = document.querySelector('label[for="' + CSS.escape(id) + '"]');
      if (lab && lab.innerText) return lab.innerText.trim();
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const target = document.getElementById(labelledBy);
      if (target && target.innerText) return target.innerText.trim();
    }
    // Fieldset legend
    const fs = el.closest('fieldset');
    if (fs) {
      const legend = fs.querySelector('legend');
      if (legend && legend.innerText) return legend.innerText.trim();
    }
    // Walk up looking for a parent with a label-like sibling
    let p = el.parentElement;
    for (let i = 0; i < 4 && p; i++) {
      const lbl = p.querySelector('label');
      if (lbl && lbl !== el && lbl.innerText) return lbl.innerText.trim();
      p = p.parentElement;
    }
    return el.getAttribute('placeholder') || el.getAttribute('name') || '';
  }

  const fields = [];
  let counter = 0;
  const seen = new WeakSet();

  // Radios are grouped by name — collect once per group
  const radioGroups = new Map();
  form.querySelectorAll('input[type="radio"]').forEach((r) => {
    const name = r.name || r.getAttribute('aria-labelledby') || ('rg_' + (counter++));
    if (!radioGroups.has(name)) radioGroups.set(name, []);
    radioGroups.get(name).push(r);
  });

  for (const [name, group] of radioGroups.entries()) {
    const first = group[0];
    seen.add(first);
    const options = group.map((r) => {
      const lbl = r.id ? document.querySelector('label[for="' + CSS.escape(r.id) + '"]') : null;
      return (lbl?.innerText || r.value || '').trim();
    }).filter(Boolean);
    const fs = first.closest('fieldset');
    const legend = fs?.querySelector('legend')?.innerText?.trim() || getLabel(first);
    const id = 'f_' + (counter++);
    const checked = group.find((r) => r.checked);
    const checkedLabel = checked ? (checked.id ? (document.querySelector('label[for="' + CSS.escape(checked.id) + '"]')?.innerText || checked.value) : checked.value) : '';
    fields.push({
      id,
      domId: name,
      type: 'radio',
      label: legend || 'unknown',
      options,
      required: !!first.required,
      currentValue: (checkedLabel || '').trim(),
      _selector: 'input[name="' + name.replace(/"/g, '\\\\"') + '"]'
    });
    for (const r of group) seen.add(r);
  }

  // Inputs / textareas / selects
  const els = form.querySelectorAll('input, textarea, select');
  els.forEach((el) => {
    if (seen.has(el)) return;
    const t = (el.tagName || '').toLowerCase();
    let type = 'text';
    let options;
    if (t === 'textarea') type = 'textarea';
    else if (t === 'select') {
      type = 'select';
      options = Array.from(el.querySelectorAll('option')).map((o) => o.innerText.trim()).filter(Boolean);
    } else if (t === 'input') {
      const it = (el.getAttribute('type') || 'text').toLowerCase();
      if (it === 'checkbox') type = 'checkbox';
      else if (it === 'file') type = 'file';
      else if (it === 'hidden' || it === 'button' || it === 'submit') return;
      else type = 'text';
      // Detect typeahead via aria-autocomplete or role=combobox
      if (el.getAttribute('aria-autocomplete') === 'list' || el.getAttribute('role') === 'combobox') {
        type = 'typeahead';
      }
    }
    const label = getLabel(el);
    if (!label) return;
    const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
    const id = 'f_' + (counter++);
    const domId = el.id || el.name || '';
    const selector = el.id
      ? '#' + CSS.escape(el.id)
      : el.name
        ? t + '[name="' + el.name.replace(/"/g, '\\\\"') + '"]'
        : '';
    fields.push({
      id,
      domId,
      type,
      label,
      options,
      required,
      currentValue: (el.value || '').trim(),
      _selector: selector
    });
  });

  // Detect final/next button
  const buttons = Array.from(modal.querySelectorAll('button')).filter((b) => b.offsetParent !== null);
  const labelOf = (b) => (b.getAttribute('aria-label') || b.innerText || '').trim();
  const submitBtn = buttons.find((b) => /submit application|submit/i.test(labelOf(b)) && !/save/i.test(labelOf(b)));
  const nextBtn = buttons.find((b) => /^(continue|next|review)/i.test(labelOf(b)));
  return {
    fields,
    isFinalPage: !!submitBtn,
    hasNext: !!nextBtn && !submitBtn,
    advanceButtonText: submitBtn ? labelOf(submitBtn) : (nextBtn ? labelOf(nextBtn) : null)
  };
})()
`;

export async function snapshot(page: Page): Promise<{ snapshot: FormSnapshot; raw: any[] }> {
  const raw = (await page.evaluate(SNAPSHOT_FN)) as any;
  const fields = (raw.fields ?? []) as Array<FormField & { _selector?: string }>;
  // Compute hash for each field
  for (const f of fields) {
    f.hash = hashField(f);
  }
  return {
    snapshot: {
      fields,
      isFinalPage: !!raw.isFinalPage,
      hasNext: !!raw.hasNext,
      advanceButtonText: raw.advanceButtonText ?? null,
    },
    raw: fields, // includes _selector for filling
  };
}

export function hashField(f: { label: string; type: string; options?: string[] }): string {
  const norm = [
    f.label.toLowerCase().replace(/\s+/g, " ").trim(),
    f.type,
    (f.options ?? []).map((o) => o.toLowerCase().trim()).sort().join("|"),
  ].join("::");
  return crypto.createHash("sha1").update(norm).digest("hex").slice(0, 16);
}
