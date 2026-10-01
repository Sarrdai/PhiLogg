// GROUP 44 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 44 — Bugfix: a transient tail-poll failure no longer permanently
   kills tailing
   Origin: person-reported (this session, follow-up to Group 43's fix): with
   Group 43 in place, tailing DID pick up growth and show the live dot — but
   stopped updating (dot included) a few seconds later, seemingly correlated
   with moving the mouse. tailTick previously treated ANY getFile()/read
   failure as permanent (t.failed = true on the first one), including
   transient ones — most plausibly a moment where the writer holds the file
   locked without shared-read access, a normal condition for a log actively
   being appended to by another process. Fixed with a consecutive-failure
   counter (t.errorCount, TAIL_MAX_CONSECUTIVE_ERRORS = 5): only a STREAK of
   failures marks the file permanently failed; any clean poll in between
   resets the streak, and every failure (transient or not) is now logged via
   console.warn instead of vanishing silently — a genuinely permanent
   failure (moved/deleted/permission revoked) still fails every single poll
   and reaches the threshold in ~7.5s, same as it effectively did before.
   ============================================================ */
group(44);
await withApp(async (w, d, T) => {
  section("44. Bugfix: transient tail-poll failures don't permanently kill tailing");

  // Same fixture shape as Group 12, plus a controllable failure mode.
  function flakyHandle(initialText) {
    let text = initialText;
    let failNext = 0; // number of upcoming getFile() calls that should throw
    return {
      _setText(t) { text = t; },
      _failNextCalls(n) { failNext = n; },
      async getFile() {
        if (failNext > 0) { failNext--; throw new Error("simulated transient read failure"); }
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

  const warnCalls = [];
  const origWarn = w.console.warn;
  w.console.warn = (...args) => warnCalls.push(args);

  const initial = makeLog(0, 3);
  const handle = flakyHandle(initial);
  const f = await w.addFile("live.log", initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false, errorCount: 0 };
  w.render();
  assert(d.querySelector(".tree-icon-live") !== null, "sanity: live dot shows for a freshly-tailed file");

  // --- A short streak of transient failures (below the threshold) ---
  handle._failNextCalls(3);
  await w.tailTick(); await w.tailTick(); await w.tailTick();
  assert(f.tail.errorCount === 3, "three consecutive failures recorded, got " + f.tail.errorCount);
  assert(f.tail.failed === false, "still under the threshold — tailing not yet given up on");
  w.render();
  assert(d.querySelector(".tree-icon-live") !== null, "live dot still shows during a sub-threshold failure streak");
  assert(warnCalls.length === 3, "each failure is logged via console.warn, not silently swallowed, got " + warnCalls.length);

  // --- Recovery: the next poll succeeds (lock released) and growth resumes ---
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"new entry"\n`;
  handle._setText(initial + appended);
  await w.tailTick();
  assert(f.tail.errorCount === 0, "a clean poll resets the consecutive-failure streak back to 0");
  assert(f.entries.length === 4, "growth is picked up normally once the transient failure clears, got " + f.entries.length);
  assert(f.tail.failed === false, "never crossed the threshold — was never marked failed at all");

  // --- A persistent failure (file genuinely gone) still gives up, eventually ---
  handle._failNextCalls(999); // never recovers, same as a real moved/deleted file
  for (let i = 0; i < 5; i++) await w.tailTick();
  assert(f.tail.errorCount === 5, "five straight failures reach the threshold, got " + f.tail.errorCount);
  assert(f.tail.failed === true, "a genuinely persistent failure still permanently stops tailing, same as before this fix");
  w.render();
  assert(d.querySelector(".tree-icon-live") === null, "live dot disappears once tailing is genuinely given up on");

  // Further ticks on an already-failed node are a no-op, not a crash.
  await w.tailTick();
  assert(f.tail.errorCount === 5, "an already-failed node is skipped by tailTick, not polled further");

  w.console.warn = origWarn;
});
