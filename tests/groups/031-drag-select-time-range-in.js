// GROUP 31 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 31 — Drag-select time range in minimap (originating session;
   UPDATED this session — see Group 32 below for why). Click-drag across the
   minimap bars creates a from/to time filter: originally an "after" +
   "before" filter pair combined by an "and" node (three tree nodes for one
   conceptual filter); this session replaced that with a single "timerange"
   filter node holding both bounds directly (person-reported: "I'd like the
   result as a single filter, without the two sub-filters" — see Group 32's
   own comment for the full redesign). Updated in place rather than left
   testing the superseded three-node shape (CLAUDE.md: "update/remove
   superseded groups instead of leaving a green check on dead code"). Covers:
   overlay show/hide across the gesture, the correct single-node filter
   shape and resulting entry range, that the pre-existing "scrolled into
   view" viewport indicator keeps working independently (the explicit
   caution in FEATURE_BACKLOG.md), and that a plain (non-dragged) click
   still falls through to the existing click-to-jump behavior.
   ============================================================ */
group(31);
await withApp(async (w, d, T) => {
  section("31. Drag-select time range in minimap");
  const lines = [];
  const push = (sec, level, msg) => lines.push(`2024-01-15 10:00:${String(sec).padStart(2, "0")},000\t${level}\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`);
  for (let i = 0; i < 20; i++) push(i, i % 5 === 0 ? "ERROR" : "INFO", "entry " + i); // 10:00:00 .. 10:00:19
  const f = await w.addFile("range.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  const svg = d.querySelector("#timelineMinimapSvg");
  const dragRectEl = d.querySelector("#timelineMinimapDragRect");
  const beforeChildCount = f.children.length;

  // Drag from entry 5's time to entry 14's time (inclusive range of 10 entries).
  const x1 = w.minimapTsToX(f.entries[5].ts);
  const x2 = w.minimapTsToX(f.entries[14].ts);
  svg.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, clientX: x1, clientY: 10 }));
  assert(dragRectEl.classList.contains("hidden"), "drag overlay stays hidden until the pointer moves past the click threshold");
  w.dispatchEvent(new w.MouseEvent("pointermove", { bubbles: true, clientX: (x1 + x2) / 2, clientY: 10 }));
  assert(!dragRectEl.classList.contains("hidden"), "drag overlay rect appears once the pointer has moved past the click threshold");
  const dragLabelEl = d.querySelector("#timelineMinimapDragLabel");
  assert(!dragLabelEl.classList.contains("hidden") && dragLabelEl.textContent.includes("→"), "drag label shows a from → to readout while dragging");
  w.dispatchEvent(new w.MouseEvent("pointermove", { bubbles: true, clientX: x2, clientY: 10 }));
  w.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true, clientX: x2, clientY: 10 }));
  // Real browsers fire a trailing "click" after mouseup; jsdom doesn't
  // synthesize one from dispatched mousedown/mouseup, so simulate it to
  // exercise the suppress-flag guard (see the click listener's comment).
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: x2, clientY: 10 }));

  // Time-window workflow step 4: the drag leaves a DRAFT window (the overlay
  // rect stays, as .selected); the Filter button of its action bar creates the filter.
  assert(dragRectEl.classList.contains("selected") && !dragRectEl.classList.contains("hidden"), "after mouseup the overlay rect stays as the draft window");
  assert(f.children.length === beforeChildCount, "the drag itself creates no filter yet");
  d.querySelector('#timelineMinimapDraftBar [data-act="filter"]').click();
  assert(dragRectEl.classList.contains("hidden") && !dragRectEl.classList.contains("selected"), "draft overlay is gone after Filter");
  assert(f.children.length === beforeChildCount + 1, "drag-select added exactly ONE filter child under the active file, got " + f.children.length);

  const rangeNode = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange");
  assert(rangeNode, "the new node has filterType \"timerange\"");
  assert(T.state.activeId === (rangeNode && rangeNode.id), "the new range filter becomes the active node");
  assert(rangeNode.value.from === f.entries[5].ts && rangeNode.value.to === f.entries[14].ts, "the node's value holds both bounds directly, got " + JSON.stringify(rangeNode.value));
  assert(rangeNode.name === "10:00:05.000 – 10:00:14.000 · 9.0s", "the node's name shows both bounds, got " + rangeNode.name);

  const rangeEntries = w.getEntries(rangeNode.id);
  assert(rangeEntries.length === 10, "range filter selects exactly entries 5..14 inclusive (10 entries), got " + rangeEntries.length);
  assert(rangeEntries.every(e => e.ts >= f.entries[5].ts && e.ts <= f.entries[14].ts), "every selected entry falls within the dragged time range");

  // The pre-existing "filtered view time range" indicators must keep working
  // independently — the explicit caution in FEATURE_BACKLOG.md. (Split into
  // a full-range + a rendered-subset rect by a later session — see Group 34
  // — but the underlying guarantee this asserts is unchanged.)
  const fullRangeRect = d.querySelector("#minimapFullRangeRect");
  const renderedRangeRect = d.querySelector("#minimapRenderedRangeRect");
  assert(fullRangeRect && !fullRangeRect.classList.contains("hidden"), "the full-range indicator still renders after a drag-select filter is created");
  assert(renderedRangeRect && !renderedRangeRect.classList.contains("hidden"), "the rendered-subset indicator still renders after a drag-select filter is created");

  // A short drag (below the pixel threshold) still falls through to plain click-to-jump.
  T.state.selectedId = null;
  const jumpTs = rangeEntries[3].ts;
  const jumpX = w.minimapTsToX(jumpTs);
  svg.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, clientX: jumpX, clientY: 10 }));
  w.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true, clientX: jumpX, clientY: 10 }));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: jumpX, clientY: 10 }));
  assert(T.state.selectedId != null, "a plain (non-dragged) click on the minimap still jumps to the nearest entry");

  // --- Bugfix (this session, person-reported: drag-select "no longer
  // works"). A mid-drag re-render (tail tick, level toggle, window resize —
  // renderTimelineMinimap() can fire any time, see its own module comment)
  // used to desync the gesture: the drag's anchor was stored as a raw
  // minimapWidth-unit x position at mousedown, but minimapTMin/minimapTMax
  // (and minimapXToTs's mapping from x to time) can change before mouseup —
  // e.g. new tail entries extend minimapTMax — so re-evaluating the SAME
  // stored x against the NEW time range no longer pointed at the entry the
  // person actually dragged from. The anchor is now captured as a real
  // timestamp at mousedown instead, immune to any later re-render. Simulates
  // a tail tick landing mid-gesture (appendTailText + the resulting
  // renderTimelineMinimap call, exactly as onTailChange's poll does) between
  // mousedown and mouseup. ---
  T.state.selectedId = null;
  const dragFromTs = f.entries[5].ts, dragToXBefore = w.minimapTsToX(f.entries[14].ts);
  const dragFromX = w.minimapTsToX(dragFromTs);
  svg.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, clientX: dragFromX, clientY: 10 }));
  w.dispatchEvent(new w.MouseEvent("pointermove", { bubbles: true, clientX: (dragFromX + dragToXBefore) / 2, clientY: 10 }));

  // Tail tick mid-drag: append 10 more entries (10:00:20 .. 10:00:29),
  // extending minimapTMax well past the drag's original endpoint — this is
  // what desynced the old pixel-unit anchor.
  const tailLines = [];
  for (let i = 20; i < 30; i++) tailLines.push(`2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"entry ${i}"`);
  f.tail = f.tail || { pending: "" };
  w.appendTailText(f, tailLines.join("\n") + "\n");
  w.renderTimelineMinimap(f.id, f.entries);

  // Same real screen position as before (dragToXBefore) — the on-screen
  // pixel the person's mouse is actually at doesn't move just because the
  // underlying data did.
  w.dispatchEvent(new w.MouseEvent("pointermove", { bubbles: true, clientX: dragToXBefore, clientY: 10 }));
  w.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true, clientX: dragToXBefore, clientY: 10 }));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: dragToXBefore, clientY: 10 }));
  d.querySelector('#timelineMinimapDraftBar [data-act="filter"]').click();

  const midDragRangeNode = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange" && n.value.from === dragFromTs);
  assert(midDragRangeNode, "a tail tick landing mid-drag doesn't desync the gesture — the resulting filter's \"from\" still matches the entry actually dragged from");
});
