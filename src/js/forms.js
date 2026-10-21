// Accessible error handling for forms: messages tied to fields (aria-describedby),
// aria-invalid, an error summary with links, and focus on the summary.
import { h, clear } from "./dom.js";
import { t, errorText } from "./i18n.js";

export function clearErrors(form) {
  for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  for (const el of form.querySelectorAll(".field-error")) el.textContent = "";
  const summary = form.querySelector("[data-error-summary]");
  if (summary) { summary.hidden = true; summary.replaceChildren(); }
}

/**
 * @param {HTMLFormElement} form
 * @param {Record<string,string>} errors  field name → error code (or a ready message with `message:` prefix)
 * @param {object} vars  values for message placeholders
 */
export function showErrors(form, errors, vars = {}) {
  clearErrors(form);
  const items = [];
  for (const [name, code] of Object.entries(errors)) {
    const field = form.elements[name];
    const input = field instanceof RadioNodeList ? field[0] : field;
    const message = code.startsWith("message:") ? code.slice(8) : errorText(code, vars);
    if (input) {
      input.setAttribute("aria-invalid", "true");
      const errId = input.getAttribute("aria-describedby");
      const errEl = errId && document.getElementById(errId);
      if (errEl) errEl.textContent = message;
    }
    items.push(h("li", {}, input?.id ? h("a", { href: `#${input.id}` }, message) : message));
  }
  const summary = form.querySelector("[data-error-summary]");
  if (summary && items.length) {
    clear(summary, h("p", {}, h("strong", {}, t("form.errors_title"))), h("ul", {}, items));
    summary.hidden = false;
    summary.focus();
  } else if (items.length) {
    form.querySelector("[aria-invalid]")?.focus();
  }
}

export function showFormMessage(form, message) {
  showErrors(form, { _form: `message:${message}` });
}

export const isEmail = (v) => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(String(v).trim());
