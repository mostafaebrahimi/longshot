# Submitting Longshot to the Chrome Web Store

A screen-by-screen runbook. Exact values to paste are in
[`LISTING.md`](LISTING.md) — this is the order to paste them in.

Budget about 30 minutes for the first submission, then a few days of review.

For Firefox, the equivalent runbook is [`LISTING-FIREFOX.md`](LISTING-FIREFOX.md).
The two stores are independent: either can go live first.

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
- A **public privacy policy URL**. Already live at
  <https://longshot-privacy.surge.sh>; see step 5 for how to update it.

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

- **Screenshots** — `01` to `05` from `store/screenshots/`, in numbered order.
  The first one is the thumbnail in search results, so keep `01` first. (`06` is
  for the AMO listing; five is the most Chrome takes.)
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

## 5 · Privacy policy — already hosted

The policy is live at:

**<https://longshot-privacy.surge.sh>**

Paste that into the **Privacy policy URL** field on the Privacy tab.

It is served by [surge.sh](https://surge.sh) from the `docs/` folder of this
repository — `docs/index.html` plus `docs/icon-128.png`, no build step and no
dependencies. `docs/CNAME` records the domain, but the CLI still wants it
spelled out on every deploy.

### Updating it later

Edit `docs/index.html`, then from the repository root:

```sh
npx surge ./docs longshot-privacy.surge.sh
```

Same URL, new content, live in a few seconds. Keep `store/PRIVACY.md` (the
markdown copy) in step with the HTML, and move the "Last updated" date whenever
the substance changes — Google re-checks the URL after publication, and a policy
that contradicts the listing's data disclosures is a takedown risk.

The surge account is under the email used at deploy time; the login is never
shown publicly, and the URL contains no personal identifier. To move the page
elsewhere later, host the same two files anywhere static and change the URL in
the dashboard — nothing else references it.

## 6 · Submit

**Submit for review**, top right. Then:

- Review usually takes **a few days**; extensions that touch page content
  sometimes take longer on the first submission.
- You get an email either way. A rejection names the policy section it failed —
  fix it, upload a new zip with a bumped version, and resubmit.
- Once published, the listing takes another hour or so to appear in search.

---

## Shipping an update later

Once the item exists and the four `CWS_*` secrets are set, CI does this — see
[`../.github/workflows/release.yml`](../.github/workflows/release.yml):

1. Bump `version` in `manifest.json` (the store rejects a re-upload of the same
   version number)
2. Add the entry to `CHANGELOG.md`
3. Regenerate screenshots if the UI changed:
   `node tools/capture-ui.mjs && python3 tools/make_store_assets.py`
4. Commit, then `git tag v<version> && git push origin v<version>`

The workflow packs both stores, lints the Firefox package, runs the smoke test,
and uploads only if all of that passed. To do it by hand instead:
`node tools/build.mjs`, then dashboard → your item → **Package → Upload new
package** → Submit.

Adding a permission re-triggers a full review and requires a new justification
row in `LISTING.md`. Removing one does not.
