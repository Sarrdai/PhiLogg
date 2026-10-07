// GROUP 70 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 70 — Format Manager: configurable log formats + filename-pattern
   rules (FEATURE_BACKLOG.md "Pluggable parser logic")
   Origin: this session (2026-08-21), person-requested: a Settings menu
   whose first entry is a Format Manager mapping filename patterns (glob)
   to configurable log formats (a log4net/LogViewPlus-style conversion
   pattern, or a raw regex for edge cases), plus a matching pattern field
   in tools/log-simulator.html and a same-shape example file. Every format
   still produces the fixed entry schema; the builtin default is a
   pass-through to the untouched HEADER_RE/parseHeaderLine until edited.
   ============================================================ */
group(70);

await withApp(async (w, d, T) => {
  section("70a. compileFormatPattern / compileDateFormat: pattern-mode compiler");
  const dateFrag = w.compileDateFormat("yyyy-MM-dd HH:mm:ss,SSS");
  assert(dateFrag && dateFrag.order.join(",") === "yyyy,MM,dd,HH,mm,ss,SSS", "compileDateFormat orders its tokens left-to-right");
  assert(dateFrag.matchRegex.test("2024-01-15 10:00:00,123"), "compiled date regex matches a well-formed timestamp");

  const c = w.compileFormatPattern('%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n', "yyyy-MM-dd HH:mm:ss,SSS");
  assert(c && c.regex && c.hasTs, "the canonical default pattern compiles, with a ts group");
  const line = '2024-01-15 10:00:00,123\tINFO\t"main"\tC:\\src\\App.cs\tline 12\t[Startup]\t"Application started"';
  const m = c.regex.exec(line);
  assert(m && m.groups.level === "INFO" && m.groups.thread === "main" && m.groups.method === "Startup" && m.groups.message === "Application started",
    "compiled regex extracts level/thread/method/message correctly, got " + JSON.stringify(m && m.groups));

  // Message is no longer a compile-time requirement (Custom Columns: it
  // gracefully falls back to the whole raw line via applyFormatMatch when
  // ungrouped) — nothing about %d/%p/%m is technically required to compile;
  // Time/Level being the two MANDATORY columns is enforced as a save-time
  // rule in the Format Manager instead (see GROUP 70k).
  const noMsg = w.compileFormatPattern("%d %p", "");
  assert(!noMsg.error && noMsg.hasTs && noMsg.hasLevel,
    "a pattern with %d+%p but no %m/%message compiles fine, message falls back to the raw line");

  const noTsNoLevel = w.compileFormatPattern("%m", "");
  assert(!noTsNoLevel.error && !noTsNoLevel.hasTs && !noTsNoLevel.hasLevel,
    "a pattern with neither %d nor %p also compiles fine — no field is technically required at this level");

  const withEscapes = w.compileFormatPattern("%p\\t%m", "");
  assert(withEscapes.regex && withEscapes.regex.test("INFO\thello"), "\\t in the pattern text becomes a real tab before compiling");

  const withPercent = w.compileFormatPattern("%%literal %m", "");
  assert(withPercent.regex && withPercent.regex.test("%literal hi"), "%% compiles to a literal percent sign");

  const bracket = w.compileFormatPattern("[%d] %p (%t) %m%n", "yyyy-MM-dd HH:mm:ss");
  const bm = bracket.regex.exec("[2024-01-15 10:00:00] ERROR (worker-1) Database connection failed");
  assert(bm && bm.groups.level === "ERROR" && bm.groups.thread === "worker-1" && bm.groups.message === "Database connection failed",
    "a differently-shaped pattern (brackets/parens, no method/location) compiles and extracts correctly");
});

await withApp(async (w, d, T) => {
  section("70b. Regex mode: named-group validation + graceful degrade on a broken format");
  const v1 = w.validateFormatRegex("(unterminated");
  assert(v1.error, "an invalid regex is rejected with an error");

  // Message (and ts) are no longer compile-time requirements — only Level
  // is present here, and that's enough to compile without error; ts's
  // absence still surfaces as the same non-blocking warning as v3 below.
  const v2 = w.validateFormatRegex("^(?<level>\\w+) (?<thread>\\S+)$");
  assert(!v2.error && v2.warning && v2.hasLevel && !v2.hasTs,
    "a regex without a (?<message>...)/(?<ts>...) group compiles fine now — Time/Level mandatory is a save-time rule instead (see GROUP 70k)");

  const v3 = w.validateFormatRegex("^(?<level>\\w+) (?<message>.*)$");
  assert(!v3.error && v3.warning, "missing (?<ts>...) is a non-blocking warning, not a save-blocking error");

  const v4 = w.validateFormatRegex("^(?<ts>\\S+) (?<level>\\w+) (?<message>.*)$");
  assert(!v4.error && !v4.warning, "a regex with both ts and message groups passes cleanly");

  const groups = v4.regex.exec("2024-01-15T10:00:00 ERROR boom").groups;
  const entry = w.applyFormatMatch(groups, "2024-01-15T10:00:00 ERROR boom", null);
  assert(entry.level === "ERROR" && entry.message === "boom", "applyFormatMatch reads named groups into the fixed entry shape");

  // Defense-in-depth: a format whose regex/pattern fails to compile (should
  // only happen if save-time validation was bypassed) degrades to
  // "every line is its own untimestamped entry" instead of throwing.
  const broken = w.compileOneFormat({ id: "x", mode: "regex", regex: "(unterminated", builtin: false, edited: false });
  assert(broken.isHeaderLine("anything"), "a broken format's isHeaderLine never throws and always starts a new entry");
  const e = broken.parseHeader("some raw line");
  assert(e.message === "some raw line" && e.raw === "some raw line", "a broken format's parseHeader degrades to whole-line-as-message");
});

await withApp(async (w, d, T) => {
  section("70c. Glob matcher + filename -> format resolution");
  assert(w.compileGlob("app-*.log").test("app-1.log"), "'*' matches any run of characters");
  assert(w.compileGlob("app-*.log").test("app-prod.log"), "'*' matches a longer run too");
  assert(!w.compileGlob("app-*.log").test("db.log"), "a non-matching filename is rejected");
  assert(w.compileGlob("app-?.log").test("app-1.log"), "'?' matches exactly one character");
  assert(!w.compileGlob("app-?.log").test("app-12.log"), "'?' does not match two characters");
  assert(w.compileGlob("APP-*.LOG").test("app-1.log"), "glob matching is case-insensitive");

  T.state.logFormats = [{ id: "fmt-default", builtin: true, edited: false, name: "d" }, { id: "fmt-a", name: "a" }, { id: "fmt-b", name: "b" }];
  T.state.formatRules = [
    { id: "r1", glob: "*.log", formatId: "fmt-a", order: 1 },
    { id: "r2", glob: "special-*.log", formatId: "fmt-b", order: 0 },
  ];
  assert(w.resolveFormatIdForFilename("special-1.log") === "fmt-b", "the lower-order (earlier) rule wins when multiple rules match");
  assert(w.resolveFormatIdForFilename("plain.log") === "fmt-a", "a filename matching only the later rule still resolves to it");
  assert(w.resolveFormatIdForFilename("other.txt") === "fmt-default", "a filename matching no rule falls back to the default format");
});

await withApp(async (w, d, T) => {
  section("70d. Backward compatibility: unconfigured default format parses exactly as before");
  const f = await w.addFile("plain.log", makeLog(0, 20), () => {});
  assert(f.formatId === "fmt-default", "a freshly loaded file with no rules configured resolves to the builtin default");
  assert(f.entries.length === 20, "entry count matches the fixture");
  assert(f.entries[0].level === "ERROR" && f.entries[1].level === "INFO", "level extraction unchanged");
  assert(f.entries[0].thread === "main", "thread extraction unchanged");
  assert(f.entries[0].method === "DoWork", "method extraction unchanged");
  assert(/Foo\.cs line 0$/.test(f.entries[0].location), "location extraction unchanged, got " + f.entries[0].location);
  assert(f.entries[0].message === "message 0", "message extraction unchanged");
  assert(!isNaN(f.entries[0].ts), "timestamp parses to a valid number");
});

await withApp(async (w, d, T) => {
  section("70e. End-to-end: add a custom format (via the automatic suggestion from a pasted example) + filename rule on the Settings page, then load a matching file");
  await waitForFormatConfig(T);

  fireClick(d.querySelector("#btnSettings"), w);
  assert(!d.querySelector("#settingsDialog").classList.contains("hidden"), "Settings button opens the settings page directly (no intermediate menu)");
  assert(d.querySelector("#settingsMenu") === null, "the old separate Format-Manager dropdown menu no longer exists");

  // 1 initially: just the builtin default (the demo formats are provided
  // files now, not seeded — GROUP provided-formats).
  const formatRows = () => [...d.querySelectorAll("#formatList .filter-library-row")];
  assert(formatRows().length === 1 && formatRows()[0].querySelector(".filter-library-row-name").textContent.includes("Default"),
    "the builtin default format is the only one listed on a fresh boot");
  assert(formatRows()[0].querySelector(".filter-library-row-del") === null, "the builtin default has no delete button");

  const btnAddFormat = d.querySelector("#btnAddFormat");
  assert(btnAddFormat.className === "btn-mini-dashed", "the Add-format button uses the dashed 'add' style, not a filled/outline row-action style, got " + btnAddFormat.className);
  assert(isVisible(btnAddFormat, w), "sanity: the Add-format button is actually visible on screen before anything is clicked");
  fireClick(btnAddFormat, w);
  const dlg = d.querySelector("#formatDialog");
  assert(isVisible(dlg, w), "Add format opens the format dialog (actually rendered, not just missing the 'hidden' class)");
  assert(isVisible(d.querySelector("#settingsDialog"), w), "...on top of Settings, which stays open");
  assert(d.querySelector("#formatEditPanel") === null, "the old inline format panel is gone — the dialog is the one place a format is defined");
  assert(d.querySelector("#formatEditPattern") === null, "...and so is the Pattern field (the dialog writes Regex mode only)");

  // Kind toggle: Meta swaps the whole examples/columns/levels body for the
  // target list — checked via actual computed display.
  assert(isVisible(d.querySelector("#fwzNormalBody"), w) && !isVisible(d.querySelector("#formatEditMetaField"), w),
    "a new format starts as an ordinary log format: examples body shown, meta targets hidden");
  fireClick(d.querySelector("#formatEditModeMeta"), w);
  assert(!isVisible(d.querySelector("#fwzNormalBody"), w) && isVisible(d.querySelector("#formatEditMetaField"), w),
    "Meta hides the examples body and shows the target list");
  fireClick(d.querySelector("#formatEditModeRegex"), w);
  assert(isVisible(d.querySelector("#fwzNormalBody"), w) && !isVisible(d.querySelector("#formatEditMetaField"), w), "switching back restores it");

  // Cancel closes the dialog, no format saved.
  fireClick(d.querySelector("#formatEditCancel"), w);
  assert(!isVisible(dlg, w), "Cancel closes the dialog");
  assert(formatRows().length === 1, "cancelling adds nothing to the format list");

  // Re-open and add one from a pasted example: the automatic suggestion
  // fills the regex + timestamp format and the preview right away.
  fireClick(btnAddFormat, w);
  fwzPaste(w, d, "[2024-01-15 10:00:00] ERROR (worker-1) Database connection failed");
  const regex = d.querySelector("#formatEditRegex").value;
  assert(regex.includes("(?<ts>") && regex.includes("(?<level>") && regex.includes("(?<thread>") && regex.includes("(?<message>"),
    "pasting an example immediately fills in a suggested regex with ts/level/thread/message groups, got " + regex);
  assert(d.querySelector("#formatEditTsFormat").value === "yyyy-MM-dd HH:mm:ss", "...and the matching timestamp format");
  assert(T.fwz.fallbackKind === "suggestion" && T.fwz.marks.length === 0, "...as a suggestion, without any hand marks");
  assert(d.querySelectorAll('#fwzSample .fwz-line[data-line="0"] .fwz-mark.fwz-suggested').length === 4, "the example line shows the suggestion as suggested marks");

  const previewRows = () => [...d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)")];
  assert(previewRows().length === 1, "the live preview parses the pasted example with the suggestion");
  assert(previewRows()[0].textContent.includes("ERROR") && previewRows()[0].textContent.includes("worker-1") && previewRows()[0].textContent.includes("Database connection failed"),
    "the preview shows the extracted level/thread/message, got " + previewRows()[0].textContent);

  d.querySelector("#formatEditName").value = "Bracket format";
  fireClick(d.querySelector("#formatEditSave"), w);
  // saveFormatEdit's IndexedDB write is async and the UI only updates once it
  // resolves — wait for that, not for a fixed 20ms (tests/README.md's rule).
  await waitFor(() => !isVisible(dlg, w));
  assert(!isVisible(dlg, w), "saving closes the dialog");
  assert(formatRows().length === 2, "the new format is now listed alongside the default");

  const newFormat = T.state.logFormats.find(f => f.name === "Bracket format");
  assert(newFormat && newFormat.mode === "regex" && !newFormat.builtin, "new format saved in Regex mode, not builtin");
  assert(newFormat.regex === regex && newFormat.tsFormat === "yyyy-MM-dd HH:mm:ss", "the saved format keeps the suggested regex/tsFormat unchanged (person didn't edit it further)");
  assert(newFormat.columnDefs.map(c => c.key).join(",") === "thread", "only the columns the regex captures are saved (Thread), got " + newFormat.columnDefs.map(c => c.key).join(","));

  const btnAddFormatRule = d.querySelector("#btnAddFormatRule");
  assert(btnAddFormatRule.className === "btn-mini-dashed", "the Add-rule button uses the dashed 'add' style too, got " + btnAddFormatRule.className);
  assert(isVisible(btnAddFormatRule, w), "sanity: the Add-rule button is visible before being clicked");
  fireClick(btnAddFormatRule, w);
  const ruleEditPanel = d.querySelector("#formatRuleEditPanel");
  assert(isVisible(ruleEditPanel, w), "Add rule also embeds inline, actually rendered on screen");
  assert(!isVisible(btnAddFormatRule, w), "the Add-rule button hides while its panel is open");
  d.querySelector("#formatRuleGlob").value = "bracket-*.log";
  d.querySelector("#formatRuleFormatSelect").value = newFormat.id;
  fireClick(d.querySelector("#formatRuleEditSave"), w);
  await waitFor(() => !isVisible(ruleEditPanel, w)); // saveFormatRuleEdit's IndexedDB write is async
  assert(!isVisible(ruleEditPanel, w), "saving closes/collapses the inline rule panel");
  assert(isVisible(btnAddFormatRule, w), "...and the Add-rule button reappears");
  assert(T.state.formatRules.length === 1 && T.state.formatRules[0].glob === "bracket-*.log", "rule saved with the entered glob");

  fireClick(d.querySelector("#settingsClose"), w);
  assert(d.querySelector("#settingsDialog").classList.contains("hidden"), "Close button closes the settings page");

  const bracketLog = [
    "[2024-01-15 10:00:00] ERROR (worker-1) Database connection failed",
    "[2024-01-15 10:00:01] INFO (worker-1) Retrying connection, attempt 2/3",
  ].join("\n") + "\n";
  const f = await w.addFile("bracket-1.log", bracketLog, () => {});
  assert(f.formatId === newFormat.id, "the loaded file resolved to the custom format via the glob rule");
  assert(f.entries.length === 2, "both lines parsed as separate entries");
  assert(f.entries[0].level === "ERROR" && f.entries[0].thread === "worker-1" && f.entries[0].message === "Database connection failed",
    "custom pattern correctly extracts level/thread/message");
  assert(!isNaN(f.entries[0].ts), "timestamp parses under the custom tsFormat");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("70f. Persistence round-trip: save/list/delete formats and rules; delete-while-referenced guard");
  await waitForFormatConfig(T);

  const fmt = { id: "fmt-test", name: "Test format", mode: "pattern", pattern: "%m%n", regex: "", tsFormat: "", builtin: false, edited: false, createdAt: Date.now() };
  await w.saveLogFormat(fmt);
  let stored = await w.listLogFormats();
  assert(stored.some(f => f.id === "fmt-test"), "format persisted to IndexedDB");

  const rule = { id: "rule-test", glob: "*.log", formatId: "fmt-test", order: 0, createdAt: Date.now() };
  await w.saveFormatRule(rule);
  let storedRules = await w.listFormatRules();
  assert(storedRules.some(r => r.id === "rule-test"), "rule persisted to IndexedDB");

  // removeLogFormat/removeFormatRule (the UI-level wrappers) act on
  // in-memory state.logFormats/formatRules, kept in sync with IndexedDB by
  // saveLogFormat/saveFormatRule elsewhere — drive them the same way.
  T.state.logFormats = stored;
  T.state.formatRules = storedRules;

  await w.removeLogFormat("fmt-test");
  assert(T.state.logFormats.some(f => f.id === "fmt-test"), "in-memory: a format still referenced by a rule is not removed");
  const afterGuard = await w.listLogFormats();
  assert(afterGuard.some(f => f.id === "fmt-test"), "IndexedDB: the blocked delete never reached the store");

  await w.removeFormatRule("rule-test");
  assert(!T.state.formatRules.some(r => r.id === "rule-test"), "in-memory: rule removed");
  storedRules = await w.listFormatRules();
  assert(!storedRules.some(r => r.id === "rule-test"), "IndexedDB: rule actually deleted");

  await w.removeLogFormat("fmt-test");
  assert(!T.state.logFormats.some(f => f.id === "fmt-test"), "in-memory: format removable once no rule references it");
  stored = await w.listLogFormats();
  assert(!stored.some(f => f.id === "fmt-test"), "IndexedDB: format actually deleted");

  T.state.logFormats = [{ id: "fmt-default", builtin: true, edited: false, name: "Default" }];
  T.state.formatRules = [];
  await w.removeLogFormat("fmt-default");
  assert(T.state.logFormats.some(f => f.id === "fmt-default"), "the builtin default is never removed, regardless of references");
}, { indexedDB: new IDBFactory() });

section("70g. Session-cache restore keeps a file's format pinned even after its matching rule is later removed");
{
  const factory = new IDBFactory();
  const bracketLog = [
    "[2024-01-15 10:00:00] ERROR (worker-1) Database connection failed",
    "[2024-01-15 10:00:01] INFO (worker-1) Retrying connection, attempt 2/3",
  ].join("\n") + "\n";

  await withApp(async (w, d, T) => {
    await waitForFormatConfig(T);
    const fmt = { id: "fmt-bracket", name: "Bracket", mode: "pattern", pattern: "[%d] %p (%t) %m%n", regex: "", tsFormat: "yyyy-MM-dd HH:mm:ss", builtin: false, edited: false, createdAt: Date.now() };
    await w.saveLogFormat(fmt);
    T.state.logFormats.push(fmt);
    const rule = { id: "rule-bracket", glob: "bracket-*.log", formatId: fmt.id, order: 0, createdAt: Date.now() };
    await w.saveFormatRule(rule);
    T.state.formatRules.push(rule);

    const f = await w.addFile("bracket-1.log", bracketLog, () => {});
    assert(f.formatId === "fmt-bracket", "sanity: file resolved to the custom format via the rule");
    assert(f.entries[0].level === "ERROR" && f.entries[0].thread === "worker-1", "sanity: parsed under the custom format before persisting");
    await w.persistFileNode(f);
    await w.persistMetaNow();

    // Delete the RULE (keep the format definition) so a fresh resolution of
    // this filename would now fall back to the builtin default — proving
    // restore uses the file's own pinned formatId, not live re-resolution.
    await w.removeFormatRule(rule.id); // already updates state.formatRules internally
    assert(w.resolveFormatIdForFilename("bracket-1.log") === "fmt-default", "sanity: fresh resolution now falls back to default (rule gone)");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    await T.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    assert(T.state.rootIds.length === 1, "restore: file came back via boot-time restore");
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.formatId === "fmt-bracket", "restore: file's original formatId is pinned, ignoring the now-deleted rule");
    assert(f.entries.length === 2, "restore: both entries came back");
    assert(f.entries[0].level === "ERROR" && f.entries[0].thread === "worker-1" && f.entries[0].message === "Database connection failed",
      "restore: re-parsed under the ORIGINAL custom format, not the default, got " + JSON.stringify({ level: f.entries[0].level, thread: f.entries[0].thread, message: f.entries[0].message }));
  }, { indexedDB: factory });
}

await withApp(async (w, d, T) => {
  section("70h. Settings page: opens directly (no menu), sections present, closes via Close button / backdrop click, theme control reflects current theme");
  const btnSettings = d.querySelector("#btnSettings");
  const settingsDialog = d.querySelector("#settingsDialog");
  assert(settingsDialog.classList.contains("hidden"), "sanity: settings page starts closed");
  assert(d.querySelector("#btnTheme") === null, "the old dedicated theme toggle button is gone from the toolbar");

  fireClick(btnSettings, w);
  assert(!settingsDialog.classList.contains("hidden"), "clicking the settings button opens the settings page directly");
  assert(d.querySelector(".settings-page-card") !== null, "it renders as a settings-page card, not a small dropdown");
  assert([...d.querySelectorAll(".settings-section-title")].some(el => el.textContent === "Appearance"),
    "an Appearance section is present");
  assert([...d.querySelectorAll(".settings-section-title")].some(el => el.textContent === "Log Formats"),
    "a Log Formats section is present (Format Manager folded into the settings page, not a separate dialog)");

  // Theme mode + slots (GROUP 341): the slot of the effective scheme (dark
  // under the stubbed OS preference) reflects the current theme.
  const themeSelect = d.querySelector("#settingsThemeDarkSelect");
  assert(themeSelect && d.querySelector("#settingsThemeLightSelect") && d.querySelector("#settingsThemeModeRow"),
    "the theme controls (mode + Light/Dark theme slots) are in the Appearance section");
  assert(d.querySelector("#settingsThemeSelect") === null, "the old single theme dropdown is gone");
  assert(themeSelect.value === d.documentElement.getAttribute("data-theme"),
    "the effective slot's select reflects the current theme, got " + themeSelect.value);

  fireClick(d.body, w);
  assert(!settingsDialog.classList.contains("hidden"), "clicking elsewhere on the page does NOT close the settings page (only Close/backdrop do)");

  fireClick(d.querySelector("#settingsClose"), w);
  assert(settingsDialog.classList.contains("hidden"), "the Close button closes the settings page");

  fireClick(btnSettings, w);
  fireClick(settingsDialog, w); // click lands on the backdrop itself, not a descendant
  assert(settingsDialog.classList.contains("hidden"), "clicking the dialog's own backdrop closes it too");
});

await withApp(async (w, d, T) => {
  section("70h2. Settings page: the effective slot's theme select actually switches and persists the theme");
  fireClick(d.querySelector("#btnSettings"), w);
  const themeSelect = d.querySelector("#settingsThemeDarkSelect"); // the effective slot under the stubbed OS preference

  themeSelect.value = "light";
  themeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === "light", "picking Classic Light switches data-theme to light");
  assert(w.localStorage.getItem("philogg-theme-dark") === "light", "theme choice persisted to localStorage (the Dark theme slot)");

  themeSelect.value = "dark";
  themeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === "dark", "picking Classic Dark switches data-theme back to dark");
  assert(w.localStorage.getItem("philogg-theme-dark") === "dark", "theme choice persisted to localStorage (the Dark theme slot)");
});

await withApp(async (w, d, T) => {
  section("70i. appendTailText is format-aware: a tailed file parses new chunks under ITS OWN format, not the global default");
  const bracketFmt = { id: "fmt-bracket-tail", name: "Bracket", mode: "pattern", pattern: "[%d] %p (%t) %m%n", regex: "", tsFormat: "yyyy-MM-dd HH:mm:ss", builtin: false, edited: false, createdAt: Date.now() };
  T.state.logFormats.push(bracketFmt);

  const node = { id: "fake-tail", entries: [], tail: { pending: "" }, formatId: bracketFmt.id };
  const changed = w.appendTailText(node, "[2024-01-15 10:00:05] WARN (main) tail line one\n");
  assert(changed === true, "appendTailText reports a change when a new entry lands");
  assert(node.entries.length === 1, "one entry appended");
  assert(node.entries[0].level === "WARN" && node.entries[0].thread === "main" && node.entries[0].message === "tail line one",
    "the appended entry is parsed under the file's OWN custom format, not the default log4net shape");

  // A second chunk in the SAME custom shape keeps working (not a one-shot fluke).
  w.appendTailText(node, "[2024-01-15 10:00:06] INFO (main) tail line two\n");
  assert(node.entries.length === 2 && node.entries[1].message === "tail line two", "a subsequent chunk parses correctly too");

  // Default-format node (no formatId) still works via appendTailText, proving
  // this codepath's dispatch didn't regress the un-configured case either.
  const defaultNode = { id: "fake-tail-2", entries: [], tail: { pending: "" }, formatId: null };
  w.appendTailText(defaultNode, makeLog(0, 1));
  assert(defaultNode.entries.length === 1 && defaultNode.entries[0].message === "message 0", "a node with no formatId still tails under the builtin default");
});

await withApp(async (w, d, T) => {
  section("70j. Builtin default row: Edit + Reset (not Delete); Reset reverts both the displayed fields AND actual parsing behavior");
  await waitForFormatConfig(T);
  fireClick(d.querySelector("#btnSettings"), w);

  const defaultRow = () => d.querySelector("#formatList .filter-library-row");
  assert(defaultRow().querySelector(".filter-library-row-del") === null, "the builtin default row has no Delete button");
  const resetBtn = () => [...defaultRow().querySelectorAll("button")].find(b => b.textContent === "Reset");
  assert(resetBtn(), "...and has a Reset button in its place");
  assert(resetBtn().className === "btn-mini-outline", "Reset is a lightweight .btn-mini-outline list-row action, got " + resetBtn().className);

  // Sanity: an unedited default parses a normal log4net-shaped file correctly.
  const before = await w.addFile("before.log", makeLog(0, 3), () => {});
  assert(before.entries[1].level === "INFO" && before.entries[1].thread === "main" && before.entries[1].method === "DoWork" && before.entries[1].message === "message 1",
    "sanity: unedited default parses a normal file correctly");

  // Edit the default: rename it and replace the pattern with something that
  // only extracts time+level+message (drops thread/method entirely) — a
  // clearly DIFFERENT, verifiable parse result, not just a cosmetic name
  // change. %d/%p stay present: Time and Level are the two mandatory
  // columns (GROUP 70k) — a pattern missing either is refused at save time.
  // Tab-separated, like makeLog's lines. Typed into the format dialog's
  // Regex field (the dialog writes Regex mode only — a typed regex replaces
  // the default's own compiled pattern as the one that gets saved).
  fireClick(defaultRow().querySelector("button.btn-mini-outline"), w); // "Edit"
  d.querySelector("#formatEditName").value = "Renamed default";
  d.querySelector("#formatEditRegex").value = "^(?<ts>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2},\\d{3})\\t(?<level>\\S+)\\t(?<message>.*)$";
  fireInput(d.querySelector("#formatEditRegex"), w);
  fireClick(d.querySelector("#formatEditSave"), w);
  // saveFormatEdit's IndexedDB write is async — wait for the state asserted on.
  await waitFor(() => {
    const fmt = T.state.logFormats.find(f => f.id === "fmt-default");
    return !!fmt && fmt.name === "Renamed default";
  });

  const editedFmt = T.state.logFormats.find(f => f.id === "fmt-default");
  assert(editedFmt.name === "Renamed default" && editedFmt.edited === true, "editing the builtin default updates it in place and flags it edited");
  assert(defaultRow().querySelector(".filter-library-row-name").textContent.includes("Renamed default"), "the row reflects the new name");

  const duringEdit = await w.addFile("during-edit.log", makeLog(10, 1), () => {});
  assert(duringEdit.entries.length === 1, "sanity: the edited pattern still matches the line as a single entry, got " + duringEdit.entries.length);
  assert(duringEdit.entries[0].thread === "" && duringEdit.entries[0].method === "",
    "while edited, the SAME file shape now parses under the new (different) pattern — thread/method no longer extracted");
  assert(!isNaN(duringEdit.entries[0].ts) && duringEdit.entries[0].level === "ERROR",
    "...and ts/level (the two mandatory columns) still parse correctly under the new pattern");

  // Reset: reverts the row AND restores the original untouched fast-path parsing.
  fireClick(resetBtn(), w);
  // resetDefaultFormat mutates the format object BEFORE awaiting its
  // IndexedDB write and only re-renders AFTER it resolves — so the barrier
  // has to be a POST-write effect (the row's own re-render), not the state,
  // which is already correct while the write is still in flight. Waiting on
  // the state would let the group finish and tear the window down mid-write,
  // which crashes the shard in renderLevelBar.
  await waitFor(() => !defaultRow().querySelector(".filter-library-row-name").textContent.includes("Renamed"));

  const resetFmt = T.state.logFormats.find(f => f.id === "fmt-default");
  assert(resetFmt.edited === false, "Reset clears the edited flag");
  assert(resetFmt.name === "Default (log4net-style)" && resetFmt.pattern === '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n' && resetFmt.tsFormat === "yyyy-MM-dd HH:mm:ss,SSS",
    "Reset restores the exact original name/pattern/tsFormat, got " + JSON.stringify(resetFmt.pattern));
  assert(defaultRow().querySelector(".filter-library-row-name").textContent.includes("Default (log4net-style)") && !defaultRow().querySelector(".filter-library-row-name").textContent.includes("Renamed"),
    "the row's displayed name reverts too");

  const after = await w.addFile("after-reset.log", makeLog(20, 3), () => {});
  assert(after.entries[1].level === "INFO" && after.entries[1].thread === "main" && after.entries[1].method === "DoWork" && after.entries[1].message === "message 1",
    "after Reset, a normal file parses exactly as it did before the edit — not just the displayed fields, the actual parse behavior");
});
