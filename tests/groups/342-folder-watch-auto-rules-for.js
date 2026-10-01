// GROUP 342 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 342 — Folder watch: auto rules for EVERY listed file type,
   a self-healing watch, containers close their files
   Origin: 2026-09-30 (person-reported, Windows desktop build, a dropped
   folder of .json files): "Show M newest", "Auto-open newest" and "Auto-close
   — keep only N open" were ignored and the folder's dot was red. Root causes:
   applyFolderAutoRules skipped every non-log rec (and judged "open" only by
   rec.nodeId, which an inline viewer never has); `failed` was set by ANY
   error in scan+merge+rules+render and folderScanTick then skipped a failed
   folder forever. Also: files deleted on disk / a folder's or ZIP's ✕ left
   viewers, their "Filter lines" text versions and (ZIP) opened log nodes
   behind as orphans. Decided by the person: the rules apply to every file
   type the folder lists (never restricted to *.log); only a failing LISTING
   marks a folder failed, it is retried every poll and heals, the dot's
   tooltip names the error; deletions and both ✕ close the files (no undo).
   Start filters stay log-only (filter-library records for a log node).
   ============================================================ */
group(342);
if (groupSelected()) {
  const simLog = seed => LOGSIM.generateToStrings({ format: "default", entries: 6, seed })[0].text;
  const jsonBody = n => JSON.stringify({ n, ok: true });
  // Native bridge over `dirs` (+ real mtimes, mutable) for the picked folder "/data".
  const mkBridge = (dirs, mtimes) => {
    const b = nativeFolderBridge(dirs, 1, mtimes);
    b.picked = { path: "/data", name: "data" };
    return b;
  };
  const pat = over => Object.assign({ pattern: "*", autoOpenNewest: false, autoCloseKeep: null, showNewest: null, startFilterKeys: [], startPrimaryFilterKey: null }, over);
  const watch = async (w, T) => { await w.openFolderPickerFlow(); return T.state.folders[0]; };
  const setPatterns = (folder, list) => { folder.settings.patterns = list.map(pat); };
  const rowOf = (d, name) => [...d.querySelectorAll(".folder-watch-file")].find(r => r.querySelector(".folder-watch-file-name").textContent === name);
  const openNames = folder => folder.files.filter(r => r.nodeId || folder.inlineViewers.has(r.relPath || r.name)).map(r => r.name).sort();
  const countRenders = w => {
    const real = w.render; const c = { n: 0 };
    w.render = (...a) => { c.n++; return real.apply(w, a); };
    c.restore = () => { w.render = real; };
    return c;
  };

  section("342a. 25 .png files, \"Show newest 3\" + \"Auto-open newest\": 3 listed, the newest opens as an inline viewer flagged auto");
  {
    const dirs = { "/data": {} }, mtimes = {};
    for (let i = 1; i <= 25; i++) { const n = "evt" + String(i).padStart(2, "0") + ".png"; dirs["/data"][n] = jsonBody(i); mtimes["/data/" + n] = 1000 + i; }
    const bridge = mkBridge(dirs, mtimes);
    await withApp(async (w, d, T) => {
      bridge.installFetch(w);
      const folder = await watch(w, T);
      assert(folder.files.length === 25, "sanity: with the default pattern all 25 .png files are listed, got " + folder.files.length);
      setPatterns(folder, [{ pattern: "*.png", showNewest: 3, autoOpenNewest: true }]);
      await w.rescanFolder(folder);
      assert(folder.files.map(r => r.name).join(",") === "evt23.png,evt24.png,evt25.png",
        "\"Show newest 3\" applies to .png files (by mtime), got " + folder.files.map(r => r.name).join(","));
      assert(openNames(folder).join(",") === "evt25.png" && folder.inlineViewers.has("evt25.png"),
        "\"Auto-open newest\" opened the newest .png as an inline viewer, got " + openNames(folder).join(","));
      assert(T.state.inlineViewer && T.state.inlineViewer.name === "evt25.png" && T.state.rootIds.length === 0,
        "...it is the shown viewer, and no log node was created");
      const rec = folder.files.find(r => r.name === "evt25.png");
      assert(rec.openedByAuto === true && rec.autoOpenFired === true, "the viewer open sets openedByAuto/autoOpenFired like a node does");
      assert(folder.failed === false, "the folder is not failed");
      const row = rowOf(d, "evt25.png");
      assert(row && row.classList.contains("zip-entry-opened"), "its row is the opened look");
      assert(row.querySelector(".tree-icon use").getAttribute("href") === "#i-file-auto" && /automatically/.test(row.querySelector(".tree-icon").title),
        "...with the auto badge and tooltip an auto-opened log row has");
      assert(!rowOf(d, "evt24.png").querySelector(".tree-icon use[href='#i-file-auto']"), "a listed, unopened row has no auto badge");

      const c = countRenders(w);
      for (let i = 0; i < 3; i++) await w.folderScanTick();
      assert(c.n === 0 && folder.files.length === 3, "stable polls with rules on .png files trigger zero renders (Group 195), got " + c.n);
      c.restore();
    }, { philogg: bridge });
  }

  section("342b. keep-1 sliding window on .png: a newer file opens and the previous auto-opened viewer closes; a manual open is never auto-closed; a hand-closed one is not reopened");
  {
    const dirs = { "/data": { "evt1.png": jsonBody(1), "evt2.png": jsonBody(2), "evt3.png": jsonBody(3) } };
    const mtimes = { "/data/evt1.png": 1001, "/data/evt2.png": 1002, "/data/evt3.png": 1003 };
    const bridge = mkBridge(dirs, mtimes);
    await withApp(async (w, d, T) => {
      bridge.installFetch(w);
      const folder = await watch(w, T);
      setPatterns(folder, [{ pattern: "*.png", autoCloseKeep: 1 }]);
      await w.rescanFolder(folder);
      assert(openNames(folder).join(",") === "evt3.png", "keep-1 opened the newest .png, got " + openNames(folder).join(","));

      dirs["/data"]["evt4.png"] = jsonBody(4); mtimes["/data/evt4.png"] = 1004;
      await w.folderScanTick(); // the real poll
      assert(openNames(folder).join(",") === "evt4.png", "a newer .png arriving opens, the previous auto-opened viewer closes, got " + openNames(folder).join(","));
      assert(!folder.inlineViewers.has("evt3.png") && folder.files.some(r => r.name === "evt3.png"), "...the closed one is still listed");
      assert(rowOf(d, "evt3.png") && !rowOf(d, "evt3.png").classList.contains("zip-entry-opened"), "...as a grayed row (not the opened look)");
      assert(T.state.inlineViewer && T.state.inlineViewer.name === "evt4.png", "the new viewer is the shown one");

      // A viewer the person opened by hand is never auto-closed.
      await w.loadFolderFile(folder, folder.files.find(r => r.name === "evt1.png"));
      assert(folder.files.find(r => r.name === "evt1.png").openedByAuto === false, "a manual open is not flagged auto");
      dirs["/data"]["evt5.png"] = jsonBody(5); mtimes["/data/evt5.png"] = 1005;
      await w.folderScanTick();
      assert(openNames(folder).join(",") === "evt1.png,evt5.png", "evt5 opened, auto evt4 closed, the manual evt1 stays open, got " + openNames(folder).join(","));

      // Closed by hand (the row's ✕), an auto-opened newest stays closed on later merges.
      fireClick(rowOf(d, "evt5.png").querySelector(".tree-del"), w);
      assert(!folder.inlineViewers.has("evt5.png"), "sanity: the person closed the auto-opened viewer");
      dirs["/data"]["aaa.png"] = jsonBody(0); mtimes["/data/aaa.png"] = 500; // older: a merge runs, the newest is still evt5
      await w.folderScanTick();
      assert(folder.files.some(r => r.name === "aaa.png") && openNames(folder).join(",") === "evt1.png",
        "a later merge does not reopen a hand-closed auto-opened file (autoOpenFired), got " + openNames(folder).join(","));

      const c = countRenders(w);
      for (let i = 0; i < 3; i++) await w.folderScanTick();
      assert(c.n === 0, "stable polls render nothing, got " + c.n);
      c.restore();
    }, { philogg: bridge });
  }

  section("342c. a mixed .log + .png pattern: Show newest / Auto-open newest treat both kinds alike");
  {
    const dirs = { "/data": { "a.log": simLog(1), "b.png": jsonBody(2), "c.log": simLog(3), "d.png": jsonBody(4) } };
    const mtimes = { "/data/a.log": 1000, "/data/b.png": 2000, "/data/c.log": 3000, "/data/d.png": 4000 };
    const bridge = mkBridge(dirs, mtimes);
    await withApp(async (w, d, T) => {
      bridge.installFetch(w);
      const folder = await watch(w, T);
      setPatterns(folder, [{ pattern: "*", showNewest: 3, autoOpenNewest: true }]);
      await w.rescanFolder(folder);
      assert(folder.files.map(r => r.name).join(",") === "b.png,c.log,d.png", "the 3 newest of BOTH kinds are listed, got " + folder.files.map(r => r.name).join(","));
      assert(openNames(folder).join(",") === "d.png" && T.state.rootIds.length === 0, "the newest (a .png) auto-opened as a viewer, got " + openNames(folder).join(","));

      dirs["/data"]["e.log"] = simLog(5); mtimes["/data/e.log"] = 5000;
      await w.folderScanTick();
      assert(folder.files.map(r => r.name).join(",") === "c.log,d.png,e.log", "the window moved on, got " + folder.files.map(r => r.name).join(","));
      const e = folder.files.find(r => r.name === "e.log");
      assert(e.nodeId && T.state.nodes[e.nodeId] && T.state.nodes[e.nodeId].folderId === folder.id, "the newest, a .log, opened as a real node");
      assert(folder.inlineViewers.has("d.png"), "\"Auto-open newest\" closes nothing: the .png viewer stays open");
      assert(openNames(folder).join(",") === "d.png,e.log", "both kinds count as open, got " + openNames(folder).join(","));
    }, { philogg: bridge });
  }

  section("342d. a failed listing shows its error in the dot's tooltip, is retried every poll, heals, and then the rules run");
  {
    const dirs = { "/data": { "one.png": jsonBody(1) } };
    const mtimes = { "/data/one.png": 1000 };
    const bridge = mkBridge(dirs, mtimes);
    const MSG = "os error 5: Access is denied";
    let failures = 0;
    const realList = bridge.listFolder;
    bridge.listFolder = async (...a) => { if (failures > 0) { failures--; throw new Error(MSG); } return realList(...a); };
    await withApp(async (w, d, T) => {
      bridge.installFetch(w);
      failures = 1;
      const folder = await watch(w, T); // the INITIAL listing fails
      assert(folder.failed === true && folder.failedMessage === MSG, "a failing listing marks the folder failed and keeps the message, got " + folder.failedMessage);
      let icon = d.querySelector(".folder-watch-icon");
      assert(icon.classList.contains("failed") && !icon.classList.contains("live"), "the dot is the failed one");
      assert(icon.title === "Folder can't be read — " + MSG + ". Retrying every 3 s.", "the tooltip names the error, got " + icon.title);

      // Still failing on the next polls: one state, no render per poll.
      failures = 2;
      const c = countRenders(w);
      await w.folderScanTick(); await w.folderScanTick();
      assert(folder.failed === true && c.n === 0, "a repeated identical failure renders nothing, got " + c.n);
      c.restore();

      // The disk recovers and gained a file; a rule is configured meanwhile.
      dirs["/data"]["two.png"] = jsonBody(2); mtimes["/data/two.png"] = 2000;
      setPatterns(folder, [{ pattern: "*.png", autoOpenNewest: true }]);
      let merges = 0;
      const realMerge = w.mergeScannedFiles;
      w.mergeScannedFiles = (...a) => { merges++; return realMerge.apply(w, a); };
      await w.folderScanTick();
      assert(folder.failed === false && folder.failedMessage === null, "the first successful poll clears failed and the message");
      assert(folder.files.map(r => r.name).join(",") === "one.png,two.png", "the file added while failed is listed, got " + folder.files.map(r => r.name).join(","));
      assert(openNames(folder).join(",") === "two.png" && T.state.inlineViewer && T.state.inlineViewer.name === "two.png", "...and the auto rule fired (newest .png opened)");
      icon = d.querySelector(".folder-watch-icon");
      assert(icon.classList.contains("live") && !icon.classList.contains("failed") && !/can't be read/.test(icon.title), "the dot is live again");
      assert(merges === 1, "the healing poll merged, got " + merges);

      // Fails again with NOTHING changed on disk: the heal still merges once, then polls are quiet.
      failures = 1;
      await w.folderScanTick();
      assert(folder.failed === true && folder.failedMessage === MSG, "a later failure is flagged again");
      await w.folderScanTick();
      assert(folder.failed === false && merges === 2, "...and heals with a merge even though the key set is unchanged, merges=" + merges);
      const c2 = countRenders(w);
      await w.folderScanTick(); await w.folderScanTick();
      assert(c2.n === 0 && merges === 2, "stable polls after the heal: no render, no merge (renders " + c2.n + ", merges " + merges + ")");
      c2.restore();
      w.mergeScannedFiles = realMerge;
    }, { philogg: bridge });
  }

  section("342e. only a failing listing flags the folder: an unreadable file, a throwing open, merge or render are logged, never `failed`");
  {
    const mk = () => {
      const dirs = { "/data": { "a.log": simLog(1), "z.png": jsonBody(9) } };
      const mtimes = { "/data/a.log": 1000, "/data/z.png": 2000 };
      return { dirs, mtimes, bridge: mkBridge(dirs, mtimes) };
    };
    const rules = [{ pattern: "*.png", autoOpenNewest: true }, { pattern: "*.log", autoOpenNewest: true }];
    {
      const { bridge } = mk();
      await withApp(async (w, d, T) => {
        bridge.installFetch(w);
        const realFetch = w.fetch;
        w.fetch = async (url, ...a) => /z\.png$/.test(String(url)) ? { ok: false, status: 404 } : realFetch(url, ...a);
        const folder = await watch(w, T);
        setPatterns(folder, rules);
        await w.rescanFolder(folder);
        assert(folder.failed === false, "an auto-open whose file answers 404 does not set failed");
        assert(!folder.inlineViewers.has("z.png") && openNames(folder).join(",") === "a.log",
          "...and the other pattern's rule still ran (a.log opened), got " + openNames(folder).join(","));
      }, { philogg: bridge });
    }
    {
      const { bridge } = mk();
      await withApp(async (w, d, T) => {
        bridge.installFetch(w);
        const errs = [];
        w.console.error = (...a) => errs.push(a.map(String).join(" "));
        w.openInlineViewer = async () => { throw new Error("viewer boom"); };
        const folder = await watch(w, T);
        setPatterns(folder, rules);
        await w.rescanFolder(folder);
        assert(folder.failed === false, "an auto-open that throws does not set failed");
        assert(openNames(folder).join(",") === "a.log", "...the remaining pattern's rule still ran, got " + openNames(folder).join(","));
        assert(errs.some(e => /auto-opening "z\.png" failed/.test(e) && /viewer boom/.test(e)), "...and it is console.error'ed, got " + JSON.stringify(errs));
      }, { philogg: bridge });
    }
    {
      const { dirs, mtimes, bridge } = mk();
      await withApp(async (w, d, T) => {
        bridge.installFetch(w);
        const errs = [];
        w.console.error = (...a) => errs.push(a.map(String).join(" "));
        const folder = await watch(w, T);
        const realMerge = w.mergeScannedFiles;
        w.mergeScannedFiles = async () => { throw new Error("merge boom"); };
        dirs["/data"]["n.png"] = jsonBody(3); mtimes["/data/n.png"] = 3000;
        await w.folderScanTick();
        assert(folder.failed === false && errs.some(e => /merge boom/.test(e)), "a throwing merge in the poll is logged, not failed, got failed=" + folder.failed);
        assert(folder.busy === false, "...and the folder is not left busy");
        await w.rescanFolder(folder);
        assert(folder.failed === false && errs.filter(e => /merge boom/.test(e)).length === 2, "same for rescanFolder");
        w.mergeScannedFiles = realMerge;

        // A render that throws after a poll does not flag the folder either, nor reject the tick.
        dirs["/data"]["m.png"] = jsonBody(4); mtimes["/data/m.png"] = 4000;
        const realRender = w.render;
        w.render = () => { throw new Error("render boom"); };
        let rejected = false;
        try { await w.folderScanTick(); } catch (e) { rejected = true; }
        w.render = realRender;
        assert(!rejected && folder.failed === false && folder.busy === false, "a throwing render in the tick: no rejection, not failed, not busy");
        assert(errs.some(e => /render boom/.test(e)), "...and it is logged");
        assert(folder.files.some(r => r.name === "m.png"), "the merge itself had already happened");
      }, { philogg: bridge });
    }
  }

  section("342f. deleted on disk: an open viewer (shown), an open text file node and an open log all go, without undo entries or orphan rows");
  {
    const dirs = { "/data": { "keep.png": jsonBody(1), "gone.png": "PNGDATA", "gone.log": simLog(2), "gone.txt": "a\nb" } };
    const bridge = mkBridge(dirs, {});
    await withApp(async (w, d, T) => {
      bridge.installFetch(w);
      const folder = await watch(w, T);
      await w.loadFolderFile(folder, folder.files.find(r => r.name === "gone.log"));
      await w.loadFolderFile(folder, folder.files.find(r => r.name === "gone.png"));
      const viewer = folder.inlineViewers.get("gone.png");
      assert(viewer && T.state.inlineViewer === viewer, "sanity: the viewer is open and shown");
      await w.loadFolderFile(folder, folder.files.find(r => r.name === "gone.txt"));
      const textNode = Object.values(T.state.nodes).find(n => n.name === "gone.txt");
      assert(textNode && textNode.formatId === "fmt-plaintext" && textNode.folderId === folder.id, "sanity: the text file is open as a plain-text node of the folder");
      w.activateInlineViewer(viewer); w.render();
      assert(d.querySelector(".folder-watch .tree-row"), "sanity: rows of the open files are inside the folder box");
      const undoBefore = T.undoStack.length;

      delete dirs["/data"]["gone.png"]; delete dirs["/data"]["gone.log"]; delete dirs["/data"]["gone.txt"];
      await w.folderScanTick();
      assert(folder.files.map(r => r.name).join(",") === "keep.png", "the vanished files left the listing, got " + folder.files.map(r => r.name).join(","));
      assert(!folder.inlineViewers.has("gone.png") && T.state.inlineViewer === null, "the viewer is closed and no longer shown");
      assert(T.state.nodes[textNode.id] === undefined, "the text file node is gone too");
      assert(T.state.rootIds.length === 0 && Object.keys(T.state.nodes).length === 0, "no node is left behind (no orphan top-level row)");
      assert(d.querySelectorAll("#tree .tree-row").length === 0 && d.querySelectorAll(".folder-watch .tree-row").length === 0, "no tree row anywhere");
      assert(T.undoStack.length === undoBefore, "no undo entries for the automatic close");
      assert(folder.failed === false, "not failed");
    }, { philogg: bridge });
  }

  section("342g. the folder's ✕ closes its open log, viewers and text files (no undo, nothing left in #tree), drops the viewer records and the folder view");
  {
    const dirs = { "/data": { "a.log": simLog(1), "v1.png": jsonBody(1), "v2.png": jsonBody(2), "t.txt": "a\nb" } };
    const bridge = mkBridge(dirs, {});
    await withApp(async (w, d, T) => {
      bridge.installFetch(w);
      const folder = await watch(w, T);
      const plain = await w.addFile("plain.log", simLog(7), () => {});
      await w.loadFolderFile(folder, folder.files.find(r => r.name === "a.log"));
      await w.loadFolderFile(folder, folder.files.find(r => r.name === "v1.png"));
      const v1 = folder.inlineViewers.get("v1.png");
      await w.loadFolderFile(folder, folder.files.find(r => r.name === "t.txt"));
      const textNode = Object.values(T.state.nodes).find(n => n.name === "t.txt");
      await w.loadFolderFile(folder, folder.files.find(r => r.name === "v2.png"));
      const v2 = folder.inlineViewers.get("v2.png");
      assert(v1.cacheKey && v2.cacheKey, "sanity: both viewers are persisted (cache on)");
      assert(T.state.inlineViewer === v2, "sanity: v2 is shown");
      const folderNodes = Object.values(T.state.nodes).filter(n => n.folderId === folder.id).length;
      assert(folderNodes === 2 && textNode, "sanity: one log node + one text file node belong to the folder");
      const undoBefore = T.undoStack.length;

      fireClick(d.querySelector(".folder-watch-close"), w);
      assert(T.state.folders.length === 0 && d.querySelector(".folder-watch") === null, "the folder is gone");
      assert(T.state.rootIds.join() === plain.id && Object.keys(T.state.nodes).every(id => T.state.nodes[id] === plain || T.state.nodes[id].parentId === plain.id || id === plain.id),
        "only the unrelated plain file is left; nothing of the folder remained as a top-level file, got " + T.state.rootIds.length + " roots");
      assert(T.state.nodes[textNode.id] === undefined, "the text file node is closed");
      assert(T.state.inlineViewer === null && folder.inlineViewers.size === 0, "the viewers are closed, none is shown");
      assert(d.querySelectorAll("#tree .tree-row").length === 1, "#tree shows just the plain file's row, got " + d.querySelectorAll("#tree .tree-row").length);
      assert(T.undoStack.length === undoBefore, "no undo entries");
      const gone = await waitFor(async () => !(await w.cacheStoreOp("files", "readonly", st => st.get(v1.cacheKey))) && !(await w.cacheStoreOp("files", "readonly", st => st.get(v2.cacheKey))));
      assert(gone, "the viewers' persisted records are deleted");
      assert(w.persistedViewerList().length === 0, "the session meta no longer lists them");

      // The folder minimap (container view) of a removed folder is not left selected.
      await w.openFolderPickerFlow();
      const folder2 = T.state.folders[0];
      w.selectFolderContainer(folder2.id);
      assert(T.state.folderView === folder2.id, "sanity: the folder view is showing");
      fireClick(d.querySelector(".folder-watch-close"), w);
      assert(T.state.folderView === null, "removing the folder clears its folder view");
    }, { philogg: bridge, indexedDB: new IDBFactory() });
  }

  section("342h. the ZIP's ✕ closes its opened entries: a shown log node, a viewer and a text file node — no invisible orphan in state.rootIds");
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
    const zipBytes = () => storedZip([
      { name: "a.log", data: simLog(1) }, { name: "b.log", data: simLog(2) }, { name: "notes.png", data: "PNGDATA" }, { name: "t.txt", data: "a\nb" },
    ]);
    await withApp(async (w, d, T) => {
      const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
      const plain = await w.addFile("plain.log", simLog(7), () => {});
      const zipNode = () => Object.values(T.state.nodes).find(n => n.zipId === zip.id && n.name === "a.log");
      w.openZipEntry(zip.entries.find(e => e.name === "a.log"), zip);
      await waitFor(() => zipNode() && typeof zipNode().loadFraction !== "number" && zipNode().entries.length > 0);
      const logNode = zipNode();
      w.openZipEntry(zip.entries.find(e => e.name === "notes.png"), zip);
      await waitFor(() => zip.inlineViewers.has("notes.png"));
      const viewer = zip.inlineViewers.get("notes.png");
      w.openZipEntry(zip.entries.find(e => e.name === "t.txt"), zip);
      await waitFor(() => Object.values(T.state.nodes).some(n => n.zipId === zip.id && n.name === "t.txt" && typeof n.loadFraction !== "number" && n.entries.length > 0));
      const textNode = Object.values(T.state.nodes).find(n => n.zipId === zip.id && n.name === "t.txt");
      assert(textNode.formatId === "fmt-plaintext", "sanity: the text entry is open as a plain-text node of the ZIP");
      T.state.inlineViewer = null; T.state.activeId = logNode.id; w.render();
      assert(T.state.rootIds.includes(logNode.id) && T.state.activeId === logNode.id, "sanity: the ZIP's log node is open and the active file");
      const undoBefore = T.undoStack.length;

      fireClick(d.querySelector("#zipList .folder-watch-close"), w);
      assert(T.state.zips.length === 0 && d.querySelector("#zipList .folder-watch") === null, "the ZIP is gone");
      assert(T.state.nodes[logNode.id] === undefined && !T.state.rootIds.includes(logNode.id), "its opened log node is closed, not left in state.rootIds");
      assert(T.state.nodes[textNode.id] === undefined, "the text file node is closed");
      assert(zip.inlineViewers.size === 0 && T.state.inlineViewer === null, "the viewer is closed");
      assert(T.state.rootIds.join() === plain.id, "only the unrelated plain file remains, got " + T.state.rootIds.length + " roots");
      assert(T.state.activeId === plain.id, "state.activeId no longer points at the removed ZIP's node, got " + T.state.activeId);
      assert(T.undoStack.length === undoBefore, "no undo entries");
    });
    // A shown viewer of the ZIP is cleared too.
    await withApp(async (w, d, T) => {
      const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
      w.openZipEntry(zip.entries.find(e => e.name === "notes.png"), zip);
      await waitFor(() => T.state.inlineViewer && T.state.inlineViewer.name === "notes.png");
      fireClick(d.querySelector("#zipList .folder-watch-close"), w);
      assert(T.state.inlineViewer === null && T.state.zips.length === 0, "a viewer shown from the removed ZIP is cleared");
    });
  }
}
