// GROUP level-bar-buckets — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP level-bar-buckets — the level bar accounts for every entry
   (Runde C / C2, step 1). FATAL is its own level (own chip, own color, not
   counted in ERROR); TRACE and an "Other" chip appear whenever an open root
   file contains them; chip counts sum to the entry count. Data: the log
   simulator's tour demo log (ERROR 134, FATAL 15, WARN 256, INFO 1356,
   DEBUG 694, TRACE 12, VERBOSE 21, NOTICE 12 = 2500).
   ============================================================ */
group("level-bar-buckets");

const lbbTour = () => {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  return TOUR.generateTour().find(f => f.path === "demo/app.log").text;
};
const lbbChips = d => [...d.querySelectorAll("#levelBar .level-btn")];
const lbbNum = s => Number(String(s).replace(/\./g, ""));
// exact count: the in-circle .level-count is the short form, the phone chip text ("E 134") keeps the exact number
const lbbExact = b => lbbNum(b.querySelector(".level-short").textContent.split(" ").pop());
const lbbCounts = d => Object.fromEntries(lbbChips(d).map(b => [b.dataset.level, lbbExact(b)]));

await withApp(async (w, d, T) => {
  section("level-bar-buckets a. levelBucket per raw level");
  await waitForFormatConfig(T);
  const b = l => w.levelBucket(l, "fmt-default");
  assert(b("FATAL") === "FATAL" && b("fatal") === "FATAL" && b("FATALITY") === "FATAL", "FATAL* is the FATAL bucket");
  assert(b("ERROR") === "ERROR" && b("ERR") === "ERROR" && b("ERRORS") === "ERROR", "ERR* stays ERROR");
  assert(b("WARNING") === "WARN" && b("INFO") === "INFO" && b("DEBUG") === "DEBUG" && b("TRACE") === "TRACE", "WARN/INFO/DEBUG/TRACE unchanged");
  assert(b("VERBOSE") === "OTHER" && b("NOTICE") === "OTHER" && b("") === "OTHER", "unlisted levels are OTHER");
  assert(w.ALL_LEVELS ? w.ALL_LEVELS[0] === "FATAL" : true, "FATAL is the most severe known level");
  assert(w.levelSortRank("FATAL") < w.levelSortRank("ERROR") && w.levelSortRank("TRACE") > w.levelSortRank("DEBUG") && w.levelSortRank("OTHER") > w.levelSortRank("TRACE"),
    "sort ranks: FATAL before ERROR, TRACE after DEBUG, OTHER last");
  assert(w.levelClass("FATAL") === "lvl-fatal" && w.levelClass("VERBOSE") === "lvl-other", "levelClass: lvl-fatal / lvl-other");
  assert(w.minimapLevelClass(w.levelSortRank("FATAL")) === "minimap-lvl-fatal", "minimap class for FATAL");
  assert(w.isReservedLevelName("fatal"), "FATAL is a reserved level name now (own color)");
});

await withApp(async (w, d, T) => {
  section("level-bar-buckets b. Chips on the tour demo log: order, labels, tooltips, counts sum to 2500");
  await waitForFormatConfig(T);
  const f = await w.addFile("app.log", lbbTour(), () => {});
  T.state.activeId = f.id;
  w.render();
  assert(f.entries.length === 2500, "sanity: 2500 entries");
  const order = lbbChips(d).map(x => x.dataset.level).join(",");
  assert(order === "FATAL,ERROR,WARN,INFO,DEBUG,TRACE,OTHER", "chips: FATAL before ERROR, TRACE after DEBUG, OTHER last, got " + order);
  const c = lbbCounts(d);
  assert(c.FATAL === 15 && c.ERROR === 134 && c.WARN === 256 && c.INFO === 1356 && c.DEBUG === 694 && c.TRACE === 12 && c.OTHER === 33,
    "counts: " + JSON.stringify(c));
  assert(Object.values(c).reduce((a, n) => a + n, 0) === 2500, "chip counts sum to the entry count");
  const other = d.querySelector('#levelBar .level-btn[data-level="OTHER"]');
  assert(other.title === "Other 33 (VERBOSE 21 · NOTICE 12)", "Other's tooltip lists the raw levels, got " + other.title);
  assert(other.classList.contains("lvl-other") && other.querySelector(".row-action-label").textContent === other.title, "Other chip: neutral class, label = tooltip");
  assert(d.querySelector('#levelBar .level-btn[data-level="FATAL"]').title === "FATAL 15", "FATAL chip tooltip");
  assert(d.querySelector('#levelBar .level-btn[data-level="FATAL"]').classList.contains("lvl-fatal"), "FATAL chip has its own lvl-fatal class");

  // Counts of a filtered active node still sum to that node's entries, while the
  // chip list does not change shape (it follows the root files).
  const node = w.createFilterNode(f.id, "text", "timeout");
  T.state.activeId = node.id;
  w.render();
  assert(lbbChips(d).map(x => x.dataset.level).join(",") === order, "the chip list does not change while filtering");
  const c2 = lbbCounts(d);
  assert(Object.values(c2).reduce((a, n) => a + n, 0) === w.getEntries(node.id).length, "counts sum to the active node's entries too");

  // Filtering by Other / FATAL works through the view filter path (levelBucket).
  T.state.activeId = f.id;
  w.render();
  const sel = w.createFilterNode(f.id, "level", ["OTHER"]);
  assert(w.getEntries(sel.id).length === 33, "a level node on OTHER matches the 33 VERBOSE/NOTICE entries");
  const fat = w.createFilterNode(f.id, "level", ["FATAL"]);
  assert(w.getEntries(fat.id).length === 15 && w.getEntries(w.createFilterNode(f.id, "level", ["ERROR"]).id).length === 134, "FATAL 15, ERROR 134 separately");
});

await withApp(async (w, d, T) => {
  section("level-bar-buckets c. Absent FATAL/TRACE/OTHER: no chip; the plain default bar is unchanged");
  await waitForFormatConfig(T);
  const lines = lbbTour().split("\n").filter(l => /^\S+ \S+\t(ERROR|WARN|INFO|DEBUG)\t/.test(l));
  const f = await w.addFile("plain.log", lines.join("\n"), () => {});
  T.state.activeId = f.id;
  w.render();
  assert(lbbChips(d).map(x => x.dataset.level).join(",") === "ERROR,WARN,INFO,DEBUG", "no FATAL/TRACE/Other chips when the file has none, got " + lbbChips(d).map(x => x.dataset.level).join(","));
  const c = lbbCounts(d);
  assert(Object.values(c).reduce((a, n) => a + n, 0) === f.entries.length, "sum equals the entry count");
  // A file with only a FATAL line and nothing else gets the FATAL chip, shown with its count.
  const g = await w.addFile("f.log", lines.slice(0, 3).join("\n") + "\n" + lbbTour().split("\n").find(l => /\tFATAL\t/.test(l)), () => {});
  T.state.activeId = g.id;
  w.render();
  assert(lbbChips(d).some(x => x.dataset.level === "FATAL"), "a FATAL chip appears as soon as the active root file has FATAL");
  T.state.activeId = f.id;
  w.render();
  assert(!lbbChips(d).some(x => x.dataset.level === "FATAL"), "...and is gone while another root without FATAL is active: the bar follows the active file (GROUP active-source-columns-levels)");
});

await withApp(async (w, d, T) => {
  section("level-bar-buckets d. A format that lists NOTICE: NOTICE chip, Other shrinks");
  await waitForFormatConfig(T);
  const fmt = T.state.logFormats.find(x => x.id === "fmt-default");
  fmt.levels = ["ERROR", "WARN", "INFO", "DEBUG", "NOTICE"];
  const f = await w.addFile("app.log", lbbTour(), () => {});
  T.state.activeId = f.id;
  w.render();
  const order = lbbChips(d).map(x => x.dataset.level).join(",");
  assert(order === "FATAL,ERROR,WARN,INFO,DEBUG,TRACE,NOTICE,OTHER", "NOTICE is listed by the format; extras are placed by rank (FATAL first, TRACE before the custom NOTICE, Other last), got " + order);
  const c = lbbCounts(d);
  assert(c.NOTICE === 12 && c.OTHER === 21, "NOTICE 12, Other shrinks to the 21 VERBOSE lines: " + JSON.stringify(c));
  assert(d.querySelector('#levelBar .level-btn[data-level="OTHER"]').title === "Other 21 (VERBOSE 21)", "Other's tooltip no longer lists NOTICE");
  assert(Object.values(c).reduce((a, n) => a + n, 0) === 2500, "still sums to 2500");
});

await withApp(async (w, d, T) => {
  section("level-bar-buckets e. Minimap header line: same order and extras, Other spelled out, no folded-Fatal note");
  await waitForFormatConfig(T);
  const f = await w.addFile("app.log", lbbTour(), () => {});
  T.state.activeId = f.id;
  w.render();
  const segs = [...d.querySelectorAll("#timelineMinimapMeta .minimap-meta-level")];
  assert(segs.map(s => s.dataset.level).join(",") === "FATAL,ERROR,WARN,INFO,DEBUG,TRACE,OTHER", "same order as the bar, got " + segs.map(s => s.dataset.level).join(","));
  assert(segs.map(s => s.textContent).join(" · ") === "F 15 · E 134 · W 256 · I 1.356 · D 694 · T 12 · Other 33", "texts, got " + segs.map(s => s.textContent).join(" · "));
  assert(!segs.some(s => s.title.includes("incl.")), "no '(incl. N Fatal)' note any more");
});

await withApp(async (w, d, T) => {
  section("level-bar-buckets f. FATAL colors resolve in every built-in theme and differ from ERROR");
  const css = d.querySelector("style").textContent;
  const blockOf = sel => { const i = css.indexOf(sel + "{"); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
  const themes = [":root", ':root[data-theme="light"]', ':root[data-theme="catppuccin-mocha"]', ':root[data-theme="catppuccin-macchiato"]',
    ':root[data-theme="catppuccin-frappe"]', ':root[data-theme="catppuccin-latte"]'];
  themes.forEach(t => {
    const blk = blockOf(t);
    const val = n => (blk.match(new RegExp("--level-" + n + ":([^;]+);")) || [])[1];
    assert(val("fatal") && val("fatal-soft"), t + ": --level-fatal and -soft defined");
    assert(val("fatal") !== val("error"), t + ": FATAL color differs from ERROR (" + val("fatal") + " vs " + val("error") + ")");
  });
  assert(/--level-fatal-on:/.test(blockOf(":root")), ":root defines --level-fatal-on (themes inherit it)");
  assert(!w.THEME_COLOR_KEYS || !w.THEME_COLOR_KEYS.includes("level-fatal"), "level-fatal is not a custom-theme color key");
  assert(/\.level-btn\.lvl-fatal\{/.test(css) && /\.level-btn\.active\.lvl-fatal\{/.test(css) && /\.log-row\.lvl-fatal\{/.test(css) && /\.minimap-lvl-fatal\{/.test(css) && /\.level-btn\.lvl-other\{/.test(css),
    "CSS consumers exist for chip, active chip, row, minimap and Other");
});
