// GROUP 26 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 26 — Header/toolbar reshuffle (this session, 2026-08-13)
   Three UI changes: (1) removed the "local, single-file log viewer"
   subtitle from the header, (2) merged the breadcrumb, level filter, and
   Full/Filtered/Stacked toggle — previously three separate toolbar rows —
   into one #viewBar row (only #fhTabs inside it is hidden/shown per view
   state; #levelBar/#breadcrumb now live in that same row but stay visible
   in every state, including extract mode, since renderExtractTable() still
   calls applyLevelFilter() and the filter chain is still useful there),
   and (3) moved the keyboard-shortcuts list out of a permanent bottom-left
   sidebar strip into a popup behind a new #btnShortcuts header button,
   following the exact same open/close/outside-click/Escape pattern as the
   pre-existing #bookmarksPanel (that popup itself was later superseded by
   the Shortcut Manager in Settings, GROUP 114 — and #btnShortcuts itself
   was removed outright in a follow-up to that session, see GROUP 65).
   Follow-up in the same session: #fhTabs/
   #levelBar switched from flex items to floats so they stay pinned to the
   top-left line even when the breadcrumb wraps, with the breadcrumb (now a
   plain block with inline-block chips) using the full row width on wrapped
   lines instead of being squeezed beside them — see #viewBar's own CSS
   comment for why flexbox can't do this. A bugfix followed (missing
   flex:0 0 auto on #viewBar clipping the floats). Another follow-up
   (person-requested): breadcrumb chips resized to match the level filter
   pills' font-size/padding exactly, and made clickable — clicking a chip
   selects that ancestor node in the filter tree, same single-select
   behavior as a plain (non-Ctrl) tree-row click. A second bugfix followed
   (person-reported, still mismatched heights): font-size/padding parity
   wasn't enough — #breadcrumb's leftover line-height:26px was inherited by
   the inline-block .crumb and inflated its height on top of the matching
   padding, invisible on .level-btn since flex containers ignore
   line-height for their own sizing. Fixed by dropping it and setting
   line-height:normal on .crumb/.crumb-sep explicitly. A third bugfix
   followed (person-reported, still not aligned): matching height still
   didn't mean matching TOP position — .crumb used vertical-align:middle,
   which aligns relative to the parent's font baseline, not to where a
   float actually starts. Fixed by vertical-align:top + margin-top:0, which
   pins .crumb's own top edge to the same y-position #fhTabs/#levelBar's
   floats start at (structurally, not by font-metric coincidence).
   ============================================================ */
group(26);
await withApp(async (w, d, T) => {
  section("26. Header reshuffle: merged view bar + shortcuts popup");

  // --- Subtitle removed ---
  assert(d.querySelector(".brand-tag") === null, "the 'local, single-file log viewer' subtitle is gone");
  assert(d.querySelector(".brand-name").textContent === "PhiLogg", "brand name itself is untouched");

  // --- View bar structure (UPDATED, this session's toolbar reorganization,
  // person-requested "Filter-Toolbar"): #viewBar ("Filter-Toolbar") holds
  // the view toggle, level filter, and (rightmost) the row-actions group —
  // identical across every tab. The breadcrumb moved out into its own
  // always-reserved #breadcrumbBar row, placed BETWEEN the timeline minimap
  // and #viewBar (person-requested placement, not below it). ---
  const viewBar = d.querySelector("#viewBar");
  assert(viewBar !== null, "#viewBar exists");
  const viewBarChildren = [...viewBar.querySelectorAll("#fhTabs, #levelBar, #breadcrumb")].map(c => c.id); // document order (the groups are .vb-group wrappers)
  assert(
    viewBarChildren.indexOf("fhTabs") !== -1 &&
    viewBarChildren.indexOf("fhTabs") < viewBarChildren.indexOf("levelBar"),
    "view bar order is tabs, then level filter, got " + viewBarChildren.join(",")
  );
  assert(viewBarChildren.indexOf("breadcrumb") === -1, "breadcrumb is NOT inside #viewBar any more");
  assert(viewBar.contains(d.querySelector("#levelBar")), "level bar is nested INSIDE #viewBar (in its Level group)");
  assert(viewBar.querySelector('[data-row-actions="viewbar"]') !== null, "the row-actions group is nested INSIDE #viewBar too, right of the level filter");
  // Breadcrumb bar removed (2026-09-23, person-requested) — the active path
  // is drawn as highlighted connector lines in the tree instead (GROUP 262).
  assert(d.querySelector("#breadcrumbBar") === null && d.querySelector("#breadcrumb") === null, "the breadcrumb bar is gone");

  const cs = w.getComputedStyle;

  // Initial (no files loaded) state: tabs hidden, same as the old #fhTabBar
  // default — and, per the later "no file loaded" cleanup session, the
  // WHOLE #viewBar row (tabs/level-filter/breadcrumb) is hidden outright,
  // not just left empty, so only #emptyState's centered hint shows.
  assert(T.state.rootIds.length === 0, "sanity: no files loaded yet");
  assert(d.querySelector("#fhTabs").style.display === "none", "tabs hide when no files are loaded");
  assert(viewBar.style.display === "none", "#viewBar itself is hidden with zero files loaded (no empty toolbar row above the centered hint)");

  const f = await w.addFile("a.log", makeLog(0, 10, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = textNode.id;
  w.render();
  assert(viewBar.style.display === "", "#viewBar is shown again once a file is loaded");
  assert(d.querySelector("#fhTabs").style.display === "flex", "tabs visible for a normal (non-extract) filter node");

  // Layout mechanism guard (person-requested follow-up, same session): tabs
  // and level filter must stay pinned top-left even when the breadcrumb
  // wraps to multiple lines, with the breadcrumb using the FULL row width
  // on wrapped lines rather than being squeezed beside them. Flexbox can't
  // do "first line shares space, later lines full width" — only the
  // classic float+normal-flow text-wrap technique can, so this guards
  // against an accidental revert to flex on #viewBar/#breadcrumb, which
  // jsdom's computed styles (unlike real line-wrapping) CAN detect even
  // without a layout engine. Checked with a file loaded (#viewBar visible)
  // since these are its own internal layout mechanics, not its visibility.
  assert(cs(viewBar).display === "flex" && cs(viewBar).flexWrap === "wrap", "#viewBar is a wrapping flex row (whole groups wrap, 2026-10-08; was a flow-root of floats)");
  assert(cs(d.querySelector("#fhTabs")).float === "left", "#fhTabs floats left so it stays pinned to the top line");
  assert(cs(d.querySelector("#levelBar")).float === "left", "#levelBar floats left so it stays pinned to the top line");
  // Regression guard for a real bug hit once already: #viewBar's flow-root
  // is a SEPARATE concern from its own flex-item sizing as a child of
  // #content (a flex column). Losing flex-shrink:0 here lets #content
  // compress #viewBar below the height its floated children need whenever
  // the window is short on vertical space, clipping/overlapping the
  // toggle+level-filter pills against the table below — exactly the "Full/
  // Filtered/Stacked toggle and level filter get cut off" symptom that was
  // reported and fixed in this session.
  assert(cs(viewBar).flexShrink === "0", "#viewBar must not flex-shrink as a child of #content, or its floated children get clipped when vertical space is tight");
  assert(d.querySelectorAll("#levelBar .level-btn").length > 0, "level filter buttons render inside #viewBar");

  // Extract mode (UPDATED by this session's toolbar reorganization):
  // #viewBar (tabs + level filter) is now IDENTICAL regardless of tab,
  // including Table/Plot — #levelBar no longer hides there (it already
  // applied via applyLevelFilter() even before this session, just without a
  // visible pill row). The six log-display toggles moved out of #viewBar
  // entirely into #contextToolbar/#filteredToolbar, so on Table/Plot
  // (#fhSplit hidden) they simply aren't on screen at all, same end result
  // as before, different mechanism.
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("table");
  assert(T.fhActiveTab === "table", "sanity: the Table tab is showing (explicit switch — activation no longer auto-jumps here, see applyActivationView)");
  assert(d.querySelector("#fhTabs").style.display === "flex", "tabs stay visible for an extraction node too (Table/Plot join the same group now)");
  assert(d.querySelector("#levelBar").style.display === "", "level bar STAYS visible while the Table tab is showing — #viewBar is now identical across every tab");
  assert(isVisible(d.querySelector('[data-row-actions="viewbar"]'), w) === true, "the row-actions group (in #viewBar) stays visible on the Table tab too — it's part of the universal Filter-Toolbar, not a log-view toolbar");
  assert(d.querySelector("#fhSplit").style.display === "none", "sanity: the log-view split (and with it #contextToolbar/#filteredToolbar's DISPLAY toggles) isn't on screen on the Table tab");
  w.applyFhView("filter");
  assert(d.querySelector("#levelBar").style.display === "", "level bar stays visible switching to the Filtered tab too");
  assert(isVisible(d.querySelector(".toggle-notes"), w) === true, "the log-display toggles (now inside #contextToolbar/#filteredToolbar) are back on screen on the Filtered tab");

  // Back to a normal node so the popup checks below aren't affected
  T.state.activeId = textNode.id;
  w.render();

  // --- Shared 28px row height (the breadcrumb chips that used to be
  // checked here too are gone with the breadcrumb bar). ---
  const levelBtnEl = d.querySelector("#levelBar .level-btn");
  const fhTabsEl = d.querySelector("#fhTabs");
  const viewTabEl = d.querySelector("#fhTabs .view-tab");
  assert(cs(fhTabsEl).height === "28px",
    "#fhTabs (.view-tabs) has the shared row height (28px) directly — the height REFERENCE for the rest of the row is now a plain number, not a line-height sum");
  assert(cs(viewTabEl).height === "100%",
    "#fhTabs' own button (.view-tab) fills its container via height:100% + flex-centering, not a pinned line-height");
  assert(cs(levelBtnEl).height === "28px", "level pills share the exact same 28px height as #fhTabs");

  // --- Sidebar no longer has a permanent shortcuts strip (superseded, see
  // GROUP 114 for the current Shortcut Manager; #btnShortcuts itself is gone
  // too, see GROUP 65) ---
  assert(d.querySelector("#sidebar #shortcuts") === null, "the sidebar no longer has a permanent shortcuts strip");
});
