/** Longshot editor: receives the tile stream, stitches it, and hosts the
 *  annotation tools and exporters. */

import "../shared/compat.js";
import { applyTheme, getSettings, setSettings, resolveFilename } from "../shared/settings.js";
import { setLanguage, applyI18n, t } from "../shared/i18n.js";
import {
  createDoc,
  addShape,
  removeShape,
  findShape,
  moveShape,
  duplicateShape,
  raiseShape,
  isFrontmost,
  isBackmost,
  viewRect,
  nextStepNumber,
  snapshot,
  dropSnapshot,
  undo,
  redo,
  canUndo,
  canRedo,
  boundsOf,
  hitTest,
  RESIZABLE,
  ENDPOINTS,
} from "./doc.js";
import { drawScene, drawSelection, handlePositions } from "./render.js";
import { openMenu } from "./menu.js";
import { buildOutput, copyToClipboard, saveBlob, waitForDownload, humanSize } from "./export.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const doc = createDoc();
let settings = null;
let tool = "select";
let style = {
  color: "#ff3b30",
  stroke: 5,
  fontSize: 32,
  blurRadius: 14,
  pixelCell: 14,
  stepSize: 22,
};
const view = { zoom: 1, pan: { x: 0, y: 0 } };
let selectionId = null;
let drag = null;
let pendingCrop = null;
let spaceDown = false;
let ready = false;
let captureScale = 1;

const COLORS = [
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#0a84ff",
  "#af52de",
  "#ffffff",
  "#101318",
];

// Names and one-line descriptions live in the catalogues: editor.tool.<id> and
// editor.tool.<id>.hint. The shortcut is a physical key, so it is not translated.
const TOOLS = [
  { id: "select", key: "V", icon: iconCursor },
  { id: "crop", key: "C", icon: iconCrop },
  "divider",
  { id: "arrow", key: "A", icon: iconArrow },
  { id: "line", key: "L", icon: iconLine },
  { id: "rect", key: "R", icon: iconRect },
  { id: "ellipse", key: "E", icon: iconEllipse },
  { id: "pen", key: "P", icon: iconPen },
  "divider",
  { id: "text", key: "T", icon: iconText },
  { id: "step", key: "S", icon: iconStep },
  { id: "highlight", key: "H", icon: iconHighlight },
  "divider",
  { id: "blur", key: "B", icon: iconBlur },
  { id: "pixelate", key: "X", icon: iconPixelate },
  { id: "redact", key: "K", icon: iconRedact },
];

const SIZE_SPEC = {
  text: { label: "editor.size.text", min: 10, max: 140, key: "fontSize" },
  blur: { label: "editor.size.blur", min: 2, max: 50, key: "blurRadius" },
  pixelate: { label: "editor.size.cell", min: 4, max: 60, key: "pixelCell" },
  step: { label: "editor.size.width", min: 10, max: 70, key: "stepSize" },
  highlight: null,
  redact: null,
  crop: null,
  select: null,
};

const canvas = $("view");
const ctx = canvas.getContext("2d");

// Read by tools/smoke-test.mjs to sample the stitched bitmap. `extendFrame` is
// exposed so the test can run it with the canvas readbacks counted, and `view`
// so tools/capture-ui.mjs can aim a click at a mark it has just placed.
window.longshot = { doc, extendFrame, view };

boot();

async function boot() {
  settings = await getSettings();
  setLanguage(settings.language);
  applyI18n();
  paintHints();
  applyTheme(settings.theme);
  const saved = await chrome.storage.local.get("editorStyle");
  if (saved.editorStyle) style = { ...style, ...saved.editorStyle };

  initTooltips();
  buildTools();
  buildSwatches();
  wireChrome();
  paintFormat(settings.format);
  syncInspector();
  resizeCanvas();

  const error = params.get("error");
  if (error) {
    showFailure(error);
    return;
  }
  connectStream(params.get("s"));
}

/* ------------------------------------------------------------ tile stream */

function connectStream(sessionId) {
  if (!sessionId) {
    showFailure(t("editor.lostCapture"));
    return;
  }
  const port = chrome.runtime.connect({ name: `longshot-editor:${sessionId}` });
  let queue = Promise.resolve();
  let expected = 0;
  let done = 0;

  $("progress-cancel").addEventListener("click", () => {
    port.postMessage({ t: "cancel" });
    $("progress-title").textContent = t("editor.progress.stopping");
  });

  port.onMessage.addListener((msg) => {
    if (msg.t === "begin") {
      expected = msg.tiles;
      doc.meta = {
        title: msg.page.title,
        url: msg.page.url,
        dpr: msg.dpr,
        mode: msg.mode,
        truncated: msg.truncated,
        scaleDeclined: msg.scaleDeclined,
        viewportW: msg.viewportW,
        full: msg.full,
        frame: msg.frame || null,
      };
      buildLadder(expected);
      $("progress-count").textContent = t("editor.progress.tile", { done: 0, total: expected });
      return;
    }
    if (msg.t === "tile") {
      queue = queue
        .then(() => paintTile(msg))
        .then(() => {
          done++;
          updateLadder(done, expected);
          $("progress-count").textContent = t("editor.progress.tile", { done, total: expected });
        })
        .catch((err) => showFailure(String(err.message || err)));
      return;
    }
    if (msg.t === "complete") {
      queue = queue.then(finishCapture).catch((err) => showFailure(String(err.message || err)));
      return;
    }
    if (msg.t === "failed") {
      queue.then(() => showFailure(msg.message));
    }
  });

  port.onDisconnect.addListener(() => {
    if (!ready) showFailure(t("editor.stoppedEarly"));
  });
}

async function paintTile(msg) {
  const blob = await (await fetch(msg.dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  if (!doc.base) {
    // The bitmap comes back in device pixels; derive the ratio from the tile
    // itself so page zoom and HiDPI both land correctly.
    captureScale = bitmap.width / doc.meta.viewportW;
    doc.meta.captureScale = captureScale;
    doc.width = Math.max(1, Math.round(doc.meta.full.w * captureScale));
    doc.height = Math.max(1, Math.round(doc.meta.full.h * captureScale));
    const base = document.createElement("canvas");
    base.width = doc.width;
    base.height = doc.height;
    const bctx = base.getContext("2d");
    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, base.width, base.height);
    doc.base = base;
    updateDims();
  }

  const bctx = doc.base.getContext("2d");
  // One bitmap can land in more than one place: the first screen of a framed
  // capture also supplies the strip that belongs at the foot of the image.
  for (const part of msg.parts) placeTile(bctx, bitmap, part);
  bitmap.close();
  draw();
}

/**
 * Copy one region of a tile onto the stitched canvas, pixel for pixel.
 *
 * Both edges of the destination are rounded, and the source is sized to match,
 * rather than rounding an origin and a size independently. At a display scale
 * of 125% or 150% that difference is a one-pixel unpainted line across the
 * image at every other seam — a white thread through the screenshot, on the
 * scaling most Windows machines are set to. Rounding the far edge also means
 * the next tile starts exactly where this one ends.
 *
 * Nothing is ever resampled: the destination is the same number of device
 * pixels as the source, so a screenshot stays as sharp as the screen it
 * came from.
 */
function placeTile(bctx, bitmap, part) {
  const s = captureScale;
  const dx = Math.round(part.dest.x * s);
  const dy = Math.round(part.dest.y * s);
  const w = Math.max(1, Math.round((part.dest.x + part.src.w) * s) - dx);
  const h = Math.max(1, Math.round((part.dest.y + part.src.h) * s) - dy);

  // Keep the source inside the bitmap. Tiles overlap, so shifting back by the
  // odd pixel repeats content that is identical either way.
  const sx = Math.min(Math.max(0, Math.round(part.src.x * s)), Math.max(0, bitmap.width - w));
  const sy = Math.min(Math.max(0, Math.round(part.src.y * s)), Math.max(0, bitmap.height - h));
  const sw = Math.min(w, bitmap.width - sx);
  const sh = Math.min(h, bitmap.height - sy);
  if (sw < 1 || sh < 1) return;

  bctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, sw, sh);
}

/**
 * A sidebar is one screen tall however long the page is, so a framed capture has
 * pixels for it beside the first screen and nothing beside the rest. Carry each
 * side column down the image by repeating one row of it — the quietest row
 * available, so a menu item does not get smeared down the page. Background,
 * borders and gradients all survive that; the column reads as one tall panel.
 */
function extendFrame() {
  const frame = doc.meta.frame;
  if (!frame) return;
  const s = captureScale;
  const base = doc.base;
  const ctx = base.getContext("2d");

  const panelX = Math.round(frame.panel.x * s);
  const panelRight = Math.round((frame.panel.x + frame.panel.w) * s);
  const columns = [];
  if (panelX > 0) columns.push({ x: 0, w: panelX });
  if (panelRight < base.width) columns.push({ x: panelRight, w: base.width - panelRight });
  if (!columns.length) return;

  const from = Math.round((frame.top + frame.panel.h) * s); // bottom of the first screen
  const to = base.height - Math.round(frame.bottom * s);
  if (to <= from) return;

  // Smoothing a one-pixel row across hundreds blends it with whatever the
  // sampler reaches for at the edges; the column should be an exact copy.
  ctx.imageSmoothingEnabled = false;
  for (const col of columns) {
    const row = quietestRow(ctx, col, from);
    ctx.drawImage(base, col.x, row, col.w, 1, col.x, from, col.w, to - from);
  }
  ctx.imageSmoothingEnabled = true;
  draw();
}

/**
 * The most uniform row in the bottom third of a column: the one that repeats
 * without leaving a readable streak behind.
 *
 * The whole search area is read in one go. The base canvas is drawn to far more
 * often than it is read from, so it is left GPU-backed, and reading it a row at
 * a time would drag every one of those rows back across the bus.
 */
function quietestRow(ctx, col, bottom) {
  const top = Math.max(0, bottom - Math.max(1, Math.round(bottom / 3)));
  const height = bottom - top;
  if (height < 1 || col.w < 1) return Math.max(0, bottom - 1);

  const { data } = ctx.getImageData(col.x, top, col.w, height);
  const stride = col.w * 4;
  let best = bottom - 1;
  let bestScore = Infinity;
  for (let row = height - 1; row >= 0; row -= 2) {
    const start = row * stride;
    let score = 0;
    for (let i = start + 4; i < start + stride; i += 4) {
      score +=
        Math.abs(data[i] - data[i - 4]) +
        Math.abs(data[i + 1] - data[i - 3]) +
        Math.abs(data[i + 2] - data[i - 2]);
    }
    if (score < bestScore) {
      bestScore = score;
      best = top + row;
      if (score === 0) break;
    }
  }
  return best;
}

async function finishCapture() {
  if (!doc.base) {
    showFailure(t("editor.noPixels"));
    return;
  }
  extendFrame();
  ready = true;
  $("progress").hidden = true;
  $("filename").value = resolveFilename(settings.filename, {
    title: doc.meta.title,
    url: doc.meta.url,
    width: doc.width,
    height: doc.height,
  });
  zoomFit();
  buildRail();
  updateDims();
  setStatus(
    doc.meta.truncated
      ? t("editor.status.truncated")
      : t("editor.status.captured", { w: doc.width, h: doc.height })
  );
  // 2× was asked for and the page could not take it. Say so where the size is
  // reported, rather than leaving someone to wonder why it looks the same.
  if (doc.meta.scaleDeclined) toast(t("editor.status.scaleDeclined"));

  if (settings.copyOnCapture) {
    try {
      await copyToClipboard(doc, settings);
      toast(t("editor.copied"));
    } catch {
      /* the tab may not be focused yet; the Copy button still works */
    }
  }
  if (settings.autoDownload || !settings.openEditor) {
    const downloadId = await save({ silent: !settings.openEditor });
    if (!settings.openEditor) {
      // The file streams from a blob URL owned by this tab, so wait for Chrome
      // to finish writing before the tab disappears.
      if (downloadId) await waitForDownload(downloadId);
      const self = await chrome.tabs.getCurrent();
      if (self) chrome.tabs.remove(self.id);
    }
  }
}

function showFailure(message) {
  $("progress").hidden = true;
  $("failure").hidden = false;
  $("failure-message").textContent = message;
  setStatus(message);
}

/* ------------------------------------------------------------------ chrome */

function buildTools() {
  const nav = $("tools");
  for (const spec of TOOLS) {
    if (spec === "divider") {
      const d = document.createElement("div");
      d.className = "tool-divider";
      nav.appendChild(d);
      continue;
    }
    const b = document.createElement("button");
    b.className = "tool";
    b.dataset.tool = spec.id;
    b.dataset.tipKey = `editor.tool.${spec.id}`;
    b.dataset.hintKey = `editor.tool.${spec.id}.hint`;
    b.dataset.key = spec.key;
    b.dataset.tipSide = "right";
    b.setAttribute("aria-label", t(`editor.tool.${spec.id}`));
    b.setAttribute("aria-pressed", String(spec.id === tool));
    b.innerHTML = spec.icon();
    b.addEventListener("click", () => setTool(spec.id));
    nav.appendChild(b);
  }
}

/* --------------------------------------------------------------- tooltips */

/**
 * One floating card, driven by `data-tip` (name), `data-hint` (what it is for)
 * and `data-key` (its shortcut). The point is finding the right tool without
 * clicking through all of them, so it appears far sooner than a native tooltip,
 * and instantly while moving along a row of controls.
 *
 * Name and hint each come in two flavours: `data-tip-key` is looked up in the
 * catalogue, `data-tip` is used as it stands — for the things that are the same
 * in every language, like a colour's hex or the letters PNG.
 */
const TIPPED = "[data-tip], [data-tip-key]";
const tip = { el: null, target: null, timer: 0, warmUntil: 0 };
const TIP_DELAY = 110;
const TIP_WARM = 500;

function initTooltips() {
  tip.el = document.createElement("div");
  tip.el.className = "tip";
  tip.el.id = "tip";
  tip.el.setAttribute("role", "tooltip");
  tip.el.hidden = true;
  document.body.appendChild(tip.el);

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const target = e.target instanceof Element ? e.target.closest(TIPPED) : null;
    if (target === tip.target) return;
    if (!target) return hideTip();
    clearTimeout(tip.timer);
    if (Date.now() < tip.warmUntil) showTip(target);
    else tip.timer = setTimeout(() => showTip(target), TIP_DELAY);
  });

  // Anything that means "I am busy now" takes it away again.
  document.addEventListener("pointerdown", () => hideTip(true), true);
  document.addEventListener("focusin", (e) => {
    const target = e.target instanceof Element ? e.target.closest(TIPPED) : null;
    if (target) showTip(target);
  });
  document.addEventListener("focusout", () => hideTip());
  window.addEventListener("blur", () => hideTip(true));
  window.addEventListener("scroll", () => hideTip(true), true);
  // Once the keyboard is in use — typing a file name, reaching for a shortcut —
  // a hover hint is just something in the way.
  window.addEventListener("keydown", () => hideTip(true), true);
}

function showTip(target) {
  if (!tip.el || !target.isConnected || target.hasAttribute("disabled")) return;
  clearTimeout(tip.timer);
  tip.target = target;

  const head = document.createElement("div");
  head.className = "tip-head";
  const name = document.createElement("span");
  name.textContent = target.dataset.tipKey ? t(target.dataset.tipKey) : target.dataset.tip;
  head.appendChild(name);
  if (target.dataset.key) {
    const key = document.createElement("kbd");
    key.textContent = target.dataset.key;
    head.appendChild(key);
  }
  tip.el.replaceChildren(head);
  const hintText = target.dataset.hintKey ? t(target.dataset.hintKey) : target.dataset.hint;
  if (hintText) {
    const hint = document.createElement("p");
    hint.textContent = hintText;
    tip.el.appendChild(hint);
  }

  tip.el.hidden = false;
  placeTip(target);
  tip.el.classList.add("on");
  target.setAttribute("aria-describedby", "tip");
}

function hideTip(immediate) {
  clearTimeout(tip.timer);
  if (!tip.el || tip.el.hidden) {
    tip.target = null;
    return;
  }
  // Moving along a toolbar should not re-run the delay every time.
  tip.warmUntil = immediate ? 0 : Date.now() + TIP_WARM;
  tip.el.classList.remove("on");
  tip.el.hidden = true;
  if (tip.target) tip.target.removeAttribute("aria-describedby");
  tip.target = null;
}

function placeTip(target) {
  const r = target.getBoundingClientRect();
  const box = tip.el.getBoundingClientRect();
  const gap = 9;
  const pad = 8;

  let side = target.dataset.tipSide || "bottom";
  if (side === "right" && r.right + gap + box.width > window.innerWidth - pad) side = "left";
  if (side === "left" && r.left - gap - box.width < pad) side = "bottom";
  if (side === "bottom" && r.bottom + gap + box.height > window.innerHeight - pad) side = "top";

  let left;
  let top;
  if (side === "right" || side === "left") {
    left = side === "right" ? r.right + gap : r.left - gap - box.width;
    top = r.top + r.height / 2 - box.height / 2;
  } else {
    left = r.left + r.width / 2 - box.width / 2;
    top = side === "bottom" ? r.bottom + gap : r.top - gap - box.height;
  }

  const fit = (v, size, limit) => Math.max(pad, Math.min(v, limit - size - pad));
  tip.el.style.left = `${Math.round(fit(left, box.width, window.innerWidth))}px`;
  tip.el.style.top = `${Math.round(fit(top, box.height, window.innerHeight))}px`;
}

function buildSwatches() {
  const wrap = $("swatches");
  for (const c of COLORS) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.background = c;
    b.dataset.swatch = c;
    b.dataset.tip = c.toUpperCase();
    b.dataset.hintKey = "editor.colour.hint";
    b.setAttribute("aria-label", `Colour ${c}`);
    b.setAttribute("aria-pressed", String(c === style.color));
    b.addEventListener("click", () => {
      style.color = c;
      persistStyle();
      for (const s of wrap.children) s.setAttribute("aria-pressed", String(s.dataset.swatch === c));
      const sel = selectionId && findShape(doc, selectionId);
      if (sel && sel.type !== "blur" && sel.type !== "pixelate") {
        snapshot(doc);
        sel.color = c;
        draw();
      }
    });
    wrap.appendChild(b);
  }
}

function setTool(id) {
  tool = id;
  if (id !== "select") selectionId = null;
  if (id !== "crop") pendingCrop = null;
  for (const b of $("tools").children) {
    if (b.dataset.tool) b.setAttribute("aria-pressed", String(b.dataset.tool === id));
  }
  canvas.className = id === "select" ? "pointer" : "";
  syncInspector();
  draw();
}

const STROKE_SPEC = { label: "Width", min: 1, max: 40, key: "stroke" };

function syncInspector() {
  const selected = selectionId ? findShape(doc, selectionId) : null;
  const subject = selected ? selected.type : tool;
  const active = subject in SIZE_SPEC ? SIZE_SPEC[subject] : STROKE_SPEC;

  $("inspector").hidden = false;
  const sizeCtl = $("size").closest(".ctl");
  sizeCtl.hidden = !active;
  if (active) {
    $("size-label").textContent = t(active.label);
    $("size").min = active.min;
    $("size").max = active.max;
    $("size").value = style[active.key];
    $("size-value").textContent = style[active.key];
    $("size").dataset.key = active.key;
  }
  $("crop-actions").hidden = tool !== "crop";
  $("undo").disabled = !canUndo(doc);
  $("redo").disabled = !canRedo(doc);
  $("delete").disabled = !selectionId;
}

function wireChrome() {
  let sliderSnapped = false;
  $("size").addEventListener("input", (e) => {
    const key = e.target.dataset.key;
    style[key] = Number(e.target.value);
    $("size-value").textContent = e.target.value;
    const sel = selectionId && findShape(doc, selectionId);
    if (sel) {
      // One history entry per drag, not one per pixel of slider travel.
      if (!sliderSnapped) {
        snapshot(doc);
        sliderSnapped = true;
      }
      applyStyleTo(sel);
      draw();
    }
  });
  $("size").addEventListener("change", () => {
    sliderSnapped = false;
    persistStyle();
    syncInspector();
  });

  $("undo").addEventListener("click", () => stepHistory(undo));
  $("redo").addEventListener("click", () => stepHistory(redo));
  $("delete").addEventListener("click", deleteSelection);

  $("crop-apply").addEventListener("click", applyCrop);
  $("crop-reset").addEventListener("click", resetCrop);

  $("zoom-in").addEventListener("click", () => setZoom(view.zoom * 1.25));
  $("zoom-out").addEventListener("click", () => setZoom(view.zoom / 1.25));
  $("zoom-value").addEventListener("click", () => setZoom(1));
  $("zoom-fit").addEventListener("click", zoomFit);

  $("format").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-value]");
    if (!b) return;
    settings.format = b.dataset.value;
    setSettings({ format: settings.format });
    paintFormat(settings.format);
  });

  $("save").addEventListener("click", () => save({}));
  $("copy").addEventListener("click", copyImage);
  $("open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("failure-close").addEventListener("click", () => window.close());

  $("rail").addEventListener("pointerdown", railJump);
  $("rail").addEventListener("pointermove", (e) => {
    if (e.buttons === 1) railJump(e);
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    buildRail();
    draw();
  });

  canvas.addEventListener("dblclick", (e) => {
    if (tool !== "select") return;
    const p = eventPoint(e);
    const hit = hitTest(doc, p.x, p.y, 6 / view.zoom);
    if (hit && hit.type === "text") openTextInput(null, hit);
  });
  // Clicking something unfocusable clears the focus, and the browser does that
  // after the pointer handlers have run — which blurs the caption box the text
  // tool has just opened, and blurring it is what commits it. So a click with
  // the text tool armed used to open the box and shut it again in one frame.
  canvas.addEventListener("mousedown", (e) => {
    if (tool === "text" && e.button === 0) e.preventDefault();
  });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  document.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceDown = false;
      canvas.classList.remove("grab");
    }
  });
}

function paintFormat(value) {
  for (const b of $("format").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.value === value));
  }
  $("save").lastChild.textContent = ` ${t("editor.saveFormat", { format: value === "jpeg" ? "JPG" : value.toUpperCase() })}`;
}

function persistStyle() {
  chrome.storage.local.set({ editorStyle: style });
}

function applyStyleTo(shape) {
  if ("stroke" in shape) shape.stroke = style.stroke;
  if (shape.type === "text") shape.size = style.fontSize;
  if (shape.type === "blur") shape.radius = style.blurRadius;
  if (shape.type === "pixelate") shape.cell = style.pixelCell;
  if (shape.type === "step") shape.size = style.stepSize;
}

/* ------------------------------------------------------------------ export */

async function save({ silent } = {}) {
  if (!ready) return;
  const btn = $("save");
  btn.disabled = true;
  try {
    const out = await buildOutput(doc, settings);
    const name = ($("filename").value || "screenshot").replace(/\.[a-z0-9]+$/i, "");
    const id = await saveBlob(out.blob, `${name}.${out.extension}`, !settings.autoDownload);
    if (!silent) toast(t("editor.saved", { name: `${name}.${out.extension}`, size: humanSize(out.blob.size) }));
    return id;
  } catch (err) {
    toast(t("editor.saveFailed", { error: err.message }), true);
    return null;
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------- view */

function resizeCanvas() {
  const stage = $("stage").getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(stage.width * dpr));
  canvas.height = Math.max(1, Math.round(stage.height * dpr));
}

function stageSize() {
  const r = $("stage").getBoundingClientRect();
  return { w: r.width, h: r.height };
}

function setZoom(z, anchor) {
  const stage = stageSize();
  const next = Math.min(8, Math.max(0.05, z));
  const a = anchor || { x: stage.w / 2, y: stage.h / 2 };
  const before = screenToImage(a.x, a.y);
  view.zoom = next;
  view.pan.x = before.x - a.x / next;
  view.pan.y = before.y - a.y / next;
  clampPan();
  $("zoom-value").textContent = `${Math.round(next * 100)}%`;
  draw();
}

/** Fit the width, not the whole image. A full-page screenshot is mostly tall,
 *  and shrinking it to fit the height leaves it unreadable in a sea of grey. */
function zoomFit() {
  const rect = viewRect(doc);
  const stage = stageSize();
  if (!rect.w || !rect.h) return;
  view.zoom = Math.min(1, (stage.w - 48) / rect.w);
  const visibleH = stage.h / view.zoom;
  view.pan.x = rect.x - (stage.w / view.zoom - rect.w) / 2;
  view.pan.y =
    visibleH >= rect.h ? rect.y - (visibleH - rect.h) / 2 : rect.y - 16 / view.zoom;
  clampPan();
  $("zoom-value").textContent = `${Math.round(view.zoom * 100)}%`;
  draw();
}

function clampPan() {
  const rect = viewRect(doc);
  const stage = stageSize();
  const visW = stage.w / view.zoom;
  const visH = stage.h / view.zoom;
  const slackX = Math.max(24 / view.zoom, (visW - rect.w) / 2);
  const slackY = Math.max(24 / view.zoom, (visH - rect.h) / 2);
  view.pan.x = clamp(view.pan.x, rect.x - slackX, rect.x + rect.w - visW + slackX);
  view.pan.y = clamp(view.pan.y, rect.y - slackY, rect.y + rect.h - visH + slackY);
}

function screenToImage(sx, sy) {
  return { x: view.pan.x + sx / view.zoom, y: view.pan.y + sy / view.zoom };
}

function eventPoint(e) {
  const r = canvas.getBoundingClientRect();
  return screenToImage(e.clientX - r.left, e.clientY - r.top);
}

function draw() {
  if (canvas.width === 0) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!doc.base) return;

  const rect = viewRect(doc);
  const z = view.zoom * dpr;
  // A full-page shot is shown at a third of its size or less, and the default
  // sampler makes that look far worse than the file actually is.
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(z, 0, 0, z, -view.pan.x * z, -view.pan.y * z);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  drawScene(ctx, doc);
  ctx.restore();

  if (tool === "crop" && pendingCrop) drawCropOverlay(ctx, rect);

  // Hairline around the image so its edges read against the stage.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    (rect.x - view.pan.x) * view.zoom - 0.5,
    (rect.y - view.pan.y) * view.zoom - 0.5,
    rect.w * view.zoom + 1,
    rect.h * view.zoom + 1
  );

  const sel = selectionId ? findShape(doc, selectionId) : null;
  if (sel) drawSelection(ctx, sel, view.zoom, view.pan);

  updateRailView();
}

function drawCropOverlay(c, rect) {
  const cr = normRect(pendingCrop);
  c.save();
  c.fillStyle = "rgba(16,18,22,.62)";
  c.beginPath();
  c.rect(rect.x, rect.y, rect.w, rect.h);
  c.rect(cr.x, cr.y, cr.w, cr.h);
  c.fill("evenodd");
  c.strokeStyle = "#ff8a3d";
  c.lineWidth = 1 / view.zoom;
  c.strokeRect(cr.x, cr.y, cr.w, cr.h);
  // thirds, so the crop reads as a framing tool rather than a plain marquee
  c.globalAlpha = 0.45;
  for (let i = 1; i < 3; i++) {
    c.beginPath();
    c.moveTo(cr.x + (cr.w / 3) * i, cr.y);
    c.lineTo(cr.x + (cr.w / 3) * i, cr.y + cr.h);
    c.moveTo(cr.x, cr.y + (cr.h / 3) * i);
    c.lineTo(cr.x + cr.w, cr.y + (cr.h / 3) * i);
    c.stroke();
  }
  c.restore();
}

/* ----------------------------------------------------------------- pointer */

function onPointerDown(e) {
  if (!ready) return;
  canvas.setPointerCapture(e.pointerId);
  const p = eventPoint(e);

  if (spaceDown || e.button === 1) {
    drag = { kind: "pan", startX: e.clientX, startY: e.clientY, pan: { ...view.pan } };
    canvas.classList.add("grabbing");
    return;
  }
  if (e.button !== 0) return;

  if (tool === "select") return startSelectDrag(p);
  if (tool === "crop") {
    const handle = pendingCrop ? hitHandleRect(normRect(pendingCrop), p) : -1;
    drag =
      handle >= 0
        ? { kind: "crop-resize", handle, rect: normRect(pendingCrop) }
        : ((pendingCrop = { x: p.x, y: p.y, w: 0, h: 0 }), { kind: "crop-new", origin: p });
    draw();
    return;
  }
  if (tool === "text") return openTextInput(p, null);
  if (tool === "step") {
    snapshot(doc);
    const shape = addShape(doc, {
      type: "step",
      x: p.x,
      y: p.y,
      n: nextStepNumber(doc),
      size: style.stepSize,
      color: style.color,
    });
    selectionId = shape.id;
    drag = { kind: "move", id: shape.id, last: p };
    draw();
    syncInspector();
    return;
  }

  snapshot(doc);
  const shape = addShape(doc, newShapeAt(tool, p));
  drag = { kind: "draw", id: shape.id, origin: p, shift: false };
  selectionId = null;
  draw();
}

function newShapeAt(kind, p) {
  const base = { type: kind, color: style.color, stroke: style.stroke };
  switch (kind) {
    case "arrow":
    case "line":
      return { ...base, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    case "pen":
      return { ...base, points: [p.x, p.y] };
    case "blur":
      return { type: "blur", x: p.x, y: p.y, w: 0, h: 0, radius: style.blurRadius };
    case "pixelate":
      return { type: "pixelate", x: p.x, y: p.y, w: 0, h: 0, cell: style.pixelCell };
    case "redact":
      return { type: "redact", x: p.x, y: p.y, w: 0, h: 0, color: "#101318" };
    case "highlight":
      return { type: "highlight", x: p.x, y: p.y, w: 0, h: 0, color: style.color };
    default:
      return { ...base, x: p.x, y: p.y, w: 0, h: 0 };
  }
}

function startSelectDrag(p) {
  const sel = selectionId ? findShape(doc, selectionId) : null;
  if (sel) {
    const handle = hitShapeHandle(sel, p);
    if (handle >= 0) {
      drag = { kind: "handle", id: sel.id, handle, origin: p };
      return;
    }
  }
  const hit = hitTest(doc, p.x, p.y, 6 / view.zoom);
  selectionId = hit ? hit.id : null;
  if (hit) drag = { kind: "move", id: hit.id, last: p };
  draw();
  syncInspector();
}

function onPointerMove(e) {
  if (!drag) {
    if (spaceDown) canvas.classList.add("grab");
    return;
  }
  const p = eventPoint(e);

  switch (drag.kind) {
    case "pan":
      view.pan.x = drag.pan.x - (e.clientX - drag.startX) / view.zoom;
      view.pan.y = drag.pan.y - (e.clientY - drag.startY) / view.zoom;
      clampPan();
      draw();
      return;
    case "crop-new":
      pendingCrop = { x: drag.origin.x, y: drag.origin.y, w: p.x - drag.origin.x, h: p.y - drag.origin.y };
      draw();
      return;
    case "crop-resize": {
      pendingCrop = resizeRect(drag.rect, drag.handle, p);
      draw();
      return;
    }
    case "draw": {
      const s = findShape(doc, drag.id);
      if (!s) return;
      if (s.type === "pen") s.points.push(p.x, p.y);
      else if (ENDPOINTS.has(s.type)) {
        s.x2 = p.x;
        s.y2 = p.y;
        if (e.shiftKey) {
          const dx = s.x2 - s.x1;
          const dy = s.y2 - s.y1;
          if (Math.abs(dx) > Math.abs(dy)) s.y2 = s.y1;
          else s.x2 = s.x1;
        }
      } else {
        s.w = p.x - drag.origin.x;
        s.h = p.y - drag.origin.y;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(s.w), Math.abs(s.h));
          s.w = Math.sign(s.w || 1) * side;
          s.h = Math.sign(s.h || 1) * side;
        }
      }
      draw();
      return;
    }
    case "move": {
      const s = findShape(doc, drag.id);
      if (!s) return;
      if (!drag.snapped) {
        snapshot(doc);
        drag.snapped = true;
      }
      moveShape(s, p.x - drag.last.x, p.y - drag.last.y);
      drag.last = p;
      draw();
      return;
    }
    case "handle": {
      const s = findShape(doc, drag.id);
      if (!s) return;
      if (!drag.snapped) {
        snapshot(doc);
        drag.snapped = true;
      }
      if (ENDPOINTS.has(s.type)) {
        if (drag.handle === 0) {
          s.x1 = p.x;
          s.y1 = p.y;
        } else {
          s.x2 = p.x;
          s.y2 = p.y;
        }
      } else if (RESIZABLE.has(s.type)) {
        const r = resizeRect(boundsOf(s), drag.handle, p);
        Object.assign(s, r);
      }
      draw();
      return;
    }
  }
}

function onPointerUp() {
  if (!drag) return;
  canvas.classList.remove("grabbing");

  if (drag.kind === "draw") {
    const s = findShape(doc, drag.id);
    if (s && isDegenerate(s)) {
      removeShape(doc, s.id);
      dropSnapshot(doc); // the click never became a shape
    } else if (s) {
      // The tool stays armed: annotating a screenshot means drawing the same
      // kind of mark several times over. The new shape is selected all the
      // same, so the colour and size controls act on it. Press V to stop.
      selectionId = s.id;
    }
  }
  if (drag.kind === "crop-new" && pendingCrop && Math.abs(pendingCrop.w) < 8) pendingCrop = null;

  drag = null;
  draw();
  syncInspector();
}

function isDegenerate(s) {
  if (s.type === "pen") return s.points.length < 6;
  const b = boundsOf(s);
  return b.w < 4 && b.h < 4;
}

function hitShapeHandle(s, p) {
  const tol = 8 / view.zoom;
  if (ENDPOINTS.has(s.type)) {
    if (Math.hypot(p.x - s.x1, p.y - s.y1) < tol) return 0;
    if (Math.hypot(p.x - s.x2, p.y - s.y2) < tol) return 1;
    return -1;
  }
  if (!RESIZABLE.has(s.type)) return -1;
  return hitHandleRect(boundsOf(s), p);
}

function hitHandleRect(b, p) {
  const tol = 9 / view.zoom;
  const pts = handlePositions(b.x, b.y, b.w, b.h);
  for (let i = 0; i < pts.length; i++) {
    if (Math.abs(p.x - pts[i][0]) < tol && Math.abs(p.y - pts[i][1]) < tol) return i;
  }
  return -1;
}

function resizeRect(b, handle, p) {
  let { x, y, w, h } = b;
  const right = x + w;
  const bottom = y + h;
  if (handle === 0) return normRect({ x: p.x, y: p.y, w: right - p.x, h: bottom - p.y });
  if (handle === 1) return normRect({ x, y: p.y, w: p.x - x, h: bottom - p.y });
  if (handle === 2) return normRect({ x: p.x, y, w: right - p.x, h: p.y - y });
  return normRect({ x, y, w: p.x - x, h: p.y - y });
}

function normRect(r) {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

function onWheel(e) {
  if (!ready) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const r = canvas.getBoundingClientRect();
    setZoom(view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    });
    return;
  }
  // A full-page screenshot is mostly vertical, so plain scroll pans down it.
  view.pan.y += e.deltaY / view.zoom;
  view.pan.x += e.deltaX / view.zoom;
  clampPan();
  draw();
}

/* --------------------------------------------------------- context menu */

/**
 * Right-click gets the editor's own menu rather than the browser's, because
 * "Save image as…" over a screenshot that has not been cropped, annotated or
 * even finished stitching yet would save the wrong thing entirely.
 *
 * What the menu offers depends on what is under the pointer: on a mark, the
 * things that can be done to that mark; anywhere else, the things that can be
 * done to the shot as a whole.
 */
function onContextMenu(e) {
  // A file name or a caption keeps the browser's menu — it is the only way to
  // reach the system clipboard from a text field.
  if (e.target instanceof Element && e.target.closest("input, textarea")) return;
  e.preventDefault();
  if (drag) return; // mid-stroke; the release belongs to the drawing

  const shape = pickForMenu(e);
  openMenu(e.clientX, e.clientY, shape ? shapeMenu(shape) : imageMenu());
}

/** Right-clicking a mark selects it first, the way clicking one does — the menu
 *  then names it, and the colour and size controls act on it too. */
function pickForMenu(e) {
  // Off the canvas — the toolbar, the rail, the status bar — the menu is about
  // the shot, and the selection is left exactly as it was. Mid-crop it is about
  // the crop: the marks underneath are not what is being worked on, and the
  // menu is the second way to apply or drop the rectangle.
  if (e.target !== canvas || !ready || tool === "crop") return null;
  const p = eventPoint(e);
  const hit = hitTest(doc, p.x, p.y, 6 / view.zoom);
  if ((hit ? hit.id : null) !== selectionId) {
    selectionId = hit ? hit.id : null;
    draw();
    syncInspector();
  }
  return hit;
}

function imageMenu() {
  const format = settings.format === "jpeg" ? "JPG" : settings.format.toUpperCase();
  return [
    {
      header: t("editor.menu.image"),
      items: [
        {
          label: t("editor.menu.copyImage"),
          key: "Ctrl+C",
          icon: iconCopy(),
          disabled: !ready,
          run: copyImage,
        },
        {
          label: t("editor.saveFormat", { format }),
          key: "Ctrl+S",
          icon: iconSave(),
          disabled: !ready,
          run: () => save({}),
        },
      ],
    },
    {
      items: [
        {
          label: t("editor.undo"),
          key: "Ctrl+Z",
          icon: iconUndo(),
          disabled: !canUndo(doc),
          run: () => stepHistory(undo),
        },
        {
          label: t("editor.redo"),
          key: "Ctrl+Shift+Z",
          icon: iconRedo(),
          disabled: !canRedo(doc),
          run: () => stepHistory(redo),
        },
      ],
    },
    {
      items: [
        pendingCrop && {
          label: t("editor.crop.apply.tip"),
          key: "Enter",
          icon: iconCrop(),
          run: applyCrop,
        },
        doc.crop && { label: t("editor.crop.reset.tip"), icon: iconUncrop(), run: resetCrop },
      ],
    },
    {
      items: [
        { label: t("editor.zoomFit"), key: "0", icon: iconFit(), disabled: !ready, run: zoomFit },
        {
          label: t("editor.zoomReset"),
          icon: iconActual(),
          disabled: !ready,
          run: () => setZoom(1),
        },
      ],
    },
    {
      items: [
        {
          label: t("editor.settings"),
          icon: iconGear(),
          run: () => chrome.runtime.openOptionsPage(),
        },
      ],
    },
  ];
}

function shapeMenu(shape) {
  return [
    {
      // The mark names itself, so there is no doubt which one the menu is about
      // when several overlap.
      header: t(`editor.tool.${shape.type}`),
      items: [
        shape.type === "text" && {
          label: t("editor.menu.editText"),
          icon: iconText(),
          run: () => openTextInput(null, shape),
        },
        {
          label: t("editor.menu.duplicate"),
          key: "Ctrl+D",
          icon: iconDuplicate(),
          run: duplicateSelection,
        },
      ],
    },
    {
      items: [
        {
          label: t("editor.menu.front"),
          key: "]",
          icon: iconFront(),
          disabled: isFrontmost(doc, shape.id),
          run: () => restackSelection(true),
        },
        {
          label: t("editor.menu.back"),
          key: "[",
          icon: iconBack(),
          disabled: isBackmost(doc, shape.id),
          run: () => restackSelection(false),
        },
      ],
    },
    {
      items: [
        { label: t("editor.delete"), key: "Del", icon: iconTrash(), danger: true, run: deleteSelection },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ crop */

function applyCrop() {
  if (!pendingCrop) {
    toast(t("editor.crop.needRect"));
    return;
  }
  const cr = normRect(pendingCrop);
  const rect = viewRect(doc);
  const x = clamp(cr.x, rect.x, rect.x + rect.w);
  const y = clamp(cr.y, rect.y, rect.y + rect.h);
  const w = clamp(cr.w, 1, rect.x + rect.w - x);
  const h = clamp(cr.h, 1, rect.y + rect.h - y);
  snapshot(doc);
  doc.crop = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  pendingCrop = null;
  setTool("select");
  zoomFit();
  buildRail();
  updateDims();
}

/* ------------------------------------------------------------------- text */

function openTextInput(p, existing) {
  const input = $("text-input");
  const size = existing ? existing.size : style.fontSize;
  const at = existing ? { x: existing.x, y: existing.y } : p;
  input.hidden = false;
  input.value = existing ? existing.text : "";
  input.style.left = `${(at.x - view.pan.x) * view.zoom}px`;
  input.style.top = `${(at.y - view.pan.y) * view.zoom}px`;
  input.style.fontSize = `${Math.max(11, size * view.zoom)}px`;
  input.style.color = existing ? existing.color : style.color;
  input.style.width = `${Math.max(120, 260 * view.zoom)}px`;
  input.style.height = `${Math.max(28, size * 1.6 * view.zoom)}px`;
  input.focus();

  // Hiding the box blurs it, and the blur is delivered before the assignment
  // that follows — so a commit from the keyboard used to re-enter itself
  // through its own blur handler and place the caption twice.
  let closed = false;
  const commit = (save) => {
    if (closed) return;
    closed = true;
    input.onblur = null;
    input.onkeydown = null;
    input.hidden = true;
    const text = input.value.trim();
    if (!save) return draw();
    if (existing) {
      snapshot(doc);
      if (text) existing.text = input.value;
      else removeShape(doc, existing.id);
    } else if (text) {
      snapshot(doc);
      const shape = addShape(doc, {
        type: "text",
        x: at.x,
        y: at.y,
        text: input.value,
        size,
        color: style.color,
      });
      selectionId = shape.id;
    }
    draw();
    syncInspector();
  };

  input.onblur = () => commit(true);
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Escape") commit(false);
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commit(true);
  };
}

/* ------------------------------------------------------------------- rail */

function buildRail() {
  const rail = $("rail");
  if (!doc.base) return;
  const rect = viewRect(doc);
  const railH = Math.max(120, stageSize().h - 24);
  const scale = Math.min(62 / rect.w, railH / rect.h);
  const c = $("rail-canvas");
  const w = Math.max(1, Math.round(rect.w * scale));
  const h = Math.max(1, Math.round(rect.h * scale));
  c.width = w;
  c.height = h;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.style.margin = "0 auto";
  rail.style.height = `${h}px`;
  const cctx = c.getContext("2d");
  cctx.drawImage(doc.base, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  updateRailView();
}

/** The rail only earns its place when the screenshot is taller than the stage. */
function updateRailView() {
  const rail = $("rail");
  if (!doc.base || !ready) return;
  const rect = viewRect(doc);
  rail.hidden = rect.h * view.zoom <= stageSize().h * 1.05;
  if (rail.hidden) return;
  const c = $("rail-canvas");
  const top = c.offsetTop + (Math.max(0, view.pan.y - rect.y) / rect.h) * c.height;
  const height = Math.min(c.height, (stageSize().h / view.zoom / rect.h) * c.height);
  const el = $("rail-view");
  el.style.top = `${top}px`;
  el.style.height = `${Math.max(6, height)}px`;
}

function railJump(e) {
  const rail = $("rail");
  const c = $("rail-canvas");
  const box = rail.getBoundingClientRect();
  const rect = viewRect(doc);
  const y = e.clientY - box.top - c.offsetTop;
  const frac = clamp(y / c.height, 0, 1);
  view.pan.y = rect.y + frac * rect.h - stageSize().h / view.zoom / 2;
  clampPan();
  draw();
}

/* -------------------------------------------------------------- keyboard */

function onKeyDown(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const mod = e.ctrlKey || e.metaKey;

  if (e.code === "Space") {
    spaceDown = true;
    canvas.classList.add("grab");
    e.preventDefault();
    return;
  }
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    const changed = e.shiftKey ? redo(doc) : undo(doc);
    if (changed) {
      selectionId = null;
      draw();
      syncInspector();
    }
    return;
  }
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    save({});
    return;
  }
  if (mod && e.key.toLowerCase() === "c") {
    e.preventDefault();
    copyImage();
    return;
  }
  if (mod && e.key.toLowerCase() === "d") {
    e.preventDefault();
    duplicateSelection();
    return;
  }
  if (mod) return;

  if (e.key === "]" || e.key === "[") {
    e.preventDefault();
    restackSelection(e.key === "]");
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelection();
    return;
  }
  if (e.key === "Escape") {
    selectionId = null;
    pendingCrop = null;
    draw();
    syncInspector();
    return;
  }
  if (e.key === "Enter" && tool === "crop") {
    applyCrop();
    return;
  }
  if (e.key === "+" || e.key === "=") return setZoom(view.zoom * 1.25);
  if (e.key === "-") return setZoom(view.zoom / 1.25);
  if (e.key === "0") return zoomFit();

  const match = TOOLS.find((s) => s !== "divider" && s.key.toLowerCase() === e.key.toLowerCase());
  if (match) setTool(match.id);
}

/* ------------------------------------------------------------------ actions
   Everything below is reachable from more than one place — the toolbar, a
   shortcut, the context menu — so each lives once and is wired up three times. */

function deleteSelection() {
  if (!selectionId) return;
  snapshot(doc);
  removeShape(doc, selectionId);
  selectionId = null;
  draw();
  syncInspector();
}

function duplicateSelection() {
  if (!selectionId) return;
  snapshot(doc);
  // Offset in image pixels, but sized by the zoom, so the copy lands a
  // consistent distance away on screen however far in or out you are.
  const copy = duplicateShape(doc, selectionId, Math.round(16 / view.zoom));
  if (!copy) return dropSnapshot(doc);
  selectionId = copy.id;
  draw();
  syncInspector();
}

function restackSelection(toFront) {
  if (!selectionId) return;
  snapshot(doc);
  if (!raiseShape(doc, selectionId, toFront)) return dropSnapshot(doc);
  draw();
  syncInspector();
}

function stepHistory(step) {
  if (!step(doc)) return;
  selectionId = null;
  draw();
  syncInspector();
}

async function copyImage() {
  try {
    await copyToClipboard(doc, settings);
    toast(t("editor.copied"));
  } catch (err) {
    toast(t("editor.copyFailed", { error: err.message }), true);
  }
}

function resetCrop() {
  snapshot(doc);
  doc.crop = null;
  pendingCrop = null;
  zoomFit();
  buildRail();
  updateDims();
}

/* ------------------------------------------------------------------ misc */

function updateDims() {
  const rect = viewRect(doc);
  const size = { w: Math.round(rect.w), h: Math.round(rect.h) };
  $("dims").textContent = t(doc.crop ? "editor.dims.cropped" : "editor.dims", size);
}

function buildLadder(total) {
  const el = $("ladder");
  el.innerHTML = "";
  for (let i = 0; i < Math.min(total, 24); i++) el.appendChild(document.createElement("i"));
}

function updateLadder(done, total) {
  const rungs = $("ladder").children;
  const lit = Math.round((done / total) * rungs.length);
  for (let i = 0; i < rungs.length; i++) rungs[i].classList.toggle("on", i < lit);
}

/** The shortcut strip along the foot of the window. The keys are physical, so
 *  only the words around them change language. */
function paintHints() {
  const kbd = (label) => `<kbd>${label}</kbd>`;
  $("hints").innerHTML = t("editor.hints", {
    v: kbd("V"),
    c: kbd("C"),
    a: kbd("A"),
    t: kbd("T"),
    b: kbd("B"),
    space: kbd("Space"),
    ctrl: kbd("Ctrl"),
    s: kbd("S"),
  });
}

function setStatus(text) {
  $("status-left").textContent = text;
}

let toastTimer = null;
function toast(message, bad) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle("bad", !!bad);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/* ------------------------------------------------------------------ icons */

function svg(inner) {
  return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
function iconCursor() {
  return svg('<path d="m5 3 6.5 16 2.2-6.3 6.3-2.2z"/>');
}
function iconCrop() {
  return svg('<path d="M6 2v16h16"/><path d="M2 6h16v16"/>');
}
function iconArrow() {
  return svg('<path d="M5 19 19 5"/><path d="M11 5h8v8"/>');
}
function iconLine() {
  return svg('<path d="M5 19 19 5"/>');
}
function iconRect() {
  return svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/>');
}
function iconEllipse() {
  return svg('<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>');
}
function iconPen() {
  return svg('<path d="M3 21c3-1 4-6 7.5-9.5S17 4 19 6s-2 5-5.5 8.5S5 18 3 21z"/>');
}
function iconText() {
  return svg('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>');
}
function iconStep() {
  return svg('<circle cx="12" cy="12" r="8.5"/><path d="M11 9.5 12.5 8.5V16"/>');
}
function iconHighlight() {
  return svg('<path d="M4 15.5 13 6.5l4.5 4.5-9 9H4z"/><path d="M14 20h6"/>');
}
function iconBlur() {
  return svg(
    '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h.01M12 8h.01M12 12h.01M16 12h.01M12 16h.01" stroke-width="2.2"/>'
  );
}
function iconPixelate() {
  return svg(
    '<rect x="3.5" y="3.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/><rect x="13.5" y="3.5" width="7" height="7" opacity=".4"/><rect x="3.5" y="13.5" width="7" height="7" opacity=".4"/>'
  );
}
function iconRedact() {
  return svg('<rect x="3.5" y="8" width="17" height="8" rx="1.5" fill="currentColor" stroke="none"/>');
}

/* The context menu's own set. Same weight as the tools, drawn a size smaller. */
function iconCopy() {
  return svg('<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>');
}
function iconSave() {
  return svg('<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M4 18v2h16v-2"/>');
}
function iconUndo() {
  return svg('<path d="M8 8H4V4"/><path d="M4.5 8.5A8 8 0 1 1 4 12"/>');
}
function iconRedo() {
  return svg('<path d="M16 8h4V4"/><path d="M19.5 8.5A8 8 0 1 0 20 12"/>');
}
function iconUncrop() {
  return svg('<path d="M6 2v16h16"/><path d="M2 6h16v16"/><path d="m9 15 6-6M9 9l6 6"/>');
}
function iconFit() {
  return svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9 6 9v2M16 15h2v-2"/>');
}
function iconActual() {
  return svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M11 10.5 12.5 9.5V15"/>');
}
function iconGear() {
  return svg(
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2 7 7M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8"/>'
  );
}
function iconDuplicate() {
  return svg('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M4 15V4h11"/><path d="M14.5 12v5M12 14.5h5"/>');
}
function iconFront() {
  return svg('<rect x="3.5" y="3.5" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".18"/><path d="M9 20.5h9a2.5 2.5 0 0 0 2.5-2.5V9"/>');
}
function iconBack() {
  return svg('<rect x="8.5" y="8.5" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".18"/><path d="M15 3.5H6A2.5 2.5 0 0 0 3.5 6v9"/>');
}
function iconTrash() {
  return svg('<path d="M4 6.5h16"/><path d="M9.5 6.5V4h5v2.5"/><path d="M6.5 6.5 7.5 20h9l1-13.5"/><path d="M10.5 10v6M13.5 10v6"/>');
}
