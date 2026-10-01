// GROUP 171 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 171 — "Filter for this message" survives a multi-line message
   Origin: this session (2026-09-04), person-reported follow-up to Group
   170: even with the dotAll fix, "Filter for this ___" still didn't find
   the multi-line message it was built from, because #filterInput is a
   single-line <input> — the browser's own value-sanitization algorithm
   silently strips "\r"/"\n" the instant openFilterForEntryColumn assigns
   a pattern containing one to filterInput.value, corrupting the pattern
   before it's ever submitted. collapseNewlinesToWildcard() now replaces
   each newline with the bare [*] token (which, since Group 170, spans a
   newline) before it reaches the input.
   ============================================================ */
group(171);
await withApp(async (w, d, T) => {
  section("171. 'Filter for this message' turns an embedded newline into [*] instead of losing it");

  const f = await w.addFile("multiline171.log",
    `2024-01-15 10:00:00,000\tERROR\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"boom"\n` +
    `  at Foo.Bar()\n  at Foo.Baz()\n` +
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"next entry"\n`,
    () => {});
  T.state.activeId = f.id;
  w.render();

  assert(w.collapseNewlinesToWildcard("boom\nat Foo.Baz()") === "boom[*]at Foo.Baz()", "collapseNewlinesToWildcard replaces a bare newline with the [*] token");
  assert(w.collapseNewlinesToWildcard("a\r\nb") === "a[*]b", "a CRLF pair collapses to a single [*] token, not two");

  fireContextMenu(d.querySelector(".log-row"), w, 50, 50);
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  const filterInput = d.querySelector("#filterInput");
  assert(!filterInput.value.includes("\n") && !filterInput.value.includes("\r"), "no raw newline ever reaches the single-line #filterInput, got " + JSON.stringify(filterInput.value));
  assert(filterInput.value === "boom[*]  at Foo.Bar()[*]  at Foo.Baz()", "each of the message's two newlines becomes its own [*] token, got " + JSON.stringify(filterInput.value));

  fireSubmit(d.querySelector("#filterForm"), w);
  w.invalidateAllCaches();
  const node = T.state.nodes[T.state.activeId];
  assert(node && node.filterType === "text" && node.value === filterInput.value, "submitting creates a plain 'text' filter node carrying that exact [*] pattern");
  assert(w.getEntries(node.id).length === 1, "the committed filter node matches the very multi-line entry it was generated from");
});
