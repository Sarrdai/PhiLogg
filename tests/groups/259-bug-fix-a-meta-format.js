// GROUP 259 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 259 — Bug fix: a meta-format merge's per-grammar streams no
   longer briefly steal focus (and a real, full render) from the merge row
   while they're still loading (this session, 2026-09-21, person-reported:
   "bei als Merge geladene Files wie Meta-Formate [erscheint] die Anzeige
   schon..., wenn eines der Formate geladen ist, die Minimap zeigt dann
   beim Laden unterschiedliche Zustände an"). Root cause: loadMetaFormatText
   loads each stream via addFile(..., placeholder), which internally calls
   activateQueuedFileNode — unconditionally flipping state.activeId onto
   that stream for the duration of its own parse, so its own natural
   flushLoadRender ran a real, full render() with THAT stream (already
   complete) as the active view, before state.activeId was reset back to
   the merge only after the whole loop finished. Fixed with a new
   metaFormatSplitInProgress guard (mirroring the pre-existing
   sessionRestoreInProgress one), checked in both createFileNode's and
   activateQueuedFileNode's activeId assignment, set for the loop's
   duration. Also covers the companion fix in the same session: the
   updateLiveGrowingTotal exception (GROUP 254, now removed) that let a
   loading file's visible rows/scrollbar grow live for the active view —
   removed outright per the same person request ("Rendern erst wenn
   vollständig geladen soll für alles gelten").
   ============================================================ */
group(259);
await withApp(async (w, d, T) => {
  section("259. loadMetaFormatText keeps the merge as the active node throughout the per-stream loop — a stream never briefly becomes active mid-load");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");

  // Streams well over PARSE_CHUNK_LINES (4000) each, so every stream's own
  // parse genuinely yields multiple times — without that, the whole loop
  // could run start-to-finish inside one synchronous stretch and this test
  // would pass by accident, never actually observing an intermediate state.
  const N = 5000;
  const lines = [];
  for (let i = 0; i < N; i++) {
    lines.push("2025-01-02 09:15:03.123 [] INFO  demo.Loader  - app line " + i);
    lines.push("<13>1 2025-01-02T09:15:03.711324 localhost demoapp 12345 1 [log@9999 filename='x.cpp' linenumber='1' errorcode='0' errortext='(info, demo, ok)' agent='a' system='s'] syslog line " + i);
  }
  const text = lines.join("\n");

  const before = new Set(T.state.rootIds);
  const donePromise = w.loadMetaFormatText("mix.log", text, metaFmt);

  // loadMetaFormatText runs synchronously (split, createMergeShell, and the
  // first stream's parse up to its first chunk yield) before this line ever
  // runs — the merge shell and its activation already happened.
  const mergedId = T.state.rootIds.find(id => !before.has(id) && T.state.nodes[id].merged);
  assert(mergedId, "the merge shell exists synchronously as soon as loadMetaFormatText is called");
  assert(T.state.activeId === mergedId,
    "the merge is already the active node while the FIRST stream is still mid-parse — not flipped onto its placeholder (this is where the bug showed up)");
  assert(w.getVisibleEntries().length === 0, "the active (merge) view shows no entries yet — the still-loading app-format stream's own content is not visible early");

  // Let more ticks land — including, most likely, the first stream's own
  // natural completion (which used to run a real full render with itself
  // as the active node) and the second stream starting.
  for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0));
  assert(T.state.activeId === mergedId, "the merge is still the active node partway through the loop, surviving at least one stream's own completion");

  const merged = await donePromise;
  assert(merged.id === mergedId, "sanity: the returned node is the same merge shell observed throughout");
  assert(T.state.activeId === mergedId, "the merge remains the active node once everything has finished");
  assert(merged.entries.length === N * 2, "the merge's own entries are complete once loading is done — got " + merged.entries.length);
}, { demoFormats: true });
