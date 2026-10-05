// GROUP 61 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 61 — General "don't jump" scroll anchoring + auto-reveal Filtered
   Origin: this session (person request, German: "Stelle sicher, dass beim
   ändern der angezeigten Log-Level, die aktive Zeile nicht aus dem Bild
   springt, sondern sich das Log darüber/darunter erweitert. Generell gilt:
   wechsel von Filtern, Log-Leveln, Message Expand etc. die aktive Zeile
   bleibt sichtbar (sofern sie im Ziel-View vorhanden ist)... Bei wechsel zu
   einem anderen Filter, wechsle automatisch vom Full zum Filtered View
   (wenn Stacked aktiv ist, keine Änderung)"). Group 55d already covers the
   no-selection (topmost-visible-row) fallback path of captureViewAnchor/
   restoreViewAnchor via the multiline toggle; this group covers the
   selection-priority path (the actual point of this session's request) and
   the separate revealFilteredView()-on-node-switch behavior.
   ============================================================ */
group(61);
await withApp(async (w, d, T) => {
  section("61a. Level-filter toggle: the selected/active row stays on screen at the SAME pixel position — the log collapses/expands around it, not a jump");
  w.applyFhView("stacked"); // both Log views on screen: the Context view is only built while visible (GROUP 270)

  // 60 entries, ERROR at every 5th index (makeLog's own default level rule:
  // i%5===0 ? ERROR : INFO) — 12 ERROR / 48 INFO. Selecting an ERROR entry
  // and then filtering down to ERROR-only removes lots of INFO rows ABOVE
  // it, which is exactly the scenario a naive "keep the raw scrollTop pixel
  // value" (or the old "any other change starts back at the top") gets
  // wrong — this asserts the NEW scrollTop is derived so the selected row's
  // on-screen offset is bit-for-bit unchanged.
  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const highlightBody = d.querySelector("#highlightBody");
  assert(f.entries[40].level === "ERROR", "sanity: entry 40 is ERROR-level (40 % 5 === 0)");

  w.setTableScroll(35 * 28);
  w.setHighlightScroll(35 * 28);
  w.renderVisibleRows();
  w.renderHighlightVisibleRows();
  w.selectEntry(f.entries[40].id); // no opts.scroll — selection only, scroll stays exactly where set above
  assert(T.state.selectedId === f.entries[40].id, "sanity: entry 40 selected");
  assert(tableBody.scrollTop === 35 * 28, "sanity: scroll unchanged by selectEntry (no opts.scroll)");

  const oldOffset = 40 * 28 - tableBody.scrollTop; // 140 — entry 40's row top minus scrollTop, i.e. its on-screen pixel offset before the filter change

  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  assert(T.state.levelFilter.has("ERROR") && T.currentViewEntries.length === 12, "sanity: filtered down to the 12 ERROR-level entries");

  // Entry 40 is the 9th ERROR entry (0,5,...,40 → new index 8).
  const newIdx = T.currentViewEntries.findIndex(e => e.id === f.entries[40].id);
  assert(newIdx === 8, "sanity: entry 40 is at index 8 in the ERROR-only list, got " + newIdx);
  const expectedScrollTop = newIdx * 28 - oldOffset; // 224 - 140 = 84
  assert(tableBody.scrollTop === expectedScrollTop,
    "Filtered view: scrollTop recalculated so entry 40 keeps the SAME on-screen offset (" + oldOffset + "px), got " + tableBody.scrollTop + " expected " + expectedScrollTop);
  assert(newIdx * 28 - tableBody.scrollTop === oldOffset, "entry 40's on-screen pixel position is bit-for-bit unchanged (log collapsed around it, not a jump)");
  assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[40].id + '"]').classList.contains("selected"),
    "entry 40's row is actually rendered (and still marked selected) at the new scroll position");

  // The Full/Highlight view deliberately does NOT apply the level filter
  // (this session's change — see GROUP 61e below) — its own entry list is
  // completely unaffected by the click, so entry 40 stays at its ORIGINAL
  // index 40 there and scrollTop is untouched, not recalculated to 84.
  assert(T.currentHighlightViewEntries.length === 60, "Full/Highlight view's entry list is unaffected by the level-filter click");
  assert(highlightBody.scrollTop === 35 * 28, "Full/Highlight view: scrollTop untouched (nothing about its own content changed), got " + highlightBody.scrollTop);

  fireClick(errBtn, w); // toggle back off, restore full 60-entry view for the next section
});

await withApp(async (w, d, T) => {
  section("61b. Level-filter toggle: a selected row that does NOT survive the new filter falls back to the default (reset to top), same as no selection at all");

  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  w.render();
  const tableBody = d.querySelector("#tableBody");

  assert(f.entries[41].level === "INFO", "sanity: entry 41 is INFO-level");
  w.setTableScroll(35 * 28);
  w.renderVisibleRows();
  w.selectEntry(f.entries[41].id);

  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w); // filters entry 41 (INFO) out entirely
  assert(!T.currentViewEntries.some(e => e.id === f.entries[41].id), "sanity: entry 41 is gone from the ERROR-only view");
  assert(tableBody.scrollTop === 0,
    "the selected entry didn't survive into the target view, so the view falls back to its default (reset to top) instead of anchoring on something arbitrary");
});

await withApp(async (w, d, T) => {
  section("61d. A selected row that was OFF-SCREEN before the change is revealed (centered), not left scrolled away, once it's still present in the target view");

  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  w.render();
  const tableBody = d.querySelector("#tableBody");

  assert(f.entries[55].level === "ERROR", "sanity: entry 55 is ERROR-level");
  w.setTableScroll(0); // scrolled to the top — entry 55 is off-screen (way below the viewport) before the filter change
  w.renderVisibleRows();
  w.selectEntry(f.entries[55].id); // no opts.scroll — selection only, doesn't move the scroll into view itself
  assert(tableBody.scrollTop === 0, "sanity: entry 55 selected but scroll left untouched (still off-screen)");

  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w); // entry 55 survives (ERROR-only filter) but was never on screen to begin with
  const newIdx = T.currentViewEntries.findIndex(e => e.id === f.entries[55].id);
  assert(newIdx === 11, "sanity: entry 55 is the last (12th) ERROR entry (0, 5, ..., 55), got index " + newIdx);
  const rowTop = newIdx * 28;
  const expectedScrollTop = rowTop - 400 / 2 + 28 / 2; // centered in the (stubbed 400px) viewport, not edge-snapped
  assert(tableBody.scrollTop === expectedScrollTop,
    "no prior on-screen position to preserve, so the row is revealed centered instead, got " + tableBody.scrollTop + " expected " + expectedScrollTop);
  assert(tableBody.scrollTop <= rowTop && rowTop + 28 <= tableBody.scrollTop + 400,
    "entry 5's row is actually within the new viewport bounds");
});

await withApp(async (w, d, T) => {
  section("61e. Level-filter changes do not narrow the Context view; auto-reveal Filtered from Context instead (no-op when Stacked is active, or already on Filtered)");

  // 20 entries, ERROR at every 5th index (4 ERROR / 16 INFO).
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  // Asserted while standing on a FILTER node, not on the file node: a file node
  // filters nothing at all, so "the level filter didn't narrow it" would be
  // vacuous there. This filter admits all 20 entries, so with no gaps to
  // collapse the Context view's own list is the full 20 either way — what the
  // level toggle must not change (see buildContextView: the quick-filter hides
  // result rows from the FILTERED view's display, they never leave the result
  // set, so they stay matches here).
  const allFilter = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = allFilter.id;
  w.render();
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));

  /* ---------- the Context view's entry list ignores the level filter entirely ---------- */
  w.applyFhView("stacked"); // both panels rendered so we can inspect both
  fireClick(errBtn, w);
  assert(T.currentViewEntries.length === 4, "sanity: Filtered view narrowed to the 4 ERROR-level entries");
  assert(T.contextActive === true, "sanity: a filter node is active, so this is a real Context-view case");
  assert(T.currentHighlightViewEntries.length === 20 && T.contextMatchIds.size === 20,
    "the Context view keeps every match, unaffected by the level filter");
  fireClick(errBtn, w); // reset
  assert(T.currentHighlightViewEntries.length === 20, "sanity: still all 20 after clearing the level filter again");

  /* ---------- tabs layout: changing the level filter while on Context reveals Filtered ---------- */
  w.applyFhView("highlight");
  assert(T.fhActiveTab === "highlight", "sanity: on the Context tab");
  fireClick(errBtn, w);
  assert(T.fhActiveTab === "filter", "changing the level filter while on Context auto-reveals the Filtered view");

  /* ---------- already on Filtered: changing the level filter is a no-op for the tab ---------- */
  fireClick(errBtn, w); // clears the filter again
  assert(T.fhActiveTab === "filter", "already on Filtered — stays there (nothing to reveal)");

  /* ---------- Stacked: level-filter change does NOT change fhLayout ---------- */
  w.applyFhView("stacked");
  fireClick(errBtn, w);
  assert(T.fhLayout === "stacked", "Stacked stays unchanged when the level filter changes (both panels already visible)");
  fireClick(errBtn, w); // reset
});

await withApp(async (w, d, T) => {
  section("61c. Switching to another filter auto-reveals the Filtered view from Context (no-op when Stacked is active, or when switching to a plain FILE node)");

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const nodeA = w.createFilterNode(f.id, "text", "message 1");
  const nodeB = w.createFilterNode(f.id, "text", "message 2");
  T.state.activeId = nodeA.id;
  w.render();

  const rowFor = id => [...d.querySelectorAll(".tree-row")].find(r => r.dataset.nodeId === id);

  /* ---------- tabs layout: switching filters reveals Filtered from Full ---------- */
  w.applyFhView("highlight");
  assert(T.fhActiveTab === "highlight", "sanity: on the Context tab");
  fireClick(rowFor(nodeB.id), w);
  assert(T.state.activeId === nodeB.id, "sanity: switched active filter to node B");
  assert(T.fhActiveTab === "filter", "switching to another filter while on Context auto-reveals the Filtered view");

  /* ---------- switching back to nodeA restores ITS OWN last-shown tab (rememberLast, applyActivationView) ----------
     nodeA was left on Context (the "sanity: on the Context tab" applyFhView("highlight")
     call above, before it was switched away from) — reactivating it now
     restores that, not Filtered; this superseded the old "any filter switch
     forces Filtered" behavior once applyActivationView's remember-last
     scope was extended to plain (non-extraction) filter nodes too, not only
     Table/Plot. See applyActivationView()'s own comment. */
  fireClick(rowFor(nodeA.id), w);
  assert(T.fhActiveTab === "highlight", "switching back to a filter last left on Context restores Context (rememberLast), not forced back to Filtered");

  /* ---------- Stacked: switching filters does NOT change fhLayout ---------- */
  w.applyFhView("stacked");
  fireClick(rowFor(nodeB.id), w);
  assert(T.fhLayout === "stacked", "Stacked stays unchanged when switching between filters (both panels already visible)");

  /* ---------- switching to a plain FILE node does NOT auto-reveal (no filter result to reveal) ---------- */
  // Settle activeId on nodeA BEFORE switching to the Full tab (still in
  // Stacked layout here, so this render()'s own reveal-check is a guaranteed
  // no-op) — otherwise switching tabs first and changing activeId after
  // would itself look like "switched to another filter while on Full" and
  // immediately reveal Filtered again, which isn't what this section means
  // to set up.
  T.state.activeId = nodeA.id;
  w.render();
  w.applyFhView("highlight");
  assert(T.fhActiveTab === "highlight", "sanity: back on the Context tab");
  fireClick(rowFor(f.id), w);
  assert(T.state.activeId === f.id, "sanity: switched active node to the plain file");
  assert(T.fhActiveTab === "highlight", "switching to a FILE node (not a filter) does not auto-reveal Filtered — there is no filter result to reveal");
});
