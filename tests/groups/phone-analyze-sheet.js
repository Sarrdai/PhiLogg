// GROUP phone-analyze-sheet — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-analyze-sheet — Facets on the phone via the "Analyze" header button
   Origin: 2026-10-06 (usability round D, phone step 1; mockup variant 1A/3A/4A).
   #btnAnalyzePhone (phone tier only) opens the bottom sheet (#detailPanel) on
   an Analyze tab; the sheet has the tabs Entry | Facets (a third, Patterns,
   slots into PHONE_ANALYZE_TABS later). The phone tab is plain UI state
   (phoneSheetOpen / phoneSheetTab / phoneAnalyzeTab), never written to
   philogg-facets-open. A facet value tap keeps the sheet open (the child node
   becomes active, the facets recount). An extraction node shows a one-line
   hint above the cards on the phone; the tour banner's hint names the
   Analyze button. Desktop and compact are unchanged.
   Data: log-sim "basic" scenario.
   ============================================================ */
group("phone-analyze-sheet");

const paSetWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 400, seed: 31 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const btn = d.getElementById("btnAnalyzePhone"), panel = d.getElementById("detailPanel");
  const body = d.getElementById("facetPanelBody"), count = d.getElementById("facetPanelCount");
  const tabE = d.getElementById("lowerTabDetail"), tabF = d.getElementById("lowerTabFacets");
  const open = () => d.body.classList.contains("sheet-open");
  const sections = () => body.querySelectorAll(".facet-section").length;
  const card = id => d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]');

  section("phone-analyze-sheet a. Desktop / compact: no Analyze button, Facets tab as before");
  paSetWidth(w, 1440);
  assert(btn && btn.type === "button" && !isVisible(btn, w), "desktop: #btnAnalyzePhone exists but is hidden");
  assert(isVisible(d.getElementById("lowerTabs"), w) && tabE.querySelector(".lt-full").textContent === "Entry detail" && w.getComputedStyle(tabE.querySelector(".lt-full")).display !== "none", "desktop: the tab reads 'Entry detail'");
  paSetWidth(w, 800);
  assert(d.body.classList.contains("layout-compact") && !isVisible(btn, w), "compact: hidden too");
  assert(isVisible(tabF, w), "compact: the Facets tab is still there");

  section("phone-analyze-sheet b. Phone: the button sits before Find; markup, tooltip, tour hint");
  paSetWidth(w, 390);
  assert(d.body.classList.contains("layout-phone") && isVisible(btn, w), "phone: the button shows");
  assert(btn.nextElementSibling === d.getElementById("btnFindPhone"), "directly before #btnFindPhone");
  assert(btn.getAttribute("aria-label") === "Analyze" && btn.title === "Facets and patterns (Ctrl+I)" && btn.getAttribute("aria-pressed") === "false", "label, tooltip, not pressed");
  assert(btn.querySelector("svg path").getAttribute("d") === "M3 13.5V8M6.3 13.5V3.5M9.6 13.5V6.5M12.9 13.5V10", "four-bar icon");
  assert(d.querySelector(".tour-banner-hint").textContent === "Hands-on steps (TRY) and the Table/Plot tabs need a desktop or tablet. Patterns and Facets: the Analyze button.", "tour banner hint text");

  section("phone-analyze-sheet c. Tap: opens on Facets without a selection");
  assert(!open() && !T.state.selectedId, "closed, nothing selected");
  fireClick(btn, w);
  assert(open() && panel.classList.contains("lower-facets"), "sheet open on the Facets tab");
  assert(btn.getAttribute("aria-pressed") === "true", "the button shows pressed");
  await waitFor(() => sections() > 0, 3000);
  assert(sections() > 0 && /entries$/.test(count.textContent) && isVisible(body, w) && isVisible(count, w), "facet sections and the count are rendered");
  assert(isVisible(d.getElementById("lowerTabs"), w) && w.getComputedStyle(tabE.querySelector(".lt-short")).display !== "none" && w.getComputedStyle(tabE.querySelector(".lt-full")).display === "none", "tabs visible, Entry label is the short one");
  assert(tabF.getAttribute("aria-selected") === "true" && tabE.getAttribute("aria-selected") === "false", "Facets selected");
  assert(tabE.disabled, "Entry is disabled without a selection");
  assert(!isVisible(d.getElementById("detailPrev"), w) && !isVisible(d.getElementById("detailNext"), w) && isVisible(d.getElementById("detailClose"), w), "prev/next hidden, close stays");
  assert(!isVisible(d.getElementById("detailMeta"), w) && !isVisible(d.getElementById("detailViewTabs"), w), "no entry meta / Raw-Parsed-Pretty");
  assert(w.localStorage.getItem("philogg-facets-open") !== "1", "the phone tab is not persisted into philogg-facets-open");
  fireClick(tabE, w);
  assert(tabF.getAttribute("aria-selected") === "true" && open(), "clicking the disabled Entry tab does nothing");

  section("phone-analyze-sheet d. Tap again closes; reopen uses the last Analyze tab");
  fireClick(btn, w);
  assert(!open() && !panel.classList.contains("lower-facets") && btn.getAttribute("aria-pressed") === "false", "closed, button released");
  fireClick(btn, w);
  assert(open() && panel.classList.contains("lower-facets"), "reopens on Facets");
  fireClick(d.getElementById("detailClose"), w);
  assert(!open(), "the close button closes the Facets tab too");

  section("phone-analyze-sheet e. Card tap switches to Entry; tabs switch; selecting on Facets does not switch");
  const entries = T.currentViewEntries;
  fireClick(btn, w);
  await waitFor(() => sections() > 0, 3000);
  card(entries[5].id).click();
  assert(open() && T.state.selectedId === entries[5].id && !panel.classList.contains("lower-facets"), "card tap: sheet on Entry");
  assert(isVisible(d.getElementById("detailMeta"), w) && isVisible(d.getElementById("detailPrev"), w) && !isVisible(body, w), "entry meta + prev/next shown, facets hidden");
  assert(!tabE.disabled && tabE.getAttribute("aria-selected") === "true" && btn.getAttribute("aria-pressed") === "false", "Entry enabled and selected, button not pressed");
  fireClick(tabF, w);
  await waitFor(() => sections() > 0, 3000);
  assert(panel.classList.contains("lower-facets") && open() && btn.getAttribute("aria-pressed") === "true", "Facets tab click switches (selection kept)");
  w.selectEntry(entries[8].id, { scroll: true, index: 8 });
  assert(panel.classList.contains("lower-facets") && open() && sections() > 0, "selecting while on Facets does not switch away nor re-render empty");
  fireClick(tabE, w);
  assert(!panel.classList.contains("lower-facets") && open(), "back to Entry via its tab");
  fireClick(btn, w);
  assert(open() && panel.classList.contains("lower-facets"), "Analyze while on Entry opens Facets (last used Analyze tab)");
  fireClick(btn, w);
  assert(!open() && T.state.selectedId === entries[8].id, "Analyze while on Facets closes; the selection stays");

  section("phone-analyze-sheet f. A facet value tap keeps the sheet open and recounts for the new node");
  fireClick(btn, w);
  await waitFor(() => sections() > 0, 3000);
  const parent = T.state.activeId, total = count.textContent;
  const row = [...body.querySelectorAll('.facet-section[data-col="level"] .facet-value')][0];
  assert(row, "a Level value row exists");
  fireClick(row, w);
  assert(T.state.activeId !== parent && T.state.nodes[T.state.activeId].parentId === parent, "a child node became active");
  assert(open() && panel.classList.contains("lower-facets"), "the sheet is still open on Facets");
  await waitFor(() => /entries$/.test(count.textContent) && !body.querySelector(".facet-pending"), 3000);
  assert(count.textContent === w.getEntries(T.state.activeId).length.toLocaleString("de-DE") + " entries" && count.textContent !== total, "facets recounted for the child: " + count.textContent + " (was " + total + ")");
  assert(d.getElementById("phoneTitle").textContent.indexOf(w.nodeDisplayName(T.state.nodes[T.state.activeId])) !== -1, "the title follows the new node");
  // Exclude from the long-press menu
  const child = T.state.activeId;
  const col = body._facetResult.columns.find(c => c.key === "level");
  w.openFacetValueMenu(col, col.values[0][0], 10, 10);
  fireClick(d.querySelector('#facetValueMenu [data-act="exclude"]'), w);
  assert(T.state.activeId !== child && T.state.nodes[T.state.activeId].parentId === child && T.state.nodes[T.state.activeId].inverted, "menu Exclude creates an inverted child");
  assert(open() && panel.classList.contains("lower-facets"), "sheet still open after Exclude");

  section("phone-analyze-sheet g. Active-node switch keeps the Analyze sheet open; link node text");
  T.state.activeId = f.id; w.render();
  assert(open() && panel.classList.contains("lower-facets"), "switching the active node keeps the sheet");
  await waitFor(() => sections() > 0, 3000);
  const second = w.createFilterNode(f.id, "text", "Connection");
  const link = w.createLinkNode(f.id, second.id, "after", 1);
  T.state.activeId = link.id; w.render();
  assert(open() && /Not available for a link filter/.test(body.textContent), "link node: the existing placeholder text");
  T.state.activeId = f.id; w.render();

  section("phone-analyze-sheet h. Ctrl+I opens/closes the sheet and leaves philogg-facets-open alone");
  fireClick(d.getElementById("detailClose"), w);
  const key = w.localStorage.getItem("philogg-facets-open");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(open() && panel.classList.contains("lower-facets"), "Ctrl+I opens on Facets");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(!open(), "Ctrl+I closes it");
  assert(w.localStorage.getItem("philogg-facets-open") === key, "localStorage philogg-facets-open untouched");

  section("phone-analyze-sheet i. Leaving the phone tier closes the sheet state; tablet/desktop follow facetsOpen");
  fireClick(btn, w);
  assert(open(), "sheet open on the phone");
  paSetWidth(w, 1440);
  assert(!open() && !panel.classList.contains("lower-facets"), "desktop: sheet gone, Entry detail selected (facetsOpen is false)");
  paSetWidth(w, 390);
  assert(!open(), "back on the phone it stays closed");
  w.setFacetsOpen(false);
});

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 400, seed: 31 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const hint = d.getElementById("phoneExtractHint");
  const shown = () => hint.classList.contains("show") && isVisible(hint, w);
  paSetWidth(w, 390);

  section("phone-analyze-sheet j. Extraction node: a one-line hint above the cards, phone only");
  assert(!shown(), "plain node: no hint");
  const ex = w.createFilterNode(f.id, "text", "([*:int] ms)");
  T.state.activeId = ex.id; w.render();
  assert(w.nodeIsExtractionView(T.state.nodes[ex.id]), "sanity: extraction node");
  assert(shown(), "phone + extraction node: hint shown");
  assert(hint.textContent.trim() === "Table and Plot for this filter need a wider screen (tablet or desktop).", "exact text, got '" + hint.textContent.trim() + "'");
  assert(hint.querySelector(".peh-icon svg"), "with the table icon");
  assert(hint.nextElementSibling === d.getElementById("tableHeader") && !d.getElementById("tableBody").contains(hint), "sits before the header, outside the virtualized body");
  assert(d.querySelectorAll("#tableRows .log-row").length > 0, "cards still render beneath it");
  T.state.activeId = f.id; w.render();
  assert(!shown(), "back on a plain node: gone");
  T.state.activeId = ex.id; w.render();
  paSetWidth(w, 800);
  assert(!shown(), "compact: no hint");
  paSetWidth(w, 1440);
  assert(!shown(), "desktop: no hint");

  section("phone-analyze-sheet k. Plain [*] filters (Patterns tap / hide) get no hint; typed ones and their children do");
  paSetWidth(w, 390);
  const plain = w.createFilterNode(f.id, "text", "Heartbeat [*]");
  T.state.activeId = plain.id; w.render();
  assert(w.nodeIsExtractionView(T.state.nodes[plain.id]), "sanity: a plain [*] filter is extractable for the desktop Table tab");
  assert(!shown(), "phone, plain [*] filter: no hint");
  const notPlain = w.createFilterNode(f.id, "text", "Heartbeat [*]");
  T.state.nodes[notPlain.id].inverted = true;
  T.state.activeId = notPlain.id; w.render();
  assert(!shown(), "phone, NOT plain [*] filter (pattern hide): no hint");
  const child = w.createFilterNode(ex.id, "level", ["INFO"]);
  T.state.activeId = child.id; w.render();
  assert(child && shown(), "phone, child of a typed extraction node (inherits Table/Plot): hint shown");
  paSetWidth(w, 1440);
  T.state.activeId = plain.id; w.render();
  const tableTab = d.querySelector('#fhTabs [data-fh-tab="table"]');
  assert(tableTab && !tableTab.disabled, "desktop: the Table tab stays enabled for a plain [*] filter (predicate unchanged)");
});
