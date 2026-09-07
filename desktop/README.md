# PhiLogg desktop wrapper

The optional desktop wrapper around the unmodified `philogg.html`: the OS's
own webview (WebView2 / WKWebView / WebKitGTK) and a Rust backend, built
with Tauri v2.

`philogg.html` itself is never modified — it is served through a custom
`philogg://` scheme and handed local files through its own `?url=`
deep-link mechanism. See `docs/desktop.md` for how that's done.

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
cd desktop
npm install
npm run dev     # runs against ../philogg.html directly — edit and restart
npm run build   # installer in src-tauri/target/release/bundle/
```

`npm run dev` reads `../philogg.html` off disk; a built app carries a copy
packaged as a bundle resource. Opening a file directly:

```
npm run dev -- -- path/to/file.log
```

Releases are built by `.github/workflows/desktop-release.yml`
(`workflow_dispatch`, per-OS checkboxes, tag `tauri-<short-sha>`, artifacts
named `PhiLogg-<sha>.<ext>`).

## Version stamp and release-only comment stripping

Same scheme as `release.yml`: the release job rewrites `PHILOGG_VERSION` in
the checked-out `philogg.html` to the commit short-SHA before bundling
(never committed back), and the installer filename carries the same SHA.

The same job also runs `node scripts/strip-comments.js philogg.html`,
so the copy packaged into the installer carries no source comments — the
tracked `philogg.html` in the repo keeps every one of them. A local
`npm run build` does neither: it leaves the version at `dev` and the
comments in place, which is what you want while developing.

## What it does

`.log` file associations and CLI-argument opening, a frameless window with
rounded corners, window controls in the app's own theme, F11 / double-click /
maximize all toggling the same native maximize, a
splash screen, a tray icon with Open / Open Config Folder / Clear Cache /
Quit, "close to system tray", picture-in-picture (a diagonal `<->` window
button shrinks the window to a small always-on-top content view; its own
strip offers return-to-full and a minimize back to the taskbar),
`settings.json` mirroring of the `philogg-*` settings, "Open File Location" /
"Copy Path", the system font list for the UI font picker, and a folder watch
that does not go through the browser's File System Access API (see below).

## Persistent data

`settings.json` lives in `PhiLogg/` in the OS config directory
(`~/.config/PhiLogg`, `~/Library/Application Support/PhiLogg`,
`%APPDATA%\PhiLogg`). The tray's "Open Config Folder" opens it.

The session cache (IndexedDB) lives in the webview's own storage for this
app, wherever the platform puts it; the tray's "Clear Cache" wipes it and
reloads.

## Portable build (Windows)

Released alongside the installer as `PhiLogg-<sha>_portable.zip`. Unzip it
anywhere — a USB stick or external drive included — and run `PhiLogg.exe`
directly; nothing is installed and nothing is written to the host machine.
Both `settings.json` and the session cache move into a `data\` folder next
to the exe instead of the usual OS locations, so the whole thing (app +
settings + cache) stays self-contained on that one folder/drive. This only
works because a `philogg-portable` marker file and a `philogg.html` copy
ship inside the zip next to the exe — don't delete either, and don't rename
or move the exe away from them.

Building it locally: `npm run build` already produces the raw
`src-tauri/target/release/philogg-desktop.exe`, which needs no install
(WebView2 ships with Windows). Drop `philogg.html` and an empty
`philogg-portable` file next to it to get the same portable layout by hand.

## Folder watch

Folders are listed natively (Rust `read_dir`) instead of through the File
System Access API, so the watch works on all three platforms and on folders
a Chromium-based build refuses to hand out — Desktop and Downloads, which
fail in the browser with "this folder contains system files". Files opened
from a watched folder carry their real path too, so they reveal and copy
like any other.

## Known limitations

- **The system font list on macOS is approximate.** Linux uses `fc-list` and
  Windows uses PowerShell's font enumeration, both exact; macOS has neither
  out of the box, so family names are derived from the font files' own
  names in the three standard font directories.
- **The maximize/restore button doesn't swap its glyph** the way a native
  window control does — it's one button that toggles, with one icon.
- **Rounded corners are the platform's own behaviour for an undecorated
  window** (macOS always, Windows 11 via DWM, Linux compositor-dependent).
- **`getPathForFile` can never work.** No system webview resolves a `File`
  object back to its OS path, so the wrapper opens files itself (OS dialog,
  native drag-drop, native folder listing) and the path is known before the
  page ever sees them. Nothing user-visible is missing; it is only why the
  file-opening routes look the way they do.

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
two wait on each other. It does not occur on a real desktop session, where
the splash is a visible window. Anything needing the actual UI has to be
checked on a real machine.

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
uses. See `docs/desktop.md` for both.

The native folder watch (2026-09-01) is verified by `cargo check` plus the
jsdom suite's Group 145 only — the picker, the listing and a real Desktop
folder still need a person on a real desktop session.

**Picture-in-picture (2026-09-07)** is verified by `cargo check` plus the
jsdom suite's Group 182 only. The real `set_always_on_top`/`set_size`/
`unminimize` transitions and the injected `<->`/X buttons still need a person
on a real desktop session (`npm run dev`), on Windows and macOS especially —
the injected strip's `markDragRegion` drag handle and the async
`pip_enter`/`pip_exit`/`pip_minimize` commands (see `docs/desktop.md` →
"Picture-in-picture") are the parts most likely to need platform adjustment.

**Not yet run on macOS.** The window chrome specifically (the injected
title-bar buttons, the drag region, rounded corners, the traffic-light
inset) is the part most likely to need adjustment there. The macOS-only
code paths aren't compile-checked from this environment.

The app icons in `src-tauri/icons/` are placeholders (a teal dot), generated
by `icons/generate.js` — the Tauri bundler requires an icon set. Replace
that script's `draw()` and re-run it once real artwork exists.
