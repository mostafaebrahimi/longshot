# Submitting Longshot to the Chrome Web Store

A screen-by-screen runbook. Exact values to paste are in
[`LISTING.md`](LISTING.md) — this is the order to paste them in.

Budget about 30 minutes for the first submission, then a few days of review.

---

## 0 · Before you open the dashboard

```sh
node tools/build.mjs
```

That validates the extension and writes `dist/longshot-1.0.0.zip` — the file you
upload. It refuses to build if anything store review would bounce is present.

You also need, one time only:

- A **Google account** you are happy to have as the publisher. The account name
  or a developer display name is shown publicly on the listing.
- The **$5 one-time registration fee**, paid at first sign-in to the dashboard.
- A **verified contact email** on the developer account. Google will not publish
  without it: Account → Contact email → verify.
- A **public privacy policy URL**. `docs/index.html` in this repo is ready to
  host; see step 5.

---

## 1 · Create the item

1. Go to <https://chrome.google.com/webstore/devconsole>
2. Sign in, pay the registration fee if prompted
3. **Items → + New item**
4. Drag in `dist/longshot-1.0.0.zip`

The dashboard reads the manifest and creates a draft. The extension ID is
assigned now and never changes — later versions must keep the same publisher
account and be uploaded to this same item.

---

## 2 · Store listing tab

Paste from `LISTING.md` § *Store listing tab*:

| Field | Source |
| --- | --- |
| Item name | `Longshot — Full Page Screenshot` |
| Summary | pre-filled from `manifest.json` — leave it |
| Description | the long block in LISTING.md |
| Category | **Workflow & Planning** |
| Language | English (United States) |

Then upload graphics:

- **Screenshots** — all five from `store/screenshots/`, in numbered order. The
  first one is the thumbnail in search results, so keep `01` first.
- **Small promo tile** — `store/promo/small-tile.png` (required)
- **Marquee promo tile** — `store/promo/marquee.png` (optional; needed if you
  ever want to be featured)

The 128×128 store icon comes from the package automatically.

---

## 3 · Privacy tab

This is the tab that decides how fast review goes. Three sections:

1. **Single purpose** — paste the paragraph from LISTING.md.
2. **Permission justifications** — one box per permission the manifest requests.
   LISTING.md has a table with the exact text for `activeTab`, `scripting`,
   `storage`, `downloads`, `contextMenus`, and `clipboardWrite`. Fill in every
   box; a blank one is the single most common cause of a rejection.
3. **Data usage** — tick **nothing**, then tick all three certifications at the
   bottom. Longshot collects no user data, and the reviewer can verify that:
   the package makes no network requests at all.

Paste the privacy policy URL from step 5 into **Privacy policy URL**.

---

## 4 · Distribution tab

- Visibility: **Public** (or **Unlisted** if you want to hand out the link and
  let it settle before it is searchable — you can flip this later)
- Distribution: **All regions**
- Pricing: **Free**
- "Is this designed primarily for children?" → **No**

---

## 5 · Host the privacy policy

The store requires a public URL. `docs/index.html` is a self-contained page
ready for any static host. Two easy routes:

**GitHub Pages** — create a repository, push, then Settings → Pages → Source:
*Deploy from a branch* → `main` / `/docs`. Your URL becomes
`https://<user>.github.io/<repo>/`.

```sh
git remote add origin git@github.com:<user>/<repo>.git
git push -u origin main
```

**Any static host** — drop the two files in `docs/` onto Netlify, Cloudflare
Pages, or your own server. The page has no dependencies.

Check the URL loads in a private window before pasting it. A policy behind a
login is treated as no policy.

---

## 6 · Submit

**Submit for review**, top right. Then:

- Review usually takes **a few days**; extensions that touch page content
  sometimes take longer on the first submission.
- You get an email either way. A rejection names the policy section it failed —
  fix it, upload a new zip with a bumped version, and resubmit.
- Once published, the listing takes another hour or so to appear in search.

---

## Shipping an update later

1. Bump `version` in `manifest.json` (the store rejects a re-upload of the same
   version number)
2. Add the entry to `CHANGELOG.md`
3. `node tools/build.mjs`
4. Regenerate screenshots if the UI changed:
   `node tools/capture-ui.mjs && python3 tools/make_store_assets.py`
5. Dashboard → your item → **Package → Upload new package** → Submit

Adding a permission re-triggers a full review and requires a new justification
row in `LISTING.md`. Removing one does not.
