// GROUP 289 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 289 — Gap filter (FEATURE_BACKLOG.md #24, 2026-09-26): keeps the
   entries of the parent's result whose distance to the previous entry is
   >= a threshold, optionally measured per column (Thread here). Covers:
   computeGapEntries overall vs. per thread, chain-awareness (Heartbeat →
   Gap), the node name/type tag, the Filtered view's Δt column showing the
   measured gap (also under a column sort), the Gap dialog (live count,
   sample badges, Create, Edit pre-fill + Save + undo, invalid threshold),
   the tree context menu entry, NOT, AND with a gap side,
   and every persistence carrier (value = { ms, per }).
   ============================================================ */
group(289);
{
  // A: Heartbeat at 0,2,4,11 s; B: tick at 1,3,10,12 s.
  function gapLog() {
    const rows = [[0, "A", "Heartbeat"], [1, "B", "tick"], [2, "A", "Heartbeat"], [3, "B", "tick"],
      [4, "A", "Heartbeat"], [10, "B", "tick"], [11, "A", "Heartbeat"], [12, "B", "tick"]];
    return rows.map(([sec, th, msg]) => `2024-01-15 10:00:${String(sec).padStart(2, "0")},000\tINFO\t"Worker-${th}"\tFoo.cs\tline 0\t[DoWork]\t"${msg} ${sec}"`).join("\n") + "\n";
  }
  const msgs = (w, id) => w.getEntries(id).map(e => e.message);

  await withApp(async (w, d, T) => {
    section("289a. Gap filter: evaluation, chain-awareness, name, Δt column");
    const f = await w.addFile("gap.log", gapLog(), () => {});
    const overall = w.computeGapEntries({ ms: 5000, per: null }, f.entries);
    assert(overall.result.map(e => e.message).join("|") === "tick 10" && overall.gaps.get(overall.result[0].id) === 6000,
      "overall: only 'tick 10' follows a >=5 s gap (6 s after Heartbeat 4)");
    const perThread = w.computeGapEntries({ ms: 5000, per: "thread" }, f.entries);
    assert(perThread.result.map(e => e.message).join("|") === "tick 10|Heartbeat 11" &&
      perThread.result.every(e => perThread.gaps.get(e.id) === 7000),
      "per Thread: tick 10 and Heartbeat 11 each follow a 7 s gap within their own thread");

    const gapNode = w.createGapNode(f.id, { ms: 5000, per: "thread" });
    assert(gapNode.filterType === "gap" && gapNode.parentId === f.id && gapNode.name === "Gap ≥ 5 s per Thread",
      "createGapNode: gap child of the file, named 'Gap ≥ 5 s per Thread', got " + gapNode.name);
    assert(w.typeTagFor(gapNode) === "GAP", "tree type tag GAP");
    assert(msgs(w, gapNode.id).join("|") === "tick 10|Heartbeat 11", "the node's result matches computeGapEntries");

    const hb = w.createFilterNode(f.id, "text", "Heartbeat");
    const hbGap = w.createGapNode(hb.id, { ms: 3000, per: null });
    assert(msgs(w, hbGap.id).join("|") === "Heartbeat 11", "chain-aware: measured over the parent's result (missed heartbeat after Heartbeat 4)");
    assert(w.createGapNode(hb.id, { ms: 1500 }).name === "Gap ≥ 1.5 s" && msgs(w, T.state.activeId).length === 3,
      "1.5 s threshold: the three heartbeats after the first are kept, named without 'per'");

    T.state.activeId = gapNode.id;
    T.state.sortColumn = null;
    w.revealFilteredView();
    w.render();
    let deltas = [...d.querySelectorAll("#tableRows .col-delta")].map(c => c.textContent);
    assert(deltas.join("|") === "+7.0s|+7.0s", "Filtered view: the Δt column shows each row's measured per-thread gap, got " + deltas.join("|"));
    fireClick([...d.querySelectorAll(".th-sortable")].find(th => th.dataset.sort === "level"), w);
    deltas = [...d.querySelectorAll("#tableRows .col-delta")].map(c => c.textContent);
    assert(deltas.join("|") === "+7.0s|+7.0s", "the measured gap stays shown under a column sort (it isn't row adjacency)");

    w.toggleInvertWithUndo(gapNode.id);
    assert(w.getEntries(gapNode.id).length === 6, "NOT: the parent's entries without the two gap rows");
    w.toggleInvertWithUndo(gapNode.id);

    // Baked as an AND side: evaluated by getEntriesFromBaked.
    const andNode = w.createAndOrNode([gapNode.id, hb.id], "and");
    assert(msgs(w, andNode.id).join("|") === "Heartbeat 11", "AND(gap per thread, 'Heartbeat') evaluates the baked gap condition");
  });

  await withApp(async (w, d, T) => {
    section("289b. Gap dialog: live summary, Create, Edit + undo, menu entries");
    const f = await w.addFile("gap.log", gapLog(), () => {});
    w.render();
    T.state.multiSelect = new Set([f.id]);
    T.state.activeId = f.id;
    w.render();
    w.openTreeContextMenu({ clientX: 10, clientY: 10 }, f.id);
    assert(!!d.querySelector('#treeContextMenu [data-action="gap"]'), "tree context menu offers 'Gap filter…'");
    w.closeTreeContextMenu();

    w.openGapDialog(f.id, false);
    const dlg = d.querySelector("#gapDialog");
    assert(isVisible(dlg, w), "Gap dialog opens");
    d.querySelector("#gapValueInput").value = "5";
    d.querySelector("#gapUnitSelect").value = "s";
    d.querySelector("#gapPerSelect").value = "thread";
    d.querySelector("#gapPerSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
    await sleep(200);
    assert(d.querySelector("#gapLiveMatch").textContent.includes("2 matches in 8"), "live count, got " + d.querySelector("#gapLiveMatch").textContent);
    const badges = [...d.querySelectorAll("#gapResultsSamples .filter-sample-badge")].map(b => b.textContent);
    assert(badges.join("|") === "+7.0s|+7.0s", "sample rows lead with the measured gap, got " + badges.join("|"));
    assert(!isVisible(d.querySelector("#gapResultsMinimap"), w) || d.querySelectorAll("#gapResultsMinimap rect").length > 0, "histogram rendered for the hits");

    d.querySelector("#gapValueInput").value = "-1";
    d.querySelector("#gapValueInput").dispatchEvent(new w.Event("input", { bubbles: true }));
    await sleep(200);
    assert(d.querySelector("#gapLiveMatch").textContent === "Invalid threshold", "an unreadable threshold shows an error");
    const before = f.children.length;
    fireClick(d.querySelector("#gapDialogCreate"), w);
    assert(f.children.length === before && isVisible(dlg, w), "Create refuses an invalid threshold and keeps the dialog open");

    d.querySelector("#gapValueInput").value = "5";
    fireClick(d.querySelector("#gapDialogCreate"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(!isVisible(dlg, w) && node.filterType === "gap" && node.parentId === f.id &&
      node.value.ms === 5000 && node.value.per === "thread", "Create adds the gap filter under the chosen node");

    assert(w.editFilterNode(node.id) === true && isVisible(dlg, w), "Edit filter… opens the Gap dialog for a gap node");
    assert(d.querySelector("#gapValueInput").value === "5" && d.querySelector("#gapUnitSelect").value === "s" &&
      d.querySelector("#gapPerSelect").value === "thread" && d.querySelector("#gapDialogCreate").textContent === "Save",
      "edit pre-fills value/unit/per and says Save");
    d.querySelector("#gapValueInput").value = "6.5";
    fireClick(d.querySelector("#gapDialogCreate"), w);
    const edited = T.state.nodes[node.id];
    assert(edited.value.ms === 6500 && edited.name === "Gap ≥ 6.5 s per Thread" && w.getEntries(node.id).length === 2,
      "Save edits the node in place (value replaced, name re-derived)");
    const oldValueObj = edited.value;
    w.undo();
    const undone = T.state.nodes[node.id];
    assert(undone.value.ms === 5000 && undone.name === "Gap ≥ 5 s per Thread", "undo restores the previous threshold");
    assert(oldValueObj.ms === 6500, "the edit replaced value wholesale — the old object was never mutated");
  });

  await withApp(async (w, d, T) => {
    section("289c. Gap filter: persistence carriers");
    const f = await w.addFile("gap.log", gapLog(), () => {});
    const g = w.createGapNode(f.id, { ms: 5000, per: "thread" });
    const ok = n => n && n.filterType === "gap" && n.value && n.value.ms === 5000 && n.value.per === "thread";
    assert(ok(w.cloneSubtree(g.id, f.id)), "cloneSubtree carries the gap value");
    const snap = w.snapshotSubtree(g.id);
    w.deleteNode(g.id);
    const restored = w.restoreSubtree(snap);
    assert(ok(restored) && w.getEntries(restored.id).length === 2, "snapshotSubtree/restoreSubtree round-trip");
    const branch = w.serializeFilterBranch(restored.id, false);
    const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(f.id)};`;
    d.body.appendChild(s);
    const n0 = f.children.length;
    w.importFilterJson(json);
    const imported = T.state.nodes[f.children[f.children.length - 1]];
    assert(f.children.length === n0 + 1 && ok(imported) && w.getEntries(imported.id).length === 2, "serializeFilterBranch/importFilterJson round-trip");
    const { roots } = w.serializeFilterTreeForCache(f);
    const fake = { id: "fake-gap-file", children: [] };
    w.materializeCachedFilters(fake, roots);
    assert(fake.children.map(id => T.state.nodes[id]).some(ok), "serializeFilterTreeForCache/materializeCachedFilters round-trip");
  });
}
