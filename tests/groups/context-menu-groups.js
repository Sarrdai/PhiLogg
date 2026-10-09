// GROUP context-menu-groups — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): runs inside its main async function, so every
// harness helper (withApp, waitFor, assert, section, ...) is in scope.

/* ============================================================
   GROUP context-menu-groups — every right-click / long-press context menu has one
   order, grouped items and a small heading per group
   Origin: 2026-10-08 (person-requested, mockup variant A + headings in all menus).
   Row menu: Filter / Time filter / Analyze / Mark / Copy & open. Tree node menu:
   (Info, Select multiple) / Edit / Create from this / Clipboard (files: Location &
   clipboard) / Remove; multi-selection: Selection. Folder file: File. Extraction
   table: Column / Array view / Table. Facet value: Filter / Copy. Phone pattern:
   Filter / Navigate / Copy. A .ctx-sep only sits between visible groups; a group
   whose items are all hidden loses its heading and separator (syncCtxGroups).
   ============================================================ */
group("context-menu-groups");

// The visible children of a menu as tokens: element id / data-action / data-act /
// data-array-mode, "sep", "head:<text>", "meta", "note".
function cmgTokens(menu, w) {
  const out = [];
  for (const c of menu.children) {
    if (w.getComputedStyle(c).display === "none") continue;
    if (c.classList.contains("ctx-target-head")) continue; // "Menu for <node>" line above the groups (GROUP tree-labels-i4)
    out.push(c.classList.contains("ctx-sep") ? "sep"
      : c.classList.contains("ctx-head") ? "head:" + c.textContent
      : c.classList.contains("ctx-meta") ? "meta"
      : c.classList.contains("ctx-note") ? "note"
      : c.id || c.dataset.action || c.dataset.act || c.dataset.arrayMode || "?");
  }
  return out;
}
const cmgJoin = t => t.join(" | ");
// A group is well formed when no separator is first/last/doubled and every heading is followed by an item.
function cmgWellFormed(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "sep" && (i === 0 || i === tokens.length - 1 || tokens[i - 1] === "sep")) return false;
    if (tokens[i].startsWith("head:") && (i === tokens.length - 1 || tokens[i + 1] === "sep" || tokens[i + 1].startsWith("head:"))) return false;
  }
  return true;
}

await withApp(async (w, d, T) => {
  section("context-menu-groups a. Row menu: five headed groups in the new order, Before above After, renamed label, new icons");
  const f = await w.addFile("cmg.log", makeLog(0, 12), () => {});
  T.state.activeId = f.id;
  w.render();
  const menu = d.querySelector("#contextMenu");
  const open = (entry, extra = {}) => w.openContextMenu({ clientX: 10, clientY: 10, ...extra }, entry);

  open(f.entries[3]);
  let t = cmgTokens(menu, w);
  assert(cmgJoin(t) === ["meta", "sep", "head:Filter", "ctxFilterForColumn", "ctxExtractMessage",
    "sep", "head:Time filter", "ctxBefore", "ctxAfter",
    "sep", "head:Analyze", "ctxWhyRow", "ctxPairWith", "ctxTimeZero",
    "sep", "head:Mark", "ctxBookmark", "ctxNote", "ctxAddToSelection",
    "sep", "head:Copy & open", "ctxCopy", "ctxCopyTicket"].join(" | "), "single row: " + cmgJoin(t));
  assert(cmgWellFormed(t), "well formed");
  const heads = [...menu.querySelectorAll(".ctx-head")];
  assert(heads.length === 5 && heads.every(h => !h.id && !h.dataset.action && !h.classList.contains("ctx-item")), "five non-interactive headings");
  assert(w.getComputedStyle(heads[0]).textTransform === "uppercase" && heads[0].textContent === "Filter", "heading text in normal case, uppercased by CSS");

  // 2+ selected rows: the time-range item appears as the third Time filter entry, with its new label.
  T.state.logMultiSelect = new Set([f.entries[2].id, f.entries[5].id]);
  open(f.entries[5]);
  t = cmgTokens(menu, w);
  const i = t.indexOf("ctxTimeRangeFromSelection");
  assert(i > 0 && t.slice(i - 2, i + 1).join() === "ctxBefore,ctxAfter,ctxTimeRangeFromSelection", "Before, After, Filter selected time range: " + cmgJoin(t));
  assert(d.querySelector("#ctxTimeRangeFromSelection").textContent.trim() === "Filter selected time range", "renamed context-menu label");
  assert(d.querySelector('[data-row-action="timeRangeFromSelection"]').title !== "Filter selected time range", "the #viewBar row-action button keeps its own label");
  T.state.logMultiSelect = new Set();

  // Icons: sprite symbols for the time items and the new help icon on Why; Pair has its icon at the same size as the rest.
  const sym = id => d.querySelector("#" + id + " svg use").getAttribute("href");
  assert(sym("ctxBefore") === "#i-time-before" && sym("ctxAfter") === "#i-time-after" && sym("ctxTimeRangeFromSelection") === "#i-time-range", "time items use the time sprite symbols");
  assert(sym("ctxWhyRow") === "#i-help" && d.querySelector("symbol#i-help circle") !== null, "Why is this row here? has the new question-mark icon, defined in the sprite");
  assert(d.querySelector("#ctxPairWith svg.icon") !== null, "Pair with… has its link icon");
  assert(w.getComputedStyle(d.querySelector("#ctxPairWith")).getPropertyValue("--icon-md") === "13px"
    && w.getComputedStyle(d.querySelector("#ctxWhyRow")).getPropertyValue("--icon-md") === "13px", "sprite icons in the row menu render at the 13px of the inline ones");

  section("context-menu-groups b. A heading is not clickable: it neither closes the menu nor triggers anything");
  open(f.entries[3]);
  const nodesBefore = Object.keys(T.state.nodes).length;
  menu.querySelector(".ctx-head").dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  fireClick(menu.querySelector(".ctx-head"), w);
  assert(!menu.classList.contains("hidden"), "pressing and clicking a heading keeps the row menu open");
  assert(Object.keys(T.state.nodes).length === nodesBefore, "and creates nothing");
  w.closeContextMenu();

  section("context-menu-groups c. Empty groups vanish with heading and separator (link-view pair brace, rows without timestamps)");
  open({ isPair: true, id: "pair1", ts: 1, message: "x", first: f.entries[1], second: f.entries[2] });
  t = cmgTokens(menu, w);
  assert(!t.includes("head:Analyze") && !t.includes("ctxWhyRow") && !t.includes("ctxPairWith") && !t.includes("ctxTimeZero"), "no Analyze group for a pair brace: " + cmgJoin(t));
  assert(t.join() === ["meta", "sep", "head:Filter", "ctxFilterForColumn", "sep", "head:Time filter", "ctxBefore", "ctxAfter",
    "sep", "head:Mark", "ctxAddToSelection", "sep", "head:Copy & open", "ctxCopy", "ctxCopyTicket"].join(), "pair brace menu: " + cmgJoin(t));
  assert(cmgWellFormed(t), "well formed without the Analyze group");
  w.closeContextMenu();
  // Back to a real row: everything returns (the helper re-shows what it hid).
  open(f.entries[3]);
  t = cmgTokens(menu, w);
  assert(t.includes("head:Analyze") && t.includes("ctxWhyRow") && cmgWellFormed(t), "the Analyze group is back on a real row");
  w.closeContextMenu();
  // A whole group hidden through its items (Mark): the menu stays well formed.
  ["ctxBookmark", "ctxNote", "ctxAddToSelection"].forEach(id => { d.getElementById(id).style.display = "none"; });
  w.syncCtxGroups(menu);
  t = cmgTokens(menu, w);
  assert(!t.includes("head:Mark") && cmgWellFormed(t) && t.filter(x => x === "sep").length === 4, "Mark hidden entirely: heading and one separator go, 4 separators left: " + cmgJoin(t));
  ["ctxFilterForColumn", "ctxExtractMessage"].forEach(id => { d.getElementById(id).style.display = "none"; });
  w.syncCtxGroups(menu);
  t = cmgTokens(menu, w);
  assert(t[0] === "meta" && t[1] === "sep" && t[2] === "head:Time filter" && cmgWellFormed(t), "first group hidden: the meta separator now leads into Time filter: " + cmgJoin(t));
});

await withApp(async (w, d, T) => {
  section("context-menu-groups d. Tree node menu: Info / Edit / Create from this / Clipboard / Remove");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  w.render();
  const menu = d.querySelector("#treeContextMenu");
  const openFor = id => { fireContextMenu(d.querySelector('.tree-row[data-node-id="' + id + '"]'), w); return cmgTokens(menu, w); };

  let t = openFor(t1.id);
  assert(cmgJoin(t) === ["info", "selectMultiple", "sep",
    "head:Edit", "edit", "rename", "invert", "mute", "alert", "sep",
    "head:Create from this", "gap", "linkWith", "pruneToNode", "sep",
    "head:Clipboard", "copy", "cut", "saveFilter", "sep",
    "delete"].join(" | "), "text filter node: " + cmgJoin(t));
  assert(cmgWellFormed(t), "well formed");
  assert(menu.children[0].classList.contains("ctx-target-head") && menu.children[1].dataset.action === "info", "the Info/Select multiple group has no heading and comes first (right after the target line)");
  // Clicking a heading: no action, the menu stays.
  fireClick(menu.querySelector(".ctx-head"), w);
  assert(!menu.classList.contains("hidden"), "clicking a tree-menu heading keeps the menu open");
  // Copy, then Paste appears between Cut and Save filter.
  fireClick(menu.querySelector('[data-action="copy"]'), w);
  assert(menu.classList.contains("hidden"), "an item closes the menu");
  t = openFor(t2.id);
  assert(t.slice(t.indexOf("head:Clipboard")).join() === ["head:Clipboard", "copy", "cut", "paste", "saveFilter", "sep", "delete"].join(), "Paste sits between Cut and Save filter: " + cmgJoin(t));
  w.closeTreeContextMenu();

  // and/link nodes: Edit link… leads the Edit group, Unpack… follows Link with…, no Invert on a link.
  const f2 = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "other" }), () => {});
  const l1 = w.createFilterNode(f.id, "text", "message 1");
  const l2 = w.createFilterNode(f2.id, "text", "message 1");
  const linkNode = w.createLinkNode(l1.id, l2.id, "after", 1);
  w.render();
  t = openFor(linkNode.id);
  assert(t.join().includes(["head:Edit", "edit", "rename", "mute", "alert", "sep", "head:Create from this"].join()), "link node: Edit link… first, no Invert: " + cmgJoin(t));
  assert(d.querySelector('#treeContextMenu [data-action="edit"]').textContent.includes("Edit link…"), "Edit link… label");
  const create = t.slice(t.indexOf("head:Create from this") + 1, t.indexOf("head:Clipboard") - 1);
  assert(create.indexOf("gap") < create.indexOf("unpack") && (create.indexOf("linkWith") === -1 || create.indexOf("linkWith") < create.indexOf("unpack")), "Create from this: Gap filter…, (Link with…), Unpack…: " + create.join());
  w.closeTreeContextMenu();

  section("context-menu-groups e. File node: Edit / Create / Location & clipboard / Remove");
  T.state.clipboard = null;
  t = openFor(f.id);
  assert(cmgJoin(t) === ["info", "selectMultiple", "sep", "head:Edit", "clockOffset", "sep", "head:Create from this", "gap", "sep", "delete"].join(" | "),
    "browser build, file without a known location: " + cmgJoin(t));
  w.closeTreeContextMenu();
  w.philogg = {}; // a desktop wrapper being present
  f.localPath = "C:\\logs\\a.log";
  f.sourceUrl = "https://example.invalid/a.log";
  t = openFor(f.id);
  assert(cmgJoin(t) === ["info", "selectMultiple", "sep", "head:Edit", "clockOffset", "sep", "head:Create from this", "gap", "sep",
    "head:Location & clipboard", "revealLocation", "copyPath", "copyUrl", "sep", "delete"].join(" | "), "file with a path and a URL: " + cmgJoin(t));
  assert(cmgWellFormed(t), "well formed");
  w.closeTreeContextMenu();
  T.state.clipboard = { id: t1.id, mode: "copy" }; // something to paste (what Copy leaves behind)
  t = openFor(f.id);
  assert(t.includes("paste") && t.indexOf("paste") === t.indexOf("copyUrl") + 1, "Paste closes the Location & clipboard group: " + cmgJoin(t));
  w.closeTreeContextMenu();
  w.philogg = undefined;
  delete f.localPath; delete f.sourceUrl;

  section("context-menu-groups f. Locked Bookmarks filter keeps offering only Copy");
  T.state.activeId = f.id;
  w.render();
  w.toggleBookmark(f.entries[2].id);
  w.render();
  const bm = Object.values(T.state.nodes).find(n => n.type === "filter" && n.locked);
  assert(bm, "sanity: a locked Bookmarks filter exists");
  t = openFor(bm.id);
  assert(cmgJoin(t) === ["info", "selectMultiple", "sep", "head:Clipboard", "copy"].join(" | "), "locked node: " + cmgJoin(t));
  w.closeTreeContextMenu();

  section("context-menu-groups g. Multi-selection menu: N selected, Selection heading + actions; a mixed selection shows the note without a heading");
  T.state.activeId = t1.id; // the active node joins the selection
  T.state.multiSelect = new Set([t1.id, t2.id]);
  w.render();
  t = openFor(t1.id);
  assert(cmgJoin(t) === ["meta", "sep", "head:Selection", "mute"].join(" | "), "two filters of one file: " + cmgJoin(t));
  assert(menu.querySelector(".ctx-meta").textContent === "2 selected", "meta says 2 selected");
  fireClick(menu.querySelector(".ctx-head"), w);
  assert(!menu.classList.contains("hidden"), "heading click keeps the menu open");
  w.closeTreeContextMenu();
  T.state.activeId = f.id;
  T.state.multiSelect = new Set([f.id, f2.id]);
  w.render();
  t = openFor(f.id);
  assert(cmgJoin(t) === ["meta", "sep", "head:Selection", "merge"].join(" | "), "two files: " + cmgJoin(t));
  assert(menu.querySelector('[data-action="merge"]').textContent.includes("Merge 2 files"), "Merge 2 files");
  w.closeTreeContextMenu();
  T.state.multiSelect = new Set([f.id, t1.id]);
  w.render();
  t = openFor(f.id);
  assert(cmgJoin(t) === ["meta", "sep", "note"].join(" | "), "mixed file + filter: just the note, no heading: " + cmgJoin(t));
  w.closeTreeContextMenu();
  T.state.multiSelect = new Set();

  section("context-menu-groups h. Unloaded folder file: meta, File heading, Load file");
  w.openFolderFileContextMenu({ clientX: 10, clientY: 10 }, { id: "folder-x" }, { name: "late.log" });
  t = cmgTokens(menu, w);
  assert(cmgJoin(t) === ["meta", "sep", "head:File", "loadFolderFile"].join(" | "), cmgJoin(t));
  assert(menu.querySelector(".ctx-meta").textContent === "late.log", "meta is the file name");
  fireClick(menu.querySelector(".ctx-head"), w);
  assert(!menu.classList.contains("hidden"), "heading click keeps the menu open");
  w.closeTreeContextMenu();
});

await withApp(async (w, d, T) => {
  section("context-menu-groups i. Extraction table menu: Column / Array view / Table, groups hide with their items");
  const menu = d.querySelector("#extractContextMenu");

  // Scalar column: header right-click = Column + Table; body right-click = Table only.
  const f = await w.addFile("cmgx.log", makeLog(0, 12), () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length > 0, "sanity: the extraction table has rows");
  fireContextMenu(d.querySelector('#extractHead th[data-col="0"]'), w, 20, 20);
  let t = cmgTokens(menu, w);
  assert(cmgJoin(t) === ["head:Column", "ctxRenameColumn", "sep", "head:Table", "ctxExportCsv"].join(" | "), "scalar column header: " + cmgJoin(t));
  fireClick(menu.querySelector(".ctx-head"), w);
  assert(!menu.classList.contains("hidden"), "heading click keeps the menu open");
  fireClick(d.body, w);
  assert(menu.classList.contains("hidden"), "an outside click still closes it");
  fireContextMenu(d.querySelector("#extractBody"), w, 20, 20);
  t = cmgTokens(menu, w);
  assert(cmgJoin(t) === ["head:Table", "ctxExportCsv"].join(" | "), "table body: no Column group, no leading separator: " + cmgJoin(t));
  fireClick(d.body, w);
});

await withApp(async (w, d, T) => {
  section("context-menu-groups j. Extraction table menu on an array column: labels without the 'Array: ' prefix, active view marked, array-only menu");
  const menu = d.querySelector("#extractContextMenu");
  const f = await setup298(w, T);
  const node = w.createFilterNode(f.id, "text", "[*]", false, null, false, ["motor"]);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractArrayColumns.length === 1, "sanity: one array column");
  fireContextMenu(d.querySelector('#extractHead th[data-col="0"]'), w, 20, 20);
  let t = cmgTokens(menu, w);
  assert(cmgJoin(t) === ["head:Column", "ctxRenameColumn", "sep", "head:Array view", "joined", "index", "aggregate", "explode", "sep", "head:Table", "ctxExportCsv"].join(" | "), "array column header: " + cmgJoin(t));
  assert([...menu.querySelectorAll(".ctx-array-view")].map(e => e.textContent).join("|") === "Joined|One column per element|Aggregates (len/min/max/avg/sum)|One row per element", "labels without the 'Array: ' prefix");
  assert(menu.querySelector('.ctx-array-view[data-array-mode="joined"]').classList.contains("active"), "the current view (Joined) is marked active");
  fireClick(d.body, w);

  // The header's array toggle: only the Array view group, with its heading.
  fireClick(d.querySelector('#extractHead .extract-array-btn[data-array-col="0"]'), w);
  t = cmgTokens(menu, w);
  assert(cmgJoin(t) === ["head:Array view", "joined", "index", "aggregate", "explode"].join(" | "), "array-only menu: " + cmgJoin(t));
  assert(cmgWellFormed(t), "no stray separators");
  fireClick(menu.querySelector('.ctx-array-view[data-array-mode="aggregate"]'), w);
  assert(menu.classList.contains("hidden") && JSON.stringify(T.state.nodes[node.id].arrayViews) === '{"0":"aggregate"}', "picking a view still works");
  // Right-click on an element column of the new view: the active one is Aggregates.
  fireContextMenu(d.querySelector('#extractHead th[data-col="' + T.extractColumns.find(c => c.name === "value.len").colIndex + '"]'), w, 20, 20);
  assert(menu.querySelector('.ctx-array-view[data-array-mode="aggregate"]').classList.contains("active"), "Aggregates marked active");
  fireClick(d.body, w);
});

await withApp(async (w, d, T) => {
  section("context-menu-groups k. Facet value menu (long-press) and phone pattern menu");
  const f = await w.addFile("cmgf.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();
const press = (el) => el.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  const facet = d.querySelector("#facetValueMenu");
  w.openFacetValueMenu({ key: "level" }, "INFO", 10, 10);
  let t = cmgTokens(facet, w);
  assert(cmgJoin(t) === ["meta", "sep", "head:Filter", "only", "exclude", "sep", "head:Copy", "copy"].join(" | "), "facet value menu: " + cmgJoin(t));
  assert(facet.querySelector(".ctx-meta").textContent === "INFO", "meta is the value");
  press(facet.querySelector(".ctx-head"));
  fireClick(facet.querySelector(".ctx-head"), w);
  assert(!facet.classList.contains("hidden"), "pressing and clicking a heading keeps the facet menu open");
  press(d.body);
  assert(facet.classList.contains("hidden"), "an outside click closes it");

  const pm = d.querySelector("#patternMenu");
  const group = w.eval("patternsAnalysis('" + f.id + "')").result.groups[0];
  w.openPatternMenu(group, 10, 10);
  t = cmgTokens(pm, w);
  assert(cmgJoin(t) === ["meta", "sep", "head:Filter", "filter", "hide", "sep", "head:Navigate", "jump", "sep", "head:Copy", "copy"].join(" | "), "pattern menu: " + cmgJoin(t));
  press(pm.querySelector(".ctx-head"));
  fireClick(pm.querySelector(".ctx-head"), w);
  assert(!pm.classList.contains("hidden"), "pressing and clicking a heading keeps the pattern menu open");
  const nodesBefore = Object.keys(T.state.nodes).length;
  assert(Object.keys(T.state.nodes).length === nodesBefore, "and creates nothing");
  press(d.body);
  assert(pm.classList.contains("hidden"), "an outside click closes it");
});
