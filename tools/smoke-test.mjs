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

/** How each page of a PDF is encoded, according to poppler. */
async function listPdfImages(path) {
  try {
    const { stdout } = await promisify(execFile)("pdfimages", ["-list", path]);
    return stdout
      .split("\n")
      .slice(2)
      .filter((line) => line.trim())
      .map((line) => line.trim().split(/\s+/)[8]);
  } catch {
    return [];
  }
}

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
  const appShell = await readFile(join(ROOT, "tools/fixtures/app-shell.html"), "utf8");
  const appFrame = await readFile(join(ROOT, "tools/fixtures/app-frame.html"), "utf8");
  const ruler = await readFile(join(ROOT, "tools/fixtures/ruler-page.html"), "utf8");
  const narrowFloor = await readFile(join(ROOT, "tools/fixtures/narrow-floor.html"), "utf8");
  const pages = {
    "/app-shell": appShell,
    "/app-frame": appFrame,
    "/ruler": ruler,
    "/narrow-floor": narrowFloor,
  };
  server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(pages[req.url] || fixture);
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  console.log("\nLongshot smoke test\n");
  browser = await launchWithExtension(ROOT, { width: VIEWPORT.w, height: VIEWPORT.h, quiet: false });
  const { pipe } = browser;

  const { session: worker, extensionId } = await attachToWorker(pipe);
  check(!!extensionId, "extension loads and its service worker starts", extensionId);

  // The worker rebuilds its context menus whenever the language changes. Doing
  // that twice over used to leave the browser complaining about a duplicate menu
  // id, which is the kind of thing only its own error console ever shows.
  const workerNoise = [];
  pipe.on("Log.entryAdded", ({ entry }, sessionId) => {
    if (sessionId === worker.sessionId && entry.level !== "info") workerNoise.push(entry.text);
  });
  await worker.send("Log.enable");
  for (const lang of ["fa", "de", "en"]) {
    await worker.eval(`chrome.storage.sync.set({language: ${JSON.stringify(lang)}})`);
    await sleep(250);
  }
  await sleep(1000);
  check(
    workerNoise.length === 0,
    "rebuilding the menus for a new language leaves the worker's console clean",
    workerNoise.slice(0, 2).join(" | ") || "console clean"
  );

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

  // Lossless PDF: the pages go in deflated rather than as JPEG, so text keeps
  // its edges. On a screenshot of flat interface colours it is usually smaller
  // as well, which is worth knowing rather than assuming.
  const losslessPdf = await editor.eval(`(async () => {
    const {buildOutput} = await import("./export.js");
    const out = await buildOutput(window.longshot.doc, {format: "pdf", pdfPageMode: "single",
      pdfLossless: true, jpegQuality: 88, scale: 60});
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
    return {size: out.blob.size, base64: btoa(binary)};
  })()`);
  await writeFile("/tmp/longshot-lossless.pdf", Buffer.from(losslessPdf.base64, "base64"));
  const encodings = await listPdfImages("/tmp/longshot-lossless.pdf");
  check(
    encodings.length > 0 && encodings.every((e) => e !== "jpeg"),
    "a lossless PDF embeds its pages without JPEG",
    `${encodings.join(", ") || "no images found"} · ${Math.round(losslessPdf.size / 1024)} KB vs ${Math.round(pdf.size / 1024)} KB as JPEG`
  );

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

  // Visible-area capture: one tile, viewport sized, of wherever the page is
  // parked — not of the top of the document.
  await testPage.eval(`scrollTo(0, 2400)`);
  await sleep(400);
  const parked = await testPage.eval(
    `({y: scrollY, color: getComputedStyle(document.elementFromPoint(30, 300)).backgroundColor})`
  );
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

  const visiblePixel = await visibleEditor.eval(`(() => {
    const base = window.longshot.doc.base;
    const probe = document.createElement("canvas");
    probe.width = 1; probe.height = 1;
    const pctx = probe.getContext("2d", {willReadFrequently: true});
    pctx.drawImage(base, Math.round(base.width * 30 / ${VIEWPORT.w}), Math.round(base.height * 300 / 757), 1, 1, 0, 0, 1, 1);
    const d = pctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  })()`);
  const parkedRgb = (parked.color.match(/\d+/g) || []).slice(0, 3).map(Number);
  check(
    near(visiblePixel, parkedRgb),
    "visible-area capture keeps the scroll position it was fired at",
    `scrollY ${parked.y}: page rgb(${parkedRgb}) vs image rgb(${visiblePixel})`
  );

  // An app shell: the document does not scroll, an inner panel does, and that
  // panel's box runs past the bottom of the window. Framing off, so this checks
  // the panel on its own.
  const seen = new Set([editorTarget.targetId, visibleTarget.targetId]);
  await worker.eval(`chrome.storage.sync.set({pageFrame: false})`);
  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.update(tab.id, {url: ${JSON.stringify(PAGE_URL + "app-shell")}, active: true});
  })()`);
  await sleep(2500);

  const panel = await testPage.eval(`(() => {
    const el = document.getElementById("panel");
    return {
      scrollW: el.scrollWidth, scrollH: el.scrollHeight, clientH: el.clientHeight,
      reach: el.scrollHeight - el.clientHeight, innerH: innerHeight,
      firstRowTop: document.querySelectorAll(".row")[0].offsetTop,
      lastRowTop: document.querySelectorAll(".row")[7].offsetTop,
    };
  })()`);
  check(
    panel.clientH > panel.innerH,
    "the panel under test is taller than the window, so its tail is out of reach",
    JSON.stringify(panel)
  );

  // Park the panel at the bottom: a capture fired from there has to walk back
  // up to the top of the content, not photograph the screen it landed on.
  await testPage.eval(`document.getElementById("panel").scrollTop = 1e7`);
  await sleep(600);
  const parkedPanel = await testPage.eval(`document.getElementById("panel").scrollTop`);
  check(parkedPanel > 100, "the panel is parked at the bottom before capturing", `scrollTop ${parkedPanel}`);

  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.update(tab.id, {active: true});
    await globalThis.longshot.begin(await chrome.tabs.get(tab.id), "full");
  })()`);
  const shellTarget = await pipe.waitForTarget(
    (t) => (t.url || "").includes("/src/editor/editor.html") && !seen.has(t.targetId),
    { label: "the app-shell editor tab" }
  );
  const shellEditor = await pipe.attach(shellTarget.targetId);
  let shellDims = "";
  for (let i = 0; i < 60; i++) {
    const state = await shellEditor.eval(`(() => ({
      done: document.getElementById("progress").hidden,
      failed: !document.getElementById("failure").hidden,
      message: document.getElementById("failure-message").textContent,
      dims: document.getElementById("dims").textContent,
    }))()`);
    if (state.failed) throw new Error(`Editor reported: ${state.message}`);
    if (state.done) {
      shellDims = state.dims;
      break;
    }
    await sleep(500);
  }
  const [sw, sh] = (shellDims.match(/(\d+) × (\d+)/) || []).slice(1).map(Number);
  check(
    Math.abs(sw - panel.scrollW) <= 2 && Math.abs(sh - panel.scrollH) <= 2,
    "the inner panel is captured at its full scroll size",
    `${shellDims}, panel is ${panel.scrollW} × ${panel.scrollH}`
  );

  const shell = await shellEditor.eval(`(() => {
    const base = window.longshot.doc.base;
    const strip = document.createElement("canvas");
    strip.width = 1; strip.height = base.height;
    const sctx = strip.getContext("2d", {willReadFrequently: true});
    // x = 0.2 keeps clear of the white numeral down the middle of each row
    sctx.drawImage(base, Math.round(base.width * 0.2), 0, 1, base.height, 0, 0, 1, base.height);
    const d = sctx.getImageData(0, 0, 1, base.height).data;
    let blank = 0, lastBlank = -1;
    for (let y = 0; y < base.height; y++) {
      const i = y * 4;
      if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) { blank++; lastBlank = y; }
    }
    const probe = document.createElement("canvas");
    probe.width = 1; probe.height = 1;
    const pctx = probe.getContext("2d", {willReadFrequently: true});
    const read = (fy) => {
      pctx.drawImage(base, Math.round(base.width * 0.2), Math.round(base.height * fy), 1, 1, 0, 0, 1, 1);
      const p = pctx.getImageData(0, 0, 1, 1).data;
      return [p[0], p[1], p[2]];
    };
    return {
      blank, lastBlank, height: base.height,
      firstRow: read(${panel.firstRowTop + 110} / base.height),
      lastRow: read((${panel.lastRowTop} + 110) / base.height),
    };
  })()`);
  if (shell.blank !== 0 || process.env.DUMP_SHELL) {
    const dump = await shellEditor.eval(`(async () => {
      const {renderExport, toBlob} = await import("./export.js");
      const blob = await toBlob(renderExport(window.longshot.doc, 100), "image/png");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ""; for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    })()`);
    await writeFile("/tmp/longshot-app-shell.png", Buffer.from(dump, "base64"));
    console.log("       wrote /tmp/longshot-app-shell.png");
  }
  check(shell.blank === 0, "no unpainted band is left in the image", `${shell.blank}px blank`);
  check(
    near(shell.firstRow, [254, 226, 226]),
    "the capture starts at the top of the panel, wherever it was parked",
    `rgb(${shell.firstRow})`
  );
  check(
    near(shell.lastRow, [15, 118, 110]),
    "the panel's last row — past where it can scroll — is in the image",
    `rgb(${shell.lastRow})`
  );
  // Same shape of page, framing on: the header, the sidebar and the status bar
  // belong in the image, and the sidebar has to carry the whole way down it.
  seen.add(shellTarget.targetId);
  await worker.eval(`chrome.storage.sync.set({pageFrame: true})`);
  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.update(tab.id, {url: ${JSON.stringify(PAGE_URL + "app-frame")}, active: true});
  })()`);
  await sleep(2500);

  const shape = await testPage.eval(`(() => {
    const el = document.getElementById("panel");
    const r = el.getBoundingClientRect();
    return {scrollH: el.scrollHeight, top: r.top, bottom: innerHeight - r.bottom,
            panelW: el.clientWidth, viewW: innerWidth, innerH: innerHeight,
            lastRowTop: document.querySelectorAll(".row")[3].offsetTop};
  })()`);
  // Not awaited: the editor tab has to be attached to while the capture is
  // still running, or the console it writes to during stitching is never seen.
  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.update(tab.id, {active: true});
    globalThis.longshot.begin(await chrome.tabs.get(tab.id), "full");
  })()`);
  const frameTarget = await pipe.waitForTarget(
    (t) => (t.url || "").includes("/src/editor/editor.html") && !seen.has(t.targetId),
    { label: "the framed editor tab" }
  );
  const frameEditor = await pipe.attach(frameTarget.targetId);
  // The framed path is the one that reads pixels back off the canvas; anything
  // the browser complains about while it does that shows up here.
  const noise = [];
  pipe.on("Log.entryAdded", ({ entry }, sessionId) => {
    if (sessionId === frameEditor.sessionId && entry.level !== "info") noise.push(entry);
  });
  await frameEditor.send("Log.enable");
  let frameDims = "";
  for (let i = 0; i < 60; i++) {
    const state = await frameEditor.eval(`(() => ({
      done: document.getElementById("progress").hidden,
      failed: !document.getElementById("failure").hidden,
      message: document.getElementById("failure-message").textContent,
      dims: document.getElementById("dims").textContent,
    }))()`);
    if (state.failed) throw new Error(`Editor reported: ${state.message}`);
    if (state.done) {
      frameDims = state.dims;
      break;
    }
    await sleep(500);
  }
  const [fw, fh] = (frameDims.match(/(\d+) × (\d+)/) || []).slice(1).map(Number);
  check(
    Math.abs(fw - shape.viewW) <= 2 &&
      Math.abs(fh - (shape.top + shape.scrollH + shape.bottom)) <= 2,
    "a framed capture is as wide as the window and as tall as the page",
    `${frameDims}, expected ${shape.viewW} × ${shape.top + shape.scrollH + shape.bottom}`
  );

  // What the browser said while the real stitch ran, before the test provokes
  // any readbacks of its own below.
  const stitchNoise = noise.slice();

  // Reading the canvas back a row at a time is what earns the browser's
  // "willReadFrequently" warning on a real GPU. Headless is software-backed and
  // never complains, so count the readbacks instead of waiting for a warning
  // that cannot arrive: run the side-column pass again with getImageData
  // counted. It picks the same row and paints the same pixels.
  const reads = await frameEditor.eval(`(() => {
    let reads = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.getImageData;
    proto.getImageData = function (...args) {
      reads++;
      return original.apply(this, args);
    };
    try {
      window.longshot.extendFrame();
    } finally {
      proto.getImageData = original;
    }
    return reads;
  })()`);
  check(
    reads > 0 && reads <= 2,
    "stitching reads the canvas back once per side column, not once per row",
    `${reads} getImageData call(s)`
  );

  const framed = await frameEditor.eval(`(() => {
    const base = window.longshot.doc.base;
    const probe = document.createElement("canvas");
    probe.width = 1; probe.height = 1;
    const pctx = probe.getContext("2d", {willReadFrequently: true});
    const at = (x, y) => {
      pctx.drawImage(base, Math.round(x), Math.round(y), 1, 1, 0, 0, 1, 1);
      const d = pctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    // Nothing on this fixture is pure white, so any white pixel is bare canvas.
    const sheet = document.createElement("canvas");
    sheet.width = base.width; sheet.height = base.height;
    const sctx = sheet.getContext("2d", {willReadFrequently: true});
    sctx.drawImage(base, 0, 0);
    const all = sctx.getImageData(0, 0, base.width, base.height).data;
    let bare = 0;
    for (let i = 0; i < all.length; i += 4) {
      if (all[i] === 255 && all[i + 1] === 255 && all[i + 2] === 255) bare++;
    }
    const side = base.width - 20;
    return {
      bare,
      topbar: at(base.width * 0.5, 20),
      sidebarTop: at(side, 20),
      sidebarLow: at(side, base.height - 120),
      footer: at(base.width * 0.5, base.height - 20),
      lastRow: at(base.width * 0.5, ${shape.top + shape.lastRowTop} + 115),
    };
  })()`);
  check(near(framed.topbar, [254, 243, 199]), "the app header is at the top of the image", `rgb(${framed.topbar})`);
  check(near(framed.sidebarTop, [224, 231, 255]), "the sidebar is beside the first screen", `rgb(${framed.sidebarTop})`);
  check(
    near(framed.sidebarLow, [224, 231, 255]),
    "the sidebar carries on down past the first screen",
    `rgb(${framed.sidebarLow})`
  );
  check(near(framed.footer, [209, 250, 229]), "the status bar is at the foot of the image", `rgb(${framed.footer})`);
  check(near(framed.lastRow, [15, 118, 110]), "the panel's last row is in the framed image", `rgb(${framed.lastRow})`);
  check(framed.bare === 0, "the framed image has no bare canvas anywhere", `${framed.bare} white px`);
  check(
    stitchNoise.length === 0,
    "the editor stitches a framed capture without complaint from the browser",
    stitchNoise.map((e) => `${e.level}: ${e.text}`).join(" | ") || "console clean"
  );

  /* ----------------------------------------------------------------- stitch */

  /**
   * Read the ruler fixture back out of a capture: where the red rules landed,
   * and whether any row of the image was left unpainted. A gap between tiles is
   * a bright line across an otherwise dark gradient.
   */
  const readRuler = async (session) => await session.eval(`(() => {
    const base = window.longshot.doc.base;
    const c = document.createElement("canvas");
    c.width = 2; c.height = base.height;
    const ctx = c.getContext("2d", {willReadFrequently: true});
    // Two columns: one near the edge for the gradient, one mid-page for the rules.
    ctx.drawImage(base, 10, 0, 1, base.height, 0, 0, 1, base.height);
    ctx.drawImage(base, Math.round(base.width / 2), 0, 1, base.height, 1, 0, 1, base.height);
    const d = ctx.getImageData(0, 0, 2, base.height).data;
    const at = (y, col) => { const i = (y * 2 + col) * 4; return [d[i], d[i+1], d[i+2]]; };

    // A rule is several rows thick, so measure from the top of one to the top of
    // the next rather than across the gap between them.
    let ticks = 0, lastRow = -9, lastTop = -1, gaps = [], seams = 0;
    for (let y = 0; y < base.height; y++) {
      const [r, g, b] = at(y, 1);
      if (r > 180 && g < 90 && b < 90) {
        if (y - lastRow > 1) {
          ticks++;
          if (lastTop >= 0) gaps.push(y - lastTop);
          lastTop = y;
        }
        lastRow = y;
      }
      // An unpainted row is white where its neighbours are not.
      if (y > 3 && y < base.height - 4) {
        const here = at(y, 0)[1], above = at(y - 3, 0)[1], below = at(y + 3, 0)[1];
        if (here >= 250 && above < 240 && below < 240) seams++;
      }
    }
    return {height: base.height, width: base.width, ticks, seams, gaps};
  })()`);

  const captureRuler = async (label) => {
    // Whichever editor tabs exist right now are somebody else's; wait for one
    // that does not.
    const before = new Set(
      (await pipe.targets())
        .filter((t) => (t.url || "").includes("/src/editor/editor.html"))
        .map((t) => t.targetId)
    );
    await worker.eval(`(async () => {
      const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
      await chrome.tabs.update(tab.id, {active: true});
      globalThis.longshot.begin(await chrome.tabs.get(tab.id), "full");
    })()`);
    const target = await pipe.waitForTarget(
      (t) => (t.url || "").includes("/src/editor/editor.html") && !before.has(t.targetId),
      { label }
    );
    const session = await pipe.attach(target.targetId);
    for (let i = 0; i < 90; i++) {
      const state = await session.eval(`(() => ({done: document.getElementById("progress").hidden,
        failed: !document.getElementById("failure").hidden,
        message: document.getElementById("failure-message").textContent}))()`);
      if (state.failed) throw new Error(`Editor reported: ${state.message}`);
      if (state.done) break;
      await sleep(400);
    }
    return session;
  };

  // A display scaled to 125% — the setting most Windows machines ship with —
  // puts a fraction of a device pixel between one tile and the next.
  await worker.eval(`chrome.storage.sync.set({pageFrame: false, captureScale: 1})`);
  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.update(tab.id, {url: ${JSON.stringify(PAGE_URL + "ruler")}, active: true});
  })()`);
  await sleep(2000);
  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.setZoom(tab.id, 1.25);
  })()`);
  await sleep(900);
  const fractional = await readRuler(await captureRuler("the fractional-scale editor tab"));
  check(
    Math.abs(fractional.height - 5000) <= 4,
    "a page captured at 125% display scale is the full height",
    `${fractional.width} × ${fractional.height}, expected ~1000 × 5000`
  );
  check(fractional.ticks === 40, "every rule survives the stitch", `${fractional.ticks}/40`);
  check(
    fractional.gaps.every((g) => Math.abs(g - 125) <= 1),
    "the rules keep their spacing across every seam",
    `gaps ${Math.min(...fractional.gaps)}–${Math.max(...fractional.gaps)}, expected 125`
  );
  check(fractional.seams === 0, "no unpainted line is left where tiles meet", `${fractional.seams} found`);

  // Twice the detail, by zooming the page for the duration of the capture.
  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.setZoom(tab.id, 1);
  })()`);
  await sleep(600);
  await worker.eval(`chrome.storage.sync.set({captureScale: 2})`);
  const doubled = await readRuler(await captureRuler("the 2x editor tab"));
  check(
    Math.abs(doubled.height - 8000) <= 8 && doubled.ticks === 40 && doubled.seams === 0,
    "a 2x capture holds twice the pixels, and still stitches clean",
    `${doubled.width} × ${doubled.height}, ${doubled.ticks}/40 rules, ${doubled.seams} seams`
  );
  const zoomBack = await testPage.eval(`devicePixelRatio`);
  check(zoomBack === 1, "the page is handed back at the zoom it was found at", `devicePixelRatio ${zoomBack}`);

  // An interface with a width floor: zooming pushes the viewport under it, and
  // the panel ends up hanging off the side of the window. 2x has to back out.
  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(PAGE_URL + "*")}});
    await chrome.tabs.update(tab.id, {url: ${JSON.stringify(PAGE_URL + "narrow-floor")}, active: true});
  })()`);
  await sleep(2200);
  const floorEditor = await captureRuler("the width-floor editor tab");
  const floor = await floorEditor.eval(`(() => ({
    w: window.longshot.doc.width,
    h: window.longshot.doc.height,
    scale: window.longshot.doc.meta.captureScale,
    declined: !!window.longshot.doc.meta.scaleDeclined,
  }))()`);
  check(
    floor.scale === 1 && floor.declined,
    "2x backs out of a page that stops fitting its window, and says so",
    `${floor.w} × ${floor.h} at ${floor.scale}×, declined ${floor.declined}`
  );
  await worker.eval(`chrome.storage.sync.set({captureScale: 1})`);

} catch (err) {
  check(false, "smoke test crashed", err.message);
} finally {
  if (browser) await browser.cleanup();
  if (server) server.close();
}

console.log(failures.length ? `\n${failures.length} check(s) failed\n` : "\nAll checks passed\n");
process.exit(failures.length ? 1 : 0);
