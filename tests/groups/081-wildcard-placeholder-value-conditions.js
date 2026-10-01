// GROUP 81 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 81 — Wildcard placeholder value conditions
   Origin: this session (2026-08-22), person-requested (FEATURE_BACKLOG.md
   item 5, implemented differently than originally scoped there — a numeric
   condition folded INTO the existing [*:...] wildcard token instead of
   a separate filter type, and working through the existing filter/extract
   paths only, per the person's explicit instructions). Syntax:
   [*:float>=10] (single condition) or [*:int<20,>10] (","-separated
   conditions AND-ed together). A same-day follow-up (person asked "hältst
   du den [Syntax] für sinnvoll... und ich glaube es würde Sinn machen, auch
   absolut mit reinzunehmen") swapped the separator from the originally
   shipped ";" to "," (more conventional) and added an absolute-value
   variant: a "|" prefix on the operator compares |value| instead of value,
   e.g. [*:float|>=10] matches both 10 and -15. Conditions are parsed by
   compileExtractPattern onto each column as `.conditions: [{op, value,
   abs?}]` (float/int only — a condition on time/word/hex makes the whole
   pattern invalid, same "Invalid pattern" feedback path as a malformed
   regex) and checked post-match by the shared wildcardMatch() primitive,
   reused by extraction (getEntries' "extract" branch), a plain "text"
   filter carrying wildcard tokens (the "Add filter" path), and the filter
   popup's live-match count/pattern preview — so all four surfaces agree on
   what a conditioned placeholder matches. No new filter-node field: the
   condition lives inside the existing `value` pattern string, so every
   persistence carrier already threads it through untouched (CLAUDE.md's
   "Known gotchas" note doesn't apply here).
   ============================================================ */
group(81);
await withApp(async (w, d, T) => {
  section("81. Wildcard placeholder value conditions ([*:float>=10] etc.)");
  // message 0 score=0 .. message 19 score=19
  const log = makeLog(0, 20, { suffix: i => "score=" + i });
  const f = await w.addFile("a.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  /* ---------- compileExtractPattern: parsing ---------- */
  const spec1 = w.compileExtractPattern("score=[*:int>=10]");
  assert(spec1 && spec1.columns.length === 1, "single-condition pattern compiles");
  assert(JSON.stringify(spec1.columns[0].conditions) === JSON.stringify([{ op: ">=", value: 10 }]),
    "parses a single >= condition, got " + JSON.stringify(spec1 && spec1.columns[0].conditions));

  const spec2 = w.compileExtractPattern("score=[*:int<15,>=10]");
  assert(spec2 && spec2.columns[0].conditions && spec2.columns[0].conditions.length === 2,
    "parses two ','-separated conditions, got " + JSON.stringify(spec2 && spec2.columns[0].conditions));
  assert(spec2.columns[0].conditions[0].op === "<" && spec2.columns[0].conditions[0].value === 15, "first condition parsed in order");
  assert(spec2.columns[0].conditions[1].op === ">=" && spec2.columns[0].conditions[1].value === 10, "second condition parsed in order");
  assert(!spec2.columns[0].conditions[0].abs && !spec2.columns[0].conditions[1].abs, "plain conditions carry no .abs flag");

  const specPlain = w.compileExtractPattern("score=[*:int]");
  assert(specPlain.columns[0].conditions === undefined, "a bare placeholder (no condition) still has no .conditions field — backward compatible");

  assert(w.compileExtractPattern("id=[*:word>=10]") === null, "a condition on a non-numeric type (word) makes the whole pattern invalid");
  assert(w.compileExtractPattern("t=[*:time>=10]") === null, "same rejection for time");
  assert(w.compileExtractPattern("h=[*:hex>=10]") === null, "same rejection for hex");

  /* ---------- absolute-value conditions: a "|" prefix on the operator ---------- */
  const specAbs = w.compileExtractPattern("d=[*:int|>=10]");
  assert(specAbs && specAbs.columns[0].conditions.length === 1 && specAbs.columns[0].conditions[0].abs === true,
    "a '|' prefix on the operator sets .abs on the condition, got " + JSON.stringify(specAbs && specAbs.columns[0].conditions));
  assert(specAbs.columns[0].conditions[0].op === ">=" && specAbs.columns[0].conditions[0].value === 10, "the operator/value themselves parse the same regardless of the abs prefix");

  const specAbsMixed = w.compileExtractPattern("d=[*:int|>10,<=100]");
  assert(specAbsMixed.columns[0].conditions[0].abs === true && !specAbsMixed.columns[0].conditions[1].abs,
    "abs applies per-condition — a mix of abs and plain conditions in one placeholder parses correctly, got " + JSON.stringify(specAbsMixed.columns[0].conditions));

  /* ---------- extraction: only rows satisfying the condition are kept ---------- */
  const geNode = w.createFilterNode(f.id, "text", "score=[*:int>=10]");
  assert(w.getEntries(geNode.id).length === 10, "extract >=10 keeps rows 10..19, got " + w.getEntries(geNode.id).length);

  const rangeNode = w.createFilterNode(f.id, "text", "score=[*:int<15,>=10]");
  const rangeEntries = w.getEntries(rangeNode.id);
  assert(rangeEntries.length === 5, "combined </>= condition keeps only rows 10..14, got " + rangeEntries.length);
  assert(rangeEntries.every(e => { const v = +e.message.match(/score=(\d+)/)[1]; return v >= 10 && v < 15; }),
    "sanity: every kept row's score is actually in [10,15)");

  /* ---------- absolute-value matching against real signed data ---------- */
  const deltaLog = [-20, -5, 0, 5, 20]
    .map((v, i) => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"delta=${v}"`)
    .join("\n") + "\n";
  const fd = await w.addFile("d.log", deltaLog, () => {});
  const absNode = w.createFilterNode(fd.id, "text", "delta=[*:int|>=10]");
  const absEntries = w.getEntries(absNode.id);
  assert(absEntries.length === 2, "|value|>=10 matches both -20 and 20 (not the three values inside [-10,10]), got " + absEntries.length);
  assert(absEntries.every(e => Math.abs(+e.message.match(/delta=(-?\d+)/)[1]) >= 10), "sanity: every kept row's |delta| is actually >= 10");
  const nonAbsNode = w.createFilterNode(fd.id, "text", "delta=[*:int>=10]");
  assert(w.getEntries(nonAbsNode.id).length === 1, "the same threshold WITHOUT the abs prefix only matches +20 (plain >=10), got " + w.getEntries(nonAbsNode.id).length);

  /* ---------- a plain "text" filter carrying a conditioned wildcard token (the "Add filter" path) respects it too ---------- */
  const textNode = w.createFilterNode(f.id, "text", "score=[*:int>=10]");
  assert(w.getEntries(textNode.id).length === 10, "a plain text filter with a conditioned wildcard token matches the same 10 rows");

  /* ---------- table rendering: header badge + every rendered row honors the condition ---------- */
  T.state.activeId = rangeNode.id;
  w.render();
  w.applyFhView("table");
  const headerType = d.querySelector('#extractHead th[data-col="0"] .extract-col-type').textContent;
  assert(headerType.includes("int") && headerType.includes("<15") && headerType.includes("≥10"),
    "extraction table header shows the condition next to the type, got " + JSON.stringify(headerType));
  assert(T.extractRowsData.length === 5 && T.extractRowsData.every(r => { const v = +r.values[0]; return v >= 10 && v < 15; }),
    "every row actually rendered into the table satisfies the condition");

  /* ---------- post-creation pattern view chip shows the condition too ---------- */
  const chipText = d.querySelector("#extractPatternView .pattern-chip").textContent;
  assert(chipText.includes("int") && chipText.includes("<15") && chipText.includes("≥10"),
    "the pattern-view chip above the table shows the condition alongside the type, got " + JSON.stringify(chipText));

  /* ---------- table header visualizes an abs condition with a leading "|" ---------- */
  T.state.activeId = absNode.id;
  w.render();
  w.applyFhView("table");
  const absHeaderType = d.querySelector('#extractHead th[data-col="0"] .extract-col-type').textContent;
  assert(absHeaderType.includes("|≥10"), "an abs condition's header badge is prefixed with '|', got " + JSON.stringify(absHeaderType));

  /* ---------- filter popup: live-match count reflects the condition ---------- */
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "score=[*:int>=15]";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("5 matches in 20"),
    "live-match count only counts rows satisfying the condition (15..19), got " + d.querySelector("#filterLiveMatch").textContent);

  /* ---------- pattern preview: the sample match is one where the condition actually holds, and shows a visible condition badge ---------- */
  const preview = d.querySelector("#filterPatternPreview");
  const span = preview.querySelector(".preview-value-span");
  assert(span && span.textContent === "15",
    "the preview picks the first entry satisfying the CONDITION (score=15), not just the first structural regex match (score=0), got " + (span && span.textContent));
  const condBadge = preview.querySelector(".preview-value-cond");
  assert(condBadge && condBadge.textContent === "≥15", "the preview shows a visible badge with the condition, got " + (condBadge && condBadge.textContent));

  // An unsatisfiable condition (no row has score >= 1000) shows the
  // "no matching sample" state, same as a pattern that structurally never matches.
  filterInput.value = "score=[*:int>=1000]";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(preview.classList.contains("preview-empty") && preview.textContent.includes("No matching sample"),
    "an unsatisfiable condition falls back to the 'no matching sample' preview state, not a structural-only match");
  w.closeFilterPopup();

  /* ---------- pattern preview against signed data: abs badge + a NEGATIVE sample ---------- */
  T.state.activeId = fd.id;
  w.render();
  w.openFilterPopup();
  const filterInput2 = d.querySelector("#filterInput");
  filterInput2.value = "delta=[*:int|>=10]";
  fireInput(filterInput2, w);
  await new Promise(r => setTimeout(r, 200));
  const absSpan = preview.querySelector(".preview-value-span");
  assert(absSpan && absSpan.textContent === "-20",
    "the preview's first sample for an abs condition can be a NEGATIVE value (-20, the first entry in log order satisfying |delta|>=10), got " + (absSpan && absSpan.textContent));
  const absCondBadge = preview.querySelector(".preview-value-cond");
  assert(absCondBadge && absCondBadge.textContent === "|≥10", "the preview's condition badge is prefixed with '|' for an abs condition, got " + (absCondBadge && absCondBadge.textContent));
  w.closeFilterPopup();
});
