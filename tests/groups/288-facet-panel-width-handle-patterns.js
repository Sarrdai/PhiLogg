// GROUP 288 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 288 — Facet panel width handle + Patterns as the first view tab
   Origin: 2026-09-26 (person-requested). #facetResizer on the panel's left
   edge resizes it (drag left grows, clamped to 180px..viewArea-240px) and
   hides with the panel; the View Selector starts with Patterns so Ctrl+1..5
   run left to right.
   ============================================================ */
group(288);
await withApp(async (w, d, T) => {
  section("288a. dragging #facetResizer sets the facet panel width, clamped");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id; w.render();
  w.setFacetsOpen(true);
  const panel = d.querySelector("#facetPanel"), handle = d.querySelector("#facetResizer");
  assert(!!handle && handle.parentElement === panel, "the handle lives inside #facetPanel (hidden with it)");
  // jsdom has no layout: give the panel and #viewArea real widths.
  panel.getBoundingClientRect = () => ({ width: 280, height: 500, left: 720, right: 1000, top: 0, bottom: 500 });
  d.querySelector("#viewArea").getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, right: 1000, top: 0, bottom: 500 });
  const mouse = (target, type, x) => target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10 }));
  mouse(handle, "mousedown", 720);
  assert(handle.classList.contains("dragging"), "mousedown starts a drag");
  mouse(w, "mousemove", 620);
  assert(panel.style.flexBasis === "380px", "dragging 100px left grows the panel to 380px, got " + panel.style.flexBasis);
  mouse(w, "mousemove", 1000);
  assert(panel.style.flexBasis === "180px", "min width 180px, got " + panel.style.flexBasis);
  mouse(w, "mousemove", -500);
  assert(panel.style.flexBasis === "760px", "max width = viewArea - 240px, got " + panel.style.flexBasis);
  mouse(w, "mouseup", -500);
  assert(!handle.classList.contains("dragging"), "mouseup ends the drag");
  mouse(w, "mousemove", 720);
  assert(panel.style.flexBasis === "760px", "moves after mouseup don't resize");
  w.setFacetsOpen(false);
  assert(panel.classList.contains("hidden"), "closing hides panel + handle together");
  w.setFacetsOpen(true);
  assert(panel.style.flexBasis === "760px", "width survives close/reopen within the session");
});

await withApp(async (w, d, T) => {
  section("288b. Patterns is the leftmost view tab; Ctrl+1 opens it");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id; w.render();
  assert(d.querySelector("#fhTabs .view-tab").dataset.fhTab === "patterns", "first tab is Patterns");
  w.applyFhView("filter");
  fireKeydown(d, w, "1", { ctrlKey: true });
  assert(T.fhActiveTab === "patterns", "Ctrl+1 → Patterns");
  fireKeydown(d, w, "3", { ctrlKey: true });
  assert(T.fhActiveTab === "filter", "Ctrl+3 → Filtered");
});

await withApp(async (w, d, T) => {
  section("288c. a facet value's name takes the colour of the most severe level among its entries");
  const line = (i, level, thread) => `2024-01-15 10:00:${String(i).padStart(2, "0")},000\t${level}\t"${thread}"\tC:\\src\\Foo.cs\tline 1\t[Run]\t"message ${i}"`;
  const TEXT = [line(0, "INFO", "A"), line(1, "WARN", "A"), line(2, "INFO", "B"), line(3, "ERROR", "C"), line(4, "DEBUG", "C"), line(5, "DEBUG", "D")].join("\n") + "\n";
  const f = await w.addFile("lvl.log", TEXT, () => {});
  T.state.activeId = f.id; w.render();
  w.setFacetsOpen(true);
  const cls = name => [...d.querySelectorAll('.facet-section[data-col="thread"] .facet-value-name')].find(n => n.textContent === name).className;
  assert(cls("A").includes("lvl-warn") && !cls("A").includes("lvl-info"), "A (INFO+WARN) → warn, got " + cls("A"));
  assert(cls("B").includes("lvl-info"), "B (INFO) → info, got " + cls("B"));
  assert(cls("C").includes("lvl-error"), "C (ERROR+DEBUG) → error, got " + cls("C"));
  assert(cls("D").includes("lvl-debug"), "D (DEBUG) → debug, got " + cls("D"));
  const lvl = [...d.querySelectorAll('.facet-section[data-col="level"] .facet-value-name')];
  assert(lvl.every(n => n.classList.contains("lvl-" + n.textContent.toLowerCase())), "the Level section colours each level by itself");
  // level quick-filter narrows the result → colours follow it
  T.state.levelFilter.add("INFO"); T.state.levelFilter.add("DEBUG"); w.render();
  assert(cls("A").includes("lvl-info") && cls("C").includes("lvl-debug"), "colours follow the narrowed result");
});
