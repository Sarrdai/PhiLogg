// GROUP 335 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 335 — tree navigation reaches a merge's "Sources" rows: an expanded
   Sources node lists its sources (and their subtrees) right after it, a
   visible source listed twice keeps its own occurrence, Left goes back to
   Sources, and a hidden Sources node (setting off) is no nav stop.
   ============================================================ */
group(335);
await withApp(async (w, d, T) => {
  section("335a. Alt+Arrow walks into, through and out of a merge's Sources");
  const sim = seed => LOGSIM.generateToStrings({ format: "default", entries: 20, seed })[0].text;
  const fa = await w.addFile("a.log", sim(1), () => {});
  const fb = await w.addFile("b.log", sim(2), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  const srcId = merged.children.find(id => T.state.nodes[id].filterType === "sources");
  const flt = w.createFilterNode(fa.id, "text", "a");
  T.state.activeId = merged.id;
  w.render();
  const alt = key => fireKeydown(d, w, key, { altKey: true });
  alt("ArrowRight"); // merged file is expanded: first child
  assert(T.state.activeId === srcId, "Right on the merged file lands on Sources");
  alt("ArrowRight");
  assert(T.state.nodes[srcId].collapsed === false && T.state.activeId === srcId, "Right expands the collapsed Sources node");
  const nav = w.flattenTreeIds();
  const si = nav.indexOf(srcId);
  assert(nav[si + 1] === fa.id && nav[si + 2] === flt.id && nav[si + 3] === fb.id,
    "flattenTreeIds lists the sources (with their subtrees) right after Sources: " + nav.slice(si, si + 4));
  alt("ArrowRight");
  assert(T.state.activeId === fa.id, "Right on the expanded Sources lands on its first source");
  alt("ArrowDown");
  assert(T.state.activeId === flt.id, "Down stays in the nested occurrence (the source's own filter), not the top-level fa row");
  alt("ArrowDown");
  assert(T.state.activeId === fb.id, "Down reaches the second source");
  alt("ArrowLeft");
  assert(T.state.activeId === srcId, "Left from a nested source goes to Sources, not to the source's top-level row");
  alt("ArrowDown"); alt("ArrowDown");
  assert(T.state.activeId === flt.id, "Down from Sources re-enters the nested occurrence");
  alt("ArrowUp"); alt("ArrowLeft");
  assert(T.state.activeId === fa.id && T.state.nodes[fa.id].collapsed === true, "Left on an expanded nested source collapses it (Explorer model)");
  alt("ArrowLeft");
  assert(T.state.activeId === srcId, "...and the next Left goes to Sources");
  T.state.nodes[fa.id].collapsed = false;
  alt("ArrowLeft");
  assert(T.state.nodes[srcId].collapsed === true, "Left on the expanded Sources collapses it");
  assert(w.flattenTreeIds().filter(id => id === fa.id).length === 1, "collapsed: fa is listed only at its top-level position");
}, { demoFormats: true });
await withApp(async (w, d, T) => {
  section("335b. hidden merge sources are nav-reachable only under Sources; Show Sources off removes the Sources stop");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const merged = await w.loadMetaFormatText("demo.log", META_SAMPLE_TEXT, metaFmt);
  const srcId = merged.children.find(id => T.state.nodes[id].filterType === "sources");
  T.state.nodes[srcId].collapsed = false;
  w.render();
  let nav = w.flattenTreeIds();
  assert(merged.sources.every(s => nav.filter(id => id === s.id).length === 1 && nav.indexOf(s.id) > nav.indexOf(srcId)),
    "each hidden source is listed once, under Sources");
  T.state.activeId = merged.sources[1].id;
  fireKeydown(d, w, "ArrowLeft", { altKey: true });
  assert(T.state.activeId === srcId, "Left from a hidden source goes to Sources");
  w.eval("showSourcesSetting = false");
  w.render();
  nav = w.flattenTreeIds();
  assert(!nav.includes(srcId) && !merged.sources.some(s => nav.includes(s.id)),
    "Show Sources off: no invisible Sources / source stops");
  w.eval("showSourcesSetting = true");
}, { demoFormats: true });
