// GROUP level-toolbar-fixed-slot — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP level-toolbar-fixed-slot — Runde I / I1 (usability test 2026-10-09):
   toggling a level chip must not move the buttons to its right, and the
   entries left by the chips are visible. "Add level filter"
   (#btnApplyLevelToTree) is always rendered (disabled without a chip), the
   count pill #levelCountPill ("405 / 2.500") follows it in a reserved slot,
   the header reads "<n> of <total> entries shown" while chips are active.
   jsdom has no layout, so "nothing moves" is pinned structurally (same
   siblings in the same order, nothing display:none, the pill's reserved
   min-width identical); the real x-positions were measured in Chromium.
   ============================================================ */
group("level-toolbar-fixed-slot");

await withApp(async (w, d, T) => {
  section("level-toolbar-fixed-slot a. the slot layout is identical with and without active chips");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {}); // 4 ERROR / 16 INFO
  T.state.activeId = f.id;
  w.render();
  const row = d.querySelector("#vbLevel .vb-group-row");
  const apply = d.querySelector("#btnApplyLevelToTree");
  const pill = d.querySelector("#levelCountPill");
  const layout = () => [...row.children].map(c => c.id).join(",");
  const sepsAfter = () => {
    const out = [];
    for (let n = d.querySelector("#vbLevel").nextElementSibling; n; n = n.nextElementSibling) out.push((n.id || n.className) + ":" + w.getComputedStyle(n).display);
    return out.join("|");
  };
  const before = { layout: layout(), after: sepsAfter(), minW: pill.style.minWidth, applyDisplay: w.getComputedStyle(apply).display };
  assert(before.applyDisplay !== "none", "no chip: Add level filter is still rendered (not display:none)");
  assert(apply.disabled, "no chip: Add level filter is disabled");
  assert(!pill.hidden && pill.classList.contains("idle"), "no chip: the pill slot is reserved but idle (invisible)");
  assert(w.getComputedStyle(pill).visibility === "hidden", "no chip: the idle pill takes space but is not visible");
  assert(before.layout.indexOf("levelBar,levelCountPill,btnApplyLevelToTree") === 0, "order: chips, count pill, Add level filter, got " + before.layout);

  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  assert(layout() === before.layout, "with a chip: same children in the same order");
  assert(sepsAfter() === before.after, "with a chip: the groups/separators to the right are unchanged");
  assert(pill.style.minWidth === before.minW && before.minW !== "", "with a chip: the pill's reserved width is unchanged (" + before.minW + ")");
  assert(w.getComputedStyle(apply).display === before.applyDisplay && !apply.disabled, "with a chip: Add level filter is enabled in the same slot");
  assert(apply.title === "Add level filter", "its tooltip is the same with and without a chip");
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(layout() === before.layout && pill.style.minWidth === before.minW, "two chips: still the same layout");
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(layout() === before.layout && sepsAfter() === before.after && apply.disabled, "chips cleared: back to the idle layout");
});

await withApp(async (w, d, T) => {
  section("level-toolbar-fixed-slot b. count pill and header text");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {}); // 4 ERROR / 16 INFO
  T.state.activeId = f.id;
  w.render();
  const pill = d.querySelector("#levelCountPill");
  const status = () => d.querySelector("#statusText").textContent;
  assert(status() === "1 file · 20 entries", "no chip: header unchanged, got " + JSON.stringify(status()));
  assert(pill.textContent === "20 / 20", "no chip: the (invisible) pill holds the total, got " + JSON.stringify(pill.textContent));
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  assert(pill.textContent === "4 / 20" && !pill.classList.contains("idle"), "ERROR: pill shows 4 / 20, got " + JSON.stringify(pill.textContent));
  assert(status() === "1 file · 4 of 20 entries shown", "ERROR: header reads '4 of 20 entries shown', got " + JSON.stringify(status()));
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(pill.textContent === "20 / 20" && status() === "1 file · 20 of 20 entries shown", "both chips: 20 / 20, got " + pill.textContent + " / " + status());
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(status() === "1 file · 20 entries" && pill.classList.contains("idle"), "chips cleared: header and pill back to idle, got " + status());

  section("level-toolbar-fixed-slot c. the pill counts the active node, not the file");
  const flt = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = flt.id; T.state.multiSelect = new Set([flt.id]);
  w.render();
  const nodeTotal = w.getEntries(flt.id).length;
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(pill.textContent.endsWith("/ " + nodeTotal), "filter node: total is the node's own " + nodeTotal + ", got " + pill.textContent);
  assert(Number(pill.textContent.split(" / ")[0]) === T.currentViewEntries.length, "the pill's shown count equals the Filtered view's rows (" + T.currentViewEntries.length + "), got " + pill.textContent);
  fireClick(d.querySelector("#btnApplyLevelToTree"), w);
  assert(T.state.levelFilter.size === 0 && d.querySelector("#btnApplyLevelToTree").disabled, "Add level filter consumed the chips and is disabled again");
});
