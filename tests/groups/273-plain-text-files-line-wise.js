// GROUP 273 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 273 — Plain-text files: line-wise filters, Table and Plot
   Origin: 2026-09-25, person-requested — the filter concept carried over to
   text files (search lines by value, wildcards, tables, plots), with the
   filters acting on the Pretty-Printed JSON when Pretty Print is on. Covers:
   the "Plain text" format (every line one entry, blank lines kept, no
   trailing empty entry, ts = line number, no level), the same in the worker
   source and on tail appends, text/wildcard filters + the extraction table's
   "Line" column + the plot's default X, the row grid (Line column, no Δt/
   Level, empty level bar) and its return once a real log is loaded, line-
   range names for time filters, no merge, and the text viewer's "Filter
   lines" button (pretty-printed vs. raw JSON).
   ============================================================ */
group(273);
{
  const PT = "fmt-plaintext";
  const TEXT = "alpha\n\nTemp=21.5 ok\nTemp=-3 low\n";
  const QUOTED = '  "indented, quoted"';

  await withApp(async (w, d, T) => {
    section("273a. Plain text parses one entry per line, blank lines kept, ts = line number, no level");
    const f = await w.addFile("notes.txt", TEXT, () => {}, PT);
    assert(f.entries.length === 4, "4 lines -> 4 entries, the final newline adds none (" + f.entries.length + ")");
    assert(f.entries.map(e => e.message).join("|") === "alpha||Temp=21.5 ok|Temp=-3 low", "each entry's message is its line, blank line included");
    assert(f.entries.map(e => e.ts).join(",") === "1,2,3,4" && f.entries[2].tsRaw === "3", "ts/tsRaw are the 1-based line numbers");
    assert(f.entries.every(e => e.level === "" && w.levelBucket(e.level, e.formatId) === "OTHER"), "no level (OTHER bucket)");
    const verbatim = await w.addFile("q.txt", QUOTED + "\n", () => {}, PT);
    assert(verbatim.entries[0].message === QUOTED, "a line's indentation and outer quotes are kept verbatim");
    const crlf = await w.addFile("crlf.txt", "a\r\nb\r\n", () => {}, PT);
    assert(crlf.entries.map(e => e.message).join("|") === "a|b", "CRLF text: same split, no trailing entry");
    const empty = await w.addFile("empty.txt", "", () => {}, PT);
    assert(empty.entries.length === 0, "an empty file has no entries");
    assert(w.rebuildFileText(f) + "\n" === TEXT, "cache text round-trips (rebuildFileText)");

    section("273b. Text and wildcard filters, extraction table with a Line column, plot X defaults to Line");
    const txt = w.createFilterNode(f.id, "text", "Temp");
    assert(w.getEntries(txt.id).length === 2, "plain text filter finds both Temp lines");
    const neg = w.createFilterNode(f.id, "text", "Temp=[*:float<0]");
    assert(w.getEntries(neg.id).map(e => e.ts).join(",") === "4", "wildcard with a value condition finds line 4 only");
    const ext = w.createFilterNode(f.id, "text", "Temp=[*:float] [*:word]");
    T.state.activeId = ext.id;
    w.render();
    w.applyFhView("table");
    assert(T.extractRowsData.length === 2, "extraction table: one row per matching line");
    const lineCol = T.extractColumns.find(c => c.colIndex === -1);
    assert(lineCol && lineCol.name === "Line", "the ELAPSED slot is titled Line (" + (lineCol && lineCol.name) + ")");
    assert(T.extractRowsData.map(r => r.values[-1]).join(",") === "3,4", "...and holds the absolute line numbers");
    assert(T.extractRowsData.map(r => r.values[0]).join(",") === "21.5,-3", "captured values");
    w.applyFhView("plot");
    assert(T.plotConfig.xCol === -1, "the plot's X axis defaults to Line (" + T.plotConfig.xCol + ")");

    section("273c. Only plain text loaded: Line column, no Δt/Level, empty level bar");
    T.state.activeId = f.id;
    w.applyFhView("filter");
    w.render();
    assert(w.allRootsPlainText(), "sanity: every root is plain text");
    const header = d.querySelector("#tableHeader .row-grid").textContent;
    assert(header.includes("Line") && !header.includes("Time") && !header.includes("Thread"), "header: Line, no Time/Thread (" + header + ")");
    const grid = d.documentElement.style.getPropertyValue("--row-grid").trim().split(/\s+/);
    assert(grid[1] === "64px" && grid[2] === "0px" && grid[3] === "0px", "Line track 64px, Δt/Level collapsed (" + grid.join(" ") + ")");
    assert(w.activeLevelOrder().length === 0 && d.querySelectorAll("#levelBar .level-btn").length === 0, "no level buttons");
    assert(w.activeTextFilterColumns().map(c => c.label).join(",") === "Line,Message", "filter-column chips: Line, Message");
    w.renderColumnsPanel();
    const colKeys = [...d.querySelectorAll("#columnsList input[data-col]")].map(cb => cb.dataset.col).join(",");
    assert(colKeys === "message", "Columns panel offers no Δt toggle for plain text (" + colKeys + ")");
    const row = [...d.querySelectorAll("#tableRows .log-row")].find(r => r.dataset.entryId === f.entries[2].id);
    assert(row && row.querySelector(".col-time").textContent === "3" && !row.querySelector(".col-delta"), "row: line number, no Δt cell (text mode, GROUP 348)");

    section("273d. Line ranges: time filters are named in lines, merge is refused");
    const range = w.createFilterNode(f.id, "timerange", { from: 2, to: 3 });
    assert(range.name === "line 2 → line 3", "range name in lines (" + range.name + ")");
    assert(w.getEntries(range.id).length === 2, "range keeps lines 2-3");
    const other = await w.addFile("other.txt", "x\n", () => {}, PT);
    const bulk = w.describeBulkActions([f, other]);
    assert(bulk.actions.length === 0 && /can't be merged/.test(bulk.note), "no merge for plain-text files");

    section("273e. Loading a real log brings Time/Δt/Level back");
    await w.addFile("app.log", makeLog(0, 3), () => {});
    w.render();
    const header2 = d.querySelector("#tableHeader .row-grid").textContent;
    assert(header2.includes("Time") && header2.includes("Level"), "header back to Time/Level");
    w.renderColumnsPanel();
    assert(d.querySelector('#columnsList input[data-col="delta"]'), "...and the Columns panel offers Δt again");
    assert(w.activeLevelOrder().length > 0, "level buttons back");
  });

  await withApp(async (w, d, T) => {
    section("273f. Worker source and tail appends number lines the same way");
    const posted = [];
    const sandboxSelf = {};
    const ctx = vm.createContext({ self: sandboxSelf, postMessage: msg => posted.push(msg) });
    vm.runInContext(w.buildLogParseWorkerSrc(), ctx);
    sandboxSelf.onmessage({ data: { text: "one\n\nthree", fmt: { id: PT, mode: "plaintext" } } });
    const wEntries = posted.filter(m => m.type === "batch").flatMap(m => w.decodeNativeBatch(m.buf, m.strings).entries);
    assert(wEntries.map(e => e.message).join("|") === "one||three", "worker: every line, blank included");
    const f = await w.addFile("live.txt", "one\n", () => {}, PT);
    f.tail = { pending: "" };
    w.appendTailText(f, "two\n\nfour\nfi");
    assert(f.entries.map(e => e.ts + ":" + e.message).join("|") === "1:one|2:two|3:|4:four", "tail: numbered on append, partial line pending");
    assert(!w.nativeFormatSpec({ id: PT, mode: "plaintext" }), "no native parse spec: plain text stays on the JS path");
  });
}
