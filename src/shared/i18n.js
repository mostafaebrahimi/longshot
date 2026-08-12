/**
 * Interface language.
 *
 * Not `chrome.i18n`: that follows the browser's own UI language and cannot be
 * changed from inside the extension, and the whole point here is a language
 * anyone can pick in the settings. Catalogues are plain modules, so the popup,
 * the options page, the editor and the service worker all read the same table.
 *
 * The content script is injected as a classic script and cannot import any of
 * this; the few strings it shows are handed to it by the service worker.
 */
import en from "./locales/en.js";
import ar from "./locales/ar.js";
import de from "./locales/de.js";
import es from "./locales/es.js";
import fa from "./locales/fa.js";
import fr from "./locales/fr.js";
import he from "./locales/he.js";
import hi from "./locales/hi.js";
import ja from "./locales/ja.js";
import pt from "./locales/pt.js";
import ru from "./locales/ru.js";
import tr from "./locales/tr.js";
import ur from "./locales/ur.js";
import zh from "./locales/zh.js";

const CATALOGUES = { en, ar, de, es, fa, fr, he, hi, ja, pt, ru, tr, ur, zh };

/** Offered in the settings, in this order. `native` is how the language names
 *  itself — nobody looks for "Persian" in a list. */
export const LANGUAGES = [
  { code: "en", native: "English", dir: "ltr" },
  { code: "ar", native: "العربية", dir: "rtl" },
  { code: "de", native: "Deutsch", dir: "ltr" },
  { code: "es", native: "Español", dir: "ltr" },
  { code: "fa", native: "فارسی", dir: "rtl" },
  { code: "fr", native: "Français", dir: "ltr" },
  { code: "he", native: "עברית", dir: "rtl" },
  { code: "hi", native: "हिन्दी", dir: "ltr" },
  { code: "ja", native: "日本語", dir: "ltr" },
  { code: "pt", native: "Português", dir: "ltr" },
  { code: "ru", native: "Русский", dir: "ltr" },
  { code: "tr", native: "Türkçe", dir: "ltr" },
  { code: "ur", native: "اردو", dir: "rtl" },
  { code: "zh", native: "简体中文", dir: "ltr" },
];

export const DEFAULT_LANGUAGE = "en";

let current = DEFAULT_LANGUAGE;

export function setLanguage(code) {
  current = CATALOGUES[code] ? code : DEFAULT_LANGUAGE;
  return current;
}

export function language() {
  return current;
}

export function direction(code = current) {
  return (LANGUAGES.find((l) => l.code === code) || LANGUAGES[0]).dir;
}

/**
 * Look up `key`, filling `{placeholders}` from `vars`. A key missing from the
 * chosen language falls back to English, and one missing everywhere comes back
 * as the key itself — visible, rather than a blank space nobody notices.
 */
export function t(key, vars) {
  const raw = CATALOGUES[current][key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
}

/**
 * Translate a page in place: the document's language and direction, the text of
 * every `[data-i18n]`, and the attributes named in `[data-i18n-attr]`
 * ("aria-label:key" pairs, semicolon separated).
 *
 * `[data-i18n-html]` exists for the two or three sentences with markup inside
 * them. The strings come from the catalogues in this repository, never from a
 * page being captured, so there is nothing to inject.
 */
export function applyI18n(root = document) {
  const doc = root.ownerDocument || root;
  doc.documentElement.lang = current;
  doc.documentElement.dir = direction();

  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-html]")) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":");
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    }
  }
}
