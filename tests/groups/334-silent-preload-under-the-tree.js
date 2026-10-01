// GROUP 334 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 334 — silent preload under the tree cursor: the cursor resting
   (CURSOR_PRELOAD_DWELL_MS) on a listed-but-unloaded log entry (watched-folder
   file, ZIP entry) preloads it as a hidden job; leaving aborts it, Alt+Right /
   double-click adopt it (kb semantics kept). Data: log-sim default format. */
group(334);
{
  const storedZip = (entries) => {
    let offset = 0; const local = [], central = [];
    for (const e of entries) {
      const nameBuf = Buffer.from(e.name, "utf8"), data = Buffer.from(e.data, "utf8");
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
      lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
      const rec = Buffer.concat([lh, nameBuf, data]);
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
      ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
      local.push(rec); central.push(Buffer.concat([ch, nameBuf])); offset += rec.length;
    }
    const L = Buffer.concat(local), C = Buffer.concat(central), eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(C.length, 12); eocd.writeUInt32LE(L.length, 16);
    return Buffer.concat([L, C, eocd]);
  };
  const sim = seed => LOGSIM.generateToStrings({ format: "default", entries: 120, seed })[0].text;
  const DWELL = 150;
  function fakeDir(w, name, files, counters, gates) {
    return {
      kind: "directory", name,
      async *values() {
        for (const [key, val] of Object.entries(files)) {
          yield { kind: "file", name: key, async getFile() {
            counters[key] = (counters[key] || 0) + 1;
            if (gates && gates[key]) await gates[key];
            const b = new w.Blob([val]); b.text = async () => val; return b;
          } };
        }
      },
    };
  }
  const cursorJobs = T => [...T.folderPreloads.values()];

  await withApp(async (w, d, T) => {
    section("334a. folder file: hidden job after the dwell; moving on aborts it and starts one for the new entry");
    await waitForFormatConfig(T);
    const counters = {};
    await w.addWatchedFolder(fakeDir(w, "flogs", { "One.log": sim(1), "Two.log": sim(2), "Three.log": sim(3), "Four.log": sim(4) }, counters));
    const folder = T.state.folders[0];
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    T.state.activeId = plain.id; T.state.focusRegion = "tree"; w.render();
    const F = n => w.unloadedNavId("folder", folder.id, n);
    const rootsBefore = T.state.rootIds.slice(), rowsBefore = d.querySelectorAll(".tree-row").length;
    w.setTreeCursor(F("One.log")); w.render();
    assert(T.folderPreloads.size === 0, "no job before the dwell has passed");
    await waitFor(() => T.folderPreloads.size === 1);
    const j1 = cursorJobs(T)[0];
    assert(j1.cursor && j1.started && T.state.nodes[j1.node.id] === j1.node && !T.state.rootIds.includes(j1.node.id), "job for One.log, hidden node in state.nodes only");
    await j1.promise;
    assert(j1.node.entries.length > 100 && T.state.activeId === plain.id && T.state.rootIds.join() === rootsBefore.join() && d.querySelectorAll(".tree-row").length === rowsBefore, "parsed invisibly: activeId, tree and rows unchanged");
    assert(w.treeCursorId() === F("One.log"), "cursor untouched");

    w.setTreeCursor(F("Two.log")); w.render();
    assert(T.folderPreloads.size === 0 && T.state.nodes[j1.node.id] === undefined, "the cursor left One.log: job aborted at once, node gone");
    await waitFor(() => T.folderPreloads.size === 1);
    const j2 = cursorJobs(T)[0];
    assert(j2 !== j1 && j2.rec.name === "Two.log", "a job for the new entry starts after its dwell");
    await j2.promise;

    section("334c. held-key churn: moves faster than the dwell start no job");
    // Checked right after each move, before the event loop runs again: no
    // timer can have fired since that move restarted the dwell. Checking only
    // after the final sleep(10) raced the 150ms dwell whenever the loaded
    // machine stretched that 10ms past it.
    const jobsRightAfterMove = [];
    for (const n of ["One.log", "Three.log", "Four.log", "Two.log", "Three.log"]) {
      w.setTreeCursor(F(n)); w.render();
      jobsRightAfterMove.push(...cursorJobs(T).map(j => n + ":" + j.rec.name + j.started));
      await sleep(10);
    }
    assert(jobsRightAfterMove.length === 0, "no job while the cursor keeps moving " + jobsRightAfterMove);
    await waitFor(() => T.folderPreloads.size === 1);
    assert(cursorJobs(T)[0].rec.name === "Three.log", "only the entry it finally rests on gets one");
    w.setTreeCursor(null); w.render();
    assert(T.folderPreloads.size === 0, "cursor gone: job aborted");
  });

  await withApp(async (w, d, T) => {
    section("334d. Alt+Right adopts the finished job: no second read, activated when the cursor stayed; moved away meanwhile -> not activated");
    await waitForFormatConfig(T);
    const counters = {};
    await w.addWatchedFolder(fakeDir(w, "flogs", { "One.log": sim(1), "Two.log": sim(2) }, counters));
    const folder = T.state.folders[0];
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    T.state.activeId = plain.id; T.state.focusRegion = "tree"; w.render();
    const F = n => w.unloadedNavId("folder", folder.id, n);
    const key = (k, o) => fireKeydown(d, w, k, o);
    w.setTreeCursor(F("One.log")); w.render();
    await waitFor(() => T.folderPreloads.size === 1);
    const j = cursorJobs(T)[0]; await j.promise;
    key("ArrowRight", { altKey: true });
    const rec = folder.files.find(f => f.name === "One.log");
    await waitFor(() => T.state.activeId === rec.nodeId && rec.nodeId);
    assert(T.state.nodes[rec.nodeId] === j.node && !j.node.preload && j.node.entries.length > 100, "the preloaded node itself became the file");
    assert(T.folderPreloads.size === 0 || cursorJobs(T).every(x => x.rec.name !== "One.log"), "no second job for One.log");

    // in flight + cursor moves away: the load must not steal the selection, and no duplicate job appears meanwhile
    w.setTreeCursor(F("Two.log")); w.render();
    await waitFor(() => T.folderPreloads.size === 1);
    const j2 = cursorJobs(T)[0];
    key("ArrowRight", { altKey: true });
    assert(T.folderPreloads.size === 0, "adoption takes the job out of the map");
    w.render(); await sleep(DWELL + 50);
    assert(T.folderPreloads.size === 0, "no duplicate job while the keyboard load runs");
    const before = T.state.activeId;
    w.setTreeCursor(null); T.state.activeId = plain.id; w.render();
    await j2.promise; await sleep(50);
    const rec2 = folder.files.find(f => f.name === "Two.log");
    assert(T.state.activeId === plain.id, "moved away meanwhile: not activated");
    assert(rec2.nodeId && T.state.nodes[rec2.nodeId] === j2.node && j2.node.entries.length > 100, "...but the preloaded node became the file (no second read)");
  });

  await withApp(async (w, d, T) => {
    section("334e. ZIP entry: extract runs once for the preload, Alt+Right adopts (zipId node, activated, no second extract)");
    await waitForFormatConfig(T);
    const zip = await w.openZipSource(new w.File([storedZip([
      { name: "a.log", data: sim(11) }, { name: "b.log", data: sim(12) }, { name: "notes.txt", data: "hello" },
    ])], "logs.zip"), "logs.zip");
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    T.state.activeId = plain.id; T.state.focusRegion = "tree"; w.render();
    const U = n => w.unloadedNavId("zip", zip.id, n);
    let extracts = 0;
    for (const e of zip.entries) { const real = e.extract; e.extract = function () { extracts++; return real.apply(this, arguments); }; }
    w.setTreeCursor(U("a.log")); w.render();
    assert(T.folderPreloads.size === 0, "not before the dwell");
    await waitFor(() => T.folderPreloads.size === 1);
    const j = cursorJobs(T)[0];
    assert(j.kind === "zip" && j.node.zipId === zip.id && !T.state.rootIds.includes(j.node.id), "a ZIP job with a hidden zipId node");
    await j.promise;
    assert(extracts === 1 && j.node.entries.length > 100 && T.state.activeId === plain.id, "extracted + parsed invisibly");
    fireKeydown(d, w, "ArrowRight", { altKey: true });
    await waitFor(() => T.state.activeId === j.node.id);
    assert(extracts === 1, "adoption: no second extract, got " + extracts);
    const node = T.state.nodes[j.node.id];
    assert(node.zipId === zip.id && node.name === "a.log" && T.state.rootIds.includes(node.id) && typeof node.loadFraction !== "number", "a normal, finished zipId file");
    assert(d.querySelector("#zipList").textContent.includes("a.log") && w.treeCursorId() === null, "listed in the ZIP section, cursor cleared");

    w.setTreeCursor(U("b.log")); w.render();
    await waitFor(() => T.folderPreloads.size === 1);
    w.setTreeCursor(U("notes.txt")); w.render();
    assert(T.folderPreloads.size === 0, "leaving b.log aborts its ZIP job");
    await sleep(DWELL + 50);
    assert(T.folderPreloads.size === 0, "a non-log entry (inline viewer) never gets a job");
  });

  await withApp(async (w, d, T) => {
    section("334f. meta-format and open entries get no job; the minimap and the cursor share one job per file");
    await waitForFormatConfig(T);
    T.state.logFormats.push({ id: "t1", name: "t1", mode: "regex", regex: "^(?<ts>\\d+) (?<message>.*)$", tsFormat: "" },
      { id: "meta1", name: "meta", mode: "meta", targetFormatIds: ["t1"] });
    T.state.formatRules.push({ glob: "*.meta.log", formatId: "meta1", order: -1 });
    w.invalidateFormatCompileCache(); w.invalidateGlobCompileCache();
    const counters = {};
    await w.addWatchedFolder(fakeDir(w, "flogs", { "m.meta.log": "1 a\n", "One.log": sim(1) }, counters));
    const folder = T.state.folders[0];
    const F = n => w.unloadedNavId("folder", folder.id, n);
    w.setTreeCursor(F("m.meta.log")); w.render();
    await sleep(DWELL + 60);
    assert(T.folderPreloads.size === 0, "meta-format file: no job");
    const rec = folder.files.find(f => f.name === "One.log");
    // the minimap selects One.log first (the cursor is only valid within the same view)
    w.selectFolderContainer(folder.id);
    T.fmFolderId = folder.id; T.fmSelectedRecKeys = new Set(["One.log"]); T.fmSelectedWindow = null;
    w.renderFolderMinimap(folder);
    assert(T.folderPreloads.size === 1 && !cursorJobs(T)[0].cursor, "the minimap's job for One.log");
    const j = cursorJobs(T)[0];
    w.setTreeCursor(F("One.log")); w.render();
    await sleep(DWELL + 60);
    assert(T.folderPreloads.size === 1 && cursorJobs(T)[0] === j, "cursor and minimap on the same file: one shared job");
    w.setTreeCursor(null); w.render();
    assert(T.folderPreloads.get(folder.id + "|One.log") === j, "the minimap selection keeps the job when the cursor leaves");
  });
}
