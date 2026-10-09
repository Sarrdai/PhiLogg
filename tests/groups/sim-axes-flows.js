// GROUP sim-axes-flows - loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP sim-axes-flows - log simulator scenarios `axes` and `flows`
   Origin: 2026-10-09 (link pairing round, step 1: test data for the
   "Before the next start" and "Nested" pairing modes).
   Opt-in (never part of "all"); deterministic per seed.
     axes   "Move axes requested" on thread gantry; "Axis X moved" always,
            "Axis Y moved" in ~40 % of the moves; no move starts while the
            previous one runs.
     flows  "Flow <Name> started run=R-n" ... "Flow <Name> ended result=..."
            on thread flow-engine, nested up to depth 3, some same-name
            nesting, ~4 % never end; flows never overlap.
   ============================================================ */
group("sim-axes-flows");
if (groupSelected()) {
  for (const sc of ["axes", "flows"]) {
    assert(!LOGSIM.normalizeScenarios("all").includes(sc) && LOGSIM.normalizeScenarios(sc).join() === sc, sc + ": opt-in, never part of 'all'");
    const a = logsimEntries2("default", [sc, "basic"], 2000, 5);
    const b = logsimEntries2("default", [sc, "basic"], 2000, 5);
    assert(JSON.stringify(a) === JSON.stringify(b), sc + ": deterministic per seed");
    assert(JSON.stringify(a) !== JSON.stringify(logsimEntries2("default", [sc, "basic"], 2000, 6)), sc + ": a different seed gives a different log");
    assert(a.every((e, i) => i === 0 || e.ts >= a[i - 1].ts), sc + ": entries stay sorted by time");
  }
  // Existing seeds are byte-identical: the new scenarios are not drawn unless named.
  const base = JSON.stringify(logsimEntries2("default", ["all"], 1500, 7));
  assert(base === JSON.stringify(logsimEntries2("default", ["all"], 1500, 7)) && !/Move axes requested|Flow \w+ started/.test(base), "'all' never produces axes or flows lines");

  // axes
  const ax = logsimEntries2("default", ["axes"], 1200, 7);
  const moves = ax.filter(e => e.msg === "Move axes requested");
  const xs = ax.filter(e => /^Axis X moved to -?\d/.test(e.msg)), ys = ax.filter(e => /^Axis Y moved to -?\d/.test(e.msg));
  assert(moves.length > 150 && ax.filter(e => e.thread === "gantry").length === ax.length, "axes: many moves, all on thread gantry (" + moves.length + ")");
  assert(xs.length >= moves.length - 1 && ys.length > 0.25 * moves.length && ys.length < 0.55 * moves.length, "axes: X always, Y in ~40 % of the moves (" + xs.length + " X, " + ys.length + " Y of " + moves.length + ")");
  assert(ax.some(e => e.msg === "Gantry busy") && moves.every((m, i) => i === 0 || ax.filter(e => /^Axis [XY] moved/.test(e.msg) && e.ts > moves[i - 1].ts && e.ts <= m.ts).length >= 1),
    "axes: a move only starts after the previous one's ends were logged, the gantry is busy in between");

  // flows
  const g = LOGSIM.createGenerator({ format: "default", scenarios: ["flows"], seed: 7 });
  const entries = [], intervals = [];
  let busy = 0;
  for (let i = 0; i < 4000; i++) {
    const e = g.next();
    entries.push(e);
    const nb = g.generator.state.flowBusy || 0;
    if (nb !== busy) { // a new top-level flow started with this entry
      intervals.push([e.ts, nb]);
      assert(e.ts >= busy, "flows: a new flow starts only after the previous one is over (" + e.ts + " >= " + busy + ")");
      busy = nb;
    }
  }
  const lines = entries.filter(e => /^Flow \S+ (started|ended)/.test(e.msg));
  assert(entries.every(e => e.thread === "flow-engine") && intervals.length > 100, "flows: all on thread flow-engine, over a hundred top-level flows (" + intervals.length + ")");
  assert(lines.every(e => intervals.some(([s, t]) => e.ts >= s && e.ts < t)), "flows: every start/end line lies inside exactly one flow interval");
  assert(lines.every(e => intervals.filter(([s, t]) => e.ts >= s && e.ts < t).length === 1), "flows never overlap");
  const names = e => /^Flow (\S+) /.exec(e.msg)[1];
  const stack = [];
  let same = 0, maxDepth = 0, unended = 0;
  for (const e of lines) {
    if (/ started run=R-\d{5}$/.test(e.msg)) { if (stack.some(s => names(s) === names(e))) same++; stack.push(e); maxDepth = Math.max(maxDepth, stack.length); }
    else if (/ ended result=(OK|FAILED)$/.test(e.msg)) {
      let k = stack.length - 1;
      while (k >= 0 && names(stack[k]) !== names(e)) k--;
      if (k >= 0) { unended += stack.length - 1 - k; stack.length = k; }
    } else assert(false, "flows: unexpected message " + e.msg);
  }
  assert(same >= 1, "flows: at least one same-name nesting at seed 7 / 4000 entries (" + same + ")");
  assert(maxDepth >= 3 && unended + stack.length > 0, "flows: nesting reaches depth 3 and some flows never end (max depth " + maxDepth + ", " + (unended + stack.length) + " unended)");
}
