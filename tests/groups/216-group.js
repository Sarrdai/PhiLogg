// GROUP 216 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(216);
await withApp(async (w, d, T) => {
  section("216. Minimap header: per-level entry counts appended after Duration, showing the whole file's global totals");

  const f = await w.addFile("a.log", makeLog(0, 6, { levels: ["ERROR", "ERROR", "WARN", "INFO", "INFO", "INFO"] }), () => {});
  T.state.activeId = f.id;
  w.render();

  const order = w.activeLevelOrder();
  assert(order.length > 0, "sanity: there's a level order to compare against");
  const spans = () => [...d.querySelectorAll("#timelineMinimapMeta .minimap-meta-level")];
  assert(spans().length === order.length, "one .minimap-meta-level span per entry in activeLevelOrder(), got " + spans().length + " vs " + order.length);
  assert(spans().map(s => s.dataset.level).join(",") === order.join(","),
    "spans appear in the exact same order as activeLevelOrder() (same order the level-bar buttons use), got " + spans().map(s => s.dataset.level).join(","));

  const fileTotals = w.getLevelCounts(f.id) || {};
  spans().forEach(s => {
    const lvl = s.dataset.level;
    assert(Number(s.textContent.replace(/^[A-Z] /, "").replace(/\./g, "")) === (fileTotals[lvl] || 0),
      "span for " + lvl + " shows the whole file's raw total (" + (fileTotals[lvl] || 0) + "), got " + s.textContent);
    const expectedColor = w.levelColorVar(lvl) || "var(--text-secondary)";
    assert(s.getAttribute("style").includes("color:" + expectedColor),
      "span for " + lvl + " is colored via levelColorVar(), got " + s.getAttribute("style"));
  });

  // Tablet UX round, step 2: the number is prefixed with the level's letter ("E 149"),
  // never the full name (that is the tooltip's job).
  assert(spans().every(s => /^[A-Z] [\d.]+$/.test(s.textContent)), "level segments read '<letter> <number>', no full level name");

  // --- Follow-up, person-requested: the whole meta line is "global state" (Start/End/
  // Duration always describe the WHOLE file), so the level counts must too — they must
  // NOT shrink to match a narrower active filter, unlike the level-bar's own counts. ---
  const errSpanTextBefore = spans().find(s => s.dataset.level === "ERROR").textContent;
  const narrowNode = w.createFilterNode(f.id, "text", "message"); // matches every entry, still narrows the node itself
  T.state.activeId = narrowNode.id;
  w.render();
  assert(spans().find(s => s.dataset.level === "ERROR").textContent === errSpanTextBefore,
    "counts stay the file's global totals even once a narrower filter node is active, unlike the level bar's own context-dependent counts");

  // --- Clicking a count acts like the level's chip: the root file becomes active, the
  // level toggles in the view filter, the tree is untouched. ---
  T.state.activeId = narrowNode.id; // stay on the unrelated narrower node
  w.render();
  const childCountBefore = f.children.length;
  const nodeCountBefore = Object.keys(T.state.nodes).length;
  fireClick(spans().find(s => s.dataset.level === "ERROR"), w);
  assert(f.children.length === childCountBefore && Object.keys(T.state.nodes).length === nodeCountBefore, "clicking ERROR's count creates no tree node");
  assert(T.state.activeId === f.id, "the root file is activated (it was not the active node)");
  assert(T.state.levelFilter.has("ERROR") && T.state.levelFilter.size === 1, "ERROR is toggled into the view filter");
  assert(d.querySelector('#levelBar .level-btn[data-level="ERROR"]').classList.contains("active"), "the ERROR chip lights");

  // The same count again toggles it off; another count adds its level; the file stays active.
  fireClick(spans().find(s => s.dataset.level === "ERROR"), w);
  assert(T.state.levelFilter.size === 0 && !d.querySelector('#levelBar .level-btn[data-level="ERROR"]').classList.contains("active"), "clicking ERROR's count again toggles it off");
  fireClick(spans().find(s => s.dataset.level === "WARN"), w);
  assert(T.state.levelFilter.has("WARN") && T.state.activeId === f.id && f.children.length === childCountBefore, "a different level's count selects that level, still no node");

  // Truncation/no-data path untouched: still starts with "Start"/"Duration" and clears on <2 entries.
  assert(d.querySelector("#timelineMinimapMeta").textContent.includes("Start") &&
    d.querySelector("#timelineMinimapMeta").textContent.includes("Duration"),
    "Start/.../Duration text is still present ahead of the new level segments");
});
