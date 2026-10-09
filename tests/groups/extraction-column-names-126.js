// GROUP extraction-column-names-126 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* GROUP extraction-column-names-126 — backlog #126: better automatic extraction column names.
   (1) The Table header shows the unit like the plot axis title ("completed [ms]"; the name itself,
   used by renames/LLM tools/link keys, stays "completed"). (2) No usable word before a numeric
   placeholder that has a unit: the unit names the column ("-> [*:int] ([*:int] ms)" -> value, ms);
   a column named like its unit shows no bracket (table header and plot axis title).
   (3) An ALL-CAPS word (GET, POST, OK) before a placeholder is a value, not a name: skipped like a
   stop word; "HTTP=[*]" (glued to =/:) stays a key. Sample data: tools/log-sim "timing" scenario. */
group("extraction-column-names-126");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("extraction-column-names-126 a. compileExtractPattern: caps words skipped, unit names a word-less column");
    const names = pat => w.compileExtractPattern(pat).columns.map(c => c.name).join("|");
    assert(names("Request GET [*] completed in [*:int]ms status=[*:int]") === "Request|completed|status", "case 3: got " + names("Request GET [*] completed in [*:int]ms status=[*:int]"));
    assert(names("status OK [*:int]") === "status" && names("Method POST [*]") === "Method", "OK / POST skipped");
    assert(names("HTTP=[*]") === "HTTP" && names("proto HTTP: [*:int]") === "HTTP", "caps key glued to = / : stays a key, got " + names("HTTP=[*]") + " / " + names("proto HTTP: [*:int]"));
    assert(names("GET [*]") === "value", "only a caps word -> value");
    assert(names("X [*]") === "X", "single capital letter is a name, got " + names("X [*]"));
    assert(names("Mode Ab [*]") === "Ab", "mixed case is a name");
    const c1 = w.compileExtractPattern("completed in [*:int]ms").columns[0];
    assert(c1.name === "completed" && c1.unit === "ms", "case 1: name stays, unit ms, got " + JSON.stringify(c1));
    const c2 = w.compileExtractPattern("-> [*:int] ([*:int] ms)").columns;
    assert(c2.map(c => c.name).join("|") === "value|ms" && c2[1].unit === "ms", "case 2: unit names the column, got " + JSON.stringify(c2));
    assert(w.compileExtractPattern("[*:int] ms [*:int] ms").columns.map(c => c.name).join("|") === "ms|ms 2", "same unit twice dedupes");
    assert(w.compileExtractPattern("-> [*:int] ([*] x)").columns.map(c => c.name).join("|") === "value|value 2", "no unit (text token) keeps the value fallback");
    assert(w.columnAxisLabel({ name: "ms", unit: "ms" }) === "ms" && w.columnAxisLabel({ name: "completed", unit: "ms" }) === "completed [ms]", "axis label: no bracket when name == unit");
  });

  await withApp(async (w, d, T) => {
    section("extraction-column-names-126 b. Table header and plot axis title in the real app");
    const [file] = LOGSIM.generateToStrings({ scenarios: ["timing"], entries: 200, seed: 5 });
    const f = await w.addFile(file.name, file.text, () => {});
    const node = w.createFilterNode(f.id, "text", "Request GET [*] completed in [*:int]ms status=[*:int]");
    T.state.activeId = node.id;
    w.render();
    w.applyFhView("table");
    await waitFor(() => d.querySelectorAll("#extractHead th[data-col]").length === 3, 3000);
    const hdr = () => [...d.querySelectorAll("#extractHead th[data-col]")].filter(t => +t.dataset.col >= 0).map(t => t.textContent.replace(/\s+/g, " "));
    const txt = hdr();
    assert(/^\s*2 completed \[ms\]int/.test(txt[1]), "case 1 header shows the unit: " + JSON.stringify(txt));
    assert(/^\s*1 Request/.test(txt[0]) && /^\s*3 statusint/.test(txt[2]), "case 3 names, columns without a unit have no bracket: " + JSON.stringify(txt));
    assert(node.columnRenames === undefined, "no rename involved: the name 'completed' is the compiled one");
    // a user rename keeps the unit, like the plot axis title
    w.renameColumn(node, 1, "duration");
    w.render();
    await waitFor(() => /duration \[ms\]/.test(d.querySelector('#extractHead th[data-col="1"]').textContent), 3000);

    // name == unit: no bracket
    const n2 = w.createFilterNode(f.id, "text", "in [*:int]ms status=[*:int]");
    T.state.activeId = n2.id;
    w.render();
    w.applyFhView("table");
    await waitFor(() => d.querySelectorAll("#extractHead th[data-col]").length === 2, 3000);
    const t2 = hdr();
    assert(/^\s*1 msint/.test(t2[0]) && !/\[/.test(t2[0]), "name == unit shows 'ms' without bracket: " + JSON.stringify(t2));
  }, { indexedDB: new IDBFactory() });
}
