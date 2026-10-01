// GROUP 91 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 91 — Entry Detail gets the sidebar's hover-peek behavior
   (person-requested, this session, 2026-08-22, extended same-day
   follow-up after person-reported screenshot feedback): the detail panel
   peeks open on hover while collapsed, same mechanism as the sidebar
   (Group 80) but expanding upward instead of rightward. Both panels' peek
   size is content-sized (width/height:max-content) capped at 50% of the
   application (max-width:50vw / max-height:50vh) instead of the
   sidebar's old fixed 270px.

   Follow-up fix (same session): the first cut anchored only #detailBody
   above the still-truncated 34px header, so the peek showed the message
   floating ABOVE a header that still read like the collapsed state — not
   what "same visual as expanded" means. Fixed by wrapping
   #detailPanelHeader + #detailBody in a new #detailPanelInner (mirroring
   #sidebarNormalContent, which already wraps the sidebar's header+scroll
   as one peekable unit) and anchoring THAT as the overlay
   (bottom:0 of the collapsed 34px #detailPanel, no `top`, so it grows
   upward) — header on top with the full field set, message below it,
   pixel-identical structure to the expanded state, just floating.
   updateDetailPanel() now branches on `isDetailCollapsed() &&
   !isDetailPeeking()`, not just isDetailCollapsed(), so the header shows
   the full level/time/thread/location/method fields while peeking instead
   of the collapsed one-line summary.

   Also follow-up (same feedback): the single combined "Open collapsed
   views on hover" setting became two independent ones —
   #settingsHoverExpandSidebar / #settingsHoverExpandDetail
   (hoverExpandSidebar/hoverExpandDetail,
   philogg-hover-expand-sidebar/-detail in localStorage) — so hovering one
   panel can be toggled without affecting the other. Both default ON.

   Icon-swap-to-pin-while-peeking is asserted via the raw SVG markup (the
   "#i-pin" sprite reference only appears in ICON_PIN, not any chevron) since the icon
   constants aren't exposed on the bridge (top-level const, see withApp's
   own comment). max-width/max-height capping is asserted via raw
   stylesheet text, same reasoning as Group 90 (jsdom has no real layout
   engine to measure resolved pixel sizes against).
   ============================================================ */
group(91);
await withApp(async (w, d, T) => {
  section("91. Entry Detail hover-peek (matching the sidebar's expanded look) + content-sized/50%-capped peek + per-panel hover settings");

  const sidebarEl = d.querySelector("#sidebar");
  const detailPanel = d.querySelector("#detailPanel");
  const detailPanelInner = d.querySelector("#detailPanelInner");
  const detailBody = d.querySelector("#detailBody");
  const detailToggleBtn = d.querySelector("#detailToggle");
  const detailMeta = d.querySelector("#detailMeta");
  const detailResizerEl = d.querySelector("#detailResizer");
  const sidebarCb = d.querySelector("#settingsHoverExpandSidebar");
  const detailCb = d.querySelector("#settingsHoverExpandDetail");

  // --- Both default to on ---
  assert(pillChecked(sidebarCb) === true && pillChecked(detailCb) === true, "both hover-expand settings default to ON");

  // A selected entry so the header meta line has real content to check.
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.selectEntry(f.entries[0].id);
  w.render();

  // --- Detail panel peeks on hover while collapsed, matching the
  //     EXPANDED look: header shows the full field set (not the truncated
  //     one-liner), message sits below it, no drag handle ---
  w.toggleDetailCollapsed(true);
  assert(!isVisible(detailBody, w), "collapsed, not hovering: body hidden");
  assert(detailMeta.querySelector(".detail-collapsed-msg") && !detailMeta.querySelector(".detail-thread"),
    "collapsed, not hovering: header still shows the truncated summary");
  detailPanel.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(detailPanel.classList.contains("peeking"), "hovering a collapsed detail panel enters peek state");
  assert(isVisible(detailBody, w), "...revealing the SAME body element used when expanded");
  assert(detailMeta.querySelector(".detail-thread") && !detailMeta.querySelector(".detail-collapsed-msg"),
    "...and the header now shows the full field set, exactly like expanded — not the collapsed summary");
  assert(detailToggleBtn.innerHTML.includes("#i-pin"), "toggle icon swaps to the pin icon while peeking");
  assert(!isVisible(detailResizerEl, w), "no drag handle while peeking (still logically collapsed)");
  detailPanel.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false }));
  assert(!detailPanel.classList.contains("peeking") && !isVisible(detailBody, w), "leaving collapses the body again");
  assert(detailMeta.querySelector(".detail-collapsed-msg") && !detailMeta.querySelector(".detail-thread"),
    "...and the header reverts to the truncated summary");
  assert(!detailToggleBtn.innerHTML.includes("#i-pin"), "toggle icon reverts to a chevron once peeking ends");

  // Clicking the toggle while peeking pins it open (same as the sidebar) —
  // the toggle button sits in #detailPanelHeader, the same place it always
  // does, not somewhere new for the peek state.
  detailPanel.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  fireClick(detailToggleBtn, w);
  assert(!detailPanel.classList.contains("collapsed") && !detailPanel.classList.contains("peeking"),
    "clicking the toggle while peeking pins the detail panel fully open");
  assert(detailMeta.querySelector(".detail-thread"), "...and the full field set stays shown, now because it's genuinely expanded");

  // --- Content-sized, capped at 50% of the application (CSS text audit,
  //     same technique as Group 90 — jsdom can't measure real pixel sizes).
  //     The detail panel's overlay is #detailPanelInner (header+body
  //     together), not #detailBody alone. ---
  const css = d.querySelector("style").textContent;
  const sidebarPeekRule = css.match(/#sidebar\.collapsed\.peeking #sidebarNormalContent\{[^}]*\}/);
  assert(sidebarPeekRule && sidebarPeekRule[0].includes("width:max-content") && sidebarPeekRule[0].includes("max-width:50vw"),
    "sidebar peek overlay is sized to content, capped at 50% of the app's width, got " + (sidebarPeekRule && sidebarPeekRule[0]));
  assert(sidebarPeekRule && !sidebarPeekRule[0].includes("width:270px"),
    "...no longer the old fixed 270px");
  const detailPeekRule = css.match(/#detailPanel\.collapsed\.peeking #detailPanelInner\{[^}]*\}/);
  assert(detailPeekRule && detailPeekRule[0].includes("max-height:50vh"),
    "detail panel peek overlay (the whole header+body wrapper) is capped at 50% of the app's height, got " + (detailPeekRule && detailPeekRule[0]));
  assert(detailPeekRule && detailPeekRule[0].includes("bottom:0") && !detailPeekRule[0].includes("top:0"),
    "...anchored flush to the collapsed panel's bottom edge with no top set, so it grows upward from there");
  assert(!css.match(/#detailPanel\.collapsed\.peeking #detailBody\{[^}]*\}/),
    "the old #detailBody-only peek rule is gone — #detailPanelInner replaces it");

  // --- Regression guard (person-reported via screenshot, same session):
  //     #detailPanel is shown/hidden via an INLINE style.display "flex"/
  //     "none" set from renderMainView/renderTable (unrelated to this
  //     feature — hasFiles/no-files toggling), which overrides any CSS
  //     `display` on #detailPanel but leaves `flex-direction` alone. When
  //     #detailPanelInner's introduction dropped `flex-direction:column`
  //     from #detailPanel's own CSS, that inline "flex" fell back to
  //     row (flex-direction's initial value) whenever a file was loaded,
  //     turning #detailPanelInner into a ROW flex item that shrinks to its
  //     content width — visually: the Entry Detail bar stopping partway
  //     across the window instead of reaching the right edge, in EVERY
  //     state (pinned, collapsed, peeking), not just while peeking.
  //     jsdom's getComputedStyle doesn't resolve real flex cross-axis
  //     stretch sizing (no layout engine — see "Testing approach" in
  //     PROJECT.md), so this can't be asserted via a rendered width the
  //     way the peek rules above are; verified instead via a real
  //     Playwright screenshot this session, and guarded here the same way
  //     Group 90's CSS-text audits guard their own pure-CSS fixes. ---
  const detailPanelRule = css.match(/#detailPanel\{[^}]*\}/);
  assert(detailPanelRule && detailPanelRule[0].includes("flex-direction:column"),
    "#detailPanel keeps its own flex-direction:column — without it, the inline style.display=\"flex\" set from renderMainView/renderTable falls back to row and #detailPanelInner shrinks to content width, got " + (detailPanelRule && detailPanelRule[0]));

  // --- Second regression guard, same root cause, same person-reported
  //     screenshot round (a follow-up screenshot after the width fix
  //     above): #detailPanel's rule declares `min-height:80px` (a floor
  //     for the manual drag-resizer) THEN `min-height:0` later in the same
  //     rule — last declaration of the same property wins, so the actual
  //     effective min-height was always 0, the 80px never really applied.
  //     Moving `min-height:0` onto #detailPanelInner during the same
  //     #detailPanelInner refactor left `min-height:80px` as the only
  //     min-height left on #detailPanel — and min-height always clamps the
  //     used height upward regardless of whether the 34px it's clamping
  //     comes from this stylesheet or the collapsed-state inline style set
  //     by toggleDetailCollapsed, so the collapsed panel silently rendered
  //     at 80px, leaving a real ~46px empty gap below the header instead
  //     of the header being the panel's bottom edge. Text order matters
  //     here (CSS cascade = last declaration of the same property, at
  //     equal specificity, wins) — checking substring order, not just
  //     presence. ---
  assert(detailPanelRule && /min-height:80px[\s\S]*min-height:0\b/.test(detailPanelRule[0]),
    "#detailPanel's min-height:0 comes AFTER min-height:80px in the same rule (so it's the one that actually wins) — without it the 80px floor clamps the collapsed 34px height, leaving an empty gap below the header, got " + (detailPanelRule && detailPanelRule[0]));

  // --- Each panel's setting independently gates only that panel's hover ---
  fireClick(detailCb, w);
  assert(w.localStorage.getItem("philogg-hover-expand-detail") === "0", "unchecking the detail setting persists it as off");
  assert(w.localStorage.getItem("philogg-hover-expand-sidebar") !== "0", "...without touching the sidebar's own setting");

  w.toggleSidebarCollapsed(true);
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(sidebarEl.classList.contains("peeking"), "sidebar hover still peeks — its own setting is untouched");
  w.toggleDetailCollapsed(true);
  detailPanel.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(!detailPanel.classList.contains("peeking"), "detail panel hover no longer peeks while ONLY its own setting is off");

  // Manual click-to-expand is unaffected by either setting.
  fireClick(d.querySelector("#sidebarToggle"), w);
  assert(!sidebarEl.classList.contains("collapsed"), "sidebar still expands manually via its toggle button");
  fireClick(detailToggleBtn, w);
  assert(!detailPanel.classList.contains("collapsed"), "detail panel still expands manually via its toggle button with its own hover disabled");

  // Toggling a panel to peeking, THEN turning its own setting off, drops it
  // out of peek immediately instead of leaving it stuck open.
  fireClick(detailCb, w);
  w.toggleDetailCollapsed(true);
  detailPanel.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(detailPanel.classList.contains("peeking"), "sanity: detail panel peeks again once its setting is back on");
  fireClick(detailCb, w);
  assert(!detailPanel.classList.contains("peeking"), "turning the detail setting off mid-peek exits peek state immediately");

  // --- Persisted flags honored on (re-)init, same path real boot uses,
  //     independently per panel ---
  w.localStorage.setItem("philogg-hover-expand-sidebar", "0");
  w.localStorage.setItem("philogg-hover-expand-detail", "1");
  w.initHoverExpandSettings();
  assert(pillChecked(sidebarCb) === false && pillChecked(detailCb) === true,
    "initHoverExpandSettings re-applies persisted flags independently per panel, same as at boot");
  w.toggleSidebarCollapsed(true);
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(!sidebarEl.classList.contains("peeking"), "...sidebar's re-applied off flag actually gates its hover handler");
  w.toggleDetailCollapsed(true);
  detailPanel.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(detailPanel.classList.contains("peeking"), "...while detail's re-applied on flag keeps its own hover working");

  w.localStorage.setItem("philogg-hover-expand-sidebar", "1");
  w.initHoverExpandSettings();
  assert(pillChecked(sidebarCb) === true, "...and a persisted on flag");
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(sidebarEl.classList.contains("peeking"), "...re-enabling the sidebar's hover behavior too");
});
