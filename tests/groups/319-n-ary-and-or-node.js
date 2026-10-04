// GROUP 319 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 319 — N-ary AND/OR (node.baked[]) + #sidebarToolbar multi mode
   Origin: 2026-09-28 (filter-actions Phase B), multi mode 2026-09-29.
   createAndOrNode(ids, mode) takes 2+ filters; the node carries baked:
   [cond, cond, ...] (link keeps bakedA/bakedB). With 2+ nodes selected
   #sidebarToolbar swaps its single-node row for describeBulkActions' actions
   or a short message (full note as tooltip) on the accent-soft highlight.
   ============================================================ */
group(319);

await withApp(async (w, d, T) => {
  section("319a. createAndOrNode(ids, mode): 3-way AND/OR evaluation, name, baked[] shape, guards");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const a = w.createFilterNode(f.id, "text", "message 1");
  const b = w.createFilterNode(f.id, "text", "message 3");
  const c = w.createFilterNode(f.id, "text", "ge 1");
  const idsOf = n => new Set(w.getEntries(n.id).map(e => e.id));
  const A = idsOf(a), B = idsOf(b), C = idsOf(c);
  const and3 = w.createAndOrNode([a.id, b.id, c.id], "and");
  assert(Array.isArray(and3.baked) && and3.baked.length === 3 && and3.bakedA === undefined && and3.bakedB === undefined, "baked is a 3-element array, no bakedA/bakedB");
  assert(and3.baked.map(x => x.value).join("|") === "message 1|message 3|ge 1", "baked keeps selection order");
  assert(and3.name === "“message 1” ∧ “message 3” ∧ “ge 1”", "name joins all display names with ∧, got " + and3.name);
  const expAnd = [...A].filter(id => B.has(id) && C.has(id));
  const gotAnd = w.getEntries(and3.id).map(e => e.id);
  assert(gotAnd.length === expAnd.length && gotAnd.every(id => expAnd.includes(id)), "AND = entries matching all three (" + expAnd.length + ")");
  const or3 = w.createAndOrNode([a.id, b.id, c.id], "or");
  assert(or3.name === "“message 1” ∨ “message 3” ∨ “ge 1”", "OR name uses ∨");
  const expOr = new Set([...A, ...B, ...C]);
  const gotOr = w.getEntries(or3.id).map(e => e.id);
  assert(gotOr.length === expOr.size && gotOr.every(id => expOr.has(id)), "OR = union of all three (" + expOr.size + ")");
  const ts = w.getEntries(or3.id).map(e => e.ts);
  assert(ts.every((t, i) => i === 0 || ts[i - 1] <= t), "OR result is chronological");
  assert(w.createAndOrNode([a.id], "and") === null && w.createAndOrNode([], "or") === null, "fewer than 2 ids -> null");
  assert(w.createAndOrNode([a.id, b.id], "xor") === null, "unknown mode -> null");
  // nested: an AND node as one of 3 sides of an OR
  const d1 = w.createFilterNode(f.id, "text", "message 2");
  const nested = w.createAndOrNode([and3.id, d1.id, a.id], "or");
  assert(nested && nested.baked[0].filterType === "and" && Array.isArray(nested.baked[0].baked) && nested.baked[0].baked.length === 3, "nested combiner bakes its own baked[]");
  const expNested = new Set([...gotAnd, ...idsOf(d1), ...A]);
  assert(w.getEntries(nested.id).length === expNested.size, "nested N-ary evaluation, expected " + expNested.size);
  w.render();
  const row = [...d.querySelectorAll("#tree .tree-row")].find(r => r.classList.contains("filter-and"));
  assert(row && row.querySelector(".tree-label").title.includes("“message 1” ∧ “message 3” ∧ “ge 1”"), "row label carries the full name as tooltip");
});

await withApp(async (w, d, T) => {
  section("319b. baked[] through every persistence carrier + undo/redo + Unpack + legacy import");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const a = w.createFilterNode(f.id, "text", "message 1");
  const b = w.createFilterNode(f.id, "text", "message 3");
  const c = w.createFilterNode(f.id, "text", "message 2");
  const node = w.createAndOrNode([a.id, b.id, c.id], "or");
  const vals = n => (n.baked || []).map(x => x.value).join("|");
  const V = "message 1|message 3|message 2";
  assert(vals(node) === V, "sanity");
  const cl = w.cloneSubtree(node.id, f.id);
  assert(vals(cl) === V && cl.baked !== node.baked && cl.baked[0] !== node.baked[0], "cloneSubtree deep-copies baked[]");
  const snap = w.snapshotSubtree(node.id);
  assert(vals(snap) === V && snap.baked !== node.baked, "snapshotSubtree copies baked[]");
  delete T.state.nodes[node.id];
  const restored = w.restoreSubtree(snap);
  assert(restored.id === node.id && vals(restored) === V, "restoreSubtree keeps id and baked[]");
  T.state.nodes[restored.id] = restored;

  const json = JSON.stringify({ format: "philogg-filters", version: 2, ...(() => { const br = w.serializeFilterBranch(node.id, false); return { activeRef: br.activeRef, roots: br.roots }; })() });
  assert(JSON.parse(json).roots[0].baked.length === 3, "serializeFilterBranch emits baked[]");
  const f2 = await w.addFile("b.log", makeLog(0, 40), () => {});
  const s = d.createElement("script"); s.textContent = `loadFilterTargetId = ${JSON.stringify(f2.id)};`; d.body.appendChild(s);
  w.importFilterJson(json);
  const imported = f2.children.map(id => T.state.nodes[id]).find(n => n.filterType === "or");
  assert(imported && vals(imported) === V, "importFilterJson restores baked[]");
  assert(w.getEntries(imported.id).length === w.getEntries(node.id).length, "imported node evaluates like the original");

  const { roots } = w.serializeFilterTreeForCache(f);
  const f3 = await w.addFile("c.log", makeLog(0, 40), () => {});
  const refMap = w.materializeCachedFilters(f3, roots);
  const cached = Object.values(refMap).map(id => T.state.nodes[id]).find(n => n.filterType === "or");
  assert(cached && vals(cached) === V, "session cache round trip keeps baked[]");

  // legacy shape (and/or with bakedA/bakedB) is rejected cleanly
  const legacy = JSON.stringify({ format: "philogg-filters", version: 2, roots: [{ ref: 1, attach: "target", filterType: "and", name: "old", bakedA: { filterType: "text", value: "x" }, bakedB: { filterType: "text", value: "y" }, children: [] }] });
  const before = f2.children.length;
  let threw = null;
  try { w.importFilterJson(legacy); } catch (e) { threw = e; }
  assert(!threw && f2.children.length === before, "importing a legacy bakedA/bakedB and/or does not crash and creates nothing");
  const oneSided = JSON.stringify({ format: "philogg-filters", version: 2, roots: [{ ref: 1, attach: "target", filterType: "or", name: "x", baked: [{ filterType: "text", value: "x" }], children: [] }] });
  w.importFilterJson(oneSided);
  assert(f2.children.length === before, "a baked[] with a single condition is rejected");

  // Unpack -> one sibling per condition
  const count = f.children.length;
  w.unpackAndOrLinkNode(node.id);
  assert(f.children.length === count + 3, "Unpack materializes all 3 conditions");
  assert(w.hasBakedSides(node) && !w.hasBakedSides({ filterType: "and", baked: [{}] }), "hasBakedSides: and/or need 2+ baked conditions");
});

await withApp(async (w, d, T) => {
  section("319c. undo/redo of creating a 3-way AND");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const ids = ["message 1", "message 3", "message 2"].map(v => w.createFilterNode(f.id, "text", v).id);
  T.state.multiSelect = new Set(ids);
  w.performBulkAction("and", ids);
  const made = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "and");
  assert(made && made.baked.length === 3, "performBulkAction('and') over 3 ids creates a 3-way AND");
  assert(T.state.multiSelect.size === 0, "selection cleared");
  const madeId = made.id;
  w.undo();
  assert(!T.state.nodes[madeId], "undo removes the node");
  w.redo();
  const again = T.state.nodes[madeId];
  assert(again && again.baked.length === 3 && again.baked[2].value === "message 2", "redo restores it with baked[]");
});

await withApp(async (w, d, T) => {
  section("319d. sidebar toolbar multi mode: one content per selection shape");
  const bar = d.querySelector("#sidebarToolbar");
  // The active node is always part of the tree selection, so set both together.
  const selectTree = ids => { T.state.multiSelect = new Set(ids); T.state.activeId = ids[0] || null; w.render(); };
  const acts = () => [...bar.querySelectorAll("[data-multi-action]")].map(b => b.dataset.multiAction).join(",");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const fb = await w.addFile("b.log", makeLog(30, 10), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  const t3 = w.createFilterNode(f.id, "text", "message 3");
  const tb = w.createFilterNode(fb.id, "text", "message 3");
  selectTree([]);
  assert(!bar.classList.contains("multi") && acts() === "" && bar.querySelectorAll("[data-row-action]").length === 7, "no selection: normal row, no multi mode");
  selectTree([t1.id]);
  assert(!bar.classList.contains("multi") && acts() === "", "single node: normal row");
  assert(d.querySelector("#selectionBar") === null && !d.querySelector("#sidebarScroll").classList.contains("has-selbar"), "the floating #selectionBar is gone");

  selectTree([t1.id, t2.id]);
  assert(bar.classList.contains("multi"), "2 filters: multi class (accent-soft background)");
  assert(bar.querySelectorAll("[data-row-action]").length === 0, "2 filters: single-node buttons not rendered");
  assert(bar.querySelector(".stb-cnt").textContent === "2 filters", "count label '2 filters'");
  assert(acts() === "and,or,link,mute,close", "2 filters: AND, OR, Link…, Mute, close, got " + acts());
  assert(bar.querySelector('[data-multi-action="link"]').textContent.trim() === "Link…", "Link… label");
  assert(bar.querySelector('[data-multi-action="and"] svg.icon use') && bar.querySelector('[data-multi-action="close"]').getAttribute("aria-label") === "Clear selection", "text+icon buttons, close has an aria-label");
  assert(/--accent-soft/.test(d.documentElement.innerHTML.match(/#sidebarToolbar\.multi\{[^}]*\}/)[0]), "#sidebarToolbar.multi paints --accent-soft");
  selectTree([t1.id, t2.id, t3.id]);
  assert(bar.querySelector(".stb-cnt").textContent === "3 filters" && acts() === "and,or,link,mute,close", "3 filters: same actions, got " + acts());

  // AND/OR hidden when a node fails canBeCombined (link node)
  const link = w.createLinkNode(t1.id, t2.id, "after", 1);
  selectTree([link.id, t3.id]);
  assert(acts() === "link,mute,close", "AND/OR hidden when a link node is selected, got " + acts());

  selectTree([f.id, fb.id]);
  assert(bar.querySelector(".stb-cnt").textContent === "2 files" && acts() === "merge,close", "2 files: Merge only, got " + acts());
  assert(bar.querySelector('[data-multi-action="merge"]').textContent.trim() === "Merge 2 files", "Merge label");

  const msg = () => bar.querySelector(".stb-msg");
  selectTree([t1.id, tb.id]);
  assert(acts() === "mute,close" && bar.querySelector(".stb-cnt").title.includes("Merge the files first") && bar.classList.contains("multi"), "different roots: Mute + close, combine note as the count tooltip, got " + acts());
  selectTree([f.id, t1.id]);
  assert(acts() === "close" && msg().textContent === "Select only files or only filters" && msg().title.includes("not both"), "mixed files+filters: short message + tooltip");
  assert(bar.querySelector(".stb-cnt") === null, "mixed: no count label");
  selectTree([]);
  assert(!bar.classList.contains("multi") && bar.querySelectorAll("[data-row-action]").length === 7 && !msg(), "back to the normal row, message gone");
});

await withApp(async (w, d, T) => {
  section("319e. toolbar multi mode: plain-text message, clicks (AND, close), Esc handling, DOM identity");
  const bar = d.querySelector("#sidebarToolbar");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  T.state.multiSelect = new Set([t1.id, t2.id]); w.render();
  const first = bar.querySelector('[data-multi-action="and"]');
  w.render();
  assert(bar.querySelector('[data-multi-action="and"]') === first, "a re-render with the same selection keeps the same buttons");
  let bubbled = false;
  d.body.addEventListener("click", () => { bubbled = true; });
  first.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(!bubbled, "multi-mode clicks do not bubble to document handlers");
  const and = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "and");
  assert(and && and.baked.length === 2 && T.state.multiSelect.size === 0 && !bar.classList.contains("multi"), "AND click creates the node and multi mode ends");

  T.state.multiSelect = new Set([t1.id, t2.id]); w.render();
  bar.querySelector('[data-multi-action="close"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(T.state.multiSelect.size === 0 && !bar.classList.contains("multi"), "close button clears the selection");

  T.state.multiSelect = new Set([t1.id, t2.id]); w.render();
  T.state.focusRegion = "tree"; // Esc clears the tree selection only with tree focus
  const esc = () => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const inp = d.createElement("input"); d.body.appendChild(inp); inp.focus();
  inp.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(T.state.multiSelect.size === 2, "Esc while an input has focus leaves the selection alone");
  inp.blur(); inp.remove();
  esc();
  assert(T.state.multiSelect.size === 0 && !bar.classList.contains("multi"), "Esc clears the selection and leaves multi mode");

  const fb = await w.addFile("b.log", makeLog(30, 10), () => {});
  T.state.multiSelect = new Set([f.id, fb.id]); w.render();
  bar.querySelector('[data-multi-action="merge"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(Object.values(T.state.nodes).some(n => n.type === "file" && n.merged), "Merge N files button merges");
  assert(T.state.multiSelect.size === 0, "selection cleared after merge");

  const pa = await w.addFile("p1.log", makeLog(0, 5), () => {});
  const pb = await w.addFile("p2.log", makeLog(10, 5), () => {});
  pa.formatId = pb.formatId = w.eval("PLAINTEXT_FORMAT_ID");
  T.state.multiSelect = new Set([pa.id, pb.id]); w.render();
  const m = bar.querySelector(".stb-msg");
  assert(m && m.textContent === "Plain-text files can't be merged" && m.title.includes("line numbers") && bar.querySelectorAll("[data-multi-action]").length === 1, "plain-text files: short message + full tooltip, close only");
});
