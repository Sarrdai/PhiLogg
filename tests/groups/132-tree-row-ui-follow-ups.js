// GROUP 132 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 132 — Tree row UI follow-ups (person-reported, screenshot-driven):
   generic collapse/expand for ANY node with children, extract nodes get a
   highlight-color swatch too, the row-count percentage bar is gone
   outright, and a new Settings -> Behavior "Tree row type indicator" (icon
   vs. TXT/LNK/... abbreviation, fixed-width either way) replaces the old
   always-both display.
   ============================================================ */
group(132);
await withApp(async (w, d, T) => {
  section("132. Tree row UI follow-ups: generic collapse, extract swatch, indicator setting");

  const f = await w.addFile("132.log", makeLog(0, 10), () => {});
  const parent = w.createFilterNode(f.id, "text", "message");
  const child = w.createFilterNode(parent.id, "text", "message 1");
  w.render();

  // --- Generic collapse/expand for an ordinary node with real children ---
  const parentChevron = () => d.querySelector('.tree-row[data-node-id="' + parent.id + '"] .tree-chevron');
  assert(parentChevron(), "a node with real children shows a chevron");
  assert(d.querySelector('.tree-row[data-node-id="' + child.id + '"]') !== null, "child is visible before collapsing");
  fireClick(parentChevron(), w);
  assert(T.state.nodes[parent.id].collapsed === true, "clicking the chevron sets node.collapsed");
  assert(d.querySelector('.tree-row[data-node-id="' + child.id + '"]') === null, "collapsing hides the child row");
  assert(d.querySelector('.tree-row[data-node-id="' + parent.id + '"]') !== null, "the parent's own row stays visible");
  assert(!w.flattenTreeIds().includes(child.id) && w.flattenTreeIds().includes(parent.id),
    "flattenTreeIds (arrow-key nav) skips a collapsed node's children but keeps the node itself");
  fireClick(parentChevron(), w);
  assert(T.state.nodes[parent.id].collapsed === false, "clicking again expands it back");
  assert(d.querySelector('.tree-row[data-node-id="' + child.id + '"]') !== null, "child reappears");

  // A leaf node gets an empty chevron slot — reserved space, no button —
  // so the icon never shifts.
  const leafSlot = d.querySelector('.tree-row[data-node-id="' + child.id + '"] .tree-chevron-slot');
  assert(leafSlot && !leafSlot.querySelector(".tree-chevron"), "a leaf row reserves the chevron slot but shows no button in it");

  const extract = w.createFilterNode(f.id, "text", "[*:float]");
  w.render();

  // --- The row-count percentage bar is gone outright (person-reported,
  // twice: unreadable even after a non-linear scale attempt — every row
  // still looked like an identical grey line) — the absolute count already
  // shown says what mattered. ---
  const noPctFile = await w.addFile("nopct.log", makeLog(0, 10), () => {});
  const noPctFilter = w.createFilterNode(noPctFile.id, "text", "message 1");
  w.render();
  assert(d.querySelector('.tree-row[data-node-id="' + noPctFilter.id + '"] .tree-pct') === null,
    "no .tree-pct element (the percentage bar) is rendered at all any more");

  // --- Extract nodes get a highlight-color swatch too ---
  const extractRow = d.querySelector('.tree-row[data-node-id="' + extract.id + '"]');
  assert(extractRow.querySelector(".tree-swatch"), "a plain (non-detached) extract node also gets a highlight-color swatch now");

  // --- Settings -> Behavior "Tree row type indicator" ---
  assert(d.getElementById("settingsTreeIndicatorMode").value === "icon", "defaults to icon mode");
  const parentRowIconMode = d.querySelector('.tree-row[data-node-id="' + parent.id + '"] .tree-icon');
  assert(!parentRowIconMode.classList.contains("tree-icon-type") && parentRowIconMode.textContent === "",
    "icon mode (default): the icon slot shows a glyph, not text");
  assert(d.querySelector('.tree-row[data-node-id="' + parent.id + '"] .tree-type-tag') === null,
    "...and the separate TXT/LNK/... badge is never shown at all (person-reported: it used to duplicate icon mode's own info) — the type is only ever stated once, at the icon's own position");

  d.getElementById("settingsTreeIndicatorMode").value = "type";
  d.getElementById("settingsTreeIndicatorMode").dispatchEvent(new w.Event("change", { bubbles: true }));
  const parentRowTypeMode = d.querySelector('.tree-row[data-node-id="' + parent.id + '"] .tree-icon');
  assert(parentRowTypeMode.classList.contains("tree-icon-type") && parentRowTypeMode.textContent === w.typeTagFor(T.state.nodes[parent.id]),
    "type mode: the icon slot shows the TXT/LNK/... abbreviation instead");
  assert(d.querySelector('.tree-row[data-node-id="' + parent.id + '"] .tree-type-tag') === null,
    "...and the separate badge stays absent here too");

  // Setting persists (same localStorage-preference tier every other
  // Settings -> Behavior toggle in this app uses).
  assert(w.localStorage.getItem("philogg-tree-indicator-mode") === "type", "the mode is persisted to localStorage");
});
