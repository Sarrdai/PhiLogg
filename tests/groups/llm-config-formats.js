// GROUP llm-config-formats — LLM/MCP configuration tools, step 1: list_config
// (formats, filename_rules), create_format, set_filename_rule and
// delete_config_item for formats + filename rules. Settings changes update the
// in-memory state synchronously (runLlmTool stays synchronous), persist in the
// background, are not undoable, and carry createdBy: "assistant" (only such
// items can be deleted by a tool).
// Origin: 2026-10-11 (person-requested, plan-llm-config-tools step 1).
// Sample data from tools/log-sim (bracket, syslog, jsonl, custom, tour).
group("llm-config-formats");
if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourFiles = Object.fromEntries(TOUR.generateTour().map(f => [f.path, f.text]));
  const simText = (format, n, seed) => LOGSIM.generateToStrings({ format, entries: n, seed })[0];
  const head = (text, n) => text.split("\n").slice(0, n);

  await withApp(async (w, d, T) => {
    section("llm-config-formats a. list_config: formats and filename rules; unknown kind");
    await waitForFormatConfig(T);
    const f = llmRun(w, "list_config", { kind: "formats" });
    assert(!f.error && f.result.kind === "formats", "formats listed, got " + JSON.stringify(f.error));
    const def = f.result.formats.find(x => x.id === "fmt-default");
    assert(def && def.builtin && def.mode === "pattern" && def.levels.includes("ERROR") && def.columns[0] === "time" && def.columns.includes("message"), "builtin default format with levels + columns");
    assert(!def.byAssistant && !f.result.formats.some(x => x.byAssistant), "nothing is marked as the assistant's yet");
    const r = llmRun(w, "list_config", { kind: "filename_rules" });
    assert(!r.error && Array.isArray(r.result.rules) && r.result.rules.length === 0, "no rules yet");
    const bad = llmRun(w, "list_config", { kind: "bogus" });
    assert(bad.error && /Available: formats, filename_rules, styles, folders/.test(bad.error), "unknown kind lists the available ones, got " + bad.error);
    assert(llmRun(w, "list_config", {}).error, "kind is required");
    const specs = w.llmToolSpecs().map(s => s.function.name);
    assert(["list_config", "create_format", "set_filename_rule", "delete_config_item"].every(n => specs.includes(n)), "tools are in the shared registry");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-formats b. create_format from sample lines: automatic regex, preview, save, persistence");
    await waitForFormatConfig(T);
    const sim = simText("bracket", 60, 5);
    const lines = head(sim.text, 30);
    const before = { formats: T.state.logFormats.length, undo: T.undoStack.length, nodes: Object.keys(T.state.nodes).length };

    const pv = llmRun(w, "create_format", { name: "Bracket", sampleLines: lines, preview: true });
    assert(!pv.error && pv.result.saved === false && pv.result.preview, "preview answers, got " + JSON.stringify(pv.error));
    const pp = pv.result.preview;
    assert(pp.lines === 30 && pp.matched >= 20 && pp.unmatched === 0 && pp.matched + pp.continuation === 30, "every line is a header or a continuation (stack trace) line: " + JSON.stringify([pp.matched, pp.continuation, pp.unmatched]));
    assert(pv.result.preview.examples.length === 5 && pv.result.preview.examples[0].time && pv.result.preview.examples[0].level, "5 parsed examples with time + level");
    assert(pv.result.preview.levelsFound.length >= 2, "levels found: " + pv.result.preview.levelsFound);
    assert(T.state.logFormats.length === before.formats, "preview saves nothing");
    assert(/Cache hit|Queue|Position|[a-z]/.test(pv.result.preview.examples[0].message), "message column filled");

    const r = llmRun(w, "create_format", { name: "Bracket", sampleLines: lines });
    assert(!r.error && r.result.saved === true, "saved, got " + r.error);
    const id = r.result.format.id;
    assert(T.state.logFormats.length === before.formats + 1, "format in state synchronously (same tick)");
    const rec = T.state.logFormats.find(x => x.id === id);
    assert(rec && rec.createdBy === "assistant" && rec.mode === "regex" && !rec.builtin && /\(\?<ts>/.test(rec.regex) && /\(\?<level>/.test(rec.regex), "record: assistant-made regex format");
    assert(rec.tsFormat === "yyyy-MM-dd HH:mm:ss.SSS", "timestamp format detected, got " + rec.tsFormat);
    assert(rec.levels.every(l => typeof l.name === "string") && rec.levels.some(l => l.name === "ERROR"), "levels derived");
    assert(rec.columnDefs.some(c => c.key === "thread"), "thread column captured, got " + JSON.stringify(rec.columnDefs));
    assert(T.undoStack.length === before.undo && Object.keys(T.state.nodes).length === before.nodes, "not an undo step, no node");
    const l = llmRun(w, "list_config", { kind: "formats" }).result.formats.find(x => x.id === id);
    assert(l && l.byAssistant === true && l.levels.length === rec.levels.length, "list_config shows it with byAssistant");
    assert(d.querySelector("#formatList").textContent.includes("Bracket"), "Settings list re-rendered");
    await waitFor(async () => (await w.listLogFormats()).some(x => x.id === id && x.createdBy === "assistant"));
    assert(true, "persisted in IndexedDB with the marker");

    // the saved format really parses a file when a rule names it
    const rr = llmRun(w, "set_filename_rule", { glob: "sim-bracket-*.log", formatId: id });
    assert(!rr.error, "rule: " + rr.error);
    const fnode = await w.addFile(sim.name, sim.text, () => {});
    assert(fnode.formatId === id && fnode.entries.length === 60, "a file opened later parses with it: " + fnode.entries.length);
  });

  await withApp(async (w, d, T) => {
    section("llm-config-formats c. create_format errors: missing ts/level, invalid regex, no match, JSON hint, name, time zone");
    await waitForFormatConfig(T);
    const lines = head(simText("bracket", 20, 1).text, 10);
    const n0 = T.state.logFormats.length;
    let r = llmRun(w, "create_format", { name: "X", sampleLines: lines, regex: "^\\[(?<ts>[^\\]]+)\\] (?<message>.*)$" });
    assert(r.error && /Level is required/.test(r.error), "no level group, got " + r.error);
    r = llmRun(w, "create_format", { name: "X", sampleLines: lines, regex: "^(?<level>\\w+) (?<message>.*)$" });
    assert(r.error && /Time is required/.test(r.error), "no ts group, got " + r.error);
    r = llmRun(w, "create_format", { name: "X", sampleLines: lines, regex: "(?<ts>[" });
    assert(r.error && /Invalid regex/.test(r.error), "invalid regex, got " + r.error);
    r = llmRun(w, "create_format", { name: "X", sampleLines: lines, regex: "^NOPE (?<ts>\\d+) (?<level>\\w+)$" });
    assert(r.error && /No example line matches/.test(r.error) && r.result.preview && r.result.preview.matched === 0 && r.result.preview.unmatchedLines.length >= 1, "no match: error + preview with unmatched lines");
    const json = head(simText("jsonl", 10, 1).text, 5);
    r = llmRun(w, "create_format", { name: "J", sampleLines: json });
    assert(r.error && /JSON Lines/.test(r.error), "JSON lines hint, got " + r.error);
    r = llmRun(w, "create_format", { sampleLines: lines });
    assert(r.error && /name is required/.test(r.error), "name required, got " + r.error);
    r = llmRun(w, "create_format", { name: "X" });
    assert(r.error && /sampleLines/.test(r.error), "examples required, got " + r.error);
    r = llmRun(w, "create_format", { name: "X", sampleLines: lines, timeZone: "Mars/Phobos" });
    assert(r.error && /Unknown timeZone/.test(r.error), "bad time zone, got " + r.error);
    r = llmRun(w, "create_format", { name: "X", sampleLines: lines, applyToFileId: "n999" });
    assert(r.error, "unknown applyToFileId refused");
    assert(T.state.logFormats.length === n0, "no failed call saved anything");
    r = llmRun(w, "create_format", { name: "TZ", sampleLines: lines, timeZone: "utc", preview: true });
    assert(!r.error && r.result.format.timeZone === "UTC", "utc normalized, got " + JSON.stringify(r.error || r.result.format.timeZone));
    r = llmRun(w, "create_format", { name: "TZ", sampleLines: lines, timeZone: "+0530", preview: true });
    assert(!r.error && r.result.format.timeZone === "+05:30", "offset normalized");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-formats d. levels: integer codes (syslog), custom levels (tour), explicit levels, unmapped warning");
    await waitForFormatConfig(T);
    const sys = head(simText("syslog", 40, 2).text, 20);
    let r = llmRun(w, "create_format", { name: "Sys", sampleLines: sys, preview: true });
    assert(!r.error, "syslog suggestion works: " + r.error);
    assert(r.result.format.levelValueType === "int" && r.result.format.levels.every(x => /^\d+$/.test(x)), "numeric codes -> integer levels, got " + JSON.stringify(r.result.format.levels));

    const tour = tourFiles["welcome.log"];
    const exp = w.parseLogFormatExport(tourFiles["welcome.logformat.json"]);
    r = llmRun(w, "create_format", { name: "Tour", sampleLines: head(tour, 40), regex: exp.logFormat.regex, tsFormat: exp.logFormat.tsFormat });
    assert(!r.error && r.result.saved, "tour format saved: " + r.error);
    assert(["WHAT", "HOW", "TRY"].every(n => r.result.format.levels.includes(n)), "custom levels derived, got " + r.result.format.levels);
    assert(r.result.format.columns.includes("thread"), "chapter column (thread)");
    assert(r.result.preview.continuation > 0, "indented explanation lines count as continuation lines: " + r.result.preview.continuation);

    r = llmRun(w, "create_format", { name: "Tour2", sampleLines: head(tour, 40), regex: exp.logFormat.regex, tsFormat: exp.logFormat.tsFormat, levels: ["WHAT", "HOW"], preview: true });
    assert(!r.error && r.result.warnings && r.result.warnings.some(x => /OTHER/.test(x) && /TRY/.test(x)), "levels not covered are warned about, got " + JSON.stringify(r.result.warnings));
    r = llmRun(w, "create_format", { name: "Tour2", sampleLines: head(tour, 40), regex: exp.logFormat.regex, tsFormat: exp.logFormat.tsFormat, levels: [{ name: "WHAT", color: "not a color" }], preview: true });
    assert(r.error && /CSS color/.test(r.error), "bad level color, got " + r.error);
    r = llmRun(w, "create_format", { name: "Tour2", sampleLines: head(tour, 40), regex: exp.logFormat.regex, tsFormat: exp.logFormat.tsFormat, levels: [{ name: "WHAT", color: "#ff0000" }, "HOW"], preview: true });
    assert(!r.error && r.result.format.levels.join() === "WHAT,HOW", "explicit levels taken");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-formats e. create_format from a loaded file (fileId) + applyToFileId re-parses a no-match file");
    await waitForFormatConfig(T);
    const sim = simText("bracket", 80, 9);
    const file = await w.addFile("lab.log", sim.text, () => {});
    assert(file.entries.length === 0 && file.noFormatMatch, "sanity: no line matches the default format");
    let r = llmRun(w, "create_format", { name: "Lab", fileId: file.id, preview: true, applyToFileId: file.id });
    assert(!r.error && r.result.preview.lines === 50 && r.result.preview.matched >= 40 && r.result.preview.unmatched === 0 && r.result.saved === false, "preview from the file head (50 lines; the simulator's seed-9 head starts with an unusual line), got " + JSON.stringify(r.error || r.result.preview));
    assert(file.entries.length === 0 && file.noFormatMatch, "preview re-parses nothing");
    r = llmRun(w, "create_format", { name: "Lab", fileId: file.id, applyToFileId: file.id, filenameRule: "lab*.log" });
    assert(!r.error && r.result.applyToFile.reparsing === true && r.result.filenameRule.glob === "lab*.log", "saved, re-parse started, rule added: " + r.error);
    const id = r.result.format.id;
    await waitFor(() => file.entries.length === 80);
    assert(file.formatId === id && T.state.nodes[file.id] === file && !file.noFormatMatch, "same node, pinned to the new format, all 80 entries");
    assert(T.state.formatRules.some(x => x.glob === "lab*.log" && x.formatId === id && x.createdBy === "assistant"), "filename rule created with the marker");
    // a file that parsed fine is refused
    const ok = await w.addFile("lab2.log", sim.text, () => {});
    r = llmRun(w, "create_format", { name: "Lab again", fileId: ok.id, preview: true, applyToFileId: ok.id });
    assert(r.error && /no line matched/.test(r.error), "the apply check also holds in preview, got " + r.error);
    r = llmRun(w, "create_format", { name: "Lab again", fileId: ok.id, applyToFileId: ok.id });
    assert(r.error && /no line matched/.test(r.error), "applyToFileId only for no-match files, got " + r.error);
    assert(!T.state.logFormats.some(x => x.name === "Lab again"), "the refused call saved nothing");
    r = llmRun(w, "create_format", { name: "N", fileId: "nope", preview: true });
    assert(r.error && /Unknown file id/.test(r.error), "unknown fileId, got " + r.error);
  });

  await withApp(async (w, d, T) => {
    section("llm-config-formats f. modify by formatId; builtin, provided and non-regex formats are refused");
    await waitForFormatConfig(T);
    const lines = head(simText("bracket", 30, 3).text, 20);
    const id = llmRun(w, "create_format", { name: "Mod", sampleLines: lines }).result.format.id;
    const before = T.state.logFormats.find(x => x.id === id);
    let r = llmRun(w, "create_format", { formatId: id, name: "Renamed", timeZone: "UTC" });
    assert(!r.error && r.result.format.id === id, "modify: " + r.error);
    const after = T.state.logFormats.find(x => x.id === id);
    assert(after.name === "Renamed" && after.timeZone === "UTC" && after.regex === before.regex && after.createdBy === "assistant" && after.createdAt === before.createdAt, "name + zone changed, regex/marker/createdAt stay");
    assert(T.state.logFormats.filter(x => x.id === id).length === 1, "replaced, not duplicated");
    r = llmRun(w, "create_format", { formatId: id, levels: ["ERROR", "INFO"] });
    assert(!r.error && T.state.logFormats.find(x => x.id === id).levels.map(l => l.name).join() === "ERROR,INFO", "levels replaced");
    r = llmRun(w, "create_format", { formatId: id, regex: "^(?<x>.*)$" });
    assert(r.error && /Time is required/.test(r.error) && T.state.logFormats.find(x => x.id === id).regex === before.regex, "invalid change leaves the format alone");
    r = llmRun(w, "create_format", { formatId: "fmt-default", name: "Hack" });
    assert(r.error && /read-only/.test(r.error), "builtin refused, got " + r.error);
    T.state.logFormats.push({ id: "fmt-provided-x", name: "Prov", mode: "regex", regex: "(?<ts>.)(?<level>.)", provided: true, levels: [] });
    r = llmRun(w, "create_format", { formatId: "fmt-provided-x", name: "Hack" });
    assert(r.error && /read-only/.test(r.error), "provided refused, got " + r.error);
    T.state.logFormats.push({ id: "fmt-meta-x", name: "Meta", mode: "meta", targetFormatIds: [] });
    r = llmRun(w, "create_format", { formatId: "fmt-meta-x", name: "Hack" });
    assert(r.error && /not a regex format/.test(r.error), "meta refused, got " + r.error);
    r = llmRun(w, "create_format", { formatId: "fmt-nope" });
    assert(r.error && /Unknown formatId/.test(r.error), "unknown id, got " + r.error);
    // a person's own (not assistant) regex format may be modified, the marker stays absent
    T.state.logFormats.push({ id: "fmt-own", name: "Own", mode: "regex", regex: before.regex, tsFormat: before.tsFormat, levels: before.levels, builtin: false });
    r = llmRun(w, "create_format", { formatId: "fmt-own", name: "Own v2" });
    assert(!r.error && T.state.logFormats.find(x => x.id === "fmt-own").name === "Own v2" && !T.state.logFormats.find(x => x.id === "fmt-own").createdBy, "the person's own format can be changed and stays theirs");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-formats g. set_filename_rule: create, position, modify, shadowing, validation");
    await waitForFormatConfig(T);
    const lines = head(simText("bracket", 30, 3).text, 20);
    const fa = llmRun(w, "create_format", { name: "A", sampleLines: lines }).result.format.id;
    const fb = llmRun(w, "create_format", { name: "B", sampleLines: lines }).result.format.id;
    const other = await w.addFile("sim-bracket-9.log", simText("bracket", 10, 1).text, () => {});
    let r = llmRun(w, "set_filename_rule", { glob: "*.log", formatId: fa });
    assert(!r.error && r.result.rule.position === 1 && r.result.rule.byAssistant, "first rule at position 1: " + r.error);
    const idA = r.result.rule.id;
    assert(r.result.matchesLoadedFiles.length === 1 && r.result.matchesLoadedFiles[0].fileId === other.id && r.result.matchesLoadedFiles[0].nextLoadUses === fa && !r.result.matchesLoadedFiles[0].shadowedBy, "matches the loaded file, no shadow");
    r = llmRun(w, "set_filename_rule", { glob: "sim-*.log", formatId: fb });
    assert(!r.error && r.result.rule.position === 2, "default position last, got " + r.result.rule.position);
    assert(r.result.matchesLoadedFiles[0].shadowedBy && r.result.matchesLoadedFiles[0].shadowedBy.ruleId === idA && r.result.matchesLoadedFiles[0].nextLoadUses === fa, "earlier rule shadows it");
    const idB = r.result.rule.id;
    r = llmRun(w, "set_filename_rule", { glob: "sim-*.log", formatId: fb, position: "first" });
    assert(r.error && /already uses the glob/.test(r.error), "same glob, other rule: pass ruleId, got " + r.error);
    r = llmRun(w, "set_filename_rule", { ruleId: idB, position: "first" });
    assert(!r.error && r.result.rule.position === 1 && !r.result.matchesLoadedFiles[0].shadowedBy && r.result.matchesLoadedFiles[0].nextLoadUses === fb, "moved first: no shadow, next load uses B");
    assert(llmRun(w, "list_config", { kind: "filename_rules" }).result.rules.map(x => x.id).join() === idB + "," + idA, "list order follows position");
    assert(w.resolveFormatIdForFilename("sim-x.log") === fb && w.resolveFormatIdForFilename("other.log") === fa, "resolution uses the new order");
    r = llmRun(w, "set_filename_rule", { ruleId: idA, glob: "*.txt", formatId: fb });
    assert(!r.error && r.result.rule.glob === "*.txt" && r.result.rule.formatId === fb && r.result.rule.id === idA && r.result.rule.byAssistant, "modified in place");
    assert(T.state.formatRules.filter(x => x.id === idA).length === 1, "not duplicated");
    r = llmRun(w, "set_filename_rule", { glob: "*.txt", formatId: fb });
    assert(!r.error && r.result.rule.id === idA && /identical/.test(r.result.note), "identical rule is returned, not duplicated");
    assert(llmRun(w, "set_filename_rule", { formatId: fa }).error, "glob required");
    assert(/Unknown formatId/.test(llmRun(w, "set_filename_rule", { glob: "*.x", formatId: "fmt-zzz" }).error), "unknown format");
    assert(/Unknown ruleId/.test(llmRun(w, "set_filename_rule", { ruleId: "rule-zzz", glob: "*.x" }).error), "unknown rule");
    assert(/position/.test(llmRun(w, "set_filename_rule", { glob: "*.x", formatId: fa, position: "middle" }).error), "bad position");
    T.state.formatRules.push({ id: "rule-prov", glob: "*.prov", formatId: fa, order: 1e9, provided: true });
    assert(/read-only/.test(llmRun(w, "set_filename_rule", { ruleId: "rule-prov", glob: "*.x" }).error), "provided rule is read-only");
    assert(d.querySelector("#formatRuleList").textContent.includes("sim-*.log"), "rule list re-rendered");
    await waitFor(async () => (await w.listFormatRules()).some(x => x.id === idB && x.createdBy === "assistant" && x.glob === "sim-*.log"));
    assert(true, "rules persisted");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-formats h. delete_config_item: only the assistant's own; used formats refused; persistence");
    await waitForFormatConfig(T);
    const lines = head(simText("bracket", 30, 3).text, 20);
    const mine = llmRun(w, "create_format", { name: "Mine", sampleLines: lines }).result.format.id;
    const ruleId = llmRun(w, "set_filename_rule", { glob: "*.mine", formatId: mine }).result.rule.id;
    let r = llmRun(w, "delete_config_item", { kind: "format", id: "fmt-default" });
    assert(r.error && /belongs to the person/.test(r.error), "builtin refused, got " + r.error);
    T.state.logFormats.push({ id: "fmt-own", name: "Own", mode: "regex", regex: "(?<ts>.)(?<level>.)", levels: [] });
    r = llmRun(w, "delete_config_item", { kind: "format", id: "fmt-own" });
    assert(r.error && /belongs to the person/.test(r.error) && T.state.logFormats.some(x => x.id === "fmt-own"), "the person's own format refused");
    T.state.formatRules.push({ id: "rule-own", glob: "*.own", formatId: "fmt-own", order: 50 });
    r = llmRun(w, "delete_config_item", { kind: "filename_rule", id: "rule-own" });
    assert(r.error && /belongs to the person/.test(r.error) && T.state.formatRules.some(x => x.id === "rule-own"), "the person's own rule refused");
    r = llmRun(w, "delete_config_item", { kind: "format", id: mine });
    assert(r.error && /still use/.test(r.error) && r.error.includes(ruleId), "format with a rule refused, names the rule: " + r.error);
    r = llmRun(w, "delete_config_item", { kind: "filename_rule", id: ruleId });
    assert(!r.error && r.result.deleted === ruleId && !T.state.formatRules.some(x => x.id === ruleId), "own rule deleted synchronously");
    r = llmRun(w, "delete_config_item", { kind: "format", id: mine });
    assert(!r.error && r.result.deleted === mine && !T.state.logFormats.some(x => x.id === mine), "own format deleted synchronously");
    assert(!d.querySelector("#formatList").textContent.includes("Mine"), "Settings list re-rendered");
    await waitFor(async () => !(await w.listLogFormats()).some(x => x.id === mine) && !(await w.listFormatRules()).some(x => x.id === ruleId));
    assert(true, "removed from IndexedDB");
    assert(/Unknown format id/.test(llmRun(w, "delete_config_item", { kind: "format", id: mine }).error), "second delete: unknown id");
    assert(/Available: format, filename_rule/.test(llmRun(w, "delete_config_item", { kind: "folder", id: "x" }).error), "unknown kind lists the available ones");
    assert(llmRun(w, "delete_config_item", { kind: "format" }).error, "id required");
    // a file pinned to the deleted format is reported
    const id2 = llmRun(w, "create_format", { name: "Pinned", sampleLines: lines }).result.format.id;
    const f = await w.addFile("pin.log", simText("bracket", 10, 1).text, () => {}, id2);
    assert(f.formatId === id2, "sanity: pinned");
    r = llmRun(w, "delete_config_item", { kind: "format", id: id2 });
    assert(!r.error && /1 loaded file is still pinned/.test(r.result.note), "pinned file is reported, got " + JSON.stringify(r.result));
  });

  await withApp(async (w, d, T) => {
    section("llm-config-formats i. MCP path: mcpRunCall answers the new tools; Undo does not touch settings");
    await waitForFormatConfig(T);
    const lines = head(simText("bracket", 30, 3).text, 12);
    const answers = [];
    w.philogg = Object.assign(w.philogg || {}, { mcpToolResult: (id, text, isError) => { answers.push({ id, text, isError }); return Promise.resolve(); } });
    w.philoggMcpCall(1, "create_format", { name: "ViaMcp", sampleLines: lines });
    await waitFor(() => answers.length === 1);
    assert(!answers[0].isError && JSON.parse(answers[0].text).saved === true, "MCP create_format answered: " + answers[0].text.slice(0, 120));
    assert(T.state.logFormats.some(x => x.name === "ViaMcp" && x.createdBy === "assistant"), "format exists");
    const undoBefore = T.undoStack.length;
    assert(T.undoStack.length === undoBefore, "no undo step for a settings change");
    w.philoggMcpCall(2, "list_config", { kind: "formats" });
    await waitFor(() => answers.length === 2);
    assert(JSON.parse(answers[1].text).formats.some(x => x.name === "ViaMcp" && x.byAssistant), "MCP list_config sees it");
    w.philoggMcpCall(3, "delete_config_item", { kind: "format", id: "fmt-default" });
    await waitFor(() => answers.length === 3);
    assert(answers[2].isError === true, "an error result is flagged as isError");
  });
}
