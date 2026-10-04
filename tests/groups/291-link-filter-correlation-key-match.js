// GROUP 291 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 291 — Link filter: correlation key "Match only same …"
   (2026-09-26). A column (Thread) or a wildcard capture (axis [*:int]) —
   reference and target pair only on an equal key. Covers: both key kinds
   vs. the baseline, direction "before", exclusivity, the same-timestamp
   tie-break within one key, a chained hop keyed off the previous match,
   the dialog (column / pattern choice, invalid pattern refused), the
   name suffix, and every persistence carrier for linkKey + linkDt
   (incl. sanitizing a hand-edited value on import).
   ============================================================ */
group(291);
{
  await withApp(async (w, d, T) => {
    section("291a. Correlation key: column and capture, with direction/exclusive/tie-break/chaining");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const move = w.createFilterNode(f.id, "text", "move requested");
    const reached = w.createFilterNode(f.id, "text", "position reached");
    const byThread = w.createLinkNode(move.id, reached.id, "after", 1, { key: { column: "thread" } });
    assert(pairSummary(w.getEntries(byThread.id)) === "p1@1000|p2@100|p1@900" && byThread.name.includes("[same Thread]"),
      "same Thread: each move pairs with its own thread's position (1000/100/900 ms), got " + pairSummary(w.getEntries(byThread.id)));
    const byAxis = w.createLinkNode(move.id, reached.id, "after", 1, { key: { pattern: "axis [*:int]" } });
    assert(pairSummary(w.getEntries(byAxis.id)) === "p1@500|p2@100|p1@900" && byAxis.name.includes("[same axis [*:int]]"),
      "same captured axis: the axis-1 move pairs with the first axis-1 position, even from another thread, got " + pairSummary(w.getEntries(byAxis.id)));
    const exAxis = w.createLinkNode(move.id, reached.id, "after", 1, { exclusive: true, key: { pattern: "axis [*:int]" } });
    assert(pairSummary(w.getEntries(exAxis.id)) === "p1@500|p2@100|p1@900", "exclusive within a key: no cross-key interference");
    const exPlain = w.createLinkNode(move.id, reached.id, "after", 1, { exclusive: true });
    assert(pairSummary(w.getEntries(exPlain.id)) === "p2@300|p1@300|p2@100", "(baseline: without a key, exclusivity hands the second move a foreign axis)");
    const back = w.createLinkNode(reached.id, move.id, "before", 1, { key: { column: "thread" } });
    assert(w.getEntries(back.id).length === 4, "direction 'before' + key: T3's position has no T3 move and is dropped (4 of 5)");
    const combined = w.createLinkNode(move.id, reached.id, "after", 1, { key: { column: "thread" }, dt: { op: "<", ms: 950 } });
    assert(pairSummary(w.getEntries(combined.id)) === "p2@100|p1@900", "key and Δt together");
    // Chained: the second hop reads its key off the previous hop's match.
    const hop2 = w.createLinkNode(byAxis.id, move.id, "after", 1, { key: { column: "thread" } });
    const t = w.getEntries(hop2.id);
    assert(t.length === 0, "chained hop keyed by thread: the axis-1 position came from T3, which never moves — no tuple, got " + t.length);
    const hop2b = w.createLinkNode(byThread.id, move.id, "after", 1, { key: { column: "thread" } });
    assert(w.getEntries(hop2b.id).length === 1 && w.getEntries(hop2b.id)[0].dtMs === 5000, "chained, same thread throughout: T1 move → T1 position → next T1 move");
  });

  await withApp(async (w, d, T) => {
    section("291b. Correlation key keeps the same-timestamp tie-break within its key");
    const lines = [
      `2024-01-15 10:00:00,000\tINFO\t"T1"\tFoo.cs\tline 0\t[DoWork]\t"Target Vir decoy"`,
      `2024-01-15 10:00:10,000\tINFO\t"T1"\tFoo.cs\tline 0\t[DoWork]\t"Target Vir own"`,
      `2024-01-15 10:00:10,000\tINFO\t"T2"\tFoo.cs\tline 0\t[DoWork]\t"Target Vir foreign"`,
      `2024-01-15 10:00:10,000\tINFO\t"T1"\tFoo.cs\tline 0\t[DoWork]\t"Target Real"`,
    ].join("\n") + "\n";
    const f = await w.addFile("tie.log", lines, () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const plain = w.createLinkNode(real.id, vir.id, "before", 1);
    assert(w.getEntries(plain.id)[0].first.message === "Target Vir foreign", "baseline: the log-order nearest tie is T2's");
    const keyed = w.createLinkNode(real.id, vir.id, "before", 1, { key: { column: "thread" } });
    assert(w.getEntries(keyed.id)[0].first.message === "Target Vir own", "same Thread: the same-millisecond T1 line wins, not the 10 s older decoy");
  });

  await withApp(async (w, d, T) => {
    section("291c. Link dialog: Match only same (column / captured value)");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const move = w.createFilterNode(f.id, "text", "move requested");
    const reached = w.createFilterNode(f.id, "text", "position reached");
    w.render();
    w.openLinkDialog([move.id, reached.id]);
    const chipOf = id => d.querySelector('#linkKeyChips [data-key-chip="' + id + '"]');
    const chips = [...d.querySelectorAll("#linkKeyChips [data-key-chip]")].map(c => c.dataset.keyChip);
    assert(chips.includes("c:thread") && chips.includes("none") && chips.includes("pattern"),
      "key choices: the format's columns plus none and 'pattern…', got " + chips);
    assert(chipOf("none").getAttribute("aria-pressed") === "true" && !isVisible(d.querySelector("#linkKeyPatternRow"), w), "none by default (no shared name=value field): pattern row hidden");
    fireClick(chipOf("pattern"), w);
    assert(isVisible(d.querySelector("#linkKeyPatternRow"), w), "'pattern…' shows the pattern input");
    d.querySelector("#linkKeyPattern").value = "axis";
    d.querySelector("#linkKeyPattern").dispatchEvent(new w.Event("input", { bubbles: true }));
    await sleep(200);
    assert(d.querySelector("#linkLiveMatch").textContent.startsWith("Invalid key pattern"), "a pattern without a capture is flagged");
    const n0 = f.children.length;
    fireClick(d.querySelector("#linkDialogCreate"), w);
    assert(f.children.length === n0 && isVisible(d.querySelector("#linkDialog"), w), "Create refuses it and keeps the dialog open");
    d.querySelector("#linkKeyPattern").value = "axis [*:int]";
    d.querySelector("#linkKeyPattern").dispatchEvent(new w.Event("input", { bubbles: true }));
    await sleep(200);
    assert(d.querySelector("#linkLiveMatch").textContent.replace(/\s+/g, " ").trim().startsWith("3 pairs"), "preview with a valid key, got " + d.querySelector("#linkLiveMatch").textContent);
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(node.linkKey && node.linkKey.pattern === "axis [*:int]" && pairSummary(w.getEntries(node.id)) === "p1@500|p2@100|p1@900",
      "Create stores the captured-value key");
    w.openLinkDialog([move.id, reached.id]);
    assert(d.querySelector('#linkKeyChips [data-key-chip="none"]').getAttribute("aria-pressed") === "true" && !pillChecked(d.querySelector("#linkDtInput")), "reopening starts with no key and Δt off");
    w.closeLinkDialog();
  });

  await withApp(async (w, d, T) => {
    section("291d. linkKey/linkDt through every persistence carrier");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const move = w.createFilterNode(f.id, "text", "move requested");
    const reached = w.createFilterNode(f.id, "text", "position reached");
    const link = w.createLinkNode(move.id, reached.id, "after", 1, { key: { column: "thread" }, dt: { op: "<", ms: 950 } });
    const ok = n => n && n.linkKey && n.linkKey.column === "thread" && n.linkDt && n.linkDt.op === "<" && n.linkDt.ms === 950;
    const clone = w.cloneSubtree(link.id, f.id);
    assert(ok(clone) && clone.linkKey !== link.linkKey, "cloneSubtree copies both (fresh objects)");
    const snap = w.snapshotSubtree(link.id);
    w.deleteNode(link.id);
    const restored = w.restoreSubtree(snap);
    assert(ok(restored) && w.getEntries(restored.id).length === 2, "snapshotSubtree/restoreSubtree");
    const branch = w.serializeFilterBranch(restored.id, false);
    branch.roots.push(Object.assign(JSON.parse(JSON.stringify(branch.roots[0])), { linkDt: { op: "=", ms: 5 }, linkKey: { column: "" } }));
    const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(f.id)};`;
    d.body.appendChild(s);
    const before = new Set(f.children);
    w.importFilterJson(json);
    const imported = f.children.filter(id => !before.has(id)).map(id => T.state.nodes[id]);
    assert(imported.length === 2 && imported.some(ok) && imported.some(n => !n.linkDt && !n.linkKey),
      "serializeFilterBranch/importFilterJson round-trip; a malformed hand-edited condition is dropped");
    const { roots } = w.serializeFilterTreeForCache(f);
    const fake = { id: "fake-link-file", children: [] };
    w.materializeCachedFilters(fake, roots);
    assert(fake.children.map(id => T.state.nodes[id]).some(ok), "serializeFilterTreeForCache/materializeCachedFilters");
    // Nested bake (link of this link) + Unpack.
    const outer = w.createLinkNode(restored.id, move.id, "after", 1);
    assert(ok(outer.bakedA), "a chained link's baked reference side keeps the inner link's key and Δt");
    const unpacked = w.materializeBakedAsNode(outer.bakedA, f.id);
    assert(ok(unpacked), "Unpack (materializeBakedAsNode) restores them onto the node");
  });
}
