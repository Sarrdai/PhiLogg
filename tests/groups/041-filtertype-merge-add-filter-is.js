// GROUP 41 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 41 — filterType merge: "Add filter" is the only outcome, a
   wildcard pattern makes the resulting "text" node ALSO extraction-capable
   (this session, follow-up to docs/archive/ui-implementation-plan.md — see that
   doc's newest section for the full writeup)
   Origin: this session. The separate "Extract" button/action and the
   dedicated "extract" filterType are retired outright — there is only ever
   "Add filter" now. A "text" filter node whose pattern contains
   [*:...]/[*] wildcards automatically both (a) filters/highlights
   normally, exactly like any other "text" node, AND (b) unlocks Table/Plot
   for itself (nodeHasExtractableWildcards, previously gated on
   filterType==="extract", now gated on filterType==="text" with a
   compilable wildcard pattern). A non-wildcard "text" node still has
   Table/Plot visible-but-disabled, unchanged from before this merge. This
   replaces the old two-button "Extract vs. Add filter" design (formerly
   Group 41) entirely — #filterExtractBtn no longer exists.
   ============================================================ */
group(41);
await withApp(async (w, d, T) => {
  section("41. filterType merge: wildcard 'text' filter unlocks Table/Plot");

  assert(d.querySelector("#filterExtractBtn") === null, "the old separate 'Extract' button is gone from the popup entirely");

  const log = `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"retrying after 3 attempts"\n` +
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"retrying after 7 attempts"\n`;
  const f = await w.addFile("repro.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  // "Filter for this ___" -> "Add filter" (the only button) creates a
  // "text" node, ALSO extraction-capable since its value has a wildcard.
  fireContextMenu(d.querySelector(".log-row"), w, 50, 50);
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "retrying after [*:int] attempts", "sanity: the numeric content became a wildcard pattern");
  fireSubmit(d.querySelector("#filterForm"), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "text", "'Add filter' always creates a 'text' node — there is no other outcome to choose between anymore");
  assert(w.getEntries(created.id).length === 2, "and it actually filters correctly via the wildcard shape, matching both rows");
  assert(w.nodeHasExtractableWildcards(created) === true, "the wildcard pattern makes this 'text' node extraction-capable — Table/Plot are unlocked for it");

  // A plain, non-wildcard "text" filter stays NOT extraction-capable.
  const plainNode = w.createFilterNode(f.id, "text", "retrying");
  assert(w.nodeHasExtractableWildcards(plainNode) === false, "a plain 'text' filter with no [*:...]/[*] tokens is not extraction-capable");

  // Editing a node's pattern to add/remove wildcards flips its
  // extraction-capability live — same node, same filterType, just a
  // different pattern (there is no type to "flip" anymore).
  w.openEditFilterPopup(created.id);
  assert(d.querySelector("#filterSubmitBtn").textContent === "Save", "edit mode's button reads 'Save'");
  d.querySelector("#filterInput").value = "retrying after 3 attempts"; // literal, no wildcard
  fireInput(d.querySelector("#filterInput"), w);
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(created.filterType === "text" && w.nodeHasExtractableWildcards(created) === false,
    "editing a wildcard filter's pattern down to plain text keeps it a 'text' node, just no longer extraction-capable");

  w.openEditFilterPopup(created.id);
  d.querySelector("#filterInput").value = "retrying after [*:int] attempts"; // add the wildcard back
  fireInput(d.querySelector("#filterInput"), w);
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(created.filterType === "text" && w.nodeHasExtractableWildcards(created) === true,
    "editing the pattern back to include a wildcard makes the SAME node extraction-capable again");
});
