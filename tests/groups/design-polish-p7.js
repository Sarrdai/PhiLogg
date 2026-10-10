// GROUP design-polish-p7 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p7 — filter tree guides and rows (B4)
   Origin: 2026-10-10 design polish round, package P7.
   ============================================================ */
group("design-polish-p7");

await withApp(async (w, d, T) => {
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
  const esc = sel => sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = sel => {
    const m = css.match(new RegExp("^\\s*" + esc(sel) + "\\s*\\{([^}]*)\\}", "m"));
    return m ? m[1] : "";
  };
  const f = await w.addFile("a.log", makeLog(0, 8), () => {});
  const A = w.createFilterNode(f.id, "text", "message");
  const A1 = w.createFilterNode(A.id, "text", "1");
  const A1a = w.createFilterNode(A1.id, "text", "Database connection pool exhausted while waiting for a free slot");
  const L = w.createFilterNode(f.id, "level", ["ERROR"]);
  T.state.activeId = A1a.id;
  w.render();
  const rowOf = n => d.querySelector('#tree .tree-row[data-node-id="' + n.id + '"]');

  section("design-polish-p7 a. guides: 1px, soft color, no horizontal stubs");
  assert(/border:0 solid color-mix\(in srgb, var\(--border-soft\) 75%, var\(--bg-panel\)\)/.test(body(".tree-guide")), "guide color: " + body(".tree-guide"));
  assert(/border-left-width:1px/.test(body(".tree-guide.v")), "vertical guide is 1px");
  assert(!/\.tree-guide\.h\b/.test(css), "no .tree-guide.h rule left");
  assert(d.querySelectorAll("#tree .tree-guide.h").length === 0 && d.querySelectorAll("#tree .tree-guide.v").length > 0, "only vertical segments are rendered");
  assert(/border-left-width:1\.5px/.test(body(".tree-guide.on")) && /border-color:var\(--accent\)/.test(body(".tree-guide.on")), "accent path line is 1.5px accent");
  assert(rowOf(f).classList.contains("on-path") && rowOf(A).classList.contains("on-path") && !rowOf(A1a).classList.contains("on-path") === true, "ancestors of the selected node carry .on-path");

  section("design-polish-p7 b. indent step and chevron column");
  const pads = [f, A, A1, A1a].map(n => parseFloat(rowOf(n).style.paddingLeft));
  assert(pads[1] - pads[0] === 18 && pads[2] - pads[1] === 18 && pads[3] - pads[2] === 18, "18px per level, got " + pads.join());
  assert(/width:14px/.test(body(".tree-chevron-slot")), "chevron slot is a 14px column");
  const stem = [...rowOf(A).querySelectorAll(":scope > .tree-guide")].find(g => g.style.top.startsWith("calc(50%"));
  assert(stem && parseFloat(stem.style.left) === pads[1] + 7, "stem to the children runs at the chevron center, below the chevron: " + (stem && stem.style.left + " " + stem.style.top));

  section("design-polish-p7 c. names: end ellipsis, full name in the title");
  const label = rowOf(A1a).querySelector(".tree-label");
  assert(/text-overflow:ellipsis/.test(body(".tree-label")) && /overflow:hidden/.test(body(".tree-label")) && /white-space:nowrap/.test(body(".tree-label")), "label truncates with an ellipsis at the end");
  assert(label.children.length === 0 && label.textContent === w.nodeDisplayName(A1a), "label is the plain full name, no head/tail split");
  assert(label.title.includes(w.nodeDisplayName(A1a)), "title carries the full name");
  assert(!/tree-label-mid/.test(css), "middle-cut CSS removed");

  section("design-polish-p7 d. hover icons replace the count");
  const rule = css.match(/\.tree-row:hover:has\(\.tree-actions > \*\) \.tree-count,[^{]*\{([^}]*)\}/);
  assert(rule && /visibility:hidden/.test(rule[1]), "count is hidden while the hover icons show");
  assert(/\.tree-row:has\(\.tree-actions:focus-within\) \.tree-count/.test(css), "...also when the icons are focused");

  section("design-polish-p7 e. level filter uses the regular filter icon");
  const href = n => rowOf(n).querySelector(".tree-icon use").getAttribute("href");
  assert(href(L) === href(A) && href(L) === "#i-filter", "level node icon = text filter icon, got " + href(L));
});
