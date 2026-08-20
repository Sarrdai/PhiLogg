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
const { app, BrowserWindow, protocol } = require("electron");
const fs = require("fs");
const path = require("path");

protocol.registerSchemesAsPrivileged([
  { scheme: "philogg", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const PHILOGG_HTML_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "philogg.html")
  : path.join(__dirname, "..", "philogg.html");

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
  const win = new BrowserWindow({ width: 1400, height: 900, webPreferences: { sandbox: true } });
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
