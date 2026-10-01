// GROUP 134 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 134 — "Save" (text, wildcard-as-shape) vs "Extract" match-count
   consistency for link-derived pair entries (person-reported: switching a
   node repeatedly between filterType "extract" and "text" with the SAME
   wildcard pattern on a detached link+extract chain showed Extract's value
   table populated but Save showing zero log entries). Root cause: a link
   node's synthetic pair entry has e.raw as a non-contiguous concatenation
   of both source lines' full raw text (with metadata in between), which
   breaks a wildcard pattern spanning the " ⟶ " pair separator, while
   e.message is the clean "firstMsg ⟶ secondMsg" join. getEntries()'s
   "extract" branch already matched against e.message; textFilterMatches()'s
   wildcard-as-text branch (used by filterType "text" whose value contains
   extract tokens) incorrectly defaulted to e.raw. Fixed to use e.message,
   matching the extract branch.
   ============================================================ */
group(134);
await withApp(async (w, d, T) => {
  section("134. Save (text, wildcard pattern) vs Extract match-count consistency on link pairs");

  const log = [
    `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"Value 42"`,
    `2024-01-15 10:00:05,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Position hit"`,
  ].join("\n") + "\n";
  const f = await w.addFile("134.log", log, () => {});
  const valF = w.createFilterNode(f.id, "text", "Value");
  const posF = w.createFilterNode(f.id, "text", "Position");
  const link = w.createLinkNode(valF.id, posF.id, "after", 1);

  const pairs = w.getEntries(link.id);
  assert(pairs.length === 1, "sanity: the link produces exactly one pair entry");
  assert(pairs[0].message.includes(" ⟶ "), "sanity: the pair's message is the clean firstMsg ⟶ secondMsg join");

  const pattern = "Value [*:int] ⟶ Position [*]";
  const extractNode = w.createFilterNode(link.id, "text", pattern);
  const textNode = w.createFilterNode(link.id, "text", pattern);

  const extractCount = w.getEntries(extractNode.id).length;
  const textCount = w.getEntries(textNode.id).length;
  assert(extractCount === 1, "Extract mode matches the link-derived pair entry (value table populated)");
  assert(textCount === extractCount,
    "Save (text) mode with the SAME wildcard pattern matches the SAME entries as Extract — " +
    "person-reported inconsistency (Extract worked, Save showed no entries) is fixed, got textCount=" + textCount);
});
