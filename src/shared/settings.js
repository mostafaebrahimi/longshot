/** Default settings. Everything lives in chrome.storage.sync so it follows the
 *  profile; nothing ever leaves the browser. */
export const DEFAULTS = {
  // Capture
  captureFormat: "png", // intermediate tile format: png | jpeg
  captureScale: 1, // 1 = as displayed, 2 = zoom the page for twice the detail
  settleMs: 130, // wait after each scroll step
  preScroll: true, // run one fast pass first so lazy images load
  hideFixed: true, // hide sticky/fixed elements after the first tile
  pageFrame: true, // keep the app frame (headers, sidebars) around an inner panel
  freezeMotion: false, // pause CSS animations while capturing
  showOverlay: true, // in-page progress card
  maxPixels: 260000000, // canvas safety ceiling (~260 MP)

  // Output
  format: "png", // png | jpeg | pdf
  jpegQuality: 92,
  pdfPageMode: "single", // single | a4 | letter
  pdfLossless: false, // deflate the pages instead of JPEG — sharper text, bigger file
  scale: 100, // downscale the stitched image, percent
  filename: "{title}-{date}", // template
  autoDownload: false,
  openEditor: true,
  copyOnCapture: false,

  // Interface
  language: "en", // en | fa | ar — see shared/i18n.js
  theme: "system", // system | dark | light
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch) {
  await chrome.storage.sync.set(patch);
}

export function onSettingsChanged(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") fn(changes);
  });
}

/** Apply the theme preference to a document root. */
export function applyTheme(theme) {
  const dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

const PAD = (n) => String(n).padStart(2, "0");

/** Resolve a filename template. Tokens: {title} {url} {host} {path} {date}
 *  {time} {timestamp} {width} {height} {index} */
export function resolveFilename(template, ctx) {
  const d = ctx.when instanceof Date ? ctx.when : new Date();
  const map = {
    title: ctx.title || "screenshot",
    url: (ctx.url || "").replace(/^https?:\/\//, ""),
    host: safeHost(ctx.url),
    path: safePath(ctx.url),
    date: `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`,
    time: `${PAD(d.getHours())}-${PAD(d.getMinutes())}-${PAD(d.getSeconds())}`,
    timestamp: String(Math.floor(d.getTime() / 1000)),
    width: String(ctx.width ?? ""),
    height: String(ctx.height ?? ""),
    index: String(ctx.index ?? ""),
  };
  const out = (template || DEFAULTS.filename).replace(
    /\{(\w+)\}/g,
    (m, key) => (key in map ? map[key] : m)
  );
  return sanitizeFilename(out) || "screenshot";
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function safePath(url) {
  try {
    return new URL(url).pathname.replace(/^\/|\/$/g, "").replace(/\//g, "-");
  } catch {
    return "";
  }
}

/** Strip anything Chrome's downloads API rejects, collapse whitespace, cap length. */
export function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\s\u2010-\u2015_-]+/g, "-") // spaces, dashes, underscores collapse to one
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120)
    .replace(/[-.]+$/, "");
}
