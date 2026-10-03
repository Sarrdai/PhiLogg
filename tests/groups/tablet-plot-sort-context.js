// GROUP tablet-plot-sort-context — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP tablet-plot-sort-context — plot defaults, sort third tap, ghost-row
   label, Context-tab scroll, Patterns quoted strings (tablet UX round, step 5).
   Origin: 2026-10-03 (tablet usability test).
   a. New plot: X = time column (clock ticks, "Time" title), Y = first varying
      float column before int; a stored/user-changed choice is kept.
   b. Column header sort cycles first direction -> opposite -> off.
   c. The italic ghost row (selection outside the filter) carries a "not in
      this filter" chip; the entry detail shows a one-line notice.
   d. Switching to the Context tab scrolls a selection made while it was
      hidden into view; the toolbar compensation uses its measured height.
   e. Patterns: 'single' and "double" quoted strings both become <str>.
   Data: log-sim scenarios (motion, basic, levels, ids).
   ============================================================ */
group("tablet-plot-sort-context");

const tpSetWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };

await withApp(async (w, d, T) => {
  section("tablet-plot-sort-context a. Plot defaults: time X with clock ticks, Y = first varying float");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["motion"], entries: 200, seed: 3 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  // col 0 axis (int), col 1 target (float), col 2 job (int): the float column wins
  const node = w.createFilterNode(f.id, "text", "Move requested axis=[*:int] target=[*:float] job=J-[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  assert(T.plotConfig.xCol === -1, "default X is the time column (-1), got " + T.plotConfig.xCol);
  assert(JSON.stringify(T.plotConfig.yCols) === "[1]", "default Y is the float column before the (varying) ints, got " + JSON.stringify(T.plotConfig.yCols));
  const ticks = [...d.querySelectorAll("#plotSvg .plot-tick-label")].map(t => t.textContent);
  assert(ticks.some(t => /^\d{2}:\d{2}:\d{2}(\.\d{3})?$/.test(t)), "X ticks are clock times, got " + JSON.stringify(ticks));
  assert(!ticks.some(t => /e\+/.test(t)), "no exponent ticks");
  const titles = [...d.querySelectorAll("#plotSvg .plot-axis-title")].map(t => t.textContent);
  assert(titles[0] === "Time", "X title is Time, got " + titles[0]);
  // Span < 2 s -> milliseconds; span crossing midnight -> date.
  const base = T.extractRowsData.length ? T.extractRowsData[0].entry.ts : 0;
  const midnight = new Date(base); midnight.setHours(24, 0, 0, 0);
  const tMid = midnight.getTime() - base;
  assert(/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(w.formatPlotClockTick(0, 0, 1500)), "span < 2 s adds ms");
  assert(/^\d{2}:\d{2}:\d{2}$/.test(w.formatPlotClockTick(0, 0, 5000)), "longer span: seconds only");
  assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(w.formatPlotClockTick(tMid + 1000, tMid - 60000, tMid + 60000)), "span across midnight prepends the date");

  // Ints only: the first varying one; a constant column is skipped.
  const [tim] = LOGSIM.generateToStrings({ scenarios: ["timing"], entries: 300, seed: 3 });
  const f2 = await w.addFile(tim.name, tim.text, () => {});
  T.state.activeId = f2.id; w.render();
  const node2 = w.createFilterNode(f2.id, "text", "Request GET /api/orders/[*:int] completed in [*:int]ms status=[*:int]");
  T.state.activeId = node2.id;
  w.render();
  w.applyFhView("plot");
  assert(JSON.stringify(T.plotConfig.yCols) === "[0]", "ints only: first varying int column, got " + JSON.stringify(T.plotConfig.yCols));
  T.extractRowsData.forEach(r => { r.values[0] = "7"; });
  T.plotConfig.yColsInit = false;
  w.renderPlotControls();
  assert(JSON.stringify(T.plotConfig.yCols) === "[1]", "a constant column is skipped, got " + JSON.stringify(T.plotConfig.yCols));

  // A user-changed choice is kept.
  node.plotConfig.xCol = -2;
  node.plotConfig.yCols = [0];
  T.state.activeId = f2.id; w.render();
  T.state.activeId = node.id; w.render(); w.applyFhView("plot");
  assert(T.plotConfig.xCol === -2 && JSON.stringify(T.plotConfig.yCols) === "[0]", "stored axis choice is kept");
  w.renderPlotControls();
  assert(T.plotConfig.xCol === -2, "re-render keeps X = Index");
});

await withApp(async (w, d, T) => {
  section("tablet-plot-sort-context b. Sort: asc -> desc -> off (log order); Δt starts at desc");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["levels"], entries: 200, seed: 5 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const th = col => d.querySelector('.th-sortable[data-sort="' + col + '"]');
  const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const arrow = col => th(col).querySelector(".th-sort-arrow").textContent;
  click(th("level"));
  assert(T.state.sortColumn === "level" && T.state.sortDir === "asc" && arrow("level") === "▲", "tap 1: ascending");
  click(th("level"));
  assert(T.state.sortColumn === "level" && T.state.sortDir === "desc" && arrow("level") === "▼", "tap 2: descending");
  click(th("level"));
  assert(T.state.sortColumn === null && arrow("level") === "", "tap 3: sort off, indicator cleared");
  const ts = T.currentViewEntries.map(e => e.ts);
  assert(ts.every((v, i) => i === 0 || ts[i - 1] <= v), "off = chronological log order");
  click(th("level"));
  assert(T.state.sortColumn === "level" && T.state.sortDir === "asc", "tap 4 starts over ascending");
  click(th("time"));
  assert(T.state.sortColumn === "time" && T.state.sortDir === "asc", "another column starts its own cycle");
  // Δt: largest first, so its cycle is desc -> asc -> off.
  click(th("delta"));
  assert(T.state.sortColumn === "delta" && T.state.sortDir === "desc", "Δt tap 1: descending");
  click(th("delta"));
  assert(T.state.sortColumn === "delta" && T.state.sortDir === "asc", "Δt tap 2: ascending");
  click(th("delta"));
  assert(T.state.sortColumn === null, "Δt tap 3: off");
});

await withApp(async (w, d, T) => {
  section("tablet-plot-sort-context c. Ghost row: 'not in this filter' chip + detail notice");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 300, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const err = f.entries.find(e => e.level === "ERROR") || f.entries.find(e => e.level === "WARN");
  const pick = f.entries.find(e => e.level === "INFO");
  const node = w.createFilterNode(f.id, "text", err.message.slice(0, 12));
  T.state.activeId = f.id;
  w.render();
  w.selectEntry(pick.id);
  assert(d.querySelector("#detailOutside").style.display === "none", "inside the filter / on the file: no notice");
  T.state.activeId = node.id;
  w.applyTempAnchorOnActiveNodeSwitch(node.id);
  w.render();
  w.applyFhView("filter");
  const ghost = d.querySelector("#tableRows .log-row.temp-anchor-row");
  assert(ghost, "ghost row rendered for the selection outside the filter");
  const chip = ghost.querySelector(".not-in-filter-chip");
  assert(chip && chip.textContent === "not in this filter", "ghost row carries the chip");
  assert(w.getComputedStyle(chip).fontSize === "10px", "chip is 10px, got " + w.getComputedStyle(chip).fontSize);
  w.updateDetailPanel();
  const note = d.querySelector("#detailOutside");
  assert(note.style.display === "block" && note.textContent === "This entry is not part of the current filter.", "detail panel shows the notice");
  assert(!d.querySelector("#tableRows .log-row:not(.temp-anchor-row) .not-in-filter-chip"), "regular rows have no chip");
  // Selecting a real row of the filter removes both.
  const member = T.currentViewEntries.find(e => !e._tempAnchor);
  w.selectEntry(member.id);
  assert(d.querySelector("#detailOutside").style.display === "none", "selecting a member clears the notice");
  // Without any node switch: the ERROR level circle hides the selected INFO entry (no temp anchor involved).
  T.state.activeId = f.id;
  w.render();
  w.selectEntry(pick.id);
  assert(d.querySelector("#detailOutside").style.display === "none", "file node, INFO selected: no notice");
  d.querySelector('.level-btn[data-level="ERROR"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(T.state.selectedId === pick.id && !T.state.tempAnchor, "sanity: the selection stays, no temp anchor");
  assert(d.querySelector("#detailOutside").style.display === "block", "level filter excludes the shown entry: notice appears");
  d.querySelector('.level-btn[data-level="ERROR"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(d.querySelector("#detailOutside").style.display === "none", "level filter off again: notice gone");
  w.render();
  assert(!d.querySelector(".not-in-filter-chip"), "and the chip once the rows are rebuilt");
});

await withApp(async (w, d, T) => {
  section("tablet-plot-sort-context d. Context tab: selection made while hidden is scrolled into view");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 400, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  tpSetWidth(w, 820);
  assert(T.fhLayout === "tabs", "sanity: tabs layout on the tablet width, got " + T.fhLayout);
  const node = w.createFilterNode(f.id, "text", "a");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("filter");
  const body = d.querySelector("#highlightBody");
  Object.defineProperty(body, "clientHeight", { configurable: true, get: () => 300 });
  const target = T.currentViewEntries[Math.min(40, T.currentViewEntries.length - 1)];
  w.selectEntry(target.id);
  body.scrollTop = 0;
  w.applyFhView("highlight");
  const idx = T.currentHighlightViewEntries.findIndex(e => e.id === target.id);
  const offs = T.highlightRowOffsets;
  assert(idx > 5 && offs[idx] > 300, "sanity: the entry lies below the (stubbed) viewport, idx " + idx);
  assert(offs[idx] >= body.scrollTop && offs[idx + 1] <= body.scrollTop + 300, "selected entry is fully visible after the tab switch, scrollTop " + body.scrollTop + " row " + offs[idx]);
  const mid = (offs[idx] + offs[idx + 1]) / 2;
  assert(Math.abs(mid - (body.scrollTop + 150)) < 2, "and centered, scrollTop " + body.scrollTop);
  // Already visible: no jump.
  w.applyFhView("filter");
  const st = body.scrollTop;
  w.applyFhView("highlight");
  assert(body.scrollTop === st, "an entry that is already visible does not move the view");

  // Toolbar compensation uses the measured height (touch compact tier: min-height 52px), fallback 36.
  const tb = d.querySelector("#contextToolbar");
  w.setContextToolbarVisible(false, false);
  body.scrollTop = 200;
  Object.defineProperty(tb, "offsetHeight", { configurable: true, get: () => 52 });
  w.setContextToolbarVisible(true);
  assert(body.scrollTop === 252, "showing the bar compensates by its measured 52px, got " + body.scrollTop);
  w.setContextToolbarVisible(false);
  assert(body.scrollTop === 200, "hiding gives the same 52px back, got " + body.scrollTop);
  Object.defineProperty(tb, "offsetHeight", { configurable: true, get: () => 0 });
  w.setContextToolbarVisible(true);
  assert(body.scrollTop === 200 + T.CONTEXT_TOOLBAR_HEIGHT, "unmeasurable height falls back to the constant, got " + body.scrollTop);
});

await withApp(async (w, d, T) => {
  section("tablet-plot-sort-context e. Patterns: quoted strings (single and double) normalize to <str>");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic", "ids"], entries: 600, seed: 3 });
  const orderMsgs = sim.text.split("\n").filter(l => /submitted by user '/.test(l));
  assert(orderMsgs.length >= 3 && new Set(orderMsgs.map(l => /user '(\w+)'/.exec(l)[1])).size >= 2, "sanity: simulated orders with different single-quoted users");
  const key = w.normalizeMessagePattern("Order O-30276 submitted by user 'dave'");
  assert(w.patternDisplayText(key) === "Order O-<#> submitted by user '<str>'", "single quotes kept, content replaced, got " + w.patternDisplayText(key));
  assert(key === w.normalizeMessagePattern("Order O-1 submitted by user 'alice'"), "different users share one pattern");
  assert(w.patternDisplayText(w.normalizeMessagePattern('opened for user "erin" from')) === 'opened for user "<str>" from', "double quotes as before");
  assert(w.patternDisplayText(w.normalizeMessagePattern("it's the user's call, don't")) === "it's the user's call, don't", "apostrophes inside words are not quotes");
  assert(w.patternFilterValue(key, 0, false) === "Order O-[*] submitted by user '[*]'", "filter value keeps the quotes");
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const spec = w.messagePatternValues("Order O-9 submitted by user 'bob'");
  assert(JSON.stringify(spec) === JSON.stringify(["9", "bob"]), "extracted placeholder values: quotes stripped, got " + JSON.stringify(spec));
});
