/** The editor document: the stitched bitmap plus everything drawn on top of it.
 *  Shapes are plain data in image pixels, so history is a JSON snapshot. */

let nextId = 1;

export function createDoc() {
  return {
    base: null, // canvas holding the stitched screenshot
    width: 0,
    height: 0,
    crop: null, // {x,y,w,h} or null
    shapes: [],
    meta: { title: "", url: "", dpr: 1, mode: "full", truncated: false },
    _undo: [],
    _redo: [],
  };
}

export function addShape(doc, shape) {
  shape.id = nextId++;
  doc.shapes.push(shape);
  return shape;
}

export function removeShape(doc, id) {
  const i = doc.shapes.findIndex((s) => s.id === id);
  if (i >= 0) doc.shapes.splice(i, 1);
}

export function findShape(doc, id) {
  return doc.shapes.find((s) => s.id === id) || null;
}

/** Region currently in play: the crop if one is set, otherwise the whole page. */
export function viewRect(doc) {
  return doc.crop ? { ...doc.crop } : { x: 0, y: 0, w: doc.width, h: doc.height };
}

export function nextStepNumber(doc) {
  return doc.shapes.filter((s) => s.type === "step").length + 1;
}

/* ------------------------------------------------------------------ history */

export function snapshot(doc) {
  doc._undo.push(serialize(doc));
  if (doc._undo.length > 60) doc._undo.shift();
  doc._redo.length = 0;
}

/** Throw away the most recent snapshot — used when an interaction turns out
 *  not to have changed anything (a click that drew a zero-size shape). */
export function dropSnapshot(doc) {
  doc._undo.pop();
}

export function undo(doc) {
  if (!doc._undo.length) return false;
  doc._redo.push(serialize(doc));
  restore(doc, doc._undo.pop());
  return true;
}

export function redo(doc) {
  if (!doc._redo.length) return false;
  doc._undo.push(serialize(doc));
  restore(doc, doc._redo.pop());
  return true;
}

export function canUndo(doc) {
  return doc._undo.length > 0;
}
export function canRedo(doc) {
  return doc._redo.length > 0;
}

function serialize(doc) {
  return JSON.stringify({ shapes: doc.shapes, crop: doc.crop });
}

function restore(doc, json) {
  const data = JSON.parse(json);
  doc.shapes = data.shapes;
  doc.crop = data.crop;
}

/* ------------------------------------------------------------- hit testing */

export function boundsOf(shape) {
  switch (shape.type) {
    case "arrow":
    case "line":
      return norm({
        x: Math.min(shape.x1, shape.x2),
        y: Math.min(shape.y1, shape.y2),
        w: Math.abs(shape.x2 - shape.x1),
        h: Math.abs(shape.y2 - shape.y1),
      });
    case "pen": {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      return norm({
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      });
    }
    case "text":
      return { x: shape.x, y: shape.y, w: shape.w || 10, h: shape.h || shape.size };
    case "step":
      return {
        x: shape.x - shape.size,
        y: shape.y - shape.size,
        w: shape.size * 2,
        h: shape.size * 2,
      };
    default:
      return norm(shape);
  }
}

function norm(b) {
  return {
    x: b.w < 0 ? b.x + b.w : b.x,
    y: b.h < 0 ? b.y + b.h : b.y,
    w: Math.abs(b.w),
    h: Math.abs(b.h),
  };
}

export function hitTest(doc, x, y, tolerance) {
  for (let i = doc.shapes.length - 1; i >= 0; i--) {
    const s = doc.shapes[i];
    const b = boundsOf(s);
    const t = Math.max(tolerance, (s.stroke || 0) / 2);
    if (x >= b.x - t && x <= b.x + b.w + t && y >= b.y - t && y <= b.y + b.h + t) return s;
  }
  return null;
}

export const RESIZABLE = new Set(["rect", "ellipse", "highlight", "blur", "pixelate", "redact"]);
export const ENDPOINTS = new Set(["arrow", "line"]);
