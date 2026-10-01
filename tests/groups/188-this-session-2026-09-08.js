// GROUP 188 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 188 — this session (2026-09-08), person-requested: "Extract"'s
   enabled state now additionally depends on whether the current row's
   message actually has something extractable — reusing the exact same
   buildNumericExtractPattern() the button's own click handler
   (extractMessageFilter) already builds its pattern with. A message with
   no numeric/time content would only ever produce a literal-text filter
   node from "Extract" (indistinguishable from what "New"/manual entry
   already does), so the button disables instead. "Message" is UNCHANGED —
   it still enables for any single-row selection regardless of content,
   since its dialog lets the person adjust the pattern before committing.
   ============================================================ */
group(188);
await withApp(async (w, d, T) => {
  section("188. Extract disables when the selected row's message has nothing extractable; Message doesn't care");

  // Built by hand, not makeLog() — makeLog always appends " " + i to every
  // message, which is itself numeric content and would defeat this test.
  const noDigitsLog = '2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"no numbers in here at all"\n';
  const f = await w.addFile("a.log", noDigitsLog, () => {});
  T.state.activeId = f.id;
  w.render();

  const extractBtn = d.querySelector('[data-row-action="extractMessage"]');
  const messageBtn = d.querySelector('[data-row-action="filterForMessage"]');

  assert(w.buildNumericExtractPattern(f.entries[0].message) === null, "sanity: a purely non-numeric message yields no wildcard pattern");

  w.selectEntry(f.entries[0].id);
  assert(messageBtn.disabled === false, "Message enables regardless of extractable content");
  assert(extractBtn.disabled === true, "Extract disables when the row's message has no numeric/time content to wildcard");

  // A message that DOES contain something extractable (the trailing " 0"
  // index makeLog always appends) enables Extract again.
  const f2 = await w.addFile("b.log", makeLog(0, 2), () => {});
  T.state.activeId = f2.id;
  w.render();
  w.selectEntry(f2.entries[0].id);
  assert(d.querySelector('[data-row-action="extractMessage"]').disabled === false,
    "Extract re-enables once the selected row's message has extractable numeric content");

  // Extract's own pattern-building is untouched — still identical to what a
  // disabled-state check reuses (buildNumericExtractPattern), so a
  // successful click still produces the same [*:int]-style pattern.
  fireClick(d.querySelector('[data-row-action="extractMessage"]'), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "text" && /\[\*:(int|float|time)\]/.test(created.value),
    "clicking the now-enabled Extract still creates the expected wildcard pattern, got " + JSON.stringify(created.value));
});
