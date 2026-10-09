// GROUP facets-bottom-tab — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP facets-bottom-tab — Facets are the second tab of the bottom panel
   Origin: 2026-10-05 (usability round C, package C3). The 280px side panel
   squeezed the log's Message column to a few pixels; the facets now live in
   #detailPanel as "Entry detail | Facets": sections side by side, the share
   bar behind the value row, a row click keeps the tab, Ctrl+I cycles, and on
   Patterns the panel stays (header-only strip with Entry detail selected) so
   Facets are reachable on every tab. Phone: the Facets live in the bottom sheet (GROUP phone-analyze-sheet).
   2026-10-06: the selected tab is one lower-tab value (key philogg-lower-tab:
   detail | stats | facets); Table/Plot show a normal panel (Entry detail,
   Statistics, Facets — GROUP entry-detail-table-plot).
   ============================================================ */
group("facets-bottom-tab");

await withApp(async (w, d, T) => {
  const f = await w.addFile("a.log", makeLog(0, 20, { levels: ["ERROR", "INFO", "INFO", "WARN"] }), () => {});
  T.state.activeId = f.id; w.render();
  const panel = d.querySelector("#detailPanel"), body = d.querySelector("#facetPanelBody");
  const tabD = d.querySelector("#lowerTabDetail"), tabF = d.querySelector("#lowerTabFacets");
  const rules = [];
  const walk = rs => { for (const r of rs) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);

  section("facets-bottom-tab a. markup: tabs in the panel header, nothing left of the old side panel");
  assert(tabD && tabF && tabD.getAttribute("role") === "tab" && tabF.getAttribute("role") === "tab", "two role=tab buttons");
  assert(tabD.closest("#detailPanelHeader") && body.closest("#detailPanelInner"), "tabs in the header, facet body inside the panel");
  assert(tabD.getAttribute("aria-selected") === "true" && tabF.getAttribute("aria-selected") === "false", "Entry detail is selected by default");
  assert(/Ctrl\+I/.test(tabF.title) && /Ctrl\+J/.test(tabD.title), "tooltips name the shortcuts");
  assert(!d.querySelector("#btnFacets") && !d.querySelector("#facetResizer") && !d.querySelector("#facetPanel") && !d.querySelector("#facetPanelClose"), "no #btnFacets / #facetResizer / #facetPanel / close button");
  assert(!d.querySelector("#viewArea #facetPanelBody") && !d.querySelector("#viewArea .facet-section"), "#viewArea (and so the log's width) holds no facet panel");
  assert(!rules.some(r => /btnFacets|facetResizer|#facetPanel(?![A-Za-z])/.test(r.selectorText)), "no CSS left for the removed controls");
  assert(!isVisible(body, w) && isVisible(d.querySelector("#detailBody"), w), "Entry detail shows the detail body, not the facets");

  section("facets-bottom-tab b. the Facets tab shows the facet body instead of the detail content");
  fireClick(tabF, w);
  assert(tabF.getAttribute("aria-selected") === "true" && tabD.getAttribute("aria-selected") === "false", "aria-selected follows");
  assert(panel.classList.contains("lower-facets") && isVisible(body, w), "facet body shown");
  assert(!isVisible(d.querySelector("#detailBody"), w) && !isVisible(d.querySelector("#detailMeta"), w) && !isVisible(d.querySelector("#detailViewTabs"), w), "detail body, meta and Raw/Parsed/Pretty hidden");
  assert(isVisible(d.querySelector("#facetPanelCount"), w) && d.querySelector("#facetPanelCount").textContent === "20 entries", "the entry count takes the meta's place");
  assert(isVisible(d.querySelector("#detailToggle"), w), "the collapse toggle stays");
  assert(w.localStorage.getItem("philogg-lower-tab") === "facets", "persisted under philogg-lower-tab");
  fireClick(tabD, w);
  assert(!isVisible(body, w) && isVisible(d.querySelector("#detailBody"), w) && w.localStorage.getItem("philogg-lower-tab") === "detail", "back to Entry detail");

  section("facets-bottom-tab c. layout: sections are grid columns, the bar sits behind the value row");
  const bodyRule = rules.find(r => r.selectorText === "#facetPanelBody");
  assert(bodyRule && /repeat\(auto-fill,\s*minmax\(260px,\s*1fr\)\)/.test(bodyRule.style.gridTemplateColumns) && bodyRule.style.overflow === "auto", "auto-fill/minmax(260px) grid that scrolls as a whole");
  const valRule = rules.find(r => r.selectorText === ".facet-value");
  assert(valRule && valRule.style.gridTemplateColumns.replace(/\s+/g, " ") === "minmax(0,1fr) 42px 30px", "value row: name, count, % — no bar column, got " + (valRule && valRule.style.gridTemplateColumns));
  const barRule = rules.find(r => r.selectorText === ".facet-bar");
  assert(barRule && barRule.style.position === "absolute", "the bar is absolutely positioned behind the row");
  const barFill = rules.find(r => r.selectorText === ".facet-bar > i");
  assert(barFill && /accent-soft/.test(barFill.style.background), "the bar fill is the soft accent");
  fireClick(tabF, w);
  assert(d.querySelectorAll("#facetPanelBody > .facet-section").length >= 4, "one section (grid cell) per column");
  assert(d.querySelector(".facet-value .facet-bar > i").style.width !== "", "the bar keeps its percentage width");

  section("facets-bottom-tab d. selecting a row keeps the Facets tab");
  const row = d.querySelector("#tableRows [data-entry-id]");
  fireClick(row, w);
  assert(T.state.selectedId != null, "a row is selected");
  assert(panel.classList.contains("lower-facets") && isVisible(body, w), "still the Facets tab after the row click");
  fireKeydown(d, w, "ArrowDown");
  assert(isVisible(body, w), "...and after the arrow key");

  section("facets-bottom-tab e. Ctrl+I cycle incl. expanding a collapsed panel");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(!panel.classList.contains("lower-facets") && tabD.getAttribute("aria-selected") === "true", "Facets + expanded -> Entry detail");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(panel.classList.contains("lower-facets"), "Entry detail -> Facets");
  w.toggleDetailCollapsed(true);
  assert(panel.classList.contains("collapsed"), "sanity: collapsed");
  assert(isVisible(tabD, w) && isVisible(tabF, w), "the collapsed header still shows both tabs");
  assert(!isVisible(body, w), "collapsed: no facet body");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(!panel.classList.contains("collapsed") && panel.classList.contains("lower-facets") && isVisible(body, w), "Ctrl+I on a collapsed Facets tab expands it (stays on Facets)");
  w.toggleDetailCollapsed(true);
  fireClick(tabF, w);
  assert(!panel.classList.contains("collapsed"), "clicking the Facets tab expands a collapsed panel");
  fireClick(tabD, w);
  w.toggleDetailCollapsed(false);
  w.setFacetsOpen(false);

  section("facets-bottom-tab f. Patterns: header-only strip with Entry detail, full panel with Facets; collapsed state untouched");
  w.applyFhView("patterns");
  assert(T.fhActiveTab === "patterns" && panel.style.display === "flex", "the panel stays on Patterns");
  assert(panel.classList.contains("detail-strip-only"), "Entry detail selected: header-only strip");
  assert(tabD.disabled && /Context, Filtered, Table and Plot/.test(tabD.title), "Entry detail tab disabled with an explaining title");
  assert(!isVisible(d.querySelector("#detailBody"), w) && !isVisible(d.querySelector("#detailMeta"), w) && !isVisible(d.querySelector("#detailViewTabs"), w) && !isVisible(body, w), "strip: only the header");
  assert(d.querySelector("#detailResizer").style.display === "none", "no resizer for the strip");
  assert(!panel.classList.contains("collapsed") && w.localStorage.getItem("philogg-detail-collapsed") !== "1", "persisted collapsed state untouched");
  const hBefore = panel.style.height;
  fireClick(tabF, w);
  assert(!panel.classList.contains("detail-strip-only") && isVisible(body, w) && d.querySelector("#detailResizer").style.display === "block", "tapping Facets opens the full panel");
  assert(panel.style.height === hBefore, "the remembered height is untouched");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(panel.classList.contains("detail-strip-only"), "Ctrl+I on Patterns shrinks it back to the strip");
  w.setFacetsOpen(true);
  w.applyFhView("filter");
  assert(!panel.classList.contains("detail-strip-only") && !tabD.disabled && panel.classList.contains("lower-facets"), "back on Filtered: normal panel, Entry detail tab enabled, Facets kept");
  w.setFacetsOpen(false);

  section("facets-bottom-tab g. Table with an extraction node: a normal panel (no strip), Facets tab reachable");
  const node = w.createFilterNode(f.id, "text", "[*:int]");
  T.state.activeId = node.id; w.render(); w.applyFhView("table");
  assert(T.fhActiveTab === "table" && panel.style.display === "flex" && !panel.classList.contains("detail-strip-only") && !tabD.disabled, "Table: normal panel with Entry detail selected");
  fireClick(tabF, w);
  assert(isVisible(body, w) && !d.querySelector("#statsPanel") && !d.querySelector("#extractWrap #detailPanel"), "Facets tab on Table; the panel sits outside #extractWrap");
  w.setFacetsOpen(false);
  T.state.activeId = f.id; w.applyFhView("filter"); w.render();

  section("facets-bottom-tab h. link filter node: facets of the pairs (details: link-facets-dt)");
  w.setFacetsOpen(true);
  const first = w.createFilterNode(f.id, "text", "message 1");
  const second = w.createFilterNode(f.id, "text", "message 2");
  const link = w.createLinkNode(first.id, second.id, "after", 1);
  T.state.activeId = link.id; w.render();
  assert(!/Not available for a link filter/.test(body.textContent) && body.querySelector(".facet-link-head") && /pairs? · \d+ without end/.test(body.querySelector(".facet-link-head").textContent), "link node: the pairs header line instead of the placeholder, got " + body.textContent.slice(0, 80));
  w.setFacetsOpen(false);
});

await withApp(async (w, d, T) => {
  section("facets-bottom-tab i. phone tier: the persisted selection does not open anything, Facets live in the sheet (phone-analyze-sheet)");
  try { w.localStorage.setItem("philogg-lower-tab", "facets"); } catch {}
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.setFacetsOpen(true); // desktop selection, persisted
  w.innerWidth = 400; w.dispatchEvent(new w.Event("resize"));
  assert(d.body.classList.contains("layout-phone"), "sanity: phone tier");
  w.render();
  const panel = d.querySelector("#detailPanel"), body = d.querySelector("#facetPanelBody");
  assert(!d.body.classList.contains("sheet-open"), "the sheet is closed");
  assert(!panel.classList.contains("lower-facets") && !isVisible(body, w), "no facet body while the sheet is closed, whatever the persisted key says");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(d.body.classList.contains("sheet-open") && isVisible(body, w), "Ctrl+I opens the sheet on Facets on the phone");
  assert(w.localStorage.getItem("philogg-lower-tab") === "facets", "the phone tab does not touch the persisted desktop selection");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(!d.body.classList.contains("sheet-open") && !isVisible(body, w), "Ctrl+I again closes it");
});
