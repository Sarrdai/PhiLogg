# PhiLogg desktop wrapper — Tauri (experimental)

A **second** desktop wrapper around the unmodified `philogg.html`, running in
parallel with the Electron one in `desktop/`. Same feature surface, same
visuals; the difference is what's underneath — the OS's own webview
(WebView2 / WKWebView / WebKitGTK) and a Rust backend, instead of a bundled
Chromium and a Node main process.

It exists to be **tested against** the Electron build on real machines, not
to replace it yet. Both install side by side: different bundle identifier
(`com.kleinphilipp.philogg-tauri`), different product name (`PhiLogg
Tauri`), different config directory. The Electron wrapper stays the
supported one until this one has been used enough to say otherwise.

`philogg.html` itself is never modified — same rule as `desktop/`. See
`docs/desktop-tauri.md` for how that's done.

## Prerequisites

- **Rust** (stable) — https://rustup.rs
- **Node 20+** (only for the Tauri CLI)
- Windows: nothing else (WebView2 ships with Windows 11 / current Windows 10)
- macOS: Xcode command line tools
- Linux:
  ```
  sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev \
    libayatana-appindicator3-dev librsvg2-dev patchelf
  ```

## Run / build

```
cd desktop-tauri
npm install
npm run dev     # runs against ../philogg.html directly — edit and restart
npm run build   # installer in src-tauri/target/release/bundle/
```

`npm run dev` reads `../philogg.html` off disk; a built app carries a copy
packaged as a bundle resource. Opening a file directly:

```
npm run dev -- -- path/to/file.log
```

Releases are built by `.github/workflows/tauri-release.yml`
(`workflow_dispatch`, per-OS checkboxes, tag `tauri-<short-sha>`, artifacts
named `PhiLogg-tauri-<sha>.<ext>`). It is a separate workflow from
`desktop-release.yml`, which keeps building the Electron installers exactly
as before.

## Version stamp

Same scheme as the other two workflows: the release job rewrites
`PHILOGG_VERSION` in the checked-out `philogg.html` to the commit short-SHA
before bundling (never committed back), and the installer filename carries
the same SHA. A local `npm run build` leaves it at `dev`.

## What it does

Everything `desktop/` does — `.log` file associations and CLI-argument
opening, a frameless window with rounded corners, window controls in the
app's own theme, F11 fullscreen, a splash screen, a tray icon with
Open / Open Config Folder / Clear Cache / Quit, "close to system tray",
`settings.json` mirroring of the `philogg-*` settings, "Open File Location",
and the system font list for the UI font picker.

## Persistent data

`settings.json` lives in `PhiLogg-Tauri/` in the OS config directory
(`~/.config/PhiLogg-Tauri`, `~/Library/Application Support/PhiLogg-Tauri`,
`%APPDATA%\PhiLogg-Tauri`) — a deliberate sibling of the Electron wrapper's
own `PhiLogg/`, so running both to compare them can't have one clobber the
other's settings. The tray's "Open Config Folder" opens it.

The session cache (IndexedDB) lives in the webview's own storage for this
app, wherever the platform puts it; the tray's "Clear Cache" wipes it and
reloads.

## Differences from the Electron wrapper

These are the known, deliberate gaps — everything else is meant to behave
identically, and anything that doesn't is a bug worth reporting.

- **Dropping a folder doesn't start a folder watch here** — use
  "Open… → Folder…" instead, and you'll get a toast saying so. This is the
  price of "Open File Location"/"Copy Path" working for dropped files at
  all: no system webview can resolve a `File` back to its OS path
  (Electron's `webUtils.getPathForFile` has no equivalent), so this wrapper
  uses Tauri's *native* drag-drop handler, which is the only one carrying
  real paths — and that handler replaces the HTML drop events. A watched
  folder needs a live directory handle to list and rescan, which a path
  alone can't produce. Files (picked, dropped, or opened by double-click)
  all reveal correctly.
- **"Open File Location"/"Copy Path" are still not offered for files inside
  a *watched folder*.** Those arrive as `File` objects from the webview's
  own directory handle, never through the wrapper, so their path stays
  unknown. `philogg.html` treats "no path known" as "don't offer the menu
  item", so nothing breaks. See `FEATURE_BACKLOG.md` #61.
- **Folder watch needs a Chromium-based webview**, i.e. Windows (WebView2).
  It relies on the File System Access API's `showDirectoryPicker`, which
  WebKitGTK (Linux) and WKWebView (macOS) don't implement — the menu item
  reports this rather than failing silently.
- **The system font list on macOS is approximate.** Linux uses `fc-list` and
  Windows uses PowerShell's font enumeration, both exact; macOS has neither
  out of the box, so family names are derived from the font files' own
  names in the three standard font directories.
- **The maximize/restore button doesn't swap its glyph** the way a native
  window control does — it's one button that toggles, with one icon.
- **Rounded corners are the platform's own behaviour for an undecorated
  window** (macOS always, Windows 11 via DWM, Linux compositor-dependent),
  the same situation `desktop/` documents for Electron's `roundedCorners`.

## Status

Verified end to end on Linux (WebKitGTK, headless X server, 2026-09-01):
the page loads through the custom scheme, a file passed on the command line
is fetched and tail-polled, `settings.json` is written, and a second launch
with another `.log` is routed into the running window instead of starting a
new instance.

Known **headless-only** artifact, unrelated to any real run: under a bare
Xvfb the splash never dismisses and the main window never appears, even
though the page itself runs (it writes `settings.json`). The main window is
created `visible(false)` and shown only once the page reports a first paint
via `app_ready` — which is fired from a `requestAnimationFrame` callback,
and WebKitGTK doesn't tick those for a window that was never mapped. So the
two wait on each other. Reproduced identically on the pre-2026-09-01 build,
i.e. it predates the file-location work and is not a regression; it does
not occur on a real desktop session, where the splash is a visible window.
Anything needing the actual UI has to be checked on a real machine.

Real Windows run (2026-09-01, person-tested) surfaced and fixed two bugs:
the window couldn't be moved at all (clicking empty toolbar space did
nothing) — `core:window:allow-start-dragging` wasn't granted, and unlike
`internal_toggle_maximize` it is not part of Tauri's default window
permission set, so the drag-region attribute `inject.js` marks the toolbar
with had nothing behind it; and closing the last open file (the
`quitOnLastFileClose` setting) left an empty, permanently-open dark window
instead of hiding to tray — `window.close()` is a plain webview API with no
Tauri involvement, so it tore down the page without ever telling the Rust
side a close was requested. `inject.js` now overrides `window.close` to
route through the same Rust-side close path the title-bar close button
uses. See `docs/desktop-tauri.md` for both.

**Not yet run on Windows or macOS.** The window chrome specifically (the
injected title-bar buttons, the drag region, rounded corners, the macOS
traffic-light inset) is the part most likely to need adjustment there —
that is what this wrapper is for. The macOS-only code paths aren't even
compile-checked from this environment.

The app icons in `src-tauri/icons/` are placeholders (a teal dot), generated
by `icons/generate.js` — the Tauri bundler requires an icon set, unlike
electron-builder. Replace that script's `draw()` and re-run it once real
artwork exists.
