// GROUP 55 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 55 — Multiline message display toggle
   Origin: this session (person-requested, German: "einen toggle, mit dem
   man die Log Views zwischen der aktuellen Darstellung und Mehrzeiligen
   Messages umschalten kann. Default bleibt die aktuelle Ansicht, Zustand ist
   global und wird im Cache gespeichert"). #btnMultilineMsg toggles
   state.multilineMessages (default false — unchanged single-line/truncated
   rows) between that and rendering each entry's message with its literal
   "\n" line breaks (continuation lines accumulated during parsing — Group 1)
   as real line breaks, in BOTH "Log views" (Filtered table + Highlight/Full
   — both share the .col-msg span and the ROW_HEIGHT-based virtualization).
   Row height is computed purely from message line COUNT
   (rowHeightForEntry/MULTILINE_LINE_HEIGHT=15px/line) — never measured from
   the DOM (white-space:pre, no soft-wrap) — specifically so the
   tableRowOffsets/highlightRowOffsets prefix-sum arrays renderVisibleRows/
   renderHighlightVisibleRows/scrollToIndex/scrollToHighlightIndex/
   updateMinimapRenderedRange fall back to when the toggle is on stay exactly
   in sync with what's actually rendered. Persisted via the same session-
   cache settings mechanism as state.pinBookmarksInFilteredView (buildCacheMeta/
   restoreSessionFromCache) — global across the whole app, not per-file.
   ============================================================ */
group(55);
await withApp(async (w, d, T) => {
  section("55a. Multiline toggle: default view, row heights, spacer, both Log views");
  w.applyFhView("stacked"); // both Log views on screen: the Context view is only built while visible (GROUP 270)

  // Entry 2 gets 2 continuation lines appended during parsing (same
  // technique as Group 1/20) -> a 3-line message; every other entry stays
  // single-line.
  const lines = makeLog(0, 5).trimEnd().split("\n");
  lines.splice(3, 0, "  at Foo.Bar()", "  at Baz.Qux()");
  const f = await w.addFile("multi.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  w.render();

  assert(f.entries.length === 5, "sanity: 5 entries parsed, continuation lines didn't create new ones");
  assert(f.entries[2].message.split("\n").length === 3, "sanity: entry 2's message has 3 lines (header + 2 continuation)");

  const btn = d.querySelector(".toggle-multiline");
  assert(btn, ".toggle-multiline exists");
  assert(!btn.classList.contains("active") && T.state.multilineMessages === false,
    "toggle starts OFF — default stays the current (single-line) view");
  assert(!d.body.classList.contains("multiline-messages"), "no body-level class by default");

  let rows = [...d.querySelectorAll("#tableRows .log-row")];
  assert(rows.length === 5 && rows.every(r => parseInt(r.style.height, 10) === 28),
    "default view: every row is a fixed 28px (ROW_HEIGHT) regardless of message content");
  assert(parseInt(d.querySelector("#tableSpacer").style.height, 10) === 5 * 28 + 22,
    "default spacer height is plain count*ROW_HEIGHT+22");

  /* ---------- Toggle ON ---------- */
  fireClick(btn, w);
  assert(T.state.multilineMessages === true, "click flips state.multilineMessages");
  assert(btn.classList.contains("active"), "button reflects the ON state");
  assert(d.body.classList.contains("multiline-messages"), "body class toggled — drives the .col-msg white-space:pre CSS override");

  assert(w.messageLineCount(f.entries[2].message) === 3, "messageLineCount counts embedded \\n's");
  assert(w.rowHeightForEntry(f.entries[0]) === 28, "rowHeightForEntry: single-line entry stays at the base ROW_HEIGHT");
  assert(w.rowHeightForEntry(f.entries[2]) === 28 + 2 * 15, "rowHeightForEntry: 3-line entry grows by (lines-1)*MULTILINE_LINE_HEIGHT = 28+30=58");

  rows = [...d.querySelectorAll("#tableRows .log-row")];
  const row0 = rows.find(r => r.dataset.entryId === f.entries[0].id);
  const row2 = rows.find(r => r.dataset.entryId === f.entries[2].id);
  assert(parseInt(row0.style.height, 10) === 28, "single-line entry's DOM row stays 28px in multiline mode");
  assert(parseInt(row2.style.height, 10) === 58, "3-line entry's DOM row grew to 58px, got " + row2.style.height);
  assert(row2.querySelector(".col-msg").textContent.includes("at Baz.Qux()"),
    "the message cell's text content carries the continuation line (CSS white-space:pre renders the \\n as a real break)");

  const spacerH = parseInt(d.querySelector("#tableSpacer").style.height, 10);
  assert(spacerH === (4 * 28 + 58) + 22, "tableSpacer height sums the REAL per-row heights, not entries.length*ROW_HEIGHT, got " + spacerH);

  // Both "Log views" (Filtered + Highlight/Full) share .col-msg and the toggle.
  const hRow2 = d.querySelector('#highlightRows [data-entry-id="' + f.entries[2].id + '"]');
  assert(hRow2 && parseInt(hRow2.style.height, 10) === 58, "the Highlight view's copy of the same entry is tall too");
  const hRow0 = d.querySelector('#highlightRows [data-entry-id="' + f.entries[0].id + '"]');
  assert(hRow0 && parseInt(hRow0.style.height, 10) === 28, "...and its single-line entries stay at 28px there too");

  /* ---------- Toggle OFF again: exact reversion ---------- */
  fireClick(btn, w);
  assert(T.state.multilineMessages === false && !btn.classList.contains("active") && !d.body.classList.contains("multiline-messages"),
    "toggling off reverts state, button and body class");
  rows = [...d.querySelectorAll("#tableRows .log-row")];
  assert(rows.every(r => parseInt(r.style.height, 10) === 28), "toggling off reverts every row back to 28px");
  assert(parseInt(d.querySelector("#tableSpacer").style.height, 10) === 5 * 28 + 22, "spacer reverts to plain count*ROW_HEIGHT too");
});

await withApp(async (w, d, T) => {
  section("55b. Multiline toggle: variable-height virtualization stays exact (scrollToIndex via jumpToEntry)");

  // 50 entries, one (index 5) with 20 continuation lines appended -> a
  // 21-line message, height 28+20*15=328px, sitting well before the jump
  // target (index 40) so its extra height actually has to be accounted for
  // by the offset-based windowing math, not just the fixed index*ROW_HEIGHT
  // arithmetic the default (off) path still uses.
  const raw = makeLog(0, 50).trimEnd().split("\n");
  const cont = Array.from({ length: 20 }, (_, i) => "  at Frame" + i + "()");
  raw.splice(6, 0, ...cont); // right after entries[5]'s header line
  const f = await w.addFile("tall.log", raw.join("\n") + "\n", () => {});
  assert(f.entries.length === 50 && f.entries[5].message.split("\n").length === 21,
    "sanity: 50 entries, entry 5 has the 21-line message");
  T.state.activeId = f.id;
  w.render();
  fireClick(d.querySelector(".toggle-multiline"), w);
  assert(T.state.multilineMessages === true, "sanity: toggled on");

  const target = f.entries[40];
  w.jumpToEntry(target.id); // sets scrollTargetId -> renderTable() -> scrollToIndex(40, {center:true, flash:true})

  // Expected scrollTop, computed the same way scrollToIndex does but from
  // first principles here: sum of every row's real height before index 40
  // (entry 5's 328px instead of 28px), minus half a (normal, 28px) viewport
  // plus half that target row's own height.
  let rowTop = 0;
  for (let i = 0; i < 40; i++) rowTop += (i === 5 ? 328 : 28);
  const expectedScrollTop = rowTop - 400 / 2 + 28 / 2; // viewportH stubbed to 400 (see withApp)
  assert(d.querySelector("#tableBody").scrollTop === expectedScrollTop,
    "scrollTop accounts for the tall row's real height, not a flat index*ROW_HEIGHT, got " +
    d.querySelector("#tableBody").scrollTop + " expected " + expectedScrollTop);

  const targetRow = d.querySelector('#tableRows [data-entry-id="' + target.id + '"]');
  assert(targetRow, "the jumped-to entry actually has a rendered DOM row at that scroll position (offset-based start/end windowing landed correctly)");
});

/* ============================================================
   GROUP 55d — Multiline toggle: no scroll jump/reset
   Origin: 2026-08-10 session (person follow-up, German: "Stelle sicher, dass
   das Log nicht scrollt oder nach oben springt wenn man zwischen single und
   multi line wechselt. Der jeweils oben sichtbare LogEintrag soll stehen
   bleiben, darunter dürfen die Log-Einträge wachsen/schrumpfen."). A plain
   render() after flipping state.multilineMessages would otherwise reset
   #tableBody's scroll to the top and leave #highlightBody's raw scrollTop
   pixel value untouched even though rows ABOVE it may have grown — both
   wrong.
   Updated this session (broader follow-up, German: "...wechsel von Filtern,
   Log-Leveln, Message Expand etc. die aktive Zeile bleibt sichtbar..."): the
   original fix was multiline-toggle-specific (topVisibleEntryId +
   pendingTableTopAlignId/pendingHighlightTopAlignId, manually captured by
   the toggle button's click handler right before render()). It's now
   captureViewAnchor()/restoreViewAnchor() (see their own comment above
   renderVisibleRows() in philogg.html), called automatically INSIDE
   renderTable()/renderHighlightView() on every render that rebuilds either
   view's entry list — level-filter toggle, node/filter switch, sort, pin-
   bookmarks toggle, not just this one toggle — and prioritizing the
   active/selected row over the topmost-visible one when there is a
   selection. The assertions below (which only ever exercise the
   no-selection fallback path) still hold unchanged; the very last one
   (Link-view round trip) now expects the position to be PRESERVED across
   the subsequent node switch instead of reset to 0, since that "reset to
   top on any other change" default is exactly what this session's request
   replaced everywhere, not just here.
   ============================================================ */
group(55);
await withApp(async (w, d, T) => {
  section("55d. Multiline toggle: the top-visible entry stays anchored (no scroll jump/reset) when row heights change above it");
  w.applyFhView("stacked"); // both Log views on screen: the Context view is only built while visible (GROUP 270)

  // 60 entries; three of them (10, 25, 40) each get 3 continuation lines
  // (4-line messages) so real height changes happen well ABOVE the
  // scrolled-to viewport — exactly the scenario a plain render() (or even a
  // naive "just keep the raw scrollTop pixel value") gets wrong.
  const raw = makeLog(0, 60).trimEnd().split("\n");
  [40, 25, 10].forEach(i => raw.splice(i + 1, 0, "  at A()", "  at B()", "  at C()")); // spliced back-to-front so earlier indices stay valid
  const f = await w.addFile("scroll.log", raw.join("\n") + "\n", () => {});
  assert(f.entries.length === 60, "sanity: 60 entries, continuation lines didn't create new ones");
  [10, 25, 40].forEach(i => assert(f.entries[i].message.split("\n").length === 4, "sanity: entry " + i + " has a 4-line message"));
  T.state.activeId = f.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const highlightBody = d.querySelector("#highlightBody");
  tableBody.scrollTop = 45 * 28;      // entry 45 at the very top, past all three tall entries (10/25/40)
  highlightBody.scrollTop = 45 * 28;
  w.renderVisibleRows();
  w.renderHighlightVisibleRows();
  assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[45].id + '"]'), "sanity: entry 45 is rendered at the top before toggling");

  // Expected new scrollTop once multiline is ON: every row's real height up
  // to index 45, where three of the rows before it each grew by 3*15=45px.
  const expectedOn = 45 * 28 + 3 * (3 * 15);

  fireClick(d.querySelector(".toggle-multiline"), w);
  assert(T.state.multilineMessages === true, "sanity: toggled on");
  assert(tableBody.scrollTop === expectedOn,
    "Filtered view: scrollTop grows to keep entry 45 at the top (accounting for the 3 taller rows above it), got " + tableBody.scrollTop + " expected " + expectedOn);
  assert(highlightBody.scrollTop === expectedOn,
    "Highlight/Full view: same re-anchoring on the same entry, got " + highlightBody.scrollTop + " expected " + expectedOn);
  assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[45].id + '"]'),
    "entry 45's row is still actually rendered at the (new) top of the Filtered view — not just a matching scrollTop number");
  assert(d.querySelector('#highlightRows [data-entry-id="' + f.entries[45].id + '"]'),
    "...and of the Highlight/Full view too");

  /* ---------- Toggle back OFF: scrollTop shrinks back to the exact pixel spot it started at ---------- */
  fireClick(d.querySelector(".toggle-multiline"), w);
  assert(T.state.multilineMessages === false, "sanity: toggled off again");
  assert(tableBody.scrollTop === 45 * 28, "toggling off re-anchors back to the original scrollTop, got " + tableBody.scrollTop);
  assert(highlightBody.scrollTop === 45 * 28, "...in the Highlight/Full view too");
  assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[45].id + '"]'), "entry 45 is still exactly at the top after the round trip");

  /* ---------- Edge case: already scrolled to the very top (0) stays at 0 ---------- */
  w.setTableScroll(0);
  w.setHighlightScroll(0);
  w.renderVisibleRows();
  w.renderHighlightVisibleRows();
  fireClick(d.querySelector(".toggle-multiline"), w);
  assert(tableBody.scrollTop === 0 && highlightBody.scrollTop === 0,
    "toggling while already scrolled to the very top stays at 0 (entry 0 is unaffected — nothing above it can grow)");

  /* ---------- Link view active: no stale capture lingers ---------- */
  // The Filtered table isn't even rendered while a Link node is active
  // (renderMainView() calls renderLinkView() instead of renderTable()) — the
  // click handler must not capture a table-view align target in that case.
  // Reset to single-line mode first (the "already at top" edge case above
  // left it on) so the flat scrollTop chosen below actually lines up with
  // flat ROW_HEIGHT math instead of the still-live variable-row offsets from
  // that toggle — this section is about the Link-view guard, not about
  // multiline row heights.
  if (T.state.multilineMessages) fireClick(d.querySelector(".toggle-multiline"), w);
  assert(T.state.multilineMessages === false, "sanity: back to single-line mode before the Link-view section");
  // Scrolled away from 0 here specifically so an unguarded capture would
  // resolve to some OTHER entry (not coincidentally 0 again) — proving the
  // guard actually matters, not just that this particular number happens
  // to line up.
  tableBody.scrollTop = 20 * 28;
  w.renderVisibleRows();
  const refNode = w.createFilterNode(f.id, "text", "message 1");
  const targetNode = w.createFilterNode(f.id, "text", "message 2");
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1);
  T.state.activeId = linkNode.id;
  w.render(); // renderLinkView(), NOT renderTable() — #tableBody stays hidden at scrollTop 20*28
  fireClick(d.querySelector(".toggle-multiline"), w); // toggled while the Link view is active
  assert(T.state.multilineMessages === true, "sanity: toggled while the Link view is active");
  fireClick(d.querySelector(".toggle-multiline"), w); // and back off again, still while Link view active
  assert(T.state.multilineMessages === false, "sanity: toggled back off, still while the Link view is active");
  T.state.activeId = f.id;
  w.render(); // switches back to the plain table view, no scrollTargetId set — an ordinary node switch
  // captureViewAnchor() only ever runs INSIDE renderTable() itself (never
  // while the Link view was showing instead), so #tableBody's currentViewEntries/
  // scrollTop stayed frozen at their pre-Link-view values (20*28) the whole
  // time — nothing stale to guard against here anymore, and switching back to
  // the same node (f.id, still unfiltered) finds that same entry still in
  // the list, so the view lands right back where it was instead of jumping
  // to the top (see this session's general "don't jump" follow-up above).
  assert(d.querySelector("#tableBody").scrollTop === 20 * 28,
    "switching back to the plain table view re-anchors on the entry that was on screen before the Link view interruption, instead of resetting to top");
});

section("55c. Multiline toggle persists through the session cache (global setting, survives a reload)");
{
  const factory = new IDBFactory();
  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeLog(0, 3), () => {});
    fireClick(d.querySelector(".toggle-multiline"), w);
    assert(T.state.multilineMessages === true, "sanity: toggled on before persisting");
    await w.persistFileNode(f); // fire-and-forget in the app; awaited here so the "files" store write lands before the window closes
    await w.persistMetaNow();
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta.settings.multilineMessages === true, "cache: multilineMessages written into the settings record, same carrier as pinBookmarksInFilteredView");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    await T.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    assert(T.state.rootIds.length === 1, "sanity: file came back via boot-time restore");
    assert(T.state.multilineMessages === true, "restore: multiline toggle state restored from the cache");
    assert(d.querySelector(".toggle-multiline").classList.contains("active"), "restore: button reflects the restored state");
    assert(d.body.classList.contains("multiline-messages"), "restore: body class reflects the restored state");
  }, { indexedDB: factory });
}
