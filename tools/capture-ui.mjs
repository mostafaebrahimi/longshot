#!/usr/bin/env node
/**
 * Shoots the product screenshots used for the Chrome Web Store listing and the
 * README: the editor mid-capture and annotated, the popup, and the options page.
 * Everything is rendered by the real extension — no mockups.
 *
 *   CHROME_BIN=... node tools/capture-ui.mjs
 *
 * Output: store/screenshots/raw/*.png (1280x800), composed into listing images
 * by tools/make_store_assets.py.
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchWithExtension, attachToWorker, openInStartupTab, sleep } from "./lib/cdp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "store/screenshots/raw");
const PORT = 8732;
const DEMO_URL = `http://127.0.0.1:${PORT}/`;
const SHOT = { width: 1280, height: 800 };

const shots = [];
let server;
let browser;

try {
  await mkdir(OUT, { recursive: true });
  const demo = await readFile(join(ROOT, "tools/fixtures/demo-page.html"), "utf8");
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(demo);
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  browser = await launchWithExtension(ROOT, SHOT);
  const { pipe } = browser;
  const { session: worker, extensionId } = await attachToWorker(pipe);

  await openInStartupTab(worker, DEMO_URL);
  await sleep(2500);

  await worker.eval(`(async () => {
    const [tab] = await chrome.tabs.query({url: ${JSON.stringify(DEMO_URL + "*")}});
    await chrome.tabs.update(tab.id, {active: true});
    await globalThis.longshot.begin(await chrome.tabs.get(tab.id), "full");
  })()`);

  const editorTarget = await pipe.waitForTarget((t) => (t.url || "").includes("/src/editor/editor.html"), {
    label: "the editor tab",
  });
  const editor = await pipe.attach(editorTarget.targetId);
  await frame(editor);
  await waitUntil(editor, `document.getElementById("progress").hidden`);
  await sleep(600);

  await shoot(editor, "editor-fresh", "the editor holding a fresh full-page capture");

  // Annotate: a numbered step, an arrow, a highlight and a blur, then redraw.
  await editor.eval(`(() => {
    const doc = window.longshot.doc;
    const W = doc.width, H = doc.height;
    doc.shapes.push(
      {id: 901, type: "step", x: W * 0.09, y: H * 0.031, n: 1, size: 26, color: "#ff3b30"},
      {id: 902, type: "arrow", x1: W * 0.30, y1: H * 0.055, x2: W * 0.53, y2: H * 0.030,
       color: "#ff3b30", stroke: 6},
      {id: 903, type: "text", x: W * 0.30, y: H * 0.058, text: "reorder point is wrong here",
       size: 30, color: "#ff3b30"},
      {id: 904, type: "highlight", x: W * 0.06, y: H * 0.472, w: W * 0.88, h: H * 0.012,
       color: "#ffcc00"},
      {id: 905, type: "blur", x: W * 0.06, y: H * 0.63, w: W * 0.42, h: H * 0.022, radius: 16}
    );
    window.dispatchEvent(new Event("resize"));
  })()`);
  await sleep(400);
  await shoot(editor, "editor-annotated", "annotation tools on top of the capture");

  // Zoomed in, so the toolbar and rail read clearly.
  await editor.eval(`(() => {
    document.getElementById("zoom-in").click();
    document.getElementById("zoom-in").click();
    document.querySelector('[data-tool="blur"]').click();
  })()`);
  await sleep(400);
  await shoot(editor, "editor-zoomed", "zoomed in, with the page rail on the right");

  // Popup and options, rendered as real extension pages.
  const blank = await pipe.waitForTarget((t) => (t.url || "").includes(DEMO_URL), { label: "the demo tab" });
  const tab = await pipe.attach(blank.targetId);
  await frame(tab, { width: 340, height: 600 });
  await tab.send("Page.navigate", { url: `chrome-extension://${extensionId}/src/popup/popup.html` });
  await sleep(1200);
  // The popup is being rendered as a tab, so it sees its own chrome-extension
  // URL as the active tab and warns that Chrome blocks extensions here. Put it
  // back into the state it has over a normal page: enabled, with the shortcut
  // this extension ships as its default.
  const popupHeight = await tab.eval(`(() => {
    document.getElementById("blocked").hidden = true;
    document.getElementById("capture-full").disabled = false;
    document.getElementById("capture-visible").disabled = false;
    const kbd = document.getElementById("kbd-full");
    kbd.hidden = false;
    kbd.textContent = "Alt Shift P";
    return Math.ceil(document.body.getBoundingClientRect().height);
  })()`);
  await shoot(tab, "popup", "the toolbar popup", { width: 340, height: popupHeight });

  await frame(tab, SHOT);
  await tab.send("Page.navigate", { url: `chrome-extension://${extensionId}/src/options/options.html` });
  await sleep(1200);
  await shoot(tab, "options", "the settings page");

  console.log(`\n${shots.length} screenshots written to store/screenshots/raw\n`);
} catch (err) {
  console.error(`\ncapture-ui failed: ${err.message}\n`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.cleanup();
  if (server) server.close();
}

/** Force a layout size: headless tabs opened after startup have none. */
async function frame(session, size = SHOT) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: size.width,
    height: size.height,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await session.eval(`window.dispatchEvent(new Event("resize"))`);
}

async function waitUntil(session, expression, timeoutMs = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await session.eval(expression)) return;
    await sleep(400);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function shoot(session, name, caption, size = SHOT) {
  const { data } = await session.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 2 },
  });
  const file = join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  shots.push(name);
  console.log(`  ${name}.png — ${caption}`);
}
