/**
 * A very small PDF writer: enough to wrap JPEG pages, nothing more.
 *
 * Every screenshot page is embedded as a DCTDecode image XObject, so the file
 * is the JPEG plus a few hundred bytes of structure. No dependencies, no remote
 * code — which also keeps the extension review-clean.
 */

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const enc = new TextEncoder();

/**
 * @param {{bytes: Uint8Array, w: number, h: number}[]} images
 * @param {{pageSize?: [number, number]|null, margin?: number, title?: string}} opts
 * @returns {Blob}
 */
export function buildPdf(images, opts = {}) {
  const { pageSize = null, margin = 24, title = "Screenshot" } = opts;
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
    const box = layout(img, pageSize, margin);

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
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
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

function layout(img, pageSize, margin) {
  if (!pageSize) {
    const pageW = img.w * PX_TO_PT;
    const pageH = img.h * PX_TO_PT;
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
