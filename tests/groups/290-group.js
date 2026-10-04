// GROUP 290 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(290);
{
  await withApp(async (w, d, T) => {
    section("290a. Link Δt condition: span, node, baked, exclusivity, chained total span");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const move = w.createFilterNode(f.id, "text", "move requested");
    const reached = w.createFilterNode(f.id, "text", "position reached");
    const plain = w.createLinkNode(move.id, reached.id, "after", 1);
    assert(pairSummary(w.getEntries(plain.id)) === "p2@300|p2@100|p2@100", "baseline: nearest following 'position reached' — spans 300/100/100 ms, got " + pairSummary(w.getEntries(plain.id)));
    const gt = w.createLinkNode(move.id, reached.id, "after", 1, { dt: { op: ">", ms: 200 } });
    assert(pairSummary(w.getEntries(gt.id)) === "p2@300" && gt.name.endsWith("(Δt > 200ms)"), "Δt > 200 ms keeps only the 300 ms pair, name carries the condition: " + gt.name);
    const lt = w.createLinkNode(move.id, reached.id, "after", 1, { dt: { op: "<", ms: 200 } });
    assert(w.getEntries(lt.id).length === 2, "Δt < 200 ms keeps the two 100 ms pairs");
    // Exclusive: Δt is a pure post-filter — the 300 ms pair is dropped by the
    // condition but still claims 'position reached axis 2 @0.300', so the
    // pairing is the same as without Δt and only the 5.0 → 5.1 pair is left.
    const exLt = w.createLinkNode(move.id, reached.id, "after", 1, { exclusive: true, dt: { op: "<", ms: 200 } });
    const exAll = w.createLinkNode(move.id, reached.id, "after", 1, { exclusive: true });
    assert(pairSummary(w.getEntries(exLt.id)) === "p2@100" && w.getEntries(exAll.id).length === 3,
      "exclusive + Δt: a dropped pair still claims its target (1 of 3 exclusive pairs survive), got " + pairSummary(w.getEntries(exLt.id)));
    // Baked (the same condition inside an AND-free chain: a link of the Δt link).
    const baked = w.bakeNodeCondition(gt);
    assert(baked.linkDt && baked.linkDt.op === ">" && baked.linkDt.ms === 200, "bakeNodeCondition carries linkDt");
    assert(w.getEntriesFromBaked(baked, f.entries, f.id).length === 1, "getEntriesFromBaked honors linkDt");

    // Chained: move → reached (after) → next move (after); the pair's span
    // covers the whole tuple.
    const hop1 = w.createLinkNode(move.id, reached.id, "after", 1);
    const hop2 = w.createLinkNode(hop1.id, move.id, "after", 1);
    const tuples = w.getEntries(hop2.id);
    const t0 = tuples[0];
    assert(t0 && t0.dtMs === t0.tsMax - t0.tsMin && t0.dtMs === 5000, "chained tuple: dtMs spans first to last real entry (0.000 → 5.000), got " + (t0 && t0.dtMs));
  });

  await withApp(async (w, d, T) => {
    section("290b. Link dialog: Δt row, live preview, multi-hop puts Δt on the last hop");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const move = w.createFilterNode(f.id, "text", "move requested");
    const reached = w.createFilterNode(f.id, "text", "position reached");
    w.render();
    w.openLinkDialog([move.id, reached.id]);
    const hop = d.querySelector("#linkHopsList .link-hop-row .link-hop-dir");
    hop.value = "after";
    hop.dispatchEvent(new w.Event("change", { bubbles: true }));
    await sleep(200);
    assert(d.querySelector("#linkLiveMatch").textContent.replace(/\s+/g, " ").trim() === "3 pairs", "preview without Δt: plain pair count, got " + d.querySelector("#linkLiveMatch").textContent);
    assert(d.querySelector("#linkDtValue").disabled, "Δt controls are greyed out while the switch is off");
    fireClick(d.querySelector("#linkDtInput"), w);
    assert(!d.querySelector("#linkDtValue").disabled, "switching Δt on enables its controls");
    d.querySelector("#linkDtValue").value = "200";
    d.querySelector("#linkDtValue").dispatchEvent(new w.Event("input", { bubbles: true }));
    await sleep(200);
    assert(d.querySelector("#linkLiveMatch").textContent.includes("1 of 3 pairs"), "preview: '1 of 3 pairs', got " + d.querySelector("#linkLiveMatch").textContent);
    const badge = d.querySelector("#linkResultsSamples .filter-sample-badge");
    assert(badge && badge.textContent === "Δt 300ms", "sample pair shows its Δt, got " + (badge && badge.textContent));
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(node.filterType === "link" && node.linkDt && node.linkDt.op === ">" && node.linkDt.ms === 200 && w.getEntries(node.id).length === 1,
      "Create stores linkDt on the new link");

    // Multi-hop (move → position → next "axis 1" move, all "after"): the
    // tuples span 5000 ms (from 0.000) and 4800 ms (from 0.200); Δt > 4.9 s
    // sits on the last hop only and tests the whole tuple's span.
    const axis1Move = w.createFilterNode(f.id, "text", "move requested axis 1");
    w.openLinkDialog([move.id, reached.id, axis1Move.id]);
    d.querySelector("#linkRefSelect").value = move.id;
    d.querySelector("#linkRefSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
    [...d.querySelectorAll("#linkHopsList .link-hop-dir")].forEach(s => { s.value = "after"; s.dispatchEvent(new w.Event("change", { bubbles: true })); });
    fireClick(d.querySelector("#linkDtInput"), w);
    d.querySelector("#linkDtValue").value = "4.9";
    d.querySelector("#linkDtUnit").value = "s";
    d.querySelector("#linkDtUnit").dispatchEvent(new w.Event("change", { bubbles: true }));
    await sleep(200);
    assert(d.querySelector("#linkLiveMatch").textContent.includes("1 of 2 pairs"), "multi-hop preview: '1 of 2 pairs', got " + d.querySelector("#linkLiveMatch").textContent);
    const before = new Set(f.children);
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const created = f.children.filter(id => !before.has(id)).map(id => T.state.nodes[id]);
    const last = T.state.nodes[T.state.activeId];
    assert(created.length === 1 && created[0].id === last.id && !last.bakedA.linkDt && last.linkDt && last.linkDt.ms === 4900,
      "multi-hop: ONE node; only the last hop carries the Δt condition (4.9 s = 4900 ms)");
    const tuples = w.getEntries(last.id);
    assert(tuples.length === 1 && tuples[0].dtMs === 5000 && w.getTupleEntries(tuples[0]).length === 3,
      "the condition tests the whole 3-entry tuple's span (move 0.000 → … → move 5.000)");
  });

  await withApp(async (w, d, T) => {
    section("290c. Extraction on link pairs: synthetic Δt (ms) column");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const move = w.createFilterNode(f.id, "text", "move requested");
    const reached = w.createFilterNode(f.id, "text", "position reached");
    const link = w.createLinkNode(move.id, reached.id, "after", 1, { key: { column: "thread" } });
    const ext = w.createFilterNode(link.id, "text", "move requested axis [*:int]");
    w.renderExtractTable(ext);
    const dtCol = T.extractColumns.find(c => c.colIndex === -3);
    assert(dtCol && dtCol.name === "Δt (ms)" && dtCol.type === "int", "a pair extraction gets the Δt (ms) column");
    assert(T.extractRowsData.map(r => r.values[-3]).join("|") === "1000|100|900", "Δt values are the pairs' spans, got " + T.extractRowsData.map(r => r.values[-3]).join("|"));
    assert(T.extractColumns.findIndex(c => c.colIndex === -3) === 2, "placed right after Index and t (ms)");
    const plainExt = w.createFilterNode(f.id, "text", "move requested axis [*:int]");
    w.renderExtractTable(plainExt);
    assert(!T.extractColumns.some(c => c.colIndex === -3), "a plain (non-pair) extraction has no Δt column");
  });
}
