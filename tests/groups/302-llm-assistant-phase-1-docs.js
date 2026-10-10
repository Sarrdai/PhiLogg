// GROUP 302 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 302 — LLM assistant, phase 1 (docs/llm-assistant-plan.md): the
   tool registry (runLlmTool/LLM_TOOLS) the local LLM operates PhiLogg
   through — overview, message types with per-placeholder value
   distributions, filter/link creation with previews and error texts,
   entries, value statistics, views/plots, bookmarks/notes, the result
   budget. Sample data from tools/log-sim (motion, sensors, ids).
   ============================================================ */
group(302);

await withApp(async (w, d, T) => {
  section("302a. get_overview + find_message_types with value distributions");
  const f = await llmSimFile(w, ["motion", "sensors"], 2000, 3);
  const ov = llmRun(w, "get_overview").result;
  assert(ov.files.length === 1 && ov.files[0].id === f.id && ov.files[0].entries === 2000 && ov.files[0].from && ov.files[0].to, "overview lists the file with count and time span");
  assert(ov.tree.length === 1 && ov.tree[0].id === f.id && ov.tree[0].count === 2000, "overview's tree starts at the file");
  const r = llmRun(w, "find_message_types", { query: "position reached" }).result;
  assert(r.types.length === 1 && /^Position reached axis=<#> actual=<#> job=J-<#>$/.test(r.types[0].type), "one 'Position reached' type, got " + JSON.stringify(r.types.map(t => t.type)));
  const reached = f.entries.filter(e => e.message.startsWith("Position reached")).length;
  const t = r.types[0];
  assert(t.count === reached, "its count is every 'Position reached' entry (" + reached + "), got " + t.count);
  assert(t.pattern === "Position reached axis=[*:int] actual=[*:float] job=J-[*:int]", "a ready-made typed extraction pattern, got " + t.pattern);
  const axes = Object.keys(t.placeholders[0].values || {}).sort();
  assert(axes.length >= 3 && axes.length <= 4 && axes.every(a => /^[1-4]$/.test(a)), "axis placeholder: few distinct values listed with counts, got " + JSON.stringify(t.placeholders[0]));
  assert(Object.values(t.placeholders[0].values).reduce((s, n) => s + n, 0) === reached, "the value counts add up to the type's count");
  assert(t.placeholders[1].distinct === ">10" && t.placeholders[1].min < t.placeholders[1].max, "actual=: many values → numeric range, got " + JSON.stringify(t.placeholders[1]));
  assert(t.example && /^e\d+$/.test(t.example.id) && t.example.message.startsWith("Position reached"), "an example entry with its id");
  const sens = llmRun(w, "find_message_types", { query: "temperature" }).result.types[0];
  assert(sens && Object.keys(sens.placeholders[0].values).every(v => /^[123]$/.test(v)), "sensor name T<#>: values 1-3, got " + JSON.stringify(sens && sens.placeholders[0]));
  const all = llmRun(w, "find_message_types", { limit: 2 }).result;
  assert(all.types.length === 2 && all.typesFound >= 3 && all.types[0].count >= all.types[1].count, "limit + most frequent first");
  assert(llmRun(w, "find_message_types", { nodeId: "n999999" }).error.includes("Unknown node"), "unknown node id → error text");
  const narrow = w.createFilterNode(f.id, "text", "Move requested");
  assert(T.state.activeId === narrow.id && llmRun(w, "find_message_types", { query: "temperature" }).result.nodeId === f.id, "without nodeId it searches the active node's whole file, not the selected filter");
  assert(llmRun(w, "create_filter", { pattern: "Sensor T2" }).result.parentId === f.id, "create_filter without parentId goes under the file too");
  assert(llmRun(w, "get_entries", {}).result.nodeId !== f.id, "get_entries without nodeId reads the active node");
  assert(w.messagePatternValues('Job "a b" took 12 ms at 10.0.0.1:80').join("|") === "a b|12|10.0.0.1:80", "messagePatternValues: quoted content, number, ip in placeholder order");
});

await withApp(async (w, d, T) => {
  section("302b. create_filter: extraction preview, errors, assistant marker");
  const f = await llmSimFile(w, ["motion", "sensors"], 1500, 4);
  const pat = "Position reached axis=[*:int] actual=[*:float] job=[*]";
  const res = llmRun(w, "create_filter", { parentId: f.id, pattern: pat });
  const c = res.result;
  const expect = f.entries.filter(e => e.message.startsWith("Position reached")).length;
  assert(!res.error && /^n\d+$/.test(c.nodeId) && c.matches === expect && c.of === 1500, "extraction filter created with its match count");
  assert(c.columns.length === 3 && c.columns[0].type === "int" && c.columns[1].type === "float" && c.sampleValues.length === 5 && /^[1-4]$/.test(c.sampleValues[0][0]), "columns + sample values");
  assert(c.examples.length === 4 && T.state.activeId === c.nodeId, "examples, and the new node is active");
  assert(T.llmCreatedNodeIds.has(c.nodeId), "marked as created by the assistant");
  w.render();
  const row = d.querySelector('.tree-row[data-node-id="' + c.nodeId + '"]');
  assert(row && row.querySelector(".tree-llm-mark"), "the tree row carries the ✦ marker");
  assert(!d.querySelector('.tree-row[data-node-id="' + f.id + '"] .tree-llm-mark'), "a node the person made (the file) has none");
  const zero = llmRun(w, "create_filter", { parentId: f.id, pattern: "no such text anywhere" }).result;
  assert(zero.matches === 0 && zero.hint, "no match → a hint instead of silence");
  const before = Object.keys(T.state.nodes).length;
  assert(llmRun(w, "create_filter", { parentId: f.id, pattern: "(", mode: "regex" }).error.startsWith("Invalid regex"), "bad regex → error text");
  assert(llmRun(w, "create_filter", { parentId: f.id, pattern: "x=[*:word>3]" }).error.startsWith("Invalid extraction pattern"), "condition on a word placeholder → error text");
  assert(llmRun(w, "create_filter", { parentId: f.id, pattern: pat, invert: true }).error.includes("inverted"), "inverted extraction refused");
  assert(llmRun(w, "create_filter", { parentId: f.id, pattern: "  " }).error, "empty pattern refused");
  assert(llmRun(w, "create_filter", { parentId: "n424242", pattern: "x" }).error.includes("Unknown parent"), "unknown parent refused");
  assert(Object.keys(T.state.nodes).length === before, "no node is created on an error");
  const inv = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor", invert: true }).result;
  assert(T.state.nodes[inv.nodeId].inverted && inv.matches === 1500 - f.entries.filter(e => e.message.includes("Sensor")).length, "invert: NOT filter");
  const rx = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested axis=[12] ", mode: "regex" }).result;
  assert(T.state.nodes[rx.nodeId].isRegex && rx.matches > 0 && rx.examples.every(e => /Move requested axis=[12] /.test(e.message)), "regex mode");
  const bad = w.runLlmTool("create_filter", "{not json");
  assert(bad.error.startsWith("Arguments are not valid JSON"), "raw JSON arguments that don't parse → error text");
  assert(w.runLlmTool("nope", {}).error.startsWith("Unknown tool"), "unknown tool → error text");
  assert(w.runLlmTool("create_filter", JSON.stringify({ parentId: f.id, pattern: "Sensor T2" })).result.matches > 0, "raw JSON arguments are parsed");
});

await withApp(async (w, d, T) => {
  section("302c. Reference scenario: link, values after the link, stats, plot");
  const f = await llmSimFile(w, ["motion", "sensors"], 3000, 5);
  const reached = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached axis=2 " }).result;
  const temp = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor T1 temperature=[*:float]" }).result;
  const link = llmRun(w, "create_link", { refId: reached.nodeId, targetId: temp.nodeId, direction: "after" });
  const l = link.result;
  assert(!link.error && l.pairs > 0 && l.pairs <= reached.matches && l.references === reached.matches && l.unpaired === reached.matches - l.pairs, "link: pairs, references, unpaired");
  assert(l.dtMs && l.dtMs.min <= l.dtMs.median && l.dtMs.median <= l.dtMs.max, "Δt min/median/max");
  assert(T.state.nodes[l.nodeId].filterType === "link" && T.state.nodes[l.nodeId].linkDirection === "after", "a real link node");
  const vals = llmRun(w, "create_filter", { parentId: l.nodeId, pattern: "temperature=[*:float]" }).result;
  assert(vals.matches === l.pairs && vals.columns.length === 1, "an extraction under the link tabulates the paired temperature");
  const st = llmRun(w, "get_value_stats", { nodeId: vals.nodeId, column: "1" }).result;
  assert(st.n === l.pairs && st.min <= st.p10 && st.p10 <= st.median && st.median <= st.p90 && st.p90 <= st.max, "value stats: ordered percentiles, got " + JSON.stringify(st));
  assert(llmRun(w, "get_value_stats", { nodeId: vals.nodeId, column: "temperature" }).result.n === st.n, "column by name");
  const unknownCol = llmRun(w, "get_value_stats", { nodeId: vals.nodeId, column: "7" });
  assert(unknownCol.error && unknownCol.result.columns.map(c => c.name).join() === "temperature,Δt (ms)", "unknown column → error + the column list (under a link with Δt)");
  assert(llmRun(w, "get_value_stats", { nodeId: reached.nodeId }).error.includes("no extraction pattern"), "stats need an extraction");
  const sv = llmRun(w, "show_view", { nodeId: vals.nodeId, view: "plot", plot: { type: "line", x: "time", y: "1" } });
  assert(!sv.error && T.fhActiveTab === "plot" && T.state.activeId === vals.nodeId, "show_view opens the plot on the node");
  assert(T.state.nodes[vals.nodeId].plotConfig.xCol === -1 && T.state.nodes[vals.nodeId].plotConfig.yCols.join() === "0", "plot axes set through sanitizePlotConfig, got " + JSON.stringify(T.state.nodes[vals.nodeId].plotConfig));
  assert(llmRun(w, "show_view", { nodeId: reached.nodeId, view: "table" }).error.includes("extraction"), "table on a non-extraction node refused");
  assert(llmRun(w, "show_view", { nodeId: vals.nodeId, view: "plot", plot: { y: "nope" } }).error, "unknown plot column refused");
  llmRun(w, "show_view", { nodeId: reached.nodeId, view: "filtered" });
  assert(T.fhActiveTab === "filter" && T.state.activeId === reached.nodeId, "filtered view");
  assert(llmRun(w, "create_link", { refId: f.id, targetId: temp.nodeId }).error.includes("filter nodes"), "a file can't be a link side");
  assert(llmRun(w, "create_link", { refId: reached.nodeId, targetId: temp.nodeId, key: "no key here" }).error.startsWith("Unknown key"), "bad correlation key refused");
  const keyed = llmRun(w, "create_link", { refId: reached.nodeId, targetId: temp.nodeId, key: "thread" }).result;
  assert(T.state.nodes[keyed.nodeId].linkKey.column === "thread", "key by column");
  const dt = llmRun(w, "create_link", { refId: reached.nodeId, targetId: temp.nodeId, maxDtMs: 200 }).result;
  assert(T.state.nodes[dt.nodeId].linkDt.op === "<" && dt.pairs <= l.pairs, "maxDtMs → Δt condition");
});

await withApp(async (w, d, T) => {
  section("302d. get_entries, annotate, result budget");
  const f = await llmSimFile(w, ["ids", "motion"], 1200, 6);
  const ge = llmRun(w, "get_entries", { nodeId: f.id, from: 5, max: 99 }).result;
  assert(ge.total === 1200 && ge.from === 5 && ge.entries.length === 20 && ge.entries[0].id === f.entries[5].id, "get_entries: capped at 20, from offset");
  assert(ge.entries.every(e => e.message.length <= 201), "messages shortened");
  const ids = [f.entries[1].id, f.entries[2].id];
  T.state.notes.set(ids[1], "my own note");
  const an = llmRun(w, "annotate", { entryIds: ids, note: "axis 2 overshoot", bookmark: true }).result;
  assert(an.bookmarked === 2 && an.noted === 2 && T.state.bookmarks.has(ids[0]) && T.state.bookmarks.has(ids[1]), "bookmarks set");
  assert(T.state.notes.get(ids[0]) === "axis 2 overshoot" && T.state.notes.get(ids[1]) === "my own note\naxis 2 overshoot", "a note is added, the person's own note kept and extended");
  llmRun(w, "annotate", { entryIds: ids, bookmark: true });
  assert(T.state.bookmarks.has(ids[0]), "bookmark: true never toggles an existing bookmark off");
  assert(llmRun(w, "annotate", { entryIds: ["e99999999"], bookmark: true }).error.includes("Unknown entry"), "unknown entry id refused");
  assert(llmRun(w, "annotate", { entryIds: ids }).error.startsWith("Nothing to do"), "neither note nor bookmark refused");
  const big = llmRun(w, "find_message_types", { nodeId: f.id, limit: 40 });
  assert(big.text.length <= 6000, "every result fits the budget (" + big.text.length + " chars)");
  const obj = { rows: Array.from({ length: 500 }, (_, i) => ({ i, text: "x".repeat(40) })) };
  const txt = w.llmFitBudget(obj, 2000);
  const back = JSON.parse(txt);
  assert(txt.length <= 2000 && back.truncated === true && back.rows.length > 5 && back.rows.length < 500, "llmFitBudget halves the largest array and says so");
  assert(w.llmFitBudget({ s: "y".repeat(5000) }, 1000).length <= 1000, "a single huge value is cut as text");
  assert(w.llmToolSpecs().length === 15 && w.llmToolSpecs().every(s => s.type === "function" && s.function.parameters.type === "object"), "fifteen tools in the OpenAI tools shape");
});
