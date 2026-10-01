// GROUP 99 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 99 — Ctrl+0/Alt+Arrow tree peek+nav, Alt+Enter extraction, and the
   temporary anchor (FEATURE_BACKLOG.md #18, person-requested; a prior
   in-session design built a centered/keyboard-navigable breadcrumb flyout
   popup for this instead — reverted after trying it live, replaced with
   this simpler "forward Alt+Arrow straight to the existing Files & Filters
   tree" approach; the breadcrumb hover flyout itself is UNCHANGED from
   before this session, see GROUP 92). Alt rather than Ctrl for the arrow
   nav — same-day person-requested follow-up — since Ctrl+Arrow is standard
   OS/app behavior for jumps within a document and should stay free for
   that.

   Two independent peek mechanisms, same-day person-refined so each closes
   the way it should rather than one rule for both:
   - Ctrl+0 keeps its existing "focus the tree" behavior, and ADDITIONALLY
     force-peeks the panel open (setSidebarForcedPeek, sidebarForcedPeek
     flag) if it's collapsed. Stays open until focus genuinely LEAVES the
     panel — picking a filter (Enter while the tree has focus), switching
     Full/Filtered/Stacked view (applyFhView, Ctrl+1/2/3 or a tab click), or
     clicking outside the sidebar — deliberately NOT tied to releasing Ctrl
     itself (Ctrl+0's own keystroke releases Ctrl immediately after).
   - Alt, held down (with or without an arrow), peeks a collapsed panel open
     for exactly as long as it's held (sidebarAltPeek flag, dedicated
     keydown/keyup listeners) — a plain toggle, so a quick tap-and-release
     just glances at the tree without navigating anything. Alt+Arrow ALSO
     forwards straight to moveTreeSelection WITHOUT touching
     state.focusRegion — the Log view stays "focused" for plain arrow keys.
     Alt+Enter's own dialog (see below) can open while Alt is down;
     releasing Alt then defers closing the peek until the dialog itself
     closes (maybeCloseSidebarAltPeek, checked from both Alt's keyup and
     closeFilterPopup).
   - Alt+Enter opens "Filter for this message" for the selected row directly
     (openFilterForEntryColumn, shared with the right-click menu item).
   - The temporary anchor (state.tempAnchor): switching the active filter —
     via a tree row click OR Alt+Arrow tree nav, the only two ways to do
     that now — while the selected row doesn't match the new filter shows it
     at its would-be position instead of losing it, per
     #settingsTempAnchorMode (Off/Persistent/Fade, its fade-duration row
     only shown for Fade).
   ============================================================ */
group(99);
await withApp(async (w, d, T) => {
  section("99. Ctrl+0/Alt+Arrow tree peek+nav, Alt+Enter, temporary anchor");

  // messages: "message 0 keep", "message 1 skip", "message 2 keep", ...
  const f = await w.addFile("app.log", makeLog(0, 5, { suffix: i => (i % 2 === 0 ? "keep" : "skip") }), () => {});
  const keepFilter = w.createFilterNode(f.id, "text", "keep"); // matches entries 0,2,4
  const skipFilter = w.createFilterNode(f.id, "text", "skip"); // matches entries 1,3
  w.render();

  const sidebarEl = d.querySelector("#sidebar");
  const highlightRow = i => d.querySelectorAll("#highlightRows .log-row")[i];

  // --- Ctrl+0: unchanged while expanded, force-peeks once collapsed, and
  //     that peek persists until focus genuinely leaves the panel (picking
  //     a filter, switching view, or clicking outside) — NOT tied to
  //     releasing Ctrl itself ---
  T.state.activeId = keepFilter.id;
  w.render();
  fireKeydown(d, w, "0", { ctrlKey: true });
  assert(T.state.focusRegion === "tree", "Ctrl+0 still moves focus to the tree, exactly as before");
  assert(!sidebarEl.classList.contains("peeking") && T.sidebarForcedPeek === false,
    "...and does nothing extra while the panel is already expanded");

  w.toggleSidebarCollapsed(true);
  fireKeydown(d, w, "0", { ctrlKey: true });
  assert(sidebarEl.classList.contains("peeking") && T.sidebarForcedPeek === true,
    "Ctrl+0 force-peeks the panel open once it's collapsed");
  fireKeyup(d, w, "Control");
  assert(T.sidebarForcedPeek === true && sidebarEl.classList.contains("peeking"),
    "releasing Ctrl right after Ctrl+0 does NOT close the peek — only leaving the panel's focus does");

  fireKeydown(d, w, "1", { ctrlKey: true }); // Ctrl+1 -> Full view, via applyFhView
  assert(T.sidebarForcedPeek === false, "switching to the Full view (Ctrl+1) clears the forced peek");
  assert(!sidebarEl.classList.contains("peeking"), "...and the panel collapses back to its rail");

  w.toggleSidebarCollapsed(true);
  fireKeydown(d, w, "0", { ctrlKey: true });
  fireClick(d.body, w);
  assert(T.sidebarForcedPeek === false, "a click outside the sidebar also clears the forced peek");

  w.toggleSidebarCollapsed(true);
  fireKeydown(d, w, "0", { ctrlKey: true });
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "Enter"); // picking the active filter node while the tree has focus
  assert(T.sidebarForcedPeek === false, "picking a filter (Enter while the tree has focus) also clears the forced peek");

  // --- Alt (held down) peeks a collapsed panel open for as long as it's
  //     held — a plain toggle, independent of navigation — and Alt+Arrow
  //     forwards to tree navigation WITHOUT taking focus away from the
  //     current Log view ---
  T.state.focusRegion = "entries";
  w.toggleSidebarCollapsed(true); // re-collapse
  assert(T.sidebarAltPeek === false, "sanity: no Alt peek yet");

  fireKeydown(d, w, "Alt"); // holding Alt down — a real browser fires this before any Alt+<key> combo
  assert(T.sidebarAltPeek === true && sidebarEl.classList.contains("peeking"),
    "holding Alt alone peeks a collapsed panel open, even without an arrow press");
  fireKeyup(d, w, "Alt");
  assert(T.sidebarAltPeek === false && !sidebarEl.classList.contains("peeking"),
    "releasing Alt closes it back up again, since it was collapsed before the peek");

  fireKeydown(d, w, "Alt");
  fireKeydown(d, w, "ArrowDown", { altKey: true });
  assert(T.sidebarAltPeek === true, "sanity: Alt peek still on during Alt+ArrowDown");
  assert(T.state.focusRegion === "entries",
    "...but Alt+Arrow does NOT switch focus into the tree — it stays wherever it was");
  assert(T.state.activeId === skipFilter.id, "...while still moving the tree selection itself (keepFilter -> skipFilter)");

  fireKeydown(d, w, "ArrowUp", { altKey: true });
  assert(T.state.activeId === keepFilter.id, "Alt+ArrowUp moves it back");
  assert(T.state.focusRegion === "entries", "focus still hasn't moved");

  fireKeyup(d, w, "Alt");
  assert(T.sidebarAltPeek === false && !sidebarEl.classList.contains("peeking"),
    "releasing Alt after navigating with it closes the panel back up");

  // --- Alt+Enter's own dialog can open while Alt is down — releasing Alt
  //     right after typing that chord must not close the panel out from
  //     under the still-open dialog; only actually closing the dialog does ---
  w.applyFhView("highlight");
  T.state.entriesView = "highlight";
  fireClick(highlightRow(0), w);
  fireKeydown(d, w, "Alt");
  fireKeydown(d, w, "Enter", { altKey: true });
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "sanity: Alt+Enter opened the dialog");
  assert(T.sidebarAltPeek === true, "sanity: Alt held it peeked open");
  fireKeyup(d, w, "Alt");
  assert(T.sidebarAltPeek === true && sidebarEl.classList.contains("peeking"),
    "releasing Alt while the Alt+Enter dialog is still open does NOT close the panel");
  w.closeFilterPopup();
  d.querySelector("#filterInput").blur();
  assert(T.sidebarAltPeek === false && !sidebarEl.classList.contains("peeking"),
    "...but closing the dialog afterward does, since Alt was already released");

  w.toggleSidebarCollapsed(false); // re-expand for the rest of this group

  // --- Alt+Enter opens "Filter for this message" for the selected row,
  //     in both Full and Filtered view ---
  w.applyFhView("highlight");
  T.state.entriesView = "highlight";
  fireClick(highlightRow(0), w); // "message 0 keep"
  fireKeydown(d, w, "Enter", { altKey: true });
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "Alt+Enter opens the filter popup from the Full view");
  assert(d.querySelector("#filterInput").value === "message [*:int] keep", "prefilled with the message column's numeric-wildcard pattern");
  assert(d.querySelector('.column-chip[data-col="message"]').classList.contains("active"), "message column pre-selected (no mouse event to resolve one from)");
  w.closeFilterPopup();
  d.querySelector("#filterInput").blur(); // openFilterPopup() focuses it; left focused would swallow every keydown below as "typing" (inInput guard)

  T.state.activeId = keepFilter.id;
  T.state.entriesView = "filter";
  w.render();
  fireClick(d.querySelectorAll("#tableRows .log-row")[0], w); // "message 0 keep" in the Filtered view
  fireKeydown(d, w, "Enter", { altKey: true });
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "Alt+Enter also works from the Filtered view");
  w.closeFilterPopup();
  d.querySelector("#filterInput").blur();

  // Regression: plain Enter (no Alt) in the Filtered view still does its
  // existing job (reveal Highlight view on the row) instead of Alt+Enter's.
  T.state.entriesView = "filter";
  w.render();
  fireClick(d.querySelectorAll("#tableRows .log-row")[0], w);
  fireKeydown(d, w, "Enter");
  assert(T.state.entriesView === "highlight", "plain Enter on a Filtered row still reveals the Highlight view, unaffected by the new Alt+Enter branch");

  // --- Temporary anchor: switching the active filter — via a tree row
  //     click OR Alt+Arrow tree nav — while the selected row doesn't
  //     match the new filter ---
  // The Context view shows the ACTIVE node's own result with everything else
  // collapsed into gaps (see buildContextView), so "message 1 skip" only has a
  // row of its own while a node that admits it is active — stand on the file
  // node, where nothing is filtered out at all, to pick it.
  T.state.activeId = f.id;
  w.render();
  w.applyFhView("highlight");
  T.state.entriesView = "highlight";
  fireClick(highlightRow(1), w); // "message 1 skip" — not a member of keepFilter
  const skip1Id = T.state.selectedId;
  assert(!!skip1Id, "sanity: clicking a Full-view row selects it");

  // Persistent mode explicitly, so this part of the group tests the anchor
  // mechanic itself rather than the (now Fade-by-default) mode's own timeout.
  const modeSelectEarly = d.querySelector("#settingsTempAnchorMode");
  modeSelectEarly.value = "persistent";
  modeSelectEarly.dispatchEvent(new w.Event("change", { bubbles: true }));

  T.state.activeId = skipFilter.id; // start somewhere that DOES match
  w.render();
  fireClick(d.querySelector('.tree-row[data-node-id="' + keepFilter.id + '"]'), w);
  assert(T.state.activeId === keepFilter.id, "clicking the tree row switches the active node as usual");
  assert(T.state.tempAnchor && T.state.tempAnchor.entryId === skip1Id && T.state.tempAnchor.nodeId === keepFilter.id,
    "...and anchors the still-selected row at its would-be position, since 'keep' doesn't match it");

  let anchorRow = d.querySelector("#tableRows .log-row.temp-anchor-row");
  assert(anchorRow && anchorRow.dataset.entryId === skip1Id, "Persistent mode draws the temp anchor row in the Filtered table");
  const rows = [...d.querySelectorAll("#tableRows .log-row")].map(r => r.dataset.entryId);
  assert(rows.indexOf(anchorRow.dataset.entryId) === 1,
    "the anchor sits between 'keep 0' and 'keep 2' chronologically (would-be position), got index " + rows.indexOf(anchorRow.dataset.entryId));

  fireClick(d.querySelector('.tree-row[data-node-id="' + skipFilter.id + '"]'), w);
  assert(T.state.tempAnchor === null, "clicking into a filter that DOES match the selected row clears the anchor");

  // Same mechanic via Alt+Arrow tree navigation, not just a mouse click.
  T.state.activeId = skipFilter.id;
  T.state.selectedId = skip1Id;
  T.state.tempAnchor = null;
  w.render();
  fireKeydown(d, w, "ArrowUp", { altKey: true }); // skipFilter -> keepFilter (flattened tree order)
  assert(T.state.activeId === keepFilter.id, "sanity: Alt+ArrowUp moved onto keepFilter");
  assert(T.state.tempAnchor && T.state.tempAnchor.entryId === skip1Id && T.state.tempAnchor.nodeId === keepFilter.id,
    "Alt+Arrow tree navigation applies the SAME anchor mechanic as a tree row click");

  // --- Fade-duration row visibility: only shown for the Fade mode ---
  const modeSelect = modeSelectEarly;
  assert(d.querySelector("#settingsTempAnchorFadeRow").style.display === "none",
    "the fade-duration row is hidden while mode is Persistent");

  // --- Off mode: never drawn, but Up/Down still respect its position ---
  modeSelect.value = "off";
  modeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.tempAnchorMode === "off", "mode setting persisted");
  assert(d.querySelector("#settingsTempAnchorFadeRow").style.display === "none", "...and the fade-duration row stays hidden for Off too");

  T.state.activeId = skipFilter.id;
  T.state.selectedId = skip1Id;
  T.state.tempAnchor = null;
  w.render();
  fireClick(d.querySelector('.tree-row[data-node-id="' + keepFilter.id + '"]'), w);
  assert(d.querySelector("#tableRows .log-row.temp-anchor-row") === null, "Off mode never draws the anchor row");
  assert(T.state.tempAnchor && T.state.tempAnchor.entryId === skip1Id, "...but the anchor position is still remembered");

  // A tree click gives the tree focus (GROUP 345) — jump back to the log first.
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "ArrowDown"); // plain, no ctrl — ordinary row nav
  const keep2Id = d.querySelectorAll("#tableRows .log-row")[1].dataset.entryId;
  assert(T.state.selectedId === keep2Id, "Down from an off-mode (undrawn) anchor moves to the next REAL row after its position");

  T.state.tempAnchor = { entryId: skip1Id, nodeId: keepFilter.id, faded: false };
  T.state.selectedId = skip1Id;
  w.render();
  fireKeydown(d, w, "ArrowUp");
  const keep0Id = d.querySelectorAll("#tableRows .log-row")[0].dataset.entryId;
  assert(T.state.selectedId === keep0Id, "Up from the same anchor moves to the real row BEFORE its position");

  // --- Fade mode: shown right after the switch, then removed once the
  //     configured duration elapses — no jarring full re-render/scroll jump ---
  w.applyTempAnchorFadeSeconds(0.5); // the stepper's own minimum
  assert(d.querySelector("#tempAnchorFadeValue").textContent === "0.5s", "the fade-duration stepper shows the value without a % suffix, unlike Font Size");
  modeSelect.value = "fade";
  modeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.querySelector("#settingsTempAnchorFadeRow").style.display !== "none", "the fade-duration row is shown once mode is Fade");

  T.state.activeId = skipFilter.id;
  T.state.selectedId = skip1Id;
  T.state.tempAnchor = null;
  w.render();
  fireClick(d.querySelector('.tree-row[data-node-id="' + keepFilter.id + '"]'), w);
  assert(!!d.querySelector("#tableRows .log-row.temp-anchor-row"), "Fade mode draws the anchor row right after the switch");
  const fadeTableBody = d.querySelector("#tableBody");
  fadeTableBody.scrollTop = 5; // arbitrary non-zero value
  const entriesLengthBeforeFade = T.currentViewEntries.length;
  await waitFor(() => d.querySelector("#tableRows .log-row.temp-anchor-row") === null);
  assert(d.querySelector("#tableRows .log-row.temp-anchor-row") === null, "...and removes it once the fade duration elapses");
  assert(T.state.tempAnchor && T.state.tempAnchor.faded === true, "the position stays remembered (faded flag) after the fade completes");
  assert(T.currentViewEntries.length === entriesLengthBeforeFade - 1,
    "the faded anchor is dropped from the in-memory list too, kept in sync with the DOM removal");
  assert(fadeTableBody.scrollTop === 5,
    "the fade completing does NOT trigger a full re-render/scroll-anchor recompute that could jump the view — only that one row's own height collapses");
});
