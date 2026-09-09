# Desktop Wrapper

The optional desktop wrapper around the **unmodified** `philogg.html`, in
`desktop/`: the OS's own webview (WebView2 / WKWebView / WebKitGTK) plus a
Rust backend (Tauri v2). It adds `.log` file associations, CLI-argument/double-click
file opening, a frameless window with integrated window controls, a tray, a splash
screen, `settings.json` mirroring, "Open File Location"/"Copy Path", a system font
list for the UI font picker, and a folder watch that does not go through the
browser's File System Access API.

`desktop/README.md` has the build/run steps, the prerequisites, and the
current run status — this file covers the internal mechanism only.

**The rule everything here obeys**: `philogg.html` is never edited. It is served
through a custom `philogg://` scheme and handed a local file through its own `?url=`
deep-link mechanism (see PROJECT.md → "Deep-link loading"), and everything
wrapper-specific is injected at runtime.

## Layout

`desktop/package.json` exists only to pull in the Tauri CLI. Everything else is
`src-tauri/`: `tauri.conf.json` (bundle config, `.log` file association,
`philogg.html` as a packaged resource), `Cargo.toml`, `capabilities/default.json`,
the placeholder icon set under `icons/` (plus the dependency-free `icons/generate.js`
that produced it — the Tauri bundler *requires* an icon set), and `src/`:

| file | role |
|---|---|
| `main.rs` | builder wiring, `setup`, the macOS-only `RunEvent` arms |
| `protocol.rs` | the `philogg://` scheme (app page, splash page, local files) |
| `windows.rs` | main/splash window creation, close-to-tray, PiP, file routing |
| `tray.rs` | tray icon + menu |
| `settings.rs` | `settings.json` read/write and its directory |
| `commands.rs` | everything the injected script may call |
| `inject.rs` + `inject.js` | the injected script itself |
| `state.rs` | the `localFiles` map, quit/close/PiP flags, caches |
| `fonts.rs` | system font enumeration |

## The `philogg://` scheme, and why there is a `fetch` shim

The wrapper registers a custom URI scheme rather than loading the page off `file:`,
because `philogg.html`'s own `loadFromUrlParam()` guard deliberately refuses a `?url=`
fetch when `location.protocol === "file:"` (that guard exists because a real `file://`
page genuinely can't `fetch()` anything — see PROJECT.md → "Deep-link loading").
Serving the page from its own scheme keeps that guard intact instead of needing a
special case carved out of it.

The scheme serves three things — `app/philogg.html` (the packaged copy, or the working
copy in a `tauri dev` run), `app/splash.html` (generated in Rust, see below), and
`local/<id>/<basename>` (a local file, `id` mapped to a path chosen only from
OS-supplied input: argv, the OS file dialog, a native drop, or macOS's `Opened`
event — the same trust level as a native file-open dialog; the URL's `<basename>`
segment is only read by `philogg.html`'s own last-path-segment naming logic, the
protocol handler still looks the file up by `id` alone). A file-association launch
opens a window at `philogg://app/philogg.html?url=philogg://local/<id>/<basename>`
and `philogg.html`'s `loadFromUrlParam()` just `fetch()`es it, completely unmodified,
exactly like it would fetch a remote CI log URL.

It is registered as an *asynchronous* URI-scheme protocol, because a log served this
way can be hundreds of megabytes and is re-read on every tail tick — the synchronous
variant would block the webview's own thread for each read.

One platform wrinkle: **Tauri does not give the webview a real custom scheme on every
platform.** What it registers as `philogg` is served as `philogg://localhost/…` on
macOS/Linux and as `http://philogg.localhost/…` on Windows. Neither is
`philogg://local/…`, which is the exact shape `philogg.html`'s `isDesktopLocalUrl()`
matches to decide a loaded URL is a *tail-able local file* (and, downstream, that
"Open File Location" should route through `revealLocalUrl`). Changing that check in
`philogg.html` was not an option, so the page is handed the canonical
`philogg://local/<id>/<basename>` URL — keeping tail-follow, the filename derivation
and the context menu all working unmodified — and `inject.js` wraps `window.fetch` to
rewrite exactly that prefix to whatever the platform actually serves. The protocol
handler accepts both shapes, so nothing depends on the rewrite having happened.

## One injected script

Tauri's `initialization_script` runs before any page script *and* re-runs on every
navigation, so `inject.js` is a single file that covers both halves — what must exist
before `philogg.html`'s top-level script runs, and what needs the DOM (behind
`DOMContentLoaded`) — and survives a reload (which the tray's "Clear Cache" performs)
with no re-injection hook on the Rust side at all. It is built by `inject.rs`, which
substitutes four values into it: the settings snapshot, a per-process nonce, the
platform's real scheme base, and whether this is macOS. The splash window deliberately
gets no script (it ends by reporting "painted", which would dismiss the splash itself).

**Bridge.** `window.philogg` is the narrow surface `philogg.html` feature-detects on
(`window.philogg` exists → desktop build): `pickFiles`, `pickFolder`, `listFolder`,
`pathForLocalUrl`, `revealPath`, `revealLocalUrl`, `listSystemFonts`, `exitPip`, and
`getPathForFile`. That last one returns `null` permanently — no system webview can
resolve a `File` object back to its OS path — which is why the wrapper opens files
itself instead (next paragraph). `philogg.html` treats a null `getPathForFile` as "no
path known", so nothing breaks; under this wrapper no route reaches that case any more.
`exitPip` is the PiP exit half, see "Picture-in-picture" below.

**Knowing a file's path anyway.** Because the webview will never hand the page a real
path, this wrapper *is* the thing that opens files, so the path is known before the
page ever sees them — the route a file-association open already took, generalized to
the others:

| Route | How the path is known |
|---|---|
| File association / launch arg | `windows.rs`'s `open_file` → `register_local_file` |
| "Open… → File(s)…" | `philogg.html`'s `openFilesPicker` defers to `philogg.pickFiles`, which runs the OS dialog in Rust (`tauri-plugin-dialog`, driven from Rust — so still no ACL entry) |
| Drag-and-drop | Tauri's *native* drag-drop handler (`WindowEvent::DragDrop`, see `windows.rs`) |
| "Open… → Folder…" / a dropped folder | `pick_folder` runs the OS folder dialog; `list_folder` lists it (see "Folder watch without the File System Access API" below) |

All of them end at `state.register_local_file(path)`, which yields the
`philogg://local/<id>/…` URL the file is served under, and hand the page both halves —
path and URL — through `window.philoggLoadLocalFiles({ files, folders })`.
`philogg.html` turns each into an ordinary load descriptor, so the queued
placeholders, the multi-file merge prompt and tailing all work exactly as they do for
a dropped `File`; `node.localPath` and `node.sourceUrl` are both set, so "Open File
Location" and "Copy Path" are offered. Covered by tests **Groups 141-143**.

**The drag-drop trade.** The native handler is the only one carrying OS paths, and
turning it on suppresses the HTML drop events. This wrapper takes that trade — an
earlier version did the opposite (`disable_drag_drop_handler()`) and accepted pathless
drops instead. One consequence: `philogg.html` never sees a `dragenter`, so the
wrapper drives its `#dropOverlay` through the page's own `window.philoggDropOverlay(show)`
hook. A dropped **folder** travels in the same call as a path, which is exactly what
the watch wants — see the next section. `Group 139` still pins the underlying
contract: a `File` arriving with no path supplied must never have a path invented for
it, even though no route here reaches that case any more.

The native handler fires `DragDropEvent::Enter`/`Over`/`Leave` for *any* drag the
webview sees, including an in-app one — reparenting a filter tree row via
`philogg.html`'s own HTML5 `draggable` rows (`renderNode`'s `dragstart`) — not just an
OS file drag. Only `Enter` carries `paths: Vec<PathBuf>`, so `handle_drag_drop`
(`windows.rs`) checks it there and remembers the verdict (a `Cell<bool>` captured in the
`on_window_event` closure) for the `Over`/`Leave`/`Drop` events that follow it in that
same drag; an in-app drag's `Enter` always arrives with an empty `paths`, so the overlay
is skipped for the whole gesture. Without this, dragging a filter row briefly showed the
full-screen "Drop Logfiles to Load" overlay on top of the tree, which then swallowed the
row's own `dragover`/`drop`.

**Frameless window and window controls.** Off macOS the window is `decorations(false)`
and the controls are *real DOM*: `inject.js` appends a three-button `#tauri-wc` block
into `philogg.html`'s own `.toolbar-right`, styled purely from the page's existing
theme variables (`--text-secondary`, `--bg-elevated-2`, `--accent`, `--level-error`).
Because the buttons *are* themed elements, a theme or accent change repaints them with
no backend involvement and nothing to go stale, and because they occupy real layout
space in the toolbar, nothing sits underneath them and no padding has to be reserved.
On macOS the window keeps its decorations with `TitleBarStyle::Overlay` +
`hidden_title(true)` and only `.brand { padding-left: 72px }` is injected, leaving the
traffic lights where a Mac user expects them rather than relocating a Mac app's own
controls. Rounded corners are the platform's own behaviour for an undecorated window
(macOS always, Windows 11 via DWM, Linux compositor-dependent), and a window that
exactly fills the screen is squared off by the OS compositor automatically — so
"rounded except when fullscreen" needs no code.

**Drag region.** `philogg.html`'s own `#toolbar` is the only header a frameless window
has left, so it doubles as the drag handle. Tauri's `data-tauri-drag-region` only fires
when the clicked element *itself* carries the attribute, so `inject.js` stamps it on
`#toolbar` and every descendant that isn't inside a control (`button, input, select,
textarea, a, label, .ctx-item, #tauri-wc`) — the `<svg>`/`<path>` inside an icon button
is the real event target on a click, so skipping the whole control subtree is what keeps
toolbar buttons clickable. A `MutationObserver` re-stamps as the toolbar's contents
change (status text, controls enabling/disabling). Test **Group 140** is the tripwire
for the selectors and the 50px toolbar height the chrome is keyed off. The actual
mousedown → move-the-window handling is Tauri's own, not `inject.js`'s:
`data-tauri-drag-region` is read by a small script Tauri auto-injects into every window
(`tauri::window::plugin`'s `drag.js`), which calls the `start_dragging` core command on
a plain click and `internal_toggle_maximize` on a double-click. That command is
deliberately **not** part of `core:window`'s default permission set (unlike
`internal_toggle_maximize`, which is) — `capabilities/default.json` grants
`core:window:allow-start-dragging` explicitly for this reason. Person-tested bug
(2026-09-01): without that grant, marking the region does nothing detectable at all —
no console error, no invoke failure visible from the page — clicking empty toolbar
space is silently a no-op and the window cannot be moved.

**F11** (`FEATURE_BACKLOG.md` #31). A Tauri webview has no main-process input hook, so
the key is caught in the page (capture phase) and routed to the `window_toggle_maximize`
command — the exact same native maximize/restore the injected rectangle window-control
button uses. F11, the rectangle button, and a double-click on the toolbar's drag region
are all equivalent: they toggle the SAME native maximize state, so a maximized window
restores under the cursor the same way whichever trigger entered it.

## Folder watch without the File System Access API

`philogg.html` watches a folder through `window.showDirectoryPicker()`. That is a
**webview engine** API, and it plays by the engine's rules, not the app's:

- Chromium refuses a directory handle for anything on its hardcoded sensitive-directory
  list (`ChromeFileSystemAccessPermissionContext`) — Desktop and Downloads among them —
  with the "this folder contains system files" error. The check runs *inside* the
  engine, after the call; there is no Tauri setting for it and no WebView2 browser
  flag, so an embedder cannot relax it.
- WKWebView (macOS) and WebKitGTK (Linux) don't implement the API at all, so folder
  watch simply didn't exist there.

So this wrapper doesn't ask the webview. `commands.rs` has three commands —
`pick_folder` (the OS folder dialog, Rust-driven like `pick_files`, so still no ACL
entry), `list_folder(path, extensions)` (a non-recursive `read_dir`, filtered by the
extensions the *page* considers loadable, each match registered through the same
`LocalFile::register` every other route uses), and `list_subfolders(path)` (the same
directory's immediate subdirectories, unregistered — just names and paths) — and
`inject.js` exposes all three as `philogg.pickFolder` / `philogg.listFolder` /
`philogg.listSubfolders`. Rust's filesystem access has no blocklist, so Desktop is just
a directory.

On the page side this is one duck-typed stand-in, `nativeDirHandle(path, name)`, sitting
next to `urlTailHandle` in the Tailing section. It implements exactly the four members
the folder-watch code touches — `name`, `values()`, `queryPermission()`,
`requestPermission()` — so `scanFolderHandle`, `mergeScannedFiles`, `rescanFolder`,
`folderScanTick` and `tryReconnectFolder` run against it unmodified; there is no
"native or browser" branch anywhere in that section. `values()` yields both
`list_folder`'s files (as `urlTailHandle`s) AND `list_subfolders`'s directories (as
nested `nativeDirHandle`s, `kind: "directory"`) — mirroring a real
`FileSystemDirectoryHandle`, so `scanFolderHandle`'s own recursion (gated on
`settings.includeSubfolders`) descends into them exactly as it would in the browser.
`queryPermission()` is a constant `"granted"`: a native listing has no permission model,
the person picked the folder in the OS's own dialog. Each yielded file entry *is* a
`urlTailHandle` (which carries the file's path alongside its URL), so a file opened from
a watched folder tails, reveals and copies its path exactly like a dropped one.

Two details that are easy to get wrong:

- **`register_local_file` dedupes by path.** The scan tick re-lists every watched file
  every `FOLDER_SCAN_MS` (3 s). Minting a fresh id per call — what it did — would grow
  the id → path map without bound *and* hand the page a different URL for a file it is
  already tailing. `state.rs` keeps a reverse `path -> id` map so a path always maps to
  the same id for the life of the process.
- **The stand-in is not persistable, its path is.** `philogg.html` stores a watched
  folder in IndexedDB so a reload resumes it; a real `FileSystemDirectoryHandle`
  survives structured clone by spec, a stand-in holding a closure does not (the same
  `DataCloneError` trap the `urlTailHandle` cache bug fell into). `persistFolder` stores
  the **path** instead and `restoreWatchedFolders` rebuilds the stand-in, which loses
  nothing: unlike a handle, a path stays valid across a restart with no permission to
  re-grant, so a restored native folder resumes silently instead of showing the
  "Reconnect" button. What *is* per-process is the id in each file's
  `philogg://local/<id>/…` URL, so `mergeScannedFiles` refreshes the
  `sourceUrl`/`localPath` of any already-open file on every scan.

Covered by test **Group 145**.

## "Open File Location" and "Copy Path"

`FEATURE_BACKLOG.md` #52, implemented deliberately generic rather than tied to any one
wrapper: a file node's tree context menu offers **"Open File Location"** whenever a real
OS location is known *and* `window.philogg` exists — never in the plain `philogg.html`
build, since no web API lets a browser resolve a `File` back to a filesystem path at all
(that's the whole point of the File System Access sandbox), so the item simply never
renders there rather than offering a fake affordance that would always fail.

"Known" means one of two things, and each has its own route:

- `node.localPath` — a real OS path, supplied by the wrapper alongside the file it
  opened itself (see the route table above). Reveals via `philogg.revealPath`.
- `node.sourceUrl` pointing at `philogg://local/…` — a file the page knows *only* by
  that URL. Reveals via `philogg.revealLocalUrl`, since only `state.rs`'s `localFiles`
  map can resolve that id back to a path.

A genuine `http(s)` `node.sourceUrl` (no OS folder to reveal) gets **"Copy URL"**
instead — the useful analogue for a remotely-loaded log, and one that works in every
build with no wrapper at all.

**"Copy Path"** rides along on exactly the same gate as "Open File Location": wherever
the location is known well enough to open it, it is known well enough to put on the
clipboard, and pasting it into a terminal or a ticket is the other half of what people
want a known path for. A known `node.localPath` goes straight to the clipboard; a
`philogg://local/…` file has its path fetched back through `philogg.pathForLocalUrl`
(the same `localFiles` lookup `revealLocalUrl` does, handing the answer back instead of
acting on it).

Both `node.localPath` and `node.sourceUrl` are threaded through
`persistFileNode`/`restoreSessionFromCache`, so the menu item survives a reload instead
of silently vanishing after a refresh even though the file is still the same one on disk.
`tests/philogg.regression.test.js` Group 109 covers the menu-item gating (all three
outcomes, plus "absent without `window.philogg`") and the cache round-trip, via a stub
`window.philogg` — jsdom can't run a real webview host.

## System font list for the UI font and Log font pickers

A native process has no browser-style permission gate on enumerating installed fonts, so
`philogg.listSystemFonts()` exists in the desktop build only. `fonts.rs` calls the
platform commands directly rather than pulling in a font crate (and, on Linux, its
fontconfig/freetype build dependencies) to re-derive a list of names: `fc-list` on Linux,
PowerShell's `SystemFontFamilies` on Windows. macOS has neither out of the box, so names
there are approximated from the font files in the three standard font directories — the
one place the list is less than exact. Any failure yields an empty list rather than
throwing, so a headless or sandboxed OS just means no extra options appear.

The same `listSystemFonts()` result feeds two independent pickers: `philogg.html`'s
`initUiFont()`/`initLogFont()` each call it once (after applying their own curated default
from `UI_FONT_OPTIONS`/`LOG_FONT_OPTIONS`) and append every name to their own select
(`#settingsUiFontSelect`/`#settingsLogFontSelect`) as an `<optgroup>`, skipping any name
that duplicates that select's own curated stacks (`appendSystemFontOptions`'s dedup check,
now parameterized by select id + options list). Each system-font option's value is
`"sys:" + name`; `fontStackForId()` computes its actual stack on the fly
(`"<name>",<that picker's own default fallback stack>`) instead of requiring a hardcoded
options-array entry per font. UI font drives `--font-ui`, Log font drives its own
`--font-log` (see `docs/ui-and-views.md` "Theming") — the plain HTML build (no
`window.philogg`) is completely unaffected, same curated-list-only behavior as before for
both.

## Settings: mirrored into a human-editable `settings.json`

`FEATURE_BACKLOG.md` #33. `philogg.html`'s `philogg-*` `localStorage` keys aren't
reachable from outside the webview at all by default, so the wrapper mirrors them into a
plain `settings.json`, still without touching `philogg.html` itself.

The **read** half must land before `philogg.html`'s own top-level script runs — many of
those keys are read once, synchronously, at top-level script parse. The values are
already known on the Rust side at window-creation time, so `inject.rs` bakes them
straight into the initialization script as a JSON literal: no IPC, no preload, nothing
that can race the page. It hydrates once per *process*, not once per load — the baked
values are a startup snapshot, so re-applying them after a later reload would revert
anything changed since. A nonce that changes every process start, kept in
`sessionStorage` (which survives reloads within one webview session), is what
distinguishes the two.

The **write** half only ever happens after a user interaction, so it needs no such
guarantee: a ~1x/second poll in the page dumps every `philogg-*` key/value pair, diffed
against the last dump before crossing the process boundary, plus a best-effort flush on
`beforeunload`/`pagehide` so a change made right before quitting isn't lost. The Rust
side diffs again before touching disk.

**`window.close()` has to be routed through Rust.** `philogg.html`'s
`quitOnLastFileClose` calls the plain DOM `window.close()`, which relies on the *host*
intercepting a webview's own close and turning it into a real window close. A Tauri
webview does not. Person-tested bug (2026-09-01): calling it left an empty, dark,
permanently-open window — the webview engine tore down the *page* (so the app visibly
"closed") without ever notifying the Rust side, so `WindowEvent::CloseRequested` never
fired and the close-to-tray decision in `windows.rs` never ran; only the tray's Quit
could get rid of it. `inject.js` overrides `window.close` to `invoke("window_close")`,
which calls the real `Window::close()` on the Rust side — that one **does** raise
`CloseRequested`, landing on the exact same close-to-tray decision the injected
title-bar close button uses.

`settings.json` lives in `<os-config-dir>/PhiLogg/`, deliberately *not* the
identifier-derived directory Tauri would pick by default. The session cache (IndexedDB)
lives in the webview's own storage for this app, wherever the platform puts it.

**Portable build (Windows only)**: `settings::portable_dir()` looks for a
`philogg-portable` marker file next to the running executable; if it's there, both of the
above move onto the same drive as the exe instead — `config_dir()` returns
`<exe-dir>/data/` for `settings.json`, and `windows.rs`'s `create_main` points the
`WebviewWindowBuilder` at `<exe-dir>/data/webview` via `.data_directory(...)`
(`WebviewBuilder`/`WebviewWindowBuilder` expose this since Tauri 2.1; it redirects
WebView2's whole user-data folder, IndexedDB included). `html_path()` also falls back to
an exe-adjacent `philogg.html` before the dev-only `CARGO_MANIFEST_DIR` fallback, since
the portable build has no installer/resource dir to read it from. Nothing else changes:
the tray's "Open Config Folder" and "Clear Cache" already go through `config_dir()`/the
webview APIs, so they work unmodified in either mode. See "Release" below for how the
portable `.zip` is assembled, and `desktop/README.md` for the user-facing description.

## Tray, splash, close-to-tray, single instance

- **Splash** (`FEATURE_BACKLOG.md` #51, the "startup takes several seconds with no
  feedback" half): a small always-on-top undecorated window on `philogg://app/splash.html`,
  generated as a string in `protocol.rs` so nothing extra needs packaging. It opens the
  instant the main window is created; the main window is built `visible(false)` and shown
  only once the page reports a first paint — two nested `requestAnimationFrame`s after
  `DOMContentLoaded`, deliberately not the event itself, which would just swap one blank
  window for another — via the `app_ready` command, which closes the splash at the same
  moment.
- **Tray**: always created, not lazily on the first hide — with no application menu
  anywhere it is the only reachable place for "Open Config Folder" (opens the
  `settings.json` directory) and "Clear Cache" (wipes the IndexedDB session cache and
  reloads), neither of which depends on the close-to-tray setting. Four items: Open
  PhiLogg / Open Config Folder / Clear Cache / Quit. The icon is a teal dot, rasterized
  in Rust because Tauri's tray takes pixels rather than markup.
- **Close to tray** (`philogg.html` → Settings → Behavior, `philogg-close-to-tray`,
  default **on** — the one behavior toggle in that section that defaults on rather than
  off, since it's the requested default rather than an opt-in change to existing
  behavior): `WindowEvent::CloseRequested` → `prevent_close()` + `hide()`. The value is
  already mirrored into the Rust-side state by the settings poll (and seeded from
  `settings.json` at startup, so the very first close honours it too), so the decision is
  synchronous. An `is_quitting` flag distinguishes a real quit (tray's Quit, Cmd+Q, OS
  shutdown) from the hide-to-tray path, so the interception doesn't loop. Reopening a
  file or clicking the tray icon while parked in the tray shows the hidden window again
  rather than feeling like a fresh launch. Because `quitOnLastFileClose`'s path is itself
  just a `window.close()` (routed through Rust, above), "closing the last open file"
  respects this setting for free.
- **Single instance**: `tauri-plugin-single-instance`, whose callback registers the new
  file and calls `window.philoggLoadUrl(url)` in the running window — so a second
  file-association double-click joins the existing tree instead of opening a second app
  window. (`loadUrlIntoTree(url)` is `loadFromUrlParam`'s fetch-and-`addFile` body,
  refactored out and exposed on `window` for exactly this.) Windows/Linux receive the
  path as argv; macOS delivers it through `RunEvent::Opened` instead, including on a cold
  launch.

## Picture-in-picture (PiP)

PiP replaces an earlier "popout window" design (a second `WebviewWindow`
mirroring the active view) that never landed on main. Its whole history was sync bugs —
every fix after the first ship was a missed or wrong *push* of state into the second
window — plus a window-creation deadlock on Windows (tauri-apps/wry#583). The lesson is
not "do the popout more carefully"; it is **never make the second copy at all.** So this
feature keeps the *one* real `philogg.html` instance — same `state`, same DOM, same
render pipeline, same real nodes — and only changes its appearance.

- **Trigger** is a dedicated button, not a setting: a diagonal `<->` window-control button
  (`inject.js`, left of minimize in the injected `#tauri-wc` controls) invokes the
  `pip_enter` command. Minimize itself is untouched (`window_minimize` is back to a plain
  minimize).
- **Enter** (`enter_pip`): first leaves maximize (so the bounds it captures are the real
  windowed ones — the OS restores the pre-maximize rect on its own, which is what
  guarantees "maximized back to windowed keeps the full size, never the mini size"),
  then remembers the full window's windowed **position + size** and whether it was
  **maximized** in `full_prev`/`full_was_maximized`. It then restores the mini window's
  own remembered position + size (`pip_prev`, defaulting to `420 × 320` at the current
  top-left on first entry) via `set_always_on_top(true)` + `set_position` + `set_size`,
  and `eval("window.philoggSetPip && window.philoggSetPip(true)")`. Only existing-window
  operations — no `WebviewWindowBuilder::build()`, so wry#583 is structurally out of scope.
- **Page-side appearance**: `philoggSetPip(active)` sets `state.pipActive` and toggles
  `html.pip-mode`, whose single CSS rule block hides every piece of chrome
  (`#toolbar`, `#sidebar`, `#viewBar`, the four view toolbars, `#plotControls`,
  `#treeActionBar`, `#detailPanel`, `#detailResizer`, `#timelineMinimap`, `#emptyState`)
  and leaves the active content view — the real `renderTable`/`renderExtractTable`/
  `renderPlotChart`/`renderHighlightView` output, virtualization, `state.tailFollow`, the
  stats panel — running unchanged. Content-only annotation stays visible (the floating
  `.tail-jump-btn`, the `.fh-panel-badge`).
- **The mini window's chrome** is a slim strip `inject.js` injects (`#tauri-pip`, shown
  only under `html.pip-mode`, styled from the page's own theme vars) that doubles as the
  drag handle (via `markDragRegion`). The strip is 40px tall (bumped from 36px, this
  session, 2026-09-08) so the 28px ViewMode switcher fits with 6px of clearance top and
  bottom instead of sitting nearly edge-to-edge; `html.pip-mode #app` carries the matching
  `padding-top:40px`, and `#fhTabs`' fixed `top:6px` centers it in the taller strip. At
  the far left sits the **ViewMode switcher** —
  `#fhTabs` is not hidden in PiP; `html.pip-mode` collapses `#viewBar` and re-parents
  nothing, instead `position: fixed`-ing `#fhTabs` into the strip's top-left (above the
  strip, which sits at `z-index:100`). On the right are two buttons: a diagonal `<->`
  ("Back to full window") that calls `pip_exit`, and an **X that does not close the app**
  — it calls `pip_minimize`, which ends PiP (restoring the full geometry first) and then
  minimizes the full window back to the taskbar, so the app keeps running in the
  background. **Double-clicking an empty spot of the strip** also expands to full mode —
  and restores the full window to its **windowed** state (never maximized). Tauri's own
  drag script turns a double-click on a `data-tauri-drag-region` into `internal_toggle_maximize`
  (see tauri's `src/window/scripts/drag.js`); `inject.js`'s `interceptDragDoubleClick`
  intercepts that second `mousedown` (`detail === 2`, before Tauri's document-level
  listener) and routes it to `pip_exit` instead, so the exit lands in windowed mode.
- **Full-mode double-click** on `#toolbar`'s drag region toggles the same native
  **maximize/restore** as the rectangle button (via Tauri's own `internal_toggle_maximize`,
  left untouched). This is deliberate: it keeps F11, the rectangle button and the
  double-click equivalent, so dragging a maximized window restores it under the cursor
  exactly the same way however it was entered. (A borderless *fullscreen* was tried
  first; its "restore on drag" had to be hand-rolled and never felt native, so fullscreen
  was dropped entirely in favour of maximize. In PiP the toolbar is `display:none`, so
  this can't fire there.)
- **Exit** (`exit_pip`): remember the mini window's current position + size (into
  `pip_prev`, so the next enter returns it there), then restore `always_on_top(false)`
  and the full window's previous state — it always re-applies the windowed position + size
  first (which also resets the OS's "restore size", so a later unmaximize/drag-out-of-
  maximize lands on the windowed size, never the mini size), then re-`maximize()` if that
  was the state at entry — and `philoggSetPip(false)`. Exits are entirely user-driven —
  the mini window's `<->`, its X (`pip_minimize`), or a jump — so there is no "restore"
  window event to distinguish.
- **Jump-before-reveal ordering**: `philogg.html`'s `jumpAfterPip(fn, args)` wraps the six
  jump entry points (link-view dblclick, Context-row dblclick, extraction-row dblclick,
  2D/3D plot-mark click, the Enter reveal). In PiP it awaits `window.philogg.exitPip`
  (`pip_exit`) *before* running the reveal — `pip_exit` resolves only after the geometry
  restore is applied, so the reveal's scroll/anchor math runs against the restored
  viewport, not the small PiP one. Not in PiP (or not the desktop build) the reveal runs
  directly, byte-identical to main.
- **Not jsdom-testable** (verify via `cd desktop && npm run tauri dev`): real
  `set_always_on_top`/`set_size`/`unminimize`, the injected buttons, and the restore
  ordering. Out of scope for v1: any PiP in the plain browser build, and hiding the
  taskbar entry while in PiP (`skip_taskbar` may not be togglable live without recreating
  the window — the exact hazard this design avoids).

## Release

`.github/workflows/desktop-release.yml`, manual-only (`workflow_dispatch`), entirely
separate from `release.yml` (which keeps publishing only `philogg.html`, unaffected by
any of this). A `prepare` job creates one release tag (`tauri-<short-sha>`) up front so
the per-OS `build` matrix jobs can each just build and upload their own installer into
it, without racing each other to create the same release. Four `workflow_dispatch`
boolean inputs (`build_windows` default on, `build_mac`/`build_linux`/
`build_windows_portable` default off) pick which platforms actually get a `build` job:
`prepare` computes a JSON OS list from the checkboxes (plain bash + `jq`) and `build`'s
`strategy.matrix.os` is `fromJSON(needs.prepare.outputs.os_list)`.
`build_windows_portable` alone still needs `windows-latest` in that list, so it's OR'd in
alongside `build_windows` and deduped with `jq`'s `unique` (ticking both doesn't spawn the
runner twice). **Not** a job-level `if:` comparing `inputs.*`
against `matrix.os` — GitHub rejects the whole workflow file at parse time for that
(`0` jobs, `startup_failure`): the `matrix` context isn't available in
`jobs.<job_id>.if`, only in `runs-on`/`env` and inside steps. An unchecked-everything
dispatch just produces an empty matrix, no separate guard needed. `fail-fast: false` so
one platform's failure doesn't cancel the still-running others, and `Upload installer(s)`
retries `gh release upload` up to 5x with backoff (both added after real runs saw exactly
those failures — see changelog).

Linux builds on `ubuntu-22.04` rather than `-latest` because an AppImage links against
its build machine's glibc, and the job installs the WebKitGTK/GTK/appindicator dev
packages first. Tauri's bundler has no `artifactName` template, so the upload step
renames the bundles to `PhiLogg-<sha>.<ext>`.

Each `build` job stamps `PHILOGG_VERSION` to the commit short-SHA and strips
`philogg.html`'s comments (`scripts/strip-comments.js`, see PROJECT.md → "Release
builds") before bundling — never committed back, just the checked-out copy the Tauri
bundler embeds as a resource a moment later.

On a Windows runner with `build_windows_portable` on, one extra step packages the
portable build after `npm run build`, from the same `cargo build --release` output the
NSIS installer step already produced: the raw, unbundled `philogg-desktop.exe` (needs no
install — WebView2 itself ships with Windows), the just-stamped/stripped `philogg.html`
copy sitting next to it, and an empty `philogg-portable` marker file (see "Persistent
data" above), all zipped as `PhiLogg-<sha>_portable.zip` and uploaded alongside the other
artifacts.

## Capabilities

`capabilities/default.json` grants `core:default` plus one explicit addition,
`core:window:allow-start-dragging` (see "Drag region" above — not part of `core:window`'s
own default set). A wrapper's own `#[tauri::command]`s need no ACL entry (only core and
plugin commands do), and every plugin in use (`single-instance`, `opener`, `dialog`) is
driven from Rust, never from the page — so the page's reachable surface is exactly the
commands in `commands.rs` plus that one core command.

## Known gaps

See `desktop/README.md` → "Known limitations" for the user-facing list
(`getPathForFile`, macOS font names, the single maximize glyph, platform-dependent
rounded corners) and "Status" for what has and hasn't been run live.
