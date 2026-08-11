/** Longshot editor: receives the tile stream, stitches it, and hosts the
 *  annotation tools and exporters. */

import { applyTheme, getSettings, setSettings, resolveFilename } from "../shared/settings.js";
import {
  createDoc,
  addShape,
  removeShape,
  findShape,
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

const TOOLS = [
  { id: "select", key: "V", name: "Select and move", icon: iconCursor },
  { id: "crop", key: "C", name: "Crop", icon: iconCrop },
  "divider",
  { id: "arrow", key: "A", name: "Arrow", icon: iconArrow },
  { id: "line", key: "L", name: "Line", icon: iconLine },
  { id: "rect", key: "R", name: "Rectangle", icon: iconRect },
  { id: "ellipse", key: "E", name: "Ellipse", icon: iconEllipse },
  { id: "pen", key: "P", name: "Freehand", icon: iconPen },
  "divider",
  { id: "text", key: "T", name: "Text", icon: iconText },
  { id: "step", key: "S", name: "Numbered step", icon: iconStep },
  { id: "highlight", key: "H", name: "Highlight", icon: iconHighlight },
  "divider",
  { id: "blur", key: "B", name: "Blur", icon: iconBlur },
  { id: "pixelate", key: "X", name: "Pixelate", icon: iconPixelate },
  { id: "redact", key: "K", name: "Black out", icon: iconRedact },
];

const SIZE_SPEC = {
  text: { label: "Text size", min: 10, max: 140, key: "fontSize" },
  blur: { label: "Blur", min: 2, max: 50, key: "blurRadius" },
  pixelate: { label: "Cell", min: 4, max: 60, key: "pixelCell" },
  step: { label: "Size", min: 10, max: 70, key: "stepSize" },
  highlight: null,
  redact: null,
  crop: null,
  select: null,
};

const canvas = $("view");
const ctx = canvas.getContext("2d");

// Read by tools/smoke-test.mjs to sample the stitched bitmap.
window.longshot = { doc };

boot();

async function boot() {
  settings = await getSettings();
  applyTheme(settings.theme);
  const saved = await chrome.storage.local.get("editorStyle");
  if (saved.editorStyle) style = { ...style, ...saved.editorStyle };

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
    showFailure("This tab lost track of its capture. Start a new one from the toolbar.");
    return;
  }
  const port = chrome.runtime.connect({ name: `longshot-editor:${sessionId}` });
  let queue = Promise.resolve();
  let expected = 0;
  let done = 0;

  $("progress-cancel").addEventListener("click", () => {
    port.postMessage({ t: "cancel" });
    $("progress-title").textContent = "Stopping…";
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
        viewportW: msg.viewportW,
        full: msg.full,
      };
      buildLadder(expected);
      $("progress-count").textContent = `tile 0 / ${expected}`;
      return;
    }
    if (msg.t === "tile") {
      queue = queue
        .then(() => paintTile(msg))
        .then(() => {
          done++;
          updateLadder(done, expected);
          $("progress-count").textContent = `tile ${done} / ${expected}`;
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
    if (!ready) showFailure("The capture stopped before it finished.");
  });
}

async function paintTile(msg) {
  const blob = await (await fetch(msg.dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  if (!doc.base) {
    // The bitmap comes back in device pixels; derive the ratio from the tile
    // itself so page zoom and HiDPI both land correctly.
    captureScale = bitmap.width / doc.meta.viewportW;
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

  const s = captureScale;
  const bctx = doc.base.getContext("2d");
  bctx.drawImage(
    bitmap,
    Math.round(msg.src.x * s),
    Math.round(msg.src.y * s),
    Math.round(msg.src.w * s),
    Math.round(msg.src.h * s),
    Math.round(msg.dest.x * s),
    Math.round(msg.dest.y * s),
    Math.round(msg.src.w * s),
    Math.round(msg.src.h * s)
  );
  bitmap.close();
  draw();
}

async function finishCapture() {
  if (!doc.base) {
    showFailure("No pixels came back from this page.");
    return;
  }
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
      ? "Page was taller than one image can hold — captured as much as fits."
      : `Captured ${doc.width} × ${doc.height} px`
  );

  if (settings.copyOnCapture) {
    try {
      await copyToClipboard(doc, settings);
      toast("Copied to the clipboard");
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
  for (const t of TOOLS) {
    if (t === "divider") {
      const d = document.createElement("div");
      d.className = "tool-divider";
      nav.appendChild(d);
      continue;
    }
    const b = document.createElement("button");
    b.className = "tool";
    b.dataset.tool = t.id;
    b.title = `${t.name} (${t.key})`;
    b.setAttribute("aria-label", t.name);
    b.setAttribute("aria-pressed", String(t.id === tool));
    b.innerHTML = t.icon();
    b.addEventListener("click", () => setTool(t.id));
    nav.appendChild(b);
  }
}

function buildSwatches() {
  const wrap = $("swatches");
  for (const c of COLORS) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.background = c;
    b.title = c;
    b.setAttribute("aria-label", `Colour ${c}`);
    b.setAttribute("aria-pressed", String(c === style.color));
    b.addEventListener("click", () => {
      style.color = c;
      persistStyle();
      for (const s of wrap.children) s.setAttribute("aria-pressed", String(s.title === c));
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
    $("size-label").textContent = active.label;
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

  $("undo").addEventListener("click", () => {
    if (undo(doc)) {
      selectionId = null;
      draw();
      syncInspector();
    }
  });
  $("redo").addEventListener("click", () => {
    if (redo(doc)) {
      selectionId = null;
      draw();
      syncInspector();
    }
  });
  $("delete").addEventListener("click", deleteSelection);

  $("crop-apply").addEventListener("click", applyCrop);
  $("crop-reset").addEventListener("click", () => {
    snapshot(doc);
    doc.crop = null;
    pendingCrop = null;
    zoomFit();
    buildRail();
    updateDims();
  });

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
  $("copy").addEventListener("click", async () => {
    try {
      await copyToClipboard(doc, settings);
      toast("Copied to the clipboard");
    } catch (err) {
      toast(`Could not copy: ${err.message}`, true);
    }
  });
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
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
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
  $("save").lastChild.textContent = ` Save ${value === "jpeg" ? "JPG" : value.toUpperCase()}`;
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
    if (!silent) toast(`Saved ${name}.${out.extension} · ${humanSize(out.blob.size)}`);
    return id;
  } catch (err) {
    toast(`Could not save: ${err.message}`, true);
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
      selectionId = s.id;
      setTool("select");
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

function moveShape(s, dx, dy) {
  if (s.type === "pen") {
    for (let i = 0; i < s.points.length; i += 2) {
      s.points[i] += dx;
      s.points[i + 1] += dy;
    }
  } else if (ENDPOINTS.has(s.type)) {
    s.x1 += dx;
    s.y1 += dy;
    s.x2 += dx;
    s.y2 += dy;
  } else {
    s.x += dx;
    s.y += dy;
  }
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

/* ------------------------------------------------------------------ crop */

function applyCrop() {
  if (!pendingCrop) {
    toast("Drag a rectangle on the screenshot first");
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

  const commit = (save) => {
    input.hidden = true;
    input.onblur = null;
    input.onkeydown = null;
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
      setTool("select");
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
    copyToClipboard(doc, settings).then(
      () => toast("Copied to the clipboard"),
      (err) => toast(`Could not copy: ${err.message}`, true)
    );
    return;
  }
  if (mod) return;

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

  const match = TOOLS.find((t) => t !== "divider" && t.key.toLowerCase() === e.key.toLowerCase());
  if (match) setTool(match.id);
}

function deleteSelection() {
  if (!selectionId) return;
  snapshot(doc);
  removeShape(doc, selectionId);
  selectionId = null;
  draw();
  syncInspector();
}

/* ------------------------------------------------------------------ misc */

function updateDims() {
  const rect = viewRect(doc);
  const cropped = doc.crop ? " · cropped" : "";
  $("dims").textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)} px${cropped}`;
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
