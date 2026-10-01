// GROUP 163 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 163 — Context view run-line hover highlights the WHOLE run
   Origin: this session (2026-09-03), person-requested: hovering one row's
   slice of a revealed run's connecting line (.ctx-run-line, see
   makeContextRunHandle) used to only highlight that one row segment via
   plain CSS :hover — since each row's slice is its own separate DOM button,
   :hover can't see the others. Hovering ANY slice, including the caret end
   caps, must now highlight the whole run together.
   ============================================================ */
group(163);
await withApp(async (w, d, T) => {
  section("163. Hovering any slice of a run's line highlights every slice, including both end caps");

  // Same fixture as Group 138: "hit" lands on entries 0 and 30 -> a 29-line
  // gap between them, revealed in one go by clicking its "… N lines" filler.
  const f = await w.addFile("ctx.log", makeLog(0, 60, { suffix: i => (i % 30 === 0 ? "hit" : "other") }), () => {});
  const hitFilter = w.createFilterNode(f.id, "text", "hit");
  T.state.activeId = hitFilter.id;
  w.render();
  w.applyFhView("highlight");

  const fillers = () => [...d.querySelectorAll("#highlightRows .ctx-gap-placeholder")];
  fireClick(fillers()[0], w); // reveals the whole 29-line stretch as one run
  const runLines = () => [...d.querySelectorAll("#highlightRows .ctx-run-line")];
  assert(runLines().length > 2, "sanity: the revealed run spans more than just its two capped ends");

  // Virtualization only materializes rows near the current scroll position
  // (see Group 138's own comment on this) — at scrollTop 0 the top cap and
  // several middle slices are in the DOM, but the bottom cap of this 31-row
  // run isn't yet. Confirm the hover propagates for what IS on screen here...
  const topLine = runLines().find(l => l.classList.contains("ctx-run-top"));
  const middleLine = runLines().find(l => !l.classList.contains("ctx-run-top") && !l.classList.contains("ctx-run-bottom"));
  assert(topLine && middleLine, "sanity: the top capped end and at least one middle slice are rendered at scrollTop 0");
  assert(!runLines().some(l => l.classList.contains("ctx-run-bottom")),
    "sanity: the bottom cap isn't windowed in yet at scrollTop 0 (see below for it)");

  middleLine.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true }));
  assert(runLines().every(l => l.classList.contains("ctx-run-hover")),
    "hovering a MIDDLE slice highlights every currently-rendered slice of the run, including the top cap");
  middleLine.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: true }));
  assert(runLines().every(l => !l.classList.contains("ctx-run-hover")),
    "leaving the hover removes the highlight from every slice again");

  topLine.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true }));
  assert(runLines().every(l => l.classList.contains("ctx-run-hover")),
    "hovering the TOP capped end (the caret) highlights the whole run too, not just itself");
  topLine.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: true }));
  assert(runLines().every(l => !l.classList.contains("ctx-run-hover")), "…and clears again on leave");

  // ...then scroll the bottom cap into view and confirm it behaves the same.
  w.setHighlightScroll(20 * T.ROW_HEIGHT);
  w.renderHighlightVisibleRows();
  const bottomLine = runLines().find(l => l.classList.contains("ctx-run-bottom"));
  assert(bottomLine, "sanity: scrolling down brings the run's bottom capped end into the window");
  assert(bottomLine.dataset.runId === topLine.dataset.runId, "sanity: it's the same run (shares the data-run-id captured before scrolling)");

  bottomLine.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true }));
  assert(runLines().every(l => l.classList.contains("ctx-run-hover")),
    "hovering the BOTTOM capped end highlights every currently-rendered slice too");
  bottomLine.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: true }));
  assert(runLines().every(l => !l.classList.contains("ctx-run-hover")), "…and clears again on leave");
});
