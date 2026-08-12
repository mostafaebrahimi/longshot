# Privacy policy — Longshot

_Last updated: 12 August 2026_

The published copy of this policy — the URL both store listings point at — is
<https://longshot-privacy.surge.sh>, served from `docs/index.html`. Keep the two
in step; a policy that contradicts a listing's data disclosures is a takedown
risk in either store.

Longshot takes a screenshot of the page you are looking at and lets you edit and
save it. This policy describes what it does with data. The short version: it
collects nothing, sends nothing, and stores nothing beyond your own settings.

## Who and what this covers

This policy covers **Longshot — Full Page Screenshot**, published by Mostafa
Ebrahimi, in both of its distributions: the extension on the **Chrome Web
Store** (Chrome and other Chromium browsers) and the add-on on
**addons.mozilla.org** (Firefox, desktop and Android). Both builds ship the same
code; only the manifest differs.

## Single purpose

Longshot captures a screenshot of the page you are on — the full scrollable page
or the visible area — and lets you crop, annotate, and save it as PNG, JPG, or
PDF. Every step runs on your own device.

## Data Longshot collects

None, in every category the two stores ask about. Longshot does not collect,
transmit, sell, or share any of the following — not to the developer, not to a
third party, not to anyone:

| Category | Collected? | Notes |
| --- | --- | --- |
| Personally identifiable information | No | No name, address, email, age, or ID number is ever asked for |
| Health information | No | — |
| Financial and payment information | No | Longshot is free and takes no payment |
| Authentication information | No | No accounts, passwords, tokens, or cookies are read or stored |
| Personal communications | No | — |
| Location | No | No geolocation, IP lookup, or region detection |
| Web history | No | No record is kept of pages you visit or capture |
| User activity | No | No clicks, keystrokes, telemetry, analytics, or crash reports |
| Website content | No | Page pixels are rendered on your device and never sent anywhere |

The Firefox package declares the same thing in machine-readable form: its
manifest sets `browser_specific_settings.gecko.data_collection_permissions` to
`{ "required": ["none"] }`, which is why Firefox and addons.mozilla.org state
that this add-on does not collect any data. The Chrome Web Store listing's
privacy disclosures say the same.

## What Longshot handles on your device

Data handled locally is still worth naming — Chrome's user data policy asks for
it disclosed either way — so here is everything Longshot touches.

**Page pixels.** When you start a capture, Longshot asks the browser for images
of the visible part of the tab, one screen at a time, and draws them onto a
canvas inside an extension tab in your own browser. That image stays in the
memory of that tab. It is written to disk only when you save it, and only to the
folder your browser downloads to. Closing the tab discards it.

**Your settings.** Output format, quality, PDF page mode, scale, file name
template, capture delay and other capture options, language, and theme are
stored with the browser's `storage.sync` API; the annotation style you last used
is stored with `storage.local`. Those values live in your browser profile. If
you have browser sync switched on, Google or Mozilla syncs them between your own
devices the same way they sync your bookmarks — the developer of Longshot has no
access to them.

**File names.** The default name template includes the page title and date, and
you can add the URL or host. That name is used for the file your browser saves,
so whatever you put in the template ends up in your own downloads folder — and
nowhere else.

**Clipboard.** If you choose Copy, the screenshot is placed on your system
clipboard. Longshot writes to the clipboard; it never reads it.

## Permissions, and why each one is there

| Permission | Why Longshot asks for it |
| --- | --- |
| `activeTab` | Temporary access to the tab you are on, granted only when you start a capture there |
| `scripting` | Injects the capture agent into that tab to measure the page and scroll it while tiles are taken |
| `storage` | Saves your settings and last-used annotation style in your own profile |
| `downloads` | Writes the finished image or PDF to your downloads folder when you save it |
| `contextMenus` | Adds the right-click entries that start a capture |
| `clipboardWrite` | Puts the screenshot on your clipboard when you press Copy |

Longshot requests **no host permissions** and no access to `<all_urls>`, so it
has no standing access to any website and cannot read pages in the background.
Under `activeTab` it can read a page only after you explicitly start a capture
on it — by clicking the toolbar icon, pressing a keyboard shortcut, or choosing
Longshot from the right-click menu — and that access lapses when the capture is
done.

While a capture runs, Longshot temporarily scrolls the page and hides sticky or
floating elements so they do not repeat down the image. Both are undone when the
capture finishes.

## Data sharing, sale, and advertising

There is none. No data is sold, rented, transferred, or disclosed to any third
party — no advertisers, no data brokers, no analytics providers, no AI services,
no credit or lending assessment — because none is collected in the first place.
Nothing is used for personalised advertising, and no human, including the
developer, has any way to review your screenshots or your browsing.

Longshot bundles no third-party SDKs, no remote code, and no hosted fonts or
scripts. It works fully offline.

## Chrome Web Store Limited Use

Longshot's use of information received from Google APIs adheres to the [Chrome
Web Store User Data
Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use),
including the Limited Use requirements. Longshot receives no user data from
Google APIs, and any data it handles is limited to what is strictly necessary
for the single purpose stated above.

## Retention, and how to delete everything

Because nothing is transmitted, there is no server-side data to retain, request,
or erase. On your device:

- Screenshots are held only in the memory of the editor tab. Closing the tab
  discards them. Files you saved are ordinary files in your downloads folder.
- Settings can be wiped at any time with **Reset to defaults** on Longshot's
  options page.
- Removing the extension — `chrome://extensions` or `about:addons` — deletes its
  stored settings along with it.

## Security

The strongest guarantee an extension can offer is not to hold the data at all,
and that is the design here: no endpoint to intercept, no database to breach, no
credentials to leak. What remains on your device is protected by your browser
profile and your operating system's own account protections.

## Your rights

Privacy laws such as the GDPR and the CCPA give you rights to access, correct,
export, or delete personal data a service holds about you, and to know whether
it is sold or shared. Longshot holds no personal data about you, sells nothing,
and shares nothing, so there is nothing to request — and no request could
identify you in the first place. The delete steps above put you in full control
of everything that exists.

## Children

Longshot is a general-purpose utility. It is not directed at children, and it
collects no information from anyone, including children under 13.

## Changes to this policy

If a future version changes what data is handled, the change is disclosed here
in the same release, the date at the top moves with it, and the store listings'
privacy disclosures are updated to match. Should Longshot ever begin collecting
anything at all — it has no plans to — that would be disclosed prominently and
asked for up front, in the extension itself, before any collection began, rather
than being buried in a revision to this page. Version history is in
`CHANGELOG.md`.

## This page

The hosted copy is static: it sets no cookies, runs no scripts, and loads
nothing from anywhere else.

## Contact

Questions, privacy requests, or a security report: <longshot@mostafaebrahimi.me>,
or the Support tab on the Chrome Web Store listing, or the Support section of
the addons.mozilla.org listing.
