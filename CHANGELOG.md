# Changelog

## Unreleased

- The editor has a right-click menu of its own. The browser's, over a canvas,
  offers to save an image that has not been cropped, annotated or even finished
  stitching yet — so the menu now offers what the editor can actually do. Over
  the shot: copy it, save it in the chosen format, undo, redo, apply or reset the
  crop, fit it to the window or view it at actual size, open the settings. Over a
  mark: the menu names it — Rectangle, Numbered step, Black out — and offers to
  duplicate it, bring it to the front, send it to the back, edit its caption if
  it has one, or delete it, greying out whatever does not apply. Right-clicking a
  mark selects it first, so the colour and size controls follow. Duplicate,
  front and back are on `Ctrl+D`, `]` and `[` as well. Text fields keep the
  browser's own menu: it is the only way to reach the system clipboard from one
- The text tool works from a click again. The caption box takes the keyboard as
  it opens, and the browser hands focus back to the page right afterwards, which
  blurred the box — and blurring it is what commits it. So a click opened the box
  and shut it again in the same frame, and nothing could be typed into it
- A caption committed with `Ctrl+Enter` is placed once, not twice. Hiding the box
  blurs it, and that blur arrived before the handler had been taken away, so the
  commit ran a second time through itself
- The first click on a capture button always takes. The popup used to hang its
  buttons off the end of its startup — reading the settings, then asking which
  page was underneath — so a click that arrived before that finished landed on a
  button nothing was listening to, and the popup simply sat there. The buttons
  are live from the first frame now, and a click that beats the startup waits for
  it instead of being thrown away
- A capture the popup asks for is not lost to a sleeping worker. The popup fired
  its message and closed in the same breath, which can pull the message down
  before a worker woken from cold has started listening; it now stays open until
  the worker has taken it, and tries again if it has not. It also names the tab
  it was opened over, rather than leaving the worker to ask which page is in
  front after the popup that knew has closed
- The context menus are rebuilt one at a time. A worker starting up and a
  language change arriving together both cleared the menus and both added them
  back, and the browser logged a duplicate-id error for every collision; the
  result of `create` is now read rather than left unchecked
- The lossless PDF path reads its canvases back through contexts created for
  reading. `getContext` returns the context a canvas already has and ignores the
  attributes asked for the second time, so the browser was warning about
  `willReadFrequently` again — from the export this time, not the stitch

- No more thread of white across a screenshot. A browser parks its scroll on
  whole device pixels, so on a display scaled to 125% — the setting most Windows
  machines ship with — a tile could start a fraction of a pixel below where the
  last one ended, leaving an unpainted line at every other seam. Tiles now
  overlap slightly, and each one is placed by rounding both its edges rather
  than an origin and a size independently
- Capture resolution setting: 2× zooms the page for the length of the capture,
  so text is recorded with twice the detail. `captureVisibleTab` hands back
  exactly what the screen holds, so this is the only way to get more of it; the
  cost is that a responsive page may lay itself out differently, which is why
  the default stays at 1×
- 2× backs out on its own when the page stops fitting. Zooming halves the width
  a page has to lay out in, and an interface with a floor under that — most
  admin ones have one — ends up with its panel hanging off the side of the
  window, where no scrolling reaches it: bare bands down the image and furniture
  repeated at every seam. The capture now measures that before taking a single
  bitmap, hands the zoom back, and says so in the editor
- Lossless PDF images: pages go in deflated instead of as JPEG, so text keeps
  its edges rather than picking up a halo around every letter. On a screenshot
  of flat interface colours the file usually comes out smaller too
- A PDF of a 2× capture is the same size on paper at twice the resolution,
  rather than a page twice as large
- The editor's own view samples at high quality, so a long screenshot fitted to
  the window no longer looks worse than the file it came from, and an export
  scaled below 50% is halved down in steps instead of in one jump
- Fourteen interface languages, picked in the settings rather than inherited from
  the browser: English (the default), العربية, Deutsch, Español, فارسی, Français,
  עברית, हिन्दी, 日本語, Português, Русский, Türkçe, اردو and 简体中文. Arabic,
  Persian, Hebrew and Urdu lay the whole interface out right to left
- A tool stays selected after you draw with it, so the same kind of mark can be
  made several times over. The new shape is still selected, so the colour and
  size controls act on it; press V to go back to selecting
- The side-column pass reads the stitched canvas once instead of once per row,
  which is what had the browser warning about `willReadFrequently`. Passing that
  attribute was no fix: the context already existed by then, so it was ignored
- Editor tooltips: hovering a tool names it, shows its shortcut, and says in a
  line what it is for, so the right one can be found without trying each in turn.
  Same for the toolbar, the format chips, the colours and the crop controls. They
  appear faster than the browser's own, instantly while moving along a row, and
  get out of the way as soon as you type
- App shells keep their frame: capturing a page that scrolls an inner panel now
  produces the shape of the page — header above, sidebar alongside, status bar at
  the foot — instead of the bare panel. The sidebar is carried down the length of
  the image, and the first screen supplies the furniture exactly once. Turn it
  off with "Keep the page frame" in the options for the old panel-only output
- Scrollbars are hidden for the duration of a capture, so a panel's scrollbar is
  no longer printed down the side of the first screen and nowhere else
- Panels that scroll smoothly are captured in full instead of coming back as the
  single screen they happened to be parked on: `scroll-behavior` is forced to
  `auto` on every element, not just the document, the scroll range is taken from
  the box model rather than from a read-back that lags the animation, and each
  step waits for the scroll to actually land
- App shells capture in full: a scrolling panel taller than the window used to
  lose everything below its last reachable scroll offset and leave a white band
  in its place. The panel is now fitted to the window for the capture, and the
  tile plan only claims canvas for content that can actually be brought on
  screen
- The panel being scrolled is never hidden as floating furniture, so pages that
  position their main region `fixed` no longer come back blank after the first
  screen
- Bars anchored to the bottom of the window (cookie notices, status footers) are
  dropped from the first screen too, instead of being printed across the middle
  of the image
- Right-to-left pages: the scrollbar gutter on the left is no longer captured as
  a strip down the image, and panels that scroll sideways from a negative
  `scrollLeft` are stitched in the right order
- Visible-area capture keeps the scroll position it was fired at instead of
  jumping to the top of the page first
- Cross-browser support: `src/shared/compat.js` and `src/shared/env.js` let the
  same code run on Firefox, and `tools/build.mjs --target=firefox` emits an
  AMO-ready package with a Gecko manifest
- The Firefox package passes AMO's own linter with no errors and no manifest
  warnings. Its floor moves from 128 ESR to 140, which is where Firefox started
  reading the `data_collection_permissions` the package declares — asking for
  the key against an earlier floor is what the linter objected to — and Android
  gets a floor of its own at 142, where it landed there
- A store listing runbook for Firefox: `store/LISTING-FIREFOX.md` carries the
  fields AMO asks for differently, the notes a reviewer of a capture extension
  wants, and the two API secrets that turn every release after the first one
  into a tag
- A sixth store screenshot, of the editor's right-click menu over a mark.
  `tools/capture-ui.mjs` shoots it from the running extension like the rest.
  Chrome takes five, so it gets the first five; AMO takes all six
- Privacy policy published at https://longshot-privacy.surge.sh, served from
  `docs/` (redeploy with `npx surge ./docs`)
- The privacy policy now answers both stores against their current rules, rather
  than reading as a Chrome-only note. It covers the Firefox add-on by name and
  the `data_collection_permissions: { required: ["none"] }` declaration AMO has
  required of new add-ons since November 2025; it answers Chrome's nine data
  categories one by one in a table, since the Web Store's August 2026 policy
  update wants every kind of collection disclosed prominently — local handling
  included, which is why the settings, the file name template, and the clipboard
  are named individually; it carries the Limited Use statement Google asks
  developers to publish, a permission-by-permission justification, retention and
  deletion steps, a GDPR/CCPA answer, a contact address, and an undertaking to
  disclose any future change in data handling up front rather than by quietly
  editing the page. `store/PRIVACY.md` tracks it, and both listing runbooks say
  what the two stores now check
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
