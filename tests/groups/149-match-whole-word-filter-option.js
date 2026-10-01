// GROUP 149 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 149 — "Match whole word" filter option (node.wholeWord)
   Origin: this session, person-requested. A fourth boolean on the SAME
   "text" filterType (no new filter type), alongside caseSensitive/columns/
   isRegex: "Test" matches "Test is active" but not "Testing activated".
   Default off. Deliberately scoped to the LITERAL branch — a regex and the
   wildcard-token language both express boundaries themselves — so the
   popup greys the toggle out for those two and commitFilter never stores a
   flag that would do nothing. Word characters are Unicode-aware
   (\p{L}/\p{N}/_), not \b's ASCII-only class, so "Gr" does not whole-word
   match inside "Größe". Threaded through every persistence carrier per
   CLAUDE.md's "Known gotchas": cloneSubtree, snapshotSubtree/restoreSubtree
   (+ captureNodeFields/applyNodeFields), serializeFilterBranch/
   importFilterJson, serializeFilterTreeForCache/materializeCachedFilters,
   plus bakeNodeCondition/getEntriesFromBaked for and/or/link sides.
   Also covers the same session's UI unification: every boolean in the
   filter popup now renders as the Settings on/off switch (.settings-switch)
   instead of a native checkbox.
   ============================================================ */
group(149);
await withApp(async (w, d, T) => {
  section("149. \"Match whole word\" filter option");

  const lines = [
    `2024-01-15 10:00:00,000\tERROR\t"worker-1"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"Test is active"`,       // 0
    `2024-01-15 10:00:01,000\tINFO\t"worker-2"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Testing activated"`,     // 1
    `2024-01-15 10:00:02,000\tINFO\t"worker-2"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"unit-Test done"`,        // 2
    `2024-01-15 10:00:03,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"retest pending"`,            // 3
    `2024-01-15 10:00:04,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 4\t[DoWork]\t"TEST shouted"`,              // 5
    `2024-01-15 10:00:05,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 5\t[DoWork]\t"Größe berechnet"`,           // 5
  ];
  const logText = lines.join("\n") + "\n";
  const f = await w.addFile("wholeword.log", logText, () => {});
  w.render();
  const ids = n => w.getEntries(n.id).map(e => f.entries.indexOf(e)).sort((a, b) => a - b);

  // --- getEntries semantics: off by default, on when set -----------------
  const plain = w.createFilterNode(f.id, "text", "Test", false, null, false, ["message"]);
  assert(plain.wholeWord === undefined, "a plain text filter gets no wholeWord field by default (unchecked default)");
  assert(JSON.stringify(ids(plain)) === JSON.stringify([0, 1, 2, 3, 4]),
    "sanity: without whole-word, \"Test\" matches every substring occurrence including \"Testing\"/\"retest\", got " + JSON.stringify(ids(plain)));

  const whole = w.createFilterNode(f.id, "text", "Test", false, null, false, ["message"], false, true);
  assert(whole.filterType === "text" && whole.wholeWord === true, "wholeWord:true stays a plain \"text\" node — no new filterType");
  assert(JSON.stringify(ids(whole)) === JSON.stringify([0, 2, 4]),
    "whole-word keeps \"Test is active\", \"unit-Test done\" (a hyphen is a boundary) and \"TEST shouted\", " +
    "and drops \"Testing activated\"/\"retest pending\", got " + JSON.stringify(ids(whole)));

  // Unicode boundary: \b would call "Gr|ößs" a word boundary (ö is not in
  // its ASCII class) and match inside "Größe"; isWordChar must not.
  const umlaut = w.createFilterNode(f.id, "text", "Gr", false, null, false, ["message"], false, true);
  assert(w.getEntries(umlaut.id).length === 0,
    "whole-word is Unicode-aware: \"Gr\" does not match inside \"Größe\" (an ASCII-only \\b would have)");
  const umlautWhole = w.createFilterNode(f.id, "text", "Größe", false, null, false, ["message"], false, true);
  assert(w.getEntries(umlautWhole.id).length === 1, "...while the full \"Größe\" still matches as a whole word");

  // --- Combines with case-sensitivity and column restriction -------------
  const wholeCase = w.createFilterNode(f.id, "text", "Test", false, null, true, ["message"], false, true);
  assert(JSON.stringify(ids(wholeCase)) === JSON.stringify([0, 2]),
    "whole-word combines with case-sensitivity — \"TEST shouted\" drops out, got " + JSON.stringify(ids(wholeCase)));
  const wholeThread = w.createFilterNode(f.id, "text", "work", false, null, false, ["thread"], false, true);
  assert(w.getEntries(wholeThread.id).length === 0,
    "whole-word applies to a column-restricted search too: \"work\" is glued to \"er\" in every thread name");
  const wholeThread2 = w.createFilterNode(f.id, "text", "worker", false, null, false, ["thread"], false, true);
  assert(w.getEntries(wholeThread2.id).length === 3,
    "...while \"worker\" does match \"worker-1\"/\"worker-2\" — the hyphen is a boundary, got " + w.getEntries(wholeThread2.id).length);

  // Column-less (whole raw line) works the same way.
  const wholeRaw = w.createFilterNode(f.id, "text", "Test", false, null, false, null, false, true);
  assert(JSON.stringify(ids(wholeRaw)) === JSON.stringify([0, 2, 4]),
    "a column-less whole-word filter searches the raw line with the same boundary rule, got " + JSON.stringify(ids(wholeRaw)));

  // --- and/or sides: bakeNodeCondition/getEntriesFromBaked ---------------
  const other = w.createFilterNode(f.id, "text", "active", false, null, false, ["message"]);
  const andNode = w.createAndOrNode([whole.id, other.id], "and");
  assert(andNode && JSON.stringify(w.getEntries(andNode.id).map(e => f.entries.indexOf(e))) === JSON.stringify([0]),
    "an AND over a whole-word side bakes the flag in: only \"Test is active\" satisfies both, got " +
    JSON.stringify(w.getEntries(andNode.id).map(e => f.entries.indexOf(e))));
  assert(andNode.baked[0].wholeWord === true, "bakeNodeCondition copies wholeWord into the baked side");

  // --- Match highlighting honours it (textFilterMatchSpec/findMatchRanges) ---
  const spec = w.textFilterMatchSpec(whole);
  assert(spec && spec.wholeWord === true, "textFilterMatchSpec carries wholeWord for a literal filter");
  assert(JSON.stringify(w.findMatchRanges("Testing a Test now", spec)) === JSON.stringify([[10, 14]]),
    "findMatchRanges marks only the standalone \"Test\", not the one inside \"Testing\", got " +
    JSON.stringify(w.findMatchRanges("Testing a Test now", spec)));
  const plainSpec = w.textFilterMatchSpec(plain);
  assert(w.findMatchRanges("Testing a Test now", plainSpec).length === 2,
    "...and a filter without the flag still marks both occurrences");

  // --- Popup UI ----------------------------------------------------------
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  const wholeWordCheckbox = d.querySelector("#filterWholeWordCheckbox");
  assert(wholeWordCheckbox && pillChecked(wholeWordCheckbox) === false, "the \"Match whole word\" toggle defaults to OFF (person-specified default)");
  assert(!wholeWordCheckbox.disabled,
    "it starts out enabled for the empty (literal) input");

  // Every boolean in the popup is a role=switch button on the pill-toggle
  // state protocol, drawn as a standalone label-only toggle (Group 263).
  ["filterCaseCheckbox", "filterWholeWordCheckbox", "filterInvertCheckbox"].forEach(id => {
    const box = d.querySelector("#" + id);
    assert(box.tagName === "BUTTON" && box.classList.contains("label-toggle") && box.getAttribute("role") === "switch",
      "#" + id + " is a role=switch .label-toggle button (unified boolean control)");
    assert(box.hasAttribute("aria-checked"), "#" + id + " carries aria-checked state");
  });

  // Live-match count reflects the toggle.
  fireClick(d.querySelector('.column-chip[data-col="message"]'), w);
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "Test";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("5 matches in 6"),
    "live match count without whole-word: 5 of 6 rows, got " + d.querySelector("#filterLiveMatch").textContent);
  fireClick(wholeWordCheckbox, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("3 matches in 6"),
    "turning \"Match whole word\" on drops \"Testing\"/\"retest\" from the live count, got " + d.querySelector("#filterLiveMatch").textContent);

  // A wildcard pattern greys it out — that language has its own boundaries.
  filterInput.value = "Test [*:word]";
  fireInput(filterInput, w);
  assert(wholeWordCheckbox.disabled,
    "typing a wildcard-token pattern disables the whole-word toggle instead of letting it sit there as a no-op");
  filterInput.value = "Test";
  fireInput(filterInput, w);
  assert(!wholeWordCheckbox.disabled, "...and removing the token re-enables it");

  // So does regex mode.
  fireClick(d.querySelector("#filterSyntaxRegex"), w);
  assert(wholeWordCheckbox.disabled,
    "regex mode disables the whole-word toggle too (\\b/lookarounds do the job there)");
  fireClick(d.querySelector("#filterSyntaxText"), w);
  assert(!wholeWordCheckbox.disabled, "leaving regex mode re-enables it");

  // Submitting stores the flag.
  fireSubmit(d.querySelector("#filterForm"), w);
  const uiCreated = T.state.nodes[T.state.activeId];
  assert(uiCreated.filterType === "text" && uiCreated.wholeWord === true && uiCreated.value === "Test",
    "submitting the popup with the toggle on creates a \"text\" node with wholeWord:true");
  assert(JSON.stringify(ids(uiCreated)) === JSON.stringify([0, 2, 4]), "...and it filters as a whole-word match");

  // A regex filter never stores the flag, even with the box left checked.
  w.openFilterPopup();
  setPill(d.querySelector("#filterWholeWordCheckbox"), true);
  fireClick(d.querySelector("#filterSyntaxRegex"), w);
  d.querySelector("#filterInput").value = "Test";
  fireInput(d.querySelector("#filterInput"), w);
  fireSubmit(d.querySelector("#filterForm"), w);
  const regexCreated = T.state.nodes[T.state.activeId];
  assert(regexCreated.isRegex === true && regexCreated.wholeWord === undefined,
    "a regex filter never carries wholeWord — the flag would do nothing there");

  // Edit mode pre-fills the toggle from the node, and clearing it sticks.
  w.openEditFilterPopup(uiCreated.id);
  assert(pillChecked(d.querySelector("#filterWholeWordCheckbox")) === true, "edit mode pre-fills \"Match whole word\" from the node");
  setPill(d.querySelector("#filterWholeWordCheckbox"), false);
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(uiCreated.wholeWord === undefined, "saving an edit with the toggle cleared removes the flag from the node");

  // --- Persistence carriers ---------------------------------------------

  // cloneSubtree (copy/paste)
  const cloneSource = w.createFilterNode(f.id, "text", "Test", false, null, false, ["message"], false, true);
  T.state.clipboard = { id: cloneSource.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const pasted = T.state.nodes[f.children[f.children.length - 1]];
  assert(pasted.wholeWord === true, "cloneSubtree (copy/paste) carries wholeWord to the pasted copy");

  // snapshotSubtree/restoreSubtree (undo of a delete)
  const undoNode = w.createFilterNode(f.id, "text", "Test", false, null, false, null, false, true);
  w.deleteFilterNodeWithUndo(undoNode.id);
  assert(!T.state.nodes[undoNode.id], "sanity: node deleted");
  w.undo();
  const restored = T.state.nodes[undoNode.id];
  assert(restored && restored.wholeWord === true, "undo (snapshotSubtree/restoreSubtree) preserves wholeWord");

  // captureNodeFields/applyNodeFields (in-place field-edit undo)
  const editNode = w.createFilterNode(f.id, "text", "old", false, null, false, null, false, false);
  w.updateFilterNodeWithUndo(editNode.id, "text", "Test", false, undefined, false, null, false, true);
  assert(editNode.wholeWord === true, "sanity: the edit itself set wholeWord");
  w.undo();
  assert(!editNode.wholeWord, "undoing an in-place field edit (captureNodeFields/applyNodeFields) reverts wholeWord too");
  w.redo();
  assert(editNode.wholeWord === true, "redo re-applies wholeWord");

  // serializeFilterBranch / importFilterJson (save/load JSON)
  const fSave = await w.addFile("ww-save-src.log", logText, () => {});
  const saveNode = w.createFilterNode(fSave.id, "text", "Test", false, null, false, ["message"], false, true);
  w.render();
  const branch = w.serializeFilterBranch(saveNode.id);
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const fLoad = await w.addFile("ww-save-dest.log", logText, () => {});
  w.render();
  const setScript = d.createElement("script");
  setScript.textContent = `loadFilterTargetId = ${JSON.stringify(fLoad.id)};`;
  d.body.appendChild(setScript);
  w.importFilterJson(json);
  const loaded = T.state.nodes[fLoad.children[fLoad.children.length - 1]];
  assert(loaded.wholeWord === true && loaded.value === "Test", "save/load JSON round trip preserves wholeWord");

  // serializeFilterTreeForCache / materializeCachedFilters (session cache)
  const fCacheSrc = await w.addFile("ww-cache-src.log", logText, () => {});
  w.createFilterNode(fCacheSrc.id, "text", "Test", false, null, false, null, false, true);
  w.render();
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(fCacheSrc);
  const fCacheDest = await w.addFile("ww-cache-dest.log", logText, () => {});
  w.materializeCachedFilters(fCacheDest, cacheRoots);
  const cached = Object.values(T.state.nodes).find(n => n.parentId === fCacheDest.id);
  assert(cached && cached.wholeWord === true, "session-cache serialize/materialize round trip preserves wholeWord");
});
