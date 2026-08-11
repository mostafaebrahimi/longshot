import { IS_GECKO, SHORTCUTS_URL, labelBrowser } from "../shared/env.js";
import { getSettings, setSettings, applyTheme } from "../shared/settings.js";

const $ = (id) => document.getElementById(id);
const RESTRICTED =
  /^(chrome|edge|brave|opera|vivaldi|about|devtools|view-source|chrome-extension|moz-extension):/i;
const WEBSTORE = /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i;

let settings = null;

init();

async function init() {
  settings = await getSettings();
  applyTheme(settings.theme);
  labelBrowser();

  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  paintFormat(settings.format);
  $("openEditor").checked = settings.openEditor;
  $("autoDownload").checked = settings.autoDownload;

  loadShortcuts();
  await guardRestricted();

  $("capture-full").addEventListener("click", () => start("full"));
  $("capture-visible").addEventListener("click", () => start("visible"));

  $("format").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    paintFormat(btn.dataset.value);
    setSettings({ format: btn.dataset.value });
  });

  $("openEditor").addEventListener("change", (e) =>
    setSettings({ openEditor: e.target.checked })
  );
  $("autoDownload").addEventListener("change", (e) =>
    setSettings({ autoDownload: e.target.checked })
  );

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

function start(mode) {
  chrome.runtime.sendMessage({ t: "longshot:start", mode });
  window.close();
}

async function guardRestricted() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tab?.url || "";
  if (url.startsWith("file:")) {
    $("blocked").hidden = false;
    if (IS_GECKO) {
      $("blocked").querySelector("strong").textContent = "Firefox blocks local files.";
      $("blocked-detail").textContent =
        "Firefox does not let extensions read pages served from your disk. Open the page over http:// or https:// instead.";
      $("capture-full").disabled = true;
      $("capture-visible").disabled = true;
      return;
    }
    $("blocked").querySelector("strong").textContent = "Local files need one more click.";
    $("blocked-detail").textContent =
      "Turn on “Allow access to file URLs” on the extension’s details page to capture files from your disk.";
    return;
  }
  const blocked = !url || RESTRICTED.test(url) || WEBSTORE.test(url);
  if (!blocked) return;
  $("blocked").hidden = false;
  $("blocked-detail").textContent = "Open a regular http:// or https:// page and try again.";
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
