// GROUP 90 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 90 — "Main window visual consistency fix" (this session,
   2026-08-22): the toolbar/view-bar button system never got the same
   treatment the Settings dialog's .btn-mini system did — every button-like
   control hand-tuned its own padding/line-height to coincidentally match
   its neighbors (three rounds of now-removed "height-parity bugfix"
   comments; see Group 26/29b's updated assertions for the resulting
   shared-28px-height behavior this replaced them with), and the three
   panel resizers (#sidebarResizer/#fhSplitResizer/#detailResizer) were
   fully transparent at rest, reading as a stray dark seam rather than an
   intentional divider. This group covers what Group 26/29b don't: the
   resizers' now-permanent grip affordance, the --border/--border-soft
   token mismatch at the sidebar/minimap seam, and the #btnOpen/#btnSession
   rule merge. Asserted via raw stylesheet text (same pattern as Group
   86a's audit) rather than computed style — jsdom's getComputedStyle
   doesn't resolve ::after pseudo-element styles, so these are checked as
   cascaded CSS text instead of computed pixels, same blind spot documented
   in "Testing approach".
   ============================================================ */
group(90);
await withApp(async (w, d) => {
  section("90. Main window visual consistency fix: resizer grip affordance, sidebar/minimap border token");
  const css = d.querySelector("style").textContent;

  // --- Problem 2: resizers get a permanent (non-transparent) grip, not just an on-hover reveal ---
  ["#sidebarResizer", "#fhSplitResizer", "#detailResizer"].forEach(sel => {
    const ruleMatch = css.match(new RegExp(sel + "::after\\{[^}]*\\}"));
    assert(ruleMatch, sel + "::after rule exists");
    assert(ruleMatch && ruleMatch[0].includes("background:var(--border-hover)"),
      sel + "::after has a permanent var(--border-hover) grip background at rest, not transparent, got " + (ruleMatch && ruleMatch[0]));
    assert(ruleMatch && !ruleMatch[0].includes("background:transparent"),
      sel + "::after no longer starts fully transparent (was the 'stray dark seam' bug)");
    // Hover/drag brightening to --accent is pre-existing behavior, unchanged by this session.
    assert(css.includes(sel + ":hover::after, " + sel + ".dragging::after{ background:var(--accent); }"),
      sel + " still brightens to var(--accent) on hover/drag");
  });

  // --- Problem 2 (follow-up, this session): .col-resize-handle gets the same
  // resting-visibility treatment as the three panel resizers above, since it
  // had NO background at all at rest (fully invisible until hover/drag). ---
  // Superseded by design-polish-p1: the handle is now invisible at rest, the line is a ::before in --hairline.
  const colHandleRule = css.match(/\.col-resize-handle\{[^}]*\}/);
  assert(colHandleRule && !/background/.test(colHandleRule[0]),
    ".col-resize-handle has no resting background (divider line is its ::before), got " + (colHandleRule && colHandleRule[0]));

  // --- Problem 2: sidebar/minimap seam now agrees on the same border token ---
  const minimapRule = css.match(/#timelineMinimap\{[^}]*\}/);
  assert(minimapRule && minimapRule[0].includes("border-bottom:1px solid var(--hairline)") && !minimapRule[0].includes("border-bottom:1px solid var(--border-soft)"),
    "#timelineMinimap's border-bottom now uses --border (matching the sidebar/content seam's own token, wherever it currently lives), not --border-soft, got " + (minimapRule && minimapRule[0]));
  // #sidebar's own border-right moved to #sidebarResizer in a later session
  // (see Group 217) — #sidebar.collapsed keeps a fallback for when the
  // resizer is hidden, checked there instead.
  const sidebarResizerRule = css.match(/#sidebarResizer\{[^}]*\}/);
  assert(sidebarResizerRule && sidebarResizerRule[0].includes("border-right:1px solid var(--hairline)"),
    "sanity: the sidebar/content seam's border-right is still var(--hairline), now carried by #sidebarResizer, got " + (sidebarResizerRule && sidebarResizerRule[0]));
});
