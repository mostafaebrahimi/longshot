import { IS_GECKO, SHORTCUTS_URL, BROWSER_NAME, labelBrowser } from "../shared/env.js";
import { getSettings, setSettings, applyTheme } from "../shared/settings.js";
import { setLanguage, applyI18n, t } from "../shared/i18n.js";

const $ = (id) => document.getElementById(id);
const RESTRICTED =
  /^(chrome|edge|brave|opera|vivaldi|about|devtools|view-source|chrome-extension|moz-extension):/i;
const WEBSTORE = /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i;

let settings = null;
/** The tab the popup was opened over, as `guardRestricted` found it. */
let target = null;
/** Controls the user reached before the stored values arrived. Whatever they
 *  chose stands; the settings must not paint over it a moment later. */
const touched = new Set();
let starting = false;

/**
 * Settled once the popup knows what page is underneath and whether it can be
 * captured. A click is held against this rather than dropped: the buttons are
 * live from the first frame, before any of it is known.
 */
const ready = init();

async function init() {
  // Before the first await. The popup paints as soon as its document parses,
  // and reading storage takes long enough that a quick click on a freshly
  // opened popup would otherwise land on a button nothing was listening to yet
  // — the first click of a session doing nothing at all.
  wireControls();

  settings = await getSettings();
  setLanguage(settings.language);
  applyI18n();
  applyTheme(settings.theme);
  labelBrowser();

  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  if (!touched.has("format")) paintFormat(settings.format);
  if (!touched.has("openEditor")) $("openEditor").checked = settings.openEditor;
  if (!touched.has("autoDownload")) $("autoDownload").checked = settings.autoDownload;

  loadShortcuts();
  await guardRestricted();
}

function wireControls() {
  $("capture-full").addEventListener("click", () => start("full"));
  $("capture-visible").addEventListener("click", () => start("visible"));

  $("format").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    touched.add("format");
    paintFormat(btn.dataset.value);
    setSettings({ format: btn.dataset.value });
  });

  $("openEditor").addEventListener("change", (e) => {
    touched.add("openEditor");
    setSettings({ openEditor: e.target.checked });
  });
  $("autoDownload").addEventListener("change", (e) => {
    touched.add("autoDownload");
    setSettings({ autoDownload: e.target.checked });
  });

  for (const id of ["open-settings", "open-settings-2"]) {
    $(id).addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }
  $("open-shortcuts").addEventListener("click", () => {
    chrome.tabs.create({ url: SHORTCUTS_URL });
    window.close();
  });
}

function paintFormat(value) {
  for (const b of $("format").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.value === value));
  }
}

async function start(mode) {
  if (starting) return;
  starting = true;

  // A click that arrived before the popup had finished looking at the page
  // waits here rather than being thrown away.
  await ready.catch(() => {});
  const button = $(mode === "full" ? "capture-full" : "capture-visible");
  if (button.disabled) {
    starting = false;
    return;
  }

  const sent = await tellWorker({ t: "longshot:start", mode, tabId: target?.id });
  if (!sent) {
    // Nothing was started, so closing would look exactly like the bug we are
    // avoiding. Leave the popup up: the worker is awake by now and the next
    // click goes straight through.
    starting = false;
    return;
  }
  window.close();
}

/**
 * Hand a message to the service worker and wait for it to be taken.
 *
 * The popup is a page that stops existing the moment it closes, and the worker
 * behind it may be asleep. Firing and closing in the same breath can tear the
 * message down before a cold worker has started listening — the other half of
 * the first click doing nothing. Waiting for the acknowledgement keeps the
 * popup alive until the message has landed, and a worker caught mid-start gets
 * a second and third chance before we give up on it.
 */
async function tellWorker(message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const reply = await chrome.runtime.sendMessage(message);
      if (reply && reply.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

async function guardRestricted() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  target = tab || null;
  const url = tab?.url || "";
  if (url.startsWith("file:")) {
    $("blocked").hidden = false;
    if (IS_GECKO) {
      $("blocked-title").textContent = t("popup.blocked.geckoFileTitle");
      $("blocked-detail").textContent = t("popup.blocked.geckoFileDetail");
      $("capture-full").disabled = true;
      $("capture-visible").disabled = true;
      return;
    }
    $("blocked-title").textContent = t("popup.blocked.fileTitle");
    $("blocked-detail").textContent = t("popup.blocked.fileDetail");
    return;
  }
  const blocked = !url || RESTRICTED.test(url) || WEBSTORE.test(url);
  if (!blocked) return;
  $("blocked").hidden = false;
  $("blocked-title").textContent = t("popup.blocked.title", { browser: BROWSER_NAME });
  $("blocked-detail").textContent = t("popup.blocked.detail");
  $("capture-full").disabled = true;
  $("capture-visible").disabled = true;
}

/** Show the shortcuts the user actually has, not the ones we suggested. */
async function loadShortcuts() {
  const commands = await chrome.commands.getAll();
  const map = { "capture-full-page": "kbd-full", "capture-visible": "kbd-visible" };
  for (const cmd of commands) {
    const el = $(map[cmd.name]);
    if (!el) continue;
    if (cmd.shortcut) el.textContent = cmd.shortcut.replace(/\+/g, " ");
    else el.hidden = true;
  }
}
