// GROUP 122 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 122 — Regex filter type: "Interpret input as regex" toggle
   Origin: this session (FEATURE_BACKLOG.md #16). A real JS RegExp,
   alongside (not replacing) the wildcard-token "text" filter language —
   toggled per-node via node.isRegex on the SAME "text" filterType (no new
   filter type), gated in the filter popup by
   #filterRegexCheckbox (since 2026-09-23 the Text/Regex segmented switch,
   #filterSyntaxText/#filterSyntaxRegex). Case-sensitivity/column-restriction stay available
   in both modes; only the wildcard-token-specific UI (token chips, the
   pattern preview) hides while regex mode is on. An invalid regex degrades
   to an empty match set (getEntries) / an inline error state (the popup),
   never a thrown exception. Threaded through every persistence carrier per
   CLAUDE.md's "Known gotchas": cloneSubtree, snapshotSubtree/restoreSubtree
   (+ the field-edit-undo captureNodeFields/applyNodeFields carrier),
   serializeFilterBranch/importFilterJson, serializeFilterTreeForCache/
   materializeCachedFilters.
   ============================================================ */
group(122);
await withApp(async (w, d, T) => {
  section("122. Regex filter type: \"Interpret input as regex\" toggle");

  const lines = [
    `2024-01-15 10:00:00,000\tERROR\t"worker-1"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"connection reset by peer"`, // 0
    `2024-01-15 10:00:01,000\tINFO\t"worker-2"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"connection established"`,     // 1
    `2024-01-15 10:00:02,000\tINFO\t"worker-2"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"nothing interesting"`,        // 2
    `2024-01-15 10:00:03,000\tERROR\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"CONNECTION timed out"`,          // 3
  ];
  const logText = lines.join("\n") + "\n";
  const f = await w.addFile("regex.log", logText, () => {});
  w.render();

  // --- getEntries semantics: node.isRegex compiles a real RegExp ---
  // Restricted to the "message" column so "^" anchors to the message text
  // itself, not the raw tab-separated line (which starts with the
  // timestamp) — same textColumnValue lookup textFilterMatches always uses.
  const re = w.createFilterNode(f.id, "text", "^connection", false, null, false, ["message"], true);
  assert(re.filterType === "text" && re.isRegex === true, "isRegex:true stays a plain \"text\" node — no new filterType");
  assert(w.getEntries(re.id).length === 3 && [0, 1, 3].every(i => w.getEntries(re.id).some(e => e.id === f.entries[i].id)),
    "a real regex ('^connection') matches by real regex semantics (anchored to the start of the message) — entries 0, 1 and 3, case-insensitively by default (unlike a wildcard-token pattern, this is a genuine RegExp)");

  // --- Case-sensitivity still applies to regex mode ---
  const reCaseSensitive = w.createFilterNode(f.id, "text", "^CONNECTION", false, null, true, ["message"], true);
  assert(w.getEntries(reCaseSensitive.id).length === 1 && w.getEntries(reCaseSensitive.id)[0].id === f.entries[3].id,
    "case-sensitive regex mode matches only the exact-case 'CONNECTION' at entry 3");

  // --- Column restriction still applies to regex mode ---
  const reColumns = w.createFilterNode(f.id, "text", "^worker-2$", false, null, false, ["thread"], true);
  assert(w.getEntries(reColumns.id).length === 2 && w.getEntries(reColumns.id).every(e => e.thread === "worker-2"),
    "column-restricted regex mode ('thread' only) matches entries 1 and 2 by their thread field");

  // --- An invalid regex fails gracefully (empty result, no throw) ---
  const reInvalid = w.createFilterNode(f.id, "text", "(unterminated", false, null, false, null, true);
  let threw = false;
  let invalidResult;
  try { invalidResult = w.getEntries(reInvalid.id); } catch (err) { threw = true; }
  assert(!threw, "an invalid regex (unbalanced group) does not throw inside getEntries");
  assert(Array.isArray(invalidResult) && invalidResult.length === 0, "an invalid regex degrades to an empty match set");

  // --- Popup UI: toggling regex mode hides wildcard-token-specific UI, keeps the rest ---
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  assert(!d.querySelector("#filterSyntaxRegex").classList.contains("active") && d.querySelector("#filterSyntaxText").classList.contains("active"),
    "the Text/Regex syntax switch defaults to Text");
  assert(isVisible(d.querySelector("#filterTokenChips"), w), "sanity: token chips visible before regex mode is toggled on");

  fireClick(d.querySelector("#filterSyntaxRegex"), w);
  assert(!isVisible(d.querySelector("#filterTokenChips"), w), "turning regex mode on hides the wildcard-token insert chips");
  assert(!d.querySelector("#filterCaseCheckbox").disabled && !d.querySelector("#filterColumnChips").classList.contains("hidden"),
    "case-sensitivity and column-restriction stay visible/enabled in regex mode — only wildcard-specific UI is hidden");

  fireClick(d.querySelector('.column-chip[data-col="message"]'), w); // anchor "^" against the message text, not the raw line
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "^connection";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("3 matches in 4"), "live match count works in regex mode too (case-insensitive '^connection' also matches entry 3's 'CONNECTION')");

  // Invalid regex while typing -> inline error state, not a crash
  filterInput.value = "(unterminated";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent === "Invalid regex" && d.querySelector("#filterLiveMatch").classList.contains("error"),
    "an invalid regex shows an inline \"Invalid regex\" error instead of crashing the live-match preview");

  // Submitting an invalid regex keeps the popup open instead of creating a broken node
  const beforeSubmitCount = f.children.length;
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(f.children.length === beforeSubmitCount, "submitting an invalid regex does not create a filter node");
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "the popup stays open so the regex can be fixed");

  // Fix it and submit for real
  filterInput.value = "^connection";
  fireInput(filterInput, w);
  fireSubmit(d.querySelector("#filterForm"), w);
  const uiCreated = T.state.nodes[T.state.activeId];
  assert(uiCreated.filterType === "text" && uiCreated.isRegex === true && uiCreated.value === "^connection",
    "submitting the popup with regex mode on creates a \"text\" node with isRegex:true");

  // --- Persistence carriers ---

  // cloneSubtree (copy/paste)
  const cloneSource = w.createFilterNode(f.id, "text", "^connection", false, null, true, ["message"], true);
  T.state.activeId = cloneSource.id;
  T.state.clipboard = { id: cloneSource.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const pasted = T.state.nodes[f.children[f.children.length - 1]];
  assert(pasted.isRegex === true, "cloneSubtree (copy/paste) carries isRegex to the pasted copy");

  // snapshotSubtree/restoreSubtree (undo/redo, via delete)
  const undoNode = w.createFilterNode(f.id, "text", "^connection", false, null, false, null, true);
  w.deleteFilterNodeWithUndo(undoNode.id);
  assert(!T.state.nodes[undoNode.id], "sanity: node deleted");
  w.undo();
  const restored = T.state.nodes[undoNode.id];
  assert(restored && restored.isRegex === true, "undo (snapshotSubtree/restoreSubtree) preserves isRegex");

  // withFieldEditUndo's captureNodeFields/applyNodeFields (in-place edit undo)
  const editNode = w.createFilterNode(f.id, "text", "old", false, null, false, null, false);
  w.updateFilterNodeWithUndo(editNode.id, "text", "^connection", false, undefined, false, null, true);
  assert(editNode.isRegex === true, "sanity: the edit itself set isRegex");
  w.undo();
  assert(!editNode.isRegex, "undoing an in-place field edit (captureNodeFields/applyNodeFields) reverts isRegex too");
  w.redo();
  assert(editNode.isRegex === true, "redo re-applies isRegex");

  // serializeFilterBranch / importFilterJson (save/load JSON)
  const fSave = await w.addFile("regex-save-src.log", logText, () => {});
  const saveNode = w.createFilterNode(fSave.id, "text", "^connection", false, null, false, null, true);
  w.render();
  const branch = w.serializeFilterBranch(saveNode.id);
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const fLoad = await w.addFile("regex-save-dest.log", logText, () => {});
  w.render();
  const setScript = d.createElement("script");
  setScript.textContent = `loadFilterTargetId = ${JSON.stringify(fLoad.id)};`;
  d.body.appendChild(setScript);
  w.importFilterJson(json);
  const loaded = T.state.nodes[fLoad.children[fLoad.children.length - 1]];
  assert(loaded.isRegex === true && loaded.value === "^connection", "save/load JSON round trip preserves isRegex");

  // serializeFilterTreeForCache / materializeCachedFilters (session cache)
  const fCacheSrc = await w.addFile("regex-cache-src.log", logText, () => {});
  w.createFilterNode(fCacheSrc.id, "text", "^connection", false, null, false, null, true);
  w.render();
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(fCacheSrc);
  const fCacheDest = await w.addFile("regex-cache-dest.log", logText, () => {});
  w.materializeCachedFilters(fCacheDest, cacheRoots);
  const cached = Object.values(T.state.nodes).find(n => n.parentId === fCacheDest.id);
  assert(cached && cached.isRegex === true, "session-cache serialize/materialize round trip preserves isRegex");
});
