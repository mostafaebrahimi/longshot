import { SHORTCUTS_URL, labelBrowser } from "../shared/env.js";
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
  applyTheme(settings.theme);
  labelBrowser();
  $("version").textContent = `Longshot v${chrome.runtime.getManifest().version}`;

  if (new URLSearchParams(location.search).get("welcome")) $("welcome").hidden = false;

  bindSwitch("preScroll");
  bindSwitch("hideFixed");
  bindSwitch("freezeMotion");
  bindSwitch("showOverlay");
  bindSwitch("openEditor");
  bindSwitch("autoDownload");
  bindSwitch("copyOnCapture");

  bindRange("settleMs", (v) => `${v} ms`);
  bindRange("jpegQuality", (v) => v);
  bindRange("scale", (v) => `${v}%`);

  bindChips("format", () => syncConditional());
  bindChips("theme", (v) => applyTheme(v));

  bindSelect("pdfPageMode");
  bindFilename();
  buildTokens();
  loadShortcuts();
  syncConditional();

  $("open-shortcuts").addEventListener("click", () => chrome.tabs.create({ url: SHORTCUTS_URL }));
  $("reset").addEventListener("click", async () => {
    await chrome.storage.sync.clear();
    toast("Settings reset");
    setTimeout(() => location.reload(), 500);
  });
}

function bindSwitch(key) {
  const el = $(key);
  el.checked = settings[key];
  el.addEventListener("change", () => save({ [key]: el.checked }));
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

function bindChips(key, after) {
  const group = $(key);
  paintChips(group, settings[key]);
  group.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-value]");
    if (!b) return;
    paintChips(group, b.dataset.value);
    save({ [key]: b.dataset.value });
    if (after) after(b.dataset.value);
  });
}

function paintChips(group, value) {
  for (const b of group.querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.value === value));
  }
}

function bindFilename() {
  const el = $("filename");
  el.value = settings.filename;
  const preview = () => {
    $("filename-preview").textContent = `Saves as ${resolveFilename(el.value, {
      title: "Longshot — full page capture",
      url: "https://example.com/pricing",
      width: 1440,
      height: 6120,
    })}.${settings.format === "jpeg" ? "jpg" : settings.format}`;
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
    b.title = `Insert ${token}`;
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
  $("row-quality").hidden = settings.format === "png";
  $("row-pdf").hidden = settings.format !== "pdf";
  $("filename").dispatchEvent(new Event("input"));
}

async function loadShortcuts() {
  const commands = await chrome.commands.getAll();
  const parts = commands
    .filter((c) => c.shortcut)
    .map((c) => `${c.shortcut} — ${c.description || c.name}`);
  $("shortcut-list").textContent = parts.length
    ? parts.join(" · ")
    : "No shortcuts assigned yet.";
  const full = commands.find((c) => c.name === "capture-full-page");
  if (full && full.shortcut && $("welcome-shortcut")) {
    $("welcome-shortcut").textContent = full.shortcut;
  }
}

async function save(patch) {
  Object.assign(settings, patch);
  await setSettings(patch);
  toast("Saved");
}

let timer = null;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (el.hidden = true), 1400);
}
