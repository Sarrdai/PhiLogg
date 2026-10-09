// GROUP level-toolbar-fixed-slot — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP level-toolbar-fixed-slot — Runde I / I1 (usability test 2026-10-09):
   toggling a level chip must not move the buttons to its right, and the
   entries left by the chips are visible in the header. "Add level filter"
   (#btnApplyLevelToTree) is always rendered right after the chips (disabled
   without a chip); the header reads "<n> of <total> entries shown" while
   chips are active. (The count pill of the first version was removed after
   review: the counts in the chips are enough.)
   jsdom has no layout, so "nothing moves" is pinned structurally (same
   siblings in the same order, nothing display:none); the real x-positions
   were measured in Chromium.
   ============================================================ */
group("level-toolbar-fixed-slot");

await withApp(async (w, d, T) => {
  section("level-toolbar-fixed-slot a. the slot layout is identical with and without active chips");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {}); // 4 ERROR / 16 INFO
  T.state.activeId = f.id;
  w.render();
  const row = d.querySelector("#vbLevel .vb-group-row");
  const apply = d.querySelector("#btnApplyLevelToTree");
  const layout = () => [...row.children].map(c => c.id).join(",");
  const sepsAfter = () => {
    const out = [];
    for (let n = d.querySelector("#vbLevel").nextElementSibling; n; n = n.nextElementSibling) out.push((n.id || n.className) + ":" + w.getComputedStyle(n).display);
    return out.join("|");
  };
  const before = { layout: layout(), after: sepsAfter(), applyDisplay: w.getComputedStyle(apply).display };
  assert(before.applyDisplay !== "none", "no chip: Add level filter is still rendered (not display:none)");
  assert(apply.disabled, "no chip: Add level filter is disabled");
  assert(!d.querySelector("#levelCountPill"), "no count pill any more");
  assert(before.layout === "levelBar,btnApplyLevelToTree", "order: chips, then Add level filter directly, got " + before.layout);

  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  assert(layout() === before.layout, "with a chip: same children in the same order");
  assert(sepsAfter() === before.after, "with a chip: the groups/separators to the right are unchanged");
  assert(w.getComputedStyle(apply).display === before.applyDisplay && !apply.disabled, "with a chip: Add level filter is enabled in the same slot");
  assert(apply.title === "Add level filter", "its tooltip is the same with and without a chip");
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(layout() === before.layout, "two chips: still the same layout");
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(layout() === before.layout && sepsAfter() === before.after && apply.disabled, "chips cleared: back to the idle layout");
});

await withApp(async (w, d, T) => {
  section("level-toolbar-fixed-slot b. header text");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {}); // 4 ERROR / 16 INFO
  T.state.activeId = f.id;
  w.render();
  const status = () => d.querySelector("#statusText").textContent;
  assert(status() === "1 file · 20 entries", "no chip: header unchanged, got " + JSON.stringify(status()));
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  assert(status() === "1 file · 4 of 20 entries shown", "ERROR: header reads '4 of 20 entries shown', got " + JSON.stringify(status()));
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(status() === "1 file · 20 of 20 entries shown", "both chips: 20 of 20, got " + status());
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(status() === "1 file · 20 entries", "chips cleared: header back to idle, got " + status());

  section("level-toolbar-fixed-slot c. the header counts the active node, not the file");
  const flt = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = flt.id; T.state.multiSelect = new Set([flt.id]);
  w.render();
  const nodeTotal = w.getEntries(flt.id).length;
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  const m = /(\d[\d.]*) of (\d[\d.]*) entries shown/.exec(status());
  assert(m && Number(m[2].replace(/\./g, "")) === nodeTotal, "filter node: total is the node's own " + nodeTotal + ", got " + status());
  assert(m && Number(m[1].replace(/\./g, "")) === T.currentViewEntries.length, "the shown count equals the Filtered view's rows (" + T.currentViewEntries.length + "), got " + status());
  fireClick(d.querySelector("#btnApplyLevelToTree"), w);
  assert(T.state.levelFilter.size === 0 && d.querySelector("#btnApplyLevelToTree").disabled, "Add level filter consumed the chips and is disabled again");
});
