// GROUP meta-format-export — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP meta-format-export — FEATURE_BACKLOG.md #133: a meta format has an
   Export button and exports as a bundle (the meta + all its target formats,
   `targetFormats`); importing resolves each target (identical stored format
   reused, else created, name clash -> " (2)"), then opens the format dialog
   prefilled for the meta. Cancel removes the targets the import created.
   Data: the log simulator's `mixed` format (default + syslog lines).
   ============================================================ */
group("meta-format-export");

// The simulator's own syslog format definition (what `mixed` data needs).
const addSimSyslog = T => {
  const fmt = Object.assign({ id: "fmt-sim-syslog", builtin: false, edited: false, createdAt: 0 }, LOGSIM.formatExport("mixed").logFormat);
  T.state.logFormats.push(fmt);
  return fmt;
};

await withApp(async (w, d, T) => {
  section("meta-format-export a. Export button, bundle shape, unique target names");
  await waitForFormatConfig(T);
  const captured = [];
  w.downloadBlobFallback = (blob, name) => { const e = { name, json: null }; captured.push(e); blob.text().then(t => { e.json = t; }); };
  const syslog = addSimSyslog(T);
  const DEF = T.state.logFormats.find(f => f.id === "fmt-default").name;
  const meta = { id: "fmt-test-meta", name: "Mixed meta", mode: "meta", targetFormatIds: ["fmt-sim-syslog", "fmt-default"], encoding: "utf-8", builtin: false, edited: false, createdAt: 1 };
  T.state.logFormats.push(meta);
  T.state.formatRules.push({ id: "rule-m", order: 0, createdAt: 0, glob: "mixed-*.log", formatId: meta.id });
  w.renderFormatList();
  const rowFor = name => [...d.querySelectorAll("#formatList .filter-library-row")].find(r => r.querySelector(".filter-library-row-title").textContent === name);
  const exportBtn = [...rowFor("Mixed meta").querySelectorAll("button")].find(b => b.textContent === "Export");
  assert(!!exportBtn, "a meta-format row has an Export button");
  fireClick(exportBtn, w);
  await waitFor(() => captured.length === 1 && captured[0].json !== null);
  const file = JSON.parse(captured[0].json);
  assert(captured[0].name.endsWith(".logformat.json"), "same file suffix as ordinary formats, got " + captured[0].name);
  assert(file.format === "philogg-log-format" && file.logFormat.mode === "meta" && file.logFormat.name === "Mixed meta", "meta bundle in the log-format file shape");
  assert(file.logFormat.encoding === "utf-8", "the meta's own encoding is exported");
  assert(file.fileNamePatterns.join() === "mixed-*.log", "the meta's own filename rules are exported, got " + file.fileNamePatterns);
  assert(file.targetFormats.length === 2 && file.targetFormats[0].name === syslog.name && file.targetFormats[1].name === DEF, "targetFormats in target order");
  assert(file.logFormat.targetFormatNames.join("|") === file.targetFormats.map(t => t.name).join("|"), "targetFormatNames match the targets");
  assert(file.targetFormats.every(t => !("id" in t) && !("targetFormatIds" in t)) && !("fileNamePatterns" in file.targetFormats[0]), "targets carry definitions only (no id, no filename rules)");

  // Two targets sharing a name are disambiguated deterministically.
  T.state.logFormats.push(Object.assign(w.JSON.parse(JSON.stringify(syslog)), { id: "fmt-syslog-twin", messageVisible: false }));
  meta.targetFormatIds = ["fmt-sim-syslog", "fmt-syslog-twin", "fmt-default"];
  const dup = w.serializeLogFormatExport(meta.id);
  assert(dup.targetFormats.map(t => t.name).join("|") === [syslog.name, syslog.name + " (2)", DEF].join("|"), "a repeated target name gets ' (2)', got " + dup.targetFormats.map(t => t.name));
  assert(dup.logFormat.targetFormatNames.join("|") === dup.targetFormats.map(t => t.name).join("|"), "...in targetFormatNames too");
  meta.targetFormatIds = ["fmt-sim-syslog"];
  assert(w.serializeLogFormatExport(meta.id) === null, "a meta with fewer than 2 resolvable targets exports nothing");
}, { demoFormats: true });

await withApp(async (w, d, T) => {
  section("meta-format-export b. round trip: wipe, import, targets recreated or reused, mixed file splits");
  await waitForFormatConfig(T);
  const syslog = addSimSyslog(T);
  const DEF = T.state.logFormats.find(f => f.id === "fmt-default").name;
  const meta = { id: "fmt-test-meta", name: "Mixed meta", mode: "meta", targetFormatIds: ["fmt-sim-syslog", "fmt-default"], encoding: "utf-8", builtin: false, edited: false, createdAt: 1 };
  T.state.logFormats.push(meta);
  T.state.formatRules.push({ id: "rule-m", order: 0, createdAt: 0, glob: "mixed-*.log", formatId: meta.id });
  const json = JSON.stringify(w.serializeLogFormatExport(meta.id));
  // Wipe (as on another machine): the meta, its rule and the syslog target.
  T.state.logFormats = T.state.logFormats.filter(f => f.id !== meta.id && f.id !== syslog.id);
  T.state.formatRules.length = 0;
  const before = T.state.logFormats.length;
  const dlg = d.querySelector("#formatDialog");

  assert(w.importLogFormatText(json) === true, "the bundle is accepted by the central log-format import");
  assert(isVisible(dlg, w), "the format dialog opens");
  assert(T.state.logFormats.length === before + 1, "the missing syslog target is created, Default is reused, got +" + (T.state.logFormats.length - before));
  const newSys = T.state.logFormats.find(f => f.name === syslog.name);
  assert(newSys && newSys.id !== syslog.id && !newSys.builtin && newSys.regex === syslog.regex, "the created target has a fresh id and the exported definition");
  assert(d.querySelector("#formatEditTitle").textContent === "Import log format", "dialog says import");
  assert(d.querySelector("#formatEditName").value === "Mixed meta", "meta name prefilled");
  const targetNames = [...d.querySelectorAll("#formatEditMetaTargets .format-level-name")].map(e => e.textContent);
  assert(targetNames.join("|") === syslog.name + "|" + DEF, "targets preselected in order, got " + targetNames);
  assert(isVisible(d.querySelector("#formatEditImportField"), w) && d.querySelectorAll("#formatEditImportRules input[type=checkbox]").length === 1, "the meta's filename pattern is offered like an ordinary import");
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.some(f => f.name === "Mixed meta"));
  const imp = T.state.logFormats.find(f => f.name === "Mixed meta");
  assert(imp.mode === "meta" && imp.targetFormatIds.join() === newSys.id + ",fmt-default" && imp.encoding === "utf-8", "saved meta points at the resolved ids and keeps its encoding");
  assert(T.state.logFormats.some(f => f.id === newSys.id), "saving keeps the created target");
  assert(T.state.formatRules.length === 1 && T.state.formatRules[0].formatId === imp.id && T.state.formatRules[0].glob === "mixed-*.log", "the pattern became a rule for the meta");

  // The simulator's mixed file splits across both targets.
  const text = LOGSIM.generateToStrings({ format: "mixed", scenarios: ["sensors", "basic"], entries: 80, seed: 11 })[0].text;
  const merged = await w.loadMetaFormatText("mixed-1.log", text, imp);
  assert(merged.sources && merged.sources.length === 2, "the mixed file splits into two sources, got " + (merged.sources && merged.sources.length));
  assert(merged.sources.every(s => s.count > 0), "both grammars produced entries");

  section("meta-format-export c. identical targets are reused: importing again creates nothing");
  const count = T.state.logFormats.length;
  w.importLogFormatText(json);
  assert(isVisible(dlg, w) && T.state.logFormats.length === count, "no duplicate target formats on a second import");
  const ids = [...d.querySelectorAll("#formatEditMetaTargets .format-level-name")].map(e => e.textContent);
  assert(ids.join("|") === syslog.name + "|" + DEF, "targets still preselected");
  fireClick(d.querySelector("#formatEditCancel"), w);
  assert(T.state.logFormats.length === count, "Cancel leaves everything in place");
}, { demoFormats: true });

await withApp(async (w, d, T) => {
  section("meta-format-export d. name clash -> suffixed new format; Cancel leaves no orphans");
  await waitForFormatConfig(T);
  const syslog = addSimSyslog(T);
  const DEF = T.state.logFormats.find(f => f.id === "fmt-default").name;
  const meta = { id: "fmt-test-meta", name: "Mixed meta", mode: "meta", targetFormatIds: ["fmt-sim-syslog", "fmt-default"], builtin: false, edited: false, createdAt: 1 };
  T.state.logFormats.push(meta);
  const bundle = w.JSON.parse(JSON.stringify(w.serializeLogFormatExport(meta.id)));
  bundle.targetFormats[0].messageVisible = false; // same name, different definition
  const dlg = d.querySelector("#formatDialog");
  const before = T.state.logFormats.length;
  w.importLogFormatText(JSON.stringify(bundle));
  assert(isVisible(dlg, w) && T.state.logFormats.length === before + 1, "a differing same-named target is created as a new format");
  const clash = T.state.logFormats.find(f => f.name === syslog.name + " (2)");
  assert(clash && clash.id !== syslog.id && clash.messageVisible === false, "its name is suffixed ' (2)', got " + T.state.logFormats.map(f => f.name));
  assert(T.state.logFormats.find(f => f.id === syslog.id).messageVisible !== false, "the existing same-named format is untouched");
  const names = [...d.querySelectorAll("#formatEditMetaTargets .format-level-name")].map(e => e.textContent);
  assert(names[0] === syslog.name + " (2)", "the new format is the preselected target, got " + names);
  fireClick(d.querySelector("#formatEditCancel"), w);
  assert(!isVisible(dlg, w), "Cancel closes the dialog");
  assert(T.state.logFormats.length === before && !T.state.logFormats.some(f => f.id === clash.id), "the target the import created is removed again");
  const stored = await w.listLogFormats();
  assert(!stored.some(f => f.id === clash.id), "...also from the store");
  assert(!T.state.logFormats.some(f => f.name === "Mixed meta" && f.id !== meta.id), "no meta was created");

  section("meta-format-export e. invalid bundles are rejected with a toast, nothing is created");
  const ok = w.JSON.parse(JSON.stringify(w.serializeLogFormatExport(meta.id)));
  const reject = (label, mutate) => {
    const b = w.JSON.parse(JSON.stringify(ok));
    mutate(b);
    const n = T.state.logFormats.length;
    assert(w.parseLogFormatExport(JSON.stringify(b)).error, label + ": parse error");
    assert(w.importLogFormatText(JSON.stringify(b)) === true && !isVisible(dlg, w) && T.state.logFormats.length === n, label + ": no dialog, nothing created");
  };
  reject("one target", b => { b.targetFormats.length = 1; });
  reject("no targetFormats", b => { delete b.targetFormats; });
  reject("invalid target regex", b => { b.targetFormats[0] = { name: "bad", mode: "regex", regex: "(" }; });
  reject("target without name", b => { b.targetFormats[1] = { mode: "regex", regex: "x" }; });
  reject("nested meta target", b => { b.targetFormats[1] = { name: "n", mode: "meta" }; });
}, { demoFormats: true });
