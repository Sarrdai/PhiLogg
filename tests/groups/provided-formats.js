// GROUP provided-formats — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP provided-formats — FEATURE_BACKLOG #105 phase 1+2: formats shipped as
   *.logformat.json files (hosted: formats/index.json + files fetched at boot;
   desktop: window.__PHILOGG_PROVIDED_FORMATS__ injected by the wrapper) form
   a read-only, in-memory layer: stable ids, a "Provided" tag, Duplicate
   instead of Edit/Delete, rules ranked after the user's own, never written
   to IndexedDB, meta formats by target name, ensureSessionLogFormat reuses
   them. Origin: 2026-10-07 (person-requested, round 4). */
group("provided-formats");

const PF_DIR = path.join(__dirname, "..", "examples", "formats");
const pfExample = n => fs.readFileSync(path.join(PF_DIR, n), "utf8");
const pfFile = (name, patterns) => JSON.stringify({ format: "philogg-log-format", version: 1,
  logFormat: { name, mode: "regex", pattern: "", regex: "^(?<ts>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) (?<level>[A-Z]+) (?<message>.*)$", tsFormat: "yyyy-MM-dd HH:mm:ss", levels: ["ERROR", "WARN", "INFO", "DEBUG"] },
  fileNamePatterns: patterns || [] });
const PF_SITE = {
  "formats/index.json": JSON.stringify(["app-log.logformat.json", "syslog-rfc5424.logformat.json", "app-syslog-meta.logformat.json", "team.logformat.json", "broken.logformat.json", "missing.logformat.json", "bad-meta.logformat.json"]),
  "formats/app-log.logformat.json": pfExample("app-log.logformat.json"),
  "formats/syslog-rfc5424.logformat.json": pfExample("syslog-rfc5424.logformat.json"),
  "formats/app-syslog-meta.logformat.json": pfExample("app-syslog-meta.logformat.json"),
  "formats/team.logformat.json": pfFile("Team log", ["team-*.log", "*.prov.log"]),
  "formats/broken.logformat.json": "{ not json",
  "formats/bad-meta.logformat.json": JSON.stringify({ format: "philogg-log-format", version: 1, logFormat: { name: "Bad meta", mode: "meta", targetFormatNames: ["Team log", "Nope"] } }),
};
// A fetch stub over a path -> text map; anything else is a 404.
const pfFetch = (map, calls) => url => {
  if (calls) calls.push(String(url));
  const key = decodeURIComponent(String(url));
  return Promise.resolve(key in map
    ? { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(map[key])), text: () => Promise.resolve(map[key]) }
    : { ok: false, status: 404, json: () => Promise.reject(new Error("404")), text: () => Promise.resolve("") });
};
const pfRows = d => [...d.querySelectorAll("#formatList .filter-library-row")];
const pfRow = (d, name) => pfRows(d).find(r => r.querySelector(".filter-library-row-name").textContent.startsWith(name));
const pfBtns = row => [...row.querySelectorAll("button")].map(b => b.textContent.trim() || b.title);

{
  const idb = new IDBFactory();
  await withApp(async (w, d, T) => {
    section("provided-formats a. Hosted route: index + files fetched at boot, stable ids, meta by name, invalid files skipped with a notice");
    await T.formatConfigReady;
    const byId = id => T.state.logFormats.find(f => f.id === id);
    const ids = T.state.logFormats.map(f => f.id).sort();
    assert(ids.join(",") === "fmt-default,fmt-provided-app-log,fmt-provided-app-syslog-meta,fmt-provided-syslog-rfc5424,fmt-provided-team", "default + the 4 valid provided formats with stable ids, got " + ids);
    const app = byId("fmt-provided-app-log");
    assert(app.provided === true && app.name === "App log (log4net-style)" && !app.builtin && /formats\/app-log\.logformat\.json$/.test(app.providedSource), "provided flag, name and source recorded, got " + app.providedSource);
    const meta = byId("fmt-provided-app-syslog-meta");
    assert(meta.mode === "meta" && meta.targetFormatIds.join(",") === "fmt-provided-app-log,fmt-provided-syslog-rfc5424", "the meta format's targetFormatNames resolve to the provided target ids, got " + meta.targetFormatIds);
    assert(T.state.providedSkipped.map(s => s.name).sort().join(",") === "bad-meta.logformat.json,broken.logformat.json,missing.logformat.json", "invalid JSON, a 404 file and an unresolved meta target are skipped, got " + JSON.stringify(T.state.providedSkipped));
    fireClick(d.querySelector("#btnSettings"), w);
    const notice = d.querySelector("#formatProvidedNotice").textContent;
    assert(notice.includes("broken.logformat.json") && notice.includes("bad-meta.logformat.json") && notice.includes('"Nope"'), "Settings → Log Formats names each skipped file with its reason, got " + notice);
    assert(d.querySelectorAll("#formatProvidedNotice > div").length === 3, "one line per skipped file");

    section("provided-formats b. Read-only UI: Provided tag + tooltip, Duplicate/Export only, guards refuse Edit/Delete/Reset");
    const row = pfRow(d, "App log");
    const tag = row.querySelector(".link-target-label");
    assert(tag && tag.textContent === "Provided" && tag.title.includes("app-log.logformat.json"), "a Provided tag whose tooltip names the source");
    assert(pfBtns(row).join("|") === "Duplicate|Export", "provided regex format: Duplicate and Export, no Edit/Delete/Reset, got " + pfBtns(row));
    assert(pfBtns(pfRow(d, "App + Syslog")).join("|") === "Duplicate", "provided meta format: Duplicate only");
    assert(!pfRow(d, "Default").querySelector(".link-target-label + .link-target-label"), "the builtin default is not tagged Provided");
    const before = T.state.logFormats.length;
    w.openFormatEditDialog("fmt-provided-app-log");
    assert(!isVisible(d.querySelector("#formatDialog"), w), "openFormatEditDialog refuses a provided format");
    await w.removeLogFormat("fmt-provided-app-log");
    await w.removeLogFormat("fmt-provided-team");
    assert(T.state.logFormats.length === before, "removeLogFormat refuses provided formats");
    assert(w.serializeLogFormatExport("fmt-provided-app-log").logFormat.name === "App log (log4net-style)", "a provided format can still be exported");

    section("provided-formats c. Rules: ranked after user rules, read-only, never part of a swap");
    const prov = T.state.formatRules.filter(r => r.provided);
    assert(prov.length === 2 && prov.every(r => r.formatId === "fmt-provided-team" && r.order >= 1e9 && /^rule-provided-team-\d$/.test(r.id)), "the file's patterns become provided rules with order >= 1e9, got " + JSON.stringify(prov));
    assert(w.resolveFormatIdForFilename("team-1.log") === "fmt-provided-team", "a provided rule resolves a matching file name");
    w.openFormatRuleEditDialog(null);
    d.querySelector("#formatRuleGlob").value = "*.prov.log";
    d.querySelector("#formatRuleFormatSelect").value = "fmt-provided-app-log";
    fireClick(d.querySelector("#formatRuleEditSave"), w);
    await waitFor(() => T.state.formatRules.some(r => r.glob === "*.prov.log" && !r.provided));
    const u1 = T.state.formatRules.find(r => r.glob === "*.prov.log" && !r.provided);
    assert(u1.order === 0, "a new user rule gets order 0, not 1e9+1, got " + u1.order);
    assert(w.resolveFormatIdForFilename("x.prov.log") === "fmt-provided-app-log", "the user rule outranks the provided rule for the same glob (user rules can point to provided formats)");
    w.openFormatRuleEditDialog(null);
    d.querySelector("#formatRuleGlob").value = "second-*.log";
    d.querySelector("#formatRuleFormatSelect").value = "fmt-default";
    fireClick(d.querySelector("#formatRuleEditSave"), w);
    await waitFor(() => T.state.formatRules.some(r => r.glob === "second-*.log"));
    const orders0 = prov.map(r => r.order).join(",");
    await w.moveFormatRuleOrder(T.state.formatRules.find(r => r.glob === "second-*.log").id, 1);
    await w.moveFormatRuleOrder(u1.id, -1);
    assert(prov.map(r => r.order).join(",") === orders0, "moving user rules never touches a provided rule's order");
    const ruleRows = [...d.querySelectorAll("#formatRuleList .filter-library-row")];
    assert(ruleRows.length === 4, "the rule list shows user and provided rules, got " + ruleRows.length);
    const provRuleRow = ruleRows[3];
    assert(provRuleRow.textContent.includes("Provided") && pfBtns(provRuleRow).length === 0, "a provided rule row has a tag and no buttons, got " + pfBtns(provRuleRow));
    const lastUser = ruleRows[1];
    assert(lastUser.querySelector('button[title="Move down"]').disabled, "the last user rule cannot move down into the provided ones");
    const nRules = T.state.formatRules.length;
    await w.removeFormatRule(prov[0].id);
    w.openFormatRuleEditDialog(prov[0].id);
    assert(T.state.formatRules.length === nRules && d.querySelector("#formatRuleEditPanel").classList.contains("hidden"), "removeFormatRule/openFormatRuleEditDialog refuse a provided rule");

    section("provided-formats d. Duplicate creates an editable own copy; the original stays");
    const dup = [...pfRow(d, "Team log").querySelectorAll("button")].find(b => b.textContent === "Duplicate");
    fireClick(dup, w);
    const dlg = d.querySelector("#formatDialog");
    assert(isVisible(dlg, w) && d.querySelector("#formatEditTitle").textContent === "Duplicate log format", "Duplicate opens the format dialog as a duplicate");
    assert(d.querySelector("#formatEditName").value === "Team log (copy)", "prefilled name gets a (copy) suffix, got " + d.querySelector("#formatEditName").value);
    assert(d.querySelector("#formatEditRegex").value.includes("(?<ts>"), "...and the regex");
    const boxes = [...d.querySelectorAll("#formatEditImportRules input[type=checkbox]")];
    assert(boxes.length === 2 && boxes[0].checked && !boxes[1].checked, "team-*.log is offered checked, *.prov.log unchecked (a user rule owns it), got " + boxes.map(b => b.checked));
    const nFormats = T.state.logFormats.length;
    fireClick(d.querySelector("#formatEditSave"), w);
    await waitFor(() => T.state.logFormats.length === nFormats + 1);
    const copy = T.state.logFormats.find(f => f.name === "Team log (copy)");
    assert(copy && !copy.provided && copy.id.startsWith("fmt-") && !copy.id.startsWith("fmt-provided") && copy.regex === byId("fmt-provided-team").regex, "an own, non-provided copy with the same definition");
    assert(T.state.formatRules.some(r => !r.provided && r.glob === "team-*.log" && r.formatId === copy.id) && w.resolveFormatIdForFilename("team-9.log") === copy.id, "the checked pattern became a user rule that outranks the provided one");
    assert(pfBtns(pfRow(d, "Team log (copy)")).includes("Edit") && pfBtns(pfRow(d, "Team log (copy)")).includes("Delete format"), "the copy has Edit and a delete button");
    const metaDup = [...pfRow(d, "App + Syslog").querySelectorAll("button")][0];
    fireClick(metaDup, w);
    assert(isVisible(dlg, w) && d.querySelector("#formatEditName").value === "App + Syslog (meta) (copy)", "Duplicate also works for a meta format");
    fireClick(d.querySelector("#formatEditCancel"), w);

    section("provided-formats e. ensureSessionLogFormat reuses an identical provided format instead of copying it");
    const n0 = T.state.logFormats.length;
    const same = JSON.parse(PF_SITE["formats/team.logformat.json"]).logFormat;
    assert(await w.ensureSessionLogFormat(same) === "fmt-provided-team", "a session record whose logFormat equals the provided one resolves to it");
    assert(T.state.logFormats.length === n0, "...without creating an own copy");

    section("provided-formats f. Nothing provided reaches IndexedDB");
    const stored = await w.listLogFormats();
    const storedRules = await w.listFormatRules();
    assert(!stored.some(f => f.provided || /^fmt-provided/.test(f.id)), "the logFormats store holds no provided record, got " + stored.map(f => f.id));
    assert(!storedRules.some(r => r.provided) && storedRules.length === 3, "the formatRules store holds only the 3 user rules, got " + storedRules.map(r => r.id));
  }, { indexedDB: idb, beforeParse(win) { delete win.__PHILOGG_PROVIDED_FORMATS__; win.fetch = pfFetch(PF_SITE); } });

  await withApp(async (w, d, T) => {
    section("provided-formats g. Reload: files are re-read; a file that is gone takes its format with it; own data survives");
    await T.formatConfigReady;
    assert(T.state.logFormats.every(f => !f.provided) && T.state.logFormats.some(f => f.name === "Team log (copy)"), "without the files only own formats remain (the copy persisted)");
    assert(T.state.formatRules.every(r => !r.provided) && T.state.providedSkipped.length === 0, "no provided rules and no notice for a silent 404 index");
    assert(w.findLogFormat("fmt-provided-team") === undefined, "a pin to the vanished provided format finds no format (falls back like a deleted one)");
    fireClick(d.querySelector("#btnSettings"), w);
    assert(d.querySelector("#formatProvidedNotice").textContent === "" , "no skipped notice");
  }, { indexedDB: idb, beforeParse(win) { delete win.__PHILOGG_PROVIDED_FORMATS__; win.fetch = pfFetch({}); } });
}

await withApp(async (w, d, T) => {
  section("provided-formats h. Silent failures: a throwing fetch and a non-array index mean no provided formats and no notice");
  await T.formatConfigReady;
  assert(T.state.logFormats.length === 1 && T.state.providedSkipped.length === 0, "throwing fetch: only fmt-default, nothing skipped");
}, { beforeParse(win) { delete win.__PHILOGG_PROVIDED_FORMATS__; win.fetch = () => Promise.reject(new Error("offline")); } });
await withApp(async (w, d, T) => {
  await T.formatConfigReady;
  assert(T.state.logFormats.length === 1 && T.state.providedSkipped.length === 0, "an index that is not an array is ignored silently");
}, { beforeParse(win) { delete win.__PHILOGG_PROVIDED_FORMATS__; win.fetch = pfFetch({ "formats/index.json": '{"a":1}' }); } });
await withApp(async (w, d, T) => {
  await T.formatConfigReady;
  assert(T.state.logFormats.length === 1, "no fetch stub at all (jsdom): still booted, no provided formats");
}, { beforeParse(win) { delete win.__PHILOGG_PROVIDED_FORMATS__; } });

{
  const calls = [];
  await withApp(async (w, d, T) => {
    section("provided-formats i. The wrapper's injected list wins over the hosted fetch");
    await T.formatConfigReady;
    assert(calls.length === 0, "fetch is not called when the list is injected, got " + calls);
    const ids = T.state.logFormats.map(f => f.id).sort().join(",");
    assert(ids === "fmt-default,fmt-provided-from-disk,fmt-provided-meta-x,fmt-provided-second", "injected formats get ids from their file names, got " + ids);
    const f = T.state.logFormats.find(x => x.id === "fmt-provided-from-disk");
    assert(f.providedSource === "C:\\ProgramData\\PhiLogg\\formats\\from-disk.logformat.json", "source comes from the injected entry");
    assert(T.state.providedSkipped.length === 1 && T.state.providedSkipped[0].name === "junk.logformat.json", "an injected file with invalid JSON is skipped with a notice entry");
    assert(T.state.logFormats.find(x => x.id === "fmt-provided-meta-x").targetFormatIds.length === 2, "meta by name works for the injected route too (targets: provided + builtin-named own formats)");
  }, { url: "https://example.test/philogg.html", beforeParse(win) {
    win.fetch = pfFetch(PF_SITE, calls);
    win.__PHILOGG_PROVIDED_FORMATS__ = [
      { name: "from-disk.logformat.json", source: "C:\\ProgramData\\PhiLogg\\formats\\from-disk.logformat.json", text: pfFile("From disk", ["disk-*.log"]) },
      { name: "second.logformat.json", source: "C:\\x\\second.logformat.json", text: pfFile("Second", []) },
      { name: "meta-x.logformat.json", source: "C:\\x\\meta-x.logformat.json", text: JSON.stringify({ format: "philogg-log-format", version: 1, logFormat: { name: "Meta X", mode: "meta", targetFormatNames: ["From disk", "Second"] } }) },
      { name: "junk.logformat.json", source: "C:\\x\\junk.logformat.json", text: "nope" },
    ];
  } });
}
