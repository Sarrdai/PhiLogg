// GROUP 1 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 1 — Parsing & basic load
   Origin: initial build (pre-dates the earliest session in project memory);
   re-verified here since every other group depends on it.
   ============================================================ */
group(1);
await withApp(async (w, d, T) => {
  section("1. Parsing & basic load");
  const multiline =
    `2024-01-15 10:00:00,000\tERROR\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"boom"\n` +
    `  at Foo.Bar()\n  at Foo.Baz()\n` +
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"next entry"\n`;
  const f = await w.addFile("multiline.log", multiline, () => {});
  assert(f.entries.length === 2, "two header lines parsed into two entries, got " + f.entries.length);
  assert(f.entries[0].message.includes("at Foo.Bar()") && f.entries[0].message.includes("at Foo.Baz()"),
    "non-header continuation lines appended to the previous entry's message (stack trace handling)");
  assert(f.entries[0].level === "ERROR" && f.entries[1].level === "INFO", "level parsed correctly per entry");
  assert(f.entries[0].location === "C:\\src\\Foo.cs line 1", "location kept in full (path + line), got " + f.entries[0].location);
  assert(f.entries[0].method === "DoWork", "method extracted from [brackets]");
  assert(typeof f.entries[0].ts === "number" && !Number.isNaN(f.entries[0].ts), "timestamp parsed to a valid number");
  assert(T.state.rootIds.includes(f.id), "file registered as a root node");
  assert(T.entryIndex[f.entries[0].id] === f.entries[0], "entries registered in the global entryIndex");
});
