/**
 * Longshot service worker.
 *
 * Drives a capture: injects the agent, walks the tile plan, takes a bitmap per
 * step, and streams each tile straight to the editor tab over a port. Tiles are
 * never buffered here — the editor draws them as they arrive, so a 40-tile page
 * costs the worker almost nothing.
 */
import { BROWSER_NAME } from "../shared/env.js";
import { DEFAULTS, getSettings, onSettingsChanged } from "../shared/settings.js";
import { setLanguage, t } from "../shared/i18n.js";

// compat.js first: it aliases `chrome` to `browser` on Firefox.
const AGENT_FILES = ["src/shared/compat.js", "src/content/capture.js"];
const RESTRICTED =
  /^(chrome|edge|brave|opera|vivaldi|about|devtools|view-source|chrome-extension|moz-extension):/i;
const WEBSTORE = /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i;

/** @type {{id:number,tabId:number,cancelled:boolean,port:chrome.runtime.Port|null}|null} */
let current = null;
let seq = 0;
const waitingForPort = new Map();

/* -------------------------------------------------------------- entrypoints */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html?welcome=1") });
  }
});

/**
 * Menu titles and the toolbar tooltip are the only strings the worker owns
 * outright, so they are rebuilt whenever the language changes.
 *
 * Runs one at a time. A worker starting up and a language change arriving
 * together would otherwise both clear the menus and both add them back, and the
 * second `create` fails on an id that already exists.
 */
let menuWork = Promise.resolve();
function buildMenus() {
  menuWork = menuWork.then(rebuildMenus).catch(() => {});
  return menuWork;
}

async function rebuildMenus() {
  const settings = await getSettings();
  setLanguage(settings.language);
  await chrome.action.setTitle({ title: t("action.title") });
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
  const contexts = ["page", "selection", "image", "link"];
  await addMenu({ id: "capture-full-page", title: t("menu.full"), contexts });
  await addMenu({ id: "capture-visible", title: t("menu.visible"), contexts });
}

/** `create` reports through runtime.lastError, which has to be read or the
 *  browser logs it as unchecked. */
function addMenu(spec) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(spec, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

buildMenus();
onSettingsChanged((changes) => {
  if (changes.language) buildMenus();
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
      // The popup names the tab it was opened over. By the time the worker
      // looks, that popup has closed and the window may not be the last
      // focused one any more, so asking again can answer with a different page
      // or none at all.
      const tab = await tabFor(msg.tabId);
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

/** The named tab if it is still there, otherwise whatever is in front. */
async function tabFor(tabId) {
  if (typeof tabId === "number") {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab) return tab;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

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
    flashBadge("···", "#f2c14e", t("action.busy"));
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
    if (current && current.restoreZoom) await current.restoreZoom();
    flashBadge("!", "#ff6b5e", message);
  } finally {
    current = null;
    waitingForPort.delete(id);
    chrome.action.setBadgeText({ text: "" });
  }
}

async function runCapture(tab, mode, session) {
  if (!tab.url || RESTRICTED.test(tab.url) || WEBSTORE.test(tab.url)) {
    throw new Error(t("error.restricted", { browser: BROWSER_NAME }));
  }

  const settings = await getSettings();
  setLanguage(settings.language);

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: AGENT_FILES });

  let zoom = await zoomForDetail(tab, settings.captureScale);
  session.restoreZoom = zoom.restore;
  const opts = {
    mode,
    settleMs: clamp(settings.settleMs, 0, 3000),
    preScroll: mode === "full" && settings.preScroll,
    hideFixed: settings.hideFixed,
    pageFrame: settings.pageFrame,
    freezeMotion: settings.freezeMotion,
    showOverlay: settings.showOverlay && mode === "full",
    maxPixels: settings.maxPixels,
    // The capture agent is injected as a classic script and cannot read the
    // catalogues, so the handful of words it shows travel with the options.
    strings: {
      title: t("capture.title"),
      cancel: t("capture.cancel"),
      stopping: t("capture.stopping"),
      tile: t("capture.tile"),
      noVisibleArea: t("error.noVisibleArea"),
      interrupted: t("error.interrupted"),
      unknownMessage: t("error.unknownMessage"),
    },
  };

  let plan = await send(tab.id, { t: "longshot:prepare", opts });
  if (!plan.ok) throw new Error(plan.error || t("error.couldNotRead"));

  // Twice the detail is not worth a picture of a broken page: hand the zoom
  // back and measure again as the page normally sits.
  if (zoom.zoomed && needsMoreWidth(plan)) {
    await send(tab.id, { t: "longshot:finish" }).catch(() => {});
    await zoom.restore();
    zoom = { restore: async () => {}, declined: true };
    session.restoreZoom = null;
    plan = await send(tab.id, { t: "longshot:prepare", opts });
    if (!plan.ok) throw new Error(plan.error || t("error.couldNotRead"));
  }

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
    frame: plan.frame || null,
    tiles: plan.positions.length,
    truncated: plan.truncated,
    scaleDeclined: zoom.declined,
    page: { title: tab.title || "", url: tab.url || "" },
  });

  const format = settings.captureFormat === "jpeg" ? "jpeg" : "png";
  const total = plan.positions.length;
  chrome.action.setBadgeBackgroundColor({ color: "#ff8a3d" });

  for (let i = 0; i < total; i++) {
    if (session.cancelled) throw new CancelledError();
    await assertStillActive(tab.id);

    const step = await send(tab.id, { t: "longshot:step", index: i, opts });
    if (!step.ok) throw new Error(step.error || t("error.interrupted"));

    const dataUrl = await captureWithRetry(tab.windowId, format, settings.jpegQuality);
    // `parts` is a list because one bitmap can land in more than one place: the
    // first screen also supplies the strip that sits below the panel.
    port.postMessage({ t: "tile", index: i, dataUrl, parts: step.parts });

    chrome.action.setBadgeText({ text: `${Math.round(((i + 1) / total) * 100)}` });
  }

  await send(tab.id, { t: "longshot:finish" }).catch(() => {});
  await zoom.restore();
  session.restoreZoom = null;
  port.postMessage({ t: "complete" });

  if (settings.openEditor) {
    await chrome.tabs.update(editorTab.id, { active: true });
    await chrome.windows.update(editorTab.windowId, { focused: true }).catch(() => {});
  }
}

/**
 * Capture at twice the detail by zooming the page first.
 *
 * `captureVisibleTab` hands back exactly what the screen holds, so on an
 * ordinary display that is one image pixel per CSS pixel and no amount of
 * processing afterwards invents more. Zooming to 200% makes the browser draw
 * everything at twice the size, and the same screen then holds twice the detail
 * — genuinely sharper text rather than an enlargement of soft text.
 *
 * The cost is honest and unavoidable: the page lays out in half the CSS width,
 * so a responsive site may arrange itself differently. Hence a setting, and
 * hence the default of 1.
 *
 * Returns a function that puts the zoom back, whatever happens next.
 */
async function zoomForDetail(tab, captureScale) {
  const none = { restore: async () => {}, declined: false };
  const factor = Number(captureScale) || 1;
  if (factor <= 1) return none;

  const zoomSettings = await chrome.tabs.getZoomSettings(tab.id).catch(() => null);
  const before = await chrome.tabs.getZoom(tab.id).catch(() => null);
  if (before == null) return none;

  let restored = false;
  const restore = async () => {
    if (restored) return;
    restored = true;
    await chrome.tabs.setZoom(tab.id, before).catch(() => {});
    if (zoomSettings) await chrome.tabs.setZoomSettings(tab.id, zoomSettings).catch(() => {});
    await sleep(250);
  };

  try {
    // Per-tab scope: the zoom belongs to this capture, not to the site forever.
    await chrome.tabs.setZoomSettings(tab.id, { scope: "per-tab", mode: "automatic" });
    await chrome.tabs.setZoom(tab.id, before * factor);
    await sleep(450); // the page relays out, and often reacts to the resize
  } catch {
    await restore();
    return none;
  }

  return { restore, declined: false, zoomed: true };
}

/**
 * Whether a plan says the page stopped fitting its own window.
 *
 * Zooming halves the width the page has to lay out in, and most interfaces have
 * a floor under that. Below it the panel hangs off the side of the window,
 * where no amount of scrolling reaches it, and anything pinned to the viewport
 * stops covering the page: bare bands down the sides of the image, furniture
 * repeated at every seam. A shell positioned fixed overflows without the
 * document ever reporting it, so the plan is what to ask — it has measured the
 * real thing.
 */
function needsMoreWidth(plan) {
  return !!plan.ok && !!plan.clipped;
}

class CancelledError extends Error {
  constructor() {
    super(t("error.cancelled"));
    this.cancelled = true;
  }
}

async function assertStillActive(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !tab.active) {
    throw new Error(t("error.notActive"));
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
  throw new Error(t("error.refused", { browser: BROWSER_NAME }));
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
      reject(new Error(t("error.editorTimeout")));
    }, timeoutMs);
    waitingForPort.set(id, (port) => {
      clearTimeout(timer);
      resolve(port);
    });
  });
}

/* -------------------------------------------------------------------- utils */

function friendlyError(err, tab) {
  if (err && err.cancelled) return t("error.cancelled");
  const raw = String((err && err.message) || err);
  if (/Cannot access|Extension manifest|blocked|Missing host permission/i.test(raw)) {
    return t("error.hostPermission", { browser: BROWSER_NAME, host: hostOf(tab.url) });
  }
  if (/Receiving end does not exist|message port closed/i.test(raw)) {
    return t("error.reloaded");
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
    chrome.action.setTitle({ title: t("action.title") });
  }, 4000);
}
