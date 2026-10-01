// GROUP 63 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 63 — Bugfix: the live tail dot goes dark once a file genuinely
   stops growing, instead of staying lit forever
   Origin: this session (2026-08-19), person-reported (German): the app
   correctly detects a file that's still being written and marks it with the
   pulsing live dot, but the dot then never goes away even long after
   nothing new is being written — and when a new file shows up in Folder
   watch and starts receiving lines, the OLD file (no longer written to)
   still shows the dot too.
   Root cause: the dot's condition was `node.tail && !node.tail.failed` —
   i.e. "does a live handle still exist and hasn't errored out", which stays
   true indefinitely once a writer moves on to a different file (e.g.
   rotation), since the old handle stays perfectly readable, just idle.
   Fixed with a staleness window: node.tail now tracks `lastGrowth`
   (stamped on every real byte-level change — growth or rotation-reset) and
   `isTailLive(t)` requires a growth within the last TAIL_LIVE_MS, not just
   an unfailed handle. Since a poll tick with nothing new otherwise produces
   no re-render at all, tailTick() also does a lightweight second pass
   comparing each tail's live status against its own cached `wasLive` and
   fires a cheap renderTree() (not a full render()) when it flips purely
   from time passing, with no bytes read that tick — otherwise the dot
   would only clear itself on the NEXT unrelated change.
   ============================================================ */
group(63);
await withApp(async (w, d, T) => {
  section("63a. Bugfix: the live tail dot expires once a file stops growing");

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
        return blob;
      },
    };
  }

  const initial = makeLog(0, 3);
  const handle = fakeHandle(initial);
  const f = await w.addFile("live.log", initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };
  w.render();
  assert(d.querySelector(".tree-icon-live") !== null, "sanity: the live dot renders right after a fresh growth");
  assert(w.isTailLive(f.tail) === true, "sanity: isTailLive agrees — growth was just now");

  // A tick with genuinely nothing new (writer still there, just idle for a
  // moment) must NOT clear the dot — only a real staleness window should.
  await w.tailTick();
  assert(d.querySelector(".tree-icon-live") !== null, "an inert tick shortly after growth keeps the dot lit (not stale yet)");

  // Now simulate "long since stopped writing" by backdating lastGrowth past
  // the staleness window directly, the same way Group 44 backdates
  // errorCount instead of waiting out real timers.
  f.tail.lastGrowth = Date.now() - 60000;
  assert(w.isTailLive(f.tail) === false, "isTailLive itself reports stale once lastGrowth is far enough in the past");
  await w.tailTick(); // no byte growth this tick either — only time passed
  assert(d.querySelector(".tree-icon-live") === null, "the live dot goes dark once the file has been quiet past the staleness window, with NO further tail tick required to have unrelated changes in it");

  // A genuinely new write resurrects it.
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"back again"\n`;
  handle._setText(initial + appended);
  await w.tailTick();
  assert(d.querySelector(".tree-icon-live") !== null, "a real new write lights the dot back up");
  assert(f.entries.length === 4, "sanity: the resurrecting write was actually parsed, not just a dot flip");
});

await withApp(async (w, d, T) => {
  section("63b. Bugfix: Folder-watch rotation — old file's dot fades while the new file's stays lit");

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
        return blob;
      },
    };
  }

  const oldLog = makeLog(0, 2, { msgPrefix: "old" });
  const oldHandle = fakeHandle(oldLog);
  const oldFile = await w.addFile("app-1.log", oldLog, () => {});
  oldFile.tail = { handle: oldHandle, offset: oldLog.length, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };

  const newLog = makeLog(0, 2, { msgPrefix: "new" });
  const newHandle = fakeHandle(newLog);
  const newFile = await w.addFile("app-2.log", newLog, () => {});
  newFile.tail = { handle: newHandle, offset: newLog.length, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };
  w.render();
  assert(d.querySelectorAll(".tree-icon-live").length === 2, "sanity: both files show live right after being opened");

  // The writer stopped touching the old file a while ago (backdated the same
  // way Part 63a does) and moved on to the new one, which alone grows now.
  oldFile.tail.lastGrowth = Date.now() - 60000;
  const newAppended = `2024-01-15 10:00:02,000\tINFO\t"main"\tFoo.cs\tline 2\t[DoWork]\t"new 2"\n`;
  newHandle._setText(newLog + newAppended);
  await w.tailTick();

  const liveRows = Array.from(d.querySelectorAll(".tree-row")).filter(r => r.querySelector(".tree-icon-live"));
  assert(liveRows.length === 1, "exactly one file shows the live dot after rotation, got " + liveRows.length);
  assert(liveRows[0] && liveRows[0].textContent.includes("app-2.log"), "the live dot stayed on the file that's ACTUALLY still being written to");
  assert(!liveRows.some(r => r.textContent.includes("app-1.log")), "the rotated-out old file no longer shows the live dot");
});
