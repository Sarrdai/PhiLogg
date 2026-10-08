// GROUP 194 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 194 — Filter-Toolbar refinements (this session, person-requested)
   Three-group layout (Standard filters | Library presets | New) with the
   New button broken out into its own #viewbarNew group and a pill "+" icon;
   the Message button's icon switched to "[*]"; the library management buttons
   moved to a right-aligned #libraryManageBar with a floppy-disk "Add to
   Library" (dashed placeholder outline) and a book "Library". Selection-filter
   (idset) tree nodes now show a single check (ICON_CHECK) instead of the
   multi-line checklist. Ctrl+1-4 still skips a disabled Table/Plot slot.
   UPDATED, same-day later session: #libraryManageBar (and the "Add to
   Library"/"Library" buttons inside it) removed from #viewBar entirely —
   relocated into the Files & Filters sidebar toolbar (GROUP 220/221). 194b
   rewritten from "buttons look right" into a regression guard that they're
   gone; 194e's management-group assertions dropped (nothing left at that
   position to assert about).
   ============================================================ */
group(194);
await withApp(async (w, d, T) => {
  section("194a. New is its own #viewbarNew group with the funnel icon (add badge, GROUP add-badge); Message shows '[*]'");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const node = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = node.id;
  w.render();

  const newBtn = d.querySelector('#viewbarNew [data-row-action="newFilter"]');
  assert(newBtn, "New renders in its own #viewbarNew group");
  assert(!d.querySelector('[data-row-actions="viewbar"] [data-row-action="newFilter"]'),
    "New is no longer inside the standard filter-actions group");
  assert(newBtn.querySelector('svg.icon use[href="#i-filter"]') && !newBtn.querySelector('path[d="M8 3.5v9M3.5 8h9"]'),
    "the New button shows the filter funnel, no plain '+' path");

  const msgSvg = d.querySelector('[data-row-action="filterForMessage"] svg').innerHTML;
  assert(msgSvg.includes("M8 6.3v3.4"), "the Message button shows the '[ * ]' asterisk glyph");
});

await withApp(async (w, d, T) => {
  section("194b. Management buttons removed from #viewBar entirely (relocated into the sidebar toolbar, GROUP 220/221)");

  // #libraryManageBar/#btnAddToLibrary/#btnOpenLibrary used to live here —
  // removed outright this session (project-owner review), replaced by the
  // Files & Filters sidebar toolbar's "Add to library…"/"Apply from
  // library…" actions (targeting the specific selected node instead of
  // always state.activeId — see describeSidebarToolbarActions).
  assert(d.querySelector("#libraryManageBar") === null, "#libraryManageBar no longer exists anywhere in the document");
  assert(d.querySelector("#btnAddToLibrary") === null, "#btnAddToLibrary no longer exists anywhere in the document");
  assert(d.querySelector("#btnOpenLibrary") === null, "#btnOpenLibrary no longer exists anywhere in the document");
  // #libraryPresetBar (the pinned-preset pills) is untouched — only the
  // management buttons moved, not the whole library-toolbar section.
  assert(d.querySelector("#libraryPresetBar"), "#libraryPresetBar (pinned presets) is still present in #viewBar");
});

await withApp(async (w, d, T) => {
  section("194c. Selection-filter (idset) node shows a single check, not the checklist");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  w.render();
  // idset node icon comes from nodeIconHTML — its branch keys off filterType
  // only, so set that directly rather than going through createFilterNode's
  // idset value contract.
  const node = w.createFilterNode(f.id, "text", "message");
  node.filterType = "idset";
  const html = w.nodeIconHTML(node);
  assert(html.includes('href="#i-check"') && !html.includes("#i-checklist"),
    "an idset (selection) node uses the single-check ICON_CHECK, not the multi-line ICON_CHECKLIST");
});

await withApp(async (w, d, T) => {
  section("194d. Ctrl+1-5 skips a disabled Table/Plot slot (no-op), reaches it once enabled");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const plain = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = plain.id;
  w.render();
  // Table is slot 4 (after Patterns/Context/Filtered) but disabled here — Ctrl+4 must be a no-op.
  w.applyFhView("filter");
  const before = T.fhActiveTab;
  w.jumpToViewTab(4);
  assert(T.fhActiveTab === before, "Ctrl+4 does nothing while Table is disabled (no wildcards)");

  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.jumpToViewTab(4);
  assert(T.fhActiveTab === "table", "Ctrl+4 reaches Table once the node has wildcards");
});

await withApp(async (w, d, T) => {
  section("194e. Layout order: level bar first (after the view selector), then the filter groups");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  const kids = [...d.querySelector("#viewBar").querySelectorAll("#fhTabs, #levelBar, #btnApplyLevelToTree, [data-row-actions=viewbar], #viewbarNew")].map(c => c.id || c.dataset.rowActions); // document order (groups are .vb-group wrappers)
  const idxOf = pred => kids.findIndex(pred);
  const iTabs = kids.indexOf("fhTabs");
  const iFilters = idxOf(k => k === "viewbar");
  const iNew = kids.indexOf("viewbarNew");
  const iLevel = kids.indexOf("levelBar");
  assert(iTabs === 0, "view selector (#fhTabs) is first");
  assert(iTabs < iLevel, "the level bar comes right after the view selector (person-requested, this session: moved from after the filter groups to before them)");
  assert(iLevel < iFilters && iFilters < iNew, "the standard filter group and New come right after the level bar");
  // No management group any more — #libraryManageBar was removed from
  // #viewBar entirely this session (see GROUP 194b/220/221) — #viewbarNew
  // is simply the last group now.
  // (The Facets toggle that used to float after it moved into the bottom panel as a tab, 2026-10-05.)
  assert(iNew === kids.length - 1, "New (#viewbarNew) is the last child of #viewBar, got " + kids.slice(-2));
  // All group separators are DIRECT children of #viewBar (not inside a flex group).
  const seps = [...d.querySelectorAll("#viewBar > .row-action-separator")];
  assert(seps.length === 3,
    "three group-dividing separators now: level-filter|standard-filters, standard-filters|presets, presets|New — one consistent divider rhythm for the whole row (person-requested, this session), got " + seps.length);
  // --- Dividing line between the level filter and the standard filters (person-requested, this session) ---
  const iBtnApply = kids.indexOf("btnApplyLevelToTree");
  assert(iLevel < iBtnApply && iBtnApply < iFilters, "sanity: #btnApplyLevelToTree still sits between #levelBar and the standard filters");
  const levelGroup = d.querySelector("#vbLevel");
  assert(levelGroup.contains(d.querySelector("#btnApplyLevelToTree")) && levelGroup.nextElementSibling.classList.contains("row-action-separator") && levelGroup.nextElementSibling.nextElementSibling === d.querySelector("#vbAddFilter"),
    "a separator sits directly between the Level group (#btnApplyLevelToTree) and the standard-filters group, exactly like the divider between the standard filters and the library-presets group");
  const cs = w.getComputedStyle;
  assert(cs(d.querySelector("#levelBar")).marginRight === "4px",
    "#levelBar's own trailing margin is the row's ordinary 4px button gap (grouping it with #btnApplyLevelToTree), not a bespoke wider gap any more");
});
