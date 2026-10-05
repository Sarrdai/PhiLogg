// GROUP time-window-nodes — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP time-window-nodes — one filter node per time window, span labels,
   level windows nest
   Origin: 2026-10-04 (person-requested, usability round C step 1). Time
   filter names show the span (`10:00:05 – 10:00:20 · 15.0s`, open bounds
   `from …` / `until …`), "Filter after" + "Filter before" fill ONE node
   instead of nesting, a second window on an active time node updates it
   (undoable). A window created while a level node is active is a plain child
   of it (the chips are a pure view filter, no special case).
   ============================================================ */
group("time-window-nodes");

const twActive = (T) => T.state.nodes[T.state.activeId];

await withApp(async (w, d, T) => {
  section("time-window-nodes a. Label shapes");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const n = (from, to) => w.timeRangeFilterName({ from, to }, f.id);
  const e = i => f.entries[i].ts;
  assert(n(e(5), e(20)) === "10:00:05 – 10:00:20 · 15.0s", "both bounds: span + duration, got " + n(e(5), e(20)));
  assert(n(e(5), null) === "from 10:00:05", "open end: " + n(e(5), null));
  assert(n(null, e(20)) === "until 10:00:20", "open start: " + n(null, e(20)));
  assert(n(null, null) === "any time", "no bounds: any time");
  assert(n(e(5), e(5) + 2500) === "10:00:05.000 – 10:00:07.500 · 2.5s", "span < 10 s shows milliseconds: " + n(e(5), e(5) + 2500));
  assert(n(e(5), e(5) + 10000) === "10:00:05 – 10:00:15 · 10.0s", "span of 10 s drops milliseconds again");
  const nextDay = new Date(2024, 0, 16, 0, 3, 10).getTime();
  assert(n(e(5), nextDay) === "10:00:05 – 01-16 00:03:10 · 14h 3m", "other day gets a MM-DD prefix: " + n(e(5), nextDay));
  assert(n(nextDay, null) === "from 01-16 00:03:10", "open bound on another day: " + n(nextDay, null));
  assert(w.timeRangeFullTitle({ from: e(5), to: e(20) }, f.id) === "2024-01-15 10:00:05.000 → 2024-01-15 10:00:20.000", "full tooltip text: " + w.timeRangeFullTitle({ from: e(5), to: e(20) }, f.id));

  const node = w.createFilterNode(f.id, "timerange", { from: e(5), to: e(20) });
  w.render();
  assert(node.name === "10:00:05 – 10:00:20 · 15.0s", "created node stores the span name, got " + node.name);
  const row = [...d.querySelectorAll("#tree .tree-row .tree-label, #tree .node-label, #tree [title]")].find(x => (x.title || "").includes("→"));
  assert(row && row.title.includes("2024-01-15 10:00:05.000 → 2024-01-15 10:00:20.000"), "tree row tooltip carries the full bounds, got " + (row && row.title));
});

await withApp(async (w, d, T) => {
  section("time-window-nodes b. Plain-text file keeps line bounds");
  const PT = "fmt-plaintext";
  const f = await w.addFile("notes.txt", Array.from({ length: 100 }, (_, i) => "line " + i).join("\n") + "\n", () => {}, PT);
  const n = (from, to) => w.timeRangeFilterName({ from, to }, f.id);
  assert(n(5, 90) === "line 5 – line 90", "got " + n(5, 90));
  assert(n(5, null) === "from line 5" && n(null, 90) === "until line 90", "open bounds: " + n(5, null) + " / " + n(null, 90));
});

await withApp(async (w, d, T) => {
  section("time-window-nodes c. after + before = one node (both orders)");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[3]);
  fireClick(d.querySelector("#ctxAfter"), w);
  const first = twActive(T);
  assert(first.filterType === "timerange" && first.value.from === f.entries[3].ts && first.value.to === null, "after creates the node");
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[25]);
  fireClick(d.querySelector("#ctxBefore"), w);
  assert(f.children.length === 1 && first.children.length === 0, "before fills the same node, no nesting");
  assert(first.value.from === f.entries[3].ts && first.value.to === f.entries[25].ts, "node holds both bounds: " + JSON.stringify(first.value));
  assert(first.name === "10:00:03 – 10:00:25 · 22.0s" && T.state.activeId === first.id, "name updated, node still active: " + first.name);
  assert(w.getEntries(first.id).length === 23, "result is the window: " + w.getEntries(first.id).length);

  // before -> after on a fresh file
  const g = await w.addFile("b.log", makeLog(0, 30), () => {});
  T.state.activeId = g.id;
  w.openContextMenu({ clientX: 10, clientY: 10 }, g.entries[25]);
  fireClick(d.querySelector("#ctxBefore"), w);
  w.openContextMenu({ clientX: 10, clientY: 10 }, g.entries[3]);
  fireClick(d.querySelector("#ctxAfter"), w);
  assert(g.children.length === 1, "before -> after: one node");
  const gn = T.state.nodes[g.children[0]];
  assert(gn.value.from === g.entries[3].ts && gn.value.to === g.entries[25].ts, "before -> after holds both bounds: " + JSON.stringify(gn.value));

  // inverted result keeps only the new bound
  w.openContextMenu({ clientX: 10, clientY: 10 }, g.entries[28]);
  fireClick(d.querySelector("#ctxAfter"), w);
  assert(gn.value.from === g.entries[28].ts && gn.value.to === null, "an after beyond the end keeps only the new bound: " + JSON.stringify(gn.value));
  w.openContextMenu({ clientX: 10, clientY: 10 }, g.entries[2]);
  fireClick(d.querySelector("#ctxBefore"), w);
  assert(gn.value.from === null && gn.value.to === g.entries[2].ts, "a before ahead of the start keeps only the new bound: " + JSON.stringify(gn.value));
});

await withApp(async (w, d, T) => {
  section("time-window-nodes d. A second window on an active time node updates it (undo restores)");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const node = w.createFilterNode(f.id, "timerange", { from: f.entries[5].ts, to: f.entries[20].ts });
  w.render();
  const before = JSON.stringify(node.value), nameBefore = node.name;
  const r = w.applyTimeWindow(node.id, f.entries[8].ts, f.entries[12].ts);
  assert(r === node && node.children.length === 0 && f.children.length === 1, "no new node");
  assert(node.value.from === f.entries[8].ts && node.value.to === f.entries[12].ts, "bounds replaced: " + JSON.stringify(node.value));
  assert(node.name === "10:00:08.000 – 10:00:12.000 · 4.0s", "name follows: " + node.name);
  w.undo();
  assert(JSON.stringify(node.value) === before && node.name === nameBefore, "undo restores value and name: " + JSON.stringify(node.value) + " " + node.name);
});

await withApp(async (w, d, T) => {
  section("time-window-nodes e. A window while a level node is active is a plain child of it; chips stay a view filter");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {}); // ERROR at i%5==0 (6 of 30), INFO otherwise
  const lvl = w.createFilterNode(f.id, "level", ["ERROR"]);
  w.render();
  const chip = l => [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.dataset.level === l);
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[5]);
  fireClick(d.querySelector("#ctxAfter"), w);
  const win = twActive(T);
  assert(win.filterType === "timerange" && win.parentId === lvl.id && f.children.length === 1 && f.children[0] === lvl.id, "window nests under the level node");
  assert(!chip("ERROR").classList.contains("active"), "chips show the view filter only: ERROR is not lit just because a level node exists");
  fireClick(chip("INFO"), w);
  assert(T.state.levelFilter.has("INFO") && lvl.value.join(",") === "ERROR" && twActive(T) === win, "a chip click neither edits the level node nor moves the active node");
});
