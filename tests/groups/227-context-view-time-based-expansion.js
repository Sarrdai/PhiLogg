// GROUP 227 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 227 — Context view: TIME-based expansion step, an alternative unit
   for the existing "Lines revealed per step" mechanism (FEATURE_BACKLOG.md
   #79, narrowed scope — see changelog.d: the raw backlog idea sketched a
   much broader "configurable Context view window" concept; the project
   owner, asked to resolve its own open question, gave this narrower answer
   instead — a unit toggle on the mechanism GROUP 138/151 already cover, not
   a new view). contextExpandStepUnit ("entries" default | "time") governs
   what a step MEANS for both consumers contextExpandStep already fed:
   buildContextView's addHidden (a "Show more" row's own reveal size) and
   applyContextJumpExpansion's aroundJump window. In "time" mode the step is
   a fixed contextExpandStepMs duration instead of a fixed entry count, so
   the entry COUNT one step actually reveals varies with how dense the log
   is at that edge — demonstrated below with an irregular-gap fixture where
   the SAME 500ms step reveals very different counts on two differently-
   paced sides of one jump. The "… N lines" filler is deliberately
   UNCHANGED in both modes (person-requested: "if less than that is
   available just the '...n line' as by now") — always a plain entry count,
   since it reveals the WHOLE remaining stretch regardless of unit.
     a) the Settings row: the unit select shows/hides its two dependent step
        rows and persists, in both directions, including re-hydration from
        localStorage; the ms field's Dec/Inc/typed/clamp behavior mirrors
        the entries field's own (GROUP 151f/219b).
     b) buildContextView/addHidden in time mode, via a fixture with two
        differently-paced stretches either side of one match: the aroundJump
        window reveals a much larger count on the dense side than the
        sparse side for the SAME configured timespan (the whole point of
        time mode); the dense side's remaining stretch has its own step
        correctly WITHHELD because one more step would reveal everything
        left (only "… N lines" shows there); the sparse side gets a "Show
        more" row labelled with the fixed configured duration (not a
        count), which on click reveals only what the "reveal at least one
        entry" clamp guarantees; the "… N lines" row stays a plain count.
     c) applyContextJumpExpansion's aroundJump in time mode takes back
        exactly the previous jump's own auto-revealed window on the next
        jump (GROUP 138o's mechanism, unit-agnostic below "wanted"/"lo"/
        "hi"), while a hand-revealed range in a DIFFERENT gap survives
        untouched.
   ============================================================ */
group(227);
await withApp(async (w, d, T) => {
  section("227a. Settings: the unit select + its two dependent rows, and the ms field's stepper");

  assert(T.contextExpandStepUnit === "entries", "sanity: default unit is \"entries\" (preserves today's behavior)");
  assert(T.contextExpandStepMs === 500, "sanity: default timespan-per-step is 500ms");

  const unitSelect = d.querySelector("#settingsContextExpandStepUnit");
  const entriesRow = d.querySelector("#settingsContextExpandStepRow");
  const msRow = d.querySelector("#settingsContextExpandStepMsRow");
  assert(unitSelect && unitSelect.value === "entries", "Settings select starts on \"Entries\"");
  assert(isVisible(entriesRow, w) && !isVisible(msRow, w),
    "the entries-step row shows and the ms-step row hides by default");

  unitSelect.value = "time";
  unitSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.contextExpandStepUnit === "time", "changing the select drives contextExpandStepUnit");
  assert(w.localStorage.getItem("philogg-context-expand-step-unit") === "time", "...and persists it under its own key");
  assert(!isVisible(entriesRow, w) && isVisible(msRow, w),
    "switching to \"time\" flips which of the two rows is visible");

  unitSelect.value = "entries";
  unitSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.contextExpandStepUnit === "entries" && w.localStorage.getItem("philogg-context-expand-step-unit") === "entries",
    "switching back to \"entries\" persists too");
  assert(isVisible(entriesRow, w) && !isVisible(msRow, w), "...and flips the rows back to their default visibility");

  // Persisted flag honored on (re-)init, same path real boot uses — same
  // pattern GROUP 226a's minimapBinningMode coverage uses.
  w.localStorage.setItem("philogg-context-expand-step-unit", "time");
  w.initContextExpandStepUnitSetting();
  assert(T.contextExpandStepUnit === "time" && unitSelect.value === "time" && !isVisible(entriesRow, w) && isVisible(msRow, w),
    "re-hydrating from a persisted \"time\" value restores the select, the state, and both rows' visibility");
  w.localStorage.setItem("philogg-context-expand-step-unit", "entries");
  w.initContextExpandStepUnitSetting();
  assert(T.contextExpandStepUnit === "entries" && unitSelect.value === "entries" && isVisible(entriesRow, w) && !isVisible(msRow, w),
    "...and re-hydrating back from a persisted \"entries\" value restores the default");

  // --- the ms field: mirrors #settingsContextExpandStep's own Dec/Inc/typed/clamp coverage (GROUP 151f / 219b) ---
  const msInput = d.querySelector("#settingsContextExpandStepMs");
  assert(msInput.value === "500", "the ms field defaults to 500, got " + msInput.value);
  fireClick(d.querySelector("#settingsContextExpandStepMsInc"), w);
  assert(msInput.value === "600" && T.contextExpandStepMs === 600, "Inc nudges the field by its 100ms step AND drives contextExpandStepMs");
  fireClick(d.querySelector("#settingsContextExpandStepMsDec"), w);
  fireClick(d.querySelector("#settingsContextExpandStepMsDec"), w);
  assert(msInput.value === "400" && T.contextExpandStepMs === 400, "Dec nudges back down, two clicks = two 100ms steps");
  msInput.value = "1500";
  msInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.contextExpandStepMs === 1500 && w.localStorage.getItem("philogg-context-expand-step-ms") === "1500",
    "a typed value is applied and persisted");
  msInput.value = "0";
  msInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.contextExpandStepMs === 1 && msInput.value === "1",
    "...and clamped to a minimum of 1 (no upper cap, same as the Time-context-filter dialog's own ms fields), with the clamp reflected back into the field, got " + T.contextExpandStepMs);
});

await withApp(async (w, d, T) => {
  section("227b/c. buildContextView/addHidden and applyContextJumpExpansion in TIME mode — irregular-gap fixture");

  // Three matches ("hit0"/"hit1"/"hit2"), two gaps either side of the
  // middle one, deliberately built at DIFFERENT paces: gapA (indices 1-8)
  // is sparse — 300ms apart, except its LAST entry is pulled in to 2900ms
  // (900ms before "hit1") so a 500ms step still reaches exactly one of
  // them; gapB (indices 10-69) is dense — 10ms apart, 60 entries. The SAME
  // 500ms step (contextExpandStepMs) applied from the SAME jump target
  // (the middle match) therefore reveals a single entry on the sparse side
  // and fifty on the dense side — the "different entry count for a fixed
  // timespan, depending on local density" behavior this feature exists for.
  const pad2 = v => String(v).padStart(2, "0");
  const pad3 = v => String(v).padStart(3, "0");
  const lines = [];
  const push = (h, m, s, ms, msg) => lines.push(`2024-01-15 ${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`);
  const pushOffset = (offsetMs, msg) => push(10, 0, Math.floor(offsetMs / 1000), offsetMs % 1000, msg);

  pushOffset(0, "hit0"); // index 0 — match
  for (let i = 1; i <= 7; i++) pushOffset(300 * i, "gapA " + i); // indices 1-7: 300, 600, ..., 2100
  pushOffset(2900, "gapA 8"); // index 8 — pulled in close to "hit1", unlike the rest of gapA
  pushOffset(3200, "hit1"); // index 9 — match
  for (let i = 1; i <= 60; i++) pushOffset(3200 + 10 * i, "gapB " + i); // indices 10-69: 3210, ..., 3800
  pushOffset(4200, "hit2"); // index 70 — match

  const f = await w.addFile("irregular.log", lines.join("\n") + "\n", () => {});
  assert(f.entries.length === 71, "sanity: fixture has 71 entries, got " + f.entries.length);
  const hitFilter = w.createFilterNode(f.id, "text", "hit"); // matches hit0/hit1/hit2 only
  T.state.activeId = hitFilter.id;
  T.contextExpandStepUnit = "time";
  assert(T.contextExpandStepMs === 500, "sanity: default 500ms step, unchanged by this test");
  const showContext = () => { w.render(); w.applyFhView("highlight"); };
  showContext();

  assert(T.contextGaps.length === 2 && T.contextGaps[0].start === 1 && T.contextGaps[0].end === 9 &&
    T.contextGaps[1].start === 10 && T.contextGaps[1].end === 70,
    "sanity: two gaps either side of the middle match, got " + JSON.stringify(T.contextGaps));

  const fillers = () => [...d.querySelectorAll("#highlightRows .ctx-gap-placeholder")];
  const moreRows = () => [...d.querySelectorAll("#highlightRows .ctx-show-more")];
  const matchRow = id => d.querySelector('#highlightRows [data-entry-id="' + id + '"]');
  const revealed = gapStart => (T.contextExpansions.get(gapStart) || []).map(r => r.from + "-" + r.to).join(",");
  const stepFillers = () => [...T.contextStrips.values()].flat().filter(x => x.kind === "more");
  const gapFillers = () => [...T.contextStrips.values()].flat().filter(x => x.kind === "gap");
  const showTop = () => { w.setHighlightScroll(0); w.renderHighlightVisibleRows(); };

  // --- (b) the middle jump's own window: variable count on each side ------
  fireClick(matchRow(f.entries[9].id), w); // a plain click on "hit1" is a jump (aroundJump)
  assert(revealed(1) === "8-9", "the sparse side (gapA) reveals just its one entry within 500ms of the target, got " + revealed(1));
  assert(revealed(10) === "10-60", "the dense side (gapB) reveals fifty entries within the SAME 500ms, got " + revealed(10));
  assert(T.currentHighlightViewEntries.length === 3 + 1 + 50,
    "3 matches + gapA's 1 revealed entry + gapB's 50, got " + T.currentHighlightViewEntries.length);
  assert(T.contextAutoRanges.length === 2, "sanity: one auto-tracked range per gap from this jump");

  assert(stepFillers().length === 1 && stepFillers()[0].gapStart === 1 && stepFillers()[0].from === 7 && stepFillers()[0].to === 8,
    "gapA gets exactly one 'Show more' step, revealing exactly 1 entry (clamped to at least one) — the sparse side's variable, data-dependent step size, got " + JSON.stringify(stepFillers()));
  assert(gapFillers().some(x => x.gapStart === 1 && x.from === 1 && x.to === 8),
    "gapA's own remaining stretch is 7 entries (1..8), tracked by the unit-agnostic '… N lines' row");
  assert(gapFillers().some(x => x.gapStart === 10 && x.from === 60 && x.to === 70),
    "gapB's remaining stretch is 10 entries (60..70) — its own step would reveal all of them, so it's correctly withheld, leaving only '… N lines' there");

  // --- gapA's "Show more" row: labelled with the fixed duration, not a count ---
  showTop(); // gapA's rows sit right after "hit0", near the top of the (still small) rendered window
  const gapAMore = moreRows()[0];
  assert(gapAMore && gapAMore.textContent.includes("500ms"),
    "gapA's 'Show more' row is labelled with the configured DURATION, not the 1-entry count it happens to reveal here, got " + JSON.stringify(moreRows().map(e => e.textContent)));
  assert(gapAMore.title.includes("500ms"), "...and its tooltip reads the duration too, got " + JSON.stringify(gapAMore.title));
  const gapAGapRow = fillers().find(el => !el.classList.contains("ctx-show-more"));
  assert(gapAGapRow && gapAGapRow.textContent.includes("7") && !gapAGapRow.textContent.includes("ms"),
    "gapA's '… N lines' row is still a plain entry count in time mode, got " + JSON.stringify(gapAGapRow && gapAGapRow.textContent));

  // --- clicking gapA's step reveals exactly the clamped-to-one-entry step -
  fireClick(gapAMore, w);
  assert(revealed(1) === "7-9",
    "gapA's step reveals exactly one more entry — the raw 500ms boundary landed short of gapA's own remaining stretch, so the 'reveal at least one entry' clamp is what makes this step do anything at all, got " + revealed(1));

  // --- (c) jumping again takes back the PREVIOUS jump's own window, but --
  //     never a hand-revealed range sitting in a DIFFERENT gap ------------
  const hit2Idx = T.currentHighlightViewEntries.findIndex(e => e.id === f.entries[70].id);
  w.setHighlightScroll(T.highlightRowOffsets[hit2Idx]); // scroll "hit2" into the virtualized window
  w.renderHighlightVisibleRows();
  fireClick(matchRow(f.entries[70].id), w); // "hit2", the last entry: a one-sided jump
  assert(revealed(1) === "7-9",
    "gapA's HAND-revealed range survives the new jump untouched — forgetAutoRangesForGap made the whole gap hand-owned the moment its step was clicked, got " + revealed(1));
  assert(revealed(10) === "59-70",
    "gapB's own auto-revealed window moved with the jump instead of piling up: the previous one (10-60) was taken back and replaced by the 11 entries within 500ms of the new target, got " + revealed(10));
});
