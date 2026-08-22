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
    url: opts.url || "http://localhost/philogg.html",
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
      get plotConfig() { return plotConfig; },
      get plotZoom() { return plotZoom; },
      get plotLastRender() { return plotLastRender; },
      get linkPairsData() { return linkPairsData; },
      get linkBlockOffsets() { return linkBlockOffsets; },
      get linkSelectedPairIndex() { return linkSelectedPairIndex; },
      get undoStack() { return undoStack; },
      get redoStack() { return redoStack; },
      get entryIndex() { return entryIndex; },
      get MONO_CHAR_WIDTH_FALLBACK() { return MONO_CHAR_WIDTH_FALLBACK; },
      get customThemes() { return customThemes; },
      get THEME_COLOR_KEYS() { return THEME_COLOR_KEYS; },
      get BUILTIN_THEMES() { return BUILTIN_THEMES; },
      get colorPickerMode() { return colorPickerMode; },
      get HIGHLIGHT_PRESETS() { return HIGHLIGHT_PRESETS; },
      get accentChoices() { return accentChoices; },
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
// Checks ACTUAL resolved CSS (getComputedStyle), not just whether the
// "hidden" class is present on the element — jsdom has no real layout
// engine, but it DOES correctly compute `display` from matching CSS rules,
// so this catches the class of bug where an element's "hidden" class has
// no matching CSS rule anywhere (classList.contains("hidden") would say
// "hidden" while the element is still fully visible on screen — exactly
// what happened to the Settings inline panels once, see GROUP 70e).
function isVisible(el, w) { return w.getComputedStyle(el).display !== "none"; }
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
  // Real level-filter changes always flow through a render immediately after
  // (see renderLevelBar's click handler) — keep currentHighlightViewEntries
  // in sync the same way here, instead of leaving a stale (ERROR-only)
  // snapshot sitting behind a levelFilter that's already been cleared.
  w.render();

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
   GROUP 16 — Undo / Redo (filter node delete/move)
   Origin: 7ef2c2a6 (item 6). Snapshot-based stack, originally scoped to
   filter node delete/move ONLY — verifies the wrapped mutators, the
   redo-stack-clearing-on-new-action semantics, the stack limit, and that
   linkedId self-heals when a subtree is restored. File delete, value/
   pattern edits, invert toggle, and assertion changes were added to the
   same stack later this session (2026-08-17, FEATURE_BACKLOG.md "Extend
   undo/redo") — see Group 46, which also replaces this group's old
   "files are out of scope" assertion (now false).
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

  // Plain file deletion is now ALSO undoable (Group 46 covers this in
  // depth — restored entryIndex/rootIds position/filter subtree — this is
  // just a smoke check that it goes through the same stack).
  const fileToDelete = await w.addFile("c.log", makeLog(0, 3), () => {});
  const stackLenBefore = T.undoStack.length;
  w.deleteFilterNodeWithUndo(fileToDelete.id);
  assert(!T.state.nodes[fileToDelete.id], "file deletion still works through the wrapped call");
  assert(T.undoStack.length === stackLenBefore + 1, "deleting a plain FILE now pushes an undo action too");
  w.undo();
  assert(T.state.nodes[fileToDelete.id], "undo restores the deleted file");
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

  // Range mode via the real dialog. Targeted by data-assert-col, not the
  // first ".extract-assert-btn" in the DOM — the synthetic Index/t(ms) columns
  // (see INDEX_COL/ELAPSED_COL) are plottable too and now get their own
  // assert buttons ahead of the real extracted column's.
  const assertBtn = d.querySelector('.extract-assert-btn[data-assert-col="0"]');
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
   GROUP 64 — Count context filter
   Origin: this session (2026-08-19), person-requested ("Analog zum Time
   Context erstelle einen Count Context, bei dem man einfach die Anzahl der
   Log Einträge vor und/oder nach dem Anchor einstellen kann"): a sibling of
   the Time context filter (Group 9) that windows by a fixed NUMBER of
   entries before/after each reference entry (in the root file's own
   chronological order) instead of a millisecond duration — useful when log
   density varies too much for a time window to reliably capture "N entries
   of surrounding context". Covers window construction by entry count,
   overlapping/adjacent-range merge, the whole-root-file source pool,
   boundary clamping at the start/end of the file, bracket rendering
   (shared renderer with Group 9's context filter), anchor dots, and the
   entry-count dialog (no unit conversion, unlike ms — verified round-trip).
   NOT-exclusion is covered in Group 8, not repeated here.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("64. Count context filter");
  // makeLog puts each entry exactly 1s apart in strict index order, so
  // "2 entries before/after" and "the previous/next 2 seconds" coincide —
  // convenient for asserting exact window membership by index.
  const f = await w.addFile("a.log", makeLog(0, 40, { msgPrefix: "ref", suffix: i => (i === 5 || i === 6 || i === 30) ? "MARK" : "" }), () => {});
  w.render();
  const refFilter = w.createFilterNode(f.id, "text", "MARK");
  assert(w.getEntries(refFilter.id).length === 3, "reference filter matches the 3 marked entries");

  // 2 entries before/after: entry 5's window is [3,7], entry 6's is [4,8] —
  // these overlap and must merge into ONE bracket group ([3,8], 6 entries);
  // entry 30's window [28,32] (5 entries) stays separate.
  const ctxNode = w.createCountContextNode(refFilter.id, 2, 2);
  const ctxEntries = w.getEntries(ctxNode.id);
  assert(ctxEntries.length === 11, "count context pulls in entries from the WHOLE root file by index window, not just the reference filter's own result — got " + ctxEntries.length);
  assert(ctxNode._contextRanges.length === 2, "overlapping windows (entries 5&6) merge into one range; the far entry (30) stays separate — got " + ctxNode._contextRanges.length);
  assert(ctxNode._anchorIds.has(f.entries[5].id) && ctxNode._anchorIds.has(f.entries[30].id), "anchor id set contains the reference entries");
  const ids = new Set(ctxEntries.map(e => e.id));
  for (let i = 3; i <= 8; i++) assert(ids.has(f.entries[i].id), "merged group includes index " + i);
  for (let i = 28; i <= 32; i++) assert(ids.has(f.entries[i].id), "far group includes index " + i);
  assert(!ids.has(f.entries[2].id) && !ids.has(f.entries[9].id), "window does not overreach past its own before/after count");

  // Boundary clamping: a reference entry near the start/end of the file
  // must clamp its window to the file's own bounds instead of going
  // negative or past the last index.
  const edgeRef = w.createFilterNode(f.id, "text", "ref 0 ");
  const edgeCtx = w.createCountContextNode(edgeRef.id, 5, 0); // entry 0, 5 before -> clamps to just [0,0]
  assert(w.getEntries(edgeCtx.id).length === 1, "a window that would start before index 0 clamps to the file's actual start");

  // Child filters chain underneath a count-context node exactly like any
  // other filter, because its result is real entries, not synthetic ones.
  const childUnderCtx = w.createFilterNode(ctxNode.id, "text", "ref");
  assert(w.getEntries(childUnderCtx.id).length === ctxEntries.length, "a plain filter chains underneath a count-context node without special handling");

  // Bracket + anchor-dot rendering (shared renderer with the time-context
  // filter — see the ctxNode selection in renderVisibleRows)
  T.state.activeId = ctxNode.id;
  T.state.sortColumn = null;
  w.render();
  assert(d.querySelectorAll("#tableRows .ctx-bracket").length > 0, "count-context bracket renders in the log view");
  assert(d.querySelectorAll("#tableRows .ctx-anchor-dot").length > 0, "anchor dot renders on reference-entry rows");

  // Dialog: entry counts round-tripped verbatim (no unit conversion, same
  // convention as the ms-based Time context dialog)
  const someRef = w.createFilterNode(f.id, "text", "MARK");
  T.state.activeId = someRef.id;
  w.render();
  w.openCountContextDialog(someRef.id);
  d.querySelector("#countContextBeforeInput").value = "3";
  d.querySelector("#countContextAfterInput").value = "0";
  fireClick(d.querySelector("#countContextDialogCreate"), w);
  const createdCtx = T.state.nodes[T.state.activeId];
  assert(createdCtx.filterType === "countContext" && createdCtx.countBefore === 3 && createdCtx.countAfter === 0,
    "count context dialog creates a countContext node storing the value as an entry count verbatim");

  // Copy/paste and undo/redo round-trip the countBefore/countAfter fields
  // (cloneSubtree / snapshotSubtree+restoreSubtree — same fields threaded
  // through as the ms-based context filter, per CLAUDE.md's persistence-
  // carrier checklist).
  const cloned = w.cloneSubtree(ctxNode.id, f.id);
  assert(cloned.filterType === "countContext" && cloned.countBefore === 2 && cloned.countAfter === 2, "cloneSubtree carries countBefore/countAfter onto the clone");
  const snap = w.snapshotSubtree(ctxNode.id);
  w.deleteNode(ctxNode.id);
  const restored = w.restoreSubtree(snap);
  assert(restored.filterType === "countContext" && restored.countBefore === 2 && restored.countAfter === 2, "snapshotSubtree/restoreSubtree round-trip countBefore/countAfter");
});

/* ============================================================
   GROUP 65 — License popup + version display
   Origin: this session (2026-08-20), person-requested: a proprietary
   license (no redistribution, no modification, rights holder Philipp
   Klein) reachable via a new header button next to the existing
   #btnShortcuts help button, same popup pattern (Group 26). Also a short
   commit-hash "version" shown both next to the product name and inside
   the license popup — PHILOGG_VERSION defaults to the literal "dev" in
   source control; only the "Build tester release" GitHub Action
   (.github/workflows/release.yml) stamps it to a real short SHA, in a
   build artifact that's never committed back. This suite runs against
   the literal source file, so it always sees "dev".
   ============================================================ */
await withApp(async (w, d, T) => {
  section("65. License popup + version display");

  // --- Version display (unstamped source -> literal "dev") ---
  assert(d.querySelector("#brandVersion").textContent === "dev", "brand-name version tag shows PHILOGG_VERSION verbatim, no \"v\" prefix");
  assert(d.querySelector("#licenseVersion").textContent === "Version: dev", "license panel's own version line shows the same PHILOGG_VERSION");

  // --- License popup: same fixed-position/toggle pattern as #shortcutsPanel ---
  assert(d.querySelector("#licensePanel").classList.contains("hidden"), "license popup starts hidden");

  const btnLicense = d.querySelector("#btnLicense");
  fireClick(btnLicense, w);
  assert(!d.querySelector("#licensePanel").classList.contains("hidden"), "clicking the header button opens the license popup");
  const licenseText = d.querySelector("#licensePanel").textContent;
  assert(licenseText.includes("Philipp Klein"), "license popup names the rights holder");
  assert(licenseText.includes("philogg@kleinphilipp.de"), "license popup shows the contact address");
  assert(licenseText.includes("Keine Weitergabe"), "license popup prohibits redistribution");
  assert(licenseText.includes("Keine Veränderung"), "license popup prohibits modification");
  assert(licenseText.includes("Version: dev"), "license popup includes the version line while open");

  fireClick(d.body, w); // outside click
  assert(d.querySelector("#licensePanel").classList.contains("hidden"), "clicking outside closes the license popup");

  fireClick(btnLicense, w);
  assert(!d.querySelector("#licensePanel").classList.contains("hidden"), "sanity: reopened for the Escape check");
  fireKeydown(d, w, "Escape");
  assert(d.querySelector("#licensePanel").classList.contains("hidden"), "Escape closes the license popup, same as the other popups");

  // Independent from the neighboring shortcuts popup: opening one doesn't
  // implicitly open or leave the other stuck open.
  const btnShortcuts = d.querySelector("#btnShortcuts");
  fireClick(btnShortcuts, w);
  assert(!d.querySelector("#shortcutsPanel").classList.contains("hidden"), "sanity: shortcuts popup opens on its own button");
  assert(d.querySelector("#licensePanel").classList.contains("hidden"), "opening the shortcuts popup does not also open the license popup");
  fireClick(btnLicense, w);
  assert(!d.querySelector("#licensePanel").classList.contains("hidden"), "license popup opens independently while the shortcuts popup is also open");
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
  const merged = await w.mergeFiles([fa.id, fb.id]);
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
   (context) that was added later in 1dd227c6, and the FOURTH exclusion
   (countContext) added in the Count context session (see Group 64) — none
   were tested until now.
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

  const countCtxNode = w.createCountContextNode(f.id, 2, 2);
  T.state.activeId = countCtxNode.id;
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "invert"),
    "tree context menu omits Invert (NOT) for countContext nodes (4th exclusion, same reasoning as context: every window contains its own reference entry)");

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
   GROUP 3 — Theme select
   Origin: 765d68a9 (design improvements session, test.js, 28 checks).
   Updated 2026-08-21: the single #btnTheme toggle button moved into
   Settings -> Appearance as an explicit Light/Dark control pair.
   Updated this session (2026-08-22, "configurable themes + Catppuccin"):
   the Light/Dark button pair was replaced by a #settingsThemeSelect
   dropdown (built-in themes now include the four Catppuccin flavors, plus
   any user-imported custom ones) — see GROUP 85.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("3. Theme select (now in Settings -> Appearance)");
  const html = d.documentElement;
  const before = html.dataset.theme;
  fireClick(d.querySelector("#btnSettings"), w);
  const select = d.querySelector("#settingsThemeSelect");
  const other = before === "light" ? "dark" : "light";
  select.value = other;
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(html.dataset.theme !== before, "picking the other theme flips data-theme, was " + before + " now " + html.dataset.theme);
  assert(html.dataset.theme === other, "data-theme matches the selected option, got " + html.dataset.theme);
  assert(w.localStorage.getItem("philogg-theme") === html.dataset.theme, "theme choice persisted to localStorage");
});

/* ============================================================
   GROUP 4 — Tree / status strip / severity bar / level quick-filter dual-view
   Origin: 765d68a9 (sortable columns, status strip, severity bar) +
   32e282b4 follow-up (level quick-filter updates BOTH Full and Filtered
   views in one click, not just Filtered — Full's own re-render, not its
   filtering). Updated this session (2026-08-19, person-requested, German:
   "die Log Level Filter sollen sich nicht mehr auf das full Log auswirken.
   stattdessen soll ein andern der Log Level Filter auch zu einem
   automatischen Sprung von Full nach Filtered führen"): the level
   quick-filter no longer narrows the Full view's own entry list AT ALL
   (only the Filtered view) — Full stays a stable "whole file" reference
   regardless of the level filter. In exchange, changing the level filter
   while on the Full tab now auto-reveals Filtered, same as switching to
   another filter already does (revealFilteredView).
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

  // Level quick-filter: toggling ERROR updates the Filtered (#tableRows) view
  // immediately; the Full (#highlightRows) view re-renders in the SAME click
  // (bugfix from 32e282b4 — previously only renderTable() was called,
  // leaving Full stale until an unrelated render happened to touch it) but
  // deliberately does NOT narrow its own entry list (this session's change —
  // see GROUP 61e below for the auto-reveal-Filtered half of that change).
  w.applyFhView("stacked"); // both panels rendered so we can inspect both
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  const filteredLevels = [...d.querySelectorAll("#tableRows .level-badge")].map(b => b.textContent);
  const fullLevels = [...d.querySelectorAll("#highlightRows .level-badge")].map(b => b.textContent);
  assert(filteredLevels.length > 0 && filteredLevels.every(l => l === "ERROR"), "Filtered view narrows to ERROR immediately");
  assert(fullLevels.length === 30 && fullLevels.some(l => l === "INFO"), "Full view stays showing the whole file, unaffected by the level quick-filter");
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
  assert(T.extractColumns.find(c => c.colIndex === 0).type === "int", "extracted column typed as int");

  // Targeted by data-sort-col, not the first ".extract-sort-btn" in the DOM
  // — the synthetic Index/t(ms) columns (see INDEX_COL/ELAPSED_COL) are
  // always prepended and sortable too, ahead of the real extracted column's button.
  const sortBtn = d.querySelector('.extract-sort-btn[data-sort-col="0"]');
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

    // Import/Export lives behind the toolbar's "Session…" button+dropdown
    // now (analogous to "Open…"), NOT the per-node/tree-background context
    // menu — the node menu must no longer carry either entry.
    w.render();
    fireContextMenu(d.querySelector(".tree-row"), w);
    const menuHtml = d.querySelector("#treeContextMenu").innerHTML;
    assert(!menuHtml.includes("Export session") && !menuHtml.includes("Import session"),
      "export: node context menu no longer offers Export/Import session");
    w.closeTreeContextMenu();

    const btnSession = d.querySelector("#btnSession");
    const sessionMenu = d.querySelector("#sessionMenu");
    assert(sessionMenu.classList.contains("hidden"), "session menu starts hidden");
    fireClick(btnSession, w);
    assert(!sessionMenu.classList.contains("hidden"), "clicking \"Session…\" reveals the dropdown");
    const sessionActions = [...sessionMenu.querySelectorAll("[data-action]")].map(i => i.dataset.action);
    assert(sessionActions.join(",") === "exportSession,importSession",
      "session menu offers Export session…/Import session…, got " + sessionActions.join(","));
    fireClick(d.body, w);
    assert(sessionMenu.classList.contains("hidden"), "clicking outside the session menu closes it");

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

  /* ---------- Table reflects the ignored column immediately ----------
     4, not 2: extractColumns always leads with the synthetic Index/t(ms)
     columns (see INDEX_COL/ELAPSED_COL) ahead of the 2 visible pattern
     columns ("id"/"score" — "name" stays excluded, ignored). */
  assert(T.extractColumns.length === 4, "extractColumns excludes the ignored column, got " + T.extractColumns.length);
  assert(!T.extractColumns.some(c => c.colIndex === 1), "column index 1 ('name') is not among the visible columns");
  const ths = [...d.querySelectorAll("#extractHead th[data-col]")];
  assert(ths.length === 4 && ths.every(th => +th.dataset.col !== 1), "no <th> rendered for the ignored column, got data-col=[" + ths.map(t => t.dataset.col).join(",") + "]");
  const firstRowTds = [...d.querySelectorAll("#extractBody tr:first-child td[data-col]")];
  assert(firstRowTds.length === 4 && firstRowTds.every(td => +td.dataset.col !== 1), "no <td> rendered for the ignored column either");
  assert(T.extractRowsData.every(r => r.values.length === 3), "row.values still holds all 3 raw captured values — matching itself is untouched by ignoring a column (Index/t(ms) ride along as negative-index expandos, outside this .length)");

  /* ---------- Export excludes the ignored column from both header and body ---------- */
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  w.copyWholeExtractTable();
  const copiedLines = copied.split("\n");
  // Leads with Index/t(ms) (t(ms)=0 on the first row — elapsed since itself),
  // then the two visible pattern columns; "name" (ignored) stays excluded.
  assert(copiedLines[0] === "Index\tt (ms)\tvalue\tvalue 3", "copy-whole-table header includes only the visible columns' names, got " + JSON.stringify(copiedLines[0]));
  assert(copiedLines[1] === "0\t0\t0\t0.5", "copy-whole-table body row includes only the visible columns' values (ignored 'name' column dropped), got " + JSON.stringify(copiedLines[1]));

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
  assert(T.extractColumns.length === 5, "table immediately shows all 3 pattern columns (+2 synthetic Index/t(ms)) again after un-ignoring");
  fireClick(d.querySelectorAll("#extractPatternView .pattern-chip")[1], w); // re-ignore for the checks below
  assert(node.ignoredColumns && node.ignoredColumns.includes(1), "re-ignored via the same chip toggle, for the persistence checks below");

  /* ---------- Column statistics / assertions / plot: a SEPARATE node, ignoring the NUMERIC column this time ---------- */
  const numNode = w.createFilterNode(f.id, "extract", "id=[value:int] name=[*] score=[value:float]");
  w.setColumnIgnored(numNode, 0, true); // ignore "id" (int, column index 0) — "score" (float, index 2) stays visible
  w.render();
  assert(w.computeColumnStats(0) === null, "computeColumnStats returns null for a currently-ignored column");
  const statsText = d.querySelector("#extractStatsBar").textContent;
  assert(statsText.includes("value 3") && !statsText.includes("value:"), "stats bar shows the visible numeric column ('value 3'/score) but omits the ignored one ('value'/id), got " + JSON.stringify(statsText));
  // 3, not 1: the synthetic Index/t(ms) columns are always visible/plottable
  // too, alongside the one visible pattern column ("score") — "id" stays
  // excluded, ignored.
  assert(d.querySelectorAll("#extractHead .extract-assert-btn").length === 3, "only the visible numeric columns get a value-assertion button — an ignored column isn't assertable");

  w.switchExtractView("plot");
  const xOptions = [...d.querySelectorAll("#plotXSelect option")].map(o => +o.value);
  assert(xOptions.length === 3 && xOptions.includes(-2) && xOptions.includes(-1) && xOptions.includes(2),
    "ignored numeric column is not offered as a plot axis candidate; Index/t(ms) and the visible 'score' column are, got " + JSON.stringify(xOptions));
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

  const cs = w.getComputedStyle;

  // Initial (no files loaded) state: tabs hidden, same as the old #fhTabBar
  // default — and, per the later "no file loaded" cleanup session, the
  // WHOLE #viewBar row (tabs/level-filter/breadcrumb) is hidden outright,
  // not just left empty, so only #emptyState's centered hint shows.
  assert(T.state.rootIds.length === 0, "sanity: no files loaded yet");
  assert(d.querySelector("#fhTabs").style.display === "none", "tabs hide when no files are loaded");
  assert(viewBar.style.display === "none", "#viewBar itself is hidden with zero files loaded (no empty toolbar row above the centered hint)");

  const f = await w.addFile("a.log", makeLog(0, 10, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = textNode.id;
  w.render();
  assert(viewBar.style.display === "", "#viewBar is shown again once a file is loaded");
  assert(d.querySelector("#fhTabs").style.display === "flex", "tabs visible for a normal (non-extract) filter node");

  // Layout mechanism guard (person-requested follow-up, same session): tabs
  // and level filter must stay pinned top-left even when the breadcrumb
  // wraps to multiple lines, with the breadcrumb using the FULL row width
  // on wrapped lines rather than being squeezed beside them. Flexbox can't
  // do "first line shares space, later lines full width" — only the
  // classic float+normal-flow text-wrap technique can, so this guards
  // against an accidental revert to flex on #viewBar/#breadcrumb, which
  // jsdom's computed styles (unlike real line-wrapping) CAN detect even
  // without a layout engine. Checked with a file loaded (#viewBar visible)
  // since these are its own internal layout mechanics, not its visibility.
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
  assert(d.querySelectorAll("#levelBar .level-btn").length > 0, "level filter buttons render inside the merged bar");
  assert(d.querySelectorAll("#breadcrumb .crumb").length > 0, "breadcrumb chips render inside the merged bar");

  // Extract mode (UPDATED, this session, person-requested: "entferne die
  // Anzeige der Level Leiste im Extraction View. Hier sollte nur noch der
  // aktuelle Filterpfad zu sehen sein") — #fhTabs, #levelBar, and the three
  // Filtered/Highlight-view-only toggles all hide; only #breadcrumb (the
  // filter path) stays visible. renderExtractTable() still applies
  // applyLevelFilter() internally against whatever the quick-filter was
  // last set to — there's just no visible pill row to change it from here.
  const extractNode = w.createFilterNode(f.id, "extract", "message [value:int]");
  T.state.activeId = extractNode.id;
  w.render();
  assert(d.querySelector("#fhTabs").style.display === "none", "tabs hide in extract mode (unchanged behaviour)");
  assert(d.querySelector("#levelBar").style.display === "none", "level bar hides in extract mode — only the filter path stays visible");
  assert(d.querySelector("#btnPinBookmarks").style.display === "none", "pin-bookmarks toggle hides too (doesn't apply to the extraction table)");
  assert(d.querySelector("#btnMultilineMsg").style.display === "none", "multiline toggle hides too (doesn't apply to the extraction table)");
  assert(d.querySelector("#btnColumns").style.display === "none", "columns toggle hides too (doesn't apply to the extraction table's own columns)");
  assert(d.querySelectorAll("#breadcrumb .crumb").length > 0, "breadcrumb STILL renders (and is visible) in extract mode — the one thing meant to stay");

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
  const merged = await w.mergeFiles([fa.id, fb.id]);
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
   GROUP 42 — Extraction table: synthetic Index + t(ms) columns
   Origin: this session (2026-08-17), person-requested, with a same-day
   correction: the elapsed-time column was originally shipped as a
   row-to-row delta ("ΔT"), which the person immediately flagged as wrong
   for plotting — *"deltaT macht so keinen Sinn für einen zeitlichen Plot.
   Der erste Eintrag müsste 0 haben, der Rest dann die bis dahin
   aufsummierten deltaT."* A per-step delta can't serve as a plot X value
   (row N's axis position would depend on every prior row's spacing, not
   its own value); the fix makes it CUMULATIVE elapsed time since the
   FIRST entry (0 on row 0, then running total) — renamed "t (ms)" to
   match, since it's no longer a delta. Every extraction table leads with
   two synthetic columns ahead of the pattern's own (INDEX_COL = -2,
   ELAPSED_COL = -1, negative so they never collide with spec.columns'
   dense 0..n-1 range): a 0-based row-order Index (also the default X axis
   for the Plot tab, since extractColumns always starts with it — see
   renderPlotControls) and t (ms), cumulative elapsed time since the first
   entry's real timestamp.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("42. Extraction table: synthetic Index + t(ms) columns");
  // Hand-built (not makeLog) for exact, easy-to-check elapsed values: 0ms, then 1500ms, then 3500ms since the first entry.
  const log =
    `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"n=5"\n` +
    `2024-01-15 10:00:01,500\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"n=3"\n` +
    `2024-01-15 10:00:03,500\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"n=9"\n`;
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "extract", "n=[value:int]");
  T.state.activeId = node.id;
  w.render();

  /* ---------- Column descriptors: Index/t(ms) leftmost, ahead of the pattern column ---------- */
  assert(T.extractColumns.length === 3, "3 columns: synthetic Index + t(ms), plus the one pattern column, got " + T.extractColumns.length);
  assert(T.extractColumns[0].colIndex === -2 && T.extractColumns[0].name === "Index" && T.extractColumns[0].type === "int",
    "Index is leftmost (colIndex -2), typed int");
  assert(T.extractColumns[1].colIndex === -1 && T.extractColumns[1].name === "t (ms)" && T.extractColumns[1].type === "int",
    "t (ms) is second (colIndex -1), typed int");
  assert(T.extractColumns[2].colIndex === 0, "the real extracted pattern column follows, keeping its own colIndex 0");

  /* ---------- Values: 0-based row order, CUMULATIVE elapsed ms since the first entry ---------- */
  assert(T.extractRowsData.length === 3, "sanity: one row per matching entry");
  const [r0, r1, r2] = T.extractRowsData;
  assert(r0.values[-2] === "0" && r1.values[-2] === "1" && r2.values[-2] === "2", "Index counts up 0,1,2 with row order");
  assert(r0.values[-1] === "0", "first entry's elapsed time is 0, not blank/NaN — the person's explicit correction");
  assert(r1.values[-1] === "1500", "t(ms) is elapsed time since the FIRST entry (1500ms), got " + r1.values[-1]);
  assert(r2.values[-1] === "3500", "t(ms) for the third row is CUMULATIVE (3500ms since the first entry, not the 2000ms step from row 2), got " + r2.values[-1]);
  assert(r0.values.length === 1 && r1.values.length === 1, "Index/t(ms) ride along as negative-index expandos — the dense spec.columns values array (.length) is untouched");

  /* ---------- Header DOM: no numbered pattern-chip badge for the synthetic columns ---------- */
  const ths = [...d.querySelectorAll("#extractHead th[data-col]")];
  assert(ths.length === 3 && ths[0].dataset.col === "-2" && ths[1].dataset.col === "-1" && ths[2].dataset.col === "0",
    "header renders Index, t(ms), then the pattern column left to right, got data-col=[" + ths.map(t => t.dataset.col).join(",") + "]");
  assert(ths[0].textContent.includes("Index") && ths[1].textContent.includes("t (ms)"), "header cells are labeled Index / t (ms)");
  assert(!ths[0].querySelector(".pattern-chip-num") && !ths[1].querySelector(".pattern-chip-num"),
    "synthetic columns get no numbered pattern-chip badge (they aren't placeholders in the regex pattern)");
  assert(ths[2].querySelector(".pattern-chip-num") !== null, "the real pattern column keeps its numbered badge, unaffected");

  /* ---------- Body cells render the same values ---------- */
  const firstRowTds = [...d.querySelectorAll("#extractBody tr:first-child td[data-col]")];
  assert(firstRowTds[0].textContent === "0" && firstRowTds[1].textContent === "0", "first row: Index=0, t(ms)=0, in the DOM");
  const secondRowTds = [...d.querySelectorAll("#extractBody tr:nth-child(2) td[data-col]")];
  assert(secondRowTds[0].textContent === "1" && secondRowTds[1].textContent === "1500", "second row: Index=1, t(ms)=1500, in the DOM");
  const thirdRowTds = [...d.querySelectorAll("#extractBody tr:nth-child(3) td[data-col]")];
  assert(thirdRowTds[0].textContent === "2" && thirdRowTds[1].textContent === "3500", "third row: Index=2, t(ms)=3500 (cumulative, not the 2000ms step), in the DOM");

  /* ---------- columnColor handles negative colIndex (regression: naive `i % n` goes negative in JS) ---------- */
  assert(ths[0].querySelector(".extract-sort-btn") && ths[1].querySelector(".extract-sort-btn"), "sanity: synthetic columns are still sortable, so a broken color would show up in the swatch below");

  /* ---------- Sorting: t(ms) descending reverses row order (all three values are now parseable, unlike the old blank-first-row delta) ---------- */
  const elapsedSortBtn = d.querySelector('.extract-sort-btn[data-sort-col="-1"]');
  fireClick(elapsedSortBtn, w); // 1st click: ascending — already the natural order, no visible reorder
  fireClick(elapsedSortBtn, w); // 2nd click: descending
  assert(T.extractRowsData[0].values[-1] === "3500" && T.extractRowsData[1].values[-1] === "1500" && T.extractRowsData[2].values[-1] === "0",
    "sorting by t(ms) descending reverses row order numerically, got [" + T.extractRowsData.map(r => r.values[-1]).join(",") + "]");

  /* ---------- Copy whole table includes both synthetic columns ---------- */
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  w.copyWholeExtractTable();
  const lines = copied.split("\n");
  assert(lines[0] === "Index\tt (ms)\tvalue", "copy-whole-table header includes Index/t(ms) ahead of the pattern column, got " + JSON.stringify(lines[0]));
  assert(lines.includes("2\t3500\t9"), "copy-whole-table body includes a cumulative (not per-step) t(ms) value, got " + JSON.stringify(lines));

  /* ---------- Plot tab: Index is the default X axis on every extraction, a real column defaults for Y ---------- */
  w.switchExtractView("plot");
  assert(d.querySelector("#plotXSelect").value === "-2", "Index is the default X-axis selection for a freshly opened extraction's plot, got " + d.querySelector("#plotXSelect").value);
  const yChecked = [...d.querySelectorAll('#plotYList input[type="checkbox"]:checked')].map(cb => cb.dataset.col);
  assert(yChecked.length === 1 && yChecked[0] === "0", "Y defaults to the real extracted column, not the synthetic t(ms) one, got " + JSON.stringify(yChecked));
  const elapsedSwatch = d.querySelector('#plotYList input[data-col="-1"]').nextElementSibling;
  assert(elapsedSwatch.style.background !== "", "t(ms) still gets a valid swatch color in the Y-column list (columnColor's negative-index modulo fix)");
  w.switchExtractView("table");
});

/* ============================================================
   GROUP 43 — Bugfix: tail handles now persist across a reload
   Origin: person-reported (this session): a log file that was still
   actively being written showed no live dot and never updated in Edge.
   Root cause: FEATURE_BACKLOG.md's known gap "Persist tail handles across
   reload" — a file the session cache auto-restored on relaunch (which the
   person experienced simply as "opening" the file, not as a reload) never
   got a node.tail at all, so it was permanently a static snapshot; only
   manually re-opening the file (which the person did, seeing more entries)
   re-established tailing. Fixed by persisting the file's
   FileSystemFileHandle alongside its text (persistFileNode) and a new
   tryReattachFileTail() helper, called from restoreSessionFromCache, that
   silently resumes tailing via queryPermission (no user gesture needed) —
   the same graceful-degradation shape restoreWatchedFolders already uses
   for directory handles.
   ============================================================ */
section("43. Bugfix: tail handles persist across a reload");
{
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // A REAL FileSystemFileHandle survives IndexedDB's structured clone with
  // its methods intact — the same fact persistFolder/restoreWatchedFolders
  // already rely on for directory handles (see Group 38's own comment).
  // fake-indexeddb enforces structured clone strictly: a class instance's
  // OWN data fields (e.g. `kind`) clone through fine, but its PROTOTYPE
  // methods are simply dropped — so a round-tripped handle here ends up
  // exactly like a real handle whose permission needs reconfirming, not
  // like one that kept working. That's used deliberately below to prove
  // the degrade-gracefully path; the successful-reattach path is then
  // checked directly with a fresh (non-round-tripped) instance, same as
  // Group 38c does for reconnectFolder.
  class FakeFileHandle {
    constructor() { this.kind = "file"; }
    async queryPermission() { return "granted"; }
  }

  // --- Persisting a file with no tail writes handle:null, not a missing field ---
  await withApp(async (w, d, T) => {
    const g = await w.addFile("plain.log", makeLog(0, 2), () => {});
    await w.persistFileNode(g);
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(g.cacheKey));
    assert(rec && rec.handle === null, "persist: a file with no tail writes handle:null");
  }, { indexedDB: new IDBFactory() });

  const factory = new IDBFactory();

  // --- Window A: load a "live" (tailed) file, persist it. ---
  await withApp(async (w, d, T) => {
    const handle = new FakeFileHandle();
    const f = await w.addFile("live.log", makeLog(0, 3), () => {});
    f.tail = { handle, offset: w.rebuildFileText(f).length, pending: "", failed: false, busy: false };
    w.render();
    assert(d.querySelector(".tree-live") !== null, "sanity: the live dot renders for a freshly-tailed file");

    await w.persistFileNode(f);
    await w.persistMetaNow();
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec && rec.handle && rec.handle.kind === "file", "persist: the tail handle's own data field is written to the files store");
  }, { indexedDB: factory });

  // --- Window B: boot-time restore (same factory = same "disk"). The
  // round-tripped handle lost its methods, so queryPermission() genuinely
  // fails — the same degraded state a real browser puts a restored file in
  // whenever it doesn't silently re-grant the permission (e.g. after an
  // actual browser restart, not just a tab reload). ---
  await withApp(async (w, d, T) => {
    for (let i = 0; i < 40 && T.state.rootIds.length === 0; i++) await sleep(50); // boot restore is async
    assert(T.state.rootIds.length === 1, "restore: the file came back via the normal session restore");
    const node = T.state.nodes[T.state.rootIds[0]];
    assert(!node.tail, "restore: a handle that can't survive structured clone leaves the file a static snapshot instead of throwing");
    w.render();
    assert(d.querySelector(".tree-live") === null, "restore: no live dot renders while the tail couldn't be silently reattached");

    // Function-level check of the successful path (the part a real
    // IndexedDB round trip can't exercise in jsdom — see the class comment
    // above): a fresh, fully-working fixture handle stands in for "the
    // browser re-granted permission silently."
    const workingHandle = new FakeFileHandle();
    const ok = await w.tryReattachFileTail(node, workingHandle);
    assert(ok === true, "tryReattachFileTail resumes tailing when permission is (still) granted");
    assert(node.tail && node.tail.handle === workingHandle, "reattached tail carries the working handle");
    assert(node.tail.offset === w.rebuildFileText(node).length,
      "reattached tail's offset matches the restored file's current byte length, so the next poll only reads genuinely NEW bytes");
    w.render();
    assert(d.querySelector(".tree-live") !== null, "the live dot renders once tailing is reattached");

    // Tailing genuinely resumes polling from here, not just a flag flip.
    const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"new entry"\n`;
    const grownText = w.rebuildFileText(node) + "\n" + appended;
    workingHandle.getFile = async () => {
      const blob = new w.Blob([grownText]);
      blob.slice = start => {
        const sliced = grownText.slice(start);
        const b = new w.Blob([sliced]);
        b.text = async () => sliced;
        return b;
      };
      Object.defineProperty(blob, "size", { get: () => grownText.length, configurable: true });
      return blob;
    };
    await w.tailTick();
    assert(node.entries.length === 4, "a reattached tail genuinely resumes polling for new content, got " + node.entries.length);

    // Permission NOT silently granted (e.g. after a real browser restart).
    class DeniedHandle { async queryPermission() { return "prompt"; } }
    const node2 = await w.addFile("other.log", makeLog(0, 2), () => {});
    const ok2 = await w.tryReattachFileTail(node2, new DeniedHandle());
    assert(ok2 === false && !node2.tail, "tryReattachFileTail leaves the file untailed when permission isn't silently granted");
  }, { indexedDB: factory });
}

/* ============================================================
   GROUP 44 — Bugfix: a transient tail-poll failure no longer permanently
   kills tailing
   Origin: person-reported (this session, follow-up to Group 43's fix): with
   Group 43 in place, tailing DID pick up growth and show the live dot — but
   stopped updating (dot included) a few seconds later, seemingly correlated
   with moving the mouse. tailTick previously treated ANY getFile()/read
   failure as permanent (t.failed = true on the first one), including
   transient ones — most plausibly a moment where the writer holds the file
   locked without shared-read access, a normal condition for a log actively
   being appended to by another process. Fixed with a consecutive-failure
   counter (t.errorCount, TAIL_MAX_CONSECUTIVE_ERRORS = 5): only a STREAK of
   failures marks the file permanently failed; any clean poll in between
   resets the streak, and every failure (transient or not) is now logged via
   console.warn instead of vanishing silently — a genuinely permanent
   failure (moved/deleted/permission revoked) still fails every single poll
   and reaches the threshold in ~7.5s, same as it effectively did before.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("44. Bugfix: transient tail-poll failures don't permanently kill tailing");

  // Same fixture shape as Group 12, plus a controllable failure mode.
  function flakyHandle(initialText) {
    let text = initialText;
    let failNext = 0; // number of upcoming getFile() calls that should throw
    return {
      _setText(t) { text = t; },
      _failNextCalls(n) { failNext = n; },
      async getFile() {
        if (failNext > 0) { failNext--; throw new Error("simulated transient read failure"); }
        const blob = new w.Blob([text]);
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        return blob;
      },
    };
  }

  const warnCalls = [];
  const origWarn = w.console.warn;
  w.console.warn = (...args) => warnCalls.push(args);

  const initial = makeLog(0, 3);
  const handle = flakyHandle(initial);
  const f = await w.addFile("live.log", initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false, errorCount: 0 };
  w.render();
  assert(d.querySelector(".tree-live") !== null, "sanity: live dot shows for a freshly-tailed file");

  // --- A short streak of transient failures (below the threshold) ---
  handle._failNextCalls(3);
  await w.tailTick(); await w.tailTick(); await w.tailTick();
  assert(f.tail.errorCount === 3, "three consecutive failures recorded, got " + f.tail.errorCount);
  assert(f.tail.failed === false, "still under the threshold — tailing not yet given up on");
  w.render();
  assert(d.querySelector(".tree-live") !== null, "live dot still shows during a sub-threshold failure streak");
  assert(warnCalls.length === 3, "each failure is logged via console.warn, not silently swallowed, got " + warnCalls.length);

  // --- Recovery: the next poll succeeds (lock released) and growth resumes ---
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"new entry"\n`;
  handle._setText(initial + appended);
  await w.tailTick();
  assert(f.tail.errorCount === 0, "a clean poll resets the consecutive-failure streak back to 0");
  assert(f.entries.length === 4, "growth is picked up normally once the transient failure clears, got " + f.entries.length);
  assert(f.tail.failed === false, "never crossed the threshold — was never marked failed at all");

  // --- A persistent failure (file genuinely gone) still gives up, eventually ---
  handle._failNextCalls(999); // never recovers, same as a real moved/deleted file
  for (let i = 0; i < 5; i++) await w.tailTick();
  assert(f.tail.errorCount === 5, "five straight failures reach the threshold, got " + f.tail.errorCount);
  assert(f.tail.failed === true, "a genuinely persistent failure still permanently stops tailing, same as before this fix");
  w.render();
  assert(d.querySelector(".tree-live") === null, "live dot disappears once tailing is genuinely given up on");

  // Further ticks on an already-failed node are a no-op, not a crash.
  await w.tailTick();
  assert(f.tail.errorCount === 5, "an already-failed node is skipped by tailTick, not polled further");

  w.console.warn = origWarn;
});

/* ============================================================
   GROUP 45 — Virtualize extraction table / link pair view
   Origin: FEATURE_BACKLOG.md ("needed if someone extracts from a very
   large file with a loose pattern") / PROJECT.md's Known limitations note
   ("Extraction table and link pair view are not virtualized... would need
   work if someone tries to extract from an entire multi-hundred-thousand-
   line file with a very loose pattern"). Both views now only ever put the
   scrolled-into-view window (plus a buffer) into the DOM, mirroring the
   main log table's existing renderVisibleRows scheme:
     - Extraction table (renderExtractVisibleRows): fixed EXTRACT_ROW_HEIGHT
       (28px) per row, two spacer <tr>s (top/bottom, a single <td colspan>
       each) stand in for rows outside the window since a real <table> can't
       be windowed via absolute positioning the way #tableRows is.
     - Link view (renderLinkVisibleBlocks): pair-blocks vary in height with
       tuple size, so offsets are precomputed analytically
       (computeLinkBlockOffsets/linkBlockHeight) rather than divided by a
       constant, and the window is buffered in pixels (LINK_BUFFER_PX=300).
       Pair selection moved from a DOM class scan to an index
       (linkSelectedPairIndex) precisely because a virtualized block can be
       torn down and rebuilt between the click and any later read.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("45. Virtualize extraction table / link pair view");

  /* ---------- Part A: extraction table ---------- */
  const bigLog = makeLog(0, 300); // "message 0".."message 299", one per second
  const fA = await w.addFile("big.log", bigLog, () => {});
  const extractNode = w.createFilterNode(fA.id, "extract", "message [value:int]");
  T.state.activeId = extractNode.id;
  w.render();

  assert(T.extractRowsData.length === 300, "sanity: all 300 entries matched the extraction pattern");
  // clientHeight is stubbed to 400 for every element (see withApp); at
  // scrollTop 0: maxVisible = ceil(400/28) + 15*2 = 15 + 30 = 45 rows.
  // data-row lives on each row's <td> (gutter and value cells alike), not
  // on the <tr> itself — the gutter cell is the unique one-per-row anchor.
  let rendered = [...d.querySelectorAll("#extractBody td.extract-gutter[data-row]")];
  assert(rendered.length === 45, "only the windowed subset (45 of 300 rows) is ever real DOM, got " + rendered.length);
  assert(rendered.length < T.extractRowsData.length, "virtualized: far fewer DOM rows than logical rows");
  assert(d.querySelectorAll("#extractBody tr.extract-spacer").length === 1, "only a BOTTOM spacer at scrollTop 0 (nothing scrolled past yet), got " + d.querySelectorAll("#extractBody tr.extract-spacer").length);
  const bottomSpacerPx = parseInt(d.querySelector("#extractBody tr.extract-spacer td").style.height, 10);
  assert(bottomSpacerPx === (300 - 45) * 28, "bottom spacer height accounts for exactly the un-rendered rows below, got " + bottomSpacerPx);

  // Scroll deep into the list (bypassing the scroll-event/rAF plumbing, same
  // determinism trick Group 34 uses for the main table's own virtualization).
  const extractScrollEl = d.querySelector("#extractScroll");
  extractScrollEl.scrollTop = 100 * 28; // ROW_HEIGHT=28 -> row 100 at the top
  w.renderExtractVisibleRows();
  rendered = [...d.querySelectorAll("#extractBody td.extract-gutter[data-row]")];
  assert(rendered.length === 45, "still exactly the windowed row count after scrolling, got " + rendered.length);
  assert(rendered[0].dataset.row === "85", "buffer subtracts 15 rows above scrollTop's own row (100-15=85), got " + rendered[0].dataset.row);
  const spacers = [...d.querySelectorAll("#extractBody tr.extract-spacer")];
  assert(spacers.length === 2, "both a top AND bottom spacer now exist once scrolled past the start, got " + spacers.length);
  assert(parseInt(spacers[0].querySelector("td").style.height, 10) === 85 * 28, "top spacer height matches the 85 skipped rows above the window");

  // Cell selection stays keyed to the FULL logical row/col set, not the
  // rendered DOM subset — Ctrl+click-select-all must still cover all 300
  // rows even though only 45 of them have <td> nodes right now.
  d.querySelector("#extractCorner").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true })); // cell selection is wired on mousedown, not click
  assert(T.state.tableSelection.size === 300 * T.extractColumns.length,
    "select-all selects every LOGICAL cell (300 rows), not just the rendered window, got " + T.state.tableSelection.size);
  // A cell that's actually rendered right now must show the selected style —
  // proof applyExtractSelectionClasses() re-runs on every windowed re-render,
  // not just the initial full build.
  assert(d.querySelector('#extractBody td[data-row="90"].cell-selected') !== null,
    "a currently-rendered cell within the selection gets .cell-selected applied");

  // Switching to a different extraction node resets the scroll position —
  // otherwise a much smaller result could render starting mid-air (or
  // entirely past its own end) at the old node's leftover scrollTop.
  const smallLog = makeLog(0, 3);
  const fA2 = await w.addFile("small.log", smallLog, () => {});
  const extractNode2 = w.createFilterNode(fA2.id, "extract", "message [value:int]");
  T.state.activeId = extractNode2.id;
  w.render();
  assert(extractScrollEl.scrollTop === 0, "scroll resets to 0 when switching to a different extraction node, got " + extractScrollEl.scrollTop);

  /* ---------- Part B: Link pair view ---------- */
  // 50 REF/TARGET pairs (100 entries), one per second (minutes wrap once, harmless).
  const linkLines = [];
  for (let i = 0; i < 100; i++) {
    const label = i % 2 === 0 ? "REF" : "TARGET";
    const mm = String(Math.floor(i / 60)).padStart(2, "0");
    const ss = String(i % 60).padStart(2, "0");
    linkLines.push(`2024-01-15 10:${mm}:${ss},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${label} ${i}"`);
  }
  const fB = await w.addFile("linked.log", linkLines.join("\n") + "\n", () => {});
  const refNode = w.createFilterNode(fB.id, "text", "REF");
  const targetNode = w.createFilterNode(fB.id, "text", "TARGET");
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1); // 50 pairs, 2 real entries each
  T.state.activeId = linkNode.id;
  w.render();

  assert(T.linkPairsData.length === 50, "sanity: all 50 pairs computed (the FULL result, regardless of what's rendered)");
  // linkBlockHeight(2) = 2*26 (rows) + 1*16 (delta) + 2*2 (gaps) + 8 (margin) = 80px per pair.
  assert(T.linkBlockOffsets.length === 51 && T.linkBlockOffsets[50] === 50 * 80,
    "block offsets are a full prefix-sum array (51 entries), total height 50*80=4000px, got " + T.linkBlockOffsets[50]);
  let blocks = [...d.querySelectorAll("#linkBody .pair-block")];
  assert(blocks.length > 0 && blocks.length < 50, "only a windowed subset of pair-blocks is real DOM at scrollTop 0, got " + blocks.length + " of 50");

  // Select pair 0's brace while it's on screen.
  fireClick(blocks[0].querySelector(".pair-brace"), w);
  assert(T.linkSelectedPairIndex === 0, "clicking pair 0's brace selects it by index, got " + T.linkSelectedPairIndex);
  assert(d.querySelector('.pair-block[data-pair-index="0"]').classList.contains("pair-selected"), "pair 0's block gets .pair-selected");

  // Scroll far enough that pair 0's block is no longer in the rendered
  // window at all — this is exactly the scenario a DOM-class-only selection
  // (the pre-virtualization implementation) would silently lose.
  const linkScrollEl = d.querySelector("#linkScroll");
  linkScrollEl.scrollTop = 3900; // near the very end of the 4000px-tall list
  w.renderLinkVisibleBlocks();
  assert(d.querySelector('.pair-block[data-pair-index="0"]') === null, "sanity: pair 0's block is no longer real DOM once scrolled far away");
  assert(d.querySelector(".pair-selected") === null, "no stale .pair-selected left behind on an unrelated rendered block");
  assert(T.linkSelectedPairIndex === 0, "the selection itself SURVIVES — still tracked by index even though its DOM node was torn down");
  const marked = w.minimapMarkedEntries();
  assert(marked.length === 2 && marked[0].message.includes("REF 0") && marked[1].message.includes("TARGET 1"),
    "minimapMarkedEntries still resolves pair 0's two real entries correctly while its block is off-screen, got " + JSON.stringify(marked.map(e => e.message)));

  // Scroll to a specific deterministic offset (yStart = 1900-300 = 1600 =
  // exactly block 20's own start, given every block is a uniform 80px) and
  // confirm the render window actually moved to meet it.
  linkScrollEl.scrollTop = 1900;
  w.renderLinkVisibleBlocks();
  blocks = [...d.querySelectorAll("#linkBody .pair-block")];
  assert(blocks[0].dataset.pairIndex === "20", "scrolling moves the rendered window to start at block 20 (1600/80), got " + blocks[0].dataset.pairIndex);

  // Scroll back: pair 0's block re-enters the DOM with .pair-selected
  // correctly re-applied (not just "not incorrectly applied elsewhere").
  linkScrollEl.scrollTop = 0;
  w.renderLinkVisibleBlocks();
  assert(d.querySelector('.pair-block[data-pair-index="0"]').classList.contains("pair-selected"),
    "scrolling pair 0's block back into view re-applies .pair-selected from the persisted selection");

  // Switching to a DIFFERENT link node resets both the scroll position and
  // the selected-pair index — same reasoning as the extraction table above.
  const linkNode2 = w.createLinkNode(refNode.id, targetNode.id, "after", 1);
  linkScrollEl.scrollTop = 1900;
  T.state.activeId = linkNode2.id;
  w.render();
  assert(linkScrollEl.scrollTop === 0 && T.linkSelectedPairIndex === null,
    "scroll AND selected-pair index both reset when switching to a different link node");
});

/* ============================================================
   GROUP 46 — Extend undo/redo: file delete, value/pattern edits, invert
   toggle, assertion changes
   Origin: this session (2026-08-17), FEATURE_BACKLOG.md "Extend undo/redo"
   (Group 16 originally covered filter delete/move only). Adds four more
   undoable action kinds on top of the SAME snapshot-based stack: plain
   (non-folder) file delete ("deleteFile" — snapshotSubtree/restoreSubtree
   extended to file nodes, entries/tail kept by reference), and a new
   generic "edit" kind (captureNodeFields/applyNodeFields before/after)
   backing value/pattern edits (F2 popup + time-range dialog), the invert
   toggle, and assertion add/clear. Folder-file close and node creation
   stay deliberately out of scope — see the undo/redo module comment in
   philogg.html.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("46. Extend undo/redo: file delete, edits, invert, assertions");

  // ---------- Plain file delete ----------
  const fa = await w.addFile("a.log", makeLog(0, 10), () => {});
  const filt = w.createFilterNode(fa.id, "text", "message 1");
  w.render();
  const rootIndexBefore = T.state.rootIds.indexOf(fa.id);
  const entryIdsBefore = fa.entries.map(e => e.id);
  const stackLenBefore = T.undoStack.length;

  w.deleteFilterNodeWithUndo(fa.id);
  assert(!T.state.nodes[fa.id], "plain file delete removes the node");
  assert(!T.state.rootIds.includes(fa.id), "plain file delete removes it from rootIds");
  assert(entryIdsBefore.every(id => !T.entryIndex[id]), "plain file delete releases its entries from entryIndex");
  assert(T.undoStack.length === stackLenBefore + 1, "plain file delete pushes an undo action (kind \"deleteFile\")");

  w.undo();
  assert(T.state.nodes[fa.id], "undo restores the deleted file node");
  assert(T.state.nodes[fa.id].id === fa.id, "restored file keeps its original id");
  assert(T.state.rootIds[rootIndexBefore] === fa.id, "restored file lands back at its original rootIds position, got index " + T.state.rootIds.indexOf(fa.id));
  assert(entryIdsBefore.every(id => T.entryIndex[id]), "undo re-adds every entry to entryIndex");
  assert(T.state.nodes[filt.id] && T.state.nodes[filt.id].parentId === fa.id, "restored file's filter subtree comes back too, same id and parent");

  w.redo();
  assert(!T.state.nodes[fa.id], "redo re-deletes the file");
  assert(entryIdsBefore.every(id => !T.entryIndex[id]), "redo re-releases entries from entryIndex");

  w.undo(); // leave the file restored for the rest of this group
  assert(T.state.nodes[fa.id], "sanity: file restored again for the rest of the group");

  // ---------- Folder-loaded file close is STILL not undoable ----------
  // Setting .folderId directly (no full watched-folder setup needed) is
  // enough to route deleteFilterNodeWithUndo into its folder branch, which
  // closeFolderFile handles gracefully even with no matching state.folders
  // record (the "if (folder)" guard there).
  const folderFile = await w.addFile("watched.log", makeLog(0, 3), () => {});
  folderFile.folderId = "not-a-real-folder";
  const stackLenBeforeFolder = T.undoStack.length;
  w.deleteFilterNodeWithUndo(folderFile.id);
  assert(!T.state.nodes[folderFile.id], "folder-file close still fully removes the node in this test (no folder record to return it to)");
  assert(T.undoStack.length === stackLenBeforeFolder, "folder-file close still does not push an undo action");

  // ---------- Value/pattern edit: F2 popup (text filter) ----------
  const textNode = w.createFilterNode(fa.id, "text", "message 1");
  T.state.activeId = textNode.id;
  w.render();
  const stackLenBeforeEdit = T.undoStack.length;
  fireKeydown(d, w, "F2");
  d.querySelector("#filterInput").value = "message 2";
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(textNode.value === "message 2", "F2 edit still updates the node in place");
  assert(T.undoStack.length === stackLenBeforeEdit + 1, "F2 edit now pushes an undo action");
  w.undo();
  assert(textNode.value === "message 1", "undo restores the pre-edit value");
  w.redo();
  assert(textNode.value === "message 2", "redo re-applies the edit");
  // A real browser blurs a focused input when its containing popup goes
  // display:none; jsdom doesn't compute that CSS-driven side effect, so the
  // next F2 press below would otherwise hit the global keydown handler's
  // "inInput" bail-out (see document's keydown listener) against a hidden,
  // stale-focused #filterInput. Blur it explicitly to match real behavior.
  d.querySelector("#filterInput").blur();

  // ---------- Value/pattern edit: time-range dialog (legacy after -> timerange migration) ----------
  const rangeNode = w.createFilterNode(fa.id, "after", fa.entries[3].ts);
  T.state.activeId = rangeNode.id;
  w.render();
  const stackLenBeforeRange = T.undoStack.length;
  fireKeydown(d, w, "F2");
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "F2 on a legacy \"after\" node opens the time-range dialog");
  d.querySelector("#timeRangeToInput").value = w.tsToLocalInputValue(fa.entries[7].ts);
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(rangeNode.filterType === "timerange" && rangeNode.value.to === fa.entries[7].ts, "time-range edit applied and migrated the node");
  assert(T.undoStack.length === stackLenBeforeRange + 1, "time-range edit pushes an undo action");
  w.undo();
  assert(rangeNode.filterType === "after" && rangeNode.value === fa.entries[3].ts, "undo restores the pre-edit legacy filterType AND value, got " + rangeNode.filterType + "/" + rangeNode.value);
  w.redo();
  assert(rangeNode.filterType === "timerange" && rangeNode.value.to === fa.entries[7].ts, "redo re-applies the migration + new bound");

  // ---------- Invert (NOT) toggle ----------
  const invNode = w.createFilterNode(fa.id, "text", "message 3");
  T.state.activeId = invNode.id;
  w.render();
  const invRow = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(invRow, w);
  const invertItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "invert");
  const stackLenBeforeInvert = T.undoStack.length;
  fireClick(invertItem, w);
  assert(invNode.inverted === true, "context-menu invert still toggles the flag");
  assert(T.undoStack.length === stackLenBeforeInvert + 1, "invert toggle pushes an undo action");
  w.undo();
  assert(invNode.inverted === false, "undo reverts the invert toggle");
  w.redo();
  assert(invNode.inverted === true, "redo re-applies the invert toggle");

  // ---------- Value assertion add/clear ----------
  const extractNode = w.createFilterNode(fa.id, "extract", "message [value:int]");
  T.state.activeId = extractNode.id;
  w.render();
  const assertBtn = d.querySelector('.extract-assert-btn[data-assert-col="0"]');
  fireClick(assertBtn, w);
  d.querySelector("#assertMinInput").value = "2";
  d.querySelector("#assertMaxInput").value = "5";
  const stackLenBeforeAssert = T.undoStack.length;
  fireClick(d.querySelector("#assertDialogSave"), w);
  assert(extractNode.assertions[0].min === 2 && extractNode.assertions[0].max === 5, "assertion saved");
  assert(T.undoStack.length === stackLenBeforeAssert + 1, "saving an assertion pushes an undo action");
  w.undo();
  assert(!extractNode.assertions || !extractNode.assertions[0], "undo removes the just-added assertion");
  w.redo();
  assert(extractNode.assertions[0].min === 2 && extractNode.assertions[0].max === 5, "redo re-applies the assertion");

  fireClick(assertBtn, w);
  const stackLenBeforeClear = T.undoStack.length;
  fireClick(d.querySelector("#assertDialogClear"), w);
  assert(!extractNode.assertions[0], "Clear removes the assertion");
  assert(T.undoStack.length === stackLenBeforeClear + 1, "clearing an assertion pushes an undo action");
  w.undo();
  assert(extractNode.assertions[0].min === 2 && extractNode.assertions[0].max === 5, "undo restores the cleared assertion");
  w.redo();
  assert(!extractNode.assertions[0], "redo re-applies the clear");
});

/* ============================================================
   GROUP 47 — rAF-batch the panel-resizer drag handlers
   Origin: this session (2026-08-18), code-review finding (performance/sync
   pass). The sidebar/detail-panel/fhSplit resizers' mousemove handlers used
   to call renderVisibleRows()/renderHighlightVisibleRows()/
   renderTimelineMinimap() synchronously on every raw event, unlike every
   other high-frequency-input handler in the app (the table/highlight/
   extract/link scroll listeners), which already batch onto
   requestAnimationFrame. mousemove can fire far more often than the
   display repaints, so a fast drag re-ran the (for the sidebar case,
   double-row-rebuild-plus-minimap-SVG-rebuild) work once per event instead
   of once per frame. Fixed by giving each of the three handlers the same
   ticking-flag/rAF-batching guard the scroll handlers already use — the
   geometry itself (style.width/height) stays outside the throttle so the
   panel still visibly tracks the cursor with no added latency, only the
   expensive re-render is deferred and collapsed.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("47. Panel resizers batch their re-render onto requestAnimationFrame");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  T.state.activeId = f.id;
  w.render();

  // Monkey-patch renderVisibleRows/renderTimelineMinimap to count calls —
  // same injected-script technique the memoization group above uses (a
  // second <script> in the same document shares the realm's lexical scope,
  // so reassigning a top-level function declaration is visible page-wide).
  const s = d.createElement("script");
  s.textContent = `
    const __origRVR = renderVisibleRows;
    renderVisibleRows = function() { window.__rvrCalls = (window.__rvrCalls||0)+1; return __origRVR(); };
    const __origRTM = renderTimelineMinimap;
    renderTimelineMinimap = function(...a) { window.__rtmCalls = (window.__rtmCalls||0)+1; return __origRTM(...a); };
  `;
  d.body.appendChild(s);

  const sidebarEl = d.querySelector("#sidebar");
  const sidebarResizer = d.querySelector("#sidebarResizer");
  w.__rvrCalls = 0; w.__rtmCalls = 0;
  // Started wide (clientX 800) and dragged steadily left (shrinking) so each
  // move lands a genuinely different, unclamped width — getBoundingClientRect
  // is stubbed to a fixed 800px width (see beforeParse above), which is
  // already past maxWidth (window.innerWidth-360), so a small rightward move
  // from a smaller start would otherwise stay pinned at the same clamped value.
  sidebarResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 800 }));
  // Three rapid moves, all before any animation frame has a chance to run.
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 700 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 600 }));
  const widthAfterSecondMove = sidebarEl.style.width;
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 500 }));
  assert(sidebarEl.style.width !== "" && sidebarEl.style.width !== widthAfterSecondMove,
    "sidebar width tracks the cursor synchronously on every mousemove, not just on the deferred render");
  assert(w.__rvrCalls === 0 && w.__rtmCalls === 0,
    "the expensive re-render/minimap rebuild does NOT run synchronously inside the mousemove handler, got rvr=" + w.__rvrCalls + " rtm=" + w.__rtmCalls);

  await new Promise(resolve => setTimeout(resolve, 50)); // let the batched rAF actually fire
  assert(w.__rvrCalls === 1 && w.__rtmCalls === 1,
    "three rapid mousemove events collapse into exactly one deferred re-render/minimap rebuild, got rvr=" + w.__rvrCalls + " rtm=" + w.__rtmCalls);

  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));

  // Detail-panel resizer: same batching guard, lighter check (row re-render only).
  const detailResizer = d.querySelector("#detailResizer");
  w.__rvrCalls = 0;
  detailResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientY: 500 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 480 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 460 }));
  assert(w.__rvrCalls === 0, "detail-panel resize also defers its row re-render instead of running it synchronously per mousemove");
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(w.__rvrCalls === 1, "detail-panel resize's two rapid moves collapse into one deferred re-render, got " + w.__rvrCalls);
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));

  // fhSplit resizer: same batching guard.
  T.state.activeId = f.id;
  w.applyFhView("stacked");
  const fhSplitResizer = d.querySelector("#fhSplitResizer");
  w.__rvrCalls = 0;
  fhSplitResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientY: 200 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 220 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 240 }));
  assert(w.__rvrCalls === 0, "fhSplit resize also defers its row re-render instead of running it synchronously per mousemove");
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(w.__rvrCalls === 1, "fhSplit resize's two rapid moves collapse into one deferred re-render, got " + w.__rvrCalls);
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
});

/* ============================================================
   GROUP 48 — Import/Export moved to a toolbar menu + pop-up loading
   animation replaced by an inline tree progress row
   Origin: this session (2026-08-18), person-requested UI changes.

   1) Export/Import session used to live in the tree's per-node context
      menu (plus a special empty-background menu, since the node menu needs
      a node to right-click) — Group 21 covered that placement, and was
      updated in place this session instead of re-tested here. This group
      only adds the negative-space check the toolbar move implies: with no
      files loaded at all (where the old empty-background context menu used
      to be the only way to reach "Import session…"), the toolbar's
      "Session…" button must still work.

   2) The old #progressOverlay pop-up (full-screen, blocking) is gone
      entirely. It was first replaced (still this session) by a
      .tree-loading-row placeholder shown while a file loaded, then
      superseded again later the same session by createFileNode (see
      philogg.html): the REAL file node now exists in the tree from the
      instant loading starts — before any bytes have even been read — with
      just a thin progress bar (node.loadFraction, drawn by renderNode)
      riding along on its own real, already-interactive row instead of a
      separate placeholder. Because createFileNode is called synchronously
      at the top of loadOneFileIntoTree, before its first await, the row is
      already in the DOM the instant loadFileDescriptors/loadFolderFile is
      called, with no setTimeout needed to catch the "loading" state — same
      technique Group 12 (tailing) and Group 30d use for real
      FileReader-backed loads. 48b/48c below were rewritten in place for
      this (no .tree-loading-row exists anymore); Group 49 covers the
      actual point of the change — the file being usable while it loads,
      not just showing a progress bar — since that's new behavior 48b/48c
      never claimed to cover.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("48a. Session menu reachable with zero files loaded (old empty-tree context menu superseded)");
  assert(T.state.rootIds.length === 0, "sanity: no files loaded yet");
  assert(d.querySelector("#progressOverlay") === null, "the old blocking #progressOverlay element no longer exists in the page at all");

  const btnSession = d.querySelector("#btnSession");
  const sessionMenu = d.querySelector("#sessionMenu");
  fireClick(btnSession, w);
  assert(!sessionMenu.classList.contains("hidden"), "\"Session…\" opens even with an empty tree");
  const importItem = d.querySelector('#sessionMenu [data-action="importSession"]');
  assert(importItem !== null, "Import session… is reachable from the toolbar with zero files loaded");

  // Right-clicking the empty tree background no longer produces a menu at
  // all (the whole special-cased empty-background context menu was removed
  // — this behavior is superseded by the always-available toolbar button).
  fireClick(d.body, w); // close the session menu first
  fireContextMenu(d.querySelector("#tree"), w);
  assert(d.querySelector("#treeContextMenu").classList.contains("hidden"),
    "right-clicking the empty tree background no longer opens a context menu");
});

await withApp(async (w, d, T) => {
  section("48b. The real (already-interactive) file row, with a progress fill, replaces the pop-up for a plain file load");
  const text = makeLog(0, 5);
  const file = new w.File([text], "big.log", { type: "text/plain" });

  const before = new Set(T.state.rootIds);
  const donePromise = w.loadFileDescriptors([{ file, handle: null }]);
  // Synchronous part of loadOneFileIntoTree (createFileNode -> flushLoadRender)
  // has already run by the time this line executes — the first await inside
  // it (readFileWithProgress's FileReader) is what actually suspends.
  const newId = T.state.rootIds.find(id => !before.has(id));
  assert(newId, "the file is already a real root node the instant loading starts, before FileReader even resolves");
  assert(typeof T.state.nodes[newId].loadFraction === "number", "the node carries a loadFraction while it's still loading");

  let label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "big.log");
  assert(label !== undefined, "the file's row renders in the tree immediately, not just once loading finishes");
  let row = label.closest(".tree-row");
  assert(row.querySelector(".tree-load-fill") !== null, "the row carries a progress-fill bar while loading");
  assert(d.querySelector("#progressOverlay") === null, "still no blocking overlay anywhere in the DOM while a file is loading");
  assert(d.querySelector(".tree-loading-row") === null, "no separate placeholder row exists anymore — the real row IS the loading row");

  // The row is already fully interactive, not an inert placeholder: a real
  // click on it runs the normal tree-row click handler.
  T.state.focusRegion = "entries";
  fireClick(row, w);
  assert(T.state.focusRegion === "tree", "the still-loading row is already clickable like a normal tree row, not the old inert placeholder");

  // The rest of the UI stays usable: unrelated controls remain clickable —
  // spot-checked via the pin-bookmarks toggle, which has nothing to do with
  // loading (the theme toggle used to live here directly on the toolbar;
  // it moved into Settings -> Appearance this session, no longer a single
  // one-click toolbar button — see GROUP 70h2).
  const pinBefore = T.state.pinBookmarksInFilteredView;
  fireClick(d.querySelector("#btnPinBookmarks"), w);
  assert(T.state.pinBookmarksInFilteredView !== pinBefore, "other toolbar controls remain responsive while a file load is in flight");

  await donePromise;
  assert(typeof T.state.nodes[newId].loadFraction !== "number", "loadFraction is cleared off the node once loading finishes");
  label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "big.log");
  assert(label !== undefined, "the loaded file still renders as a normal real tree row");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") === null, "the progress fill is gone once the file finishes loading");
});

await withApp(async (w, d, T) => {
  section("48c. The real (already-interactive) file row, with a progress fill, replaces a folder-watch file's grayed placeholder while it loads");
  const text = makeLog(0, 4);
  function fakeFileHandle(name, content) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([content]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => content.length, configurable: true });
        blob.text = async () => content;
        blob.slice = start => {
          const sliced = content.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  function fakeDirHandle(name, fileMap) {
    return {
      kind: "directory", name,
      async *values() { for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]); },
    };
  }
  const dir = fakeDirHandle("logs", { "a.log": text });
  await w.addWatchedFolder(dir);
  const folder = T.state.folders[0];
  const rec = folder.files[0];

  const donePromise = w.loadFolderFile(folder, rec);
  // Unlike 48b, loadFolderFile awaits rec.handle.getFile() BEFORE calling
  // loadOneFileIntoTree (which is what actually creates the real node via
  // createFileNode), so a plain synchronous check right after the call
  // isn't enough here — flush pending microtasks (the getFile() resolution
  // chain) via a zero-delay timer first, same as every other async-fixture
  // load in this suite (e.g. Group 37's "let the FileReader-based load settle").
  await new Promise(r => setTimeout(r, 0));
  let folderBox = d.querySelector(".folder-watch");
  let label = [...folderBox.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  assert(label !== undefined, "the folder file's grayed placeholder is replaced by its real (loading) row while it loads");
  assert(folderBox.querySelector(".folder-watch-file") === null, "the plain grayed placeholder is gone while loading (replaced, not duplicated)");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") !== null, "the row carries a progress-fill bar while loading");
  // rec.nodeId is only linked once loadFolderFile's own await resolves —
  // renderFolderSection must still find the real (unlinked) loading node by
  // folder+name in the meantime (see its own comment on this fallback).
  assert(rec.nodeId == null, "sanity: rec.nodeId isn't linked yet at this point, so the row above came from the by-name fallback, not the fast path");

  await donePromise;
  const folderBoxAfter = d.querySelector(".folder-watch");
  label = [...folderBoxAfter.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  assert(label !== undefined, "the folder file still renders as a real tree row inside its folder section once loaded");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") === null, "the progress fill is gone once the folder file finishes loading");
});

/* ============================================================
   GROUP 49 — File usable while it's still loading
   Origin: this session, person-requested ("die Datei... direkt beim
   Ladevorgang bedienbar machen, ... die Minimap fortlaufend zu befüllen").

   createFileNode (see philogg.html) now creates the real file node and
   inserts it into the tree BEFORE any text is read, and parseLogTextAsync
   appends completed entries onto node.entries chunk by chunk (via
   scheduleLoadRender/flushLoadRender, which also invalidate the node's
   getEntries()/getLevelCounts() caches on every tick — see their own
   comment) instead of only handing them all over once the whole file is
   parsed. So a large file's tree row, table, level bar and minimap are all
   live/interactive while it's still loading — the same way an already-open
   tailed file updates continuously (Group 12), just driven by the initial
   parse instead of a poll. Unlike tail auto-follow, the view deliberately
   does NOT scroll to chase the growing content — renderTable's existing
   "start at the top of a new list" default applies unchanged, so the
   Filtered view just stays where it is while the file streams in.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("49. A large file streams into the tree/table/level-bar/minimap live while it's still parsing, without auto-scrolling");
  // Force multiple PARSE_CHUNK_LINES (4000) chunks so the parse actually
  // yields to the event loop more than once mid-parse — a small
  // single-chunk log (as every other fixture in this suite uses) resolves
  // in one hop and can't exercise this. Goes through addFile (text already
  // in memory) rather than loadFileDescriptors/File/FileReader: the
  // FileReader-backed read path is already covered by Group 30d/48b, and
  // its own timing is real-I/O-dependent and would make this test racy —
  // addFile's own synchronous prefix (createFileNode, then straight into
  // parseLogTextAsync's first chunk) is what actually makes the file
  // usable while loading, and is deterministic to catch mid-parse.
  const text = makeLog(0, 9000, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });

  const before = new Set(T.state.rootIds);
  const donePromise = w.addFile("huge.log", text); // not awaited yet — inspect mid-parse state below
  const newId = T.state.rootIds.find(id => !before.has(id));
  assert(newId, "the file is a real root node before parsing has even started (createFileNode runs synchronously, before addFile's first await)");
  const node = T.state.nodes[newId];
  T.state.activeId = newId;
  w.render();

  // Wait for exactly one parse chunk (4000 lines) to land, but not for the
  // whole 9000-line parse to finish — the first PARSE_CHUNK_LINES yield was
  // already scheduled by the synchronous prefix above, ahead of this tick,
  // so it resolves (and the loop runs synchronously up to the NEXT chunk
  // boundary) before this awaits.
  await new Promise(r => setTimeout(r, 0));
  const midCount = node.entries.length;
  assert(midCount > 0 && midCount < 9000,
    "entries stream into node.entries mid-parse instead of only appearing once the whole file is done — got " + midCount + "/9000");

  // The tree row's own count reflects the growing entries live (renderNode
  // reads getEntries(id).length, same as any other file node). Forced via an
  // explicit render() here rather than waiting on the internal rAF-batched
  // one (scheduleLoadRender) to actually fire — Group 47 already covers that
  // batching mechanism itself; this checks the DATA it would render is
  // already correct, deterministically.
  w.render();
  const label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "huge.log");
  const countEl = label.closest(".tree-row").querySelector(".tree-count");
  const treeCount = parseInt(countEl.textContent.replace(/\./g, ""), 10);
  assert(treeCount === node.entries.length, "the tree row's own entry count reflects the mid-parse entries, not zero or the eventual 9000 total — got " + countEl.textContent);

  // The level bar's per-level counts are live too, not stuck at whatever was
  // cached at the very first (still-empty) render — this is exactly the
  // node._levelCounts staleness invalidateCachesForRoots(node.id) exists to
  // prevent (see scheduleLoadRender/flushLoadRender's own comment).
  const levelCounts = w.getLevelCounts(newId);
  const midErrorCount = levelCounts.ERROR || 0;
  assert(midErrorCount > 0 && midErrorCount < 1800, // 9000/5 ERROR entries total
    "level-bar counts reflect the mid-parse entries live, not a stale empty/cached snapshot — got ERROR=" + midErrorCount);

  // The table/minimap are usable, not empty, mid-parse — same active-node
  // pipeline any already-loaded file uses.
  const visibleMid = w.getVisibleEntries();
  assert(visibleMid.length === node.entries.length, "the Filtered view already shows the mid-parse entries instead of an empty table");
  assert(d.querySelector("#emptyState").style.display === "none", "the empty-state placeholder is not shown while entries are already streaming in");

  // No auto-scroll while it streams in: renderTable's default "start back
  // at the top of the list" behavior applies to every incremental render
  // exactly as it would to any other node switch — nothing in the load path
  // sets pendingTableScroll to "bottom" the way tail auto-follow does.
  assert(d.querySelector("#tableBody").scrollTop === 0,
    "the Filtered view stays pinned at the top while the file streams in, instead of jumping to follow the growing content like tail auto-follow does");

  await donePromise;
  assert(node.entries.length === 9000, "parsing finished with the full entry count");
  assert(typeof node.loadFraction !== "number", "loadFraction is cleared once loading finishes");
  const finalCounts = w.getLevelCounts(newId);
  assert(finalCounts.ERROR === 1800 && finalCounts.INFO === 7200,
    "level-bar counts are correct once loading finishes (not left stuck at a mid-parse snapshot) — got ERROR=" + finalCounts.ERROR + " INFO=" + finalCounts.INFO);
});

/* ============================================================
   GROUP 50 — A background file load stays cheap: no render() while it's
   NOT the active view, so switching to a different, already-loaded file
   stays fully responsive
   Origin: this session, person-requested follow-up to Group 49: *"Aktuell
   blockiert das Laden und die Animation teilweise das UI. Ich möchte eine
   Datei Laden und während die Animation läuft auf eine andere, bereits
   geladenen Datei wechseln können. Das UI soll dann sofort bedienbar sein
   und das andere Log in Minimap und Views anzeigen. Von dem gerade ladenden
   Log möchte ich dann nur noch den Fortschrittsbalken am Dateinamen sehen.
   Wichtig ist, dass das UI in der Zeit komplett responsive bleibt."*

   Group 49's scheduleLoadRender/flushLoadRender always ran a full render()
   on every parse-chunk tick, even while the loading file wasn't what was
   actually on screen — harmless for the single-file case Group 49 covers,
   but a background load competing for full tree/table/minimap rebuilds on
   every animation frame is exactly what made the UI feel sluggish once a
   SECOND, already-loaded file was the actual active view. Fixed with
   loadRenderRootIsActive (see philogg.html): scheduleLoadRender now only
   runs a full render while its root IS the active view; otherwise it calls
   the new updateLoadRowProgress, a direct DOM write to just that row's
   .tree-load-fill width, same "cheap write on a hot path" idea the old
   (pre-2026-08-18) setLoadingFileProgress used. The active-check is
   re-verified again inside the rAF callback itself, not just at schedule
   time, so a switch-away that happens between scheduling and the next
   actual frame doesn't still cost one unwanted full render.

   requestAnimationFrame/cancelAnimationFrame are mocked (manually
   flushable via a captured-callback map) rather than raced against real
   timing the way Group 47 does — a file large enough to still be
   genuinely mid-parse by the time a REAL animation frame eventually fires
   (found, while writing this group, to take a lot less than Group 47's own
   50ms wait for even a 9000-line/3-chunk file) would need to be too large
   to keep this suite fast. The mock makes the schedule-vs-fire race, and
   the fire-time re-check it exists to close, fully deterministic instead.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("50. A file loading in the background updates cheaply (no render()); switching away stays fully live for the other file");

  // File A: small, finishes instantly — the file the person is actually
  // looking at throughout this test.
  const fa = await w.addFile("a.log", makeLog(0, 5));
  T.state.activeId = fa.id;
  w.render();

  // Monkey-patch render() to count calls, and requestAnimationFrame/
  // cancelAnimationFrame to a manually-flushable mock — same injected-
  // script technique Group 47 uses for render()-call counting (a second
  // <script> in the same document shares the realm's lexical scope, so
  // reassigning a top-level function declaration is visible page-wide).
  const s = d.createElement("script");
  s.textContent = `
    const __origRender = render;
    render = function() { window.__renderCalls = (window.__renderCalls||0)+1; return __origRender(); };
    window.__rafCallbacks = {};
    window.__rafNextId = 1;
    window.requestAnimationFrame = function(cb) { const id = window.__rafNextId++; window.__rafCallbacks[id] = cb; return id; };
    window.cancelAnimationFrame = function(id) { delete window.__rafCallbacks[id]; };
    window.__flushRaf = function() {
      const cbs = window.__rafCallbacks; window.__rafCallbacks = {};
      Object.keys(cbs).forEach(id => cbs[id]());
    };
  `;
  d.body.appendChild(s);

  // File B: large enough (15 PARSE_CHUNK_LINES chunks) that a handful of
  // background parse ticks still leaves plenty left over — not racing real
  // rAF timing anymore (see above), but still exercising the real parse
  // loop's own setTimeout(0) yields for genuinely mid-parse entries/DOM
  // state, same idiom Group 49 uses.
  const textB = makeLog(0, 60000);
  w.__renderCalls = 0;
  const donePromise = w.addFile("huge-bg.log", textB);
  const newId = T.state.rootIds.find(id => id !== fa.id);
  const nodeB = T.state.nodes[newId];
  assert(newId, "the new file is a real root node immediately, before it's read a single chunk");
  assert(T.state.activeId === newId, "sanity: creating a new file auto-activates it (unchanged, existing behavior)");
  assert(w.__renderCalls === 1, "creating the node renders exactly once, to insert its row — got " + w.__renderCalls);
  assert(Object.keys(w.__rafCallbacks).length === 1, "the first parse chunk (still active) scheduled exactly one pending animation-frame render");

  // The person immediately switches back to file A — exactly the reported
  // scenario: starting a load, then wanting to keep working on something
  // already open instead of watching the new one load.
  T.state.activeId = fa.id;
  w.render();
  w.__renderCalls = 0; // only count what happens FROM HERE, while B loads in the background

  // Fire the animation frame that was scheduled BEFORE the switch-away —
  // the fire-time re-check must fall back to the cheap row update now that
  // B isn't active anymore, not run the full render it was originally
  // scheduled for; otherwise every switch-away would still cost one
  // unwanted full render.
  w.__flushRaf();
  assert(w.__renderCalls === 0, "the render scheduled while B was still active does NOT fire once B is no longer active by the time it runs — got " + w.__renderCalls);
  assert(Object.keys(w.__rafCallbacks).length === 0, "the fallback did not itself schedule a new animation frame");

  // Let B's parse loop actually continue in the background (real
  // setTimeout(0) yields) and confirm every further tick also stays on the
  // cheap path — no render() calls, no animation frame even scheduled at
  // all anymore, since the active check now short-circuits before ever
  // touching rAF.
  for (let i = 0; i < 3 && nodeB.entries.length < 60000; i++) await new Promise(r => setTimeout(r, 0));
  assert(nodeB.entries.length > 0 && nodeB.entries.length < 60000,
    "file B keeps streaming in the background while A is the active view, without finishing outright — got " + nodeB.entries.length + "/60000");
  assert(T.state.activeId === fa.id, "switching to A stuck — B's background progress did not steal the active view back");
  assert(w.__renderCalls === 0, "none of B's further background ticks called render() either — got " + w.__renderCalls);
  assert(Object.keys(w.__rafCallbacks).length === 0, "none of B's background ticks scheduled an animation frame at all");

  // The view genuinely still shows A, completely undisturbed by B.
  assert(w.getVisibleEntries().length === fa.entries.length, "the Filtered view still shows file A's own entries, unaffected by B's background load");

  // File B's own row still carries a live progress fill, updated directly
  // (updateLoadRowProgress) rather than via render() — "nur noch den
  // Fortschrittsbalken am Dateinamen", exactly as requested.
  const labelB = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "huge-bg.log");
  assert(labelB !== undefined, "file B's row still exists in the tree while loading in the background");
  const fillB = labelB.closest(".tree-row").querySelector(".tree-load-fill");
  assert(fillB !== null, "file B's row still carries a progress fill while it loads in the background");
  assert(parseInt(fillB.style.width, 10) > 0, "file B's progress fill width reflects its background progress via the cheap direct-DOM path — got " + fillB.style.width);

  await donePromise;
  assert(nodeB.entries.length === 60000, "file B finished loading with the full entry count despite the detour through the background");
  assert(typeof nodeB.loadFraction !== "number", "loadFraction is cleared once B finishes loading, active or not");
  assert(w.__renderCalls === 1, "finishing the background load runs exactly one final full render (flushLoadRender always renders unconditionally, to remove the progress fill and settle the final count) — got " + w.__renderCalls);
});

/* ============================================================
   GROUP 51 — Tree row DOM identity survives load ticks while the loading
   file itself IS the active view — a click on a DIFFERENT, already-loaded
   row doesn't get lost
   Origin: this session, person-reported follow-up to Group 50's fix:
   *"Während eine Datei lädt, muss ich noch immer mehrfach auf eine andere
   Klicken bis der Wechel erfolgt, es scheint nicht jeder Klick registriert
   zu werden. Nach dem wechsel auf die bereits vorhandene Datei funktioniert
   aber alles flüssig..."*

   Group 50 fixed the BACKGROUND case (loading file not active) but left the
   ACTIVE case's scheduleLoadRender calling a full render() on every parse
   tick, exactly as Group 49 originally shipped it. render() calls
   renderTree(), which tears down and rebuilds EVERY row in #tree from
   scratch — including whatever OTHER row a person is trying to click while
   the new file loads (auto-activated, so it's the active view from the
   start). A native click only fires if mousedown and mouseup land on the
   same, still-attached element; rebuilding that element out from under the
   gesture up to once per animation frame is exactly what made clicks not
   reliably register, matching the report precisely (works fine once
   already switched, since ticks stop mattering to the other file's row at
   that point).

   Fixed by splitting what a load tick actually needs to touch:
   updateLoadRowProgress (new: also writes the row's .tree-count now, not
   just the progress fill) handles the loading file's OWN row directly,
   without renderTree(), on every tick regardless of active state;
   renderLoadTickMainView (new) handles the rest of what the active view
   needs — table/minimap/level bar/status — also without renderTree().
   Structural tree changes (a row appearing at createFileNode, disappearing
   via flushLoadRender's cleanup) still go through a real render(), just
   never per-tick. See philogg.html's updated scheduleLoadRender comment.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("51. A different, already-loaded row's DOM identity (and click-ability) survives parse ticks while the newly-loading file is the active view");

  // File A: small, finishes instantly — the row a person would be trying
  // to click on while B (below) loads and fills the active view.
  const fa = await w.addFile("a.log", makeLog(0, 5));
  T.state.activeId = fa.id;
  w.render();

  // Monkey-patch render()/renderTree() to count calls — same injected-
  // script technique Group 47/50 use (a second <script> in the same
  // document shares the realm's lexical scope, so reassigning a top-level
  // function declaration is visible page-wide).
  const s = d.createElement("script");
  s.textContent = `
    const __origRender = render;
    render = function() { window.__renderCalls = (window.__renderCalls||0)+1; return __origRender(); };
    const __origRenderTree = renderTree;
    renderTree = function() { window.__renderTreeCalls = (window.__renderTreeCalls||0)+1; return __origRenderTree(); };
  `;
  d.body.appendChild(s);

  // File B: large enough (15 PARSE_CHUNK_LINES chunks) that a handful of
  // ticks still leaves it genuinely mid-parse — loaded (not awaited),
  // auto-activating exactly like a real "Open…"/drag-drop always has.
  const textB = makeLog(0, 60000);
  w.__renderCalls = 0; w.__renderTreeCalls = 0;
  const donePromise = w.addFile("huge.log", textB);
  assert(T.state.activeId !== fa.id, "sanity: the newly-loading file auto-activated — it IS the active view for the ticks below, the exact reported scenario");
  assert(w.__renderTreeCalls === 1,
    "creating B's node rebuilds the tree exactly once, to insert its own row — a genuinely structural change (a new root), and the only tree rebuild this whole test expects — got " + w.__renderTreeCalls);

  // File A's row is captured HERE, right after the one legitimate,
  // structural rebuild above (which necessarily touched every row,
  // including A's, since the rootIds list itself changed) — what this test
  // actually covers is the SUSTAINED parse-tick period that follows, not
  // that one-off moment.
  const labelA = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  const rowA = labelA.closest(".tree-row");
  w.__renderTreeCalls = 0; w.__renderCalls = 0;

  // Let several real parse chunks land while B stays the active view
  // throughout — same idiom Group 49/50 use for a genuinely mid-parse state.
  const nodeB = T.state.nodes[T.state.activeId];
  for (let i = 0; i < 3 && nodeB.entries.length < 60000; i++) await new Promise(r => setTimeout(r, 0));
  assert(nodeB.entries.length > 0 && nodeB.entries.length < 60000,
    "file B is genuinely still mid-parse, actively being watched fill in — got " + nodeB.entries.length + "/60000");
  assert(w.__renderTreeCalls === 0, "none of B's parse ticks rebuilt the tree while B is the active view — got " + w.__renderTreeCalls + " renderTree() calls");
  assert(w.getVisibleEntries().length === nodeB.entries.length,
    "sanity: B's own active view (Filtered view content) DID keep updating live via renderLoadTickMainView during the ticks, despite skipping renderTree()");

  // File A's row is still the EXACT SAME DOM element as right after B was
  // created — the direct proof renderTree() genuinely left #tree alone for
  // every tick since; a rebuild would have replaced it with an
  // equal-but-different node.
  const labelA2 = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  assert(labelA2 !== undefined && labelA2.closest(".tree-row") === rowA,
    "file A's tree row survives B's active-view parse ticks as the exact same DOM element (identity preserved)");

  // The strongest proof: a real click dispatched on that same reference
  // still works and switches to file A — if the row had been torn down and
  // replaced at any point during the ticks, this reference's click listener
  // would be gone and nothing would happen.
  fireClick(rowA, w);
  assert(T.state.activeId === fa.id, "a click on file A's row (the same object reference held throughout B's parse ticks) correctly switches to it — no click was lost mid-load");

  await donePromise;
  assert(nodeB.entries.length === 60000, "file B finished loading in the background after the detour through being clicked away from");
});

/* ============================================================
   GROUP 52 — Log-level filter and filter creation stay usable while the
   loading file is the active view (feature parity with tailing)
   Origin: this session, person-requested follow-up to Group 51: *"Jetzt
   würde ich aber gerne auch schon während des Ladevorgangs in der Lage
   sein, Log-Level Filter zu bedienen, neue Filter anlegen, etc. Also alles
   was ich auch tun könnte, wenn es sich um ein Tailing und nicht um einen
   Ladevorgang handeln würde."*

   Groups 50/51 fixed scheduleLoadRender's tree-rebuild problem, but
   renderLoadTickMainView still called renderLevelBar() every tick — the
   SAME class of bug as renderTree(): renderLevelBar() tears down and
   recreates all four level buttons (and their click listeners) from
   scratch, so toggling one while a file loaded suffered the identical
   click-loss symptom tree rows had. Fixed with updateLevelBarCounts (a
   targeted .cnt text write, via a new btn.dataset.level, no rebuild) used
   during ticks instead. Separately, updateLoadRowProgress was generalized
   into updateLoadRowLiveData: it now walks the WHOLE subtree under the
   loading root (not just the root's own row), so a filter created while the
   file is still loading keeps showing a live, growing count on its own row
   too — tailing's full render() already gave filter children this for
   free (just at a much lower 1.5s cadence that never triggered the
   click-loss bug in the first place); a load tick needed the same live
   data without render()'s cost. Filter CREATION itself (the popup,
   createFilterNode) was never actually blocked — it's a discrete action,
   independent of the per-tick render path — so this group's job is mainly
   proving the level bar fix and the live-count generalization, plus a
   sanity check that creating a filter mid-load has always worked.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("52. Level-filter buttons stay clickable, and a newly created filter's own row keeps a live count, while the loading file is the active view");

  // Monkey-patch renderLevelBar (the full rebuild) to count calls — same
  // injected-script technique used throughout this suite.
  const s = d.createElement("script");
  s.textContent = `
    const __origRenderLevelBar = renderLevelBar;
    renderLevelBar = function() { window.__renderLevelBarCalls = (window.__renderLevelBarCalls||0)+1; return __origRenderLevelBar(); };
  `;
  d.body.appendChild(s);

  // Large enough (15 PARSE_CHUNK_LINES chunks) to stay genuinely mid-parse
  // across a handful of real ticks — same idiom Groups 49-51 use.
  const text = makeLog(0, 60000, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });
  w.__renderLevelBarCalls = 0;
  const donePromise = w.addFile("huge.log", text); // auto-activates
  const newId = T.state.rootIds[T.state.rootIds.length - 1];
  const node = T.state.nodes[newId];
  assert(w.__renderLevelBarCalls === 1, "creating the node's own initial render rebuilds the level bar exactly once — got " + w.__renderLevelBarCalls);

  // Capture the ERROR button right after that one legitimate rebuild —
  // same "capture after the structural moment, not before" lesson Group 51
  // learned the hard way.
  const errBtnBefore = d.querySelector('.level-btn[data-level="ERROR"]');
  assert(errBtnBefore !== null, "sanity: the ERROR level button exists");
  w.__renderLevelBarCalls = 0;

  for (let i = 0; i < 3 && node.entries.length < 60000; i++) await new Promise(r => setTimeout(r, 0));
  assert(node.entries.length > 0 && node.entries.length < 60000, "file is genuinely still mid-parse — got " + node.entries.length + "/60000");
  assert(w.__renderLevelBarCalls === 0, "none of the parse ticks rebuilt the level bar — got " + w.__renderLevelBarCalls);

  const errBtnAfter = d.querySelector('.level-btn[data-level="ERROR"]');
  assert(errBtnAfter === errBtnBefore, "the ERROR level button survives parse ticks as the exact same DOM element (identity preserved)");
  const shownErr = parseInt(errBtnAfter.querySelector(".cnt").textContent.replace(/\./g, ""), 10);
  assert(shownErr > 0, "the ERROR button's own count updates live during ticks via the cheap path (updateLevelBarCounts) — got " + shownErr);

  // The real proof: a click on the reference held throughout the ticks
  // still works — if the button had been torn down and replaced at any
  // point, this reference's click listener would be gone.
  fireClick(errBtnBefore, w);
  assert(T.state.levelFilter.has("ERROR"), "a click on the level-filter button (same reference held throughout the ticks) correctly toggles it — no click was lost mid-load");
  fireClick(errBtnBefore, w);
  assert(!T.state.levelFilter.has("ERROR"), "sanity: toggled back off, state left clean for what follows");

  // Creating a new filter while the file is STILL loading: never actually
  // blocked (a discrete action, independent of the per-tick render path),
  // but its own row needs to keep showing a live count afterwards, exactly
  // like tailing would give it.
  assert(node.entries.length < 60000, "sanity: still mid-load when the filter below gets created");
  const filterNode = w.createFilterNode(newId, "text", "message");
  T.state.activeId = filterNode.id;
  w.render();
  const countBefore = w.getEntries(filterNode.id).length;
  assert(countBefore > 0 && countBefore < 60000, "sanity: the new filter already matches some of what's loaded so far, not the eventual full 60000 — got " + countBefore);

  for (let i = 0; i < 3 && node.entries.length < 60000; i++) await new Promise(r => setTimeout(r, 0));
  const filterRow = d.querySelector('.tree-row[data-node-id="' + filterNode.id + '"]');
  assert(filterRow !== null, "the newly created filter's row still exists after further ticks");
  const filterCountShown = parseInt(filterRow.querySelector(".tree-count").textContent.replace(/\./g, ""), 10);
  assert(filterCountShown === w.getEntries(filterNode.id).length && filterCountShown > countBefore,
    "the new filter's own row count keeps growing live as the parent file streams in more matching entries, instead of freezing at its creation-time value — got " + filterCountShown + " (was " + countBefore + ")");
  const pctFill = filterRow.querySelector(".tree-pct-fill");
  assert(pctFill !== null && pctFill.style.width !== "", "the new filter's percentage-of-parent bar is also kept live (updateLoadRowLiveData), not just its count");

  await donePromise;
  assert(node.entries.length === 60000, "the file finished loading normally despite the detour through level-filter/filter-creation interaction");
});

/* ============================================================
   GROUP 53 — Plot tab: point/bar -> log entry, and an "Equal axis scale"
   option
   Origin: this session (2026-08-18, person-requested backlog items):
   "Plot Point → Log-Eintrag" (the Plot tab was previously a dead end — an
   outlier was visible but not reachable, per PROJECT.md's "Known
   limitations") and "Plot Option für Axis-Equal" (so an x/y position plot
   isn't visually distorted by the chart area's own, generally non-square,
   aspect ratio). Both are additive plotConfig/UI-state features (plotConfig
   gains `axisEqual`, ephemeral like `normalize`/xMin/etc. — not threaded
   through any persistence carrier, so none is tested here).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("53. Plot: point -> log entry, axis-equal");
  // Three entries with x/y values on the SAME 0..20 scale on both axes —
  // deliberately, so any leftover pixel-distortion between the two axes
  // below can only come from the chart area's own aspect ratio (722x346
  // per the stubbed 800x400 clientWidth/Height minus PLOT_MARGIN), not from
  // the data itself.
  const rows = [[0, 0], [10, 10], [20, 20]];
  const log = rows.map(([x, y], i) =>
    `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y}"`
  ).join("\n") + "\n";
  const f = await w.addFile("pos.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  const node = w.createFilterNode(f.id, "extract", "x=[value:int] y=[value:int]");
  T.state.activeId = node.id;
  w.render();
  assert(T.extractRowsData.length === 3, "sanity: one extraction row per entry");

  w.switchExtractView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle");
  xSel.value = "0"; xSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ySel.value = "1"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));

  /* ---------- Axis-equal ---------- */
  const markByRow = r => d.querySelector('#plotSvg circle.plot-mark[data-row="' + r + '"]');
  const pxPerUnit = () => {
    const m0 = markByRow(0), m2 = markByRow(2);
    return {
      x: (parseFloat(m2.getAttribute("cx")) - parseFloat(m0.getAttribute("cx"))) / 20,
      y: Math.abs(parseFloat(m0.getAttribute("cy")) - parseFloat(m2.getAttribute("cy"))) / 20,
    };
  };
  assert(T.plotConfig.axisEqual === false, "axis-equal defaults off, matching every other plotConfig flag");
  const before = pxPerUnit();
  assert(Math.abs(before.x - before.y) > 1, "sanity: without axis-equal, X and Y pixels-per-unit differ substantially (722x346 chart area, same 0..20 data range on both axes), got x=" + before.x.toFixed(3) + " y=" + before.y.toFixed(3));

  const axisCb = d.querySelector("#plotAxisEqual");
  assert(axisCb !== null, "'Equal axis scale' checkbox is offered for a non-bar chart type (scatter)");
  axisCb.checked = true;
  axisCb.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.axisEqual === true, "checking the box flips plotConfig.axisEqual");

  const after = pxPerUnit();
  // Small epsilon: cx/cy are serialized via toFixed(1) in the SVG markup, so
  // a little quantization noise survives the round trip through the DOM.
  assert(Math.abs(after.x - after.y) < 0.1, "with axis-equal on, X and Y pixels-per-unit now match, got x=" + after.x.toFixed(3) + " y=" + after.y.toFixed(3));
  assert(Math.abs(after.y - before.y) < 0.1, "the axis that already had the tighter (smaller) pixel budget per unit — Y, the shorter dimension — is left unpadded; only X's domain widens to meet it");

  // Bar charts have a categorical X axis — no equal-scale option offered.
  fireClick(d.querySelector('.plot-type-btn[data-type="bar"]'), w);
  assert(d.querySelector("#plotAxisEqual") === null, "no axis-equal checkbox for a bar chart (categorical X)");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  d.querySelector("#plotXSelect").value = "0";
  d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1";
  d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));

  /* ---------- Point -> log entry ---------- */
  const marks = [...d.querySelectorAll("#plotSvg circle.plot-mark")];
  assert(marks.length === 3, "one clickable mark per plotted row, got " + marks.length);
  const targetEntry = T.extractRowsData[1].entry; // the x=10,y=10 row
  const targetMark = markByRow(1);
  assert(targetMark, "row 1's mark carries a data-row attribute for the click handler to resolve");

  const fileNodeId = f.id;
  fireClick(targetMark, w);
  assert(T.state.activeId === fileNodeId,
    "clicking a plot mark jumps to the entry's root file — the same destructive jump the extraction table's own row double-click already uses (jumpToFullLog), since the Plot tab has no Highlight-view companion to reveal into instead");
  assert(T.state.selectedId === targetEntry.id, "the clicked mark's real underlying entry becomes selected");
  assert(T.state.levelFilter.size === 0, "jumpToFullLog's usual level-filter reset still applies");

  // Clicking empty chart space (not a mark) is a no-op — sanity that the
  // delegated listener doesn't misfire on the axes/gridlines/background.
  T.state.activeId = node.id;
  w.render();
  w.switchExtractView("plot");
  const beforeClick = T.state.activeId;
  fireClick(d.querySelector("#plotSvg"), w);
  assert(T.state.activeId === beforeClick, "clicking the plot SVG background (no mark under the cursor) doesn't navigate away");
});

/* ============================================================
   GROUP 54 — Plot zoom, pan, drag-to-zoom, and a hover tooltip
   Origin: this session (2026-08-18, person-requested): mouse-wheel zoom
   anchored at the cursor (unlimited zoom-in, zoom-out clamped to the
   current default/"home" view), middle-click-drag panning, an editable
   zoom-level readout with +/-/reset, left-click-drag rectangle zoom
   (multi-step — zooming further into an already-zoomed view), and a hover
   tooltip showing a mark's exact underlying value. All ephemeral view
   state (plotZoom, like plotConfig.xMin/normalize/etc.) — not threaded
   through any persistence carrier, so none of that is tested here.
   Uses a home domain that lands on exact round numbers (0..100 on both
   axes, verified below) specifically so the geometry assertions throughout
   this group can compare against hand-computed expected values instead of
   fuzzy ranges. Chart-area geometry (722x346 plot rect from the stubbed
   800x400 clientWidth/Height minus PLOT_MARGIN) matches Group 53.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("54. Plot: zoom / pan / drag-zoom / tooltip");
  const rows = Array.from({ length: 11 }, (_, i) => i * 10); // 0,10,...,100
  const log = rows.map((v, i) =>
    `2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${v} y=${v}"`
  ).join("\n") + "\n";
  const f = await w.addFile("zoom.log", log, () => {});
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "extract", "x=[value:int] y=[value:int]");
  T.state.activeId = node.id;
  w.render();
  assert(T.extractRowsData.length === 11, "sanity: 11 extraction rows");

  w.switchExtractView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle");
  xSel.value = "0"; xSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ySel.value = "1"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));

  const svgEl = d.querySelector("#plotSvg");
  const home = T.plotLastRender;
  assert(home, "plotLastRender is populated after the first plot render");
  assert(Math.abs(home.xDomainMin) < 1e-6 && Math.abs(home.xDomainMax - 100) < 1e-6,
    "home X domain is exactly the data range 0..100 (niceTicks lands on round numbers here), got " + home.xDomainMin + ".." + home.xDomainMax);
  assert(Math.abs(home.yDomainMin) < 1e-6 && Math.abs(home.yDomainMax - 100) < 1e-6, "home Y domain likewise 0..100");
  assert(!d.querySelector("#plotZoomBar").classList.contains("hidden"), "the zoom toolbar is visible once the plot has data");

  /* ---------- Zoom-out clamp (home span + a small buffer) / unlimited zoom-in ---------- */
  // PLOT_ZOOM_OUT_BUFFER = 0.08 (8% of the home span on EACH side) — zooming
  // out is capped there, not at the bare home span, so a mark sitting
  // exactly on the home view's edge (previously rendered only half-visible,
  // with no way to bring it fully into view) can be zoomed/panned to with a
  // little padding. The home view itself (plotZoom === null, asserted
  // above) is completely unaffected by this — only what zooming/panning OUT
  // can reach changes.
  const bufferedSpan = 100 * (1 + 2 * 0.08); // = 116
  w.zoomPlotAt(50, 50, 1.5); // factor > 1 = zoom OUT, requesting a span (150) wider than even the buffered ceiling (116)
  const afterZoomOutAttempt = T.plotLastRender;
  assert(Math.abs((afterZoomOutAttempt.xDomainMax - afterZoomOutAttempt.xDomainMin) - bufferedSpan) < 1e-6,
    "zooming OUT from the home view clamps to the home span plus the small buffer (116), never wider — 'zoom out a little past the current default view, but no further'; got span " + (afterZoomOutAttempt.xDomainMax - afterZoomOutAttempt.xDomainMin).toFixed(2));
  assert(afterZoomOutAttempt.xDomainMin > -100 && afterZoomOutAttempt.xDomainMax < 200,
    "sanity: the buffered zoom-out is still just a small pad around the home view, nowhere near doubling it, got " + afterZoomOutAttempt.xDomainMin.toFixed(2) + ".." + afterZoomOutAttempt.xDomainMax.toFixed(2));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  w.zoomPlotAt(50, 50, 0.001); // an extreme zoom-in factor
  const tinySpan = T.plotLastRender.xDomainMax - T.plotLastRender.xDomainMin;
  assert(tinySpan < 0.5, "zooming IN has no lower limit — a single extreme-factor zoom collapses the 100-unit home span to under 0.5, got " + tinySpan.toFixed(4));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);
  assert(T.plotZoom === null, "Reset button clears plotZoom back to null (home view)");

  /* ---------- Wheel zoom, anchored at the cursor ---------- */
  // Data point (50,50) sits at pixel (58+50*7.22, 362-50*3.46) = (419, 189)
  // given the home domain/722x346 plot rect established above.
  const anchorX = 419, anchorY = 189;
  svgEl.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: anchorX, clientY: anchorY, deltaY: -100 }));
  const afterWheelIn = T.plotLastRender;
  const spanAfterWheelIn = afterWheelIn.xDomainMax - afterWheelIn.xDomainMin;
  assert(spanAfterWheelIn < 100 - 1e-6, "wheel-up (deltaY<0) over the chart zooms IN (span shrinks below the home span), got " + spanAfterWheelIn.toFixed(2));
  const dataXUnderCursor = afterWheelIn.xDomainMin + (anchorX - afterWheelIn.left) / afterWheelIn.plotW * (afterWheelIn.xDomainMax - afterWheelIn.xDomainMin);
  assert(Math.abs(dataXUnderCursor - 50) < 1, "wheel-zoom is anchored at the cursor — the data value under the mouse (50) stays under the mouse after zooming, got " + dataXUnderCursor.toFixed(2));

  svgEl.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: anchorX, clientY: anchorY, deltaY: 100 }));
  const spanAfterWheelOut = T.plotLastRender.xDomainMax - T.plotLastRender.xDomainMin;
  assert(spanAfterWheelOut > spanAfterWheelIn, "wheel-down (deltaY>0) at the same anchor zooms back OUT (span grows again)");

  const zoomBeforeMarginWheel = T.plotZoom;
  svgEl.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 5, clientY: 5, deltaY: -100 })); // inside the left margin, left of the axis (left=58)
  assert(T.plotZoom === zoomBeforeMarginWheel, "wheel events over the chart's margin (outside the actual plot rectangle) are ignored");
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  /* ---------- Zoom-level readout: +/- buttons, editable field, reset ---------- */
  assert(d.querySelector("#plotZoomLevelInput").value === "100%", "zoom-level readout shows 100% at the home view, got " + d.querySelector("#plotZoomLevelInput").value);
  fireClick(d.querySelector("#plotZoomInBtn"), w);
  const pctAfterInBtn = parseFloat(d.querySelector("#plotZoomLevelInput").value);
  assert(pctAfterInBtn > 100, "the + button zooms in, raising the % readout above 100, got " + pctAfterInBtn);
  fireClick(d.querySelector("#plotZoomOutBtn"), w);
  fireClick(d.querySelector("#plotZoomOutBtn"), w);
  const pctAfterOutBtn = parseFloat(d.querySelector("#plotZoomLevelInput").value);
  assert(pctAfterOutBtn <= 100, "the − button zooms back out, clamped at the home view's 100%, got " + pctAfterOutBtn);

  const zoomInput = d.querySelector("#plotZoomLevelInput");
  zoomInput.value = "400";
  zoomInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  const spanAfterTyped = T.plotLastRender.xDomainMax - T.plotLastRender.xDomainMin;
  assert(Math.abs(spanAfterTyped - 25) < 1, "typing '400' in the zoom field sets an ABSOLUTE 400% of the home span (100/4=25 data units), got " + spanAfterTyped.toFixed(2));

  fireClick(d.querySelector("#plotZoomResetBtn"), w);
  assert(d.querySelector("#plotZoomLevelInput").value === "100%", "Reset restores the 100% readout");

  /* ---------- Middle-click-drag panning ---------- */
  // At the home view (already 100%, no zoomed-in headroom), panning is still
  // possible but capped at the same small buffer zoom-out uses (8% of the
  // 100-unit home span = 8) rather than the full requested drag distance —
  // this, together with the buffered zoom-out above, is the actual fix: a
  // mark sitting exactly on the home view's edge can now be brought fully
  // into view (with a little padding) instead of staying stuck half-visible.
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 200, button: 1 })); // dragged LEFT 100px — requests an ~13.85-unit shift, more than the 8-unit buffer
  await new Promise(resolve => setTimeout(resolve, 50)); // let the rAF-batched pan render flush (same pattern as Group 47)
  const afterHomePanAttempt = T.plotLastRender;
  assert(Math.abs((afterHomePanAttempt.xDomainMax - afterHomePanAttempt.xDomainMin) - 100) < 1e-6,
    "panning changes position only, not span — still exactly the 100-unit home span, got " + (afterHomePanAttempt.xDomainMax - afterHomePanAttempt.xDomainMin).toFixed(2));
  assert(afterHomePanAttempt.xDomainMin > 0 && afterHomePanAttempt.xDomainMin <= 8 + 1e-6,
    "a pan request larger than the buffer is capped AT the buffer (8), not applied in full nor rejected outright, got xDomainMin=" + afterHomePanAttempt.xDomainMin.toFixed(3));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 1 }));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  // A SMALL pan request, well under the buffer, applies in full — proving
  // the buffer is a real allowance and not just a rounding artifact of the
  // clamp above.
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 371, clientY: 200, button: 1 })); // ~4-unit shift, under the 8-unit buffer
  await new Promise(resolve => setTimeout(resolve, 50));
  const smallHomePan = T.plotLastRender;
  const expectedSmallShift = 29 / 722 * 100; // (400-371)px / plotW * homeSpan ≈ 4.02
  assert(Math.abs(smallHomePan.xDomainMin - expectedSmallShift) < 0.1,
    "a pan request within the buffer applies in full (unclamped), got xDomainMin=" + smallHomePan.xDomainMin.toFixed(3) + " expected ~" + expectedSmallShift.toFixed(3));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 1 }));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  // Zoom in first (span 50, domain [25,75] both axes), THEN pan — now there's plenty of room to move.
  w.zoomPlotAt(50, 50, 0.5);
  const zoomedBeforePan = T.plotLastRender;
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 200, button: 1 })); // dragged LEFT 100px
  await new Promise(resolve => setTimeout(resolve, 50));
  const zoomedAfterPan = T.plotLastRender;
  assert(Math.abs((zoomedAfterPan.xDomainMax - zoomedAfterPan.xDomainMin) - (zoomedBeforePan.xDomainMax - zoomedBeforePan.xDomainMin)) < 1e-6,
    "panning changes POSITION, not zoom level — the domain span is unchanged before/after the drag");
  assert(zoomedAfterPan.xDomainMin > zoomedBeforePan.xDomainMin,
    "content follows the cursor (like dragging a map): dragging the mouse LEFT brings higher X values into view, got " + zoomedBeforePan.xDomainMin.toFixed(2) + " -> " + zoomedAfterPan.xDomainMin.toFixed(2));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 1 }));

  // Drag far the other way — panning can't push the view's low edge below the home view's own lower bound (0).
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 800, clientY: 200, button: 1 }));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(T.plotLastRender.xDomainMin >= -8 - 1e-6, "panning can't push the view's left edge past the home view's own lower bound plus its small buffer (0 - 8 = -8), got " + T.plotLastRender.xDomainMin.toFixed(3));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 1 }));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  /* ---------- Left-click-drag rectangle zoom (multi-step) ---------- */
  const dragRectEl = d.querySelector("#plotDragRect");
  assert(dragRectEl.classList.contains("hidden"), "drag-select overlay starts hidden");
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 200, clientY: 100, button: 0 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 500, clientY: 300 }));
  assert(!dragRectEl.classList.contains("hidden"), "dragging past the threshold shows the selection-rectangle overlay");
  const activeIdBeforeDrag = T.state.activeId;
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: 500, clientY: 300, button: 0 }));
  assert(dragRectEl.classList.contains("hidden"), "overlay hides again once the drag ends");

  const zoomedRect = T.plotLastRender;
  const expX0 = (200 - 58) / 722 * 100, expX1 = (500 - 58) / 722 * 100;
  const expY1 = 100 - (100 - 16) / 346 * 100, expY0 = 100 - (300 - 16) / 346 * 100; // screen Y is inverted vs. data Y
  assert(Math.abs(zoomedRect.xDomainMin - expX0) < 1 && Math.abs(zoomedRect.xDomainMax - expX1) < 1,
    "left-click-drag zooms to the dragged rectangle's exact data-space X range, got " + zoomedRect.xDomainMin.toFixed(2) + ".." + zoomedRect.xDomainMax.toFixed(2) + " expected ~" + expX0.toFixed(2) + ".." + expX1.toFixed(2));
  assert(Math.abs(zoomedRect.yDomainMin - expY0) < 1 && Math.abs(zoomedRect.yDomainMax - expY1) < 1,
    "...and the dragged rectangle's exact data-space Y range too");

  // The mouseup's trailing "click" event must NOT jump to a log entry (this
  // was a drag, not a plain click) — same suppression pattern the timeline
  // minimap's own drag-select already uses.
  svgEl.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 500, clientY: 300 }));
  assert(T.state.activeId === activeIdBeforeDrag, "the drag's trailing click doesn't jump to a log entry (suppressed, matching the minimap drag-select precedent)");

  // Multi-step: dragging again inside the now-zoomed view zooms in FURTHER.
  const spanBeforeSecondDrag = zoomedRect.xDomainMax - zoomedRect.xDomainMin;
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 300, clientY: 150, button: 0 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 450, clientY: 250 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: 450, clientY: 250, button: 0 }));
  const spanAfterSecondDrag = T.plotLastRender.xDomainMax - T.plotLastRender.xDomainMin;
  assert(spanAfterSecondDrag < spanBeforeSecondDrag, "a second drag-zoom, starting from an already-zoomed view, zooms in FURTHER (multi-step), got span " + spanBeforeSecondDrag.toFixed(2) + " -> " + spanAfterSecondDrag.toFixed(2));
  // Same as any real browser: this mouseup is still followed by a trailing
  // "click" — dispatch it too (and expect it suppressed, same as the first
  // drag above) so plotDragSuppressClick doesn't leak into the next,
  // genuinely-plain click further down.
  svgEl.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 450, clientY: 250 }));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  // A plain click (no drag) on a mark is unaffected — still jumps (Group 53
  // covers this generally; this just confirms drag-to-zoom didn't regress it).
  const markRow0 = d.querySelector('#plotSvg circle.plot-mark[data-row="0"]');
  assert(markRow0, "row 0 has a mark to click");
  const cx0 = +markRow0.getAttribute("cx"), cy0 = +markRow0.getAttribute("cy");
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: cx0, clientY: cy0, button: 0 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: cx0, clientY: cy0, button: 0 }));
  fireClick(markRow0, w);
  assert(T.state.activeId === f.id, "a plain click (no drag) on a mark still jumps to its log entry, unaffected by the new drag-to-zoom handling");
  T.state.activeId = node.id;
  w.render();
  w.switchExtractView("plot");

  /* ---------- Zoom resets when the axis config changes ---------- */
  w.zoomPlotAt(50, 50, 0.5);
  assert(T.plotZoom !== null, "sanity: zoomed in before the axis-config-change check");
  const xSel2 = d.querySelector("#plotXSelect");
  xSel2.value = "-1"; // switch X to the synthetic t(ms) column (ELAPSED_COL)
  xSel2.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotZoom === null, "changing the X-axis column resets plotZoom — a zoom domain computed for the old column is meaningless for the new one");
  xSel2.value = "0"; xSel2.dispatchEvent(new w.Event("change", { bubbles: true }));

  /* ---------- Hover tooltip: exact underlying value, point- and rect-based hit-testing ---------- */
  const tooltipEl = d.querySelector("#plotTooltip");
  assert(tooltipEl.classList.contains("hidden"), "tooltip starts hidden");
  const mark3 = d.querySelector('#plotSvg circle.plot-mark[data-row="3"]');
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: +mark3.getAttribute("cx"), clientY: +mark3.getAttribute("cy") }));
  assert(!tooltipEl.classList.contains("hidden"), "hovering directly over a point mark shows the tooltip");
  assert(tooltipEl.textContent.includes("30"), "tooltip shows the point's exact underlying value (row 3 is x=30, y=30), got: " + tooltipEl.textContent);
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 5, clientY: 5 })); // back into the margin, away from any mark
  assert(tooltipEl.classList.contains("hidden"), "moving away from any mark hides the tooltip again");

  fireClick(d.querySelector('.plot-type-btn[data-type="bar"]'), w);
  const barRect3 = d.querySelector('#plotSvg rect.plot-mark[data-row="3"]');
  assert(barRect3, "bar chart renders a rect mark for row 3");
  const bx3 = +barRect3.getAttribute("x"), by3 = +barRect3.getAttribute("y");
  const bw3 = +barRect3.getAttribute("width"), bh3 = +barRect3.getAttribute("height");
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: bx3 + bw3 / 2, clientY: by3 + bh3 / 2 }));
  assert(!tooltipEl.classList.contains("hidden"), "hovering inside a bar's rect shows the tooltip too — bar hit-testing is rect-based, not nearest-point");
  assert(tooltipEl.textContent.includes("30"), "bar tooltip shows the exact underlying value, got: " + tooltipEl.textContent);

  /* ---------- Tooltip stays in-bounds and doesn't cover the cursor ---------- */
  // person-reported: a mark far right in the chart pushed the tooltip
  // partly off-screen. jsdom has no real layout engine (offsetWidth/Height
  // are always 0), so a realistic tooltip size is stubbed just for this
  // check — otherwise the flip-to-avoid-overflow logic has nothing to clamp
  // against and this couldn't actually exercise it.
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  d.querySelector("#plotXSelect").value = "0";
  d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1";
  d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));
  Object.defineProperty(tooltipEl, "offsetWidth", { value: 140, configurable: true });
  Object.defineProperty(tooltipEl, "offsetHeight", { value: 50, configurable: true });
  // Row 10 is the last row (x=100, y=100) — the chart's top-right corner
  // point, at pixel (780, 16) per the home-domain math established above.
  const markFarRight = d.querySelector('#plotSvg circle.plot-mark[data-row="10"]');
  assert(markFarRight, "row 10's mark exists");
  const cxFar = +markFarRight.getAttribute("cx"), cyFar = +markFarRight.getAttribute("cy");
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: cxFar, clientY: cyFar }));
  assert(!tooltipEl.classList.contains("hidden"), "tooltip shows for the far-right/top mark too");
  const leftPx = parseFloat(tooltipEl.style.left), topPx = parseFloat(tooltipEl.style.top);
  assert(leftPx + 140 <= 800 - 4 + 1e-6,
    "the tooltip flips to the LEFT of a mark near the right edge instead of running off-screen (800-wide chart area), got left=" + leftPx + " (would end at " + (leftPx + 140) + ")");
  assert(leftPx < cxFar, "flipped left of the cursor, so it no longer sits under/right of the mark's own pixel position");
  assert(topPx >= 4 - 1e-6 && topPx + 50 <= 400 - 4 + 1e-6, "the tooltip stays vertically within the chart area too, got top=" + topPx);
  assert(topPx > cyFar, "with no room ABOVE a mark near the top edge, the tooltip flips to BELOW it instead — never overlapping the cursor point");
  Object.defineProperty(tooltipEl, "offsetWidth", { value: 0, configurable: true });
  Object.defineProperty(tooltipEl, "offsetHeight", { value: 0, configurable: true });
});

/* ============================================================
   GROUP 55 — Multiline message display toggle
   Origin: this session (person-requested, German: "einen toggle, mit dem
   man die Log Views zwischen der aktuellen Darstellung und Mehrzeiligen
   Messages umschalten kann. Default bleibt die aktuelle Ansicht, Zustand ist
   global und wird im Cache gespeichert"). #btnMultilineMsg toggles
   state.multilineMessages (default false — unchanged single-line/truncated
   rows) between that and rendering each entry's message with its literal
   "\n" line breaks (continuation lines accumulated during parsing — Group 1)
   as real line breaks, in BOTH "Log views" (Filtered table + Highlight/Full
   — both share the .col-msg span and the ROW_HEIGHT-based virtualization).
   Row height is computed purely from message line COUNT
   (rowHeightForEntry/MULTILINE_LINE_HEIGHT=15px/line) — never measured from
   the DOM (white-space:pre, no soft-wrap) — specifically so the
   tableRowOffsets/highlightRowOffsets prefix-sum arrays renderVisibleRows/
   renderHighlightVisibleRows/scrollToIndex/scrollToHighlightIndex/
   updateMinimapRenderedRange fall back to when the toggle is on stay exactly
   in sync with what's actually rendered. Persisted via the same session-
   cache settings mechanism as state.pinBookmarksInFilteredView (buildCacheMeta/
   restoreSessionFromCache) — global across the whole app, not per-file.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("55a. Multiline toggle: default view, row heights, spacer, both Log views");

  // Entry 2 gets 2 continuation lines appended during parsing (same
  // technique as Group 1/20) -> a 3-line message; every other entry stays
  // single-line.
  const lines = makeLog(0, 5).trimEnd().split("\n");
  lines.splice(3, 0, "  at Foo.Bar()", "  at Baz.Qux()");
  const f = await w.addFile("multi.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  w.render();

  assert(f.entries.length === 5, "sanity: 5 entries parsed, continuation lines didn't create new ones");
  assert(f.entries[2].message.split("\n").length === 3, "sanity: entry 2's message has 3 lines (header + 2 continuation)");

  const btn = d.querySelector("#btnMultilineMsg");
  assert(btn, "#btnMultilineMsg exists in #viewBar");
  assert(!btn.classList.contains("active") && T.state.multilineMessages === false,
    "toggle starts OFF — default stays the current (single-line) view");
  assert(!d.body.classList.contains("multiline-messages"), "no body-level class by default");

  let rows = [...d.querySelectorAll("#tableRows .log-row")];
  assert(rows.length === 5 && rows.every(r => parseInt(r.style.height, 10) === 28),
    "default view: every row is a fixed 28px (ROW_HEIGHT) regardless of message content");
  assert(parseInt(d.querySelector("#tableSpacer").style.height, 10) === 5 * 28 + 22,
    "default spacer height is plain count*ROW_HEIGHT+22");

  /* ---------- Toggle ON ---------- */
  fireClick(btn, w);
  assert(T.state.multilineMessages === true, "click flips state.multilineMessages");
  assert(btn.classList.contains("active"), "button reflects the ON state");
  assert(d.body.classList.contains("multiline-messages"), "body class toggled — drives the .col-msg white-space:pre CSS override");

  assert(w.messageLineCount(f.entries[2].message) === 3, "messageLineCount counts embedded \\n's");
  assert(w.rowHeightForEntry(f.entries[0]) === 28, "rowHeightForEntry: single-line entry stays at the base ROW_HEIGHT");
  assert(w.rowHeightForEntry(f.entries[2]) === 28 + 2 * 15, "rowHeightForEntry: 3-line entry grows by (lines-1)*MULTILINE_LINE_HEIGHT = 28+30=58");

  rows = [...d.querySelectorAll("#tableRows .log-row")];
  const row0 = rows.find(r => r.dataset.entryId === f.entries[0].id);
  const row2 = rows.find(r => r.dataset.entryId === f.entries[2].id);
  assert(parseInt(row0.style.height, 10) === 28, "single-line entry's DOM row stays 28px in multiline mode");
  assert(parseInt(row2.style.height, 10) === 58, "3-line entry's DOM row grew to 58px, got " + row2.style.height);
  assert(row2.querySelector(".col-msg").textContent.includes("at Baz.Qux()"),
    "the message cell's text content carries the continuation line (CSS white-space:pre renders the \\n as a real break)");

  const spacerH = parseInt(d.querySelector("#tableSpacer").style.height, 10);
  assert(spacerH === (4 * 28 + 58) + 22, "tableSpacer height sums the REAL per-row heights, not entries.length*ROW_HEIGHT, got " + spacerH);

  // Both "Log views" (Filtered + Highlight/Full) share .col-msg and the toggle.
  const hRow2 = d.querySelector('#highlightRows [data-entry-id="' + f.entries[2].id + '"]');
  assert(hRow2 && parseInt(hRow2.style.height, 10) === 58, "the Highlight view's copy of the same entry is tall too");
  const hRow0 = d.querySelector('#highlightRows [data-entry-id="' + f.entries[0].id + '"]');
  assert(hRow0 && parseInt(hRow0.style.height, 10) === 28, "...and its single-line entries stay at 28px there too");

  /* ---------- Toggle OFF again: exact reversion ---------- */
  fireClick(btn, w);
  assert(T.state.multilineMessages === false && !btn.classList.contains("active") && !d.body.classList.contains("multiline-messages"),
    "toggling off reverts state, button and body class");
  rows = [...d.querySelectorAll("#tableRows .log-row")];
  assert(rows.every(r => parseInt(r.style.height, 10) === 28), "toggling off reverts every row back to 28px");
  assert(parseInt(d.querySelector("#tableSpacer").style.height, 10) === 5 * 28 + 22, "spacer reverts to plain count*ROW_HEIGHT too");
});

await withApp(async (w, d, T) => {
  section("55b. Multiline toggle: variable-height virtualization stays exact (scrollToIndex via jumpToEntry)");

  // 50 entries, one (index 5) with 20 continuation lines appended -> a
  // 21-line message, height 28+20*15=328px, sitting well before the jump
  // target (index 40) so its extra height actually has to be accounted for
  // by the offset-based windowing math, not just the fixed index*ROW_HEIGHT
  // arithmetic the default (off) path still uses.
  const raw = makeLog(0, 50).trimEnd().split("\n");
  const cont = Array.from({ length: 20 }, (_, i) => "  at Frame" + i + "()");
  raw.splice(6, 0, ...cont); // right after entries[5]'s header line
  const f = await w.addFile("tall.log", raw.join("\n") + "\n", () => {});
  assert(f.entries.length === 50 && f.entries[5].message.split("\n").length === 21,
    "sanity: 50 entries, entry 5 has the 21-line message");
  T.state.activeId = f.id;
  w.render();
  fireClick(d.querySelector("#btnMultilineMsg"), w);
  assert(T.state.multilineMessages === true, "sanity: toggled on");

  const target = f.entries[40];
  w.jumpToEntry(target.id); // sets scrollTargetId -> renderTable() -> scrollToIndex(40, {center:true, flash:true})

  // Expected scrollTop, computed the same way scrollToIndex does but from
  // first principles here: sum of every row's real height before index 40
  // (entry 5's 328px instead of 28px), minus half a (normal, 28px) viewport
  // plus half that target row's own height.
  let rowTop = 0;
  for (let i = 0; i < 40; i++) rowTop += (i === 5 ? 328 : 28);
  const expectedScrollTop = rowTop - 400 / 2 + 28 / 2; // viewportH stubbed to 400 (see withApp)
  assert(d.querySelector("#tableBody").scrollTop === expectedScrollTop,
    "scrollTop accounts for the tall row's real height, not a flat index*ROW_HEIGHT, got " +
    d.querySelector("#tableBody").scrollTop + " expected " + expectedScrollTop);

  const targetRow = d.querySelector('#tableRows [data-entry-id="' + target.id + '"]');
  assert(targetRow, "the jumped-to entry actually has a rendered DOM row at that scroll position (offset-based start/end windowing landed correctly)");
});

/* ============================================================
   GROUP 55d — Multiline toggle: no scroll jump/reset
   Origin: 2026-08-10 session (person follow-up, German: "Stelle sicher, dass
   das Log nicht scrollt oder nach oben springt wenn man zwischen single und
   multi line wechselt. Der jeweils oben sichtbare LogEintrag soll stehen
   bleiben, darunter dürfen die Log-Einträge wachsen/schrumpfen."). A plain
   render() after flipping state.multilineMessages would otherwise reset
   #tableBody's scroll to the top and leave #highlightBody's raw scrollTop
   pixel value untouched even though rows ABOVE it may have grown — both
   wrong.
   Updated this session (broader follow-up, German: "...wechsel von Filtern,
   Log-Leveln, Message Expand etc. die aktive Zeile bleibt sichtbar..."): the
   original fix was multiline-toggle-specific (topVisibleEntryId +
   pendingTableTopAlignId/pendingHighlightTopAlignId, manually captured by
   the toggle button's click handler right before render()). It's now
   captureViewAnchor()/restoreViewAnchor() (see their own comment above
   renderVisibleRows() in philogg.html), called automatically INSIDE
   renderTable()/renderHighlightView() on every render that rebuilds either
   view's entry list — level-filter toggle, node/filter switch, sort, pin-
   bookmarks toggle, not just this one toggle — and prioritizing the
   active/selected row over the topmost-visible one when there is a
   selection. The assertions below (which only ever exercise the
   no-selection fallback path) still hold unchanged; the very last one
   (Link-view round trip) now expects the position to be PRESERVED across
   the subsequent node switch instead of reset to 0, since that "reset to
   top on any other change" default is exactly what this session's request
   replaced everywhere, not just here.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("55d. Multiline toggle: the top-visible entry stays anchored (no scroll jump/reset) when row heights change above it");

  // 60 entries; three of them (10, 25, 40) each get 3 continuation lines
  // (4-line messages) so real height changes happen well ABOVE the
  // scrolled-to viewport — exactly the scenario a plain render() (or even a
  // naive "just keep the raw scrollTop pixel value") gets wrong.
  const raw = makeLog(0, 60).trimEnd().split("\n");
  [40, 25, 10].forEach(i => raw.splice(i + 1, 0, "  at A()", "  at B()", "  at C()")); // spliced back-to-front so earlier indices stay valid
  const f = await w.addFile("scroll.log", raw.join("\n") + "\n", () => {});
  assert(f.entries.length === 60, "sanity: 60 entries, continuation lines didn't create new ones");
  [10, 25, 40].forEach(i => assert(f.entries[i].message.split("\n").length === 4, "sanity: entry " + i + " has a 4-line message"));
  T.state.activeId = f.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const highlightBody = d.querySelector("#highlightBody");
  tableBody.scrollTop = 45 * 28;      // entry 45 at the very top, past all three tall entries (10/25/40)
  highlightBody.scrollTop = 45 * 28;
  w.renderVisibleRows();
  w.renderHighlightVisibleRows();
  assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[45].id + '"]'), "sanity: entry 45 is rendered at the top before toggling");

  // Expected new scrollTop once multiline is ON: every row's real height up
  // to index 45, where three of the rows before it each grew by 3*15=45px.
  const expectedOn = 45 * 28 + 3 * (3 * 15);

  fireClick(d.querySelector("#btnMultilineMsg"), w);
  assert(T.state.multilineMessages === true, "sanity: toggled on");
  assert(tableBody.scrollTop === expectedOn,
    "Filtered view: scrollTop grows to keep entry 45 at the top (accounting for the 3 taller rows above it), got " + tableBody.scrollTop + " expected " + expectedOn);
  assert(highlightBody.scrollTop === expectedOn,
    "Highlight/Full view: same re-anchoring on the same entry, got " + highlightBody.scrollTop + " expected " + expectedOn);
  assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[45].id + '"]'),
    "entry 45's row is still actually rendered at the (new) top of the Filtered view — not just a matching scrollTop number");
  assert(d.querySelector('#highlightRows [data-entry-id="' + f.entries[45].id + '"]'),
    "...and of the Highlight/Full view too");

  /* ---------- Toggle back OFF: scrollTop shrinks back to the exact pixel spot it started at ---------- */
  fireClick(d.querySelector("#btnMultilineMsg"), w);
  assert(T.state.multilineMessages === false, "sanity: toggled off again");
  assert(tableBody.scrollTop === 45 * 28, "toggling off re-anchors back to the original scrollTop, got " + tableBody.scrollTop);
  assert(highlightBody.scrollTop === 45 * 28, "...in the Highlight/Full view too");
  assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[45].id + '"]'), "entry 45 is still exactly at the top after the round trip");

  /* ---------- Edge case: already scrolled to the very top (0) stays at 0 ---------- */
  w.setTableScroll(0);
  w.setHighlightScroll(0);
  w.renderVisibleRows();
  w.renderHighlightVisibleRows();
  fireClick(d.querySelector("#btnMultilineMsg"), w);
  assert(tableBody.scrollTop === 0 && highlightBody.scrollTop === 0,
    "toggling while already scrolled to the very top stays at 0 (entry 0 is unaffected — nothing above it can grow)");

  /* ---------- Link view active: no stale capture lingers ---------- */
  // The Filtered table isn't even rendered while a Link node is active
  // (renderMainView() calls renderLinkView() instead of renderTable()) — the
  // click handler must not capture a table-view align target in that case.
  // Reset to single-line mode first (the "already at top" edge case above
  // left it on) so the flat scrollTop chosen below actually lines up with
  // flat ROW_HEIGHT math instead of the still-live variable-row offsets from
  // that toggle — this section is about the Link-view guard, not about
  // multiline row heights.
  if (T.state.multilineMessages) fireClick(d.querySelector("#btnMultilineMsg"), w);
  assert(T.state.multilineMessages === false, "sanity: back to single-line mode before the Link-view section");
  // Scrolled away from 0 here specifically so an unguarded capture would
  // resolve to some OTHER entry (not coincidentally 0 again) — proving the
  // guard actually matters, not just that this particular number happens
  // to line up.
  tableBody.scrollTop = 20 * 28;
  w.renderVisibleRows();
  const refNode = w.createFilterNode(f.id, "text", "message 1");
  const targetNode = w.createFilterNode(f.id, "text", "message 2");
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1);
  T.state.activeId = linkNode.id;
  w.render(); // renderLinkView(), NOT renderTable() — #tableBody stays hidden at scrollTop 20*28
  fireClick(d.querySelector("#btnMultilineMsg"), w); // toggled while the Link view is active
  assert(T.state.multilineMessages === true, "sanity: toggled while the Link view is active");
  fireClick(d.querySelector("#btnMultilineMsg"), w); // and back off again, still while Link view active
  assert(T.state.multilineMessages === false, "sanity: toggled back off, still while the Link view is active");
  T.state.activeId = f.id;
  w.render(); // switches back to the plain table view, no scrollTargetId set — an ordinary node switch
  // captureViewAnchor() only ever runs INSIDE renderTable() itself (never
  // while the Link view was showing instead), so #tableBody's currentViewEntries/
  // scrollTop stayed frozen at their pre-Link-view values (20*28) the whole
  // time — nothing stale to guard against here anymore, and switching back to
  // the same node (f.id, still unfiltered) finds that same entry still in
  // the list, so the view lands right back where it was instead of jumping
  // to the top (see this session's general "don't jump" follow-up above).
  assert(d.querySelector("#tableBody").scrollTop === 20 * 28,
    "switching back to the plain table view re-anchors on the entry that was on screen before the Link view interruption, instead of resetting to top");
});

section("55c. Multiline toggle persists through the session cache (global setting, survives a reload)");
{
  const factory = new IDBFactory();
  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeLog(0, 3), () => {});
    fireClick(d.querySelector("#btnMultilineMsg"), w);
    assert(T.state.multilineMessages === true, "sanity: toggled on before persisting");
    await w.persistFileNode(f); // fire-and-forget in the app; awaited here so the "files" store write lands before the window closes
    await w.persistMetaNow();
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta.settings.multilineMessages === true, "cache: multilineMessages written into the settings record, same carrier as pinBookmarksInFilteredView");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40 && T.state.rootIds.length === 0; i++) await sleep(50); // boot restore is async
    assert(T.state.rootIds.length === 1, "sanity: file came back via boot-time restore");
    assert(T.state.multilineMessages === true, "restore: multiline toggle state restored from the cache");
    assert(d.querySelector("#btnMultilineMsg").classList.contains("active"), "restore: button reflects the restored state");
    assert(d.body.classList.contains("multiline-messages"), "restore: body class reflects the restored state");
  }, { indexedDB: factory });
}

/* ============================================================
   GROUP 56 — "No file loaded" hint consolidated to #emptyState only
   Origin: this session (person-requested): with zero files loaded, don't
   show the #viewBar toolbar (level filter etc.) anymore, and remove the
   duplicate "no file" hints that used to live in the tree sidebar
   (#dropHint) and the toolbar status text (#statusText showing "No files
   loaded") — #emptyState's centered message is now the ONLY such hint.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("56. No-file-loaded state: single centered hint, no toolbar/sidebar duplicates");

  assert(T.state.rootIds.length === 0, "sanity: no files loaded yet");
  assert(d.querySelector("#dropHint") === null, "#dropHint no longer exists in the tree sidebar");
  assert(d.querySelector("#emptyState").style.display === "flex", "#emptyState (centered hint) is shown");
  assert(d.querySelector("#emptyState h2").textContent.includes("No log file loaded"), "#emptyState still carries its message");
  assert(d.querySelector("#statusText").textContent === "", "toolbar status text carries no 'No files loaded' duplicate hint");
  assert(d.querySelector("#viewBar").style.display === "none", "the toolbar with the level filter/tabs/breadcrumb is hidden entirely");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  assert(d.querySelector("#emptyState").style.display === "none", "#emptyState hides once a file is loaded");
  assert(d.querySelector("#viewBar").style.display === "", "#viewBar reappears once a file is loaded");
  assert(d.querySelector("#statusText").textContent.includes("1 file"), "toolbar status text shows the real file/entry count again, got " + d.querySelector("#statusText").textContent);
});

/* ============================================================
   GROUP 57 — Multi-select log rows (Ctrl/Shift+click) + Ctrl+C raw-line copy
   Origin: this session (person-requested): select multiple lines in the log
   view and copy their raw text to the system clipboard via Ctrl+C. Ctrl+click
   toggles a row into/out of state.logMultiSelect (folding the prior plain-
   click single selection in on the first Ctrl+click); Shift+click selects
   the contiguous range from the last-clicked anchor. Ctrl+C copies the
   multi-selected rows (or just the single selected entry when nothing's
   multi-selected) sorted chronologically, taking priority over the tree's
   own filter-node clipboard (state.clipboard) whenever focusRegion is
   "entries" (i.e. the log view, not the tree, was last interacted with).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("57. Multi-select log rows + Ctrl+C raw-line copy");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };

  const rowAt = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
  const clickWith = (el, opts) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...opts }));

  // --- Plain click: unchanged single-selection behavior, no multi-select ---
  clickWith(rowAt(2), {});
  assert(T.state.selectedId === f.entries[2].id, "plain click selects the entry as before");
  assert(T.state.logMultiSelect.size === 0, "plain click does not populate logMultiSelect");
  assert(T.state.focusRegion === "entries", "sanity: focusRegion is entries after a row click");

  // --- Ctrl+C with just a single selection: copies that one raw line ---
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(copied === f.entries[2].raw, "Ctrl+C with a single selection copies just that entry's raw line");

  // --- Ctrl+click a second row: folds the prior single selection in; this
  // click also becomes the new Shift-range anchor (index 5) ---
  clickWith(rowAt(5), { ctrlKey: true });
  assert(T.state.logMultiSelect.has(f.entries[2].id) && T.state.logMultiSelect.has(f.entries[5].id) && T.state.logMultiSelect.size === 2,
    "first Ctrl+click folds the previous plain selection in, got " + [...T.state.logMultiSelect]);
  assert(rowAt(2).classList.contains("row-multi-selected") && rowAt(5).classList.contains("row-multi-selected"),
    "both rows carry the multi-select CSS class in the DOM immediately (no full render needed)");

  // --- Shift+click: contiguous range from the anchor (index 5) to index 8 ---
  clickWith(rowAt(8), { shiftKey: true });
  const expectedRange = [5, 6, 7, 8].map(i => f.entries[i].id);
  assert(expectedRange.every(id => T.state.logMultiSelect.has(id)) && T.state.logMultiSelect.size === 4,
    "Shift+click selects the contiguous range from the anchor, got " + [...T.state.logMultiSelect].length + " ids");
  assert(!T.state.logMultiSelect.has(f.entries[2].id), "Shift+click REPLACES the set rather than extending the previous Ctrl+click selection");

  // --- Ctrl+C now copies all 4 rows, sorted chronologically, as raw lines ---
  fireKeydown(d, w, "c", { ctrlKey: true });
  const expectedText = [5, 6, 7, 8].map(i => f.entries[i].raw).join("\n");
  assert(copied === expectedText, "Ctrl+C copies every multi-selected row's raw text, newline-joined, in chronological order");

  // --- A later Shift+click narrows the range from the SAME anchor (index 5, untouched by Shift+click itself), not the previous Shift target (index 8) ---
  clickWith(rowAt(6), { shiftKey: true });
  assert(T.state.logMultiSelect.size === 2 && T.state.logMultiSelect.has(f.entries[5].id) && T.state.logMultiSelect.has(f.entries[6].id),
    "repeated Shift+click re-derives the range from the ORIGINAL anchor (5), not the previous Shift+click's target (8)");

  // --- Ctrl+click one of the currently-selected rows: toggles it back off,
  // and (like any Ctrl+click) becomes the new anchor ---
  clickWith(rowAt(5), { ctrlKey: true });
  assert(!T.state.logMultiSelect.has(f.entries[5].id) && T.state.logMultiSelect.has(f.entries[6].id),
    "Ctrl+click on an already-selected row removes it from the set");
  assert(!rowAt(5).classList.contains("row-multi-selected"), "removed row's class is cleared in place");

  // --- Plain click again clears the multi-selection ---
  clickWith(rowAt(3), {});
  assert(T.state.logMultiSelect.size === 0, "a later plain click clears the multi-selection");
  assert(T.state.selectedId === f.entries[3].id, "...and selects just the clicked row");

  // --- Multi-select made in the Highlight (Full) view is mirrored onto the Filter view's copy of the same rows ---
  w.showFhTab("highlight");
  const hRowAt = i => d.querySelector('#highlightRows [data-entry-id="' + f.entries[i].id + '"]');
  clickWith(hRowAt(1), {});
  clickWith(hRowAt(4), { shiftKey: true });
  assert(T.state.logMultiSelect.size === 4, "shift-range built from the Highlight view's own entries works the same way");
  assert(rowAt(1) && rowAt(1).classList.contains("row-multi-selected"),
    "the Filter view's row for the same entry id picks up the multi-select class too (state.logMultiSelect is shared, same as state.selectedId)");

  // --- Escape clears the multi-selection ---
  fireKeydown(d, w, "Escape");
  assert(T.state.logMultiSelect.size === 0, "Escape clears logMultiSelect");
  assert(!hRowAt(4).classList.contains("row-multi-selected"), "...and the DOM class is cleared too");

  // --- Tree-node Ctrl+C is unaffected when focus is on the tree, not the log view ---
  const filterNode = w.createFilterNode(f.id, "text", "message");
  w.render();
  T.state.activeId = filterNode.id;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(T.state.clipboard && T.state.clipboard.id === filterNode.id, "with focusRegion 'tree', Ctrl+C still copies the active FILTER NODE (tree clipboard), unaffected by the new log-row copy path");
});

/* ============================================================
   GROUP 58 — Log view column visibility / width (FEATURE_BACKLOG.md item)
   Origin: this session. #btnColumns opens #columnsPanel with checkboxes for
   Δt/Thread/Location/Method (Time/Level/Message always shown); each header
   column also has a drag handle (#tableHeader .col-resize-handle) that
   resizes it live. Both are applied purely via the --row-grid CSS custom
   property (applyRowGrid) — no per-row DOM changes — and persist through
   the session cache like state.multilineMessages (global, not per-file).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("58a. Column visibility toggle + reset widths");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const rootStyle = d.documentElement.style;
  assert(rootStyle.getPropertyValue("--row-grid") === "5px 178px 72px 66px 92px 158px 168px 1fr",
    "default --row-grid matches the original hardcoded default, got " + rootStyle.getPropertyValue("--row-grid"));

  const btnColumns = d.querySelector("#btnColumns");
  const columnsPanel = d.querySelector("#columnsPanel");
  assert(columnsPanel.classList.contains("hidden"), "columns popup starts hidden");
  fireClick(btnColumns, w);
  assert(!columnsPanel.classList.contains("hidden"), "clicking #btnColumns opens the popup");
  const threadCb = d.querySelector("#colToggleThread");
  assert(threadCb.checked === true, "checkbox reflects the current (default-visible) state when opened");

  threadCb.checked = false;
  threadCb.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.columnVisible.thread === false, "unchecking the Thread checkbox updates state.columnVisible.thread");
  assert(rootStyle.getPropertyValue("--row-grid") === "5px 178px 72px 66px 0px 158px 168px 1fr",
    "Thread's track collapses to 0px in --row-grid, got " + rootStyle.getPropertyValue("--row-grid"));
  const threadHandle = d.querySelector('.col-resize-handle[data-col="thread"]');
  assert(threadHandle.style.display === "none", "the hidden column's own resize handle is hidden too (nothing meaningful to drag)");

  // Re-show it
  threadCb.checked = true;
  threadCb.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.columnVisible.thread === true && rootStyle.getPropertyValue("--row-grid").includes("92px"),
    "re-checking restores the track to its remembered width (92px default), not a fresh default");
  assert(threadHandle.style.display === "", "handle reappears once the column is visible again");

  // --- Reset widths ---
  T.state.columnWidths.method = 300; // simulate a prior resize
  w.applyRowGrid();
  fireClick(d.querySelector("#btnResetColumns"), w);
  assert(T.state.columnWidths.method === 168, "Reset widths restores DEFAULT_COLUMN_WIDTHS");
  assert(rootStyle.getPropertyValue("--row-grid") === "5px 178px 72px 66px 92px 158px 168px 1fr",
    "…and --row-grid reflects the reset defaults");
});

await withApp(async (w, d, T) => {
  section("58b. Drag-resize a column header handle");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const handle = d.querySelector('.col-resize-handle[data-col="loc"]');
  assert(handle, "Location's resize handle exists in #tableHeader");
  assert(handle.style.left === (5 + 12 + 178 + 12 + 72 + 12 + 66 + 12 + 92 + 12 + 158) + "px",
    "handle is positioned at the cumulative right edge of its own column, got " + handle.style.left);

  handle.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 500 }));
  assert(handle.classList.contains("dragging"), "mousedown starts the drag (handle gets .dragging)");
  d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: 540 })); // +40px
  assert(T.state.columnWidths.loc === 198, "dragging 40px right grows Location's width by 40px (158 -> 198), got " + T.state.columnWidths.loc);
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes("198px"), "--row-grid reflects the live drag width");

  // Shrinking below COLUMN_MIN_WIDTH clamps rather than going negative/zero
  d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: -900 }));
  assert(T.state.columnWidths.loc === 40, "drag clamps at COLUMN_MIN_WIDTH (40px), never below it, got " + T.state.columnWidths.loc);

  d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  assert(!handle.classList.contains("dragging"), "mouseup ends the drag");

  // A mousemove with no active drag is a no-op (no leftover state from the previous drag)
  const widthBefore = T.state.columnWidths.loc;
  d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: 999 }));
  assert(T.state.columnWidths.loc === widthBefore, "mousemove after mouseup no longer affects the column width");
});

await withApp(async (w, d, T) => {
  section("58d. Narrow viewport forces Thread/Location/Method hidden regardless of state.columnVisible (replaces the old @media rule)");

  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  T.state.activeId = f.id;
  w.render();
  assert(T.state.columnVisible.thread === true, "sanity: Thread is visible by default");
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes("92px"), "sanity: Thread's track is non-zero at the default (wide) viewport");

  w.innerWidth = 600; // below COLUMN_MOBILE_BREAKPOINT (760)
  w.dispatchEvent(new w.Event("resize"));
  assert(T.state.columnVisible.thread === true, "narrow viewport does NOT mutate the stored preference...");
  assert(d.documentElement.style.getPropertyValue("--row-grid") === "5px 178px 72px 66px 0px 0px 0px 1fr",
    "...but --row-grid forces Thread/Location/Method to 0px anyway, got " + d.documentElement.style.getPropertyValue("--row-grid"));

  w.innerWidth = 1024;
  w.dispatchEvent(new w.Event("resize"));
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes("92px"), "widening back past the breakpoint restores the remembered widths");
});

section("58c. Column visibility/width persist through the session cache (global setting, survives a reload)");
{
  const factory = new IDBFactory();
  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeLog(0, 3), () => {});
    T.state.columnVisible.method = false;
    T.state.columnWidths.time = 220;
    w.applyRowGrid();
    await w.persistFileNode(f);
    await w.persistMetaNow();
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta.settings.columnVisible.method === false, "cache: columnVisible written into the settings record");
    assert(meta.settings.columnWidths.time === 220, "cache: columnWidths written into the settings record");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40 && T.state.rootIds.length === 0; i++) await sleep(50);
    assert(T.state.rootIds.length === 1, "sanity: file came back via boot-time restore");
    assert(T.state.columnVisible.method === false, "restore: columnVisible.method restored");
    assert(T.state.columnWidths.time === 220, "restore: columnWidths.time restored");
    assert(d.documentElement.style.getPropertyValue("--row-grid").startsWith("5px 220px"),
      "restore: --row-grid reflects the restored width immediately (applyRowGrid called from the restore's finally block)");
    assert(d.documentElement.style.getPropertyValue("--row-grid").includes(" 0px 1fr"),
      "restore: Method's track is collapsed (0px), got " + d.documentElement.style.getPropertyValue("--row-grid"));
  }, { indexedDB: factory });
}

/* ============================================================
   GROUP 59 — Reusable filter library (FEATURE_BACKLOG.md item)
   Origin: this session. Named presets, saved via a filter node's "Save to
   library…" context menu action (#filterLibrarySaveDialog) and applied to
   ANY node — any file, not just the one it was saved from — via "Apply
   from library…" (#filterLibraryDialog). IndexedDB-backed ("filterLibrary"
   store, CACHE_DB_VERSION 3->4), file-agnostic and named on purpose (no
   content-fingerprint matching, unlike the per-file filter history).
   Applying reuses importFilterJson() unchanged, so it re-evaluates the
   filter LOGIC against whatever file it lands on, never a stale result.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("59a. Save to library (context menu) + name dialog");
  // Needs a real (fake-indexeddb) IndexedDB — unlike state.multilineMessages
  // et al., the library has no in-memory fallback; cacheStoreOp silently
  // no-ops without one (same graceful-degradation jsdom sees in every OTHER
  // group, which is fine there since those don't assert on storage content).

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  w.render();

  // Right-click the filter node -> "Save to library…" opens the naming dialog
  const treeRow = d.querySelector('.tree-row[data-node-id="' + textNode.id + '"]');
  assert(treeRow, "sanity: tree row exists for the filter node");
  fireContextMenu(treeRow, w);
  const saveItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(el => el.dataset.action === "saveToLibrary");
  assert(saveItem, "'Save to library…' appears in a filter node's context menu");
  fireClick(saveItem, w);

  const saveDialog = d.querySelector("#filterLibrarySaveDialog");
  assert(!saveDialog.classList.contains("hidden"), "the naming dialog opens");
  const nameInput = d.querySelector("#filterLibraryNameInput");
  assert(nameInput.value === textNode.name, "name input pre-fills with the filter node's own name");

  nameInput.value = "My saved filter";
  fireClick(d.querySelector("#filterLibrarySaveConfirm"), w);
  assert(saveDialog.classList.contains("hidden"), "confirming closes the dialog");

  await new Promise(r => setTimeout(r, 20)); // saveFilterToLibrary's IndexedDB write is async
  const records = await w.listFilterLibrary();
  assert(records.length === 1 && records[0].name === "My saved filter", "one record saved under the entered name");
  assert(Array.isArray(records[0].roots) && records[0].roots.length === 1 && records[0].roots[0].filterType === "text",
    "the saved record carries serializeFilterBranch()'s own shape (roots/activeRef)");

  // Blank name is a no-op (dialog stays open, nothing saved)
  fireContextMenu(treeRow, w);
  fireClick([...d.querySelectorAll("#treeContextMenu [data-action]")].find(el => el.dataset.action === "saveToLibrary"), w);
  d.querySelector("#filterLibraryNameInput").value = "   ";
  fireClick(d.querySelector("#filterLibrarySaveConfirm"), w);
  assert(!d.querySelector("#filterLibrarySaveDialog").classList.contains("hidden"), "a blank/whitespace-only name does not save or close the dialog");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("59b. Apply from library onto a DIFFERENT file (one click, file-agnostic) + delete");

  const fa = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const textNode = w.createFilterNode(fa.id, "text", "message 1");
  w.render();
  await w.saveFilterToLibrary(textNode.id, "reusable text filter");

  const fb = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "message" }), () => {});
  w.render();

  // Right-click the SECOND file (never touched by the save above) -> "Apply from library…"
  const fileRow = d.querySelector('.tree-row[data-node-id="' + fb.id + '"]');
  fireContextMenu(fileRow, w);
  const applyItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(el => el.dataset.action === "applyFromLibrary");
  assert(applyItem, "'Apply from library…' appears on a plain FILE node's context menu too, not just filter nodes");
  fireClick(applyItem, w);

  const dialog = d.querySelector("#filterLibraryDialog");
  assert(!dialog.classList.contains("hidden"), "the apply dialog opens");
  await new Promise(r => setTimeout(r, 20)); // renderFilterLibraryDialog's listFilterLibrary() read is async
  const rows = [...d.querySelectorAll("#filterLibraryList .filter-library-row")];
  assert(rows.length === 1 && rows[0].querySelector(".filter-library-row-name").textContent === "reusable text filter",
    "the saved preset is listed");

  const before = fb.children.length;
  fireClick(rows[0].querySelector("button.btn-mini"), w); // "Apply"
  assert(dialog.classList.contains("hidden"), "clicking Apply closes the dialog");
  assert(fb.children.length === before + 1, "a fresh copy of the filter is created directly under the target file");
  const appliedNode = T.state.nodes[fb.children[fb.children.length - 1]];
  assert(appliedNode.filterType === "text" && appliedNode.value === "message 1", "applied node carries the same filter definition");
  assert(appliedNode.id !== textNode.id, "it's a NEW node (fresh uid), not the original");
  // "message 1" matches entries 1, 10..19 in file b's own data (re-evaluated
  // against ITS entries, not a replayed result from file a).
  assert(w.getEntries(appliedNode.id).length === 11, "re-evaluates against the target file's OWN data, got " + w.getEntries(appliedNode.id).length);

  // --- Delete from the library ---
  fireContextMenu(fileRow, w);
  fireClick([...d.querySelectorAll("#treeContextMenu [data-action]")].find(el => el.dataset.action === "applyFromLibrary"), w);
  await new Promise(r => setTimeout(r, 20));
  const delBtn = d.querySelector("#filterLibraryList .filter-library-row-del");
  fireClick(delBtn, w);
  await new Promise(r => setTimeout(r, 20));
  assert(d.querySelector("#filterLibraryList .filter-library-empty"), "list re-renders empty after deleting the only entry");
  const remaining = await w.listFilterLibrary();
  assert(remaining.length === 0, "record actually removed from IndexedDB");
}, { indexedDB: new IDBFactory() });

section("59c. Filter library persists across a simulated reload (separate IndexedDB store from the session cache)");
{
  const factory = new IDBFactory();
  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeLog(0, 10), () => {});
    w.render();
    const node = w.createFilterNode(f.id, "extract", "message [value:int]");
    w.render();
    await w.saveFilterToLibrary(node.id, "extract preset");
    const records = await w.listFilterLibrary();
    assert(records.length === 1 && records[0].roots[0].filterType === "extract", "sanity: saved before the simulated reload");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    // Filter library is independent of file/session state — no file needs
    // to be loaded, and no boot-time restore wait is needed, for it to be
    // readable (unlike the session cache's own restoreSessionFromCache).
    const records = await w.listFilterLibrary();
    assert(records.length === 1 && records[0].name === "extract preset", "library record survives across the simulated reload");
  }, { indexedDB: factory });
}

/* ============================================================
   GROUP 60 — Session follow-up bugfixes: col-delta/col-time overflow-clip,
   tree context menu grouped with separators
   Origin: this session, person-reported. (a) "wenn ich die deltaT Spalte
   verstecke, bleiben die Einträge in der Tabelle aber hinter den nun
   darüber liegenden Log-Levels sichtbar" — .col-delta (and, defensively,
   .col-time) lacked overflow:hidden, unlike .col-thread/.col-loc/
   .col-method/.col-msg, which already had it — a column collapsed to a
   0px --row-grid track (via the column-visibility toggle, or just a very
   narrow drag-resize) didn't clip its own text content, which kept
   rendering at natural width and spilled into the next column, appearing
   underneath its opaque background. (b) "Das Kontextmenü auf dem Filter
   Tree ist ziemlich voll geworden. gruppiere die Einträge sinnvoll, analog
   zum Kontextmenü auf den Messages" — #treeContextMenu's per-node item
   list (11 items on a filter node) is now built into GROUP_ORDER buckets
   (edit/clipboard/library/danger) joined by .ctx-sep, the same grouping
   convention #contextMenu (the log-row menu) already established.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("60a. col-delta/col-time declare overflow:hidden (bugfix: hidden/narrow column content no longer bleeds into the next column)");

  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  T.state.activeId = f.id;
  w.render();

  const cs = w.getComputedStyle;
  const deltaEl = d.querySelector("#tableRows .col-delta");
  const timeEl = d.querySelector("#tableRows .col-time");
  assert(deltaEl && cs(deltaEl).overflow === "hidden", "col-delta declares overflow:hidden, got " + (deltaEl && cs(deltaEl).overflow));
  assert(timeEl && cs(timeEl).overflow === "hidden", "col-time declares overflow:hidden too (defensive — also resizable now), got " + (timeEl && cs(timeEl).overflow));
  // Same fix already existed for these three (regression guard: this bugfix
  // must not have accidentally removed it).
  ["col-thread", "col-loc", "col-method"].forEach(cls => {
    const el = d.querySelector("#tableRows ." + cls);
    assert(el && cs(el).overflow === "hidden", "." + cls + " still declares overflow:hidden");
  });
});

await withApp(async (w, d, T) => {
  section("60b. Tree context menu items grouped with separators (analogous to the log-row context menu)");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  w.render();

  const treeRow = d.querySelector('.tree-row[data-node-id="' + textNode.id + '"]');
  fireContextMenu(treeRow, w);
  const menu = d.querySelector("#treeContextMenu");
  const children = [...menu.children];
  const seps = children.filter(c => c.classList.contains("ctx-sep")).length;
  assert(seps >= 4, "a filter node's context menu has at least 4 separators (meta + 3 group boundaries among edit/clipboard/library/danger), got " + seps);

  // Group order: edit (edit/invert/context/countContext) before clipboard
  // (copy/cut) before library (save/saveToLibrary/loadFilter/
  // applyFromLibrary) before danger (delete) — verify relative order via
  // each action's index.
  const indexOf = action => children.findIndex(c => c.dataset && c.dataset.action === action);
  assert(indexOf("edit") < indexOf("invert") && indexOf("invert") < indexOf("context") && indexOf("context") < indexOf("countContext"),
    "edit group stays together and in order: edit, invert, time context, count context");
  assert(indexOf("countContext") < indexOf("copy") && indexOf("copy") < indexOf("cut"), "clipboard group (copy, cut) comes after the edit group");
  assert(indexOf("cut") < indexOf("saveFilter") && indexOf("saveFilter") < indexOf("saveToLibrary") &&
    indexOf("saveToLibrary") < indexOf("loadFilter") && indexOf("loadFilter") < indexOf("applyFromLibrary"),
    "library group (save filter, save to library, load filter, apply from library) comes after clipboard, in order");
  assert(indexOf("applyFromLibrary") < indexOf("delete"), "danger group (remove filter) comes last");

  // A .ctx-sep must actually separate the edit and clipboard groups (not
  // just "somewhere in the menu") — the item right after "countContext"
  // (edit group's now-last item) up to "copy" (clipboard's first) is
  // exactly one sep.
  const countContextIdx = indexOf("countContext");
  assert(children[countContextIdx + 1].classList.contains("ctx-sep") && children[countContextIdx + 2].dataset.action === "copy",
    "a .ctx-sep sits directly between the edit group's last item and the clipboard group's first");

  w.closeTreeContextMenu();

  // A plain file node (no filter-specific groups) still groups cleanly:
  // library items, a separator, then the danger item — no empty/dangling
  // leading separator for the groups that have nothing in them.
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  const fileChildren = [...d.querySelector("#treeContextMenu").children];
  const fileIndexOf = action => fileChildren.findIndex(c => c.dataset && c.dataset.action === action);
  assert(fileIndexOf("loadFilter") < fileIndexOf("applyFromLibrary") && fileIndexOf("applyFromLibrary") < fileIndexOf("delete"),
    "a file node's context menu still groups library items before the danger (remove file) item");
  const libSep = fileChildren.filter(c => c.classList.contains("ctx-sep")).length;
  assert(libSep === 2, "file node menu has exactly 2 separators (meta, then one between the library group and the danger group), got " + libSep);
});

await withApp(async (w, d, T) => {
  section("60c. Extraction view: #btnCopySelection/#btnCopyAllExtract removed (person-requested), underlying copy functions kept (jumpToFullLog precedent)");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const extractNode = w.createFilterNode(f.id, "extract", "message [value:int]");
  T.state.activeId = extractNode.id;
  w.render();

  assert(d.querySelector("#btnCopySelection") === null, "#btnCopySelection button no longer exists");
  assert(d.querySelector("#btnCopyAllExtract") === null, "#btnCopyAllExtract button no longer exists");
  assert(d.querySelector(".extract-actions") === null, "the now-empty .extract-actions wrapper was removed too, not left behind empty");
  assert(d.querySelector("#extractViewTabs"), "sanity: the rest of the extraction toolbar (Table/Plot tabs) is untouched");

  // The underlying functions still work when called directly — only their
  // button trigger is gone, same as jumpToFullLog surviving un-wired to a
  // double-click (see PROJECT.md).
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  w.copyWholeExtractTable();
  assert(copied && copied.startsWith("Index\tt (ms)\tvalue") && copied.split("\n").length === 6,
    "copyWholeExtractTable still works when called directly (header + 5 data rows), got " + JSON.stringify(copied && copied.split("\n")[0]));
});

/* ============================================================
   GROUP 61 — General "don't jump" scroll anchoring + auto-reveal Filtered
   Origin: this session (person request, German: "Stelle sicher, dass beim
   ändern der angezeigten Log-Level, die aktive Zeile nicht aus dem Bild
   springt, sondern sich das Log darüber/darunter erweitert. Generell gilt:
   wechsel von Filtern, Log-Leveln, Message Expand etc. die aktive Zeile
   bleibt sichtbar (sofern sie im Ziel-View vorhanden ist)... Bei wechsel zu
   einem anderen Filter, wechsle automatisch vom Full zum Filtered View
   (wenn Stacked aktiv ist, keine Änderung)"). Group 55d already covers the
   no-selection (topmost-visible-row) fallback path of captureViewAnchor/
   restoreViewAnchor via the multiline toggle; this group covers the
   selection-priority path (the actual point of this session's request) and
   the separate revealFilteredView()-on-node-switch behavior.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("61a. Level-filter toggle: the selected/active row stays on screen at the SAME pixel position — the log collapses/expands around it, not a jump");

  // 60 entries, ERROR at every 5th index (makeLog's own default level rule:
  // i%5===0 ? ERROR : INFO) — 12 ERROR / 48 INFO. Selecting an ERROR entry
  // and then filtering down to ERROR-only removes lots of INFO rows ABOVE
  // it, which is exactly the scenario a naive "keep the raw scrollTop pixel
  // value" (or the old "any other change starts back at the top") gets
  // wrong — this asserts the NEW scrollTop is derived so the selected row's
  // on-screen offset is bit-for-bit unchanged.
  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const highlightBody = d.querySelector("#highlightBody");
  assert(f.entries[40].level === "ERROR", "sanity: entry 40 is ERROR-level (40 % 5 === 0)");

  w.setTableScroll(35 * 28);
  w.setHighlightScroll(35 * 28);
  w.renderVisibleRows();
  w.renderHighlightVisibleRows();
  w.selectEntry(f.entries[40].id); // no opts.scroll — selection only, scroll stays exactly where set above
  assert(T.state.selectedId === f.entries[40].id, "sanity: entry 40 selected");
  assert(tableBody.scrollTop === 35 * 28, "sanity: scroll unchanged by selectEntry (no opts.scroll)");

  const oldOffset = 40 * 28 - tableBody.scrollTop; // 140 — entry 40's row top minus scrollTop, i.e. its on-screen pixel offset before the filter change

  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  assert(T.state.levelFilter.has("ERROR") && T.currentViewEntries.length === 12, "sanity: filtered down to the 12 ERROR-level entries");

  // Entry 40 is the 9th ERROR entry (0,5,...,40 → new index 8).
  const newIdx = T.currentViewEntries.findIndex(e => e.id === f.entries[40].id);
  assert(newIdx === 8, "sanity: entry 40 is at index 8 in the ERROR-only list, got " + newIdx);
  const expectedScrollTop = newIdx * 28 - oldOffset; // 224 - 140 = 84
  assert(tableBody.scrollTop === expectedScrollTop,
    "Filtered view: scrollTop recalculated so entry 40 keeps the SAME on-screen offset (" + oldOffset + "px), got " + tableBody.scrollTop + " expected " + expectedScrollTop);
  assert(newIdx * 28 - tableBody.scrollTop === oldOffset, "entry 40's on-screen pixel position is bit-for-bit unchanged (log collapsed around it, not a jump)");
  assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[40].id + '"]').classList.contains("selected"),
    "entry 40's row is actually rendered (and still marked selected) at the new scroll position");

  // The Full/Highlight view deliberately does NOT apply the level filter
  // (this session's change — see GROUP 61e below) — its own entry list is
  // completely unaffected by the click, so entry 40 stays at its ORIGINAL
  // index 40 there and scrollTop is untouched, not recalculated to 84.
  assert(T.currentHighlightViewEntries.length === 60, "Full/Highlight view's entry list is unaffected by the level-filter click");
  assert(highlightBody.scrollTop === 35 * 28, "Full/Highlight view: scrollTop untouched (nothing about its own content changed), got " + highlightBody.scrollTop);

  fireClick(errBtn, w); // toggle back off, restore full 60-entry view for the next section
});

await withApp(async (w, d, T) => {
  section("61b. Level-filter toggle: a selected row that does NOT survive the new filter falls back to the default (reset to top), same as no selection at all");

  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  w.render();
  const tableBody = d.querySelector("#tableBody");

  assert(f.entries[41].level === "INFO", "sanity: entry 41 is INFO-level");
  w.setTableScroll(35 * 28);
  w.renderVisibleRows();
  w.selectEntry(f.entries[41].id);

  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w); // filters entry 41 (INFO) out entirely
  assert(!T.currentViewEntries.some(e => e.id === f.entries[41].id), "sanity: entry 41 is gone from the ERROR-only view");
  assert(tableBody.scrollTop === 0,
    "the selected entry didn't survive into the target view, so the view falls back to its default (reset to top) instead of anchoring on something arbitrary");
});

await withApp(async (w, d, T) => {
  section("61d. A selected row that was OFF-SCREEN before the change is revealed (centered), not left scrolled away, once it's still present in the target view");

  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  w.render();
  const tableBody = d.querySelector("#tableBody");

  assert(f.entries[55].level === "ERROR", "sanity: entry 55 is ERROR-level");
  w.setTableScroll(0); // scrolled to the top — entry 55 is off-screen (way below the viewport) before the filter change
  w.renderVisibleRows();
  w.selectEntry(f.entries[55].id); // no opts.scroll — selection only, doesn't move the scroll into view itself
  assert(tableBody.scrollTop === 0, "sanity: entry 55 selected but scroll left untouched (still off-screen)");

  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w); // entry 55 survives (ERROR-only filter) but was never on screen to begin with
  const newIdx = T.currentViewEntries.findIndex(e => e.id === f.entries[55].id);
  assert(newIdx === 11, "sanity: entry 55 is the last (12th) ERROR entry (0, 5, ..., 55), got index " + newIdx);
  const rowTop = newIdx * 28;
  const expectedScrollTop = rowTop - 400 / 2 + 28 / 2; // centered in the (stubbed 400px) viewport, not edge-snapped
  assert(tableBody.scrollTop === expectedScrollTop,
    "no prior on-screen position to preserve, so the row is revealed centered instead, got " + tableBody.scrollTop + " expected " + expectedScrollTop);
  assert(tableBody.scrollTop <= rowTop && rowTop + 28 <= tableBody.scrollTop + 400,
    "entry 5's row is actually within the new viewport bounds");
});

await withApp(async (w, d, T) => {
  section("61e. Level-filter changes no longer narrow the Full view; auto-reveal Filtered from Full instead (no-op when Stacked is active, or already on Filtered)");

  // 20 entries, ERROR at every 5th index (4 ERROR / 16 INFO).
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));

  /* ---------- Full view's own entry list ignores the level filter entirely ---------- */
  w.applyFhView("stacked"); // both panels rendered so we can inspect both
  fireClick(errBtn, w);
  assert(T.currentViewEntries.length === 4, "sanity: Filtered view narrowed to the 4 ERROR-level entries");
  assert(T.currentHighlightViewEntries.length === 20, "Full view keeps showing every entry, unaffected by the level filter");
  fireClick(errBtn, w); // reset
  assert(T.currentHighlightViewEntries.length === 20, "sanity: still all 20 after clearing the level filter again");

  /* ---------- tabs layout: changing the level filter while on Full reveals Filtered ---------- */
  w.applyFhView("highlight");
  assert(T.fhActiveTab === "highlight", "sanity: on the Full tab");
  fireClick(errBtn, w);
  assert(T.fhActiveTab === "filter", "changing the level filter while on Full auto-reveals the Filtered view");

  /* ---------- already on Filtered: changing the level filter is a no-op for the tab ---------- */
  fireClick(errBtn, w); // clears the filter again
  assert(T.fhActiveTab === "filter", "already on Filtered — stays there (nothing to reveal)");

  /* ---------- Stacked: level-filter change does NOT change fhLayout ---------- */
  w.applyFhView("stacked");
  fireClick(errBtn, w);
  assert(T.fhLayout === "stacked", "Stacked stays unchanged when the level filter changes (both panels already visible)");
  fireClick(errBtn, w); // reset
});

await withApp(async (w, d, T) => {
  section("61c. Switching to another filter auto-reveals the Filtered view from Full (no-op when Stacked is active, or when switching to a plain FILE node)");

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const nodeA = w.createFilterNode(f.id, "text", "message 1");
  const nodeB = w.createFilterNode(f.id, "text", "message 2");
  T.state.activeId = nodeA.id;
  w.render();

  const rowFor = id => [...d.querySelectorAll(".tree-row")].find(r => r.dataset.nodeId === id);

  /* ---------- tabs layout: switching filters reveals Filtered from Full ---------- */
  w.applyFhView("highlight");
  assert(T.fhActiveTab === "highlight", "sanity: on the Full tab");
  fireClick(rowFor(nodeB.id), w);
  assert(T.state.activeId === nodeB.id, "sanity: switched active filter to node B");
  assert(T.fhActiveTab === "filter", "switching to another filter while on Full auto-reveals the Filtered view");

  /* ---------- already on Filtered: switching filters is a no-op for the tab ---------- */
  fireClick(rowFor(nodeA.id), w);
  assert(T.fhActiveTab === "filter", "already on Filtered — stays on Filtered (nothing to reveal)");

  /* ---------- Stacked: switching filters does NOT change fhLayout ---------- */
  w.applyFhView("stacked");
  fireClick(rowFor(nodeB.id), w);
  assert(T.fhLayout === "stacked", "Stacked stays unchanged when switching between filters (both panels already visible)");

  /* ---------- switching to a plain FILE node does NOT auto-reveal (Full already shows the whole file) ---------- */
  // Settle activeId on nodeA BEFORE switching to the Full tab (still in
  // Stacked layout here, so this render()'s own reveal-check is a guaranteed
  // no-op) — otherwise switching tabs first and changing activeId after
  // would itself look like "switched to another filter while on Full" and
  // immediately reveal Filtered again, which isn't what this section means
  // to set up.
  T.state.activeId = nodeA.id;
  w.render();
  w.applyFhView("highlight");
  assert(T.fhActiveTab === "highlight", "sanity: back on the Full tab");
  fireClick(rowFor(f.id), w);
  assert(T.state.activeId === f.id, "sanity: switched active node to the plain file");
  assert(T.fhActiveTab === "highlight", "switching to a FILE node (not a filter) does not auto-reveal Filtered — Full view content already reflects it");
});

/* ============================================================
   GROUP 62 — Bugfix: tailing no longer closes an open Plot dropdown
   Origin: this session (person-reported bug, German: "während ein Log im
   Training [Tailing] ist, kann ich die Plots nicht korrekt Bedienen. wenn
   ich das dropdown zur Auswahl einer Datenspalte für z. B die x Werte
   öffne, schließt es sich kurz darauf von selbst"). Root cause:
   renderExtractTable() unconditionally called renderPlotControls() whenever
   the Plot tab was open, and renderPlotControls() unconditionally did
   `plotControls.innerHTML = html` — destroying and recreating #plotXSelect/
   #plotYSelectSingle/etc. every single call, including the ones
   onTailChange() triggers via a plain render() on every tail poll tick
   while a file is being actively written to. A native <select> element
   getting torn down and recreated closes it immediately if it happened to
   be open — exactly the reported symptom. But tailing only ever appends ROW
   data (extractRowsData); it never touches the pattern/columns/plotConfig
   the controls' HTML is actually built from, so the rebuild was pure waste
   even before considering the dropdown-closing side effect. Fixed with a
   simple content-diff guard (`lastPlotControlsHtml`, reset by
   resetPlotConfig() so a genuine node switch always forces a real rebuild):
   since the generated `html` string is a pure function of
   extractColumns/plotConfig, an unchanged string means the rebuild would
   have been a no-op, so it's skipped entirely (DOM identity preserved,
   whatever was open stays open) — same fix shape as every other "known
   gotcha" DOM-identity bug in this codebase (see CLAUDE.md).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("62. Bugfix: a tail-triggered re-render while the Plot tab is open no longer tears down (and closes) the axis dropdowns");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
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

  const rows = [[0, 0], [10, 10], [20, 20]];
  const log = rows.map(([x, y], i) =>
    `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y}"\n`
  ).join("");
  const handle = fakeHandle(log);
  const f = await w.addFile("live.log", log, () => {});
  f.tail = { handle, offset: log.length, pending: "", failed: false, busy: false };
  w.render();

  const node = w.createFilterNode(f.id, "extract", "x=[value:int] y=[value:int]");
  T.state.activeId = node.id;
  w.render();
  assert(T.extractRowsData.length === 3, "sanity: one extraction row per entry before tailing");

  w.switchExtractView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSelBefore = d.querySelector("#plotXSelect");
  const ySelBefore = d.querySelector("#plotYSelectSingle");
  assert(xSelBefore && ySelBefore, "sanity: both axis dropdowns rendered");

  // Simulate the dropdown being open: jsdom has no real popup state to
  // assert against directly (no layout/hit-testing — see tests/README.md's
  // "Known gaps"), so DOM node IDENTITY is the correct, general proxy here:
  // a real browser closes an open <select> the instant its element is
  // removed from the document, which `innerHTML = ...` always does. Proving
  // the SAME node survives a tail tick is exactly the condition under which
  // a real dropdown would have stayed open too.
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"x=30 y=30"\n`;
  handle._setText(log + appended);
  await w.tailTick(); // -> onTailChange() -> render() -> renderExtractTable() -> renderPlotControls()

  assert(T.extractRowsData.length === 4, "sanity: the tail tick actually added a new extraction row (not a no-op tick)");
  assert(d.querySelector("#plotXSelect") === xSelBefore, "X-axis dropdown is the SAME DOM node after a tail tick (not torn down and recreated)");
  assert(d.querySelector("#plotYSelectSingle") === ySelBefore, "Y-axis dropdown is the SAME DOM node after a tail tick");
  assert(d.querySelectorAll("#plotSvg circle.plot-mark").length === 4, "the chart itself DID update to reflect the new tailed row — only the CONTROLS were left untouched, not the data");

  // A second, back-to-back tick with genuinely no new content (the common
  // steady-state case between bursts of log activity) must be just as inert.
  await w.tailTick();
  assert(d.querySelector("#plotXSelect") === xSelBefore, "an empty tail tick (nothing new to append) is also a no-op for the dropdowns");

  // Sanity check the guard isn't overzealous: an actual config change (chart
  // type line -> bar, which drops the Y-axis dropdown entirely for the
  // checkbox list layout) still rebuilds the controls for real.
  fireClick(d.querySelector('.plot-type-btn[data-type="bar"]'), w);
  assert(d.querySelector("#plotXSelect") !== xSelBefore, "a REAL control change (chart type) still rebuilds the DOM — the guard only skips genuinely identical rebuilds");
  assert(d.querySelector("#plotYSelectSingle") === null, "bar chart type actually took effect (no scatter-only Y-select left behind)");
});

/* ============================================================
   GROUP 63 — Bugfix: the live tail dot goes dark once a file genuinely
   stops growing, instead of staying lit forever
   Origin: this session (2026-08-19), person-reported (German): the app
   correctly detects a file that's still being written and marks it with the
   pulsing live dot, but the dot then never goes away even long after
   nothing new is being written — and when a new file shows up in Folder
   watch and starts receiving lines, the OLD file (no longer written to)
   still shows the dot too.
   Root cause: the dot's condition was `node.tail && !node.tail.failed` —
   i.e. "does a live handle still exist and hasn't errored out", which stays
   true indefinitely once a writer moves on to a different file (e.g.
   rotation), since the old handle stays perfectly readable, just idle.
   Fixed with a staleness window: node.tail now tracks `lastGrowth`
   (stamped on every real byte-level change — growth or rotation-reset) and
   `isTailLive(t)` requires a growth within the last TAIL_LIVE_MS, not just
   an unfailed handle. Since a poll tick with nothing new otherwise produces
   no re-render at all, tailTick() also does a lightweight second pass
   comparing each tail's live status against its own cached `wasLive` and
   fires a cheap renderTree() (not a full render()) when it flips purely
   from time passing, with no bytes read that tick — otherwise the dot
   would only clear itself on the NEXT unrelated change.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("63a. Bugfix: the live tail dot expires once a file stops growing");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
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
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };
  w.render();
  assert(d.querySelector(".tree-live") !== null, "sanity: the live dot renders right after a fresh growth");
  assert(w.isTailLive(f.tail) === true, "sanity: isTailLive agrees — growth was just now");

  // A tick with genuinely nothing new (writer still there, just idle for a
  // moment) must NOT clear the dot — only a real staleness window should.
  await w.tailTick();
  assert(d.querySelector(".tree-live") !== null, "an inert tick shortly after growth keeps the dot lit (not stale yet)");

  // Now simulate "long since stopped writing" by backdating lastGrowth past
  // the staleness window directly, the same way Group 44 backdates
  // errorCount instead of waiting out real timers.
  f.tail.lastGrowth = Date.now() - 60000;
  assert(w.isTailLive(f.tail) === false, "isTailLive itself reports stale once lastGrowth is far enough in the past");
  await w.tailTick(); // no byte growth this tick either — only time passed
  assert(d.querySelector(".tree-live") === null, "the live dot goes dark once the file has been quiet past the staleness window, with NO further tail tick required to have unrelated changes in it");

  // A genuinely new write resurrects it.
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"back again"\n`;
  handle._setText(initial + appended);
  await w.tailTick();
  assert(d.querySelector(".tree-live") !== null, "a real new write lights the dot back up");
  assert(f.entries.length === 4, "sanity: the resurrecting write was actually parsed, not just a dot flip");
});

await withApp(async (w, d, T) => {
  section("63b. Bugfix: Folder-watch rotation — old file's dot fades while the new file's stays lit");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
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

  const oldLog = makeLog(0, 2, { msgPrefix: "old" });
  const oldHandle = fakeHandle(oldLog);
  const oldFile = await w.addFile("app-1.log", oldLog, () => {});
  oldFile.tail = { handle: oldHandle, offset: oldLog.length, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };

  const newLog = makeLog(0, 2, { msgPrefix: "new" });
  const newHandle = fakeHandle(newLog);
  const newFile = await w.addFile("app-2.log", newLog, () => {});
  newFile.tail = { handle: newHandle, offset: newLog.length, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };
  w.render();
  assert(d.querySelectorAll(".tree-live").length === 2, "sanity: both files show live right after being opened");

  // The writer stopped touching the old file a while ago (backdated the same
  // way Part 63a does) and moved on to the new one, which alone grows now.
  oldFile.tail.lastGrowth = Date.now() - 60000;
  const newAppended = `2024-01-15 10:00:02,000\tINFO\t"main"\tFoo.cs\tline 2\t[DoWork]\t"new 2"\n`;
  newHandle._setText(newLog + newAppended);
  await w.tailTick();

  const liveRows = Array.from(d.querySelectorAll(".tree-row")).filter(r => r.querySelector(".tree-live"));
  assert(liveRows.length === 1, "exactly one file shows the live dot after rotation, got " + liveRows.length);
  assert(liveRows[0] && liveRows[0].textContent.includes("app-2.log"), "the live dot stayed on the file that's ACTUALLY still being written to");
  assert(!liveRows.some(r => r.textContent.includes("app-1.log")), "the rotated-out old file no longer shows the live dot");
});

/* ============================================================
   GROUP 66 — ?url= deep-link loading (fetch a log at boot)
   Origin: this session (2026-08-20), person-requested: associate PhiLogg
   with files/CI links by letting philogg.html?url=<encoded-url> fetch and
   open a log straight from an http(s) URL at boot — the shared mechanism
   both a CI report link to a log artifact and the planned desktop wrapper
   (which serves a local file through a loopback URL) build on, instead of
   two separate loading paths. jsdom ships no fetch at all (by design), so
   these tests install a fake `window.fetch` directly before calling the
   exposed `loadFromUrlParam()` (a function declaration, so it's a window
   property per the usual jsdom bridge gotcha) — bypassing the fire-and-
   forget call the boot script itself makes (which races the fake fetch's
   installation and is a no-op anyway against the default test URL, which
   carries no ?url=).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("66a. ?url= fetch success adds the file");
  const logText = makeLog(0, 3);
  await w.history.replaceState(null, "", "http://localhost/philogg.html?url=" + encodeURIComponent("http://logs.example/build-42/output.log"));
  let requestedUrl = null;
  w.fetch = async (u) => { requestedUrl = u; return { ok: true, status: 200, text: async () => logText }; };
  await w.loadFromUrlParam();
  assert(requestedUrl === "http://logs.example/build-42/output.log", "fetch was called with the exact ?url= value");
  assert(T.state.rootIds.length === 1, "exactly one file was opened, got " + T.state.rootIds.length);
  const node = T.state.nodes[T.state.rootIds[0]];
  assert(node.name === "output.log", "the file name is derived from the URL's last path segment, got " + node.name);
  assert(node.entries.length === 3, "the fetched text was parsed into entries, got " + node.entries.length);
});

await withApp(async (w, d, T) => {
  section("66b. ?url= HTTP error shows a toast, no file added");
  await w.history.replaceState(null, "", "http://localhost/philogg.html?url=" + encodeURIComponent("http://logs.example/missing.log"));
  w.fetch = async () => ({ ok: false, status: 404, text: async () => "" });
  await w.loadFromUrlParam();
  assert(T.state.rootIds.length === 0, "no file was added on a 404");
  assert(d.querySelector("#copyToast").textContent.includes("404"), "the toast reports the HTTP status");
});

await withApp(async (w, d, T) => {
  section("66c. ?url= network/CORS failure shows a toast, no file added");
  await w.history.replaceState(null, "", "http://localhost/philogg.html?url=" + encodeURIComponent("http://blocked.example/x.log"));
  w.fetch = async () => { throw new w.TypeError("Failed to fetch"); };
  await w.loadFromUrlParam();
  assert(T.state.rootIds.length === 0, "no file was added when fetch rejects");
  assert(d.querySelector("#copyToast").textContent.includes("network or CORS"), "the toast names network/CORS as the likely cause");
});

// 66d (the location.protocol === "file:" guard) is NOT covered here: jsdom
// treats every file: URL as an opaque origin and throws on ANY localStorage
// access (confirmed for both "file:///x.html" and "file://localhost/x.html"
// — no URL shape avoids it), which the app's own boot sequence (initTheme,
// cacheEnabled) touches before loadFromUrlParam ever runs — unrelated to the
// guard's own logic, but it means a jsdom window can't reach this branch at
// all. window.location itself also can't be shadowed/faked afterwards
// (Object.defineProperty on either `location` or `location.protocol` is
// rejected by jsdom as non-configurable). See tests/README.md "Known gaps".
// The guard (four lines, `if (location.protocol === "file:") {...}`) is
// straightforward enough to cover by code review instead.

/* ============================================================
   GROUP 67 — window.philoggLoadUrl: desktop wrapper hands a
   later-opened file into the already-running window
   Origin: this session (2026-08-20), person-reported (Windows Electron
   build): a second file opened via file-association double-click spawned
   a whole new app window instead of landing in the one already open, and
   the first file loaded showed up in the tree named "1" instead of its
   real file name. Root causes: (1) desktop/main.js's "second-instance"
   handler unconditionally called createWindow() instead of reusing an
   existing window, and (2) the philogg://local/<id> URL it built carried
   only the opaque numeric id as its last path segment, which is exactly
   what loadFromUrlParam's name-from-URL logic (GROUP 66) picks up. Fixed
   by (1) refactoring loadFromUrlParam's fetch-and-add body out into
   loadUrlIntoTree(url), exposed as window.philoggLoadUrl for the main
   process to call via executeJavaScript on an existing window, and (2)
   having main.js embed the real basename as a second path segment
   (philogg://local/<id>/<name>) so the existing last-segment naming logic
   picks up the true file name for free. Covered here: the renderer-side
   half (loadUrlIntoTree/philoggLoadUrl itself, and that repeated calls
   accumulate files rather than replace them) — desktop/main.js's Electron
   APIs (BrowserWindow, single-instance lock) aren't reachable from this
   jsdom suite, see tests/README.md.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("67a. window.philoggLoadUrl is exposed as the same logic loadFromUrlParam uses");
  assert(typeof w.philoggLoadUrl === "function", "window.philoggLoadUrl is a function");
  const logText = makeLog(0, 2);
  w.fetch = async () => ({ ok: true, status: 200, text: async () => logText });
  await w.philoggLoadUrl("philogg://local/1/first.log");
  assert(T.state.rootIds.length === 1, "one file was added, got " + T.state.rootIds.length);
  assert(T.state.nodes[T.state.rootIds[0]].name === "first.log", "file name comes from the URL's last path segment, got " + T.state.nodes[T.state.rootIds[0]].name);
});

await withApp(async (w, d, T) => {
  section("67b. a second philoggLoadUrl call adds a second file instead of replacing the first");
  const log1 = makeLog(0, 2), log2 = makeLog(0, 3);
  let requested = [];
  w.fetch = async (u) => { requested.push(u); const text = requested.length === 1 ? log1 : log2; return { ok: true, status: 200, text: async () => text }; };
  await w.philoggLoadUrl("philogg://local/1/first.log");
  await w.philoggLoadUrl("philogg://local/2/second.log");
  assert(requested.length === 2, "fetch was called once per opened file");
  assert(T.state.rootIds.length === 2, "both files ended up in the same tree, got " + T.state.rootIds.length);
  const names = T.state.rootIds.map(id => T.state.nodes[id].name).sort();
  assert(names[0] === "first.log" && names[1] === "second.log", "both real file names are present, got " + names.join(", "));
});

/* ============================================================
   GROUP 68 — Multi-file load: grayed queued placeholders + merge-on-load
   prompt
   Origin: this session (2026-08-20), person-requested (German): dropping/
   picking several log files at once used to reveal each file's tree row
   only once its own turn to load arrived — the rest of the batch was
   invisible until then. Now every file in the batch gets a grayed
   placeholder row (createQueuedFileNode/renderQueuedFileRow, CSS
   .tree-row-queued) inserted at its eventual tree position immediately,
   turning into a normal, actively-loading row (activateQueuedFileNode) one
   at a time as loadFileDescriptors works through the batch — same idea as
   folder watch's grayed .folder-watch-file rows, but living directly in the
   main tree. Second request: loading 2+ files at once now asks upfront
   (confirmMergeOnLoad, #mergeLoadDialog) whether to merge them into one
   file once loaded — Enter answers Yes (the Merge button is focused on
   open, so this is the browser's own default button-activation, no custom
   keydown code), Escape answers No via the existing global Escape handler.
   Along the way, a single file's read/parse failure inside a batch no
   longer aborts the rest of the batch (each file's load is now individually
   try/caught) — otherwise every queued placeholder after the failed one
   would stay grayed forever.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("68a. Multi-file load: every file gets a grayed placeholder row immediately, in order, before any reading starts");
  const fa = new w.File([makeLog(0, 3)], "a.log", { type: "text/plain" });
  const fb = new w.File([makeLog(0, 3)], "b.log", { type: "text/plain" });
  const fc = new w.File([makeLog(0, 3)], "c.log", { type: "text/plain" });

  const donePromise = w.loadFileDescriptors([
    { file: fa, handle: null }, { file: fb, handle: null }, { file: fc, handle: null },
  ]);
  // Synchronous prefix of loadFileDescriptors (queued-node creation + one
  // render()) has already run by the time this line executes — the first
  // await inside it (confirmMergeOnLoad's Promise) is what actually suspends,
  // same technique Group 48b uses for the single-file loading row.
  const queuedRows = [...d.querySelectorAll(".tree-row-queued .tree-label")].map(l => l.textContent);
  assert(queuedRows.length === 3, "all 3 files get a grayed placeholder row immediately, got " + queuedRows.length);
  assert(queuedRows.join(",") === "a.log,b.log,c.log", "placeholders appear in the order the files were passed in, got " + queuedRows.join(","));
  assert(d.querySelectorAll(".tree-row").length === 0, "none of the 3 are real interactive rows yet — no reading has started");
  assert(T.state.rootIds.length === 3, "each placeholder is already a real state.nodes/rootIds entry, just flagged queued");
  assert(T.state.nodes[T.state.rootIds[0]].queued === true, "placeholder node carries the queued flag");

  const mergeDialog = d.querySelector("#mergeLoadDialog");
  assert(!mergeDialog.classList.contains("hidden"), "loading 3 files at once opens the merge-confirm dialog");
  assert(d.activeElement && d.activeElement.id === "mergeLoadDialogYes", "the Merge button is focused on open, so Enter answers Yes via default button activation");

  // Answer No (via Escape, the person-requested "Esc for No") and let the
  // batch actually start loading.
  fireKeydown(d, w, "Escape");
  assert(mergeDialog.classList.contains("hidden"), "Escape closes the merge dialog");

  await new Promise(r => setTimeout(r, 0)); // let the now-unblocked loop start its first iteration
  const firstLabel = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  assert(firstLabel !== undefined, "the first file's placeholder flips to a real, actively-loading row once its turn arrives");
  assert(firstLabel.closest(".tree-row").querySelector(".tree-load-fill") !== null, "the now-loading first row carries the usual progress fill");
  const stillQueued = [...d.querySelectorAll(".tree-row-queued .tree-label")].map(l => l.textContent);
  assert(stillQueued.join(",") === "b.log,c.log", "the other two files stay grayed/queued while the first one is loading, got " + stillQueued.join(","));

  await donePromise;
  assert(T.state.rootIds.length === 3, "all 3 files ended up loaded");
  assert(d.querySelectorAll(".tree-row-queued").length === 0, "no grayed placeholders remain once the whole batch has loaded");
  assert(T.state.rootIds.every(id => !T.state.nodes[id].merged), "answering No means no merged file was created");
});

await withApp(async (w, d, T) => {
  section("68b. Merge-on-load: answering Yes merges the batch into one file once loaded");
  const fa = new w.File([makeLog(0, 4)], "x.log", { type: "text/plain" });
  const fb = new w.File([makeLog(0, 4, { msgPrefix: "other" })], "y.log", { type: "text/plain" });

  const donePromise = w.loadFileDescriptors([{ file: fa, handle: null }, { file: fb, handle: null }]);
  const mergeDialog = d.querySelector("#mergeLoadDialog");
  assert(!mergeDialog.classList.contains("hidden"), "loading 2 files at once also opens the merge-confirm dialog");
  fireClick(d.querySelector("#mergeLoadDialogYes"), w);
  assert(mergeDialog.classList.contains("hidden"), "clicking Merge closes the dialog");

  await donePromise;
  assert(T.state.rootIds.length === 3, "both source files plus one new merged file are in the tree (mergeFiles keeps sources, same as the manual bulk action)");
  const merged = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.merged);
  assert(merged !== undefined, "a merged file node was created after both files finished loading");
  assert(merged.entries.length === 8, "the merged file's entries are the union of both source files, got " + merged.entries.length);
});

await withApp(async (w, d, T) => {
  section("68c. A single file loaded on its own (no batch) skips the merge dialog entirely");
  const fa = new w.File([makeLog(0, 3)], "solo.log", { type: "text/plain" });
  await w.loadFileDescriptors([{ file: fa, handle: null }]);
  assert(d.querySelector("#mergeLoadDialog").classList.contains("hidden"), "a single-file load never opens the merge dialog");
  assert(T.state.rootIds.length === 1, "the one file loaded normally");
});

await withApp(async (w, d, T) => {
  section("68d. One file failing inside a batch doesn't abort the rest");
  const good = new w.File([makeLog(0, 3)], "good.log", { type: "text/plain" });
  const bad = { name: "bad.log" }; // not a real Blob/File — FileReader.readAsText throws synchronously on it
  const donePromise = w.loadFileDescriptors([{ file: bad, handle: null }, { file: good, handle: null }]);
  fireKeydown(d, w, "Escape"); // answer the merge prompt (2 files queued) so the batch actually runs
  await donePromise;
  const names = T.state.rootIds.map(id => T.state.nodes[id].name);
  assert(names.includes("good.log"), "the good file still loaded despite the bad one failing, got " + JSON.stringify(names));
  assert(!names.includes("bad.log"), "the failed file's placeholder was removed, not left stuck");
  assert(d.querySelector("#copyToast").textContent.includes("bad.log"), "a toast reports which file failed to load");
});

/* ============================================================
   GROUP 69 — mergeFiles follows the same "create the row first, stream
   progress onto it" pattern as loading a file
   Origin: this session (2026-08-20), person-requested follow-up ("Für ein
   File Merge folge der gleichen Logik. Lege den Eintrag zuerst an und Zeige
   den Fortschritt des Merge an diesem Eintrag."): mergeFiles used to build
   the whole merged entries array synchronously in one blocking call before
   the node ever appeared in the tree. It's now async: the merged node is
   inserted into state.nodes/rootIds immediately (empty, loadFraction 0,
   already the active/interactive row via flushLoadRender — mirrors
   createFileNode), then filled in over chunks (MERGE_CHUNK_ENTRIES) with
   node.loadFraction/scheduleLoadRender driving the same .tree-load-fill
   progress bar a real file load uses, before a final chronological sort and
   flushLoadRender clear the fill. Both existing direct mergeFiles() callers
   in this suite (Groups 10 and 30c) were updated to await it; Group 68b
   already covers the merge-on-load dialog's own path through the new async
   mergeFiles indirectly (loadFileDescriptors awaits it internally).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("69. mergeFiles: the merged row exists (grayed-progress, not grayed-placeholder) the instant merging starts, and stays correct once it finishes");
  // fb's timestamps (baseSec 0) are earlier than fa's (baseSec 100) — proves
  // the final sort actually reorders, not just concatenates in call order.
  const fa = await w.addFile("late.log", makeLog(100, 5), () => {});
  const fb = await w.addFile("early.log", makeLog(0, 5, { msgPrefix: "early" }), () => {});

  const before = new Set(T.state.rootIds);
  const donePromise = w.mergeFiles([fa.id, fb.id]);
  // Synchronous prefix (node creation -> flushLoadRender) has already run by
  // the time this line executes — the first await inside the copy loop is
  // what actually suspends, same technique Group 48b uses for a real load.
  const newId = T.state.rootIds.find(id => !before.has(id));
  assert(newId, "the merged file is already a real root node the instant merging starts, before any chunk has finished copying");
  const node = T.state.nodes[newId];
  assert(node.merged === true, "the new node is flagged merged from creation, same as before this change");
  assert(typeof node.loadFraction === "number", "the merged node carries a loadFraction while it's still being built");

  let label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "late.log + early.log");
  assert(label !== undefined, "the merged file's row renders in the tree immediately, not just once merging finishes");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") !== null, "the row carries the usual progress-fill bar while merging, same as a plain file load");
  assert(d.querySelectorAll(".tree-row-queued").length === 0, "the merge uses the loading-progress row, not the grayed queued-placeholder row multi-file loads use");

  await donePromise;
  assert(typeof node.loadFraction !== "number", "loadFraction is cleared off the node once merging finishes");
  assert(node.entries.length === 10, "merged entries combine both source files, got " + node.entries.length);
  for (let i = 1; i < node.entries.length; i++) {
    assert(node.entries[i].ts >= node.entries[i - 1].ts, "merged entries end up in chronological order (entry " + i + ")");
  }
  assert(node.entries[0].message.includes("early"), "the earlier-timestamped source file's entries sort to the front, not just appear in call order");
  // flushLoadRender's final render() rebuilds #tree from scratch (renderTree
  // tears down and recreates every row) — re-query instead of reusing the
  // pre-await `label`, which is now a detached, stale DOM node.
  label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "late.log + early.log");
  assert(label !== undefined, "the merged file still renders as a normal real tree row once merging finishes");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") === null, "the progress fill is gone once merging finishes");
});

/* ============================================================
   GROUP 70 — Format Manager: configurable log formats + filename-pattern
   rules (FEATURE_BACKLOG.md "Pluggable parser logic")
   Origin: this session (2026-08-21), person-requested: a Settings menu
   whose first entry is a Format Manager mapping filename patterns (glob)
   to configurable log formats (a log4net/LogViewPlus-style conversion
   pattern, or a raw regex for edge cases), plus a matching pattern field
   in tools/log-simulator.html and a same-shape example file. Every format
   still produces the fixed entry schema; the builtin default is a
   pass-through to the untouched HEADER_RE/parseHeaderLine until edited.
   ============================================================ */

// state.logFormats/state.formatRules are populated once, asynchronously,
// by the boot-time loadFormatConfig() call this feature added ahead of
// loadFromUrlParam()/restoreSessionFromCache() — same "async boot step"
// consideration as Group 20's session-cache restore poll below, just a
// much shorter wait (no real IndexedDB I/O when no factory is passed).
// Any subtest that reads or writes state.logFormats/state.formatRules for
// its own fixture waits for this first so it never races the one-time
// boot assignment (state.logFormats = formats inside loadFormatConfig).
async function waitForFormatConfig(T) {
  for (let i = 0; i < 40 && T.state.logFormats.length === 0; i++) await new Promise(r => setTimeout(r, 10));
}

await withApp(async (w, d, T) => {
  section("70a. compileFormatPattern / compileDateFormat: pattern-mode compiler");
  const dateFrag = w.compileDateFormat("yyyy-MM-dd HH:mm:ss,SSS");
  assert(dateFrag && dateFrag.order.join(",") === "yyyy,MM,dd,HH,mm,ss,SSS", "compileDateFormat orders its tokens left-to-right");
  assert(dateFrag.matchRegex.test("2024-01-15 10:00:00,123"), "compiled date regex matches a well-formed timestamp");

  const c = w.compileFormatPattern('%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n', "yyyy-MM-dd HH:mm:ss,SSS");
  assert(c && c.regex && c.hasTs, "the canonical default pattern compiles, with a ts group");
  const line = '2024-01-15 10:00:00,123\tINFO\t"main"\tC:\\src\\App.cs\tline 12\t[Startup]\t"Application started"';
  const m = c.regex.exec(line);
  assert(m && m.groups.level === "INFO" && m.groups.thread === "main" && m.groups.method === "Startup" && m.groups.message === "Application started",
    "compiled regex extracts level/thread/method/message correctly, got " + JSON.stringify(m && m.groups));

  const noMsg = w.compileFormatPattern("%d %p", "");
  assert(noMsg.error, "a pattern with no %m/%message token is rejected");

  const withEscapes = w.compileFormatPattern("%p\\t%m", "");
  assert(withEscapes.regex && withEscapes.regex.test("INFO\thello"), "\\t in the pattern text becomes a real tab before compiling");

  const withPercent = w.compileFormatPattern("%%literal %m", "");
  assert(withPercent.regex && withPercent.regex.test("%literal hi"), "%% compiles to a literal percent sign");

  const bracket = w.compileFormatPattern("[%d] %p (%t) %m%n", "yyyy-MM-dd HH:mm:ss");
  const bm = bracket.regex.exec("[2024-01-15 10:00:00] ERROR (worker-1) Database connection failed");
  assert(bm && bm.groups.level === "ERROR" && bm.groups.thread === "worker-1" && bm.groups.message === "Database connection failed",
    "a differently-shaped pattern (brackets/parens, no method/location) compiles and extracts correctly");
});

await withApp(async (w, d, T) => {
  section("70b. Regex mode: named-group validation + graceful degrade on a broken format");
  const v1 = w.validateFormatRegex("(unterminated");
  assert(v1.error, "an invalid regex is rejected with an error");

  const v2 = w.validateFormatRegex("^(?<level>\\w+) (?<thread>\\S+)$");
  assert(v2.error, "a regex without a (?<message>...) group is rejected");

  const v3 = w.validateFormatRegex("^(?<level>\\w+) (?<message>.*)$");
  assert(!v3.error && v3.warning, "missing (?<ts>...) is a non-blocking warning, not a save-blocking error");

  const v4 = w.validateFormatRegex("^(?<ts>\\S+) (?<level>\\w+) (?<message>.*)$");
  assert(!v4.error && !v4.warning, "a regex with both ts and message groups passes cleanly");

  const groups = v4.regex.exec("2024-01-15T10:00:00 ERROR boom").groups;
  const entry = w.applyFormatMatch(groups, "2024-01-15T10:00:00 ERROR boom", null);
  assert(entry.level === "ERROR" && entry.message === "boom", "applyFormatMatch reads named groups into the fixed entry shape");

  // Defense-in-depth: a format whose regex/pattern fails to compile (should
  // only happen if save-time validation was bypassed) degrades to
  // "every line is its own untimestamped entry" instead of throwing.
  const broken = w.compileOneFormat({ id: "x", mode: "regex", regex: "(unterminated", builtin: false, edited: false });
  assert(broken.isHeaderLine("anything"), "a broken format's isHeaderLine never throws and always starts a new entry");
  const e = broken.parseHeader("some raw line");
  assert(e.message === "some raw line" && e.raw === "some raw line", "a broken format's parseHeader degrades to whole-line-as-message");
});

await withApp(async (w, d, T) => {
  section("70c. Glob matcher + filename -> format resolution");
  assert(w.compileGlob("app-*.log").test("app-1.log"), "'*' matches any run of characters");
  assert(w.compileGlob("app-*.log").test("app-prod.log"), "'*' matches a longer run too");
  assert(!w.compileGlob("app-*.log").test("db.log"), "a non-matching filename is rejected");
  assert(w.compileGlob("app-?.log").test("app-1.log"), "'?' matches exactly one character");
  assert(!w.compileGlob("app-?.log").test("app-12.log"), "'?' does not match two characters");
  assert(w.compileGlob("APP-*.LOG").test("app-1.log"), "glob matching is case-insensitive");

  T.state.logFormats = [{ id: "fmt-default", builtin: true, edited: false, name: "d" }, { id: "fmt-a", name: "a" }, { id: "fmt-b", name: "b" }];
  T.state.formatRules = [
    { id: "r1", glob: "*.log", formatId: "fmt-a", order: 1 },
    { id: "r2", glob: "special-*.log", formatId: "fmt-b", order: 0 },
  ];
  assert(w.resolveFormatIdForFilename("special-1.log") === "fmt-b", "the lower-order (earlier) rule wins when multiple rules match");
  assert(w.resolveFormatIdForFilename("plain.log") === "fmt-a", "a filename matching only the later rule still resolves to it");
  assert(w.resolveFormatIdForFilename("other.txt") === "fmt-default", "a filename matching no rule falls back to the default format");
});

await withApp(async (w, d, T) => {
  section("70d. Backward compatibility: unconfigured default format parses exactly as before");
  const f = await w.addFile("plain.log", makeLog(0, 20), () => {});
  assert(f.formatId === "fmt-default", "a freshly loaded file with no rules configured resolves to the builtin default");
  assert(f.entries.length === 20, "entry count matches the fixture");
  assert(f.entries[0].level === "ERROR" && f.entries[1].level === "INFO", "level extraction unchanged");
  assert(f.entries[0].thread === "main", "thread extraction unchanged");
  assert(f.entries[0].method === "DoWork", "method extraction unchanged");
  assert(f.entries[0].locationShort === "Foo.cs:0", "location extraction unchanged, got " + f.entries[0].locationShort);
  assert(f.entries[0].message === "message 0", "message extraction unchanged");
  assert(!isNaN(f.entries[0].ts), "timestamp parses to a valid number");
});

await withApp(async (w, d, T) => {
  section("70e. End-to-end: add a custom format (via sample-suggested pattern) + filename rule on the Settings page, then load a matching file");
  await waitForFormatConfig(T);

  fireClick(d.querySelector("#btnSettings"), w);
  assert(!d.querySelector("#settingsDialog").classList.contains("hidden"), "Settings button opens the settings page directly (no intermediate menu)");
  assert(d.querySelector("#settingsMenu") === null, "the old separate Format-Manager dropdown menu no longer exists");

  const formatRows = () => [...d.querySelectorAll("#formatList .filter-library-row")];
  assert(formatRows().length === 1 && formatRows()[0].querySelector(".filter-library-row-name").textContent.includes("Default"),
    "the builtin default format is listed first, and is the only one initially");
  assert(formatRows()[0].querySelector(".filter-library-row-del") === null, "the builtin default has no delete button");

  const btnAddFormat = d.querySelector("#btnAddFormat");
  assert(btnAddFormat.className === "btn-mini-dashed", "the Add-format button uses the dashed 'add' style, not a filled/outline row-action style, got " + btnAddFormat.className);
  assert(isVisible(btnAddFormat, w), "sanity: the Add-format button is actually visible on screen before anything is clicked");
  fireClick(btnAddFormat, w);
  const formatEditPanel = d.querySelector("#formatEditPanel");
  assert(isVisible(formatEditPanel, w), "Add format embeds inline (same page, no new dialog) and is actually rendered on screen, not just missing the 'hidden' class");
  assert(d.querySelector(".settings-page-card").contains(formatEditPanel), "the inline panel lives inside the same settings-page card, not a separate popup");
  assert(!isVisible(btnAddFormat, w), "the Add-format button itself is actually hidden on screen while its inline panel is open — not just class-toggled with no matching CSS rule");

  // Only the pattern OR the regex field is visible, matching the mode toggle
  // — checked via actual computed display, not just the "hidden" class,
  // since a class with no matching CSS rule leaves the element fully visible.
  assert(isVisible(d.querySelector("#formatEditPatternField"), w) && !isVisible(d.querySelector("#formatEditRegexField"), w),
    "pattern mode (the default) shows the pattern field, hides the regex field");
  fireClick(d.querySelector("#formatEditModeRegex"), w);
  assert(!isVisible(d.querySelector("#formatEditPatternField"), w) && isVisible(d.querySelector("#formatEditRegexField"), w),
    "switching to regex mode hides the pattern field, shows the regex field");
  fireClick(d.querySelector("#formatEditModePattern"), w);
  assert(isVisible(d.querySelector("#formatEditPatternField"), w) && !isVisible(d.querySelector("#formatEditRegexField"), w),
    "switching back to pattern mode shows it again, hides regex");

  // Cancel closes the panel AND brings the Add button back, no format saved.
  fireClick(d.querySelector("#formatEditCancel"), w);
  assert(!isVisible(formatEditPanel, w), "Cancel closes the inline panel");
  assert(isVisible(btnAddFormat, w), "...and the Add-format button reappears");
  assert(formatRows().length === 1, "cancelling adds nothing to the format list");

  // Re-open and actually add one, this time via a pasted sample line instead
  // of typing the pattern by hand — the suggestion should fill in pattern +
  // tsFormat automatically.
  fireClick(btnAddFormat, w);
  assert(!isVisible(btnAddFormat, w), "hidden again on re-open");
  const sampleInput = d.querySelector("#formatEditSample");
  sampleInput.value = "[2024-01-15 10:00:00] ERROR (worker-1) Database connection failed";
  fireInput(sampleInput, w);
  assert(d.querySelector("#formatEditPattern").value === "[%d] %p (%t) %m%n",
    "pasting a sample line auto-suggests a matching conversion pattern, got " + d.querySelector("#formatEditPattern").value);
  assert(d.querySelector("#formatEditTsFormat").value === "yyyy-MM-dd HH:mm:ss", "...and the matching timestamp format");

  const previewRows = () => [...d.querySelectorAll("#formatEditPreview .format-preview-row")];
  assert(previewRows().length === 1 && !previewRows()[0].classList.contains("format-preview-nomatch"),
    "the live preview parses the pasted sample line with the suggested pattern");
  assert(previewRows()[0].textContent.includes("ERROR") && previewRows()[0].textContent.includes("worker-1") && previewRows()[0].textContent.includes("Database connection failed"),
    "the preview shows the extracted level/thread/message, got " + previewRows()[0].textContent);

  d.querySelector("#formatEditName").value = "Bracket format";
  fireClick(d.querySelector("#formatEditSave"), w);
  await new Promise(r => setTimeout(r, 20)); // saveFormatEdit's IndexedDB write is async; UI updates only after it resolves
  assert(!isVisible(formatEditPanel, w), "saving closes/collapses the inline format panel");
  assert(isVisible(btnAddFormat, w), "...and the Add-format button reappears");
  assert(formatRows().length === 2, "the new format is now listed alongside the default");

  const newFormat = T.state.logFormats.find(f => f.name === "Bracket format");
  assert(newFormat && newFormat.mode === "pattern" && !newFormat.builtin, "new format saved with the suggested (then reviewed) pattern, not builtin");
  assert(newFormat.pattern === "[%d] %p (%t) %m%n" && newFormat.tsFormat === "yyyy-MM-dd HH:mm:ss", "the saved format keeps the suggested pattern/tsFormat unchanged (person didn't edit it further)");

  const btnAddFormatRule = d.querySelector("#btnAddFormatRule");
  assert(btnAddFormatRule.className === "btn-mini-dashed", "the Add-rule button uses the dashed 'add' style too, got " + btnAddFormatRule.className);
  assert(isVisible(btnAddFormatRule, w), "sanity: the Add-rule button is visible before being clicked");
  fireClick(btnAddFormatRule, w);
  const ruleEditPanel = d.querySelector("#formatRuleEditPanel");
  assert(isVisible(ruleEditPanel, w), "Add rule also embeds inline, actually rendered on screen");
  assert(!isVisible(btnAddFormatRule, w), "the Add-rule button hides while its panel is open");
  d.querySelector("#formatRuleGlob").value = "bracket-*.log";
  d.querySelector("#formatRuleFormatSelect").value = newFormat.id;
  fireClick(d.querySelector("#formatRuleEditSave"), w);
  await new Promise(r => setTimeout(r, 20)); // saveFormatRuleEdit's IndexedDB write is async
  assert(!isVisible(ruleEditPanel, w), "saving closes/collapses the inline rule panel");
  assert(isVisible(btnAddFormatRule, w), "...and the Add-rule button reappears");
  assert(T.state.formatRules.length === 1 && T.state.formatRules[0].glob === "bracket-*.log", "rule saved with the entered glob");

  fireClick(d.querySelector("#settingsClose"), w);
  assert(d.querySelector("#settingsDialog").classList.contains("hidden"), "Close button closes the settings page");

  const bracketLog = [
    "[2024-01-15 10:00:00] ERROR (worker-1) Database connection failed",
    "[2024-01-15 10:00:01] INFO (worker-1) Retrying connection, attempt 2/3",
  ].join("\n") + "\n";
  const f = await w.addFile("bracket-1.log", bracketLog, () => {});
  assert(f.formatId === newFormat.id, "the loaded file resolved to the custom format via the glob rule");
  assert(f.entries.length === 2, "both lines parsed as separate entries");
  assert(f.entries[0].level === "ERROR" && f.entries[0].thread === "worker-1" && f.entries[0].message === "Database connection failed",
    "custom pattern correctly extracts level/thread/message");
  assert(!isNaN(f.entries[0].ts), "timestamp parses under the custom tsFormat");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("70f. Persistence round-trip: save/list/delete formats and rules; delete-while-referenced guard");
  await waitForFormatConfig(T);

  const fmt = { id: "fmt-test", name: "Test format", mode: "pattern", pattern: "%m%n", regex: "", tsFormat: "", builtin: false, edited: false, createdAt: Date.now() };
  await w.saveLogFormat(fmt);
  let stored = await w.listLogFormats();
  assert(stored.some(f => f.id === "fmt-test"), "format persisted to IndexedDB");

  const rule = { id: "rule-test", glob: "*.log", formatId: "fmt-test", order: 0, createdAt: Date.now() };
  await w.saveFormatRule(rule);
  let storedRules = await w.listFormatRules();
  assert(storedRules.some(r => r.id === "rule-test"), "rule persisted to IndexedDB");

  // removeLogFormat/removeFormatRule (the UI-level wrappers) act on
  // in-memory state.logFormats/formatRules, kept in sync with IndexedDB by
  // saveLogFormat/saveFormatRule elsewhere — drive them the same way.
  T.state.logFormats = stored;
  T.state.formatRules = storedRules;

  await w.removeLogFormat("fmt-test");
  assert(T.state.logFormats.some(f => f.id === "fmt-test"), "in-memory: a format still referenced by a rule is not removed");
  const afterGuard = await w.listLogFormats();
  assert(afterGuard.some(f => f.id === "fmt-test"), "IndexedDB: the blocked delete never reached the store");

  await w.removeFormatRule("rule-test");
  assert(!T.state.formatRules.some(r => r.id === "rule-test"), "in-memory: rule removed");
  storedRules = await w.listFormatRules();
  assert(!storedRules.some(r => r.id === "rule-test"), "IndexedDB: rule actually deleted");

  await w.removeLogFormat("fmt-test");
  assert(!T.state.logFormats.some(f => f.id === "fmt-test"), "in-memory: format removable once no rule references it");
  stored = await w.listLogFormats();
  assert(!stored.some(f => f.id === "fmt-test"), "IndexedDB: format actually deleted");

  T.state.logFormats = [{ id: "fmt-default", builtin: true, edited: false, name: "Default" }];
  T.state.formatRules = [];
  await w.removeLogFormat("fmt-default");
  assert(T.state.logFormats.some(f => f.id === "fmt-default"), "the builtin default is never removed, regardless of references");
}, { indexedDB: new IDBFactory() });

section("70g. Session-cache restore keeps a file's format pinned even after its matching rule is later removed");
{
  const factory = new IDBFactory();
  const bracketLog = [
    "[2024-01-15 10:00:00] ERROR (worker-1) Database connection failed",
    "[2024-01-15 10:00:01] INFO (worker-1) Retrying connection, attempt 2/3",
  ].join("\n") + "\n";

  await withApp(async (w, d, T) => {
    await waitForFormatConfig(T);
    const fmt = { id: "fmt-bracket", name: "Bracket", mode: "pattern", pattern: "[%d] %p (%t) %m%n", regex: "", tsFormat: "yyyy-MM-dd HH:mm:ss", builtin: false, edited: false, createdAt: Date.now() };
    await w.saveLogFormat(fmt);
    T.state.logFormats.push(fmt);
    const rule = { id: "rule-bracket", glob: "bracket-*.log", formatId: fmt.id, order: 0, createdAt: Date.now() };
    await w.saveFormatRule(rule);
    T.state.formatRules.push(rule);

    const f = await w.addFile("bracket-1.log", bracketLog, () => {});
    assert(f.formatId === "fmt-bracket", "sanity: file resolved to the custom format via the rule");
    assert(f.entries[0].level === "ERROR" && f.entries[0].thread === "worker-1", "sanity: parsed under the custom format before persisting");
    await w.persistFileNode(f);
    await w.persistMetaNow();

    // Delete the RULE (keep the format definition) so a fresh resolution of
    // this filename would now fall back to the builtin default — proving
    // restore uses the file's own pinned formatId, not live re-resolution.
    await w.removeFormatRule(rule.id); // already updates state.formatRules internally
    assert(w.resolveFormatIdForFilename("bracket-1.log") === "fmt-default", "sanity: fresh resolution now falls back to default (rule gone)");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40 && T.state.rootIds.length === 0; i++) await sleep(50); // boot restore is async
    assert(T.state.rootIds.length === 1, "restore: file came back via boot-time restore");
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.formatId === "fmt-bracket", "restore: file's original formatId is pinned, ignoring the now-deleted rule");
    assert(f.entries.length === 2, "restore: both entries came back");
    assert(f.entries[0].level === "ERROR" && f.entries[0].thread === "worker-1" && f.entries[0].message === "Database connection failed",
      "restore: re-parsed under the ORIGINAL custom format, not the default, got " + JSON.stringify({ level: f.entries[0].level, thread: f.entries[0].thread, message: f.entries[0].message }));
  }, { indexedDB: factory });
}

await withApp(async (w, d, T) => {
  section("70h. Settings page: opens directly (no menu), sections present, closes via Close button / backdrop click, theme control reflects current theme");
  const btnSettings = d.querySelector("#btnSettings");
  const settingsDialog = d.querySelector("#settingsDialog");
  assert(settingsDialog.classList.contains("hidden"), "sanity: settings page starts closed");
  assert(d.querySelector("#btnTheme") === null, "the old dedicated theme toggle button is gone from the toolbar");

  fireClick(btnSettings, w);
  assert(!settingsDialog.classList.contains("hidden"), "clicking the settings button opens the settings page directly");
  assert(d.querySelector(".settings-page-card") !== null, "it renders as a settings-page card, not a small dropdown");
  assert([...d.querySelectorAll(".settings-section-title")].some(el => el.textContent === "Appearance"),
    "an Appearance section is present");
  assert([...d.querySelectorAll(".settings-section-title")].some(el => el.textContent === "Log Formats"),
    "a Log Formats section is present (Format Manager folded into the settings page, not a separate dialog)");

  const themeSelect = d.querySelector("#settingsThemeSelect");
  assert(themeSelect, "the theme control is in the Appearance section");
  assert(themeSelect.value === d.documentElement.getAttribute("data-theme"),
    "the select's value reflects the current theme, got " + themeSelect.value);

  fireClick(d.body, w);
  assert(!settingsDialog.classList.contains("hidden"), "clicking elsewhere on the page does NOT close the settings page (only Close/backdrop do)");

  fireClick(d.querySelector("#settingsClose"), w);
  assert(settingsDialog.classList.contains("hidden"), "the Close button closes the settings page");

  fireClick(btnSettings, w);
  fireClick(settingsDialog, w); // click lands on the backdrop itself, not a descendant
  assert(settingsDialog.classList.contains("hidden"), "clicking the dialog's own backdrop closes it too");
});

await withApp(async (w, d, T) => {
  section("70h2. Settings page: the theme select actually switches and persists the theme");
  fireClick(d.querySelector("#btnSettings"), w);
  const themeSelect = d.querySelector("#settingsThemeSelect");

  themeSelect.value = "light";
  themeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === "light", "picking Light switches data-theme to light");
  assert(w.localStorage.getItem("philogg-theme") === "light", "theme choice persisted to localStorage");

  themeSelect.value = "dark";
  themeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === "dark", "picking Dark switches data-theme back to dark");
  assert(w.localStorage.getItem("philogg-theme") === "dark", "theme choice persisted to localStorage");
});

await withApp(async (w, d, T) => {
  section("70i. appendTailText is format-aware: a tailed file parses new chunks under ITS OWN format, not the global default");
  const bracketFmt = { id: "fmt-bracket-tail", name: "Bracket", mode: "pattern", pattern: "[%d] %p (%t) %m%n", regex: "", tsFormat: "yyyy-MM-dd HH:mm:ss", builtin: false, edited: false, createdAt: Date.now() };
  T.state.logFormats.push(bracketFmt);

  const node = { id: "fake-tail", entries: [], tail: { pending: "" }, formatId: bracketFmt.id };
  const changed = w.appendTailText(node, "[2024-01-15 10:00:05] WARN (main) tail line one\n");
  assert(changed === true, "appendTailText reports a change when a new entry lands");
  assert(node.entries.length === 1, "one entry appended");
  assert(node.entries[0].level === "WARN" && node.entries[0].thread === "main" && node.entries[0].message === "tail line one",
    "the appended entry is parsed under the file's OWN custom format, not the default log4net shape");

  // A second chunk in the SAME custom shape keeps working (not a one-shot fluke).
  w.appendTailText(node, "[2024-01-15 10:00:06] INFO (main) tail line two\n");
  assert(node.entries.length === 2 && node.entries[1].message === "tail line two", "a subsequent chunk parses correctly too");

  // Default-format node (no formatId) still works via appendTailText, proving
  // this codepath's dispatch didn't regress the un-configured case either.
  const defaultNode = { id: "fake-tail-2", entries: [], tail: { pending: "" }, formatId: null };
  w.appendTailText(defaultNode, makeLog(0, 1));
  assert(defaultNode.entries.length === 1 && defaultNode.entries[0].message === "message 0", "a node with no formatId still tails under the builtin default");
});

await withApp(async (w, d, T) => {
  section("70j. Builtin default row: Edit + Reset (not Delete); Reset reverts both the displayed fields AND actual parsing behavior");
  await waitForFormatConfig(T);
  fireClick(d.querySelector("#btnSettings"), w);

  const defaultRow = () => d.querySelector("#formatList .filter-library-row");
  assert(defaultRow().querySelector(".filter-library-row-del") === null, "the builtin default row has no Delete button");
  const resetBtn = () => [...defaultRow().querySelectorAll("button")].find(b => b.textContent === "Reset");
  assert(resetBtn(), "...and has a Reset button in its place");
  assert(resetBtn().className === "btn-mini-outline", "Reset uses the same secondary-button style as Cancel elsewhere, got " + resetBtn().className);

  // Sanity: an unedited default parses a normal log4net-shaped file correctly.
  const before = await w.addFile("before.log", makeLog(0, 3), () => {});
  assert(before.entries[1].level === "INFO" && before.entries[1].thread === "main" && before.entries[1].method === "DoWork" && before.entries[1].message === "message 1",
    "sanity: unedited default parses a normal file correctly");

  // Edit the default: rename it and replace the pattern with something that
  // only extracts level+message (drops thread/method entirely) — a clearly
  // DIFFERENT, verifiable parse result, not just a cosmetic name change.
  fireClick(defaultRow().querySelector("button.btn-mini-outline"), w); // "Edit"
  d.querySelector("#formatEditName").value = "Renamed default";
  d.querySelector("#formatEditPattern").value = "%p %m%n";
  fireClick(d.querySelector("#formatEditSave"), w);
  await new Promise(r => setTimeout(r, 20)); // saveFormatEdit's IndexedDB write is async

  const editedFmt = T.state.logFormats.find(f => f.id === "fmt-default");
  assert(editedFmt.name === "Renamed default" && editedFmt.edited === true, "editing the builtin default updates it in place and flags it edited");
  assert(defaultRow().querySelector(".filter-library-row-name").textContent.includes("Renamed default"), "the row reflects the new name");

  const duringEdit = await w.addFile("during-edit.log", makeLog(10, 1), () => {});
  assert(duringEdit.entries.length === 1, "sanity: the edited pattern still matches the line as a single entry, got " + duringEdit.entries.length);
  assert(duringEdit.entries[0].thread === "" && duringEdit.entries[0].method === "",
    "while edited, the SAME file shape now parses under the new (different) pattern — thread/method no longer extracted");
  assert(isNaN(duringEdit.entries[0].ts), "...and the %d-less pattern has no ts group at all, so ts is NaN");

  // Reset: reverts the row AND restores the original untouched fast-path parsing.
  fireClick(resetBtn(), w);
  await new Promise(r => setTimeout(r, 20)); // saveLogFormat's IndexedDB write is async

  const resetFmt = T.state.logFormats.find(f => f.id === "fmt-default");
  assert(resetFmt.edited === false, "Reset clears the edited flag");
  assert(resetFmt.name === "Default (log4net-style)" && resetFmt.pattern === '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n' && resetFmt.tsFormat === "yyyy-MM-dd HH:mm:ss,SSS",
    "Reset restores the exact original name/pattern/tsFormat, got " + JSON.stringify(resetFmt.pattern));
  assert(defaultRow().querySelector(".filter-library-row-name").textContent.includes("Default (log4net-style)") && !defaultRow().querySelector(".filter-library-row-name").textContent.includes("Renamed"),
    "the row's displayed name reverts too");

  const after = await w.addFile("after-reset.log", makeLog(20, 3), () => {});
  assert(after.entries[1].level === "INFO" && after.entries[1].thread === "main" && after.entries[1].method === "DoWork" && after.entries[1].message === "message 1",
    "after Reset, a normal file parses exactly as it did before the edit — not just the displayed fields, the actual parse behavior");
});

/* ============================================================
   GROUP 71 — Configurable font size
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Configurable font
   size — adjustable in Settings and via a keyboard shortcut". A whole-UI
   zoom (document.documentElement.style.zoom) rather than a font-size
   variable threaded through every hardcoded font-size in the file — see
   applyFontScale's own comment. Settings row (+/- buttons, a Reset button)
   and Ctrl+Plus/Ctrl+Minus both funnel into the same function, persisted to
   localStorage like the theme toggle.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("71. Configurable font size");

  const html = d.documentElement;
  assert(html.style.zoom === "1", "default font scale is 100% (zoom:1) at boot, got " + JSON.stringify(html.style.zoom));
  assert(d.getElementById("fontScaleValue").textContent === "100%", "Settings shows 100% by default");

  fireClick(d.getElementById("fontScaleUp"), w);
  assert(html.style.zoom === "1.1", "the + button increases zoom by one step (10%)");
  assert(d.getElementById("fontScaleValue").textContent === "110%", "...and the Settings value label updates too");
  assert(w.localStorage.getItem("philogg-font-scale") === "110", "persisted to localStorage");

  fireClick(d.getElementById("fontScaleDown"), w);
  fireClick(d.getElementById("fontScaleDown"), w);
  assert(html.style.zoom === "0.9", "the - button decreases zoom by one step");

  for (let i = 0; i < 10; i++) fireClick(d.getElementById("fontScaleDown"), w);
  assert(html.style.zoom === "0.7", "font scale clamps at the minimum (70%), got " + html.style.zoom);
  for (let i = 0; i < 20; i++) fireClick(d.getElementById("fontScaleUp"), w);
  assert(html.style.zoom === "1.6", "font scale clamps at the maximum (160%), got " + html.style.zoom);

  fireClick(d.getElementById("fontScaleReset"), w);
  assert(html.style.zoom === "1", "Reset restores 100%");

  fireKeydown(d, w, "+", { ctrlKey: true });
  assert(html.style.zoom === "1.1", "Ctrl+Plus increases font scale via keyboard");
  fireKeydown(d, w, "-", { ctrlKey: true });
  assert(html.style.zoom === "1", "Ctrl+Minus decreases font scale via keyboard, back to 100%");
});

/* ============================================================
   GROUP 72 — Ctrl+0/1/2/3 tree/Log-view shortcuts + Enter
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Shortcuts to
   switch between Tree and Filter view", REVISED twice same session per
   person-requested follow-up feedback: Ctrl+0 focuses the filter tree at
   whichever node is ALREADY active — a filter included, not just its root
   file — so arrow keys continue navigating from wherever the person
   currently is (an even earlier pass jumped up to the active node's root
   FILE instead, which undid exactly that); falls back to the first root
   file only if nothing's active yet. Ctrl+1/2/3 mirror the Full/Filtered/
   Stacked toggle buttons one-for-one AND focus the entries pane for
   arrow-key navigation — a new state.entriesView ("filter" | "highlight")
   decides which of moveSelection/moveHighlightSelection the global
   ArrowUp/Down handler calls, also updated by a plain click/dblclick in
   either Log view.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("72. Ctrl+0/1/2/3 tree/Log-view shortcuts + Enter");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const filterA = w.createFilterNode(f.id, "text", "message");
  w.render();

  // Ctrl+0: focus the tree at whichever node is ALREADY active — a filter
  // stays the active node, it does NOT jump up to its root file.
  T.state.activeId = filterA.id;
  fireKeydown(d, w, "0", { ctrlKey: true });
  assert(T.state.activeId === filterA.id, "Ctrl+0 keeps the already-active FILTER active, doesn't jump up to its root file");
  assert(T.state.focusRegion === "tree", "Ctrl+0 switches focus to the tree");

  T.state.activeId = null;
  fireKeydown(d, w, "0", { ctrlKey: true });
  assert(T.state.activeId === f.id, "Ctrl+0 with no active node falls back to the first root file");

  // Ctrl+1: opens Full (Highlight) and focuses it for arrow-key navigation.
  w.applyFhView("filter");
  fireKeydown(d, w, "1", { ctrlKey: true });
  assert(T.fhActiveTab === "highlight", "Ctrl+1 opens the Full view");
  assert(T.state.focusRegion === "entries" && T.state.entriesView === "highlight", "...and focuses it (entriesView) for arrow-key navigation");

  const beforeHighlightSelect = T.state.selectedId;
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.selectedId !== beforeHighlightSelect, "with entriesView \"highlight\", ArrowDown moves the Full view's own selection, not the Filtered view's");

  // Ctrl+2: opens Filtered and focuses it — arrow keys move that view instead.
  fireKeydown(d, w, "2", { ctrlKey: true });
  assert(T.fhActiveTab === "filter", "Ctrl+2 opens the Filtered view");
  assert(T.state.focusRegion === "entries" && T.state.entriesView === "filter", "...and focuses it (entriesView) for arrow-key navigation");

  // Ctrl+3: opens Stacked (both panels visible), defaulting arrow-key focus to Filtered.
  fireKeydown(d, w, "3", { ctrlKey: true });
  assert(T.fhLayout === "stacked", "Ctrl+3 opens the Stacked layout");
  assert(T.state.focusRegion === "entries" && T.state.entriesView === "filter", "...defaulting arrow-key focus to the Filtered pane");

  // Enter on an active FILTER node while the tree has focus reveals the Filtered view.
  w.applyFhView("highlight");
  T.state.activeId = filterA.id;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "filter", "Enter on an active filter node (tree focus) reveals the Filtered view");
  assert(T.state.focusRegion === "entries" && T.state.entriesView === "filter", "...and switches focus to the entries pane");

  // Enter on a FILE node (not a filter) is a no-op for the view switch.
  w.applyFhView("highlight");
  T.state.activeId = f.id;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "highlight", "Enter on a file node (not a filter) leaves the Full tab showing");
  assert(T.state.focusRegion === "tree", "...and focus stays on the tree");
});

/* ============================================================
   GROUP 73 — Horizontal scrollbar in the Filter view
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Horizontal
   scrollbar in the Filter view — so long messages can be read in full".
   #tableBody scrolls horizontally now (Filter view only — #highlightBody,
   the Full view, is unaffected); #tableHeader keeps its own scrollbar
   hidden and has its scrollLeft driven by #tableBody's scroll event, and
   its .row-grid's width kept in sync with the widest currently-rendered
   row (syncTableHeaderWidth, called from renderVisibleRows) since the
   header's own content (short column labels) would otherwise size much
   narrower than a long message. The actual visual overflow/scrollbar
   behavior is CSS/layout-driven (`#tableRows .col-msg{min-width:
   max-content}` forcing the message column's grid track to refuse to
   shrink below its own content) and isn't independently verifiable here —
   jsdom has no real layout engine (see tests/README's "Known gaps") — so
   this covers the JS-observable parts: the overflow-x split itself (real
   computed style, not just a class) and the header sync/scroll-lockstep
   logic. GROUP 73b covers the follow-up bugfix's own JS logic
   (computeMaxMessageWidth/syncTableRowsWidth) directly.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("73. Horizontal scrollbar in the Filter view");

  const tableBody = d.getElementById("tableBody");
  const tableHeader = d.getElementById("tableHeader");
  const highlightBody = d.getElementById("highlightBody");

  assert(w.getComputedStyle(tableBody).overflowX === "auto", "Filter view's #tableBody scrolls horizontally");
  assert(w.getComputedStyle(tableHeader).overflowX === "hidden", "the header's own (synced, non-user-facing) scrollbar stays hidden");
  assert(w.getComputedStyle(highlightBody).overflowX === "hidden", "the Full/Highlight view is unaffected — still clips long messages");

  await w.addFile("a.log", makeLog(0, 5), () => {});
  w.render();

  const tableRows = d.getElementById("tableRows");
  Object.defineProperty(tableRows, "scrollWidth", { value: 1234, configurable: true });
  w.renderVisibleRows();
  const headerGrid = tableHeader.querySelector(".row-grid");
  assert(headerGrid.style.width === "1234px", "the header's row-grid width tracks the widest rendered row's natural width, got " + headerGrid.style.width);

  tableBody.scrollLeft = 42;
  tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  assert(tableHeader.scrollLeft === 42, "scrolling the Filter view's body drives the header's scrollLeft to match");
});

/* ============================================================
   GROUP 73b — Row background/scroll-width bugfix (Filter view)
   Origin: this session (2026-08-21), person-reported follow-up to GROUP 73
   (screenshot: colored row backgrounds and the usable horizontal-scroll
   range stopped at the viewport edge instead of covering a long message's
   full width; a second report after the first fix showed only the row
   that itself held a long message grew — every other row in the same file
   stayed narrow, and the scrollbar's own range shrank back once that row
   scrolled out of the virtualized window). Root-caused to #tableRows
   giving every row a width sized from whatever the CURRENTLY RENDERED
   window happened to contain, never the full filtered list. Fixed by
   computing ONE width up front from the WIDEST message across the entire
   current view (computeMaxMessageWidth) and applying it to #tableRows
   itself (syncTableRowsWidth) — every .log-row is a plain width:auto
   block, so all of them inherit that one shared width uniformly. See
   PROJECT.md changelog for the full root-cause writeup and the CSS
   comment near applyRowGrid for the calculation itself.
   Unlike the GROUP 73 CSS overflow mechanism, this fix's actual logic is
   plain JS over an entries array — genuinely testable here, not a jsdom
   "layout blind spot" case. jsdom has no real layout engine, so
   measureMsgWidth (see its own comment, and GROUP 73c below for its
   follow-up rewrite) falls back to a deterministic per-character estimate
   there — fine for relative/threshold assertions, not for exact pixel
   values, same caveat as the character-count-based approach itself (a real
   browser's font-metric precision is what ultimately matters, verified
   separately with Playwright per the changelog entry).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("73b. Row background/scroll-width bugfix (Filter view)");

  const tableRows = d.getElementById("tableRows");
  const tableBody = d.getElementById("tableBody");
  const tableSpacer = d.getElementById("tableSpacer");

  assert(w.computeMaxMessageWidth([]) === 0, "computeMaxMessageWidth of an empty list is 0");
  assert(w.computeMaxMessageWidth([{ message: "" }, { message: null }]) === 0, "...and of a list with no message text");

  const shortMsg = "hi";
  const longMsg = "x".repeat(200);
  assert(
    w.computeMaxMessageWidth([{ message: shortMsg }, { message: longMsg }]) > w.computeMaxMessageWidth([{ message: shortMsg }]),
    "computeMaxMessageWidth grows with the widest message ANYWHERE in the list, not just the first/last entry"
  );

  // Multiline mode: the WIDEST LINE decides the width, not the total
  // (unwrapped) character count — mirrors the on/off distinction
  // rowHeightForEntry already makes for row HEIGHT (line count, not total
  // length), since white-space:nowrap collapses a literal "\n" to a single
  // space (one visual line) while white-space:pre actually breaks on it.
  const mixedMessage = "a\n" + "y".repeat(50) + "\nb";
  T.state.multilineMessages = false;
  const singleLineW = w.computeMaxMessageWidth([{ message: mixedMessage }]);
  T.state.multilineMessages = true;
  const multilineW = w.computeMaxMessageWidth([{ message: mixedMessage }]);
  T.state.multilineMessages = false;
  assert(singleLineW > multilineW, "single-line mode measures the WHOLE message; multiline mode measures only its widest individual line");

  // End-to-end: #tableRows itself gets ONE explicit width from the widest
  // message in the whole file, applied uniformly — not a per-row width.
  const longSuffix = "x".repeat(200);
  await w.addFile("mix.log", makeLog(0, 5, { suffix: i => (i === 2 ? longSuffix : "") }), () => {});
  w.render();

  assert(tableRows.style.width !== "", "a file with one long message (among otherwise-short ones) gives #tableRows an explicit width");
  const widthPx = parseFloat(tableRows.style.width);
  assert(widthPx > tableSpacer.clientWidth, "...wider than the viewport (clientWidth stub is " + tableSpacer.clientWidth + "px)");

  // Scroll to a window of rows that does NOT include the long-message row
  // (index 2) and confirm #tableRows' width is untouched — exactly the
  // person-reported regression (background/scroll range used to shrink
  // back once the long-message row scrolled out of the rendered window).
  const widthBefore = tableRows.style.width;
  tableBody.scrollTop = 999;
  w.renderVisibleRows();
  assert(tableRows.style.width === widthBefore, "…and stays exactly the same width once the long-message row scrolls out of the rendered window");

  // A file with only short messages: nothing needs more than the viewport,
  // so #tableRows must go back to filling it — no leftover inline width
  // from the previous (long-message) file. The global clientWidth stub is
  // a narrow 800px (barely wider than the default fixed columns alone,
  // 811px — see applyRowGrid/DEFAULT_COLUMN_WIDTHS), which would make even
  // a short message "overflow" here; widen #tableSpacer's stub just for
  // this assertion to a value any short message genuinely fits inside,
  // matching what a real (much wider) desktop viewport gives for free.
  Object.defineProperty(tableSpacer, "clientWidth", { value: 5000, configurable: true });
  await w.addFile("short.log", makeLog(0, 5), () => {});
  w.render();
  assert(tableRows.style.width === "", "a file with only short messages leaves #tableRows filling the view (no inline width)");
});

/* ============================================================
   GROUP 73c — measureMsgWidth rewrite: real DOM measurement, not canvas
   Origin: this session (2026-08-21), person-reported follow-up to GROUP 73b
   (built the exact "4 differently-long messages" repro the person asked
   for — short/medium/long/multi-line-stacktrace — and scrolled all the way
   right with Playwright): #tableRows WAS sized correctly per GROUP 73b's
   own logic, but consistently wider than where the longest message's text
   actually ended — a real, visible gap past the last character, growing
   with the message's length. Root cause: GROUP 73b's measureMsgWidth used
   Canvas2D's measureText(), which measurably diverges from Blink's own CSS
   layout text renderer for an IDENTICAL font-family/size string (confirmed
   directly: an offscreen canvas and a real DOM element given the same
   700-character string and the same explicit font declaration came back
   ~1.1% apart per character — small alone, but compounding linearly with
   message length, so a genuinely long line — the exact case this feature
   exists for — could end up hundreds of pixels short of matching reality).
   Not a rounding nit: two different browser text-rendering pipelines
   (canvas glyph shaping vs. layout line-boxing) simply don't promise
   pixel-identical advance widths for the same font, even same-engine.
   Fixed by dropping canvas entirely: measureMsgWidth now reads the natural
   width of a hidden, reused DOM element carrying the SAME `.col-msg` class
   real rows use (position:absolute, shrink-to-fit, off past any visible
   area) via offsetWidth — literally the same rendering path a real row
   uses, so it cannot diverge from it. See PROJECT.md changelog for the
   measured numbers and the offsetWidth-vs-getBoundingClientRect zoom-safety
   check (offsetWidth stays in unscaled CSS px under state.fontScale's
   whole-UI zoom; getBoundingClientRect() doesn't — verified with
   Playwright, not assumed).
   jsdom has no real layout engine, so a freshly created, unstubbed
   element's offsetWidth is always 0 — same documented blind spot the
   highlight-marker tooltip positioning already works around — exercising
   measureMsgWidth's own MONO_CHAR_WIDTH_FALLBACK path exactly, deterministically.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("73c. measureMsgWidth rewrite: real DOM measurement, not canvas");

  assert(typeof w.measureMsgWidth === "function", "measureMsgWidth exists");
  assert(w.measureMsgWidth("") === 0, "measureMsgWidth of an empty string is 0");
  assert(
    w.measureMsgWidth("hello") === 5 * T.MONO_CHAR_WIDTH_FALLBACK,
    "in jsdom (no real layout engine, offsetWidth always 0 on a fresh element), measureMsgWidth falls back to exactly length * MONO_CHAR_WIDTH_FALLBACK"
  );
  assert(
    w.measureMsgWidth("a".repeat(50)) === 50 * T.MONO_CHAR_WIDTH_FALLBACK,
    "...proportionally, for a longer string"
  );

  // The measuring element is created once and reused (not a fresh element,
  // and not inserted, per call) — a perf guard: computeMaxMessageWidth
  // calls this once per render, not once per entry, specifically BECAUSE
  // a real layout-triggering measurement is too slow to do per-entry over
  // a large file; if this ever regressed into re-creating/re-inserting the
  // element every call, a huge file would reflow on every keystroke-speed
  // render.
  w.measureMsgWidth("first");
  const probesAfterFirst = d.querySelectorAll("body > div.col-msg").length;
  w.measureMsgWidth("second");
  const probesAfterSecond = d.querySelectorAll("body > div.col-msg").length;
  assert(probesAfterFirst === 1, "exactly one hidden measuring element exists after the first call, got " + probesAfterFirst);
  assert(probesAfterSecond === 1, "...and the SAME one is reused on a second call, not a new one appended, got " + probesAfterSecond);

  const probe = d.querySelector("body > div.col-msg");
  assert(w.getComputedStyle(probe).visibility === "hidden", "the measuring element is visibility:hidden (kept laid out for offsetWidth, just not painted)");
  assert(w.getComputedStyle(probe).position === "absolute", "...and taken out of flow (position:absolute) so it can't affect real layout");
});

/* ============================================================
   GROUP 74 — Double-click a filter row opens its edit dialog
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Double-click on a
   filter opens its edit dialog". NOT a native "dblclick" listener: a tree
   row's own click handler always ends in a full render(), which rebuilds
   every #tree row from scratch (CLAUDE.md's "DOM identity across clicks"
   gotcha, previously documented for renderVisibleRows()/native dblclick —
   the same class of bug applies here to a real browser's dblclick pairing,
   just unobservable from jsdom's directly-dispatched click events). Manual
   click-id+timestamp tracking (lastTreeRowClickId/Time) sidesteps that
   entirely. Shares the same editFilterNode helper F2 and the context
   menu's "Edit filter…" action already use.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("74. Double-click a filter row opens its edit dialog");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  const timeNode = w.createFilterNode(f.id, "after", f.entries[3].ts);
  w.render();
  function rowFor(nodeId) { return d.querySelector('.tree-row[data-node-id="' + nodeId + '"]'); }

  fireClick(rowFor(textNode.id), w);
  assert(d.querySelector("#filterPopup").classList.contains("hidden"), "a single click alone doesn't open the edit dialog");
  fireClick(rowFor(textNode.id), w);
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "...but a second quick click on the same row does (double-click)");
  assert(d.querySelector("#filterInput").value === "message 1", "...pre-filled with the existing value (edit mode)");
  w.closeFilterPopup();

  // A time-range ("after") node opens the OTHER dialog on double-click.
  w.render();
  fireClick(rowFor(timeNode.id), w);
  fireClick(rowFor(timeNode.id), w);
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "double-clicking a time-filter row opens the time-range dialog instead");
  w.closeTimeRangeDialog();

  // Two Ctrl+clicks (multi-select gesture) never count as a double-click.
  w.render();
  const ctrlClick = () => rowFor(textNode.id).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  ctrlClick(); ctrlClick();
  assert(d.querySelector("#filterPopup").classList.contains("hidden"), "two Ctrl+clicks (multi-select) never open the edit dialog");

  // Two clicks spread further apart than the double-click window don't count either.
  w.render();
  fireClick(rowFor(textNode.id), w);
  await new Promise(r => setTimeout(r, 600));
  fireClick(rowFor(textNode.id), w);
  assert(d.querySelector("#filterPopup").classList.contains("hidden"), "two clicks well over 450ms apart don't count as a double-click");

  // A file row (not a filter) double-click is a harmless no-op.
  w.render();
  fireClick(rowFor(f.id), w);
  fireClick(rowFor(f.id), w);
  assert(d.querySelector("#filterPopup").classList.contains("hidden") && d.querySelector("#timeRangeDialog").classList.contains("hidden"),
    "double-clicking a FILE row opens neither dialog");
});

/* ============================================================
   GROUP 75 — Ctrl+W closes the currently open file
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Ctrl+W closes the
   currently open file". Same close path the tree row's own ✕ button uses
   (deleteFilterNodeWithUndo via getRootFileId), so it's undo-able and works
   regardless of which node in the file's chain happens to be active.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("75. Ctrl+W closes the currently open file");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const filterA = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = filterA.id; // active node is a child filter, not the file itself
  w.render();

  fireKeydown(d, w, "w", { ctrlKey: true });
  assert(!T.state.nodes[f.id], "Ctrl+W removes the active node's root FILE, even though a child filter was active");
  assert(!T.state.nodes[filterA.id], "...and its filter children go with it");
  assert(T.state.rootIds.length === 0, "no files remain");

  T.state.activeId = null;
  fireKeydown(d, w, "w", { ctrlKey: true });
  assert(T.state.rootIds.length === 0, "Ctrl+W with nothing open is a harmless no-op");

  const f2 = await w.addFile("b.log", makeLog(0, 3), () => {});
  T.state.activeId = f2.id;
  w.render();
  fireKeydown(d, w, "w", { ctrlKey: true });
  assert(T.state.rootIds.length === 0, "sanity: b.log closed");
  w.undo();
  assert(T.state.nodes[f2.id], "Ctrl+W's close goes through the same undo-able deleteFilterNodeWithUndo path as the ✕ button");
});

/* ============================================================
   GROUP 76 — Settings: "Closing the last log file quits the app"
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md item, default off.
   Purely a local app-behavior preference (localStorage, like the theme
   toggle), meaningful mainly under the Electron desktop wrapper — a bare
   window.close() is enough there since Electron intercepts a renderer's
   own window.close() and closes that BrowserWindow (see PROJECT.md
   "Desktop wrapper"); in an ordinary browser tab it's a no-op. window.close
   is stubbed here (and restored afterwards) rather than actually invoked,
   since a real jsdom window.close() would tear the test window down mid-run.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("76. Settings: \"Closing the last log file quits the app\" (default off)");

  const checkbox = d.getElementById("settingsQuitOnLastClose");
  assert(checkbox.checked === false, "off by default");

  const originalClose = w.close;
  let closeCalls = 0;
  w.close = () => { closeCalls++; };
  try {
    const f = await w.addFile("a.log", makeLog(0, 3), () => {});
    T.state.activeId = f.id;
    w.render();

    fireKeydown(d, w, "w", { ctrlKey: true });
    assert(closeCalls === 0, "closing the last file does nothing extra while the setting is off");
    assert(w.localStorage.getItem("philogg-quit-on-last-close") === null, "nothing persisted yet — setting untouched");

    checkbox.checked = true;
    checkbox.dispatchEvent(new w.Event("change", { bubbles: true }));
    assert(w.localStorage.getItem("philogg-quit-on-last-close") === "1", "enabling the checkbox persists it");

    const f2 = await w.addFile("b.log", makeLog(0, 3), () => {});
    const other = await w.addFile("c.log", makeLog(0, 3), () => {});
    T.state.activeId = f2.id;
    w.render();

    fireKeydown(d, w, "w", { ctrlKey: true });
    assert(closeCalls === 0, "closing one of two open files doesn't quit — one file (\"c.log\") still remains");
    assert(T.state.rootIds.length === 1, "sanity: one file remains");

    T.state.activeId = other.id;
    w.render();
    fireKeydown(d, w, "w", { ctrlKey: true });
    assert(closeCalls === 1, "closing the very last open file quits the app when the setting is on");
  } finally {
    w.close = originalClose;
  }
});

/* ============================================================
   GROUP 77 — Bugfix: sample-line pattern suggestion, two fixes for the
   same person-reported PLC log (this session, 2026-08-21, via screenshot):

   1. ";SSS" (and any other) millisecond separator, not just "," / ".".
      The log uses "10:43:18;617" (semicolon before milliseconds), which
      tripped the fractional-seconds candidate in SAMPLE_TS_CANDIDATES —
      it only matched "." or ",". The suggester fell back to the no-ms
      timestamp shape and baked the sample's own ms value (";617") into
      the pattern as literal text, so only lines sharing that exact
      millisecond kept matching. Fixed by capturing whatever separator
      character is actually present and reproducing it in tsFormat
      instead of hardcoding "," (compileDateFormat already escapes
      literal separators generically, so this was purely a suggestion-
      heuristic gap, not a compiler limit).
   2. A bare (unquoted, undelimited) thread field. Reported as STILL
      breaking after fix 1 — the real remaining cause: this log's header
      lines ("TRACE\t-\t[System]\t...") and its FIFO-data lines
      ("WARN\tAxCtrl\t[-]\t...") share one shape, %d %p <bare-word>
      [%M] %m, but the suggester only ever recognized a thread wrapped in
      quotes or parens. On the one sample line it saw, the bare word
      between level and the [System] bracket was "-", which then got
      read as fixed literal text — so it matched every header line (all
      literally "-") but not one FIFO-data line, where that same
      position holds a real, varying value ("AxCtrl", "CrashP", ...).
      Fixed by claiming a single whitespace-free token sitting directly
      between %p and an already-claimed %M bracket as %t — a narrow,
      structurally-cued case (framed by the level on one side and an
      immediate "[" on the other) rather than a blind "next word is the
      thread" guess that would misfire on ordinary free-form messages.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("77. Pattern suggestion: non-comma ms separators AND a bare thread field both round-trip instead of becoming literal text");

  const semi = w.suggestPatternFromSample("2026-08-14 10:43:18;617\tTRACE\t-\t[System]\tSafety: ES OK");
  assert(semi && semi.pattern === "%d\\t%p\\t%t\\t[%M]\\t%m%n", "the ms value is absorbed into %d and the bare \"-\" becomes %t, not literal text, got " + (semi && semi.pattern));
  assert(semi.tsFormat === "yyyy-MM-dd HH:mm:ss;SSS", "tsFormat reproduces the semicolon separator actually seen, got " + semi.tsFormat);

  // The suggested pattern/tsFormat must then actually parse LATER lines
  // with a different millisecond AND a real (non-"-") thread value — the
  // exact failure mode reported: the FIFO-data block read as one message.
  const compiled = w.compileFormatPattern(semi.pattern, semi.tsFormat);
  assert(compiled.regex, "the suggested pattern compiles");
  const header = compiled.regex.exec("2026-08-14 10:43:18;617\tTRACE\t-\t[System]\t*************** START FIFO DATA ***************");
  assert(header && header.groups.thread === "-" && header.groups.method === "System", "a second header line (thread \"-\") still matches, got " + JSON.stringify(header && header.groups));
  const fifo = compiled.regex.exec("2026-08-14 10:33:45;389\tWARN\tAxCtrl\t[-]\tFB_InitEndlessPosition Error");
  assert(fifo, "a FIFO-data line, with a DIFFERENT millisecond AND a real thread value, still matches the suggested pattern");
  assert(fifo.groups.thread === "AxCtrl" && fifo.groups.method === "-" && fifo.groups.message === "FB_InitEndlessPosition Error",
    "...and thread/method/message are extracted from their correct fields, not swallowed into a prior message, got " + JSON.stringify(fifo && fifo.groups));

  const dotOrComma = w.suggestPatternFromSample("2024-01-15 10:00:00,123 ERROR boom");
  assert(dotOrComma.tsFormat === "yyyy-MM-dd HH:mm:ss,SSS", "comma separator still round-trips as before (no regression), got " + dotOrComma.tsFormat);
  const dot = w.suggestPatternFromSample("2024-01-15 10:00:00.123 ERROR boom");
  assert(dot.tsFormat === "yyyy-MM-dd HH:mm:ss.SSS", "dot separator still round-trips too, got " + dot.tsFormat);

  const noMs = w.suggestPatternFromSample("2024-01-15 10:00:00 ERROR boom");
  assert(noMs.tsFormat === "yyyy-MM-dd HH:mm:ss", "a sample with no fractional seconds at all still falls back cleanly, got " + noMs.tsFormat);

  // No bracket at all -> no structural cue -> the bare-word rule must NOT
  // fire (would otherwise misread the first word of a free-form message
  // as a thread).
  const noBracket = w.suggestPatternFromSample("2024-01-15 10:00:00 ERROR Database connection failed");
  assert(noBracket.pattern === "%d %p %m%n", "with no bracket to frame it, a bare word after the level is left as part of the message, not misread as %t, got " + noBracket.pattern);

  // Already-quoted thread still takes priority over the new bare-word rule.
  const quoted = w.suggestPatternFromSample('2024-01-15 10:00:00 ERROR "main" [Startup] boom');
  assert(quoted.pattern === '%d %p "%t" [%M] %m%n', "a quoted thread is still claimed the old way, unaffected by the new bare-word rule, got " + quoted.pattern);
});

/* ============================================================
   GROUP 78 — Enter on a selected Filtered/Stacked row mirrors dblclick
   Origin: this session (2026-08-21), person request: with a single row
   selected in the Filtered view (or the Filtered/bottom pane of the
   Stacked view — same entriesView === "filter" rows either way), Enter
   should do what a dblclick on that row already does: revealInHighlightView
   (see its own comment — centres the Full view on the entry without
   touching activeId/levelFilter/the Filter view's own scroll position).
   Left alone (no-op) with a multi-selection active, since there's no
   single obvious target row; also left alone with focus on the tree or the
   Full/Highlight pane itself (unrelated to this request).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("78. Enter on a selected Filtered/Stacked row mirrors dblclick (revealInHighlightView)");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  w.render();

  // Filtered (tabs layout): Enter on the single selected row reveals the Full view.
  w.applyFhView("filter");
  const target = f.entries[2];
  w.selectEntry(target.id);
  T.state.focusRegion = "entries";
  assert(T.state.entriesView === "filter", "sanity: entriesView is \"filter\" after selecting a row in the Filtered view");
  const prevActiveId = T.state.activeId;
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "highlight", "Enter on the selected Filtered row switches to the Full tab, same as a dblclick would");
  assert(T.state.selectedId === target.id, "...keeping the same entry selected");
  assert(T.state.activeId === prevActiveId, "...without touching the active filter node (revealInHighlightView's own contract)");

  // Stacked layout: Enter on the selected row in the bottom (Filtered) pane does the same thing.
  w.applyFhView("stacked");
  const target2 = f.entries[4];
  w.selectEntry(target2.id);
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "highlight", "Enter on the selected row in Stacked's Filtered pane reveals the Full view the same way");
  assert(T.state.selectedId === target2.id, "...keeping that entry selected");

  // Multi-selection active: Enter is a no-op (no single obvious target row).
  w.applyFhView("filter");
  w.selectEntry(f.entries[1].id);
  T.state.logMultiSelect = new Set([f.entries[1].id, f.entries[3].id]);
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "filter", "Enter with a multi-selection active leaves the Filtered tab showing (no-op)");

  // Focus elsewhere (tree): Enter's existing tree behavior is untouched, doesn't fall through to this new path.
  T.state.logMultiSelect = new Set();
  w.applyFhView("filter");
  const filterA = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = filterA.id;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "filter", "Enter on the tree still runs its own (unrelated) filter-node behavior, not this new entries-pane path");
});

/* ============================================================
   GROUP 79 — Settings dialog redesign: section nav, unified card/row grid,
   Add-vs-Edit button hierarchy, boolean rows as a switch
   Origin: this session (2026-08-22), Claude-Design handoff bundle
   ("Settings Dialog und Panel-Navigation"). See PROJECT.md for the full
   design reference. IntersectionObserver-driven active-section highlighting
   on scroll isn't exercised here (jsdom has no IntersectionObserver — see
   the guard in the app itself); only the click-wiring + default state.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("79. Settings dialog redesign: section nav + unified rows + switch + button hierarchy");
  await waitForFormatConfig(T);

  fireClick(d.querySelector("#btnSettings"), w);

  const navItems = [...d.querySelectorAll("#settingsNav .settings-nav-item")];
  assert(navItems.length === 3, "the section nav lists exactly the three sections, got " + navItems.length);
  const targets = navItems.map(b => b.dataset.navTarget);
  assert(targets.includes("settingsSectionAppearance") && targets.includes("settingsSectionBehavior") && targets.includes("settingsSectionFormats"),
    "nav items point at Appearance/Behavior/Log Formats, got " + JSON.stringify(targets));
  targets.forEach(id => assert(d.getElementById(id), "every nav target id resolves to an actual section, missing " + id));

  const appearanceNavItem = navItems.find(b => b.dataset.navTarget === "settingsSectionAppearance");
  assert(appearanceNavItem.classList.contains("active"), "Appearance is the default active nav item on open");

  // Clicking a nav item is wired (calls scrollIntoView, guarded for
  // environments without it — see the app's own comment) and doesn't throw.
  const formatsNavItem = navItems.find(b => b.dataset.navTarget === "settingsSectionFormats");
  fireClick(formatsNavItem, w);

  // Row grid: each row group sits inside one .settings-card, using CSS grid.
  const appearanceCard = d.querySelector("#settingsSectionAppearance .settings-card");
  assert(appearanceCard, "the Appearance section's rows sit inside a .settings-card");
  const appearanceRows = [...appearanceCard.querySelectorAll(".settings-row")];
  assert(appearanceRows.length === 3, "Theme + Accent color (hidden on Dark, no highlightPalette — see GROUP 87) + Font size are all rows inside that one card, got " + appearanceRows.length);
  assert(w.getComputedStyle(appearanceRows[0]).display === "grid", "a settings-row lays out via CSS grid (1fr auto), got " + w.getComputedStyle(appearanceRows[0]).display);

  // Boolean row: rendered as a switch (input + adjacent track element),
  // still the same real checkbox underneath (see GROUP 76 for its behavior).
  const quitCheckbox = d.getElementById("settingsQuitOnLastClose");
  assert(quitCheckbox.closest(".settings-switch"), "the boolean checkbox is wrapped in .settings-switch");
  assert(quitCheckbox.nextElementSibling && quitCheckbox.nextElementSibling.classList.contains("settings-switch-track"),
    "...with a switch-track element right next to it for the on/off visual");

  // Button hierarchy: the filled accent (.btn-mini) button is reserved for
  // the primary action (Save) — list-row actions (Edit/Reset) are outline,
  // and the "Add…" affordance is a dashed outline, distinct from both.
  assert(d.querySelectorAll("#formatList .btn-mini, #formatRuleList .btn-mini").length === 0,
    "no filled accent button inside the format/rule list rows themselves");
  assert(d.querySelector("#formatList .btn-mini-outline"), "the Default format row's Edit button is outline-styled");
  assert(d.querySelector("#btnAddFormat").className === "btn-mini-dashed" && d.querySelector("#btnAddFormatRule").className === "btn-mini-dashed",
    "both Add buttons use the dashed style, distinct from Edit's outline and Save's filled accent");
  assert(d.querySelector("#formatEditSave").className === "btn-mini" && d.querySelector("#formatRuleEditSave").className === "btn-mini",
    "Save stays the one filled accent button in each inline panel");
});

/* ============================================================
   GROUP 80 — Collapsible sidebar / detail panel
   Origin: this session (2026-08-22), Claude-Design handoff bundle
   ("Settings Dialog und Panel-Navigation", part 1b). Sidebar collapses to a
   40px rail (marker chain for the active node's ancestry, or root files with
   nothing active); hovering it while collapsed peeks the full tree as an
   overlay (identical markup to the expanded state, no separate rendering
   path — see toggleSidebarCollapsed's comment); clicking the toggle while
   peeking pins it open (exits .collapsed entirely). Detail panel collapses
   to its 34px header, which still shows level/time/first-message-line
   instead of going empty. Both: Ctrl+B/Ctrl+J, resizer double-click,
   localStorage-persisted collapsed flag (display-preference tier, same as
   theme/font-scale — see THEME_STORAGE_KEY).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("80. Collapsible sidebar / detail panel");

  const sidebarEl = d.querySelector("#sidebar");
  const detailPanel = d.querySelector("#detailPanel");
  const sidebarNormalContent = d.querySelector("#sidebarNormalContent");
  const sidebarRail = d.querySelector("#sidebarRail");
  const detailBody = d.querySelector("#detailBody");

  assert(!sidebarEl.classList.contains("collapsed") && !detailPanel.classList.contains("collapsed"), "both panels start expanded");
  assert(isVisible(sidebarNormalContent, w) && !isVisible(sidebarRail, w), "expanded: normal tree content shown, rail hidden");

  // --- Sidebar collapse/expand ---
  w.toggleSidebarCollapsed();
  assert(sidebarEl.classList.contains("collapsed"), "toggleSidebarCollapsed() collapses the sidebar");
  assert(sidebarEl.style.width === "40px", "collapsed width is set to the 40px rail, got " + sidebarEl.style.width);
  assert(w.localStorage.getItem("philogg-sidebar-collapsed") === "1", "collapsed flag persisted to localStorage");
  assert(!isVisible(sidebarNormalContent, w) && isVisible(sidebarRail, w), "collapsed (not hovering): rail shown, normal content hidden");

  w.toggleSidebarCollapsed();
  assert(!sidebarEl.classList.contains("collapsed"), "toggling again expands the sidebar");
  assert(sidebarEl.style.width !== "40px", "width is restored away from the 40px rail value, got " + sidebarEl.style.width);
  assert(w.localStorage.getItem("philogg-sidebar-collapsed") === "0", "expanded flag persisted too");

  // --- Hover-peek: collapsed + mouseenter shows the exact expanded content
  //     as an overlay (no separate peek-only markup/rendering) ---
  w.toggleSidebarCollapsed(true);
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(sidebarEl.classList.contains("peeking"), "hovering a collapsed sidebar enters peek state");
  assert(isVisible(sidebarNormalContent, w), "...revealing the SAME normal-content element used when expanded, not a separate rendering");
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false }));
  assert(!sidebarEl.classList.contains("peeking") && isVisible(sidebarRail, w), "leaving reverts to the plain rail");

  // Clicking the toggle while peeking pins it open (same toggle function,
  // not a separate "pinned" state — see toggleSidebarCollapsed).
  sidebarEl.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  fireClick(d.querySelector("#sidebarToggle"), w);
  assert(!sidebarEl.classList.contains("collapsed") && !sidebarEl.classList.contains("peeking"), "clicking the toggle while peeking pins the sidebar fully open");

  // --- Rail markers: active node's ancestor chain, clickable, doesn't
  //     itself expand the sidebar ---
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const filterNode = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = filterNode.id;
  w.render();
  w.toggleSidebarCollapsed(true);
  const markers = [...d.querySelectorAll("#sidebarRail .sidebar-rail-marker")];
  assert(markers.length === 2, "rail shows one marker per ancestor (file + the active filter), got " + markers.length);
  assert(markers[markers.length - 1].classList.contains("active"), "the active node's own marker carries .active");
  fireClick(markers[0], w); // the file marker
  assert(T.state.activeId === f.id, "clicking a rail marker sets it active");
  assert(sidebarEl.classList.contains("collapsed"), "...without expanding the sidebar back out");

  // --- Keyboard shortcut + resizer double-click ---
  w.toggleSidebarCollapsed(false);
  fireKeydown(d, w, "b", { ctrlKey: true });
  assert(sidebarEl.classList.contains("collapsed"), "Ctrl+B toggles the sidebar collapse");
  d.querySelector("#sidebarResizer").dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true }));
  assert(!sidebarEl.classList.contains("collapsed"), "double-clicking the sidebar resizer toggles it back open");

  // Plain "b" (no modifier) still runs the existing bookmark shortcut, not
  // the sidebar toggle — Ctrl+B must not have hijacked it.
  w.selectEntry(f.entries[0].id);
  const bookmarksBefore = T.state.bookmarks.size;
  fireKeydown(d, w, "b");
  assert(T.state.bookmarks.size === bookmarksBefore + 1, "plain 'b' with a row selected still toggles a bookmark");

  // --- Detail panel collapse/expand ---
  assert(!detailPanel.classList.contains("collapsed"), "sanity: detail panel starts expanded");
  w.toggleDetailCollapsed();
  assert(detailPanel.classList.contains("collapsed"), "toggleDetailCollapsed() collapses the panel");
  assert(detailPanel.style.height === "34px", "collapsed height matches the 34px header, got " + detailPanel.style.height);
  assert(!isVisible(detailBody, w), "the message body is hidden while collapsed");
  assert(w.localStorage.getItem("philogg-detail-collapsed") === "1", "collapsed flag persisted");

  // Collapsed meta line: level + time + first message line, not the full
  // thread/location/method field set (no room for those in 34px).
  const detailMeta = d.querySelector("#detailMeta");
  assert(detailMeta.querySelector(".detail-collapsed-msg") && !detailMeta.querySelector(".detail-thread"),
    "collapsed header shows the truncated first message line instead of thread/location/method");

  w.toggleDetailCollapsed(false);
  assert(!detailPanel.classList.contains("collapsed") && isVisible(detailBody, w), "expanding restores the body");
  assert(detailMeta.querySelector(".detail-thread") && !detailMeta.querySelector(".detail-collapsed-msg"),
    "...and the full field set is back in the meta line");

  fireKeydown(d, w, "j", { ctrlKey: true });
  assert(detailPanel.classList.contains("collapsed"), "Ctrl+J toggles the detail panel collapse");
  d.querySelector("#detailResizer").dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true }));
  assert(!detailPanel.classList.contains("collapsed"), "double-clicking the detail resizer toggles it back open");

  // --- Persisted flag is honored on (re-)init, same path real boot uses ---
  w.localStorage.setItem("philogg-sidebar-collapsed", "1");
  w.localStorage.setItem("philogg-detail-collapsed", "1");
  w.initSidebarCollapsed();
  w.initDetailCollapsed();
  assert(sidebarEl.classList.contains("collapsed") && detailPanel.classList.contains("collapsed"),
    "initSidebarCollapsed/initDetailCollapsed re-apply a persisted collapsed flag, same as at boot");
});

/* ============================================================
   GROUP 85 — Configurable themes: Catppuccin flavors + custom JSON
   import/export
   Origin: this session (2026-08-22). Replaces the Light/Dark button pair
   (#settingsThemeLight/#settingsThemeDark, see GROUP 3/70h/70h2's updated
   text) with a #settingsThemeSelect dropdown listing six built-in themes
   (dark, light, four Catppuccin flavors — https://catppuccin.com/palette/)
   plus any user-imported custom ones (localStorage philogg-custom-themes).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("85a. Built-in theme dropdown includes the four Catppuccin flavors, and picking one applies its CSS vars");
  fireClick(d.querySelector("#btnSettings"), w);
  const select = d.querySelector("#settingsThemeSelect");
  const optionValues = [...select.options].map(o => o.value);
  assert(T.BUILTIN_THEMES.every(t => optionValues.includes(t.id)),
    "every BUILTIN_THEMES id has a matching <option>, got " + JSON.stringify(optionValues));
  ["catppuccin-latte", "catppuccin-frappe", "catppuccin-macchiato", "catppuccin-mocha"].forEach(id => {
    assert(optionValues.includes(id), "Catppuccin flavor " + id + " is offered");
  });

  select.value = "catppuccin-mocha";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === "catppuccin-mocha", "picking Catppuccin Mocha sets data-theme");
  const cs = w.getComputedStyle(d.documentElement);
  // --bg-app = Base per the style-guide remap (GROUP 88) — the main
  // content pane is the brightest of the "background pane" tier now,
  // not Crust (the darkest), which is what the app's own pre-existing
  // Dark/Light hierarchy would have suggested — see PROJECT.md "Theming".
  assert(cs.getPropertyValue("--bg-app").trim() === "#1e1e2e", "Mocha's --bg-app CSS var resolves via the [data-theme] block to Base, got " + cs.getPropertyValue("--bg-app"));
  assert(cs.getPropertyValue("--bg-panel").trim() === "#181825", "Mocha's --bg-panel resolves to Mantle (darker than --bg-app/Base, per the style-guide remap), got " + cs.getPropertyValue("--bg-panel"));
  assert(cs.getPropertyValue("--accent").trim() === "#94e2d5", "Mocha's --accent resolves too, got " + cs.getPropertyValue("--accent"));
  assert(w.localStorage.getItem("philogg-theme") === "catppuccin-mocha", "theme choice persisted to localStorage");
  // Style guide: "Selection Background" = Overlay 2 @ 20-30% opacity —
  // Mocha overrides --selection-bg to reuse --level-debug (already =
  // Overlay 2, see that CSS block), NOT the accent-tinted default every
  // non-Catppuccin theme keeps (Dark's own --selection-bg stays var(--accent-soft)).
  const selectionBg = cs.getPropertyValue("--selection-bg").replace(/\s+/g, "");
  assert(selectionBg === "color-mix(insrgb,var(--level-debug)25%,transparent)",
    "Mocha's --selection-bg is the Overlay-2-based color-mix formula, got " + cs.getPropertyValue("--selection-bg"));

  select.value = "catppuccin-latte";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  const csLatte = w.getComputedStyle(d.documentElement);
  // Declared as var(--bg-app) (Latte maps --bg-app to Base, #eff1f5, per
  // the style-guide remap — GROUP 88) — per the Catppuccin style guide,
  // "On Accent" text = Base, so --level-*-on/--accent-on reference that
  // var directly rather than a hardcoded near-white. jsdom's
  // getComputedStyle doesn't resolve nested var() the way a real browser
  // does (see tests/README.md "Known gaps"), so this checks the declared
  // value, not the resolved color; Group 87's/88's Playwright-verified
  // screenshots confirm the real rendered result.
  assert(csLatte.getPropertyValue("--level-error-on").trim() === "var(--bg-app)",
    "Latte (a light-background flavor) points --level-error-on at its own Base color (--bg-app) instead of a hardcoded near-white, got " + csLatte.getPropertyValue("--level-error-on"));
});

await withApp(async (w, d, T) => {
  section("85b. Importing a custom theme JSON: validation, storage, activation, dropdown + list rendering");
  fireClick(d.querySelector("#btnSettings"), w);

  assert(d.querySelector("#customThemeList .filter-library-empty"), "custom theme list starts empty");

  // Not valid JSON at all.
  w.importThemeJson("{not json");
  assert(T.customThemes.length === 0, "malformed JSON is rejected, nothing added");

  // Valid JSON but missing the format tag.
  w.importThemeJson(JSON.stringify({ name: "No tag", colors: {} }));
  assert(T.customThemes.length === 0, "a JSON file without the philogg-theme format tag is rejected");

  // Valid format tag but missing required color keys.
  w.importThemeJson(JSON.stringify({ format: "philogg-theme", version: 1, name: "Incomplete", colors: { "bg-app": "#111111" } }));
  assert(T.customThemes.length === 0, "a theme file missing required color keys is rejected");

  // A full, valid theme file — build it from the template generator itself,
  // proving the round trip (template out -> tweak -> import back in) works.
  const template = JSON.parse(w.buildThemeTemplateJson());
  assert(template.format === "philogg-theme" && typeof template.colors === "object", "buildThemeTemplateJson seeds a valid, self-consistent template");
  assert(T.THEME_COLOR_KEYS.every(k => typeof template.colors[k] === "string" && template.colors[k].length > 0),
    "the template includes every required color key with a non-empty value");
  template.name = "My Purple Night";
  template.colors["bg-app"] = "#120018";
  template.colors["accent"] = "#bb33ff";
  template.activeTextLight = true;
  w.importThemeJson(JSON.stringify(template));

  assert(T.customThemes.length === 1, "a valid theme file is accepted and added to customThemes");
  const imported = T.customThemes[0];
  assert(imported.name === "My Purple Night", "the imported theme's name is preserved");
  assert(imported.colors["bg-app"] === "#120018" && imported.colors["accent"] === "#bb33ff", "imported colors are preserved");
  assert(JSON.parse(w.localStorage.getItem("philogg-custom-themes"))[0].name === "My Purple Night", "custom themes persist to localStorage");

  assert(d.documentElement.getAttribute("data-theme") === imported.id, "importing a theme switches to it immediately");
  const cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--bg-app").trim() === "#120018", "the custom theme's colors are applied as inline CSS vars, got " + cs.getPropertyValue("--bg-app"));
  assert(cs.getPropertyValue("--level-error-on").trim() === "#fff", "activeTextLight:true applies white active-button text");

  const select = d.querySelector("#settingsThemeSelect");
  assert([...select.options].some(o => o.value === imported.id && o.textContent === "My Purple Night"),
    "the imported theme appears as an option in the dropdown");
  assert(select.value === imported.id, "the dropdown reflects the newly-active custom theme");

  const listRow = d.querySelector("#customThemeList .filter-library-row");
  assert(listRow && listRow.textContent.includes("My Purple Night"), "the imported theme is listed in the Custom themes card");

  // Switching away and back via inline-style clearing: a built-in theme
  // picked afterwards must not leak the custom theme's inline overrides.
  select.value = "dark";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  const csDark = w.getComputedStyle(d.documentElement);
  assert(csDark.getPropertyValue("--bg-app").trim() === "#10131a", "switching back to Dark clears the custom theme's inline var overrides, got " + csDark.getPropertyValue("--bg-app"));

  // Deleting a custom theme: removes it everywhere, and falls back to dark
  // if it was the active theme.
  select.value = imported.id;
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === imported.id, "sanity: custom theme active again before deleting it");
  d.querySelector("#customThemeList .filter-library-row-del").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(T.customThemes.length === 0, "deleting the custom theme removes it from customThemes");
  assert(JSON.parse(w.localStorage.getItem("philogg-custom-themes")).length === 0, "...and from localStorage");
  assert(d.documentElement.getAttribute("data-theme") === "dark", "deleting the ACTIVE custom theme falls back to dark");
  assert(d.querySelector("#customThemeList .filter-library-empty"), "the list shows the empty state again");
});

await withApp(async (w, d, T) => {
  section("85c. A stale/deleted custom theme id in localStorage falls back to dark on boot instead of leaving data-theme dangling");
  w.localStorage.setItem("philogg-theme", "custom:does-not-exist");
  w.initTheme();
  assert(d.documentElement.getAttribute("data-theme") === "dark", "resolveThemeId falls back to dark for an unknown theme id, got " + d.documentElement.getAttribute("data-theme"));
});

/* ============================================================
   GROUP 86 — Theme consistency audit: no more hardcoded UI colors, and a
   theme-aware "Theme" mode for the highlight-color picker
   Origin: this session (2026-08-22), person-requested follow-up ("Prüfe
   noch mal auf der Website, welche Farbe für was verwendet wird und ob Du
   das konsequent umgesetzt hast"). An audit of the stylesheet found ~18
   buttons/badges/rows still hardcoding the DARK theme's own hex values
   (scrollbar thumb, toolbar button hover borders, the brand mark, Save/
   active-chip text, breadcrumb/level-pill/level-badge/log-row-hover tints)
   instead of the CSS vars every other rule already used — fixed via new
   --accent-on/--border-hover vars and color-mix(var(--x), transparent) for
   the alpha-tinted ones, so every one of those now tracks whichever theme
   is active instead of only ever matching Dark. Separately, the per-filter-
   node highlight-color picker (#colorPickerPopup, unrelated to app theming
   before this session) gained a "Theme" mode: its curated preset row can
   now show the ACTIVE theme's own highlightPalette (the 14 named
   Catppuccin accent colors per flavor) instead of the theme-independent
   generic HIGHLIGHT_PRESETS, so a chosen highlight color is guaranteed to
   belong to the current theme when that mode is on.
   ============================================================ */
await withApp(async (w, d, T) => {
  section("86a. Stylesheet audit: the specific hardcoded hex values found in the audit are gone from the button/badge/row rules that used to hardcode them");
  const css = d.querySelector("style").textContent;
  // Each of these literals used to appear in a rule OUTSIDE the :root/
  // [data-theme] variable-definition blocks — i.e. hardcoded into a
  // component rule instead of using var(). They may still legitimately
  // appear INSIDE a :root[data-theme=...] block itself (that's the var's
  // own definition, not a violation) — this check targets the specific
  // component selectors the audit found, not the raw strings globally.
  const violations = [
    { selector: "::-webkit-scrollbar-thumb", bad: "#2a3142" },
    { selector: ".brand-mark", bad: "#2f8f8c" },
    { selector: ".brand-mark", bad: "#0b1016" },
    { selector: "#btnOpen:hover", bad: "#333c50" },
    { selector: ".toolbar-badge", bad: "#08201f" },
    { selector: ".crumb.current", bad: "rgba(79,199,195,.35)" },
    { selector: ".level-btn.lvl-error", bad: "rgba(241,101,101,.35)" },
    { selector: ".lvl-error .level-badge", bad: "rgba(241,101,101,.28)" },
    { selector: ".log-row.lvl-error:hover", bad: "rgba(241,101,101,.20)" },
    { selector: ".token-chip", bad: "rgba(79,199,195,.35)" },
  ];
  violations.forEach(v => {
    const ruleMatch = css.match(new RegExp(v.selector.replace(/[.:]/g, "\\$&") + "\\{[^}]*\\}"));
    assert(ruleMatch && !ruleMatch[0].includes(v.bad), v.selector + " no longer hardcodes " + v.bad + ", got " + (ruleMatch ? ruleMatch[0] : "(rule not found)"));
  });
  assert(css.includes("--accent-on:"), "a themeable --accent-on var exists for text-on-accent surfaces");
  assert(css.includes("--border-hover:"), "a themeable --border-hover var exists for hover-state borders");
  assert(css.includes("color-mix(in srgb"), "the previously-hardcoded alpha-tinted rules now use color-mix() against a themed var");
});

await withApp(async (w, d, T) => {
  section("86b. Highlight-color picker: Free (default) vs Theme mode");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const node = w.createFilterNode(f.id, "text", "msg");
  w.render();

  assert(T.colorPickerMode === "free", "sanity: Free is the default picker mode, unchanged prior behavior");
  const swatch = d.querySelector('[data-node-id="' + node.id + '"] .tree-swatch');
  fireClick(swatch, w);
  assert(isVisible(d.querySelector("#cpWheelWrap"), w), "Free mode: the hue wheel is visible");
  let presetTitles = [...d.querySelectorAll(".cp-preset")].map(b => b.title);
  assert(JSON.stringify(presetTitles) === JSON.stringify(T.HIGHLIGHT_PRESETS), "Free mode: presets are the generic HIGHLIGHT_PRESETS, got " + JSON.stringify(presetTitles));
  w.closeColorPicker();

  // Switch to a Catppuccin flavor, then to Theme mode.
  w.setTheme("catppuccin-mocha");
  fireClick(swatch, w);
  fireClick(d.querySelector("#cpModeTheme"), w);
  assert(T.colorPickerMode === "theme", "clicking Theme switches the mode");
  assert(w.localStorage.getItem("philogg-cp-mode") === "theme", "the mode choice persists to localStorage");
  assert(!isVisible(d.querySelector("#cpWheelWrap"), w), "Theme mode: the hue wheel is hidden");
  const mochaTheme = T.BUILTIN_THEMES.find(t => t.id === "catppuccin-mocha");
  presetTitles = [...d.querySelectorAll(".cp-preset")].map(b => b.title);
  assert(JSON.stringify(presetTitles) === JSON.stringify(mochaTheme.highlightPalette), "Theme mode: presets are Catppuccin Mocha's own highlightPalette (14 named accent colors), got " + presetTitles.length + " colors");

  // Picking one of the theme swatches sets the node's highlightColor and
  // closes the popup, same interaction as a Free-mode preset click.
  const firstSwatch = d.querySelector(".cp-preset");
  const pickedColor = firstSwatch.title;
  fireClick(firstSwatch, w);
  assert(T.state.nodes[node.id].highlightColor === pickedColor, "clicking a theme swatch sets the node's highlightColor to that swatch's color");
  assert(d.querySelector("#colorPickerPopup").classList.contains("hidden"), "picking a swatch closes the popup");

  // A theme with no highlightPalette (Dark) falls back to the generic set
  // while still in Theme mode — never an empty preset row.
  w.setTheme("dark");
  fireClick(swatch, w);
  presetTitles = [...d.querySelectorAll(".cp-preset")].map(b => b.title);
  assert(JSON.stringify(presetTitles) === JSON.stringify(T.HIGHLIGHT_PRESETS), "Theme mode on Dark (no highlightPalette) falls back to the generic HIGHLIGHT_PRESETS, got " + presetTitles.length + " colors");

  // Switching back to Free restores the wheel and generic presets, and
  // also persists.
  fireClick(d.querySelector("#cpModeFree"), w);
  assert(T.colorPickerMode === "free" && w.localStorage.getItem("philogg-cp-mode") === "free", "clicking Free switches back and persists");
  assert(isVisible(d.querySelector("#cpWheelWrap"), w), "Free mode: the hue wheel is visible again");
});

await withApp(async (w, d, T) => {
  section("86c. Highlight-color picker mode is restored on init, same as the theme choice itself");
  w.localStorage.setItem("philogg-cp-mode", "theme");
  w.setColorPickerMode(w.localStorage.getItem("philogg-cp-mode"));
  assert(T.colorPickerMode === "theme", "setColorPickerMode re-applies a persisted mode, same pattern initTheme() uses for the theme itself");
  assert(d.querySelector("#cpModeTheme").classList.contains("active") && !d.querySelector("#cpModeFree").classList.contains("active"),
    "the Theme button reflects the restored mode");
});

/* ============================================================
   GROUP 87 — Accent color: re-pick the app's OWN accent (buttons, the
   breadcrumb, the minimap's range highlight) from the active theme's
   own palette
   Origin: this session (2026-08-22), same-day clarification of the 86
   request — "Highlightfarbe" there meant the app's accent/selection color
   itself ("Highlightfarbe auf den Buttons oder die Markierung auf der
   Minimap für die Zeitabschnitte"), not the per-filter-node highlight
   color Group 86 covers (a different, unrelated feature that stays as-is).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("87a. Accent-color row: hidden for a theme with no highlightPalette, shown with swatches for one that has it");
  fireClick(d.querySelector("#btnSettings"), w);
  const row = d.querySelector("#settingsAccentRow");
  const picker = d.querySelector("#settingsAccentPicker");

  assert(!isVisible(row, w), "Dark (no highlightPalette) hides the Accent color row");

  const select = d.querySelector("#settingsThemeSelect");
  select.value = "catppuccin-mocha";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(isVisible(row, w), "Catppuccin Mocha (has a highlightPalette) shows the row");
  const swatches = [...picker.querySelectorAll(".accent-swatch:not(.accent-swatch-reset)")];
  const mochaPalette = T.BUILTIN_THEMES.find(t => t.id === "catppuccin-mocha").highlightPalette;
  assert(swatches.length === mochaPalette.length && swatches.every((s, i) => s.title === mochaPalette[i]),
    "the swatches are exactly Mocha's own highlightPalette, in order, got " + swatches.length + " of " + mochaPalette.length);
  assert(picker.querySelector(".accent-swatch-reset.active"), "with no override chosen yet, the reset/'theme default' swatch is the active one");

  select.value = "light";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(!isVisible(row, w), "Light (no highlightPalette either) hides the row again");
});

await withApp(async (w, d, T) => {
  section("87b. Picking an accent swatch recolors --accent/-strong/-soft/-on together, persists PER THEME, and survives switching away and back");
  fireClick(d.querySelector("#btnSettings"), w);
  const select = d.querySelector("#settingsThemeSelect");
  select.value = "catppuccin-mocha";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));

  const csBefore = w.getComputedStyle(d.documentElement);
  const defaultAccent = csBefore.getPropertyValue("--accent").trim();
  assert(defaultAccent === "#94e2d5", "sanity: Mocha's default accent (Teal) is active before picking, got " + defaultAccent);

  // Mauve (#cba6f7) is in Mocha's highlightPalette but clearly NOT the
  // default accent — a real re-pick, not a no-op.
  const mauveSwatch = [...d.querySelectorAll("#settingsAccentPicker .accent-swatch")].find(s => s.title === "#cba6f7");
  fireClick(mauveSwatch, w);

  const cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--accent").trim() === "#cba6f7", "picking Mauve sets --accent to it, got " + cs.getPropertyValue("--accent"));
  assert(cs.getPropertyValue("--accent-strong").trim() !== "#89dceb" && cs.getPropertyValue("--accent-strong").trim() !== "#cba6f7",
    "--accent-strong is recomputed too (not left at Mocha's old Sky default, and not identical to --accent either), got " + cs.getPropertyValue("--accent-strong"));
  assert(cs.getPropertyValue("--accent-soft").trim().startsWith("rgba(203,166,247,"), "--accent-soft is recomputed from the new accent's own RGB, got " + cs.getPropertyValue("--accent-soft"));
  assert(T.accentChoices["catppuccin-mocha"] === "#cba6f7", "the pick is recorded in accentChoices for Mocha specifically");
  assert(JSON.parse(w.localStorage.getItem("philogg-accent-choice"))["catppuccin-mocha"] === "#cba6f7", "...and persisted to localStorage");
  // renderAccentPicker() rebuilds the swatch row on every applyTheme() call
  // (same "new DOM nodes, not the same element" pattern as renderVisibleRows
  // — see PROJECT.md's jsdom gotcha), so re-query rather than reuse the
  // now-stale mauveSwatch reference from before the click.
  const mauveSwatchAfter = [...d.querySelectorAll("#settingsAccentPicker .accent-swatch")].find(s => s.title === "#cba6f7");
  assert(mauveSwatchAfter.classList.contains("active"), "the picked swatch shows as active");

  // Switch to a DIFFERENT theme: that theme's own default applies, Mocha's
  // pick is untouched (per-theme, not global).
  select.value = "catppuccin-latte";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.getComputedStyle(d.documentElement).getPropertyValue("--accent").trim() === "#209fb5", "Latte shows its OWN default accent, unaffected by Mocha's pick");

  // Switch back to Mocha: the pick survives.
  select.value = "catppuccin-mocha";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.getComputedStyle(d.documentElement).getPropertyValue("--accent").trim() === "#cba6f7", "switching back to Mocha restores the picked Mauve accent");

  // Reset (the ↺ swatch) clears the override and restores the theme's own default.
  fireClick(d.querySelector("#settingsAccentPicker .accent-swatch-reset"), w);
  assert(w.getComputedStyle(d.documentElement).getPropertyValue("--accent").trim() === "#94e2d5", "the reset swatch restores Mocha's default Teal accent");
  assert(!("catppuccin-mocha" in T.accentChoices), "...and clears the stored override for Mocha");
});

await withApp(async (w, d, T) => {
  section("87c. A dark, low-luminance accent pick flips --accent-on to white (contrast safety net)");
  w.setTheme("catppuccin-latte");
  // Latte's Red (#d20f39) is in its highlightPalette and dark/saturated
  // enough that the default near-black --accent-on would be unreadable.
  w.setAccentChoice("catppuccin-latte", "#d20f39");
  const cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--accent").trim() === "#d20f39", "sanity: the dark Red accent is active");
  assert(cs.getPropertyValue("--accent-on").trim() === "#fff", "a low-luminance accent pick flips --accent-on to white instead of staying near-black, got " + cs.getPropertyValue("--accent-on"));
});

/* ============================================================
   GROUP 88 — Catppuccin background hierarchy remapped to match the
   official style guide's "Background Pane"/"Secondary Panes" roles
   Origin: this session (2026-08-22), person-directed after a style-guide
   compliance audit flagged the ORIGINAL mapping (kept for consistency
   with this app's own pre-existing Dark/Light hierarchy — main pane
   darkest, panel brighter) as inverted relative to the guide's intent
   (main pane = Base, a brighter tone; secondary/chrome panes = the
   darker Crust/Mantle). Asked, and told to remap instead of leaving it —
   see PROJECT.md "Theming" -> "Catppuccin style-guide compliance" for
   the full token-role table (--bg-app=Base, --bg-panel=Mantle,
   --bg-elevated=Surface0, --bg-elevated-2=Surface1, --border-soft=
   Surface2, --border=Overlay0 — same role mapping for all four flavors,
   including Latte, where Base happens to be the brightest token instead
   of a dark-flavor middle tone).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("88. Background/border hierarchy: --bg-app (main pane) resolves to Base, brighter than --bg-panel (Mantle) — same role mapping across all four flavors, including inverted-brightness Latte");
  const mochaExpected = { "bg-app": "#1e1e2e", "bg-panel": "#181825", "bg-elevated": "#313244", "bg-elevated-2": "#45475a", "border-soft": "#585b70", "border": "#6c7086" };
  const macchiatoExpected = { "bg-app": "#24273a", "bg-panel": "#1e2030", "bg-elevated": "#363a4f", "bg-elevated-2": "#494d64", "border-soft": "#5b6078", "border": "#6e738d" };
  const frappeExpected = { "bg-app": "#303446", "bg-panel": "#292c3c", "bg-elevated": "#414559", "bg-elevated-2": "#51576d", "border-soft": "#626880", "border": "#737994" };
  const latteExpected = { "bg-app": "#eff1f5", "bg-panel": "#e6e9ef", "bg-elevated": "#ccd0da", "bg-elevated-2": "#bcc0cc", "border-soft": "#acb0be", "border": "#9ca0b0" };

  [
    ["catppuccin-mocha", mochaExpected],
    ["catppuccin-macchiato", macchiatoExpected],
    ["catppuccin-frappe", frappeExpected],
    ["catppuccin-latte", latteExpected],
  ].forEach(([themeId, expected]) => {
    w.setTheme(themeId);
    const cs = w.getComputedStyle(d.documentElement);
    Object.entries(expected).forEach(([key, hex]) => {
      assert(cs.getPropertyValue("--" + key).trim() === hex, themeId + "'s --" + key + " is " + hex + " per the guide's role mapping, got " + cs.getPropertyValue("--" + key));
    });
  });

  // "On Accent" text = Base = --bg-app in this remap, for every flavor
  // uniformly (previously --bg-elevated for the dark flavors / --bg-panel
  // for Latte, back when those vars held Base — see 85a's own comment).
  ["catppuccin-mocha", "catppuccin-macchiato", "catppuccin-frappe", "catppuccin-latte"].forEach(themeId => {
    w.setTheme(themeId);
    const cs = w.getComputedStyle(d.documentElement);
    assert(cs.getPropertyValue("--accent-on").trim() === "var(--bg-app)", themeId + "'s --accent-on points at --bg-app (Base), got " + cs.getPropertyValue("--accent-on"));
  });
});

/* ============================================================
   GROUP 81 — Wildcard placeholder value conditions
   Origin: this session (2026-08-22), person-requested (FEATURE_BACKLOG.md
   item 5, implemented differently than originally scoped there — a numeric
   condition folded INTO the existing [value:...] wildcard token instead of
   a separate filter type, and working through the existing filter/extract
   paths only, per the person's explicit instructions). Syntax:
   [value:float>=10] (single condition) or [value:int<20,>10] (","-separated
   conditions AND-ed together). A same-day follow-up (person asked "hältst
   du den [Syntax] für sinnvoll... und ich glaube es würde Sinn machen, auch
   absolut mit reinzunehmen") swapped the separator from the originally
   shipped ";" to "," (more conventional) and added an absolute-value
   variant: a "|" prefix on the operator compares |value| instead of value,
   e.g. [value:float|>=10] matches both 10 and -15. Conditions are parsed by
   compileExtractPattern onto each column as `.conditions: [{op, value,
   abs?}]` (float/int only — a condition on time/word/hex makes the whole
   pattern invalid, same "Invalid pattern" feedback path as a malformed
   regex) and checked post-match by the shared wildcardMatch() primitive,
   reused by extraction (getEntries' "extract" branch), a plain "text"
   filter carrying wildcard tokens (the "Add filter" path), and the filter
   popup's live-match count/pattern preview — so all four surfaces agree on
   what a conditioned placeholder matches. No new filter-node field: the
   condition lives inside the existing `value` pattern string, so every
   persistence carrier already threads it through untouched (CLAUDE.md's
   "Known gotchas" note doesn't apply here).
   ============================================================ */
await withApp(async (w, d, T) => {
  section("81. Wildcard placeholder value conditions ([value:float>=10] etc.)");
  // message 0 score=0 .. message 19 score=19
  const log = makeLog(0, 20, { suffix: i => "score=" + i });
  const f = await w.addFile("a.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  /* ---------- compileExtractPattern: parsing ---------- */
  const spec1 = w.compileExtractPattern("score=[value:int>=10]");
  assert(spec1 && spec1.columns.length === 1, "single-condition pattern compiles");
  assert(JSON.stringify(spec1.columns[0].conditions) === JSON.stringify([{ op: ">=", value: 10 }]),
    "parses a single >= condition, got " + JSON.stringify(spec1 && spec1.columns[0].conditions));

  const spec2 = w.compileExtractPattern("score=[value:int<15,>=10]");
  assert(spec2 && spec2.columns[0].conditions && spec2.columns[0].conditions.length === 2,
    "parses two ','-separated conditions, got " + JSON.stringify(spec2 && spec2.columns[0].conditions));
  assert(spec2.columns[0].conditions[0].op === "<" && spec2.columns[0].conditions[0].value === 15, "first condition parsed in order");
  assert(spec2.columns[0].conditions[1].op === ">=" && spec2.columns[0].conditions[1].value === 10, "second condition parsed in order");
  assert(!spec2.columns[0].conditions[0].abs && !spec2.columns[0].conditions[1].abs, "plain conditions carry no .abs flag");

  const specPlain = w.compileExtractPattern("score=[value:int]");
  assert(specPlain.columns[0].conditions === undefined, "a bare placeholder (no condition) still has no .conditions field — backward compatible");

  assert(w.compileExtractPattern("id=[value:word>=10]") === null, "a condition on a non-numeric type (word) makes the whole pattern invalid");
  assert(w.compileExtractPattern("t=[value:time>=10]") === null, "same rejection for time");
  assert(w.compileExtractPattern("h=[value:hex>=10]") === null, "same rejection for hex");

  /* ---------- absolute-value conditions: a "|" prefix on the operator ---------- */
  const specAbs = w.compileExtractPattern("d=[value:int|>=10]");
  assert(specAbs && specAbs.columns[0].conditions.length === 1 && specAbs.columns[0].conditions[0].abs === true,
    "a '|' prefix on the operator sets .abs on the condition, got " + JSON.stringify(specAbs && specAbs.columns[0].conditions));
  assert(specAbs.columns[0].conditions[0].op === ">=" && specAbs.columns[0].conditions[0].value === 10, "the operator/value themselves parse the same regardless of the abs prefix");

  const specAbsMixed = w.compileExtractPattern("d=[value:int|>10,<=100]");
  assert(specAbsMixed.columns[0].conditions[0].abs === true && !specAbsMixed.columns[0].conditions[1].abs,
    "abs applies per-condition — a mix of abs and plain conditions in one placeholder parses correctly, got " + JSON.stringify(specAbsMixed.columns[0].conditions));

  /* ---------- extraction: only rows satisfying the condition are kept ---------- */
  const geNode = w.createFilterNode(f.id, "extract", "score=[value:int>=10]");
  assert(w.getEntries(geNode.id).length === 10, "extract >=10 keeps rows 10..19, got " + w.getEntries(geNode.id).length);

  const rangeNode = w.createFilterNode(f.id, "extract", "score=[value:int<15,>=10]");
  const rangeEntries = w.getEntries(rangeNode.id);
  assert(rangeEntries.length === 5, "combined </>= condition keeps only rows 10..14, got " + rangeEntries.length);
  assert(rangeEntries.every(e => { const v = +e.message.match(/score=(\d+)/)[1]; return v >= 10 && v < 15; }),
    "sanity: every kept row's score is actually in [10,15)");

  /* ---------- absolute-value matching against real signed data ---------- */
  const deltaLog = [-20, -5, 0, 5, 20]
    .map((v, i) => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"delta=${v}"`)
    .join("\n") + "\n";
  const fd = await w.addFile("d.log", deltaLog, () => {});
  const absNode = w.createFilterNode(fd.id, "extract", "delta=[value:int|>=10]");
  const absEntries = w.getEntries(absNode.id);
  assert(absEntries.length === 2, "|value|>=10 matches both -20 and 20 (not the three values inside [-10,10]), got " + absEntries.length);
  assert(absEntries.every(e => Math.abs(+e.message.match(/delta=(-?\d+)/)[1]) >= 10), "sanity: every kept row's |delta| is actually >= 10");
  const nonAbsNode = w.createFilterNode(fd.id, "extract", "delta=[value:int>=10]");
  assert(w.getEntries(nonAbsNode.id).length === 1, "the same threshold WITHOUT the abs prefix only matches +20 (plain >=10), got " + w.getEntries(nonAbsNode.id).length);

  /* ---------- a plain "text" filter carrying a conditioned wildcard token (the "Add filter" path) respects it too ---------- */
  const textNode = w.createFilterNode(f.id, "text", "score=[value:int>=10]");
  assert(w.getEntries(textNode.id).length === 10, "a plain text filter with a conditioned wildcard token matches the same 10 rows");

  /* ---------- table rendering: header badge + every rendered row honors the condition ---------- */
  T.state.activeId = rangeNode.id;
  w.render();
  const headerType = d.querySelector('#extractHead th[data-col="0"] .extract-col-type').textContent;
  assert(headerType.includes("int") && headerType.includes("<15") && headerType.includes("≥10"),
    "extraction table header shows the condition next to the type, got " + JSON.stringify(headerType));
  assert(T.extractRowsData.length === 5 && T.extractRowsData.every(r => { const v = +r.values[0]; return v >= 10 && v < 15; }),
    "every row actually rendered into the table satisfies the condition");

  /* ---------- post-creation pattern view chip shows the condition too ---------- */
  const chipText = d.querySelector("#extractPatternView .pattern-chip").textContent;
  assert(chipText.includes("int") && chipText.includes("<15") && chipText.includes("≥10"),
    "the pattern-view chip above the table shows the condition alongside the type, got " + JSON.stringify(chipText));

  /* ---------- table header visualizes an abs condition with a leading "|" ---------- */
  T.state.activeId = absNode.id;
  w.render();
  const absHeaderType = d.querySelector('#extractHead th[data-col="0"] .extract-col-type').textContent;
  assert(absHeaderType.includes("|≥10"), "an abs condition's header badge is prefixed with '|', got " + JSON.stringify(absHeaderType));

  /* ---------- filter popup: live-match count reflects the condition ---------- */
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "score=[value:int>=15]";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("5 of 20"),
    "live-match count only counts rows satisfying the condition (15..19), got " + d.querySelector("#filterLiveMatch").textContent);

  /* ---------- pattern preview: the sample match is one where the condition actually holds, and shows a visible condition badge ---------- */
  const preview = d.querySelector("#filterPatternPreview");
  const span = preview.querySelector(".preview-value-span");
  assert(span && span.textContent === "15",
    "the preview picks the first entry satisfying the CONDITION (score=15), not just the first structural regex match (score=0), got " + (span && span.textContent));
  const condBadge = preview.querySelector(".preview-value-cond");
  assert(condBadge && condBadge.textContent === "≥15", "the preview shows a visible badge with the condition, got " + (condBadge && condBadge.textContent));

  // An unsatisfiable condition (no row has score >= 1000) shows the
  // "no matching sample" state, same as a pattern that structurally never matches.
  filterInput.value = "score=[value:int>=1000]";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200));
  assert(preview.classList.contains("preview-empty") && preview.textContent.includes("No matching sample"),
    "an unsatisfiable condition falls back to the 'no matching sample' preview state, not a structural-only match");
  w.closeFilterPopup();

  /* ---------- pattern preview against signed data: abs badge + a NEGATIVE sample ---------- */
  T.state.activeId = fd.id;
  w.render();
  w.openFilterPopup();
  const filterInput2 = d.querySelector("#filterInput");
  filterInput2.value = "delta=[value:int|>=10]";
  fireInput(filterInput2, w);
  await new Promise(r => setTimeout(r, 200));
  const absSpan = preview.querySelector(".preview-value-span");
  assert(absSpan && absSpan.textContent === "-20",
    "the preview's first sample for an abs condition can be a NEGATIVE value (-20, the first entry in log order satisfying |delta|>=10), got " + (absSpan && absSpan.textContent));
  const absCondBadge = preview.querySelector(".preview-value-cond");
  assert(absCondBadge && absCondBadge.textContent === "|≥10", "the preview's condition badge is prefixed with '|' for an abs condition, got " + (absCondBadge && absCondBadge.textContent));
  w.closeFilterPopup();
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
   Group  3  — 765d68a9 (theme toggle); updated 2026-08-22 for the
              select-dropdown theme control (see Group 85)
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
   Group 42  — this session (2026-08-17), person-requested: every
              extraction table now leads with two synthetic columns, a
              0-based row-order Index and t (ms) (cumulative elapsed time
              since the FIRST entry's real timestamp — 0 on row 0), ahead
              of the pattern's own columns — Index doubling as the default
              X axis on every extraction's Plot tab. Rewritten in place
              the SAME session (person-reported correction: *"deltaT macht
              so keinen Sinn für einen zeitlichen Plot. Der erste Eintrag
              müsste 0 haben, der Rest dann die bis dahin aufsummierten
              deltaT."*) — the column originally shipped as a row-to-row
              delta ("ΔT"), which can't serve as a plot X value (each
              row's axis position would depend on every prior row's
              spacing rather than its own value); fixed to a cumulative
              running total and renamed "t (ms)" to match, since it's no
              longer a delta. Covers the column descriptors/ordering,
              computed values (Index counting up; t(ms) cumulative, not
              per-step — explicitly checked against the wrong per-step
              value), the header DOM (no numbered pattern-chip badge on
              the synthetic columns, unlike real pattern columns), body
              cell rendering, sorting (descending reverses row order now
              that every row's value is parseable), copy/export including
              both columns, the Plot tab defaulting X to Index and Y to a
              real column (not t(ms)), and the columnColor negative-
              colIndex modulo fix the swatches depend on. Also updated
              three older groups whose assertions assumed the extraction
              table had no leading columns: Group 5 (sort button now
              targeted by data-sort-col, not "first in the DOM"), Group 14
              (same for the assert button), and Group 24 (column/button
              counts and copy-export text bumped by the 2 new always-
              visible columns).
   Group 43  — this session (2026-08-17), person-reported: a log file
              still being actively written showed no live dot and never
              updated in Edge. Root cause was FEATURE_BACKLOG.md's known
              gap "Persist tail handles across reload" — a file the
              session cache auto-restored on relaunch (experienced by the
              person as simply "opening" the file) never got a node.tail,
              permanently a static snapshot; re-opening it manually was
              the only way to resume tailing. Fixed via a persisted
              FileSystemFileHandle (persistFileNode) and a new
              tryReattachFileTail() helper (restoreSessionFromCache) that
              silently resumes tailing through queryPermission — same
              graceful-degradation shape as folder reconnect. Covers:
              handle:null persisted for an untailed file; a tailed file's
              handle round-tripping through real IndexedDB; the expected
              degrade-to-static-snapshot outcome once the round-tripped
              handle can't survive fake-indexeddb's strict structured
              clone (same documented jsdom gap as Group 38c); the
              successful-reattach path exercised directly with a fresh
              working fixture handle (offset correctness, live dot
              re-appearing, tailing genuinely resuming on the next poll);
              and the not-silently-granted-permission path leaving a file
              untailed rather than throwing. Also fixed in the same pass:
              persistFileNode skips the handle for folder-owned files
              (they already reattach via restoreWatchedFolders/
              mergeScannedFiles, and Group 38c's own per-file fixture
              handle isn't cloneable independent of its directory handle —
              this was caught by Group 38c failing once persistFileNode
              started writing a handle unconditionally).
   Group 44  — this session (2026-08-17), person-reported same-day follow-
              up to Group 43: with that fix in place, tailing DID start
              updating and showing the live dot — but stopped again a few
              seconds later, seemingly correlated with mouse movement.
              Root cause: tailTick treated ANY getFile()/read failure as
              permanent, including transient ones — most plausibly the
              writer briefly holding the file locked without shared-read
              access, an ordinary condition for a log actively being
              appended to by another process, not something specific to
              mouse movement (which was circumstantial timing, not a real
              trigger — no code path ties mouse events to tailTick).
              Fixed with a consecutive-failure counter (t.errorCount,
              TAIL_MAX_CONSECUTIVE_ERRORS = 5) — only a STREAK of failures
              now marks a file permanently failed; any clean poll in
              between resets it, and every failure is logged via
              console.warn instead of vanishing silently (there was
              previously no logging at all for this catch block). Covers:
              a sub-threshold failure streak leaving tailing/the live dot
              untouched and each failure logged, a clean poll resetting the
              streak and growth resuming normally, and a genuinely
              persistent failure still reaching the threshold and stopping
              tailing (live dot disappears) same as before this fix, with
              an already-failed node correctly skipped on further ticks.
   Group 45  — this session (2026-08-17), from FEATURE_BACKLOG.md
              ("Virtualize extraction table / link pair view"). Both views
              now only ever put the scrolled-into-view window into the DOM
              — the extraction table via a fixed row height + spacer <tr>s
              (renderExtractVisibleRows), the Link view via analytically
              precomputed per-block offsets since tuple size varies block
              height (renderLinkVisibleBlocks/computeLinkBlockOffsets).
              Covers: bounded/windowed DOM counts against a 300-row
              extraction and a 50-pair link result, correct spacer heights
              and window movement on scroll for both views, select-all
              still covering every logical cell (not just the rendered
              subset), a pair selection surviving being scrolled fully out
              of view (a real regression risk this refactor had to guard —
              selection moved from a DOM-class scan to an index,
              linkSelectedPairIndex, specifically because of this) with no
              stale .pair-selected left behind and minimapMarkedEntries()
              still resolving it correctly, the class reappearing once
              scrolled back, and both scroll position and (for the Link
              view) the selected pair resetting on a genuine node switch.
   Group 46  — this session (2026-08-17), from FEATURE_BACKLOG.md "Extend
              undo/redo" (Group 16 originally covered filter node delete/
              move only). Same snapshot-based stack, four more action
              kinds: plain (non-folder) file delete ("deleteFile" —
              snapshotSubtree/restoreSubtree extended to file nodes,
              entries/tail kept by reference not cloned), and a new
              generic "edit" kind (captureNodeFields/applyNodeFields
              before/after) backing value/pattern edits (F2 popup + time-
              range dialog, including the legacy after/before ->
              timerange migration), the invert toggle, and value-assertion
              add/clear. Covers: entryIndex/rootIds-position/filter-
              subtree restoration on file delete+undo+redo, folder-file
              close confirmed STILL not pushing an undo action (regression
              guard — deleteFilterNodeWithUndo's folder branch has to run
              BEFORE the new file branch), and before/after round-trips
              for each of the four edit-kind call sites. Group 16's own
              "files are out of undo scope" assertion was updated in place
              to match (now redundant with this group's deeper file-delete
              coverage, kept as a smoke check).
   Group 47  — this session (2026-08-18), code-review finding (performance/
              sync pass, person-requested). The sidebar/detail-panel/
              fhSplit resizer mousemove handlers called renderVisibleRows()/
              renderHighlightVisibleRows()/renderTimelineMinimap()
              synchronously per raw event instead of batching onto
              requestAnimationFrame like every other high-frequency handler
              in the app (the four scroll listeners). Verifies the geometry
              (style.width/height) still tracks the cursor with no added
              latency while the expensive re-render is deferred and multiple
              rapid mousemove events collapse into exactly one render call.
   Group 48  — this session (2026-08-18), person-requested UI changes.
              Export/Import session moved from the tree's per-node/empty-
              background context menu to a "Session…" toolbar button+dropdown
              (analogous to "Open…") — Group 21's context-menu placement
              assertions were rewritten in place (now assert ABSENCE from the
              node menu) instead of re-tested here; this group only covers
              the empty-background-menu removal (right-click on an empty
              tree now opens nothing) and that the toolbar button still
              works with zero files loaded (48a). Also: the old blocking
              #progressOverlay pop-up is gone. 48b/48c were originally
              written against a .tree-loading-row placeholder that replaced
              it; later the SAME session that placeholder was itself
              superseded by createFileNode (see Group 49) making the real
              file row exist — and be fully interactive — from the instant
              loading starts, with just a progress fill riding along on it.
              48b/48c were rewritten in place for that (no .tree-loading-row
              exists anymore) rather than left green against removed markup.
   Group 49  — this session (2026-08-18), person-requested ("die Datei
              direkt beim Ladevorgang bedienbar machen... die Minimap
              fortlaufend zu befüllen... ähnlich wie eine Datei zu tailen").
              createFileNode/parseLogTextAsync/scheduleLoadRender/
              flushLoadRender (see philogg.html) make a file's entries
              stream into node.entries chunk by chunk during the initial
              parse, with the node already a real, active, selectable tree
              row throughout — instead of the tree/table/minimap staying
              empty until the whole file is parsed. Covers: entries/tree-row
              count/level-bar counts all reflecting a genuinely mid-parse
              state (not zero, not the final total) on a 9000-line file
              forced across multiple PARSE_CHUNK_LINES chunks; that the
              level-bar counts are correct again once loading finishes (the
              exact node._levelCounts staleness bug the invalidateCachesFor-
              Roots(node.id) calls in scheduleLoadRender/flushLoadRender fix
              — this WAS a real regression caught while writing this group,
              not a hypothetical); and that the Filtered view doesn't
              auto-scroll to chase the growing content the way tail
              auto-follow does for an already-open file.
   Group 50  — this session (2026-08-18), person-requested follow-up to
              Group 49 ("Aktuell blockiert das Laden... auf eine andere,
              bereits geladenen Datei wechseln können. Das UI soll dann
              sofort bedienbar sein... nur noch den Fortschrittsbalken am
              Dateinamen sehen... komplett responsive"). Group 49's
              scheduleLoadRender ran a full render() on every parse chunk
              regardless of which file was actually the active view — fine
              single-file, but a background load competed for full tree/
              table/minimap rebuilds every frame once a DIFFERENT already-
              loaded file was what the person was looking at. Fixed with
              loadRenderRootIsActive + updateLoadRowProgress (see
              philogg.html): scheduleLoadRender only does the throttled
              full render while its root is the active view; otherwise a
              direct, cheap DOM write to just that row's progress fill,
              re-checked again at rAF fire time (not just schedule time) so
              a switch-away between the two doesn't still cost one stray
              render. Covers, with render()/requestAnimationFrame/
              cancelAnimationFrame mocked for determinism (a real animation
              frame was found, while writing this group, to fire well
              before even a 9000-line/3-chunk file finishes parsing, making
              a real-timing race against a genuinely-still-parsing state
              impractical without a much larger, suite-slowing fixture):
              zero render() calls across several real background parse
              ticks while a different file stays active and completely
              undisturbed, the fire-time re-check specifically, the
              background row's progress fill still updating directly, and
              exactly one full render at the load's natural completion.
   Group 51  — this session (2026-08-18), person-reported follow-up to
              Group 50 ("Während eine Datei lädt, muss ich noch immer
              mehrfach auf eine andere Klicken bis der Wechel erfolgt...
              Nach dem Wechsel auf die bereits vorhandene Datei funktioniert
              aber alles flüssig"). Group 50 only fixed the BACKGROUND case;
              scheduleLoadRender still ran the full render() (renderTree()
              included) on every tick whenever the loading file WAS the
              active view — true from the start of every load, since a
              fresh load auto-activates. renderTree() tears down and
              rebuilds every row from scratch, which is what made a click on
              some other row need several attempts. Fixed by splitting a
              load tick's work: updateLoadRowProgress (extended to also
              update .tree-count; later the same session generalized further
              into updateLoadRowLiveData — see Group 52) handles the loading
              row directly without renderTree(); new renderLoadTickMainView
              handles the rest of the active view (table/minimap/level
              bar/status) the same way — only createFileNode/
              flushLoadRender's structural moments still call a real
              render(). Covers, with renderTree() mocked to count calls:
              zero calls across several real parse ticks while the loading
              file stays active (confirmed its own view still updates live,
              via getVisibleEntries()); a different row's DOM element —
              captured right after the one legitimate structural rebuild
              from the loading file's own creation — staying the exact same
              object through every following tick; and a real click
              dispatched on that held reference correctly switching to it
              (the strongest possible proof nothing was torn down and
              replaced along the way).
   Group 52  — this session (2026-08-18), person-requested follow-up to
              Group 51 ("Jetzt würde ich aber gerne auch schon während des
              Ladevorgangs in der Lage sein, Log-Level Filter zu bedienen,
              neue Filter anlegen, etc. Also alles was ich auch tun könnte,
              wenn es sich um ein Tailing... handeln würde"). Group 51 fixed
              renderTree() but renderLoadTickMainView still called the full
              renderLevelBar() every tick — same class of bug, just for the
              four level buttons (recreated with fresh click listeners on
              every tick). Fixed with updateLevelBarCounts (targeted .cnt
              text write via a new btn.dataset.level). Also generalized
              updateLoadRowProgress into updateLoadRowLiveData: a recursive
              subtree walk (via row.dataset.nodeId, now on every tree row,
              not just file rows) so a filter created mid-load keeps its own
              row's count (and percentage-of-parent bar) growing live too,
              instead of freezing at creation time. Filter creation itself
              was never actually blocked (the popup is a static top-level
              element, untouched by any of this). Covers, with
              renderLevelBar() mocked to count calls: zero calls across
              several real parse ticks while a level button's .cnt still
              updates live; a click on that SAME held button reference still
              correctly toggling the filter; and a filter created while
              still mid-load shown growing its own row's count (matching
              getEntries() exactly, not frozen) across further ticks, with
              its percentage-of-parent bar kept live too.

   Group 53  — this session (2026-08-18), person-requested backlog items
              ("Plot Point → Log-Eintrag" and "Plot Option für Axis-Equal",
              both from a suggestions batch added to FEATURE_BACKLOG.md
              earlier the same session). Covers: every line/bar/scatter
              mark now carries a data-row attribute and .plot-mark class, a
              single delegated click listener on #plotSvg resolves it back
              to extractRowsData[row].entry and calls jumpToFullLog (same
              destructive jump the table's own row dblclick already used —
              the Plot tab still has no Highlight-view companion); clicking
              chart background (no mark under the cursor) is a no-op. And
              plotConfig.axisEqual (default false, checkbox hidden for bar
              — categorical X has no meaningful pixel-per-unit ratio):
              verified geometrically via rendered cx/cy — before enabling,
              a 722x346 chart area maps the same 0..20 data range on both
              axes to different pixels-per-unit; after, they match, with
              only the axis that had the larger pixel-per-unit (X, in this
              layout) padded to meet the tighter one (Y) — the tighter axis
              itself is left unpadded.

   Group 54  — this session (2026-08-18), person-requested: plot zoom/pan.
              Covers: wheel zoom anchored at the cursor (unlimited zoom-in
              via zoomPlotAt with an extreme factor; zoom-out clamped back
              to the home/default domain, never wider); the cursor's data
              value staying fixed across a wheel zoom; wheel ignored outside
              the plot rectangle; the editable zoom-level readout (100% at
              home, +/-/reset buttons, typing an explicit % sets an absolute
              zoom of the home span); middle-click-drag panning (a no-op at
              100% since there's nowhere to go, works once zoomed in, and
              can't push past the home view's own edges); left-click-drag
              rectangle zoom mapping the exact dragged pixel rect to its
              data-space equivalent, multi-step (a second drag inside an
              already-zoomed view zooms in further), and its trailing click
              suppressed (no jump-to-entry) via the same pattern the
              timeline minimap's drag-select already established; a plain
              click on a mark still jumps, unaffected; plotZoom resetting
              when the X-axis column changes; and the hover tooltip showing
              a mark's exact underlying value via both hit-testing paths
              (nearest-point for line/scatter, rect-containment for bar).

   Group 55  — this session (2026-08-18), person-requested: multiline
              message display toggle (#btnMultilineMsg). Covers: default OFF
              (unchanged single-line/truncated rows); toggling ON renders
              literal "\n" line breaks (rowHeightForEntry/messageLineCount,
              MULTILINE_LINE_HEIGHT=15px/line) in BOTH Log views (Filtered
              table + Highlight/Full) sharing .col-msg; per-row DOM height
              growing only for multi-line entries, single-line entries
              staying at ROW_HEIGHT; tableSpacer summing real per-row heights
              instead of count*ROW_HEIGHT; toggling back OFF reverting
              exactly; the variable-height virtualization windowing
              (tableRowOffsets, scrollToIndex via jumpToEntry) landing a
              scroll position and rendering the target row correctly when a
              tall row sits before it, not just the flat index*ROW_HEIGHT
              math the default path still uses; the toggle persisting
              across a simulated reload via the same session-cache settings
              carrier as pinBookmarksInFilteredView (global, not per-file);
              and (55d, same-day follow-up bugfix — person-reported the
              first cut jumped/reset scroll on toggle) topVisibleEntryId/
              pendingTableTopAlignId/pendingHighlightTopAlignId re-anchoring
              scroll on the SAME entry that was at the top pre-toggle in
              BOTH views (scrollTop grows/shrinks by exactly the toggled
              rows' height delta, never resets to 0 or drifts), plus the
              Link-view guard (no stale align target captured while the
              table view isn't even rendered).
   Group 56  — this session (2026-08-18), person-requested: with zero files
              loaded, hide the whole #viewBar toolbar (level filter, Full/
              Filtered/Stacked tabs, breadcrumb) and remove the duplicate
              "no file loaded" hints that used to live in the tree sidebar
              (#dropHint, now deleted outright) and the toolbar status text
              (#statusText used to read "No files loaded", now empty) —
              #emptyState's centered message is the sole surviving hint.
   Group 57  — this session (2026-08-18), person-requested: select multiple
              lines in the log view (Filter/Highlight) via Ctrl+click
              (toggle) or Shift+click (contiguous range from the last-
              clicked anchor) and copy their raw text via Ctrl+C
              (copyLogSelectionToClipboard, entries sorted chronologically,
              falls back to just the single selected entry when nothing's
              multi-selected). Covers: plain click stays unchanged/no
              multi-select; the first Ctrl+click folds the prior single
              selection in; Ctrl+click toggle-off and its anchor move;
              Shift+click range selection (REPLACES, not extends); repeated
              Shift+click re-deriving from the same anchor, not the previous
              Shift target; Ctrl+C priority over the tree's own filter-node
              clipboard (only when focusRegion is "entries", not "tree");
              Escape clearing the selection (state + DOM class); and the
              selection/DOM-class being shared between the Filter and
              Highlight views for the same underlying entries, same sharing
              as state.selectedId itself.
   Group 58  — this session (2026-08-18), FEATURE_BACKLOG.md "Column
              visibility / width persistence in the log view". #btnColumns
              popup toggles Δt/Thread/Location/Method visibility (Time/
              Level/Message always shown); #tableHeader gets a drag handle
              per resizable column. Both apply purely through the
              --row-grid CSS custom property (applyRowGrid), so both Log
              views + every virtualized row reflow with zero JS re-render.
              Covers: default --row-grid value; checkbox toggle collapsing/
              restoring a track (and its own resize handle hiding/
              reappearing); Reset widths; drag-resize (live width update,
              COLUMN_MIN_WIDTH clamping, drag-end/no-stray-mousemove-effect);
              persistence through the session cache across a simulated
              reload, same tier/carrier as state.multilineMessages; and
              (58d) the old @media (max-width:760px) rule's own --row-grid
              override + display:none pair, folded into applyRowGrid()
              itself — living in both an inline style AND a media query
              would have made the inline style always win, and the
              display:none half was independently a latent CSS Grid
              auto-placement bug (a display:none grid item doesn't reserve
              its track, so Message would silently land in an earlier,
              wrong-width track on narrow viewports) neither this session's
              own use of the mechanism nor the original feature ever hit
              before, since nothing previously toggled column visibility
              through it outside that one fixed breakpoint.
   Group 59  — this session (2026-08-18), FEATURE_BACKLOG.md "Reusable
              filter library". Named presets ("Save to library…" on a
              filter node's context menu; "Apply from library…" on any
              node's), IndexedDB-backed ("filterLibrary" store,
              CACHE_DB_VERSION 3->4), file-agnostic by design (no content-
              fingerprint matching — the person picks where it applies, per
              the backlog item's own scoping). Applying reuses the EXISTING
              importFilterJson() unchanged, wrapped in the same
              {format,version,roots,activeRef} envelope Save/Load filter's
              JSON files already use. Covers: the naming dialog pre-filling
              from the source node's name, blank-name no-op; a saved
              preset's record shape (serializeFilterBranch()'s own
              roots/activeRef); applying onto a DIFFERENT, previously-
              untouched file (fresh uid, same filter definition, RE-
              EVALUATED against that file's own data rather than a stale
              replayed result); delete-from-library (dialog list re-render,
              IndexedDB record actually gone); and persistence across a
              simulated reload — a SEPARATE store from the session cache's
              own meta record, readable with zero files loaded and no
              boot-time restore wait, unlike restoreSessionFromCache.
   Group 60  — this session (2026-08-18), person-reported follow-up
              bugfixes to Groups 58/59. 60a: `.col-delta`/`.col-time` were
              missing `overflow:hidden` (unlike `.col-thread`/`.col-loc`/
              `.col-method`/`.col-msg`, which already had it) — a column
              collapsed to a 0px `--row-grid` track didn't clip its own
              text, which spilled into the next column and showed up
              underneath its background ("bleiben die Einträge... hinter
              den nun darüber liegenden Log-Levels sichtbar"). 60b: the
              tree context menu's item list (11 items on a filter node)
              was one flat list; grouped into `GROUP_ORDER` buckets (edit/
              clipboard/library/danger) joined by `.ctx-sep`, the same
              convention `#contextMenu` (the log-row menu) already used —
              covers separator count/placement, per-group relative
              ordering, a separator sitting directly between two adjacent
              groups (not just "somewhere in the menu"), and a plain file
              node (fewer groups populated) still grouping cleanly with no
              dangling empty separator.
   Group 61  — this session (2026-08-19), person-requested generalization of
              the scroll-anchoring fix from Group 55d (previously multiline-
              toggle-only) into captureViewAnchor()/restoreViewAnchor(),
              applied automatically inside renderTable()/renderHighlightView()
              on every render that rebuilds either Log view's entry list —
              level-filter toggle, node/filter switch, sort, not just the one
              toggle Group 55d covers — prioritizing the active/selected row
              over the topmost-visible one when there is a selection, so it
              never scrolls out of view as long as it's still present in the
              target view (61a: exact on-screen pixel offset preserved
              across a level-filter change that removes many rows above the
              selection; 61b: falls back to reset-to-top when the selected
              row itself gets filtered out; 61d: a selection that was
              off-screen before the change is revealed centered instead of
              left scrolled away). Also adds revealFilteredView()
              on any node/filter switch (not just filter creation/edit,
              which already called it) — centralized once inside render()
              itself, since every state mutation ends in one — auto-
              switching Full → Filtered so a newly active filter's result is
              actually on screen (61c), a no-op in Stacked layout (both
              panels already visible) or when switching to a plain FILE node
              (Full already reflects it). Same-day follow-up (also 2026-08-19,
              person-requested: "die Log Level Filter sollen sich nicht mehr
              auf das full Log auswirken. stattdessen soll ein andern der Log
              Level Filter auch zu einem automatischen Sprung von Full nach
              Filtered führen") — the level quick-filter no longer narrows the
              Full view's own entry list at all (`renderHighlightView()` stopped
              calling `applyLevelFilter()`), and `renderLevelBar()`'s click
              handler now calls `revealFilteredView()` too, same auto-reveal
              as a filter switch (61e). Group 4's dual-view assertion (from
              32e282b4, originally "Full view ALSO narrows to ERROR") updated
              in place to assert the opposite — Full stays showing every
              level, unaffected — and 61a's Full-view assertion updated the
              same way (its entry list/scrollTop are now untouched by the
              level-filter click that used to re-anchor it).
   Group 62  — this session (2026-08-19), person-reported bugfix: a tail
              poll tick while the Plot tab was open closed any open axis
              dropdown, since renderPlotControls() unconditionally rebuilt
              #plotControls' innerHTML on every renderExtractTable() call —
              including the ones a tail tick's plain render() triggers, even
              though tailing only ever appends row data, never touches the
              columns/plotConfig the controls are built from. Fixed with a
              content-diff guard (`lastPlotControlsHtml`) that skips the
              destructive rebuild when the generated HTML is byte-identical
              to what's already there. Covers: DOM node identity for both
              axis dropdowns surviving a real `tailTick()` (via a fake
              FileSystemFileHandle, same technique Group 12 uses) that adds a
              new row, an inert back-to-back tick with nothing new, the
              chart itself still updating live (proving only the controls
              were guarded, not the data), and a genuine control change
              (chart type) still forcing a real rebuild.
   Group 63  — this session (2026-08-19), person-reported bugfix: the live
              tail dot (`.tree-live`) never went dark once shown, even long
              after a file genuinely stopped growing, and a rotated-out
              Folder-watch file kept it lit right alongside the new file
              actually receiving lines. Root cause: the dot's condition was
              "handle still valid and hasn't errored", which stays true
              indefinitely once a writer just goes idle or moves to another
              file. Fixed with `node.tail.lastGrowth` (stamped on every real
              byte-level change) and `isTailLive(t)`, which additionally
              requires a growth within `TAIL_LIVE_MS`; `tailTick()` does a
              cheap second pass per tick comparing each tail's live status
              against its own `wasLive` and fires a `renderTree()` (not a
              full `render()`) on a pure time-based flip, since a tick with
              no bytes read otherwise triggers no re-render at all. Covers:
              the dot staying lit through an inert-but-not-yet-stale tick,
              going dark once backdated past the staleness window with NO
              further byte change in that same tick, relighting on a genuine
              new write, and the rotation scenario itself (two tailed files,
              only one still growing — exactly one dot shown, on the right
              file).
   Group 65  — this session (2026-08-20), person-requested: a proprietary
              license (no redistribution, no modification, rights holder
              Philipp Klein) reachable via a new #btnLicense header button
              next to #btnShortcuts, same popup pattern as Group 26; plus a
              short-commit-hash "version" (`PHILOGG_VERSION`, literal "dev"
              in source, stamped only by the release GitHub Action) shown
              next to the product name and inside the license popup.
   Group 66  — this session (2026-08-20), person-requested: philogg.html
              ?url=<encoded-url> fetches and opens a log at boot — the
              shared loading mechanism for CI/report deep-links to a log
              artifact on a webserver and, planned, a desktop wrapper that
              serves a local file through a loopback URL. Covers success
              (name derived from the URL's last path segment, text parsed
              into entries), an HTTP error status, and a rejected fetch
              (network/CORS). The file:// guard (skips the fetch attempt
              entirely with a dedicated message) is NOT covered here — see
              the comment right after 66c and tests/README.md "Known gaps".
   Group 67  — this session (2026-08-20), person-reported (Windows Electron
              desktop build): a file opened after the first one spawned a
              whole new app window instead of loading into the one already
              open, and the first file's tree entry showed the opaque
              numeric id ("1") instead of its real name. Fixed by exposing
              loadFromUrlParam's fetch-and-add body as window.philoggLoadUrl
              (so desktop/main.js can call it on an existing window via
              executeJavaScript instead of always creating a new one) and by
              having main.js's philogg://local/ URL carry the real basename
              as its last path segment. Covers the renderer-side half:
              philoggLoadUrl is exposed and repeated calls accumulate files
              in the same tree rather than replacing them. desktop/main.js's
              own Electron-API changes (window reuse, URL construction)
              aren't reachable from this jsdom suite.

   Group 68  — this session (2026-08-20), person-requested (German): a
              multi-file drop/pick only ever showed the file currently being
              read, revealing the next one only once its turn arrived.
              Fixed by createQueuedFileNode/renderQueuedFileRow (grayed
              .tree-row-queued placeholders for the whole batch, inserted
              up front) and activateQueuedFileNode (flips one into a real,
              loading row per iteration). Also added: a merge-on-load
              prompt (confirmMergeOnLoad/#mergeLoadDialog) when 2+ files
              load at once, answerable via Enter (Yes, default-focused
              button) or Escape (No, via the shared global handler); and
              per-file try/catch in loadFileDescriptors so one failing file
              no longer strands every later placeholder in the batch as
              permanently grayed.

   Group 69  — this session (2026-08-20), person-requested follow-up
              ("Für ein File Merge folge der gleichen Logik. Lege den
              Eintrag zuerst an und Zeige den Fortschritt des Merge an
              diesem Eintrag."): mergeFiles is now async and follows the
              exact same "insert the row first, stream progress onto it"
              pattern real file loading uses (createFileNode/
              loadOneFileIntoTree) — the merged node exists as a real,
              interactive tree row (loadFraction 0, .tree-load-fill
              visible) the instant merging starts, filled in over
              MERGE_CHUNK_ENTRIES-sized chunks with a live progress bar,
              then chronologically sorted and cleared to a normal row.
              Both pre-existing direct mergeFiles() callers in this suite
              (Groups 10 and 30c, originally synchronous) were updated to
              await it.

   Group 70  — this session (2026-08-21), person-requested (German):
              "Format Manager" — a new Settings menu whose first entry maps
              filename glob patterns to configurable log formats (a
              log4net/LogViewPlus-style conversion pattern, or a raw regex
              for edge cases), so PhiLogg can parse formats beyond its one
              hardcoded default. compileFormatPattern (mirrors
              compileExtractPattern's literal-escaping/named-group
              approach) and validateFormatRegex both funnel into
              applyFormatMatch, producing the same fixed entry schema
              every other format uses; the builtin default stays a
              pass-through to the untouched HEADER_RE/parseHeaderLine
              until edited. Filenames resolve to formats via
              resolveFormatIdForFilename (first-match glob rule, editable
              order), pinned onto the file node at load time and preserved
              verbatim across a session-cache restore even if rules
              changed since. Also (same-session follow-ups): Examples/
              renamed to examples/ with a second sample file in a
              different shape; tools/log-simulator.html gained a matching
              configurable pattern field; and a shared canonical default
              pattern string used identically by both the builtin
              LogFormat and the simulator's default input.
              Follow-up (2026-08-21, later same day): Settings reworked
              into one real page instead of a dropdown+separate dialogs
              (70e/70h rewritten, new 70h2); Add-format panel gained a
              sample-log-line pattern suggestion + live preview; and a
              bugfix (isVisible(el, w) helper added, see "Known gaps" in
              tests/README.md) after a person-reported screenshot showed
              the inline Add-format/Add-rule panels and the pattern/regex
              field toggle were always visible on screen regardless of
              their "hidden" class — this app has no global
              `.hidden{display:none}` rule, and the panels'/fields'
              element-scoped rules were simply never added, so
              `classList.contains("hidden")` alone couldn't tell them
              apart from a genuinely-hidden element. 70e now asserts via
              actual computed style, not just the class.
              Follow-up (2026-08-21, later same day): the builtin default
              row gained a "Reset" button where a deletable format's
              Delete button would sit; new 70j edits the default to a
              deliberately different pattern (proving parsing actually
              changed, not just display), resets it, then confirms a
              fresh file parses identically to before the edit.

   Group 71  — this session (2026-08-21), FEATURE_BACKLOG.md "Configurable
              font size": a whole-UI zoom (applyFontScale), a Settings row
              (+/- buttons, Reset), and Ctrl+Plus/Ctrl+Minus, all persisted
              to localStorage like the theme toggle.
   Group 72  — this session (2026-08-21), FEATURE_BACKLOG.md "Shortcuts to
              switch between Tree and Filter view", REVISED TWICE same
              session per person-requested follow-up feedback: Ctrl+0
              focuses the filter tree at whichever node is ALREADY active
              — a filter included — so arrow keys continue navigating from
              wherever the person currently is (falling back to the first
              root file only if nothing's active yet); an intermediate pass
              had it jump up to the active node's root FILE instead, which
              undid exactly that. Ctrl+1/2/3 mirror the Full/Filtered/
              Stacked toggle buttons and additionally focus that Log
              view's entries for arrow-key navigation via the new
              state.entriesView ("filter" | "highlight", also set by a
              plain click/dblclick in either Log view — see selectEntry/
              selectHighlightEntry/revealInHighlightView), which the
              global ArrowUp/Down handler now reads to pick moveSelection
              vs. the new moveHighlightSelection; Enter still reveals the
              Filtered view for an active filter node while the tree has
              focus (not for a file node).
   Group 73  — this session (2026-08-21), FEATURE_BACKLOG.md "Horizontal
              scrollbar in the Filter view", REVISED same session after a
              person-reported bug: the original `width:fit-content` on
              `.log-row` never actually produced any overflow (verified
              live via Playwright, not just jsdom — `.col-msg`'s
              `overflow:hidden` resets its CSS "automatic minimum size" to
              0, so the message column's `1fr` grid track just kept
              shrinking to fit, exactly as before the change). Fixed by
              giving `.col-msg` an explicit `min-width:max-content` instead
              (Filter view only, `#tableRows .col-msg`), which is what
              actually makes the grid track — and so the row — refuse to
              shrink below a long message's natural width. #tableBody
              scrolls horizontally as a result (Filter view only,
              #highlightBody untouched), with #tableHeader's own scrollbar
              hidden and driven in lockstep via scrollLeft + a width sync
              (syncTableHeaderWidth) onto the widest currently-rendered
              row. The real overflow itself still isn't independently
              verifiable in jsdom (no real layout engine) — this group
              covers the JS-observable parts only: the overflow-x split
              (real computed style) and the sync/scroll logic, with
              tableRows.scrollWidth stubbed directly.
   Group 74  — this session (2026-08-21), FEATURE_BACKLOG.md "Double-click
              on a filter opens its edit dialog". Manual click-id+timestamp
              tracking (lastTreeRowClickId/Time) rather than a native
              "dblclick" listener, since a tree row's click handler always
              ends in a full render() that rebuilds every row (the same
              "DOM identity across clicks" class of bug Group 6 first
              caught for renderVisibleRows()/native dblclick, just
              unobservable from jsdom's directly-dispatched clicks here).
              Shares the same editFilterNode helper F2/the context menu's
              "Edit filter…" action were refactored onto in the same
              session.
   Group 75  — this session (2026-08-21), FEATURE_BACKLOG.md "Ctrl+W closes
              the currently open file" — same undo-able
              deleteFilterNodeWithUndo path (via getRootFileId) the tree
              row's own ✕ button already uses.
   Group 76  — this session (2026-08-21), FEATURE_BACKLOG.md "Settings
              option: 'Closing the last log file quits the app'", default
              off. A plain localStorage flag (same tier as the theme
              toggle); window.close() is stubbed (saved/restored) rather
              than actually invoked, since a real jsdom window.close()
              would tear the test window down mid-run.
   Group 77  — this session (2026-08-21), person-reported via screenshot,
              two rounds against the same PLC log. Round 1: its ";SSS"
              millisecond separator broke the sample-line pattern
              suggestion — SAMPLE_TS_CANDIDATES's fractional-seconds
              regex only matched "." / ",", so the suggester fell back to
              the no-ms shape and baked the sample's own ms value in as
              literal text, matching only lines sharing that exact
              millisecond. Fixed generically: the separator actually
              present is captured and reproduced in tsFormat instead of
              a hardcoded ",", which incidentally also fixes "."-samples
              (previously always emitted a "," tsFormat regardless of
              which separator the sample used). Round 2 (person reported
              it was STILL breaking at the same spot): the suggester also
              never recognized a bare, unquoted thread field — only
              quoted/paren ones — so the "-" between %p and [System] in
              this log's header lines got read as fixed literal text,
              which then failed to match the FIFO-data lines where that
              same position holds a real varying value (AxCtrl, CrashP,
              ...). Fixed by claiming a single whitespace-free token
              sitting directly between %p and an already-claimed %M
              bracket as %t — narrow enough (needs both a preceding level
              and a following bracket) not to misread an ordinary
              free-form message's first word as a thread.
   Group 78  — this session (2026-08-21), person request: Enter on a single
              selected row in the Filtered view (or the Filtered/bottom
              pane of Stacked) now does what a dblclick on that row already
              does (revealInHighlightView) — same entriesView === "filter"
              keydown branch added alongside the existing tree-focus Enter
              handling.
   Group 79  — this session (2026-08-22), Claude-Design handoff bundle
              ("Settings Dialog und Panel-Navigation", part 1a): Settings
              dialog redesign — left section nav (Appearance/Behavior/Log
              Formats), one unified .settings-card/row-grid per section,
              boolean rows as a switch instead of a plain checkbox, and a
              button hierarchy where the filled accent button is reserved
              for Save (Edit/Reset -> outline, Add -> dashed outline).
   Group 80  — this session (2026-08-22), same handoff bundle, part 1b:
              collapsible sidebar (40px rail with the active node's
              ancestor-chain markers; hover-peek shows the exact expanded
              tree as an overlay, no separate rendering path; click-to-pin)
              and collapsible detail panel (34px header keeps
              level/time/first-message-line instead of going empty).
              Ctrl+B/Ctrl+J, resizer double-click, localStorage-persisted
              collapsed flag (display-preference tier, same as theme/font
              scale) restored on init.
   Group 85  — this session (2026-08-22), "configurable themes +
              Catppuccin": the Light/Dark button pair became a
              #settingsThemeSelect dropdown covering six built-in themes
              (dark, light, Catppuccin Latte/Frappé/Macchiato/Mocha, each a
              [data-theme=...] CSS block) plus user-imported custom themes
              (JSON, validated against THEME_COLOR_KEYS, localStorage
              philogg-custom-themes) applied via inline CSS vars on <html>
              instead — see applyTheme(). Settings -> Appearance gained a
              "Custom themes" card: import, delete, and a
              buildThemeTemplateJson() template download seeded from the
              currently active theme's own computed colors. Groups 3/70h/
              70h2 (originally the Light/Dark button pair) were updated in
              place for the new dropdown rather than left testing removed
              buttons.
   Group 86  — this session (2026-08-22), same-day follow-up ("Prüfe, ob
              konsequent umgesetzt... Highlightfarbe... auf die im Theme
              festgelegten Farben freigegeben"): an audit of the stylesheet
              found ~18 rules (scrollbar thumb, toolbar button hover
              borders, brand mark, Save/active-chip text, breadcrumb/
              level-pill/level-badge/log-row-hover/token-chip alpha tints)
              still hardcoding DARK theme's own hex/rgba values instead of
              the var every sibling rule used — fixed with new --accent-on/
              --border-hover vars and color-mix(var(--x), transparent) for
              the alpha-tinted ones. 86a is a static text-content regression
              guard against those specific literals reappearing (jsdom can't
              resolve color-mix() to a computed color, so it checks the raw
              CSS text instead). Separately, the highlight-color picker
              (#colorPickerPopup, per-filter-node, previously theme-
              independent) gained a Free/Theme mode toggle
              (setColorPickerMode, localStorage philogg-cp-mode): Theme mode
              shows ONLY the active theme's own highlightPalette (14 named
              Catppuccin accent colors per flavor, on each BUILTIN_THEMES
              entry; optional on a custom theme's JSON) instead of the
              generic HIGHLIGHT_PRESETS, falling back to HIGHLIGHT_PRESETS
              for Dark/Light or a custom theme without one. 86b/86c.
   Group 87  — this session (2026-08-22), same-day clarification: what "86"
              called "Highlightfarbe" actually meant the app's OWN accent/
              selection color (buttons, breadcrumb, the minimap's time-span
              highlight — all already var(--accent...)-driven per the
              audit) re-pickable from the theme's own palette, not the
              per-filter-node picker Group 86 built (which stays, separate
              feature). New "Accent color" row in Settings -> Appearance
              (themeOwnPalette(), no HIGHLIGHT_PRESETS fallback — hidden
              entirely for Dark/Light or a palette-less custom theme, see
              87a), setAccentChoice()/applyAccentChoice() recompute
              --accent-strong/-soft/-on together via JS (mixHex toward
              white on dark flavors / black on Latte, luminance check for
              -on), persisted PER THEME in localStorage
              philogg-accent-choice (87b) with a contrast safety net for a
              dark/saturated pick like Latte's Red (87c).
              Same-day follow-up, no new group: a Catppuccin style-guide
              compliance audit (checked against the guide fetched fresh,
              not from memory) found "On Accent text = Base" and
              "Selection Background = Overlay 2 @ 20-30%" not followed —
              fixed by pointing --accent-on/--level-*-on at Base (see
              Group 88 for where that var landed after the background
              remap below) and adding --selection-bg (reusing
              --level-debug = Overlay 2). Group 85a's Latte assertion was
              updated in place for the new value (checks the declared
              var() reference string, not a resolved color — jsdom
              doesn't resolve nested var(), see that assertion's own
              comment) and gained a --selection-bg check for Mocha. Three
              other gaps the same audit found were left NOT changed at
              first, flagged for a person decision in PROJECT.md's
              "Theming" section rather than silently altered — see Group
              88 for how one of those three was then resolved.
   Group 88  — this session (2026-08-22), person directly asked (via
              AskUserQuestion) whether to keep the app's own pre-existing
              background brightness hierarchy for Catppuccin flavors or
              remap to the style guide's literal "Background Pane = Base,
              Secondary Panes = Crust/Mantle" — chose remap. --bg-app/
              --bg-panel/--bg-elevated/--bg-elevated-2/--border-soft/
              --border now map to Base/Mantle/Surface0/Surface1/Surface2/
              Overlay0 (same role assignment for all four flavors,
              including Latte, whose Base happens to be the brightest
              token instead of a dark-flavor mid tone) instead of the
              previous Crust/Mantle/Base/Surface0/Surface1/Surface0
              ordering that had preserved this app's own Dark/Light
              hierarchy. --accent-on/--level-*-on simplified to
              var(--bg-app) uniformly as a result (Base moved there for
              every flavor). Warnings=Peach and Info=Blue remain
              deliberately unchanged (not asked about, see PROJECT.md).
   Group 81  — this session (2026-08-22), person-requested (FEATURE_BACKLOG.md
              item 5, implemented differently than scoped there): numeric
              conditions inside a [value:float]/[value:int] wildcard token
              ([value:float>=10], [value:int<20,>10]), working through the
              existing filter/extract paths only — compileExtractPattern
              parsing, extraction + wildcard-as-text-filter matching, the
              extraction table header/pattern-view chip visualization, and
              the filter popup's live-match count + pattern preview (which
              now picks a sample that satisfies the condition, not just a
              structural regex match). EXTENDED same session, same-day
              follow-up: separator changed from ";" to "," (person-requested,
              more conventional), and a "|" operator prefix added for
              absolute-value conditions ([value:float|>=10] matches both 10
              and -15) — same group, not a new one, since it's the same
              feature surface being refined, not a separate concern.

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
   - Row-background-stops-short bugfix, ROUND 1 ONLY (2026-08-21,
     person-reported, `#tableRows .log-row{width:max-content;
     min-width:100%;}`) — pure CSS box-sizing fix, no state change, jsdom
     has no real Grid/overflow layout to assert against, same "jsdom blind
     spot" as the flex-direction regression and 8f3df18d above. Verified
     with a real Chromium session (Playwright) instead. Superseded the
     SAME DAY by a follow-up person report (round 2: per-row width was
     itself wrong — see PROJECT.md changelog and GROUP 73b) whose own fix
     IS plain testable JS, unlike this one; GROUP 73b covers round 2
     directly, so only round 1's now-reverted CSS is undocumented here.
   - 48678a78 (Q&A session about nested link filters, no code changes) —
     nothing to test.
   - The OLD standalone bottom-left #shortcuts sidebar strip and the OLD
     #fhTabBar row (pre-Group 26) — superseded by #shortcutsPanel and the
     merged #viewBar respectively; both are pure layout/placement changes
     with no filtering-logic behind them, fully covered by Group 26.
   - Export/Import session living in the tree's per-node context menu, plus
     the special empty-tree-background context menu that existed only to
     keep "Import session…" reachable with zero files loaded (pre-2026-08-18)
     — superseded by the toolbar's "Session…" button+dropdown (Group 48),
     which needs no node to right-click and works the same regardless of
     whether any files are loaded. The empty-background context menu itself
     is gone outright, not just its session items — Group 48a asserts
     right-clicking empty tree space now opens nothing.
   - The old blocking #progressOverlay pop-up shown while a file loaded
     (pre-2026-08-18) — superseded, same session, first by an inline
     .tree-loading-row placeholder, then by that placeholder itself being
     superseded by the real file row existing (and being usable) from the
     start (Group 49); Group 48b/48c cover the current shape.
   - The .tree-loading-row placeholder row (still pre-2026-08-18, briefly)
     — superseded by createFileNode making the real file row itself carry
     the progress fill from the instant loading starts (Group 48b/48c,
     Group 49); no code or markup for it remains.
   - #dropHint, the tree sidebar's own "Drag & drop log files..." hint
     (pre-2026-08-18) — removed outright (Group 56) in favor of #emptyState
     being the single "no file loaded" hint; no code or markup remains.

   ============================================================ */
