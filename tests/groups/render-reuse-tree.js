// GROUP render-reuse-tree — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fireClick, LOGSIM, ...) is in scope.

/* ============================================================
   GROUP render-reuse-tree — sidebar tree, level bar, timeline minimap,
   detail panel and status line keep unchanged elements across render()
   Covers: a render() that changed nothing writes nothing under #tree,
   #levelBar, the minimap, the detail panel and #tableRows; activating /
   muting / inverting / renaming / collapsing one node replaces only the rows
   whose markup changed; undo's restoreSubtree (new node objects) replaces the
   row so its listeners act on the live node; a click that straddles a render()
   still lands; the rename input keeps text and focus across an unrelated
   render; the ghost (temp-anchor) row survives a render; the single-container
   helpers (setHtmlSynced/setTextSynced) and the deep-container rule.
   Origin: 2026-11-13 (person-requested: no rebuilding of unchanged elements,
   step 2 after render-reuse-rows).
   ============================================================ */
group("render-reuse-tree");

// Mutation records pending on `target` (subtree); takeRecords() hands them out
// synchronously. `attrs: false` ignores attribute writes (same-value attribute
// writes of unrelated updaters are not DOM churn in the sense of this group).
function watchTree(w, target, attrs) {
  const mo = new w.MutationObserver(() => {});
  mo.observe(target, { childList: true, characterData: true, subtree: true, attributes: attrs !== false });
  return { take: () => mo.takeRecords().length, stop: () => mo.disconnect() };
}

await withApp(async (w, d, T) => {
  section("render-reuse-tree a. render() with no state change writes nothing");
  const [file] = LOGSIM.generateToStrings({ format: "default", entries: 400, seed: 7 });
  const f = await w.addFile(file.name, file.text, () => {});
  const word = f.entries[40].message.split(/\s+/).find(t => /^[A-Za-z]{5,}$/.test(t));
  const nA = w.createFilterNode(f.id, "text", word);
  const nB = w.createFilterNode(nA.id, "text", f.entries[41].message.split(/\s+/).find(t => /^[A-Za-z]{5,}$/.test(t)) || "a");
  const nC = w.createFilterNode(f.id, "text", "e");
  const nD = w.createFilterNode(f.id, "text", "a");
  // A second, untouched file: its subtree is a separate top-level wrap that nothing below changes.
  const [file2] = LOGSIM.generateToStrings({ format: "default", entries: 60, seed: 11 });
  const f2 = await w.addFile("second-" + file2.name, file2.text, () => {});
  const n2 = w.createFilterNode(f2.id, "text", "e");
  T.state.activeId = nA.id;
  w.render();
  w.selectEntry(T.currentViewEntries[2].id);
  w.render();
  w.render();

  const tree = d.querySelector("#tree");
  const regions = {
    "#tree": [tree, true],
    "#levelBar": [d.querySelector("#levelBar"), true],
    "#tableRows": [d.querySelector("#tableRows"), true],
    "the minimap": [d.querySelector("#timelineMinimap"), false],
    "the detail panel": [d.querySelector("#detailPanel"), false],
    "#statusText": [d.querySelector("#statusText"), true],
  };
  assert(tree.querySelectorAll(".tree-row").length >= 5, "sanity: the tree shows the file and the filters");
  assert(d.querySelectorAll("#levelBar .level-btn").length > 0, "sanity: the level bar has chips");
  assert(d.querySelectorAll("#timelineMinimapSvg > *").length > 5, "sanity: the minimap drew bars");
  assert(d.querySelector("#detailMeta").firstChild && d.querySelector("#detailMessage").firstChild, "sanity: the detail panel shows the selected entry");
  assert(d.querySelector("#statusText").textContent !== "", "sanity: the status line has text");
  const mons = Object.entries(regions).map(([name, [el, attrs]]) => [name, watchTree(w, el, attrs)]);
  mons.forEach(([, m]) => m.take());
  const snap = {
    rows: [...tree.querySelectorAll(".tree-row")],
    chips: [...d.querySelectorAll("#levelBar > *")],
    bars: [...d.querySelectorAll("#timelineMinimapSvg > *")],
    meta: [...d.querySelector("#detailMeta").childNodes],
    msg: [...d.querySelector("#detailMessage").childNodes],
    status: d.querySelector("#statusText").firstChild,
  };
  w.render();
  for (const [name, m] of mons) assert(m.take() === 0, "render() with no state change writes nothing to " + name);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  assert(same(snap.rows, [...tree.querySelectorAll(".tree-row")]), "...every tree row element is the same object");
  assert(same(snap.chips, [...d.querySelectorAll("#levelBar > *")]), "...every level chip is the same object");
  assert(same(snap.bars, [...d.querySelectorAll("#timelineMinimapSvg > *")]), "...every minimap bar/range/marker element is the same object");
  assert(same(snap.meta, [...d.querySelector("#detailMeta").childNodes]) && same(snap.msg, [...d.querySelector("#detailMessage").childNodes]), "...the detail panel's nodes are the same objects");
  assert(d.querySelector("#statusText").firstChild === snap.status, "...the status line's text node is the same object");
  mons.forEach(([, m]) => m.stop());

  section("render-reuse-tree b. Activating another node replaces only the rows whose active/path state changed");
  const rowsById = () => new Map([...tree.querySelectorAll(".tree-row[data-node-id]")].map(r => [r.dataset.nodeId, r]));
  let before = rowsById();
  const beforeHtml = new Map([...before].map(([id, r]) => [id, r.outerHTML]));
  fireClick(before.get(nD.id), w); // activate a leaf sibling
  assert(T.state.activeId === nD.id, "sanity: the click activated the node");
  let after = rowsById();
  const changed = [...after].filter(([id, r]) => before.get(id) !== r).map(([id]) => id);
  assert(changed.includes(nA.id) && changed.includes(nD.id), "the previously active and the newly active row are replaced, changed: " + changed.join(","));
  // The connector guides live in the rows and depend on the active path, so rows of the same
  // subtree may change too — but never one whose markup stayed the same.
  assert(changed.every(id => beforeHtml.get(id) !== after.get(id).outerHTML), "...every replaced row really changed its markup (no needless replacement)");
  assert(after.get(f2.id) === before.get(f2.id) && after.get(n2.id) === before.get(n2.id), "the rows of the other file's subtree keep their element");
  assert(tree.querySelectorAll(".tree-row.active").length === 1 && tree.querySelector(".tree-row.active").dataset.nodeId === nD.id, "...and exactly the new node is marked active");

  section("render-reuse-tree c. Mute / invert / rename / collapse replace only the affected rows");
  const replacedAfter = fn => {
    const b = rowsById();
    fn();
    const a = rowsById();
    return { a, b, changed: [...a].filter(([id, r]) => b.get(id) !== r).map(([id]) => id), gone: [...b].filter(([id]) => !a.has(id)).map(([id]) => id) };
  };
  T.state.activeId = nD.id;
  w.render();
  let r = replacedAfter(() => { w.toggleMuteWithUndo([nC.id]); w.render(); });
  assert(r.changed.length === 1 && r.changed[0] === nC.id, "muting a node replaces only its row, changed: " + r.changed.join(","));
  assert(r.a.get(nC.id).classList.contains("muted"), "...and the new row shows the mute");
  r = replacedAfter(() => { w.toggleInvertWithUndo(nC.id); w.render(); });
  assert(r.changed.length === 1 && r.changed[0] === nC.id && r.a.get(nC.id).classList.contains("inverted"), "inverting a leaf node replaces only its row");
  r = replacedAfter(() => { w.renameFilterNodeWithUndo(nC.id, "My label"); w.render(); });
  assert(r.changed.length === 1 && r.changed[0] === nC.id && r.a.get(nC.id).querySelector(".tree-label").textContent === "My label", "renaming a node replaces only its row");
  r = replacedAfter(() => { T.state.nodes[nA.id].collapsed = true; w.render(); });
  assert(r.gone.length === 1 && r.gone[0] === nB.id, "collapsing a parent removes exactly its child's row");
  assert(r.changed.length === 1 && r.changed[0] === nA.id, "...and replaces only the parent's row (new chevron); siblings keep theirs, changed: " + r.changed.join(","));
  r = replacedAfter(() => { T.state.nodes[nA.id].collapsed = false; w.render(); });
  assert(r.a.has(nB.id) && r.changed.every(id => id === nA.id || id === nB.id), "expanding brings the child row back, siblings keep theirs");

  section("render-reuse-tree d. Rebuilt node objects (undo's restoreSubtree) replace the row; its listeners act on the live node");
  const rowOf = id => tree.querySelector('.tree-row[data-node-id="' + id + '"]');
  const oldRow = rowOf(nC.id);
  const oldNode = T.state.nodes[nC.id];
  // What restoreSubtree does: the same data in a NEW object under the same id.
  T.state.nodes[nC.id] = Object.assign({}, oldNode);
  w.render();
  const newRow = rowOf(nC.id);
  assert(newRow !== oldRow, "same markup but a new node object replaces the row (token mismatch)");
  assert(newRow._syncToken[0] === T.state.nodes[nC.id], "...the new row's token is the live node");
  const sib = rowOf(nD.id);
  w.render();
  assert(rowOf(nD.id) === sib && rowOf(nC.id) === newRow, "...and a following render keeps both again");
  // A real delete + undo.
  const delNode = w.createFilterNode(f.id, "text", "zz-undo");
  w.render();
  const sibKeep = rowOf(n2.id);
  w.deleteFilterNodeWithUndo(delNode.id);
  w.render();
  assert(!rowOf(delNode.id), "sanity: the deleted node's row is gone");
  w.undo();
  w.render();
  const restored = rowOf(delNode.id);
  assert(restored && restored._syncToken[0] === T.state.nodes[delNode.id], "after undo the restored row is bound to the live node object");
  assert(rowOf(n2.id) === sibKeep, "...while an unrelated row kept its element through delete and undo");
  T.state.activeId = f.id;
  w.render();
  fireClick(restored, w);
  assert(T.state.activeId === delNode.id, "clicking the restored row activates the live node");

  section("render-reuse-tree e. A click whose render() ran between mousedown and mouseup still lands");
  const target = rowOf(nD.id);
  target.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  w.render();
  assert(rowOf(nD.id) === target && target.isConnected, "the row under the pointer is the same connected element after the render");
  target.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
  fireClick(target, w);
  assert(T.state.activeId === nD.id, "...so the click lands on it");

  section("render-reuse-tree f. The rename input keeps its text and focus across an unrelated render()");
  w.startRenameNode(nD.id);
  let input = tree.querySelector(".tree-rename-input");
  assert(input, "sanity: the rename input is in the tree");
  await waitFor(() => d.activeElement === input);
  input.value = "half typed";
  const pre = rowOf(nD.id);
  w.render();
  assert(tree.querySelector(".tree-rename-input") === input && rowOf(nD.id) === pre, "an unrelated render keeps the input element");
  assert(input.value === "half typed" && d.activeElement === input, "...with the typed text and the focus");
  w.toggleMuteWithUndo([nC.id]);
  w.render();
  assert(tree.querySelector(".tree-rename-input") === input && input.value === "half typed", "a render that changed another row keeps it as well");
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(!tree.querySelector(".tree-rename-input") && T.renamingNodeId === null, "Escape still cancels (the input's listeners are alive)");
  w.toggleMuteWithUndo([nC.id]);
  w.render();

  section("render-reuse-tree g. Level bar: a chip toggle replaces only that chip");
  const chipsBefore = [...d.querySelectorAll("#levelBar > .level-btn")];
  assert(chipsBefore.length > 2, "sanity: several chips");
  fireClick(chipsBefore[1], w);
  const chipsAfter = [...d.querySelectorAll("#levelBar > .level-btn")];
  const chipChanged = chipsAfter.filter((c, i) => c !== chipsBefore[i]);
  assert(chipChanged.length === 1 && chipChanged[0].dataset.level === chipsBefore[1].dataset.level && chipChanged[0].classList.contains("active"), "only the toggled chip is replaced and shows the active state");
  fireClick(chipChanged[0], w); // off again: the new chip's listener works
  assert(T.state.levelFilter.size === 0, "...and the replaced chip's listener toggles the level back");

  section("render-reuse-tree h. Minimap and detail panel follow the selection");
  const svg = d.querySelector("#timelineMinimapSvg");
  T.state.activeId = f.id;
  w.render();
  const bars = [...svg.querySelectorAll(".minimap-bg-bar, .minimap-ov-bar")];
  const detailBefore = d.querySelector("#detailMessage").textContent;
  const markersG = d.querySelector("#minimapSelectionMarkers");
  const rangeRect = d.querySelector("#minimapFullRangeRect");
  w.selectEntry(f.entries[10].id);
  assert(d.querySelector("#detailMessage").textContent === f.entries[10].message && detailBefore !== f.entries[10].message, "the detail panel shows the newly selected entry (not stale)");
  assert(markersG.querySelector(".minimap-marker-line"), "the minimap marks the selection");
  w.render();
  assert(d.querySelector("#minimapSelectionMarkers") === markersG && d.querySelector("#minimapFullRangeRect") === rangeRect, "the live range rect and marker group survive a render");
  w.selectEntry(f.entries[200].id);
  w.render();
  assert(markersG.querySelectorAll(".minimap-marker-line").length === 1, "the marker moved with the selection (no duplicate marker)");
  assert(bars.length > 0 && [...svg.querySelectorAll(".minimap-bg-bar, .minimap-ov-bar")].every(b => bars.includes(b)), "the bars of an unchanged result are kept");

  section("render-reuse-tree i. The ghost (temp-anchor) row survives a render");
  const sel = d.querySelector("#settingsTempAnchorMode");
  sel.value = "persistent";
  sel.dispatchEvent(new w.Event("change", { bubbles: true }));
  T.state.activeId = nA.id;
  w.render();
  const outside = f.entries.find(e => !T.currentViewEntries.some(v => v.id === e.id));
  fireClick(rowOf(f.id), w);
  w.selectEntry(outside.id);
  fireClick(rowOf(nA.id), w);
  const ghost = () => d.querySelector("#tableRows .temp-anchor-row");
  assert(ghost() && T.state.tempAnchor, "sanity: a ghost row for the selected entry outside the filter is drawn");
  const ghostEl = ghost();
  const tm = watchTree(w, d.querySelector("#tableRows"));
  w.render();
  assert(ghost() === ghostEl && tm.take() === 0, "a render() with no state change keeps the ghost row element and writes nothing");
  tm.stop();
});

await withApp(async (w, d, T) => {
  section("render-reuse-tree j. Single-container helpers and the deep-container rule");
  const host = d.createElement("div");
  d.body.appendChild(host);
  w.setHtmlSynced(host, '<span class="a">A</span> text <b>B</b>');
  const n0 = [...host.childNodes];
  const mo = new w.MutationObserver(() => {});
  mo.observe(host, { childList: true, characterData: true, attributes: true, subtree: true });
  w.setHtmlSynced(host, '<span class="a">A</span> text <b>B</b>');
  assert(mo.takeRecords().length === 0 && [...host.childNodes].every((n, i) => n === n0[i]), "setHtmlSynced with equal html writes nothing and keeps every node");
  w.setHtmlSynced(host, '<span class="a">A</span> text <b>B2</b>');
  assert(host.childNodes[0] === n0[0] && host.childNodes[1] === n0[1] && host.childNodes[2] !== n0[2] && host.lastChild.textContent === "B2", "...a changed unit is replaced, its neighbours are kept");
  w.setHtmlSynced(host, "");
  assert(host.childNodes.length === 0, "setHtmlSynced with an empty string empties the host");

  host.innerHTML = "<i>same</i>";
  w.setTextSynced(host, "same");
  assert(host.children.length === 0 && host.textContent === "same", "setTextSynced replaces markup whose flattened text merely equals the text");
  const t0 = host.firstChild;
  mo.takeRecords();
  w.setTextSynced(host, "same");
  assert(mo.takeRecords().length === 0 && host.firstChild === t0, "...and writes nothing when the host already is exactly that text node");
  w.setTextSynced(host, "");
  assert(host.childNodes.length === 0, "an empty text empties the host");
  mo.takeRecords();
  w.setTextSynced(host, "");
  assert(mo.takeRecords().length === 0, "...without writing when it is already empty");
  mo.disconnect();

  // A _syncDeep container is walked even when its markup equals the fresh one:
  // a child with a different token is replaced.
  const mk = (key, token, deep) => { const e = d.createElement("div"); e._syncKey = key; if (token !== undefined) e._syncToken = token; if (deep) e._syncDeep = true; else e.textContent = key; return e; };
  const wrapOf = tok => { const wr = mk("wrap", undefined, true); wr.appendChild(mk("kid", tok)); return wr; };
  host.textContent = "";
  const tokA = {}, tokB = {};
  w.syncChildren(host, [wrapOf(tokA)]);
  const wrap0 = host.firstChild, kid0 = wrap0.firstChild;
  w.syncChildren(host, [wrapOf(tokA)]);
  assert(host.firstChild === wrap0 && wrap0.firstChild === kid0, "deep container + equal tokens: everything kept");
  w.syncChildren(host, [wrapOf(tokB)]);
  assert(host.firstChild === wrap0 && wrap0.firstChild !== kid0 && wrap0.firstChild._syncToken === tokB, "deep container with identical markup but a different child token: the child is replaced");

  // A form control flagged _syncKeepState is never a reason to replace.
  const withInput = (typed) => { const e = d.createElement("div"); e._syncKey = "i"; const i = d.createElement("input"); i._syncKeepState = true; if (typed) i.value = typed; e.appendChild(i); return e; };
  host.textContent = "";
  w.syncChildren(host, [withInput()]);
  const live = host.firstChild;
  live.firstChild.value = "typed by the user";
  w.syncChildren(host, [withInput()]);
  assert(host.firstChild === live && live.firstChild.value === "typed by the user", "_syncKeepState: the live control keeps its value");
  host.remove();
});
