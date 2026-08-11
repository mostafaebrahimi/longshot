#!/usr/bin/env node
/**
 * End-to-end smoke test.
 *
 * Loads the extension into a headless Chrome, captures a 5,460px test page, and
 * checks the stitched result: right size, bands in the right order, sticky
 * header kept once, floating badge dropped after the first screen.
 *
 *   npx @puppeteer/browsers install chrome@stable --path /tmp/browsers
 *   CHROME_BIN=/tmp/browsers/chrome/linux-VERSION/chrome-linux64/chrome \
 *     node tools/smoke-test.mjs
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launchWithExtension, attachToWorker, openInStartupTab, sleep } from "./lib/cdp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8731;
const PAGE_URL = `http://127.0.0.1:${PORT}/`;
const VIEWPORT = { w: 1280, h: 900 };

const BANDS = [
  ["1", [225, 29, 72]],
  ["2", [245, 158, 11]],
  ["3", [22, 163, 74]],
  ["4", [14, 165, 233]],
  ["5", [124, 58, 237]],
  ["6", [17, 24, 39]],
];
const STICKY = [255, 0, 255];
const BADGE = [0, 255, 255];

const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};
const near = (a, b, tol = 12) =>
  a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol);

let server;
let browser;

/** Read the generated PDF with poppler, so the check does not just trust us. */
async function parsePdf(path) {
  try {
    const { stdout } = await promisify(execFile)("pdfinfo", [path]);
    const pages = /Pages:\s+(\d+)/.exec(stdout);
    const size = /Page size:\s+(.+)/.exec(stdout);
    return {
      ok: Number(pages?.[1]) > 0,
      detail: `${pages?.[1]} page(s), ${size?.[1]?.trim() ?? "unknown size"}`,
    };
  } catch (err) {
    return { ok: false, detail: `pdfinfo said: ${String(err.message).split("\n")[0]}` };
  }
}

try {
  const fixture = await readFile(join(ROOT, "tools/fixtures/long-page.html"), "utf8");
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fixture);
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  console.log("\nLongshot smoke test\n");
  browser = await launchWithExtension(ROOT, { width: VIEWPORT.w, height: VIEWPORT.h, quiet: false });
  const { pipe } = browser;

  const { session: worker, extensionId } = await attachToWorker(pipe);
  check(!!extensionId, "extension loads and its service worker starts", extensionId);

  await openInStartupTab(worker, PAGE_URL);
  await sleep(2500);

  const pageTarget = await pipe.waitForTarget((t) => (t.url || "").includes(`:${PORT}/`), {
    label: "the test page",
  });
  const testPage = await pipe.attach(pageTarget.targetId);
  const metrics = await testPage.eval(
    `({ih: innerHeight, sh: document.documentElement.scrollHeight})`
  );
  check(
    metrics.ih > 200 && metrics.sh > 5000,
    "the page under test reports a real viewport",
    JSON.stringify(metrics)
  );

  const capture = await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.update(tab.id, {active: true});
    await globalThis.longshot.begin(await chrome.tabs.get(tab.id), "full");
    return {url: tab.url};
  })()`);
  check(!!capture, "a full-page capture runs to completion", capture?.url);

  const editorTarget = await pipe.waitForTarget((t) => (t.url || "").includes("/src/editor/editor.html"), {
    label: "the editor tab",
  });
  const editor = await pipe.attach(editorTarget.targetId);

  let dims = "";
  for (let i = 0; i < 60; i++) {
    const state = await editor.eval(`(() => ({
      done: document.getElementById("progress").hidden,
      failed: !document.getElementById("failure").hidden,
      message: document.getElementById("failure-message").textContent,
      dims: document.getElementById("dims").textContent,
    }))()`);
    if (state.failed) throw new Error(`Editor reported: ${state.message}`);
    if (state.done) {
      dims = state.dims;
      break;
    }
    await sleep(500);
  }
  check(!!dims, "the editor finishes stitching", dims);

  const [width, height] = (dims.match(/(\d+) × (\d+)/) || []).slice(1).map(Number);
  check(width >= VIEWPORT.w - 40 && width <= VIEWPORT.w, "captured width matches the viewport", `${width}px`);
  check(Math.abs(height - 5460) <= 12, "captured height covers the whole document", `${height}px, expected ~5460`);

  const samples = await editor.eval(`(() => {
    const base = window.longshot.doc.base;
    const probe = document.createElement("canvas");
    probe.width = 1; probe.height = 1;
    const pctx = probe.getContext("2d", {willReadFrequently: true});
    const read = (fx, fy) => {
      pctx.clearRect(0, 0, 1, 1);
      pctx.drawImage(base, Math.round(base.width * fx), Math.round(base.height * fy), 1, 1, 0, 0, 1, 1);
      const d = pctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    return {
      // x = 0.2 keeps clear of the big numeral in the middle of each band
      bands: [0.09, 0.25, 0.41, 0.58, 0.74, 0.91].map(fy => read(0.2, fy)),
      header: read(0.55, 0.005),
      midPage: read(0.2, 0.5),
      badgeLater: [0.648, 0.813].map(fy => read(0.92, fy)),
    };
  })()`);

  BANDS.forEach(([name, color], i) => {
    check(near(samples.bands[i], color), `band ${name} lands at the right height`, `rgb(${samples.bands[i]})`);
  });
  check(near(samples.header, STICKY, 30), "the sticky header is kept at the top of the image", `rgb(${samples.header})`);
  check(!near(samples.midPage, STICKY, 40), "the sticky header does not repeat down the page", `rgb(${samples.midPage})`);
  check(
    samples.badgeLater.every((c) => !near(c, BADGE, 40)),
    "the floating badge is hidden after the first screen",
    samples.badgeLater.map((c) => `rgb(${c})`).join(" ")
  );

  const exported = await editor.eval(`(async () => {
    const {renderExport, toBlob} = await import("./export.js");
    const blob = await toBlob(renderExport(window.longshot.doc, 100), "image/png");
    return {size: blob.size, type: blob.type};
  })()`);
  check(exported.size > 20000, "the document exports to a PNG", `${exported.size} bytes`);

  const pdf = await editor.eval(`(async () => {
    const {buildOutput} = await import("./export.js");
    const out = await buildOutput(window.longshot.doc, {format: "pdf", pdfPageMode: "a4", jpegQuality: 88, scale: 60});
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return {size: out.blob.size, base64: btoa(binary)};
  })()`);
  check(pdf.size > 10000, "the PDF export has real content", `${pdf.size} bytes`);
  await writeFile("/tmp/longshot-smoke.pdf", Buffer.from(pdf.base64, "base64"));
  const info = await parsePdf("/tmp/longshot-smoke.pdf");
  check(info.ok, "the PDF parses in an outside reader", info.detail);

  // Cropping is non-destructive: the export follows the crop rectangle.
  const cropped = await editor.eval(`(async () => {
    const {renderExport} = await import("./export.js");
    const doc = window.longshot.doc;
    doc.crop = {x: 100, y: 400, w: 640, h: 900};
    const canvas = renderExport(doc, 100);
    doc.crop = null;
    return {w: canvas.width, h: canvas.height};
  })()`);
  check(
    cropped.w === 640 && cropped.h === 900,
    "a crop rectangle is what gets exported",
    `${cropped.w} × ${cropped.h}`
  );

  // Visible-area capture: one tile, viewport sized.
  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.update(tab.id, {active: true});
    await globalThis.longshot.begin(await chrome.tabs.get(tab.id), "visible");
  })()`);
  const visibleTarget = await pipe.waitForTarget(
    (t) => (t.url || "").includes("/src/editor/editor.html") && t.targetId !== editorTarget.targetId,
    { label: "the visible-area editor tab" }
  );
  const visibleEditor = await pipe.attach(visibleTarget.targetId);
  let visibleDims = "";
  for (let i = 0; i < 30; i++) {
    const state = await visibleEditor.eval(`(() => ({
      done: document.getElementById("progress").hidden,
      dims: document.getElementById("dims").textContent,
    }))()`);
    if (state.done) {
      visibleDims = state.dims;
      break;
    }
    await sleep(300);
  }
  const [vw, vh] = (visibleDims.match(/(\d+) × (\d+)/) || []).slice(1).map(Number);
  check(
    vw >= VIEWPORT.w - 40 && Math.abs(vh - 757) <= 12,
    "visible-area capture returns one viewport",
    visibleDims
  );
} catch (err) {
  check(false, "smoke test crashed", err.message);
} finally {
  if (browser) await browser.cleanup();
  if (server) server.close();
}

console.log(failures.length ? `\n${failures.length} check(s) failed\n` : "\nAll checks passed\n");
process.exit(failures.length ? 1 : 0);
