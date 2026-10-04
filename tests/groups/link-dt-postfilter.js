// GROUP link-dt-postfilter — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-dt-postfilter — the link Δt condition is a pure post-filter
   Origin: 2026-10-04 (link usability round B, step 1). Δt only removes
   finished pairs; it never changes which target a reference pairs with
   (a pair it drops still claims its target under "exclusive matches").
   Covers computeLinkPairs on a small hand-shaped log (shared helper
   linkKeyLog) and on the simulator's tour demo log (Move requested ->
   Position reached, key job: 192 pairs, Δt > 500 ms keeps 36).
   ============================================================ */
group("link-dt-postfilter");

await withApp(async (w, d, T) => {
  section("link-dt-postfilter a. same pairing with and without Δt, with and without exclusive");
  const f = await w.addFile("link.log", linkKeyLog(), () => {});
  const move = w.createFilterNode(f.id, "text", "move requested");
  const reached = w.createFilterNode(f.id, "text", "position reached");
  for (const exclusive of [false, true]) {
    const all = w.createLinkNode(move.id, reached.id, "after", 1, { exclusive });
    const allIds = w.getEntries(all.id).map(p => p.second.id);
    for (const dt of [{ op: ">", ms: 200 }, { op: "<", ms: 200 }, { op: ">", ms: 0 }, { op: "<", ms: 1 }]) {
      const cut = w.createLinkNode(move.id, reached.id, "after", 1, { exclusive, dt });
      const cutPairs = w.getEntries(cut.id);
      const expectIds = w.getEntries(all.id).filter(p => w.linkDtPasses(dt, p.dtMs)).map(p => p.second.id);
      assert(JSON.stringify(cutPairs.map(p => p.second.id)) === JSON.stringify(expectIds),
        "exclusive=" + exclusive + " Δt " + dt.op + " " + dt.ms + ": exactly the unfiltered pairs that pass, in the same pairing (" + cutPairs.length + " of " + allIds.length + ")");
    }
  }
  const ex = w.createLinkNode(move.id, reached.id, "after", 1, { exclusive: true });
  assert(pairSummary(w.getEntries(ex.id)) === "p2@300|p1@300|p2@100", "exclusive pairing: 3 distinct targets, got " + pairSummary(w.getEntries(ex.id)));

  section("link-dt-postfilter b. chained link: Δt (last hop) removes finished tuples only");
  const hop = w.createLinkNode(move.id, reached.id, "after", 1);
  const chainAll = w.createLinkNode(hop.id, move.id, "after", 1);
  const chainDt = w.createLinkNode(hop.id, move.id, "after", 1, { dt: { op: ">", ms: 4900 } });
  const all = w.getEntries(chainAll.id), cut = w.getEntries(chainDt.id);
  assert(all.length === 2 && cut.length === 1 && cut[0].dtMs === 5000, "chained: 2 tuples, Δt > 4.9 s keeps the 5000 ms one, got " + all.length + "/" + cut.length);
});

await withApp(async (w, d, T) => {
  section("link-dt-postfilter c. tour data: key job gives 192 pairs; Δt > 500 ms keeps 36 of them");
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const f = await w.addFile("app.log", TOUR.demoLog(), () => {});
  const A = w.bakedTextCondition("Move requested"), B = w.bakedTextCondition("Position reached");
  const make = (key, dt) => w.createLinkNodeFromBaked(f.id, A, B, "after", 1, { key, dt });
  const job = make({ pattern: "job=[*:word]" });
  const pairs = w.getEntries(job.id);
  assert(pairs.length === 192, "key job: 192 pairs, got " + pairs.length);
  const max = pairs.reduce((m, p) => p.dtMs > m.dtMs ? p : m);
  assert(max.dtMs === 3930, "max Δt 3930 ms, got " + max.dtMs);
  const thread = make({ column: "thread" });
  assert(w.getEntries(thread.id).length === 205, "key Thread: 205 pairs, got " + w.getEntries(thread.id).length);
  const jobDt = make({ pattern: "job=[*:word]" }, { op: ">", ms: 500 });
  const cut = w.getEntries(jobDt.id);
  assert(cut.length === 36, "key job + Δt > 500: 36 pairs, got " + cut.length);
  const want = pairs.filter(p => p.dtMs > 500).map(p => p.first.id + ">" + p.second.id).join();
  assert(cut.map(p => p.first.id + ">" + p.second.id).join() === want, "the 36 are exactly the unfiltered pairs above 500 ms (pairing unchanged)");
  const jobDtEx = w.createLinkNodeFromBaked(f.id, A, B, "after", 1, { key: { pattern: "job=[*:word]" }, dt: { op: ">", ms: 500 }, exclusive: true });
  const jobEx = w.createLinkNodeFromBaked(f.id, A, B, "after", 1, { key: { pattern: "job=[*:word]" }, exclusive: true });
  assert(w.getEntries(jobDtEx.id).length === w.getEntries(jobEx.id).filter(p => p.dtMs > 500).length, "exclusive: Δt filters the same pairing");
});
