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

  // --- Follow-up, person-requested: clicking a count attaches/reveals a level filter
  // for that level directly under the ROOT FILE (not under whatever node is active). ---
  T.state.activeId = narrowNode.id; // stay on the unrelated narrower node
  w.render();
  const childCountBefore = f.children.length;
  fireClick(spans().find(s => s.dataset.level === "ERROR"), w);
  assert(f.children.length === childCountBefore + 1, "clicking ERROR's count adds exactly one new child directly under the root file, got " + f.children.length + " (was " + childCountBefore + ")");
  const errFilterNode = T.state.nodes[f.children[f.children.length - 1]];
  assert(errFilterNode.type === "filter" && errFilterNode.filterType === "level" && JSON.stringify(errFilterNode.value) === JSON.stringify(["ERROR"]),
    "the new child is a level filter for exactly [\"ERROR\"], got " + JSON.stringify(errFilterNode && errFilterNode.value));
  assert(errFilterNode.parentId === f.id, "the new level filter's parent is the root file, not the previously-active narrower node");
  assert(T.state.activeId === errFilterNode.id, "the new level filter is shown active immediately");

  // Clicking the SAME level's count again reuses the existing node instead of duplicating it.
  T.state.activeId = narrowNode.id; // move away, then click again
  w.render();
  const childCountAfterFirst = f.children.length;
  fireClick(spans().find(s => s.dataset.level === "ERROR"), w);
  assert(f.children.length === childCountAfterFirst, "clicking ERROR's count again does NOT create a duplicate node, still " + f.children.length + " children");
  assert(T.state.activeId === errFilterNode.id, "…it just re-activates the existing ERROR level filter");

  // A different level's count creates its own separate node.
  fireClick(spans().find(s => s.dataset.level === "WARN"), w);
  const warnFilterNode = T.state.nodes[f.children[f.children.length - 1]];
  assert(warnFilterNode.id !== errFilterNode.id && JSON.stringify(warnFilterNode.value) === JSON.stringify(["WARN"]),
    "clicking a different level's count creates its own distinct level filter, got " + JSON.stringify(warnFilterNode && warnFilterNode.value));
  assert(T.state.activeId === warnFilterNode.id, "the WARN level filter is shown active immediately");

  // Truncation/no-data path untouched: still starts with "Start"/"Duration" and clears on <2 entries.
  assert(d.querySelector("#timelineMinimapMeta").textContent.includes("Start") &&
    d.querySelector("#timelineMinimapMeta").textContent.includes("Duration"),
    "Start/.../Duration text is still present ahead of the new level segments");
});
