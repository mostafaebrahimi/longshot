/** Turning the document into files: PNG, JPG, PDF, or the clipboard. */

import { viewRect } from "./doc.js";
import { drawScene } from "./render.js";
import { buildPdf, deflate, rgbBytes, PAGE_SIZES } from "../shared/pdf.js";

const MAX_AREA = 268000000; // Chrome's canvas ceiling, with a little headroom

/** Flatten the document (crop applied, annotations baked in) at `scale` %. */
export function renderExport(doc, scalePercent = 100) {
  const rect = viewRect(doc);
  let scale = Math.max(0.05, Math.min(4, (scalePercent || 100) / 100));
  if (rect.w * scale * rect.h * scale > MAX_AREA) {
    scale = Math.sqrt(MAX_AREA / (rect.w * rect.h));
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.w * scale));
  canvas.height = Math.max(1, Math.round(rect.h * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.scale(scale, scale);
  ctx.translate(-rect.x, -rect.y);
  drawScene(ctx, doc);
  return scale < 0.5 ? refine(doc, rect, scale, canvas) : canvas;
}

/**
 * Redraw a heavy downscale by halving instead.
 *
 * One drawImage straight from full size to a quarter or less throws away most
 * of the pixels it passes over, and thin strokes and small text come out
 * speckled. Halving repeatedly averages everything on the way down, which is
 * what a screenshot shrunk for an email wants to look like.
 */
function refine(doc, rect, scale, fallback) {
  let step = document.createElement("canvas");
  step.width = Math.max(1, Math.round(rect.w));
  step.height = Math.max(1, Math.round(rect.h));
  let ctx = step.getContext("2d");
  ctx.translate(-rect.x, -rect.y);
  drawScene(ctx, doc);

  const target = { w: fallback.width, h: fallback.height };
  while (step.width > target.w * 2 && step.height > target.h * 2) {
    const half = document.createElement("canvas");
    half.width = Math.max(target.w, Math.round(step.width / 2));
    half.height = Math.max(target.h, Math.round(step.height / 2));
    const hctx = half.getContext("2d");
    hctx.imageSmoothingQuality = "high";
    hctx.drawImage(step, 0, 0, half.width, half.height);
    step = half;
  }
  ctx = fallback.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.w, target.h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(step, 0, 0, target.w, target.h);
  return fallback;
}

export function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image is too large to encode."))),
      type,
      quality
    );
  });
}

/**
 * JPEG needs an opaque backdrop, otherwise transparent pixels come out black.
 *
 * `readBack` marks a canvas whose pixels are going to be read out again, which
 * has to be decided when the context is made rather than when it is read.
 */
export function flatten(canvas, background = "#ffffff", readBack = false) {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d", { willReadFrequently: readBack });
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export async function buildOutput(doc, settings) {
  const canvas = renderExport(doc, settings.scale);
  const quality = Math.min(1, Math.max(0.3, (settings.jpegQuality || 92) / 100));

  if (settings.format === "jpeg") {
    return {
      blob: await toBlob(flatten(canvas), "image/jpeg", quality),
      extension: "jpg",
      width: canvas.width,
      height: canvas.height,
    };
  }
  if (settings.format === "pdf") {
    // Pixels per CSS pixel in the file being written: what the capture holds,
    // less whatever the output scale threw away.
    const density = (doc.meta.captureScale || 1) * (canvas.width / Math.max(1, viewRect(doc).w));
    const blob = await buildPdfFrom(canvas, settings, quality, doc.meta.title, density);
    return { blob, extension: "pdf", width: canvas.width, height: canvas.height };
  }
  return {
    blob: await toBlob(canvas, "image/png"),
    extension: "png",
    width: canvas.width,
    height: canvas.height,
  };
}

async function buildPdfFrom(canvas, settings, quality, title, density) {
  const size = PAGE_SIZES[settings.pdfPageMode] || null;
  const lossless = !!settings.pdfLossless;
  const flat = flatten(canvas, "#ffffff", lossless);
  const encode = lossless
    ? async (c) => ({ bytes: await deflate(rgbBytes(c)), filter: "flate" })
    : async (c) => ({
        bytes: new Uint8Array(await (await toBlob(c, "image/jpeg", quality)).arrayBuffer()),
        filter: "jpeg",
      });

  if (!size) {
    const page = await encode(flat);
    return buildPdf([{ ...page, w: flat.width, h: flat.height }], { pageSize: null, title, density });
  }

  // Slice the tall screenshot into page-shaped bands so it prints properly.
  const margin = 24;
  const ratio = (size[1] - margin * 2) / (size[0] - margin * 2);
  const bandHeight = Math.max(200, Math.round(flat.width * ratio));
  const pages = [];
  for (let y = 0; y < flat.height; y += bandHeight) {
    const h = Math.min(bandHeight, flat.height - y);
    const band = document.createElement("canvas");
    band.width = flat.width;
    band.height = h;
    const ctx = band.getContext("2d", { willReadFrequently: lossless });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, band.width, band.height);
    ctx.drawImage(flat, 0, y, flat.width, h, 0, 0, flat.width, h);
    pages.push({ ...(await encode(band)), w: band.width, h: band.height });
    if (pages.length >= 200) break;
  }
  return buildPdf(pages, { pageSize: size, margin, title, density });
}

export async function saveBlob(blob, filename, saveAs) {
  const url = URL.createObjectURL(blob);
  try {
    return await chrome.downloads.download({ url, filename, saveAs: !!saveAs });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
}

/** Resolve once Chrome has finished writing the file. The blob URL dies with
 *  this tab, so anything that closes the tab has to wait for this. */
export function waitForDownload(id, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.downloads.onChanged.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (delta) => {
      if (delta.id !== id) return;
      if (delta.state && delta.state.current !== "in_progress") done();
      if (delta.error) done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.downloads.onChanged.addListener(listener);
    chrome.downloads.search({ id }).then((rows) => {
      if (rows[0] && rows[0].state !== "in_progress") done();
    });
  });
}

export async function copyToClipboard(doc, settings) {
  const canvas = renderExport(doc, settings.scale);
  const blob = await toBlob(canvas, "image/png");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
