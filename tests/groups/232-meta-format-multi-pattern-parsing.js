// GROUP 232 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 232 — Meta-format multi-pattern parsing (FEATURE_BACKLOG.md #81):
   splitTextByMetaFormat's line classification, against the real reference
   sample (demo_log_format_sample.log, person-supplied this session) mixing
   a log4net-style app grammar (format A, DEMO_APP_FORMAT) and RFC 5424
   syslog (format B, DEMO_SYSLOG_FORMAT) line-by-line, plus every
   continuation-line (F-line) shape, blank-line-only separators, and an
   out-of-chronological-order syslog block — then loadMetaFormatText end to
   end (split -> per-target addFile -> auto-merge via the unmodified
   mergeFiles).
   ============================================================ */
group(232);

await withApp(async (w, d, T) => {
  section("232a. splitTextByMetaFormat classifies the reference sample's lines into the right per-grammar stream");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  assert(metaFmt && metaFmt.mode === "meta" && metaFmt.targetFormatIds.length === 2, "sanity: the seeded meta-format exists with its 2 targets");

  const streams = w.splitTextByMetaFormat(META_SAMPLE_TEXT, metaFmt);
  assert(streams.length === 2, "both grammars are present in the sample, so 2 streams come out, got " + streams.length);
  const appStream = streams.find(s => s.formatId === "fmt-demo-app");
  const syslogStream = streams.find(s => s.formatId === "fmt-demo-syslog");
  assert(appStream && syslogStream, "one stream per target format");

  const appLines = appStream.text.split("\n");
  const syslogLines = syslogStream.text.split("\n");
  assert(appLines.length === 15, "format A stream: 7 headers (lines 1,3,5,10,14,20,27) + 8 continuation lines (tab-list x2, unindented x2, traceback x3), got " + appLines.length);
  assert(syslogLines.length === 6, "format B stream: 5 headers (lines 22,23,24,26,29) + 1 bare continuation line (25), got " + syslogLines.length);
  assert(!appLines.includes("") && !syslogLines.includes(""), "blank lines are dropped during the split, never emitted literally into either stream");

  assert(appLines.includes("cpu_vendor\tACME"), "tab-list continuation (lines 6-8) lands in the app stream");
  assert(appLines.includes("0(12) : error D1001: demo shader error"), "unindented continuation (line 12) lands in the app stream");
  assert(appLines.some(l => l.includes("ImportError: cannot import name")), "traceback-style continuation (lines 15-17) lands in the app stream");
  assert(syslogLines.includes("1 step executed in 1234us. Parallel factor 0.5."),
    "the bare continuation line right after a syslog header (line 25) lands in the syslog stream, not the app stream (it joins the most recently matched stream)");
});

await withApp(async (w, d, T) => {
  section("232b. loadMetaFormatText end to end: the reference sample parses into the right entry counts per grammar and auto-merges chronologically");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");

  const merged = await w.loadMetaFormatText("demo.log", META_SAMPLE_TEXT, metaFmt);
  assert(merged.name === "demo.log", "the merged result is named after the physical file, not mergeFiles' default vnode-name join");
  assert(merged.merged === true, "the auto-merge result is a real merged file node");
  assert(merged.entries.length === 12, "7 format-A headers + 5 format-B headers = 12 entries total, got " + merged.entries.length);
  assert(merged.entries.every((e, i, arr) => i === 0 || arr[i - 1].ts <= e.ts), "the merged result is fully chronological");
  // Per-grammar vnodes are never deleted (this session's rework, reversing
  // the previous session's "delete after merge" design) — they stay real,
  // independent, tagged file nodes, hidden from the plain top-level walk
  // (mergeSourceHidden) but otherwise fully alive.
  assert(T.state.rootIds.length === 3, "the merge + its 2 per-grammar vnodes are all real rootIds, got " + T.state.rootIds.length);
  const vnodeIds = T.state.rootIds.filter(id => id !== merged.id);
  assert(vnodeIds.every(id => {
    const n = T.state.nodes[id];
    return n && n.type === "file" && n.mergeOwnerId === merged.id && n.mergeSourceHidden === true;
  }), "each vnode is tagged mergeOwnerId/mergeSourceHidden, pointing at the merge");
  assert(vnodeIds.every(id => T.state.nodes[id].entries.length > 0), "each vnode still holds its own real, parsed entries");

  assert(merged.sources && merged.sources.length === 2, "the merged file's Sources breakdown has one entry per target format");
  assert(merged.sources.map(s => s.name).sort().join(",") === "App log (log4net-style),Syslog (RFC 5424)",
    "sources are named after the TARGET FORMATS (this is the meta-format auto-merge, not a manual multi-file merge)");
  const appSrc = merged.sources.find(s => s.name === "App log (log4net-style)");
  const syslogSrc = merged.sources.find(s => s.name === "Syslog (RFC 5424)");
  assert(appSrc.count === 7 && syslogSrc.count === 5, "each source's count matches how many entries actually came from it");

  const appEntries = merged.entries.filter(e => e.formatId === "fmt-demo-app");
  const syslogEntries = merged.entries.filter(e => e.formatId === "fmt-demo-syslog");
  assert(appEntries.length === 7 && syslogEntries.length === 5, "each entry is stamped with the format it was actually parsed under");
  assert(syslogEntries.every(e => !isNaN(e.ts)), "the 6-digit-fraction syslog timestamps all parse to valid numbers (see the SSS date-token fix)");
});
