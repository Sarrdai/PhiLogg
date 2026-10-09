// GROUP i6-facets — loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP i6-facets — Round I, package I6 (small fixes), item 1
   Origin: 2026-10-09 (desktop usability test, Latte). The facet value text
   was level-coloured on the share bar and the bar ran under the number
   columns. Now: the name is in the normal text colour with a 3px level-colour
   stripe at its left, the bar ends before the number columns (--facet-bar-r =
   their width, per row kind), and ties are visible: equal counts share a
   rank (1, 1, 3) and the header says "top tied" when the two largest
   counts are equal. jsdom has no layout, so structure and CSS text are
   pinned here; the picture was checked in the real app (screenshots).
   ============================================================ */
group("i6-facets");

// A simulator file whose Thread column has a tie for the most frequent value (deterministic search over seeds).
function i6TiedSim() {
  for (let seed = 1; seed < 200; seed++) {
    const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 60, seed });
    const counts = new Map();
    sim.text.split("\n").forEach(l => { const t = l.split("\t")[2]; if (t) counts.set(t, (counts.get(t) || 0) + 1); });
    const sorted = [...counts.values()].sort((a, b) => b - a);
    if (sorted.length > 3 && sorted[0] === sorted[1] && sorted[1] > sorted[2]) return { sim, seed };
  }
  return null;
}

await withApp(async (w, d, T) => {
  section("i6-facets a. level stripe + normal text colour, bar ends before the number columns (CSS)");
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(/\.facet-value-name\[class\*="lvl-"\]\{[^}]*box-shadow:\s*inset 3px 0 0 var\(--lvl\)/.test(css), "CSS: a level class draws a 3px inset stripe in --lvl");
  assert(/\.facet-value-name\.lvl-error\{--lvl:var\(--level-error\);?\}/.test(css), "CSS: the level class only sets --lvl");
  assert(!/\.facet-value-name\.lvl-[a-z0-9-]+\{color:/.test(css), "CSS: no level class colours the text any more");
  assert(/\.facet-bar\{[^}]*right:\s*var\(--facet-bar-r\)/.test(css), "CSS: the bar's right edge is the number-column width");
  assert(/\.facet-value\{--facet-bar-r:92px/.test(css), "plain rows: 42 + 30 + gaps + padding = 92px");
  assert(/\.facet-value-link\{[^}]*--facet-bar-r:228px/.test(css), "link rows: 42 + 40 + 120 + gaps + padding = 228px");
  assert(/body\.layout-phone \.facet-value-link\{[^}]*--facet-bar-r:202px/.test(css), "phone link rows: 202px");
  assert(/\.facet-value > \.facet-rank\{[^}]*position:\s*absolute/.test(css), "the rank sits in the left gutter");
});

await withApp(async (w, d, T) => {
  section("i6-facets b. rank numbers: equal counts share a rank, 'top tied' in the header");
  const tied = i6TiedSim();
  assert(!!tied, "the simulator offers a file with a tied top thread");
  const f = await w.addFile("tied.log", tied.sim.text, () => {});
  T.state.activeId = f.id; w.render();
  fireClick(d.querySelector("#lowerTabFacets"), w);
  const sec = d.querySelector('.facet-section[data-col="thread"]');
  assert(!!sec, "Thread section");
  const rows = [...sec.querySelectorAll(".facet-value")];
  const counts = rows.map(r => +r.querySelector(".facet-count").textContent.replace(/\./g, ""));
  const ranks = rows.map(r => +r.querySelector(".facet-rank").textContent);
  assert(counts[0] === counts[1] && ranks[0] === 1 && ranks[1] === 1, "the tied top two both rank 1: " + ranks + " / " + counts);
  assert(ranks[2] === 3, "the next one is rank 3 (competition ranking), got " + ranks);
  rows.forEach((r, i) => assert(ranks[i] === 1 + counts.findIndex(c => c === counts[i]), "rank " + ranks[i] + " = 1 + first index of count " + counts[i]));
  const note = sec.querySelector(".facet-section-note").textContent;
  assert(/ values · top tied$/.test(note), "header note ends in 'top tied', got " + note);
  // The value text keeps its level class (stripe), but is not coloured through it.
  const lvlSec = d.querySelector('.facet-section[data-col="level"]');
  assert(!!lvlSec, "Level section");
  assert([...lvlSec.querySelectorAll(".facet-value-name")].every(n => /lvl-/.test(n.className)), "level values carry their level class for the stripe");
});

await withApp(async (w, d, T) => {
  section("i6-facets c. no tie at the top: no hint, ranks strictly follow the order");
  // A level-restricted node whose top count is unique: take the simulator file and look for a column without a top tie.
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 300, seed: 7 });
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id; w.render();
  fireClick(d.querySelector("#lowerTabFacets"), w);
  const secs = [...d.querySelectorAll(".facet-section")];
  secs.forEach(s => {
    const counts = [...s.querySelectorAll(".facet-value .facet-count")].map(x => +x.textContent.replace(/\./g, ""));
    const tieTop = counts.length > 1 && counts[0] === counts[1];
    assert(/top tied/.test(s.querySelector(".facet-section-note").textContent) === tieTop, s.dataset.col + ": 'top tied' iff the two largest counts are equal");
  });
  const first = d.querySelector(".facet-value .facet-rank");
  assert(first && first.textContent === "1", "the first row is rank 1");
});
