// GROUP 110 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 110 — Person-requested follow-ups to the Alt+Arrow/temp-anchor
   mechanism from GROUP 99:
   (a) A mouse click on a filter tree row now leaves focusRegion as
       "entries" (see the renderNode click handler, philogg.html) instead of
       switching to "tree" — plain arrow keys keep navigating the log right
       after a tree click, exactly like Alt+Arrow tree nav already did,
       continuing from a temp anchor when one applies (applyTempAnchorOnActiveNodeSwitch
       runs for both paths, unchanged).
   (b) New Settings -> Behavior toggle, "Show temporary anchor across files"
       (#settingsTempAnchorAcrossFiles, localStorage philogg-temp-anchor-across-files,
       default ON = the pre-existing behavior, i.e. an anchor is shown even
       when the newly active filter belongs to a different file than the
       still-selected row). Turning it off suppresses the anchor (returns
       null from computeTempAnchorForNode) whenever the target filter's root
       file doesn't actually contain the selected entry.
   (c) The temp-anchor display-mode default (#settingsTempAnchorMode) changed
       from "persistent" to "fade" — GROUP 99's own assertions were updated
       in place to set "persistent" explicitly where they rely on it.
   ============================================================ */
group(110);
await withApp(async (w, d, T) => {
  section("110a. A tree-row click gives the tree focus (GROUP 345); Ctrl+1 jumps back to the log and plain arrow keys continue from the temp anchor");

  const f = await w.addFile("app.log", makeLog(0, 5, { suffix: i => (i % 2 === 0 ? "keep" : "skip") }), () => {});
  const keepFilter = w.createFilterNode(f.id, "text", "keep"); // matches entries 0,2,4
  const skipFilter = w.createFilterNode(f.id, "text", "skip"); // matches entries 1,3
  w.render();

  T.state.activeId = skipFilter.id;
  w.applyFhView("highlight");
  T.state.entriesView = "highlight";
  w.render();
  // skipFilter is active, so the Context view holds ITS result — "message 1
  // skip" is the first of those rows (before this feature the view listed every
  // row of the file, which is why this used to be index 1).
  fireClick([...d.querySelectorAll("#highlightRows .log-row")][0], w); // "message 1 skip"
  const skip1Id = T.state.selectedId;
  assert(!!skip1Id, "sanity: clicking a Full-view row selects it");

  fireClick(d.querySelector('.tree-row[data-node-id="' + keepFilter.id + '"]'), w);
  assert(T.state.activeId === keepFilter.id, "sanity: the click switched the active filter");
  assert(T.state.focusRegion === "tree", "a plain tree-row click gives the tree focus");
  assert(T.state.tempAnchor && T.state.tempAnchor.entryId === skip1Id && T.state.tempAnchor.nodeId === keepFilter.id,
    "the temp anchor is set exactly as it already was for Alt+Arrow — the click doesn't skip that mechanic");

  // Ctrl+1 jumps to the log (Filtered view); plain ArrowDown then navigates
  // the LOG from the anchor's would-be position, not the filter tree.
  fireKeydown(d, w, "1", { ctrlKey: true });
  assert(T.state.focusRegion === "entries", "Ctrl+1 moves focus to the log views");
  fireKeydown(d, w, "ArrowDown");
  // Fade is the default mode now, so the anchor row itself is also drawn in
  // #tableRows (between "keep 0" and "keep 2") — skip it to get the real rows.
  const realRows = [...d.querySelectorAll("#tableRows .log-row")].filter(r => !r.classList.contains("temp-anchor-row"));
  const keep2Id = realRows[1].dataset.entryId; // realRows: [keep0, keep2, keep4]
  assert(T.state.selectedId === keep2Id,
    "plain ArrowDown after Ctrl+1 moves the LOG selection, continuing from the temp anchor, not the filter tree");
  assert(T.state.activeId === keepFilter.id, "...and the active filter itself is untouched by that arrow key");
});

await withApp(async (w, d, T) => {
  section("110b. Settings: \"Show temporary anchor across files\" toggle");

  const checkbox = d.querySelector("#settingsTempAnchorAcrossFiles");
  assert(checkbox, "the new checkbox exists in the settings panel");
  assert(pillChecked(checkbox) === true, "default is ON — matches the pre-existing cross-file behavior");
  assert(T.temporaryAnchorAcrossFiles === true, "default is ON at the state level too");

  const fileA = await w.addFile("a.log", makeLog(0, 3, { suffix: () => "match" }), () => {});
  const fileB = await w.addFile("b.log", makeLog(0, 3, { suffix: () => "other" }), () => {});
  const filterA = w.createFilterNode(fileA.id, "text", "match"); // matches all of fileA's entries
  const filterB = w.createFilterNode(fileB.id, "text", "other"); // matches all of fileB's entries — none of fileA's
  w.render();

  T.state.activeId = filterA.id;
  w.applyFhView("highlight");
  T.state.entriesView = "highlight";
  w.render();
  // Select fileA's own entry 0 while viewing fileA (Full view shows every
  // loaded file's entries merged, but the row itself still belongs to fileA).
  const fileAEntry0 = fileA.entries[0];
  const rowForEntry = id => [...d.querySelectorAll("#highlightRows .log-row")].find(r => r.dataset.entryId === id);
  fireClick(rowForEntry(fileAEntry0.id), w);
  assert(T.state.selectedId === fileAEntry0.id, "sanity: selected an entry belonging to fileA");

  // Cross-file ON (default): switching to filterB (fileB's own filter, which
  // can never match a fileA entry) still anchors the fileA row.
  fireClick(d.querySelector('.tree-row[data-node-id="' + filterB.id + '"]'), w);
  assert(T.state.tempAnchor && T.state.tempAnchor.entryId === fileAEntry0.id,
    "cross-file ON: the anchor is still shown even though filterB belongs to a different file than the selected row");

  // Turn the setting off, persisted to localStorage.
  fireClick(checkbox, w);
  assert(T.temporaryAnchorAcrossFiles === false, "unchecking flips the state flag");
  assert(w.localStorage.getItem("philogg-temp-anchor-across-files") === "0", "...and persists it to localStorage");

  T.state.activeId = filterA.id;
  T.state.tempAnchor = null;
  w.render();
  fireClick(d.querySelector('.tree-row[data-node-id="' + filterB.id + '"]'), w);
  assert(T.state.tempAnchor === null,
    "cross-file OFF: no anchor is shown when the target filter's file doesn't contain the selected row");

  // Switching within the SAME file (fileA) must still anchor normally even
  // with the setting off — the gate is specifically about crossing files.
  const filterANarrow = w.createFilterNode(fileA.id, "text", "message 2"); // matches only entry index 2 of fileA
  w.render();
  T.state.activeId = filterA.id;
  T.state.selectedId = fileAEntry0.id;
  T.state.tempAnchor = null;
  w.render();
  fireClick(d.querySelector('.tree-row[data-node-id="' + filterANarrow.id + '"]'), w);
  assert(T.state.tempAnchor && T.state.tempAnchor.entryId === fileAEntry0.id,
    "cross-file OFF: switching between two filters of the SAME file still shows the anchor normally");

  // Re-enabling restores the cross-file behavior.
  fireClick(checkbox, w);
  assert(T.temporaryAnchorAcrossFiles === true && w.localStorage.getItem("philogg-temp-anchor-across-files") === "1",
    "re-checking flips the flag back on and persists \"1\"");
});

await withApp(async (w, d, T) => {
  section("110c. Temp-anchor display-mode default changed from Persistent to Fade");

  assert(T.tempAnchorMode === "fade", "the default mode (nothing in localStorage) is now \"fade\", not \"persistent\"");
  assert(d.querySelector("#settingsTempAnchorMode").value === "fade", "the settings select reflects the new default on init");
  assert(d.querySelector("#settingsTempAnchorFadeRow").style.display !== "none",
    "the fade-duration row is shown by default now, since Fade is the default mode");
});
