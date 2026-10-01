// GROUP 286 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 286 — Patterns tab: message-pattern clustering
   Origin: 2026-09-26 (FEATURE_BACKLOG.md #23). normalizeMessagePattern's
   placeholders, the filter values built from a group ([*] / typed
   [*:int]/[*:float]), the tab itself (counts, sort, level quick-filter),
   the row actions (click = filter, Alt+click/⊘ = NOT filter that stays on
   Patterns, Extract → Table, jump → first entry in Filtered), the "create"
   undo step, the per-result cache and the time-sliced scan.
   ============================================================ */
group(286);
{
  const line = (i, level, thread, msg, method = "DoWork") => {
    const ss = String(i % 60).padStart(2, "0"), mm = String(Math.floor(i / 60) % 60).padStart(2, "0");
    return `2024-01-15 10:${mm}:${ss},000\t${level}\t"${thread}"\tC:\\src\\Foo.cs\tline ${i}\t[${method}]\t"${msg}"`;
  };
  const PATTERN_LOG = [];
  for (let i = 0; i < 12; i++) PATTERN_LOG.push(line(i, i === 5 ? "WARN" : "DEBUG", "Worker-" + (i % 3), `Axis ${i % 4} position ${(i * 1.5 + 0.25).toFixed(2)} reached in ${10 + i} ms`));
  for (let i = 12; i < 17; i++) PATTERN_LOG.push(line(i, "INFO", "Heart", `Heartbeat from 10.0.0.${i}:8080`));
  PATTERN_LOG.push(line(17, "ERROR", "Motion", "Emergency stop triggered by C:\\plc\\estop.cfg"));
  PATTERN_LOG.push(line(18, "ERROR", "Motion", `Retry 1/5 for job 3f2a1b4c-1234-5678-9abc-def012345678`));
  PATTERN_LOG.push(line(19, "ERROR", "Motion", `Retry 2/5 for job 00000000-aaaa-bbbb-cccc-111111111111`));
  const TEXT = PATTERN_LOG.join("\n") + "\n";

  await withApp(async (w, d, T) => {
    section("286a. normalizeMessagePattern / patternFilterValue");
    const shape = m => w.patternDisplayText(w.normalizeMessagePattern(m));
    assert(shape("Axis 2 position 1532.44 reached in 12 ms") === "Axis <#> position <#> reached in <#> ms", "numbers → <#>, got " + shape("Axis 2 position 1532.44 reached in 12 ms"));
    assert(shape("Heartbeat from 10.0.0.12:8080") === "Heartbeat from <ip>", "IPv4 with port → <ip>");
    assert(shape("Retry 3/5 for job 3f2a1b4c-1234-5678-9abc-def012345678") === "Retry <#>/<#> for job <guid>", "a ratio stays two numbers, a GUID is one placeholder");
    assert(shape('Loaded C:\\data\\run7\\x.cfg as "name 7" at 0x1F') === 'Loaded <path> as "<str>" at <hex>', "Windows path, quoted string, hex literal, got " + shape('Loaded C:\\data\\run7\\x.cfg as "name 7" at 0x1F'));
    assert(shape("read /var/log/app2/x.log ok") === "read <path> ok", "Unix path");
    assert(shape("Worker-3 done, x=-5") === "Worker-<#> done, x=<#>", "a sign glued to a word is literal, a free one belongs to the number");
    assert(shape("hash deadbeef12 vs cafebabe") === "hash <hex> vs cafebabe", "a hex run needs digits AND letters to count as a hash");
    assert(shape("first line 1\nsecond line 2") === "first line <#>", "only the first line of a multi-line message is normalized");
    const key = w.normalizeMessagePattern("Axis 2 position 1532.44 reached in 12 ms");
    assert(w.patternFilterValue(key, 2, false) === "Axis [*] position [*] reached in [*] ms", "untyped: every placeholder → [*]");
    assert(w.patternFilterValue(key, 2, true) === "Axis [*:int] position [*:float] reached in [*:int] ms", "typed: float mask picks [*:float]/[*:int]");
    const qkey = w.normalizeMessagePattern('user "bob" from 1.2.3.4');
    assert(w.patternFilterValue(qkey, 0, true) === 'user "[*]" from [*]', "non-numeric placeholders stay [*] even when typed, quotes kept");
  });

  await withApp(async (w, d, T) => {
    section("286b. the Patterns tab: counts, dominant level, sort, level quick-filter");
    const f = await w.addFile("patterns.log", TEXT, () => {});
    T.state.activeId = f.id; w.render();
    const tab = d.querySelector('#fhTabs .view-tab[data-fh-tab="patterns"]');
    assert(!!tab && !tab.disabled, "Patterns is a tab, enabled for a plain file node");
    const tabs = [...d.querySelectorAll("#fhTabs .view-tab")].map(b => b.dataset.fhTab);
    assert(tabs.join(",") === "patterns,highlight,filter,table,plot", "Patterns comes first (Ctrl+1), got " + tabs);
    fireClick(tab, w);
    assert(T.fhActiveTab === "patterns", "clicking the tab switches to it");
    assert(isVisible(d.querySelector("#patternsWrap"), w) && !isVisible(d.querySelector("#fhSplit"), w) && !isVisible(d.querySelector("#extractWrap"), w),
      "#patternsWrap replaces #fhSplit/#extractWrap");
    assert(d.querySelector("#patternsInfo").textContent === "20 entries → 4 patterns", "info line, got " + d.querySelector("#patternsInfo").textContent);
    let rows = [...d.querySelectorAll("#patternsRows .pattern-row")];
    assert(rows.length === 4, "one row per pattern, got " + rows.length);
    assert(rows[0].querySelector(".pattern-text").textContent === "Axis <#> position <#> reached in <#> ms", "default sort: count desc, got " + rows[0].querySelector(".pattern-text").textContent);
    assert(rows[0].children[0].textContent === "12" && rows[0].children[1].textContent === "60%", "count and share, got " + rows[0].children[0].textContent + " " + rows[0].children[1].textContent);
    assert(rows[0].querySelector(".level-badge").textContent === "WARN", "level column = most severe level in the group (one WARN among DEBUGs)");
    assert(rows[0].classList.contains("lvl-warn"), "row carries the level class for the badge colour");
    // ascending count surfaces the rare messages
    fireClick(d.querySelector('#patternsHead [data-sort="count"]'), w);
    rows = [...d.querySelectorAll("#patternsRows .pattern-row")];
    assert(rows[0].children[0].textContent === "1" && rows[0].querySelector(".pattern-text").textContent === "Emergency stop triggered by <path>",
      "count asc: the singleton first, got " + rows[0].querySelector(".pattern-text").textContent);
    fireClick(d.querySelector('#patternsHead [data-sort="level"]'), w);
    rows = [...d.querySelectorAll("#patternsRows .pattern-row")];
    assert(rows[0].querySelector(".level-badge").textContent === "ERROR" && rows[2].querySelector(".level-badge").textContent === "WARN" && rows[3].querySelector(".level-badge").textContent === "INFO",
      "level asc: most severe first");
    fireClick(d.querySelector('#patternsHead [data-sort="first"]'), w);
    rows = [...d.querySelectorAll("#patternsRows .pattern-row")];
    assert(rows[0].querySelector(".pattern-text").textContent.startsWith("Axis") && rows[3].querySelector(".pattern-text").textContent.startsWith("Retry"),
      "first-seen asc");
    // Level quick-filter narrows the analysed result, same as the Filtered view
    T.state.levelFilter.add("ERROR");
    w.render();
    assert(d.querySelector("#patternsInfo").textContent === "3 entries → 2 patterns", "level quick-filter applies, got " + d.querySelector("#patternsInfo").textContent);
    T.state.levelFilter.clear();
    w.render();
    // cache: same node result → same object; tail-style append in place → recomputed
    const c1 = T.patternsAnalysis(f.id);
    assert(T.patternsAnalysis(f.id) === c1, "cached per node result");
    const firstResult = c1.result;
    f.entries.push(Object.assign({}, f.entries[0], { id: "e-extra" })); // a tail append grows the same array in place
    const c2 = T.patternsAnalysis(f.id);
    assert(c2 === c1 && c2.total === 21 && c2.result !== firstResult, "an in-place append folds in only the new entries");
    assert(c2.result.groups.find(g => g.key.startsWith("Axis")).count === 13, "…counted into the existing group");
    f.entries = f.entries.slice(0, 20); // a replaced array (rotation) recomputes from scratch
    const c3 = T.patternsAnalysis(f.id);
    assert(c3 !== c1 && c3.total === 20, "a different array recomputes");
  });

  await withApp(async (w, d, T) => {
    section("286c. row actions: filter, hide (NOT, stays on Patterns), extract (→ Table), jump; undo/redo of the creation");
    const f = await w.addFile("patterns.log", TEXT, () => {});
    T.state.activeId = f.id; w.render();
    w.applyFhView("patterns");
    const rowFor = prefix => [...d.querySelectorAll("#patternsRows .pattern-row")].find(r => r.querySelector(".pattern-text").textContent.startsWith(prefix));
    fireClick(rowFor("Axis").querySelector(".pattern-text"), w);
    let node = T.state.nodes[T.state.activeId];
    assert(node.type === "filter" && node.parentId === f.id && node.filterType === "text", "click adds a text filter child of the active node");
    assert(node.value === "Axis [*] position [*] reached in [*] ms" && !node.inverted && JSON.stringify(node.columns) === '["message"]', "value/columns, got " + node.value);
    assert(w.getEntries(node.id).length === 12, "the filter matches exactly the group's entries, got " + w.getEntries(node.id).length);
    assert(T.fhActiveTab === "filter", "a new filter lands on Filtered");
    const createdId = node.id;
    w.undo();
    assert(!T.state.nodes[createdId] && T.state.activeId === f.id, "undo removes the created node and returns to its parent");
    w.redo();
    assert(!!T.state.nodes[createdId] && T.state.activeId === createdId && T.state.nodes[f.id].children.includes(createdId), "redo restores it under the same parent");

    T.state.activeId = f.id; w.render(); w.applyFhView("patterns");
    const hb = rowFor("Heartbeat");
    hb.querySelector(".pattern-text").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, altKey: true }));
    node = T.state.nodes[T.state.activeId];
    assert(node.inverted && node.value === "Heartbeat from [*]", "Alt+click adds the same filter as NOT");
    assert(w.getEntries(node.id).length === 15, "NOT keeps everything else, got " + w.getEntries(node.id).length);
    assert(T.fhActiveTab === "patterns" && d.querySelector("#patternsInfo").textContent === "15 entries → 3 patterns", "hiding stays on Patterns with the noise gone");
    fireClick(rowFor("Retry").querySelector('[data-act="hide"]'), w);
    node = T.state.nodes[T.state.activeId];
    assert(node.inverted && node.value === "Retry [*]/[*] for job [*]" && T.fhActiveTab === "patterns", "the ⊘ button is the same Hide action");

    fireClick(rowFor("Axis").querySelector('[data-act="extract"]'), w);
    node = T.state.nodes[T.state.activeId];
    assert(node.value === "Axis [*:int] position [*:float] reached in [*:int] ms", "Extract types the numeric placeholders, got " + node.value);
    assert(T.fhActiveTab === "table" && T.extractRowsData.length === 12, "Extract opens the Table with one row per entry");
    assert(T.extractRowsData[1].values[1] === "1.75", "captured float value, got " + T.extractRowsData[1].values[1]);

    T.state.activeId = f.id; w.render(); w.applyFhView("patterns");
    const errRow = rowFor("Emergency");
    fireClick(errRow.querySelector('[data-act="jump"]'), w);
    assert(T.state.activeId === f.id && T.fhActiveTab === "filter", "jump stays on the node and reveals Filtered");
    assert(T.state.selectedId === f.entries[17].id, "…with the group's first entry selected");
  });

  await withApp(async (w, d, T) => {
    section("286d. startEntryScan: small results synchronous, large ones time-sliced; a cancelled scan stops; the tab repaints when an async pass finishes");
    let seen = 0, doneAsync = null;
    w.startEntryScan([1, 2, 3], () => seen++, async => { doneAsync = async; }, () => {});
    assert(seen === 3 && doneAsync === false, "≤ ANALYSIS_SYNC_LIMIT runs to completion before returning");
    const big = new Array(60001).fill(0);
    let steps = 0, progressCalls = 0, finished = false;
    const job = w.startEntryScan(big, () => steps++, async => { finished = async; }, () => progressCalls++);
    assert(!finished, "a large scan returns before finishing");
    await waitFor(() => finished);
    assert(steps === 60001 && job.pos === 60001, "every entry stepped exactly once");
    let cancelledSteps = 0, cancelledDone = false;
    const j2 = w.startEntryScan(big, () => cancelledSteps++, () => { cancelledDone = true; }, () => {});
    j2.cancelled = true;
    await sleep(30);
    assert(!cancelledDone && cancelledSteps === 0, "a cancelled scan never runs");

    // The tab over a large result: "Grouping…" first, the table once the
    // time-sliced pass is done — the UI thread is never held for all of it.
    const f = await w.addFile("big.log", makeLog(0, 4), () => {});
    const tmpl = f.entries[0];
    const bigEntries = [];
    for (let i = 0; i < 60000; i++) bigEntries.push(Object.assign({}, tmpl, { id: "big" + i, message: "tick " + i + (i % 3 ? " ok" : " slow") }));
    f.entries = bigEntries;
    T.state.activeId = f.id; w.render();
    w.applyFhView("patterns");
    assert(d.querySelector("#patternsInfo").textContent.startsWith("Grouping 60.000 entries"), "large result starts as 'Grouping…', got " + d.querySelector("#patternsInfo").textContent);
    await waitFor(() => d.querySelector("#patternsInfo").textContent.includes("→"));
    assert(d.querySelector("#patternsInfo").textContent === "60.000 entries → 2 patterns", "…and repaints itself when done, got " + d.querySelector("#patternsInfo").textContent);
  });
}
