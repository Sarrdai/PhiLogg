// GROUP 275 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 275 — Image viewers (and text files) survive a reload like log files
   Origin: 2026-09-25, person-requested: after a page reload / app restart,
   restore opened image files too — on the desktop from their stored path (if
   still there), like log files. Updated 2026-10-01: text files (.txt/.json/
   .xml) are ordinary plain-text file nodes now (GROUP 347), so only images
   are viewers; a text-viewer record saved by an older version is ignored.
   Covers: a loose viewer's record (Blob in the browser, path only on the
   desktop), the meta's viewer list (owner, map key, active viewer), restore
   after the files, a saved text viewer record ignored and swept, a path whose
   file is gone (skipped), closing a viewer drops its record, and stale
   viewer records are swept on restore.
   ============================================================ */
group(275);
{
  const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4];
  const factory = new IDBFactory();
  let viewerKey = null;
  await withApp(async (w, d, T) => {
    section("275a. A directly opened image viewer is persisted");
    await T.bootRestore;
    await w.loadFiles([new w.File([new Uint8Array(PNG_BYTES)], "pic.png", { type: "image/png" })]);
    const v = T.state.inlineViewer;
    assert(v && v.kind === "image" && v.cacheKey && v.cacheKey.startsWith("viewer-"), "the viewer got a cache key");
    viewerKey = v.cacheKey;
    await waitFor(async () => !!(await w.cacheStoreOp("files", "readonly", st => st.get(viewerKey))));
    const rec = await w.cacheStoreOp("files", "readonly", st => st.get(viewerKey));
    assert(rec && rec.viewer && rec.blob && !rec.localPath, "browser: the record holds the file as a Blob");
    await w.persistMetaNow();
    const meta = await w.cacheStoreOp("meta", "readonly", st => st.get("session"));
    assert(meta.viewers.length === 1 && meta.viewers[0].kind === "image" && meta.viewers[0].ownerKind === "loose" && meta.activeViewer === viewerKey, "meta lists the viewer (loose, image, active)");
    assert(!("prettyPrint" in meta.viewers[0]), "no text-viewer fields in the meta any more");
    // A stale viewer record (closed in a session that never got to clean up) and a
    // text viewer saved by an older version (a listed record of kind "text").
    await w.cacheStoreOp("files", "readwrite", st => st.put({ key: "viewer-stale", name: "old.txt", viewer: true, blob: new w.Blob(["x"]) }));
    await w.cacheStoreOp("files", "readwrite", st => st.put({ key: "viewer-oldtext", name: "old.json", viewer: true, blob: new w.Blob(["{}"]) }));
    meta.viewers.push({ key: "viewer-oldtext", ownerKind: "loose", ownerId: "loose", mapKey: "loose:old", name: "old.json", kind: "text", prettyPrint: true });
    await w.cacheStoreOp("meta", "readwrite", st => st.put(meta));
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    section("275b. Reload: the image viewer is back and shown; a saved text viewer is ignored; stale records are swept");
    await T.bootRestore;
    const map = T.state.looseInlineViewers;
    const v = [...map.values()][0];
    assert(map.size === 1 && v.name === "pic.png" && v.kind === "image" && v.cacheKey === viewerKey, "viewer restored (and only it, got " + map.size + ")");
    assert(T.state.inlineViewer === v, "...and shown, as it was");
    assert(T.state.rootIds.length === 0, "the saved text viewer did not come back as a node either");
    assert(!(await w.cacheStoreOp("files", "readonly", st => st.get("viewer-stale"))), "a viewer record the meta doesn't list is swept");
    assert(!(await w.cacheStoreOp("files", "readonly", st => st.get("viewer-oldtext"))), "the ignored text-viewer record is swept too");

    section("275c. Closing the viewer drops its record");
    fireClick(d.querySelector("#tree .zip-source-file .tree-del"), w);
    await waitFor(async () => !(await w.cacheStoreOp("files", "readonly", st => st.get(viewerKey))));
    assert(map.size === 0, "viewer closed, record gone");
  }, { indexedDB: factory });

  // Desktop: stored as a path, re-read from disk; a file gone since is skipped.
  const [simDoc] = LOGSIM.generateToStrings({ format: "plain", entries: 4, seed: 11 });
  const onDisk = { "/data/pic.png": "PNGDATA", "/data/notes.txt": simDoc.text };
  const bridge = () => ({
    openLocalPath: async p => {
      if (!(p in onDisk)) throw new Error("gone");
      return { url: "philogg://local/1/" + p.split("/").pop(), path: p, name: p.split("/").pop() };
    },
  });
  const deskFactory = new IDBFactory();
  await withApp(async (w, d, T) => {
    section("275d. Desktop: an image viewer and a text file node are stored by path only");
    await T.bootRestore;
    const mk = (p, type) => ({ name: p.split("/").pop(), localPath: p, file: new w.File([onDisk[p]], p.split("/").pop(), { type }) });
    await w.loadFileDescriptors([mk("/data/pic.png", "image/png"), mk("/data/notes.txt", "text/plain")]);
    const viewer = [...T.state.looseInlineViewers.values()][0];
    const node = T.state.nodes[T.state.rootIds[0]];
    assert(viewer && node && node.name === "notes.txt" && node.formatId === "fmt-plaintext", "sanity: png is a viewer, notes.txt a plain-text node");
    await waitFor(async () => !!(await w.cacheStoreOp("files", "readonly", st => st.get(viewer.cacheKey))));
    await waitFor(async () => !!(await w.cacheStoreOp("files", "readonly", st => st.get(node.cacheKey))));
    const recs = await Promise.all([viewer.cacheKey, node.cacheKey].map(k => w.cacheStoreOp("files", "readonly", st => st.get(k))));
    assert(recs.every(r => r.localPath && !r.blob && !r.text), "records hold the path, no content");
    await w.persistMetaNow();
  }, { indexedDB: deskFactory, philogg: bridge() });

  onDisk["/data/notes.txt"] = simDoc.text + "\nappended line"; // changed on disk
  delete onDisk["/data/pic.png"];                              // deleted
  await withApp(async (w, d, T) => {
    section("275e. Desktop reload: re-read from the path, a deleted image is skipped");
    w.fetch = async u => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(onDisk["/data/" + String(u).split("/").pop()]).buffer });
    await T.bootRestore;
    assert(T.state.looseInlineViewers.size === 0, "the deleted image didn't come back");
    const node = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "notes.txt");
    const lines = (simDoc.text + "\nappended line").replace(/\r?\n$/, "").split(/\r?\n/);
    assert(node && node.formatId === "fmt-plaintext" && node.entries.length === lines.length && node.entries[node.entries.length - 1].message === "appended line",
      "the text file came back from disk (current content) as a plain-text node (" + (node && node.entries.length) + " vs " + lines.length + " lines)");
  }, { indexedDB: deskFactory, philogg: bridge() });
}
