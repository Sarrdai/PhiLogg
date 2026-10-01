// GROUP 35 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 35 — Text filter: case-sensitive option + per-filter target column
   Origin: this session (FEATURE_BACKLOG.md "Case-sensitive option for text
   filters" + "Per-filter target column"). Adds node.caseSensitive/
   node.columns to "text" filter nodes only, with the SAME selection logic
   as the level filter bar (state.levelFilter/applyLevelFilter): none of
   the column chips selected searches every column (unchanged behavior,
   e.raw.includes), one or more restricts to those — so "all selected" and
   "none selected" have the identical matching effect. Threaded through
   every persistence carrier per CLAUDE.md's "Known gotchas" note:
   cloneSubtree, snapshotSubtree/restoreSubtree, serializeFilterBranch/
   importFilterJson, serializeFilterTreeForCache/materializeCachedFilters.
   ============================================================ */
group(35);
await withApp(async (w, d, T) => {
  section("35. Text filter: case-sensitive option + per-filter target column");

  const ALL_COLUMN_KEYS = ["time", "level", "thread", "location", "method", "message"];
  const lines = [
    `2024-01-15 10:00:00,000\tERROR\t"TOKEN"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"nothing here"`,       // 0: thread="TOKEN"
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"TOKEN inside message"`, // 1: message contains TOKEN
    `2024-01-15 10:00:02,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"clean"`,                 // 2: no TOKEN anywhere
    `2024-01-15 10:00:03,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"Marker one"`,             // 3: exact-case "Marker"
    `2024-01-15 10:00:04,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 4\t[DoWork]\t"marker two"`,             // 4: lower-case "marker"
  ];
  const logText = lines.join("\n") + "\n";
  const f = await w.addFile("cols.log", logText, () => {});
  w.render();

  // --- getEntries semantics: no restriction (default) behaves exactly like before ---
  const noRestrict = w.createFilterNode(f.id, "text", "TOKEN");
  assert(noRestrict.caseSensitive === undefined && noRestrict.columns === undefined, "a plain text filter gets no caseSensitive/columns fields by default");
  assert(w.getEntries(noRestrict.id).length === 2, "unrestricted: TOKEN matches both the thread (0) and the message (1) column, got " + w.getEntries(noRestrict.id).length);

  // --- restricting to one column narrows the match to only that column ---
  const restrictMessage = w.createFilterNode(f.id, "text", "TOKEN", false, null, false, ["message"]);
  assert(w.getEntries(restrictMessage.id).length === 1 && w.getEntries(restrictMessage.id)[0].id === f.entries[1].id,
    "restricted to 'message': only entry 1 (TOKEN in the message) matches, thread-only entry 0 is excluded");

  const restrictThread = w.createFilterNode(f.id, "text", "TOKEN", false, null, false, ["thread"]);
  assert(w.getEntries(restrictThread.id).length === 1 && w.getEntries(restrictThread.id)[0].id === f.entries[0].id,
    "restricted to 'thread': only entry 0 (thread=TOKEN) matches, message-only entry 1 is excluded");

  // --- "all columns selected" has the SAME effect as "none selected" (level-filter parity) ---
  const restrictAll = w.createFilterNode(f.id, "text", "TOKEN", false, null, false, ALL_COLUMN_KEYS);
  assert(w.getEntries(restrictAll.id).length === w.getEntries(noRestrict.id).length,
    "selecting every column produces the same result as selecting none, per the level-filter selection logic");

  // --- case-sensitivity ---
  const caseInsensitive = w.createFilterNode(f.id, "text", "Marker");
  assert(w.getEntries(caseInsensitive.id).length === 2, "default (case-insensitive) 'Marker' matches both entries 3 and 4");
  const caseSensitive = w.createFilterNode(f.id, "text", "Marker", false, null, true);
  assert(w.getEntries(caseSensitive.id).length === 1 && w.getEntries(caseSensitive.id)[0].id === f.entries[3].id,
    "case-sensitive 'Marker' matches only entry 3's exact-case occurrence, not entry 4's 'marker'");

  // --- column-key -> entry-field mapping sanity (time/level/location/method) ---
  const timeProbe = w.createFilterNode(f.id, "text", "10:00:03", false, null, false, ["time"]);
  assert(w.getEntries(timeProbe.id).length === 1 && w.getEntries(timeProbe.id)[0].id === f.entries[3].id, "'time' column restricts matching to the raw timestamp text");
  const levelProbe = w.createFilterNode(f.id, "text", "ERROR", false, null, false, ["level"]);
  assert(w.getEntries(levelProbe.id).length === 1 && w.getEntries(levelProbe.id)[0].id === f.entries[0].id, "'level' column restricts matching to the entry's level");
  const locationProbe = w.createFilterNode(f.id, "text", "line 2", false, null, false, ["location"]);
  assert(w.getEntries(locationProbe.id).length === 1 && w.getEntries(locationProbe.id)[0].id === f.entries[2].id, "'location' column restricts matching to the location text");
  const methodProbe = w.createFilterNode(f.id, "text", "DoWork", false, null, false, ["method"]);
  assert(w.getEntries(methodProbe.id).length === 5, "'method' column matches every row here (all share method DoWork)");

  // --- Filter popup UI: defaults, live match, chip toggling ---
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  assert(pillChecked(d.querySelector("#filterCaseCheckbox")) === false, "case-sensitive toggle defaults to OFF, as required");
  assert([...d.querySelectorAll(".column-chip")].every(c => !c.classList.contains("active")), "no column chip is pre-selected when opening the popup fresh");

  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "TOKEN";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("2 matches in 5"), "live match with no column restriction counts both TOKEN occurrences");

  const messageChip = d.querySelector('.column-chip[data-col="message"]');
  fireClick(messageChip, w);
  assert(messageChip.classList.contains("active"), "clicking a column chip marks it active");
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("1 matches in 5"), "live match updates live once a column chip restricts the search");

  fireSubmit(d.querySelector("#filterForm"), w);
  const uiCreated = T.state.nodes[T.state.activeId];
  assert(uiCreated.filterType === "text" && uiCreated.value === "TOKEN" && JSON.stringify(uiCreated.columns) === JSON.stringify(["message"]) && !uiCreated.caseSensitive,
    "submitting the popup with a column chip selected creates a filter restricted to that column");

  // Case-sensitive checkbox at creation time
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "Marker";
  fireClick(d.querySelector("#filterCaseCheckbox"), w);
  fireSubmit(d.querySelector("#filterForm"), w);
  const uiCaseCreated = T.state.nodes[T.state.activeId];
  assert(uiCaseCreated.caseSensitive === true, "checking the case-sensitive box in the popup sets caseSensitive:true at creation");

  // --- Edit mode: popup pre-fills existing caseSensitive/columns, and edits apply ---
  const editNode = w.createFilterNode(f.id, "text", "TOKEN", false, null, true, ["message"]);
  w.openEditFilterPopup(editNode.id);
  assert(pillChecked(d.querySelector("#filterCaseCheckbox")) === true, "editing a filter pre-fills the case-sensitive toggle from the node");
  assert(d.querySelector('.column-chip[data-col="message"]').classList.contains("active") && !d.querySelector('.column-chip[data-col="thread"]').classList.contains("active"),
    "editing a filter pre-fills the column chips from the node's existing restriction");
  fireClick(d.querySelector('.column-chip[data-col="message"]'), w); // deselect message
  fireClick(d.querySelector('.column-chip[data-col="thread"]'), w);  // select thread
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(JSON.stringify(editNode.columns) === JSON.stringify(["thread"]), "saving the edit applies the new column restriction");
  assert(editNode.caseSensitive === true, "saving an edit that only touched columns leaves caseSensitive untouched");
  assert(w.getEntries(editNode.id).length === 1 && w.getEntries(editNode.id)[0].id === f.entries[0].id, "the edited filter re-evaluates against its new column restriction");

  // Editing a text filter's pattern to include wildcard tokens keeps it a
  // "text" node (there is no separate "extract" filterType to flip to
  // anymore — this session's filterType merge, Group 41) — caseSensitive/
  // columns stay exactly as set, and the node additionally becomes
  // extraction-capable (nodeHasExtractableWildcards), unlocking Table/Plot.
  const toGetWildcard = w.createFilterNode(f.id, "text", "Marker", false, null, true, ["message"]);
  w.openEditFilterPopup(toGetWildcard.id);
  d.querySelector("#filterInput").value = "id=[*:int]";
  fireInput(d.querySelector("#filterInput"), w);
  assert(d.querySelector("#filterCaseCheckbox").disabled === false, "case-sensitive checkbox stays available with a wildcard pattern typed");
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(toGetWildcard.filterType === "text" && toGetWildcard.caseSensitive === true && JSON.stringify(toGetWildcard.columns) === JSON.stringify(["message"]),
    "saving keeps it a 'text' node with caseSensitive/columns intact — only the value changed");
  assert(w.nodeHasExtractableWildcards(toGetWildcard) === true, "the new wildcard pattern makes this same node extraction-capable");

  // --- Persistence carriers ---

  // cloneSubtree (copy/paste)
  const cloneSource = w.createFilterNode(f.id, "text", "Marker", false, null, true, ["message"]);
  T.state.activeId = cloneSource.id;
  T.state.clipboard = { id: cloneSource.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const pasted = T.state.nodes[f.children[f.children.length - 1]];
  assert(pasted.caseSensitive === true && JSON.stringify(pasted.columns) === JSON.stringify(["message"]),
    "cloneSubtree (copy/paste) carries caseSensitive/columns to the pasted copy");

  // snapshotSubtree/restoreSubtree (undo/redo)
  const undoNode = w.createFilterNode(f.id, "text", "Marker", false, null, true, ["message"]);
  w.deleteFilterNodeWithUndo(undoNode.id);
  assert(!T.state.nodes[undoNode.id], "sanity: node deleted");
  w.undo();
  const restored = T.state.nodes[undoNode.id];
  assert(restored && restored.caseSensitive === true && JSON.stringify(restored.columns) === JSON.stringify(["message"]),
    "undo (snapshotSubtree/restoreSubtree) preserves caseSensitive/columns");

  // serializeFilterBranch / importFilterJson (save/load JSON)
  const fSave = await w.addFile("save-src.log", logText, () => {});
  const saveNode = w.createFilterNode(fSave.id, "text", "Marker", false, null, true, ["message", "thread"]);
  w.render();
  const branch = w.serializeFilterBranch(saveNode.id);
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const fLoad = await w.addFile("save-dest.log", logText, () => {});
  w.render();
  function W_setLoadTarget(targetId) {
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(targetId)};`;
    d.body.appendChild(s);
  }
  W_setLoadTarget(fLoad.id);
  w.importFilterJson(json);
  const loaded = T.state.nodes[fLoad.children[fLoad.children.length - 1]];
  assert(loaded.caseSensitive === true && JSON.stringify(loaded.columns.slice().sort()) === JSON.stringify(["message", "thread"]),
    "save/load JSON round trip preserves caseSensitive/columns");

  // serializeFilterTreeForCache / materializeCachedFilters (session cache)
  const fCacheSrc = await w.addFile("cache-src.log", logText, () => {});
  w.createFilterNode(fCacheSrc.id, "text", "Marker", false, null, true, ["message", "thread"]);
  w.render();
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(fCacheSrc);
  const fCacheDest = await w.addFile("cache-dest.log", logText, () => {});
  w.materializeCachedFilters(fCacheDest, cacheRoots);
  const cached = Object.values(T.state.nodes).find(n => n.parentId === fCacheDest.id);
  assert(cached && cached.caseSensitive === true && JSON.stringify(cached.columns.slice().sort()) === JSON.stringify(["message", "thread"]),
    "session-cache serialize/materialize round trip preserves caseSensitive/columns");
});
