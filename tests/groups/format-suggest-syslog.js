// GROUP format-suggest-syslog — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP format-suggest-syslog — the sample-based format suggestion on syslog
   Origin: 2026-10-07 (backlog #118). suggestPatternFromSample pinned the
   first line's <PRI> ("<135>") as literal text, so every line with another
   priority failed to match; the priority is now the LEVEL (syslog severity,
   integer level type, like the simulator's own syslog format) and wins over a
   level word elsewhere in the line.
   An offset behind the seconds (Z, +02:00, -0500, and one after a space as in
   "10:00:00.127 +0200") is the XXX token. Data: tools/log-sim syslog output
   (--ts-offset); the spaced spelling is that output with one space inserted.
   ============================================================ */
group("format-suggest-syslog");
await withApp(async (w, d, T) => {
  section("format-suggest-syslog a. one priority must not pin the pattern; the offset is XXX");
  const headerLines = (off, seed) => LOGSIM.generateToStrings({ format: "syslog", entries: 300, seed, tsOffset: off })[0].text.split("\n").filter(l => /^<\d+>/.test(l));
  for (const off of [undefined, "Z", "+02:00", "-0500"]) {
    const lines = headerLines(off, 3);
    assert(new Set(lines.map(l => l.slice(0, l.indexOf(">")))).size > 1, (off || "default") + ": the simulator writes several priorities");
    const sug = w.suggestPatternFromSample(lines[0]);
    assert(sug && sug.pattern.startsWith("<%p>1 %d"), (off || "default") + ": PRI is the level, got " + (sug && sug.pattern));
    assert(sug.tsFormat === "yyyy-MM-ddTHH:mm:ss.SSSXXX", (off || "default") + ": offset is XXX, got " + sug.tsFormat);
    const c = w.compileFormatPattern(sug.pattern, sug.tsFormat);
    assert(c.regex && lines.every(l => c.regex.test(l)), (off || "default") + ": the pattern matches every header line, " + lines.filter(l => !c.regex.test(l)).length + " fail");
    const f = w.fwzSuggestFromLines(lines);
    assert(f && lines.every(l => f.regex.test(l)), (off || "default") + ": the dialog's suggested regex matches every header line");
    assert(/\(\?<level>/.test(f.regex.source) && !/\(\?<pri>/.test(f.regex.source), (off || "default") + ": the dialog's regex captures the level, no pri column");
    const priOf = l => l.slice(1, l.indexOf(">"));
    assert(lines.every(l => f.regex.exec(l).groups.level === priOf(l)), (off || "default") + ": the captured level is each line's own PRI");
  }

  section("format-suggest-syslog b. an offset after a space is XXX, not a fraction");
  const spaced = headerLines("+02:00", 3).map(l => l.replace("T", " ").replace("+02:00", " +0200"));
  const sp = w.suggestPatternFromSample(spaced[0]);
  assert(sp && sp.tsFormat === "yyyy-MM-dd HH:mm:ss.SSS XXX", "spaced offset token, got " + (sp && sp.tsFormat));
  const spc = w.compileFormatPattern(sp.pattern, sp.tsFormat);
  assert(spc.regex && spaced.every(l => spc.regex.test(l)), "the pattern matches every line with a spaced offset");
  const spf = w.fwzSuggestFromLines(spaced);
  assert(spf && spf.tsFormat === sp.tsFormat && spaced.every(l => spf.regex.test(l)), "the dialog's suggestion agrees");

  section("format-suggest-syslog c. the format dialog: integer levels from the PRIs, differing preview levels, savable");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  fireClick(d.querySelector("#btnAddFormat"), w);
  const dlgLines = headerLines(undefined, 3).slice(0, 40);
  const codes = [...new Set(dlgLines.map(l => l.slice(1, l.indexOf(">"))))].sort((a, b) => a - b);
  fwzPaste(w, d, dlgLines.join("\n"));
  assert(T.fwz.fallbackKind === "suggestion", "the suggestion is in place");
  assert(!d.querySelector("#fwzStatus").textContent.includes("Level is required"), "no 'Level is required' hint, status: " + d.querySelector("#fwzStatus").textContent);
  const rows = [...d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)")];
  assert(rows.length === dlgLines.length, "every line is an entry, got " + rows.length);
  const badge = r => r.querySelector(".level-badge").dataset.level;
  assert(new Set(rows.map(badge)).size === codes.length && codes.length > 1, "the preview's levels differ per PRI (" + codes.join("/") + "), got " + [...new Set(rows.map(badge))].join("/"));
  const lvlRows = [...d.querySelectorAll("#formatEditLevels .format-level-row")].filter(r => r.querySelector('input[type="checkbox"]').checked).map(r => r.dataset.level);
  assert(lvlRows.join(",") === codes.join(","), "the Log levels panel holds the PRI values found, got " + lvlRows.join(","));
  assert(!d.querySelector('#fwzColumns .fwz-col-row[data-col="pri"]'), "no pri column");
  d.querySelector("#formatEditName").value = "Syslog suggested";
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.some(f => f.name === "Syslog suggested"));
  const saved = T.state.logFormats.find(f => f.name === "Syslog suggested");
  assert(saved.levelValueType === "int" && saved.levels.length === codes.length, "saved with integer levels, got " + saved.levelValueType + "/" + (saved.levels || []).length);
});
