// PhiLogg — consolidated jsdom regression suite.
//
// ONE regression suite that's kept and extended going forward, instead of
// being rewritten from scratch each session. This file is the harness: page
// loading, withApp/waitFor/assert, group selection, and the helpers several
// groups share. The groups themselves are one file each in groups/ (see
// tests/README.md → "Group files"); each banner says what it covers and where
// it came from, changelog.d/ has the feature history.
//
// Run: npm install && npm test   (or: node philogg.regression.test.js)
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
const vm = require("vm");
const LOGSIM = require(path.join(__dirname, "..", "tools", "log-sim", "core.js"));
// In-memory IndexedDB for the session-cache group (Group 20): jsdom ships no
// IndexedDB at all, so the cache feature silently disables itself in every
// other group (openCacheDb resolves null) — exactly the graceful-degradation
// path the feature has for private-mode browsers. Group 20 injects a shared
// IDBFactory instance into two successive windows to simulate a reload.
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
// fake-indexeddb clones every stored value with Node's own structuredClone,
// which can't see inside a jsdom Blob/File (its bytes live behind jsdom's
// impl symbol) and would store an empty object. A browser's IndexedDB stores
// Blobs natively — the session cache keeps a loaded File as one (see
// persistFileNode's fileCacheSource) — so top-level jsdom Blob fields of a
// stored record are turned into Node Blobs first, which clone fine and offer
// the same text() the page reads them back with.
{
  const { implForWrapper } = require("jsdom/lib/generated/idl/utils.js");
  const nodeStructuredClone = global.structuredClone;
  const isJsdomBlob = v => v && typeof v === "object" && implForWrapper(v) && implForWrapper(v)._bytes instanceof Uint8Array;
  global.structuredClone = (value, options) => {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.values(value).some(isJsdomBlob)) {
      value = Object.fromEntries(Object.entries(value).map(([k, v]) =>
        [k, isJsdomBlob(v) ? new Blob([implForWrapper(v)._bytes], { type: v.type }) : v]));
    }
    return nodeStructuredClone(value, options);
  };
}

// jsdom's selector engine is ~1000x slower than a browser's on the
// document-wide `[data-*="..."]` queries render() runs; see the module.
const FAST_SELECTORS = require("./jsdom-fast-selectors.js");

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

// philogg.html's main inline <script> is ~870 KB and identical in every
// window, so compile it ONCE and run that same vm.Script into each new
// window's context. Left inline, jsdom re-parses and re-compiles it for all
// ~290 windows this suite builds — which measured as ~75% of the whole
// suite's runtime. Equivalent to running it inline: it is the last element
// in <body>, and the app hooks neither DOMContentLoaded/load nor
// readyState/document.currentScript, so nothing depends on it executing
// mid-parse. runScripts stays "dangerously" so that the <script> elements the
// tests themselves inject (the window.__t bridge below, and the ~30 per-group
// helper bridges) still execute as before.
//
// There are now TWO inline <script>s in the file: the tiny synchronous FOUC
// fix right after <body> (sets data-theme before first paint — see
// changelog.d/) and this huge main one at the end of <body>. Both need to
// run for parity with the real page (the FOUC one is harmless/idempotent in
// jsdom), so all `<script>...</script>` blocks are matched and only the LAST
// one — the main app script — is pulled out and precompiled; the rest are
// left inline in PAGE_SHELL for jsdom to run normally as before.
const PAGE_SCRIPT_MATCHES = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const PAGE_SCRIPT_MATCH = PAGE_SCRIPT_MATCHES[PAGE_SCRIPT_MATCHES.length - 1];
// The app's stylesheet (the one <style> in <head>, ~280 KB) is cut out of the
// shell as well and put back as ONE text node right after the parse (see
// withApp). Parsed in place, parse5 feeds it through its RAWTEXT tokenizer as
// tens of thousands of character tokens, each appended to the growing text
// node with its own replaceData + mutation record — ~40% of every window's
// HTML parse, for the same text. Nothing runs in between that could notice:
// the only script in the parse is the FOUC one, which reads localStorage and
// matchMedia, never styles.
const PAGE_CSS_MATCH = /<style>([\s\S]*?)<\/style>/.exec(html);
const PAGE_CSS = PAGE_CSS_MATCH[1];
const PAGE_SHELL = html.replace(PAGE_SCRIPT_MATCH[0], "<script></script>").replace(PAGE_CSS_MATCH[0], "<style></style>");
const PAGE_SCRIPT = new vm.Script(PAGE_SCRIPT_MATCH[1], { filename: "philogg-inline.js" });

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { passed++; }
  else { failed++; failures.push(label); console.log("FAIL  " + label); }
}

// --- Group selection (sharding / single-group runs) -------------------------
// Every group file starts with a `group(N)` / `group("slug")` marker, so the
// runner knows which group the withApp calls after it belong to. Two env knobs act on
// that, both handled here rather than in run.js so a bare
// `node philogg.regression.test.js` keeps working unchanged:
//
//   SHARD=<index>/<total>  run only the groups whose number ≡ index (mod
//                          total) — a fixed split, for reproducing one
//                          shard's run by hand.
//   SHARD_CLAIMS=<dir>     what run.js uses instead: every child walks the
//                          whole file, and whichever reaches a group first
//                          claims it (an atomic mkdir of <dir>/<N>) and runs
//                          it; the others skip it. A child stuck in a slow
//                          group simply claims fewer, so the shards finish
//                          together however the group costs are spread —
//                          the fixed modulo split left the slowest shard ~15%
//                          behind the fastest.
//   GROUP=58,127           run only those groups — the dev loop's "re-run just
//                          the thing I broke", ~1-2s instead of the full suite.
//                          Combined with the two above it narrows what they
//                          split (GROUP 346e runs two groups across shards).
//
// The unit is the GROUP, never the individual withApp: multi-window groups
// (GROUP 20 and every other "reload" group) hand one IDBFactory and closure
// state from one window to the next, so their windows must stay together.
// Sub-lettered banners (30a-e, 55a-d, 73a-c, ...) all carry their shared
// number and therefore land in the same shard for the same reason.
// Code in a group file outside its gated parts still runs in every shard;
// the shared helpers (nativeFolderBridge, buildZipFixture, ...) are defined
// once in this file, before the group files run.
const SHARD = process.env.SHARD ? process.env.SHARD.split("/").map(Number) : null;
const SHARD_CLAIMS = process.env.SHARD_CLAIMS || null;
const ONLY = process.env.GROUP ? new Set(process.env.GROUP.split(",").map(g => g.trim())) : null;
let currentGroup = null;
const claimed = new Map(); // group -> this child's claim decision, made once
// Wall time from each group() marker to the next one, for the groups this
// child ran, reported to run.js (`##GROUPS`), which lists the slowest groups
// after every sharded run.
const groupMs = {};
const ranGroups = new Set();
let groupStartedAt = 0;
function closeGroupTiming() { if (ranGroups.has(currentGroup)) groupMs[currentGroup] = (groupMs[currentGroup] || 0) + Date.now() - groupStartedAt; }
function group(n) { closeGroupTiming(); currentGroup = String(n); groupStartedAt = Date.now(); }
function groupSelected() {
  if (currentGroup === null) return true; // not inside any group yet
  const mine = isMine(currentGroup);
  if (mine) ranGroups.add(currentGroup);
  return mine;
}
function isMine(g) {
  if (ONLY && !ONLY.has(g)) return false;
  if (SHARD_CLAIMS) {
    if (!claimed.has(g)) {
      let mine = true;
      try { fs.mkdirSync(path.join(SHARD_CLAIMS, g)); }
      catch (err) { if (err.code !== "EEXIST") throw err; mine = false; }
      claimed.set(g, mine);
    }
    return claimed.get(g);
  }
  if (SHARD) return groupNumber(g) % SHARD[1] === SHARD[0];
  return true;
}

// Numbered groups split by their number; named ones (group files may use a
// slug, see tests/README.md → "Group files") by a stable hash of the name.
function groupNumber(g) {
  if (/^\d+$/.test(g)) return Number(g);
  let h = 0;
  for (const c of g) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function section(title) { if (groupSelected()) console.log("\n== " + title + " =="); }

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Comfortably past philogg.html's NAV_DWELL_MS (700) — a genuine app
// timer, not a proxy condition that could be polled instead.
const NAV_DWELL_WAIT = 850;
// Past the 150ms "that was the code, not the person" window shared by the
// nav history and the tail-follow scroll listeners.
const PROGRAMMATIC_SCROLL_SETTLE = 200;

// Poll until `pred` holds, then continue immediately. Replaces the fixed-count
// `for (let i = 0; i < 40 && <cond>; i++) await sleep(50)` loops this suite
// used to spin. Those had two problems: they burned wall-clock in 50ms steps,
// and — the real one — they mostly exited on a PROXY condition ("the file node
// is back") while the assertions right after them needed a LATER stage of the
// same async restore to have run. That was green only for as long as window
// construction stayed slow enough to hide the gap; speeding the suite up made
// two of them flake. So: always poll the thing you are about to assert on.
// `pred` may be async (an IndexedDB read, say) — its result is awaited, so a
// promise is never mistaken for a truthy answer.
async function waitFor(pred, { timeout = 3000, step = 5 } = {}) {
  const deadline = Date.now() + timeout;
  while (!(await pred()) && Date.now() < deadline) await sleep(step);
  return await pred();
}

// App work a test started but didn't await (a click handler's
// fire-and-forget render waiting on IndexedDB, say) can still be running when
// withApp closes the window. fake-indexeddb lives outside the window, so that
// work resumes afterwards, finds `document` gone and rejects — which used to
// end the whole shard under load (no result line, every group in it lost).
// Its test is over by then and can't see it, so a rejection whose error comes
// from a window withApp already closed is dropped (counted for GROUP 346f).
// Anything else still crashes the shard, loudly, as before.
const closedWindowErrors = new WeakSet(); // closed windows' Error.prototype
let lateRejectionsDropped = 0;
process.on("unhandledRejection", err => {
  for (let o = err; o && typeof o === "object"; o = Object.getPrototypeOf(o)) {
    if (closedWindowErrors.has(o)) { lateRejectionsDropped++; return; }
  }
  throw err;
});

async function withApp(run, opts = {}) {
  if (!groupSelected()) return; // this group belongs to another shard
  const dom = new JSDOM(PAGE_SHELL, {
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
      if (opts.philogg) {
        Object.defineProperty(window, "philogg", { value: opts.philogg, configurable: true });
      }
      // The app's two background polls, setInterval(tailTick, TAIL_POLL_MS)
      // and setInterval(folderScanTick, FOLDER_SCAN_MS), are never scheduled
      // here: a group that needs a tick calls w.tailTick()/w.folderScanTick()
      // itself, at the moment it asserts on. Left running, they fired in any
      // group that happened to outlive 1.5s — only under full-suite load — and
      // re-read files, re-rendered and rescanned folders in the middle of
      // assertions (GROUP 332's "each file was read exactly once" counted the
      // tail poll's read). GROUP 346 checks both are still caught by name.
      window.__pausedBackgroundPolls = [];
      const realSetInterval = window.setInterval;
      window.setInterval = function (fn, ...rest) {
        if (typeof fn === "function" && (fn.name === "tailTick" || fn.name === "folderScanTick")) {
          window.__pausedBackgroundPolls.push(fn.name);
          return 0;
        }
        return realSetInterval.call(this, fn, ...rest);
      };
      // opts.beforeParse(window): anything else a group needs in place before
      // the page's script runs (a global jsdom lacks, say).
      // No provided formats by default (the page would otherwise fetch
      // formats/index.json at boot, which groups that count or assert on
      // their own fetch calls would see). GROUP provided-formats deletes
      // this in its beforeParse to test the hosted fetch route.
      window.__PHILOGG_PROVIDED_FORMATS__ = [];
      // opts.toolbarLabels: "off" | "hover" | "inline" for ALL FOUR toolbar-label
      // settings (the app default is "hover"; a group testing the Inline look
      // asks for "inline").
      if (opts.toolbarLabels) {
        window.localStorage.setItem("philogg-filter-toolbar-labels", opts.toolbarLabels);
        window.localStorage.setItem("philogg-view-toolbar-labels", opts.toolbarLabels);
        window.localStorage.setItem("philogg-sidebar-toolbar-labels", opts.toolbarLabels);
        window.localStorage.setItem("philogg-level-labels", opts.toolbarLabels);
      }
      // The "Where is what" first-start hint is switched off (flag already set)
      // so it never covers anything in a group; GROUP where-is-what opts in
      // with opts.whereHint.
      if (!opts.whereHint) window.localStorage.setItem("philogg-where-is-what-seen", "1");
      if (opts.beforeParse) opts.beforeParse(window);
      Object.defineProperty(window.Element.prototype, "clientHeight", { get() { return 400; }, configurable: true });
      Object.defineProperty(window.Element.prototype, "clientWidth", { get() { return 800; }, configurable: true });
      // The layout viewport (layoutTier()) follows the stubbed window width,
      // like a real browser whose content does not overflow.
      Object.defineProperty(window.HTMLHtmlElement.prototype, "clientWidth", { get() { return window.innerWidth; }, configurable: true });
      window.Element.prototype.getBoundingClientRect = function () {
        return { top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, x: 0, y: 0 };
      };
      Object.defineProperty(window.navigator, "clipboard", {
        value: { writeText: () => Promise.resolve() }, configurable: true,
      });
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    },
  });
  // The page's own script, pre-compiled once (see PAGE_SCRIPT above). It runs
  // in the same VM context the injected bridge <script>s below land in, so
  // their shared lexical scope works exactly as two inline <script>s would.
  const { window } = dom;
  const { document } = window;
  document.head.querySelector("style").textContent = PAGE_CSS; // see PAGE_CSS above
  PAGE_SCRIPT.runInContext(dom.getInternalVMContext());

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
      get minimapBinningMode() { return minimapBinningMode; },
      set minimapBinningMode(v) { minimapBinningMode = v; },
      get minimapWidth() { return minimapWidth; },
      get minimapView() { return { tMin: minimapTMin, tMax: minimapTMax, fileTMin: minimapFileTMin, fileTMax: minimapFileTMax, idxLo: minimapIdxLo, idxN: minimapIdxN, trail: minimapViewTrail.slice(), draft: minimapDraft ? { ...minimapDraft } : null }; },
      get minimapBucketCount() { return minimapBucketCount; },
      get minimapBars() { return { bg: minimapBgCounts, ov: minimapOvCounts, rank: minimapOvRank, name: minimapOvName }; },
      get highlightColorMap() { return highlightColorMap; },
      get currentViewEntries() { return currentViewEntries; },
      get currentHighlightViewEntries() { return currentHighlightViewEntries; },
      get contextActive() { return contextActive; },
      get contextGaps() { return contextGaps; },
      get contextMatchIds() { return contextMatchIds; },
      get contextStrips() { return contextStrips; },
      get contextRuns() { return contextRuns; },
      get contextExpansions() { return contextExpansions; },
      get contextAutoRanges() { return contextAutoRanges; },
      get contextMatchRows() { return contextMatchRows; },
      get contextMatchPos() { return contextMatchPos; },
      get contextViewStale() { return contextViewStale; },
      get highlightRowOffsets() { return highlightRowOffsets; },
      get contextInitialExpansion() { return contextInitialExpansion; },
      set contextInitialExpansion(v) { contextInitialExpansion = v; },
      get contextExpandStep() { return contextExpandStep; },
      set contextExpandStep(v) { contextExpandStep = v; },
      get contextExpandStepUnit() { return contextExpandStepUnit; },
      set contextExpandStepUnit(v) { contextExpandStepUnit = v; },
      get contextExpandStepMs() { return contextExpandStepMs; },
      set contextExpandStepMs(v) { contextExpandStepMs = v; },
      get CONTEXT_STRIP_HEIGHT() { return CONTEXT_STRIP_HEIGHT; },
      get CONTEXT_TOOLBAR_HEIGHT() { return CONTEXT_TOOLBAR_HEIGHT; },
      get extractRowsData() { return extractRowsData; },
      get patternsAnalysis() { return patternsAnalysis; },
      get extractColumns() { return extractColumns; },
      get extractArrayColumns() { return extractArrayColumns; },
      get renamingNodeId() { return renamingNodeId; },
      get plotConfig() { return plotConfig; },
      get plotParallelBrushes() { return plotParallelBrushes; },
      get plotParallelLayout() { return plotParallelLayout; },
      get PLOT_COLOR_MAPS() { return PLOT_COLOR_MAPS; },
      get plotZoom() { return plotZoom; },
      set plotZoom(v) { plotZoom = v; },
      get plotLastRender() { return plotLastRender; },
      get plotLastSeries() { return plotLastSeries; },
      get plot3dView() { return plot3dView; },
      set plot3dView(v) { plot3dView = v; },
      get plot3dLastRender() { return plot3dLastRender; },
      get plotHoverPoints() { return plotHoverPoints; },
      get plotMarkOps() { return plotMarkOps; },
      get plotSelRingOps() { return plotSelRingOps; },
      get linkPairsData() { return linkPairsData; },
      get linkBlockOffsets() { return linkBlockOffsets; },
      get linkSelectedPairIndex() { return linkSelectedPairIndex; },
      get undoStack() { return undoStack; },
      get redoStack() { return redoStack; },
      get entryIndex() { return entryIndex; },
      get MONO_CHAR_WIDTH_FALLBACK() { return MONO_CHAR_WIDTH_FALLBACK; },
      get customThemes() { return customThemes; },
      get THEME_COLOR_KEYS() { return THEME_COLOR_KEYS; },
      get SYNTAX_COLOR_KEYS() { return SYNTAX_COLOR_KEYS; },
      get BUILTIN_THEMES() { return BUILTIN_THEMES; },
      get BUILTIN_SYNTAX_SCHEMES() { return BUILTIN_SYNTAX_SCHEMES; },
      get customSyntaxSchemes() { return customSyntaxSchemes; },
      get syntaxSchemeChoice() { return syntaxSchemeChoice; },
      get themeModeChoice() { return themeModeChoice; },
      get detailView() { return detailView; },
      get colorPickerMode() { return colorPickerMode; },
      get HIGHLIGHT_PRESETS() { return HIGHLIGHT_PRESETS; },
      get accentChoices() { return accentChoices; },
      get textMatchHighlightEnabled() { return textMatchHighlightEnabled; },
      get textMatchHighlightScope() { return textMatchHighlightScope; },
      get textMatchHighlightInRows() { return textMatchHighlightInRows; },
      get textMatchHighlightInDetail() { return textMatchHighlightInDetail; },
      get highlightMatchTextEnabled() { return highlightMatchTextEnabled; },
      get filePathLinksEnabled() { return filePathLinksEnabled; },
      get tempAnchorMode() { return tempAnchorMode; },
      get tempAnchorFadeSeconds() { return tempAnchorFadeSeconds; },
      get temporaryAnchorAcrossFiles() { return temporaryAnchorAcrossFiles; },
      get sidebarForcedPeek() { return sidebarForcedPeek; },
      get sidebarAltPeek() { return sidebarAltPeek; },
      get hoverExpandSidebar() { return hoverExpandSidebar; },
      set hoverExpandSidebar(v) { hoverExpandSidebar = v; },
      get hoverExpandDetail() { return hoverExpandDetail; },
      set hoverExpandDetail(v) { hoverExpandDetail = v; },
      get focusModePrevState() { return focusModePrevState; },
      get ROW_HEIGHT() { return ROW_HEIGHT; },
      get TEXT_ROW_HEIGHT() { return TEXT_ROW_HEIGHT; },
      get TEXT_NUM_W() { return TEXT_NUM_W; },
      get TEXT_FOLD_W() { return TEXT_FOLD_W; },
      get filteredTextMode() { return filteredTextMode; },
      get editorView() { return editorView; },
      get EXTRACT_ROW_HEIGHT() { return EXTRACT_ROW_HEIGHT; },
      get LINK_PAIR_ROW_HEIGHT() { return LINK_PAIR_ROW_HEIGHT; },
      get BUFFER_ROWS() { return BUFFER_ROWS; },
      get TABLE_SPACER_PAD() { return TABLE_SPACER_PAD; },
      get tableScrollHeightScale() { return tableScrollHeightScale; },
      // jsdom has no real layout engine, so detectMaxTableScrollPx's own
      // probe (getComputedStyle on a huge height) never actually clamps —
      // it always detects the full range, unlike a real browser. This
      // test-only hook pins detectedMaxTableScrollPx directly, skipping
      // the probe, so a group can force a small, deterministic cap.
      forceTableScrollCap(px) { detectedMaxTableScrollPx = px; },
      resetTableScrollCap() { detectedMaxTableScrollPx = null; tableScrollHeightScale = 1; },
      detectMaxTableScrollPx() { return detectMaxTableScrollPx(); },
      // The boot restore promise (restoreSessionFromCache + restoreWatchedFolders),
      // awaited by every "reload" group instead of polling state.rootIds.
      get bootRestore() { return bootRestore; },
      get formatConfigReady() { return formatConfigReady; },
      // The filter-node copy table (GROUP filter-node-carriers checks it against its fixtures).
      get filterNodeFields() { return FILTER_NODE_FIELDS; },
      get navHistory() { return navHistory; },
      get navHistoryIndex() { return navHistoryIndex; },
      get nodeLastView() { return nodeLastView; },
      get filterActivationView() { return filterActivationView; },
      set filterActivationView(v) { filterActivationView = v; },
      get tableStatsVisible() { return tableStatsVisible; },
      get plotStatsVisible() { return plotStatsVisible; },
      get filterToolbarLabels() { return filterToolbarLabels; },
      get viewToolbarLabels() { return viewToolbarLabels; },
      resetUndoRedo() { undoStack = []; redoStack = []; },
      // Folder-watch minimap selection state (GROUP 204) — tests set these
      // directly instead of simulating real SVG mouse drags (jsdom has no
      // layout, see that group's own comment).
      get fmSelectedRecKeys() { return fmSelectedRecKeys; },
      set fmSelectedRecKeys(v) { fmSelectedRecKeys = v; },
      get fmSelectedWindow() { return fmSelectedWindow; },
      set fmSelectedWindow(v) { fmSelectedWindow = v; },
      get fmFolderId() { return fmFolderId; },
      set fmFolderId(v) { fmFolderId = v; },
      // Folder-minimap silent preload (GROUP 329).
      get folderPreloads() { return folderPreloads; },
      get foregroundLoads() { return foregroundLoads; },
      set foregroundLoads(v) { foregroundLoads = v; },
      // Format setup wizard (GROUP 261).
      get fwz() { return fwz; },
      // LLM assistant (GROUP 302+).
      get llmCreatedNodeIds() { return llmCreatedNodeIds; },
      get llm() { return llm; },
      set llmTransportOverride(v) { llmTransportOverride = v; },


    };
  `;
  document.body.appendChild(bridge);

  try {
    if (opts.demoFormats) await seedDemoFormats(window, window.__t);
    await run(window, document, window.__t);
  } finally {
    // Bugfix (this session): restoreSessionFromCache's own `finally` (and
    // restoreWatchedFolders right after it) can still be in flight after
    // `run()` returns — most groups never await T.bootRestore themselves
    // (only "reload" groups that assert on the restored state do). Under
    // parallel shard load that trailing work can lose the race against
    // window.close() below, which nulls out `document` mid-flight and
    // crashes the whole shard (TypeError inside updateMultilineMsgButton
    // etc.) — reproduced via isolated per-shard runs under load, not present
    // on the pre-session baseline. Group 127's own comment ("Deliberately
    // NOT await T.bootRestore") is about not awaiting it BEFORE its
    // intermediate-state assertions — awaiting it HERE, after run() has
    // already returned, only delays teardown and never affects any
    // assertion.
    await window.__t.bootRestore.catch(() => {});
    closedWindowErrors.add(window.Error.prototype); // see unhandledRejection above
    window.close();
  }
}

// The three example formats (examples/formats/*.logformat.json: the old demo
// seeds, now provided files) as ordinary OWN formats under their historic ids
// fmt-demo-app / fmt-demo-syslog / fmt-demo-app-syslog-meta, for the groups
// that test meta formats and the format dialogs on editable, deletable
// formats. Opt in with withApp(fn, { demoFormats: true }).
async function seedDemoFormats(w, T) {
  await T.formatConfigReady;
  const dir = path.join(__dirname, "..", "examples", "formats");
  const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).logFormat;
  const app = read("app-log.logformat.json"), sys = read("syslog-rfc5424.logformat.json"), meta = read("app-syslog-meta.logformat.json");
  const defs = [
    Object.assign({ id: "fmt-demo-app", builtin: false, edited: false, createdAt: 0 }, app),
    Object.assign({ id: "fmt-demo-syslog", builtin: false, edited: false, createdAt: 0 }, sys),
    { id: "fmt-demo-app-syslog-meta", name: meta.name, mode: "meta", targetFormatIds: ["fmt-demo-app", "fmt-demo-syslog"], builtin: false, edited: false, createdAt: 0 },
  ];
  for (const d of defs) {
    const fmt = w.JSON.parse(JSON.stringify(d));
    await w.saveLogFormat(fmt);
    T.state.logFormats.push(fmt);
  }
  w.renderFormatList();
  w.renderFormatRuleFormatOptions();
}

function fireClick(el, w) { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }
function fireContextMenu(el, w, x = 50, y = 50) { el.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })); }
function fireDblClick(el, w) { el.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, cancelable: true })); }
// Line/bar/scatter marks are canvas ops (no DOM element to click): a click goes to
// #plotSvg at the mark's SVG-space coordinates (jsdom's plotSvg rect is 1:1 with them).
function fireClickAt(el, w, x, y) { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y })); }
function fireDblClickAt(el, w, x, y) { el.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: x, clientY: y })); }
// The plotHoverPoints entry of a row (first series) and its centre in SVG space.
function plotHoverOfRow(T, row) { return T.plotHoverPoints.find(h => h.rowIndex === row); }
function plotHitXY(h) { return h.kind === "bar" ? { x: h.bx + h.bw / 2, y: h.by + h.bh / 2 } : { x: h.px, y: h.py }; }
function fireInput(el, w) { el.dispatchEvent(new w.Event("input", { bubbles: true })); }
function fireSubmit(el, w) { el.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); }
// Boolean pill toggles (docs/ui-standard.md #69) are <button role="switch"
// aria-checked>, not native checkboxes: read state with pillChecked(), and
// set it directly (no change event, mirroring the old `.checked =`) with
// setPill(). To simulate a user toggling one, fireClick() it (or its label).
function pillChecked(el) { return el.getAttribute("aria-checked") === "true"; }
function setPill(el, on) { const v = !!on; el.setAttribute("aria-checked", v ? "true" : "false"); el.classList.toggle("on", v); }
function fireKeydown(d, w, key, opts = {}) { d.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts })); }
function fireKeyup(d, w, key, opts = {}) { d.dispatchEvent(new w.KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...opts })); }
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

// --- Helpers shared by several group files -------------------------------------
// Top-level fixtures and helpers that more than one file in tests/groups/ uses.
// Anything only one group needs stays in that group's file.
// Shared by GROUP 199 and 207.
// Hand-builds a minimal, valid ZIP (local file headers + central
// directory + EOCD) from raw entries — test-fixture tooling only, not a
// stand-in for philogg.html's own reader. `entries`: [{ name, data:
// string|Buffer, method: 0|8 (default 8) }]. No CRC written (0) — the
// app's reader intentionally doesn't check it either, see readZipEntries.
function buildZipFixture(entries) {
  let offset = 0;
  const localBufs = [];
  const centralBufs = [];
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const uncompressed = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const method = e.method === undefined ? 8 : e.method;
    const compressed = method === 8 ? require("zlib").deflateRawSync(uncompressed) : uncompressed;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);       // version needed
    localHeader.writeUInt16LE(0, 6);        // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);       // mod time
    localHeader.writeUInt16LE(0, 12);       // mod date
    localHeader.writeUInt32LE(0, 14);       // crc32 (unused by the reader)
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);       // extra field length
    const localOffset = offset;
    const localRecord = Buffer.concat([localHeader, nameBuf, compressed]);
    localBufs.push(localRecord);
    offset += localRecord.length;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);     // version made by
    centralHeader.writeUInt16LE(20, 6);     // version needed
    centralHeader.writeUInt16LE(0, 8);      // flags
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);     // crc32
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);     // extra field length
    centralHeader.writeUInt16LE(0, 32);     // comment length
    centralHeader.writeUInt16LE(0, 34);     // disk number start
    centralHeader.writeUInt16LE(0, 36);     // internal attrs
    centralHeader.writeUInt32LE(0, 38);     // external attrs
    centralHeader.writeUInt32LE(localOffset, 42);
    centralBufs.push(Buffer.concat([centralHeader, nameBuf]));
  }
  const localSection = Buffer.concat(localBufs);
  const centralSection = Buffer.concat(centralBufs);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                 // disk number
  eocd.writeUInt16LE(0, 6);                 // disk with CD start
  eocd.writeUInt16LE(entries.length, 8);    // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);   // total entries
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16); // CD offset = end of local section
  eocd.writeUInt16LE(0, 20);                // comment length
  return Buffer.concat([localSection, centralSection, eocd]);
}

// state.logFormats/state.formatRules are populated once, asynchronously,
// by the boot-time loadFormatConfig() call this feature added ahead of
// loadFromUrlParam()/restoreSessionFromCache() — same "async boot step"
// consideration as Group 20's session-cache restore poll below, just a
// much shorter wait (no real IndexedDB I/O when no factory is passed).
// Any subtest that reads or writes state.logFormats/state.formatRules for
// its own fixture waits for this first so it never races the one-time
// boot assignment (state.logFormats = formats inside loadFormatConfig).
async function waitForFormatConfig(T) {
  await waitFor(() => T.state.logFormats.length > 0);
}

// A wrapper bridge over an in-memory set of folders. Mirrors the Rust side
// closely enough to matter: ids are minted per path and REUSED for a path
// already listed (commands.rs's register_local_file dedupe), because the
// scan tick re-lists everything every few seconds. `idBase` lets a second
// "process" hand out different ids for the same paths — which is exactly
// what a restart does, and what the restore case below leans on.
// `mtimes`, keyed by "dirPath/name" (same shape as `full` below), mirrors
// commands.rs::LocalFile.mtime — omitted for a path means "no mtime", same
// as a real fs::metadata() failure.
function nativeFolderBridge(dirs, idBase = 1, mtimes = {}) {
  const ids = new Map();
  const urls = new Map();
  let next = idBase;
  const bridge = {
    getPathForFile: () => null,
    revealPath: () => {},
    revealLocalUrl: () => {},
    listSystemFonts: () => Promise.resolve([]),
    pickFolder: () => Promise.resolve(bridge.picked),
    picked: null,
    listFolder: async (dirPath, extensions) => {
      const map = dirs[dirPath];
      if (!map) throw new Error("No such file or directory (os error 2)");
      return Object.keys(map).sort()
        .filter(name => extensions.some(ext => name.toLowerCase().endsWith(ext)))
        .map(name => {
          const full = dirPath + "/" + name;
          if (!ids.has(full)) ids.set(full, String(next++));
          const url = "philogg://local/" + ids.get(full) + "/" + name;
          urls.set(url, () => dirs[dirPath][name]);
          const mtime = mtimes[full];
          return typeof mtime === "number" ? { url, path: full, name, mtime } : { url, path: full, name };
        });
    },
    // Mirrors commands.rs::list_subfolders: this dir's immediate
    // subdirectories, modeled here as other `dirs` keys nested one segment
    // below `dirPath`.
    listSubfolders: async dirPath => {
      const prefix = dirPath + "/";
      const names = new Set();
      for (const key of Object.keys(dirs)) {
        if (!key.startsWith(prefix)) continue;
        names.add(key.slice(prefix.length).split("/")[0]);
      }
      return Array.from(names).sort().map(name => ({ path: dirPath + "/" + name, name }));
    },
  };
  // The fetch every philogg://local/… read goes through (the wrapper serves
  // these; jsdom has to be told how).
  bridge.installFetch = w => {
    w.fetch = async url => {
      const body = urls.get(String(url));
      if (!body) return { ok: false, status: 404 };
      const text = body();
      return {
        ok: true, status: 200,
        arrayBuffer: async () => new w.TextEncoder().encode(text).buffer,
        blob: async () => new w.Blob([text]),
      };
    };
  };
  return bridge;
}

// The exact 29-line reference sample (chat upload this session, not
// checked into the repo — see FEATURE_BACKLOG.md #81 and changelog.d/).
// One cosmetic change from the original: the U+25D6 glyph on line 24 is
// replaced by plain text, since it plays no role in classification (it's
// inside the free-text message, not a matched group) and keeping this
// file plain-ASCII avoids any source-encoding fragility.
const META_SAMPLE_LINES = [
  "2025-01-02 09:15:03.123 [] DEBUG demo.CoreWidget  - Widget DemoForm created for plugin DemoApp", // 1
  "", // 2
  "2025-01-02 09:15:03.456 [] INFO  demo.Loader  - Loading module DemoModule (v1.2.3)", // 3
  "", // 4
  "2025-01-02 09:15:04.010 [] DEBUG demo.Startup  - Hardware summary:", // 5
  "cpu_vendor\tACME", // 6
  "virtual_cores\t8", // 7
  "l1_cache_bytes\t32768", // 8
  "", // 9
  "2025-01-02 09:15:05.777 [] WARN  demo.ShaderLib  - Failed to compile effect: Demo info", // 10
  "-------------", // 11
  "0(12) : error D1001: demo shader error", // 12
  "", // 13
  "2025-01-02 09:15:06.001 [] ERROR demo.PythonBridge  - Traceback (most recent call last):", // 14
  '  File "C:\\demo\\app\\lib\\demo_module\\__init__.py", line 4, in <module>', // 15
  "    from .demo_parser import DemoParser, demo_to_text", // 16
  "ImportError: cannot import name 'demo_to_text' from 'demo_module.demo_parser'", // 17
  "", // 18
  "", // 19
  "2025-01-02 09:15:06.500 [] INFO  demo.Client  - demo client state changed: DISCONNECTED", // 20
  "", // 21
  "<13>1 2025-01-02T09:15:06.711324 localhost demoapp 12345 1 [log@9999 filename='C:\\dev\\demo\\Projects\\Demo.Common\\DemoBase.cpp' linenumber='42' errorcode='0' errortext='(info, demo, ok)' agent='agent_demo_0001' system='12345678-1234-1234-1234-123456789012'] stop requested", // 22
  "<13>1 2025-01-02T09:15:06.711201 localhost demoapp 12346 1 [log@9999 filename='C:\\dev\\demo\\Projects\\Demo.Common\\DemoBase.cpp' linenumber='42' errorcode='0' errortext='(info, demo, ok)' agent='agent_demo_0002' system='12345678-1234-1234-1234-123456789012'] stop requested", // 23
  "<14>1 2025-01-02T09:15:06.711990 localhost demoapp 12345 1 [log@9999 filename='C:\\dev\\demo\\Projects\\Demo.Block\\DemoBlock.cpp' linenumber='100' errorcode='D0010001' errortext='(warning, demo, no consumer)' agent='agent_demo_0001' system='12345678-1234-1234-1234-123456789012'] subtask done for tag /JOB :aaaa1111, took 1900us.", // 24
  "1 step executed in 1234us. Parallel factor 0.5.", // 25
  "<13>1 2025-01-02T09:15:06.712400 localhost demoapp 12345 1 [log@9999 filename='C:\\dev\\demo\\Projects\\Demo.Block\\DemoBlock.cpp' linenumber='145' errorcode='0' errortext='(info, demo, ok)' agent='agent_demo_0001' system='12345678-1234-1234-1234-123456789012'] step end a1b2c3d4 +0 bytes (no action)", // 26
  "2025-01-02 09:15:07.017 [] DEBUG demo.Sync  - refreshing channel DemoChannel (dirty flag)", // 27
  "", // 28
  "<13>1 2025-01-02T09:15:08.123456 localhost demoapp 12345 1 [log@9999 filename='C:\\dev\\demo\\Projects\\Demo.Xml\\DemoValidator.cpp' linenumber='9' errorcode='0' errortext='(info, demo, ok)' agent='agent_demo_0001' system='12345678-1234-1234-1234-123456789012'] validation finished for doc demo-1234", // 29
];

const META_SAMPLE_TEXT = META_SAMPLE_LINES.join("\n");

function fwzPaste(w, d, text) {
  const ev = new w.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: { getData: () => text } });
  d.querySelector("#fwzSample").dispatchEvent(ev);
}

/* ============================================================
   GROUP 290 — Link filter: Δt condition + Δt column (2026-09-26).
   linkDt = { op, ms } keeps only tuples whose span (pair.dtMs, first to
   last real entry) is > / < ms; a dropped pair doesn't claim its target
   under "exclusive matches". Covers: buildPairEntry's span (plain and
   chained), the condition on a node and baked, exclusivity interplay,
   the multi-hop dialog putting it on the last hop only (total span), the
   dialog's live "N of M pairs" preview + sample Δt badges, and the
   extraction table's synthetic "Δt (ms)" column (DT_COL) on pairs only.
   ============================================================ */
function linkKeyLog() {
  const rows = [["00,000", "T1", "move requested axis 1"], ["00,200", "T2", "move requested axis 2"],
    ["00,300", "T2", "position reached axis 2"], ["00,500", "T3", "position reached axis 1"],
    ["01,000", "T1", "position reached axis 1"], ["05,000", "T1", "move requested axis 1"],
    ["05,100", "T2", "position reached axis 2"], ["05,900", "T1", "position reached axis 1"]];
  return rows.map(([t, th, msg]) => `2024-01-15 10:00:${t}\tINFO\t"${th}"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`).join("\n") + "\n";
}

// Link dialog v2 helpers: the direction is a segmented control per step, the sides are text fields.
function linkDlgSetDir(w, d, hopIndex, dir) {
  const row = d.querySelectorAll("#linkSides .link-hop-row")[hopIndex];
  fireClick(row.querySelector('.link-hop-dir button[data-dir="' + dir + '"]'), w);
}
function linkDlgType(w, d, input, value) {
  input.value = value;
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
}
const pairSummary = pairs => pairs.map(p => p.second.message.replace("position reached axis ", "p") + "@" + p.dtMs).join("|");

const ARR_298_FMT = {
  id: "fmt-json298", name: "JSON 298", mode: "json", builtin: false, edited: false, createdAt: 0,
  tsKey: "t", levelKey: "l", messageKey: "m", tsFormat: "",
  columnDefs: [
    { key: "motor", kind: "custom", label: "motor", path: "motor" },
    { key: "tags", kind: "custom", label: "tags", path: "tags" },
    { key: "user", kind: "custom", label: "ctx.user", path: "ctx.user" },
  ],
};

const ARR_298_TEXT = [
  '{"t":1790000000000,"l":"INFO","m":"cycle","motor":[1.2,1.3,1.1,1.4],"tags":["a"],"ctx":{"user":7}}',
  '{"t":1790000000250,"l":"INFO","m":"cycle","motor":[1.25,1.9,1.12,1.41],"tags":["a","b"],"ctx":{"user":8}}',
  '{"t":1790000000500,"l":"WARN","m":"cycle","motor":[1.22,2.6,1.09],"tags":[],"ctx":{"user":9}}',
].join("\n") + "\n";

async function setup298(w, T) {
  await waitForFormatConfig(T);
  T.state.logFormats.push(JSON.parse(JSON.stringify(ARR_298_FMT)));
  T.state.formatRules.push({ id: "rule-298", glob: "*.jsonl", formatId: ARR_298_FMT.id, order: 0, createdAt: 0 });
  return await w.addFile("motor.jsonl", ARR_298_TEXT, () => {});
}

const logsimEntries2 = (format, scenarios, n, seed) => { const g = LOGSIM.createGenerator({ format, scenarios, seed }); return Array.from({ length: n }, () => g.next()); };

async function logsimRegister(w, T, format, id) {
  const doc = LOGSIM.formatExport(format);
  const parsed = w.parseLogFormatExport(JSON.stringify(doc));
  assert(parsed && !parsed.error, format + ": the exported format definition imports cleanly" + (parsed && parsed.error ? " — " + parsed.error : ""));
  T.state.logFormats.push(Object.assign({ id, builtin: false, edited: false, createdAt: 0 }, parsed.logFormat));
  T.state.formatRules.push({ id: "rule-" + id, glob: parsed.fileNamePatterns[0], formatId: id, order: T.state.formatRules.length, createdAt: 0 });
  return parsed;
}

async function llmSimFile(w, scenarios, entries, seed) {
  const [file] = LOGSIM.generateToStrings({ scenarios, entries, seed });
  return w.addFile(file.name, file.text, () => {});
}

const llmRun = (w, name, args) => w.runLlmTool(name, args === undefined ? {} : args);

// A scripted chat-completions model. Each turn is an answer object
// { content?, calls?: [[name, args], ...] } or a function(request, ctx) →
// answer, or "hang" (never answers until cancelled). Answers are streamed
// the way LM Studio does: content in two deltas, each tool call as a first
// delta with id+name+half the arguments and a second with the rest.
function llmFakeModel(script) {
  const fake = { requests: [], cancelled: [], pending: null };
  fake.chat = (requestId, endpoint, request, onEvent) => {
    fake.requests.push(JSON.parse(JSON.stringify(request)));
    fake.endpoint = endpoint;
    const turn = script.shift();
    if (!turn) return Promise.reject(new Error("fake model: script exhausted"));
    if (turn === "hang") return new Promise((res, rej) => { fake.pending = { requestId, rej }; });
    if (turn.fail) return Promise.reject(new Error(turn.fail));
    const ans = typeof turn === "function" ? turn(request, llmToolResults(request)) : turn;
    const chunk = delta => onEvent({ type: "chunk", data: { choices: [{ index: 0, delta }] } });
    if (ans.content) {
      const h = Math.ceil(ans.content.length / 2);
      chunk({ role: "assistant", content: ans.content.slice(0, h) });
      chunk({ content: ans.content.slice(h) });
    }
    (ans.calls || []).forEach(([name, args], i) => {
      const a = JSON.stringify(args), h = Math.ceil(a.length / 2);
      chunk({ tool_calls: [{ index: i, id: "c" + fake.requests.length + "_" + i, type: "function", function: { name, arguments: a.slice(0, h) } }] });
      chunk({ tool_calls: [{ index: i, function: { arguments: a.slice(h) } }] });
    });
    onEvent({ type: "chunk", data: { choices: [{ index: 0, delta: {}, finish_reason: ans.calls ? "tool_calls" : "stop" }] } });
    // LM Studio with stream_options.include_usage: one last chunk with the
    // token usage and an empty `choices`.
    if (ans.usage) onEvent({ type: "chunk", data: { model: ans.model || "fake-model", choices: [], usage: ans.usage } });
    return Promise.resolve();
  };
  fake.cancel = requestId => { fake.cancelled.push(requestId); if (fake.pending) fake.pending.rej(new Error("cancelled")); };
  return fake;
}

// name -> [parsed results], from the tool messages of a request (in order).
function llmToolResults(request) {
  const names = {};
  request.messages.forEach(m => (m.tool_calls || []).forEach(tc => { names[tc.id] = tc.function.name; }));
  const out = {};
  request.messages.filter(m => m.role === "tool").forEach(m => {
    let v; try { v = JSON.parse(m.content); } catch (e) { v = m.content; }
    (out[names[m.tool_call_id]] = out[names[m.tool_call_id]] || []).push(v);
  });
  return out;
}

const llmLast = (res, name) => res[name][res[name].length - 1];

const CHAT_HTML = fs.readFileSync(path.join(__dirname, "..", "desktop", "chat.html"), "utf8");

// The assistant is off by default (Settings → Assistant → Enable); the
// groups that use it switch it on before the page boots.
const llmOn = win => win.localStorage.setItem("philogg-llm-enabled", "1");

function llmDesktopStub(extra) {
  const calls = [];
  const stub = Object.assign({
    calls,
    llmChat: () => Promise.reject(new Error("no model in this test")),
    llmCancel: () => {},
    llmModels: url => (calls.push(["models", url]), url.includes("9999") ? Promise.reject("cannot reach localhost:9999 — is LM Studio's server running?") : Promise.resolve(["qwen2.5-7b-instruct", "llama-3.2-3b"])),
    llmChatWindow: (action, on) => { calls.push(["window", action, on]); return Promise.resolve(); },
    llmViewNotify: msg => { calls.push(["notify", msg.type]); return Promise.resolve(); },
    // MCP bridge (window.philogg.mcp*): records its calls; `mcpState` is what mcpStatus answers.
    mcpState: { listening: true, port: 7337, calls: 0, lastCallAt: null, lastClient: null, error: null },
    mcpConfigure(config) { calls.push(["mcpConfigure", config]); return Promise.resolve(Object.assign({}, this.mcpState, { listening: !!config.enabled, port: config.port })); },
    mcpStatus() { calls.push(["mcpStatus"]); return Promise.resolve(Object.assign({}, this.mcpState)); },
    mcpToolResult(id, text, isError) { calls.push(["mcpToolResult", id, text, isError]); return Promise.resolve(); },
  }, extra || {});
  return stub;
}

// Opens chat.html in its own window, wired to the main window `w`:
// view → main via llmHandleViewMessage, main → view via an llm.views entry,
// both through JSON and a macrotask, like the Rust relay.
function openChatView(w, T, opts = {}) {
  let receive = null, closed = false;
  const sent = [];
  const deliver = msg => setTimeout(() => !closed && receive && receive(JSON.parse(JSON.stringify(msg))), 0);
  const view = msg => { if (!opts.drop || !opts.drop(msg)) deliver(msg); };
  T.llm.views.add(view);
  const dom = new JSDOM(CHAT_HTML, {
    runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(cw) {
      cw.philoggChatTransport = {
        mode: opts.mode || "window",
        send: msg => { sent.push(msg); setTimeout(() => !closed && w.llmHandleViewMessage(JSON.parse(JSON.stringify(msg)), deliver), 0); },
        onMessage: fn => { receive = fn; },
      };
      // Native prompt()/confirm() must never be used (they look foreign in
      // the webview) — chat.html has its own dialog.
      cw.confirm = cw.prompt = () => { throw new Error("native dialog used"); };
    },
  });
  return { dom, cw: dom.window, cd: dom.window.document, sent, view, close: () => { closed = true; T.llm.views.delete(view); dom.window.close(); } };
}

// Answers chat.html's in-page dialog (rename/confirm): waits for it, types
// `value` into its input when given, then clicks OK. Returns the dialog's
// title for assertions.
async function answerChatDialog(cd, value) {
  const dlg = cd.getElementById("chatDialog");
  await waitFor(() => !dlg.classList.contains("hidden"));
  const title = cd.getElementById("chatDialogTitle").textContent;
  if (value != null) cd.getElementById("chatDialogInput").value = value;
  cd.getElementById("chatDialogOk").click();
  return title;
}

// --- Group files (tests/groups/*.js) -------------------------------------------
// New groups live in their own file instead of being appended above, so
// parallel branches never touch the same lines (see tests/README.md → "Group
// files"). Each file is run here by a DIRECT eval inside this async function:
// it sees every helper defined above exactly like an inline group, and its own
// declarations stay local to the wrapper. Files run in name order; every file
// starts with its own group(...) marker, so sharding and GROUP= work as usual.
const GROUPS_DIR = path.join(__dirname, "groups");
for (const f of fs.readdirSync(GROUPS_DIR).filter(f => f.endsWith(".js")).sort()) {
  const src = fs.readFileSync(path.join(GROUPS_DIR, f), "utf8");
  await eval("(async () => {\n" + src + "\n})()\n//# sourceURL=" + path.join(GROUPS_DIR, f));
}

console.log("\n" + "=".repeat(60));
console.log(passed + " passed, " + failed + " failed" + (failed ? " (" + failures.length + " failures listed above)" : ""));
// run.js parses these to sum the shards up into one total and list the slowest groups.
closeGroupTiming();
if (SHARD) console.log("##SHARD " + JSON.stringify({ shard: SHARD[0], passed, failed, failures }));
if (SHARD) console.log("##GROUPS " + JSON.stringify(groupMs));
// process.exitCode, NOT process.exit(): under run.js this process writes to a
// PIPE, where stdout is asynchronous — process.exit() drops whatever is still
// buffered, which intermittently swallowed the ##SHARD line above and made
// run.js report a total short by one whole shard (seen twice in one session:
// 2273 instead of 2915, no failure listed anywhere). Setting the code and
// letting the event loop drain naturally cannot truncate.
process.exitCode = failed ? 1 : 0;
})().catch(err => { console.error(err); process.exitCode = 1; });
