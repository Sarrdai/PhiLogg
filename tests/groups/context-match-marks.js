// GROUP context-match-marks — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP context-match-marks — Context view: matches are clearly marked
   Origin: 2026-10-09 (desktop usability test, round I3, variant A). Matches
   and revealed context rows looked alike (a 5px dot only). Now: match rows
   get an accent tint, a 10px dot and a bold time; context rows stay
   untouched (not dimmed); a "match" legend sits in the context toolbar;
   a selected match stacks the selection tint on the match tint.
   ============================================================ */
group("context-match-marks");
await withApp(async (w, d, T) => {
  section("context-match-marks a. match rows tinted/bold/10px dot, context rows untouched, legend present");
  const f = await w.addFile("ctx.log", makeLog(0, 60, { suffix: i => (i % 30 === 0 ? "hit" : "other") }), () => {});
  const hit = w.createFilterNode(f.id, "text", "hit");
  T.state.activeId = hit.id;
  w.render(); w.applyFhView("highlight");
  // reveal everything so context rows exist next to the matches
  d.querySelector("#ctxExpandAll").click();
  await waitFor(() => d.querySelector("#highlightRows .log-row.ctx-context"), "context rows revealed");

  const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const rule = sel => { const i = css.indexOf(sel); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
  assert(/ctx-anchor-dot\{[^}]*width:10px;[^}]*height:10px/.test(css.replace(/\s+/g, " ").replace(/\s*:\s*/g, ":").replace(/ ?\{ ?/g, "{")),
    "match dot is 10px in the Context view");
  assert(/#highlightRows \.log-row\.ctx-match\{background-image:linear-gradient\(var\(--accent-soft\)/.test(css),
    "match rows get the accent tint");
  assert(/#highlightRows \.log-row\.ctx-match > \.col-time\{font-weight:700/.test(css), "match time is bold");
  assert(!/\.ctx-context\s*\{[^}]*opacity/.test(css), "context rows are not dimmed");

  const m = d.querySelector("#highlightRows .log-row.ctx-match");
  const c = d.querySelector("#highlightRows .log-row.ctx-context");
  assert(m && m.querySelector(".ctx-anchor-dot"), "match row carries the dot");
  assert(c && !c.querySelector(".ctx-anchor-dot"), "context row has no dot");
  assert(rule(".ctx-legend{").includes("inline-flex"), "legend is styled");
  const legend = d.querySelector("#contextToolbar #ctxLegend");
  assert(legend && /match/.test(legend.textContent) && legend.querySelector(".ctx-legend-dot"), "context toolbar shows the '● match' legend");

  section("context-match-marks b. selected match stacks both fills");
  assert(/ctx-match\.selected[^{]*\{\s*background-image:linear-gradient\(var\(--selected-row-tint\)[^;]*var\(--accent-soft\)/.test(css),
    "selected + match: selection tint over match tint");
  assert(/\.log-row\.selected\{box-shadow:inset 3px 0 0/.test(css.replace(/\s+/g, " ").replace(/ ?\{ ?/g, "{")), "selected bar still defined");
});
