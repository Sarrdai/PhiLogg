// GROUP 135 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 135 — General "Just this filter" vs "Include ancestor chain"
   export/import scope (this session, see CLAUDE.md/changelog.d). Replaces
   the removed and/or/link-specific "Include source filters used by
   combined nodes?" dialog — the choice is now offered for ANY filter node
   in the actual Save/Export JSON and Save-to-library flows, and the
   imported branch always attaches under whatever node is currently
   active/selected at import time (never hardcoded to FILE). Also a
   regression guard for the reported bug: the dialog must never appear
   unconditionally at app startup.
   ============================================================ */
group(135);
await withApp(async (w, d, T) => {
  section("135. General export-scope option (just this filter / with ancestor chain) + no startup dialog");

  // --- Regression guard: the export-scope dialog is never shown at boot,
  // only as part of an actual save/export action. ---
  const exportScopeDialogEl = d.querySelector("#exportScopeDialog");
  assert(exportScopeDialogEl.classList.contains("hidden"), "the export-scope dialog is hidden at app startup, before any save/export action");
  // --- Regression guard: #exportScopeDialog previously had NO CSS at all
  // (no .hidden{display:none} rule, no modal-overlay positioning), so it
  // rendered inline in the document flow instead of a proper fixed overlay
  // dialog — permanently visible, stuck wherever it happened to fall in the
  // body, and unclickable/invisible in practice, which also silently hung
  // saveFilterToLibrary forever (its resolve() never fires, so the write to
  // the "filterLibrary" store never happens). ---
  assert(w.getComputedStyle(exportScopeDialogEl).display === "none", "hidden #exportScopeDialog actually resolves to display:none (was previously un-styled and always visible)");
  exportScopeDialogEl.classList.remove("hidden");
  assert(w.getComputedStyle(exportScopeDialogEl).position === "fixed", "shown #exportScopeDialog is a fixed-position modal overlay like the app's other dialogs, not an inline block");
  exportScopeDialogEl.classList.add("hidden");

  const f = await w.addFile("135.log", makeLog(0, 20), () => {});
  const chainNode = w.createFilterNode(f.id, "text", "message");
  const plainFilter = w.createFilterNode(chainNode.id, "text", "message 1"); // an ORDINARY filter, nested under chainNode
  w.render();

  // --- "Just this filter" for an ORDINARY (non-and/or/link) filter node:
  // exactly one node, no ancestor chain. ---
  const justThisBranch = w.serializeFilterBranch(plainFilter.id, false);
  assert(justThisBranch.roots.length === 1 && justThisBranch.roots[0].filterType === "text" && justThisBranch.roots[0].children.length === 0,
    "'just this filter' exports exactly one node for a plain filter type too, no ancestors");

  // --- "Include ancestor chain" for the same ordinary filter: the chain
  // (chainNode -> plainFilter) comes along. ---
  const chainBranch = w.serializeFilterBranch(plainFilter.id, true);
  const chainRoot = chainBranch.roots[0];
  assert(chainRoot.filterType === "text" && chainRoot.value === "message" && chainRoot.children.length === 1 && chainRoot.children[0].value === "message 1",
    "'include ancestor chain' brings chainNode along as the root, plainFilter nested under it — same relative structure as the tree");

  // --- Import placement lands under the CURRENT ACTIVE/TARGET node, not
  // FILE, for BOTH a plain filter and an and/or/link node, at a non-FILE target. ---
  const fb = await w.addFile("135b.log", makeLog(0, 20, { msgPrefix: "message" }), () => {});
  const nonFileTarget = w.createFilterNode(fb.id, "text", "message");
  w.render();

  function setLoadTarget(targetId) {
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(targetId)};`;
    d.body.appendChild(s);
  }

  const beforeChildren = nonFileTarget.children.length;
  const fbChildrenBefore = fb.children.length;
  setLoadTarget(nonFileTarget.id);
  w.importFilterJson(JSON.stringify({ format: "philogg-filters", version: 2, activeRef: justThisBranch.activeRef, roots: justThisBranch.roots }));
  assert(nonFileTarget.children.length === beforeChildren + 1, "'just this filter' import lands directly under the current non-FILE target");
  assert(fb.children.length === fbChildrenBefore, "nothing was created directly under FILE");

  const beforeChildren2 = nonFileTarget.children.length;
  setLoadTarget(nonFileTarget.id);
  w.importFilterJson(JSON.stringify({ format: "philogg-filters", version: 2, activeRef: chainBranch.activeRef, roots: chainBranch.roots }));
  assert(nonFileTarget.children.length === beforeChildren2 + 1, "'include ancestor chain' import also lands directly under the current non-FILE target (the whole chain's root attaches there)");

  // --- Same placement rule for an and/or/link node, at a non-FILE target ---
  const andA = w.createFilterNode(fb.id, "text", "message 1");
  const andB = w.createFilterNode(fb.id, "text", "message");
  const andNode = w.createAndOrNode([andA.id, andB.id], "and");
  const andCount = w.getEntries(andNode.id).length;
  const andBranch = w.serializeFilterBranch(andNode.id, false);
  const beforeChildren3 = nonFileTarget.children.length;
  setLoadTarget(nonFileTarget.id);
  w.importFilterJson(JSON.stringify({ format: "philogg-filters", version: 2, activeRef: andBranch.activeRef, roots: andBranch.roots }));
  assert(nonFileTarget.children.length === beforeChildren3 + 1, "an and/or/link node's export also lands under the current non-FILE target, not FILE");
  const loadedAnd = T.state.nodes[nonFileTarget.children[nonFileTarget.children.length - 1]];
  assert(loadedAnd.filterType === "and" && loadedAnd.baked[0] && loadedAnd.baked[1], "the imported and/or/link node is fully self-contained via its own bakedA/bakedB");
  assert(w.getEntries(loadedAnd.id).length >= 0, "it re-evaluates without throwing");

  // --- The export-scope prompt is asked as part of the actual Save filter…
  // flow too (not just Save to library), and never at startup. jsdom has no
  // showSaveFilePicker/URL.createObjectURL, so stub the download fallback
  // (same technique GROUP 21 uses). ---
  w.downloadBlobFallback = () => {};
  const savePromise = w.saveFilterToFile(plainFilter.id);
  await new Promise(r => setTimeout(r, 0));
  assert(!d.querySelector("#exportScopeDialog").classList.contains("hidden"), "saveFilterToFile also asks the general export-scope question");
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await savePromise;
  assert(d.querySelector("#exportScopeDialog").classList.contains("hidden"), "the dialog closes again once answered, back to hidden");
});
