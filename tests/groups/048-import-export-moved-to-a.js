// GROUP 48 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 48 — Import/Export moved to a toolbar menu + pop-up loading
   animation replaced by an inline tree progress row
   Origin: this session (2026-08-18), person-requested UI changes.

   1) Export/Import session used to live in the tree's per-node context
      menu (plus a special empty-background menu, since the node menu needs
      a node to right-click) — Group 21 covered that placement, and was
      updated in place this session instead of re-tested here. This group
      only adds the negative-space check the toolbar move implies: with no
      files loaded at all (where the old empty-background context menu used
      to be the only way to reach "Import session…"), the toolbar's
      "Session…" button must still work.

   2) The old #progressOverlay pop-up (full-screen, blocking) is gone
      entirely. It was first replaced (still this session) by a
      .tree-loading-row placeholder shown while a file loaded, then
      superseded again later the same session by createFileNode (see
      philogg.html): the REAL file node now exists in the tree from the
      instant loading starts — before any bytes have even been read — with
      just a thin progress bar (node.loadFraction, drawn by renderNode)
      riding along on its own real, already-interactive row instead of a
      separate placeholder. Because createFileNode is called synchronously
      at the top of loadOneFileIntoTree, before its first await, the row is
      already in the DOM the instant loadFileDescriptors/loadFolderFile is
      called, with no setTimeout needed to catch the "loading" state — same
      technique Group 12 (tailing) and Group 30d use for real
      FileReader-backed loads. 48b/48c below were rewritten in place for
      this (no .tree-loading-row exists anymore); Group 49 covers the
      actual point of the change — the file being usable while it loads,
      not just showing a progress bar — since that's new behavior 48b/48c
      never claimed to cover.
   ============================================================ */
group(48);
await withApp(async (w, d, T) => {
  section("48a. Open menu reachable with zero files loaded (old empty-tree context menu superseded)");
  assert(T.state.rootIds.length === 0, "sanity: no files loaded yet");
  assert(d.querySelector("#progressOverlay") === null, "the old blocking #progressOverlay element no longer exists in the page at all");

  const btnOpen48a = d.querySelector("#btnOpen");
  const openMenu48a = d.querySelector("#openMenu");
  fireClick(btnOpen48a, w);
  assert(!openMenu48a.classList.contains("hidden"), "\"Open\" opens even with an empty tree");
  const importItem = d.querySelector('#openMenu [data-action="import"]');
  assert(importItem !== null, "Import… is reachable from the sidebar header with zero files loaded");

  // Right-clicking the empty tree background no longer produces a menu at
  // all (the whole special-cased empty-background context menu was removed
  // — this behavior is superseded by the always-available toolbar button).
  fireClick(d.body, w); // close the open menu first
  fireContextMenu(d.querySelector("#tree"), w);
  assert(d.querySelector("#treeContextMenu").classList.contains("hidden"),
    "right-clicking the empty tree background no longer opens a context menu");
});

await withApp(async (w, d, T) => {
  section("48b. The real (already-interactive) file row, with a progress fill, replaces the pop-up for a plain file load");
  const text = makeLog(0, 5);
  const file = new w.File([text], "big.log", { type: "text/plain" });

  const before = new Set(T.state.rootIds);
  const donePromise = w.loadFileDescriptors([{ file, handle: null }]);
  // Synchronous part of loadOneFileIntoTree (createFileNode -> flushLoadRender)
  // has already run by the time this line executes — the first await inside
  // it (readFileWithProgress's FileReader) is what actually suspends.
  const newId = T.state.rootIds.find(id => !before.has(id));
  assert(newId, "the file is already a real root node the instant loading starts, before FileReader even resolves");
  assert(typeof T.state.nodes[newId].loadFraction === "number", "the node carries a loadFraction while it's still loading");

  let label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "big.log");
  assert(label !== undefined, "the file's row renders in the tree immediately, not just once loading finishes");
  let row = label.closest(".tree-row");
  assert(row.querySelector(".tree-load-fill") !== null, "the row carries a progress-fill bar while loading");
  assert(d.querySelector("#progressOverlay") === null, "still no blocking overlay anywhere in the DOM while a file is loading");
  assert(d.querySelector(".tree-loading-row") === null, "no separate placeholder row exists anymore — the real row IS the loading row");

  // The row is already fully interactive, not an inert placeholder: a real
  // click on it runs the normal tree-row click handler.
  T.state.focusRegion = "entries";
  T.state.activeId = null;
  fireClick(row, w);
  assert(T.state.activeId === newId, "the still-loading row is already clickable like a normal tree row, not the old inert placeholder");

  // The rest of the UI stays usable: unrelated controls remain clickable —
  // spot-checked via the pin-bookmarks toggle, which has nothing to do with
  // loading (the theme toggle used to live here directly on the toolbar;
  // it moved into Settings -> Appearance this session, no longer a single
  // one-click toolbar button — see GROUP 70h2).
  const pinBefore = T.state.pinBookmarksInFilteredView;
  fireClick(d.querySelector(".toggle-pin"), w);
  assert(T.state.pinBookmarksInFilteredView !== pinBefore, "other toolbar controls remain responsive while a file load is in flight");

  await donePromise;
  assert(typeof T.state.nodes[newId].loadFraction !== "number", "loadFraction is cleared off the node once loading finishes");
  label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "big.log");
  assert(label !== undefined, "the loaded file still renders as a normal real tree row");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") === null, "the progress fill is gone once the file finishes loading");
});

await withApp(async (w, d, T) => {
  section("48c. The real (already-interactive) file row, with a progress fill, replaces a folder-watch file's grayed placeholder while it loads");
  const text = makeLog(0, 4);
  function fakeFileHandle(name, content) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([content]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => content.length, configurable: true });
        blob.text = async () => content;
        blob.slice = start => {
          const sliced = content.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  function fakeDirHandle(name, fileMap) {
    return {
      kind: "directory", name,
      async *values() { for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]); },
    };
  }
  const dir = fakeDirHandle("logs", { "a.log": text });
  await w.addWatchedFolder(dir);
  const folder = T.state.folders[0];
  const rec = folder.files[0];

  const donePromise = w.loadFolderFile(folder, rec);
  // Unlike 48b, loadFolderFile awaits rec.handle.getFile() BEFORE calling
  // loadOneFileIntoTree (which is what actually creates the real node via
  // createFileNode), so a plain synchronous check right after the call
  // isn't enough here — flush pending microtasks (the getFile() resolution
  // chain) via a zero-delay timer first, same as every other async-fixture
  // load in this suite (e.g. Group 37's "let the FileReader-based load settle").
  await new Promise(r => setTimeout(r, 0));
  let folderBox = d.querySelector(".folder-watch");
  let label = [...folderBox.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  assert(label !== undefined, "the folder file's grayed placeholder is replaced by its real (loading) row while it loads");
  assert(folderBox.querySelector(".folder-watch-file") === null, "the plain grayed placeholder is gone while loading (replaced, not duplicated)");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") !== null, "the row carries a progress-fill bar while loading");
  // rec.nodeId is only linked once loadFolderFile's own await resolves —
  // renderFolderSection must still find the real (unlinked) loading node by
  // folder+name in the meantime (see its own comment on this fallback).
  assert(rec.nodeId == null, "sanity: rec.nodeId isn't linked yet at this point, so the row above came from the by-name fallback, not the fast path");

  await donePromise;
  const folderBoxAfter = d.querySelector(".folder-watch");
  label = [...folderBoxAfter.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  assert(label !== undefined, "the folder file still renders as a real tree row inside its folder section once loaded");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") === null, "the progress fill is gone once the folder file finishes loading");
});
