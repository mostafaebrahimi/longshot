/** Painting. `drawScene` assumes the context is already in image pixel space,
 *  so the same function serves the on-screen view and the exported bitmap. */

import { boundsOf } from "./doc.js";

const FONT_STACK =
  'ui-sans-serif, "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';

export function drawScene(ctx, doc) {
  if (doc.base) ctx.drawImage(doc.base, 0, 0);
  for (const shape of doc.shapes) drawShape(ctx, doc, shape);
}

export function drawShape(ctx, doc, s) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color || "#ff3b30";
  ctx.fillStyle = s.color || "#ff3b30";
  ctx.lineWidth = s.stroke || 4;

  switch (s.type) {
    case "rect": {
      const b = boundsOf(s);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      break;
    }
    case "ellipse": {
      const b = boundsOf(s);
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "line":
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      break;
    case "arrow":
      drawArrow(ctx, s);
      break;
    case "pen":
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i += 2) {
        if (i === 0) ctx.moveTo(s.points[0], s.points[1]);
        else ctx.lineTo(s.points[i], s.points[i + 1]);
      }
      ctx.stroke();
      break;
    case "highlight": {
      const b = boundsOf(s);
      ctx.globalAlpha = 0.35;
      ctx.globalCompositeOperation = "multiply";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      break;
    }
    case "redact": {
      const b = boundsOf(s);
      ctx.fillStyle = s.color || "#111318";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      break;
    }
    case "blur":
      obscure(ctx, doc, s, "blur");
      break;
    case "pixelate":
      obscure(ctx, doc, s, "pixelate");
      break;
    case "text":
      drawText(ctx, s);
      break;
    case "step":
      drawStep(ctx, s);
      break;
  }
  ctx.restore();
}

function drawArrow(ctx, s) {
  const head = Math.max(9, (s.stroke || 4) * 3.4);
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  const tipX = s.x2;
  const tipY = s.y2;
  const backX = tipX - Math.cos(angle) * head * 0.85;
  const backY = tipY - Math.sin(angle) * head * 0.85;

  ctx.beginPath();
  ctx.moveTo(s.x1, s.y1);
  ctx.lineTo(backX, backY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - Math.cos(angle - 0.42) * head,
    tipY - Math.sin(angle - 0.42) * head
  );
  ctx.lineTo(
    tipX - Math.cos(angle + 0.42) * head,
    tipY - Math.sin(angle + 0.42) * head
  );
  ctx.closePath();
  ctx.fill();
}

function drawText(ctx, s) {
  const size = s.size || 28;
  ctx.font = `600 ${size}px ${FONT_STACK}`;
  ctx.textBaseline = "top";
  const lines = String(s.text || "").split("\n");
  const pad = size * 0.28;
  let width = 0;
  for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
  const lineHeight = size * 1.25;

  s.w = width + pad * 2;
  s.h = lines.length * lineHeight + pad * 2;

  if (s.background) {
    ctx.fillStyle = s.background;
    roundRect(ctx, s.x, s.y, s.w, s.h, size * 0.22);
    ctx.fill();
  }
  ctx.fillStyle = s.color || "#ff3b30";
  lines.forEach((line, i) => ctx.fillText(line, s.x + pad, s.y + pad + i * lineHeight));
}

function drawStep(ctx, s) {
  const r = s.size || 20;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(r * 1.15)}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(s.n), s.x, s.y + r * 0.06);
}

/** Blur and pixelate both re-sample the untouched screenshot underneath. */
function obscure(ctx, doc, s, kind) {
  const b = boundsOf(s);
  if (b.w < 1 || b.h < 1 || !doc.base) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();

  if (kind === "blur") {
    ctx.filter = `blur(${Math.max(2, s.radius || 12)}px)`;
    ctx.drawImage(doc.base, 0, 0);
  } else {
    const cell = Math.max(3, s.cell || 12);
    const cols = Math.max(1, Math.round(b.w / cell));
    const rows = Math.max(1, Math.round(b.h / cell));
    const tmp = document.createElement("canvas");
    tmp.width = cols;
    tmp.height = rows;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(doc.base, b.x, b.y, b.w, b.h, 0, 0, cols, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, cols, rows, b.x, b.y, b.w, b.h);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Selection chrome is drawn in screen space so it stays 1px at any zoom. */
export function drawSelection(ctx, shape, zoom, origin) {
  const b = boundsOf(shape);
  const x = (b.x - origin.x) * zoom;
  const y = (b.y - origin.y) * zoom;
  const w = b.w * zoom;
  const h = b.h * zoom;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.strokeStyle = "#ff8a3d";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
  ctx.setLineDash([]);
  for (const [hx, hy] of handlePositions(x, y, w, h)) {
    ctx.fillStyle = "#ff8a3d";
    ctx.strokeStyle = "#101216";
    ctx.beginPath();
    ctx.rect(hx - 3.5, hy - 3.5, 7, 7);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function handlePositions(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ];
}
