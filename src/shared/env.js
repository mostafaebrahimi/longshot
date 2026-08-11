/** Which browser we are running in, and the few things that differ. */
import "./compat.js";

export const IS_GECKO = chrome.runtime.getURL("").startsWith("moz-extension://");

/** Used in messages the user reads, so it has to be the browser's real name. */
export const BROWSER_NAME = IS_GECKO ? "Firefox" : "Chrome";

/** Where the browser keeps its extension shortcut editor. */
export const SHORTCUTS_URL = IS_GECKO ? "about:addons" : "chrome://extensions/shortcuts";

/** Fill every <span data-browser> in a page with the browser's name. */
export function labelBrowser(root = document) {
  for (const el of root.querySelectorAll("[data-browser]")) el.textContent = BROWSER_NAME;
}
