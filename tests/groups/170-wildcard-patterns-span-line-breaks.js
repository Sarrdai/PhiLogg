// GROUP 170 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 170 — Wildcard/[*:...] patterns span line breaks
   Origin: this session (2026-09-04), person-reported: a "text" filter's
   [*]/[*:...] wildcard pattern (compileExtractPattern) never matched a
   message containing a literal newline (a stack trace, a wrapped line),
   because JS `.`/`.*` doesn't match "\n" without the "s" (dotAll) flag.
   Fixed by adding "s" to every place that compiles/recompiles that regex:
   compileExtractPattern itself, textFilterMatchSpec, both
   getEntriesUncached "text" branches, evaluateLiveMatch (filter popup live
   count), and updateFilterPatternPreview.
   ============================================================ */
group(170);
await withApp(async (w, d, T) => {
  section("170. [*]/[*:...] wildcard patterns match across an embedded newline");

  const f = await w.addFile("multiline170.log",
    `2024-01-15 10:00:00,000\tERROR\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"boom"\n` +
    `  at Foo.Bar()\n  at Foo.Baz()\n` +
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"next entry"\n`,
    () => {});
  assert(f.entries[0].message.includes("\n"), "fixture entry 0's message really does contain a newline");
  assert(f.entries.length === 2, "fixture has 2 header lines, got " + f.entries.length);

  const spec = w.compileExtractPattern("boom[*]Foo.Baz()");
  assert(spec && spec.regex.flags.includes("s"), "compileExtractPattern's own regex carries the dotAll flag");
  assert(spec.regex.test(f.entries[0].message), "the compiled regex itself matches across the embedded newline");

  T.state.activeId = f.id;
  w.render();
  const wildcardNode = w.createFilterNode(f.id, "text", "boom[*]Foo.Baz()");
  w.invalidateAllCaches();
  assert(w.getEntries(wildcardNode.id).length === 1, "the [*] wildcard filter matches the multi-line entry (getEntriesUncached)");

  const spec170 = w.textFilterMatchSpec(wildcardNode);
  assert(spec170 && spec170.wildcardRegex.flags.includes("s"), "textFilterMatchSpec's rebuilt wildcardRegex also carries dotAll");
  assert(w.wildcardMatch(spec170.wildcardRegex, spec170.wildcardColumns, f.entries[0].message), "wildcardMatch (highlighting path) matches across the newline too");

  // Live-match count in the filter popup (evaluateLiveMatch, debounced 150ms)
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "boom[*]Foo.Baz()";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("1 matches in 2"), "live match count also finds the multi-line entry, got " + d.querySelector("#filterLiveMatch").textContent);
});
