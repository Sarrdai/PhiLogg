// GROUP folder-start-filters-text-files — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): helpers (withApp, waitFor, assert, ...) in scope.

/* ============================================================
   GROUP folder-start-filters-text-files — Backlog #110
   Origin: 2026-10-07 (round 4, package A): a folder-watch pattern's Start
   filters (#71) applied only to log nodes. Text files are ordinary
   Plain-text file nodes with a filter tree, so an auto-opened
   .txt/.json/.xml now gets the preset(s) too, Primary last/active; a file
   opened by hand still gets nothing; an image (inline viewer) still skips.
   ============================================================ */
group("folder-start-filters-text-files");
if (groupSelected()) {
  const sim = (format, seed) => LOGSIM.generateToStrings({ format, entries: 12, seed })[0];
  const jsonl = sim("jsonl", 3);
  const syslog = sim("syslog", 4);
  const mkFile = (w, name, text, mtime) => ({ kind: "file", name, getFile: async () => new w.File([text], name, { lastModified: mtime }) });
  const mkDir = (w, name, entries) => ({ kind: "directory", name, async *values() { for (const e of entries) yield e; }, queryPermission: async () => "granted", requestPermission: async () => "granted" });
  const saveRecord = async (w, T, d, srcId, name, value) => {
    const n = w.createFilterNode(srcId, "text", value);
    const p = w.saveFilterToLibrary(n.id, name);
    await new Promise(r => setTimeout(r, 0));
    fireClick(d.querySelector("#exportScopeJustThis"), w);
    await p;
  };

  await withApp(async (w, d, T) => {
    section("start-text a. auto-opened .json and .txt get the presets, Primary active; by hand nothing");
    const src = await w.addFile("src.log", syslog.text, () => {});
    w.render();
    await saveRecord(w, T, d, src.id, "First", "info");
    await saveRecord(w, T, d, src.id, "Second", "error");
    await waitFor(async () => (await w.listFilterLibrary()).length === 2);
    const recs = await w.listFilterLibrary();
    const first = recs.find(r => r.name === "First"), second = recs.find(r => r.name === "Second");

    const setup = async (name, entries, auto) => {
      await w.addWatchedFolder(mkDir(w, name, entries));
      const folder = T.state.folders.find(f => f.name === name);
      folder.settings.patterns = [{ pattern: "*", autoOpenNewest: auto, autoCloseKeep: null, showNewest: null, startFilterKeys: [first.key, second.key], startPrimaryFilterKey: second.key }];
      return folder;
    };
    const check = (folder, fname) => {
      const node = T.state.nodes[folder.files.find(f => f.name === fname).nodeId];
      assert(node.textSyntax !== undefined, fname + " is a text file node");
      const vals = node.children.map(id => T.state.nodes[id].value).sort();
      assert(JSON.stringify(vals) === JSON.stringify(["error", "info"]), fname + " got both presets as filter nodes, got " + JSON.stringify(vals));
      const primaryId = node.children.find(id => T.state.nodes[id].value === "error");
      assert(T.state.activeId === primaryId, fname + ": the Primary ends up as state.activeId");
    };

    const jf = await setup("jsonfolder", [mkFile(w, "data.json", JSON.stringify({ a: 1, msg: "info error" }), 1000)], true);
    await w.rescanFolder(jf);
    await waitFor(() => !!jf.files.find(f => f.name === "data.json").nodeId);
    await waitFor(() => T.state.nodes[jf.files[0].nodeId].children.length === 2);
    check(jf, "data.json");

    const tf = await setup("txtfolder", [mkFile(w, "notes.txt", "alpha info\nbeta error\ngamma\n", 1000)], true);
    await w.rescanFolder(tf);
    await waitFor(() => !!tf.files.find(f => f.name === "notes.txt").nodeId);
    await waitFor(() => T.state.nodes[tf.files[0].nodeId].children.length === 2);
    check(tf, "notes.txt");

    const mf = await setup("manualfolder", [mkFile(w, "hand.txt", "alpha info\n", 1000)], false);
    await w.rescanFolder(mf);
    await w.loadFolderFile(mf, mf.files[0]);
    await waitFor(() => !!mf.files[0].nodeId);
    assert(T.state.nodes[mf.files[0].nodeId].children.length === 0, "a text file opened by hand gets no start filter");

    section("start-text b. an auto-opened image still skips (inline viewer, no node)");
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
    const imf = await setup("imgfolder", [{ kind: "file", name: "p.png", getFile: async () => new w.File([png], "p.png", { lastModified: 1000, type: "image/png" }) }], true);
    const nodesBefore = Object.keys(T.state.nodes).length;
    await w.rescanFolder(imf);
    await waitFor(() => imf.files[0].autoOpenFired);
    assert(!imf.files[0].nodeId && Object.keys(T.state.nodes).length === nodesBefore, "the image opened as a viewer, no file node and no filter nodes were created");
  }, { indexedDB: new IDBFactory() });
}
