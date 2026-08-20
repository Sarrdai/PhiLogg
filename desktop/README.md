# PhiLogg desktop wrapper

A thin Electron shell around the unmodified `../philogg.html` — adds `.log`
file associations, CLI-argument file opening, and a frameless window with
integrated close/minimize/maximize controls (see "Frameless window" below)
on Windows/Linux/macOS. Separate, optional deliverable: doesn't touch
`philogg.html` or its own release path (`.github/workflows/release.yml`)
at all. See `PROJECT.md` → "Deep-link loading (`?url=`)" and the plan this
was built from for the full design rationale.

## Status

**Scaffolded, `.github/workflows/desktop-release.yml` has run once** (see
"Adding an app icon" below for what that run found). Still not run/tested
interactively on any machine — no display server here for a real
`BrowserWindow`, so `npm start` and the file-association flow are unverified.
Before relying on this:

1. `cd desktop && npm install` on a real machine.
2. `npm start` — confirms the window opens and loads `philogg.html`
   (via the `philogg://app/philogg.html` URL, not `file://` — see
   `main.js`'s top comment for why).
3. Open a `.log` file via a command-line argument
   (`electron . /path/to/some.log` in dev, or the packaged binary once
   built) and confirm it loads through the `philogg://local/<id>` route.
4. `npm run build` (electron-builder) — produces an installer for
   whatever platform you're building on. Cross-compiling a signed
   Windows/macOS installer from Linux CI needs extra setup (signing
   certs, `electron-builder`'s own cross-build docs) not covered here.
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
injects a small stylesheet at runtime (`insertCSS`/`executeJavaScript`,
never touching `philogg.html` on disk) making `#toolbar` draggable and all
of its buttons/inputs `no-drag` again, plus — Windows/Linux only — right
padding sized from the live `navigator.windowControlsOverlay` rect so
`#toolbar`'s own rightmost button doesn't sit under the native overlay
buttons. See the comment above `FRAMELESS_CSS` in `main.js` for the full
mechanism and its one known gap: the overlay button colors are fixed to
the dark theme at window-creation time and don't follow `#btnTheme`'s
light/dark toggle live (would need a preload/IPC bridge — see "Why no
preload.js" below).

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
