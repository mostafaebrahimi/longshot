# Changelog

## Unreleased

- Cross-browser support: `src/shared/compat.js` and `src/shared/env.js` let the
  same code run on Firefox, and `tools/build.mjs --target=firefox` emits an
  AMO-ready package with a Gecko manifest
- Privacy policy published at https://longshot-privacy.surge.sh, served from
  `docs/` (redeploy with `npx surge ./docs`)
- Editor fits captures to the stage width instead of the whole height, so a long
  screenshot opens readable rather than shrunk to a sliver
- Page rail sizes itself to the capture's aspect ratio
- File names collapse runs of dashes, spaces, and underscores

## 1.0.0 — 2026-08-11

First release.

- Full page capture: scrolls the page, captures each screen, stitches one image
- Visible area capture
- Sticky headers set aside after the first screen; floating elements hidden
- Pre-scroll pass so lazy-loaded images are in place before capture
- Inner scroll containers detected on app-style pages
- Editor: crop, arrow, line, rectangle, ellipse, freehand, text, numbered steps,
  highlight, blur, pixelate, black-out, with undo and redo
- Export to PNG, JPG, or PDF (one long page, or sliced to A4/Letter), and copy
  to clipboard
- File name templates, output scaling, auto-download, dark and light themes
- Keyboard shortcuts: Alt+Shift+P for the page, Alt+Shift+V for the viewport
