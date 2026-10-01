// GROUP 77 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 77 — Bugfix: sample-line pattern suggestion, two fixes for the
   same person-reported PLC log (this session, 2026-08-21, via screenshot):

   1. ";SSS" (and any other) millisecond separator, not just "," / ".".
      The log uses "10:43:18;617" (semicolon before milliseconds), which
      tripped the fractional-seconds candidate in SAMPLE_TS_CANDIDATES —
      it only matched "." or ",". The suggester fell back to the no-ms
      timestamp shape and baked the sample's own ms value (";617") into
      the pattern as literal text, so only lines sharing that exact
      millisecond kept matching. Fixed by capturing whatever separator
      character is actually present and reproducing it in tsFormat
      instead of hardcoding "," (compileDateFormat already escapes
      literal separators generically, so this was purely a suggestion-
      heuristic gap, not a compiler limit).
   2. A bare (unquoted, undelimited) thread field. Reported as STILL
      breaking after fix 1 — the real remaining cause: this log's header
      lines ("TRACE\t-\t[System]\t...") and its FIFO-data lines
      ("WARN\tAxCtrl\t[-]\t...") share one shape, %d %p <bare-word>
      [%M] %m, but the suggester only ever recognized a thread wrapped in
      quotes or parens. On the one sample line it saw, the bare word
      between level and the [System] bracket was "-", which then got
      read as fixed literal text — so it matched every header line (all
      literally "-") but not one FIFO-data line, where that same
      position holds a real, varying value ("AxCtrl", "CrashP", ...).
      Fixed by claiming a single whitespace-free token sitting directly
      between %p and an already-claimed %M bracket as %t — a narrow,
      structurally-cued case (framed by the level on one side and an
      immediate "[" on the other) rather than a blind "next word is the
      thread" guess that would misfire on ordinary free-form messages.
   ============================================================ */
group(77);
await withApp(async (w, d, T) => {
  section("77. Pattern suggestion: non-comma ms separators AND a bare thread field both round-trip instead of becoming literal text");

  const semi = w.suggestPatternFromSample("2026-08-14 10:43:18;617\tTRACE\t-\t[System]\tSafety: ES OK");
  assert(semi && semi.pattern === "%d\\t%p\\t%t\\t[%M]\\t%m%n", "the ms value is absorbed into %d and the bare \"-\" becomes %t, not literal text, got " + (semi && semi.pattern));
  assert(semi.tsFormat === "yyyy-MM-dd HH:mm:ss;SSS", "tsFormat reproduces the semicolon separator actually seen, got " + semi.tsFormat);

  // The suggested pattern/tsFormat must then actually parse LATER lines
  // with a different millisecond AND a real (non-"-") thread value — the
  // exact failure mode reported: the FIFO-data block read as one message.
  const compiled = w.compileFormatPattern(semi.pattern, semi.tsFormat);
  assert(compiled.regex, "the suggested pattern compiles");
  const header = compiled.regex.exec("2026-08-14 10:43:18;617\tTRACE\t-\t[System]\t*************** START FIFO DATA ***************");
  assert(header && header.groups.thread === "-" && header.groups.method === "System", "a second header line (thread \"-\") still matches, got " + JSON.stringify(header && header.groups));
  const fifo = compiled.regex.exec("2026-08-14 10:33:45;389\tWARN\tAxCtrl\t[-]\tFB_InitEndlessPosition Error");
  assert(fifo, "a FIFO-data line, with a DIFFERENT millisecond AND a real thread value, still matches the suggested pattern");
  assert(fifo.groups.thread === "AxCtrl" && fifo.groups.method === "-" && fifo.groups.message === "FB_InitEndlessPosition Error",
    "...and thread/method/message are extracted from their correct fields, not swallowed into a prior message, got " + JSON.stringify(fifo && fifo.groups));

  const dotOrComma = w.suggestPatternFromSample("2024-01-15 10:00:00,123 ERROR boom");
  assert(dotOrComma.tsFormat === "yyyy-MM-dd HH:mm:ss,SSS", "comma separator still round-trips as before (no regression), got " + dotOrComma.tsFormat);
  const dot = w.suggestPatternFromSample("2024-01-15 10:00:00.123 ERROR boom");
  assert(dot.tsFormat === "yyyy-MM-dd HH:mm:ss.SSS", "dot separator still round-trips too, got " + dot.tsFormat);

  const noMs = w.suggestPatternFromSample("2024-01-15 10:00:00 ERROR boom");
  assert(noMs.tsFormat === "yyyy-MM-dd HH:mm:ss", "a sample with no fractional seconds at all still falls back cleanly, got " + noMs.tsFormat);

  // No bracket at all -> no structural cue -> the bare-word rule must NOT
  // fire (would otherwise misread the first word of a free-form message
  // as a thread).
  const noBracket = w.suggestPatternFromSample("2024-01-15 10:00:00 ERROR Database connection failed");
  assert(noBracket.pattern === "%d %p %m%n", "with no bracket to frame it, a bare word after the level is left as part of the message, not misread as %t, got " + noBracket.pattern);

  // Already-quoted thread still takes priority over the new bare-word rule.
  const quoted = w.suggestPatternFromSample('2024-01-15 10:00:00 ERROR "main" [Startup] boom');
  assert(quoted.pattern === '%d %p "%t" [%M] %m%n', "a quoted thread is still claimed the old way, unaffected by the new bare-word rule, got " + quoted.pattern);
});
