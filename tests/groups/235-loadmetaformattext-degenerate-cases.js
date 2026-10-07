// GROUP 235 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 235 — loadMetaFormatText degenerate cases: only one target
   format's grammar actually present (no merge needed), and neither
   target's grammar present at all (falls back to the default format
   rather than hard-failing).
   ============================================================ */
group(235);
await withApp(async (w, d, T) => {
  section("235a. loadMetaFormatText: only one target format ever matches — no merge, a plain single-format load instead");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = "2025-01-02 09:00:00.000 [] INFO  app.X  - only app lines here\n2025-01-02 09:00:01.000 [] INFO  app.X  - still app";
  const result = await w.loadMetaFormatText("app-only.log", text, metaFmt);
  assert(!result.merged, "a single-grammar file never goes through mergeFiles");
  assert(result.formatId === "fmt-demo-app", "parsed directly under the one format that actually matched");
  assert(result.entries.length === 2, "both lines parsed as entries, got " + result.entries.length);
}, { demoFormats: true });

await withApp(async (w, d, T) => {
  section("235b. loadMetaFormatText: nothing matches either target — falls back to the default format instead of hard-failing");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = "this line matches neither grammar\nnor does this one";
  const result = await w.loadMetaFormatText("nomatch.log", text, metaFmt);
  assert(result.formatId === "fmt-default", "falls back to the builtin default format rather than throwing");
  assert(T.state.rootIds.length === 1, "still produces exactly one (fallback) node, not zero, and not a crash");
}, { demoFormats: true });
