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
const { app, BrowserWindow, protocol, Menu } = require("electron");
const fs = require("fs");
const path = require("path");

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
function watchFullscreenToggle(win) {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
}

function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#151924", // matches #toolbar/#bg-panel's dark-theme default, avoids a white flash while loading
    roundedCorners: ROUNDED_CORNERS,
    ...(isMac
      ? { titleBarStyle: "hiddenInset" }
      : { titleBarStyle: "hidden", titleBarOverlay: { color: OVERLAY_TRANSPARENT, symbolColor: OVERLAY_ACCENT_DEFAULT, height: TITLEBAR_HEIGHT } }),
    webPreferences: { sandbox: true },
  });
  win.webContents.on("dom-ready", () => {
    win.webContents.insertCSS(FRAMELESS_CSS);
    if (!isMac) watchTheme(win);
  });
  watchFullscreenToggle(win);
  if (filePath) {
    win.loadURL(`philogg://app/philogg.html?url=${encodeURIComponent(localFileUrl(filePath))}`);
  } else {
    win.loadURL("philogg://app/philogg.html");
  }
}

function focusWindow(win) {
  if (win.isMinimized()) win.restore();
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
    createWindow(pendingOpenFile || fileArgFromArgv(process.argv));
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
