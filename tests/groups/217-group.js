// GROUP 217 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(217);
await withApp(async (w, d, T) => {
  section("217. Resizer/panel seam: the sidebar and detail-panel border moved onto the resizer itself, closing the bare-gap look between panels");

  const css = d.querySelector("style").textContent;
  const ruleFor = re => { const m = css.match(re); return m && m[0]; };

  // --- Sidebar seam: #sidebarResizer now carries the panel's own background + border ---
  const sidebarResizerRule = ruleFor(/#sidebarResizer\{[^}]*\}/);
  assert(sidebarResizerRule && sidebarResizerRule.includes("background:var(--bg-panel)"),
    "#sidebarResizer's own background now continues #sidebar's --bg-panel through the full drag-handle strip, got " + sidebarResizerRule);
  assert(sidebarResizerRule && sidebarResizerRule.includes("border-right:1px solid var(--hairline)"),
    "#sidebarResizer carries the seam border at its own far edge (touching #content), got " + sidebarResizerRule);
  const sidebarBaseRule = ruleFor(/#sidebar\{[^}]*\}/);
  assert(sidebarBaseRule && !/border-right\s*:/.test(sidebarBaseRule),
    "#sidebar's own (expanded-state) rule no longer DECLARES border-right itself (its own explanatory comment may still mention the word) — no double border with #sidebarResizer's, got " + sidebarBaseRule);
  const sidebarCollapsedRule = ruleFor(/#sidebar\.collapsed\{[^}]*\}/);
  assert(sidebarCollapsedRule && sidebarCollapsedRule.includes("border-right:1px solid var(--hairline)"),
    "#sidebar.collapsed restores its own border-right as a fallback, since #sidebarResizer (and the border it now carries) is hidden entirely while collapsed, got " + sidebarCollapsedRule);

  // --- Detail-panel seam: #detailResizer now carries the panel's own background + border ---
  const detailResizerRule = ruleFor(/#detailResizer\{[^}]*\}/);
  assert(detailResizerRule && detailResizerRule.includes("background:var(--bg-panel)"),
    "#detailResizer's own background now continues #detailPanel's --bg-panel through the full drag-handle strip, got " + detailResizerRule);
  assert(detailResizerRule && detailResizerRule.includes("border-top:1px solid var(--hairline)"),
    "#detailResizer carries the seam border at its own far edge (touching #content), got " + detailResizerRule);
  const detailPanelBaseRule = ruleFor(/#detailPanel\{[^}]*\}/);
  assert(detailPanelBaseRule && !/border-top\s*:/.test(detailPanelBaseRule),
    "#detailPanel's own (expanded-state) rule no longer DECLARES border-top itself (its own explanatory comment may still mention the word) — no double border with #detailResizer's, got " + detailPanelBaseRule);
  const detailPanelCollapsedRule = ruleFor(/#detailPanel\.collapsed\{[^}]*\}/);
  assert(detailPanelCollapsedRule && detailPanelCollapsedRule.includes("border-top:1px solid var(--hairline)"),
    "#detailPanel.collapsed restores its own border-top as a fallback, since #detailResizer (and the border it now carries) is hidden entirely while collapsed, got " + detailPanelCollapsedRule);

  // --- Sanity: the resizers still keep their own accent-colored grip on hover/drag (unrelated to this fix, untouched) ---
  assert(css.includes("#sidebarResizer:hover::after, #sidebarResizer.dragging::after{ background:var(--accent); }"),
    "sanity: #sidebarResizer's grip still brightens on hover/drag, unaffected by this session's seam fix");
  assert(css.includes("#detailResizer:hover::after, #detailResizer.dragging::after{ background:var(--accent); }"),
    "sanity: #detailResizer's grip still brightens on hover/drag, unaffected by this session's seam fix");
});
