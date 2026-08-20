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

// Windows/Linux only: keeps the overlay buttons' colors following
// philogg.html's own light/dark toggle (#btnTheme, persisted to
// localStorage — independent of the OS theme, so nativeTheme can't be used
// instead). No preload/IPC bridge for this either — same reasoning as the
// top comment — so it's a light poll of the renderer's own `data-theme`
// attribute from the main process instead, cheap enough at ~1x/second for
// a value that only ever changes on an explicit click.
const OVERLAY_COLORS = {
  dark: { color: "#151924", symbolColor: "#8a92a8" }, // matches --bg-panel/--text-secondary (dark)
  light: { color: "#ffffff", symbolColor: "#5b6474" }, // matches --bg-panel/--text-secondary (light)
};

function watchTheme(win) {
  let lastTheme = null;
  const poll = async () => {
    if (win.isDestroyed()) return;
    let theme;
    try {
      theme = await win.webContents.executeJavaScript('document.documentElement.getAttribute("data-theme")');
    } catch {
      return; // window/page torn down mid-poll
    }
    if (theme === lastTheme) return;
    lastTheme = theme;
    win.setTitleBarOverlay({ ...OVERLAY_COLORS[theme === "light" ? "light" : "dark"], height: TITLEBAR_HEIGHT });
  };
  const interval = setInterval(poll, 800);
  win.on("closed", () => clearInterval(interval));
  poll();
}

// id -> absolute local path, served at philogg://local/<id>. Populated only
// from paths the OS itself handed us (argv / file-association / open-file),
// same trust level as a native app's own file-open dialog.
const localFiles = new Map();
let nextLocalId = 1;

function registerLocalFile(filePath) {
  const id = String(nextLocalId++);
  localFiles.set(id, filePath);
  return id;
}

function registerProtocol() {
  protocol.handle("philogg", async (request) => {
    const url = new URL(request.url);
    if (url.hostname === "app" && (url.pathname === "/" || url.pathname === "/philogg.html")) {
      const buf = await fs.promises.readFile(PHILOGG_HTML_PATH);
      return new Response(buf, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.hostname === "local") {
      const filePath = localFiles.get(url.pathname.replace(/^\//, ""));
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

function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#151924", // matches #toolbar/#bg-panel's dark-theme default, avoids a white flash while loading
    ...(isMac
      ? { titleBarStyle: "hiddenInset" }
      : { titleBarStyle: "hidden", titleBarOverlay: { ...OVERLAY_COLORS.dark, height: TITLEBAR_HEIGHT } }),
    webPreferences: { sandbox: true },
  });
  win.webContents.on("dom-ready", () => {
    win.webContents.insertCSS(FRAMELESS_CSS);
    if (!isMac) watchTheme(win);
  });
  if (filePath) {
    const id = registerLocalFile(filePath);
    win.loadURL(`philogg://app/philogg.html?url=${encodeURIComponent(`philogg://local/${id}`)}`);
  } else {
    win.loadURL("philogg://app/philogg.html");
  }
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
  // arrives here instead of as a new process.
  app.on("second-instance", (_event, argv) => createWindow(fileArgFromArgv(argv)));

  let pendingOpenFile = null;
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) createWindow(filePath);
    else pendingOpenFile = filePath; // fired before "ready" on a cold launch
  });

  app.whenReady().then(() => {
    registerProtocol();
    createWindow(pendingOpenFile || fileArgFromArgv(process.argv));
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
