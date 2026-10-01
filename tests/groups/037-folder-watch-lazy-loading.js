// GROUP 37 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 37 — Folder watch + lazy loading
   Origin: this session (FEATURE_BACKLOG.md "Folder watch + lazy loading"),
   UPDATED the same session after person feedback (see Group 38 below for
   what else that feedback added): active and inactive files now render
   TOGETHER, in folder order, inside one .folder-watch-files list — an
   opened file is a real .tree-row (via renderNode), an unopened one is a
   grayed .folder-watch-file row — instead of active files moving out to a
   separate place below. This group's assertions were rewritten in place
   for the new merged layout rather than left testing the old split one
   (see tests/README.md's "Extending this suite" convention).

   A watched folder (addWatchedFolder, given a FileSystemDirectoryHandle —
   faked at the handle level here, same approach as Group 12's tailing
   fixture, since jsdom has no File System Access API) lists its compatible
   (*.log) files grayed-out, WITHOUT reading them, above #tree
   (renderFolderWatchList/renderFolderSection/renderInactiveFileRow).
   Double-click (or the row's "Load file" context-menu item) lazily opens
   one via loadFolderFile, which becomes a completely normal root file node
   (tagged node.folderId) and starts tailing since it has a real handle.
   Closing it (deleteFilterNodeWithUndo's node.folderId branch,
   closeFolderFile) returns it to the grayed listing, in the SAME position,
   instead of removing it outright. folderScanTick (same polling shape as
   tailTick) picks up files that appear in the folder later.
   ============================================================ */
group(37);
await withApp(async (w, d, T) => {
  section("37. Folder watch + lazy loading");

  function fakeFileHandle(name, text) {
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
  // fileMap is mutable (Group adds to it later to simulate a new file
  // appearing) — values() re-reads Object.keys() on every call, exactly
  // like the real FileSystemDirectoryHandle would after a rescan.
  function fakeDirHandle(name, fileMap) {
    return {
      kind: "directory", name,
      async *values() {
        for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]);
      },
    };
  }
  // Reads back the folder box's file list IN DOM ORDER, regardless of
  // whether each row is a real .tree-row (renderNode's wrapper div) or a
  // grayed .folder-watch-file — the thing under test is that a file's
  // POSITION in this order never moves as it opens/closes.
  function folderOrder(folderBox) {
    return [...folderBox.querySelector(".folder-watch-files").children].map(el => {
      const label = el.querySelector(".tree-label, .folder-watch-file-name");
      return label ? label.textContent : "?";
    });
  }

  const fileMap = {
    "a.log": makeLog(0, 5),
    "b.log": makeLog(100, 3),
    "notes.pdf": "not a compatible/viewable extension",
  };
  const dir = fakeDirHandle("logs", fileMap);
  await w.addWatchedFolder(dir);

  assert(T.state.folders.length === 1, "watched folder registered");
  const folder = T.state.folders[0];
  assert(folder.name === "logs", "folder name taken from the directory handle");
  assert(folder.files.length === 2, "only *.log files are listed, incompatible extension filtered out — got " + folder.files.length);
  assert(folder.files.map(f => f.name).join(",") === "a.log,b.log", "listed files sorted by name, got " + folder.files.map(f => f.name).join(","));
  assert(T.state.rootIds.length === 0, "nothing is actively loaded yet — scanning lists files without parsing them (lazy)");

  // Rendering: folder section above #tree, scanning ping for a live watch,
  // one grayed row per listed file, in folder order.
  const folderBox = d.querySelector(".folder-watch");
  assert(folderBox !== null, "folder section rendered in the sidebar");
  assert(folderBox.querySelector(".folder-watch-name").textContent === "logs", "folder name shown in the header");
  assert(folderBox.querySelector(".folder-watch-icon.live .folder-watch-dot") !== null, "status dot present for a live folder (static, no infinite ping)");
  let inactiveRows = folderBox.querySelectorAll(".folder-watch-file");
  assert(inactiveRows.length === 2, "both compatible files listed as inactive rows, got " + inactiveRows.length);
  assert(folderOrder(folderBox).join(",") === "a.log,b.log", "initial folder order is a.log, b.log");

  // A plain click on an inactive row must NOT select/activate it — there is
  // no node id it could become state.activeId, so Ctrl+F/paste have nothing
  // to target. This is the mechanism behind "no filter can be created or
  // copied onto an inactive file". (Since Group 343 the click also puts the
  // tree cursor on the row and leaves NOTHING selected: activeId is null.)
  fireClick(inactiveRows[0], w);
  assert(T.state.activeId === null, "clicking a grayed inactive file row selects nothing: state.activeId is null (no file, no node id to target)");
  assert(w.treeCursorId() === w.unloadedNavId("folder", folder.id, "a.log"), "...the tree cursor rests on the clicked row");

  // Double-click lazily loads the file: becomes a real root node, tagged
  // with folderId, rendered as a real tree row IN PLACE inside the folder's
  // own file list (not moved elsewhere) — its position in the folder order
  // is exactly what makes this different from a plain "grayed vs. separate
  // active list" split.
  fireDblClick(inactiveRows[0], w);
  // Poll the parsed result, not a fixed delay: the FileReader read AND the
  // chunked parse behind it are both async, and a 50ms sleep was only ever
  // long enough while the suite was under light load (see tests/README ->
  // "never poll a proxy condition").
  await waitFor(() => T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].entries.length === 5);
  assert(T.state.rootIds.length === 1, "double-click loaded exactly one file, got " + T.state.rootIds.length);
  const loadedNode = T.state.nodes[T.state.rootIds[0]];
  assert(loadedNode.name === "a.log", "the double-clicked file (a.log) was the one loaded");
  assert(loadedNode.entries.length === 5, "loaded file content actually parsed (5 entries), got " + loadedNode.entries.length);
  assert(loadedNode.folderId === folder.id, "loaded node is tagged with the folder it came from");
  assert(loadedNode.tail && loadedNode.tail.handle, "a folder-loaded file (real handle) starts tailing automatically");
  assert(folder.files.find(f => f.name === "a.log").nodeId === loadedNode.id, "the folder's own file record now points at the live node");
  assert(![...d.querySelectorAll("#tree .tree-row .tree-label")].some(l => l.textContent === "a.log"),
    "the loaded file does NOT also render as a separate top-level #tree row — only inside its folder section");
  // renderFolderWatchList() rebuilds the folder box's DOM from scratch on
  // every render() — re-query rather than reuse the stale pre-render node.
  let folderBoxNow = d.querySelector(".folder-watch");
  assert(folderOrder(folderBoxNow).join(",") === "a.log,b.log", "folder order unchanged after opening a.log — it stays in place, now as a real row");
  assert(folderBoxNow.querySelectorAll(".folder-watch-file").length === 1, "only b.log is still a grayed row");
  assert([...folderBoxNow.querySelectorAll(".tree-row .tree-label")].some(l => l.textContent === "a.log"), "a.log renders as a real tree row inside the folder box");

  // Right-click context menu's "Load file" is the alternative entry point
  // for the remaining inactive file (b.log).
  const bRow = [...d.querySelectorAll(".folder-watch-file")].find(r => r.querySelector(".folder-watch-file-name").textContent === "b.log");
  fireContextMenu(bRow, w);
  const menuItem = d.querySelector('#treeContextMenu [data-action="loadFolderFile"]');
  assert(menuItem !== null, "right-click on a grayed file offers a \"Load file\" menu item");
  fireClick(menuItem, w);
  await waitFor(() => T.state.rootIds.length === 2 && T.state.nodes[T.state.rootIds[1]].entries.length > 0);
  assert(T.state.rootIds.length === 2, "context-menu \"Load file\" also lazily loads the file, got " + T.state.rootIds.length);
  assert(d.querySelectorAll(".folder-watch-file").length === 0, "both files now loaded — no grayed rows left");
  assert(folderOrder(d.querySelector(".folder-watch")).join(",") === "a.log,b.log", "both files still render in their original folder order");

  // Closing a folder-loaded file (the tree row's ✕) returns it to the
  // grayed listing, IN THE SAME POSITION, instead of vanishing — the
  // defining behavior this feature adds on top of a normal file close.
  folderBoxNow = d.querySelector(".folder-watch");
  const aTreeRow = [...folderBoxNow.querySelectorAll(".tree-row")].find(r => r.querySelector(".tree-label").textContent === "a.log");
  const closeBtn = aTreeRow.querySelector(".tree-del");
  fireClick(closeBtn, w);
  assert(T.state.rootIds.length === 1, "closing the file removed its root node, got " + T.state.rootIds.length);
  assert(T.state.nodes[loadedNode.id] === undefined, "the closed file's node is fully gone from state.nodes (not just hidden)");
  assert(T.entryIndex[loadedNode.entries[0].id] === undefined, "the closed file's entries were released from entryIndex, same as a normal close");
  assert(folder.files.find(f => f.name === "a.log").nodeId === null, "the folder's own record for a.log is cleared back to \"not loaded\"");
  const rowsAfterClose = d.querySelectorAll(".folder-watch-file");
  assert(rowsAfterClose.length === 1 && rowsAfterClose[0].querySelector(".folder-watch-file-name").textContent === "a.log",
    "a.log is listed grayed again instead of being gone entirely");
  assert(folderOrder(d.querySelector(".folder-watch")).join(",") === "a.log,b.log", "a.log is back at its original position, not appended at the end");

  // Reopening reuses the same stored handle — no re-scan needed.
  const aRecAgain = folder.files.find(f => f.name === "a.log");
  await w.loadFolderFile(folder, aRecAgain);
  assert(T.state.rootIds.length === 2, "a.log can be reopened after being closed, got " + T.state.rootIds.length);

  // folderScanTick: a file appearing in the real folder later gets picked
  // up automatically (the polling loop the scanning animation represents).
  fileMap["c.log"] = makeLog(200, 2);
  await w.folderScanTick();
  assert(folder.files.length === 3, "folderScanTick picked up the newly appeared c.log, got " + folder.files.length);
  assert(folder.files.some(f => f.name === "c.log" && f.nodeId === null), "the newly discovered file starts out as an unopened (grayed) listing entry");

  // removeWatchedFolder (the folder's ✕): stops watching AND closes every file
  // opened from it — nothing stays behind as a plain top-level #tree file
  // (superseded the earlier "still-open files keep working as plain
  // independent files"; see GROUP 342 for viewers/text versions/ZIPs).
  const cFolder = folder;
  w.removeWatchedFolder(cFolder.id);
  assert(T.state.folders.length === 0, "the folder record is gone after removeWatchedFolder");
  assert(d.querySelector(".folder-watch") === null, "the folder section is no longer rendered");
  assert(T.state.rootIds.length === 0, "the files opened from the folder are closed with it, not left behind, got " + T.state.rootIds.length);
  assert(Object.keys(T.state.nodes).length === 0, "...and fully gone from state.nodes");
  assert(![...d.querySelectorAll("#tree .tree-row .tree-label")].some(l => l.textContent === "a.log"),
    "the closed file does not reappear as a plain top-level #tree row");
});
