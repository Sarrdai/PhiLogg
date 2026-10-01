// GROUP 239 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 239 — the SSS date-token's arbitrary-digit-count fix
   (DATE_TOKEN_FRAG/parseTimestampGeneric, a prerequisite for format B's
   6-digit fractional seconds) and the 3 demo formats loadFormatConfig
   seeds for FEATURE_BACKLOG.md #81's reference case.
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
});

await withApp(async (w, d, T) => {
  section("239b. loadFormatConfig seeds the 3 concrete formats from FEATURE_BACKLOG.md #81's reference case, idempotently, non-builtin, no FormatRule");
  await waitForFormatConfig(T);
  const app = T.state.logFormats.find(f => f.id === "fmt-demo-app");
  const syslog = T.state.logFormats.find(f => f.id === "fmt-demo-syslog");
  const meta = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  assert(app && app.mode === "regex" && !app.builtin, "the app-log format is seeded, regex mode, not builtin (freely editable/deletable)");
  assert(syslog && syslog.mode === "regex" && !syslog.builtin, "the syslog format is seeded, regex mode, not builtin");
  assert(meta && meta.mode === "meta" && !meta.builtin, "the meta-format is seeded, meta mode, not builtin");
  assert(meta.targetFormatIds.join(",") === "fmt-demo-app,fmt-demo-syslog", "the meta-format targets the other two, in order, got " + meta.targetFormatIds.join(","));
  assert(!T.state.formatRules.some(r => r.formatId === "fmt-demo-app" || r.formatId === "fmt-demo-syslog" || r.formatId === "fmt-demo-app-syslog-meta"),
    "none of the 3 seeded formats has a FormatRule (filename glob) — they stay dormant until the person adds one by hand");

  // Idempotency: a second loadFormatConfig() call (simulating a second boot
  // against the same store) must not duplicate the seeded records.
  await w.loadFormatConfig();
  assert(T.state.logFormats.filter(f => f.id === "fmt-demo-app").length === 1, "re-seeding is idempotent — no duplicate app-log format");
  assert(T.state.logFormats.filter(f => f.id === "fmt-demo-app-syslog-meta").length === 1, "...nor duplicate meta-format");
});
