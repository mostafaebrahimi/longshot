/**
 * Longshot service worker.
 *
 * Drives a capture: injects the agent, walks the tile plan, takes a bitmap per
 * step, and streams each tile straight to the editor tab over a port. Tiles are
 * never buffered here — the editor draws them as they arrive, so a 40-tile page
 * costs the worker almost nothing.
 */
import { DEFAULTS, getSettings } from "../shared/settings.js";

const AGENT_FILE = "src/content/capture.js";
const RESTRICTED =
  /^(chrome|edge|brave|opera|vivaldi|about|devtools|view-source|chrome-extension|moz-extension):/i;
const WEBSTORE = /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i;

/** @type {{id:number,tabId:number,cancelled:boolean,port:chrome.runtime.Port|null}|null} */
let current = null;
let seq = 0;
const waitingForPort = new Map();

/* -------------------------------------------------------------- entrypoints */

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "capture-full-page",
      title: "Capture full page",
      contexts: ["page", "selection", "image", "link"],
    });
    chrome.contextMenus.create({
      id: "capture-visible",
      title: "Capture visible area",
      contexts: ["page", "selection", "image", "link"],
    });
  });
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html?welcome=1") });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab) begin(tab, info.menuItemId === "capture-visible" ? "visible" : "full");
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;
  if (command === "capture-full-page") begin(tab, "full");
  if (command === "capture-visible") begin(tab, "visible");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.t !== "string") return;
  if (msg.t === "longshot:start") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) begin(tab, msg.mode);
    })();
    sendResponse({ ok: true });
    return;
  }
  if (msg.t === "longshot:cancel") {
    if (current) current.cancelled = true;
    sendResponse({ ok: true });
    return;
  }
  if (msg.t === "longshot:status") {
    sendResponse({ busy: !!current });
    return;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  const m = /^longshot-editor:(\d+)$/.exec(port.name);
  if (!m) return;
  const id = Number(m[1]);
  const resolve = waitingForPort.get(id);
  if (resolve) {
    waitingForPort.delete(id);
    resolve(port);
  }
  port.onMessage.addListener((m2) => {
    if (m2 && m2.t === "cancel" && current && current.id === id) current.cancelled = true;
  });
});

/* ------------------------------------------------------------------ capture */

// tools/smoke-test.mjs drives a capture from here; a headless browser has no
// way to produce the click that would normally start one.
globalThis.longshot = { begin };

async function begin(tab, mode) {
  if (current) {
    flashBadge("···", "#f2c14e", "A capture is already running");
    return;
  }
  const id = ++seq;
  current = { id, tabId: tab.id, cancelled: false, port: null };
  try {
    await runCapture(tab, mode, current);
  } catch (err) {
    const message = friendlyError(err, tab);
    if (current && current.port) {
      try {
        current.port.postMessage({ t: "failed", message });
      } catch {}
    } else if (current && current.editorTabId) {
      await chrome.tabs
        .update(current.editorTabId, { url: editorUrl(id, message), active: true })
        .catch(() => {});
    } else {
      await openEditorTab(tab, id, message);
    }
    await chrome.tabs.sendMessage(tab.id, { t: "longshot:finish" }).catch(() => {});
    flashBadge("!", "#ff6b5e", message);
  } finally {
    current = null;
    waitingForPort.delete(id);
    chrome.action.setBadgeText({ text: "" });
  }
}

async function runCapture(tab, mode, session) {
  if (!tab.url || RESTRICTED.test(tab.url) || WEBSTORE.test(tab.url)) {
    throw new Error(
      "Chrome blocks extensions on this page. Try it on a normal http:// or https:// site."
    );
  }

  const settings = await getSettings();
  const opts = {
    mode,
    settleMs: clamp(settings.settleMs, 0, 3000),
    preScroll: mode === "full" && settings.preScroll,
    hideFixed: settings.hideFixed,
    freezeMotion: settings.freezeMotion,
    showOverlay: settings.showOverlay && mode === "full",
    maxPixels: settings.maxPixels,
  };

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [AGENT_FILE] });

  const plan = await send(tab.id, { t: "longshot:prepare", opts });
  if (!plan.ok) throw new Error(plan.error || "Could not read this page.");

  const editorTab = await openEditorTab(tab, session.id, null);
  session.editorTabId = editorTab.id;
  const port = await waitForPort(session.id, 20000);
  session.port = port;
  port.onDisconnect.addListener(() => {
    session.cancelled = true;
  });

  port.postMessage({
    t: "begin",
    mode,
    dpr: plan.dpr,
    viewportW: plan.viewportW,
    full: plan.full,
    tiles: plan.positions.length,
    truncated: plan.truncated,
    page: { title: tab.title || "", url: tab.url || "" },
  });

  const format = settings.captureFormat === "jpeg" ? "jpeg" : "png";
  const total = plan.positions.length;
  chrome.action.setBadgeBackgroundColor({ color: "#ff8a3d" });

  for (let i = 0; i < total; i++) {
    if (session.cancelled) throw new CancelledError();
    await assertStillActive(tab.id);

    const step = await send(tab.id, { t: "longshot:step", index: i, opts });
    if (!step.ok) throw new Error(step.error || "Capture was interrupted.");

    const dataUrl = await captureWithRetry(tab.windowId, format, settings.jpegQuality);
    port.postMessage({ t: "tile", index: i, dataUrl, src: step.src, dest: step.dest });

    chrome.action.setBadgeText({ text: `${Math.round(((i + 1) / total) * 100)}` });
  }

  await send(tab.id, { t: "longshot:finish" }).catch(() => {});
  port.postMessage({ t: "complete" });

  if (settings.openEditor) {
    await chrome.tabs.update(editorTab.id, { active: true });
    await chrome.windows.update(editorTab.windowId, { focused: true }).catch(() => {});
  }
}

class CancelledError extends Error {
  constructor() {
    super("Capture cancelled.");
    this.cancelled = true;
  }
}

async function assertStillActive(tabId) {
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (!t || !t.active) {
    throw new Error("The page stopped being the active tab, so the capture stopped.");
  }
}

/** captureVisibleTab is rate limited; back off and retry instead of failing. */
async function captureWithRetry(windowId, format, quality) {
  let wait = 220;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(
        windowId,
        format === "jpeg" ? { format, quality } : { format }
      );
    } catch (err) {
      const msg = String(err && err.message);
      if (!/MAX_CAPTURE|quota|rate/i.test(msg) || attempt === 9) throw err;
      await sleep(wait);
      wait = Math.min(1200, wait * 1.5);
    }
  }
  throw new Error("Chrome refused to take a screenshot of this tab.");
}

async function send(tabId, message) {
  return await chrome.tabs.sendMessage(tabId, message);
}

function editorUrl(sessionId, errorMessage) {
  const url = new URL(chrome.runtime.getURL("src/editor/editor.html"));
  url.searchParams.set("s", String(sessionId));
  if (errorMessage) url.searchParams.set("error", errorMessage);
  return url.toString();
}

async function openEditorTab(tab, sessionId, errorMessage) {
  return await chrome.tabs.create({
    url: editorUrl(sessionId, errorMessage),
    active: !!errorMessage,
    index: tab.index + 1,
    windowId: tab.windowId,
    openerTabId: tab.id,
  });
}

function waitForPort(id, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waitingForPort.delete(id);
      reject(new Error("The editor tab did not open in time."));
    }, timeoutMs);
    waitingForPort.set(id, (port) => {
      clearTimeout(timer);
      resolve(port);
    });
  });
}

/* -------------------------------------------------------------------- utils */

function friendlyError(err, tab) {
  if (err && err.cancelled) return "Capture cancelled.";
  const raw = String((err && err.message) || err);
  if (/Cannot access|Extension manifest|blocked|Missing host permission/i.test(raw)) {
    return `Chrome does not allow extensions to read ${hostOf(tab.url)}. Open the page on a regular site and try again.`;
  }
  if (/Receiving end does not exist|message port closed/i.test(raw)) {
    return "The page reloaded during the capture. Reload it and try again.";
  }
  return raw;
}

function hostOf(url) {
  try {
    return new URL(url).host || url;
  } catch {
    return "this page";
  }
}

function clamp(n, lo, hi) {
  n = Number(n);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS.settleMs;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function flashBadge(text, color, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title: `Longshot — ${title}` });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "Longshot — capture this page" });
  }, 4000);
}
