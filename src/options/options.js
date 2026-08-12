import { SHORTCUTS_URL, BROWSER_NAME, labelBrowser } from "../shared/env.js";
import { LANGUAGES, setLanguage, applyI18n, t } from "../shared/i18n.js";
import {
  DEFAULTS,
  getSettings,
  setSettings,
  applyTheme,
  resolveFilename,
} from "../shared/settings.js";

const $ = (id) => document.getElementById(id);
const TOKENS = ["{title}", "{host}", "{path}", "{date}", "{time}", "{timestamp}", "{width}", "{height}"];

let settings = null;

init();

async function init() {
  settings = await getSettings();
  setLanguage(settings.language);
  buildLanguages();
  applyI18n();
  $("privacy-body").textContent = t("options.privacy.body", { browser: BROWSER_NAME });
  applyTheme(settings.theme);
  labelBrowser();
  $("version").textContent = `Longshot v${chrome.runtime.getManifest().version}`;

  if (new URLSearchParams(location.search).get("welcome")) $("welcome").hidden = false;

  bindSwitch("preScroll");
  bindSwitch("hideFixed");
  bindSwitch("pageFrame");
  bindSwitch("pdfLossless", () => syncConditional());
  bindSwitch("freezeMotion");
  bindSwitch("showOverlay");
  bindSwitch("openEditor");
  bindSwitch("autoDownload");
  bindSwitch("copyOnCapture");

  bindRange("settleMs", (v) => t("options.settleMs.value", { n: v }));
  bindRange("jpegQuality", (v) => v);
  bindRange("scale", (v) => `${v}%`);

  bindChips("format", () => syncConditional());
  bindChips("captureScale", null, Number);
  bindChips("theme", (v) => applyTheme(v));

  bindSelect("pdfPageMode");
  // A language change rewrites every string on the page, so the simplest honest
  // thing is to load it again in the new one.
  $("language").addEventListener("change", async () => {
    await save({ language: $("language").value });
    location.reload();
  });
  bindFilename();
  buildTokens();
  loadShortcuts();
  syncConditional();

  $("open-shortcuts").addEventListener("click", () => chrome.tabs.create({ url: SHORTCUTS_URL }));
  $("reset").addEventListener("click", async () => {
    await chrome.storage.sync.clear();
    toast(t("options.resetDone"));
    setTimeout(() => location.reload(), 500);
  });
}

/** The list of languages, each in its own script — nobody scans a list for
 *  "Persian" when they are looking for فارسی. */
function buildLanguages() {
  const el = $("language");
  for (const lang of LANGUAGES) {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.native;
    el.appendChild(option);
  }
  el.value = settings.language;
}

function bindSwitch(key, after) {
  const el = $(key);
  el.checked = settings[key];
  el.addEventListener("change", () => {
    save({ [key]: el.checked });
    if (after) after(el.checked);
  });
}

function bindRange(key, format) {
  const el = $(key);
  const out = $(`${key}-value`);
  el.value = settings[key];
  out.textContent = format(el.value);
  el.addEventListener("input", () => (out.textContent = format(el.value)));
  el.addEventListener("change", () => save({ [key]: Number(el.value) }));
}

function bindSelect(key) {
  const el = $(key);
  el.value = settings[key];
  el.addEventListener("change", () => save({ [key]: el.value }));
}

/** `cast` turns the chip's text back into the type the setting is stored as —
 *  a capture scale is a number, everything else here is a string. */
function bindChips(key, after, cast = String) {
  const group = $(key);
  paintChips(group, settings[key]);
  group.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-value]");
    if (!b) return;
    paintChips(group, b.dataset.value);
    save({ [key]: cast(b.dataset.value) });
    if (after) after(b.dataset.value);
  });
}

function paintChips(group, value) {
  for (const b of group.querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.value === String(value)));
  }
}

function bindFilename() {
  const el = $("filename");
  el.value = settings.filename;
  const preview = () => {
    const name = resolveFilename(el.value, {
      title: "Longshot",
      url: "https://example.com/pricing",
      width: 1440,
      height: 6120,
    });
    const extension = settings.format === "jpeg" ? "jpg" : settings.format;
    $("filename-preview").textContent = t("options.filename.preview", {
      name: `${name}.${extension}`,
    });
  };
  el.addEventListener("input", preview);
  el.addEventListener("change", () => {
    save({ filename: el.value || DEFAULTS.filename });
    preview();
  });
  preview();
}

function buildTokens() {
  const wrap = $("tokens");
  for (const token of TOKENS) {
    const b = document.createElement("button");
    b.className = "token";
    b.type = "button";
    b.textContent = token;
    b.title = t("options.filename.insert", { token });
    b.addEventListener("click", () => {
      const el = $("filename");
      const at = el.selectionStart ?? el.value.length;
      el.value = el.value.slice(0, at) + token + el.value.slice(el.selectionEnd ?? at);
      el.focus();
      el.dispatchEvent(new Event("input"));
      el.dispatchEvent(new Event("change"));
    });
    wrap.appendChild(b);
  }
}

/** Only show the settings that matter for the chosen output format. */
function syncConditional() {
  $("row-quality").hidden = settings.format === "png" || settings.pdfLossless;
  $("row-pdf").hidden = settings.format !== "pdf";
  $("row-pdf-lossless").hidden = settings.format !== "pdf";
  $("filename").dispatchEvent(new Event("input"));
}

async function loadShortcuts() {
  const commands = await chrome.commands.getAll();
  const parts = commands
    .filter((c) => c.shortcut)
    .map((c) => `${c.shortcut} — ${c.description || c.name}`);
  $("shortcut-list").textContent = parts.length
    ? parts.join(" · ")
    : t("options.shortcuts.none");
  const full = commands.find((c) => c.name === "capture-full-page");
  if (full && full.shortcut && $("welcome-shortcut")) {
    $("welcome-shortcut").textContent = full.shortcut;
  }
}

async function save(patch) {
  Object.assign(settings, patch);
  await setSettings(patch);
  toast(t("options.saved"));
}

let timer = null;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (el.hidden = true), 1400);
}
