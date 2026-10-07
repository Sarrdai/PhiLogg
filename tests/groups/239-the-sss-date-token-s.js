// GROUP 239 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 239 — the SSS date-token's arbitrary-digit-count fix
   (DATE_TOKEN_FRAG/parseTimestampGeneric, a prerequisite for format B's
   6-digit fractional seconds) and that the 3 former demo seeds no longer
   exist in the page (they are examples/formats files now).
   ============================================================ */
group(239);
await withApp(async (w, d, T) => {
  section("239a. parseTimestampGeneric: a fraction-of-a-second capture of any digit count normalizes to milliseconds, not a literal ms value");
  const fmt3 = w.compileDateFormat("yyyy-MM-dd HH:mm:ss.SSS");
  const t3 = w.parseTimestampGeneric("2025-01-02 09:15:06.711", fmt3);
  assert(new Date(t3).getMilliseconds() === 711, "unchanged behavior for a 3-digit fraction (the pre-existing case), got " + new Date(t3).getMilliseconds());

  const fmt1 = w.compileDateFormat("yyyy-MM-dd HH:mm:ss.SSS");
  const t1 = w.parseTimestampGeneric("2025-01-02 09:15:06.7", fmt1);
  assert(new Date(t1).getMilliseconds() === 700, "a shorter, 1-digit fraction is right-padded (.7 means .700s, not 7ms), got " + new Date(t1).getMilliseconds());

  const fmt6 = w.compileDateFormat("yyyy-MM-ddTHH:mm:ss.SSS");
  const t6 = w.parseTimestampGeneric("2025-01-02T09:15:06.711324", fmt6);
  assert(!isNaN(t6), "a 6-digit (microsecond) fraction now matches at all — used to fail outright (SSS was hardcoded to 1-3 digits)");
  assert(new Date(t6).getMilliseconds() === 711, "...and truncates to millisecond resolution correctly (711324us -> 711ms), not literal 711324ms (which would overflow ~11 minutes into the wrong second), got " + new Date(t6).getMilliseconds());
  assert(new Date(t6).getSeconds() === 6, "sanity: the overflow bug this fixes would have pushed this into a different second entirely, got seconds=" + new Date(t6).getSeconds());
}, { demoFormats: true });

await withApp(async (w, d, T) => {
  section("239b. The old demo seeds are gone from the HTML: a fresh boot has only the builtin default, a reboot re-seeds nothing (they are provided files now, GROUP provided-formats)");
  await waitForFormatConfig(T);
  assert(T.state.logFormats.map(f => f.id).join(",") === "fmt-default", "only fmt-default exists on a fresh boot, got " + T.state.logFormats.map(f => f.id).join(","));
  assert(!("DEMO_SEED_FORMATS" in w), "no DEMO_SEED_FORMATS left in the page");
  await w.loadFormatConfig();
  assert(T.state.logFormats.length === 1 && T.state.formatRules.length === 0, "a second loadFormatConfig seeds nothing either");
});
