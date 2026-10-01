// GROUP 173 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 173 — This session (2026-09-04): Table/Plot upward-lookup
   inheritance. A filter node created under an extraction-pattern "text"
   node (findExtractionAncestor/nodeIsExtractionView) now ALSO shows a
   Table/Plot view — narrowing filters (timerange, idset, level, ...) and
   context/countContext are transparent for this purpose; a "link" filter
   is not (its paired entries change shape), so nothing above a link node
   counts. renderExtractTable applies the inherited ANCESTOR's pattern to
   the CHILD's own (already-narrowed) entries.
   ============================================================ */
group(173);
await withApp(async (w, d, T) => {
  section("173a. a timerange filter under an extraction node inherits Table/Plot, applying the ancestor's pattern to its own narrowed entries");

  const log = [0, 1, 2].map(i =>
    `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i} score=${i}.5"`
  ).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  const extractNode = w.createFilterNode(f.id, "text", "id=[*:int] score=[*:float]");
  assert(w.nodeHasExtractableWildcards(extractNode) === true, "sanity: the pattern node itself is extraction-capable");

  // Narrow to just the last two entries (ts >= entry 1's timestamp).
  const allEntries = w.getEntries(extractNode.id);
  const timeNode = w.createFilterNode(extractNode.id, "timerange", { from: allEntries[1].ts, to: null });
  assert(w.nodeHasExtractableWildcards(timeNode) === false, "the timerange node itself carries no pattern");
  assert(w.nodeIsExtractionView(timeNode) === true, "but it INHERITS extraction-view from its 'text' ancestor");
  assert(w.findExtractionAncestor(timeNode) && w.findExtractionAncestor(timeNode).id === extractNode.id,
    "findExtractionAncestor resolves to the pattern-bearing ancestor node");

  T.state.activeId = timeNode.id;
  w.render();
  w.applyFhView("table");
  assert(T.fhActiveTab === "table", "the Table tab is reachable for the inherited node");

  const narrowedEntries = w.getEntries(timeNode.id);
  assert(narrowedEntries.length === 2, "sanity: the timerange filter narrowed to entries 1 and 2, got " + narrowedEntries.length);
  assert(T.extractRowsData.length === 2, "the extraction table built exactly the CHILD's own (narrowed) 2 rows, not the ancestor's 3");
  assert(T.extractColumns.some(c => c.name === "id"), "the table's columns come from the ANCESTOR's pattern ([*:int]/[*:float])");
  assert(T.extractRowsData[0].values[0] === "1", "row values are the ancestor's pattern applied to the child's own first (narrowed) entry, got " + JSON.stringify(T.extractRowsData.map(r => r.values[0])));

  section("173b. a filter under a LINK node does not inherit Table/Plot from further up, even past a real extraction node");

  // Link nodes are normally created via a two-node pairing UI action (see
  // GROUP 8/128's coverage of that flow); findExtractionAncestor only cares
  // about .type/.filterType/.parentId, so a minimal hand-built node is
  // enough to exercise the walk without going through that flow.
  const linkNode = { id: w.uid("n"), type: "filter", filterType: "link", name: "Link", parentId: extractNode.id, children: [], value: {} };
  T.state.nodes[linkNode.id] = linkNode;
  T.state.nodes[extractNode.id].children.push(linkNode.id);
  const underLink = w.createFilterNode(linkNode.id, "level", ["INFO"]);
  assert(w.findExtractionAncestor(underLink) === null, "walking a link node's child upward stops AT the link node — null, no extraction ancestor");
  assert(w.nodeIsExtractionView(underLink) === false, "so the node under the link filter does not show Table/Plot");
  assert(w.nodeIsExtractionView(linkNode) === false, "the link node itself is not extraction-view either (unchanged pre-existing behavior)");

  section("173c. a plain narrowing chain with no extraction ancestor stays non-extraction (regression baseline)");

  const plainText = w.createFilterNode(f.id, "text", "INFO");
  const plainTime = w.createFilterNode(plainText.id, "timerange", { from: null, to: null });
  assert(w.nodeHasExtractableWildcards(plainText) === false, "sanity: a plain literal 'text' filter has no wildcards");
  assert(w.findExtractionAncestor(plainTime) === null, "no extraction-pattern ancestor anywhere up this chain");
  assert(w.nodeIsExtractionView(plainTime) === false, "so this ordinary narrowing chain never shows Table/Plot");
});
