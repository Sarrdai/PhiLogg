// GROUP 14 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 14 — Value assertions + Column statistics
   Origin: 7ef2c2a6 (items 1 & 2 of FEATURE_BACKLOG.md). Covers both
   assertion modes, the violation badge/cell tint, persistence through
   cloneSubtree (copy/paste) — save/load persistence for assertions is
   already covered in Group 11 — and the two-pass column-stats computation.
   ============================================================ */
group(14);
await withApp(async (w, d, T) => {
  section("14. Value assertions + Column statistics");
  const f = await w.addFile("a.log", makeLog(0, 10, { suffix: i => "n=" + i }), () => {});
  const node = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  // Set/edited via the Table toolbar's Value assertion button (moved off a
  // small per-column header button, person-requested) — disabled until a
  // whole column is fully selected; a plain header mousedown selects one
  // (same gesture getSingleSelectedColumn/F2 rename uses).
  const assertBtn = d.querySelector("#tableAssertBtn");
  const selectCol = col => d.querySelector('#extractHead th[data-col="' + col + '"]').dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  assert(assertBtn.disabled, "Value assertion button starts disabled — no column selected yet");
  selectCol(0);
  assert(!assertBtn.disabled, "button enables once a plottable column is fully selected");

  // Range mode via the real dialog. Bugfix regression guard: only the mode
  // actually selected above shows its own fields — classList.toggle("hidden",
  // ...) on #assertRangeFields/#assertTargetFields used to have no matching
  // CSS rule at all (same no-bare-.hidden scoping every other .hidden usage
  // needs, see isVisible's own comment / Group 70e), so both stayed visible
  // regardless of the mode toggle above them.
  fireClick(assertBtn, w);
  assert(!d.querySelector("#assertDialog").classList.contains("hidden"), "clicking the toolbar button opens the assertion dialog");
  assert(d.querySelector("#assertColLabel").textContent === w.findExtractColumn(0).name, "single-column selection labels the dialog with that column's name");
  assert(isVisible(d.querySelector("#assertRangeFields"), w) && !isVisible(d.querySelector("#assertTargetFields"), w),
    "Range mode (the default) shows only the min/max fields, not target/tolerance");
  d.querySelector("#assertMinInput").value = "3";
  d.querySelector("#assertMaxInput").value = "6";
  fireClick(d.querySelector("#assertDialogSave"), w);
  assert(node.assertions[0].mode === "range" && node.assertions[0].min === 3 && node.assertions[0].max === 6, "range assertion saved with min/max");
  const violationCount = T.extractRowsData.filter(r => w.checkAssertion(node, 0, r.values[0], "int") === true).length;
  assert(violationCount === 6, "range assertion flags values outside [3,6] as violations (0,1,2,7,8,9 = 6), got " + violationCount);
  assert(d.querySelectorAll("#extractBody .assert-violation").length === violationCount, "violating cells get the assert-violation tint");
  const summary = w.assertionSummary(node, 0);
  assert(summary.violations === violationCount && summary.total === 10, "assertionSummary matches the per-cell violation count");

  // Target ± tolerance mode
  selectCol(0);
  fireClick(assertBtn, w);
  fireClick(d.querySelector("#assertModeTarget"), w);
  assert(!isVisible(d.querySelector("#assertRangeFields"), w) && isVisible(d.querySelector("#assertTargetFields"), w),
    "switching to Target ± tolerance mode swaps which fields are shown, not just which button looks active");
  d.querySelector("#assertTargetInput").value = "5";
  d.querySelector("#assertToleranceInput").value = "1";
  fireClick(d.querySelector("#assertDialogSave"), w);
  assert(node.assertions[0].mode === "target" && node.assertions[0].target === 5 && node.assertions[0].tolerance === 1, "target±tolerance assertion overwrites the range assertion on the same column");
  assert(w.checkAssertion(node, 0, "5", "int") === false, "value exactly at target passes");
  assert(w.checkAssertion(node, 0, "9", "int") === true, "value outside target±tolerance violates");
  assert(w.checkAssertion(node, 0, "abc", "int") === null, "an unparseable value is neither pass nor violation (null)");

  // Clear
  selectCol(0);
  fireClick(assertBtn, w);
  fireClick(d.querySelector("#assertDialogClear"), w);
  assert(!node.assertions[0], "Clear removes the assertion for that column");

  // Multi-column: selecting several columns (plain click + Ctrl+click) and
  // saving once applies the SAME rule to all of them (person-requested —
  // "open the dialog once for the currently selected columns").
  const multiFile = await w.addFile("m.log", makeLog(0, 5, { suffix: i => "a=" + i + " b=" + (i + 1) }), () => {});
  const multiNode = w.createFilterNode(multiFile.id, "text", "a=[*:int] b=[*:int]");
  T.state.activeId = multiNode.id;
  w.render();
  w.applyFhView("table");
  selectCol(0);
  d.querySelector('#extractHead th[data-col="1"]').dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, ctrlKey: true }));
  assert(!assertBtn.disabled, "button enables with 2 columns fully selected via Ctrl+click");
  fireClick(assertBtn, w);
  assert(d.querySelector("#assertColLabel").textContent === "2 columns selected", "a multi-column selection labels the dialog with a count instead of a name");
  d.querySelector("#assertMinInput").value = "1";
  d.querySelector("#assertMaxInput").value = "2";
  fireClick(d.querySelector("#assertDialogSave"), w);
  assert(multiNode.assertions[0].min === 1 && multiNode.assertions[0].max === 2 && multiNode.assertions[1].min === 1 && multiNode.assertions[1].max === 2,
    "saving once with 2 columns selected applies the same rule to both");

  // Persistence through cloneSubtree (copy/paste) — save/load already covered in Group 11
  node.assertions = { 0: { mode: "range", min: 1, max: 8 } };
  const clone = w.cloneSubtree(node.id, f.id);
  assert(clone.assertions && clone.assertions[0].max === 8, "cloneSubtree carries assertions onto the copy");

  // Column statistics: min/max/mean/stddev, two-pass (not Math.min(...spread))
  // Switch back to the original 10-row node — the multi-column check above
  // left multiNode active.
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  const stats = w.computeColumnStats(0);
  const vals = Array.from({ length: 10 }, (_, i) => i);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  assert(stats.min === 0 && stats.max === 9, "column stats min/max correct");
  assert(Math.abs(stats.mean - mean) < 1e-9, "column stats mean correct");
  assert(Math.abs(stats.stddev - Math.sqrt(variance)) < 1e-6, "column stats stddev correct");
});
