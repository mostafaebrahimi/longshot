/** Source catalogue. Every other language is a translation of this file, and a
 *  key missing from one falls back to the string here. */
export default {
  "lang.name": "English",

  /* ---------------------------------------------------------------- popup */
  "app.tagline": "full page capture",
  "popup.settings": "Settings",
  "popup.blocked.title": "{browser} blocks extensions here.",
  "popup.blocked.detail": "Open a regular http:// or https:// page and try again.",
  "popup.blocked.geckoFileTitle": "Firefox blocks local files.",
  "popup.blocked.geckoFileDetail":
    "Firefox does not let extensions read pages served from your disk. Open the page over http:// or https:// instead.",
  "popup.blocked.fileTitle": "Local files need one more click.",
  "popup.blocked.fileDetail":
    "Turn on “Allow access to file URLs” on the extension’s details page to capture files from your disk.",
  "popup.full.title": "Capture full page",
  "popup.full.sub": "Scrolls the page and stitches every screen",
  "popup.visible.title": "Capture visible area",
  "popup.visible.sub": "Just what is on screen right now",
  "popup.saveAs": "Save as",
  "popup.openEditor": "Open the editor after capture",
  "popup.autoDownload": "Download without asking",
  "popup.changeShortcuts": "Change shortcuts",
  "popup.allSettings": "All settings",

  /* -------------------------------------------------------------- options */
  "options.title": "Longshot settings",
  "options.subtitle": "full page capture · settings",
  "options.welcome.title": "You're set up.",
  "options.welcome.body":
    "Open any page and press <kbd id=\"welcome-shortcut\">Alt+Shift+P</kbd>, or click the Longshot icon in the toolbar. The page scrolls itself, every screen is stitched into one image, and the editor opens with it ready to crop, annotate, and save.",
  "options.welcome.privacy":
    "Nothing is uploaded. Screenshots are stitched inside your browser and only leave it when you save them.",

  "options.section.capture": "Capture",
  "options.preScroll.label": "Pre-scroll the page first",
  "options.preScroll.hint":
    "Runs one quick pass so lazy-loaded images appear in the shot. Slower, but far fewer blank gaps.",
  "options.hideFixed.label": "Hide sticky headers and floating bars",
  "options.hideFixed.hint":
    "Keeps navigation bars and cookie banners from repeating down the whole screenshot.",
  "options.pageFrame.label": "Keep the page frame",
  "options.pageFrame.hint":
    "On apps that scroll an inner panel, keeps the header and sidebar around the shot instead of capturing the panel alone.",
  "options.freezeMotion.label": "Pause animations",
  "options.freezeMotion.hint":
    "Freezes CSS animations during capture. Leave off if a page reveals content as you scroll.",
  "options.showOverlay.label": "Show progress on the page",
  "options.showOverlay.hint":
    "A small card in the corner with a cancel button. It never appears in the screenshot.",
  "options.settleMs.label": "Wait after each scroll",
  "options.settleMs.hint": "Give slow pages more time to settle before the next screen is taken.",
  "options.settleMs.value": "{n} ms",

  "options.captureScale.label": "Capture resolution",
  "options.captureScale.hint": "2× zooms the page, so text is captured at twice the detail — but a responsive page may lay itself out differently.",
  "options.captureScale.x1": "1× as displayed",
  "options.captureScale.x2": "2× sharper",
  "options.pdfLossless.label": "Lossless PDF images",
  "options.pdfLossless.hint": "Keeps text crisp instead of letting JPEG ring around every letter. Larger file.",

  "options.section.output": "Output",
  "options.format.label": "Save as",
  "options.format.hint": "PDF is written straight from the screenshot — no printing dialog.",
  "options.jpegQuality.label": "JPG quality",
  "options.jpegQuality.hint": "Lower means a smaller file with more compression artefacts.",
  "options.pdfPageMode.label": "PDF pages",
  "options.pdfPageMode.hint":
    "One long page keeps the screenshot intact; paper sizes slice it for printing.",
  "options.pdfPageMode.single": "One long page",
  "options.pdfPageMode.a4": "A4 pages",
  "options.pdfPageMode.letter": "Letter pages",
  "options.scale.label": "Image scale",
  "options.scale.hint": "Shrink the saved file. 100% keeps every captured pixel.",
  "options.filename.label": "File name",
  "options.filename.insert": "Insert {token}",
  "options.openEditor.label": "Open the editor after capture",
  "options.openEditor.hint":
    "Turn this off to save the file straight to your downloads folder and stay on the page.",
  "options.autoDownload.label": "Download without asking",
  "options.autoDownload.hint":
    "Skips the “Save as” dialog and writes straight to your downloads folder.",
  "options.copyOnCapture.label": "Copy to the clipboard too",
  "options.copyOnCapture.hint": "Puts a PNG on the clipboard as soon as the capture finishes.",

  "options.section.interface": "Interface",
  "options.language.label": "Language",
  "options.language.hint": "Applies to the popup, the settings page and the editor.",
  "options.theme.label": "Theme",
  "options.theme.system": "System",
  "options.theme.dark": "Dark",
  "options.theme.light": "Light",
  "options.shortcuts.label": "Keyboard shortcuts",
  "options.shortcuts.none": "No shortcuts assigned yet.",
  "options.shortcuts.change": "Change shortcuts",

  "options.section.privacy": "Privacy",
  "options.privacy.body":
    "Longshot works entirely on your machine. It has no servers, no accounts, and no analytics. Screenshots are stitched in the editor tab and stay there until you save or copy them. Your settings sync through your own {browser} profile.",
  "options.privacy.activeTab":
    "The extension can only read a page after you start a capture on it — by clicking the toolbar icon, using a shortcut, or picking it from the right-click menu.",
  "options.filename.preview": "Saves as {name}",
  "options.saved": "Saved",
  "options.reset": "Reset all settings",
  "options.resetDone": "Settings reset",

  /* --------------------------------------------------------------- editor */
  "editor.filename.tip": "File name",
  "editor.filename.hint":
    "The name this is saved under. Edit it here, or set a template in Settings.",
  "editor.zoomOut": "Zoom out",
  "editor.zoomOut.hint": "How large the shot looks here. It has no effect on the file you save.",
  "editor.zoomIn": "Zoom in",
  "editor.zoomIn.hint": "Get in close to place a mark precisely. Hold Space to pan around.",
  "editor.zoomReset": "Actual size",
  "editor.zoomReset.hint": "Back to 100%, one image pixel per screen pixel.",
  "editor.zoomFit": "Fit to window",
  "editor.zoomFit.hint": "Show the whole shot at once.",
  "editor.zoomFit.label": "Fit",
  "editor.copy": "Copy",
  "editor.copy.hint":
    "Puts the finished image on the clipboard, ready to paste into a chat or a ticket.",
  "editor.save": "Save",
  "editor.save.hint": "Writes the image to your downloads, in the format chosen alongside.",
  "editor.saveFormat": "Save {format}",
  "editor.settings": "Settings",
  "editor.settings.hint": "Capture behaviour, file names, output quality and theme.",
  "editor.format.png.hint":
    "Lossless, sharp text, larger file. The right default for a screenshot.",
  "editor.format.jpeg.hint": "Smaller file, slightly soft text. Good for a photo-heavy page.",
  "editor.format.pdf.hint":
    "One long page, or sliced into A4 or Letter sheets — set which in Settings.",
  "editor.undo": "Undo",
  "editor.undo.hint": "Steps back through every mark, crop and colour change.",
  "editor.redo": "Redo",
  "editor.redo.hint": "Puts back what you just undid.",
  "editor.delete": "Delete",
  "editor.delete.hint": "Removes the selected mark. Select one with V first.",
  "editor.size": "Size",
  "editor.size.hint":
    "Thickness, text size or blur strength, depending on the tool. Changes the selected mark too.",
  "editor.colour": "Colour",
  "editor.colour.hint": "Colour for the next mark — and for the one selected, if there is one.",
  "editor.crop": "Crop",
  "editor.crop.apply": "Apply",
  "editor.crop.apply.tip": "Apply crop",
  "editor.crop.apply.hint":
    "Trims to the rectangle you drew. The pixels are kept — Reset brings them back.",
  "editor.crop.reset": "Reset",
  "editor.crop.reset.tip": "Reset crop",
  "editor.crop.reset.hint": "Back to the full shot, however many times you have cropped it.",
  "editor.crop.needRect": "Drag a rectangle on the screenshot first",

  "editor.menu.image": "Screenshot",
  "editor.menu.copyImage": "Copy image",
  "editor.menu.duplicate": "Duplicate",
  "editor.menu.front": "Bring to front",
  "editor.menu.back": "Send to back",
  "editor.menu.editText": "Edit text",

  "editor.size.width": "Width",
  "editor.size.text": "Text size",
  "editor.size.blur": "Blur",
  "editor.size.cell": "Cell",

  "editor.tools": "Tools",
  "editor.tool.select": "Select and move",
  "editor.tool.select.hint":
    "Pick up a mark you have already made — move it, resize it by its handles, or recolour it.",
  "editor.tool.crop": "Crop",
  "editor.tool.crop.hint":
    "Trim the edges. Drag a rectangle, then Enter. Nothing is thrown away — reset it any time.",
  "editor.tool.arrow": "Arrow",
  "editor.tool.arrow.hint":
    "Point at the thing you are talking about. Hold Shift to keep it straight.",
  "editor.tool.line": "Line",
  "editor.tool.line.hint": "A plain line, for underscoring or connecting. Hold Shift to keep it level.",
  "editor.tool.rect": "Rectangle",
  "editor.tool.rect.hint": "Box off a region. Hold Shift for a perfect square.",
  "editor.tool.ellipse": "Ellipse",
  "editor.tool.ellipse.hint": "Ring something without covering it. Hold Shift for a circle.",
  "editor.tool.pen": "Freehand",
  "editor.tool.pen.hint": "Draw as you would with a pen — ticks, circles, scribbles.",
  "editor.tool.text": "Text",
  "editor.tool.text.hint": "Click where the label goes and type. Set the size in the bar above.",
  "editor.tool.step": "Numbered step",
  "editor.tool.step.hint":
    "Drop 1, 2, 3 badges to walk someone through a sequence. They number themselves.",
  "editor.tool.highlight": "Highlight",
  "editor.tool.highlight.hint":
    "Wash colour over a region like a marker pen. The page still reads through it.",
  "editor.tool.blur": "Blur",
  "editor.tool.blur.hint":
    "Soften a region until it cannot be read. Raise the radius for a heavier smear.",
  "editor.tool.pixelate": "Pixelate",
  "editor.tool.pixelate.hint":
    "Break a region into blocks — the familiar look for a redacted name or avatar.",
  "editor.tool.redact": "Black out",
  "editor.tool.redact.hint":
    "Cover a region solid. Nothing shows through, so reach for this for anything sensitive.",

  "editor.progress.title": "Capturing page",
  "editor.progress.waiting": "waiting for the first tile",
  "editor.progress.tile": "tile {done} / {total}",
  "editor.progress.cancel": "Cancel",
  "editor.progress.stopping": "Stopping…",
  "editor.failure.title": "Capture stopped",
  "editor.failure.close": "Close this tab",
  "editor.dims": "{w} × {h} px",
  "editor.dims.cropped": "{w} × {h} px · cropped",
  "editor.status.ready": "Ready",
  "editor.status.captured": "Captured {w} × {h} px",
  "editor.status.truncated": "Page was taller than one image can hold — captured as much as fits.",
  "editor.status.scaleDeclined": "Captured at 1×: this page needs more width than zooming leaves it.",
  "editor.copied": "Copied to the clipboard",
  "editor.copyFailed": "Could not copy: {error}",
  "editor.saved": "Saved {name} · {size}",
  "editor.saveFailed": "Could not save: {error}",
  "editor.lostCapture": "This tab lost track of its capture. Start a new one from the toolbar.",
  "editor.stoppedEarly": "The capture stopped before it finished.",
  "editor.noPixels": "No pixels came back from this page.",
  "editor.hints": "{v} select {c} crop {a} arrow {t} text {b} blur {space} pan {ctrl}+{s} save",

  /* ------------------------------------------------------ capture and errors */
  "capture.title": "Capturing page",
  "capture.cancel": "Cancel",
  "capture.stopping": "Stopping…",
  "capture.tile": "tile {done} / {total}",
  "menu.full": "Capture full page",
  "menu.visible": "Capture visible area",
  "action.title": "Longshot — capture this page",
  "action.busy": "A capture is already running",
  "error.restricted":
    "{browser} blocks extensions on this page. Try it on a normal http:// or https:// site.",
  "error.noVisibleArea": "This page has no visible area to capture.",
  "error.interrupted": "Capture was interrupted.",
  "error.cancelled": "Capture cancelled.",
  "error.unknownMessage": "Unknown message.",
  "error.couldNotRead": "Could not read this page.",
  "error.notActive": "The page stopped being the active tab, so the capture stopped.",
  "error.refused": "{browser} refused to take a screenshot of this tab.",
  "error.hostPermission":
    "{browser} does not allow extensions to read {host}. Open the page on a regular site and try again.",
  "error.reloaded": "The page reloaded during the capture. Reload it and try again.",
  "error.editorTimeout": "The editor tab did not open in time.",
  "error.tooLarge": "The image is too large to encode.",
};
