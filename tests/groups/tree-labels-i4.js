// GROUP tree-labels-i4 — loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP tree-labels-i4 — Round I, package I4 (filter tree)
   Origin: 2026-10-09 (desktop usability test, person-decided mockup I4).
   1. Long labels are cut in the MIDDLE (head shrinks, the tail stays),
      the full text is in the tooltip; the hover buttons no longer reserve
      width next to the count.
   2. Inverted nodes get a red "NOT" badge before the label (no "¬" prefix).
   3. Time-window nodes: one line "08:00:09–08:00:11 · 1.9s", milliseconds
      only in the tooltip (supersedes the old two-line GROUP time-label-wrap).
   4. Right-click: the target row is outlined and the menu header names it;
      the selection does not change.
   jsdom has no layout: structure, text and CSS are pinned here; the
   geometry was checked in the real app (screenshots).
   ============================================================ */
group("tree-labels-i4");
const [TL4_SIM] = LOGSIM.generateToStrings({ entries: 200, seed: 7 });

await withApp(async (w, d, T) => {
  section("tree-labels-i4 a. Middle ellipsis: head/tail split, textContent and tooltip unchanged, short labels plain");
  const f = await w.addFile("a.log", TL4_SIM.text, () => {});
  T.state.activeId = f.id;
  const long = w.createFilterNode(f.id, "text", "Database connection pool exhausted while waiting for a free slot");
  const short = w.createFilterNode(f.id, "text", "Heartbeat");
  w.render();
  const labelOf = n => d.querySelector(`.tree-row[data-node-id="${n.id}"] .tree-label`);
  const l = labelOf(long);
  assert(l.classList.contains("tree-label-mid"), "long label is a middle-ellipsis label");
  const head = l.querySelector(".tl-head"), tail = l.querySelector(".tl-tail");
  assert(head && tail && tail.textContent.length >= 8 && l.textContent === w.nodeDisplayName(long), "head + tail, textContent equals the name: " + l.textContent);
  assert(l.title.includes(w.nodeDisplayName(long)), "tooltip carries the full text");
  const s = labelOf(short);
  assert(!s.classList.contains("tree-label-mid") && !s.querySelector(".tl-head") && s.textContent === w.nodeDisplayName(short), "short label stays one plain text node");
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(/\.tree-label-mid \.tl-head\{[^}]*text-overflow:\s*ellipsis/.test(css) && /\.tree-label-mid \.tl-tail\{[^}]*flex:\s*none/.test(css), "CSS: head ellipsis, tail never shrinks");
  assert(/\.tree-label-mid \.tl-head\{[^}]*white-space:\s*pre/.test(css), "CSS: white-space:pre keeps the blank at the split point");
  assert(/\.tree-del[^{]*\{[^}]*position:\s*absolute/.test(css), "CSS: the hover delete button overlays the row instead of reserving width");
});

await withApp(async (w, d, T) => {
  section("tree-labels-i4 b. NOT badge instead of the ¬ prefix");
  const f = await w.addFile("a.log", TL4_SIM.text, () => {});
  const n = w.createFilterNode(f.id, "text", "Heartbeat");
  w.render();
  const row = () => d.querySelector(`.tree-row[data-node-id="${n.id}"]`);
  assert(!row().querySelector(".tree-not-badge"), "no badge on a normal node");
  n.inverted = true;
  w.render();
  const badge = row().querySelector(".tree-not-badge");
  assert(badge && badge.textContent === "NOT", "inverted node has a NOT badge");
  assert(badge.nextElementSibling === row().querySelector(".tree-label"), "the badge sits right before the label");
  assert(!row().querySelector(".tree-label").textContent.includes("¬"), "the label text has no ¬ prefix: " + row().querySelector(".tree-label").textContent);
  assert(row().querySelector(".tree-label").title.startsWith("Inverted (NOT)"), "tooltip still says Inverted (NOT)");
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(/\.tree-not-badge\{[^}]*background:\s*var\(--level-error\)/.test(css), "CSS: red badge");
  n.inverted = false;
  w.render();
  assert(!row().querySelector(".tree-not-badge"), "badge gone again after un-inverting");
});

await withApp(async (w, d, T) => {
  section("tree-labels-i4 c. Time-window node: one line, compact text, milliseconds only in the tooltip");
  const f = await w.addFile("a.log", TL4_SIM.text, () => {});
  const ts = f.entries.map(e => e.ts);
  const node = w.createFilterNode(f.id, "timerange", { from: ts[10], to: ts[10] + 1900 });
  const half = w.createFilterNode(node.id, "timerange", { from: ts[12], to: null });
  w.render();
  const labelOf = n => d.querySelector(`.tree-row[data-node-id="${n.id}"] .tree-label`);
  const l = labelOf(node);
  assert(/^\d\d:\d\d:\d\d–\d\d:\d\d:\d\d · 1\.9s$/.test(l.textContent), "compact text without ms, spaces only around the dot: " + l.textContent);
  assert(l.querySelector(".tl-range") && l.querySelector(".tl-dur").textContent === "1.9s", "bounds and duration are separate elements");
  assert(/\.\d\d\d/.test(node.name), "sanity: the node's own name still carries milliseconds: " + node.name);
  assert(/\.\d\d\d/.test(l.title), "tooltip has the milliseconds: " + l.title);
  assert(labelOf(half).textContent === w.nodeDisplayName(half) && !labelOf(half).querySelector(".tl-dur"), "single-bound node: plain one-line label");
  node.label = "My window";
  w.render();
  assert(labelOf(node).textContent === "My window", "a custom label wins");
  node.label = null;
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(!/-webkit-line-clamp/.test(css.slice(css.indexOf(".tree-label-time"), css.indexOf(".tree-label-time") + 300)), "CSS: no 2-line clamp on time labels any more");
  assert(/\.tree-label-time \.tl-dur\{[^}]*flex:\s*none/.test(css) && /\.tree-label-time \.tl-range\{[^}]*text-overflow:\s*ellipsis/.test(css), "CSS: duration never shrinks, bounds get the ellipsis");
});

await withApp(async (w, d, T) => {
  section("tree-labels-i4 d. Right-click outlines the target and names it in the menu; selection unchanged");
  const f = await w.addFile("a.log", TL4_SIM.text, () => {});
  const a = w.createFilterNode(f.id, "text", "ERROR");
  const b = w.createFilterNode(f.id, "text", "Heartbeat");
  b.inverted = true;
  T.state.activeId = a.id;
  w.render();
  const row = n => d.querySelector(`.tree-row[data-node-id="${n.id}"]`);
  const menu = d.querySelector("#treeContextMenu");
  fireContextMenu(row(b), w);
  assert(!menu.classList.contains("hidden"), "menu open");
  assert(row(b).classList.contains("ctx-target") && !row(a).classList.contains("ctx-target"), "only the right-clicked row is outlined");
  assert(T.state.activeId === a.id && row(a).classList.contains("active"), "the selection did not change");
  const head = menu.querySelector(".ctx-target-head");
  assert(head && head.textContent.includes("Heartbeat") && head.textContent.includes("NOT"), "header names the target: " + (head && head.textContent));
  w.render();
  assert(row(b).classList.contains("ctx-target"), "the outline survives a tree re-render while the menu is open");
  fireContextMenu(row(a), w);
  assert(row(a).classList.contains("ctx-target") && !row(b).classList.contains("ctx-target"), "a second right-click moves the outline");
  w.closeTreeContextMenu();
  assert(!d.querySelector(".tree-row.ctx-target"), "closing the menu removes the outline");
  fireContextMenu(row(b), w);
  fireClick(d.body, w);
  assert(menu.classList.contains("hidden") && !d.querySelector(".tree-row.ctx-target"), "an outside click closes the menu and removes the outline");
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(/\.tree-row\.ctx-target\{[^}]*outline:[^}]*var\(--accent\)/.test(css), "CSS: accent outline");
});
