// GROUP time-label-wrap — loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP time-label-wrap — time-filter tree labels wrap onto at most 2 lines,
   breaking only after the " – " / " · " separators
   Origin: 2026-10-04 (time-window workflow). Generated time names were cut
   at the default 270px sidebar. renderNode now renders them as nowrap
   .tl-seg spans separated by single spaces inside a line-clamped
   .tree-label-wrap. jsdom has no layout: this pins the structure, the
   unchanged textContent and the CSS; the geometry was checked in the real
   app (screenshots).
   ============================================================ */
group("time-label-wrap");
await withApp(async (w, d, T) => {
  section("time-label-wrap a. Segments, textContent, non-time nodes, custom labels, inverted prefix");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const node = w.createFilterNode(f.id, "timerange", { from: f.entries[5].ts, to: f.entries[20].ts });
  const half = w.createFilterNode(node.id, "timerange", { from: f.entries[8].ts, to: null });
  const text = w.createFilterNode(f.id, "text", { text: "ERROR" });
  w.render();
  const labelOf = n => d.querySelector(`.tree-row[data-node-id="${n.id}"] .tree-label`);
  const l = labelOf(node);
  assert(l && l.classList.contains("tree-label-wrap"), "time node label is a wrap label");
  const segs = [...l.querySelectorAll(".tl-seg")].map(s => s.textContent);
  const durEl = l.querySelector(".tl-dur");
  assert(segs.length === 2 && segs[0].endsWith(" –") && segs[1].endsWith(" ·") && durEl && /^\d/.test(durEl.textContent), "two bound segments (separator stays with the preceding one) plus the duration element: " + JSON.stringify(segs));
  assert(l.textContent === w.nodeDisplayName(node), "textContent identical to the name: " + l.textContent);
  assert(segs.every(s => !/\d\s\d/.test(s)), "no segment is split inside a time");
  const lh = labelOf(half);
  assert(lh.textContent === w.nodeDisplayName(half) && lh.querySelectorAll(".tl-seg").length === 1, "single-bound label is one nowrap segment: " + lh.textContent);
  const lt = labelOf(text);
  assert(!lt.classList.contains("tree-label-wrap") && !lt.querySelector(".tl-seg"), "non-time node stays a plain single-line label");

  node.inverted = true;
  w.render();
  const li = labelOf(node);
  assert(li.textContent === "¬ " + w.nodeDisplayName(node) && li.querySelector(".tl-seg").textContent.startsWith("¬ "), "inverted prefix kept: " + li.textContent);
  node.inverted = false;

  node.label = "My window";
  w.render();
  const lc = labelOf(node);
  assert(lc.textContent === "My window" && !lc.classList.contains("tree-label-wrap"), "a custom label is not wrapped");
  node.label = null;

  w.startRenameNode(node.id);
  assert(labelOf(node).querySelector(".tree-rename-input"), "inline rename still shows its input");
  fireKeydown(d.querySelector(".tree-rename-input"), w, "Escape");
  assert(labelOf(node).classList.contains("tree-label-wrap"), "wrap label back after rename");
});

await withApp(async (w, d, T) => {
  section("time-label-wrap b. CSS: 2-line clamp, nowrap segments, scoped to wrap labels only");
  const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
  assert(/\.tree-label\.tree-label-wrap\{[^}]*-webkit-line-clamp:\s*2/.test(css), "line clamp of 2 on .tree-label-wrap");
  assert(/\.tree-label\.tree-label-wrap\{[^}]*white-space:\s*normal/.test(css), "wrap label allows wrapping");
  assert(/\.tree-label-wrap \.tl-seg\{[^}]*white-space:\s*nowrap/.test(css), "segments never wrap inside");
  assert(!/\.tree-row:has\(> \.tree-label-wrap\)/.test(css), "the row keeps align-items:center: wrap label is vertically centred like every label");
  assert(/\.tree-row\{[^}]*align-items:\s*center/.test(css), "tree rows centre their children");
  assert(/\.tree-label\{[^}]*white-space:\s*nowrap/.test(css), "every other label stays nowrap");
});
