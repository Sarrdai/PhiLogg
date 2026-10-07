// PhiLogg log simulator — the `tour` format.
//
// Unlike the other formats this one is not random output: it writes the
// guided tour of PhiLogg as a log file, plus everything needed to open it
// (`?session=welcome.session.json`, see docs/persistence-and-sync.md):
//
//   welcome.log                the tour (custom format "PhiLogg Tour")
//   welcome.logformat.json     that format (importable on its own)
//   welcome.session.json       session file: both logs by relative url, the
//                              tour's format, its filter tree, the banner
//   demo/app.log               the log the "TRY" steps work on (default
//                              format, fixed seed, all scenarios + grouped)
//   cards/app.log              the log behind the homepage's feature-card
//                              screenshots (docs/screenshots/generate.sh data)
//   cards/<card>.session.json  one session per homepage feature card
//                              (filters, link, patterns, plot): the screenshot's
//                              filter tree and active node, no banner. The
//                              card's tab comes from the link's `&view=` param.
//
// The texts below are DATA: one row per log entry (level, chapter, message,
// explanation as continuation lines). Every claim in them was checked
// against philogg.html — when the app changes, change the text here (and
// GROUP 352's tour assertions). Timestamps are the reading time since the
// start (~0.28 s per word of the previous entry's message), so the Δt column
// is a paragraph length. Deterministic: same bytes on every run.
//
// Node-only (requires ./core.js for the demo log); cli.js calls generateTour.
"use strict";
const sim = require("./core.js");

const FORMAT_NAME = "PhiLogg Tour";
const LEVELS = ["WHAT", "HOW", "TRY", "GOTCHA", "DONT", "DEEP"];
const REGEX = "^(?<ts>\\d{2}:\\d{2}:\\d{2}\\.\\d{3}) (?<level>\\w+)\\s+\\[(?<thread>\\w+)\\] (?<message>.*)$";
const TS_FORMAT = "HH:mm:ss.SSS";
const MS_PER_WORD = 280;
const DEMO_ENTRIES = 2500;
const DEMO_SEED = 7;
const DEMO_NAME = "app.log";
const CARD_ENTRIES = 6000;
const CARD_SEED = 7;

const BANNER = "You're reading the manual **as a log**. Its levels are custom: **WHAT**, **HOW**, **TRY**, **GOTCHA**, **DONT**, **DEEP**. **Reading view** hides DEEP – click **welcome.log** at the top of the tree for the internals.";

// [level, chapter (the Thread column), message, explanation lines]
const ROWS = [
  ["WHAT", "intro", "Welcome to PhiLogg. This tour is a log file, and you are reading it in PhiLogg.", [
    "This file uses its own format with six custom levels:",
    "  WHAT    what something is",
    "  HOW     how to use it",
    "  TRY     a hands-on step in app.log",
    "  GOTCHA  a pitfall",
    "  DONT    what not to do",
    "  DEEP    how it works inside (hidden in the Reading view)",
    "A format can name its levels as it likes. Settings → Log Formats lists this one (\"" + FORMAT_NAME + "\"); it was added when the tour opened."]],
  ["HOW", "intro", "The left side is the filter tree. Each node is a filter; click one to see only what it keeps.", [
    "A filter takes the rows of its parent and narrows them. The chapters of this tour are text filters on the Thread column;",
    "Quick read, Hands-on and Pitfalls are level filters. All of them sit under \"Reading view\", which hides DEEP. Click welcome.log at the top of the tree to see the DEEP lines too."]],
  ["DEEP", "intro", "The timestamps are reading time since the start. Click the ΔT header to sort by the gap to the previous row.", [
    "ΔT is the time to the previous row, here the length of the paragraph before it.",
    "The Gap filter (right-click a node → Gap filter…) keeps only rows that follow a pause of at least X, optionally measured per Thread."]],
  ["HOW", "files", "Drop a .log, .txt or .gz file (or a folder) onto the window, or use Open… at the top of the tree.", [
    "Open… also takes ZIP files and a folder to watch. When several files arrive at once, PhiLogg offers to merge them into one chronological timeline;",
    "merged rows remember their source file (a Source column, also usable as the key of a Link or Gap filter)."]],
  ["GOTCHA", "files", "Your log looks wrong? It's probably the line format, not the file. See Settings → Log Formats.", [
    "PhiLogg's default format is log4net-style: tab-separated columns. Anything else needs a format of its own, defined from example lines (next chapter).",
    "A format can also be of the JSON Lines kind (one JSON object per line). Files that match no filename rule use the default."]],
  ["DEEP", "files", "Large files are parsed in slices by Web Workers; the desktop app parses natively in Rust.", [
    "Both implementations follow the same rules, and a golden fixture keeps them identical. The page stays responsive while a big file loads."]],
  ["HOW", "format", "Your log has its own layout? Define it once: Settings → Log Formats → + Add format…", [
    "The format dialog turns example lines into a parser. Nothing to write by hand unless you want to."]],
  ["TRY", "format", "Paste 5-10 lines of YOUR log into the example box (Paste button or Ctrl+V), or drop the file while the dialog is open.", [
    "A dropped file contributes its first 512 KB, and the box keeps at most 200 lines. They stay in your browser like everything else;",
    "the first 50 are saved with the format so you can edit it later."]],
  ["WHAT", "format", "PhiLogg suggests a regex. Faint marks show what it recognized: time, level, thread, message.", [
    "The suggestion looks for a timestamp, a level word, a thread in quotes or parentheses and a bracketed method; everything else becomes the message.",
    "It also fills in the timestamp format."]],
  ["HOW", "format", "Wrong field? Pick a column on the left, then select its text in an example line. The mark generalizes to all lines.", [
    "Marks become capture groups of the regex; the text between them becomes the separators. Add your own columns (e.g. \"Request Id\") and they get a field of their own."]],
  ["TRY", "format", "Check the Preview table: every example line should split cleanly into columns.", [
    "This is the real test whether PhiLogg can read your log. A line that doesn't match isn't lost: it is appended to the entry above as a continuation line,",
    "like these explanation lines in this very file."]],
  ["GOTCHA", "format", "Your levels aren't ERROR/WARN/INFO? Fine. The level list fills from your examples; a custom name gets its own color.", [
    "This tour uses exactly that: WHAT, HOW, TRY, GOTCHA, DONT and DEEP are the custom levels of the \"" + FORMAT_NAME + "\" format.",
    "Each checked level gets a quick-filter button in the level bar; any level you leave unchecked counts as OTHER."]],
  ["HOW", "format", "Fill in \"Use for files matching\" (e.g. *.app.log) so matching files pick the format automatically.", [
    "That adds a filename rule at the end of the list; the first matching rule wins. Reorder the rules in Settings → Log Formats → Filename rules."]],
  ["TRY", "format", "Export it: Settings → Log Formats → Export, next to the format, writes a .logformat.json file.", [
    "Drop that file onto PhiLogg anywhere (another browser, the desktop app, a colleague) and the format dialog opens prefilled."]],
  ["DONT", "format", "Don't start by hand-writing a regex. Mark first, then read the regex PhiLogg derived and adjust it.", [
    "Typing into the Regex field takes over from the marks. ✦ Re-suggest throws marks, regex and timestamp format away (after a confirmation; Undo brings them back)."]],
  ["DEEP", "format", "The export holds name, regex, timestamp format, levels, columns, example lines and the filename patterns.", [
    "Formats live in IndexedDB. The export is plain JSON: format \"philogg-log-format\", version 1."]],
  ["TRY", "filters", "Select app.log in the tree, press Ctrl+Shift+F, type  timeout  and press Enter.", [
    "A text filter can be case-sensitive, a regex, whole-word, inverted (Exclude NOT) or limited to columns. The popup previews the match count live."]],
  ["HOW", "filters", "Nest a second filter under the first: with a filter selected, Ctrl+Shift+F adds a child that narrows it further.", [
    "Build the story of an incident top-down: \"service X\" → \"errors\" → \"after the deploy\". The tree stays readable, and F2 renames a node."]],
  ["GOTCHA", "filters", "Muting (M) is not deleting: a muted filter passes its parent's rows through unchanged.", [
    "Use it to compare with and without a step without rebuilding the chain: the children of a muted node keep working on what it passes through."]],
  ["DONT", "filters", "Don't build a filter just to look for a string once. Ctrl+F searches the current view without creating one.", [
    "The find bar only looks at what the current view shows. When a search is worth keeping, press Ctrl+Enter in its box: it becomes a filter."]],
  ["WHAT", "link", "The Link filter pairs related entries, e.g. \"move requested\" with \"position reached\".", [
    "For each entry of one filter, PhiLogg finds the nearest entry of another filter after (or before) it. Restrict the pairs to the same thread or the same captured value,",
    "and keep only pairs whose Δt is above or below a limit."]],
  ["TRY", "link", "In app.log, link  Move requested  with  Position reached  and match only the same job=[*].", [
    "Create both as text filters (select app.log, Ctrl+Shift+F, Enter), Ctrl-click the two filters in the tree and choose Link… (toolbar or right-click).",
    "Switch on \"Match only same\", pick \"value of pattern\" and type job=[*]; the preview shows the pair count. Then add \"Only pairs with Δt >\" 1 s to find the slow moves.",
    "An extraction on the pairs (Table tab) gets a Δt (ms) column you can plot."]],
  ["DEEP", "link", "Pairing is nearest-neighbor in time within each key, not a join.", [
    "With a key (same thread, or the same value captured by a pattern like job=[*]) only entries sharing it are candidates. That is why interleaved threads",
    "don't confuse it, and why a move that was aborted (its end never came) simply stays unpaired."]],
  ["TRY", "extract", "Select app.log, press Ctrl+Shift+F, type  Position update x=[*:float] y=[*:float] z=[*:float]  and press Enter.", [
    "The [*:…] placeholders turn numbers in the message into columns: [*:int], [*:float], [*:time], [*:word], [*:hex] and the bare [*].",
    "The Table tab now lists one row per match, with statistics; any numeric column can be plotted over time or against another in the Plot tab."]],
  ["GOTCHA", "extract", "Is 12,345 twelve thousand or twelve point three four five? Say so on the placeholder: [*:int@en] or [*:int@de].", [
    "Numbers like 1,234.5 or 1.234,5 are read as written, but a bare 12,345 is ambiguous. @en means comma groups and a dot decimal, @de the other way round.",
    "app.log contains such numbers: try  Batch imported [*:int@en] records."]],
  ["WHAT", "patterns", "The Patterns tab (Ctrl+1) groups messages by shape: numbers, ids and paths become placeholders.", [
    "Two \"Position reached\" lines for different axes and jobs are one pattern. Sort by Count to see what dominates the log, or ascending to find the rare messages;",
    "a click on a row filters for that shape."]],
  ["WHAT", "privacy", "Nothing you open here is uploaded. PhiLogg has no backend to upload to.", [
    "PhiLogg is a static page. It reads your file with the browser's File API and keeps its session cache in IndexedDB, in your browser only."]],
  ["DEEP", "privacy", "No analytics, no external fonts, no crypto.subtle. View source: it's one HTML file.", [
    "The session fingerprint is a synchronous FNV-1a hash on purpose. The release build only strips comments; names and lines stay readable."]],
  ["HOW", "outro", "Done. Keep this session, or drop your own log and start over.", [
    "Your changes in this tour are kept in your browser's session cache like any other session.",
    "Download philogg.html to use PhiLogg offline, or get the desktop app for file associations and native parsing."]],
];

// Filter tree of the session file. `ref`s are the node numbers of the
// session format (see serializeFilterTreeForCache). All nodes sit under the
// "Reading view" level node (everything but DEEP). The root file itself
// (welcome.log, top of the tree) shows every row, DEEP included. The level bar
// is a view filter on whichever node is active and cannot reveal rows the
// active node already excludes, so the tour points at the root file instead.
const THREAD_FILTERS = [
  ["files", "1 · Opening files"],
  ["format", "2 · Your own format"],
  ["filters", "3 · The filter tree"],
  ["link", "4 · Link start & end"],
  ["extract", "5 · Extract & plot"],
  ["patterns", "6 · Patterns"],
];
function filterTree() {
  const level = (levels, label, children) => ({ filterType: "level", name: levels.join(", "), label, inverted: false, value: levels, children: children || [] });
  const thread = (chapter, label) => ({ filterType: "text", name: "\u201c" + chapter + "\u201d", label, inverted: false, value: chapter, columns: ["thread"], children: [] });
  const view = level(LEVELS.filter(l => l !== "DEEP"), "Reading view (DEEP hidden)");
  view.children.push(level(["WHAT"], "Quick read (WHAT)"));
  view.children.push(level(["TRY"], "Hands-on (TRY)"));
  THREAD_FILTERS.forEach(([chapter, label]) => view.children.push(thread(chapter, label)));
  view.children.push(level(["GOTCHA", "DONT"], "Pitfalls (GOTCHA + DONT)"));
  // Session-format refs: depth-first, parent before its children.
  let ref = 0;
  (function walk(n) { n.ref = ++ref; n.children.forEach(walk); })(view);
  return { roots: [view], activeRef: view.ref };
}

function pad2(n) { return String(n).padStart(2, "0"); }
function clock(ms) {
  return pad2(Math.floor(ms / 3600000)) + ":" + pad2(Math.floor(ms / 60000) % 60) + ":" + pad2(Math.floor(ms / 1000) % 60) + "." + String(ms % 1000).padStart(3, "0");
}

// Reading-time timestamps: each entry starts when the previous message
// would have been read.
function rowTimes() {
  const times = [];
  let t = 0;
  ROWS.forEach((r, i) => {
    times.push(t);
    t += Math.round(r[2].split(/\s+/).length * MS_PER_WORD);
  });
  return times;
}

function tourLogLines() {
  const times = rowTimes();
  const out = [];
  ROWS.forEach((r, i) => {
    out.push(clock(times[i]) + " " + r[0].padEnd(6) + " [" + r[1] + "] " + r[2]);
    r[3].forEach(l => out.push("  " + l));
  });
  return out;
}

// The format as the session file's `logFormat` and the export's `logFormat`.
// Level colors stay null: the six custom levels then take the app's own
// per-theme palette slots (readable in every theme), in list order.
function logFormat() {
  const lines = tourLogLines();
  return {
    name: FORMAT_NAME,
    mode: "regex",
    regex: REGEX,
    tsFormat: TS_FORMAT,
    levels: LEVELS.map(n => ({ value: n, name: n, color: null })),
    columnDefs: [{ key: "thread", kind: "default", label: "Thread" }],
    messageVisible: true,
    sampleSetup: { lines: lines.slice(0, 4), marks: [] },
  };
}

function formatExport() {
  return { format: "philogg-log-format", version: 1, savedAt: "2026-01-01T00:00:00.000Z", logFormat: logFormat(), fileNamePatterns: ["welcome.log"] };
}

function demoLog() {
  return sim.generateToStrings({
    format: "default", seed: DEMO_SEED, entries: DEMO_ENTRIES, singleName: DEMO_NAME,
    scenarios: sim.normalizeScenarios("all").concat(["grouped"]),
  })[0].text;
}

// The homepage cards' log: the data of docs/screenshots/generate.sh
// (6000 entries, seed 7, every scenario except text and gaps).
function cardLog() {
  return sim.generateToStrings({
    format: "default", seed: CARD_SEED, entries: CARD_ENTRIES, singleName: DEMO_NAME,
    scenarios: sim.normalizeScenarios("all,-text,-gaps"),
  })[0].text;
}

// The filter tree of docs/screenshots/scenes/common.js as session nodes. The
// plot of "Position" is the one of scenes/03-plot.js (scatter x/y, colored by
// t (ms), equal axes); its column numbers are the table's, negatives are the
// built-in columns.
function cardTree() {
  const text = (name, value, extra) => Object.assign({ filterType: "text", name, inverted: false, value, children: [] }, extra);
  const level = (v, color) => ({ filterType: "level", name: v, inverted: false, value: [v], highlightColor: color, children: [] });
  const bakedText = value => ({ filterType: "text", value, inverted: false });
  const roots = [
    { filterType: "link", name: "\u201cMove requested\u201d \u2192 \u201cPosition reached\u201d [same job=[*]]", inverted: false, children: [],
      bakedA: bakedText("Move requested"), bakedB: bakedText("Position reached"),
      linkDirection: "after", linkN: 1, linkOrderEnforced: false, linkExclusive: false, linkKey: { pattern: "job=[*]" } },
    level("ERROR", "#d9534f"),
    level("WARN", "#e0a030"),
    text("Request durations", "completed in [*:int]ms status=[*:int]"),
    text("Position", "Position update x=[*:float] y=[*:float] z=[*:float]", { plotConfig: {
      type: "scatter", xCol: 0, yCols: [1], yColsMulti: [0], zCol: -2, colorCol: -1, colorMap: "default",
      xMin: "", xMax: "", yMin: "", yMax: "", zMin: "", zMax: "", normalize: false, axisEqual: true, axisEqual3d: "off",
      yColsInit: true, arrayCol: null, profileRow: -1, arraySource: "array", multiCols: [], multiColsInit: false } }),
    text("Spectrum A", "Spectrum channel=A bins=[*]"),
    text("\u201cMove requested\u201d", "Move requested"),
    text("\u201cPosition reached\u201d", "Position reached"),
    text("Thread axis-2", "axis-2", { columns: ["thread"] }),
  ];
  const byName = {};
  let ref = 0;
  roots.forEach(n => { n.ref = ++ref; byName[n.name] = n.ref; });
  return { roots, ref: byName };
}

// card -> [file name, active filter]; null = the file itself (Patterns).
const CARDS = { filters: "Thread axis-2", link: roots => roots[0].name, patterns: null, plot: "Position" };
function cardSession(card) {
  const tree = cardTree();
  const name = typeof CARDS[card] === "function" ? CARDS[card](tree.roots) : CARDS[card];
  return {
    format: "philogg-session-export",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    // The scenes of the filters/link/plot cards (01, 04, 03) collapse the Entry detail panel; patterns (09) does not.
    detailCollapsed: card === "patterns" ? undefined : true,
    files: [{ exportId: "app", name: DEMO_NAME, url: DEMO_NAME, merged: false, filters: tree.roots, bookmarks: [], notes: [], clockOffset: 0 }],
    settings: { levelFilter: [], sortColumn: null, sortDir: "asc", pinBookmarksInFilteredView: false, active: { exportId: "app", ref: name == null ? null : tree.ref[name] } },
  };
}

function sessionFile() {
  const tree = filterTree();
  const rec = (exportId, name, url, extra) => Object.assign({ exportId, name, url, merged: false, filters: [], bookmarks: [], notes: [], clockOffset: 0 }, extra);
  return {
    format: "philogg-session-export",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    banner: BANNER,
    files: [
      rec("welcome", "welcome.log", "welcome.log", { logFormat: logFormat(), filters: tree.roots }),
      rec("demo", DEMO_NAME, "demo/" + DEMO_NAME),
    ],
    settings: { levelFilter: [], sortColumn: null, sortDir: "asc", pinBookmarksInFilteredView: false, active: { exportId: "welcome", ref: tree.activeRef } },
  };
}

// [{ path, text }] relative to the output directory.
function generateTour() {
  return [
    { path: "welcome.log", text: tourLogLines().join("\n") + "\n" },
    { path: "welcome.logformat.json", text: JSON.stringify(formatExport(), null, 2) + "\n" },
    { path: "welcome.session.json", text: JSON.stringify(sessionFile(), null, 2) + "\n" },
    { path: "demo/" + DEMO_NAME, text: demoLog() },
    { path: "cards/" + DEMO_NAME, text: cardLog() },
  ].concat(Object.keys(CARDS).map(c => ({ path: "cards/" + c + ".session.json", text: JSON.stringify(cardSession(c), null, 2) + "\n" })));
}

module.exports = { generateTour, cardSession, CARDS, formatExport, sessionFile, logFormat, demoLog, tourLogLines, ROWS, LEVELS, BANNER, FORMAT_NAME, DEMO_NAME };
