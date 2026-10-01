// GROUP 237 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 237 — the "Sources" group in the tree: rendering, independent
   collapse from the file's own node.collapsed, a source's swatch writing
   to node.sources[i].color (never node.highlightColor), and
   computeHighlightMap surfacing that color per-source into the same
   gutter-marker map filter highlights already use.
   ============================================================ */
group(237);
await withApp(async (w, d, T) => {
  section("237. Sources node: real tree row, real nested clickable source rows, independent collapse, swatch -> node.sources[i].color, computeHighlightMap picks it up per-source");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  T.state.activeId = merged.id;
  w.render();

  const sourcesNodeId = merged.children[0];
  const sourcesNode = T.state.nodes[sourcesNodeId];
  assert(sourcesNode && sourcesNode.filterType === "sources" && sourcesNode.locked === true,
    "the Sources row is a real, locked filter node — merged.children[0]");
  assert(sourcesNode.collapsed === true,
    "Sources starts collapsed right after a merge completes (this session's refinement, see fillMergedEntries) — expanded while loading, collapsed once done");
  const sourcesRow = d.querySelector('.tree-row[data-node-id="' + sourcesNodeId + '"]');
  assert(sourcesRow && sourcesRow.textContent.includes("Sources"), "it renders as a normal .tree-row, labeled Sources");

  // Expand it to exercise the nested source rows the rest of this group is about.
  fireClick(sourcesRow.querySelector(".tree-chevron"), w);
  assert(sourcesNode.collapsed === false, "clicking the chevron expands it");
  w.render();

  // The two sources are real, independent file nodes (fa/fb themselves,
  // for a manual bulk merge — see mergeFiles' own comment on mergeOwnerId
  // without mergeSourceHidden), each rendered a SECOND time, nested under
  // the Sources row, via the ordinary renderNode reused as-is. DOM order
  // matches tree order, so [0] is the untouched top-level row and [1] is
  // the nested one.
  const faRows = () => [...d.querySelectorAll('.tree-row[data-node-id="' + fa.id + '"]')];
  assert(faRows().length === 2, "fa renders TWICE — once at top level (bulk-merge originals stay visible), once nested under Sources, got " + faRows().length);
  assert(fa.mergeOwnerId === merged.id && !fa.mergeSourceHidden, "fa is tagged as this merge's source but NOT hidden — stays a normal top-level row too");
  assert(fb.mergeOwnerId === merged.id && !fb.mergeSourceHidden, "same for fb");
  assert(!faRows()[0].querySelector(".tree-swatch"), "the top-level (unnested) fa row carries no source-color swatch");
  assert(faRows()[1].querySelector(".tree-swatch"), "the nested fa row does");

  fireClick(sourcesRow.querySelector(".tree-chevron"), w);
  assert(sourcesNode.collapsed === true, "clicking the Sources row's own chevron collapses it — the SAME mechanism any other node's children use, no bespoke field");
  w.render();
  assert(faRows().length === 1, "the nested fa row is gone while Sources is collapsed — only the top-level original remains");
  fireClick(d.querySelector('.tree-row[data-node-id="' + sourcesNodeId + '"] .tree-chevron'), w);
  w.render();
  assert(faRows().length === 2, "expanding again brings the nested row back");

  const swatch = faRows()[1].querySelector(".tree-swatch");
  fireClick(swatch, w);
  assert(isVisible(d.querySelector("#colorPickerPopup"), w), "clicking a source's swatch opens the color picker");
  const preset = d.querySelector("#cpPresets .cp-preset");
  fireClick(preset, w);
  assert(merged.sources[0].color, "picking a color writes it onto merged.sources[i], not onto the file node itself");
  assert(!fa.highlightColor, "...not onto the source file node's own highlightColor (file nodes never carry one)");

  const hlMap = w.computeHighlightMap(merged.id);
  const coloredEntryId = merged.entries.find(e => e.sourceId === fa.id).id;
  const uncoloredEntryId = merged.entries.find(e => e.sourceId === fb.id).id;
  assert(hlMap.get(coloredEntryId) && hlMap.get(coloredEntryId).includes(merged.sources[0].color), "computeHighlightMap surfaces the source's color for its own entries");
  assert(!hlMap.get(uncoloredEntryId), "...but not for the other (uncolored) source's entries");

  // Re-query: the color pick above triggered a full render(), so the
  // captured `swatch` element is now detached (CLAUDE.md's "DOM identity
  // across clicks" gotcha).
  fireContextMenu(faRows()[1].querySelector(".tree-swatch"), w);
  assert(merged.sources[0].color === null, "right-click clears the source's color");
});
