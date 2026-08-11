#!/usr/bin/env node
/**
 * Validates the extension and packs it into an upload-ready zip.
 *
 *   node tools/build.mjs
 *
 * Fails loudly on the things Chrome Web Store review rejects: missing files,
 * inline scripts, stray dev artefacts, wrong icon sizes.
 */
import { readFile, readdir, stat, rm, mkdir, cp } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const INCLUDE = ["manifest.json", "icons", "src", "LICENSE"];
const ICON_SIZES = [16, 32, 48, 128];

const problems = [];
const fail = (msg) => problems.push(msg);

const manifest = JSON.parse(await readFile(join(ROOT, "manifest.json"), "utf8"));
console.log(`\nLongshot ${manifest.version} — build\n`);

/* ------------------------------------------------------------- validation */

for (const path of await collectReferences(manifest)) {
  if (!(await exists(join(ROOT, path)))) fail(`manifest references a missing file: ${path}`);
}

for (const html of await walk(join(ROOT, "src"), /\.html$/)) {
  const source = await readFile(html, "utf8");
  const rel = relative(ROOT, html);
  if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(source)) {
    fail(`${rel} has an inline <script>, which MV3's CSP blocks`);
  }
  if (/\son\w+\s*=\s*["']/i.test(source)) fail(`${rel} has an inline event handler attribute`);
}

for (const js of await walk(join(ROOT, "src"), /\.js$/)) {
  const source = await readFile(js, "utf8");
  const rel = relative(ROOT, js);
  if (/\beval\s*\(|new Function\s*\(/.test(source)) fail(`${rel} uses eval or new Function`);
  if (/https?:\/\/(?!127\.0\.0\.1)[^\s"')]+\.(js|css)\b/.test(source)) {
    fail(`${rel} looks like it loads remote code`);
  }
  if (/console\.(log|debug)\(/.test(source)) console.log(`  note: ${rel} still logs to the console`);
}

for (const size of ICON_SIZES) {
  const path = join(ROOT, `icons/icon-${size}.png`);
  if (!(await exists(path))) fail(`missing icons/icon-${size}.png — run tools/make_icons.py`);
}

if (manifest.permissions?.includes("<all_urls>") || manifest.host_permissions?.length) {
  fail("host permissions are set; Longshot is meant to run on activeTab alone");
}
if (!manifest.description || manifest.description.length > 132) {
  fail("manifest description must be 1-132 characters (it becomes the store summary)");
}

if (problems.length) {
  console.error("\nBuild blocked:\n" + problems.map((p) => `  ✗ ${p}`).join("\n") + "\n");
  process.exit(1);
}

/* ---------------------------------------------------------------- packing */

await rm(DIST, { recursive: true, force: true });
const stage = join(DIST, "package");
await mkdir(stage, { recursive: true });

for (const entry of INCLUDE) {
  const from = join(ROOT, entry);
  if (!(await exists(from))) continue;
  await cp(from, join(stage, entry), { recursive: true });
}

const zipName = `longshot-${manifest.version}.zip`;
await run("zip", ["-qr", join(DIST, zipName), "."], { cwd: stage });
const { size } = await stat(join(DIST, zipName));

const files = (await walk(stage, /./)).length;
console.log(`  ${files} files packed`);
console.log(`  dist/${zipName} — ${(size / 1024).toFixed(0)} KB\n`);
console.log("Next: upload that zip at https://chrome.google.com/webstore/devconsole");
console.log("      listing copy and permission justifications are in store/LISTING.md\n");

/* ------------------------------------------------------------------ utils */

async function collectReferences(m) {
  const out = new Set();
  const add = (v) => typeof v === "string" && v.endsWith(".json") === false && out.add(v);
  add(m.background?.service_worker);
  add(m.options_page);
  add(m.action?.default_popup);
  for (const icons of [m.icons, m.action?.default_icon]) {
    for (const path of Object.values(icons || {})) add(path);
  }
  for (const cs of m.content_scripts || []) {
    for (const path of [...(cs.js || []), ...(cs.css || [])]) add(path);
  }
  // Injected on demand rather than declared, so check it explicitly.
  out.add("src/content/capture.js");
  return [...out];
}

async function walk(dir, pattern) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path, pattern)));
    else if (pattern.test(entry.name)) found.push(path);
  }
  return found;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
