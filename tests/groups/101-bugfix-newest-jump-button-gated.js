// GROUP 101 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 101 — Bugfix: "Newest" jump button gated on liveness, not just
   handle existence (FEATURE_BACKLOG #9)
   Origin: this session (2026-08-25), person-reported correction to this
   same session's own earlier (wrong) fix: `activeTailedRoot()` used to
   treat ANY file with a `node.tail` object (i.e. opened via a real
   FileSystemFileHandle — showOpenFilePicker/drag-drop both hand one over,
   the common case) as "trailing" forever, even long after it stopped
   growing — node.tail is never deleted once set. That made #9's "hide for
   static files" a no-op for practically every real file. Fixed by routing
   activeTailedRoot() through the same isTailLive()/TAIL_LIVE_MS staleness
   window Group 63a already established for the tree row's live dot, and
   having tailTick()'s own liveness-only pass (no bytes read, just time
   passing) call updateTailJumpBtn() too, not just renderTree() — otherwise
   the button would only catch up to a staleness flip on some unrelated
   next render.
   ============================================================ */
group(101);
await withApp(async (w, d, T) => {
  section("101. \"Newest\" jump buttons hide once a tailed file goes stale, and stay hidden for a handle that never grew");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        return blob;
      },
    };
  }

  const initial = makeLog(0, 3);
  const handle = fakeHandle(initial);
  const f = await w.addFile("live.log", initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now() };
  T.state.tailFollow = false; // disengaged, the precondition for either jump button to be visible at all
  w.render();

  const tailJumpBtn = d.getElementById("tailJumpBtn");
  const tailJumpBtnHighlight = d.getElementById("tailJumpBtnHighlight");
  assert(isVisible(tailJumpBtn, w) === true, "sanity: a freshly-grown, unfollowed tailed file shows the jump button");

  // Backdate lastGrowth past the staleness window, same technique Group 63a
  // uses — no real timers needed.
  f.tail.lastGrowth = Date.now() - 60000;
  assert(w.isTailLive(f.tail) === false, "sanity: isTailLive itself reports stale");
  await w.tailTick(); // no byte growth this tick — only time passed
  assert(isVisible(tailJumpBtn, w) === false, "the Filtered view's jump button hides once the file has gone stale, with no other render triggering it");
  assert(isVisible(tailJumpBtnHighlight, w) === false, "same for the Highlight/Full view's own button");

  // A genuinely new write resurrects liveness, and with it the button
  // (still unfollowed).
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"back again"\n`;
  handle._setText(initial + appended);
  await w.tailTick();
  assert(isVisible(tailJumpBtn, w) === true, "a real write makes the file live again, and the button reappears");

  // A handle-bearing file that has NEVER grown since being opened (no
  // lastGrowth stamped yet) still counts as live — isTailLive treats a null
  // lastGrowth as "just opened, presumed live", matching the tree dot's own
  // existing behavior — so the button is available from the start, not
  // just after a first observed write.
  const g = await w.addFile("fresh.log", makeLog(0, 2), () => {});
  g.tail = { handle: fakeHandle(makeLog(0, 2)), offset: 0, pending: "", failed: false, busy: false, errorCount: 0 };
  T.state.activeId = g.id;
  T.state.tailFollow = false;
  w.render();
  assert(isVisible(d.getElementById("tailJumpBtn"), w) === true, "a just-opened tailed file (no lastGrowth yet) still counts as live, not static");

  // A plain static file (no node.tail at all — e.g. the legacy <input
  // type=file> fallback path) never shows either button, follow or not.
  const h = await w.addFile("static.log", makeLog(0, 2), () => {});
  T.state.activeId = h.id;
  w.render();
  assert(isVisible(d.getElementById("tailJumpBtn"), w) === false, "a file with no node.tail at all never shows the jump button");
});
