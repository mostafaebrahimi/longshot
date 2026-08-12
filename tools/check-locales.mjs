#!/usr/bin/env node
/**
 * Catalogue check.
 *
 * English is the source: every other language must carry the same keys, with
 * the same {placeholders}, and nothing extra. It also reads the HTML and JS for
 * the keys they actually ask for, so a renamed string cannot quietly fall back
 * to English forever.
 *
 *   node tools/check-locales.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(ROOT, "src/shared/locales");

const problems = [];
const note = (message) => problems.push(message);
const placeholders = (text) =>
  [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const files = (await readdir(LOCALES)).filter((f) => f.endsWith(".js")).sort();
const catalogues = {};
for (const file of files) {
  const code = file.replace(/\.js$/, "");
  catalogues[code] = (await import(join(LOCALES, file))).default;
}

const en = catalogues.en;
const enKeys = Object.keys(en);
console.log(`\n${files.length} languages, ${enKeys.length} keys each\n`);

for (const [code, catalogue] of Object.entries(catalogues)) {
  if (code === "en") continue;
  const keys = Object.keys(catalogue);
  const missing = enKeys.filter((k) => !(k in catalogue));
  const extra = keys.filter((k) => !(k in en));
  const drifted = enKeys
    .filter((k) => k in catalogue && placeholders(en[k]) !== placeholders(catalogue[k]))
    .map((k) => `${k} (${placeholders(en[k]) || "none"} vs ${placeholders(catalogue[k]) || "none"})`);
  const empty = keys.filter((k) => !String(catalogue[k]).trim());

  const faults = [
    missing.length && `missing ${missing.length}: ${missing.slice(0, 5).join(", ")}`,
    extra.length && `unknown ${extra.length}: ${extra.slice(0, 5).join(", ")}`,
    drifted.length && `placeholder mismatch: ${drifted.slice(0, 3).join("; ")}`,
    empty.length && `empty: ${empty.slice(0, 5).join(", ")}`,
  ].filter(Boolean);

  if (faults.length) {
    note(`${code}: ${faults.join(" | ")}`);
    console.log(` FAIL  ${code} — ${faults.join(" | ")}`);
  } else {
    console.log(`  ok   ${code} — ${keys.length} keys, ${catalogue["lang.name"]}`);
  }
}

// Keys the interface asks for, from the markup and the scripts.
const sources = [
  "src/popup/popup.html", "src/popup/popup.js",
  "src/options/options.html", "src/options/options.js",
  "src/editor/editor.html", "src/editor/editor.js",
  "src/background/service-worker.js",
];
const used = new Set();
for (const rel of sources) {
  const text = await readFile(join(ROOT, rel), "utf8");
  for (const m of text.matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]);
  for (const m of text.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) used.add(m[1]);
  for (const m of text.matchAll(/data-(?:tip|hint)-key="([\w.]+)"/g)) used.add(m[1]);
  for (const m of text.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(";")) {
      const key = pair.split(":")[1];
      if (key) used.add(key.trim());
    }
  }
}
// Built at runtime from a tool id, so they are not literals anywhere.
for (const id of ["select", "crop", "arrow", "line", "rect", "ellipse", "pen", "text", "step", "highlight", "blur", "pixelate", "redact"]) {
  used.add(`editor.tool.${id}`);
  used.add(`editor.tool.${id}.hint`);
}

const unknown = [...used].filter((k) => !(k in en)).sort();
const unused = enKeys.filter((k) => !used.has(k) && !k.startsWith("capture.") && !k.startsWith("error.") && k !== "lang.name" && !k.startsWith("editor.size.") && !k.startsWith("options.pdfPageMode.") && !k.startsWith("menu.") && !k.startsWith("action."));

if (unknown.length) {
  note(`interface asks for keys no catalogue has: ${unknown.join(", ")}`);
  console.log(` FAIL  the interface asks for ${unknown.length} key(s) English does not define — ${unknown.join(", ")}`);
} else {
  console.log(`  ok   every key the interface asks for exists — ${used.size} in use`);
}
if (unused.length) {
  console.log(`  note  ${unused.length} key(s) not referenced directly: ${unused.slice(0, 8).join(", ")}`);
}

console.log(problems.length ? `\n${problems.length} problem(s)\n` : "\nCatalogues agree\n");
process.exit(problems.length ? 1 : 0);
