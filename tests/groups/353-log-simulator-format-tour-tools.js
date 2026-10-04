// GROUP 353 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 353 — log simulator format `tour` (tools/log-sim/tour.js): the
   guided tour as a log + format + session file + demo log
   Origin: 2026-10-01 (person-requested, homepage prerequisites Step 2).
   Output is deterministic; every tour line parses with the generated format
   (six custom levels, chapters as threads, explanation lines attached,
   time-only timestamps); the demo log offers what the TRY steps use; the
   generated session loads through ?session= (fake fetch) into the expected
   tree with the banner, and the root file (not the Reading view) shows the DEEP
   internals; the CLI writes the same files.
   ============================================================ */
group(353);
if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const files = Object.fromEntries(TOUR.generateTour().map(f => [f.path, f.text]));
  const SESSION_URL = "http://tour.example/t/welcome.session.json";
  const enc = (w, text) => new w.TextEncoder().encode(text).buffer;
  const tourFetch = w => async u => {
    const rel = u.replace("http://tour.example/t/", "");
    const text = files[rel];
    if (text === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" };
    return { ok: true, status: 200, arrayBuffer: async () => enc(w, text), text: async () => text };
  };

  {
    section("353a. Deterministic, the four files, the format export imports");
    const again = Object.fromEntries(TOUR.generateTour().map(f => [f.path, f.text]));
    assert(JSON.stringify(Object.keys(files)) === JSON.stringify(["welcome.log", "welcome.logformat.json", "welcome.session.json", "demo/app.log"]), "four files: " + Object.keys(files));
    assert(Object.keys(files).every(k => files[k] === again[k]), "same bytes on every run");
  }

  await withApp(async (w, d, T) => {
    section("353b. Every tour line parses: six custom levels, chapters as threads, explanations attached, time-only timestamps");
    await T.bootRestore;
    await waitForFormatConfig(T);
    const exp = w.parseLogFormatExport(files["welcome.logformat.json"]);
    assert(exp && !exp.error && exp.fileNamePatterns.join() === "welcome.log" && exp.logFormat.name === "PhiLogg Tour", "the .logformat.json imports (rule: welcome.log)");
    const sess = JSON.parse(files["welcome.session.json"]);
    assert(JSON.stringify(sess.files[0].logFormat) === JSON.stringify(JSON.parse(files["welcome.logformat.json"]).logFormat), "the session record carries the same format as the export");
    T.state.logFormats.push(Object.assign({ id: "fmt-tour", builtin: false, edited: false, createdAt: 0 }, exp.logFormat));
    const f = await w.addFile("welcome.log", files["welcome.log"], () => {}, "fmt-tour");
    assert(f.entries.length === TOUR.ROWS.length, TOUR.ROWS.length + " entries, got " + f.entries.length);
    const levels = new Set(f.entries.map(e => w.levelBucket(e.level, "fmt-tour")));
    assert(TOUR.LEVELS.every(l => levels.has(l)) && levels.size === 6, "all six custom levels occur and none falls into OTHER: " + [...levels]);
    assert(f.entries.every((e, i) => e.thread === TOUR.ROWS[i][1]), "the chapter is the Thread column");
    assert(f.entries.every((e, i) => e.message.split("\n").length === 1 + TOUR.ROWS[i][3].length), "every explanation line is attached to its entry");
    assert(f.entries.every((e, i) => i === 0 || e.ts > f.entries[i - 1].ts), "timestamps strictly increase (reading time)");
    assert(w.formatTime(f.entries[1].ts) === files["welcome.log"].split("\n").find(l => /^\d\d:/.test(l) && l.includes("[intro]") && l.includes(" HOW ")).slice(0, 12), "time-only timestamps display without a date");
    const slots = TOUR.LEVELS.map(l => w.customLevelSlot(l, "fmt-tour"));
    assert(new Set(slots).size === 6 && slots.every(s => s >= 1 && s <= 6), "each level has its own palette slot (per-theme colors): " + slots);
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("353c. demo/app.log has what the TRY steps use");
    await T.bootRestore;
    const text = files["demo/app.log"];
    const node = await w.addFile("app.log", text, () => {});
    assert(node.entries.length === 2500, "2500 entries");
    const count = (v, opts) => w.getEntries(w.createFilterNode(node.id, "text", v).id).length;
    assert(count("timeout") > 5, "step 'timeout' finds lines");
    const moves = count("Move requested"), reached = count("Position reached");
    assert(moves > 50 && reached > 50 && reached < moves, "Link step: " + moves + " Move requested, " + reached + " Position reached (some moves are aborted)");
    const ids = w.createFilterNode(node.id, "text", "Move requested"), tgt = w.createFilterNode(node.id, "text", "Position reached");
    const pairs = w.getEntries(w.createLinkNode(ids.id, tgt.id, "after", 1, { key: { pattern: "job=[*]" } }).id).length;
    assert(pairs === reached, "pairing by job=[*] gives exactly one pair per Position reached (" + pairs + "), aborted moves stay unpaired");
    const slow = w.getEntries(w.createLinkNode(ids.id, tgt.id, "after", 1, { key: { pattern: "job=[*]" }, dt: { op: ">", ms: 1000 } }).id).length;
    assert(slow > 0 && slow < pairs, "a Δt > 1 s condition keeps a few slow pairs (" + slow + ")");
    const pos = w.createFilterNode(node.id, "text", "Position update x=[*:float] y=[*:float] z=[*:float]");
    assert(w.nodeHasExtractableWildcards(pos) && w.getEntries(pos.id).length > 50, "extraction step: Position update is extractable");
    assert(count("Batch imported [*:int@en] records") > count("Batch imported [*:int] records"), "number-format step: @en finds the grouped integers a plain [*:int] misses");
    assert(w.compileExtractPattern("Meter reading [*:float@de] kWh"), "...and the @de form is a valid pattern");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("353d. ?session=welcome.session.json: files, format, tree, banner, the root file reveals the internals");
    await T.bootRestore;
    await waitForFormatConfig(T);
    w.fetch = tourFetch(w);
    assert(await w.loadSessionFromUrl(SESSION_URL), "the session loads");
    assert(T.state.rootIds.length === 2, "two files");
    const [wel, app] = T.state.rootIds.map(id => T.state.nodes[id]);
    assert(wel.name === "welcome.log" && app.name === "app.log" && app.entries.length === 2500 && wel.entries.length === TOUR.ROWS.length, "welcome.log + demo app.log loaded");
    assert(T.state.logFormats.some(f => f.id === wel.formatId && f.name === "PhiLogg Tour"), "welcome.log is pinned to the added PhiLogg Tour format");
    const kids = id => T.state.nodes[id].children.map(c => T.state.nodes[c]).filter(n => n.filterType !== "bookmarks" && n.filterType !== "notes");
    const view = kids(wel.id);
    assert(view.length === 1 && view[0].filterType === "level" && view[0].value.join() === "WHAT,HOW,TRY,GOTCHA,DONT", "one root-level node: the Reading view without DEEP");
    assert(T.state.activeId === view[0].id, "the Reading view is the active node");
    assert(kids(view[0].id).map(n => n.label).join("|") === "Quick read (WHAT)|Hands-on (TRY)|1 \u00b7 Opening files|2 \u00b7 Your own format|3 \u00b7 The filter tree|4 \u00b7 Link start & end|5 \u00b7 Extract & plot|6 \u00b7 Patterns|Pitfalls (GOTCHA + DONT)", "quick read, hands-on, six chapters, pitfalls below it");
    const byLabel = l => kids(view[0].id).find(n => n.label === l);
    const ch = byLabel("2 \u00b7 Your own format");
    assert(ch.filterType === "text" && ch.columns.join() === "thread" && w.getEntries(ch.id).length === TOUR.ROWS.filter(r => r[1] === "format" && r[0] !== "DEEP").length, "a chapter is a text filter on the Thread column (DEEP lines hidden by the Reading view)");
    assert(w.getEntries(byLabel("Pitfalls (GOTCHA + DONT)").id).length === TOUR.ROWS.filter(r => r[0] === "GOTCHA" || r[0] === "DONT").length, "Pitfalls = GOTCHA + DONT");
    assert(w.getEntries(view[0].id).length === TOUR.ROWS.filter(r => r[0] !== "DEEP").length, "the Reading view hides DEEP");
    assert(T.state.levelFilter.size === 0, "no chip selection (view filter) is active after loading the session");
    assert(isVisible(d.querySelector("#tourBanner"), w) && d.querySelector("#tourBanner .tour-banner-text").innerHTML === TOUR.BANNER.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"), "the banner shows the tour text");
    assert(T.state.activeId === view[0].id, "the Reading view is the active node when the tour opens");
    assert(d.querySelector("#tourBanner .tour-banner-text").textContent.includes("Reading view") && d.querySelector("#tourBanner .tour-banner-text").textContent.includes("welcome.log"),
      "the banner points at the Reading view and at welcome.log for the internals");
    const deepChip = () => d.querySelector('#levelBar .level-btn[data-level="DEEP"]');
    assert(Number(deepChip().querySelector(".level-count").textContent) === 0, "under the Reading view the DEEP chip counts 0 (the node hides them)");
    T.state.activeId = wel.id;
    w.render();
    assert(w.getEntries(wel.id).length === TOUR.ROWS.length, "the root file shows every row, DEEP included");
    assert(Number(deepChip().querySelector(".level-count").textContent) === TOUR.ROWS.filter(r => r[0] === "DEEP").length, "...and its DEEP chip counts them");
  }, { indexedDB: new IDBFactory() });

  {
    section("353e. CLI: -f tour writes the same files; --list names it; needs -o");
    const { spawnSync } = require("child_process");
    const os = require("os");
    const cli = path.join(__dirname, "..", "tools", "log-sim", "cli.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "philogg-tour-"));
    const run = args => spawnSync(process.execPath, [cli].concat(args), { encoding: "utf8" });
    const r = run(["-f", "tour", "-o", dir + path.sep, "-q"]);
    assert(r.status === 0, "exit 0: " + r.stderr);
    assert(Object.keys(files).every(k => fs.readFileSync(path.join(dir, k), "utf8") === files[k]), "every file equals generateTour()'s output");
    assert(/\btour\b/.test(run(["--list"]).stdout) && /welcome\.session\.json/.test(run(["--list"]).stdout), "--list shows tour with its hint");
    assert(run(["-f", "tour"]).status !== 0, "-f tour without -o fails");
    assert(JSON.parse(run(["-f", "tour", "--format-json"]).stdout).logFormat.name === "PhiLogg Tour", "--format-json prints the tour format");
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
