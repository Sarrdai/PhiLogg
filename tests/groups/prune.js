// GROUP prune — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP prune — "Prune file to this result…" (FEATURE_BACKLOG.md #54, step 1)
   Origin: 2026-10-07 (person-requested). A filter node's tree context menu
   offers the action, a confirmation dialog follows, and the root file keeps
   ONLY that filter's result in memory (root.entries, in root order);
   root.pruned = { total, cuts: [{ at, count, fromTs, toTs }] } records where
   entries were cut. Not undoable. Carriers: snapshot/restore, session cache
   record (source "text", never "path"/"blob"), file history (skipped),
   session export/embedded import, tail append/rotation.
   ============================================================ */
group("prune");

const pruneSim = (seed = 11, entries = 320) =>
  LOGSIM.generateToStrings({ scenarios: ["basic", "motion", "bursts", "gaps"], entries, seed })[0];

// Result of every filter node as currently served, vs. a forced full recompute.
const pruneStaleNodes = (w, T) => {
  const S = T.state;
  const ids = Object.keys(S.nodes).filter(id => S.nodes[id].type === "filter");
  const served = ids.map(id => w.getEntries(id).map(e => e.id).join(","));
  w.invalidateAllCaches();
  return ids.filter((id, i) => w.getEntries(id).map(e => e.id).join(",") !== served[i]);
};
const pruneMenuItem = (w, d, nodeId) => {
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, nodeId);
  const item = d.querySelector('#treeContextMenu [data-action="pruneToNode"]');
  return item;
};

await withApp(async (w, d, T) => {
  section("prune a. Menu item: only on a prunable filter node");
  const S = T.state;
  const sim = pruneSim();
  const f = await w.addFile(sim.name, sim.text, () => {});
  S.activeId = f.id;
  const tick = w.createFilterNode(f.id, "text", "Scheduler tick");
  const none = w.createFilterNode(f.id, "text", "zzz-no-such-text");
  const all = w.createFilterNode(f.id, "timerange", { from: null, to: null });
  w.render();
  const sub = w.getEntries(tick.id);
  assert(sub.length > 0 && sub.length < f.entries.length, "fixture: the text filter is a proper subset, got " + sub.length + "/" + f.entries.length);
  let item = pruneMenuItem(w, d, tick.id);
  assert(!!item && item.textContent.trim() === "Prune file to this result…", "filter node: menu offers the item with its exact label, got " + (item && item.textContent));
  assert(!!item.querySelector("svg"), "the item carries the prune icon");
  w.closeTreeContextMenu();
  assert(!pruneMenuItem(w, d, f.id), "file node: no item");
  w.closeTreeContextMenu();
  assert(w.getEntries(none.id).length === 0 && !pruneMenuItem(w, d, none.id), "empty result: no item");
  w.closeTreeContextMenu();
  assert(w.getEntries(all.id).length === f.entries.length && !pruneMenuItem(w, d, all.id), "whole-file result: no item");
  w.closeTreeContextMenu();
  f.loadFraction = 0.5;
  assert(!pruneMenuItem(w, d, tick.id), "file still loading: no item");
  w.closeTreeContextMenu();
  delete f.loadFraction;

  const PT = "fmt-plaintext";
  const t = await w.addFile("notes.txt", Array.from({ length: 40 }, (_, i) => "line " + i).join("\n") + "\n", () => {}, PT);
  const tf = w.createFilterNode(t.id, "text", "line 1");
  w.render();
  assert(!pruneMenuItem(w, d, tf.id), "plain-text root: no item");
  w.closeTreeContextMenu();
});

await withApp(async (w, d, T) => {
  section("prune b. Dialog texts, Cancel/Esc, Prune");
  const S = T.state;
  const sim = pruneSim();
  const f = await w.addFile(sim.name, sim.text, () => {});
  S.activeId = f.id;
  const tick = w.createFilterNode(f.id, "text", "Scheduler tick");
  const other = w.createFilterNode(f.id, "text", "Heartbeat");
  w.render();
  const total = f.entries.length;
  const kept = w.getEntries(tick.id).length;
  const fmt = n => n.toLocaleString("de-DE");
  const dlg = d.querySelector("#pruneDialog");
  assert(dlg.classList.contains("hidden"), "dialog starts hidden");
  fireClick(pruneMenuItem(w, d, tick.id), w);
  assert(!dlg.classList.contains("hidden"), "menu item opens the dialog");
  assert(d.querySelector("#pruneDialog .link-dialog-title").textContent === "Prune file to this result?", "dialog title");
  const expectBody = "“" + f.name + "” keeps the " + fmt(kept) + " entries of “" + w.nodeDisplayName(tick) + "” and drops the other " + fmt(total - kept) +
    " from memory. Other filters on this file are recomputed. This cannot be undone; reopen the file to get the dropped entries back.";
  assert(d.querySelector("#pruneBody").textContent === expectBody, "dialog body, got: " + d.querySelector("#pruneBody").textContent);
  const pct = Math.round(kept / total * 100);
  assert(d.querySelector("#pruneMeterCaption").textContent === "Keeps " + fmt(kept) + " of " + fmt(total) + " entries (" + pct + "%)", "meter caption: " + d.querySelector("#pruneMeterCaption").textContent);
  assert(d.querySelector("#pruneMeterFill").style.width === Math.max(1, pct) + "%", "meter fill width");
  assert(d.querySelector("#pruneCancel").textContent === "Cancel" && d.querySelector("#pruneConfirm").textContent === "Prune" &&
    d.querySelector("#pruneConfirm").classList.contains("btn-mini") && d.querySelector("#pruneCancel").classList.contains("btn-mini-secondary"), "buttons Cancel (secondary) / Prune (primary)");

  fireClick(d.querySelector("#pruneCancel"), w);
  assert(dlg.classList.contains("hidden") && f.entries.length === total && !f.pruned, "Cancel closes without pruning");
  fireClick(pruneMenuItem(w, d, tick.id), w);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(dlg.classList.contains("hidden") && f.entries.length === total && !f.pruned, "Esc closes without pruning");

  const keptIds = w.getEntries(tick.id).map(e => e.id);
  const droppedIds = f.entries.filter(e => !keptIds.includes(e.id)).map(e => e.id);
  const otherBefore = w.getEntries(other.id).length;
  const bmEntry = f.entries.find(e => !keptIds.includes(e.id));
  w.toggleBookmark(bmEntry.id);
  S.notes.set(bmEntry.id, "dropped note");
  const keepBm = f.entries.find(e => keptIds.includes(e.id));
  w.toggleBookmark(keepBm.id);
  S.selectedId = bmEntry.id;
  fireClick(pruneMenuItem(w, d, tick.id), w);
  fireClick(d.querySelector("#pruneConfirm"), w);
  assert(dlg.classList.contains("hidden"), "Prune closes the dialog");
  assert(f.entries.length === kept && f.entries.map(e => e.id).join(",") === keptIds.join(","), "root.entries is exactly the result, in root order");
  assert(droppedIds.every(id => !T.entryIndex[id]) && keptIds.every(id => T.entryIndex[id]), "dropped ids leave entryIndex, kept ids stay");
  assert(!S.bookmarks.has(bmEntry.id) && !S.notes.has(bmEntry.id) && S.bookmarks.has(keepBm.id), "bookmark/note of a dropped entry removed, kept one stays");
  assert(S.selectedId === null, "selection on a dropped entry is cleared");
  assert(w.getEntries(tick.id).length === kept, "the pruning node now shows 100%");
  assert(w.getEntries(other.id).length < otherBefore || otherBefore === 0, "other filters recomputed on the pruned set: " + otherBefore + " -> " + w.getEntries(other.id).length);
  assert(f.pruned && f.pruned.total === total, "root.pruned.total is the original count");
  assert(f.pruned.cuts.reduce((s, c) => s + c.count, 0) === total - kept, "cut counts add up to the dropped entries");
  assert(pruneStaleNodes(w, T).length === 0, "no filter serves a stale cache after the prune");
  assert(/Pruned to .* of .* entries/.test(d.querySelector("#copyToast").textContent), "toast reports the result");
  const row = d.querySelector('#tree .tree-row[data-id="' + f.id + '"], #tree [data-node-id="' + f.id + '"]');
  const iconEl = row && row.querySelector(".tree-icon");
  assert(iconEl && iconEl.innerHTML.includes("i-file-pruned"), "file row shows the pruned icon");
  assert(/^Pruned: kept .* of .* entries \(\d+ cuts?\)$/.test(iconEl.title), "file tooltip line: " + (iconEl && iconEl.title));
});

await withApp(async (w, d, T) => {
  section("prune c. Cuts: leading, middle, trailing; re-prune merges");
  const S = T.state;
  const sim = pruneSim(5, 200);
  const f = await w.addFile(sim.name, sim.text, () => {});
  S.activeId = f.id;
  const n = f.entries.length;
  const e = i => f.entries[i];
  // keep a middle window: leading + trailing cut
  const win = w.createFilterNode(f.id, "timerange", { from: e(50).ts, to: e(149).ts });
  const winLen = w.getEntries(win.id).length;
  const first = w.getEntries(win.id)[0], last = w.getEntries(win.id)[winLen - 1];
  const i0 = f.entries.indexOf(first), i1 = f.entries.indexOf(last);
  assert(w.pruneFileToNode(win.id), "prune to a middle window");
  let cuts = f.pruned.cuts;
  assert(cuts.length === 2 && cuts[0].at === 0 && cuts[0].count === i0 && cuts[1].at === winLen && cuts[1].count === n - 1 - i1,
    "leading cut at 0, trailing cut at entries.length: " + JSON.stringify(cuts));
  assert(cuts[1].toTs >= cuts[1].fromTs && cuts[0].toTs <= f.entries[0].ts, "cut timestamps are those of the dropped entries");

  // re-prune: keep two disjoint pieces via a text filter that skips the middle
  const sel = w.createSelectionFilterNode(f.id, [0, 1, 2, 10, 11, 12].map(i => f.entries[i].id));
  const before = f.pruned;
  assert(w.pruneFileToNode(sel.id), "re-prune");
  assert(f.entries.length === 6 && f.pruned !== before, "re-prune replaces root.pruned wholesale");
  assert(f.pruned.total === n, "total stays the original count: " + f.pruned.total);
  const sum = f.pruned.cuts.reduce((s, c) => s + c.count, 0);
  assert(sum === n - 6, "all dropped entries are accounted for across both prunes, got " + sum + " of " + (n - 6));
  const ats = f.pruned.cuts.map(c => c.at);
  assert(ats.join(",") === ats.slice().sort((a, b) => a - b).join(",") && new Set(ats).size === ats.length, "cuts sorted by at, one per position: " + ats);
  assert(ats[0] === 0 && ats.includes(3) && ats[ats.length - 1] === 6, "leading, middle (between the two pieces) and trailing cut, got " + ats);
  assert(pruneStaleNodes(w, T).length === 0, "no stale caches after the re-prune");
});

await withApp(async (w, d, T) => {
  section("prune d. Link node keeps its tuple entries; inverted filter");
  const S = T.state;
  const sim = pruneSim();
  const f = await w.addFile(sim.name, sim.text, () => {});
  S.activeId = f.id;
  const move = w.createFilterNode(f.id, "text", "Move requested");
  const reach = w.createFilterNode(f.id, "text", "Position reached");
  const link = w.createLinkNode(move.id, reach.id, "after", 1);
  assert(link && w.getEntries(link.id).length > 0, "fixture: link result non-empty");
  const keptIds = new Set();
  w.getEntries(link.id).forEach(p => w.getTupleEntries(p).forEach(x => keptIds.add(x.id)));
  const expected = f.entries.filter(x => keptIds.has(x.id)).map(x => x.id);
  assert(expected.length < f.entries.length, "fixture: link covers part of the file");
  w.render();
  assert(!!pruneMenuItem(w, d, link.id), "link node offers the item");
  w.closeTreeContextMenu();
  assert(w.pruneFileToNode(link.id), "prune to link");
  assert(f.entries.map(x => x.id).join(",") === expected.join(","), "kept the real entries underneath the pairs, in root order");
  assert(pruneStaleNodes(w, T).length === 0, "no stale caches after pruning to a link");
});
await withApp(async (w, d, T) => {
  const S = T.state;
  const sim = pruneSim(13);
  const f = await w.addFile(sim.name, sim.text, () => {});
  S.activeId = f.id;
  const inv = w.createFilterNode(f.id, "text", "Heartbeat", true);
  const want = w.getEntries(inv.id).map(x => x.id);
  assert(want.length > 0 && want.length < f.entries.length, "fixture: inverted filter is a proper subset");
  assert(w.pruneFileToNode(inv.id) && f.entries.map(x => x.id).join(",") === want.join(","), "inverted filter: kept = its (inverted) result");
  assert(w.getEntries(inv.id).length === want.length, "the inverted node still shows everything left");
});

await withApp(async (w, d, T) => {
  section("prune e. A merge still holds shared entries; pruning a merge leaves its sources alone");
  const S = T.state;
  const fa = await w.addFile("a.log", pruneSim(31, 120).text, () => {});
  const fb = await w.addFile("b.log", pruneSim(32, 120).text, () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  const na = w.createFilterNode(fa.id, "text", "Scheduler tick");
  const keptA = new Set(w.getEntries(na.id).map(x => x.id));
  const bm = fa.entries.find(x => !keptA.has(x.id));
  w.toggleBookmark(bm.id);
  assert(merged.entries.includes(bm), "fixture: the merge shares the entry object");
  assert(w.pruneFileToNode(na.id), "prune the source");
  assert(!!T.entryIndex[bm.id], "an entry the merge still holds stays in entryIndex");
  assert(S.bookmarks.has(bm.id), "its bookmark stays too");
  const nm = w.createFilterNode(merged.id, "text", "Heartbeat");
  const mBefore = merged.entries.length, aLen = fa.entries.length, bLen = fb.entries.length;
  assert(w.pruneFileToNode(nm.id), "prune the merge");
  assert(merged.entries.length < mBefore && fa.entries.length === aLen && fb.entries.length === bLen && !fb.pruned, "sources untouched");
  assert(merged.pruned && merged.merged, "the merge carries the cuts");
});

await withApp(async (w, d, T) => {
  section("prune f. Snapshot/restore (close + undo) carries node.pruned");
  const S = T.state;
  const sim = pruneSim();
  const f = await w.addFile(sim.name, sim.text, () => {});
  S.activeId = f.id;
  const tick = w.createFilterNode(f.id, "text", "Scheduler tick");
  w.pruneFileToNode(tick.id);
  const pr = f.pruned;
  const snap = w.snapshotSubtree(f.id);
  assert(snap.pruned === pr, "snapshotSubtree copies pruned");
  w.deleteNode(f.id);
  const node = w.restoreSubtree(snap);
  assert(node && node.pruned && node.pruned.total === pr.total && node.pruned.cuts.length === pr.cuts.length, "restoreSubtree brings pruned back");
});

await withApp(async (w, d, T) => {
  section("prune g. Session cache record: pruned persisted, source is text; history skips the file");
  const idb = new IDBFactory();
  let key, expected;
  await withApp(async (w1, d1, T1) => {
    const sim = pruneSim();
    const f = await w1.addFile(sim.name, sim.text, () => {});
    T1.state.activeId = f.id;
    f.localPath = "/tmp/" + sim.name; // a desktop file: would be a "path" record unprune'd
    f._cacheBlob = new w1.Blob([sim.text]);
    const tick = w1.createFilterNode(f.id, "text", "Scheduler tick");
    w1.pruneFileToNode(tick.id);
    assert(!f._cacheBlob, "prune drops the cached original blob");
    assert(w1.fileCacheSource(f) === "text", "cache source of a pruned file is text, got " + w1.fileCacheSource(f));
    await w1.persistFileNode(f, true);
    await w1.persistMetaNow();
    key = f.cacheKey;
    expected = { n: f.entries.length, pruned: f.pruned, raw: f.entries.map(x => x.raw).join("\n") };
    const rec = await w1.cacheStoreOp("files", "readonly", s => s.get(key));
    assert(rec && typeof rec.text === "string" && !rec.blob && rec.pruned && rec.pruned.total === f.pruned.total, "record: text source + pruned");
    assert(rec.text.split("\n").filter(l => l.startsWith("20")).length >= 1 && !rec.text.includes("Heartbeat"), "record text holds the kept entries only");
    await w1.persistFileHistoryNow();
    const hist = await w1.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
    assert(!hist || hist.length === 0, "file history skips a pruned root, got " + (hist && hist.length));
    assert(w1.buildFileHistoryRecords().puts.length === 0, "buildFileHistoryRecords emits nothing for it");
  }, { indexedDB: idb });
  await withApp(async (w2, d2, T2) => {
    await T2.bootRestore;
    const f = T2.state.nodes[T2.state.rootIds[0]];
    assert(f && f.entries.length === expected.n, "restored with the kept entries only: " + (f && f.entries.length) + " vs " + expected.n);
    assert(f.pruned && f.pruned.total === expected.pruned.total && JSON.stringify(f.pruned.cuts) === JSON.stringify(expected.pruned.cuts), "pruned restored from the cache record");
  }, { indexedDB: idb });
});

await withApp(async (w, d, T) => {
  section("prune h. Session export carries pruned; the embedded import applies it, a match does not");
  const S = T.state;
  const sim = pruneSim();
  const f = await w.addFile(sim.name, sim.text, () => {});
  S.activeId = f.id;
  const tick = w.createFilterNode(f.id, "text", "Scheduler tick");
  w.pruneFileToNode(tick.id);
  const doc = w.buildSessionExport([f.id], new Set([f.id]));
  const rec = doc.files[0];
  assert(rec.pruned && rec.pruned.total === f.pruned.total && rec.entryCount === f.entries.length && typeof rec.text === "string", "export record carries pruned + the pruned text");
  const node = await w.addSessionRecordText(JSON.parse(JSON.stringify(rec)), "imported.log", rec.text);
  assert(node.entries.length === f.entries.length && node.pruned && JSON.stringify(node.pruned) === JSON.stringify(f.pruned), "materialized embedded log gets pruned");
  const plain = await w.addFile("own.log", sim.text, () => {});
  w.applySessionEntryByOrdinal({ filters: [], bookmarks: [], notes: [], pruned: rec.pruned }, plain);
  assert(!plain.pruned, "applying a record onto the receiver's own file ignores pruned");
  const bad = await w.addSessionRecordText({ pruned: { total: "x", cuts: 3 } }, "bad.log", sim.text);
  assert(!bad.pruned, "a malformed pruned field is ignored");
});

await withApp(async (w, d, T) => {
  section("prune i. Tail: appends keep the cuts, rotation clears pruned");
  const S = T.state;
  const initial = makeLog(0, 30);
  let text = initial;
  const handle = {
    _setText(t) { text = t; },
    async getFile() {
      const blob = new w.Blob([text]);
      Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
      blob.slice = (start) => { const s = text.slice(start); const b = new w.Blob([s]); b.text = async () => s; return b; };
      return blob;
    },
  };
  const f = await w.addFile("live.log", initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false };
  S.activeId = f.id;
  const win = w.createFilterNode(f.id, "timerange", { from: f.entries[5].ts, to: f.entries[14].ts });
  w.pruneFileToNode(win.id);
  const keptN = f.entries.length;
  const cutsBefore = JSON.stringify(f.pruned.cuts);
  assert(f.pruned.cuts.length === 2 && f.pruned.cuts[1].at === keptN, "fixture: leading + trailing cut");
  text = initial + makeLog(30, 3, { msgPrefix: "appended" });
  await w.tailTick();
  assert(f.entries.length === keptN + 3, "appended lines arrive unpruned, got " + f.entries.length);
  assert(f.pruned && JSON.stringify(f.pruned.cuts) === cutsBefore, "cut positions stay valid after an append");
  handle._setText(makeLog(0, 2, { msgPrefix: "rotated" }));
  await w.tailTick();
  assert(f.entries.length === 2 && !f.pruned, "rotation replaces the entries wholesale and clears pruned");
});

// ---- Step 2: placeholders (Context view fillers, Filtered view row edges) ----

// A 200-entry file pruned to old indices 5-8, 100-103 and 190: cuts at 0 (5),
// 4 (91), 8 (86) and a trailing one at 9 (9). Returns the file and the nodes.
const prunedFixture = async (w, T) => {
  const S = T.state;
  const sim = pruneSim(5, 200);
  const f = await w.addFile(sim.name, sim.text, () => {});
  S.activeId = f.id;
  const keepIdx = [5, 6, 7, 8, 100, 101, 102, 103, 190];
  const sel1 = w.createSelectionFilterNode(f.id, keepIdx.map(i => f.entries[i].id));
  const orig = f.entries.slice();
  assert(w.pruneFileToNode(sel1.id), "fixture: pruned");
  const cuts = f.pruned.cuts;
  assert(cuts.map(c => c.at + ":" + c.count).join(",") === "0:5,4:91,8:86,9:9", "fixture cuts: " + JSON.stringify(cuts));
  const F = w.createSelectionFilterNode(f.id, [1, 6].map(i => f.entries[i].id));
  return { f, F, orig, sel1 };
};
const showCtx = (w, T, id) => { T.state.activeId = id; w.render(); w.applyFhView("highlight"); };

await withApp(async (w, d, T) => {
  section("prune j. Context view on a filter node: pruned fillers at the cuts, gaps split there");
  const S = T.state;
  const { f, F, orig } = await prunedFixture(w, T);
  showCtx(w, T, F.id);
  const rows = T.currentHighlightViewEntries;
  assert(T.contextActive && rows.length === 2 && rows[0] === f.entries[1] && rows[1] === f.entries[6], "collapsed view: the two matches");
  assert(T.contextGaps.map(g => g.start + "-" + g.end).join(",") === "0-1,2-4,4-6,7-8,8-9", "gaps split at the cuts: " + T.contextGaps.map(g => g.start + "-" + g.end));
  const kinds = k => (T.contextStrips.get(k) || []).map(x => x.kind).join(",");
  assert(kinds(-1) === "pruned,gap" && kinds(0) === "gap,pruned,gap" && kinds(1) === "gap,pruned,gap,pruned", "fillers in order: " + [kinds(-1), kinds(0), kinds(1)].join(" | "));
  assert(T.contextStrips.get(-1)[0].cut === f.pruned.cuts[0] && T.contextStrips.get(1)[3].cut === f.pruned.cuts[3], "fillers carry their cut objects");
  const off = T.highlightRowOffsets;
  const H = w.CONTEXT_STRIP_HEIGHT || 22;
  assert(off[0] === 2 * H && (off[1] - off[0]) - 3 * H === (off[2] - off[1]) - 4 * H, "row offsets add up with the extra strips: " + Array.from(off).join(","));
  const els = [...d.querySelectorAll("#highlightRows .ctx-pruned")];
  assert(els.length === 4, "four pruned placeholders rendered, got " + els.length);
  const fmtT = ms => w.formatTime(ms);
  const c0 = f.pruned.cuts[0];
  assert(els[0].textContent.trim() === "5 entries pruned · " + fmtT(c0.fromTs) + " – " + fmtT(c0.toTs), "label: " + els[0].textContent);
  assert(els[0].title === els[0].textContent.trim() && els[0].style.height === "22px" && !els[0].classList.contains("ctx-show-more"), "tooltip, height");
  assert(!!els[0].querySelector("svg"), "carries the prune icon");
  const before = JSON.stringify([...T.contextExpansions]);
  fireClick(els[1], w);
  assert(JSON.stringify([...T.contextExpansions]) === before, "a pruned placeholder is not clickable");
  const n = () => d.querySelectorAll("#highlightRows .ctx-gap-placeholder:not(.ctx-pruned)").length;
  assert(n() === 5, "five ordinary gap fillers beside the four placeholders, got " + n());

  // reveal one half of a split gap: the placeholder stays, the other half stays hidden
  const g = [...d.querySelectorAll("#highlightRows .ctx-gap-placeholder:not(.ctx-pruned)")].find(x => /2 lines/.test(x.textContent));
  fireClick(g, w);
  assert(T.contextExpansions.size === 1 && T.currentHighlightViewEntries.length === 4, "clicking a half reveals only that half (2 rows)");
  assert(d.querySelectorAll("#highlightRows .ctx-pruned").length === 4, "placeholders unchanged after a reveal");
  assert(T.contextStrips.size >= 1 && !(T.contextStrips.get(-1) || []).some(x => x.kind === "gap" && x.gapStart === 2), "revealed half has no gap filler any more");

  // expand all / collapse all: placeholders are never gaps
  w.setAllGapsExpanded(true);
  assert(T.currentHighlightViewEntries.length === f.entries.length, "expand all reveals every remaining entry");
  assert(d.querySelectorAll("#highlightRows .ctx-gap-placeholder:not(.ctx-pruned)").length === 0 && d.querySelectorAll("#highlightRows .ctx-pruned").length === 4, "expanded: only the 4 placeholders remain");
  w.setAllGapsExpanded(false);
  assert(T.currentHighlightViewEntries.length === 2, "collapse all");
  assert(!T.contextGaps.some(x => x.start === undefined) && T.contextGaps.length === 5, "the toolbar counts see ordinary gaps only (5)");

  // expand around matches: a piece's edge at a cut borders the cut, not a match
  T.contextExpandStep = 1;
  w.expandAroundAllMatches();
  const ex = k => JSON.stringify(T.contextExpansions.get(k) || null);
  assert(ex(2) === JSON.stringify([{ from: 2, to: 3 }]) && ex(4) === JSON.stringify([{ from: 5, to: 6 }]), "only match-side edges open: gap 2-4 top, gap 4-6 bottom; got " + ex(2) + " / " + ex(4));
});

await withApp(async (w, d, T) => {
  section("prune k. Context view on the file node: strips only, no gaps");
  const S = T.state;
  const { f } = await prunedFixture(w, T);
  showCtx(w, T, f.id);
  assert(!T.contextActive && T.currentHighlightViewEntries === f.entries, "file node: whole file, contextActive false");
  const keys = [...T.contextStrips.keys()].sort((a, b) => a - b);
  assert(keys.join(",") === "-1,3,7,8" && [...T.contextStrips.values()].every(a => a.length === 1 && a[0].kind === "pruned"), "strips after rows -1, 3, 7 and 8 only: " + keys);
  const off = T.highlightRowOffsets;
  assert(off[0] === 22 && off[f.entries.length] - off[0] >= f.entries.length * 20, "offsets include the strips");
  const els = [...d.querySelectorAll("#highlightRows .ctx-pruned")];
  assert(els.length === 4, "four placeholders rendered on the file node, got " + els.length);
  const order = [...d.querySelectorAll("#highlightRows > *")].map(x => x.classList.contains("ctx-pruned") ? "P" : "r").join("");
  assert(order.startsWith("P" + "rrrr" + "P" + "rrrr" + "P" + "r" + "P"), "placeholders sit at the cut positions: " + order);
  // a file with no cuts renders none
  const g = await w.addFile("plain.log", pruneSim(6, 50).text, () => {});
  showCtx(w, T, g.id);
  assert(d.querySelectorAll("#highlightRows .ctx-pruned").length === 0 && T.contextStrips.size === 0, "unpruned file: no placeholders");
});

await withApp(async (w, d, T) => {
  section("prune l. Filtered view: edge decoration on the file node only, no extra rows");
  const S = T.state;
  const { f, F } = await prunedFixture(w, T);
  S.activeId = f.id;
  w.render();
  w.applyFhView("filter");
  const rowsEl = () => [...d.querySelectorAll("#tableRows .log-row")];
  assert(rowsEl().length === f.entries.length, "no extra rows: " + rowsEl().length + " vs " + f.entries.length);
  const marked = rowsEl().filter(r => r.classList.contains("pruned-before")).map(r => f.entries.findIndex(e => e.id === r.dataset.entryId));
  assert(marked.join(",") === "0,4,8", "pruned-before on the first row after each cut: " + marked);
  const last = rowsEl()[f.entries.length - 1];
  assert(last.classList.contains("pruned-after") && last.classList.contains("pruned-before"), "trailing cut decorates the last row's bottom edge");
  const h = new Set(rowsEl().map(r => r.style.height));
  assert(h.size === 1, "row heights stay uniform: " + [...h]);
  const r4 = rowsEl()[4];
  assert(r4.title === w.prunedPlaceholderText(f.pruned.cuts[1]) && r4.querySelector(".pruned-mark svg") && !r4.querySelector(".pruned-mark").textContent.trim(), "tooltip carries the full placeholder text, the gutter icon has no text");
  assert(rowsEl()[0].querySelector(".pruned-mark-first"), "leading icon stays inside the first row");
  assert(rowsEl()[1].title === "" && !rowsEl()[1].querySelector(".pruned-mark"), "other rows are untouched");
  // under a filter node: nothing
  S.activeId = F.id;
  w.render();
  w.applyFhView("filter");
  assert(d.querySelectorAll("#tableRows .pruned-before, #tableRows .pruned-after, #tableRows .pruned-mark").length === 0, "a filter node's Filtered view has no placeholder");
  // under a column sort the file is not in file order: no marks
  S.activeId = f.id;
  S.sortColumn = "level";
  S.sortDir = "asc";
  w.render();
  assert(d.querySelectorAll("#tableRows .pruned-before").length === 0, "no decoration under a column sort");
});
