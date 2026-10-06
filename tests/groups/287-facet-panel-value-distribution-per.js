// GROUP 287 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 287 — Facet panel: value distribution per column
   Origin: 2026-09-26 (FEATURE_BACKLOG.md #84); since 2026-10-05 the facets are
   the second tab of the bottom panel (GROUP facets-bottom-tab). The toggle
   (Facets tab, Ctrl+I, remembered), one section per middle column + Level +
   Source for a merge, counts over the active node's result (level
   quick-filter included), "+k more", collapse, and the filter nodes a
   click creates (exact-value regex restricted to the column / level node /
   source entry-set; Alt+click and right-click = NOT), undoable.
   ============================================================ */
group(287);
{
  const line = (i, level, thread, method) => {
    const ss = String(i % 60).padStart(2, "0"), mm = String(Math.floor(i / 60) % 60).padStart(2, "0");
    return `2024-01-15 10:${mm}:${ss},000\t${level}\t"${thread}"\tC:\\src\\Foo.cs\tline ${i % 2}\t[${method}]\t"message ${i}"`;
  };
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(line(i, i < 4 ? "ERROR" : "INFO", i < 12 ? "Worker-3" : i < 18 ? "Worker-1" : "Motion", "M" + (i % 11)));
  const TEXT = rows.join("\n") + "\n";

  await withApp(async (w, d, T) => {
    section("287a. toggle + sections + counts");
    const f = await w.addFile("facets.log", TEXT, () => {});
    T.state.activeId = f.id; w.render();
    const panel = d.querySelector("#facetPanelBody");
    assert(!isVisible(panel, w), "closed by default");
    fireClick(d.querySelector("#lowerTabFacets"), w);
    assert(isVisible(panel, w) && d.querySelector("#lowerTabFacets").getAttribute("aria-selected") === "true", "the Facets tab opens it");
    assert(w.localStorage.getItem("philogg-lower-tab") === "facets", "open state remembered");
    const labels = [...d.querySelectorAll(".facet-section-head")].map(h => h.childNodes[1].textContent.trim());
    assert(labels.join(",") === "Thread,Location,Method,Level", "one section per middle column + Level, got " + labels);
    assert(d.querySelector("#facetPanelCount").textContent === "20 entries", "entry count in the header");
    const thread = d.querySelector('.facet-section[data-col="thread"]');
    const vals = [...thread.querySelectorAll(".facet-value")].map(v => v.querySelector(".facet-value-name").textContent + "=" + v.querySelector(".facet-count").textContent + "/" + v.querySelector(".facet-pct").textContent);
    assert(vals.join(" ") === "Worker-3=12/60% Worker-1=6/30% Motion=2/10%", "top values by count, got " + vals.join(" "));
    const method = d.querySelector('.facet-section[data-col="method"]');
    assert(method.querySelectorAll(".facet-value").length === 8 && method.querySelector(".facet-more").textContent.startsWith("(+3 more"), "top 8 plus a '+k more' line");
    fireClick(method.querySelector(".facet-more"), w);
    assert(d.querySelectorAll('.facet-section[data-col="method"] .facet-value').length === 11, "'+k more' reveals the rest");
    fireClick(d.querySelector('.facet-section[data-col="location"] .facet-section-head'), w);
    assert(d.querySelectorAll('.facet-section[data-col="location"] .facet-value').length === 0, "a section collapses");
    assert(JSON.parse(w.localStorage.getItem("philogg-facets-collapsed")).includes("location"), "collapsed sections remembered");
    // the level quick-filter narrows the facets like the Filtered view
    T.state.levelFilter.add("ERROR"); w.render();
    assert(d.querySelector("#facetPanelCount").textContent === "4 entries", "level quick-filter applies");
    T.state.levelFilter.clear(); w.render();
    // Ctrl+I closes it again
    fireKeydown(d, w, "i", { ctrlKey: true });
    assert(!isVisible(panel, w), "Ctrl+I switches back to Entry detail");
  });

  await withApp(async (w, d, T) => {
    section("287b. clicking values creates filter nodes (exact value, column-restricted; level; NOT); undoable");
    const f = await w.addFile("facets.log", TEXT, () => {});
    T.state.activeId = f.id; w.render();
    w.setFacetsOpen(true);
    const valueRow = (col, name) => [...d.querySelectorAll('.facet-section[data-col="' + col + '"] .facet-value')].find(v => v.querySelector(".facet-value-name").textContent === name);
    fireClick(valueRow("thread", "Worker-1"), w);
    let node = T.state.nodes[T.state.activeId];
    assert(node.parentId === f.id && node.filterType === "text" && node.isRegex && node.caseSensitive && node.value === "^Worker-1$" && JSON.stringify(node.columns) === '["thread"]',
      "exact-value regex restricted to the column, got " + JSON.stringify(node));
    assert(node.name === "Thread = Worker-1" && w.getEntries(node.id).length === 6, "readable name, exact count");
    assert(d.querySelector("#facetPanelCount").textContent === "6 entries", "the panel follows the new active node");
    const tId = node.id;
    w.undo();
    assert(!T.state.nodes[tId] && T.state.activeId === f.id, "undo removes it");
    valueRow("thread", "Worker-3").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, altKey: true }));
    node = T.state.nodes[T.state.activeId];
    assert(node.inverted && node.value === "^Worker-3$" && w.getEntries(node.id).length === 8, "Alt+click = NOT filter");
    T.state.activeId = f.id; w.render();
    fireContextMenu(valueRow("method", "M0"), w);
    node = T.state.nodes[T.state.activeId];
    assert(node.inverted && node.value === "^M0$" && JSON.stringify(node.columns) === '["method"]', "right-click = NOT filter too");
    T.state.activeId = f.id; w.render();
    fireClick(valueRow("level", "ERROR"), w);
    node = T.state.nodes[T.state.activeId];
    assert(node.filterType === "level" && JSON.stringify(node.value) === '["ERROR"]' && w.getEntries(node.id).length === 4, "Level facet → a level node");
    // regex specials in a value stay literal
    T.state.activeId = f.id; w.render();
    fireClick(valueRow("location", d.querySelector('.facet-section[data-col="location"] .facet-value-name').textContent), w);
    node = T.state.nodes[T.state.activeId];
    assert(w.getEntries(node.id).length > 0, "a value with regex specials (path, dots, colon) still matches itself, got " + node.value);
  });

  await withApp(async (w, d, T) => {
    section("287c. a merged file gets a Source facet; a click selects that source's entries");
    const fa = await w.addFile("src-a.log", makeLog(0, 5), () => {});
    const fb = await w.addFile("src-b.log", makeLog(10, 3, { msgPrefix: "other" }), () => {});
    const merged = await w.mergeFiles([fa.id, fb.id]);
    T.state.activeId = merged.id; w.render();
    w.setFacetsOpen(true);
    const src = d.querySelector('.facet-section[data-col="__source"]');
    assert(!!src, "Source section present for a merge");
    const names = [...src.querySelectorAll(".facet-value-name")].map(n => n.textContent);
    assert(names.join(",") === "src-a.log,src-b.log", "source names by count, got " + names);
    fireClick(src.querySelectorAll(".facet-value")[1], w);
    const node = T.state.nodes[T.state.activeId];
    assert(node.filterType === "idset" && node.name === "Source = src-b.log" && w.getEntries(node.id).length === 3, "source → entry-set filter of its 3 entries");
  });
}
