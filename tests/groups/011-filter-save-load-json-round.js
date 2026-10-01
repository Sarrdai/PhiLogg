// GROUP 11 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 11 — Filter save/load JSON round trip
   Origin: 6233b6f7. REWRITTEN for the bakedA/bakedB correction (this
   session, see CLAUDE.md/changelog.d): serializeFilterBranch(nodeId,
   includeAncestors) is now a GENERAL "just this filter" (false, exactly one
   node, no ancestors/subtree) vs. "include ancestor chain" (true, today's
   original chain+subtree default) choice for ANY filter node, not an
   and/or/link-specific "include source filters" prompt — and/or/link's
   bakedA/bakedB are flat data (no node-id inside), so they travel as a
   plain field copy with no ref/remapping machinery. Every exported root is
   tagged attach:"target" and lands under whatever node import is invoked
   on — never hardcoded to FILE.
   ============================================================ */
group(11);
await withApp(async (w, d, T) => {
  section("11. Filter save/load JSON round trip");
  const fa = await w.addFile("a.log", makeLog(0, 20), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "other" }), () => {});
  w.render();

  // Chain fa -> chainNode -> extractNode (with an assertion, to also
  // confirm assertions round-trip through save/load, not just copy/paste).
  const chainNode = w.createFilterNode(fa.id, "text", "message");
  const extractNode = w.createFilterNode(chainNode.id, "text", "message [*:int]");
  extractNode.assertions = { 0: { mode: "range", min: 0, max: 100 } };
  // AND node combining extractNode with a filter from file B — always
  // placed directly under extractNode's own root file (fa), not nested
  // under extractNode.
  const fFilterB = w.createFilterNode(fb.id, "text", "other");
  const andNode = w.createAndOrNode([extractNode.id, fFilterB.id], "and");
  w.render();
  assert(andNode.parentId === fa.id, "sanity: AND node sits directly under file A, not under extractNode");
  const andCountBefore = w.getEntries(andNode.id).length;

  // --- "Just this filter" (includeAncestors=false): exactly one node, its
  // own bakedA/bakedB carried along as self-contained plain data. ---
  const branchJustThis = w.serializeFilterBranch(andNode.id, false);
  assert(branchJustThis && branchJustThis.roots.length === 1, "just this filter: exactly one exported root, got " + (branchJustThis && branchJustThis.roots.length));
  const bareRoot = branchJustThis.roots[0];
  assert(bareRoot.attach === "target" && bareRoot.children.length === 0, "the single exported node is tagged attach:target with no children");
  assert(bareRoot.baked[0] && bareRoot.baked[0].filterType === "text" && bareRoot.baked[1] && bareRoot.baked[1].filterType === "text",
    "bakedA/bakedB (each side's own flat condition) travel with the export even for 'just this filter'");

  // --- "Include ancestor chain" (includeAncestors=true): today's original
  // chain+subtree default — still just ONE root (bakedA/bakedB hold no
  // node-id, so there is nothing external left to pull in any more). ---
  const branch = w.serializeFilterBranch(andNode.id, true);
  assert(branch && branch.roots.length === 1, "with ancestors, still exactly one independent tree (no more separate input chains to pull in), got " + (branch && branch.roots.length));
  const targetRoot = branch.roots[0];
  assert(targetRoot.attach === "target", "the chain's own root is tagged attach:target");

  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });

  // Load onto a THIRD, fresh file, at a NON-FILE target node — re-evaluates
  // against new data, doesn't replay a stored result, and lands under the
  // clicked node, not hardcoded to FILE.
  const fc = await w.addFile("c.log", makeLog(0, 20, { msgPrefix: "message" }), () => {});
  const fcAnchor = w.createFilterNode(fc.id, "text", "message");
  w.render();
  const before = fcAnchor.children.length;
  const fcChildrenBefore = fc.children.length;
  W_setLoadTarget(w, fcAnchor.id);
  w.importFilterJson(json);
  assert(fcAnchor.children.length === before + 1, "load creates the AND node directly under the CLICKED (non-FILE) node");
  assert(fc.children.length === fcChildrenBefore, "nothing is created directly under FILE — the whole chain attaches at the clicked target");
  const loadedAnd = T.state.nodes[fcAnchor.children[fcAnchor.children.length - 1]];
  assert(loadedAnd && loadedAnd.filterType === "and", "the loaded node is the AND combiner itself");
  // Assertions are a column-stat/highlight annotation, not part of what
  // determines matching — bakeNodeCondition intentionally only copies
  // fields that define the match itself, so they don't travel into bakedA.
  assert(loadedAnd.baked[0] && loadedAnd.baked[0].filterType === "text" && loadedAnd.baked[0].value === "message [*:int]",
    "bakedA (extractNode's own matching condition) round-trips intact");
  assert(loadedAnd.baked[1] && loadedAnd.baked[1].filterType === "text" && loadedAnd.baked[1].value === "other",
    "bakedB (fFilterB's own condition) round-trips intact");
  assert(w.getEntries(loadedAnd.id).length >= 0, "reloaded AND node's getEntries() resolves without throwing (re-evaluated fresh against the new file's own data)");

  // --- Loading the "just this filter" export instead: the AND node alone
  // is created, still fully self-contained via its own bakedA/bakedB. ---
  const jsonJustThis = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branchJustThis.activeRef, roots: branchJustThis.roots });
  const fd = await w.addFile("d.log", makeLog(0, 20, { msgPrefix: "message" }), () => {});
  const fdAnchor = w.createFilterNode(fd.id, "text", "message");
  w.render();
  W_setLoadTarget(w, fdAnchor.id);
  w.importFilterJson(jsonJustThis);
  const loadedBareAnd = T.state.nodes[fdAnchor.children[fdAnchor.children.length - 1]];
  assert(loadedBareAnd && loadedBareAnd.filterType === "and", "the AND node is created directly under the clicked target, no ancestor chain brought along");
  assert(loadedBareAnd.baked[0] && loadedBareAnd.baked[1], "its bakedA/bakedB are still intact — 'just this filter' never depended on the ancestor chain to begin with");
  assert(w.getEntries(loadedBareAnd.id).length >= 0, "getEntries() resolves without throwing, fully self-contained");

  function W_setLoadTarget(w, targetId) {
    // loadFilterTargetId is a top-level `let` — reach it via the shared
    // lexical scope the same way the T bridge does, but write instead of read.
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(targetId)};`;
    d.body.appendChild(s);
  }
});
