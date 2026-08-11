/** Turning the document into files: PNG, JPG, PDF, or the clipboard. */

import { viewRect } from "./doc.js";
import { drawScene } from "./render.js";
import { buildPdf, PAGE_SIZES } from "../shared/pdf.js";

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
  return canvas;
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

/** JPEG needs an opaque backdrop, otherwise transparent pixels come out black. */
export function flatten(canvas, background = "#ffffff") {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
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
    const blob = await buildPdfFrom(canvas, settings.pdfPageMode, quality, doc.meta.title);
    return { blob, extension: "pdf", width: canvas.width, height: canvas.height };
  }
  return {
    blob: await toBlob(canvas, "image/png"),
    extension: "png",
    width: canvas.width,
    height: canvas.height,
  };
}

async function buildPdfFrom(canvas, pageMode, quality, title) {
  const size = PAGE_SIZES[pageMode] || null;
  const flat = flatten(canvas);

  if (!size) {
    const bytes = new Uint8Array(await (await toBlob(flat, "image/jpeg", quality)).arrayBuffer());
    return buildPdf([{ bytes, w: flat.width, h: flat.height }], { pageSize: null, title });
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
    const ctx = band.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, band.width, band.height);
    ctx.drawImage(flat, 0, y, flat.width, h, 0, 0, flat.width, h);
    const bytes = new Uint8Array(await (await toBlob(band, "image/jpeg", quality)).arrayBuffer());
    pages.push({ bytes, w: band.width, h: band.height });
    if (pages.length >= 200) break;
  }
  return buildPdf(pages, { pageSize: size, margin, title });
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
