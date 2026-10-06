// GROUP time-window-legacy-node — a legacy "after"/"before" node (old sessions, filter files) is a
// time node like "timerange": the minimap draft bar says "Update filter" and updates it in place
// (it becomes "timerange"; undo restores the legacy node) instead of nesting a new child.
// Origin: 2026-10-06 usability round E1.
group("time-window-legacy-node");
if (groupSelected()) {
  for (const type of ["after", "before"]) {
    await withApp(async (w, d, T) => {
      section("time-window-legacy-node " + type + ". draft on a legacy " + type + " node updates it in place; undo restores it");
      const f = await w.addFile("a.log", makeLog(0, 120), () => {});
      T.state.activeId = f.id; T.state.sortColumn = null;
      const ts = f.entries.map(e => e.ts);
      const legacy = w.createFilterNode(f.id, type, ts[20]);
      assert(legacy.filterType === type, "sanity: legacy node " + type);
      const oldName = legacy.name;
      T.state.activeId = legacy.id; w.render();
      const from = ts[40], to = ts[80];
      w.minimapSetDraft(from, to);
      const bar = d.querySelector("#timelineMinimapDraftBar");
      const btn = bar.querySelector('[data-act="filter"]');
      assert(!bar.classList.contains("hidden") && btn.textContent === "Update filter", "button text, got " + btn.textContent);
      btn.click();
      assert(f.children.length === 1 && f.children[0] === legacy.id && legacy.children.length === 0, "no new child node");
      const n = T.state.nodes[legacy.id];
      assert(n.filterType === "timerange" && n.value.from === from && n.value.to === to, "converted to timerange with the draft bounds, got " + JSON.stringify(n.value));
      assert(n.name !== oldName, "name updated, got " + n.name);
      w.undo();
      const u = T.state.nodes[legacy.id];
      assert(u.filterType === type && u.value === ts[20] && u.name === oldName, "undo restores the legacy node, got " + u.filterType + " " + JSON.stringify(u.value));
    });
  }
}
