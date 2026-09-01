# Desktop Wrapper — Tauri (experimental, parallel to Electron)

A second wrapper around the **unmodified** `philogg.html`, in `desktop-tauri/`, running alongside the Electron one in `desktop/` rather than replacing it. Same feature surface and the same visuals; the OS's own webview (WebView2 / WKWebView / WebKitGTK) plus a Rust backend instead of a bundled Chromium and a Node main process. `desktop-tauri/README.md` has the build/run steps, the prerequisites, and the current run status — this file covers the internal mechanism only. `docs/desktop.md` is the equivalent for the Electron wrapper, and every section below is written as a delta against it: where the two do the same thing, that is said and not re-explained.

Both install side by side on purpose — own bundle identifier (`com.kleinphilipp.philogg-tauri`), own product name (`PhiLogg Tauri`), own config directory — so a person can run one against the other on a real machine, which is the entire point of building it.

**The rule it inherits unchanged**: `philogg.html` is never edited. It is served through a custom `philogg://` scheme and handed a local file through its own `?url=` deep-link mechanism, and everything wrapper-specific is injected at runtime.

## Layout

`desktop-tauri/package.json` exists only to pull in the Tauri CLI. Everything else is `src-tauri/`: `tauri.conf.json` (bundle config, `.log` file association, `philogg.html` as a packaged resource), `Cargo.toml`, `capabilities/default.json`, the placeholder icon set under `icons/` (plus the dependency-free `icons/generate.js` that produced it — the Tauri bundler *requires* an icon set, unlike electron-builder, which is why `desktop/` can get away with having none), and `src/`:

| file | role |
|---|---|
| `main.rs` | builder wiring, `setup`, the macOS-only `RunEvent` arms |
| `protocol.rs` | the `philogg://` scheme (app page, splash page, local files) |
| `windows.rs` | main/splash window creation, close-to-tray, file routing |
| `tray.rs` | tray icon + menu |
| `settings.rs` | `settings.json` read/write and its directory |
| `commands.rs` | everything the injected script may call |
| `inject.rs` + `inject.js` | the injected script itself |
| `state.rs` | the `localFiles` map, quit/close flags, caches |
| `fonts.rs` | system font enumeration |

## The `philogg://` scheme, and why there is a `fetch` shim

Same job as Electron's `protocol.handle("philogg", …)`, and for the same reason: the scheme must not be `file:`, because `philogg.html`'s own `loadFromUrlParam()` guard refuses `?url=` fetches from a `file:` page. It serves three things — `app/philogg.html` (the packaged copy, or the working copy in a `tauri dev` run), `app/splash.html` (generated in Rust, see below), and `local/<id>/<basename>` (a local file, `id` mapped to a path chosen only from OS-supplied input: argv, or macOS's `Opened` event). It is registered as an *asynchronous* URI-scheme protocol, unlike Electron's, because a log served this way can be hundreds of megabytes and is re-read on every tail tick — the synchronous variant would block the webview's own thread for each read.

The one genuine difference: **Tauri does not give the webview a real custom scheme on every platform.** What it registers as `philogg` is served as `philogg://localhost/…` on macOS/Linux and as `http://philogg.localhost/…` on Windows. Neither is `philogg://local/…`, which is the exact shape `philogg.html`'s `isDesktopLocalUrl()` matches to decide a loaded URL is a *tail-able local file* (and, downstream, that "Open File Location" should route through `revealLocalUrl`). Changing that check in `philogg.html` was not an option, so the page is handed the canonical `philogg://local/<id>/<basename>` URL — keeping tail-follow, the filename derivation and the context menu all working unmodified — and `inject.js` wraps `window.fetch` to rewrite exactly that prefix to whatever the platform actually serves. The protocol handler accepts both shapes, so nothing depends on the rewrite having happened.

## One injected script instead of preload + `dom-ready`

Electron splits its injections in two: `preload.js` for what must exist before the page's own top-level script runs, and `insertCSS()`/`executeJavaScript()` on `dom-ready` for what needs the DOM. Tauri's `initialization_script` covers both — it runs before any page script *and* re-runs on every navigation — so `inject.js` is one file that does its DOM half behind `DOMContentLoaded` and survives a reload (which the tray's "Clear Cache" performs) with no re-injection hook on the Rust side at all. It is built by `inject.rs`, which substitutes four values into it: the settings snapshot, a per-process nonce, the platform's real scheme base, and whether this is macOS. The splash window deliberately gets no script (it ends by reporting "painted", which would dismiss the splash itself).

**Bridge.** `window.philogg` exposes the same four functions `desktop/preload.js` does, so `philogg.html`'s feature detection and its three context-menu outcomes behave identically. `getPathForFile` is the one that can't work: Electron resolves a `File` back to its OS path via `webUtils`, and no system webview offers an equivalent. Tauri's own drag-drop event does carry real paths, but enabling it suppresses the HTML drop events `philogg.html` needs to receive files at all — so the window is built with `disable_drag_drop_handler()`, dropping files keeps working, and this returns `null`. `philogg.html` already treats a null result as "no path known" and simply doesn't offer "Open File Location" for that node; a file-association open still gets it, through `revealLocalUrl`. Covered by test **Group 139**.

**Frameless window and window controls.** Off macOS the window is `decorations(false)` and the controls are *real DOM*: `inject.js` appends a three-button `#tauri-wc` block into `philogg.html`'s own `.toolbar-right`, styled purely from the page's existing theme variables (`--text-secondary`, `--bg-elevated-2`, `--accent`, `--level-error`). That is a different mechanism from Electron's native Window Controls Overlay, and it makes the whole `watchTheme()` polling loop unnecessary — the buttons *are* themed elements, so a theme or accent change repaints them with no main-process involvement and nothing to go stale. It also removes the need for `TITLEBAR_HEIGHT`'s 49px and the `titlebar-area-*` padding reservation: the buttons occupy real layout space in the toolbar, so nothing sits underneath them. On macOS the window keeps its decorations with `TitleBarStyle::Overlay` + `hidden_title(true)` (the `hiddenInset` equivalent) and only `.brand { padding-left: 72px }` is injected, leaving the traffic lights where a Mac user expects them — same call `desktop/main.js` makes.

**Drag region.** Electron gets this from `-webkit-app-region: drag` on `#toolbar`, which every child inherits. Tauri's `data-tauri-drag-region` only fires when the clicked element *itself* carries the attribute, so `inject.js` stamps it on `#toolbar` and every descendant that isn't inside a control (`button, input, select, textarea, a, label, .ctx-item, #tauri-wc`) — the `<svg>`/`<path>` inside an icon button is the real event target on a click, so skipping the whole control subtree is what keeps toolbar buttons clickable. A `MutationObserver` re-stamps as the toolbar's contents change (status text, controls enabling/disabling). Test **Group 140** is the tripwire for the selectors and the 50px height both wrappers' chrome is keyed off.

**F11.** A Tauri webview has no equivalent of Electron's main-process `before-input-event`, so the key is caught in the page (capture phase) and routed to a `toggle_fullscreen` command that flips the same native fullscreen state the maximize control uses — the equivalence Electron's version is also careful about.

## Settings: the read half gets simpler, the write half doesn't change

Same `FEATURE_BACKLOG.md` #33 mirroring, same `philogg-*` prefix, same human-editable `settings.json`. The **read** half must land before `philogg.html`'s own top-level script runs, which in Electron forces a preload script doing a synchronous IPC round-trip; here the values are already known on the Rust side at window-creation time, so `inject.rs` bakes them straight into the initialization script as a JSON literal — no IPC, no preload, nothing that can race the page. It hydrates once per *process*, not once per load: the baked values are a startup snapshot, so re-applying them after a later reload would revert anything changed since. A nonce that changes every process start, kept in `sessionStorage` (which survives reloads within one webview session), is what distinguishes the two.

The **write** half keeps Electron's shape — ~1x/second, diffed before crossing the process boundary — but runs in the page rather than as an `executeJavaScript()` poll from the outside, plus a best-effort flush on `beforeunload`/`pagehide`. The Rust side diffs again before touching disk.

`settings.json` lives in `<os-config-dir>/PhiLogg-Tauri/`, deliberately *not* the identifier-derived directory Tauri would pick by default and deliberately a sibling of, not the same as, the Electron wrapper's `PhiLogg/` — running both to compare them must not have one clobber the other's settings.

## Tray, splash, close-to-tray, single instance

All four mirror `desktop/main.js` closely enough that its own documentation applies:

- **Splash** (`FEATURE_BACKLOG.md` #51): a small always-on-top undecorated window on `philogg://app/splash.html`, generated as a string in `protocol.rs` so nothing extra needs packaging. Tauri has no `ready-to-show` event, so the injected script reports a first paint itself — two nested `requestAnimationFrame`s after `DOMContentLoaded`, deliberately not the event itself, which would just swap one blank window for another — and the `app_ready` command closes the splash and shows the main window (built `visible(false)`).
- **Tray**: always created, not lazily on the first hide, for the same reason as Electron — with no application menu anywhere it is the only reachable place for "Open Config Folder" and "Clear Cache". Same four items. The icon is the same teal dot, rasterized in Rust because Tauri's tray takes pixels rather than markup.
- **Close to tray** (`philogg-close-to-tray`, default on): `WindowEvent::CloseRequested` → `prevent_close()` + `hide()`. Unlike Electron, which has to `executeJavaScript()` the setting back out of the renderer at close time, the value is already mirrored into the Rust-side state by the settings poll (and seeded from `settings.json` at startup, so the very first close honours it too), so the decision is synchronous. `is_quitting` distinguishes a real quit exactly as it does there.
- **Single instance**: `tauri-plugin-single-instance`, whose callback registers the new file and calls `window.philoggLoadUrl(url)` in the running window — the same window-reuse fix `desktop/main.js` applies, so a second file-association double-click joins the existing tree instead of opening a second app window. Windows/Linux receive the path as argv; macOS delivers it through `RunEvent::Opened` instead, including on a cold launch.

## Fonts

Same feature as Electron's, without the `font-list` npm package: that package is itself a thin wrapper around the platform commands, so `fonts.rs` calls them directly rather than pulling a font crate (and, on Linux, its fontconfig/freetype build dependencies) in to re-derive a list of names. `fc-list` on Linux, PowerShell's `SystemFontFamilies` on Windows; macOS has neither out of the box, so names there are approximated from the font files in the three standard font directories — the one place this is less accurate than Electron. Any failure yields an empty list, so the curated list still works everywhere.

## Release

`.github/workflows/tauri-release.yml`, structurally a copy of `desktop-release.yml` (manual `workflow_dispatch`, three per-OS checkboxes turned into the build job's matrix by the same `jq` step — *not* a job-level `if:` on the `matrix` context, which GitHub rejects at parse time — a `prepare` job creating the tag `tauri-<short-sha>` up front, `fail-fast: false`, and the same 5-attempt upload retry). Deliberately a separate file rather than an extra matrix dimension inside the existing workflow: the Electron release path is the one that has to keep working. Linux builds on `ubuntu-22.04` rather than `-latest` because an AppImage links against its build machine's glibc, and the job installs the WebKitGTK/GTK/appindicator dev packages first. Tauri's bundler has no `artifactName` template, so the upload step renames the bundles to `PhiLogg-tauri-<sha>.<ext>` — distinguishable at a glance from the Electron installers in a release listing.

## Capabilities

`capabilities/default.json` grants `core:default` and nothing else. A wrapper's own `#[tauri::command]`s need no ACL entry (only core and plugin commands do), and both plugins in use (`single-instance`, `opener`) are driven from Rust, never from the page — so the page's reachable surface is exactly the nine commands in `commands.rs`.

## Known gaps

See `desktop-tauri/README.md` → "Differences from the Electron wrapper" for the user-facing list (`getPathForFile`, macOS font names, the single maximize glyph, platform-dependent rounded corners) and "Status" for what has and hasn't been run live.
