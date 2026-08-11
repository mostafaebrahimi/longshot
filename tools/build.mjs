#!/usr/bin/env node
/**
 * Validates the extension and packs it into upload-ready zips.
 *
 *   node tools/build.mjs                    # Chrome Web Store
 *   node tools/build.mjs --target=firefox   # addons.mozilla.org
 *   node tools/build.mjs --target=all       # both
 *
 * Fails loudly on the things store review rejects: missing files, inline
 * scripts, stray dev artefacts, wrong icon sizes.
 *
 * The two builds ship identical code. Only the manifest differs, and only
 * where it has to: Firefox has no extension service workers (it runs the same
 * module as an event page), it needs an add-on id of its own, and it ignores
 * the Chrome-only keys. Everything else is handled at runtime by
 * src/shared/compat.js.
 */
import { readFile, writeFile, readdir, stat, rm, mkdir, cp } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const INCLUDE = ["manifest.json", "icons", "src", "LICENSE"];
const ICON_SIZES = [16, 32, 48, 128];

const GECKO = {
  id: "longshot@mostafaebrahimi.me",
  // 128 ESR: MV3 event pages, scripting, and clipboard image writes all landed
  // well before it, and it is what AMO reviewers test against.
  strict_min_version: "128.0",
  // AMO makes every add-on declare this. Longshot collects nothing.
  data_collection_permissions: { required: ["none"] },
};

const TARGETS = {
  chrome: {
    label: "Chrome Web Store",
    suffix: "",
    manifest: (m) => m,
    next: [
      "Next: upload that zip at https://chrome.google.com/webstore/devconsole",
      "      listing copy and permission justifications are in store/LISTING.md",
    ],
  },
  firefox: {
    label: "Firefox Add-ons",
    suffix: "-firefox",
    manifest: geckoManifest,
    next: [
      "Next: upload that zip at https://addons.mozilla.org/developers/addon/submit/distribution",
      "      lint it first with: npx web-ext lint --source-dir dist/package-firefox",
    ],
  },
};

const requested = (process.argv.find((a) => a.startsWith("--target=")) || "").split("=")[1] || "chrome";
const targets = requested === "all" ? Object.keys(TARGETS) : [requested];
for (const name of targets) {
  if (!TARGETS[name]) {
    console.error(`unknown target "${name}" — use chrome, firefox, or all`);
    process.exit(1);
  }
}

const base = JSON.parse(await readFile(join(ROOT, "manifest.json"), "utf8"));
console.log(`\nLongshot ${base.version} — build\n`);

await rm(DIST, { recursive: true, force: true });
for (const name of targets) await build(name);

/* ---------------------------------------------------------------- targets */

async function build(name) {
  const target = TARGETS[name];
  const manifest = target.manifest(structuredClone(base));
  console.log(`${target.label}`);

  await validate(manifest);

  const stage = join(DIST, `package${target.suffix}`);
  await mkdir(stage, { recursive: true });
  for (const entry of INCLUDE) {
    const from = join(ROOT, entry);
    if (!(await exists(from))) continue;
    await cp(from, join(stage, entry), { recursive: true });
  }
  await writeFile(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const zipName = `longshot-${manifest.version}${target.suffix}.zip`;
  await run("zip", ["-qr", join(DIST, zipName), "."], { cwd: stage });
  const { size } = await stat(join(DIST, zipName));

  const files = (await walk(stage, /./)).length;
  console.log(`  ${files} files packed`);
  console.log(`  dist/${zipName} — ${(size / 1024).toFixed(0)} KB\n`);
  console.log(target.next.join("\n") + "\n");
}

/**
 * Firefox has no extension service workers, so the same ES module runs as a
 * non-persistent event page. `options_page` becomes `options_ui`, the
 * Chrome-only keys go, and the add-on gets a stable id — storage.sync refuses
 * to work without one.
 */
function geckoManifest(m) {
  const out = { ...m };
  delete out.minimum_chrome_version;
  delete out.offline_enabled;
  delete out.options_page;
  out.background = { scripts: [m.background.service_worker], type: "module" };
  out.options_ui = { page: m.options_page, open_in_tab: true };
  out.browser_specific_settings = { gecko: { ...GECKO } };
  return out;
}

/* ------------------------------------------------------------- validation */

async function validate(manifest) {
  const problems = [];
  const fail = (msg) => problems.push(msg);

  for (const path of collectReferences(manifest)) {
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
}

/* ------------------------------------------------------------------ utils */

function collectReferences(m) {
  const out = new Set();
  const add = (v) => typeof v === "string" && v.endsWith(".json") === false && out.add(v);
  add(m.background?.service_worker);
  for (const path of m.background?.scripts || []) add(path);
  add(m.options_page);
  add(m.options_ui?.page);
  add(m.action?.default_popup);
  for (const icons of [m.icons, m.action?.default_icon]) {
    for (const path of Object.values(icons || {})) add(path);
  }
  for (const cs of m.content_scripts || []) {
    for (const path of [...(cs.js || []), ...(cs.css || [])]) add(path);
  }
  // Injected on demand rather than declared, so check them explicitly.
  out.add("src/shared/compat.js");
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
