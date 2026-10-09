// GROUP sim-causechain — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP sim-causechain — log simulator scenario `causechain`
   Origin: 2026-10-08 (backlog #119 step 1, neighbors analysis test data).
   Opt-in (never part of "all"); deterministic per seed; ERROR "Order
   processing failed: unhandled exception, order O-xxxxx" is preceded in ~80 %
   of cases by 1-3 WARN "Connection pool exhausted" lines on the SAME thread
   0.5-2 s earlier.
   ============================================================ */
group("sim-causechain");
if (groupSelected()) {
  assert(!LOGSIM.normalizeScenarios("all").includes("causechain") && LOGSIM.normalizeScenarios("causechain").join() === "causechain", "causechain: opt-in, never part of 'all'");
  const a = logsimEntries2("default", ["causechain", "basic"], 3000, 5);
  const b = logsimEntries2("default", ["causechain", "basic"], 3000, 5);
  assert(JSON.stringify(a) === JSON.stringify(b), "causechain: deterministic per seed");
  const booms = a.filter(e => e.msg.startsWith("Order processing failed: unhandled exception, order O-") && e.level === "ERROR");
  assert(booms.length >= 40, "causechain: enough exceptions in 3000 entries, got " + booms.length);
  const preceded = booms.filter(x => a.some(e => e.thread === x.thread && e.level === "WARN" && /^Connection pool exhausted \(active=\d+, max=50\)$/.test(e.msg) && x.ts - e.ts >= 500 && x.ts - e.ts <= 2000));
  const share = preceded.length / booms.length;
  assert(share > 0.65 && share < 0.95, "causechain: ~80 % of exceptions have a pool warning on the same thread 0.5-2 s before, got " + (share * 100).toFixed(0) + " %");
  assert(a.every(e => e.ts >= 0) && a.every((e, i) => i === 0 || e.ts >= a[i - 1].ts), "causechain: entries stay sorted by time");
}
