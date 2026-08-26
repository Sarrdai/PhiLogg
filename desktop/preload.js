// FEATURE_BACKLOG.md #52 ("Open File Location"): the only preload/IPC
// bridge this app has (see main.js's top comment on why the renderer
// otherwise gets no Node access at all). Two capabilities, both required
// because the sandboxed renderer genuinely cannot do either on its own:
//
//  - getPathForFile: resolves the real OS path behind a File object the
//    renderer already holds (from its own picker, drag-drop, or a folder
//    watch handle). The web File API deliberately doesn't expose this
//    (Electron dropped File.path for the same reason) — webUtils is the
//    documented, still-sandboxed-safe way to get it back, and it only ever
//    resolves a File the OS already handed to *this* window, same trust
//    level as the rest of the app.
//  - revealPath / revealLocalUrl: showing a path in the OS file manager
//    needs shell.showItemInFolder, which only exists in the main process —
//    revealLocalUrl covers a philogg://local/<id>/… url (launch-arg/
//    file-association opens, see main.js's localFiles map), revealPath
//    covers a plain OS path already resolved via getPathForFile above.
//  - listSystemFonts: lets the UI-font picker offer every font actually
//    installed on this machine (desktop only — see main.js's
//    listSystemFonts comment for why the plain HTML version can't).
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("philogg", {
  getPathForFile: file => {
    try { return webUtils.getPathForFile(file) || null; } catch { return null; }
  },
  revealPath: filePath => ipcRenderer.invoke("philogg:reveal-path", filePath),
  revealLocalUrl: url => ipcRenderer.invoke("philogg:reveal-local-url", url),
  listSystemFonts: () => ipcRenderer.invoke("philogg:list-system-fonts"),
});
