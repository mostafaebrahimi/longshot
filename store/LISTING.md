# Chrome Web Store listing

Everything the Developer Dashboard asks for, ready to paste. Fields are in the
order the dashboard presents them.

---

## Store listing tab

**Item name** (max 75 characters)

```
Longshot — Full Page Screenshot
```

**Summary** (max 132 characters — must match `description` in manifest.json)

```
Capture an entire web page in one click, then crop, annotate, and save it as PNG, JPG, or PDF. No account, no uploads.
```

**Description** (max 16,000 characters)

```
Longshot takes a screenshot of the entire page — not just the part you can see.
Press Alt+Shift+P, and it scrolls the page for you, captures every screen, and
stitches them into a single image. The editor opens with the result, ready to
crop, annotate, and save.

It runs entirely inside your browser. There is no account, no server, and no
upload. Your screenshots never leave your machine unless you save or share them
yourself.

WHAT IT DOES

• Full page capture — one click takes the whole scroll height, however long
• Visible area capture — Alt+Shift+V grabs just what is on screen
• Save as PNG, JPG, or PDF — the PDF is written directly, with no print dialog
• Copy straight to the clipboard
• Annotate: arrows, rectangles, ellipses, lines, freehand pen, text, and
  numbered steps for walkthroughs
• Highlight in any colour, and blur, pixelate, or black out anything private
• Crop to the part that matters, with a thirds guide while you frame it
• Undo and redo through the whole editing session

BUILT FOR PAGES THAT FIGHT BACK

• Sticky headers and floating bars are set aside after the first screen, so your
  navigation bar does not repeat down the whole image
• A pre-scroll pass loads lazy images before the capture starts, so you get the
  photos instead of grey boxes
• Works on app-style pages that scroll an inner panel instead of the document
• Adjustable wait between steps for pages that render slowly
• Progress shows on the page with a cancel button — and never appears in the shot

SET IT UP THE WAY YOU WORK

• File name templates: {title}, {host}, {path}, {date}, {time}, {width}, {height}
• Download straight to your downloads folder, or keep the editor open
• Scale the output down, choose JPG quality, or split the PDF into A4 or Letter pages
• Dark and light themes, following your system by default
• Rebind both keyboard shortcuts from chrome://extensions/shortcuts

PERMISSIONS, PLAINLY

Longshot asks for activeTab, which means it can only read a page after you start
a capture on it — by clicking the toolbar icon, pressing a shortcut, or using the
right-click menu. It has no standing access to any site, and it does not ask for
one. Settings sync through your own Chrome profile. There is no analytics code in
the extension.

A note on limits: Chrome cannot take screenshots of its own pages
(chrome://settings, the Web Store, the new tab page). Very tall pages are capped
by the maximum size a browser canvas can hold; Longshot captures as much as fits
and tells you when it had to stop short.

Free, with no accounts, no subscriptions, and no upsell.
```

**Category**: Workflow & Planning
_(Photos is the reasonable alternative; Workflow & Planning is where comparable
capture tools sit.)_

**Language**: English (United States)

---

## Graphic assets

| Asset | Size | File |
| --- | --- | --- |
| Store icon | 128×128 | `icons/icon-128.png` |
| Screenshot 1 | 1280×800 | `store/screenshots/01-editor-fresh.png` |
| Screenshot 2 | 1280×800 | `store/screenshots/02-editor-annotated.png` |
| Screenshot 3 | 1280×800 | `store/screenshots/03-editor-zoomed.png` |
| Screenshot 4 | 1280×800 | `store/screenshots/04-popup.png` |
| Screenshot 5 | 1280×800 | `store/screenshots/05-options.png` |
| Small promo tile | 440×280 | `store/promo/small-tile.png` |
| Marquee promo tile | 1400×560 | `store/promo/marquee.png` |

Regenerate all of them with:

```sh
npx @puppeteer/browsers install chrome@stable --path /tmp/browsers
CHROME_BIN=/tmp/browsers/chrome/linux-<version>/chrome-linux64/chrome node tools/capture-ui.mjs
python3 tools/make_store_assets.py
```

---

## Privacy tab

**Single purpose description**

```
Longshot captures a screenshot of the web page the user is viewing — either the
full scrollable page or the visible area — and lets the user crop, annotate, and
save that screenshot as a PNG, JPG, or PDF file. Everything happens locally in
the browser.
```

**Permission justifications**

| Permission | Justification to paste |
| --- | --- |
| `activeTab` | Longshot needs to read the page the user is capturing. activeTab grants that access only after the user explicitly starts a capture on that tab (toolbar icon, keyboard shortcut, or context menu), which is why the extension requests no standing host permissions. |
| `scripting` | The capture agent is injected into the active tab at capture time. It measures the page, scrolls it one screen at a time, and temporarily sets aside sticky and fixed elements so they do not repeat in the stitched image. It is removed from play as soon as the capture ends. |
| `storage` | Stores the user's own settings — output format, file name template, capture delay, theme — in chrome.storage.sync so they follow the user's Chrome profile. No page content or browsing data is stored. |
| `downloads` | Writes the finished screenshot to the user's downloads folder when they click Save. This is the only way the image leaves the extension. |
| `contextMenus` | Adds "Capture full page" and "Capture visible area" to the right-click menu, an alternative way for the user to start the same capture. |
| `clipboardWrite` | Puts the finished screenshot on the clipboard when the user clicks Copy or presses Ctrl+C in the editor. |
| Remote code | Not used. All JavaScript and CSS ships inside the package. There are no external scripts, no CDN resources, no `eval`, and no remotely hosted configuration. |

**Data usage disclosures** — tick nothing, and confirm all three certifications:

- Personally identifiable information — **no**
- Health information — **no**
- Financial and payment information — **no**
- Authentication information — **no**
- Personal communications — **no**
- Location — **no**
- Web history — **no**
- User activity — **no**
- Website content — **no** _(page pixels are rendered into an image inside the
  user's own browser and are never transmitted or stored by the developer)_

Certifications:

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://longshot-privacy.surge.sh
```

Live now, served from `docs/` via surge.sh. Redeploy after edits with
`npx surge ./docs longshot-privacy.surge.sh` — see [SUBMISSION.md](SUBMISSION.md) § 5.

---

## Distribution tab

- Visibility: Public
- Distribution: All regions
- Pricing: Free
- This item is not designed primarily for children: **correct**

---

## Before you hit Submit

- [ ] `node tools/build.mjs` passes and `dist/longshot-<version>.zip` is the file you upload
- [ ] `manifest.json` version bumped, and `CHANGELOG.md` updated
- [ ] Loaded `dist/package/` via chrome://extensions → Load unpacked and captured a real page
- [ ] `CHROME_BIN=… node tools/smoke-test.mjs` passes
- [ ] Screenshots regenerated if any UI changed
- [ ] Privacy policy URL resolves publicly
- [ ] Developer account has a verified contact email

Review usually takes a few days. The most common reason a capture extension gets
held up is a permission that the justification does not account for — if you add
one, add its row to the table above in the same commit.
