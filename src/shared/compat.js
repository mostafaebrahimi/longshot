/**
 * Firefox compatibility shim.
 *
 * Gecko exposes the WebExtension APIs twice: `browser.*` returns promises,
 * `chrome.*` only takes callbacks. Longshot awaits every API call, so on
 * Firefox we point the `chrome` global at `browser` and nothing else in the
 * codebase has to know which browser it is running in. A no-op on Chromium.
 *
 * This runs first in every context: it is the first import of each entry
 * module, and it is injected ahead of the capture agent. Keep it free of
 * import/export so it also loads as a plain injected script.
 */
(() => {
  const api = globalThis.browser;
  if (!api || !api.runtime || globalThis.chrome === api) return;
  try {
    globalThis.chrome = api;
    if (globalThis.chrome === api) return;
  } catch {}
  try {
    Object.defineProperty(globalThis, "chrome", { value: api, writable: true, configurable: true });
  } catch {}
})();
