// GROUP 192 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 192 — Filter-tree icons match the row-action buttons that create
   them (person-requested: "der Zustand eines Filters soll links so
   angezeigt werden, wie man auch den Filter mit den Buttons benutzen
   würde"). A time-filter node's icon now depends on which of from/to is
   set (ICON_TIME_AFTER/ICON_TIME_BEFORE/ICON_TIME_RANGE) instead of always
   falling to the generic ICON_CLOCK, matching VIEWBAR_ROW_ACTIONS'
   "Before"/"After"/"Time range" icons exactly. Also: "idset" nodes used to
   fall through nodeIconHTML into ICON_CLOCK despite not being a time
   filter — they now get their own ICON_CHECKLIST. Legacy "after"/"before"
   nodes (never created by the UI anymore, only read from old
   sessions/exports) route through the same timeFilterIcon() helper as
   unified "timerange" nodes, via timeRangeOfNode's normalization.
   ============================================================ */
group(192);
await withApp(async (w, d, T) => {
  section("192. Filter-tree icons match their creating row-action button (before/after/range/idset)");
  const f = await w.addFile("icons.log", makeLog(0, 30), () => {});
  w.render();

  // ICON_* are top-level `const`s in the page script, not exposed on `window`
  // (see README "jsdom gotcha") — so identify each icon by its sprite
  // reference (icon() markup), rather than by object identity.
  const PATH_AFTER = 'href="#i-time-after"'; // "After" row-action look (arrow down)
  const PATH_BEFORE = 'href="#i-time-before"'; // "Before" row-action look (arrow up)
  const PATH_RANGE = 'href="#i-time-range"'; // "Time range" row-action look
  const PATH_CLOCK = 'href="#i-clock"'; // generic ICON_CLOCK

  // --- from-only ("after") -> arrow-down icon, matching the "After" row-action button ---
  const afterNode = w.createFilterNode(f.id, "timerange", { from: f.entries[10].ts, to: null });
  assert(w.nodeIconHTML(afterNode).includes(PATH_AFTER), "unified timerange, from-only, gets the \"After\" button's arrow-down icon");

  // --- to-only ("before") -> arrow-up icon, matching the "Before" row-action button ---
  const beforeNode = w.createFilterNode(f.id, "timerange", { from: null, to: f.entries[20].ts });
  assert(w.nodeIconHTML(beforeNode).includes(PATH_BEFORE), "unified timerange, to-only, gets the \"Before\" button's arrow-up icon");

  // --- both from and to -> range icon, matching the "Time range" row-action button ---
  const rangeNode = w.createFilterNode(f.id, "timerange", { from: f.entries[5].ts, to: f.entries[25].ts });
  assert(w.nodeIconHTML(rangeNode).includes(PATH_RANGE), "unified timerange, from+to both set, gets the \"Time range\" button's icon");

  // --- legacy "after"/"before" nodes normalize through timeRangeOfNode the same way ---
  const legacyAfter = w.createFilterNode(f.id, "after", f.entries[8].ts);
  assert(w.nodeIconHTML(legacyAfter).includes(PATH_AFTER), "legacy \"after\" node still resolves to the arrow-down icon");
  const legacyBefore = w.createFilterNode(f.id, "before", f.entries[8].ts);
  assert(w.nodeIconHTML(legacyBefore).includes(PATH_BEFORE), "legacy \"before\" node still resolves to the arrow-up icon");

  // --- none of the above fall back to the generic clock anymore ---
  [afterNode, beforeNode, rangeNode, legacyAfter, legacyBefore].forEach(n =>
    assert(!w.nodeIconHTML(n).includes(PATH_CLOCK), "time-filter node icon is no longer the generic clock: " + n.filterType));

  // --- idset no longer falls through to ICON_CLOCK ---
  const idsetNode = w.createFilterNode(f.id, "idset", [f.entries[1].id, f.entries[2].id]);
  assert(!w.nodeIconHTML(idsetNode).includes(PATH_CLOCK), "idset node's icon is no longer the generic clock");
  assert(w.nodeIconHTML(idsetNode) === w.nodeIconHTML(idsetNode), "sanity: idset icon lookup is stable/deterministic");

  // --- text/extraction icons stay exactly as before (unaffected by this change) ---
  const textNode = w.createFilterNode(f.id, "text", "hello");
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  assert(w.nodeIconHTML(textNode) !== w.nodeIconHTML(extractNode), "plain text filter and extraction-wildcard text filter still get visually distinct icons (funnel vs. table)");
  assert(w.nodeIconHTML(extractNode).includes('href="#i-table"'), "text filter with extractable wildcards still gets the table icon, matching the \"Extract\" row-action button");
});
