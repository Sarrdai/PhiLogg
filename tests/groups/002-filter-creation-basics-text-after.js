// GROUP 2 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 2 — Filter creation basics (text/after/before/extract) + live match
   Origin: initial build + extraction-workflow session (765d68a9).
   ============================================================ */
group(2);
await withApp(async (w, d, T) => {
  section("2. Filter creation basics + live match + token chips");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  T.state.activeId = f.id;

  const textNode = w.createFilterNode(f.id, "text", "message 1");
  w.invalidateAllCaches();
  const entries = w.getEntries(textNode.id);
  assert(entries.length === 11, "text filter matches substring case-insensitively (msg 1, 10-19 = 11 entries), got " + entries.length);

  const afterNode = w.createFilterNode(f.id, "after", f.entries[10].ts);
  assert(w.getEntries(afterNode.id).length === 10, "after-filter keeps entries with ts >= value");
  const beforeNode = w.createFilterNode(f.id, "before", f.entries[10].ts);
  assert(w.getEntries(beforeNode.id).length === 11, "before-filter keeps entries with ts <= value");

  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  const spec = w.compileExtractPattern("message [*:int]");
  assert(spec && spec.columns.length === 1 && spec.columns[0].type === "int", "extract pattern compiles with one int column");
  assert(w.getEntries(extractNode.id).length === 20, "extract filter matches every row for this pattern");

  // Live-match + token chips (filter popup)
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "message 1";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200)); // evaluateLiveMatch is debounced 150ms
  assert(d.querySelector("#filterLiveMatch").textContent.includes("11 matches in 20"), "live match count reflects the typed filter before submit");

  const chip = d.querySelector('.token-chip[data-token="int"]');
  filterInput.value = "n=";
  filterInput.setSelectionRange(2, 2);
  fireClick(chip, w);
  assert(filterInput.value === "n=[*:int]", "token chip inserts the placeholder at the cursor");
  w.closeFilterPopup();
});
