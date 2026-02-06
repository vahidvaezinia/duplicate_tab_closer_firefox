# Duplicate Tab Closer (Firefox)

A lightweight Manifest V2 Firefox WebExtension that scans all windows for exact or configurable duplicate tabs, shows a confirmation popup with per-group detail, and closes the extras on demand.

## Features

- **Inline options popup** – toggle matching rules (case, `www`, hash, search, path, title), choose whether to keep the older or newer tab, and limit the sweep to active windows from the toolbar UI.
- **Exact/normalized matching** – background logic normalizes URLs via the selected options before detecting duplicates, ensuring you never accidentally close unique tabs.
- **Detailed confirmation** – popup lists each duplicate group, highlights the preserved tab, reports how many tabs will be closed, and keeps the same custom notification icon for completion feedback.
- **Context menu + toolbar action** – both launch the popup so you can trigger duplicates from anywhere in Firefox.
- **Automatic detection** – the background script watches tab/window activity, applies your matching rules, and notifies you whenever duplicate groups crop up so you can close them with a single click.
- **Settings persistence** – preferences are stored in `browser.storage.local`, so the popup and background scans honor your choices until you change them again.

## Installation (for development/testing)

1. Open `about:debugging` → **This Firefox**.
2. Click **Load Temporary Add-on** and pick `manifest.json` from this repository.
3. Use the toolbar button or context-menu command **Close duplicate tabs**; the popup automatically scans all windows (or just the active one if you choose) and lets you confirm before closing duplicates.
4. The extension also keeps watching tab activity in the background and fires a notification whenever duplicate groups appear so you can open the popup to tidy them up.

## Options

The popup offers:

- **Matching rules**: ignore case, strip `www`, drop hash/query/path parts, or compare by title.
- **Priority**: keep the oldest tab or the newest tab in each duplicate group.
- **Scope**: extend the scan to every window or restrict it to the currently active window(s).

Changes apply immediately; the popup rescans any time an option flips and reports the number of tabs that will be closed.

## Loading after install

If you’ve installed the add-on permanently (e.g., via `about:debugging` or packaging it), you can still access options by clicking the toolbar button, which now hosts all settings inline, or by going to `about:addons` → this extension → **Preferences** if you want the standalone form factor.

## License

MIT.
