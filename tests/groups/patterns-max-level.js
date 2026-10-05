// GROUP patterns-max-level — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness helper is in scope.

/* ============================================================
   GROUP patterns-max-level — Patterns tab "Max level" column
   Origin: 2026-10-05 (usability polish p1-b). The column shows the worst
   level of a group; mixed groups add "n/total" after the badge and a
   tooltip with the per-level breakdown; pure groups show the badge alone.
   Data: tools/log-sim (default scenarios).
   ============================================================ */
group("patterns-max-level");
{
  await withApp(async (w, d, T) => {
    const [sim] = LOGSIM.generateToStrings({ entries: 800, seed: 7 });
    const f = await w.addFile(sim.name, sim.text, () => {});
    T.state.activeId = f.id; w.render();
    w.applyFhView("patterns");

    section("patterns-max-level a. header label and tooltip");
    const head = d.querySelector('#patternsHead [data-sort="level"]');
    assert(head.textContent.startsWith("Max level"), "header reads 'Max level', got " + head.textContent);
    assert(head.title === "Most severe level in the group; n/total = how many entries have it", "header tooltip explains n/total, got " + head.title);

    section("patterns-max-level b. accumulator counts per level bucket");
    const groups = T.patternsAnalysis(f.id).result.groups;
    const mixed = groups.filter(g => g.levels.size > 1).sort((a, b) => b.count - a.count)[0];
    const pure = groups.filter(g => g.levels.size === 1 && g.level && g.level !== "OTHER").sort((a, b) => b.count - a.count)[0];
    assert(mixed && pure, "simulator data has a mixed and a pure group");
    assert([...mixed.levels.values()].reduce((a, b) => a + b, 0) === mixed.count, "per-level counts add up to the group count");
    assert(mixed.levels.get(mixed.level) > 0 && mixed.levels.get(mixed.level) < mixed.count, "the worst level's count is part of the total");

    section("patterns-max-level c. rows: suffix on mixed groups, tooltip, pure groups unchanged");
    const rowOf = g => [...d.querySelectorAll("#patternsRows .pattern-row")].find(r => r.querySelector(".pattern-text").title === w.patternDisplayText(g.key));
    // the visible window is virtualised: scroll data order so both groups render
    T.patternsSortKey = "count"; T.patternsSortDir = "desc"; w.renderPatternsView();
    const mr = rowOf(mixed), pr = rowOf(pure);
    assert(mr && pr, "both rows are rendered");
    const cell = mr.querySelector(".patterns-level");
    assert(cell.querySelector(".level-badge").textContent === mixed.level, "badge stays the worst level");
    assert(cell.querySelector(".patterns-level-n").textContent === mixed.levels.get(mixed.level) + "/" + mixed.count, "suffix n/total, got " + cell.querySelector(".patterns-level-n").textContent);
    const tipParts = cell.title.split(" · ");
    assert(tipParts.length === mixed.levels.size && tipParts[0].startsWith(mixed.level + " "), "tooltip lists levels, worst first, got " + cell.title);
    assert(tipParts.every(p => /^[A-Za-z0-9_-]+ \d+$/.test(p)) && tipParts.reduce((a, p) => a + Number(p.split(" ")[1]), 0) === mixed.count, "tooltip counts add up");
    const pcell = pr.querySelector(".patterns-level");
    assert(pcell.querySelector(".level-badge").textContent === pure.level && !pcell.querySelector(".patterns-level-n") && !pcell.title, "pure group: badge alone, no tooltip");

    section("patterns-max-level d. level sort unchanged");
    fireClick(d.querySelector('#patternsHead [data-sort="level"]'), w);
    const ranks = [...d.querySelectorAll("#patternsRows .pattern-row .level-badge")].map(b => groups.find(g => g.level === b.textContent).rank);
    assert(ranks.length > 2 && ranks.every((r, i) => i === 0 || ranks[i - 1] <= r), "sorted by worst-level rank, most severe first");
  });
}
