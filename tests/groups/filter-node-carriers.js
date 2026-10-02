// GROUP filter-node-carriers - loaded by philogg.html's regression harness
// (tests/README.md -> "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, LOGSIM, ...) is in
// scope.

/* ============================================================
   GROUP filter-node-carriers - every filter-node field survives every
   hand-written persistence carrier, and a new field cannot be forgotten
   Origin: 2026-10-02 (code review; plan "filter-node field fan-out", step 1
   of 4). Adding one field to a filter node used to mean editing about a
   dozen hand-written field lists in philogg.html; PROJECT.md only warned about
   it in prose ("Any new filter-node field must be threaded through all
   persistence carriers"). This group is the automated version of that
   warning and the safety net for deduplicating the carriers:
     a  builds one fully populated node per filter type through the real
        creators and the field setters the UI uses, and fails when a node
        ends up with an own property that is neither one of the covered
        fields below nor on the explicit not-carried allowlist (the failure
        message says what to do);
     b-d, f  round-trip every fixture through cloneSubtree (b),
        serializeFilterBranch -> JSON -> materializeSerializedRoots in both
        export scopes (c), serializeFilterTreeForCache -> JSON ->
        materializeCachedFilters (d) and snapshotSubtree -> restoreSubtree (f):
        every persistent data property must come back with an identical JSON
        value, children included;
     e  pins the exact serialized output of the fixtures as a literal (what is
        written to disk must not change when the carriers are refactored);
     g  pins the subtle gates: a muted extraction node is not an extraction
        view (clone/serializers drop plotConfig + arrayViews, the undo
        snapshot keeps them), a copy of a locked node is unlocked, and both
        loaders drop a combiner without baked sides (they once differed).
   ORDERING NOTE: written green on the UNCHANGED production code, then kept green
   through the refactoring steps: Step 2 (one serializer, one materializer, one
   validity rule) flipped exactly one assertion - the cache loader used to keep an
   and/or/link node without baked sides (labelled KNOWN DRIFT) and now drops it
   like the JSON import - and Step 3 (one copy table) may add only the
   table-driven "every table key is exercised by a fixture" check.
   ============================================================ */
group("filter-node-carriers");
await withApp(async (w, d, T) => {
  const S = T.state;
  const [simFile] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 120, seed: 7 });
  const f = await w.addFile(simFile.name, simFile.text, () => {});
  S.activeId = f.id;
  w.render();

  /* ---------- field registry (the explicit lists the guard checks against) ---------- */
  // Fields every carrier must carry. When this list changes, the carriers
  // (cloneSubtree, snapshotSubtree/restoreSubtree, serializeFilterBranch,
  // serializeFilterTreeForCache, materializeSerializedRoots,
  // materializeCachedFilters) change with it, and so does a fixture below.
  const COVERED_FIELDS = [
    "name", "filterType", "value", "inverted", "muted", "label", "highlightColor", "selectionFilter", // every node
    "caseSensitive", "columns", "isRegex", "wholeWord", "ignoredColumns", "columnRenames", "assertions", // text
    "plotConfig", "arrayViews", // extraction view (nodeIsExtractionView)
    "baked", "bakedA", "bakedB", // and/or/link: baked conditions
    "linkDirection", "linkN", "linkOrderEnforced", "linkExclusive", "linkDt", "linkKey", // link
    "contextBefore", "contextAfter", "countBefore", "countAfter", // context / countContext
  ];
  // Own properties that are deliberately NOT carried. One line of reason each.
  const NOT_CARRIED = {
    locked: "only the auto-managed Bookmarks/Notes/Sources nodes have it; they are never persisted, and cloneSubtree drops it on purpose (a copy of an auto-managed node is a plain node)",
    collapsed: "tree expand/collapse state: display-only, never persisted (renderNode's chevron)",
    selectionOrdinal: "creation-order rank of a Selection N node (insertSpecialChild), assigned only by createSelectionFilterNode and carried by NO carrier, so a pasted/restored/reloaded selection node ranks as 3 - a pre-existing gap listed here so the guard is green on unchanged code",
  };
  const STRUCTURAL = new Set(["id", "type", "parentId", "children"]); // identity/tree shape: each carrier rebuilds them its own way
  const classify = k => STRUCTURAL.has(k) || k.startsWith("_") /* runtime caches */ || COVERED_FIELDS.includes(k) || k in NOT_CARRIED;
  const unknownKeys = n => Object.keys(n).filter(k => !classify(k));
  const compared = n => Object.keys(n).filter(k => !STRUCTURAL.has(k) && !k.startsWith("_") && !(k in NOT_CARRIED) && n[k] !== undefined);

  const canon = v => JSON.stringify(v, (k, val) => (val && typeof val === "object" && !Array.isArray(val))
    ? Object.keys(val).sort().reduce((o, key) => { o[key] = val[key]; return o; }, {}) : val);
  // `inverted` is compared as a boolean: createLinkNode never sets it, and every
  // carrier writes/reads it as !!node.inverted, so absent and false are one persisted fact.
  const bagOf = n => { const o = { inverted: "false" }; compared(n).forEach(k => { o[k] = canon(k === "inverted" ? !!n[k] : n[k]); }); return o; };
  const treeBag = n => ({ bag: bagOf(n), kids: n.children.map(id => treeBag(S.nodes[id])) });
  const diffTree = (a, b, path = "") => {
    const out = [];
    for (const k of new Set([...Object.keys(a.bag), ...Object.keys(b.bag)])) {
      if (a.bag[k] !== b.bag[k]) out.push(path + k + ": " + a.bag[k] + " -> " + b.bag[k]);
    }
    if (a.kids.length !== b.kids.length) out.push(path + "children: " + a.kids.length + " -> " + b.kids.length);
    else a.kids.forEach((ka, i) => out.push(...diffTree(ka, b.kids[i], path + "[" + i + "].")));
    return out;
  };
  const showDiff = diffs => diffs.join("; ").slice(0, 400);
  const dropSubtree = id => {
    const n = S.nodes[id];
    if (!n) return;
    n.children.slice().forEach(dropSubtree);
    const p = S.nodes[n.parentId];
    if (p) p.children = p.children.filter(c => c !== id);
    delete S.nodes[id];
  };
  const persistable = id => !["bookmarks", "notes", "sources"].includes(S.nodes[id].filterType);

  /* ---------- a. fixtures through the real creators + the guard ---------- */
  section("filter-node-carriers a. one fully populated node per filter type, built like the UI builds them; no field escapes the registry");
  const FX = {}; // fixture key -> node id (ids survive snapshot/restore, object identity does not)
  const reg = (key, node) => { FX[key] = node.id; return node; };
  const at = key => S.nodes[FX[key]];

  reg("lit", w.createFilterNode(f.id, "text", "Queue depth", true, null, true, ["message", "thread"], false, true)); // NOT, case-sensitive, columns, whole word
  reg("rx", w.createFilterNode(f.id, "text", "Queue.*depth", false, null, true, ["message"], true, false));
  const wild = reg("wild", w.createFilterNode(f.id, "text", "Queue depth [*:int] of [*:word]")); // extraction pattern, NOT muted
  reg("wildTr", w.createFilterNode(wild.id, "timerange", { from: 1705312800000, to: 1705312860000 })); // inherits Table/Plot from wild
  reg("wildLvl", w.createFilterNode(FX.wildTr, "level", ["WARN"]));
  reg("tr", w.createFilterNode(f.id, "timerange", { from: 1705312900000, to: null }));
  reg("after", w.createFilterNode(f.id, "after", 1705312800000));
  reg("before", w.createFilterNode(f.id, "before", 1705312860000));
  reg("ids", w.createFilterNode(f.id, "idset", ["fx-e1", "fx-e2", "fx-e3"]));
  reg("sel", w.createSelectionFilterNode(f.id, ["fx-e4", "fx-e5"]));
  reg("lvl", w.createFilterNode(f.id, "level", ["ERROR", "WARN"], true));
  reg("gap", w.createGapNode(f.id, { ms: 500, per: "thread" }));
  reg("ctx", w.createContextNode(f.id, 1000, 2000));
  reg("cctx", w.createCountContextNode(f.id, 2, 3));
  reg("and", w.createAndOrNode([FX.lit, FX.lvl], "and"));
  reg("or", w.createAndOrNode([FX.and, FX.tr], "or")); // a baked combiner nested in a baked list
  reg("link", w.createLinkNode(FX.lit, FX.rx, "after", 2, { orderEnforced: true, exclusive: true, dt: { op: "<", ms: 5000 }, key: { column: "thread" } }));
  reg("link2", w.createLinkNode(FX.link, FX.lvl, "before", 1, { dt: { op: ">", ms: 250 }, key: { pattern: "Queue depth [*:int]" } })); // multi-hop: a link as a baked side
  const ALL_KEYS = Object.keys(FX);
  const TOP_KEYS = ALL_KEYS.filter(k => at(k).parentId === f.id);
  assert(ALL_KEYS.length === 18 && TOP_KEYS.length === 16, "sanity: 18 fixtures, 16 of them directly under the file, got " + ALL_KEYS.length + "/" + TOP_KEYS.length);

  // The field setters the UI uses.
  w.setColumnIgnored(wild, 1, true);
  w.renameColumn(wild, 0, "Depth");
  w.withFieldEditUndo(wild.id, n => { n.assertions = { 0: { mode: "range", min: 1, max: 9 }, 1: { mode: "target", target: 5, tolerance: 0.5 } }; });
  wild.plotConfig = Object.assign(w.defaultPlotConfig(), { type: "scatter", xCol: 0, yCols: [1], xMin: "2", axisEqual: true });
  w.setArrayView(wild, 0, "aggregate");
  w.setArrayView(wild, 1, "explode");
  at("wildTr").plotConfig = Object.assign(w.defaultPlotConfig(), { type: "bar", yCols: [0, 1], normalize: true, yColsInit: true });
  w.setArrayView(at("wildTr"), 0, "index");
  const COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabed4", "#008080", "#9a6324", "#800000", "#aaffc3", "#808000", "#000075", "#a9a9a9", "#ffd8b1", "#dcbeff"];
  ALL_KEYS.forEach((k, i) => {
    w.renameFilterNodeWithUndo(FX[k], "label " + k);
    w.setHighlightColor(FX[k], COLORS[i % COLORS.length]);
  });
  w.toggleMuteWithUndo([FX.before, FX.ctx, FX.gap, FX.wildLvl, FX.or, FX.link2]);
  w.toggleInvertWithUndo(FX.cctx);
  at("wild").collapsed = true; // what renderNode's chevron does
  ALL_KEYS.forEach(k => { at(k).name = "fx " + k; }); // explicit names: the auto names of the time nodes depend on the time zone
  // The auto-managed nodes (locked) are filter nodes too.
  w.toggleBookmark(f.entries[3].id);
  w.setNoteAndRepaint(f.entries[4].id, "fx note");

  assert(w.nodeIsExtractionView(at("wild")) && w.nodeIsExtractionView(at("wildTr")) && w.nodeIsExtractionView(at("wildLvl")),
    "sanity: the wildcard node and its two descendants are extraction views (so plotConfig/arrayViews apply to all three)");
  assert(!w.nodeIsExtractionView(at("lit")), "sanity: a literal text node is not an extraction view");
  assert(ALL_KEYS.filter(k => at(k).muted).length === 6 && ALL_KEYS.every(k => at(k).label === "label " + k && at(k).highlightColor), "sanity: label + colour on every fixture, six of them muted");

  const filterNodes = Object.values(S.nodes).filter(n => n.type === "filter");
  const seenKeys = new Set(filterNodes.flatMap(n => Object.keys(n)));
  const unknown = [...new Set(filterNodes.flatMap(unknownKeys))];
  assert(unknown.length === 0,
    "new filter-node field(s) `" + unknown.join("`, `") + "`: thread " + (unknown.length > 1 ? "them" : "it") + " through every carrier listed in PROJECT.md -> Known gotchas " +
    "(cloneSubtree, snapshotSubtree/restoreSubtree, serializeFilterBranch, serializeFilterTreeForCache, materializeSerializedRoots, materializeCachedFilters), " +
    "add " + (unknown.length > 1 ? "them" : "it") + " to COVERED_FIELDS and to a fixture in tests/groups/filter-node-carriers.js - or, if it must not be carried, to NOT_CARRIED with the reason");
  const unexercised = COVERED_FIELDS.filter(k => !filterNodes.some(n => n[k] !== undefined));
  assert(unexercised.length === 0, "every covered field is present on at least one fixture (a fixture stopped exercising: " + unexercised.join(", ") + ")");
  const deadAllow = Object.keys(NOT_CARRIED).filter(k => !seenKeys.has(k));
  assert(deadAllow.length === 0, "every NOT_CARRIED entry is still produced by something (drop the dead entry: " + deadAllow.join(", ") + ")");
  // The guard and the comparison have teeth.
  assert(unknownKeys({ ...at("lit"), brandNew: 1 }).join() === "brandNew", "the guard names an unregistered field");
  assert(diffTree(treeBag(at("lit")), { bag: { ...bagOf(at("lit")), wholeWord: undefined }, kids: [] }).length === 1, "the comparison notices a field that went missing");

  /* ---------- b. copy/paste: cloneSubtree ---------- */
  section("filter-node-carriers b. cloneSubtree: every field comes back on the copy, with fresh ids, nothing shared but the value");
  for (const k of ALL_KEYS) {
    const orig = at(k);
    const clone = w.cloneSubtree(orig.id, orig.parentId);
    assert(clone.id !== orig.id && clone.parentId === orig.parentId, "clone " + k + ": fresh id, requested parent");
    const diffs = diffTree(treeBag(orig), treeBag(clone));
    assert(diffs.length === 0, "clone " + k + ": every field survives (" + showDiff(diffs) + ")");
    const shared = Object.keys(bagOf(orig)).filter(p => p !== "value" && orig[p] && typeof orig[p] === "object" && clone[p] === orig[p]);
    assert(shared.length === 0, "clone " + k + ": no array/object is shared with the original (" + shared.join(", ") + ")");
    assert(clone.value === orig.value, "clone " + k + ": value is copied by reference (the immutable-value convention)");
    assert(clone.locked === undefined, "clone " + k + ": a copy is never locked");
    dropSubtree(clone.id);
  }

  /* ---------- c. filter JSON save/load (and the library presets) ---------- */
  section("filter-node-carriers c. serializeFilterBranch -> JSON -> materializeSerializedRoots, 'just this filter' and 'with ancestors'");
  for (const k of ALL_KEYS) {
    const orig = at(k);
    const wire = JSON.parse(JSON.stringify(w.serializeFilterBranch(orig.id, false)));
    assert(w.serializedFilterRootsValid(wire.roots), "json " + k + ": the import accepts what the export wrote");
    // Attached under the real parent, so an extraction view keeps inheriting from its ancestor like a paste at the same spot.
    const { created, refMap } = w.materializeSerializedRoots(wire.roots, () => orig.parentId);
    assert(refMap[wire.activeRef] === created[0].id, "json " + k + " (just this filter): the written activeRef resolves to the new node");
    const diffs = diffTree({ bag: treeBag(orig).bag, kids: [] }, treeBag(created[0]));
    assert(created.length === 1 && diffs.length === 0, "json " + k + " (just this filter): every field survives (" + showDiff(diffs) + ")");
    dropSubtree(created[0].id);
  }
  for (const k of TOP_KEYS) {
    const orig = at(k);
    const wire = JSON.parse(JSON.stringify(w.serializeFilterBranch(orig.id, true)));
    assert(w.serializedFilterRootsValid(wire.roots), "json " + k + " + subtree: the import accepts what the export wrote");
    const { created } = w.materializeSerializedRoots(wire.roots, () => f.id);
    const diffs = diffTree(treeBag(orig), treeBag(created[0]));
    assert(created.length === 1 && diffs.length === 0, "json " + k + " (with ancestors, whole subtree): every field survives (" + showDiff(diffs) + ")");
    dropSubtree(created[0].id);
  }

  /* ---------- d. session cache ---------- */
  section("filter-node-carriers d. serializeFilterTreeForCache -> JSON -> materializeCachedFilters (the whole tree of one file)");
  const origRoots = f.children.filter(persistable);
  const cacheWire = JSON.parse(JSON.stringify(w.serializeFilterTreeForCache(f)));
  assert(cacheWire.roots.length === TOP_KEYS.length && origRoots.length === TOP_KEYS.length,
    "cache: one root per top-level fixture, the locked Bookmarks/Notes nodes are not written (" + cacheWire.roots.length + " roots)");
  const childrenBefore = f.children.slice();
  const cacheRefMap = w.materializeCachedFilters(f, cacheWire.roots);
  const loadedRoots = f.children.slice(childrenBefore.length).map(id => S.nodes[id]);
  assert(loadedRoots.length === origRoots.length, "cache: every root is materialized again (" + loadedRoots.length + "/" + origRoots.length + ")");
  origRoots.forEach((id, i) => {
    const key = TOP_KEYS.find(k => FX[k] === id);
    const diffs = loadedRoots[i] ? diffTree(treeBag(S.nodes[id]), treeBag(loadedRoots[i])) : ["missing"];
    assert(diffs.length === 0, "cache " + key + " (with its whole subtree): every field survives (" + showDiff(diffs) + ")");
  });
  const refMisses = [];
  (function checkRefs(sers, nodes) {
    sers.forEach((sn, i) => {
      if (!nodes[i] || cacheRefMap[sn.ref] !== nodes[i].id) refMisses.push(sn.name);
      else checkRefs(sn.children || [], nodes[i].children.map(id => S.nodes[id]));
    });
  })(cacheWire.roots, loadedRoots);
  assert(refMisses.length === 0, "cache: every written ref resolves to the node materialized for it, nested ones included (" + refMisses.join(", ") + ")");
  loadedRoots.forEach(n => dropSubtree(n.id));
  assert(f.children.length === childrenBefore.length, "sanity: the loaded copies are removed again");

  /* ---------- e. the exact serialized output ---------- */
  section("filter-node-carriers e. what is written to disk: the serialized fixtures, as a literal");
  // One table serves both serializers: they write the same per-node fields
  // (ref/children/attach are envelope, compared above). Values are literals
  // on purpose - the carriers treat them as opaque data.
  const strip = sn => { const { ref, children, attach, ...rest } = sn; return canon(rest); };
  const WIRE = {
    lit: { filterType: "text", name: "fx lit", inverted: true, value: "Queue depth", caseSensitive: true, columns: ["message", "thread"], wholeWord: true, highlightColor: "#e6194b", label: "label lit" },
    rx: { filterType: "text", name: "fx rx", inverted: false, value: "Queue.*depth", caseSensitive: true, columns: ["message"], isRegex: true, highlightColor: "#3cb44b", label: "label rx" },
    wild: { filterType: "text", name: "fx wild", inverted: false, value: "Queue depth [*:int] of [*:word]", assertions: { 0: { mode: "range", min: 1, max: 9 }, 1: { mode: "target", target: 5, tolerance: 0.5 } }, columnRenames: { 0: "Depth" }, ignoredColumns: [1], plotConfig: null /* filled in below: the full default config + the edits */, arrayViews: { 0: "aggregate", 1: "explode" }, highlightColor: "#4363d8", label: "label wild" },
    wildTr: { filterType: "timerange", name: "fx wildTr", inverted: false, value: { from: 1705312800000, to: 1705312860000 }, plotConfig: null, arrayViews: { 0: "index" }, highlightColor: "#f58231", label: "label wildTr" },
    wildLvl: { filterType: "level", name: "fx wildLvl", inverted: false, value: ["WARN"], highlightColor: "#911eb4", label: "label wildLvl", muted: true },
    tr: { filterType: "timerange", name: "fx tr", inverted: false, value: { from: 1705312900000, to: null }, highlightColor: "#46f0f0", label: "label tr" },
    after: { filterType: "after", name: "fx after", inverted: false, value: 1705312800000, highlightColor: "#f032e6", label: "label after" },
    before: { filterType: "before", name: "fx before", inverted: false, value: 1705312860000, highlightColor: "#bcf60c", label: "label before", muted: true },
    ids: { filterType: "idset", name: "fx ids", inverted: false, value: ["fx-e1", "fx-e2", "fx-e3"], highlightColor: "#fabed4", label: "label ids" },
    sel: { filterType: "idset", name: "fx sel", inverted: false, value: ["fx-e4", "fx-e5"], selectionFilter: true, highlightColor: "#008080", label: "label sel" },
    lvl: { filterType: "level", name: "fx lvl", inverted: true, value: ["ERROR", "WARN"], highlightColor: "#9a6324", label: "label lvl" },
    gap: { filterType: "gap", name: "fx gap", inverted: false, value: { ms: 500, per: "thread" }, highlightColor: "#800000", label: "label gap", muted: true },
    ctx: { filterType: "context", name: "fx ctx", inverted: false, contextBefore: 1000, contextAfter: 2000, highlightColor: "#aaffc3", label: "label ctx", muted: true },
    cctx: { filterType: "countContext", name: "fx cctx", inverted: true, countBefore: 2, countAfter: 3, highlightColor: "#808000", label: "label cctx" },
  };
  WIRE.wild.plotConfig = Object.assign(w.defaultPlotConfig(), { type: "scatter", xCol: 0, yCols: [1], xMin: "2", axisEqual: true });
  WIRE.wildTr.plotConfig = Object.assign(w.defaultPlotConfig(), { type: "bar", yCols: [0, 1], normalize: true, yColsInit: true });
  // The baked and link fixtures: written out in full, they are the point of the carriers' deep copy.
  const BAKED_LIT = { filterType: "text", value: "Queue depth", inverted: true, caseSensitive: true, columns: ["message", "thread"], wholeWord: true };
  const BAKED_LVL = { filterType: "level", value: ["ERROR", "WARN"], inverted: true };
  const BAKED_RX = { filterType: "text", value: "Queue.*depth", inverted: false, caseSensitive: true, columns: ["message"], isRegex: true };
  const BAKED_TR = { filterType: "timerange", value: { from: 1705312900000, to: null }, inverted: false };
  const BAKED_AND = { filterType: "and", value: null, inverted: false, baked: [BAKED_LIT, BAKED_LVL] };
  const BAKED_LINK = { filterType: "link", value: null, inverted: false, bakedA: BAKED_LIT, bakedB: BAKED_RX, linkDirection: "after", linkN: 2, linkOrderEnforced: true, linkExclusive: true, linkDt: { op: "<", ms: 5000 }, linkKey: { column: "thread" } };
  Object.assign(WIRE, {
    and: { filterType: "and", name: "fx and", inverted: false, baked: [BAKED_LIT, BAKED_LVL], highlightColor: "#000075", label: "label and" },
    or: { filterType: "or", name: "fx or", inverted: false, baked: [BAKED_AND, BAKED_TR], highlightColor: "#a9a9a9", label: "label or", muted: true },
    link: { filterType: "link", name: "fx link", inverted: false, bakedA: BAKED_LIT, bakedB: BAKED_RX, linkDirection: "after", linkN: 2, linkOrderEnforced: true, linkExclusive: true, linkDt: { op: "<", ms: 5000 }, linkKey: { column: "thread" }, highlightColor: "#ffd8b1", label: "label link" },
    link2: { filterType: "link", name: "fx link2", inverted: false, bakedA: BAKED_LINK, bakedB: BAKED_LVL, linkDirection: "before", linkN: 1, linkOrderEnforced: false, linkExclusive: false, linkDt: { op: ">", ms: 250 }, linkKey: { pattern: "Queue depth [*:int]" }, highlightColor: "#dcbeff", label: "label link2", muted: true },
  });
  assert(Object.keys(WIRE).length === ALL_KEYS.length && ALL_KEYS.every(k => WIRE[k]), "the literal has one entry per fixture");
  const byId = {};
  (function pair(sers, ids) { sers.forEach((sn, i) => { byId[ids[i]] = sn; pair(sn.children || [], S.nodes[ids[i]].children); }); })(cacheWire.roots, origRoots);
  for (const k of ALL_KEYS) {
    const want = canon(WIRE[k]);
    const jsonOut = strip(w.serializeFilterBranch(FX[k], false).roots[0]);
    assert(jsonOut === want, "wire " + k + " (filter JSON): " + jsonOut.slice(0, 300) + "  !=  " + want.slice(0, 300));
    const cacheOut = byId[FX[k]] ? strip(byId[FX[k]]) : "missing";
    assert(cacheOut === want, "wire " + k + " (session cache): " + cacheOut.slice(0, 300) + "  !=  " + want.slice(0, 300));
  }

  /* ---------- f. undo/redo snapshot ---------- */
  section("filter-node-carriers f. snapshotSubtree -> restoreSubtree: same ids and fields, but NEW node objects");
  for (const k of ALL_KEYS) {
    const orig = at(k), id = orig.id;
    const before = treeBag(orig);
    const childIds = orig.children.slice();
    const snap = w.snapshotSubtree(id);
    const shared = Object.keys(before.bag).filter(p => p !== "value" && orig[p] && typeof orig[p] === "object" && snap[p] === orig[p]);
    assert(shared.length === 0, "snapshot " + k + ": no array/object is shared with the live node (" + shared.join(", ") + ")");
    assert(snap.value === orig.value, "snapshot " + k + ": value is kept by reference (the immutable-value convention)");
    const restored = w.restoreSubtree(snap);
    assert(restored !== orig && S.nodes[id] === restored, "restore " + k + ": a NEW object registered under the same id");
    assert(restored.id === id && restored.parentId === orig.parentId && restored.children.join() === childIds.join(), "restore " + k + ": id, parent and child ids unchanged");
    const diffs = diffTree(before, treeBag(restored));
    assert(diffs.length === 0, "restore " + k + ": every field survives (" + showDiff(diffs) + ")");
  }

  /* ---------- g. pinned subtleties ---------- */
  section("filter-node-carriers g. a muted extraction node is not an extraction view; a copy of a locked node is unlocked");
  const gate = w.createFilterNode(f.id, "text", "Gate [*:int] probe");
  gate.plotConfig = Object.assign(w.defaultPlotConfig(), { type: "scatter", xCol: 0 });
  w.setArrayView(gate, 0, "aggregate");
  w.renameColumn(gate, 0, "Kept");
  w.toggleMuteWithUndo([gate.id]);
  assert(!w.nodeIsExtractionView(gate) && gate.muted && gate.plotConfig && gate.arrayViews, "precondition: a muted wildcard node with a plotConfig and arrayViews is not an extraction view");
  const gateClone = w.cloneSubtree(gate.id, f.id);
  assert(!("plotConfig" in gateClone) && !("arrayViews" in gateClone), "clone drops plotConfig/arrayViews of a node that is not an extraction view");
  assert(gateClone.columnRenames && gateClone.columnRenames[0] === "Kept", "...but keeps what is gated on filterType text only (columnRenames)");
  const gateWire = JSON.parse(JSON.stringify(w.serializeFilterBranch(gate.id, false))).roots[0];
  assert(!("plotConfig" in gateWire) && !("arrayViews" in gateWire) && gateWire.columnRenames, "the filter JSON drops them too");
  const gateCache = JSON.parse(JSON.stringify(w.serializeFilterTreeForCache(f))).roots.find(r => r.name === gate.name);
  assert(gateCache && !("plotConfig" in gateCache) && !("arrayViews" in gateCache) && gateCache.columnRenames, "so does the session cache");
  const gateSnap = w.snapshotSubtree(gate.id);
  assert(gateSnap.plotConfig && gateSnap.arrayViews, "the undo snapshot is NOT gated: it keeps both (an undone delete brings the plot back)");
  const gateRestored = w.restoreSubtree(gateSnap);
  assert(gateRestored.plotConfig && gateRestored.arrayViews, "...and restoreSubtree puts them back");
  dropSubtree(gateClone.id);
  dropSubtree(gate.id);

  const bookmarksNode = f.children.map(id => S.nodes[id]).find(n => n.filterType === "bookmarks");
  assert(bookmarksNode && bookmarksNode.locked === true, "precondition: the auto-managed Bookmarks node is locked");
  const bmClone = w.cloneSubtree(bookmarksNode.id, f.id);
  assert(bmClone.filterType === "bookmarks" && bmClone.locked === undefined, "a copy of the locked Bookmarks node is a plain, unlocked node");
  dropSubtree(bmClone.id);

  // Both loaders share one validity rule (serializedFilterNodeValid -> hasBakedSides):
  // an and/or/link node that carries no baked sides is dropped by the filter-file
  // import AND by the session-cache loader (it used to be materialized by the
  // cache loader - the drift this group pinned before the two loaders were
  // merged). The cache loader still drops only the corrupt ROOT and keeps the rest.
  for (const type of ["and", "or", "link"]) {
    const bakeless = { ref: 1, filterType: type, name: "no baked sides", inverted: false, children: [] };
    assert(w.serializedFilterRootsValid([bakeless]) === false, "JSON import rejects an " + type + " node without baked sides");
    const n0 = f.children.length;
    w.materializeCachedFilters(f, [bakeless]);
    const cacheKeepsBakeless = f.children.length === n0 + 1;
    f.children.slice(n0).forEach(dropSubtree);
    assert(cacheKeepsBakeless === false, "the session-cache loader drops an " + type + " node without baked sides, like the JSON import");
  }
  {
    const good = { ref: 7, filterType: "level", name: "kept", inverted: false, value: ["ERROR"], children: [] };
    const badChild = { ref: 8, filterType: "and", name: "bakeless child", inverted: false, children: [] };
    const badTree = { ref: 9, filterType: "level", name: "dropped with its subtree", inverted: false, value: ["WARN"], children: [badChild] };
    const foreign = { ref: 10, filterType: "bookmarks", name: "foreign", inverted: false, children: [] };
    const n0 = f.children.length;
    const refMap = w.materializeCachedFilters(f, [badTree, good, foreign]);
    const kept = f.children.slice(n0).map(id => S.nodes[id]);
    assert(kept.length === 1 && kept[0].name === "kept" && refMap[7] === kept[0].id && !(9 in refMap) && !(8 in refMap) && !(10 in refMap),
      "cache: a corrupt root is dropped with its whole subtree (a bakeless combiner below it, a foreign type), the other roots are kept (" + kept.map(n => n.name).join(", ") + ")");
    kept.forEach(n => dropSubtree(n.id));
  }
});
