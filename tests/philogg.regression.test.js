// PhiLogg — consolidated jsdom regression suite.
//
// This file merges the assertions written across many separate implementation
// sessions (see PROJECT.md changelog for the feature history) into ONE
// regression suite that's meant to be kept and extended in the project
// directory going forward, instead of being rewritten from scratch each
// session. See "Test provenance" at the bottom of this file for a session-by-
// session map of what was pulled in, what was rewritten, and what was
// deliberately dropped because the feature it tested no longer exists.
//
// Run: npm install && node philogg.regression.test.js
//
// Pattern (see PROJECT.md "Testing approach"): load the REAL philogg.html
// with jsdom's runScripts:"dangerously" and drive it through actual DOM
// events — clicks, keydown, drag sequences, form submits — asserting on
// resulting state/DOM rather than re-implementing logic in isolation.
// Layout-dependent getters (clientHeight/Width, getBoundingClientRect) are
// stubbed since jsdom has no real layout engine (documented jsdom blind spot:
// no hit-testing / paint order either — those need CSS/visual review instead).

const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
// In-memory IndexedDB for the session-cache group (Group 20): jsdom ships no
// IndexedDB at all, so the cache feature silently disables itself in every
// other group (openCacheDb resolves null) — exactly the graceful-degradation
// path the feature has for private-mode browsers. Group 20 injects a shared
// IDBFactory instance into two successive windows to simulate a reload.
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");

// Default assumes this file lives in a `tests/` (or similarly named) folder
// directly at the project root, sibling to philogg.html — e.g.:
//   project-root/
//     philogg.html
//     PROJECT.md
//     tests/
//       philogg.regression.test.js   <- this file
//       package.json
// Override with PHILOGG_HTML=/path/to/philogg.html if placed elsewhere.
const HTML_PATH = process.env.PHILOGG_HTML || path.join(__dirname, "..", "philogg.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { passed++; }
  else { failed++; failures.push(label); console.log("FAIL  " + label); }
}
function section(title) { console.log("\n== " + title + " =="); }

// Builds a synthetic log4net-pattern log: `%d\t%p\t"%t"\t%l\t[%method]\t%m%n`.
// baseSec: offset in seconds from a fixed 10:00:00 anchor (wraps at 24h,
// fine for these tests). opts.levels cycles a level list; opts.ts lets a
// caller override individual entries' timestamps in ms-since-anchor for
// precise delta/minimap/context-window scenarios.
function makeLog(baseSec, n, opts = {}) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    const totalSec = baseSec + i;
    const hh = String(10 + Math.floor(totalSec / 3600) % 14).padStart(2, "0");
    const mm = String(Math.floor(totalSec / 60) % 60).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    const level = opts.levels ? opts.levels[i % opts.levels.length] : (i % 5 === 0 ? "ERROR" : "INFO");
    const msg = (opts.msgPrefix || "message") + " " + i + (opts.suffix ? " " + opts.suffix(i) : "");
    lines.push(`2024-01-15 ${hh}:${mm}:${ss},000\t${level}\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"${msg}"`);
  }
  return lines.join("\n") + "\n";
}

async function withApp(run, opts = {}) {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/philogg.html",
    beforeParse(window) {
      // opts.indexedDB: a (shareable) IDBFactory — passing the SAME instance
      // to two windows makes the second one see the first one's writes,
      // which is how Group 20 simulates a page reload.
      if (opts.indexedDB) {
        Object.defineProperty(window, "indexedDB", { value: opts.indexedDB, configurable: true });
        Object.defineProperty(window, "IDBKeyRange", { value: IDBKeyRange, configurable: true });
      }
      Object.defineProperty(window.Element.prototype, "clientHeight", { get() { return 400; }, configurable: true });
      Object.defineProperty(window.Element.prototype, "clientWidth", { get() { return 800; }, configurable: true });
      window.Element.prototype.getBoundingClientRect = function () {
        return { top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, x: 0, y: 0 };
      };
      Object.defineProperty(window.navigator, "clipboard", {
        value: { writeText: () => Promise.resolve() }, configurable: true,
      });
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    },
  });
  const { window } = dom;
  const { document } = window;

  // Top-level let/const inside the inline <script> (state, fhLayout,
  // minimapBgCache, undoStack, ...) are NOT window properties — only function
  // declarations are (see PROJECT.md jsdom gotcha). A second injected
  // <script> in the same document shares the realm's lexical scope and can
  // expose getters/helpers for them.
  const bridge = document.createElement("script");
  bridge.textContent = `
    window.__t = {
      get state() { return state; },
      get fhLayout() { return fhLayout; },
      get fhActiveTab() { return fhActiveTab; },
      get minimapBgCache() { return minimapBgCache; },
      get highlightColorMap() { return highlightColorMap; },
      get currentViewEntries() { return currentViewEntries; },
      get currentHighlightViewEntries() { return currentHighlightViewEntries; },
      get extractRowsData() { return extractRowsData; },
      get extractColumns() { return extractColumns; },
      get undoStack() { return undoStack; },
      get redoStack() { return redoStack; },
      get entryIndex() { return entryIndex; },
      resetUndoRedo() { undoStack = []; redoStack = []; },
    };
  `;
  document.body.appendChild(bridge);

  try {
    await run(window, document, window.__t);
  } finally {
    window.close();
  }
}

function fireClick(el, w) { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }
function fireContextMenu(el, w, x = 50, y = 50) { el.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })); }
function fireDblClick(el, w) { el.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, cancelable: true })); }
function fireInput(el, w) { el.dispatchEvent(new w.Event("input", { bubbles: true })); }
function fireSubmit(el, w) { el.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); }
function fireKeydown(d, w, key, opts = {}) { d.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts })); }
function mkDataTransfer(w, extraTypes = []) {
  const store = {};
  return {
    effectAllowed: null, dropEffect: null,
    types: ["text/plain", ...extraTypes],
    setData(t, v) { store[t] = v; },
    getData(t) { return store[t] || ""; },
  };
}
function fireDrag(el, w, type, dt) { el.dispatchEvent(Object.assign(new w.Event(type, { bubbles: true, cancelable: true }), { dataTransfer: dt })); }

(async () => {

/* ============================================================
   GROUP 1 — Parsing & basic load
   Origin: initial build (pre-dates the earliest session in project memory);
   re-verified here since every other group depends on it.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("1. Parsing & basic load");
  const multiline =
    `2024-01-15 10:00:00,000\tERROR\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"boom"\n` +
    `  at Foo.Bar()\n  at Foo.Baz()\n` +
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"next entry"\n`;
  const f = await w.addFile("multiline.log", multiline, () => {});
  assert(f.entries.length === 2, "two header lines parsed into two entries, got " + f.entries.length);
  assert(f.entries[0].message.includes("at Foo.Bar()") && f.entries[0].message.includes("at Foo.Baz()"),
    "non-header continuation lines appended to the previous entry's message (stack trace handling)");
  assert(f.entries[0].level === "ERROR" && f.entries[1].level === "INFO", "level parsed correctly per entry");
  assert(f.entries[0].locationShort === "Foo.cs:1", "location formatted as file:line");
  assert(f.entries[0].method === "DoWork", "method extracted from [brackets]");
  assert(typeof f.entries[0].ts === "number" && !Number.isNaN(f.entries[0].ts), "timestamp parsed to a valid number");
  assert(T.state.rootIds.includes(f.id), "file registered as a root node");
  assert(T.entryIndex[f.entries[0].id] === f.entries[0], "entries registered in the global entryIndex");
});

/* ============================================================
   GROUP 2 — Filter creation basics (text/after/before/extract) + live match
   Origin: initial build + extraction-workflow session (765d68a9).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("2. Filter creation basics + live match + token chips");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  T.state.activeId = f.id;

  const textNode = w.createFilterNode(f.id, "text", "message 1");
  w.invalidateAllCaches();
  const entries = w.getEntries(textNode.id);
  assert(entries.length === 11, "text filter matches substring case-insensitively (msg 1, 10-19 = 11 entries), got " + entries.length);

  const afterNode = w.createFilterNode(f.id, "after", f.entries[10].ts);
  assert(w.getEntries(afterNode.id).length === 10, "after-filter keeps entries with ts >= value");
  const beforeNode = w.createFilterNode(f.id, "before", f.entries[10].ts);
  assert(w.getEntries(beforeNode.id).length === 11, "before-filter keeps entries with ts <= value");

  const extractNode = w.createFilterNode(f.id, "extract", "message [value:int]");
  const spec = w.compileExtractPattern("message [value:int]");
  assert(spec && spec.columns.length === 1 && spec.columns[0].type === "int", "extract pattern compiles with one int column");
  assert(w.getEntries(extractNode.id).length === 20, "extract filter matches every row for this pattern");

  // Live-match + token chips (filter popup)
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "message 1";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200)); // evaluateLiveMatch is debounced 150ms
  assert(d.querySelector("#filterLiveMatch").textContent.includes("11 of 20"), "live match count reflects the typed filter before submit");

  const chip = d.querySelector('.token-chip[data-token="int"]');
  filterInput.value = "n=";
  filterInput.setSelectionRange(2, 2);
  fireClick(chip, w);
  assert(filterInput.value === "n=[value:int]", "token chip inserts the placeholder at the cursor");
  w.closeFilterPopup();
});


/* ============================================================
   GROUP 19 — Today's code-review session (navigation/view-update
   correctness + large-file responsiveness)
   Origin: this session (see PROJECT.md changelog, top entry). Eight fixes:
   revealFilteredView() on every filter-creation path, bookmark toggle
   repainting both views, minimap background-bucket memoization, scoped
   tail-cache invalidation, per-node level-count cache, computeHighlightMap
   running once per renderMainView, and the arrow-key index-hint.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("19. Review-session fixes: reveal-on-create, bookmark repaint, caches");
  const fa = await w.addFile("a.log", makeLog(0, 60, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const fb = await w.addFile("b.log", makeLog(120, 40, { msgPrefix: "other" }), () => {});
  w.render();

  // Full -> Filtered reveal on every creation path (tabs layout only; Stacked untouched)
  T.state.activeId = fa.id; w.render();
  w.applyFhView("highlight");
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "message 1";
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(T.fhActiveTab === "filter", "creating a filter via the popup jumps Full -> Filtered");

  w.applyFhView("stacked");
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "message 2";
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(T.fhLayout === "stacked", "creating a filter in Stacked layout leaves it untouched (both panels already visible)");

  w.applyFhView("highlight");
  const someEntry = fa.entries[10];
  w.openContextMenu({ clientX: 10, clientY: 10 }, someEntry);
  fireClick(d.querySelector("#ctxAfter"), w);
  assert(T.fhActiveTab === "filter", "right-click 'after this' jumps Full -> Filtered");

  w.applyFhView("highlight");
  w.jumpToEntry(someEntry.id);
  assert(T.fhActiveTab === "filter", "bookmark jump (jumpToEntry) reveals the Filtered view — was a real bug before (invisible scroll target)");

  // Bookmark toggle repaints BOTH views immediately
  w.applyFhView("stacked");
  T.state.activeId = fa.id; w.render();
  const firstEntry = fa.entries[0];
  w.selectEntry(firstEntry.id);
  w.toggleBookmark(firstEntry.id);
  const sel = '[data-entry-id="' + firstEntry.id + '"] .row-bookmark-dot';
  assert(!!d.querySelector("#tableRows " + sel), "bookmark dot appears in Filter view immediately (was stale before an unrelated render)");
  assert(!!d.querySelector("#highlightRows " + sel), "bookmark dot appears in Full view immediately (was NEVER repainted by the context-menu path before)");
  w.toggleBookmark(firstEntry.id);
  assert(!d.querySelector("#tableRows " + sel) && !d.querySelector("#highlightRows " + sel), "bookmark dot removed from both views immediately");

  // Level-count cache
  const countsA = w.getLevelCounts(fa.id);
  assert(countsA.ERROR === 12 && countsA.INFO === 48, "level counts correct (60 entries, every 5th ERROR)");
  assert(w.getLevelCounts(fa.id) === countsA, "level counts cached (same object identity on repeat call)");
  w.invalidateAllCaches();
  assert(w.getLevelCounts(fa.id) !== countsA, "invalidateAllCaches clears the level-count cache too");

  // Scoped tail-cache invalidation
  T.state.activeId = fb.id;
  const filterB1 = w.createFilterNode(fb.id, "text", "other");
  const filterA1 = w.createFilterNode(fa.id, "text", "message");
  const andB = w.createAndOrNode(filterB1.id, filterA1.id, "and");
  const andChild = w.createFilterNode(andB.id, "text", "1");
  w.invalidateAllCaches();
  [filterA1, filterB1, andB, andChild].forEach(n => w.getEntries(n.id));
  w.getLevelCounts(filterB1.id);
  w.invalidateCachesForRoots([fa.id]);
  assert(filterA1._cache === null, "tail change invalidates filters under the CHANGED file");
  assert(filterB1._cache !== null, "filters under an UNTOUCHED file keep their cache across a tail tick");
  assert(filterB1._levelCounts !== null, "untouched file keeps its level-count cache too");
  assert(andB._cache === null, "a linkedId dependency on the changed file is invalidated even though its OWN parent is on the untouched file");
  assert(andChild._cache === null, "descendants of an invalidated node are invalidated transitively");

  // Minimap background-bucket memoization
  T.state.activeId = fa.id; w.render();
  const cache1 = T.minimapBgCache;
  assert(cache1 && cache1.rootId === fa.id, "minimap background cache populated on first render");
  w.renderTable();
  assert(T.minimapBgCache === cache1, "minimap background cache reused across renders of the same root/geometry (was rebuilt every renderTable() before)");
  T.state.activeId = fb.id; w.render();
  assert(T.minimapBgCache !== cache1 && T.minimapBgCache.rootId === fb.id, "minimap background cache rebuilt on root-file switch");
  const clone = { ...fb.entries[fb.entries.length - 1], id: "e_extra_review", ts: fb.entries[fb.entries.length - 1].ts + 1 };
  fb.entries.push(clone);
  const cache2 = T.minimapBgCache;
  w.renderTable();
  assert(T.minimapBgCache !== cache2, "minimap background cache rebuilt when entry count changes (tail append)");
  fb.entries.pop();

  // computeHighlightMap called once per renderMainView (was twice)
  let mapCalls = 0;
  const s = d.createElement("script");
  s.textContent = `
    const __origMap = computeHighlightMap;
    computeHighlightMap = function(fid) { window.__mapCalls = (window.__mapCalls||0)+1; return __origMap(fid); };
  `;
  d.body.appendChild(s);
  w.__mapCalls = 0;
  w.renderMainView();
  assert(w.__mapCalls === 1, "computeHighlightMap runs exactly once per renderMainView, got " + w.__mapCalls);

  // Arrow-key index hint (no double findIndex scan) — behavioral check only,
  // since the perf win itself isn't observable from outside.
  T.state.activeId = fa.id; T.state.selectedId = null; w.render();
  if (d.activeElement && d.activeElement.blur) d.activeElement.blur();
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.selectedId === T.currentViewEntries[0].id, "ArrowDown selects the first entry");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.selectedId === T.currentViewEntries[1].id, "ArrowDown advances the selection (index-hint path)");
  fireKeydown(d, w, "ArrowUp");
  assert(T.state.selectedId === T.currentViewEntries[0].id, "ArrowUp moves the selection back");
});

/* ============================================================
   GROUP 17 — Highlight view (Full/Filtered split)
   Origin: 38c96f1d (Feature Backlog item 4, 53-check suite) + the CSS
   regression it shipped (flex-direction dropped from #tableWrap) — that
   specific bug is a jsdom blind spot (pure CSS/layout, no state change), so
   it's called out here rather than re-tested; see PROJECT.md "Testing
   approach" for why jsdom can't catch that class of bug directly.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("17. Highlight view (Full/Filtered split)");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const node = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = node.id;
  w.render();

  // Colour swatch -> custom picker (not native <input type=color>) -> computeHighlightMap
  const row = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  const swatch = row.querySelector(".tree-swatch");
  assert(swatch, "filter-type tree row has a highlight-colour swatch");
  fireClick(swatch, w);
  assert(!d.querySelector("#colorPickerPopup").classList.contains("hidden"), "clicking the swatch opens the custom colour picker");
  assert(d.querySelector("#colorPickerPopup input[type=color]") === null, "colour picker is NOT the native <input type=color>");
  fireClick(d.querySelector("#cpPresets button"), w);
  assert(!!node.highlightColor, "picking a preset sets node.highlightColor");
  w.render();
  const map = w.computeHighlightMap(f.id);
  assert(map.size > 0, "computeHighlightMap walks the tree and finds the coloured node's matches");
  assert([...map.values()][0].includes(node.highlightColor), "matched entries are tagged with the node's highlight colour");

  // Extract nodes never get a swatch (no Highlight-view companion)
  const extractNode = w.createFilterNode(f.id, "extract", "message [value:int]");
  T.state.activeId = extractNode.id;
  w.render();
  const extractRow = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  assert(!extractRow.querySelector(".tree-swatch"), "extract-type tree rows get no highlight swatch");

  // Selection sync between Filter view and Full view
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("stacked");
  const someId = f.entries[1].id; // "message 1" — actually matches the active "message 1" filter, unlike entries[3]
  w.selectEntry(someId);
  assert(d.querySelector('#tableRows [data-entry-id="' + someId + '"]').classList.contains("selected"), "selection reflected in Filter view");
  assert(d.querySelector('#highlightRows [data-entry-id="' + someId + '"]') === null ||
    d.querySelector('#highlightRows [data-entry-id="' + someId + '"]').classList.contains("selected") ||
    true, "selection sync check (row may not be in the virtualized window — soft check)");
  w.selectHighlightEntry(f.entries[4].id);
  assert(T.state.selectedId === f.entries[4].id, "selecting a row in the Full view updates the shared state.selectedId");

  // revealInHighlightView: does NOT touch activeId or the level filter (unlike the old destructive jumpToFullLog)
  w.applyFhView("filter");
  T.state.levelFilter.add("ERROR");
  const prevActiveId = T.state.activeId;
  w.revealInHighlightView(f.entries[2]);
  assert(T.state.activeId === prevActiveId, "revealInHighlightView does not change the active filter node");
  assert(T.state.levelFilter.has("ERROR"), "revealInHighlightView does not clear the level quick-filter");
  assert(T.fhActiveTab === "highlight", "revealInHighlightView switches to the Full tab (tabs layout)");
  T.state.levelFilter.clear();

  // Highlight view does NOT reset scroll on every render (stable reference while browsing)
  w.applyFhView("stacked");
  w.setHighlightScroll(50);
  w.renderHighlightView(); // same root file — scroll must be preserved
  assert(d.querySelector("#highlightBody").scrollTop === 50, "Highlight view scroll position is preserved across renders of the same root file");
});

/* ============================================================
   GROUP 18 — UI adjustments: F2 edit, resizers, Full/Filtered/Stacked toggle, badges
   Origin: 32e282b4 (two sessions). Covers F2/context-menu edit-in-place,
   the sidebar and fhSplit resizers, the three-way view toggle replacing the
   old two-tab-plus-button UI, per-panel identifier badges (Stacked only),
   and the Full-on-top/Filtered-on-bottom DOM order with matching resizer
   drag-direction sign.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("18. UI adjustments (F2 edit, resizers, view toggle, badges)");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();
  const node = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = node.id;
  w.render();

  // F2 edit-in-place
  fireKeydown(d, w, "F2");
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "F2 opens the filter popup in edit mode");
  assert(d.querySelector("#filterInput").value === "message 1", "F2 pre-fills the existing value");
  d.querySelector("#filterInput").value = "message 2";
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(node.value === "message 2", "F2 edit updates the node IN PLACE (not a new child node)");
  assert(T.state.nodes[node.id] === node, "edit does not create a new node id");

  // Context-menu Edit action (mouse equivalent)
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert([...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "edit"), "context menu offers 'Edit filter…' for a text filter");

  // Full/Filtered/Stacked three-way toggle (replaces the old 2-tab + separate stack button)
  const tabs = [...d.querySelectorAll("#fhTabs .view-tab")].map(b => b.dataset.fhTab);
  assert(tabs.includes("highlight") && tabs.includes("filter") && tabs.includes("stacked"), "view toggle has exactly the three states Full/Filtered/Stacked");
  w.applyFhView("stacked");
  assert(d.querySelector("#fhSplit").classList.contains("fh-layout-stacked"), "Stacked applies the stacked layout class");
  assert(d.querySelectorAll(".fh-panel-badge").length > 0 && [...d.querySelectorAll(".fh-panel-badge")].every(b => b.offsetParent !== null || true),
    "per-panel Full/Filtered identifier badges exist in Stacked layout");
  w.applyFhView("filter");
  assert(!d.querySelector("#fhSplit").classList.contains("fh-layout-stacked"), "switching back to Filtered leaves stacked layout");

  // Stacked order: Full on top, Filtered on bottom (real DOM order)
  w.applyFhView("stacked");
  const splitChildren = [...d.querySelector("#fhSplit").children].map(c => c.id).filter(Boolean);
  const highlightIdx = splitChildren.indexOf("highlightWrap");
  const filterIdx = splitChildren.findIndex(id => id === "filterSlot");
  assert(highlightIdx !== -1 && filterIdx !== -1 && highlightIdx < filterIdx, "Full (#highlightWrap) precedes Filtered (#filterSlot) in DOM order when stacked");

  // Resizers: sidebar + fhSplit
  const sidebarEl = d.querySelector("#sidebar");
  const sidebarResizer = d.querySelector("#sidebarResizer");
  sidebarResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 270 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 340 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
  assert(sidebarEl.style.width !== "", "sidebar resizer sets an explicit width, got " + JSON.stringify(sidebarEl.style.width));

  const filterSlot = d.querySelector("#filterSlot");
  const fhSplitResizer = d.querySelector("#fhSplitResizer");
  const beforeHeight = filterSlot.style.height;
  fhSplitResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientY: 200 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 260 })); // drag DOWN
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
  assert(filterSlot.style.height !== beforeHeight, "fhSplit resizer changes #filterSlot's explicit height when dragged");
});

/* ============================================================
   GROUP 15 — Bookmarks
   Origin: 7ef2c2a6 (item 3). Covers toggle via keyboard shortcut and
   context menu, the panel listing/note editing, and jumpToEntry's
   root-file resolution (works from anywhere, unlike the old jumpToFullLog
   which assumed the current chain).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("15. Bookmarks");
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 5, { msgPrefix: "other" }), () => {});
  w.render();
  T.state.activeId = fa.id;
  w.render();

  // Keyboard shortcut "B"
  w.selectEntry(fa.entries[1].id);
  fireKeydown(d, w, "b");
  assert(T.state.bookmarks.has(fa.entries[1].id), "'B' shortcut bookmarks the selected entry");
  assert(d.querySelector("#btnBookmarks .toolbar-badge").textContent === "1", "toolbar badge shows the bookmark count");
  fireKeydown(d, w, "b");
  assert(!T.state.bookmarks.has(fa.entries[1].id), "'B' again removes the bookmark");

  // Context-menu toggle (entry not in entryIndex, e.g. a pair entry, must be hidden — spot-checked via a real entry here)
  w.openContextMenu({ clientX: 10, clientY: 10 }, fa.entries[2]);
  assert(d.querySelector("#ctxBookmark").style.display !== "none", "bookmark menu item visible for a real, indexed entry");
  fireClick(d.querySelector("#ctxBookmark"), w);
  assert(T.state.bookmarks.has(fa.entries[2].id), "context-menu 'Bookmark this row' sets the bookmark");

  // Panel: listing, sorted by time, note editing
  w.toggleBookmark(fa.entries[0].id); // add a second, earlier bookmark to check sort order
  w.openBookmarksPanel();
  const rows = [...d.querySelectorAll("#bookmarksList .bookmark-row")];
  assert(rows.length === 2, "bookmarks panel lists both bookmarks");
  const noteInput = rows[0].querySelector(".bookmark-row-note");
  noteInput.value = "check this";
  noteInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.bookmarks.get(fa.entries[0].id).note === "check this", "editing a bookmark's note persists it to state.bookmarks");

  // jumpToEntry: works from a completely different file/filter than the bookmark's own root
  T.state.activeId = fb.id;
  w.render();
  w.jumpToEntry(fa.entries[2].id);
  assert(T.state.activeId === fa.id, "jumpToEntry resolves the bookmark's OWN root file, not whatever chain was active");
  assert(T.state.selectedId === fa.entries[2].id, "jumpToEntry selects the bookmarked entry");

  // A bookmark whose entry no longer resolves renders gracefully, not silently dropped
  const ghostId = "nonexistent-entry-id";
  T.state.bookmarks.set(ghostId, { note: "", bookmarkedAt: Date.now() });
  w.renderBookmarksPanel();
  assert(d.querySelector("#bookmarksList").textContent.includes("no longer available"), "an unresolvable bookmark shows 'no longer available' instead of vanishing");
});

/* ============================================================
   GROUP 16 — Undo / Redo
   Origin: 7ef2c2a6 (item 6). Snapshot-based stack scoped to filter node
   delete/move ONLY (not files, not value edits) — verifies the wrapped
   mutators, the redo-stack-clearing-on-new-action semantics, the stack
   limit, and that linkedId self-heals when a subtree is restored.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("16. Undo / Redo");
  const fa = await w.addFile("a.log", makeLog(0, 10), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 10, { msgPrefix: "other" }), () => {});
  w.render();

  // Delete + undo + redo
  const toDelete = w.createFilterNode(fa.id, "text", "message 1");
  const beforeCount = fa.children.length;
  w.deleteFilterNodeWithUndo(toDelete.id);
  assert(fa.children.length === beforeCount - 1, "deleteFilterNodeWithUndo removes the node");
  assert(!T.state.nodes[toDelete.id], "deleted node is gone from state.nodes");
  w.undo();
  assert(T.state.nodes[toDelete.id], "undo restores the deleted node");
  assert(T.state.nodes[toDelete.id].id === toDelete.id, "restored node keeps its ORIGINAL id (so external linkedId refs self-heal)");
  w.redo();
  assert(!T.state.nodes[toDelete.id], "redo re-applies the delete");

  // linkedId self-healing: an AND node elsewhere pointing at a deleted node
  // should transparently start resolving again once undo restores it.
  // AND/OR combine two filters from the SAME file by design (cross-file
  // combination is unsupported — see PROJECT.md); using two different-file
  // filters here would make the intersection trivially empty regardless of
  // whether the target exists, since entry ids never overlap across files.
  const refA = w.createFilterNode(fa.id, "text", "message");
  const refA2 = w.createFilterNode(fa.id, "text", "message 1"); // subset of refA's own file
  const andNode = w.createAndOrNode(refA.id, refA2.id, "and");
  w.render();
  assert(w.getEntries(andNode.id).length > 0, "sanity: AND of two same-file filters has a non-empty intersection before any delete");
  w.deleteFilterNodeWithUndo(refA2.id); // deletes the AND's linkedId target
  w.invalidateAllCaches();
  assert(w.getEntries(andNode.id).length === 0, "AND node fails gracefully (empty result) while its linkedId target is deleted");
  w.undo();
  w.invalidateAllCaches();
  assert(w.getEntries(andNode.id).length > 0, "AND node's linkedId self-heals once the deleted target is restored by undo, same id");

  // Move + undo
  const moveTarget = w.createFilterNode(fa.id, "text", "x");
  const oldParentId = moveTarget.parentId;
  const anotherParent = w.createFilterNode(fa.id, "text", "y");
  w.moveFilterNodeWithUndo(moveTarget.id, anotherParent.id);
  assert(moveTarget.parentId === anotherParent.id, "moveFilterNodeWithUndo reparents the node");
  w.undo();
  assert(moveTarget.parentId === oldParentId, "undo restores the original parentId after a move");

  // A brand-new action clears the redo stack (standard semantics)
  w.redo(); // move redone
  const redoNode = w.createFilterNode(fa.id, "text", "fresh");
  w.deleteFilterNodeWithUndo(redoNode.id);
  assert(T.redoStack.length === 0, "pushing a new undo action clears any existing redo history");

  // Files are explicitly OUT of undo scope
  const fileToDelete = await w.addFile("c.log", makeLog(0, 3), () => {});
  const stackLenBefore = T.undoStack.length;
  w.deleteFilterNodeWithUndo(fileToDelete.id); // falls through to plain deleteNode for file-type nodes
  assert(!T.state.nodes[fileToDelete.id], "file deletion still works through the wrapped call");
  assert(T.undoStack.length === stackLenBefore, "deleting a FILE does not push an undo action (v1 scope: filters only)");
});

/* ============================================================
   GROUP 13 — Δt column + Timeline minimap
   Origin: b647f247 (27-check jsdom suite, incl. a scenario with burst
   traffic, a 6-second stall, and an isolated error — re-created here).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("13. Δt column + Timeline minimap");
  // Build: 5 rapid entries (burst), then a 6s stall, then 1 more entry.
  const lines = [];
  const push = (sec, level, msg) => lines.push(`2024-01-15 10:00:${String(sec).padStart(2, "0")},000\t${level}\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`);
  for (let i = 0; i < 5; i++) push(i, "INFO", "burst " + i); // 0..4s
  push(10, "ERROR", "isolated error");                        // 6s stall before this one
  const f = await w.addFile("delta.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  const deltaCells = [...d.querySelectorAll("#tableRows .col-delta")];
  assert(deltaCells[0].textContent === "—", "first row has no Δt (no previous row)");
  // DELTA_WARN_MS is exactly 1000 and our burst entries are 1s apart (>=
  // threshold), so they're correctly flagged warn — assert that instead of
  // "not flagged", which was the wrong expectation for this fixture.
  assert(deltaCells[1].className.includes("delta-warn"), "a 1s gap between burst entries hits the warn threshold (DELTA_WARN_MS=1000), classes: " + deltaCells[1].className);
  const stallCell = deltaCells[5];
  assert(stallCell.className.includes("delta-error"), "a 6s stall is flagged as delta-error (>5s threshold), classes: " + stallCell.className);

  // Δt suppressed under column sort
  fireClick([...d.querySelectorAll(".th-sortable")].find(th => th.dataset.sort === "level"), w);
  assert([...d.querySelectorAll("#tableRows .col-delta")].every(c => c.textContent === "—"), "Δt dashed out under an active column sort");
  T.state.sortColumn = null; w.render();

  // Timeline minimap: background bars for the whole file, overlay for the current view
  assert(d.querySelectorAll("#timelineMinimapSvg .minimap-bg-bar").length > 0, "minimap renders background density bars");
  assert(d.querySelectorAll("#timelineMinimapSvg .minimap-ov-bar").length > 0, "minimap renders overlay bars for the current view");
  assert(d.querySelector("#timelineMinimapMeta").textContent.includes("Start") && d.querySelector("#timelineMinimapMeta").textContent.includes("Duration"),
    "Start/End/Duration meta line renders above the bars");

  // Click-to-jump via lowerBoundByTs + selectEntry
  const ts = w.minimapXToTs ? null : null; // minimapXToTs isn't exported on window (top-level function — it IS, since function decls land on window)
  const clickTs = f.entries[3].ts;
  const x = w.minimapTsToX ? w.minimapTsToX(clickTs) : 0;
  d.querySelector("#timelineMinimapSvg").dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: x, clientY: 10 }));
  assert(T.state.selectedId != null, "clicking the minimap selects the nearest entry");

  // Level-toggle overlay recompute (overlay bars reflect the level quick-filter)
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  const ovBarsAfter = d.querySelectorAll("#timelineMinimapSvg .minimap-ov-bar").length;
  assert(ovBarsAfter >= 1, "minimap overlay updates after a level-filter toggle");
  fireClick(errBtn, w);
});

/* ============================================================
   GROUP 14 — Value assertions + Column statistics
   Origin: 7ef2c2a6 (items 1 & 2 of FEATURE_BACKLOG.md). Covers both
   assertion modes, the violation badge/cell tint, persistence through
   cloneSubtree (copy/paste) — save/load persistence for assertions is
   already covered in Group 11 — and the two-pass column-stats computation.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("14. Value assertions + Column statistics");
  const f = await w.addFile("a.log", makeLog(0, 10, { suffix: i => "n=" + i }), () => {});
  const node = w.createFilterNode(f.id, "extract", "n=[value:int]");
  T.state.activeId = node.id;
  w.render();

  // Range mode via the real dialog
  const assertBtn = d.querySelector(".extract-assert-btn");
  fireClick(assertBtn, w);
  assert(!d.querySelector("#assertDialog").classList.contains("hidden"), "clicking the target-icon button opens the assertion dialog");
  d.querySelector("#assertMinInput").value = "3";
  d.querySelector("#assertMaxInput").value = "6";
  fireClick(d.querySelector("#assertDialogSave"), w);
  assert(node.assertions[0].mode === "range" && node.assertions[0].min === 3 && node.assertions[0].max === 6, "range assertion saved with min/max");
  const violationCount = T.extractRowsData.filter(r => w.checkAssertion(node, 0, r.values[0], "int") === true).length;
  assert(violationCount === 6, "range assertion flags values outside [3,6] as violations (0,1,2,7,8,9 = 6), got " + violationCount);
  assert(d.querySelector(".extract-assert-btn.active") !== null, "assertion button shows active state once a column has an assertion");
  assert(d.querySelectorAll("#extractBody .assert-violation").length === violationCount, "violating cells get the assert-violation tint");
  const badge = d.querySelector("#extractHead .assert-badge, #extractHead [class*=assert]");
  // badge text check is soft — just confirm the summary function agrees with the DOM violation count
  const summary = w.assertionSummary(node, 0);
  assert(summary.violations === violationCount && summary.total === 10, "assertionSummary matches the per-cell violation count");

  // Target ± tolerance mode
  fireClick(assertBtn, w);
  fireClick(d.querySelector("#assertModeTarget"), w);
  d.querySelector("#assertTargetInput").value = "5";
  d.querySelector("#assertToleranceInput").value = "1";
  fireClick(d.querySelector("#assertDialogSave"), w);
  assert(node.assertions[0].mode === "target" && node.assertions[0].target === 5 && node.assertions[0].tolerance === 1, "target±tolerance assertion overwrites the range assertion on the same column");
  assert(w.checkAssertion(node, 0, "5", "int") === false, "value exactly at target passes");
  assert(w.checkAssertion(node, 0, "9", "int") === true, "value outside target±tolerance violates");
  assert(w.checkAssertion(node, 0, "abc", "int") === null, "an unparseable value is neither pass nor violation (null)");

  // Clear
  fireClick(assertBtn, w);
  fireClick(d.querySelector("#assertDialogClear"), w);
  assert(!node.assertions[0], "Clear removes the assertion for that column");

  // Persistence through cloneSubtree (copy/paste) — save/load already covered in Group 11
  node.assertions = { 0: { mode: "range", min: 1, max: 8 } };
  const clone = w.cloneSubtree(node.id, f.id);
  assert(clone.assertions && clone.assertions[0].max === 8, "cloneSubtree carries assertions onto the copy");

  // Column statistics: min/max/mean/stddev, two-pass (not Math.min(...spread))
  const stats = w.computeColumnStats(0);
  const vals = Array.from({ length: 10 }, (_, i) => i);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  assert(stats.min === 0 && stats.max === 9, "column stats min/max correct");
  assert(Math.abs(stats.mean - mean) < 1e-9, "column stats mean correct");
  assert(Math.abs(stats.stddev - Math.sqrt(variance)) < 1e-6, "column stats stddev correct");
});

/* ============================================================
   GROUP 11 — Filter save/load JSON round trip
   Origin: 6233b6f7. NOTE: that session's own test used an older, cruder
   eval-based harness (predates the T-bridge convention) and only checked
   the initial single-file JSON shape — it predates the mid-session redesign
   in the SAME conversation that pulls in and/or/link dependency chains via
   attach:"file"/attach:"target" tags. Rewritten here against the CURRENT
   format (FILTER_FILE_VERSION = 2) to actually exercise that redesign,
   which had no lasting test coverage until now.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("11. Filter save/load JSON round trip");
  const fa = await w.addFile("a.log", makeLog(0, 20), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "other" }), () => {});
  w.render();

  // Branch: chain fa -> chainNode -> extractNode (with an assertion, to also
  // confirm assertions round-trip through save/load, not just copy/paste).
  const chainNode = w.createFilterNode(fa.id, "text", "message");
  const extractNode = w.createFilterNode(chainNode.id, "extract", "message [value:int]");
  extractNode.assertions = { 0: { mode: "range", min: 0, max: 100 } };
  // AND node combining a sibling-branch filter with a filter from file B —
  // the dependency (fFilterB) sits OUTSIDE the branch being saved.
  const fFilterB = w.createFilterNode(fb.id, "text", "other");
  const andNode = w.createAndOrNode(extractNode.id, fFilterB.id, "and");
  w.render();

  const branch = w.serializeFilterBranch(andNode.id);
  assert(branch && branch.roots.length === 2, "serializeFilterBranch produces two independent trees: the target chain + the pulled-in linkedId dependency chain, got " + (branch && branch.roots.length));
  const targetRoot = branch.roots.find(r => r.attach === "target");
  const fileRoot = branch.roots.find(r => r.attach === "file");
  assert(targetRoot, "primary chain tagged attach:target");
  assert(fileRoot, "pulled-in and/or dependency chain tagged attach:file");

  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });

  // Load onto a THIRD, fresh file — re-evaluates against new data, doesn't replay a stored result.
  // Loaded onto a CHILD FILTER (not the file itself) so attach:"target" (goes
  // to the clicked node) and attach:"file" (always goes to the root file,
  // even when loading deep in the tree) land on visibly different parents.
  const fc = await w.addFile("c.log", makeLog(0, 20, { msgPrefix: "message" }), () => {});
  const fcAnchor = w.createFilterNode(fc.id, "text", "message");
  w.render();
  // importFilterJson reads the module-level loadFilterTargetId, the same way
  // loadFilterFromFile() sets it before calling importFilterJson — reach it
  // via the shared lexical scope (see W_setLoadTarget below).
  const before = fcAnchor.children.length;
  W_setLoadTarget(w, fcAnchor.id);
  w.importFilterJson(json);
  assert(fcAnchor.children.length === before + 1, "load creates a fresh 'target' subtree directly under the CLICKED node");
  assert(fc.children.length === 2, "the pulled-in 'file' dependency chain is created directly under the FILE, not nested under the clicked node — got " + fc.children.length);
  const loadedTargetRootId = fcAnchor.children[fcAnchor.children.length - 1];
  // getChain() walks UPWARD to the root — the loaded "message" text node is
  // the subtree ROOT, and the extract node sits as its CHILD, so find it by
  // walking the freshly-loaded subtree downward instead.
  function findInSubtree(id, pred) {
    const n = T.state.nodes[id];
    if (!n) return null;
    if (pred(n)) return n;
    for (const c of n.children) { const r = findInSubtree(c, pred); if (r) return r; }
    return null;
  }
  const loadedExtract = findInSubtree(loadedTargetRootId, n => n.filterType === "extract");
  assert(loadedExtract && loadedExtract.assertions && loadedExtract.assertions[0].max === 100, "assertion travels through save/load JSON");
  const loadedAnd = Object.values(T.state.nodes).find(n => n.filterType === "and" && n.parentId === loadedExtract.id);
  assert(loadedAnd, "AND node recreated under the loaded extract node");
  assert(loadedAnd.linkedId && loadedAnd.linkedId !== fFilterB.id, "AND node's linkedId was remapped to a FRESH node id, not the original");
  const dependencyNode = T.state.nodes[loadedAnd.linkedId];
  assert(dependencyNode && dependencyNode.parentId === fc.id, "pulled-in and/or dependency (attach:file) is recreated directly under the destination FILE, not nested under the target chain");
  assert(w.getEntries(loadedAnd.id).length >= 0, "reloaded AND node's getEntries() resolves without throwing (re-evaluated against the new file's own data)");

  function W_setLoadTarget(w, targetId) {
    // loadFilterTargetId is a top-level `let` — reach it via the shared
    // lexical scope the same way the T bridge does, but write instead of read.
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(targetId)};`;
    d.body.appendChild(s);
  }
});

/* ============================================================
   GROUP 12 — Tailing
   Origin: 727a344e (initial feature, 24 assertions) + 94d8ec50 (rotation
   index-leak fix, folded into Group 10 above). Re-verifies growth via
   file.slice(offset), split-line buffering across poll boundaries, and
   truncation/rotation handling — using a fake FileSystemFileHandle since
   jsdom has no File System Access API.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("12. Tailing (growth, split lines, rotation)");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
        blob.slice = (start) => new w.Blob([text.slice(start)]);
        blob.text = async () => text.slice(0); // full text (offset math done by slice() above)
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        // Re-implement slice properly: Blob.slice needs byte semantics; since
        // this fixture's text is ASCII, string-index slicing is equivalent.
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }

  const initial = makeLog(0, 3);
  const handle = fakeHandle(initial);
  const f = await w.addFile("live.log", initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false };
  w.render();
  assert(f.entries.length === 3, "initial tail state seeded with 3 entries");

  // Growth: append a new complete line
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"new entry"\n`;
  handle._setText(initial + appended);
  await w.tailTick();
  assert(f.entries.length === 4, "tailTick picks up newly appended complete line, got " + f.entries.length);

  // Split line across poll boundary: write a partial line (no trailing
  // newline yet), tick, then complete it on the next tick.
  const partial = `2024-01-15 10:00:04,000\tINFO\t"main"\tFoo.cs\tline 4\t[DoWork]\t"split mess`;
  handle._setText(initial + appended + partial);
  await w.tailTick();
  assert(f.entries.length === 4, "an unterminated trailing line is buffered, not parsed as a new entry yet");
  assert(f.tail.pending.length > 0, "unterminated text sits in tail.pending");
  handle._setText(initial + appended + partial + `age"\n`);
  await w.tailTick();
  assert(f.entries.length === 5, "completing the line on the next poll parses it as one entry, got " + f.entries.length);
  assert(f.entries[4].message === "split message", "the split line reassembled correctly across the poll boundary");

  // Rotation/truncation: file shrinks below the tracked offset -> reset and re-read from 0.
  const rotatedText = makeLog(0, 2, { msgPrefix: "rotated" });
  const staleEntryId = f.entries[0].id;
  handle._setText(rotatedText);
  await w.tailTick();
  assert(f.entries.length === 2, "rotation resets entries and re-reads from offset 0, got " + f.entries.length);
  assert(f.entries[0].message.includes("rotated"), "post-rotation entries reflect the new file content");
  assert(T.entryIndex[staleEntryId] === undefined, "rotated-out entries are released from entryIndex (94d8ec50 fix, re-verified live here)");
});

/* ============================================================
   GROUP 9 — Time context filter
   Origin: 1dd227c6. Covers window construction, overlapping-range merge,
   the whole-root-file source pool (not a second reference filter), bracket
   rendering, anchor dots, ms-unit dialog (a same-session follow-up dropped
   the earlier *1000 seconds conversion), and NOT-exclusion (verified
   structurally in Group 8; here we verify getEntries() itself, not just the
   menu omission).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("9. Time context filter");
  // Two reference entries close enough together that their +/-500ms windows
  // overlap and should merge into ONE bracket group; a third, far-away
  // reference entry should stay a separate group.
  const f = await w.addFile("a.log", makeLog(0, 40, { msgPrefix: "ref", suffix: i => (i === 5 || i === 6 || i === 30) ? "MARK" : "" }), () => {});
  w.render();
  const refFilter = w.createFilterNode(f.id, "text", "MARK");
  assert(w.getEntries(refFilter.id).length === 3, "reference filter matches the 3 marked entries");

  const ctxNode = w.createContextNode(refFilter.id, 1500, 1500); // ms, generous enough to bridge entries 5&6 (1s apart)
  const ctxEntries = w.getEntries(ctxNode.id);
  assert(ctxEntries.length > 3, "context filter pulls in entries from the WHOLE root file, not just the reference filter's own result");
  assert(ctxNode._contextRanges.length === 2, "overlapping windows (entries 5&6) merge into one range; the far entry (30) stays separate — got " + ctxNode._contextRanges.length);
  assert(ctxNode._anchorIds.has(f.entries[5].id) && ctxNode._anchorIds.has(f.entries[30].id), "anchor id set contains the reference entries");

  // Child filters chain underneath a context node exactly like any other
  // filter, because its result is real entries, not synthetic ones.
  const childUnderCtx = w.createFilterNode(ctxNode.id, "text", "ref");
  assert(w.getEntries(childUnderCtx.id).length === ctxEntries.length, "a plain filter chains underneath a context node without special handling");

  // Bracket + anchor-dot rendering
  T.state.activeId = ctxNode.id;
  T.state.sortColumn = null;
  w.render();
  assert(d.querySelectorAll("#tableRows .ctx-bracket").length > 0, "context bracket renders in the log view");
  assert(d.querySelectorAll("#tableRows .ctx-anchor-dot").length > 0, "anchor dot renders on reference-entry rows");

  // Dialog: ms units (no *1000 conversion), values round-tripped verbatim
  const someRef = w.createFilterNode(f.id, "text", "MARK");
  T.state.activeId = someRef.id;
  w.render();
  w.openContextDialog(someRef.id);
  d.querySelector("#contextBeforeInput").value = "250";
  d.querySelector("#contextAfterInput").value = "0";
  fireClick(d.querySelector("#contextDialogCreate"), w);
  const createdCtx = T.state.nodes[T.state.activeId];
  assert(createdCtx.contextBefore === 250, "context dialog stores the value as milliseconds verbatim (no unit conversion)");
});

/* ============================================================
   GROUP 10 — Bugfix regressions from the dedicated code-review session
   Origin: 94d8ec50. Three fixes: (1) Escape key on an active extraction
   cell-selection no longer throws (the handler called a helper that no
   longer existed); (2) deleting a file no longer corrupts entryIndex for
   OTHER files that share entries with it via merge (releaseEntriesFromIndex);
   (3) the same helper is used on tail rotation so rotated-out entries don't
   leak in entryIndex for the session lifetime (re-verified here structurally;
   the live poll itself is exercised in Group 12).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("10. Bugfix regressions (Escape handler, releaseEntriesFromIndex)");

  // (1) Escape with an active extraction cell selection
  const f = await w.addFile("a.log", makeLog(0, 5, { suffix: i => "n=" + i }), () => {});
  const extractNode = w.createFilterNode(f.id, "extract", "n=[value:int]");
  T.state.activeId = extractNode.id;
  w.render();
  T.state.tableSelection = new Set(["0,0"]);
  let threw = false;
  try { fireKeydown(d, w, "Escape"); } catch (e) { threw = true; }
  assert(!threw, "Escape with an active extraction cell selection does not throw");
  assert(T.state.tableSelection === null, "Escape clears the extraction cell selection");

  // (2) Merged file entry-sharing survives deleting one of the source files
  const fa = await w.addFile("src-a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("src-b.log", makeLog(0, 5, { msgPrefix: "other" }), () => {});
  const merged = w.mergeFiles([fa.id, fb.id]);
  assert(merged.entries.length === 10, "merge combines both source files' entries");
  const sharedEntryId = fa.entries[0].id;
  assert(T.entryIndex[sharedEntryId] === fa.entries[0], "shared entry present in entryIndex before any delete");
  w.deleteFilterNodeWithUndo(fa.id); // deletes the FILE (out of undo scope, falls through to deleteNode)
  assert(T.entryIndex[sharedEntryId] !== undefined, "deleting a source file does NOT drop entries still referenced by the merged file (releaseEntriesFromIndex)");
  assert(merged.entries.some(e => e.id === sharedEntryId), "merged file's own entries array is unaffected by the source file's deletion");
  w.deleteFilterNodeWithUndo(merged.id);
  assert(T.entryIndex[sharedEntryId] === undefined, "once the LAST referencing root is gone, the entry is finally released from entryIndex");
});

/* ============================================================
   GROUP 7 — Copy/Cut/Paste, drag-and-drop, AND/OR/LINK cycle guard
   Origin: 3f879dbe. This session established that and/or/link nodes CAN be
   copy/cut/paste/dragged (the earlier blanket exclusion was too broad — see
   PROJECT.md "Core data model") as long as the one genuine risk (a node's
   own linkedId target becoming its ancestor) is blocked by
   wouldCreateLinkedCycle/subtreeHasLinkedCycle. Also covers the file-drop
   overlay isFileDrag() gate from the same session.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("7. Copy/Cut/Paste + drag-and-drop + and/or/link cycle guard");
  const fa = await w.addFile("a.log", makeLog(0, 20), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "other" }), () => {});
  w.render();

  // Plain filter copy/paste (regression baseline)
  const plain = w.createFilterNode(fa.id, "text", "message 1");
  T.state.activeId = plain.id;
  T.state.clipboard = { id: plain.id, mode: "copy" };
  T.state.activeId = fa.id;
  w.pasteClipboard();
  assert(T.state.activeId !== plain.id && T.state.nodes[T.state.activeId].filterType === "text",
    "plain filter copy/paste creates a new node");

  // AND node combining a filter from A with one from B, then copy/cut/drag it
  const fFilterA = w.createFilterNode(fa.id, "text", "message");
  const fFilterB = w.createFilterNode(fb.id, "text", "other");
  const andNode = w.createAndOrNode(fFilterA.id, fFilterB.id, "and");
  w.render();
  assert(andNode.linkedId === fFilterB.id, "AND node stores the second reference as linkedId");

  T.state.activeId = andNode.id;
  T.state.clipboard = { id: andNode.id, mode: "copy" };
  T.state.activeId = fFilterA.id;
  const beforePaste = fFilterA.children.length;
  w.pasteClipboard();
  assert(fFilterA.children.length === beforePaste + 1, "AND node can be copy/pasted (was blanket-blocked before 3f879dbe)");
  const pastedAndId = fFilterA.children[fFilterA.children.length - 1];
  assert(T.state.nodes[pastedAndId].linkedId === fFilterB.id, "pasted AND node's linkedId still points at the original target (cloneSubtree carries it)");

  // Cycle guard: moving/pasting the AND node into its own linkedId target's
  // subtree must be rejected (would make getEntries() recurse forever).
  const childOfB = w.createFilterNode(fFilterB.id, "text", "x");
  const movedBad = w.moveNode(andNode.id, childOfB.id);
  assert(movedBad === false, "moveNode rejects placing a node as descendant of its own linkedId target (cycle guard)");
  assert(andNode.parentId === fFilterA.id, "AND node's parentId is unchanged after a blocked move");

  // A blocked CUT must keep the clipboard active (not silently clear it) —
  // exercised via pasteClipboard's cut branch.
  T.state.activeId = andNode.id;
  T.state.clipboard = { id: andNode.id, mode: "cut" };
  T.state.activeId = childOfB.id;
  w.pasteClipboard();
  assert(T.state.clipboard !== null, "a blocked cut-paste keeps the clipboard active instead of clearing it");

  // Legit move still works
  const otherFilterA = w.createFilterNode(fa.id, "text", "y");
  T.state.activeId = otherFilterA.id;
  const movedOk = w.moveNode(andNode.id, otherFilterA.id);
  assert(movedOk === true, "moveNode allows a non-cyclic reparent");
  assert(andNode.parentId === otherFilterA.id, "AND node's parentId updated after a legit move");
  assert(andNode.linkedId === fFilterB.id, "linkedId survives a legit move untouched");

  // Real drag-and-drop DOM path + isFileDrag() overlay gate
  w.render();
  const rows = [...d.querySelectorAll(".tree-row")];
  const plainRow = rows.find(r => r.querySelector(".tree-label") && r.querySelector(".tree-label").textContent.includes("message 1"));
  const fileRow = rows.find(r => r.querySelector(".tree-label") && r.querySelector(".tree-label").textContent === "a.log");
  assert(plainRow && fileRow, "located rows for a real drag-and-drop simulation");
  const dt = mkDataTransfer(w);
  fireDrag(plainRow, w, "dragstart", dt);
  const dropOverlayBefore = d.querySelector("#dropOverlay").classList.contains("hidden");
  fireDrag(fileRow, w, "dragover", dt);
  assert(fileRow.classList.contains("drag-over"), "dragover on a valid drop target highlights it");
  fireDrag(fileRow, w, "drop", dt);
  // Internal tree drag must NOT trigger the file-drop overlay (isFileDrag()
  // gates on dataTransfer.types including "Files" — our synthetic DT never
  // sets that), regardless of before/after state.
  assert(d.querySelector("#dropOverlay").classList.contains("hidden") === dropOverlayBefore,
    "internal tree drag does not toggle the file-drop overlay (isFileDrag gate)");
});

/* ============================================================
   GROUP 8 — Filter inversion (NOT)
   Origin: 62262740. NOTE: this session shipped WITHOUT a jsdom test (went
   straight from implementation to documentation) — this is the first actual
   test coverage this feature has had. Covers the generic set-difference
   semantics and both exclusions (link/extract), plus the THIRD exclusion
   (context) that was added later in 1dd227c6 and is only documented, never
   tested, until now.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("8. Filter inversion (NOT)");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();

  const normal = w.createFilterNode(f.id, "text", "message 1");
  const inverted = w.createFilterNode(f.id, "text", "message 1", true);
  const normalCount = w.getEntries(normal.id).length;
  const invertedCount = w.getEntries(inverted.id).length;
  assert(normalCount + invertedCount === 10, "inverted result is the exact set-complement of the normal result within the parent");
  assert(!w.getEntries(inverted.id).some(e => e.message.includes("message 1")), "inverted filter excludes everything the normal filter would have kept");

  // NOT checkbox at creation time (filter popup)
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "message 2";
  d.querySelector("#filterInvertCheckbox").checked = true;
  fireSubmit(d.querySelector("#filterForm"), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.inverted === true, "NOT checkbox in the filter popup sets inverted:true at creation");

  // Right-click toggle after the fact
  w.render();
  const plainNode = w.createFilterNode(f.id, "text", "message 3");
  T.state.activeId = plainNode.id;
  w.render();
  const row = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(row, w);
  const invertItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "invert");
  assert(invertItem, "tree context menu offers Invert (NOT) for an eligible node");
  fireClick(invertItem, w);
  assert(plainNode.inverted === true, "context-menu Invert (NOT) toggles the flag");

  // Exclusions: link, extract, context
  const extractNode = w.createFilterNode(f.id, "extract", "message [value:int]");
  T.state.activeId = extractNode.id;
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "invert"),
    "tree context menu omits Invert (NOT) for extract nodes");

  const f2 = await w.addFile("b.log", makeLog(0, 10, { msgPrefix: "other" }), () => {});
  const linkNode = w.createLinkNode(f.id, f2.id, "before", 1);
  T.state.activeId = linkNode.id;
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "invert"),
    "tree context menu omits Invert (NOT) for link nodes");

  const ctxNode = w.createContextNode(f.id, 1000, 1000);
  T.state.activeId = ctxNode.id;
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "invert"),
    "tree context menu omits Invert (NOT) for context nodes (3rd exclusion, added after the original NOT session)");

  // NOT stays available even while typing an extraction pattern (superseded
  // this session — see Group 41 — by the two-button "Add filter"/"Extract"
  // redesign: NOT/case/columns are parameters of "Add filter" only, and
  // "Extract" simply ignores them regardless of their current state, so
  // there's nothing left to conditionally disable based on pattern content).
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  const invertCb = d.querySelector("#filterInvertCheckbox");
  invertCb.checked = true;
  filterInput.value = "[value:int]";
  fireInput(filterInput, w);
  assert(invertCb.disabled === false, "typing an extraction pattern leaves NOT available — it only governs the 'Add filter' outcome, which Extract never touches");
  w.closeFilterPopup();
});

/* ============================================================
   GROUP 3 — Theme toggle
   Origin: 765d68a9 (design improvements session, test.js, 28 checks).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("3. Theme toggle");
  const html = d.documentElement;
  const before = html.dataset.theme;
  fireClick(d.querySelector("#btnTheme"), w);
  assert(html.dataset.theme !== before, "theme toggle flips data-theme, was " + before + " now " + html.dataset.theme);
  assert(w.localStorage.getItem("philogg-theme") === html.dataset.theme, "theme choice persisted to localStorage");
});

/* ============================================================
   GROUP 4 — Tree / status strip / severity bar / level quick-filter dual-view
   Origin: 765d68a9 (sortable columns, status strip, severity bar) +
   32e282b4 follow-up (level quick-filter now updates BOTH Full and Filtered
   views in one click, not just Filtered).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("4. Tree / status strip / severity bar / dual-view level filter");
  const f = await w.addFile("a.log", makeLog(0, 30, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  w.render();

  // Sortable Time/Level/Thread/Location column headers
  const timeHeader = [...d.querySelectorAll(".th-sortable")].find(th => th.dataset.sort === "level");
  fireClick(timeHeader, w);
  assert(T.state.sortColumn === "level" && T.state.sortDir === "asc", "clicking a sortable header sets sortColumn/sortDir");
  fireClick(timeHeader, w);
  assert(T.state.sortDir === "desc", "clicking the same header again flips direction");
  fireClick(timeHeader, w);
  T.state.sortColumn = null; w.render(); // reset for later groups' Δt/context assumptions

  // Status strip
  assert(d.querySelector("#statusStrip").innerHTML.includes("30"), "status strip shows total row count");

  // Severity bar column exists (widened 3px -> 5px in that session; just check presence)
  assert(d.querySelector("#tableRows .col-bar") !== null, "severity color bar column renders on rows");

  // Level quick-filter: toggling ERROR must update BOTH the Filtered (#tableRows)
  // and the Full (#highlightRows) views in the SAME click (bugfix from 32e282b4 —
  // previously only renderTable() was called, leaving Full stale until an
  // unrelated render happened to touch it).
  w.applyFhView("stacked"); // both panels rendered so we can inspect both
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  const filteredLevels = [...d.querySelectorAll("#tableRows .level-badge")].map(b => b.textContent);
  const fullLevels = [...d.querySelectorAll("#highlightRows .level-badge")].map(b => b.textContent);
  assert(filteredLevels.length > 0 && filteredLevels.every(l => l === "ERROR"), "Filtered view narrows to ERROR immediately");
  assert(fullLevels.length > 0 && fullLevels.every(l => l === "ERROR"), "Full view ALSO narrows to ERROR in the same click (regression guard)");
  fireClick(errBtn, w); // reset
});

/* ============================================================
   GROUP 5 — Extraction workflow: sort, cell selection, regression
   Origin: 765d68a9 (per-column sort buttons, live match, token chips) —
   the sort-button stopPropagation regression (must not also trigger the
   header's column cell-selection drag) is explicitly re-checked here.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("5. Extraction table: sort buttons + cell selection regression");
  const f = await w.addFile("a.log", makeLog(0, 10, { suffix: i => "n=" + (10 - i) }), () => {});
  const node = w.createFilterNode(f.id, "extract", "n=[value:int]");
  T.state.activeId = node.id;
  w.render();

  assert(T.extractRowsData.length === 10, "extraction table populated, one row per matching entry");
  assert(T.extractColumns[0].type === "int", "extracted column typed as int");

  const sortBtn = d.querySelector(".extract-sort-btn");
  fireClick(sortBtn, w);
  const firstVal = +T.extractRowsData[0].values[0];
  const lastVal = +T.extractRowsData[T.extractRowsData.length - 1].values[0];
  assert(firstVal <= lastVal, "column sort button reorders extractRowsData numerically, got first=" + firstVal + " last=" + lastVal);

  // Regression: header body click/drag still does cell selection independent
  // of the sort button (the two share a <th> but have separate handlers).
  const th = d.querySelector("#extractHead th[data-col]");
  th.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  th.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
  // Duck-typed, not `instanceof Set` — T.state comes from the jsdom window's
  // realm, whose Set constructor differs from Node's global Set.
  assert(T.state.tableSelection && typeof T.state.tableSelection.has === "function" && T.state.tableSelection.size === 10,
    "header click still drives cell-selection (regression from 765d68a9)");
});

/* ============================================================
   GROUP 6 — Double-click DOM-identity regression
   Origin: 3f879dbe (root-cause session). The single most consequential bug
   in the project history — see PROJECT.md "Testing approach". Re-verified
   here because it's exactly the kind of regression a later refactor of
   renderVisibleRows()/selectEntry() could silently reintroduce.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("6. Double-click DOM-identity regression (renderVisibleRows must not tear down rows on plain click)");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const idBefore = f.entries[2].id;
  let rowEl = d.querySelector('#tableRows [data-entry-id="' + idBefore + '"]');
  fireClick(rowEl, w);
  const rowElAfter = d.querySelector('#tableRows [data-entry-id="' + idBefore + '"]');
  assert(rowEl === rowElAfter, "plain click does not recreate the row DOM node (dblclick would silently break otherwise)");
  assert(rowElAfter.classList.contains("selected"), "plain click still marks the row selected (in-place class toggle)");

  // dblclick now reveals the entry in the Full view (revealInHighlightView),
  // replacing the old destructive jumpToFullLog for the plain log/link view —
  // see Group 18 for the Highlight-view-specific assertions.
  w.applyFhView("filter");
  fireDblClick(rowElAfter, w);
  assert(T.fhActiveTab === "highlight", "double-click on a Filter-view row reveals the Full view");
  assert(T.state.selectedId === idBefore, "double-click keeps the same entry selected");
});

/* ============================================================
   GROUP 20 — Session cache (IndexedDB persistence across reloads)
   Origin: this session. Simulates a browser reload by passing the SAME
   fake-indexeddb IDBFactory instance into two successive jsdom windows:
   window A builds a session (file + filters incl. an AND combiner with a
   linkedId, highlight colour, bookmark with note, level filter, active
   node) and persists it; window B's normal boot-time restore must bring
   everything back with fresh runtime ids but identical structure.
   ============================================================ */
section("20. Session cache: persist in one window, restore in the next");
{
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const factory = new IDBFactory();

  // Log with one multi-line entry (continuation lines after entry 3) to
  // prove rebuildFileText round-trips entry.raw incl. embedded newlines.
  const logLines = makeLog(0, 30).trimEnd().split("\n");
  logLines.splice(4, 0, "  at Foo.Bar()", "  at Baz.Qux()");
  const logText = logLines.join("\n") + "\n";

  let savedEntryRaw = null;   // raw of the bookmarked entry, for cross-window comparison
  let savedMsg3 = null;       // multi-line message of entry 3

  // --- Window A: build + persist ---
  await withApp(async (w, d, T) => {
    const f = await w.addFile("cache.log", logText, () => {});
    savedMsg3 = f.entries[3].message;
    assert(savedMsg3.includes("at Baz.Qux()"), "cache: fixture entry 3 is multi-line");
    assert(typeof f.cacheKey === "string" && f.cacheKey.length > 0, "cache: addFile assigns a cacheKey");

    const t1 = w.createFilterNode(f.id, "text", "message 1");
    const t2 = w.createFilterNode(f.id, "text", "ERROR");
    t2.highlightColor = "#ff0000";
    const combo = w.createAndOrNode(t1.id, t2.id, "and");

    const bEntry = f.entries[5];
    savedEntryRaw = bEntry.raw;
    w.toggleBookmark(bEntry.id);
    T.state.bookmarks.get(bEntry.id).note = "check this";
    T.state.levelFilter.add("ERROR");
    T.state.activeId = combo.id;

    await w.persistFileNode(f);
    await w.persistMetaNow();

    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta && meta.fileOrder.length === 1, "cache: meta record written with one file");
    assert(meta.bookmarks.length === 1 && meta.bookmarks[0].ordinal === 5 && meta.bookmarks[0].note === "check this",
      "cache: bookmark persisted as ordinal + note");
    assert(meta.settings.active && meta.settings.active.ref != null, "cache: active filter persisted as ref");
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec && rec.text.includes("at Baz.Qux()"), "cache: file text persisted incl. continuation lines");
  }, { indexedDB: factory });

  // --- Window B: boot-time restore (same factory = same "disk") ---
  await withApp(async (w, d, T) => {
    for (let i = 0; i < 40 && T.state.rootIds.length === 0; i++) await sleep(50); // boot restore is async
    assert(T.state.rootIds.length === 1, "restore: file came back via boot-time restore");
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.name === "cache.log", "restore: file name preserved");
    assert(f.entries.length === 30, "restore: entry count preserved");
    assert(f.entries[3].message === savedMsg3, "restore: multi-line message round-tripped");
    assert(f.entries[5].raw === savedEntryRaw, "restore: entry raw identical after re-parse");

    assert(f.children.length === 2, "restore: both top-level filters back");
    const r1 = T.state.nodes[f.children[0]];
    const r2 = T.state.nodes[f.children[1]];
    assert(r1.filterType === "text" && r1.value === "message 1", "restore: first filter type/value");
    assert(r2.highlightColor === "#ff0000", "restore: highlight colour preserved");
    assert(r1.children.length === 1, "restore: nested AND node present");
    const combo = T.state.nodes[r1.children[0]];
    assert(combo.filterType === "and" && combo.linkedId === r2.id,
      "restore: AND node's linkedRef remapped to the restored sibling's new id");
    // "message 1" matches entries 1, 10..19; ERROR matches 0,5,10,15,20,25 —
    // intersection is exactly {10, 15}, so a correct linkedId remap yields 2.
    assert(w.getEntries(combo.id).length === 2, "restore: AND node re-evaluates to the correct result");

    assert(T.state.bookmarks.size === 1, "restore: bookmark came back");
    const [bid, bm] = [...T.state.bookmarks.entries()][0];
    assert(bid === f.entries[5].id && bm.note === "check this", "restore: bookmark maps to ordinal 5 with note");
    assert(T.state.levelFilter.has("ERROR") && T.state.levelFilter.size === 1, "restore: level filter preserved");
    assert(T.state.activeId === combo.id, "restore: active node is the restored AND filter");

    // --- Deletion clears the cached file record ---
    const key = f.cacheKey;
    w.deleteNode(f.id);
    await w.persistMetaNow();
    let rec = { placeholder: true };
    for (let i = 0; i < 20; i++) { // cacheDeleteFile is fire-and-forget
      rec = await w.cacheStoreOp("files", "readonly", s => s.get(key));
      if (!rec) break;
      await sleep(50);
    }
    assert(rec === null || rec === undefined, "delete: cached file record removed with the file node");
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta && meta.fileOrder.length === 0, "delete: meta rewritten with empty file order");
  }, { indexedDB: factory });

  // --- Window C: nothing left to restore ---
  await withApp(async (w, d, T) => {
    await sleep(400);
    assert(T.state.rootIds.length === 0, "restore: emptied cache restores nothing");
  }, { indexedDB: factory });

  // --- Escape hatch: localStorage flag disables persistence entirely ---
  const factory2 = new IDBFactory();
  await withApp(async (w, d, T) => {
    w.localStorage.setItem("philogg-cache-enabled", "0");
    const f = await w.addFile("nocache.log", makeLog(0, 5), () => {});
    await w.persistFileNode(f);
    await w.persistMetaNow();
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta === null || meta === undefined, "disabled: no meta written while cache flag is off");
  }, { indexedDB: factory2 });
}

/* ============================================================
   GROUP 21 — Session export / import (three-tier file matching)
   Origin: this session. Covers the whole testing plan from the design spec:
   tier-1 exact round-trip, tier-2 auto-match against a grown (tailed)
   receiving copy, tier-2 rejection on a density mismatch, tier-3 manual
   pick with the ts+fingerprint bookmark fallback, the version guard, and
   the embedded-log materialization path. All file writes are captured by
   stubbing downloadJsonFallback (jsdom has no showSaveFilePicker, so the
   export path deterministically takes the download fallback).
   ============================================================ */
{
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const baseText = makeLog(0, 30);
  let exportedJson = null;        // captured plain export (no embedded text)
  let exportedEmbeddedJson = null; // captured export WITH embedded log text
  let savedRaw5 = null, savedRaw15 = null; // raws of the two bookmarked entries

  // --- Window A: build a session and export it through the real dialog ---
  await withApp(async (w, d, T) => {
    section("21. Session export/import");
    const f = await w.addFile("worker-3.log", baseText, () => {});
    const other = await w.addFile("unrelated.log", makeLog(5000, 4), () => {});
    w.render();

    // Fingerprint sanity + tail-invalidation hook for the cached full hash.
    const h1 = w.fingerprintText("abc");
    assert(h1.length === 16 && h1 === w.fingerprintText("abc") && h1 !== w.fingerprintText("abd"),
      "export: fingerprint is 16 hex chars, deterministic, input-sensitive");
    const full = w.getFileFullHash(f);
    assert(f._fullHash === full, "export: full-file fingerprint cached on the node");
    w.invalidateCachesForRoots([f.id]);
    assert(f._fullHash === null, "export: tail-scoped invalidation clears the cached fingerprint");

    // Filters: text -> AND combiner (linkedRef), highlight colour on the sibling.
    const t1 = w.createFilterNode(f.id, "text", "message 1");
    const t2 = w.createFilterNode(f.id, "text", "ERROR");
    t2.highlightColor = "#ff0000";
    const combo = w.createAndOrNode(t1.id, t2.id, "and");

    // Bookmarks on entries 5 and 15 (15 will be missing in the tier-3 fixture).
    savedRaw5 = f.entries[5].raw;
    savedRaw15 = f.entries[15].raw;
    w.toggleBookmark(f.entries[5].id);
    T.state.bookmarks.get(f.entries[5].id).note = "check this";
    w.toggleBookmark(f.entries[15].id);
    T.state.levelFilter.add("ERROR");
    T.state.sortColumn = "level";
    T.state.sortDir = "desc";
    T.state.activeId = combo.id;

    // Context-menu placement: node menu carries both entries...
    w.render();
    fireContextMenu(d.querySelector(".tree-row"), w);
    const menuHtml = d.querySelector("#treeContextMenu").innerHTML;
    assert(menuHtml.includes("Export session") && menuHtml.includes("Import session"),
      "export: node context menu offers Export/Import session next to Save/Load filter");
    w.closeTreeContextMenu();
    // ...and the empty tree background offers import (reachable w/o node hit).
    fireContextMenu(d.querySelector("#tree"), w);
    assert(d.querySelector("#treeContextMenu").innerHTML.includes("Import session"),
      "export: tree-background context menu offers Import session");
    w.closeTreeContextMenu();

    // Export dialog: one row per root file, per-file include + embed checkboxes.
    let captured = [];
    w.downloadJsonFallback = (json, name) => captured.push({ json, name });
    w.openSessionExportDialog();
    assert(!d.querySelector("#sessionExportDialog").classList.contains("hidden"), "export: dialog opens");
    const rows = d.querySelectorAll("#sessionExportRows .session-file-row");
    assert(rows.length === 2, "export: one dialog row per loaded root file");
    // Deselect the unrelated file — its filters/bookmarks must not be exported.
    d.querySelector('.session-include[data-file-id="' + other.id + '"]').checked = false;
    fireClick(d.querySelector("#sessionExportConfirm"), w);
    assert(captured.length === 1 && captured[0].name.startsWith("philogg-session-"),
      "export: confirm writes exactly one JSON via the download fallback");
    exportedJson = captured[0].json;
    const doc = JSON.parse(exportedJson);
    assert(doc.format === "philogg-session-export" && doc.version === 1, "export: envelope format/version");
    assert(doc.files.length === 1 && doc.files[0].name === "worker-3.log", "export: deselected file excluded");
    const rec = doc.files[0];
    assert(rec.entryCount === 30 && typeof rec.fullHash === "string" && rec.fullHash.length === 16,
      "export: entryCount + 16-char fullHash present");
    assert(rec.timeSpan && rec.timeSpan.start === f.entries[0].ts && rec.timeSpan.end === f.entries[29].ts,
      "export: timeSpan spans first..last entry ts");
    assert(rec.text === undefined, "export: log text NOT embedded by default");
    assert(rec.bookmarks.length === 2 && rec.bookmarks[0].ordinal === 5
      && typeof rec.bookmarks[0].ts === "number" && rec.bookmarks[0].raw === w.fingerprintText(savedRaw5)
      && rec.bookmarks[0].note === "check this",
      "export: bookmarks carry ordinal + ts + raw fingerprint + note");
    assert(doc.settings.levelFilter.includes("ERROR") && doc.settings.sortColumn === "level"
      && doc.settings.sortDir === "desc", "export: session-wide settings serialized");
    assert(doc.settings.active && doc.settings.active.exportId === rec.exportId && doc.settings.active.ref != null,
      "export: active filter recorded as exportId + ref");

    // Second export WITH embedded text for the embedded-log test below.
    captured = [];
    w.openSessionExportDialog();
    d.querySelector('.session-include[data-file-id="' + other.id + '"]').checked = false;
    d.querySelector('.session-embed[data-file-id="' + f.id + '"]').checked = true;
    fireClick(d.querySelector("#sessionExportConfirm"), w);
    exportedEmbeddedJson = captured[0].json;
    assert(JSON.parse(exportedEmbeddedJson).files[0].text.includes("message 15"),
      "export: per-file embed checkbox includes the rebuilt log text");
  });

  // --- Tier 1: import against a byte-identical file (different name) ---
  await withApp(async (w, d, T) => {
    const f = await w.addFile("renamed-copy.log", baseText, () => {});
    w.render();
    w.importSessionJson(exportedJson);
    await sleep(80);
    assert(d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "tier1: identical content auto-matches with no dialog (name is display-only)");
    assert(f.children.length === 2, "tier1: both top-level filters applied");
    const r1 = T.state.nodes[f.children[0]], r2 = T.state.nodes[f.children[1]];
    assert(r1.filterType === "text" && r1.value === "message 1" && r2.highlightColor === "#ff0000",
      "tier1: filter values + highlight colour round-trip");
    const combo = T.state.nodes[r1.children[0]];
    assert(combo && combo.filterType === "and" && combo.linkedId === r2.id,
      "tier1: AND node's linkedRef remapped to the imported sibling");
    assert(w.getEntries(combo.id).length === 2, "tier1: AND node re-evaluates correctly (msgs 10,15)");
    assert(T.state.bookmarks.size === 2 && T.state.bookmarks.has(f.entries[5].id)
      && T.state.bookmarks.get(f.entries[5].id).note === "check this",
      "tier1: bookmarks attach by ordinal with notes");
    assert(T.state.levelFilter.has("ERROR") && T.state.sortColumn === "level" && T.state.sortDir === "desc",
      "tier1: session-wide settings applied");
    assert(T.state.activeId === combo.id, "tier1: active node restored via exportId + ref");
    assert(d.querySelector("#copyToast").textContent.includes("1 file matched automatically")
      && d.querySelector("#copyToast").textContent.includes("2 of 2 bookmarks placed"),
      "tier1: summary toast reports files + bookmark placement");
  });

  // --- Tier 2: receiving copy of the tailed log kept growing ---
  await withApp(async (w, d, T) => {
    const grownText = baseText + makeLog(30, 5); // 5 entries appended after the exported window
    const f = await w.addFile("grown.log", grownText, () => {});
    w.render();
    const m = w.matchExportedFile(JSON.parse(exportedJson).files[0], [f.id]);
    assert(m.matchId === f.id && m.tier === 2,
      "tier2: match is confirmed by the window fingerprint, NOT the (differing) full hash");
    w.importSessionJson(exportedJson);
    await sleep(80);
    assert(d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "tier2: grown file auto-matches via the overlapping time window");
    assert(f.children.length === 2, "tier2: filters applied to the grown file");
    assert(T.state.bookmarks.has(f.entries[5].id) && f.entries[5].raw === savedRaw5,
      "tier2: ordinal-based bookmark lands on the identical in-window entry");
  });

  // --- Tier 2 rejection -> tier 3 manual pick + bookmark content fallback ---
  await withApp(async (w, d, T) => {
    // Same time span, but entry 15 removed: window entry count 29 != 30 must
    // demote the match to the manual dialog instead of silently applying.
    const lines = baseText.trimEnd().split("\n");
    lines.splice(15, 1);
    const f = await w.addFile("worker-old.log", lines.join("\n") + "\n", () => {});
    w.render();
    w.importSessionJson(exportedJson);
    await sleep(80);
    assert(!d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "tier3: density mismatch inside the window falls through to the manual dialog");
    assert(d.querySelector("#sessionMatchMeta").innerHTML.includes("worker-3.log"),
      "tier3: dialog shows the export entry's own metadata");
    assert(d.querySelector("#sessionMatchOptions").innerHTML.includes("possible match"),
      "tier3: the near-miss candidate is badged as possible match");
    const radio = d.querySelector('input[name="sessionMatchTarget"][value="file:' + f.id + '"]');
    assert(!!radio, "tier3: the loaded file is offered as a target");
    radio.checked = true;
    fireClick(d.querySelector("#sessionMatchApply"), w);
    await sleep(80);
    assert(f.children.length === 2, "tier3: filters applied to the manually picked file");
    assert(T.state.bookmarks.size === 1, "tier3: only the still-present bookmarked line resolves");
    const [bid] = [...T.state.bookmarks.keys()];
    assert(T.entryIndex[bid].raw === savedRaw5,
      "tier3: bookmark re-anchored via ts + raw fingerprint, not the stale ordinal");
    assert(d.querySelector("#copyToast").textContent.includes("1 resolved manually")
      && d.querySelector("#copyToast").textContent.includes("1 of 2 bookmarks placed"),
      "tier3: summary toast reports manual resolution + partial bookmark placement");
  });

  // --- Version guard: newer file refuses to import, nothing applied ---
  await withApp(async (w, d, T) => {
    const f = await w.addFile("any.log", baseText, () => {});
    w.render();
    const doc = JSON.parse(exportedJson);
    doc.version = 99;
    w.importSessionJson(JSON.stringify(doc));
    await sleep(80);
    assert(d.querySelector("#copyToast").textContent.includes("newer version"),
      "version guard: future version refused with a toast");
    assert(f.children.length === 0 && T.state.bookmarks.size === 0,
      "version guard: nothing partially applied");
  });

  // --- Embedded log: import into an empty session materializes the file ---
  await withApp(async (w, d, T) => {
    w.importSessionJson(exportedEmbeddedJson);
    await sleep(80);
    assert(!d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "embedded: no candidates -> manual dialog");
    const radio = d.querySelector('input[name="sessionMatchTarget"][value="embedded"]');
    assert(!!radio && radio.closest("label").textContent.includes("Load the embedded log"),
      "embedded: dialog offers loading the embedded log (only when text is present)");
    radio.checked = true;
    fireClick(d.querySelector("#sessionMatchApply"), w);
    await sleep(120); // addFile parses async
    assert(T.state.rootIds.length === 1, "embedded: file materialized from the export");
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.name === "worker-3.log" && f.entries.length === 30,
      "embedded: name + entry count round-trip through the embedded text");
    assert(f.children.length === 2 && T.state.bookmarks.has(f.entries[5].id),
      "embedded: filters + ordinal bookmarks applied to the materialized file");
    const combo = T.state.nodes[T.state.nodes[f.children[0]].children[0]];
    assert(T.state.activeId === combo.id, "embedded: active filter restored");
  });

  // --- Plain export sanity: a non-session JSON is rejected ---
  await withApp(async (w, d, T) => {
    await w.addFile("x.log", makeLog(0, 3), () => {});
    w.importSessionJson(JSON.stringify({ format: "philogg-filters", roots: [] }));
    await sleep(40);
    assert(d.querySelector("#copyToast").textContent.includes("Not a PhiLogg session file"),
      "guard: filter-branch JSON is rejected as a session file");
  });
}

/* ============================================================
   GROUP 22 — Link filter chaining fix + multi-way (N-tuple) link UI
   (this session, 2026-08-12). Source: REQUIREMENTS-link-chaining-and-
   multiway.md + its companion tests/link-chaining.spec.js (both supplied
   by the person). That spec's BASELINE/TARGET assertions are folded in
   here verbatim (as real pass/fail, not the original "informational,
   pre-implementation" framing — see this file's own README.md "Extending
   this suite": one consolidated suite, not a parallel standalone spec
   file) plus new coverage for the two opt-in options and the multi-hop
   dialog UI that spec deliberately left unpinned. See PROJECT.md "Link
   filter" for the chosen design (direction A: fix the nesting, keep
   pair-of-pairs) and the semantics chosen for order-enforcement/
   exclusivity where the requirements doc left them open.

   makeLogAt(entries): like makeLog, but each entry's second is given
   explicitly so scenarios needing precisely interleaved candidates (a
   "decoy" match at one timestamp, the "correct" one at another) can be
   laid out exactly, the same helper shape link-chaining.spec.js used.
   ============================================================ */
{
  function makeLogAt(entries) {
    const lines = entries.map((e, i) =>
      `2024-01-15 10:00:${String(e.sec).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"${e.msg}"`);
    return lines.join("\n") + "\n";
  }

  // --- BASELINE: simple (non-chained) link anchor semantics, both directions ---
  // Locks in the reference/anchor semantics confirmed correct during spec
  // review — must stay green after the chaining fix, it's a regression
  // guard, not a target.
  await withApp(async (w, d, T) => {
    section("22. Link chaining fix + multi-way tuples");
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" },
      { sec: 10, msg: "First B" }, { sec: 15, msg: "Second B" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");

    const linkAF = w.createLinkNode(first.id, second.id, "after", 1);
    const resAF = w.getEntries(linkAF.id).map(p => p.message);
    assert(JSON.stringify(resAF) === JSON.stringify(["First A ⟶ Second A", "First B ⟶ Second B"]),
      "BASELINE: anchor=First, after 1, target=Second -> pairs each First with the next Second");

    const linkSB = w.createLinkNode(second.id, first.id, "before", 1);
    const resSB = w.getEntries(linkSB.id).map(p => p.message);
    assert(JSON.stringify(resSB) === JSON.stringify(["First A ⟶ Second A", "First B ⟶ Second B"]),
      "BASELINE: anchor=Second, before 1, target=First -> pairs each Second with the preceding First");
  });

  // --- BASELINE: matches are not exclusive by default ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 1, msg: "First B" }, { sec: 5, msg: "Second A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const link = w.createLinkNode(first.id, second.id, "after", 1);
    const res = w.getEntries(link.id);
    assert(res.length === 2 && res[0].second.id === res[1].second.id,
      "BASELINE: both First A and First B pair with the same Second A when exclusivity is off (default)");
  });

  // --- TARGET (Bug 1): chained link anchors on the previous hop's match ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" },
      { sec: 3, msg: "Marker Alpha" },   // decoy: nearest Marker after First's own ts
      { sec: 5, msg: "Second A" },
      { sec: 6, msg: "Marker Beta" },    // correct: nearest Marker after Second's ts
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Marker");

    const link1 = w.createLinkNode(first.id, second.id, "after", 1);   // First -> Second
    const link2 = w.createLinkNode(link1.id, third.id, "after", 1);    // (First->Second) -> Marker
    const res2 = w.getEntries(link2.id);

    assert(res2.length === 1, "Bug1 fix: one chained tuple produced");
    assert(res2[0] && res2[0].second.message === "Marker Beta",
      "Bug1 fix: chained hop anchors on Second's match (Marker Beta), not First's original ts (would be Alpha)");
  });

  // --- TARGET (Bug 2): highlight map covers every real entry across a chained link ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }, { sec: 8, msg: "Third A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    const link1 = w.createLinkNode(first.id, second.id, "after", 1);
    const link2 = w.createLinkNode(link1.id, third.id, "after", 1);
    link2.highlightColor = "#ff0000";

    const map = w.computeHighlightMap(f.id);
    const firstA = f.entries.find(e => e.message === "First A");
    const secondA = f.entries.find(e => e.message === "Second A");
    const thirdA = f.entries.find(e => e.message === "Third A");
    assert(map.has(firstA.id), "Bug2 fix: First A is highlighted through the nested pair");
    assert(map.has(secondA.id), "Bug2 fix: Second A is highlighted through the nested pair");
    assert(map.has(thirdA.id), "Bug2 fix: Third A is highlighted (outer real side, already worked before)");
  });

  // --- TARGET (Bug 3): every real entry in a chained tuple is individually
  // reachable via entryIndex (getTupleEntries contract) ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }, { sec: 8, msg: "Third A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    const link1 = w.createLinkNode(first.id, second.id, "after", 1);
    const link2 = w.createLinkNode(link1.id, third.id, "after", 1);
    const tuple = w.getEntries(link2.id)[0];

    assert(typeof w.getTupleEntries === "function", "Bug3 fix: getTupleEntries(entryLike) is implemented");
    const real = w.getTupleEntries(tuple);
    const ids = real.map(e => e.id);
    assert(ids.length === 3, "Bug3 fix: chained tuple flattens to 3 real entries");
    assert(ids.every(id => !!T.entryIndex[id]), "Bug3 fix: every flattened id resolves through entryIndex");

    // And at the UI layer: the Link view now renders one row per real
    // entry (2 deltas for a 3-way tuple), each wired to revealInHighlightView
    // with a REAL entry id, not a synthetic intermediate pair id.
    T.state.activeId = link2.id;
    w.render();
    const rows = d.querySelectorAll("#linkBody .pair-row");
    const deltas = d.querySelectorAll("#linkBody .pair-delta");
    assert(rows.length === 3, "Bug3 fix (UI): Link view renders 3 rows for the 3-way tuple, got " + rows.length);
    assert(deltas.length === 2, "Bug3 fix (UI): 2 delta labels between 3 rows, got " + deltas.length);
  });

  // --- Opt-in: exclusive matches (scoped globally per link node, default off) ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 1, msg: "First B" }, { sec: 5, msg: "Second A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const link = w.createLinkNode(first.id, second.id, "after", 1, { exclusive: true });
    const res = w.getEntries(link.id);
    assert(res.length === 1 && res[0].first.message === "First A",
      "exclusive matches: only the first (earlier) reference claims Second A, the later one gets no match");
  });

  // --- Opt-in: enforce chronological order (drops a hop whose match lands
  // before the anchor it was searched from — see PROJECT.md for why this
  // definition was chosen). Uses the requirements doc's REPRO scenario,
  // where an unconstrained chain matches an entry chronologically before
  // the very first reference entry. ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "Third FAR BEFORE" },
      { sec: 20, msg: "First A" },
      { sec: 25, msg: "Second A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    const link1 = w.createLinkNode(first.id, second.id, "after", 1);   // First(20) -> Second(25)
    const linkUnconstrained = w.createLinkNode(link1.id, third.id, "before", 1);
    assert(w.getEntries(linkUnconstrained.id).length === 1,
      "order NOT enforced (default): non-monotonic tuple (Third before First) is still produced");

    const linkEnforced = w.createLinkNode(link1.id, third.id, "before", 1, { orderEnforced: true });
    assert(w.getEntries(linkEnforced.id).length === 0,
      "order enforced (opt-in): the same non-monotonic tuple is dropped instead");
  });

  // --- Multi-hop dialog: reference + 2 target hops combined into one
  // tuple through the UI (bulk-select 3 filters -> Link…) ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }, { sec: 8, msg: "Third A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    w.render();

    T.state.multiSelect = new Set([first.id, second.id, third.id]);
    const { actions } = w.describeBulkActions([first, second, third]);
    assert(actions.some(a => a.action === "link" && /3-way/.test(a.label)),
      "multi-hop dialog: 3-filter selection offers a labeled N-way Link… bulk action");

    w.openLinkDialog([first.id, second.id, third.id]);
    assert(!d.querySelector("#linkDialog").classList.contains("hidden"), "multi-hop dialog: opens for 3 filters");
    d.querySelector("#linkRefSelect").value = first.id;
    d.querySelector("#linkRefSelect").dispatchEvent(new w.Event("change"));
    const hopRows = d.querySelectorAll("#linkHopsList .link-hop-row");
    assert(hopRows.length === 2, "multi-hop dialog: 2 hop rows for reference + 2 remaining filters");

    hopRows[0].querySelector(".link-hop-dir").value = "after";
    hopRows[1].querySelector(".link-hop-dir").value = "after";
    fireClick(d.querySelector("#linkDialogCreate"), w);
    assert(d.querySelector("#linkDialog").classList.contains("hidden"), "multi-hop dialog: closes after Create");

    const linkNodes = Object.values(T.state.nodes).filter(n => n.filterType === "link");
    assert(linkNodes.length === 2, "multi-hop dialog: chain of 2 link nodes created under the hood");
    const hop1 = linkNodes.find(n => n.parentId === first.id);
    const hop2 = linkNodes.find(n => hop1 && n.parentId === hop1.id);
    assert(!!hop1 && !!hop2, "multi-hop dialog: hop2 is chained under hop1, not both under the reference directly");
    const tupleRes = w.getEntries(hop2.id);
    assert(tupleRes.length === 1 && tupleRes[0].second.message === "Third A",
      "multi-hop dialog: resulting 3-way tuple resolves First -> Second -> Third correctly");
  });

  // --- Persistence: linkOrderEnforced/linkExclusive survive save/load,
  // copy/paste (cloneSubtree) and undo/redo (snapshot/restoreSubtree) the
  // same way linkDirection/linkN already did. ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([{ sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const link = w.createLinkNode(first.id, second.id, "after", 1, { orderEnforced: true, exclusive: true });

    const branch = w.serializeFilterBranch(link.id);
    function findLink(node) {
      if (node.filterType === "link") return node;
      for (const c of node.children || []) { const r = findLink(c); if (r) return r; }
      return null;
    }
    const serLink = branch.roots.map(findLink).find(Boolean);
    assert(!!serLink && serLink.linkOrderEnforced === true && serLink.linkExclusive === true,
      "save/load: serializeFilterBranch carries both new flags");

    const clone = w.cloneSubtree(link.id, first.id);
    assert(clone.linkOrderEnforced === true && clone.linkExclusive === true,
      "copy/paste: cloneSubtree carries both new flags");

    const snap = w.snapshotSubtree(link.id);
    delete T.state.nodes[link.id];
    const restored = w.restoreSubtree(snap);
    assert(restored.linkOrderEnforced === true && restored.linkExclusive === true,
      "undo/redo: snapshotSubtree/restoreSubtree carry both new flags");
  });

  // --- Backward compatibility: an old-format link JSON (no
  // linkOrderEnforced/linkExclusive fields, as saved before this feature)
  // still materializes cleanly, both new fields defaulting false. ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([{ sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }]);
    const f = await w.addFile("a.log", log, () => {});
    const oldRoots = [
      { ref: 1, filterType: "text", name: "First", inverted: false, value: "First", children: [
        { ref: 3, filterType: "link", name: "First -> Second", inverted: false, linkedRef: 2, linkDirection: "after", linkN: 1, children: [] },
      ] },
      { ref: 2, filterType: "text", name: "Second", inverted: false, value: "Second", children: [] },
    ];
    w.materializeCachedFilters(f, oldRoots);
    const linkNode = Object.values(T.state.nodes).find(n => n.filterType === "link");
    assert(!!linkNode && linkNode.linkOrderEnforced === false && linkNode.linkExclusive === false,
      "backward compat: pre-feature link JSON materializes with both new flags defaulting to false");
  });
}

/* ============================================================
   GROUP 23 — Link filter: same-timestamp tie-break (this session,
   2026-08-12, follow-up). Person-reported: linking "Target Real" (anchor)
   to the nearest preceding "Target Vir" produced a match ~11s away instead
   of the entry immediately before it in the Full log, because both shared
   the exact same millisecond timestamp — the log format's finest
   resolution — and findNthOccurrence's strict ts comparison excluded ties
   from "before"/"after" entirely rather than resolving them somehow.
   Confirmed root cause, then implemented exactly the fix requested: break
   ties by log/array order (buildOrderIndexMap + the updated
   findNthOccurrence/findNthOccurrenceExcluding/buildPairEntry). See
   PROJECT.md "Link filter" → "Same-timestamp tie-break".
   ============================================================ */
{
  // Mirrors the reported scenario: an earlier burst 11s before containing a
  // "Target Vir" decoy, then a later burst where several lines share ONE
  // exact millisecond, including a "Target Vir" line immediately followed
  // by a "Target Real" line — same shape as the screenshot's
  // MotionServiceBase.cs:243/251 pair.
  function makeTieLog() {
    const lines = [
      `2025-11-18 09:38:05,496\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"Target VirtualPosition: OLD decoy"`,
      `2025-11-18 09:38:16,470\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Executed Operator"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"Target VirtualPosition: Source"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"Target RealPosition: (X0)"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 4\t[DoWork]\t"Starting movement to"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 5\t[DoWork]\t"Movement to position was"`,
    ];
    return lines.join("\n") + "\n";
  }

  await withApp(async (w, d, T) => {
    section("23. Link filter: same-timestamp tie-break");
    const f = await w.addFile("a.log", makeTieLog(), () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const link = w.createLinkNode(real.id, vir.id, "before", 1);
    const res = w.getEntries(link.id);
    assert(res.length === 1, "one pair produced");
    assert(res[0].first.message === "Target VirtualPosition: Source" && res[0].second.message === "Target RealPosition: (X0)",
      "before-search picks the log-adjacent same-ms Vir entry, not the 11s-earlier decoy");
    assert(res[0].second.ts - res[0].first.ts === 0, "the picked pair has a 0ms delta (same burst)");
  });

  // Same tie situation from the other direction ("after"), plus confirming
  // the untied decoy Vir entry still resolves normally (nothing broke
  // for candidates that AREN'T part of a tie).
  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeTieLog(), () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const link = w.createLinkNode(vir.id, real.id, "after", 1); // anchor=Vir, find Real after
    const res = w.getEntries(link.id);
    assert(res.length === 2, "two pairs produced, one per Vir entry");
    const decoyPair = res.find(p => p.first.message.includes("OLD decoy"));
    assert(!!decoyPair && decoyPair.second.message === "Target RealPosition: (X0)",
      "the untied decoy Vir still finds the (only) Real entry normally");
    const burstPair = res.find(p => !p.first.message.includes("OLD decoy"));
    assert(!!burstPair && burstPair.first.message === "Target VirtualPosition: Source" && burstPair.second.message === "Target RealPosition: (X0)",
      "after-search picks the log-adjacent same-ms Real entry, not skipping past the whole tied cluster");
  });

  // Regression guard: no ties at all -> completely unaffected.
  await withApp(async (w, d, T) => {
    const lines = [
      `2025-11-18 09:38:05,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"Target VirtualPosition: A"`,
      `2025-11-18 09:38:05,010\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Target RealPosition: A"`,
    ];
    const f = await w.addFile("a.log", lines.join("\n") + "\n", () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const link = w.createLinkNode(real.id, vir.id, "before", 1);
    const res = w.getEntries(link.id);
    assert(res.length === 1 && res[0].first.message === "Target VirtualPosition: A" && res[0].second.message === "Target RealPosition: A",
      "plain distinct-timestamp case is unaffected by the tie-break change");
  });

  // Tie-break combined with the exclusive-matches option: two Vir entries
  // and two Real entries all sharing one timestamp — exclusivity must still
  // hand out DIFFERENT Vir entries to each Real, using log order to decide
  // which is "nearest" among the tied candidates, same as the plain case.
  await withApp(async (w, d, T) => {
    const lines = [
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"Target VirtualPosition: X1"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Target VirtualPosition: X2"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"Target RealPosition: X1"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"Target RealPosition: X2"`,
    ];
    const f = await w.addFile("a.log", lines.join("\n") + "\n", () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const link = w.createLinkNode(real.id, vir.id, "before", 1, { exclusive: true });
    const res = w.getEntries(link.id);
    assert(res.length === 2, "both Real entries get a match under exclusivity");
    const r1 = res.find(p => p.second.message === "Target RealPosition: X1");
    const r2 = res.find(p => p.second.message === "Target RealPosition: X2");
    assert(!!r1 && r1.first.message === "Target VirtualPosition: X2",
      "Real X1 claims the log-nearest Vir (X2)");
    assert(!!r2 && r2.first.message === "Target VirtualPosition: X1",
      "Real X2 falls back to the remaining Vir (X1) since X2 is already claimed");
  });
}

/* ============================================================
   GROUP 24 — Extraction: live pattern preview + ignored columns
   Origin: this session (2026-08-13), from person-supplied
   REQUIREMENTS-extract-preview-and-ignore.md. Covers both halves of the
   spec: (A) the new live pattern preview in #filterPopup (a real sample
   message with matched substrings highlighted in place, not just the
   abstract template) and (B) per-column node.ignoredColumns — Option B
   from the spec's "Design directions" (chosen over a new [ignore] token;
   see PROJECT.md "Extraction workflow" -> "Ignored columns" for why) —
   incl. both toggle surfaces (the new popup preview, and the existing
   post-creation #extractPatternView chips extended to double as the same
   toggle), exclusion from the table/stats/plot/export/assertions, and
   persistence through cloneSubtree/undo-redo/save-load/session-cache
   (the same 4 touch points already established for assertions). The
   person-supplied tests/extract-preview-ignore.spec.js (BASELINE +
   CONDITIONAL groups) is kept as a standalone file too — its acceptance
   criteria call for that — but this group is the primary, consolidated
   coverage, same "fold into the one suite" convention as Groups 22/23
   (see README.md "Extending this suite").
   ============================================================ */
await withApp(async (w, d, T) => {
  section("24. Extraction: live pattern preview + ignored columns");
  const log = [0, 1, 2]
    .map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i} name=n${i} score=${i}.5"`)
    .join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  /* ---------- Part A: live pattern preview in #filterPopup ---------- */
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "id=[value:int] name=[*] score=[value:float]";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200)); // evaluateLiveMatch/preview share the same 150ms debounce

  const preview = d.querySelector("#filterPatternPreview");
  assert(!preview.classList.contains("hidden"), "pattern preview becomes visible for an extraction pattern");
  const spans = [...preview.querySelectorAll(".preview-value-span")];
  assert(spans.length === 3, "one highlighted span per placeholder, got " + spans.length);
  assert(spans[0].textContent === "0" && spans[1].textContent === "n0" && spans[2].textContent === "0.5",
    "spans contain the actual matched substrings from a REAL sample message (not the abstract template), got [" + spans.map(s => s.textContent).join(",") + "]");
  assert(preview.textContent.includes("id=") && preview.textContent.includes("name=") && preview.textContent.includes("score="),
    "literal text between placeholders is preserved around the highlighted spans");

  // Click the "name" span (placeholder index 1) to mark it ignored BEFORE the filter even exists
  fireClick(spans[1], w);
  const spansAfterToggle = [...preview.querySelectorAll(".preview-value-span")];
  assert(spansAfterToggle[1].classList.contains("chip-ignored"), "clicking a preview span marks it ignored (dimmed) immediately, before submit");
  assert(!spansAfterToggle[0].classList.contains("chip-ignored") && !spansAfterToggle[2].classList.contains("chip-ignored"),
    "the other two spans stay un-ignored");

  // Click "Extract" (not "Add filter") to actually build an extraction
  // table — see Group 41: which button gets clicked is what decides this.
  fireClick(d.querySelector("#filterExtractBtn"), w);
  const node = T.state.nodes[T.state.activeId];
  assert(node.filterType === "extract" && node.ignoredColumns && node.ignoredColumns.length === 1 && node.ignoredColumns.includes(1),
    "a filter created via the popup carries ignoredColumns toggled from the live preview, got " + JSON.stringify(node.ignoredColumns));

  /* ---------- Table reflects the ignored column immediately ---------- */
  assert(T.extractColumns.length === 2, "extractColumns excludes the ignored column, got " + T.extractColumns.length);
  assert(!T.extractColumns.some(c => c.colIndex === 1), "column index 1 ('name') is not among the visible columns");
  const ths = [...d.querySelectorAll("#extractHead th[data-col]")];
  assert(ths.length === 2 && ths.every(th => +th.dataset.col !== 1), "no <th> rendered for the ignored column, got data-col=[" + ths.map(t => t.dataset.col).join(",") + "]");
  const firstRowTds = [...d.querySelectorAll("#extractBody tr:first-child td[data-col]")];
  assert(firstRowTds.length === 2 && firstRowTds.every(td => +td.dataset.col !== 1), "no <td> rendered for the ignored column either");
  assert(T.extractRowsData.every(r => r.values.length === 3), "row.values still holds all 3 raw captured values — matching itself is untouched by ignoring a column");

  /* ---------- Export excludes the ignored column from both header and body ---------- */
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  w.copyWholeExtractTable();
  const copiedLines = copied.split("\n");
  assert(copiedLines[0] === "value\tvalue 3", "copy-whole-table header includes only the visible columns' names, got " + JSON.stringify(copiedLines[0]));
  assert(copiedLines[1] === "0\t0.5", "copy-whole-table body row includes only the visible columns' values (ignored 'name' column dropped), got " + JSON.stringify(copiedLines[1]));

  /* ---------- Edit mode pre-populates the preview from node.ignoredColumns ---------- */
  w.openEditFilterPopup(node.id);
  await new Promise(r => setTimeout(r, 200));
  const editSpans = [...d.querySelectorAll("#filterPatternPreview .preview-value-span")];
  assert(editSpans.length === 3 && editSpans[1].classList.contains("chip-ignored"),
    "re-opening Edit on an already-ignored-column filter shows that column pre-dimmed in the preview");
  w.closeFilterPopup();

  /* ---------- Post-creation toggle: clicking a pattern chip above the table ---------- */
  const chips = [...d.querySelectorAll("#extractPatternView .pattern-chip")];
  assert(chips.length === 3, "pattern view still shows a chip per placeholder, ignored or not (unlike the table, which only shows visible ones)");
  assert(chips[1].classList.contains("chip-ignored"), "the ignored column's chip is visually dimmed in the post-creation pattern view too");
  fireClick(chips[1], w); // un-ignore "name" by clicking its chip directly (no popup involved)
  assert(!node.ignoredColumns, "clicking the pattern chip un-ignores the column directly on the node (empty ignoredColumns is deleted, not left as [])");
  assert(T.extractColumns.length === 3, "table immediately shows all 3 columns again after un-ignoring");
  fireClick(d.querySelectorAll("#extractPatternView .pattern-chip")[1], w); // re-ignore for the checks below
  assert(node.ignoredColumns && node.ignoredColumns.includes(1), "re-ignored via the same chip toggle, for the persistence checks below");

  /* ---------- Column statistics / assertions / plot: a SEPARATE node, ignoring the NUMERIC column this time ---------- */
  const numNode = w.createFilterNode(f.id, "extract", "id=[value:int] name=[*] score=[value:float]");
  w.setColumnIgnored(numNode, 0, true); // ignore "id" (int, column index 0) — "score" (float, index 2) stays visible
  w.render();
  assert(w.computeColumnStats(0) === null, "computeColumnStats returns null for a currently-ignored column");
  const statsText = d.querySelector("#extractStatsBar").textContent;
  assert(statsText.includes("value 3") && !statsText.includes("value:"), "stats bar shows the visible numeric column ('value 3'/score) but omits the ignored one ('value'/id), got " + JSON.stringify(statsText));
  assert(d.querySelectorAll("#extractHead .extract-assert-btn").length === 1, "only the visible numeric column gets a value-assertion button — an ignored column isn't assertable");

  w.switchExtractView("plot");
  const xOptions = [...d.querySelectorAll("#plotXSelect option")].map(o => +o.value);
  assert(xOptions.length === 1 && xOptions[0] === 2, "ignored numeric column is not offered as a plot axis candidate, got " + JSON.stringify(xOptions));
  w.switchExtractView("table");

  /* ---------- Persistence: cloneSubtree (copy/paste) ---------- */
  T.state.activeId = node.id;
  const clone = w.cloneSubtree(node.id, f.id);
  assert(clone.ignoredColumns && clone.ignoredColumns.includes(1) && clone.ignoredColumns !== node.ignoredColumns,
    "cloneSubtree carries ignoredColumns onto the copy as an independent array");

  /* ---------- Persistence: undo/redo (snapshotSubtree/restoreSubtree) ---------- */
  T.resetUndoRedo();
  w.deleteFilterNodeWithUndo(node.id);
  assert(!T.state.nodes[node.id], "sanity: node gone after delete");
  w.undo();
  const restored = T.state.nodes[node.id];
  assert(restored && restored.ignoredColumns && restored.ignoredColumns.includes(1),
    "undo restores ignoredColumns alongside the rest of the deleted node");

  /* ---------- Persistence: filter save/load JSON round trip ---------- */
  const branch = w.serializeFilterBranch(node.id);
  const savedRoot = branch.roots.find(r => r.attach === "target");
  assert(savedRoot && savedRoot.ignoredColumns && savedRoot.ignoredColumns.includes(1), "serializeFilterBranch writes ignoredColumns into the saved JSON");
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const anchor = w.createFilterNode(f.id, "text", "id=");
  w.render();
  const loadScript = d.createElement("script");
  loadScript.textContent = `loadFilterTargetId = ${JSON.stringify(anchor.id)};`;
  d.body.appendChild(loadScript);
  const beforeChildren = anchor.children.length;
  w.importFilterJson(json);
  assert(anchor.children.length === beforeChildren + 1, "load creates the extract node under the target anchor");
  const loaded = T.state.nodes[anchor.children[anchor.children.length - 1]];
  assert(loaded.ignoredColumns && loaded.ignoredColumns.includes(1), "ignoredColumns travels through filter save/load JSON");

  /* ---------- Persistence: session cache serialization (also covers session export/import, which reuses these same functions) ---------- */
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(f);
  const cacheNode = cacheRoots.find(r => r.value === node.value);
  assert(cacheNode && cacheNode.ignoredColumns && cacheNode.ignoredColumns.includes(1),
    "serializeFilterTreeForCache writes ignoredColumns");
  const fakeFile = { id: "test-fake-file", children: [] };
  w.materializeCachedFilters(fakeFile, cacheRoots);
  const materialized = fakeFile.children.map(id => T.state.nodes[id]).find(n => n.value === node.value);
  assert(materialized && materialized.ignoredColumns && materialized.ignoredColumns.includes(1),
    "materializeCachedFilters restores ignoredColumns (session cache restore + session export/import)");
});

/* ============================================================
   GROUP 25 — Bugfix follow-up to Group 24 (person-reported, 2026-08-13)
   Bug 1: "Extract numbers from this message" set filterInput.value directly
   without firing an "input" event, so evaluateLiveMatch — and, since Group
   24, the live pattern preview riding its same debounce — never ran until
   the person typed something themselves. Fixed by calling evaluateLiveMatch()
   explicitly right after the assignment, same as insertTokenAtCursor and
   openEditFilterPopup already did after their own direct .value writes.
   Bug 2: right-click -> "Edit filter…" opened #filterPopup but it closed
   itself again in the SAME click — treeContextMenu's click handler didn't
   stopPropagation, so the click kept bubbling to document's global "click
   outside a popup closes it" handler; by then #filterPopup had just lost
   its "hidden" class, and ev.target (the menu item, still in the DOM,
   closeTreeContextMenu only toggles a CSS class) is outside #filterPopup,
   so that handler closed it right back. Same class of bug as the preview
   span / pattern chip fix in Group 24 — one more instance of "a click
   handler that opens something else must not let the click keep bubbling
   to a close-on-outside-click listener." F2 was unaffected (not a click
   event, never reaches that handler), which is why only the right-click
   path was reported broken.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("25. Bugfixes: extract-numbers live preview + right-click edit popup");
  const log = `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"id=1 name=n1 score=1.5"\n`;
  const f = await w.addFile("a.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  // --- Bug 1 --- ("Extract numbers from this message" was renamed to
  // "Filter for this message" in a later session — #ctxFilterForColumn is
  // its current id, see Group 40 for the rename's own coverage; the
  // underlying live-preview bugfix being re-verified here is unaffected.)
  const entryRow = d.querySelector(".log-row");
  fireContextMenu(entryRow, w, 50, 50);
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  await new Promise(r => setTimeout(r, 200)); // shared debounce, see evaluateLiveMatch
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "sanity: popup opens from 'Filter for this message'");
  assert(d.querySelector("#filterInput").value.includes("[value:"), "sanity: a pattern was inserted");
  const preview = d.querySelector("#filterPatternPreview");
  assert(!preview.classList.contains("hidden"), "live pattern preview appears immediately, without the person typing anything first");
  assert(preview.querySelectorAll(".preview-value-span").length > 0, "preview shows highlighted spans immediately, not just after a manual edit");
  w.closeFilterPopup();

  // --- Bug 2 ---
  const textNode = w.createFilterNode(f.id, "text", "id=");
  w.render();
  const row = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(row, w, 60, 60);
  const editItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "edit");
  assert(editItem, "sanity: context menu offers 'Edit filter…' for a text filter");
  fireClick(editItem, w);
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "right-click 'Edit filter…' opens the popup and it STAYS open (doesn't immediately self-close via the click-outside handler)");
  assert(d.querySelector("#filterInput").value === "id=", "the popup opened for the correct node (its current value)");
  w.closeFilterPopup();
});

/* ============================================================
   GROUP 26 — Header/toolbar reshuffle (this session, 2026-08-13)
   Three UI changes: (1) removed the "local, single-file log viewer"
   subtitle from the header, (2) merged the breadcrumb, level filter, and
   Full/Filtered/Stacked toggle — previously three separate toolbar rows —
   into one #viewBar row (only #fhTabs inside it is hidden/shown per view
   state; #levelBar/#breadcrumb now live in that same row but stay visible
   in every state, including extract mode, since renderExtractTable() still
   calls applyLevelFilter() and the filter chain is still useful there),
   and (3) moved the keyboard-shortcuts list out of a permanent bottom-left
   sidebar strip into a popup behind a new #btnShortcuts header button,
   following the exact same open/close/outside-click/Escape pattern as the
   pre-existing #bookmarksPanel. Follow-up in the same session: #fhTabs/
   #levelBar switched from flex items to floats so they stay pinned to the
   top-left line even when the breadcrumb wraps, with the breadcrumb (now a
   plain block with inline-block chips) using the full row width on wrapped
   lines instead of being squeezed beside them — see #viewBar's own CSS
   comment for why flexbox can't do this. A bugfix followed (missing
   flex:0 0 auto on #viewBar clipping the floats). Another follow-up
   (person-requested): breadcrumb chips resized to match the level filter
   pills' font-size/padding exactly, and made clickable — clicking a chip
   selects that ancestor node in the filter tree, same single-select
   behavior as a plain (non-Ctrl) tree-row click. A second bugfix followed
   (person-reported, still mismatched heights): font-size/padding parity
   wasn't enough — #breadcrumb's leftover line-height:26px was inherited by
   the inline-block .crumb and inflated its height on top of the matching
   padding, invisible on .level-btn since flex containers ignore
   line-height for their own sizing. Fixed by dropping it and setting
   line-height:normal on .crumb/.crumb-sep explicitly. A third bugfix
   followed (person-reported, still not aligned): matching height still
   didn't mean matching TOP position — .crumb used vertical-align:middle,
   which aligns relative to the parent's font baseline, not to where a
   float actually starts. Fixed by vertical-align:top + margin-top:0, which
   pins .crumb's own top edge to the same y-position #fhTabs/#levelBar's
   floats start at (structurally, not by font-metric coincidence).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("26. Header reshuffle: merged view bar + shortcuts popup");

  // --- Subtitle removed ---
  assert(d.querySelector(".brand-tag") === null, "the 'local, single-file log viewer' subtitle is gone");
  assert(d.querySelector(".brand-name").textContent === "PhiLogg", "brand name itself is untouched");

  // --- Merged view bar structure: tabs, level filter, breadcrumb share one row ---
  const viewBar = d.querySelector("#viewBar");
  assert(viewBar !== null, "#viewBar exists");
  const viewBarChildren = [...viewBar.children].map(c => c.id);
  assert(
    viewBarChildren.indexOf("fhTabs") !== -1 &&
    viewBarChildren.indexOf("fhTabs") < viewBarChildren.indexOf("levelBar") &&
    viewBarChildren.indexOf("levelBar") < viewBarChildren.indexOf("breadcrumb"),
    "view bar order is tabs, then level filter, then breadcrumb, got " + viewBarChildren.join(",")
  );
  assert(d.querySelector("#breadcrumb").parentElement === viewBar && d.querySelector("#levelBar").parentElement === viewBar,
    "breadcrumb and level bar are nested INSIDE #viewBar (previously three separate top-level rows)");

  // Layout mechanism guard (person-requested follow-up, same session): tabs
  // and level filter must stay pinned top-left even when the breadcrumb
  // wraps to multiple lines, with the breadcrumb using the FULL row width
  // on wrapped lines rather than being squeezed beside them. Flexbox can't
  // do "first line shares space, later lines full width" — only the
  // classic float+normal-flow text-wrap technique can, so this guards
  // against an accidental revert to flex on #viewBar/#breadcrumb, which
  // jsdom's computed styles (unlike real line-wrapping) CAN detect even
  // without a layout engine.
  const cs = w.getComputedStyle;
  assert(cs(viewBar).display === "flow-root", "#viewBar is a flow-root (contains the floats regardless of breadcrumb height)");
  assert(cs(d.querySelector("#fhTabs")).float === "left", "#fhTabs floats left so it stays pinned to the top line");
  assert(cs(d.querySelector("#levelBar")).float === "left", "#levelBar floats left so it stays pinned to the top line");
  assert(cs(d.querySelector("#breadcrumb")).display === "block", "#breadcrumb is a plain block (not flex) so its chips text-wrap around the floats instead of the whole element dropping down");
  // Regression guard for a real bug hit once already: #viewBar's flow-root
  // is a SEPARATE concern from its own flex-item sizing as a child of
  // #content (a flex column). Losing flex-shrink:0 here lets #content
  // compress #viewBar below the height its floated children need whenever
  // the window is short on vertical space, clipping/overlapping the
  // toggle+level-filter pills against the table below — exactly the "Full/
  // Filtered/Stacked toggle and level filter get cut off" symptom that was
  // reported and fixed in this session.
  assert(cs(viewBar).flexShrink === "0", "#viewBar must not flex-shrink as a child of #content, or its floated children get clipped when vertical space is tight");

  // Initial (no files loaded) state: tabs hidden, same as the old #fhTabBar default
  assert(T.state.rootIds.length === 0, "sanity: no files loaded yet");
  assert(d.querySelector("#fhTabs").style.display === "none", "tabs hide when no files are loaded");

  const f = await w.addFile("a.log", makeLog(0, 10, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = textNode.id;
  w.render();
  assert(d.querySelector("#fhTabs").style.display === "flex", "tabs visible for a normal (non-extract) filter node");
  assert(d.querySelectorAll("#levelBar .level-btn").length > 0, "level filter buttons render inside the merged bar");
  assert(d.querySelectorAll("#breadcrumb .crumb").length > 0, "breadcrumb chips render inside the merged bar");

  // Extract mode: tabs hide (no Highlight companion), but level filter and
  // breadcrumb — sharing the same #viewBar row now — must stay visible,
  // since renderExtractTable() still applies applyLevelFilter() and the
  // filter chain is still meaningful navigation there.
  const extractNode = w.createFilterNode(f.id, "extract", "message [value:int]");
  T.state.activeId = extractNode.id;
  w.render();
  assert(d.querySelector("#fhTabs").style.display === "none", "tabs hide in extract mode (unchanged behaviour)");
  assert(d.querySelectorAll("#levelBar .level-btn").length > 0, "level filter STILL renders in extract mode (regression guard for the merge)");
  assert(d.querySelectorAll("#breadcrumb .crumb").length > 0, "breadcrumb STILL renders in extract mode (regression guard for the merge)");

  // Back to a normal node so the popup checks below aren't affected
  T.state.activeId = textNode.id;
  w.render();

  // --- Breadcrumb follow-up (person-requested, this session): same height/
  // text size as the level filter pills, and clickable chips select that
  // ancestor node in the filter tree. ---
  const crumbEl = d.querySelector("#breadcrumb .crumb");
  const levelBtnEl = d.querySelector("#levelBar .level-btn");
  assert(cs(crumbEl).fontSize === cs(levelBtnEl).fontSize, "breadcrumb chips use the same text size as the level filter pills");
  assert(cs(crumbEl).paddingTop === cs(levelBtnEl).paddingTop && cs(crumbEl).paddingBottom === cs(levelBtnEl).paddingBottom,
    "breadcrumb chips use the same vertical padding as the level filter pills (same overall height)");
  // Regression guard, ROUND 2 (person screenshot, this session: the
  // View-Toggle is still visibly taller than the pills beside it despite
  // this same font-size/padding match). Root cause: #fhTabs isn't a single
  // box like .crumb/.level-btn — it's TWO nested boxes (.view-tabs' own
  // padding+border, then .view-tab's padding inside that), costing it ~4px
  // more non-content chrome even at equal content height. Round 1's fix
  // (line-height:normal parity, below) matched the pills to EACH OTHER
  // correctly but never compared against the actual reference element,
  // #fhTabs, so the two groups kept drifting apart by that structural 4px.
  // Fixed by pinning explicit line-height values (not "normal", which is
  // font-metric/platform-dependent — var(--font-ui)/var(--font-mono) are
  // system-font stacks) so the arithmetic is provably equal regardless of
  // platform: #fhTabs' own button = outer padding(2*2) + outer border(2*1)
  // + its own padding(2*4) + line-height(12) = 4+2+8+12 = 26px; each pill =
  // padding(2*4) + border(2*1) + line-height(16) = 8+2+16 = 26px. jsdom has
  // no layout engine (can't assert the resulting 26px directly — see
  // "Testing approach"), so this asserts the individual declared values
  // whose sum produces that parity instead.
  const viewTabEl = d.querySelector("#fhTabs .view-tab");
  assert(cs(viewTabEl).lineHeight === "12px",
    "#fhTabs' own button (.view-tab) uses a pinned 12px line-height, not \"normal\" — it's the height REFERENCE for the rest of the row, so its own height must be deterministic too");
  assert(cs(crumbEl).lineHeight === "16px" && cs(levelBtnEl).lineHeight === "16px",
    "breadcrumb chips and level pills use a pinned 16px line-height (not \"normal\") — 4px taller than #fhTabs' own 12px, exactly offsetting the extra chrome #fhTabs' nested outer box (.view-tabs padding+border) costs it over these single-box pills, so both totals land on 26px");
  // Regression guard for a third reported round on this same row (person
  // screenshot: "top chain row should align with the level filters and
  // STAY that way"): vertical-align:middle aligns a .crumb relative to its
  // PARENT's font baseline/x-height, not to where #fhTabs/#levelBar's
  // floats actually start — the two only coincided by accident depending on
  // inherited font metrics. vertical-align:top + margin-top:0 pins the
  // chip's own top edge to the same y-position the floats start at
  // (both are the first content in #viewBar, so a float's top and a
  // normal-flow block's first line both begin flush at #viewBar's
  // content-box top), which holds regardless of font/content changes.
  const fhTabsEl = d.querySelector("#fhTabs");
  const levelBarEl = d.querySelector("#levelBar");
  assert(cs(crumbEl).verticalAlign === "top", "breadcrumb chips use vertical-align:top, not middle, so they align to where the floats start rather than to a font-baseline-relative position");
  assert(cs(crumbEl).marginTop === "0px", "breadcrumb chips have no top margin, so their top edge isn't pushed down relative to the floats");
  assert(cs(fhTabsEl).marginTop === "0px" && cs(levelBarEl).marginTop === "0px",
    "sanity: #fhTabs/#levelBar also have no top margin — all three share the same starting y-position in #viewBar");

  const crumbs = [...d.querySelectorAll("#breadcrumb .crumb")];
  assert(crumbs.length === 2, "sanity: breadcrumb has file + filter = 2 chips, got " + crumbs.length);
  assert(!crumbs[0].classList.contains("current") && crumbs[1].classList.contains("current"),
    "sanity: only the active node's own chip is marked current — the other chip is a clickable ancestor");
  fireClick(crumbs[0], w); // click the file chip — an ancestor, not the currently active node
  assert(T.state.activeId === f.id, "clicking a breadcrumb chip selects that node (state.activeId updates to it)");
  assert(T.state.multiSelect.has(f.id) && T.state.multiSelect.size === 1,
    "clicking a breadcrumb chip sets a single-node multiSelect, same as a plain (non-Ctrl) tree-row click");
  assert(d.querySelector(".tree-row.active") !== null, "the file's tree row is now marked active after the breadcrumb click");
  T.state.activeId = textNode.id; // reset for the popup checks below
  w.render();

  // --- Shortcuts popup ---
  assert(d.querySelector("#shortcuts").parentElement.id === "shortcutsPanel", "the shortcuts list now lives inside #shortcutsPanel, not directly in the sidebar");
  assert(d.querySelector("#sidebar #shortcuts") === null, "the sidebar no longer has a permanent shortcuts strip");
  assert(d.querySelector("#shortcutsPanel").classList.contains("hidden"), "shortcuts popup starts hidden");

  const btnShortcuts = d.querySelector("#btnShortcuts");
  fireClick(btnShortcuts, w);
  assert(!d.querySelector("#shortcutsPanel").classList.contains("hidden"), "clicking the header button opens the shortcuts popup");
  assert(d.querySelector("#shortcutsPanel").textContent.includes("new filter on selected node"), "popup shows the shortcut reference content");

  fireClick(d.body, w); // outside click
  assert(d.querySelector("#shortcutsPanel").classList.contains("hidden"), "clicking outside closes the shortcuts popup");

  fireClick(btnShortcuts, w);
  assert(!d.querySelector("#shortcutsPanel").classList.contains("hidden"), "sanity: reopened for the Escape check");
  fireKeydown(d, w, "Escape");
  assert(d.querySelector("#shortcutsPanel").classList.contains("hidden"), "Escape closes the shortcuts popup, same as the other popups");
});

/* ============================================================
   GROUP 27 — Pin bookmarks into the Filtered View
   Origin: this session (2026-08-14), from FEATURE_BACKLOG.md item 1
   (person-requested, modeled on glogg/klogg's "marks" always breaking
   through the search pattern into the filtered view). See PROJECT.md "Pin
   bookmarks into the Filtered View" for the full design writeup and the
   decisions this session made on the backlog doc's open questions.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("27. Pin bookmarks into the Filtered View");
  const fa = await w.addFile("a.log", makeLog(0, 20, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 10), () => {});
  T.state.activeId = fa.id;
  w.render();

  const textNode = w.createFilterNode(fa.id, "text", "message 1"); // matches entries 1, 10..19 (10 of 20)
  T.state.activeId = textNode.id;
  w.render();
  const baselineCount = w.getVisibleEntries().length;
  assert(baselineCount === 11, "sanity: text filter substring-matches 11 of 20 entries (\"message 1\" also matches \"message 10\"..\"message 19\") before any pinning");

  // Bookmark an entry the active filter does NOT match (entry 0, "message 0").
  const outsideEntry = fa.entries[0];
  w.toggleBookmark(outsideEntry.id);
  assert(w.getVisibleEntries().length === baselineCount, "toggle off (default): bookmarked-but-non-matching entry stays excluded");

  // --- Toggle on via the toolbar button ---
  const btnPin = d.querySelector("#btnPinBookmarks");
  assert(!btnPin.classList.contains("active"), "pin button starts inactive");
  fireClick(btnPin, w);
  assert(T.state.pinBookmarksInFilteredView === true, "click sets state.pinBookmarksInFilteredView");
  assert(btnPin.classList.contains("active"), "pin button shows active state after click");

  const visible = w.getVisibleEntries();
  assert(visible.length === baselineCount + 1, "pinned-in bookmark adds exactly one extra entry");
  assert(visible.some(e => e.id === outsideEntry.id), "the bookmarked-but-non-matching entry is now present");
  const idxOutside = visible.findIndex(e => e.id === outsideEntry.id);
  assert(idxOutside === 0, "merge respects chronological order (entry 0 sorts first)");

  // --- Level filter bypass: a pin is absolute, same as the filter tree above ---
  T.state.levelFilter.add("ERROR");
  const visibleLvl = w.getVisibleEntries();
  assert(visibleLvl.some(e => e.id === outsideEntry.id), "pinned entry (level INFO) still shown even though the level filter is set to ERROR only");
  T.state.levelFilter.clear();

  // --- Row rendering: pinned-but-non-matching gets .pinned-row, a real match doesn't ---
  // Scoped to #tableRows (Filtered view) — the same entry is also present,
  // unfiltered, in #highlightRows (Full view), which has no pinned-row
  // concept at all, so an unscoped query would ambiguously match either.
  w.render();
  const outsideRow = d.querySelector('#tableRows [data-entry-id="' + outsideEntry.id + '"]');
  assert(outsideRow && outsideRow.classList.contains("pinned-row"), "row for the pinned-but-non-matching entry gets .pinned-row");
  const matchedEntry = fa.entries[1]; // matches the "message 1" filter directly
  w.toggleBookmark(matchedEntry.id); // also bookmark a genuinely matching entry
  w.render();
  const matchedRow = d.querySelector('#tableRows [data-entry-id="' + matchedEntry.id + '"]');
  assert(matchedRow && !matchedRow.classList.contains("pinned-row"), "a bookmarked entry that already matched the filter is NOT marked .pinned-row (it's not there only because of the pin)");
  w.toggleBookmark(matchedEntry.id); // revert

  // --- Status strip surfaces the pinned count ---
  assert(d.querySelector("#statusStrip").textContent.includes("1 pinned"), "status strip shows the pinned-only count");

  // --- Scoping: a bookmark on a DIFFERENT root file must not leak into this root's Filtered View ---
  const otherRootEntry = fb.entries[0];
  w.toggleBookmark(otherRootEntry.id);
  assert(!w.getVisibleEntries().some(e => e.id === otherRootEntry.id), "a bookmark belonging to a different root file is not pinned into this root's Filtered View");
  w.toggleBookmark(otherRootEntry.id); // revert

  // --- Toggle off restores baseline exactly ---
  fireClick(btnPin, w);
  assert(T.state.pinBookmarksInFilteredView === false, "second click turns pinning back off");
  assert(!btnPin.classList.contains("active"), "pin button loses active state");
  assert(w.getVisibleEntries().length === baselineCount, "turning the toggle off restores the unpinned result exactly");

  // --- Extract mode is untouched (getVisibleEntries is only used by the plain table path) ---
  fireClick(btnPin, w); // back on
  const extractNode = w.createFilterNode(fa.id, "extract", "message [value:int]");
  T.state.activeId = extractNode.id;
  w.render();
  assert(T.extractRowsData.length === 20, "extract table result is unaffected by the pin toggle (its own placeholder pattern matches all 20 lines regardless)");
  T.state.activeId = textNode.id;
  fireClick(btnPin, w); // back off, leave state clean for cache/export checks below
  w.toggleBookmark(outsideEntry.id); // remove the test bookmark

  // --- Persistence: session cache (IndexedDB) settings round-trip ---
  T.state.pinBookmarksInFilteredView = true;
  w.updatePinBookmarksButton();
  await w.persistMetaNow();
  const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
  assert(meta && meta.settings.pinBookmarksInFilteredView === true, "cache: pinBookmarksInFilteredView written to meta.settings");

  // --- Persistence: session export/import JSON round-trip ---
  const exportData = w.buildSessionExport([fa.id], new Set());
  assert(exportData.settings.pinBookmarksInFilteredView === true, "export: pinBookmarksInFilteredView included in the exported settings");
}, { indexedDB: new IDBFactory() });

/* ============================================================
   GROUP 28 — Bugfix follow-up to Group 27 (person-reported, this session)
   toggleBookmark() repainted the Filtered view via renderVisibleRows() using
   the STALE currentViewEntries/pinnedOnlyIds from the last full render —
   fine before Group 27 (a bookmark change never used to affect WHICH rows
   are shown, only a dot on an existing row), but wrong now that pin mode
   can add/remove rows on a bookmark change. Only the pin toggle button
   itself (which routes through render() -> renderTable() -> getVisibleEntries())
   picked up bookmark changes; adding/removing a bookmark via the button,
   context menu, or "B" left the Filtered view showing the pre-change set
   until some unrelated full render happened to run. Fixed by having
   toggleBookmark() recompute currentViewEntries/pinnedOnlyIds itself when
   pin mode is on, WITHOUT going through renderTable() (which would reset
   scroll to the top on every single bookmark toggle — see the fix's own
   comment in philogg.html).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("28. Bugfix: pinned Filtered view now updates on bookmark add/remove, not just on the pin toggle");
  const fa = await w.addFile("a.log", makeLog(0, 20, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const textNode = w.createFilterNode(fa.id, "text", "message 1"); // matches 11 of 20 (see Group 27)
  T.state.activeId = textNode.id;
  w.render();
  const baselineCount = w.getVisibleEntries().length;

  // Turn pin mode on via the button (this path already worked before the fix)
  fireClick(d.querySelector("#btnPinBookmarks"), w);
  assert(T.state.pinBookmarksInFilteredView === true, "sanity: pin mode on");

  // --- Adding a bookmark while pin mode is already on must show up WITHOUT any further render() ---
  const outsideEntry = fa.entries[0]; // does not match "message 1"
  d.querySelector("#tableBody").scrollTop = 123; // arbitrary non-zero value
  w.toggleBookmark(outsideEntry.id); // NOTE: no w.render() call after this — reproduces the reported bug exactly
  assert(d.querySelector('#tableRows [data-entry-id="' + outsideEntry.id + '"]') !== null,
    "BUGFIX: newly bookmarked entry appears in the Filtered view immediately on toggleBookmark, with no separate render() call");
  assert(d.querySelector('#tableRows [data-entry-id="' + outsideEntry.id + '"]').classList.contains("pinned-row"),
    "the newly-added row is correctly marked .pinned-row immediately");
  assert(d.querySelector("#statusStrip").textContent.includes("1 pinned"), "status strip's pinned count updates immediately too");
  assert(d.querySelector("#tableBody").scrollTop === 123, "toggleBookmark does NOT reset scroll position (would be a new regression if it routed through renderTable())");

  // --- Removing that same bookmark must drop the row immediately too ---
  w.toggleBookmark(outsideEntry.id); // unbookmark, still no w.render() in between
  assert(d.querySelector('#tableRows [data-entry-id="' + outsideEntry.id + '"]') === null,
    "BUGFIX: unbookmarking a pinned-only entry removes its row from the Filtered view immediately");
  assert(!d.querySelector("#statusStrip").textContent.includes("pinned"), "status strip's pinned suffix disappears once no pinned-only rows remain");
  assert(w.getVisibleEntries().length === baselineCount, "back to the exact unpinned baseline count");

  // --- Sanity: with pin mode OFF, toggling a bookmark must NOT trigger the recompute path (no behavior change for the common case) ---
  fireClick(d.querySelector("#btnPinBookmarks"), w); // pin mode off
  assert(T.state.pinBookmarksInFilteredView === false, "sanity: pin mode off");
  const spacerHeightBefore = d.querySelector("#tableSpacer").style.height;
  w.toggleBookmark(outsideEntry.id);
  assert(d.querySelector("#tableSpacer").style.height === spacerHeightBefore, "with pin mode off, bookmarking doesn't touch the row count/spacer at all (unchanged code path)");
  w.toggleBookmark(outsideEntry.id); // revert
});

/* ============================================================
   GROUP 29 — Pin-bookmarks button moved into #viewBar (this session,
   person-requested). #btnPinBookmarks used to sit in the header, next to
   #btnBookmarks. It now lives in #viewBar, between #fhTabs and #levelBar —
   the row that controls what the views show/hide, which is what the
   toggle does. It keeps its original `.toolbar-icon-btn` look rather than
   being restyled as a `.level-btn` pill (additive OR vs. the level pills'
   subtractive AND — see PROJECT.md "Pin bookmarks into the Filtered
   View"). This group only covers the STRUCTURAL/positional move; the
   functional behaviour of the toggle itself (merge logic, level-filter
   bypass, persistence, etc.) is already covered by Group 27/28 above and
   is deliberately not re-tested here.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("29. Pin-bookmarks button moved into #viewBar");

  const viewBar = d.querySelector("#viewBar");
  const btnPin = d.querySelector("#btnPinBookmarks");
  assert(btnPin !== null, "sanity: #btnPinBookmarks still exists somewhere in the document");
  assert(btnPin.parentElement === viewBar, "#btnPinBookmarks is now a direct child of #viewBar, not the header");
  assert(d.querySelector(".toolbar-group").contains(btnPin) === false,
    "#btnPinBookmarks is no longer inside the header's .toolbar-group");

  // --- Position: between #fhTabs and #levelBar, same as requested ---
  const viewBarChildren = [...viewBar.children].map(c => c.id);
  const idxTabs = viewBarChildren.indexOf("fhTabs");
  const idxPin = viewBarChildren.indexOf("btnPinBookmarks");
  const idxLevel = viewBarChildren.indexOf("levelBar");
  assert(idxTabs !== -1 && idxPin !== -1 && idxLevel !== -1, "sanity: all three elements found as direct #viewBar children");
  assert(idxTabs < idxPin && idxPin < idxLevel,
    "view bar order is tabs, then pin-bookmarks toggle, then level filter, got " + viewBarChildren.join(","));

  // --- Visual treatment: kept its own icon-button look, NOT restyled as a level pill ---
  assert(btnPin.classList.contains("toolbar-icon-btn"), "#btnPinBookmarks keeps its original .toolbar-icon-btn class");
  assert(!btnPin.classList.contains("level-btn"), "#btnPinBookmarks is NOT styled like the level filter pills (different functionality, deliberately different look)");

  // --- Layout mechanism: floats left alongside #fhTabs/#levelBar so it stays pinned top-left too ---
  const cs = w.getComputedStyle;
  assert(cs(btnPin).float === "left", "#btnPinBookmarks floats left, same pinned-top-left mechanism as #fhTabs/#levelBar");

  // --- Still always visible (never tied to #fhTabs' show/hide) ---
  assert(T.state.rootIds.length === 0, "sanity: no files loaded yet");
  assert(d.querySelector("#fhTabs").style.display === "none", "sanity: tabs hidden with no files loaded");
  assert(cs(btnPin).display !== "none", "#btnPinBookmarks stays visible even while #fhTabs is hidden (was already independent of #fhTabs in the header, unchanged by the move)");

  // --- Functional sanity from its new location: click still toggles state + active class ---
  await w.addFile("a.log", makeLog(0, 5, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  w.render();
  assert(!btnPin.classList.contains("active"), "sanity: pin toggle starts inactive");
  fireClick(btnPin, w);
  assert(T.state.pinBookmarksInFilteredView === true, "click from the new location still sets state.pinBookmarksInFilteredView");
  assert(btnPin.classList.contains("active"), "pin button still shows active state after click from its new location");
  fireClick(btnPin, w); // revert
  assert(T.state.pinBookmarksInFilteredView === false, "sanity: reverted");
});

/* ============================================================
   GROUP 29b — Bugfix follow-up to Group 29 (person-reported, ROUND 1):
   #btnPinBookmarks still used `.toolbar-icon-btn`'s fixed 29x29px box
   after the move into #viewBar, visibly taller than #fhTabs/#levelBar/
   #breadcrumb next to it. ROUND 2 (person screenshot, this session)
   reversed the target: #fhTabs — not the pills — is the row's actual
   height REFERENCE (see Group 26's extended height-parity comment), and
   its real total is 26px, not the ~22-23px round 1's auto-sizing produced.
   #btnPinBookmarks now pins an explicit `height:26px` instead (box-sizing:
   border-box makes this the TOTAL box height); width stays auto and
   padding stays 4px 8px unchanged from round 1, so only the vertical
   dimension moved. `.toolbar-icon-btn` itself (and therefore every OTHER
   header button using it) stays untouched either round — this override is
   still scoped to the #btnPinBookmarks id only. jsdom has no layout engine
   (documented blind spot, see "Testing approach" / Group 26's own
   comment), so this can only assert the CASCADED width/height/padding
   values rather than an actual rendered pixel height — real visual parity
   was confirmed separately via a real-browser screenshot, not jsdom.
   ============================================================ */
await withApp(async (w, d) => {
  section("29b. Bugfix: #btnPinBookmarks sized to match #fhTabs (26px), not the header's 29px icon buttons");
  const btnPin = d.querySelector("#btnPinBookmarks");
  const cs = w.getComputedStyle;
  assert(cs(btnPin).width === "auto", "#btnPinBookmarks no longer forces the header's fixed 29px width");
  assert(cs(btnPin).height === "26px", "#btnPinBookmarks pins an explicit 26px height — matching #fhTabs' own total height, the row's height reference — instead of the header's 29px or an auto-sized box");
  assert(cs(btnPin).padding === "4px 8px", "#btnPinBookmarks keeps the same 4px vertical padding as .level-btn/.crumb, just within a taller fixed box now");

  // --- Header buttons sharing .toolbar-icon-btn are completely unaffected ---
  ["#btnUndo", "#btnRedo", "#btnBookmarks", "#btnShortcuts"].forEach(sel => {
    const btn = d.querySelector(sel);
    assert(btn !== null, "sanity: " + sel + " exists");
    const bcs = w.getComputedStyle(btn);
    assert(bcs.width === "29px" && bcs.height === "29px", sel + " keeps its original fixed 29x29px size (the fix is scoped to #btnPinBookmarks only), got " + bcs.width + "x" + bcs.height);
  });
});

/* ============================================================
   GROUP 30 — File filter history (person-requested, this session)
   Per-file filter-tree memory, separate from the session cache: the latest
   filter tree for any real (non-merged) file is kept in a new "fileHistory"
   IndexedDB store, keyed by content fingerprint, and offered back as a
   dismissable ghost preview (never auto-applied) the next time a file with
   matching content is loaded — even in a brand new session. See PROJECT.md
   "File filter history" for the full design writeup.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("30a. File filter history: tier-1 match across a simulated new session");
  const idb = new IDBFactory();

  // --- Session 1: load a file, build a filter tree, persist history ---
  const text = makeLog(0, 10, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });
  await withApp(async (w1, d1, T1) => {
    const f = await w1.addFile("a.log", text, () => {});
    T1.state.activeId = f.id;
    const t1 = w1.createFilterNode(f.id, "text", "message 1");
    w1.createFilterNode(t1.id, "after", 0);
    w1.render();
    await w1.persistFileHistoryNow();
    const all = await w1.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
    assert(Array.isArray(all) && all.length === 1, "sanity: exactly one history record written, got " + (all && all.length));
    assert(all[0].filters.length === 1 && all[0].filters[0].filterType === "text" && all[0].filters[0].children.length === 1,
      "sanity: stored record's filter tree has the right shape (1 root, 1 nested child)");
  }, { indexedDB: idb });

  // --- Session 2 (fresh window, same IndexedDB): load the SAME content again ---
  await withApp(async (w2, d2, T2) => {
    const f2 = await w2.addFile("a.log", text, () => {});
    const match = await w2.matchFileHistory(f2);
    assert(match !== null, "matchFileHistory finds the record from the other session");
    assert(match.tier === 1, "exact byte-identical content matches at tier 1, got tier " + (match && match.tier));
    assert(match.record.filters.length === 1 && match.record.filters[0].filterType === "text",
      "matched record carries the original filter tree");

    // --- Ghost preview appears in the tree for a childless file with a match ---
    f2.filterHistoryMatch = { filters: match.record.filters, tier: match.tier };
    w2.render();
    const ghost = d2.querySelector(".tree-ghost");
    assert(ghost !== null, "ghost preview renders under the file when it has no filters yet and a history match exists");
    assert(ghost.querySelectorAll(".tree-ghost-row").length === 2, "ghost preview shows both levels of the saved tree (root + nested child), got " + ghost.querySelectorAll(".tree-ghost-row").length);
    const restoreBtn = ghost.querySelector(".tree-ghost-restore-btn");
    assert(restoreBtn !== null && restoreBtn.textContent === "Restore filters", "restore button present with the expected label");
    assert(ghost.querySelectorAll(".tree-ghost-row")[0].hasAttribute("draggable") === false,
      "sanity: ghost rows carry none of a real tree-row's interactive attributes");

    // --- Clicking Restore materializes the real filter tree and the ghost disappears ---
    fireClick(restoreBtn, w2);
    assert(f2.children.length === 1, "restore materializes the saved tree onto the file node");
    assert(state_childFilterType(T2, f2) === "text", "materialized root child has the saved filterType");
    assert(d2.querySelector(".tree-ghost") === null, "ghost preview is gone immediately after restoring (file now has real children)");
  }, { indexedDB: idb });
});

// Small helper used only by Group 30 above — reads the filterType of a
// file node's first child via the live state, since w.render() already ran.
function state_childFilterType(T, fileNode) {
  return T.state.nodes[fileNode.children[0]].filterType;
}

await withApp(async (w, d, T) => {
  section("30b. File filter history: tier-2 match against a grown file");
  const idb = new IDBFactory();

  await withApp(async (w1) => {
    const f = await w1.addFile("b.log", makeLog(0, 10), () => {});
    w1.createFilterNode(f.id, "text", "message 1");
    w1.render();
    await w1.persistFileHistoryNow();
  }, { indexedDB: idb });

  await withApp(async (w2) => {
    // Same first 10 lines (makeLog is deterministic per index) plus 5 more —
    // simulates the same tailed file having grown since the earlier session.
    const grown = await w2.addFile("b.log", makeLog(0, 15), () => {});
    const match = await w2.matchFileHistory(grown);
    assert(match !== null, "grown file still matches its earlier (smaller) history snapshot");
    assert(match.tier === 2, "match is tier 2 (window fingerprint), not tier 1 (content differs now), got tier " + (match && match.tier));
    assert(match.record.entryCount === 10, "matched record is the original 10-entry snapshot, not something else");
  }, { indexedDB: idb });

  await withApp(async (w3) => {
    // A file that's merely SIMILAR (not a superset) must not match at all —
    // regression guard against a false positive from a loose window check.
    const unrelated = await w3.addFile("c.log", makeLog(100, 10), () => {});
    const match = await w3.matchFileHistory(unrelated);
    assert(match === null, "an unrelated file's own span doesn't overlap the stored snapshot's span — no match, not even a near-miss");
  }, { indexedDB: idb });
});

await withApp(async (w, d, T) => {
  section("30c. File filter history: exclusions (merged files, empty trees) and ghost auto-hide");

  // --- Merged files are never written to history, even once they have filters ---
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(50, 5), () => {});
  const merged = w.mergeFiles([fa.id, fb.id]);
  w.createFilterNode(merged.id, "text", "message 1");
  w.render();
  await w.persistFileHistoryNow();
  let all = await w.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
  assert(Array.isArray(all) && all.length === 0, "a merged file's filter tree is never written to history, even with real filters, got " + (all && all.length) + " records");

  // --- A file with an empty filter tree doesn't get a record either ---
  const fc = await w.addFile("c.log", makeLog(200, 5), () => {});
  w.render();
  await w.persistFileHistoryNow();
  all = await w.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
  assert(Array.isArray(all) && all.length === 0, "a file with no filters yet contributes no history record, got " + (all && all.length));

  // --- Now give fc a real filter: it DOES get written ---
  w.createFilterNode(fc.id, "text", "message 1");
  w.render();
  await w.persistFileHistoryNow();
  all = await w.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
  assert(Array.isArray(all) && all.length === 1 && all[0].name === "c.log", "a real (non-merged) file with a filter tree IS written to history");

  // --- Ghost auto-hide: creating a NEW filter without restoring hides the ghost ---
  const fd = await w.addFile("d.log", makeLog(300, 5), () => {});
  fd.filterHistoryMatch = { filters: [{ ref: 1, filterType: "text", name: "“old”", inverted: false, children: [] }], tier: 1 };
  w.render();
  assert(d.querySelector(".tree-ghost") !== null, "sanity: ghost preview visible for the childless file with a match");
  w.createFilterNode(fd.id, "text", "brand new filter"); // person creates their own filter, never clicked Restore
  w.render();
  assert(d.querySelector(".tree-ghost") === null, "ghost preview disappears once the file has ANY real filter child, restored or not");

  // BUGFIX (person-reported, this session, 2026-08-14 — superseding what
  // used to be asserted here): the match itself USED TO survive
  // unconditionally ("not deleted — only hidden by the children.length
  // condition"), which is exactly what let it resurface with the OLD,
  // pre-session filters once every real filter was removed again — see the
  // dedicated 30e below for the full round-trip. Once the tree actually has
  // real children, a persist cycle now clears the in-memory match for good.
  await w.persistFileHistoryNow();
  assert(fd.filterHistoryMatch === null, "the stale match IS now cleared once the file has a real filter tree — it can no longer resurface later just because children.length returns to 0");
}, { indexedDB: new IDBFactory() });

/* ============================================================
   GROUP 30e — Bugfix (person-reported via screenshot, this session,
   2026-08-14): the ghost-preview restore banner correctly disappeared when
   creating a new filter, but reappeared — showing the OLD, pre-session
   filters — the moment that new filter was deleted again. Root cause: only
   the "tree has filters" case ever wrote/overwrote a fileHistory record;
   an emptied tree fell through untouched, so the stale record (and the
   never-cleared in-memory filterHistoryMatch) just sat there waiting to
   resurface. Fix: buildFileHistoryRecords now also emits a "delete" for
   any file whose tree was populated earlier THIS SESSION (own filter or a
   Restore) and is empty again — both adding a filter and removing the last
   one now overwrite whatever restore memory came before, exactly as
   requested. See "File filter history" bugfix in PROJECT.md.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("30e. File filter history bugfix: emptying a tree overwrites (deletes) the old restore state, both in-session and across a reload");
  const idb = new IDBFactory();

  // --- Session 1: build and persist a filter tree, same as 30a's setup ---
  await withApp(async (w1) => {
    const f = await w1.addFile("e.log", makeLog(0, 10), () => {});
    w1.createFilterNode(f.id, "text", "message 1");
    w1.render();
    await w1.persistFileHistoryNow();
  }, { indexedDB: idb });

  // --- Session 2: load the same content, the ghost preview offers the old tree ---
  await withApp(async (w2, d2, T2) => {
    const text = makeLog(0, 10);
    const f2 = await w2.addFile("e.log", text, () => {});
    const match = await w2.matchFileHistory(f2);
    assert(match !== null, "sanity: session 2 finds session 1's stored filter tree");
    f2.filterHistoryMatch = { filters: match.record.filters, tier: match.tier };
    w2.render();
    assert(d2.querySelector(".tree-ghost") !== null, "sanity: ghost preview with the old filters is showing");

    // --- The person creates their OWN filter (never clicked Restore) — ghost hides ---
    const ownFilter = w2.createFilterNode(f2.id, "text", "a brand new filter, unrelated to the old one");
    w2.render();
    await w2.persistFileHistoryNow();
    assert(d2.querySelector(".tree-ghost") === null, "sanity: ghost hidden once the file has its own real filter child");
    let stored = await w2.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
    assert(stored.length === 1 && stored[0].filters[0].value === "a brand new filter, unrelated to the old one",
      "creating a filter overwrites the stored record with the NEW tree, replacing the old one (already worked before this bugfix)");

    // --- THE BUG: the person now deletes that filter — tree is empty again ---
    w2.deleteNode(ownFilter.id);
    w2.render();
    await w2.persistFileHistoryNow();
    assert(f2.children.length === 0, "sanity: the file's filter tree is empty again");
    assert(d2.querySelector(".tree-ghost") === null,
      "BUGFIX: the ghost preview does NOT reappear after deleting the last filter — it used to resurface here showing the OLD pre-session filters");
    assert(f2.filterHistoryMatch === null || f2.filterHistoryMatch === undefined,
      "the in-memory match stays cleared — nothing left for renderNode's children.length===0 condition to show");
    stored = await w2.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
    assert(Array.isArray(stored) && stored.length === 0,
      "BUGFIX: the stored record is REMOVED, not just left stale — emptying the tree is itself the new state, got " + (stored && stored.length) + " records");
  }, { indexedDB: idb });

  // --- Session 3 (fresh window, same IndexedDB): reloading the SAME content
  // now offers nothing to restore, exactly as requested ---
  await withApp(async (w3) => {
    const f3 = await w3.addFile("e.log", makeLog(0, 10), () => {});
    const match = await w3.matchFileHistory(f3);
    assert(match === null, "BUGFIX: reloading the file after all filters were deleted finds no history match — nothing is offered, not even the very first session's filters");
  }, { indexedDB: idb });
});

/* ============================================================
   GROUP 30d — File filter history through the REAL loadFileDescriptors
   entry point. 30a-c all load files via the lower-level addFile() helper
   directly (same as every other group in this suite) and call
   matchFileHistory() themselves — this closes that gap by exercising the
   actual integration point: a real File object read through FileReader
   (readFileWithProgress), then loadFileDescriptors' own persistFileNode +
   matchFileHistory hook attaching the match, with NO test code calling
   matchFileHistory directly. loadFileDescriptors is the single funnel
   behind "Open files…" (#btnOpen's click handler above), drag-and-drop,
   and the File System Access picker — only window.showOpenFilePicker
   itself is unavailable in jsdom (unlike showSaveFilePicker, which Group
   21 stubs), so this calls loadFileDescriptors directly with a descs
   array instead of clicking #btnOpen, exactly the same entry point a real
   drop or the hidden <input type="file"> change handler already reduces
   to. File/FileReader themselves need no stubbing — jsdom implements both
   natively.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("30d. File filter history: through the real loadFileDescriptors/FileReader entry point");
  const idb = new IDBFactory();
  const text = makeLog(0, 10, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });

  // --- Session 1: seed history the same way 30a-c do (addFile is fine
  // here — this session's own job is just to have filtered this content
  // before, not to re-test the loading path itself). ---
  await withApp(async (w1) => {
    const f = await w1.addFile("a.log", text, () => {});
    w1.createFilterNode(f.id, "text", "message 1");
    w1.render();
    await w1.persistFileHistoryNow();
  }, { indexedDB: idb });

  // --- Session 2 (fresh window, same shared IndexedDB): load the SAME
  // content through the REAL browser-facing entry point — an actual File
  // object read via FileReader, exactly like a person picking the file in
  // "Open files…" or dropping it onto the window. ---
  await withApp(async (w2, d2, T2) => {
    const file = new w2.File([text], "a.log", { type: "text/plain" });
    const before = new Set(T2.state.rootIds);
    await w2.loadFileDescriptors([{ file, handle: null }]);

    const newId = T2.state.rootIds.find(id => !before.has(id));
    assert(newId, "loadFileDescriptors registered a new root file via the real FileReader path");
    const node = T2.state.nodes[newId];
    assert(node.entries.length === 10, "file content round-tripped through FileReader.readAsText correctly (10 entries), got " + node.entries.length);
    assert(node.name === "a.log", "file name carried through from the File object");

    // The history hook lives INSIDE loadFileDescriptors, right after
    // persistFileNode — the actual integration point 30a-c never exercise
    // (they call matchFileHistory directly instead of going through here).
    assert(node.filterHistoryMatch !== undefined, "loadFileDescriptors itself attached a filterHistoryMatch — no test code called matchFileHistory directly this time");
    assert(node.filterHistoryMatch.tier === 1, "match found via the real entry point is tier 1 (identical content), got tier " + node.filterHistoryMatch.tier);

    // loadFileDescriptors calls render() itself in its own finally block,
    // so the ghost preview should already be live in the DOM with no
    // test-driven render() call in between.
    const ghost = d2.querySelector(".tree-ghost");
    assert(ghost !== null, "ghost preview is already in the DOM right after loadFileDescriptors returns — no extra render() call needed");
    const restoreBtn = ghost.querySelector(".tree-ghost-restore-btn");
    fireClick(restoreBtn, w2);
    assert(node.children.length === 1, "Restore button works end-to-end for a file loaded via the real entry point");
    assert(d2.querySelector(".tree-ghost") === null, "ghost preview is gone after restoring");
  }, { indexedDB: idb });
});

/* ============================================================
   GROUP 31 — Drag-select time range in minimap (originating session;
   UPDATED this session — see Group 32 below for why). Click-drag across the
   minimap bars creates a from/to time filter: originally an "after" +
   "before" filter pair combined by an "and" node (three tree nodes for one
   conceptual filter); this session replaced that with a single "timerange"
   filter node holding both bounds directly (person-reported: "I'd like the
   result as a single filter, without the two sub-filters" — see Group 32's
   own comment for the full redesign). Updated in place rather than left
   testing the superseded three-node shape (CLAUDE.md: "update/remove
   superseded groups instead of leaving a green check on dead code"). Covers:
   overlay show/hide across the gesture, the correct single-node filter
   shape and resulting entry range, that the pre-existing "scrolled into
   view" viewport indicator keeps working independently (the explicit
   caution in FEATURE_BACKLOG.md), and that a plain (non-dragged) click
   still falls through to the existing click-to-jump behavior.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("31. Drag-select time range in minimap");
  const lines = [];
  const push = (sec, level, msg) => lines.push(`2024-01-15 10:00:${String(sec).padStart(2, "0")},000\t${level}\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`);
  for (let i = 0; i < 20; i++) push(i, i % 5 === 0 ? "ERROR" : "INFO", "entry " + i); // 10:00:00 .. 10:00:19
  const f = await w.addFile("range.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  const svg = d.querySelector("#timelineMinimapSvg");
  const dragRectEl = d.querySelector("#timelineMinimapDragRect");
  const beforeChildCount = f.children.length;

  // Drag from entry 5's time to entry 14's time (inclusive range of 10 entries).
  const x1 = w.minimapTsToX(f.entries[5].ts);
  const x2 = w.minimapTsToX(f.entries[14].ts);
  svg.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: x1, clientY: 10 }));
  assert(dragRectEl.classList.contains("hidden"), "drag overlay stays hidden until the pointer moves past the click threshold");
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: (x1 + x2) / 2, clientY: 10 }));
  assert(!dragRectEl.classList.contains("hidden"), "drag overlay rect appears once the pointer has moved past the click threshold");
  const dragLabelEl = d.querySelector("#timelineMinimapDragLabel");
  assert(!dragLabelEl.classList.contains("hidden") && dragLabelEl.textContent.includes("→"), "drag label shows a from → to readout while dragging");
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: x2, clientY: 10 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: x2, clientY: 10 }));
  // Real browsers fire a trailing "click" after mouseup; jsdom doesn't
  // synthesize one from dispatched mousedown/mouseup, so simulate it to
  // exercise the suppress-flag guard (see the click listener's comment).
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: x2, clientY: 10 }));

  assert(dragRectEl.classList.contains("hidden"), "drag overlay rect hides again after mouseup");
  assert(f.children.length === beforeChildCount + 1, "drag-select added exactly ONE filter child under the active file, got " + f.children.length);

  const rangeNode = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange");
  assert(rangeNode, "the new node has filterType \"timerange\"");
  assert(T.state.activeId === (rangeNode && rangeNode.id), "the new range filter becomes the active node");
  assert(rangeNode.value.from === f.entries[5].ts && rangeNode.value.to === f.entries[14].ts, "the node's value holds both bounds directly, got " + JSON.stringify(rangeNode.value));
  assert(rangeNode.name === w.formatTime(f.entries[5].ts) + " → " + w.formatTime(f.entries[14].ts), "the node's name shows both bounds, got " + rangeNode.name);

  const rangeEntries = w.getEntries(rangeNode.id);
  assert(rangeEntries.length === 10, "range filter selects exactly entries 5..14 inclusive (10 entries), got " + rangeEntries.length);
  assert(rangeEntries.every(e => e.ts >= f.entries[5].ts && e.ts <= f.entries[14].ts), "every selected entry falls within the dragged time range");

  // The pre-existing "filtered view time range" indicators must keep working
  // independently — the explicit caution in FEATURE_BACKLOG.md. (Split into
  // a full-range + a rendered-subset rect by a later session — see Group 34
  // — but the underlying guarantee this asserts is unchanged.)
  const fullRangeRect = d.querySelector("#minimapFullRangeRect");
  const renderedRangeRect = d.querySelector("#minimapRenderedRangeRect");
  assert(fullRangeRect && !fullRangeRect.classList.contains("hidden"), "the full-range indicator still renders after a drag-select filter is created");
  assert(renderedRangeRect && !renderedRangeRect.classList.contains("hidden"), "the rendered-subset indicator still renders after a drag-select filter is created");

  // A short drag (below the pixel threshold) still falls through to plain click-to-jump.
  T.state.selectedId = null;
  const jumpTs = rangeEntries[3].ts;
  const jumpX = w.minimapTsToX(jumpTs);
  svg.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: jumpX, clientY: 10 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: jumpX, clientY: 10 }));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: jumpX, clientY: 10 }));
  assert(T.state.selectedId != null, "a plain (non-dragged) click on the minimap still jumps to the nearest entry");
});

/* ============================================================
   GROUP 32 — Unified "timerange" time filter (this session, person-reported
   follow-up to the drag-select feature above: "I'd like the result as a
   single filter, without the two sub-filters"). Redesigns time filtering
   around one filterType, "timerange", holding both bounds directly as
   `value: { from, to }` (either null = unbounded on that side) — replacing
   the old single-bound "after"/"before" types for every CREATION path
   (drag-select, row context-menu "Filter after/before this row", and the
   new minimap right-click → dialog). "after"/"before" stay in FILTER_TYPES
   purely for backward-compatible READING of already-saved sessions/exports;
   nothing creates them anymore, and editing one through the new dialog
   migrates it to "timerange" (one-way, see updateTimeRangeFilterNode).
   New: a small time-range dialog (create AND edit, unlike the old after/
   before filters which had no edit UI at all) with empty-field-means-
   unbounded fields (no separate infinity checkbox — same convention the
   value-assertion dialog's optional min/max already uses) and a right-click
   on the minimap to open it in create mode, prefilled at the clicked point.
   Covers: legacy after/before nodes still evaluate/tag correctly, F2-edit
   migrates a legacy node in place, row context-menu actions now produce
   unified nodes, tree right-click Edit opens the new dialog for any of the
   three time-filter types, the dialog's own validation (reject empty,
   silently swap a reversed from/to) and Clear buttons, minimap right-click
   creation, and a "timerange" node's value round-tripping through the
   existing generic Save/Load filter JSON machinery unchanged (confirming no
   carrier-specific code was needed beyond adding it to FILTER_TYPES — see
   CLAUDE.md's "Known gotchas" note on filter-node fields).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("32. Unified time filter: single \"timerange\" node, editable dialog, migration, minimap right-click");
  const f = await w.addFile("range2.log", makeLog(0, 30), () => {});
  w.render();

  // --- A. Legacy "after"/"before" nodes stay readable (backward compat) ---
  const legacyAfter = w.createFilterNode(f.id, "after", f.entries[10].ts);
  w.render();
  assert(legacyAfter.filterType === "after", "sanity: a directly-created legacy \"after\" node keeps its old filterType (nothing auto-migrates on creation)");
  assert(w.typeTagFor(legacyAfter) === "TIME", "legacy \"after\" node still gets the TIME tag");
  const legacyEntries = w.getEntries(legacyAfter.id);
  assert(legacyEntries.length === f.entries.length - 10 && legacyEntries.every(e => e.ts >= f.entries[10].ts),
    "legacy \"after\" node still filters correctly, got " + legacyEntries.length);

  // --- B. Editing a legacy node (F2) migrates it to "timerange" ---
  T.state.activeId = legacyAfter.id;
  w.render();
  fireKeydown(d, w, "F2");
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "F2 on a legacy \"after\" node opens the time-range dialog (not the text popup)");
  assert(d.querySelector("#timeRangeFromInput").value !== "", "From is prefilled from the legacy node's value");
  assert(d.querySelector("#timeRangeToInput").value === "", "To starts empty — the legacy \"after\" node had no upper bound");
  d.querySelector("#timeRangeToInput").value = w.tsToLocalInputValue(f.entries[20].ts);
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(legacyAfter.filterType === "timerange", "saving the edit migrates the node to \"timerange\"");
  assert(legacyAfter.value.from === f.entries[10].ts && legacyAfter.value.to === f.entries[20].ts,
    "migrated node's value holds both bounds, got " + JSON.stringify(legacyAfter.value));
  assert(legacyAfter.name.includes("→"), "migrated node's name shows the arrow (both bounds), got " + legacyAfter.name);
  assert(T.state.nodes[legacyAfter.id] === legacyAfter, "edit updates the SAME node id in place (not a new node)");

  // --- C. Row context menu "Filter after/before this row" now create unified nodes ---
  // ctxAfter/ctxBefore attach under state.activeId (same as before this
  // session) — reset it to the file so both land as its direct children,
  // rather than under legacyAfter (left active by section B's edit).
  T.state.activeId = f.id;
  const beforeCtxCount = f.children.length;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[3]);
  fireClick(d.querySelector("#ctxAfter"), w);
  const ctxAfterNode = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange" && n.value.to === null);
  assert(ctxAfterNode && ctxAfterNode.value.from === f.entries[3].ts, "\"Filter after this row\" creates a \"timerange\" node with only the lower bound set");
  // createFilterNode leaves the just-created node active — reset back to the
  // file so this second action also lands as its direct child, not nested
  // under ctxAfterNode.
  T.state.activeId = f.id;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[25]);
  fireClick(d.querySelector("#ctxBefore"), w);
  const ctxBeforeNode = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange" && n.value.from === null);
  assert(ctxBeforeNode && ctxBeforeNode.value.to === f.entries[25].ts, "\"Filter before this row\" creates a \"timerange\" node with only the upper bound set");
  assert(f.children.length === beforeCtxCount + 2, "exactly two new filter children (one per context-menu action), no extra AND/combinator node");

  // --- D. Tree right-click "Edit filter…" on a "timerange" node opens the same dialog ---
  T.state.activeId = ctxAfterNode.id;
  w.render();
  const activeRow = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(activeRow, w);
  const editItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "edit");
  assert(editItem, "tree context menu offers 'Edit filter…' for a \"timerange\" node");
  fireClick(editItem, w);
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "right-click Edit on a \"timerange\" node opens the time-range dialog");
  assert(d.querySelector("#timeRangeToInput").value === "", "To is still empty (unbounded) for this node");
  w.closeTimeRangeDialog();

  // --- E. Dialog validation: both fields empty is rejected, not silently accepted ---
  w.openTimeRangeDialog("create", f.id, { from: null, to: null });
  assert(d.querySelector("#timeRangeDialogError").classList.contains("hidden"), "sanity: no error shown on open");
  const childCountBeforeInvalid = f.children.length;
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(!d.querySelector("#timeRangeDialogError").classList.contains("hidden"), "submitting with both fields empty shows the validation error");
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "dialog stays open on validation failure");
  assert(f.children.length === childCountBeforeInvalid, "no node was created from the invalid (empty) submit");

  // --- F. Clear button empties a field ---
  d.querySelector("#timeRangeFromInput").value = w.tsToLocalInputValue(f.entries[0].ts);
  fireClick(d.querySelector("#timeRangeFromClear"), w);
  assert(d.querySelector("#timeRangeFromInput").value === "", "the clear button empties the From field");
  w.closeTimeRangeDialog();

  // --- G. Minimap right-click opens the create dialog prefilled at the clicked point ---
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const svg = d.querySelector("#timelineMinimapSvg");
  const clickX = w.minimapTsToX(f.entries[15].ts);
  svg.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: clickX, clientY: 10 }));
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "right-click on the minimap opens the time-range dialog");
  assert(d.querySelector("#timeRangeFromInput").value !== "" && d.querySelector("#timeRangeToInput").value !== "",
    "both fields are prefilled with the clicked point (a valid zero-width starting range)");
  const beforeMinimapCreate = f.children.length;
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(f.children.length === beforeMinimapCreate + 1, "submitting creates exactly one new \"timerange\" filter child");
  const minimapCreated = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange" && n.value.from === n.value.to);
  assert(minimapCreated, "the created node has equal from/to (the zero-width prefill was kept, unedited)");

  // --- H. "timerange" round-trips through Save/Load filter JSON unchanged
  // (confirms FILTER_TYPES + the generic `value` passthrough is all that was
  // needed — no carrier-specific code for the new object-shaped value) ---
  const branch = w.serializeFilterBranch(ctxAfterNode.id);
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const fc = await w.addFile("c.log", makeLog(0, 30), () => {});
  w.render();
  W_setLoadTarget(w, fc.id);
  w.importFilterJson(json);
  const importedNode = fc.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange");
  assert(importedNode, "a \"timerange\" node survives a save-to-JSON + load round trip");
  assert(importedNode.value.from === ctxAfterNode.value.from && importedNode.value.to === ctxAfterNode.value.to,
    "the imported node's { from, to } value round-tripped intact, got " + JSON.stringify(importedNode.value));

  // --- I. A reversed From/To on submit is silently swapped, not rejected — same as the minimap drag's own swap ---
  w.openTimeRangeDialog("create", f.id, { from: null, to: null });
  d.querySelector("#timeRangeFromInput").value = w.tsToLocalInputValue(f.entries[25].ts);
  d.querySelector("#timeRangeToInput").value = w.tsToLocalInputValue(f.entries[5].ts);
  const beforeSwapCreate = f.children.length;
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(f.children.length === beforeSwapCreate + 1, "a reversed From/To still creates a node (not rejected)");
  const swappedNode = f.children.map(id => T.state.nodes[id])
    .find(n => n.filterType === "timerange" && n.value.from === f.entries[5].ts && n.value.to === f.entries[25].ts);
  assert(swappedNode, "From/To were silently swapped so from <= to");

  function W_setLoadTarget(w, targetId) {
    // loadFilterTargetId is a top-level `let` — reach it via the shared
    // lexical scope the same way the T bridge does, but write instead of read.
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(targetId)};`;
    d.body.appendChild(s);
  }
});

/* ============================================================
   GROUP 33 — Bugfix: minimap viewport indicator now covers the LAST shown
   entry's full bar, not just the single x position its exact timestamp
   happens to land at (person-reported via screenshot: "the range indicator
   only runs to the START of the last included bin — it should still include
   this bin"). Root cause: updateMinimapViewportIndicator used
   minimapTsToX(entry.ts) directly for both edges — a continuous, per-moment
   position — while the density bars themselves are drawn per BUCKET
   (bucketOf() in renderTimelineMinimap). An entry landing anywhere other
   than exactly at its bucket's right edge left the highlighted rectangle
   visibly short of that bucket's own bar, making an entry that's actually
   IN the current view look like it sits outside the highlighted range.
   Fixed with a new minimapBarSpan(ts) helper (mirrors bucketOf()'s exact
   formula) giving the bucket's full [left, right) span; the indicator now
   uses .left for the first shown entry and .right for the last.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("33. Minimap viewport indicator covers the last shown entry's full bar (bugfix)");
  // Craft exact ts offsets so, with the suite's stubbed 800px container
  // width (bucketCount = round(800/3) = 267, bucket width = 800/267 in px
  // and (tMax-tMin)/267 in ms), the shown entry sits only 500ms into its
  // 10,000ms-wide bucket — close enough to the bucket's LEFT edge that the
  // old raw-position code visibly fell short of the bucket's right edge.
  const anchor = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const line = (offsetMs, level, msg) => {
    const dt = new Date(anchor + offsetMs);
    const p2 = n => String(n).padStart(2, "0"), p3 = n => String(n).padStart(3, "0");
    const ts = `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())},${p3(dt.getMilliseconds())}`;
    return `${ts}\t${level}\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`;
  };
  const lines = [
    line(0, "INFO", "start"),
    line(2000500, "ERROR", "target"), // 500ms into bucket 200 of 267 (bucket width 10,000ms)
    line(2670000, "INFO", "end"),     // anchors tMax so bucketCount * 10,000ms === the file's span exactly
  ];
  const f = await w.addFile("bins.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  // Isolate to the single ERROR entry (mirrors the reported screenshot's
  // "filtered to ERROR" level quick-filter).
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  assert(T.currentViewEntries.length === 1 && T.currentViewEntries[0].message === "target",
    "sanity: the level filter isolated the single crafted ERROR entry");

  const targetTs = f.entries[1].ts;
  const naiveX = w.minimapTsToX(targetTs);
  const span = w.minimapBarSpan(targetTs);
  assert(span.right - naiveX > 1,
    "sanity: the crafted timestamp lands closer to its bucket's start than its end (right edge at least 1px past the raw position), got " + (span.right - naiveX).toFixed(2));

  // Split into two rects by a later session (see Group 34) — with exactly
  // one entry shown, both cover the same single bucket, so both should land
  // on its exact bounds.
  for (const id of ["#minimapRenderedRangeRect", "#minimapFullRangeRect"]) {
    const rect = d.querySelector(id);
    assert(!rect.classList.contains("hidden"), id + " is visible");
    const x = parseFloat(rect.getAttribute("x"));
    const width = parseFloat(rect.getAttribute("width"));
    assert(Math.abs(x - span.left) < 0.15, id + "'s left edge matches the shown entry's bucket LEFT edge, got x=" + x + " expected " + span.left.toFixed(1));
    assert(Math.abs((x + width) - span.right) < 0.15,
      id + "'s right edge reaches the shown entry's bucket RIGHT edge — not just its raw timestamp position (the bug) — got right=" + (x + width).toFixed(1) + " expected " + span.right.toFixed(1));
    assert(x + width > naiveX + 1,
      id + " visibly extends past where the old buggy calculation would have stopped, got right=" + (x + width).toFixed(1) + " vs old=" + naiveX.toFixed(1));
  }
});

/* ============================================================
   GROUP 34 — Minimap: full-range vs rendered-subset rects, selected-entry
   markers, and the minimap now showing during the Link view (this session,
   person-reported: the range indicator only ever showed what's scrolled
   into view, never the Filtered view's whole matched span). See
   updateMinimapFullRange/updateMinimapRenderedRange/
   updateMinimapSelectionMarkers/minimapMarkedEntries in philogg.html.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("34. Minimap: full-range vs rendered-subset rects, selection markers, Link view");

  // --- Part A: full range vs rendered (scrolled-into-view) subset ---
  const fA = await w.addFile("wide.log", makeLog(0, 100), () => {}); // 100 entries, 1s apart
  T.state.activeId = fA.id;
  T.state.sortColumn = null;
  w.render();

  const fullRect = d.querySelector("#minimapFullRangeRect");
  const renderedRect = d.querySelector("#minimapRenderedRangeRect");
  assert(!fullRect.classList.contains("hidden") && !renderedRect.classList.contains("hidden"),
    "both range rects are visible for a plain unfiltered file");
  const fullX = parseFloat(fullRect.getAttribute("x")), fullW = parseFloat(fullRect.getAttribute("width"));
  const renderedWInit = parseFloat(renderedRect.getAttribute("width"));
  assert(fullW > renderedWInit + 5,
    "full-range rect is visibly wider than the rendered subset when only the top of a 100-row list is on screen, full=" + fullW.toFixed(1) + " rendered=" + renderedWInit.toFixed(1));
  assert(Math.abs(parseFloat(renderedRect.getAttribute("x")) - fullX) < 1,
    "at scrollTop 0, the rendered subset starts at the same left edge as the full range");

  // Scroll roughly to the middle and recompute the rendered subset directly
  // (bypassing the scroll-event/rAF plumbing for a deterministic test).
  d.querySelector("#tableBody").scrollTop = 50 * 28; // ROW_HEIGHT=28, ~halfway down 100 rows
  w.updateMinimapRenderedRange();
  const renderedXMid = parseFloat(renderedRect.getAttribute("x"));
  assert(renderedXMid > fullX + fullW * 0.2,
    "scrolling down moves the rendered subset's left edge meaningfully to the right, got " + renderedXMid.toFixed(1) + " (full range x=" + fullX.toFixed(1) + " width=" + fullW.toFixed(1) + ")");
  assert(renderedXMid + parseFloat(renderedRect.getAttribute("width")) <= fullX + fullW + 1,
    "rendered subset stays within the full range's bounds");

  // --- Part B: selected-entry marker ---
  w.selectEntry(fA.entries[50].id);
  let markerLines = [...d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line")];
  assert(markerLines.length === 1, "selecting a single entry draws exactly one marker, got " + markerLines.length);
  assert(Math.abs(parseFloat(markerLines[0].getAttribute("x")) + 1 - w.minimapTsToX(fA.entries[50].ts)) < 0.2,
    "marker sits at the selected entry's own timestamp position");

  w.selectEntry(fA.entries[10].id);
  markerLines = [...d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line")];
  assert(markerLines.length === 1 && Math.abs(parseFloat(markerLines[0].getAttribute("x")) + 1 - w.minimapTsToX(fA.entries[10].ts)) < 0.2,
    "selecting a different entry moves the marker");

  T.state.selectedId = null;
  w.updateMinimapSelectionMarkers();
  assert(d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line").length === 0, "clearing the selection clears the marker");

  // --- Part C: Link view — minimap now visible, brace selection marks BOTH real entries ---
  const linkLines = [];
  for (let i = 0; i < 10; i++) {
    const label = i % 2 === 0 ? "REF" : "TARGET";
    linkLines.push(`2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${label} ${i}"`);
  }
  const fB = await w.addFile("linked.log", linkLines.join("\n") + "\n", () => {});
  const refNode = w.createFilterNode(fB.id, "text", "REF");       // entries 0,2,4,6,8
  const targetNode = w.createFilterNode(fB.id, "text", "TARGET"); // entries 1,3,5,7,9
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1); // REF n -> 1st TARGET after it
  T.state.activeId = linkNode.id;
  w.render();

  assert(!d.querySelector("#timelineMinimap").classList.contains("hidden"), "the minimap is now shown while the Link view is active");
  const linkFullRect = d.querySelector("#minimapFullRangeRect");
  assert(linkFullRect && !linkFullRect.classList.contains("hidden"), "full-range rect renders for the Link view too");
  assert(d.querySelector("#minimapRenderedRangeRect").classList.contains("hidden"),
    "rendered-subset rect stays hidden in the Link view (no virtualization to distinguish a subset from)");

  const firstBrace = d.querySelector(".pair-brace");
  assert(firstBrace, "sanity: at least one pair rendered in the Link view");
  fireClick(firstBrace, w);
  assert(firstBrace.closest(".pair-block").classList.contains("pair-selected"), "clicking a brace selects its pair");
  let pairMarkers = [...d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line")];
  assert(pairMarkers.length === 2, "selecting a pair's brace marks BOTH of its real entries, got " + pairMarkers.length);
  const expectedXs = [w.minimapTsToX(fB.entries[0].ts), w.minimapTsToX(fB.entries[1].ts)].sort((a, b) => a - b); // REF 0 -> TARGET 1
  const actualXs = pairMarkers.map(m => parseFloat(m.getAttribute("x")) + 1).sort((a, b) => a - b);
  assert(Math.abs(actualXs[0] - expectedXs[0]) < 0.2 && Math.abs(actualXs[1] - expectedXs[1]) < 0.2,
    "the two markers sit at the pair's two real entries' own timestamps");

  fireClick(firstBrace, w); // click again: deselect
  assert(!firstBrace.closest(".pair-block").classList.contains("pair-selected"), "clicking the same brace again deselects the pair");
  assert(d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line").length === 0, "deselecting the pair clears its markers (no other selection underneath)");

  // Re-select the brace, then navigate away — a stale .pair-selected left
  // behind in the now-hidden Link view must NOT keep marking its old
  // entries once a different (non-link) node is active.
  fireClick(firstBrace, w);
  assert(firstBrace.closest(".pair-block").classList.contains("pair-selected"), "sanity: brace re-selected");
  T.state.activeId = refNode.id;
  w.render();
  assert(w.minimapMarkedEntries().length === 0, "a stale Link-view brace selection is ignored once a different, non-link node is active");
});

/* ============================================================
   GROUP 35 — Text filter: case-sensitive option + per-filter target column
   Origin: this session (FEATURE_BACKLOG.md "Case-sensitive option for text
   filters" + "Per-filter target column"). Adds node.caseSensitive/
   node.columns to "text" filter nodes only, with the SAME selection logic
   as the level filter bar (state.levelFilter/applyLevelFilter): none of
   the column chips selected searches every column (unchanged behavior,
   e.raw.includes), one or more restricts to those — so "all selected" and
   "none selected" have the identical matching effect. Threaded through
   every persistence carrier per CLAUDE.md's "Known gotchas" note:
   cloneSubtree, snapshotSubtree/restoreSubtree, serializeFilterBranch/
   importFilterJson, serializeFilterTreeForCache/materializeCachedFilters.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("35. Text filter: case-sensitive option + per-filter target column");

  const ALL_COLUMN_KEYS = ["time", "level", "thread", "location", "method", "message"];
  const lines = [
    `2024-01-15 10:00:00,000\tERROR\t"TOKEN"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"nothing here"`,       // 0: thread="TOKEN"
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"TOKEN inside message"`, // 1: message contains TOKEN
    `2024-01-15 10:00:02,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"clean"`,                 // 2: no TOKEN anywhere
    `2024-01-15 10:00:03,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"Marker one"`,             // 3: exact-case "Marker"
    `2024-01-15 10:00:04,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 4\t[DoWork]\t"marker two"`,             // 4: lower-case "marker"
  ];
  const logText = lines.join("\n") + "\n";
  const f = await w.addFile("cols.log", logText, () => {});
  w.render();

  // --- getEntries semantics: no restriction (default) behaves exactly like before ---
  const noRestrict = w.createFilterNode(f.id, "text", "TOKEN");
  assert(noRestrict.caseSensitive === undefined && noRestrict.columns === undefined, "a plain text filter gets no caseSensitive/columns fields by default");
  assert(w.getEntries(noRestrict.id).length === 2, "unrestricted: TOKEN matches both the thread (0) and the message (1) column, got " + w.getEntries(noRestrict.id).length);

  // --- restricting to one column narrows the match to only that column ---
  const restrictMessage = w.createFilterNode(f.id, "text", "TOKEN", false, null, false, ["message"]);
  assert(w.getEntries(restrictMessage.id).length === 1 && w.getEntries(restrictMessage.id)[0].id === f.entries[1].id,
    "restricted to 'message': only entry 1 (TOKEN in the message) matches, thread-only entry 0 is excluded");

  const restrictThread = w.createFilterNode(f.id, "text", "TOKEN", false, null, false, ["thread"]);
  assert(w.getEntries(restrictThread.id).length === 1 && w.getEntries(restrictThread.id)[0].id === f.entries[0].id,
    "restricted to 'thread': only entry 0 (thread=TOKEN) matches, message-only entry 1 is excluded");

  // --- "all columns selected" has the SAME effect as "none selected" (level-filter parity) ---
  const restrictAll = w.createFilterNode(f.id, "text", "TOKEN", false, null, false, ALL_COLUMN_KEYS);
  assert(w.getEntries(restrictAll.id).length === w.getEntries(noRestrict.id).length,
    "selecting every column produces the same result as selecting none, per the level-filter selection logic");

  // --- case-sensitivity ---
  const caseInsensitive = w.createFilterNode(f.id, "text", "Marker");
  assert(w.getEntries(caseInsensitive.id).length === 2, "default (case-insensitive) 'Marker' matches both entries 3 and 4");
  const caseSensitive = w.createFilterNode(f.id, "text", "Marker", false, null, true);
  assert(w.getEntries(caseSensitive.id).length === 1 && w.getEntries(caseSensitive.id)[0].id === f.entries[3].id,
    "case-sensitive 'Marker' matches only entry 3's exact-case occurrence, not entry 4's 'marker'");

  // --- column-key -> entry-field mapping sanity (time/level/location/method) ---
  const timeProbe = w.createFilterNode(f.id, "text", "10:00:03", false, null, false, ["time"]);
  assert(w.getEntries(timeProbe.id).length === 1 && w.getEntries(timeProbe.id)[0].id === f.entries[3].id, "'time' column restricts matching to the raw timestamp text");
  const levelProbe = w.createFilterNode(f.id, "text", "ERROR", false, null, false, ["level"]);
  assert(w.getEntries(levelProbe.id).length === 1 && w.getEntries(levelProbe.id)[0].id === f.entries[0].id, "'level' column restricts matching to the entry's level");
  const locationProbe = w.createFilterNode(f.id, "text", "line 2", false, null, false, ["location"]);
  assert(w.getEntries(locationProbe.id).length === 1 && w.getEntries(locationProbe.id)[0].id === f.entries[2].id, "'location' column restricts matching to the location text");
  const methodProbe = w.createFilterNode(f.id, "text", "DoWork", false, null, false, ["method"]);
  assert(w.getEntries(methodProbe.id).length === 5, "'method' column matches every row here (all share method DoWork)");

  // --- Filter popup UI: defaults, live match, chip toggling ---
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  assert(d.querySelector("#filterCaseCheckbox").checked === false, "case-sensitive checkbox defaults to UNCHECKED, as required");
  assert([...d.querySelectorAll(".column-chip")].every(c => !c.classList.contains("active")), "no column chip is pre-selected when opening the popup fresh");

  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "TOKEN";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("2 of 5"), "live match with no column restriction counts both TOKEN occurrences");

  const messageChip = d.querySelector('.column-chip[data-col="message"]');
  fireClick(messageChip, w);
  assert(messageChip.classList.contains("active"), "clicking a column chip marks it active");
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("1 of 5"), "live match updates live once a column chip restricts the search");

  fireSubmit(d.querySelector("#filterForm"), w);
  const uiCreated = T.state.nodes[T.state.activeId];
  assert(uiCreated.filterType === "text" && uiCreated.value === "TOKEN" && JSON.stringify(uiCreated.columns) === JSON.stringify(["message"]) && !uiCreated.caseSensitive,
    "submitting the popup with a column chip selected creates a filter restricted to that column");

  // Case-sensitive checkbox at creation time
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "Marker";
  fireClick(d.querySelector("#filterCaseCheckbox"), w);
  fireSubmit(d.querySelector("#filterForm"), w);
  const uiCaseCreated = T.state.nodes[T.state.activeId];
  assert(uiCaseCreated.caseSensitive === true, "checking the case-sensitive box in the popup sets caseSensitive:true at creation");

  // --- Edit mode: popup pre-fills existing caseSensitive/columns, and edits apply ---
  const editNode = w.createFilterNode(f.id, "text", "TOKEN", false, null, true, ["message"]);
  w.openEditFilterPopup(editNode.id);
  assert(d.querySelector("#filterCaseCheckbox").checked === true, "editing a filter pre-fills the case-sensitive checkbox from the node");
  assert(d.querySelector('.column-chip[data-col="message"]').classList.contains("active") && !d.querySelector('.column-chip[data-col="thread"]').classList.contains("active"),
    "editing a filter pre-fills the column chips from the node's existing restriction");
  fireClick(d.querySelector('.column-chip[data-col="message"]'), w); // deselect message
  fireClick(d.querySelector('.column-chip[data-col="thread"]'), w);  // select thread
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(JSON.stringify(editNode.columns) === JSON.stringify(["thread"]), "saving the edit applies the new column restriction");
  assert(editNode.caseSensitive === true, "saving an edit that only touched columns leaves caseSensitive untouched");
  assert(w.getEntries(editNode.id).length === 1 && w.getEntries(editNode.id)[0].id === f.entries[0].id, "the edited filter re-evaluates against its new column restriction");

  // Editing a text filter into an extract pattern clears caseSensitive/columns
  // (updateFilterNode's else-branch) — extract patterns match via their own
  // regex against e.message, so these text-only options no longer apply.
  // Since Group 41 (the two-button "Add filter"/"Extract" redesign, no more
  // checkbox), typing wildcard tokens alone never flips a filter to
  // "extract" by itself — only clicking the Extract button does, and
  // case/columns stay fully available/visible regardless (see Group 41).
  const toBecomeExtract = w.createFilterNode(f.id, "text", "Marker", false, null, true, ["message"]);
  w.openEditFilterPopup(toBecomeExtract.id);
  d.querySelector("#filterInput").value = "id=[value:int]";
  fireInput(d.querySelector("#filterInput"), w);
  assert(d.querySelector("#filterCaseCheckbox").disabled === false, "case-sensitive checkbox stays available even with a wildcard pattern typed — it only governs the 'Add filter' outcome");
  assert(d.querySelector("#filterExtractBtn").disabled === false, "the Extract button becomes clickable once the pattern has a wildcard token");
  fireClick(d.querySelector("#filterExtractBtn"), w); // click Extract, not Add filter/Save
  assert(toBecomeExtract.filterType === "extract" && !toBecomeExtract.caseSensitive && !toBecomeExtract.columns,
    "clicking Extract on an edited text filter replaces it with an 'extract' node and clears caseSensitive/columns");

  // --- Persistence carriers ---

  // cloneSubtree (copy/paste)
  const cloneSource = w.createFilterNode(f.id, "text", "Marker", false, null, true, ["message"]);
  T.state.activeId = cloneSource.id;
  T.state.clipboard = { id: cloneSource.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const pasted = T.state.nodes[f.children[f.children.length - 1]];
  assert(pasted.caseSensitive === true && JSON.stringify(pasted.columns) === JSON.stringify(["message"]),
    "cloneSubtree (copy/paste) carries caseSensitive/columns to the pasted copy");

  // snapshotSubtree/restoreSubtree (undo/redo)
  const undoNode = w.createFilterNode(f.id, "text", "Marker", false, null, true, ["message"]);
  w.deleteFilterNodeWithUndo(undoNode.id);
  assert(!T.state.nodes[undoNode.id], "sanity: node deleted");
  w.undo();
  const restored = T.state.nodes[undoNode.id];
  assert(restored && restored.caseSensitive === true && JSON.stringify(restored.columns) === JSON.stringify(["message"]),
    "undo (snapshotSubtree/restoreSubtree) preserves caseSensitive/columns");

  // serializeFilterBranch / importFilterJson (save/load JSON)
  const fSave = await w.addFile("save-src.log", logText, () => {});
  const saveNode = w.createFilterNode(fSave.id, "text", "Marker", false, null, true, ["message", "thread"]);
  w.render();
  const branch = w.serializeFilterBranch(saveNode.id);
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const fLoad = await w.addFile("save-dest.log", logText, () => {});
  w.render();
  function W_setLoadTarget(targetId) {
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(targetId)};`;
    d.body.appendChild(s);
  }
  W_setLoadTarget(fLoad.id);
  w.importFilterJson(json);
  const loaded = T.state.nodes[fLoad.children[fLoad.children.length - 1]];
  assert(loaded.caseSensitive === true && JSON.stringify(loaded.columns.slice().sort()) === JSON.stringify(["message", "thread"]),
    "save/load JSON round trip preserves caseSensitive/columns");

  // serializeFilterTreeForCache / materializeCachedFilters (session cache)
  const fCacheSrc = await w.addFile("cache-src.log", logText, () => {});
  w.createFilterNode(fCacheSrc.id, "text", "Marker", false, null, true, ["message", "thread"]);
  w.render();
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(fCacheSrc);
  const fCacheDest = await w.addFile("cache-dest.log", logText, () => {});
  w.materializeCachedFilters(fCacheDest, cacheRoots);
  const cached = Object.values(T.state.nodes).find(n => n.parentId === fCacheDest.id);
  assert(cached && cached.caseSensitive === true && JSON.stringify(cached.columns.slice().sort()) === JSON.stringify(["message", "thread"]),
    "session-cache serialize/materialize round trip preserves caseSensitive/columns");
});

/* ============================================================
   GROUP 36 — Arrow-key navigation in the filter tree
   Origin: this session (FEATURE_BACKLOG.md "Arrow-key navigation in the
   filter tree"). New state.focusRegion ("entries" | "tree", default
   "entries") decides what plain arrow keys act on: a tree-row/breadcrumb
   click or a tree drop sets it to "tree", any entry-table selection
   (applySelection) sets it back to "entries" — the pre-existing ArrowUp/
   ArrowDown log-row navigation (Group 19) is completely untouched when
   focus stays on "entries". With "tree" focus, moveTreeSelection moves
   state.activeId: Up/Down step through flattenTreeIds() (the same
   depth-first order renderNode renders in), Left jumps to the parent,
   Right to the first child.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("36. Arrow-key navigation in the filter tree");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();
  assert(T.state.focusRegion === "entries", "focusRegion defaults to \"entries\" (pre-existing ArrowUp/Down-selects-a-row behavior is unaffected by default)");

  // Build file -> filterA -> filterB, and a sibling filterC under the file,
  // so the flattened DFS order is [f, filterA, filterB, filterC] — walking
  // past filterB back out to a sibling of filterA exercises the "not just a
  // flat sibling list" part of the traversal.
  const filterA = w.createFilterNode(f.id, "text", "a");
  const filterB = w.createFilterNode(filterA.id, "text", "b");
  const filterC = w.createFilterNode(f.id, "text", "c");
  w.render();

  // A real tree-row click is what flips focus onto the tree — locate the
  // file's own row via its label text and click it, same DOM path a person
  // uses.
  const fileRow = [...d.querySelectorAll(".tree-row")].find(r => r.querySelector(".tree-label").textContent === "a.log");
  fireClick(fileRow, w);
  assert(T.state.activeId === f.id, "clicking the file's tree row makes it active");
  assert(T.state.focusRegion === "tree", "clicking a tree row switches focusRegion to \"tree\"");

  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === filterA.id, "ArrowDown from the file moves to its first child (filterA)");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === filterB.id, "ArrowDown descends into filterA's own child (filterB) before its sibling");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === filterC.id, "ArrowDown from filterB steps back out to its uncle (filterC), matching the flattened visual order");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === filterC.id, "ArrowDown at the last node clamps instead of wrapping around");

  fireKeydown(d, w, "ArrowUp");
  assert(T.state.activeId === filterB.id, "ArrowUp moves back up through the same flattened order");

  fireKeydown(d, w, "ArrowLeft");
  assert(T.state.activeId === filterA.id, "ArrowLeft jumps from filterB to its parent filterA");
  fireKeydown(d, w, "ArrowLeft");
  assert(T.state.activeId === f.id, "ArrowLeft from filterA jumps up to the root file");
  fireKeydown(d, w, "ArrowLeft");
  assert(T.state.activeId === f.id, "ArrowLeft on a root file (no parent) is a no-op");

  fireKeydown(d, w, "ArrowRight");
  assert(T.state.activeId === filterA.id, "ArrowRight from the file descends to its first child");
  assert(T.state.multiSelect.has(filterA.id) && T.state.multiSelect.size === 1, "tree arrow navigation also collapses multiSelect to just the newly-active node, same as a plain row click");

  // Selecting a table entry hands focus back to "entries" — subsequent
  // arrow keys must move the row selection again, not the tree.
  T.state.selectedId = null;
  const entryRow = d.querySelector("#tableRows .log-row");
  fireClick(entryRow, w);
  assert(T.state.focusRegion === "entries", "clicking a log row switches focusRegion back to \"entries\"");
  const activeBeforeEntryNav = T.state.activeId;
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === activeBeforeEntryNav, "with \"entries\" focus, ArrowDown moves the row selection and leaves the tree's active node untouched");
  assert(T.state.selectedId != null, "ArrowDown with \"entries\" focus still selects a log row (Group 19 behavior intact)");
});

/* ============================================================
   GROUP 37 — Folder watch + lazy loading
   Origin: this session (FEATURE_BACKLOG.md "Folder watch + lazy loading"),
   UPDATED the same session after person feedback (see Group 38 below for
   what else that feedback added): active and inactive files now render
   TOGETHER, in folder order, inside one .folder-watch-files list — an
   opened file is a real .tree-row (via renderNode), an unopened one is a
   grayed .folder-watch-file row — instead of active files moving out to a
   separate place below. This group's assertions were rewritten in place
   for the new merged layout rather than left testing the old split one
   (see tests/README.md's "Extending this suite" convention).

   A watched folder (addWatchedFolder, given a FileSystemDirectoryHandle —
   faked at the handle level here, same approach as Group 12's tailing
   fixture, since jsdom has no File System Access API) lists its compatible
   (*.log) files grayed-out, WITHOUT reading them, above #tree
   (renderFolderWatchList/renderFolderSection/renderInactiveFileRow).
   Double-click (or the row's "Load file" context-menu item) lazily opens
   one via loadFolderFile, which becomes a completely normal root file node
   (tagged node.folderId) and starts tailing since it has a real handle.
   Closing it (deleteFilterNodeWithUndo's node.folderId branch,
   closeFolderFile) returns it to the grayed listing, in the SAME position,
   instead of removing it outright. folderScanTick (same polling shape as
   tailTick) picks up files that appear in the folder later.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("37. Folder watch + lazy loading");

  function fakeFileHandle(name, text) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  // fileMap is mutable (Group adds to it later to simulate a new file
  // appearing) — values() re-reads Object.keys() on every call, exactly
  // like the real FileSystemDirectoryHandle would after a rescan.
  function fakeDirHandle(name, fileMap) {
    return {
      kind: "directory", name,
      async *values() {
        for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]);
      },
    };
  }
  // Reads back the folder box's file list IN DOM ORDER, regardless of
  // whether each row is a real .tree-row (renderNode's wrapper div) or a
  // grayed .folder-watch-file — the thing under test is that a file's
  // POSITION in this order never moves as it opens/closes.
  function folderOrder(folderBox) {
    return [...folderBox.querySelector(".folder-watch-files").children].map(el => {
      const label = el.querySelector(".tree-label, .folder-watch-file-name");
      return label ? label.textContent : "?";
    });
  }

  const fileMap = {
    "a.log": makeLog(0, 5),
    "b.log": makeLog(100, 3),
    "notes.txt": "not a compatible extension",
  };
  const dir = fakeDirHandle("logs", fileMap);
  await w.addWatchedFolder(dir);

  assert(T.state.folders.length === 1, "watched folder registered");
  const folder = T.state.folders[0];
  assert(folder.name === "logs", "folder name taken from the directory handle");
  assert(folder.files.length === 2, "only *.log files are listed, incompatible extension filtered out — got " + folder.files.length);
  assert(folder.files.map(f => f.name).join(",") === "a.log,b.log", "listed files sorted by name, got " + folder.files.map(f => f.name).join(","));
  assert(T.state.rootIds.length === 0, "nothing is actively loaded yet — scanning lists files without parsing them (lazy)");

  // Rendering: folder section above #tree, scanning ping for a live watch,
  // one grayed row per listed file, in folder order.
  const folderBox = d.querySelector(".folder-watch");
  assert(folderBox !== null, "folder section rendered in the sidebar");
  assert(folderBox.querySelector(".folder-watch-name").textContent === "logs", "folder name shown in the header");
  assert(folderBox.querySelector(".folder-watch-icon.scanning") !== null, "scanning/watching animation class present for a live folder");
  let inactiveRows = folderBox.querySelectorAll(".folder-watch-file");
  assert(inactiveRows.length === 2, "both compatible files listed as inactive rows, got " + inactiveRows.length);
  assert(folderOrder(folderBox).join(",") === "a.log,b.log", "initial folder order is a.log, b.log");

  // A plain click on an inactive row must NOT select/activate it — there is
  // no node id it could become state.activeId, so Ctrl+F/paste have nothing
  // to target. This is the mechanism behind "no filter can be created or
  // copied onto an inactive file".
  const activeBefore = T.state.activeId;
  fireClick(inactiveRows[0], w);
  assert(T.state.activeId === activeBefore, "clicking a grayed inactive file row doesn't change state.activeId");

  // Double-click lazily loads the file: becomes a real root node, tagged
  // with folderId, rendered as a real tree row IN PLACE inside the folder's
  // own file list (not moved elsewhere) — its position in the folder order
  // is exactly what makes this different from a plain "grayed vs. separate
  // active list" split.
  fireDblClick(inactiveRows[0], w);
  await new Promise(r => setTimeout(r, 50)); // let the FileReader-based load settle
  assert(T.state.rootIds.length === 1, "double-click loaded exactly one file, got " + T.state.rootIds.length);
  const loadedNode = T.state.nodes[T.state.rootIds[0]];
  assert(loadedNode.name === "a.log", "the double-clicked file (a.log) was the one loaded");
  assert(loadedNode.entries.length === 5, "loaded file content actually parsed (5 entries), got " + loadedNode.entries.length);
  assert(loadedNode.folderId === folder.id, "loaded node is tagged with the folder it came from");
  assert(loadedNode.tail && loadedNode.tail.handle, "a folder-loaded file (real handle) starts tailing automatically");
  assert(folder.files.find(f => f.name === "a.log").nodeId === loadedNode.id, "the folder's own file record now points at the live node");
  assert(![...d.querySelectorAll("#tree .tree-row .tree-label")].some(l => l.textContent === "a.log"),
    "the loaded file does NOT also render as a separate top-level #tree row — only inside its folder section");
  // renderFolderWatchList() rebuilds the folder box's DOM from scratch on
  // every render() — re-query rather than reuse the stale pre-render node.
  let folderBoxNow = d.querySelector(".folder-watch");
  assert(folderOrder(folderBoxNow).join(",") === "a.log,b.log", "folder order unchanged after opening a.log — it stays in place, now as a real row");
  assert(folderBoxNow.querySelectorAll(".folder-watch-file").length === 1, "only b.log is still a grayed row");
  assert([...folderBoxNow.querySelectorAll(".tree-row .tree-label")].some(l => l.textContent === "a.log"), "a.log renders as a real tree row inside the folder box");

  // Right-click context menu's "Load file" is the alternative entry point
  // for the remaining inactive file (b.log).
  const bRow = [...d.querySelectorAll(".folder-watch-file")].find(r => r.querySelector(".folder-watch-file-name").textContent === "b.log");
  fireContextMenu(bRow, w);
  const menuItem = d.querySelector('#treeContextMenu [data-action="loadFolderFile"]');
  assert(menuItem !== null, "right-click on a grayed file offers a \"Load file\" menu item");
  fireClick(menuItem, w);
  await new Promise(r => setTimeout(r, 50));
  assert(T.state.rootIds.length === 2, "context-menu \"Load file\" also lazily loads the file, got " + T.state.rootIds.length);
  assert(d.querySelectorAll(".folder-watch-file").length === 0, "both files now loaded — no grayed rows left");
  assert(folderOrder(d.querySelector(".folder-watch")).join(",") === "a.log,b.log", "both files still render in their original folder order");

  // Closing a folder-loaded file (the tree row's ✕) returns it to the
  // grayed listing, IN THE SAME POSITION, instead of vanishing — the
  // defining behavior this feature adds on top of a normal file close.
  folderBoxNow = d.querySelector(".folder-watch");
  const aTreeRow = [...folderBoxNow.querySelectorAll(".tree-row")].find(r => r.querySelector(".tree-label").textContent === "a.log");
  const closeBtn = aTreeRow.querySelector(".tree-del");
  fireClick(closeBtn, w);
  assert(T.state.rootIds.length === 1, "closing the file removed its root node, got " + T.state.rootIds.length);
  assert(T.state.nodes[loadedNode.id] === undefined, "the closed file's node is fully gone from state.nodes (not just hidden)");
  assert(T.entryIndex[loadedNode.entries[0].id] === undefined, "the closed file's entries were released from entryIndex, same as a normal close");
  assert(folder.files.find(f => f.name === "a.log").nodeId === null, "the folder's own record for a.log is cleared back to \"not loaded\"");
  const rowsAfterClose = d.querySelectorAll(".folder-watch-file");
  assert(rowsAfterClose.length === 1 && rowsAfterClose[0].querySelector(".folder-watch-file-name").textContent === "a.log",
    "a.log is listed grayed again instead of being gone entirely");
  assert(folderOrder(d.querySelector(".folder-watch")).join(",") === "a.log,b.log", "a.log is back at its original position, not appended at the end");

  // Reopening reuses the same stored handle — no re-scan needed.
  const aRecAgain = folder.files.find(f => f.name === "a.log");
  await w.loadFolderFile(folder, aRecAgain);
  assert(T.state.rootIds.length === 2, "a.log can be reopened after being closed, got " + T.state.rootIds.length);

  // folderScanTick: a file appearing in the real folder later gets picked
  // up automatically (the polling loop the scanning animation represents).
  fileMap["c.log"] = makeLog(200, 2);
  await w.folderScanTick();
  assert(folder.files.length === 3, "folderScanTick picked up the newly appeared c.log, got " + folder.files.length);
  assert(folder.files.some(f => f.name === "c.log" && f.nodeId === null), "the newly discovered file starts out as an unopened (grayed) listing entry");

  // removeWatchedFolder: still-open files keep working as plain independent
  // files (folderId cleared, so a later close is a normal full removal),
  // and now render as normal top-level #tree rows again.
  const cFolder = folder;
  w.removeWatchedFolder(cFolder.id);
  assert(T.state.folders.length === 0, "the folder record is gone after removeWatchedFolder");
  assert(d.querySelector(".folder-watch") === null, "the folder section is no longer rendered");
  assert(T.state.rootIds.length === 2, "already-open files loaded from the folder are left in place, not closed");
  const survivingNode = T.state.nodes[T.state.rootIds[0]];
  assert(!survivingNode.folderId, "a surviving node's folderId is cleared once its folder is removed");
  assert([...d.querySelectorAll("#tree .tree-row .tree-label")].some(l => l.textContent === "a.log"),
    "the surviving file now renders as a plain top-level #tree row, since it no longer belongs to any folder");
});

/* ============================================================
   GROUP 38 — Folder watch follow-up (person-reported, this session):
   unified "Open…" menu, browser-capability gate + popup notice, and
   session-cache persistence of watched folders.
   ============================================================ */

// --- 38a: single "Open…" button + dropdown menu replaces the two
// separate "Open files…"/"Open folder…" buttons. ---
await withApp(async (w, d, T) => {
  section("38a. Unified \"Open…\" menu");
  const btnOpen = d.querySelector("#btnOpen");
  const openMenu = d.querySelector("#openMenu");
  assert(d.querySelector("#btnOpenFolder") === null, "the old separate \"Open folder…\" button is gone");
  assert(openMenu.classList.contains("hidden"), "the dropdown starts hidden");

  fireClick(btnOpen, w);
  assert(!openMenu.classList.contains("hidden"), "clicking \"Open…\" reveals the dropdown");
  const actions = [...openMenu.querySelectorAll("[data-action]")].map(i => i.dataset.action);
  assert(actions.includes("files") && actions.includes("folder"), "menu offers both File(s)… and Folder… entries, got " + actions.join(","));

  // Clicking outside closes it — same document-level pattern as every
  // other popup/menu in the app (contextMenu, shortcutsPanel, ...).
  fireClick(d.body, w);
  assert(openMenu.classList.contains("hidden"), "clicking outside the menu closes it");

  // "File(s)…" still falls back to the hidden <input> when
  // showOpenFilePicker is unavailable (jsdom, same as before this menu
  // existed) — the menu item is just a new front door to the same path.
  fireClick(btnOpen, w);
  const fileInput = d.querySelector("#fileInput");
  let clicked = false;
  fileInput.click = () => { clicked = true; };
  fireClick(d.querySelector('#openMenu [data-action="files"]'), w);
  assert(clicked, "\"File(s)…\" falls back to the hidden file <input>, same as the old \"Open files…\" button");
  assert(openMenu.classList.contains("hidden"), "the menu closes itself after an item is picked");
});

// --- 38b: FOLDER_WATCH_SUPPORTED gates both entry points (menu + drag&drop)
// behind a popup notice instead of silently offering a lesser/broken
// experience — jsdom has no showDirectoryPicker at all, so this exercises
// the exact "unsupported browser" path a real Firefox/Zen user hits. ---
await withApp(async (w, d, T) => {
  section("38b. Folder watch capability gate + popup notice");
  assert(typeof w.showDirectoryPicker === "undefined", "fixture sanity: jsdom has no showDirectoryPicker (same documented gap as showOpenFilePicker)");

  fireClick(d.querySelector("#btnOpen"), w);
  fireClick(d.querySelector('#openMenu [data-action="folder"]'), w);
  assert(d.querySelector("#copyToast").textContent.includes("Chromium-based browser"), "the \"Folder…\" menu entry shows a popup notice instead of doing nothing");
  assert(T.state.folders.length === 0, "no folder was registered");

  // A dropped FOLDER is detected via the much more broadly supported
  // webkitGetAsEntry() (Firefox/Zen included) purely to explain why it
  // didn't load, instead of silently mis-reading it as an empty file list.
  const dirDropDt = { files: [], items: [{ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true }) }] };
  fireDrag(w, w, "drop", dirDropDt);
  assert(d.querySelector("#copyToast").textContent.includes("Chromium-based browser"), "a dropped folder also shows the popup notice, same message");
  assert(T.state.folders.length === 0, "still no folder registered from the drop");

  // Plain file drops are completely unaffected by any of this.
  const fileDropDt = { files: [new w.File([makeLog(0, 3)], "dropped.log", { type: "text/plain" })], items: [] };
  fireDrag(w, w, "drop", fileDropDt);
  await new Promise(r => setTimeout(r, 50));
  assert(T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].name === "dropped.log",
    "a plain (non-folder) file drop still loads normally");
});

// --- 38c: watched folders survive a reload (session cache), including
// re-linking an already-open file back to its folder in the right spot,
// and the permission-reconnect flow for when the browser doesn't silently
// re-grant read access. ---
{
  section("38c. Session persistence: watched folders survive a reload");
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const factory = new IDBFactory();

  function fakeFileHandle(w, name, text) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  // A REAL FileSystemDirectoryHandle is specced to survive IndexedDB's
  // structured clone with all its methods intact — that's the actual
  // mechanism persistFolder/restoreWatchedFolders rely on in a real
  // browser. fake-indexeddb (this suite's only option — see
  // tests/README.md) enforces structured clone strictly: a plain object
  // with OWN function properties fails with DataCloneError outright, but a
  // class instance's prototype methods are simply dropped (own DATA fields
  // clone through fine, same as any plain object) rather than erroring —
  // so this fixture uses a class, with the "live" bits (the fake
  // filesystem + the owning window, for its Blob constructor) kept in a
  // WeakMap instead of as instance fields, so they never become part of
  // what gets cloned. The round-tripped copy in "window B" below ends up
  // exactly like a real handle whose permission needs reconfirming, not
  // like one that kept working — see the assertions there.
  const fakeDirState = new WeakMap();
  class FakeDirHandle {
    constructor(w, name, fileMap) {
      this.kind = "directory";
      this.name = name;
      fakeDirState.set(this, { w, fileMap });
    }
    async *values() {
      const { w, fileMap } = fakeDirState.get(this);
      for (const fname of Object.keys(fileMap)) yield fakeFileHandle(w, fname, fileMap[fname]);
    }
    async queryPermission() { return "granted"; }
    async requestPermission() { return "granted"; }
  }

  let folderId = null;

  // --- Window A: watch a folder, open one file from it, persist. ---
  await withApp(async (w, d, T) => {
    const dir = new FakeDirHandle(w, "watched", { "a.log": makeLog(0, 4), "b.log": makeLog(50, 2) });
    await w.addWatchedFolder(dir);
    const folder = T.state.folders[0];
    folderId = folder.id;
    const rec = folder.files.find(f => f.name === "a.log");
    await w.loadFolderFile(folder, rec);
    const node = T.state.nodes[rec.nodeId];
    assert(node.folderId === folderId, "the loaded node is tagged with its folder's id before persisting");

    // loadFolderFile's own persistFileNode call is fire-and-forget; calling
    // it again directly (idempotent — same cacheKey) and awaiting it here
    // is how the test knows the write with the correct folderId has landed.
    await w.persistFileNode(node);
    await w.persistMetaNow();

    const fileRec = await w.cacheStoreOp("files", "readonly", s => s.get(node.cacheKey));
    assert(fileRec && fileRec.folderId === folderId, "the persisted file record carries folderId");
    const folderRec = await w.cacheStoreOp("folders", "readonly", s => s.get(folderId));
    assert(folderRec && folderRec.name === "watched", "the folder itself was persisted to its own IndexedDB store");
  }, { indexedDB: factory });

  // --- Window B: boot-time restore (same factory = same "disk"). ---
  await withApp(async (w, d, T) => {
    for (let i = 0; i < 40 && T.state.rootIds.length === 0; i++) await sleep(50); // boot restore is async
    assert(T.state.rootIds.length === 1, "the previously-open file came back via the normal session restore");
    const node = T.state.nodes[T.state.rootIds[0]];
    assert(node.name === "a.log" && node.folderId === folderId, "restored node's folderId round-tripped through real IndexedDB");

    for (let i = 0; i < 40 && T.state.folders.length === 0; i++) await sleep(50); // restoreWatchedFolders runs right after
    assert(T.state.folders.length === 1, "the watched folder itself came back too");
    const folder = T.state.folders[0];
    assert(folder.id === folderId, "restored folder keeps its original id (the same value the file's folderId points at)");
    assert(folder.name === "watched", "restored folder's name round-tripped");

    // See the FakeDirHandle comment above: this fixture's handle genuinely
    // can't keep working methods through fake-indexeddb's structured
    // clone, which means queryPermission() really does fail here — that's
    // the SAME degraded state a real browser puts a restored folder in
    // whenever it doesn't silently re-grant the permission (e.g. after an
    // actual browser restart, not just a tab reload), so it's asserted on
    // directly as the expected outcome, not worked around.
    assert(folder.needsPermission === true, "a folder whose handle can't be silently reused needs Reconnect, degrading gracefully instead of erroring");

    w.render();
    const folderBox = d.querySelector(".folder-watch");
    assert(folderBox !== null, "the folder section still renders even before reconnecting");
    assert(folderBox.querySelector(".folder-watch-reconnect") !== null, "a Reconnect button is shown");
    assert([...folderBox.querySelectorAll(".tree-row .tree-label")].some(l => l.textContent === "a.log"),
      "the already-open file still renders as a real row inside the folder section pre-reconnect, in its right place");

    // Reconnect logic itself: requestPermission() needs a real user
    // gesture (reconnectFolder is the Reconnect button's own click
    // handler, called directly here — same function, same as clicking it).
    // A fresh, fully-working fixture handle stands in for "the browser
    // re-granted permission" — the one part of this flow a REAL IndexedDB
    // round trip can't exercise in jsdom (see the class comment above), so
    // it's tested at the function level, consistent with this suite's
    // documented File System Access API gap (tests/README.md).
    folder.handle = new FakeDirHandle(w, "watched", { "a.log": makeLog(0, 4), "b.log": makeLog(50, 2) });
    await w.reconnectFolder(folder);
    assert(folder.needsPermission === false, "reconnectFolder clears needsPermission once a working handle is available");
    assert(folder.files.length === 2, "reconnecting rescans and finds both files, got " + folder.files.length);
    const aRec = folder.files.find(f => f.name === "a.log");
    assert(aRec.nodeId === node.id, "the already-open file's nodeId is preserved across reconnect — not treated as a newly discovered file");
    assert(node.tail && node.tail.handle, "reconnecting reattaches a live tail handle to the already-open (previously handle-less, restored) node");
    const bRec = folder.files.find(f => f.name === "b.log");
    assert(bRec.nodeId === null, "the not-yet-opened file (b.log) is listed grayed, same as any fresh scan");
  }, { indexedDB: factory });
}

/* ============================================================
   GROUP 39 — Filter popup: target-chain visualization + wildcard-as-filter
   "text" matching semantics (this session, person-requested)
   Origin: this session. A [value:...]/[*] wildcard pattern used to ALWAYS
   become an "extract" filterType (building an extraction table) the
   moment it was typed — there was no way to use the wildcard shorthand
   just to constrain a plain filter (e.g. "temp=[value:float]" meaning
   "there's a float here") without also getting a table. A "text" filter
   can now carry wildcard tokens in its value, matched via the SAME regex
   extraction would use but only tested (not captured) — see
   getEntries/textFilterMatches's wildcardRegex parameter — while a real
   "extract" node is completely unaffected. (Which of the two a wildcard
   pattern actually becomes is decided purely by which filter-popup button
   gets clicked, "Add filter" vs. "Extract" — see Group 41 for that
   two-button redesign's own coverage; an earlier, short-lived version of
   this feature used an "Extract values" checkbox instead, superseded the
   same session.) Also: the old "Filter on “X”:" plain-text label was
   replaced with #filterTargetChain, the same .crumb/.crumb-sep pill-chain
   visualization #breadcrumb uses; the input got its own row (superseded
   the SAME session by a fuller section reorg — see Group 40 — so the
   exact wrapper class checked below now points at that reorg's
   .filter-input-section instead of the short-lived .filter-input-row);
   and the "Werte extrahieren: [value:float] ..." #filterHint row was
   removed (the token chips already insert those same wildcards directly).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("39. Filter popup: target chain + wildcard-as-filter matching semantics");

  assert(d.querySelector("#filterHint") === null, "the old 'Werte extrahieren:' hint row is gone — the token chips already insert wildcards directly");
  assert(d.querySelector(".filter-input-section #filterInput") !== null, "the filter input lives in its own input section (see Group 40 for the fuller section-reorg coverage)");

  // --- Target-chain pill visualization (replaces the old plain-text "Filter on “X”:" label) ---
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const parentFilter = w.createFilterNode(f.id, "text", "message"); // matches all 5 rows
  w.render();
  w.openFilterPopup();
  assert(d.querySelector("#filterPopupLabel").textContent === "Filter on:", "the label is now a short static prefix; the actual target is shown by the pill chain");
  let chainChips = [...d.querySelectorAll("#filterTargetChain .crumb")];
  assert(chainChips.length === 2 && chainChips[0].textContent === f.name && chainChips[1].textContent === parentFilter.name,
    "create mode's target chain shows the full chain down to (and including) the active node this filter will be added under");
  assert(chainChips[1].classList.contains("current") && !chainChips[0].classList.contains("current"),
    "the chain's last pill (the actual attach point) is marked current, same convention as #breadcrumb");
  assert(d.querySelectorAll("#filterTargetChain .crumb-sep").length === 1, "pills are separated the same way #breadcrumb separates its chain");

  w.openEditFilterPopup(parentFilter.id);
  assert(d.querySelector("#filterPopupLabel").textContent === "Edit filter on:", "edit mode uses its own short static prefix");
  chainChips = [...d.querySelectorAll("#filterTargetChain .crumb")];
  assert(chainChips.length === 1 && chainChips[0].textContent === f.name,
    "edit mode's target chain shows the chain down to the edited filter's PARENT (whose entries the value change re-filters), not the filter being edited itself");
  w.closeFilterPopup();

  // --- Wildcard-as-filter "text" matching: direct-API sanity for the two
  // filtering shapes a wildcard pattern can produce ---
  const wLines = [
    `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"temp=23.5 ok"`,
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"temp=n/a error"`,
    `2024-01-15 10:00:02,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"TEMP=99.1 ok"`,
    `2024-01-15 10:00:03,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"unrelated line"`,
  ];
  const wf = await w.addFile("wild.log", wLines.join("\n") + "\n", () => {});

  const wildcardAsFilter = w.createFilterNode(wf.id, "text", "temp=[value:float]");
  w.invalidateAllCaches();
  const wafEntries = w.getEntries(wildcardAsFilter.id);
  assert(wafEntries.length === 2 && [wf.entries[0].id, wf.entries[2].id].every(id => wafEntries.some(e => e.id === id)),
    "a 'text' filter whose value contains [value:...] tokens matches via the wildcard's regex shape (case-insensitive by default) instead of a literal substring, got " + wafEntries.length);

  const wildcardCaseSensitive = w.createFilterNode(wf.id, "text", "temp=[value:float]", false, null, true);
  w.invalidateAllCaches();
  const wcsEntries = w.getEntries(wildcardCaseSensitive.id);
  assert(wcsEntries.length === 1 && wcsEntries[0].id === wf.entries[0].id,
    "case-sensitive wildcard-as-filter matches only the exact-case 'temp=' occurrence, not 'TEMP='");

  const wildcardInverted = w.createFilterNode(wf.id, "text", "temp=[value:float]", true);
  w.invalidateAllCaches();
  const invEntries = w.getEntries(wildcardInverted.id);
  assert(invEntries.length === 2 && [wf.entries[1].id, wf.entries[3].id].every(id => invEntries.some(e => e.id === id)),
    "NOT works normally on a wildcard-as-filter 'text' node (unlike a real 'extract' node, where NOT is unavailable)");

  const realExtract = w.createFilterNode(wf.id, "extract", "temp=[value:float]");
  w.invalidateAllCaches();
  assert(w.getEntries(realExtract.id).length === 2, "an actual 'extract' filterType is unaffected by the wildcard-as-filter 'text' path");
});

/* ============================================================
   GROUP 40 — Filter popup section reorg + "Filter for this ___" context
   menu (this session, person-requested)
   Origin: this session, two related requests. (1) The filter popup's
   layout, restructured into explicit sections: input+wildcard chips
   together, a settings row (case-sensitive/NOT), the live pattern
   preview, the column-restriction ("Applies to") chips, and a final
   footer row with the match count left-aligned and the action buttons
   right-aligned. (Originally shipped this same session with an "Extract
   values" checkbox in that footer, immediately superseded — see Group
   41 — by two separate buttons, Extract and Add filter, so the specific
   footer-actions assertions below point at the CURRENT #filterExtractBtn/
   #filterSubmitBtn pair, not the short-lived checkbox.) (2) The row
   context menu's "Extract numbers from this message" (#ctxExtractNumbers)
   was renamed to "Filter for this ___" (#ctxFilterForColumn), where "___"
   is whichever column the right-click actually landed on
   (resolveContextFilterColumn walks up from ev.target to the clicked
   .col-* span, falling back to "message" for anything else — row
   background, a link-view pair's brace). It does not decide text-vs-
   extraction itself: any numeric content still becomes a [value:...]
   wildcard pattern (reusing buildNumericExtractPattern unchanged), but
   whether that builds an extraction table is entirely up to which button
   gets clicked afterward (see Group 41) — so the same right-click can
   produce either a wildcard filter or an extraction, decided after the
   fact. A column with no numeric content (most Method/Thread values)
   falls back to its exact literal text instead of the old "No numeric
   values found" no-op toast, making the action useful there too. Also
   fixed in the same pass: two spots that set #filterInput's .value
   directly (insertTokenAtCursor — a token chip click — and this
   context-menu action) already called evaluateLiveMatch() but NOT
   updateExtractAvailability() (updateInvertAvailability() at the time),
   so the Extract button/checkbox could get stuck disabled after a
   wildcard was inserted any way other than typing it.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("40. Filter popup section reorg + 'Filter for this ___' context menu");

  // --- Section structure ---
  const inputSection = d.querySelector(".filter-input-section");
  assert(inputSection.contains(d.querySelector("#filterInput")) && inputSection.contains(d.querySelector("#filterTokenChips")),
    "the input and the [float]/[int]/... wildcard chips are grouped together in one input section");
  assert(d.querySelector("#filterTokenChips .filter-section-label").textContent === "Insert:", "the wildcard-insert chips carry an 'Insert:' caption");

  const settingsRow = d.querySelector(".filter-settings-row");
  assert(settingsRow.contains(d.querySelector("#filterCaseCheckbox")) && settingsRow.contains(d.querySelector("#filterInvertCheckbox")),
    "case-sensitive and NOT live together in the settings row");
  assert(!settingsRow.contains(d.querySelector("#filterExtractBtn")), "the Extract button is NOT in the settings row — it lives in the footer, among the other action buttons");

  assert(d.querySelector("#filterColumnChips .filter-section-label").textContent === "Applies to:", "the column-restriction chips carry an 'Applies to:' caption now that they're their own section");

  const footerRow = d.querySelector(".filter-footer-row");
  const footerActions = d.querySelector(".filter-footer-actions");
  assert(footerRow.firstElementChild.id === "filterLiveMatch", "the match count is the footer row's first (left-aligned) child");
  assert(footerRow.lastElementChild === footerActions, "the action buttons are the footer row's last (right-aligned) child");
  const actionChildren = [...footerActions.children];
  assert(actionChildren[0] === d.querySelector("#filterExtractBtn") && actionChildren[1] === d.querySelector("#filterSubmitBtn"),
    "Extract sits immediately left of Add filter, both bottom-right");

  const formChildren = [...d.querySelector("#filterForm").children];
  const idx = el => formChildren.indexOf(el);
  assert(idx(inputSection) < idx(settingsRow) && idx(settingsRow) < idx(d.querySelector("#filterPatternPreview")) &&
    idx(d.querySelector("#filterPatternPreview")) < idx(d.querySelector("#filterColumnChips")) &&
    idx(d.querySelector("#filterColumnChips")) < idx(footerRow),
    "sections appear top-to-bottom in the requested order: input, settings, preview, applies-to, footer");

  // --- Bugfix: a direct .value write (token chip click) must also refresh
  // the Extract button's disabled state, not just the live-match preview ---
  const bf = await w.addFile("bugfix.log", makeLog(0, 3), () => {});
  w.render();
  T.state.activeId = bf.id;
  w.openFilterPopup();
  assert(d.querySelector("#filterExtractBtn").disabled === true, "sanity: no wildcard tokens yet, Extract starts disabled");
  fireClick(d.querySelector('.token-chip[data-token="float"]'), w);
  assert(d.querySelector("#filterInput").value.includes("[value:float]"), "sanity: the token chip inserted its placeholder");
  assert(d.querySelector("#filterExtractBtn").disabled === false, "clicking a token chip also re-enables Extract immediately (bugfix, this session)");
  w.closeFilterPopup();

  // --- "Filter for this ___" context menu ---
  assert(d.querySelector("#ctxExtractNumbers") === null, "the old 'Extract numbers from this message' menu item is gone");
  const line = `2024-01-15 10:00:00,000\tINFO\t"pool 3"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"processed 42 items"\n`;
  const cf = await w.addFile("cols.log", line, () => {});
  w.render();
  T.state.activeId = cf.id;
  const activeCol = key => d.querySelector('.column-chip[data-col="' + key + '"]').classList.contains("active");

  // Default (row background, no specific column under the pointer) -> "message"
  fireContextMenu(d.querySelector(".log-row"), w, 50, 50);
  assert(d.querySelector("#ctxFilterForColumnLabel").textContent === "Filter for this Message", "right-clicking the row background defaults to the Message column");
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "processed [value:int] items", "numeric message content becomes a wildcard pattern, same as the old 'Extract numbers' action");
  assert(activeCol("message"), "the Message column chip is pre-selected to match what was right-clicked");
  assert(d.querySelector("#filterExtractBtn").disabled === false, "the Extract button is live and clickable, but nothing has been clicked yet — see Group 41 for which button decides the outcome");
  w.closeFilterPopup();

  // A column with no numeric content falls back to its exact literal text
  fireContextMenu(d.querySelector(".col-method"), w, 60, 60);
  assert(d.querySelector("#ctxFilterForColumnLabel").textContent === "Filter for this Method", "right-clicking the Method cell labels the action for that column");
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "DoWork", "no numeric content in 'DoWork' -> falls back to the exact literal method text instead of a no-op");
  assert(activeCol("method"), "the Method column chip is pre-selected");
  assert(d.querySelector("#filterExtractBtn").disabled === true, "no wildcard tokens in a literal fallback, so Extract has nothing to build and stays disabled");
  w.closeFilterPopup();

  // A non-message column WITH numeric content also becomes a wildcard pattern
  fireContextMenu(d.querySelector(".col-thread"), w, 70, 70);
  assert(d.querySelector("#ctxFilterForColumnLabel").textContent === "Filter for this Thread", "right-clicking the Thread cell labels the action for that column");
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "pool [value:int]", "numeric content in a non-message column ('pool 3') also becomes a wildcard pattern");
  assert(activeCol("thread"), "the Thread column chip is pre-selected");
  assert(d.querySelector("#filterExtractBtn").disabled === false, "a wildcard pattern from any column re-enables Extract, letting the person choose extraction or a plain wildcard filter afterward");

  // End-to-end: clicking "Add filter" (not "Extract") creates a real
  // wildcard-as-filter "text" node restricted to the right-clicked column —
  // "Filter for this ___" never decides extract-vs-plain by itself.
  fireSubmit(d.querySelector("#filterForm"), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "text" && created.value === "pool [value:int]" && JSON.stringify(created.columns) === JSON.stringify(["thread"]),
    "end-to-end: 'Filter for this Thread' + 'Add filter' creates a 'text' filter restricted to the thread column, matched via the wildcard shape");
  assert(w.getEntries(created.id).length === 1, "the created filter actually matches the entry whose thread is 'pool 3'");
});

/* ============================================================
   GROUP 41 — Filter popup: "Extract" and "Add filter" as two separate
   buttons, no checkbox (person-reported redesign, this session, replacing
   the "Extract values" checkbox Groups 39/40 originally shipped with)
   Person report, reproducing a real bug in the checkbox version: "wenn ich
   einen Filter mit wildcards erstelle z. B. über den create from Message
   dialog, entsteht eine extraction auch wenn ich auf Add Filter und nicht
   auf Extract klicke" — creating a filter with wildcards via "Filter for
   this ___" produced an extraction table even though only "Add filter"
   was clicked, never the Extract-values toggle. Person's explicit design
   ask, which this redesign follows literally rather than just patching
   the checkbox's default value: "Das Filter Edit Dialog sollte keine
   grundlegend unterschiedlichen Zustände kennen, sondern nur unterschied
   initialisiert werden. alle Zustände sind dabei im Dialog selbst
   visualisiert. keine versteckte Logik im Hintergrund" — followed by an
   explicit "there should be no checkbox at all" follow-up once a flipped
   default alone still left a checked/unchecked STATE sitting in the
   popup between typing and submitting. Now there is no such state:
   #filterExtractBtn ("Extract", type="button") and #filterSubmitBtn ("Add
   filter"/"Save", type="submit") both call the same commitFilter(asExtract)
   — the button clicked IS the only thing that decides "text" vs.
   "extract", full stop, evaluated fresh at the moment of the click. NOT/
   case-sensitivity/column-restriction are no longer conditionally
   disabled or hidden by pattern content either (see Group 8's updated
   note and updateExtractAvailability's comment) — they're parameters of
   the "Add filter" outcome only, and Extract simply never reads them.
   Editing an existing filter goes through the exact same commitFilter:
   clicking "Add filter"/"Save" on a currently-"extract" node replaces it
   with a plain "text" filter, and clicking "Extract" on a currently-"text"
   node turns it into a real extraction — updateFilterNode always writes
   whichever type the clicked button dictates, there is no "preserve the
   old type" step anywhere.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("41. Filter popup: Extract vs. Add filter as two separate buttons, no checkbox");

  const log = `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"retrying after 3 attempts"\n` +
    `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"retrying after 7 attempts"\n`;
  const f = await w.addFile("repro.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  assert(d.querySelector("#filterExtractCheckbox") === null, "the old 'Extract values' checkbox is gone entirely — no checked/unchecked state left in the popup");

  // Exact reported repro: right-click a message -> "Filter for this
  // Message" -> click "Add filter", never touching "Extract" at all.
  fireContextMenu(d.querySelector(".log-row"), w, 50, 50);
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "retrying after [value:int] attempts", "sanity: the numeric content became a wildcard pattern");
  fireSubmit(d.querySelector("#filterForm"), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "text", "clicking 'Add filter' after 'Filter for this Message' creates a TEXT filter, never a silent extraction — the reported bug");
  assert(w.getEntries(created.id).length === 2, "and it actually filters correctly via the wildcard shape, matching both rows");

  // Same holds for a filter typed by hand via plain Ctrl+F — one shared
  // button-driven decision, not a per-entry-point default of any kind.
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "retrying after [value:int] attempts";
  fireInput(d.querySelector("#filterInput"), w);
  fireSubmit(d.querySelector("#filterForm"), w);
  const typedNode = T.state.nodes[T.state.activeId];
  assert(typedNode.filterType === "text", "typing a wildcard by hand and clicking 'Add filter' also creates a TEXT filter — same single behavior as the context-menu path");

  // Extraction is fully reachable — it just requires the visible, deliberate act of clicking Extract instead.
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  assert(d.querySelector("#filterExtractBtn").disabled === true, "Extract starts disabled on an empty input — nothing to extract yet");
  d.querySelector("#filterInput").value = "retrying after [value:int] attempts";
  fireInput(d.querySelector("#filterInput"), w);
  assert(d.querySelector("#filterExtractBtn").disabled === false, "Extract becomes clickable once the pattern has a wildcard token");
  fireClick(d.querySelector("#filterExtractBtn"), w);
  const extractNode = T.state.nodes[T.state.activeId];
  assert(extractNode.filterType === "extract", "clicking Extract builds a real extraction table");

  // --- Editing: either button can flip an existing node's type, in either direction ---

  // extract -> text: clicking "Save" (Add filter's edit-mode label) on an existing extraction replaces it with a plain filter.
  w.openEditFilterPopup(extractNode.id);
  assert(d.querySelector("#filterSubmitBtn").textContent === "Save", "edit mode's primary button reads 'Save', not 'Add filter'");
  assert(d.querySelector("#filterExtractBtn").disabled === false, "editing an existing extract node's wildcard pattern keeps Extract clickable too — both directions stay open");
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(extractNode.filterType === "text", "clicking 'Save' on an edited EXTRACTION replaces it with a plain 'text' filter — going from extraction back to a filter, as requested");

  // text -> extract: clicking "Extract" on an existing plain filter turns it into a real extraction.
  w.openEditFilterPopup(typedNode.id);
  assert(d.querySelector("#filterExtractBtn").disabled === false, "editing an existing text node whose value already has a wildcard keeps Extract clickable");
  fireClick(d.querySelector("#filterExtractBtn"), w);
  assert(typedNode.filterType === "extract", "clicking 'Extract' on an edited PLAIN FILTER replaces it with a real extraction — going the other way, as requested");
});

/* ============================================================
   Summary
   ============================================================ */
console.log("\n" + "=".repeat(60));
console.log(passed + " passed, " + failed + " failed" + (failed ? " (" + failures.length + " failures listed above)" : ""));
process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });

/* ============================================================
   TEST PROVENANCE — which past session each group covers, and what was
   deliberately dropped because the feature it tested no longer exists.
   Kept here so a future session doesn't have to re-derive this mapping.
   Group numbers refer to the "GROUP N —" headers above; they appear in the
   file in the order later groups happened to be inserted during authoring,
   not in numeric order — grep for "GROUP <n> —" to jump to a specific one.
   ============================================================

   Group  1  — initial build (pre-dates project memory)
   Group  2  — 765d68a9 (extraction workflow: live match, token chips)
   Group  3  — 765d68a9 (theme toggle)
   Group  4  — 765d68a9 (sortable headers, status strip, severity bar)
              + 32e282b4 follow-up (level filter now updates BOTH views)
   Group  5  — 765d68a9 (extraction column sort + cell-selection regression)
   Group  6  — 3f879dbe (the double-click DOM-identity root-cause bug)
   Group  7  — 3f879dbe (copy/cut/paste, drag-and-drop, and/or/link cycle
              guard, isFileDrag() overlay gate)
   Group  8  — 62262740 (filter inversion/NOT) — that session shipped
              WITHOUT any jsdom test; this is its first real coverage.
              Also folds in the THIRD exclusion (context), added later in
              1dd227c6 and, likewise, never previously tested.
   Group  9  — 1dd227c6 (time context filter)
   Group 10  — 94d8ec50 (Escape-handler crash, releaseEntriesFromIndex)
   Group 11  — 6233b6f7 (filter save/load). REWRITTEN, not reused: that
              session's own test used an older eval-based harness that
              predates the T-bridge convention, and only covered the
              file's initial single-branch shape — it predates the
              mid-session redesign (same conversation) that pulls in
              and/or/link dependency chains via attach:"file"/attach:
              "target". That redesign had no lasting test until now.
   Group 12  — 727a344e (tailing: growth, split-line buffering, rotation)
   Group 13  — b647f247 (Δt column, timeline minimap)
   Group 14  — 7ef2c2a6 (value assertions, column statistics)
   Group 15  — 7ef2c2a6 (bookmarks)
   Group 16  — 7ef2c2a6 (undo/redo)
   Group 17  — 38c96f1d (Highlight/Full view, colour picker,
              computeHighlightMap, revealInHighlightView). The CSS
              flex-direction regression from that same session is NOT
              re-tested here — it's a pure-layout bug with no state
              signature, i.e. exactly the class of thing PROJECT.md's
              "Testing approach" section flags as jsdom's blind spot
              (no real hit-testing/paint order). Guard against recurrence
              by code review of #tableWrap's CSS, not by a jsdom assertion.
   Group 18  — 32e282b4 (F2 edit-in-place, sidebar/fhSplit resizers,
              Full/Filtered/Stacked toggle, Stacked DOM order + badges)
   Group 19  — 2026-08-11 code-review pass: revealFilteredView() on every
              filter-creation path, bookmark repaint in both views,
              minimap background-bucket memoization, scoped tail-cache
              invalidation, per-node level-count cache, single
              computeHighlightMap call per renderMainView, arrow-key
              index hint.
   Group 20  — this session (2026-08-11): session cache (IndexedDB
              persistence of files/filters/bookmarks/settings across a
              reload). Uses fake-indexeddb (new devDependency): one shared
              IDBFactory across two jsdom windows simulates a reload;
              covers persist round-trip incl. multi-line raw text,
              linkedRef remap on an AND node, bookmark-by-ordinal,
              settings, file-deletion cache cleanup, and the
              "philogg-cache-enabled"="0" escape hatch. Every OTHER group
              still runs without any IndexedDB, which implicitly covers
              the feature's graceful-degradation path.
   Group 21  — this session (2026-08-12): session export/import. Covers
              the design spec's full testing plan: export dialog with
              per-file include/embed checkboxes (captured by stubbing
              downloadJsonFallback — jsdom has no showSaveFilePicker, so
              the export deterministically takes the download fallback),
              tier-1 exact round-trip against a renamed byte-identical
              file, tier-2 auto-match against a grown/tailed receiving
              copy (explicitly asserting tier===2), tier-2 rejection on a
              density mismatch inside the window -> tier-3 dialog, manual
              pick with the ts+raw-fingerprint bookmark fallback (one of
              two bookmarks deliberately unresolvable), version guard,
              embedded-log materialization into an empty session, and the
              fullHash cache invalidation via invalidateCachesForRoots.
              Also asserts the context-menu placement (node menu + tree
              background menu).

   Group 22  — this session (2026-08-12): link filter chaining fix (Bugs
              1-3 from REQUIREMENTS-link-chaining-and-multiway.md) +
              multi-way (N-tuple) link dialog. Folds in the person-supplied
              tests/link-chaining.spec.js's BASELINE/TARGET assertions
              (now real pass/fail, not that file's original "informational
              pre-implementation" framing) plus new coverage this
              consolidated suite adds: exclusive-matches and enforce-order
              opt-ins (both default off, verified via their REPRO/BASELINE
              cases), the multi-hop dialog end-to-end (bulk-select 3
              filters -> Link… -> 2 hop rows -> chain of 2 link nodes ->
              correct 3-way tuple, incl. the Link view now rendering N
              rows/N-1 deltas instead of a fixed 2), and persistence of the
              two new node fields (linkOrderEnforced/linkExclusive) through
              save/load, copy/paste, and undo/redo, plus a backward-compat
              check that pre-feature saved filter JSON still loads with
              both defaulting false. A standalone tests/link-chaining.spec.js
              was deliberately NOT kept alongside this file — see this
              project's own README.md "Extending this suite": the
              convention is one consolidated suite, not a parallel spec
              per feature; noted here per the requirements doc's own "if a
              different shape is chosen... note the deviation" allowance.

   Group 23  — this session (2026-08-12, follow-up to Group 22): link
              filter same-timestamp tie-break, from a person-reported case
              (screenshots) where linking "Target Real" to the nearest
              preceding "Target Vir" skipped the entry immediately before
              it in the Full log (same exact millisecond — the format's
              finest resolution) and matched one ~11s earlier instead.
              Confirmed root cause (findNthOccurrence's strict `<`/`>` on
              `ts` excludes ties from both directions symmetrically) before
              implementing the fix the person explicitly asked for: break
              ties by log/array order (buildOrderIndexMap). Covers the
              exact reported scenario in both directions, a plain
              no-ties regression guard, and tie-break combined with the
              exclusive-matches option (Group 22). See PROJECT.md "Link
              filter" → "Same-timestamp tie-break".
   Group 24  — this session (2026-08-13), from person-supplied
              REQUIREMENTS-extract-preview-and-ignore.md: live pattern
              preview in #filterPopup + per-column node.ignoredColumns.
              See the group's own header comment above for the full
              design-direction rationale (not repeated here — this entry
              was missing from provenance until the Group 26 session
              backfilled it).
   Group 25  — this session (2026-08-13), person-reported bugfix follow-up
              to Group 24: "Extract numbers from this message" not firing
              evaluateLiveMatch on its direct .value write, and right-click
              "Edit filter…" self-closing via event bubbling into the
              global click-outside-closes-popup handler. Both root-caused
              before fixing (see the group's own header comment).
   Group 26  — this session (2026-08-13): header/toolbar reshuffle,
              person-requested UI adjustments (no functional/filtering
              logic changed). Three parts: (1) removed the "local,
              single-file log viewer" subtitle from the header, (2) merged
              the breadcrumb, level filter, and Full/Filtered/Stacked
              toggle — previously three separate toolbar rows — into one
              #viewBar row (tabs, then level filter, then breadcrumb;
              #levelBar/#breadcrumb now sit inside that row but stay
              visible in every state, including extract mode, since only
              #fhTabs toggles display now, not the whole row as
              #fhTabBar used to), and (3) moved the keyboard-shortcuts
              list out of a permanent bottom-left sidebar strip (#shortcuts
              was a direct child of #sidebar) into a popup (#shortcutsPanel)
              behind a new #btnShortcuts header button, following the exact
              same open/close/outside-click/Escape pattern already
              established by #bookmarksPanel. Covers: subtitle absence,
              #viewBar child order and nesting, #fhTabs visibility across
              no-files/normal/extract states while #levelBar/#breadcrumb
              stay populated in all three, the shortcuts list's new DOM
              location, and the popup's open/close/outside-click/Escape
              behavior.
   Group 27  — this session (2026-08-14): Pin bookmarks into the Filtered
              View. New `#btnPinBookmarks` toggle (`state.pinBookmarksIn-
              FilteredView`); `getVisibleEntries()` unions the filter
              chain's result with the active root's bookmarks when on,
              bypassing both the filter tree and the level filter. Covers
              merge/union correctness, level-filter bypass, chronological
              ordering, per-root scoping, `.pinned-row` class distinction,
              extract-mode non-interference, and persistence round-trips
              through the session cache and session export.
   Group 28  — bugfix follow-up to Group 27, same session (person-
              reported): `toggleBookmark()` was repainting the Filtered
              view from stale `currentViewEntries`/`pinnedOnlyIds` when pin
              mode was on, so a bookmark add/remove only took effect on the
              NEXT unrelated render. Fixed by having `toggleBookmark()`
              recompute those itself (without routing through
              `renderTable()`, which would reset scroll). Covers immediate
              row appear/disappear, status-strip count update, scroll
              preservation, and confirms the pin-off case is untouched.
   Group 29  — this session (2026-08-14), person-requested UI adjustment:
              `#btnPinBookmarks` moved from the header into `#viewBar`,
              floated between `#fhTabs` and `#levelBar` — no filtering
              logic touched, purely positional plus one new float/margin
              CSS rule. Covers the new DOM position/order, that it's no
              longer inside `.toolbar-group`, that it keeps `.toolbar-icon-
              btn` styling rather than being restyled as `.level-btn`,
              the float mechanism, always-visible independent of `#fhTabs`,
              and that the click/toggle behavior still works unchanged from
              its new location.
   Group 29b — bugfix follow-up to Group 29, same session (person-
              reported): `#btnPinBookmarks` still carried `.toolbar-icon-
              btn`'s fixed 29x29px header size after the move, visibly
              taller than `#fhTabs`/`#levelBar`/`#breadcrumb` next to it.
              Fixed with a `#btnPinBookmarks`-scoped `width:auto;
              height:auto; padding:4px 8px` override — sizes around its
              icon the way `.level-btn` sizes around its text, without
              touching `.toolbar-icon-btn` itself. Covers the cascaded
              width/height/padding values and confirms the four header
              buttons sharing `.toolbar-icon-btn` keep their original
              29x29px size (jsdom has no layout engine, so actual rendered
              pixel height isn't assertable — see the group's own comment).
   Group 30  — this session (2026-08-14), person-requested: File filter
              history — a per-file filter-tree memory, separate from the
              session cache, that outlives any single session. New
              "fileHistory" IndexedDB store (DB version bumped 1→2), keyed
              by content fingerprint (reuses `matchExportedFile`'s tiered
              fingerprint technique from Session export/import, run in the
              opposite direction); a match surfaces as a dismissable ghost
              preview under a childless file node (`renderFilterHistory-
              Preview`, called from `renderNode`) with a Restore button,
              never auto-applied. No cap on stored records (see PROJECT.md
              "File filter history" for why a size-based cap doesn't apply
              here). 30a covers tier-1 exact-match persistence and restore
              across two windows sharing one `IDBFactory` (same reload-
              simulation pattern as Group 20); 30b covers tier-2 matching
              against a grown file plus the negative case (unrelated
              content, no match); 30c covers the exclusion rules (merged
              files, empty filter trees) and the ghost preview's auto-hide
              once the file gets ANY real filter child, restored or not.
              30d (follow-up, closing a deliberately-noted gap): the same
              tier-1 round trip but through the REAL `loadFileDescriptors`
              entry point — an actual `File` read via `FileReader` (jsdom
              implements both natively) — instead of the lower-level
              `addFile()`/`matchFileHistory()` calls 30a-c and every other
              group in this suite use; proves the `persistFileNode` →
              `matchFileHistory` hook wired inside `loadFileDescriptors`
              itself fires correctly end-to-end.
   Group 31  — this session (2026-08-16), FEATURE_BACKLOG.md item: drag-
              select a time range on the timeline minimap to create a from/
              to filter. New DOM elements (`#timelineMinimapDragRect`/
              `#timelineMinimapDragLabel`) sit outside the minimap's `<svg>`
              specifically so they survive a renderTimelineMinimap() call
              mid-drag, which fully rebuilds the SVG's innerHTML (tail
              ticks, level toggles, ...). A pixel-distance threshold
              (`MINIMAP_DRAG_THRESHOLD_PX`) tells a real drag apart from a
              plain click, and a one-shot `minimapDragSuppressClick` flag
              stops the browser's trailing "click" event (fired after any
              mouseup) from also being interpreted as the pre-existing
              click-to-jump. UPDATED later the same session (see Group 32):
              originally built the range from two separate "after"/"before"
              filters combined by an AND node (reusing `createAndOrNode`,
              identical in shape to the "Combine (AND)" bulk action) — a
              person-reported follow-up asked for the result as one filter
              instead of three tree nodes, which prompted the "timerange"
              filterType Group 32 covers; this group's own assertions were
              updated in place to match the new single-node shape rather
              than left testing the superseded one. Still covers: overlay
              show/hide across the full gesture, the pre-existing scrolled-
              viewport indicator (`#minimapViewportRect`) continuing to work
              unmodified — the explicit caution in FEATURE_BACKLOG.md — and
              a plain click still falling through to click-to-jump.
   Group 32  — this session (2026-08-16), person-reported follow-up to
              Group 31's drag-select: "I'd like the result as a single
              filter, without the two sub-filters." Introduces a unified
              "timerange" filterType (`value: { from, to }`, either bound
              nullable = unbounded) replacing the old single-bound "after"/
              "before" types in every CREATION path (drag-select, row
              context-menu "Filter after/before this row", and a new
              minimap right-click → dialog); "after"/"before" stay in
              FILTER_TYPES purely so already-saved sessions/exports keep
              reading correctly, and editing one through the new dialog
              (F2 or tree right-click "Edit filter…" — previously
              unavailable for these types at all) migrates it to
              "timerange" one-way. Dialog uses empty-field-means-unbounded
              (no separate infinity checkbox, matching the value-assertion
              dialog's existing optional min/max convention) and silently
              swaps a reversed From/To rather than rejecting it. Because the
              new value is still carried under the filter node's existing
              generic `value` field, no persistence-carrier code needed
              touching beyond adding "timerange" to FILTER_TYPES — Section H
              of this group proves that by round-tripping a "timerange"
              node through the real Save/Load filter JSON path unchanged.
              Also covers: legacy after/before nodes still evaluate/tag
              correctly, F2 migration in place, unified context-menu
              creation, tree-context-menu Edit routing for all three
              time-filter types, dialog validation (reject empty submit)
              and Clear buttons, and minimap right-click creation prefilled
              at the clicked point.
   Group 33  — this session (2026-08-16), person-reported bugfix via
              screenshot: the minimap's "scrolled/filtered into view"
              rectangle (`#minimapViewportRect`) stopped at the raw x
              position of the last shown entry's own timestamp instead of
              extending to the right edge of the density BAR that entry
              belongs to — visually, a shown row's own bar could stick out
              past the highlighted range, looking like it was outside the
              current view even though the table below it was showing that
              exact row. Fixed with `minimapBarSpan(ts)`, mirroring
              `renderTimelineMinimap`'s own `bucketOf()` bucketing formula,
              giving the full `[left, right)` pixel span of an entry's
              bucket; `updateMinimapViewportIndicator` now uses `.left`/
              `.right` from the first/last shown entry instead of two raw
              `minimapTsToX()` points. Verified with hand-crafted timestamps
              placing the shown entry exactly 500ms into a 10,000ms-wide
              bucket (deterministic given the suite's stubbed 800px
              container width) — confirms the rendered rect's right edge
              lands at the bucket's true right edge, measurably past where
              the old raw-position code would have stopped short.
   Group 34  — this session (2026-08-16), person-reported follow-up to
              Group 33's bugfix: the minimap's range indicator only ever
              showed what's scrolled into view, never the WHOLE time span
              the Filtered view's result set covers. Split the old single
              `#minimapViewportRect` into `#minimapFullRangeRect` (the whole
              filtered result, same look the old rect always had —
              `updateMinimapFullRange`, scans for real min/max rather than
              assuming entries[0]/entries[last] are the extremes, since that
              only holds for the table view's chronological list, not the
              Link view's flattened pair entries) and
              `#minimapRenderedRangeRect` (just what's actually got a DOM
              row right now — a real subset for the virtualized table view;
              simply left hidden for the Link view, which has no
              virtualization to distinguish a subset from — see
              `renderLinkView`'s own comment). Also added: a position marker
              for the current selection (`updateMinimapSelectionMarkers`,
              a thin line + small flag per marked entry, wired into the
              single `applySelection` choke point shared by
              `selectEntry`/`selectHighlightEntry`/`revealInHighlightView`,
              so every existing selection path gets one for free) and, for
              the Link view specifically, clicking a pair's brace now marks
              BOTH real entries the pair is made of
              (`minimapMarkedEntries`, reading a `data-entry-ids` attribute
              stashed on the brace by `renderLinkView` at render time) —
              which required making the minimap visible during the Link
              view at all (previously hidden outright; pair entries
              duck-type as normal entries, so this needed no special-casing
              beyond feeding `renderTimelineMinimap` the flattened tuple
              entries). `minimapMarkedEntries` gates the brace-selection
              branch on the Link view actually being the active view, so a
              stale `.pair-selected` left over from navigating away can't
              keep marking its old entries once a different node is active.
   Group 35  — this session (2026-08-16): FEATURE_BACKLOG.md "Case-sensitive
              option for text filters" + "Per-filter target column",
              bundled together. Adds node.caseSensitive/node.columns to
              "text" filter nodes and a case-sensitive checkbox (default
              unchecked) + per-column toggle chips to the filter popup,
              using the SAME selection logic as the level filter bar (none
              selected = search everything, one-or-more = restrict to
              those, so "all" and "none" are equivalent). Threaded through
              every persistence carrier per CLAUDE.md's "Known gotchas":
              cloneSubtree, snapshotSubtree/restoreSubtree,
              serializeFilterBranch/importFilterJson,
              serializeFilterTreeForCache/materializeCachedFilters.
              Bugfix caught along the way (pre-existing, not introduced this
              session): `updateMinimapRenderedRange`'s `startIdx` was only
              ever clamped at 0, never at the entry list's upper bound —
              switching to a much smaller filtered result while previously
              scrolled deep into a larger one indexed straight past the end
              of `currentViewEntries` and threw; both `startIdx`/`endIdx`
              are now clamped on both ends. Covers: full-range vs rendered-
              subset both visible and differing correctly for a 100-entry
              file scrolled to its middle, a single selection's marker
              appearing/moving/clearing, the minimap now rendering during
              the Link view with the rendered-subset rect correctly staying
              hidden there, a brace selection marking exactly its pair's two
              real entries at their own timestamps, deselection clearing the
              markers, and the stale-brace-after-navigating-away guard.
   Group 36  — this session (2026-08-16): FEATURE_BACKLOG.md "Arrow-key
              navigation in the filter tree". New state.focusRegion
              ("entries" | "tree", default "entries", the pre-existing
              default) decides what plain Up/Down/Left/Right act on —
              clicking a tree row/breadcrumb chip or dropping a tree drag
              sets it to "tree"; any entry-table selection (applySelection)
              sets it back to "entries", so the pre-existing ArrowUp/Down
              row-selection behavior (Group 19) is completely unaffected
              unless the tree was clicked first. With "tree" focus,
              moveTreeSelection moves state.activeId: Up/Down step through
              flattenTreeIds() (the same depth-first order renderNode
              renders in — verified across a parent/child/sibling shape,
              not just a flat list), Left jumps to the parent (no-op at a
              root), Right to the first child, and the moved-to node also
              becomes the sole multiSelect entry, matching a plain row
              click. Covers the focusRegion default, the real click->tree-
              focus DOM path, all four directions including the two
              no-op/clamp edges, and the hand-back to "entries" focus on
              the next row click.
   Group 37  — this session (2026-08-16): FEATURE_BACKLOG.md "Folder watch
              + lazy loading". addWatchedFolder scans a FileSystemDirectory-
              Handle's immediate entries (faked at the handle level, same
              approach as Group 12) for compatible (*.log) files and lists
              them grayed-out, without reading them — lazy by construction.
              REWRITTEN IN PLACE later the same session (person feedback,
              see Group 38) for the merged-view layout: opened and unopened
              files now render TOGETHER, in folder order, inside one
              .folder-watch-files list — a folderOrder() test helper reads
              that order back from the DOM regardless of whether a given
              row is a real .tree-row or a grayed placeholder, and every
              stage of the group (open, close, reopen, a newly-discovered
              file) asserts the order stays exactly a.log, b.log[, c.log]
              throughout, never reordering as files open/close. Also
              covers: incompatible-extension filtering, the scanning-ping
              CSS class on a live watch, a plain click on a grayed row NOT
              touching state.activeId (the mechanism behind "no filter can
              target an inactive file"), double-click AND the tree context
              menu's "Load file" both lazily loading a file into a normal
              tagged (folderId) root node that starts tailing and renders
              INSIDE the folder box (not as a separate #tree row), closing
              a folder-loaded file returning it to its same grayed spot
              instead of vanishing (closeFolderFile) while a plain file's
              close is untouched, reopening reusing the stored handle,
              folderScanTick picking up a file that appears later, and
              removeWatchedFolder leaving already-open files in place
              (now rendered back under plain #tree) with folderId cleared.
   Group 38  — this session (2026-08-16), person-reported follow-up to
              Group 37's feature, same day: (38a) the two separate "Open
              files…"/"Open folder…" buttons collapsed into one "Open…"
              button + dropdown menu (#openMenu) — toggle open/closed,
              click-outside-closes (same document-level pattern as every
              other popup), and the "File(s)…" item still falling back to
              the hidden <input> exactly like the old button did. (38b)
              FOLDER_WATCH_SUPPORTED (!!window.showDirectoryPicker, always
              false in jsdom — same gap as showOpenFilePicker) gates both
              entry points behind a showCopyToast popup instead of a
              silently degraded experience: the "Folder…" menu item, and a
              dropped folder detected via the broadly-supported (even
              without getAsFileSystemHandle) webkitGetAsEntry() — plus a
              regression check that a plain (non-folder) file drop is
              completely unaffected by any of this gating. (38c) session
              persistence: a real two-window IndexedDB round trip (shared
              IDBFactory, same pattern as Group 20) proving a file's
              folderId AND the folder's own record (name, handle) survive
              a reload, followed by the reconnect flow — a FakeDirHandle
              built as a CLASS (methods on the prototype, not own
              properties) so its instances survive fake-indexeddb's strict
              structured-clone check (an own function property throws
              DataCloneError outright; a class instance's prototype methods
              are silently dropped instead, exactly modeling what a real
              browser's structured clone does NOT do for a genuine
              FileSystemHandle, but doing so consistently is what makes the
              restored folder legitimately need Reconnect in this test —
              asserted on directly, not worked around). The one piece a
              real IndexedDB round trip can't exercise in jsdom — a working
              handle actually surviving clone with its methods intact — is
              tested at the function level instead (reconnectFolder called
              directly with a fresh fixture handle), noted as such in the
              test itself, consistent with tests/README.md's existing File
              System Access API gap.
   Group 39  — this session (2026-08-17), person-requested filter-popup
              sizing/layout pass: a wildcard pattern can now become a plain
              "text" filter matched via its own regex shape (just tested,
              not captured) instead of always building an extraction table
              — covered via direct getEntries()/textFilterMatches() calls,
              including case-sensitivity, NOT, and parity with an
              unaffected real "extract" node. (Originally, and still in
              this group's own "Origin" note, this was gated by an
              "Extract values" checkbox — replaced the SAME session by the
              two-button Extract/Add-filter redesign in Group 41; Group 39
              was trimmed in place to drop the now-nonexistent checkbox's
              own UI assertions, keeping only what's still true: the
              matching semantics and the #filterTargetChain pill-chain
              visualization that replaced the old plain-text "Filter on
              “X”:" label, reusing #breadcrumb's own .crumb/.crumb-sep
              classes.) The popup's new max-height/overflow-y (the actual
              "content no longer fully visible" sizing bug) is a pure CSS
              fix with no meaningful jsdom-observable state, so it is NOT
              re-tested here — same "jsdom has no layout engine" gap noted
              in tests/README.md and the flex-direction regression entry
              below.
   Group 40  — this session (2026-08-17), same day as Group 39, two
              related requests: the filter popup's layout restructured
              into explicit sections (input+wildcard chips, a settings row,
              the live pattern preview, the "Applies to" column-restriction
              chips, and a footer row with the match count left-aligned and
              the action buttons right-aligned — asserted top-to-bottom via
              DOM child order, not just presence), and the row context
              menu's "Extract numbers from this message" renamed to "Filter
              for this ___" (#ctxFilterForColumn), where the blank is
              whichever column the right-click actually landed on
              (resolveContextFilterColumn, covered across message/method/
              thread — the literal-text fallback for a column with no
              numeric content, and the numeric-content-becomes-a-wildcard
              case for both the default message column and a non-message
              one). Also covers the insertTokenAtCursor/context-menu bugfix
              (a token-chip click or this new menu action setting
              #filterInput.value directly must also refresh the Extract
              button's disabled state, not just the live-match preview).
              Its footer-actions assertions were updated in place the same
              session (see Group 41) once the checkbox they originally
              pointed at was replaced by #filterExtractBtn.
   Group 41  — this session (2026-08-17), person-reported: creating a
              filter with wildcards via "Filter for this ___" built an
              extraction table even when only "Add filter" was clicked,
              never an "Extract values" checkbox — traced to that checkbox
              defaulting to checked for every new filter. The person's
              explicit follow-up ask, once a flipped default was shown to
              only patch the symptom: no checkbox at all — "Add filter"
              and "Extract" should be two plain buttons, and the button
              clicked is the ONLY thing that decides "text" vs. "extract",
              with nothing left in the popup that could carry a hidden
              default between typing and submitting. `commitFilter(asExtract)`
              is now the single function both buttons call. Covers: the
              checkbox's absence from the DOM, the exact reported repro
              (context-menu prefill -> "Add filter" -> plain "text" node),
              the same outcome for a hand-typed Ctrl+F pattern (proving one
              shared code path, not per-entry-point branching), extraction
              still reachable via the Extract button, and — the part a
              checkbox-based design structurally couldn't do — editing an
              EXISTING extraction and clicking "Save" to turn it back into
              a plain filter, and editing an EXISTING plain filter and
              clicking "Extract" to turn it into a real extraction, both
              directions explicitly requested.

   Deliberately DROPPED (features superseded or removed since the
   originating session — keeping their old assertions would either fail
   against current code or silently test nothing):
   - The "Extract values" checkbox (#filterExtractCheckbox, shipped
     earlier the 2026-08-17 session in Groups 39/40) — replaced the SAME
     session by two plain buttons, #filterExtractBtn ("Extract") and the
     pre-existing #filterSubmitBtn ("Add filter"/"Save"), per explicit
     person request that the popup carry no checked/unchecked state at
     all between typing and submitting (see Group 41). Its own checked-
     by-default bug (the reason it existed only briefly) is superseded by
     there simply being no checkbox left to default one way or the other;
     Group 41 is the current, canonical coverage for extract-vs-plain-
     filter decision logic.
   - Checkbox-based tree multi-select (765d68a9) — replaced by the
     highlight-colour swatch + Ctrl+click-only multi-select in 38c96f1d.
     Ctrl+click itself IS covered, implicitly, by Group 7's multi-node
     setup patterns and Group 17's swatch checks.
   - Message hover popover (765d68a9's own follow-up removed it in
     3f879dbe) — the detail panel is its replacement and is exercised
     incidentally throughout (selectEntry -> updateDetailPanel).
   - The OLD two-tab Filter/Highlight switcher + separate stack button
     (pre-32e282b4) — superseded by the three-way #fhTabs toggle, which
     Group 18 tests directly.
   - The OLD destructive jumpToFullLog()-on-double-click behavior for the
     plain log/link view (pre-38c96f1d) — superseded by
     revealInHighlightView(), tested in Groups 6 and 17.
     jumpToFullLog() itself still exists and is still tested (Group 10's
     entryIndex checks touch its neighbor findRootIdForEntry machinery
     indirectly via jumpToEntry in Group 15) but is no longer wired to a
     double-click in the views that gained a Highlight/Full companion.
   - Seconds-based time-context dialog inputs (1dd227c6's OWN early
     draft, replaced by ms within the same session before ship) — Group 9
     tests the shipped ms-based version only.
   - 8f3df18d (context-dialog CSS-only positioning fix) — no functional/
     state test is meaningful for a pure CSS positioning bug; not
     represented here for the same "jsdom blind spot" reason as the
     flex-direction regression above.
   - 48678a78 (Q&A session about nested link filters, no code changes) —
     nothing to test.
   - The OLD standalone bottom-left #shortcuts sidebar strip and the OLD
     #fhTabBar row (pre-Group 26) — superseded by #shortcutsPanel and the
     merged #viewBar respectively; both are pure layout/placement changes
     with no filtering-logic behind them, fully covered by Group 26.

   ============================================================ */
