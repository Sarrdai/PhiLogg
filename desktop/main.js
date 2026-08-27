// PhiLogg desktop wrapper — loads the unmodified philogg.html and reuses its
// ?url= deep-link mechanism (see PROJECT.md "Deep-link loading (?url=)") to
// hand it a local file, instead of a second, wrapper-only content-injection
// path. The renderer never gets Node access (sandboxed, no preload needed)
// — it just fetch()es philogg://local/<id> exactly like it would fetch a
// remote http(s) log URL.
//
// A custom "philogg" scheme stands in for http(s): it must NOT be "file:",
// since philogg.html's own loadFromUrlParam() guard rejects ?url= fetches
// from a file: page (matching the real browser restriction that guard
// exists for) — using a privileged custom scheme instead sidesteps that
// without weakening the guard itself.
const { app, BrowserWindow, protocol, Menu, Tray, nativeImage, shell, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

// FEATURE_BACKLOG.md #33: without this, app.getPath("userData") (and thus
// every path derived from it below) resolves against package.json's own
// "name" ("philogg-desktop") in a dev checkout, but against
// electron-builder.yml's "productName" ("PhiLogg") once packaged — two
// different config directories for the same app depending on how it's run.
// Setting the name explicitly, before anything (requestSingleInstanceLock
// included) touches userData, makes both cases resolve to the same
// well-known directory (e.g. `~/.config/PhiLogg` on Linux).
app.setName("PhiLogg");

// FEATURE_BACKLOG.md #52 ("Open File Location") is the one feature that
// needs the renderer to reach into Node/Electron APIs it otherwise never
// gets (see the "no preload needed" note above) — resolving a File's real
// OS path (webUtils) and revealing it in the file manager (shell) are both
// main-process-only. preload.js is the sole, narrow bridge for that; the
// renderer still gets no other Node access.
const PRELOAD_PATH = path.join(__dirname, "preload.js");

protocol.registerSchemesAsPrivileged([
  { scheme: "philogg", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// No File/Edit/View/Window/Help bar — this is a frameless window (see
// createWindow below), that default menu has no OS chrome to live in
// anyway, and Alt would otherwise still summon it.
Menu.setApplicationMenu(null);

const PHILOGG_HTML_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "philogg.html")
  : path.join(__dirname, "..", "philogg.html");

const isMac = process.platform === "darwin";

// One pixel shorter than #toolbar's own 50px height: the Window Controls
// Overlay buttons are a native layer painted over the full reserved strip,
// so at exactly 50px they occlude the bottom-most row of #toolbar's own
// `border-bottom` (the line separating the header from the content below)
// wherever the buttons sit. At 49px that row falls just outside the
// reserved strip and is painted by the page as normal.
const TITLEBAR_HEIGHT = 49;

// #toolbar (philogg.html's own header) is what a user actually grabs to
// move the window now that there's no native title bar — but marking it
// `-webkit-app-region: drag` also swallows clicks on everything inside it,
// so every interactive child gets `no-drag` back. Injected at runtime via
// webContents.insertCSS() instead of editing philogg.html itself, matching
// this wrapper's "unmodified philogg.html" rule (see PROJECT.md "Desktop
// wrapper").
//
// Windows/Linux additionally reserve real estate on the right so the
// header's own rightmost button (#btnLicense) doesn't sit under the native
// Window Controls Overlay buttons electron-builder draws there (see
// titleBarOverlay below) — via the `titlebar-area-*` CSS environment
// variables Chromium exposes specifically for this, rather than measuring
// `navigator.windowControlsOverlay`'s rect in JS: an earlier version did
// that with a `geometrychange` listener, but it only fired reliably on
// live resizes, leaving stale padding across maximize/restore/fullscreen
// transitions (reported after the first real Windows run — see changelog).
// `env()` is a native, continuously-live CSS value with no JS/event timing
// involved, so it can't go stale the same way. macOS traffic lights sit
// top-left instead (native inset position, not moved to match "top-right"
// — flipping a Mac app's own window controls to the right would be the
// actually-jarring choice for a Mac user), so `.brand` gets a static left
// inset instead.
const FRAMELESS_CSS = `
  #toolbar { -webkit-app-region: drag; }
  #toolbar button, #toolbar input, #toolbar .ctx-item { -webkit-app-region: no-drag; }
  ${isMac
    ? `.brand { padding-left: 72px; }`
    : `.toolbar-right { padding-right: calc(100vw - env(titlebar-area-width, 100vw) - env(titlebar-area-x, 0px)); }`}
`;

// Windows/Linux only: keeps the overlay buttons' background transparent and
// their symbol color following philogg.html's own active theme/accent
// (#btnTheme + the per-flavor accent picker, both persisted to localStorage
// — independent of the OS theme, so nativeTheme can't be used instead). An
// earlier version hardcoded two fixed {color, symbolColor} pairs keyed off
// "is data-theme light or not" — which only ever matched the Dark/Light
// built-ins; every Catppuccin flavor (each with its own --bg-panel) and any
// custom imported theme got the wrong overlay background (FEATURE_BACKLOG
// item, "wrong background color"). A transparent background sidesteps
// hardcoding per-theme colors entirely: `#RRGGBBAA` with alpha `00` is
// Electron's documented way to make the overlay show whatever `#toolbar`
// itself paints underneath, for any theme, built-in or custom, with no
// polling of --bg-panel needed. The symbol color still needs a live value,
// since the theme's --accent can change without `data-theme` changing at
// all (the accent picker re-picks it per-theme) — so the poll below reads
// the renderer's own computed `--accent`, not just the theme id. No
// preload/IPC bridge for this either — same reasoning as the top comment —
// so it's a light poll from the main process instead, cheap enough at
// ~1x/second for a value that only ever changes on an explicit click.
const OVERLAY_TRANSPARENT = "#00000000";
const OVERLAY_ACCENT_DEFAULT = "#4fc7c3"; // matches :root's default (dark theme) --accent, used only until the first poll resolves

function watchTheme(win) {
  let lastAccent = null;
  const poll = async () => {
    if (win.isDestroyed()) return;
    let accent;
    try {
      accent = await win.webContents.executeJavaScript(
        'getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()'
      );
    } catch {
      return; // window/page torn down mid-poll
    }
    if (!accent || accent === lastAccent) return;
    lastAccent = accent;
    win.setTitleBarOverlay({ color: OVERLAY_TRANSPARENT, symbolColor: accent, height: TITLEBAR_HEIGHT });
  };
  const interval = setInterval(poll, 800);
  win.on("closed", () => clearInterval(interval));
  poll();
}

// id -> absolute local path, served at philogg://local/<id>/<basename>. The
// basename is only along for the ride so philogg.html's own loadUrlIntoTree
// (which names the loaded file after the URL's last path segment, same as
// any other ?url= deep link) shows the real file name instead of the bare
// id — the lookup below still keys off the id alone. Populated only from
// paths the OS itself handed us (argv / file-association / open-file), same
// trust level as a native app's own file-open dialog.
const localFiles = new Map();
let nextLocalId = 1;

function registerLocalFile(filePath) {
  const id = String(nextLocalId++);
  localFiles.set(id, filePath);
  return id;
}

function localFileUrl(filePath) {
  const id = registerLocalFile(filePath);
  return `philogg://local/${id}/${encodeURIComponent(path.basename(filePath))}`;
}

// FEATURE_BACKLOG.md #52 ("Open File Location"): the two handlers behind
// preload.js's revealPath/revealLocalUrl. Both end up calling the same
// shell.showItemInFolder — revealLocalUrl exists only because the renderer
// knows a philogg://local/<id>/… file solely by that url (never a raw
// path, see localFileUrl above), so it needs this process to do the
// id -> path lookup via the same localFiles map registerProtocol reads.
// FEATURE_BACKLOG.md #33: mirror philogg.html's `philogg-*` localStorage
// settings into a plain, human-editable settings.json in the same
// well-known config directory the IndexedDB cache lives in (see
// app.setName() above) — so both can be inspected/edited/deleted outside
// the app, without touching philogg.html's own storage mechanism at all.
// Only keys prefixed "philogg-" are ever written here (that prefix covers
// every settings key philogg.html defines, see PROJECT.md "Desktop
// wrapper" — the cache's own IndexedDB keys use different names and stay
// out of this file entirely).
const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

function readSettingsFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; // missing file (first run) or corrupt/hand-edited JSON — start clean rather than crash
  }
}

function writeSettingsFile(values) {
  fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(values, null, 2)).catch(() => {});
}

// Preload's synchronous read happens before philogg.html's own script runs
// (see preload.js) — early enough for the many `philogg-*` keys it reads
// once, synchronously, at top-level script parse. That's earlier than any
// `dom-ready`/`did-finish-load` hook here in the main process could manage,
// which is why hydration lives in preload.js instead of here.
function registerSettingsHandlers() {
  ipcMain.on("philogg:settings-read", (event) => {
    event.returnValue = readSettingsFile();
  });
}

// Capturing every settings *write* the same way (from preload, before
// philogg.html's script runs) isn't needed — writes only ever happen later,
// in response to a user action, well after the page has loaded — so this
// reuses the same polling pattern watchTheme()/watchCloseToTray() already
// rely on instead of adding a second IPC channel: cheap at ~1x/second for
// values that only change on explicit user interaction.
let lastSettingsDump = null;

function watchSettings(win) {
  const poll = async () => {
    if (win.isDestroyed()) return;
    let dump;
    try {
      dump = await win.webContents.executeJavaScript(
        'Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith("philogg-")).map(k => [k, localStorage.getItem(k)]))'
      );
    } catch {
      return; // window/page torn down mid-poll
    }
    const json = JSON.stringify(dump);
    if (json === lastSettingsDump) return;
    lastSettingsDump = json;
    writeSettingsFile(dump);
  };
  const interval = setInterval(poll, 1000);
  win.on("closed", () => clearInterval(interval));
  win.on("close", () => { poll(); }); // best-effort final flush so the last change before quitting isn't lost
  poll();
}

// FEATURE_BACKLOG.md #33's cache half: IndexedDB already lives under
// app.getPath("userData") automatically (Chromium's own default, see
// app.setName() above) — no relocation code needed. "Deletable" just needs
// a reachable action, since the LevelDB files themselves aren't meant to be
// hand-edited; the tray menu (always present, see createTray) is that
// action, next to the same well-known folder for the JSON settings file.
async function clearCache(win) {
  await win.webContents.session.clearStorageData({ storages: ["indexdb"] });
  if (!win.isDestroyed()) win.webContents.reload();
}

function registerRevealHandlers() {
  ipcMain.handle("philogg:reveal-path", (_event, filePath) => {
    if (typeof filePath === "string" && filePath) shell.showItemInFolder(filePath);
  });
  ipcMain.handle("philogg:reveal-local-url", (_event, url) => {
    if (typeof url !== "string") return;
    let id;
    try { id = new URL(url).pathname.split("/").filter(Boolean)[0]; } catch { return; }
    const filePath = localFiles.get(id);
    if (filePath) shell.showItemInFolder(filePath);
  });
}

// FEATURE_BACKLOG.md (font selection): philogg.html's own UI-font picker is
// stuck with a curated system-stack list because a plain static HTML file
// has no permission-prompt UI to gate the browser's Local Font Access API.
// The desktop wrapper has no such restriction — it's a Node process, so it
// can shell out to the OS's own font enumeration (fc-list/PowerShell/
// system_profiler via the `font-list` package) with no permission dialog
// needed. Renderer calls this once via preload.js; a failure (missing
// binary, sandboxed OS, etc.) just means no extra options show up — the
// curated list still works everywhere.
let cachedSystemFonts = null;
async function listSystemFonts() {
  if (cachedSystemFonts) return cachedSystemFonts;
  try {
    const fontList = require("font-list");
    const names = await fontList.getFonts({ disableQuoting: true });
    cachedSystemFonts = Array.isArray(names) ? names.filter(Boolean).sort() : [];
  } catch {
    cachedSystemFonts = [];
  }
  return cachedSystemFonts;
}

function registerFontHandlers() {
  ipcMain.handle("philogg:list-system-fonts", () => listSystemFonts());
}

function registerProtocol() {
  protocol.handle("philogg", async (request) => {
    const url = new URL(request.url);
    if (url.hostname === "app" && (url.pathname === "/" || url.pathname === "/philogg.html")) {
      const buf = await fs.promises.readFile(PHILOGG_HTML_PATH);
      return new Response(buf, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.hostname === "local") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      const filePath = localFiles.get(id);
      if (!filePath) return new Response("Not found", { status: 404 });
      try {
        const buf = await fs.promises.readFile(filePath);
        return new Response(buf, { headers: { "content-type": "text/plain; charset=utf-8" } });
      } catch (err) {
        return new Response(String(err), { status: 404 });
      }
    }
    return new Response("Not found", { status: 404 });
  });
}

// FEATURE_BACKLOG.md item 34 ("rounded corners for the Electron window,
// except when fullscreen"). `roundedCorners` is Electron's own opt-in for
// this on a frameless/hidden-title-bar BrowserWindow (default `true` — kept
// explicit here rather than relying on the default, so the intent is
// visible in one place): rounds on macOS unconditionally, on Windows 11
// Build 22000+ via DWM (no effect on older Windows, which just stays
// square), and on Linux only where the desktop environment draws its own
// client-side decorations (compositor-dependent, outside this app's
// control either way). The "except when fullscreen" half needs no code at
// all on macOS/Windows: a window that exactly fills the screen (maximized,
// or `setFullScreen(true)` below) is squared off automatically by the OS
// compositor — there's no floating edge left to round. Not verified live
// (no display server in this environment, same standing limitation as the
// rest of `desktop/`) — behavior confirmed against Electron's own
// BrowserWindow option docs, not guessed.
const ROUNDED_CORNERS = true;

// FEATURE_BACKLOG.md item 31 ("F11 toggles fullscreen, no window
// decorations"). There's no application menu (`Menu.setApplicationMenu(null)`
// above) to hang a menu-accelerator on, so F11 is caught directly via
// `before-input-event` — the per-window, focus-scoped equivalent — instead
// of `globalShortcut` (which would fire even while the app isn't focused,
// not what's wanted here). "No window decorations" falls out for free: the
// window is already frameless (see "Frameless window" in
// desktop/README.md), and `setFullScreen()` doesn't add a native frame back.
//
// F11 simply toggles the same native `win.setFullScreen()` state the OS
// window controls use (the maximize/restore button in the Window Controls
// Overlay on Windows/Linux, the green traffic-light button on macOS) —
// no separate bounds-juggling implementation. That equivalence is the
// point: both triggers flip the identical underlying state, so either one
// can exit what the other entered. Previously (FEATURE_BACKLOG.md item 36)
// Windows/Linux used a custom bounds-resize hack instead, specifically to
// keep the Window Controls Overlay buttons visible — Chromium only paints
// them inside a "titlebar area", which doesn't exist in genuine OS
// fullscreen, so real fullscreen made them vanish there. That trade-off
// was reversed on purpose: matching the native window control's behavior
// takes priority over keeping the overlay buttons visible while
// fullscreen.
function watchFullscreenToggle(win) {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
}

// FEATURE_BACKLOG.md item 51 ("Improve Electron startup time perception"),
// splash half. Loading philogg://app/philogg.html (which itself reads/
// renders a potentially-large restored session on "dom-ready") can take
// several seconds with nothing on screen in the meantime — a small always-
// on-top, undecorated window shown immediately covers that gap. It's a
// self-contained data: URL (a few lines of inline HTML/CSS), not a file on
// disk, so there's nothing new to package/ship. Closed the moment the main
// window fires "ready-to-show" (i.e. has actually painted its first frame),
// not on "dom-ready" — that would just swap one blank window for another.
const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; background: #151924; color: #cfd8e3;
    font: 13px -apple-system, "Segoe UI", sans-serif; display: flex;
    flex-direction: column; align-items: center; justify-content: center;
    gap: 14px; -webkit-user-select: none; user-select: none; }
  .spinner { width: 28px; height: 28px; border-radius: 50%;
    border: 3px solid rgba(79, 199, 195, 0.25); border-top-color: #4fc7c3;
    animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head><body><div class="spinner"></div><div>Loading PhiLogg…</div></body></html>`;

function createSplash() {
  const splash = new BrowserWindow({
    width: 320,
    height: 180,
    frame: false,
    resizable: false,
    movable: false,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#151924",
    webPreferences: { sandbox: true },
  });
  splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(SPLASH_HTML));
  return splash;
}

// FEATURE_BACKLOG.md item 51, "Close to system tray" half. The setting
// itself lives in philogg.html's own localStorage (settingsCloseToTray,
// default on) — same "no preload/IPC bridge" reasoning as every other
// desktop-only toggle there (see philogg.html's own comment on
// CLOSE_TO_TRAY_KEY): main.js just reads it back via executeJavaScript
// when it actually needs the answer, on the BrowserWindow's own "close".
// `isQuitting` distinguishes that hide-to-tray path from a real quit
// (tray menu's Quit, Cmd+Q, OS shutdown, ...) — those all fire
// "before-quit" first, which is set here rather than left for each quit
// path to remember individually.
const CLOSE_TO_TRAY_KEY = "philogg-close-to-tray";
let isQuitting = false;
let tray = null;

app.on("before-quit", () => { isQuitting = true; });

function watchCloseToTray(win) {
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(CLOSE_TO_TRAY_KEY)})`)
      .then((stored) => (stored === null ? true : stored === "1"))
      .catch(() => true) // renderer unreachable — fail toward the default (on), not a stuck-open window
      .then((closeToTray) => {
        if (closeToTray) {
          createTray(win);
          win.hide();
        } else {
          isQuitting = true;
          win.close();
        }
      });
  });
}

// A minimal 16x16 dot as the tray icon — see desktop/README.md "Adding an
// app icon" for why no real artwork/build/icons exist yet; this is an
// inline data URL rather than a new binary asset file for the same reason
// (kept out of electron-builder's icon pipeline entirely, so it can't
// trip the Linux "empty icons dir" failure that section documents).
const TRAY_ICON_DATA_URL =
  "data:image/svg+xml;base64," + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
    '<circle cx="8" cy="8" r="7" fill="#4fc7c3"/></svg>'
  ).toString("base64");

function createTray(win) {
  if (tray) return;
  tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON_DATA_URL));
  tray.setToolTip("PhiLogg");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open PhiLogg", click: () => { win.show(); focusWindow(win); } },
    { type: "separator" },
    // FEATURE_BACKLOG.md #33: the well-known config directory (settings.json
    // + the IndexedDB cache) has no dedicated UI otherwise — there's no
    // application menu to hang these on (Menu.setApplicationMenu(null)
    // above), so the always-present tray (see createWindow) is the one
    // reachable place for both.
    { label: "Open Config Folder", click: () => { shell.openPath(app.getPath("userData")); } },
    { label: "Clear Cache", click: () => clearCache(win) },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", () => { win.show(); focusWindow(win); });
}

function createWindow(filePath) {
  const splash = createSplash();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false, // shown once ready-to-show fires, once the splash above can be dismissed in its place
    backgroundColor: "#151924", // matches #toolbar/#bg-panel's dark-theme default, avoids a white flash while loading
    roundedCorners: ROUNDED_CORNERS,
    ...(isMac
      ? { titleBarStyle: "hiddenInset" }
      : { titleBarStyle: "hidden", titleBarOverlay: { color: OVERLAY_TRANSPARENT, symbolColor: OVERLAY_ACCENT_DEFAULT, height: TITLEBAR_HEIGHT } }),
    webPreferences: { sandbox: true, preload: PRELOAD_PATH },
  });
  win.once("ready-to-show", () => {
    if (!splash.isDestroyed()) splash.destroy();
    win.show();
  });
  win.webContents.on("dom-ready", () => {
    win.webContents.insertCSS(FRAMELESS_CSS);
    if (!isMac) watchTheme(win);
    watchSettings(win);
  });
  watchFullscreenToggle(win);
  watchCloseToTray(win);
  // Always present now (FEATURE_BACKLOG.md #33), not just once "close to
  // tray" hides the window for the first time — it's the one reachable
  // place for "Open Config Folder"/"Clear Cache" (see createTray).
  createTray(win);
  if (filePath) {
    win.loadURL(`philogg://app/philogg.html?url=${encodeURIComponent(localFileUrl(filePath))}`);
  } else {
    win.loadURL("philogg://app/philogg.html");
  }
}

function focusWindow(win) {
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

// Routes a file open (second file-association launch, or a later macOS
// open-file) into the already-running window instead of spawning another
// one — only the very first file of a run should ever create a window.
// Falls back to createWindow if, somehow, no window is open yet (e.g.
// called before the first one finished initializing).
function openFile(filePath) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    createWindow(filePath);
    return;
  }
  if (filePath) {
    win.webContents.executeJavaScript(`window.philoggLoadUrl(${JSON.stringify(localFileUrl(filePath))})`).catch(() => {});
  }
  focusWindow(win);
}

// Windows/Linux: a ".log" file association relaunches the app with the path
// as a plain argv entry. macOS never does this — it fires "open-file"
// instead (below), even for the very first launch.
function fileArgFromArgv(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).find((a) => a.toLowerCase().endsWith(".log"));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // A second file-association launch while the app is already running
  // arrives here instead of as a new process (that's the whole point of
  // requestSingleInstanceLock above) — route its file into the existing
  // window rather than opening another one.
  app.on("second-instance", (_event, argv) => openFile(fileArgFromArgv(argv)));

  let pendingOpenFile = null;
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) openFile(filePath);
    else pendingOpenFile = filePath; // fired before "ready" on a cold launch
  });

  app.whenReady().then(() => {
    registerProtocol();
    registerRevealHandlers();
    registerSettingsHandlers();
    registerFontHandlers();
    createWindow(pendingOpenFile || fileArgFromArgv(process.argv));
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
