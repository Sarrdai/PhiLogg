// GROUP 39 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 39 — Filter popup: target-chain visualization + wildcard-as-filter
   "text" matching semantics (this session, person-requested)
   Origin: this session. A [*:...]/[*] wildcard pattern used to ALWAYS
   become an "extract" filterType (building an extraction table) the
   moment it was typed — there was no way to use the wildcard shorthand
   just to constrain a plain filter (e.g. "temp=[*:float]" meaning
   "there's a float here") without also getting a table. A "text" filter
   can now carry wildcard tokens in its value, matched via the SAME regex
   extraction would use but only tested (not captured) — see
   getEntries/textFilterMatches's wildcardRegex parameter — while a real
   "extract" node is completely unaffected. (Which of the two a wildcard
   pattern actually becomes is decided purely by which filter-popup button
   gets clicked, "Add filter" vs. "Extract" — see Group 41 for that
   two-button redesign's own coverage; an earlier, short-lived version of
   this feature used an "Extract values" checkbox instead, superseded the
   same session.) Also: the old "Filter on “X”:" plain-text label was
   replaced with #filterTargetChain, the same .crumb/.crumb-sep pill-chain
   visualization #breadcrumb uses; the input got its own row (superseded
   the SAME session by a fuller section reorg — see Group 40 — so the
   exact wrapper class checked below now points at that reorg's
   .filter-input-section instead of the short-lived .filter-input-row);
   and the "Werte extrahieren: [*:float] ..." #filterHint row was
   removed (the token chips already insert those same wildcards directly).
   ============================================================ */
group(39);
await withApp(async (w, d, T) => {
  section("39. Filter popup: scope hint + wildcard-as-filter matching semantics");

  assert(d.querySelector("#filterHint") === null, "the old 'Werte extrahieren:' hint row is gone — the token chips already insert wildcards directly");
  assert(d.querySelector(".filter-input-section #filterInput") !== null, "the filter input lives in its own input section (see Group 40 for the fuller section-reorg coverage)");

  // --- Scope hint (replaced the "Filter on:" header + target-chain pills,
  // 2026-09-23 — see Group 263 for the full popup-redesign coverage) ---
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const parentFilter = w.createFilterNode(f.id, "text", "message"); // matches all 5 rows
  w.render();
  w.openFilterPopup();
  assert(d.querySelector("#filterPopupLabel") === null && d.querySelector("#filterTargetChain") === null,
    "the 'Filter on:' label and its pill chain are gone");
  assert(d.querySelector("#filterScopeHint").textContent === "in " + parentFilter.name.slice(0, 15) + (parentFilter.name.length > 15 ? "\u2026" : ""),
    "create mode's scope hint names the active node this filter will be added under, got " + d.querySelector("#filterScopeHint").textContent);

  w.openEditFilterPopup(parentFilter.id);
  assert(d.querySelector("#filterScopeHint").textContent === "in " + f.name,
    "edit mode's scope hint names the edited filter's PARENT (whose entries the value change re-filters), not the filter being edited itself");
  w.closeFilterPopup();

  // --- Wildcard-as-filter "text" matching: direct-API sanity for the two
  // filtering shapes a wildcard pattern can produce ---
  const wLines = [
    `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"temp=23.5 ok"`,
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"temp=n/a error"`,
    `2024-01-15 10:00:02,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"TEMP=99.1 ok"`,
    `2024-01-15 10:00:03,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"unrelated line"`,
  ];
  const wf = await w.addFile("wild.log", wLines.join("\n") + "\n", () => {});

  const wildcardAsFilter = w.createFilterNode(wf.id, "text", "temp=[*:float]");
  w.invalidateAllCaches();
  const wafEntries = w.getEntries(wildcardAsFilter.id);
  assert(wafEntries.length === 2 && [wf.entries[0].id, wf.entries[2].id].every(id => wafEntries.some(e => e.id === id)),
    "a 'text' filter whose value contains [*:...] tokens matches via the wildcard's regex shape (case-insensitive by default) instead of a literal substring, got " + wafEntries.length);

  const wildcardCaseSensitive = w.createFilterNode(wf.id, "text", "temp=[*:float]", false, null, true);
  w.invalidateAllCaches();
  const wcsEntries = w.getEntries(wildcardCaseSensitive.id);
  assert(wcsEntries.length === 1 && wcsEntries[0].id === wf.entries[0].id,
    "case-sensitive wildcard-as-filter matches only the exact-case 'temp=' occurrence, not 'TEMP='");

  const wildcardInverted = w.createFilterNode(wf.id, "text", "temp=[*:float]", true);
  w.invalidateAllCaches();
  const invEntries = w.getEntries(wildcardInverted.id);
  assert(invEntries.length === 2 && [wf.entries[1].id, wf.entries[3].id].every(id => invEntries.some(e => e.id === id)),
    "NOT works normally on a wildcard-as-filter 'text' node (unlike a real 'extract' node, where NOT is unavailable)");

  const anotherWildcardNode = w.createFilterNode(wf.id, "text", "temp=[*:float]");
  w.invalidateAllCaches();
  assert(w.getEntries(anotherWildcardNode.id).length === 2, "a second independently-created wildcard 'text' node matches the same way — there is no separate 'extract' filterType to diverge from (this session's filterType merge)");
});
