// GROUP 316 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 316 — Extraction: thousands separators. Person-reported: a value
   logged as "1,234.5" matched [*:float] only up to the "," so every line
   >= 1000 silently dropped out, and the auto-pattern split it into
   [*:int],[*:float]. A plain [*:float] now accepts the unambiguous shape
   (both separators, "1,234.5" / "1.234,5"); an explicit number format
   [*:float@en] / [*:int@de] covers the rest ("1,234", "812,3"). Captured
   values are normalized to "1234.5" for table, conditions and plot. Sample
   data: log-sim's opt-in "grouped" scenario.
   ============================================================ */
group(316);
await withApp(async (w, d, T) => {
  section("316a. [*:float] with grouped values, @en/@de formats, normalized table values and conditions");
  assert(!LOGSIM.normalizeScenarios("all").includes("grouped"), "log-sim: 'grouped' is opt-in — never part of 'all'");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["grouped"], entries: 300, seed: 4 });
  const f = await w.addFile(file.name, file.text, () => {});
  const msgs = f.entries.map(e => e.message);
  const count = re => msgs.filter(m => re.test(m)).length;
  const nThroughput = count(/^Throughput /), nMeter = count(/^Meter reading /), nBatch = count(/^Batch imported /);
  assert(count(/^Throughput \d{1,3},\d{3}\.\d/) > 0 && count(/^Throughput \d{1,3}\.\d/) > 0, "sanity: throughput values below and above 1000");
  assert(count(/^Meter reading \d{1,3},\d kWh/) > 0 && count(/^Batch imported \d{1,3},\d{3} /) > 0, "sanity: de decimals without grouping and grouped en integers");

  const rows = pattern => {
    const node = w.createFilterNode(f.id, "text", pattern);
    T.state.activeId = node.id;
    w.render();
    w.applyFhView("table");
    return T.extractRowsData.map(r => r.values[0]);
  };
  const tp = rows("Throughput [*:float] msg/s");
  assert(tp.length === nThroughput, "plain [*:float] matches every throughput line, got " + tp.length + " of " + nThroughput);
  assert(tp.every(v => /^\d+\.\d$/.test(v)) && tp.some(v => +v >= 1000), "grouped values are normalized (no separator) in the table");
  const src = msgs.filter(m => m.startsWith("Throughput ")).map(m => +m.slice(11).split(" ")[0].replace(",", ""));
  assert(tp.every((v, i) => +v === src[i]), "normalized values equal the logged numbers");
  const big = rows("Throughput [*:float>1000] msg/s");
  assert(big.length === src.filter(v => v > 1000).length && big.length > 0, "a condition compares the normalized value");
  assert(T.extractColumns.find(c => c.colIndex === 0).type === "float" && w.parseValueForPlot(big[0], "float") > 1000, "plot parses the normalized value");

  assert(rows("Meter reading [*:float] kWh").length < nMeter, "plain [*:float] skips a de value without grouping (812,3 is ambiguous)");
  const meter = rows("Meter reading [*:float@de] kWh");
  assert(meter.length === nMeter && meter.every(v => /^\d+\.\d$/.test(v)), "[*:float@de] matches every de value and normalizes it");
  const batch = rows("Batch imported [*:int@en] records");
  assert(batch.length === nBatch && batch.some(v => +v >= 1000) && batch.every(v => /^\d+$/.test(v)), "[*:int@en] reads 12,345 as 12345");
  assert(rows("Batch imported [*:int] records").length < nBatch, "plain [*:int] never guesses grouping");

  const spec = w.compileExtractPattern("x=[*:float@de>1000,<5000]");
  assert(spec && spec.columns[0].numberFormat === "de" && spec.columns[0].conditions.length === 2, "format and conditions combine");
  assert(!!w.wildcardMatch(spec.regex, spec.columns, "x=1.234,5") && !w.wildcardMatch(spec.regex, spec.columns, "x=812,5"), "conditions use the normalized @de value");
  assert(w.compileExtractPattern("[*:word@en]") === null && w.compileExtractPattern("[*:time@de]") === null, "a number format on a non-numeric type is invalid");
  const pair = w.compileExtractPattern("[*:int],[*:int]");
  assert(pair.regex.exec("1,234").slice(1).join("|") === "1|234", "an explicit literal comma between two placeholders still splits (backtracking)");
  const plain = w.compileExtractPattern("v=[*:float];");
  assert(w.normalizeExtractedNumber(plain.regex.exec("v=1.234,5;")[1], plain.columns[0]) === "1234.5", "plain [*:float] reads the unambiguous de shape too");
  w.renderExtractPatternView("x=[*:float@de]", spec.columns, null);
  assert(d.getElementById("extractPatternView").textContent.includes("float@de"), "the pattern chip shows the number format");
});

await withApp(async (w, d, T) => {
  section("316b. auto-patterns keep an unambiguous grouped number as one [*:float]");
  assert(w.buildNumericExtractPattern("Throughput 1,234.5 msg/s") === "Throughput [*:float] msg/s", "Extract from a message: one [*:float]");
  assert(w.buildNumericExtractPattern("Meter reading 12.345,6 kWh") === "Meter reading [*:float] kWh", "de shape: one [*:float]");
  assert(w.buildNumericExtractPattern("Batch imported 12,345 records") === "Batch imported [*:int],[*:int] records", "an ambiguous 12,345 is not guessed");
  const key = w.normalizeMessagePattern("Throughput 1,234.5 msg/s");
  assert(key === w.normalizeMessagePattern("Throughput 812.3 msg/s"), "Patterns tab: grouped and plain values form one group");
  w.normalizeMessagePattern("Throughput 1,234.5 msg/s");
  assert(w.patternFilterValue(key, w.eval("patternFloatMask"), true) === "Throughput [*:float] msg/s", "Patterns tab typed filter: [*:float]");
});
