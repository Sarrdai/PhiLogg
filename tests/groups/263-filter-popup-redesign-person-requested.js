// GROUP 263 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 263 — Filter popup redesign (person-requested, 2026-09-23, from a
   mockup screenshot; the app's own styling kept): no "Filter on:" header
   with target-chain pills any more — an inline "in <parent>" hint inside
   the input box instead (first 15 characters of the direct parent's name);
   a Text/Regex segmented switch replaces the "Interpret input as regex"
   pill; rows captioned and ordered Insert / Syntax (Text|Regex, Match
   case, Whole word, Exclude (NOT)) / Search in; and a live result summary
   (big count + "matches in N" + "captures: …", a match-over-time
   histogram, up to three sample rows as a table with the hit marked).
   The histogram uses the timeline minimap's level colors: per bin, the
   highest-severity hit's level wins (follow-up, same day).
   Follow-ups, same day (person-requested): only the exclusive Text/Regex
   choice takes #fhTabs' segmented view-tab look; the independent on/off
   options (Match case/Whole word/Exclude (NOT), each Search in column) are
   standalone label-only .label-toggle items with the .icon-toggle status
   bar (so a single-label toggle doesn't read as a button) — not boxed into
   a shared control; the Insert chips, being actions, got the app's framed
   button look.
   ============================================================ */
group(263);
await withApp(async (w, d, T) => {
  section("263. Filter popup: scope hint, Text/Regex switch, captioned rows, live result summary");

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const longParent = w.createFilterNode(f.id, "text", "message 1"); // name “message 1” (11 chars)
  const veryLong = w.createFilterNode(f.id, "text", "message"); // matches all 20
  veryLong.name = "AVeryLongParentNodeName";
  w.render();

  // --- Scope hint: max 15 characters of the DIRECT parent's name ---
  T.state.activeId = veryLong.id;
  w.openFilterPopup();
  const hint = d.querySelector("#filterScopeHint");
  assert(hint.closest(".filter-input-wrap") && hint.closest(".filter-input-wrap").contains(d.querySelector("#filterInput")),
    "the scope hint sits inside the input's box, next to the input");
  assert(hint.textContent === "in AVeryLongParent…", "a long parent name is cut to its first 15 characters (+ ellipsis), got " + JSON.stringify(hint.textContent));
  assert(hint.querySelector("b").textContent.replace("…", "").length === 15, "exactly 15 characters of the name are shown");
  assert(hint.title.includes("AVeryLongParentNodeName"), "the full name is the tooltip");
  w.closeFilterPopup();
  T.state.activeId = longParent.id;
  w.openFilterPopup();
  assert(hint.textContent === "in " + longParent.name, "a short name is shown whole, only the direct parent (no chain), got " + hint.textContent);
  assert(d.querySelector("#filterPopupLabel") === null && d.querySelector("#filterTargetChain") === null && d.querySelector(".crumb") === null,
    "no 'Filter on' header / breadcrumb pills any more");
  w.closeFilterPopup();

  // --- Captioned rows, order and naming ---
  const labels = [...d.querySelectorAll("#filterForm .filter-section-label")].map(l => l.textContent);
  assert(JSON.stringify(labels) === JSON.stringify(["Insert", "Syntax", "Search in"]), "rows are captioned Insert / Syntax / Search in, in that order, got " + JSON.stringify(labels));
  const syntaxRow = d.querySelector(".filter-settings-row");
  const syntaxOrder = [...syntaxRow.querySelectorAll(".view-tab, .label-toggle")].map(x => x.textContent);
  assert(JSON.stringify(syntaxOrder) === JSON.stringify(["Text", "Regex", "Match case", "Whole word", "Exclude (NOT)"]),
    "the Syntax row reads Text | Regex, Match case, Whole word, Exclude (NOT), got " + JSON.stringify(syntaxOrder));
  assert(d.querySelector("#filterRegexCheckbox") === null, "the old 'Interpret input as regex' pill is gone");

  // --- Exclusive choice vs. independent on/off (follow-ups, same day) ---
  const groups = [...d.querySelectorAll("#filterForm .view-tabs")];
  assert(groups.length === 1 && groups[0].contains(d.querySelector("#filterSyntaxText")) && groups[0].contains(d.querySelector("#filterSyntaxRegex")) && groups[0].children.length === 2,
    "only the exclusive Text/Regex choice is a segmented view-tabs group");
  ["filterCaseCheckbox", "filterWholeWordCheckbox", "filterInvertCheckbox"].forEach(id => {
    const t = d.getElementById(id);
    assert(t.classList.contains("label-toggle") && !t.classList.contains("view-tab") && !t.classList.contains("pill-toggle") && !t.closest(".view-tabs"),
      "#" + id + " is a standalone label-only toggle, not part of a shared segmented control");
  });
  assert(d.querySelector("#filterInvertCheckbox").classList.contains("label-toggle-danger"), "NOT keeps its red accent");
  assert(!d.querySelector("#filterPopup label"), "no separate captions — each toggle is its own single label");
  const css = d.querySelector("style").textContent;
  assert(/\.label-toggle::after\{[^}]*height:2px/.test(css) && css.includes('.label-toggle.active::after, .label-toggle[aria-checked="true"]::after{background:var(--accent-strong);}'),
    "single-label toggles carry the status bar (the .icon-toggle rule) so they don't read as buttons");
  assert(/\.label-toggle\{[^}]*background:none; border:none/.test(css), "a label toggle has no button chrome at rest");
  const tokenChip = d.querySelector(".token-chip");
  assert(!tokenChip.classList.contains("view-tab") && !tokenChip.classList.contains("label-toggle"), "Insert chips are actions and keep a button look, not the toggle look");

  // --- Text/Regex switch drives regex mode and round-trips through edit ---
  T.state.activeId = f.id;
  w.openFilterPopup();
  const colChips = [...d.querySelectorAll("#filterColumnChipGroup .column-chip")];
  assert(colChips.length > 0 && colChips.every(c => c.classList.contains("label-toggle") && !c.closest(".view-tabs") && c.getAttribute("aria-pressed") === "false"),
    "Search in columns are standalone label-only toggles, same look as the option switches");
  fireClick(colChips[0], w);
  assert(colChips[0].classList.contains("active") && colChips[0].getAttribute("aria-pressed") === "true", "clicking a column toggles it on (.active + aria-pressed)");
  fireClick(colChips[0], w);
  const caseT = d.querySelector("#filterCaseCheckbox");
  fireClick(caseT, w);
  assert(pillChecked(caseT) && caseT.classList.contains("on"), "clicking the Match case label itself switches it on (pill-toggle state protocol)");
  fireClick(caseT, w);
  const input = d.querySelector("#filterInput");
  const textBtn = d.querySelector("#filterSyntaxText"), regexBtn = d.querySelector("#filterSyntaxRegex");
  assert(textBtn.classList.contains("active") && textBtn.getAttribute("aria-pressed") === "true" && !regexBtn.classList.contains("active"), "Text is active by default");
  fireClick(regexBtn, w);
  assert(regexBtn.classList.contains("active") && !textBtn.classList.contains("active") && regexBtn.getAttribute("aria-pressed") === "true", "clicking Regex switches the segmented control");
  input.value = "message 1\\d";
  fireInput(input, w);
  fireSubmit(d.querySelector("#filterForm"), w);
  const reNode = T.state.nodes[T.state.activeId];
  assert(reNode.isRegex === true && w.getEntries(reNode.id).length === 10, "submitting in Regex mode creates a regex filter (message 10..19), got " + w.getEntries(reNode.id).length);
  w.openEditFilterPopup(reNode.id);
  assert(regexBtn.classList.contains("active"), "edit mode pre-selects Regex for a regex node");
  w.closeFilterPopup();
  T.state.activeId = f.id;
  w.openFilterPopup();
  assert(textBtn.classList.contains("active"), "a fresh popup resets to Text");

  // --- Live result summary ---
  assert(d.querySelector("#filterResults").classList.contains("hidden"), "no summary while the input is empty");
  input.value = "message 1";
  fireInput(input, w);
  await sleep(200);
  assert(!d.querySelector("#filterResults").classList.contains("hidden"), "the summary shows once something is typed");
  assert(d.querySelector(".filter-live-count").textContent === "11", "big count = matches (message 1, 10..19), got " + d.querySelector(".filter-live-count").textContent);
  assert(d.querySelector("#filterLiveMatch").textContent.includes("11 matches in 20"), "meta line reads 'matches in <base rows>', got " + d.querySelector("#filterLiveMatch").textContent);
  assert(!d.querySelector(".filter-live-captures"), "a plain text search has no captures line");
  const rows = [...d.querySelectorAll("#filterResultsSamples .filter-sample-row")];
  assert(rows.length === 3, "at most three sample rows, got " + rows.length);
  assert(rows[0].querySelector(".filter-sample-time").textContent === "10:00:01.000", "sample time is HH:mm:ss.SSS, got " + rows[0].querySelector(".filter-sample-time").textContent);
  assert(rows[0].querySelector(".filter-sample-hit").textContent === "message 1", "the hit is marked in the sample message");
  assert(rows[0].querySelector(".col-bar") && rows[0].classList.contains("lvl-info"), "each sample row carries its level bar (lvl-* class + .col-bar)");
  const bars = [...d.querySelectorAll("#filterResultsMinimap rect")];
  assert(!d.querySelector("#filterResultsMinimap").classList.contains("hidden") && bars.length > 0, "the match histogram renders bars");
  assert(bars.reduce((n, r) => n + Number(r.querySelector("title").textContent), 0) === 11, "histogram buckets add up to the match count");
  // Level colors, like the timeline minimap: hits 1 and 11..19 are INFO,
  // 10 and 15 ERROR (makeLog), each alone in its bucket here.
  assert(bars.filter(r => r.classList.contains("minimap-lvl-error")).length === 2 && bars.filter(r => r.classList.contains("minimap-lvl-info")).length === 9,
    "each histogram bar carries its level's minimap-lvl-* class, got " + bars.map(r => r.getAttribute("class")).join(","));

  // NOT: kept rows, no hit to mark
  fireClick(d.querySelector("#filterInvertCheckbox"), w);
  await sleep(200);
  assert(d.querySelector("#filterLiveMatch").textContent.includes("9 kept (NOT) in 20"), "NOT counts the kept rows, got " + d.querySelector("#filterLiveMatch").textContent);
  assert(!d.querySelector(".filter-sample-hit"), "NOT samples have nothing to mark");
  fireClick(d.querySelector("#filterInvertCheckbox"), w);

  // Wildcard pattern: captures line
  input.value = "message [*:int]";
  fireInput(input, w);
  await sleep(200);
  assert(d.querySelector(".filter-live-captures").textContent === "captures: message (int)", "a wildcard pattern lists its captures, got " + (d.querySelector(".filter-live-captures") || {}).textContent);

  // Highest level wins per bin: INFO, WARN and DEBUG hits sharing one
  // timestamp land in one bucket, which is drawn WARN.
  const binLines = [["INFO", "0"], ["WARN", "0"], ["DEBUG", "0"], ["DEBUG", "9"]].map(([lvl, sec], i) =>
    `2024-01-15 10:00:0${sec},000\t${lvl}\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"hit ${i}"`);
  const bf = await w.addFile("bins.log", binLines.join("\n") + "\n", () => {});
  w.closeFilterPopup();
  T.state.activeId = bf.id;
  w.openFilterPopup();
  input.value = "hit";
  fireInput(input, w);
  await sleep(200);
  const binBars = [...d.querySelectorAll("#filterResultsMinimap rect")];
  assert(binBars.length === 2 && binBars[0].getAttribute("class") === "minimap-lvl-warn" && binBars[0].querySelector("title").textContent === "3",
    "a bin holding INFO+WARN+DEBUG hits is colored WARN (highest level wins), got " + binBars.map(r => r.getAttribute("class") + "/" + r.textContent).join(","));
  assert(binBars[1].getAttribute("class") === "minimap-lvl-debug", "a DEBUG-only bin stays DEBUG");

  // No hits: warn state, no histogram, no samples
  input.value = "nothing matches this";
  fireInput(input, w);
  await sleep(200);
  assert(d.querySelector(".filter-live-count").textContent === "0" && d.querySelector("#filterLiveMatch").classList.contains("warn"), "zero matches shows 0 in the warn state");
  assert(d.querySelector("#filterResultsMinimap").classList.contains("hidden") && !d.querySelector(".filter-sample-row"), "no histogram / sample rows without hits");
});
