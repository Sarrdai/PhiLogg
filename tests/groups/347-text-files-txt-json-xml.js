// GROUP 347 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 347 — Text files (.txt/.json/.xml) load as ONE plain-text file node
   Origin: 2026-10-01, person-requested (docs/archive/ui-concept-text-files.md, Step 1
   of docs/ui-and-views.md "Text files"). Every entry point (loose files,
   a watched folder, a ZIP entry) that used to open an inline text viewer now
   loads an ordinary file node pinned to the Plain text format
   (formatIdForLoad) with node.textSyntax = "json" | "xml" | null; the
   viewer, its "Filter lines" copy and the viewerSource nesting are gone
   (images keep the inline image viewer). JSON gets node.textLayout "pretty"
   (default when valid) | "raw" (invalid JSON, or chosen): setTextLayout
   re-parses in place — same node id, filter children kept and recomputed —
   and the layout (plus the file's own text, node.textRaw) survives
   snapshot/restore (undo), the session cache and a folder tail (a pretty
   file reloads whole). Sample data: tools/log-sim (jsondoc/xmldoc/plain).
   ============================================================ */
group(347);
if (groupSelected()) {
  const PT = "fmt-plaintext";
  const jsonDoc = (entries, seed) => LOGSIM.generateToStrings({ format: "jsondoc", entries: entries || 6, seed: seed || 3 })[0];
  const xmlDoc = LOGSIM.generateToStrings({ format: "xmldoc", entries: 6, seed: 3 })[0];
  const txtDoc = LOGSIM.generateToStrings({ format: "plain", entries: 8, seed: 5 })[0];
  const prettyLines = text => JSON.stringify(JSON.parse(text), null, 2).split("\n");
  const lineCount = text => text.replace(/\r?\n$/, "").split(/\r?\n/).length;
  const loaded = n => n && !n.queued && typeof n.loadFraction !== "number" && n.entries.length > 0;
  const nodeNamed = (T, name) => Object.values(T.state.nodes).find(n => n.type === "file" && n.name === name);
  const fakeFileHandle = (w, name, text) => ({
    kind: "file", name,
    async getFile() {
      const blob = new w.Blob([text]);
      Object.defineProperty(blob, "name", { value: name, configurable: true });
      Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
      blob.text = async () => text;
      blob.arrayBuffer = async () => new w.TextEncoder().encode(text).buffer;
      blob.slice = start => { const t = text.slice(start); const b = new w.Blob([t]); b.text = async () => t; return b; };
      return blob;
    },
  });
  const fakeDir = (w, name, map) => ({ kind: "directory", name, async *values() { for (const f of Object.keys(map)) yield fakeFileHandle(w, f, map[f]); } });
  const storedZip = entries => {
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

  await withApp(async (w, d, T) => {
    section("347a. Loose files: .txt/.json/.xml each become exactly one plain-text node, no viewer; JSON is pretty by default");
    const json = jsonDoc();
    assert(!json.text.includes("\n") && JSON.parse(json.text).entries.length === 6, "sanity: the simulator's JSON document is minified, valid, one line");
    await w.loadFileDescriptors([
      { file: new w.File([txtDoc.text], "notes.txt"), handle: null },
      { file: new w.File([json.text], "orders.json"), handle: null },
      { file: new w.File([xmlDoc.text], "orders.xml"), handle: null },
    ]);
    assert(T.state.inlineViewer === null && T.state.looseInlineViewers.size === 0, "no inline viewer anywhere");
    assert(T.state.rootIds.length === 3 && d.querySelector("#mergeLoadDialog").classList.contains("hidden"), "three root nodes; plain-text files never raise the merge-on-load question, got " + T.state.rootIds.length);
    const txt = nodeNamed(T, "notes.txt"), js = nodeNamed(T, "orders.json"), xml = nodeNamed(T, "orders.xml");
    [txt, js, xml].forEach(n => assert(n && n.formatId === PT && !n.queued && !n.mergeOwnerId, n && n.name + " is an ordinary plain-text file node"));
    assert(txt.textSyntax === null && js.textSyntax === "json" && xml.textSyntax === "xml", "textSyntax from the extension (null for .txt)");
    assert(txt.textLayout === undefined && xml.textLayout === undefined, "textLayout is JSON-only");
    assert(txt.entries.length === lineCount(txtDoc.text) && txt.entries[0].message === txtDoc.text.split("\n")[0], ".txt: one entry per line");
    assert(xml.entries.length === lineCount(xmlDoc.text), ".xml: one entry per line (" + xml.entries.length + ")");
    const pretty = prettyLines(json.text);
    assert(js.textLayout === "pretty" && js.entries.length === pretty.length && pretty.length > 20 && js.entries.every((e, i) => e.message === pretty[i]), ".json: pretty by default — one entry per pretty-printed line");
    assert(js.textRaw === json.text, "the file's own text is kept for a layout switch");
    // A log dropped with a text file: the log keeps its merge question logic (only one mergeable file -> none).
    assert(d.querySelectorAll("#tree .tree-row").length === 3, "three tree rows, no viewer row");

    section("347b. Invalid JSON loads raw, silently");
    const broken = jsonDoc().text.slice(0, -7);
    await w.loadFileDescriptors([{ file: new w.File([broken], "broken.json"), handle: null }]);
    const b = nodeNamed(T, "broken.json");
    assert(b && b.textLayout === "raw" && b.entries.length === 1 && b.entries[0].message === broken && b.formatId === PT, "one raw line, layout raw");
    assert(d.querySelector("#copyToast") === null || !/valid JSON/.test(d.querySelector("#copyToast").textContent), "no toast about it");
    assert(await w.setTextLayout(b.id, "pretty") === false && b.textLayout === "raw" && b.entries.length === 1, "switching to pretty refuses for invalid JSON, nothing changes");
  });

  await withApp(async (w, d, T) => {
    section("347c. Watched folder: a text file opens as one plain-text node of the folder (rec.nodeId), never a viewer");
    const json = jsonDoc();
    await w.addWatchedFolder(fakeDir(w, "docs", { "orders.json": json.text, "notes.txt": txtDoc.text, "app.log": makeLog(0, 2) }));
    const folder = T.state.folders[0];
    assert(folder.files.map(r => r.name).sort().join(",") === "app.log,notes.txt,orders.json", "text files are listed with the log");
    const rec = folder.files.find(r => r.name === "orders.json");
    await w.loadFolderFile(folder, rec);
    const node = T.state.nodes[rec.nodeId];
    assert(node && node.formatId === PT && node.folderId === folder.id && node.textSyntax === "json" && node.textLayout === "pretty", "plain-text node tagged with the folder, pretty");
    assert(node.entries.length === prettyLines(json.text).length, "parsed from the pretty print");
    assert(folder.inlineViewers.size === 0 && T.state.inlineViewer === null, "no viewer registered");
    assert(d.querySelectorAll(".folder-watch .tree-row").length === 1, "its row is a normal tree row inside the folder box");
    const trec = folder.files.find(r => r.name === "notes.txt");
    await w.loadFolderFile(folder, trec);
    assert(T.state.nodes[trec.nodeId].textSyntax === null && T.state.nodes[trec.nodeId].entries.length === lineCount(txtDoc.text), "a .txt too");
  });

  await withApp(async (w, d, T) => {
    section("347d. ZIP entries: a text entry loads as one plain-text node of the ZIP, never a viewer");
    const json = jsonDoc();
    const zip = await w.openZipSource(new w.File([storedZip([{ name: "orders.json", data: json.text }, { name: "orders.xml", data: xmlDoc.text }, { name: "notes.txt", data: txtDoc.text }])], "docs.zip"), "docs.zip");
    for (const name of ["orders.json", "orders.xml", "notes.txt"]) {
      w.openZipEntry(zip.entries.find(e => e.name === name), zip);
      await waitFor(() => loaded(Object.values(T.state.nodes).find(n => n.zipId === zip.id && n.name === name)));
    }
    const nodes = Object.values(T.state.nodes).filter(n => n.zipId === zip.id);
    assert(nodes.length === 3 && nodes.every(n => n.formatId === PT), "three plain-text nodes inside the ZIP");
    assert(zip.inlineViewers.size === 0 && T.state.inlineViewer === null, "no viewer");
    const js = nodes.find(n => n.name === "orders.json");
    assert(js.textLayout === "pretty" && js.entries.length === prettyLines(json.text).length, "the JSON entry is pretty");
    assert(d.querySelectorAll("#zipList .tree-row").length === 3, "the entries render as tree rows in the ZIP section");
  });

  await withApp(async (w, d, T) => {
    section("347e. Layout switch re-parses in place: same id, filter children kept and recomputed, line ranges keep their numbers");
    const json = jsonDoc();
    await w.loadFileDescriptors([{ file: new w.File([json.text], "orders.json"), handle: null }]);
    const f = nodeNamed(T, "orders.json");
    const pretty = prettyLines(json.text);
    const levelLines = pretty.filter(l => l.includes('"level"')).length;
    const text = w.createFilterNode(f.id, "text", '"level"');
    const range = w.createFilterNode(f.id, "timerange", { from: 2, to: 3 });
    assert(w.getEntries(text.id).length === levelLines && levelLines === 6, "pretty: the text filter hits one line per entry");
    assert(w.getEntries(range.id).length === 2, "pretty: the line range 2-3 holds two lines");
    const id = f.id, oldIds = f.entries.map(e => e.id);

    assert(await w.setTextLayout(id, "raw") === true, "switch to raw");
    assert(T.state.nodes[id] === f && f.textLayout === "raw" && f.children.join() === [text.id, range.id].join(), "same node, same children");
    assert(f.entries.length === 1 && f.entries[0].message === json.text && f.entries[0].ts === 1, "raw: the file's own single line");
    assert(oldIds.every(i => T.entryIndex[i] === undefined), "the old entries left the entry index");
    assert(w.getEntries(text.id).length === 1, "the text filter recomputed on the raw line");
    assert(w.getEntries(range.id).length === 0, "the line range keeps its numbers (lines 2-3 don't exist in raw)");
    assert(T.state.nodes[text.id].parentId === id, "filter children still hang under the node");
    assert(await w.setTextLayout(id, "raw") === false, "switching to the layout it already has is a no-op");

    assert(await w.setTextLayout(id, "pretty") === true && f.textLayout === "pretty", "back to pretty");
    assert(f.entries.length === pretty.length && w.getEntries(text.id).length === levelLines && w.getEntries(range.id).length === 2, "everything recomputed again");
    const txt = await w.addFile("notes.txt", txtDoc.text, () => {}, PT);
    assert(await w.setTextLayout(txt.id, "raw") === false, "no layout for a non-JSON node");
    assert(await w.setTextLayout("nope", "raw") === false && await w.setTextLayout(id, "wide") === false, "unknown node/layout refused");
  });

  await withApp(async (w, d, T) => {
    section("347f. textLayout survives snapshot/restore (delete + undo)");
    const json = jsonDoc();
    await w.loadFileDescriptors([{ file: new w.File([json.text], "orders.json"), handle: null }]);
    const f = nodeNamed(T, "orders.json");
    await w.setTextLayout(f.id, "raw");
    const snap = w.snapshotSubtree(f.id);
    assert(snap.textLayout === "raw" && snap.textSyntax === "json" && snap.textRaw === json.text, "the snapshot carries layout, syntax and the file's own text");
    w.deleteFilterNodeWithUndo(f.id);
    assert(!T.state.nodes[f.id], "sanity: closed");
    w.undo();
    const back = T.state.nodes[f.id];
    assert(back && back.textLayout === "raw" && back.textSyntax === "json" && back.textRaw === json.text && back.entries.length === 1, "undo restores the raw layout");
    assert(await w.setTextLayout(back.id, "pretty") === true && back.entries.length === prettyLines(json.text).length, "...and the layout can still be switched from the restored node");
  });

  const factory = new IDBFactory();
  const json346 = jsonDoc(6, 9);
  await withApp(async (w, d, T) => {
    section("347g. The session cache keeps the layout: written as the file's own text, restored with its layout");
    await T.bootRestore;
    await w.loadFileDescriptors([{ file: new w.File([json346.text], "orders.json"), handle: null }, { file: new w.File([xmlDoc.text], "orders.xml"), handle: null }]);
    const f = nodeNamed(T, "orders.json");
    await waitFor(async () => !!(await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey))));
    let rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec.textLayout === "pretty" && rec.textSyntax === "json" && rec.blob && !rec.text, "default pretty: the record holds the original file (blob) and the layout");
    await w.setTextLayout(f.id, "raw");
    await w.persistFileNode(f, true);
    rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec.textLayout === "raw" && rec.text === json346.text, "after a switch: the text record is the file's own text, not the pretty lines");
    const x = nodeNamed(T, "orders.xml");
    await waitFor(async () => !!(await w.cacheStoreOp("files", "readonly", s => s.get(x.cacheKey))));
    assert((await w.cacheStoreOp("files", "readonly", s => s.get(x.cacheKey))).textSyntax === "xml", "the XML node's syntax is recorded");
    await w.persistMetaNow();
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    section("347h. Reload: both nodes come back as plain text with their syntax; raw stays raw and can switch to pretty");
    await T.bootRestore;
    const f = nodeNamed(T, "orders.json"), x = nodeNamed(T, "orders.xml");
    assert(f && f.formatId === PT && f.textSyntax === "json" && f.textLayout === "raw" && f.entries.length === 1 && f.textRaw === json346.text, "the JSON file is back raw (one line)");
    assert(x && x.formatId === PT && x.textSyntax === "xml" && x.entries.length === lineCount(xmlDoc.text), "the XML file is back");
    assert(T.state.looseInlineViewers.size === 0 && T.state.inlineViewer === null, "no viewer");
    assert(await w.setTextLayout(f.id, "pretty") === true && f.entries.length === prettyLines(json346.text).length, "the restored node switches to pretty from its own text");
    await w.persistFileNode(f, true);
    await w.persistMetaNow();
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    section("347i. Reload again: a pretty layout is restored pretty (record text/blob stays the raw document)");
    await T.bootRestore;
    const f = nodeNamed(T, "orders.json");
    assert(f && f.textLayout === "pretty" && f.entries.length === prettyLines(json346.text).length && f.textRaw === json346.text, "pretty restored from the raw document");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    section("347j. Tail: a pretty JSON file reloads whole when it changes; a plain .txt still appends lines");
    const small = jsonDoc(4, 2), big = jsonDoc(9, 2);
    await w.loadFileDescriptors([{ file: new w.File([small.text], "live.json"), handle: null }, { file: new w.File([txtDoc.text], "live.txt"), handle: null }]);
    const f = nodeNamed(T, "live.json"), t = nodeNamed(T, "live.txt");
    let jsonNow = small.text, txtNow = txtDoc.text;
    const blobOf = text => { const b = new w.Blob([text]); b.text = async () => text; b.slice = (a, z) => { const s = text.slice(a, z); const bl = new w.Blob([s]); bl.text = async () => s; return bl; }; return b; };
    const tailOf = (get, len) => ({ handle: { async getFile() { return blobOf(get()); } }, offset: len, pending: "", failed: false, busy: false, gzipChecked: true, lastGrowth: Date.now() });
    f.tail = tailOf(() => jsonNow, jsonNow.length);
    t.tail = tailOf(() => txtNow, txtNow.length);
    jsonNow = big.text;
    txtNow = txtDoc.text + "appended one\nappended two\n";
    const tid = t.entries.length;
    const idsBefore = new Set(f.entries.map(e => e.id));
    await w.tailTick();
    const prettyBig = prettyLines(big.text);
    assert(f.entries.length === prettyBig.length && f.entries.every((e, i) => e.message === prettyBig[i]), "the JSON node was reloaded from the whole grown file (pretty lines)");
    assert(f.entries.every(e => !idsBefore.has(e.id)) && f.textRaw === big.text && f.textLayout === "pretty", "...with fresh entries, the new raw text and the same layout");
    assert(f.tail.offset === big.text.length, "the tail offset follows the file");
    assert(t.entries.length === tid + 2 && t.entries[tid].message === "appended one", "the .txt just appended its two new lines");
  });

  await withApp(async (w, d, T) => {
    section("347k. The text viewer is gone: no Filter-lines button, no nesting helpers; images keep their viewer");
    assert(!d.querySelector("#itvFilterLinesBtn") && !d.querySelector("#inlineTextViewer") && !d.querySelector("#itvPrettyPrintBtn") && !d.querySelector("#itvWrapBtn"), "the text half of the inline viewer toolbar/markup is gone");
    assert(typeof w.openInlineViewerAsTextLog === "undefined" && typeof w.viewerTextLogIds === "undefined" && typeof w.isNestedUnderViewer === "undefined", "the Filter-lines / nesting functions are gone");
    assert(!/viewerSource/.test(html), "no viewerSource anywhere");
    await w.loadFileDescriptors([{ file: new w.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], "shot.png"), handle: null }]);
    assert(T.state.inlineViewer && T.state.inlineViewer.kind === "image" && T.state.rootIds.length === 0, "a .png still opens the inline image viewer");
    await w.loadFileDescriptors([{ file: new w.File([txtDoc.text], "notes.txt"), handle: null }]);
    assert(T.state.inlineViewer === null && T.state.activeId === T.state.rootIds[0], "opening a text file after it activates the node and leaves the viewer");
    fireKeydown(d, w, "f", { ctrlKey: true });
    assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "Ctrl+F on the text file's node opens the filter popup like for any node");
  });

  let exported347 = null;
  const json347 = jsonDoc(5, 11);
  await withApp(async (w, d, T) => {
    section("347l. Session export carries textSyntax/textLayout; an imported embedded file keeps its layout");
    await w.loadFileDescriptors([
      { file: new w.File([json347.text], "orders.json"), handle: null },
      { file: new w.File([json347.text], "orders-raw.json"), handle: null },
      { file: new w.File([txtDoc.text], "notes.txt"), handle: null },
    ]);
    const raw = nodeNamed(T, "orders-raw.json");
    assert(await w.setTextLayout(raw.id, "raw"), "one JSON switched to raw");
    const ids = T.state.rootIds.slice();
    const doc = w.buildSessionExport(ids, new Set(ids));
    const rec = n => doc.files.find(r => r.name === n);
    assert(rec("orders.json").textSyntax === "json" && rec("orders.json").textLayout === "pretty", "pretty JSON: syntax + layout exported");
    assert(rec("orders-raw.json").textLayout === "raw" && rec("notes.txt").textSyntax === null && rec("notes.txt").textLayout === undefined, "raw layout exported; .txt syntax null, no layout");
    assert(rec("orders.json").text === json347.text, "the embedded text is the file's own text, not the pretty print");
    exported347 = JSON.stringify(doc);
  });
  await withApp(async (w, d, T) => {
    w.importSessionJson(exported347);
    for (let i = 0; i < 3; i++) {
      await waitFor(() => !d.querySelector("#sessionMatchDialog").classList.contains("hidden"));
      d.querySelector('input[name="sessionMatchTarget"][value="embedded"]').checked = true;
      fireClick(d.querySelector("#sessionMatchApply"), w);
      await waitFor(() => T.state.rootIds.length === i + 1 && loaded(T.state.nodes[T.state.rootIds[i]]));
    }
    const pj = nodeNamed(T, "orders.json"), rj = nodeNamed(T, "orders-raw.json"), tx = nodeNamed(T, "notes.txt");
    assert([pj, rj, tx].every(n => n.formatId === PT), "all three imported as plain text");
    assert(pj.textLayout === "pretty" && pj.entries.length === prettyLines(json347.text).length, "the pretty JSON imports pretty");
    assert(rj.textLayout === "raw" && rj.entries.length === 1, "the raw JSON stays raw");
    assert(pj.textSyntax === "json" && tx.textSyntax === null && tx.entries.length === lineCount(txtDoc.text), "syntax kept; the .txt has one entry per line");
  });
}
