// GROUP 321 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 321 — Mute (disable) a filter node (FEATURE_BACKLOG #14)
   Origin: 2026-09-29. node.muted passes the parent's result through
   unchanged (getEntries), children evaluate against it; NOT is ignored while
   muted; files/locked nodes are not mutable. Tree-row eye button, sidebar
   toolbar Mute/Unmute, context menu, multi-select bulk action (one undo
   step), rebindable "m" shortcut; muted nodes are skipped by Table/Plot
   inheritance, the Link pair view and highlight rules; `muted` travels
   through every persistence carrier.
   ============================================================ */
group(321);

await withApp(async (w, d, T) => {
  section("321a. getEntries: passthrough, children evaluate against the grandparent, NOT ignored while muted, toggle never stale");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const a = w.createFilterNode(f.id, "text", "message 1");
  const child = w.createFilterNode(a.id, "text", "message 12");
  const fileLen = f.entries.length;
  const aLen = w.getEntries(a.id).length, childLen = w.getEntries(child.id).length;
  assert(aLen < fileLen && childLen > 0 && childLen < aLen, "sanity: file " + fileLen + " > a " + aLen + " > child " + childLen);
  w.toggleMuteWithUndo([a.id]);
  assert(a.muted === true, "toggleMuteWithUndo sets node.muted");
  assert(w.getEntries(a.id) === f.entries || w.getEntries(a.id).length === fileLen, "a muted node returns its parent's result unchanged (" + w.getEntries(a.id).length + ")");
  const childMuted = w.getEntries(child.id).length;
  const direct = w.createFilterNode(f.id, "text", "message 12");
  assert(childMuted === w.getEntries(direct.id).length && childMuted >= childLen, "the child now evaluates against the grandparent (" + childMuted + ")");
  w.toggleMuteWithUndo([a.id]);
  assert(!a.muted && !("muted" in a), "second toggle removes the field");
  assert(w.getEntries(a.id).length === aLen && w.getEntries(child.id).length === childLen, "unmuting restores both results (no stale cache)");
  // NOT is ignored while muted but kept
  w.toggleInvertWithUndo(a.id);
  const invLen = w.getEntries(a.id).length;
  assert(invLen === fileLen - aLen, "sanity: inverted result is the complement");
  w.toggleMuteWithUndo([a.id]);
  assert(a.inverted === true && w.getEntries(a.id).length === fileLen, "muted + inverted: passthrough, the NOT flag is kept");
  w.toggleMuteWithUndo([a.id]);
  assert(w.getEntries(a.id).length === invLen, "unmute re-applies the kept NOT");
  // level counts follow
  w.toggleMuteWithUndo([a.id]);
  const lc = w.getLevelCounts(a.id);
  assert(Object.values(lc).reduce((x, y) => x + y, 0) === fileLen, "level counts of a muted node equal the parent's");
});

await withApp(async (w, d, T) => {
  section("321b. not mutable: files and the locked Bookmarks node");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.toggleBookmark(f.entries[0].id);
  const bm = Object.values(T.state.nodes).find(n => n.filterType === "bookmarks");
  w.toggleMuteWithUndo([f.id]); w.toggleMuteWithUndo([bm.id]);
  assert(!f.muted && !bm.muted, "toggleMuteWithUndo ignores file and locked nodes");
  w.render();
  const rows = [...d.querySelectorAll("#tree .tree-row")];
  assert(rows.every(r => !r.classList.contains("muted")), "no muted row");
  const fileRow = rows.find(r => r.querySelector(".tree-label").textContent === "a.log");
  assert(fileRow && !fileRow.querySelector(".tree-mute"), "file row has no eye button");
  const bmRow = rows.find(r => r.querySelector(".tree-label").textContent.toLowerCase().includes("bookmark"));
  assert(bmRow && !bmRow.querySelector(".tree-mute"), "Bookmarks row has no eye button");
  T.state.multiSelect = new Set([bm.id]); T.state.activeId = bm.id; w.render();
  assert(w.describeSidebarToolbarActions().actions.find(a => a.action === "mute").disabled === true, "toolbar Mute disabled for the locked node");
  T.state.multiSelect = new Set([f.id]); T.state.activeId = f.id; w.render();
  assert(w.describeSidebarToolbarActions().actions.find(a => a.action === "mute").disabled === true, "toolbar Mute disabled for a file");
  T.state.multiSelect = new Set(); w.render();
  assert(w.describeSidebarToolbarActions().actions.find(a => a.action === "mute").disabled === true, "toolbar Mute disabled with nothing selected");
});

await withApp(async (w, d, T) => {
  section("321c. tree row: .muted class, eye button (before the x), tooltips, count = parent count, click toggles without selecting");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const a = w.createFilterNode(f.id, "text", "message 1");
  const other = w.createFilterNode(f.id, "text", "message 2");
  T.state.activeId = other.id; T.state.multiSelect = new Set([other.id]); w.render();
  const rowOf = n => [...d.querySelectorAll("#tree .tree-row")].find(r => r.querySelector(".tree-label").title.includes(n.name));
  let row = rowOf(a);
  const eye = row.querySelector(".tree-mute");
  assert(eye && eye.nextElementSibling === row.querySelector(".tree-del"), "eye button sits directly before the x");
  assert(eye.title === "Mute — pass entries through unchanged (M)" && eye.querySelector("use").getAttribute("href") === "#i-eye", "unmuted: eye icon + Mute tooltip");
  fireClick(eye, w);
  assert(a.muted === true, "clicking the eye mutes");
  assert(T.state.activeId === other.id && T.state.multiSelect.has(other.id) && !T.state.multiSelect.has(a.id), "the click did not select the row (stopPropagation)");
  row = rowOf(a);
  assert(row.classList.contains("muted"), "row has .muted");
  assert(row.querySelector(".tree-mute").title === "Unmute (M)" && row.querySelector(".tree-mute use").getAttribute("href") === "#i-eye-off", "muted: eye-off icon + Unmute tooltip");
  const cnt = row.querySelector(".tree-count");
  assert(cnt.textContent === f.entries.length.toLocaleString("de-DE"), "count shows the parent's count, got " + cnt.textContent);
  assert(cnt.title === "Muted — passes all " + f.entries.length + " entries through", "count tooltip, got " + cnt.title);
  fireClick(row.querySelector(".tree-mute"), w);
  assert(!a.muted && !rowOf(a).classList.contains("muted"), "clicking again unmutes");
  const css = d.documentElement.innerHTML;
  assert(/\.tree-row\.muted \.tree-label\{[^}]*line-through/.test(css) && /\.tree-row\.muted \.tree-mute\{[^}]*--level-warn/.test(css), "muted CSS: strike-through label, warn-tinted eye");
});

await withApp(async (w, d, T) => {
  section("321d. sidebar toolbar Mute/Unmute (after Invert), context menu, multi-select bulk action as ONE undo step");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  const t3 = w.createFilterNode(f.id, "text", "message 3");
  const pick = id => { T.state.multiSelect = new Set([id]); T.state.activeId = id; w.render(); };
  pick(t1.id);
  const acts = w.describeSidebarToolbarActions().actions.map(x => x.action);
  assert(acts.indexOf("mute") === acts.indexOf("invert") + 1, "Mute sits right after Invert (NOT)");
  let m = w.describeSidebarToolbarActions().actions.find(x => x.action === "mute");
  assert(m.label === "Mute" && m.disabled === false && m.target === t1.id, "enabled, labelled Mute");
  fireClick(d.querySelector('#sidebarToolbar [data-row-action="mute"]'), w);
  assert(t1.muted === true, "the toolbar button mutes the selected node");
  m = w.describeSidebarToolbarActions().actions.find(x => x.action === "mute");
  assert(m.label === "Unmute", "label flips to Unmute");
  assert(d.querySelector('#sidebarToolbar [data-row-action="mute"] use').getAttribute("href") === "#i-eye-off", "toolbar glyph flips to eye-off");
  fireClick(d.querySelector('#sidebarToolbar [data-row-action="mute"]'), w);
  assert(!t1.muted, "toolbar button unmutes");
  // context menu (single node)
  pick(t2.id);
  const row2 = [...d.querySelectorAll("#tree .tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(row2, w);
  const items = [...d.querySelectorAll("#treeContextMenu [data-action]")].map(n => n.dataset.action);
  assert(items.indexOf("mute") === items.indexOf("invert") + 1, "context menu: Mute right after Invert (NOT)");
  fireClick(d.querySelector('#treeContextMenu [data-action="mute"]'), w);
  assert(t2.muted === true, "context menu Mute mutes");
  fireContextMenu([...d.querySelectorAll("#tree .tree-row")].find(r => r.classList.contains("active")), w);
  assert(d.querySelector('#treeContextMenu [data-action="mute"]').textContent.trim() === "Unmute", "context menu label reads Unmute on a muted node");
  fireClick(d.querySelector('#treeContextMenu [data-action="mute"]'), w);
  assert(!t2.muted, "context menu Unmute");
  // linked/context filter types can be muted through the menu too
  const link = w.createLinkNode(t1.id, t2.id, "after", 1);
  pick(link.id);
  assert(w.describeSidebarToolbarActions().actions.find(x => x.action === "mute").disabled === false, "a link node is mutable");
  // bulk: mute all, one undo step
  T.state.multiSelect = new Set([t1.id, t2.id, t3.id]); T.state.activeId = t1.id; w.render();
  const bulk = w.describeBulkActions([t1, t2, t3]).actions.find(x => x.action === "mute");
  assert(bulk && bulk.label === "Mute", "bulk action 'Mute' for a selection of unmuted filters");
  t2.muted = true;
  assert(w.describeBulkActions([t1, t2, t3]).actions.find(x => x.action === "mute").label === "Mute", "mixed selection: Mute = mute all");
  delete t2.muted;
  fireContextMenu([...d.querySelectorAll("#tree .tree-row")][1], w);
  const bulkItems = [...d.querySelectorAll("#treeContextMenu [data-action]")].map(n => n.dataset.action);
  assert(bulkItems.includes("mute") && !bulkItems.includes("and"), "multi-select context menu offers Mute");
  w.closeTreeContextMenu();
  const before = w.eval("undoStack.length");
  T.state.multiSelect = new Set([t1.id, t2.id, t3.id]); w.render();
  w.performBulkAction("mute", [t1.id, t2.id, t3.id]);
  assert(t1.muted && t2.muted && t3.muted, "all three muted");
  assert(w.eval("undoStack.length") === before + 1, "one undo entry for the whole batch");
  assert(w.describeBulkActions([t1, t2, t3]).actions.find(x => x.action === "mute").label === "Unmute", "all muted: label Unmute");
  w.undo();
  assert(!t1.muted && !t2.muted && !t3.muted, "one undo un-mutes all three");
  w.redo();
  assert(t1.muted && t2.muted && t3.muted, "redo re-mutes all three");
  w.undo();
  // toast labels (batch and single)
  const toast = () => d.querySelector("#copyToast") ? d.querySelector("#copyToast").textContent : "";
  w.performBulkAction("mute", [t1.id, t2.id, t3.id]);
  w.undo();
  assert(/^mute undone/.test(toast()), "batch mute: toast reads 'mute undone', got " + toast());
  w.redo();
  assert(/^mute redone/.test(toast()), "batch mute redo toast, got " + toast());
  w.undo();
  // single: undo/redo restore via the edit entry
  w.toggleMuteWithUndo([t1.id]);
  w.undo();
  assert(/^mute undone/.test(toast()), "single mute: toast reads 'mute undone', got " + toast());
  assert(!t1.muted, "undo of a single toggle");
  w.redo();
  assert(t1.muted === true && w.getEntries(t1.id).length === f.entries.length, "redo of a single toggle");
  w.toggleMuteWithUndo([t1.id]);
  w.undo();
  assert(/^unmute undone/.test(toast()), "unmute toast, got " + toast());
  // different-root selection still offers Mute
  const g = await w.addFile("b.log", makeLog(0, 10), () => {});
  const tg = w.createFilterNode(g.id, "text", "message 1");
  const cross = w.describeBulkActions([t1, tg]);
  assert(cross.actions.map(x => x.action).join() === "mute" && cross.short === "Filters from different files", "different roots: Mute offered, combine note kept");
  w.performBulkAction("mute", [t1.id, tg.id]);
  assert(t1.muted !== false && tg.muted === true, "cross-file bulk mute applies to both");
});

await withApp(async (w, d, T) => {
  section("321e. shortcut m: rebindable action, acts on the active node / on all of a 2+ multi-selection (one undo)");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  const act = w.eval("SHORTCUT_ACTIONS.find(a => a.id === 'muteFilter')");
  assert(act && act.default.key === "m" && !act.default.ctrl && act.label === "Mute/unmute a filter", "SHORTCUT_ACTIONS has muteFilter (default M)");
  T.state.focusRegion = "tree"; // the mute shortcut is tree-only (GROUP 345)
  T.state.activeId = t1.id; T.state.multiSelect = new Set([t1.id]); w.render();
  fireKeydown(d, w, "m");
  assert(t1.muted === true && !t2.muted, "M mutes the active filter");
  fireKeydown(d, w, "m");
  assert(!t1.muted, "M again unmutes");
  T.state.activeId = f.id; T.state.multiSelect = new Set([f.id]); w.render();
  fireKeydown(d, w, "m");
  assert(!f.muted, "M on a file does nothing");
  T.state.multiSelect = new Set([t1.id, t2.id]); T.state.activeId = t1.id; w.render();
  const before = w.eval("undoStack.length");
  fireKeydown(d, w, "m");
  assert(t1.muted && t2.muted && w.eval("undoStack.length") === before + 1, "M with 2+ selected mutes them all in one undo step");
  // typing in an input never triggers it
  T.state.multiSelect = new Set([t1.id]); T.state.activeId = t1.id; w.render();
  const inp = d.createElement("input"); d.body.appendChild(inp); inp.focus();
  fireKeydown(inp, w, "m");
  assert(t1.muted === true, "M typed into an input does not toggle");
  inp.remove();
});

await withApp(async (w, d, T) => {
  section("321f. persistence: cloneSubtree, snapshot/restore, JSON export/import, session cache round trip, edit-undo fields");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const a = w.createFilterNode(f.id, "text", "message 1");
  const kid = w.createFilterNode(a.id, "text", "message 12");
  w.toggleMuteWithUndo([a.id]);
  const cl = w.cloneSubtree(a.id, f.id);
  assert(cl.muted === true, "cloneSubtree keeps muted (copy/paste)");
  const snap = w.snapshotSubtree(a.id);
  assert(snap.muted === true, "snapshotSubtree carries muted");
  delete T.state.nodes[a.id];
  const restored = w.restoreSubtree(snap);
  T.state.nodes[restored.id] = restored;
  assert(restored.muted === true && restored.id === a.id, "restoreSubtree restores muted under the same id");
  assert(w.captureNodeFields(a).muted === true, "captureNodeFields includes muted");
  const fields = w.captureNodeFields(a); fields.muted = false;
  w.applyNodeFields(a, fields);
  assert(!("muted" in a), "applyNodeFields(muted:false) removes the field");
  a.muted = true;

  const br = w.serializeFilterBranch(a.id, true);
  assert(br.roots[0].muted === true && !("muted" in br.roots[0].children[0]), "serializeFilterBranch emits muted only on the muted node");
  const json = JSON.stringify({ format: "philogg-filters", version: 2, roots: br.roots, activeRef: br.activeRef });
  const f2 = await w.addFile("b.log", makeLog(0, 40), () => {});
  const s = d.createElement("script"); s.textContent = `loadFilterTargetId = ${JSON.stringify(f2.id)};`; d.body.appendChild(s);
  w.importFilterJson(json);
  const imported = f2.children.map(id => T.state.nodes[id]).find(n => n.filterType === "text");
  assert(imported && imported.muted === true, "importFilterJson restores muted");
  assert(w.getEntries(imported.id).length === f2.entries.length, "the imported muted node passes through");

  const { roots } = w.serializeFilterTreeForCache(f);
  assert(roots.some(r => r.muted === true), "serializeFilterTreeForCache writes muted");
  const f3 = await w.addFile("c.log", makeLog(0, 40), () => {});
  const refMap = w.materializeCachedFilters(f3, roots);
  const cached = Object.values(refMap).map(id => T.state.nodes[id]).find(n => n.muted);
  assert(cached && cached.filterType === "text", "session cache round trip keeps muted");
});

await withApp(async (w, d, T) => {
  section("321g. muted link node: plain entry table instead of the Link pair view");
  const lines = [];
  for (let i = 0; i < 10; i++) lines.push(`2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${i % 2 === 0 ? "REF" : "TARGET"} ${i}"`);
  const f = await w.addFile("linked.log", lines.join("\n") + "\n", () => {});
  const ref = w.createFilterNode(f.id, "text", "REF");
  const tgt = w.createFilterNode(f.id, "text", "TARGET");
  const link = w.createLinkNode(ref.id, tgt.id, "after", 1);
  T.state.activeId = link.id; T.state.multiSelect = new Set([link.id]); w.render();
  assert(d.querySelector("#linkWrap").style.display !== "none" && w.isLinkNode(link), "sanity: the active link node shows the Link view");
  w.toggleMuteWithUndo([link.id]);
  w.render();
  assert(!w.isLinkNode(link) && d.querySelector("#linkWrap").style.display === "none", "muted: no Link view");
  assert(w.getEntries(link.id).length === f.entries.length && w.getEntries(link.id)[0].id !== undefined, "muted link passes plain entries through");
  w.toggleMuteWithUndo([link.id]);
  w.render();
  assert(d.querySelector("#linkWrap").style.display !== "none", "unmuting brings the Link view back");
});

await withApp(async (w, d, T) => {
  section("321h. muted wildcard node does not unlock Table/Plot (lookup skips it); highlight map and text-match highlighting skip muted nodes");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const ext = w.createFilterNode(f.id, "text", "message [*:int]");
  const under = w.createFilterNode(ext.id, "level", ["INFO"]);
  assert(w.nodeIsExtractionView(ext) && w.findExtractionAncestor(under) === ext, "sanity: the wildcard node (and its child) unlock Table/Plot");
  w.toggleMuteWithUndo([ext.id]);
  assert(!w.nodeIsExtractionView(ext) && !w.nodeIsExtractionView(under), "muted wildcard node: no Table/Plot for it or its child");
  w.toggleMuteWithUndo([ext.id]);
  const mid = w.createFilterNode(ext.id, "level", ["INFO"]);
  const leaf = w.createFilterNode(mid.id, "level", ["INFO"]);
  w.toggleMuteWithUndo([mid.id]);
  assert(w.findExtractionAncestor(leaf) === ext, "a muted node in between is skipped, the lookup keeps going up");
  // highlight map
  const hl = w.createFilterNode(f.id, "text", "message 1");
  hl.highlightColor = "#ff0000";
  assert(w.computeHighlightMap(f.id).size > 0, "sanity: the highlight rule colours entries");
  w.toggleMuteWithUndo([hl.id]);
  assert(w.computeHighlightMap(f.id).size === 0, "a muted node contributes nothing to computeHighlightMap");
  w.toggleMuteWithUndo([hl.id]);
  T.state.activeId = hl.id;
  w.toggleMuteWithUndo([hl.id]);
  assert(hl.muted && !w.getTextMatchHighlightNodes().some(n => n.id === hl.id), "a muted node is dropped from the text-match highlight chain");
  assert(!w.getHighlightMatchNodes().some(n => n.id === hl.id), "and from the highlight-rule match nodes");
  // assertions on a muted extraction node are not evaluated: the muted node is no extraction view at all
  const ext2 = w.createFilterNode(f.id, "text", "line [*:int]");
  ext2.assertions = { 0: { mode: "range", min: 0, max: 1 } };
  w.toggleMuteWithUndo([ext2.id]);
  assert(!w.nodeIsExtractionView(ext2), "a muted node with assertions shows no extraction table, so none are evaluated/flagged");
});
