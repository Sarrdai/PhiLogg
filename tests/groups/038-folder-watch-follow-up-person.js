// GROUP 38 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 38 — Folder watch follow-up (person-reported, this session):
   unified "Open…" menu, browser-capability gate + popup notice, and
   session-cache persistence of watched folders.
   ============================================================ */
group(38);

// --- 38a: single "Open…" button + dropdown menu replaces the two
// separate "Open files…"/"Open folder…" buttons. ---
await withApp(async (w, d, T) => {
  section("38a. Unified \"Open…\" menu");
  const btnOpen = d.querySelector("#btnOpen");
  const openMenu = d.querySelector("#openMenu");
  assert(d.querySelector("#btnOpenFolder") === null, "the old separate \"Open folder…\" button is gone");
  assert(openMenu.classList.contains("hidden"), "the dropdown starts hidden");

  fireClick(btnOpen, w);
  assert(!openMenu.classList.contains("hidden"), "clicking \"Open…\" reveals the dropdown");
  const actions = [...openMenu.querySelectorAll("[data-action]")].map(i => i.dataset.action);
  assert(actions.includes("files") && actions.includes("folder"), "menu offers both File(s)… and Folder… entries, got " + actions.join(","));

  // Clicking outside closes it — same document-level pattern as every
  // other popup/menu in the app (contextMenu, shortcutsPanel, ...).
  fireClick(d.body, w);
  assert(openMenu.classList.contains("hidden"), "clicking outside the menu closes it");

  // "File(s)…" still falls back to the hidden <input> when
  // showOpenFilePicker is unavailable (jsdom, same as before this menu
  // existed) — the menu item is just a new front door to the same path.
  fireClick(btnOpen, w);
  const fileInput = d.querySelector("#fileInput");
  let clicked = false;
  fileInput.click = () => { clicked = true; };
  fireClick(d.querySelector('#openMenu [data-action="files"]'), w);
  assert(clicked, "\"File(s)…\" falls back to the hidden file <input>, same as the old \"Open files…\" button");
  assert(openMenu.classList.contains("hidden"), "the menu closes itself after an item is picked");
});

// --- 38b: FOLDER_WATCH_SUPPORTED gates both entry points (menu + drag&drop)
// behind a popup notice instead of silently offering a lesser/broken
// experience — jsdom has no showDirectoryPicker at all, so this exercises
// the exact "unsupported browser" path a real Firefox/Zen user hits. ---
await withApp(async (w, d, T) => {
  section("38b. Folder watch capability gate + popup notice");
  assert(typeof w.showDirectoryPicker === "undefined", "fixture sanity: jsdom has no showDirectoryPicker (same documented gap as showOpenFilePicker)");

  fireClick(d.querySelector("#btnOpen"), w);
  fireClick(d.querySelector('#openMenu [data-action="folder"]'), w);
  assert(d.querySelector("#copyToast").textContent.includes("Chromium-based browser"), "the \"Folder…\" menu entry shows a popup notice instead of doing nothing");
  assert(T.state.folders.length === 0, "no folder was registered");

  // A dropped FOLDER is detected via the much more broadly supported
  // webkitGetAsEntry() (Firefox/Zen included) purely to explain why it
  // didn't load, instead of silently mis-reading it as an empty file list.
  const dirDropDt = { files: [], items: [{ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true }) }] };
  fireDrag(w, w, "drop", dirDropDt);
  assert(d.querySelector("#copyToast").textContent.includes("Chromium-based browser"), "a dropped folder also shows the popup notice, same message");
  assert(T.state.folders.length === 0, "still no folder registered from the drop");

  // Plain file drops are completely unaffected by any of this.
  const fileDropDt = { files: [new w.File([makeLog(0, 3)], "dropped.log", { type: "text/plain" })], items: [] };
  fireDrag(w, w, "drop", fileDropDt);
  await waitFor(() => T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].entries.length > 0);
  assert(T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].name === "dropped.log",
    "a plain (non-folder) file drop still loads normally");
});

// --- 38c: watched folders survive a reload (session cache), including
// re-linking an already-open file back to its folder in the right spot,
// and the permission-reconnect flow for when the browser doesn't silently
// re-grant read access. ---
{
  section("38c. Session persistence: watched folders survive a reload");
  const factory = new IDBFactory();

  function fakeFileHandle(w, name, text) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  // A REAL FileSystemDirectoryHandle is specced to survive IndexedDB's
  // structured clone with all its methods intact — that's the actual
  // mechanism persistFolder/restoreWatchedFolders rely on in a real
  // browser. fake-indexeddb (this suite's only option — see
  // tests/README.md) enforces structured clone strictly: a plain object
  // with OWN function properties fails with DataCloneError outright, but a
  // class instance's prototype methods are simply dropped (own DATA fields
  // clone through fine, same as any plain object) rather than erroring —
  // so this fixture uses a class, with the "live" bits (the fake
  // filesystem + the owning window, for its Blob constructor) kept in a
  // WeakMap instead of as instance fields, so they never become part of
  // what gets cloned. The round-tripped copy in "window B" below ends up
  // exactly like a real handle whose permission needs reconfirming, not
  // like one that kept working — see the assertions there.
  const fakeDirState = new WeakMap();
  class FakeDirHandle {
    constructor(w, name, fileMap) {
      this.kind = "directory";
      this.name = name;
      fakeDirState.set(this, { w, fileMap });
    }
    async *values() {
      const { w, fileMap } = fakeDirState.get(this);
      for (const fname of Object.keys(fileMap)) yield fakeFileHandle(w, fname, fileMap[fname]);
    }
    async queryPermission() { return "granted"; }
    async requestPermission() { return "granted"; }
  }

  let folderId = null;

  // --- Window A: watch a folder, open one file from it, persist. ---
  await withApp(async (w, d, T) => {
    const dir = new FakeDirHandle(w, "watched", { "a.log": makeLog(0, 4), "b.log": makeLog(50, 2) });
    await w.addWatchedFolder(dir);
    const folder = T.state.folders[0];
    folderId = folder.id;
    const rec = folder.files.find(f => f.name === "a.log");
    await w.loadFolderFile(folder, rec);
    const node = T.state.nodes[rec.nodeId];
    assert(node.folderId === folderId, "the loaded node is tagged with its folder's id before persisting");

    // loadFolderFile's own persistFileNode call is fire-and-forget; calling
    // it again directly (idempotent — same cacheKey) and awaiting it here
    // is how the test knows the write with the correct folderId has landed.
    await w.persistFileNode(node);
    await w.persistMetaNow();

    const fileRec = await w.cacheStoreOp("files", "readonly", s => s.get(node.cacheKey));
    assert(fileRec && fileRec.folderId === folderId, "the persisted file record carries folderId");
    const folderRec = await w.cacheStoreOp("folders", "readonly", s => s.get(folderId));
    assert(folderRec && folderRec.name === "watched", "the folder itself was persisted to its own IndexedDB store");
  }, { indexedDB: factory });

  // --- Window B: boot-time restore (same factory = same "disk"). ---
  await withApp(async (w, d, T) => {
    await T.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    assert(T.state.rootIds.length === 1, "the previously-open file came back via the normal session restore");
    const node = T.state.nodes[T.state.rootIds[0]];
    assert(node.name === "a.log" && node.folderId === folderId, "restored node's folderId round-tripped through real IndexedDB");

    assert(T.state.folders.length === 1, "the watched folder itself came back too");
    const folder = T.state.folders[0];
    assert(folder.id === folderId, "restored folder keeps its original id (the same value the file's folderId points at)");
    assert(folder.name === "watched", "restored folder's name round-tripped");

    // See the FakeDirHandle comment above: this fixture's handle genuinely
    // can't keep working methods through fake-indexeddb's structured
    // clone, which means queryPermission() really does fail here — that's
    // the SAME degraded state a real browser puts a restored folder in
    // whenever it doesn't silently re-grant the permission (e.g. after an
    // actual browser restart, not just a tab reload), so it's asserted on
    // directly as the expected outcome, not worked around.
    assert(folder.needsPermission === true, "a folder whose handle can't be silently reused needs Reconnect, degrading gracefully instead of erroring");

    w.render();
    const folderBox = d.querySelector(".folder-watch");
    assert(folderBox !== null, "the folder section still renders even before reconnecting");
    assert(folderBox.querySelector(".folder-watch-reconnect") !== null, "a Reconnect button is shown");
    assert([...folderBox.querySelectorAll(".tree-row .tree-label")].some(l => l.textContent === "a.log"),
      "the already-open file still renders as a real row inside the folder section pre-reconnect, in its right place");

    // Reconnect logic itself: requestPermission() needs a real user
    // gesture (reconnectFolder is the Reconnect button's own click
    // handler, called directly here — same function, same as clicking it).
    // A fresh, fully-working fixture handle stands in for "the browser
    // re-granted permission" — the one part of this flow a REAL IndexedDB
    // round trip can't exercise in jsdom (see the class comment above), so
    // it's tested at the function level, consistent with this suite's
    // documented File System Access API gap (tests/README.md).
    folder.handle = new FakeDirHandle(w, "watched", { "a.log": makeLog(0, 4), "b.log": makeLog(50, 2) });
    await w.reconnectFolder(folder);
    assert(folder.needsPermission === false, "reconnectFolder clears needsPermission once a working handle is available");
    assert(folder.files.length === 2, "reconnecting rescans and finds both files, got " + folder.files.length);
    const aRec = folder.files.find(f => f.name === "a.log");
    assert(aRec.nodeId === node.id, "the already-open file's nodeId is preserved across reconnect — not treated as a newly discovered file");
    assert(node.tail && node.tail.handle, "reconnecting reattaches a live tail handle to the already-open (previously handle-less, restored) node");
    const bRec = folder.files.find(f => f.name === "b.log");
    assert(bRec.nodeId === null, "the not-yet-opened file (b.log) is listed grayed, same as any fresh scan");
  }, { indexedDB: factory });
}
