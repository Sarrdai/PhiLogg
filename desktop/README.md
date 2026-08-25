# PhiLogg desktop wrapper

A thin Electron shell around the unmodified `../philogg.html` — adds `.log`
file associations, CLI-argument file opening, a frameless window with
integrated close/minimize/maximize controls (see "Frameless window" below),
a startup splash screen, and a system-tray "close to tray" mode (see
"Startup perception (splash + tray)" below) on Windows/Linux/macOS.
Separate, optional deliverable: doesn't touch `philogg.html` or its own
release path (`.github/workflows/release.yml`) at all. See `PROJECT.md` →
"Deep-link loading (`?url=`)" and the plan this was built from for the full
design rationale.

## Status

**Run interactively on real Windows (2026-08-20)** — file associations and
double-click file opening both work; that run also surfaced and fixed three
bugs (opened files named after their internal id instead of their real
filename; a second file opening a whole new window instead of joining the
existing one — see `PROJECT.md` → "Desktop wrapper" changelog for both) plus
four earlier frameless-window bugs (also fixed, same section). Not yet run
interactively on macOS/Linux — this dev environment still has no display
server for a real `BrowserWindow` there. Before relying on this on a new
platform:

1. `cd desktop && npm install` on a real machine.
2. `npm start` — confirms the window opens and loads `philogg.html`
   (via the `philogg://app/philogg.html` URL, not `file://` — see
   `main.js`'s top comment for why).
3. Open a `.log` file via a command-line argument
   (`electron . /path/to/some.log` in dev, or the packaged binary once
   built) and confirm it loads through the `philogg://local/<id>/<name>`
   route, named after its real filename.
4. `npm run build` (electron-builder) — produces an installer for
   whatever platform you're building on. Cross-compiling a signed
   Windows/macOS installer from Linux CI needs extra setup (signing
   certs, `electron-builder`'s own cross-build docs) not covered here.
   Set `PHILOGG_SHA` first (e.g. `PHILOGG_SHA=$(git rev-parse --short
   HEAD) npm run build`) or the installer filename is left with a blank
   where the version normally goes — see "Version stamp" below.
5. Add real icons before a release build — see "Adding an app icon" below.
6. Confirm the frameless window (see "Frameless window" below) actually
   works: the window is draggable by its header's empty space, every
   header button (Session…, Open…, theme toggle, …) is still clickable,
   and the close/minimize/maximize controls in the top-right are present
   and functional — none of this has run on a real display yet.

## Frameless window

`main.js` creates the `BrowserWindow` without the native OS frame or the
default File/Edit/View/Window/Help menu — `philogg.html`'s own `#toolbar`
is the only header. Windows/Linux use `titleBarStyle: "hidden"` +
`titleBarOverlay` (Electron's Window Controls Overlay), which draws
native-looking minimize/maximize/close buttons top-right without any
custom HTML; macOS uses `titleBarStyle: "hiddenInset"`, which keeps the
native traffic-light buttons at their normal top-left position rather than
moving them to match Windows — relocating a Mac app's own window controls
would be the actually-jarring choice there.

A frameless window has no title bar left to drag by default, so `main.js`
injects a small stylesheet at runtime (`insertCSS`, never touching
`philogg.html` on disk) making `#toolbar` draggable and all of its
buttons/inputs `no-drag` again, plus — Windows/Linux only — right padding
via the `titlebar-area-*` CSS environment variables Chromium exposes for
exactly this, so `#toolbar`'s own rightmost button doesn't sit under the
native overlay buttons. The overlay's colors follow `#btnTheme`'s
light/dark toggle live too — `main.js` polls the renderer's own
`data-theme` attribute (~1x/second, no preload/IPC bridge needed — see
"Why no preload.js" below) and calls `win.setTitleBarOverlay()` on change.
`TITLEBAR_HEIGHT` in `main.js` is 1px shorter than `#toolbar`'s own 50px so
its `border-bottom` isn't occluded by the overlay buttons. See the comment
above `FRAMELESS_CSS` in `main.js` for the full mechanism, including why
an earlier version's JS-computed padding (measuring
`navigator.windowControlsOverlay`'s rect instead of using `env()`) went
stale across maximize/restore/fullscreen — reported after the first real
Windows run, fixed the same session, not yet re-verified live.

`F11` toggles fullscreen (caught via a per-window `before-input-event`
listener, since there's no app menu to hang an accelerator on) and the
window requests rounded corners (`roundedCorners: true`) that the OS
compositor automatically squares off once the window fills the screen —
maximized or fullscreen alike — with no extra code needed for that case.
See the `ROUNDED_CORNERS`/`watchFullscreenToggle` comments in `main.js` for
the per-platform caveats (Windows pre-11-Build-22000 stays square either
way; Linux rounding depends on the desktop environment's own compositor).

## Startup perception (splash + tray)

Launch shows a small always-on-top splash window immediately (an inline
`data:` URL, no asset file) while `philogg.html` loads underneath; the main
window stays hidden until it fires `"ready-to-show"`, at which point it's
shown and the splash is destroyed. Separately, Settings → Behavior's "Close
to system tray" toggle (on by default) makes the window's close button —
and `"Closing the last log file quits the app"`'s own close path — hide the
window to a tray icon instead of quitting; right-click the tray icon for a
real Quit, left-click/"Open PhiLogg" to jump straight back in. See
`PROJECT.md` → "Desktop wrapper" → "Startup perception" for the full
mechanism (`createSplash`/`watchCloseToTray`/`createTray` in `main.js`).

## Version stamp

Matches `release.yml`'s scheme for the plain `philogg.html` tester build:
`desktop-release.yml`'s `Stamp version` step rewrites the checked-out
copy's `PHILOGG_VERSION` (`"dev"` in source, never committed back) to the
commit's short SHA before `npm run build` packages it, so the in-app
corner text/License panel show the real build instead of "dev". The same
SHA becomes the installer's own filename via `electron-builder.yml`'s
`artifactName` (`PhiLogg-<sha>.exe`/`.dmg`/`.AppImage`, replacing
`package.json`'s placeholder `"1.0.0"` there — `package.json`'s own
`version` field is left alone since electron-builder expects real semver
there, which a git SHA isn't).

## Adding an app icon

No app icon exists yet — `electron-builder.yml` has no `icon:` lines and
`build/` currently has no `icons/` subdirectory. **Keep it that way until
real artwork exists**: an earlier version of this scaffold shipped an empty
placeholder `build/icons/` directory, and electron-builder's Linux target
(`app-builder`) hard-failed the CI build with `icon directory ... doesn't
contain icons` / `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` — the directory's
mere presence is taken as "icons belong here", unlike Windows/macOS which
silently fall back to Electron's default icon when nothing is configured.

To add a real icon later: drop a single square `build/icon.png` (1024×1024
recommended; electron-builder derives `.ico`/`.icns` from it), or a
multi-resolution `build/icons/16x16.png`, `32x32.png`, ... set, then add an
`icon:` line under the matching platform block in `electron-builder.yml`.

## Why no `preload.js` / IPC bridge

The renderer never needs Node access. `main.js` reads a local file via
Node `fs` (bypassing the browser's gesture requirement) and serves it back
over a custom `philogg://` scheme instead — `philogg.html`'s existing
`?url=` deep-link loader (`loadFromUrlParam()`) just `fetch()`es it, the
exact same code path a remote CI log link uses. One loading mechanism,
not two.

## Why a custom scheme instead of `file://`

`loadFromUrlParam()` deliberately refuses to even attempt a fetch when
`location.protocol === "file:"` (that guard exists because a real
`file://` page genuinely cannot `fetch()` anything in a browser). Loading
`philogg.html` itself through the privileged custom `philogg://` scheme
instead of `loadFile()` keeps that guard intact — this wrapper isn't a
special case carved out of it, it just isn't a `file://` page.
