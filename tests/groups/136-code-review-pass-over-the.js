// GROUP 136 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 136 — Code-review pass over the self-contained filter architecture:
   five defects found by reading the baked model against its persistence
   carriers and its hot paths.
     a) node.formatId survives the delete-file undo round trip.
     b) addRowsToSelectionFilter replaces node.value instead of mutating the
        array copy/paste and undo share by reference.
     c) an and/or/link node with no baked sides (a filter file or library
        preset written before the baked model) can't be combined, unpacked
        or imported, and never throws.
     d) AND/OR is not offered over a `link` node, whose synthetic pair
        entries can only produce an empty or type-mixed result.
     e) buildOrderIndexMap is memoized per file and self-invalidates.
   ============================================================ */
group(136);
await withApp(async (w, d, T) => {
  section("136. Code-review fixes: baked model, persistence carriers, hot paths");

  // --- (a) formatId across a delete-file undo -----------------------------
  const ff = await w.addFile("fmt.log", makeLog(0, 8), () => {});
  ff.formatId = "fmt-custom-xyz";
  w.deleteFilterNodeWithUndo(ff.id);
  w.undo();
  const restoredFile = T.state.nodes[ff.id];
  assert(restoredFile && restoredFile.formatId === "fmt-custom-xyz",
    "delete-file undo restores node.formatId (it drives formatLevels/appendTailText/session-cache reparse), got " +
    (restoredFile && restoredFile.formatId));

  // --- (b) selection-filter value is replaced, never mutated in place -----
  const f = await w.addFile("sel.log", makeLog(0, 20), () => {});
  const sel = w.createSelectionFilterNode(f.id, f.entries.slice(0, 3).map(e => e.id));
  const pasted = w.cloneSubtree(sel.id, f.id);
  f.children.push(pasted.id);
  assert(pasted.value === sel.value,
    "sanity: cloneSubtree still copies `value` by reference — which is exactly why it must never be mutated in place");
  w.addRowsToSelectionFilter(sel.id, [f.entries[9].id]);
  assert(sel.value.length === 4, "adding a row grows the node's own selection, got " + sel.value.length);
  assert(pasted.value.length === 3,
    "...and leaves a copy/pasted duplicate of that node untouched (no shared-array aliasing), got " + pasted.value.length);
  assert(sel.value !== pasted.value, "the two nodes no longer share one array object after the add");

  // The same aliasing broke the undo stack's before/after capture, since
  // snapshotSubtree/captureNodeFields also take `value` by reference.
  const beforeAdd = w.captureNodeFields(T.state.nodes[sel.id]).value;
  w.addRowsToSelectionFilter(sel.id, [f.entries[11].id]);
  assert(beforeAdd.length === 4,
    "a captured pre-add snapshot of `value` isn't retroactively rewritten by the next add, got " + beforeAdd.length);

  // --- (c) a combiner with no baked sides ---------------------------------
  const plain = w.createFilterNode(f.id, "text", "message 1");
  const legacy = {
    id: "legacy-and-1", type: "filter", name: "pre-baking AND", parentId: f.id,
    children: [], filterType: "and", value: null, inverted: false,
  };
  T.state.nodes[legacy.id] = legacy;
  f.children.push(legacy.id);
  w.invalidateAllCaches();
  assert(w.getEntries(legacy.id).length === 0, "a combiner with no baked sides evaluates to nothing rather than throwing");
  let threw = null;
  try { assert(w.createAndOrNode([legacy.id, plain.id], "and") === null, "combining it is refused (returns null)"); }
  catch (e) { threw = e; }
  assert(!threw, "combining a combiner with no baked sides doesn't throw, got " + (threw && threw.message));
  threw = null;
  try { assert(w.unpackAndOrLinkNode(legacy.id) === null, "unpacking it is refused (returns null)"); }
  catch (e) { threw = e; }
  assert(!threw, "unpacking a combiner with no baked sides doesn't throw, got " + (threw && threw.message));
  T.state.activeId = legacy.id;
  w.render();
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, legacy.id);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "unpack"),
    "the tree context menu omits Unpack for a combiner with nothing baked to unpack");
  // Positive control, so the assertion above can't pass vacuously on an empty
  // menu: a properly baked combiner in the same harness DOES offer Unpack.
  const okA = w.createFilterNode(f.id, "text", "message 3");
  const okB = w.createFilterNode(f.id, "text", "message 4");
  const realAnd = w.createAndOrNode([okA.id, okB.id], "and");
  T.state.activeId = realAnd.id;
  w.render();
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, realAnd.id);
  assert([...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "unpack"),
    "control: a properly baked and/or node still offers Unpack in the same menu");

  // ...and such a node is rejected on import rather than landing as a filter
  // that silently matches nothing.
  const legacyFile = JSON.stringify({
    format: "philogg-filters", version: 2,
    roots: [{ ref: 1, filterType: "and", name: "old AND", inverted: false, children: [], attach: "target" }],
    activeRef: 1,
  });
  const childrenBeforeImport = f.children.length;
  w.loadFilterTargetId = f.id;
  w.importFilterJson(legacyFile);
  assert(f.children.length === childrenBeforeImport,
    "importFilterJson rejects a pre-baking and/or/link node instead of creating an inert filter");

  // --- (d) AND/OR is withheld over a link node ----------------------------
  const ref = w.createFilterNode(f.id, "text", "message 1");
  const tgt = w.createFilterNode(f.id, "text", "message 2");
  const link = w.createLinkNode(ref.id, tgt.id, "after", 1);
  w.invalidateAllCaches();
  assert(w.getEntries(link.id).length > 0, "sanity: the link node itself produces pair entries");
  assert(w.createAndOrNode([link.id, plain.id], "and") === null,
    "createAndOrNode refuses a link side — pair-entry ids never intersect a plain entry pool");
  const linkActions = w.describeBulkActions([T.state.nodes[link.id], T.state.nodes[plain.id]]).actions.map(a => a.action);
  assert(linkActions.join("/") === "link/mute",
    "the bulk menu offers only Link… (not AND/OR) when one side is a link node, got " + linkActions.join("/"));
  const plainActions = w.describeBulkActions([T.state.nodes[plain.id], T.state.nodes[ref.id]]).actions.map(a => a.action);
  assert(plainActions.join("/") === "and/or/link/mute",
    "...while two ordinary filters still get all three, got " + plainActions.join("/"));

  // --- (e) the order-index map is memoized and self-invalidates -----------
  const m1 = w.buildOrderIndexMap(f.id);
  const m2 = w.buildOrderIndexMap(f.id);
  assert(m1 === m2, "buildOrderIndexMap returns the memoized map on an unchanged file (it is an O(file) build on every render while pin-bookmarks is on)");
  assert(m1.get(f.entries[5].id) === 5, "sanity: the memoized map still maps entry id -> log order index");
  const grown = f.entries.concat([]);
  f.entries.push(Object.assign({}, f.entries[0], { id: "synthetic-tail-entry" }));
  const m3 = w.buildOrderIndexMap(f.id);
  assert(m3 !== m1 && m3.get("synthetic-tail-entry") === grown.length,
    "a tail append (same array, new length) re-derives the map");
  f.entries = grown;
  const m4 = w.buildOrderIndexMap(f.id);
  assert(m4 !== m3 && !m4.has("synthetic-tail-entry"),
    "a rotation (new array object) re-derives the map too");
  w.invalidateOrderIndexMap(f.id);
  assert(w.buildOrderIndexMap(f.id) !== m4,
    "invalidateOrderIndexMap drops it explicitly, for the in-place reorder (mergeFiles' sort) the key can't see");
});
