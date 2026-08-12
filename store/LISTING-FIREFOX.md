# Firefox Add-ons (AMO) listing

Everything <https://addons.mozilla.org/developers/> asks for, ready to paste.
The product copy is shared with the Chrome listing — see [`LISTING.md`](LISTING.md)
for the long description and the screenshots. Only the fields AMO asks for
differently are spelled out here.

The one thing that cannot be automated is the **first** submission: the release
workflow signs new versions of an add-on that already exists, and AMO has no API
for creating one. Do §§ 1–4 by hand once, and every release after that is a tag.

---

## 0 · Before you open the developer hub

```sh
node tools/build.mjs --target=firefox
npx web-ext lint --source-dir dist/package-firefox
```

That writes `dist/longshot-<version>-firefox.zip` — the file you upload — and
holds it against the same linter AMO runs on submission. It must come back with
**0 errors**; see § *Notes for reviewers* for the warnings that stay.

You also need, one time only:

- A **Firefox Account** to publish under. Unlike Chrome there is no fee.
- The add-on id, which is already baked into the package:
  `longshot@mostafaebrahimi.me`. It is set in `GECKO` in `tools/build.mjs` and
  must never change — AMO keys the add-on on it, and `storage.sync` refuses to
  work without one.

---

## 1 · Create the add-on

1. Go to <https://addons.mozilla.org/developers/addon/submit/distribution>
2. Choose **On this site** — the listed channel, so it appears in the gallery
   and updates itself. (Self-distribution is the other option; the release
   workflow assumes listed.)
3. Upload `dist/longshot-<version>-firefox.zip`
4. AMO validates the package and shows the same warnings `web-ext lint` did.
   Continue.
5. **Do you need to submit source code?** → **No**. The package is the
   repository's own JavaScript, unminified and ungenerated; `tools/build.mjs`
   only rewrites `manifest.json` and zips the tree.

---

## 2 · Listing fields

| Field | Value |
| --- | --- |
| Name | `Longshot — Full Page Screenshot` |
| Add-on URL | `longshot-full-page-screenshot` (AMO suggests it from the name) |
| Summary (max 250 characters) | see below |
| Description | the long block in [`LISTING.md`](LISTING.md) § *Description* |
| Firefox categories (up to 2) | **Photos, Music & Videos** and **Web Development** |
| Firefox for Android categories | leave empty — the package sets an Android floor but the editor is built for a desktop window |
| Support email | the publishing account's address |
| Support website | the repository, or the privacy page below |
| License | **All Rights Reserved** (`all-rights-reserved`) — matches [`../LICENSE`](../LICENSE) |
| Privacy policy | required, see § 3 |

**Summary**

```
Capture an entire web page in one click, then crop, annotate, and save it as PNG, JPG, or PDF. No account, no uploads.
```

That is the same string as `description` in `manifest.json`, which AMO
pre-fills. It is well inside the 250-character limit if you ever want to
lengthen it — Chrome's 132-character cap is the tighter of the two, so keeping
one string for both is what stops them drifting apart.

**Screenshots** — AMO sets no practical limit, so upload all six from
`store/screenshots/` in numbered order. (The Chrome listing takes the first five
only; `06` exists for this listing.)

---

## 3 · Privacy and data collection

AMO asks in two places, and they have to agree:

1. **In the manifest** — `browser_specific_settings.gecko.data_collection_permissions`
   is set to `{ "required": ["none"] }` by `tools/build.mjs`. AMO reads it and
   shows "This add-on does not collect any data" on the listing.
2. **On the submission form** — confirm the same: no data collected, none
   transmitted.

**Privacy policy** — paste:

```
https://longshot-privacy.surge.sh
```

The same page the Chrome listing points at, served from `docs/`. See
[`SUBMISSION.md`](SUBMISSION.md) § 5 for how to redeploy it.

---

## 4 · Notes for reviewers

Paste this into the **Notes for reviewers** box. It answers the two things a
human reviewer of a capture extension asks first.

```
Longshot captures a screenshot of the page the user is on — the full scrollable
page or the visible area — and lets them crop, annotate, and save it as PNG, JPG
or PDF. Everything happens locally.

No host permissions. The capture agent is injected into the active tab only
after the user starts a capture (toolbar button, keyboard shortcut, or context
menu), under activeTab.

No network access of any kind. There are no fetch/XHR calls, no remote scripts,
no CDN resources, no eval, and no analytics. The package is the repository's own
source, unminified: tools/build.mjs only rewrites manifest.json and zips the
tree.

The linter reports five UNSAFE_VAR_ASSIGNMENT warnings for innerHTML. All five
assign string constants that ship inside the package, never page content:
  - src/content/capture.js — the progress card's own markup
  - src/editor/editor.js (x2) — inline SVG icons, and <kbd> labels for the
    shortcut strip
  - src/editor/menu.js — inline SVG icons for the context menu
  - src/shared/i18n.js — interface strings from src/shared/locales/, which are
    files in this repository
Page content only ever reaches a canvas as pixels, and text taken from the page
(the tab title, used to build a suggested file name) is assigned with
textContent or through the value of an <input>.
```

---

## 5 · Submit, then hand it to CI

Submit for review. AMO review is usually faster than Chrome's — often hours,
sometimes a couple of days.

Once the add-on exists, **stop uploading by hand**. Add the two API credentials
to the repository so [`../.github/workflows/release.yml`](../.github/workflows/release.yml)
can sign every later version:

1. Generate them at <https://addons.mozilla.org/developers/addon/api/key/>
2. GitHub → repository → Settings → Secrets and variables → Actions →
   **New repository secret**, twice:

| Secret | Value |
| --- | --- |
| `AMO_JWT_ISSUER` | the JWT issuer, `user:12345678:123` |
| `AMO_JWT_SECRET` | the JWT secret — shown once, at generation |

From then on a release is:

```sh
# bump manifest.json, update CHANGELOG.md, commit
git tag v1.0.1 && git push origin v1.0.1
```

The workflow packs both stores, lints the Firefox package, runs the smoke test,
and only then uploads. `web-ext sign --channel listed` adds the version and
hands it to review; the signed build is attached to the GitHub release too.

Missing secrets skip that store rather than failing the run, so Chrome can go
live before Firefox or the other way round.

---

## Before you hit Submit

- [ ] `node tools/build.mjs --target=firefox` passes
- [ ] `npx web-ext lint --source-dir dist/package-firefox` — **0 errors**
- [ ] Loaded `dist/package-firefox/` via `about:debugging` → **This Firefox** →
      **Load Temporary Add-on** and captured a real page
- [ ] `manifest.json` version bumped, and `CHANGELOG.md` updated
- [ ] Screenshots regenerated if any UI changed
- [ ] Privacy policy URL resolves publicly
- [ ] Licence set to All Rights Reserved, not left on the default

## Shipping an update later

Nothing — tag the release. If the listing copy itself changed, edit it in the
developer hub; the workflow only ships code.
