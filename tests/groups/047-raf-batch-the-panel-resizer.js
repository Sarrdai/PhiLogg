// GROUP 47 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 47 — rAF-batch the panel-resizer drag handlers
   Origin: this session (2026-08-18), code-review finding (performance/sync
   pass). The sidebar/detail-panel/fhSplit resizers' mousemove handlers used
   to call renderVisibleRows()/renderHighlightVisibleRows()/
   renderTimelineMinimap() synchronously on every raw event, unlike every
   other high-frequency-input handler in the app (the table/highlight/
   extract/link scroll listeners), which already batch onto
   requestAnimationFrame. mousemove can fire far more often than the
   display repaints, so a fast drag re-ran the (for the sidebar case,
   double-row-rebuild-plus-minimap-SVG-rebuild) work once per event instead
   of once per frame. Fixed by giving each of the three handlers the same
   ticking-flag/rAF-batching guard the scroll handlers already use — the
   geometry itself (style.width/height) stays outside the throttle so the
   panel still visibly tracks the cursor with no added latency, only the
   expensive re-render is deferred and collapsed.
   ============================================================ */
group(47);
await withApp(async (w, d, T) => {
  section("47. Panel resizers batch their re-render onto requestAnimationFrame");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  T.state.activeId = f.id;
  w.render();

  // Monkey-patch renderVisibleRows/renderTimelineMinimap to count calls —
  // same injected-script technique the memoization group above uses (a
  // second <script> in the same document shares the realm's lexical scope,
  // so reassigning a top-level function declaration is visible page-wide).
  const s = d.createElement("script");
  s.textContent = `
    const __origRVR = renderVisibleRows;
    renderVisibleRows = function() { window.__rvrCalls = (window.__rvrCalls||0)+1; return __origRVR(); };
    const __origRTM = renderTimelineMinimap;
    renderTimelineMinimap = function(...a) { window.__rtmCalls = (window.__rtmCalls||0)+1; return __origRTM(...a); };
  `;
  d.body.appendChild(s);

  const sidebarEl = d.querySelector("#sidebar");
  const sidebarResizer = d.querySelector("#sidebarResizer");
  w.__rvrCalls = 0; w.__rtmCalls = 0;
  // Started wide (clientX 800) and dragged steadily left (shrinking) so each
  // move lands a genuinely different, unclamped width — getBoundingClientRect
  // is stubbed to a fixed 800px width (see beforeParse above), which is
  // already past maxWidth (window.innerWidth-360), so a small rightward move
  // from a smaller start would otherwise stay pinned at the same clamped value.
  sidebarResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 800 }));
  // Three rapid moves, all before any animation frame has a chance to run.
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 700 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 600 }));
  const widthAfterSecondMove = sidebarEl.style.width;
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 500 }));
  assert(sidebarEl.style.width !== "" && sidebarEl.style.width !== widthAfterSecondMove,
    "sidebar width tracks the cursor synchronously on every mousemove, not just on the deferred render");
  assert(w.__rvrCalls === 0 && w.__rtmCalls === 0,
    "the expensive re-render/minimap rebuild does NOT run synchronously inside the mousemove handler, got rvr=" + w.__rvrCalls + " rtm=" + w.__rtmCalls);

  await new Promise(resolve => setTimeout(resolve, 50)); // let the batched rAF actually fire
  assert(w.__rvrCalls === 1 && w.__rtmCalls === 1,
    "three rapid mousemove events collapse into exactly one deferred re-render/minimap rebuild, got rvr=" + w.__rvrCalls + " rtm=" + w.__rtmCalls);

  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));

  // Detail-panel resizer: same batching guard, lighter check (row re-render only).
  const detailResizer = d.querySelector("#detailResizer");
  w.__rvrCalls = 0;
  detailResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientY: 500 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 480 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 460 }));
  assert(w.__rvrCalls === 0, "detail-panel resize also defers its row re-render instead of running it synchronously per mousemove");
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(w.__rvrCalls === 1, "detail-panel resize's two rapid moves collapse into one deferred re-render, got " + w.__rvrCalls);
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));

  // fhSplit resizer: same batching guard.
  T.state.activeId = f.id;
  w.applyFhView("stacked");
  const fhSplitResizer = d.querySelector("#fhSplitResizer");
  w.__rvrCalls = 0;
  fhSplitResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientY: 200 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 220 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 240 }));
  assert(w.__rvrCalls === 0, "fhSplit resize also defers its row re-render instead of running it synchronously per mousemove");
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(w.__rvrCalls === 1, "fhSplit resize's two rapid moves collapse into one deferred re-render, got " + w.__rvrCalls);
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
});
