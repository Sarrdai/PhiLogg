// GROUP 80 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 80 — Collapsible sidebar / detail panel
   Origin: this session (2026-08-22), Claude-Design handoff bundle
   ("Settings Dialog und Panel-Navigation", part 1b). Sidebar collapses to a
   40px rail (marker chain for the active node's ancestry, or root files with
   nothing active); hovering it while collapsed peeks the full tree as an
   overlay (identical markup to the expanded state, no separate rendering
   path — see toggleSidebarCollapsed's comment); clicking the toggle while
   peeking pins it open (exits .collapsed entirely). Detail panel collapses
   to its 34px header, which still shows level/time/first-message-line
   instead of going empty. Both: Ctrl+B/Ctrl+J, resizer double-click,
   localStorage-persisted collapsed flag (display-preference tier, same as
   theme/font-scale — see THEME_STORAGE_KEY). EXTENDED 2026-08-22
   (person-requested follow-up): both resizers (#sidebarResizer/
   #detailResizer) are now hidden outright while their panel is collapsed,
   not just non-functional — a collapsed panel isn't manually resizable
   (sidebar = fixed 40px rail, detail panel = fixed 34px header), so a
   visible drag handle would be dead UI. Toggled directly in JS from
   toggleSidebarCollapsed/toggleDetailCollapsed rather than a CSS selector
   off the panel's own .collapsed class — #detailResizer in particular
   PRECEDES #detailPanel in the DOM, so no descendant/sibling-combinator
   selector keyed off #detailPanel.collapsed could ever reach it (a stale
   CSS rule tried exactly that and silently never matched — removed).
   ============================================================ */
group(80);
await withApp(async (w, d, T) => {
  section("80. Collapsible sidebar / detail panel");

  const sidebarEl = d.querySelector("#sidebar");
  const detailPanel = d.querySelector("#detailPanel");
  const sidebarNormalContent = d.querySelector("#sidebarNormalContent");
  const sidebarRail = d.querySelector("#sidebarRail");
  const detailBody = d.querySelector("#detailBody");
  const sidebarResizerEl = d.querySelector("#sidebarResizer");
  const detailResizerEl = d.querySelector("#detailResizer");

  assert(!sidebarEl.classList.contains("collapsed") && !detailPanel.classList.contains("collapsed"), "both panels start expanded");
  assert(isVisible(sidebarNormalContent, w) && !isVisible(sidebarRail, w), "expanded: normal tree content shown, rail hidden");

  // --- Sidebar collapse/expand ---
  w.toggleSidebarCollapsed();
  assert(sidebarEl.classList.contains("collapsed"), "toggleSidebarCollapsed() collapses the sidebar");
  assert(sidebarEl.style.width === "40px", "collapsed width is set to the 40px rail, got " + sidebarEl.style.width);
  assert(w.localStorage.getItem("philogg-sidebar-collapsed") === "1", "collapsed flag persisted to localStorage");
  assert(!isVisible(sidebarNormalContent, w) && isVisible(sidebarRail, w), "collapsed (not hovering): rail shown, normal content hidden");
  // A collapsed sidebar has a fixed 40px rail width, not a manually
  // resizable one, so its own drag handle would be dead UI if left
  // visible — hidden outright rather than just non-functional (person-
  // requested follow-up, this session).
  assert(!isVisible(sidebarResizerEl, w), "collapsed sidebar hides its own drag-resize handle entirely");

  w.toggleSidebarCollapsed();
  assert(!sidebarEl.classList.contains("collapsed"), "toggling again expands the sidebar");
  assert(sidebarEl.style.width !== "40px", "width is restored away from the 40px rail value, got " + sidebarEl.style.width);
  assert(w.localStorage.getItem("philogg-sidebar-collapsed") === "0", "expanded flag persisted too");
  assert(isVisible(sidebarResizerEl, w), "expanding the sidebar brings its drag handle back");

  // --- Hover-peek: collapsed + mouseenter shows the exact expanded content
  //     as an overlay (no separate peek-only markup/rendering) ---
  w.toggleSidebarCollapsed(true);
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(sidebarEl.classList.contains("peeking"), "hovering a collapsed sidebar enters peek state");
  assert(isVisible(sidebarNormalContent, w), "...revealing the SAME normal-content element used when expanded, not a separate rendering");
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false }));
  assert(!sidebarEl.classList.contains("peeking") && isVisible(sidebarRail, w), "leaving reverts to the plain rail");

  // Clicking the toggle while peeking pins it open (same toggle function,
  // not a separate "pinned" state — see toggleSidebarCollapsed).
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  fireClick(d.querySelector("#sidebarToggle"), w);
  assert(!sidebarEl.classList.contains("collapsed") && !sidebarEl.classList.contains("peeking"), "clicking the toggle while peeking pins the sidebar fully open");

  // --- Rail markers: active node's ancestor chain, clickable, doesn't
  //     itself expand the sidebar ---
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const filterNode = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = filterNode.id;
  w.render();
  w.toggleSidebarCollapsed(true);
  const markers = [...d.querySelectorAll("#sidebarRail .sidebar-rail-marker")];
  assert(markers.length === 2, "rail shows one marker per ancestor (file + the active filter), got " + markers.length);
  assert(markers[markers.length - 1].classList.contains("active"), "the active node's own marker carries .active");
  fireClick(markers[0], w); // the file marker
  assert(T.state.activeId === f.id, "clicking a rail marker sets it active");
  assert(sidebarEl.classList.contains("collapsed"), "...without expanding the sidebar back out");

  // --- Keyboard shortcut + resizer double-click ---
  w.toggleSidebarCollapsed(false);
  fireKeydown(d, w, "b", { ctrlKey: true });
  assert(sidebarEl.classList.contains("collapsed"), "Ctrl+B toggles the sidebar collapse");
  d.querySelector("#sidebarResizer").dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true }));
  assert(!sidebarEl.classList.contains("collapsed"), "double-clicking the sidebar resizer toggles it back open");

  // Plain "b" (no modifier) still runs the existing bookmark shortcut, not
  // the sidebar toggle — Ctrl+B must not have hijacked it.
  w.selectEntry(f.entries[0].id);
  const bookmarksBefore = T.state.bookmarks.size;
  fireKeydown(d, w, "b");
  assert(T.state.bookmarks.size === bookmarksBefore + 1, "plain 'b' with a row selected still toggles a bookmark");

  // --- Detail panel collapse/expand ---
  assert(!detailPanel.classList.contains("collapsed"), "sanity: detail panel starts expanded");
  w.toggleDetailCollapsed();
  assert(detailPanel.classList.contains("collapsed"), "toggleDetailCollapsed() collapses the panel");
  assert(detailPanel.style.height === "34px", "collapsed height matches the 34px header, got " + detailPanel.style.height);
  assert(!isVisible(detailBody, w), "the message body is hidden while collapsed");
  assert(w.localStorage.getItem("philogg-detail-collapsed") === "1", "collapsed flag persisted");
  // Same reasoning as the sidebar resizer above (person-requested follow-up,
  // this session): #detailResizer PRECEDES #detailPanel in the DOM, so a
  // stale CSS rule keyed off #detailPanel.collapsed #detailResizer never
  // actually matched (removed) — hiding it is done in JS instead, from
  // toggleDetailCollapsed directly.
  assert(!isVisible(detailResizerEl, w), "collapsed detail panel hides its own drag-resize handle entirely");

  // Collapsed meta line: level + time + first message line, not the full
  // thread/location/method field set (no room for those in 34px).
  const detailMeta = d.querySelector("#detailMeta");
  assert(detailMeta.querySelector(".detail-collapsed-msg") && !detailMeta.querySelector(".detail-thread"),
    "collapsed header shows the truncated first message line instead of thread/location/method");

  w.toggleDetailCollapsed(false);
  assert(!detailPanel.classList.contains("collapsed") && isVisible(detailBody, w), "expanding restores the body");
  assert(detailMeta.querySelector(".detail-thread") && !detailMeta.querySelector(".detail-collapsed-msg"),
    "...and the full field set is back in the meta line");
  assert(isVisible(detailResizerEl, w), "expanding the detail panel brings its drag handle back");

  fireKeydown(d, w, "j", { ctrlKey: true });
  assert(detailPanel.classList.contains("collapsed"), "Ctrl+J toggles the detail panel collapse");
  d.querySelector("#detailResizer").dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true }));
  assert(!detailPanel.classList.contains("collapsed"), "double-clicking the detail resizer toggles it back open");

  // --- Persisted flag is honored on (re-)init, same path real boot uses ---
  w.localStorage.setItem("philogg-sidebar-collapsed", "1");
  w.localStorage.setItem("philogg-detail-collapsed", "1");
  w.initSidebarCollapsed();
  w.initDetailCollapsed();
  assert(sidebarEl.classList.contains("collapsed") && detailPanel.classList.contains("collapsed"),
    "initSidebarCollapsed/initDetailCollapsed re-apply a persisted collapsed flag, same as at boot");
});
