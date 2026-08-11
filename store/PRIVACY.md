# Privacy policy — Longshot

_Last updated: 11 August 2026_

Longshot is a Chrome extension that takes a screenshot of the page you are
looking at and lets you edit and save it. This policy describes what it does
with data. The short version: it collects nothing, sends nothing, and stores
nothing beyond your own settings.

## What Longshot collects

Nothing. There is no account, no telemetry, no analytics library, no crash
reporting, and no server. The extension contains no code that makes a network
request.

## What Longshot handles, and where

**Page pixels.** When you start a capture, Longshot asks Chrome for images of the
visible part of the tab, one screen at a time, and draws them onto a canvas
inside an extension tab in your own browser. That image stays in the memory of
that tab. It is written to disk only when you click Save, and only to the folder
Chrome downloads to. Closing the tab discards it.

**Your settings.** Output format, file name template, capture delay, theme, and
the annotation colour you last used are stored with Chrome's `storage` API. Those
values live in your Chrome profile. If you have Chrome sync switched on, Google
syncs them between your own devices the same way it syncs your bookmarks — the
developer of Longshot has no access to them.

**Clipboard.** If you press Copy, the screenshot is placed on your system
clipboard. Nothing else touches it.

## What Longshot can read

Longshot uses the `activeTab` permission. It can only read a page after you
explicitly start a capture on that page — by clicking the toolbar icon, pressing
a keyboard shortcut, or choosing Longshot from the right-click menu. It has no
standing access to any website, cannot read pages in the background, and does not
request host permissions for any domain.

While a capture runs, Longshot temporarily scrolls the page and hides sticky or
floating elements so they do not repeat down the image. Both are undone when the
capture finishes.

## Data sharing

There is none. No data is sold, transferred, or disclosed to any third party,
because no data is collected in the first place.

## Children

Longshot is a general-purpose utility. It is not directed at children and
collects no information from anyone, including children.

## Changes

If a future version changes what data is handled, this policy is updated in the
same release and the date at the top changes with it. Version history is in
`CHANGELOG.md`.

## Contact

Questions or a security report: open an issue on the project repository.
