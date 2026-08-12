/**
 * A very small PDF writer: enough to wrap screenshot pages, nothing more.
 *
 * Each page is one image XObject, so the file is the image plus a few hundred
 * bytes of structure. No dependencies, no remote code — which also keeps the
 * extension review-clean.
 *
 * Images arrive either as JPEG (`DCTDecode`, small) or as raw RGB bytes to be
 * deflated (`FlateDecode`, lossless). Screenshots are mostly text, and JPEG
 * rings around every letter of it, so the lossless path is worth the bytes when
 * the PDF is going to be read rather than merely attached.
 */

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const enc = new TextEncoder();

/**
 * Deflate raw RGB for a lossless page. `CompressionStream("deflate")` emits the
 * zlib wrapper that PDF's FlateDecode expects, so the bytes go straight in.
 */
export async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Canvas pixels as packed RGB, which is what a FlateDecode image holds.
 *
 * The canvas has to have been created for reading — `getContext` returns the
 * context a canvas already has and quietly ignores the attributes asked for the
 * second time, so passing `willReadFrequently` here would do nothing but earn a
 * warning from the browser.
 */
export function rgbBytes(canvas) {
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const out = new Uint8Array(width * height * 3);
  for (let i = 0, o = 0; i < data.length; i += 4) {
    out[o++] = data[i];
    out[o++] = data[i + 1];
    out[o++] = data[i + 2];
  }
  return out;
}

/**
 * @param {{bytes: Uint8Array, w: number, h: number}[]} images
 * @param {{pageSize?: [number, number]|null, margin?: number, title?: string}} opts
 * @returns {Blob}
 */
export function buildPdf(images, opts = {}) {
  const { pageSize = null, margin = 24, title = "Screenshot", density = 1 } = opts;
  const chunks = [];
  let length = 0;
  const offsets = [0];

  const push = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObject = (n) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  const pageCount = images.length;
  const objectCount = 3 + pageCount * 3;
  const pageIds = images.map((_, i) => 4 + i * 3);

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(2);
  push(
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>\nendobj\n`
  );

  startObject(3);
  push(
    `<< /Producer (Longshot) /Creator (Longshot) /Title (${escapeText(title)}) ` +
      `/CreationDate (${pdfDate(new Date())}) >>\nendobj\n`
  );

  images.forEach((img, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const box = layout(img, pageSize, margin, density);

    startObject(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(box.pageW)} ${fmt(box.pageH)}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );

    const content = `q\n${fmt(box.drawW)} 0 0 ${fmt(box.drawH)} ${fmt(box.x)} ${fmt(
      box.y
    )} cm\n/Im0 Do\nQ\n`;
    startObject(contentId);
    push(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

    startObject(imageId);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
        `/Filter ${img.filter === "flate" ? "/FlateDecode" : "/DCTDecode"} ` +
        `/Length ${img.bytes.length} >>\nstream\n`
    );
    push(img.bytes);
    push("\nendstream\nendobj\n");
  });

  const xrefOffset = length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= objectCount; n++) {
    xref += `${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return new Blob(chunks, { type: "application/pdf" });
}

/** Points at 96 CSS px per inch, the scale a browser screenshot is authored in. */
const PX_TO_PT = 72 / 96;

/**
 * `density` is how many image pixels there are per CSS pixel. A capture taken
 * at 2×, or on a HiDPI screen, holds twice the detail of the same page — that
 * should print at twice the resolution, not at twice the size.
 */
function layout(img, pageSize, margin, density = 1) {
  if (!pageSize) {
    const pageW = (img.w / density) * PX_TO_PT;
    const pageH = (img.h / density) * PX_TO_PT;
    return { pageW, pageH, x: 0, y: 0, drawW: pageW, drawH: pageH };
  }
  const [pageW, pageH] = pageSize;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const scale = Math.min(availW / img.w, availH / img.h);
  const drawW = img.w * scale;
  const drawH = img.h * scale;
  return {
    pageW,
    pageH,
    drawW,
    drawH,
    x: (pageW - drawW) / 2,
    y: pageH - margin - drawH, // top-aligned reads better for stacked page slices
  };
}

function fmt(n) {
  return (Math.round(n * 1000) / 1000).toString();
}

function escapeText(s) {
  return String(s).replace(/[\\()]/g, "\\$&").slice(0, 180);
}

function pdfDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
