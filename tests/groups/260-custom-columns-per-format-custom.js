// GROUP 260 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 260 — Custom Columns (per-format custom columns)
   Origin: this session. Every format's entry schema was fixed at six
   fields (ts/level/thread/location/method/message); this generalizes it:
   Time and Level stay the two MANDATORY columns (enforced at save time in
   the Format Manager, not at compile time — compileFormatPattern/
   validateFormatRegex themselves stay purely technical, no field is
   actually required to compile), while Thread/Location/Method/Message are
   each individually optional per format, and a format may additionally
   define CUSTOM columns populated by a %X{name} pattern token (new,
   log4j MDC-style) or a plain (?<name>...) regex group (already possible,
   now surfaced) — landing on an entry's new `fields` bag (applyFormatMatch).
   Column order/visibility/width (COLUMN_TRACK_ORDER/HIDEABLE_COLUMNS before
   this) generalizes to activeColumnDefs(), a dynamic per-format union (same
   idiom as the pre-existing activeLevelOrder()); the row renderers, the
   context menu's "Filter for this ___", and the filter popup's column
   chips all now read from that instead of a fixed six-entry table. Level
   also gains an int-or-text value type with explicit per-level colors
   (formatLevelDefs/levelBucket/levelColorVar), replacing the purely name/
   position-driven color assignment for a format that wants one (e.g. a
   syslog severity code 0-7 mapped to named, colored levels).
   ============================================================ */
group(260);
await withApp(async (w, d, T) => {
  section("260a. Parsing: %X{name} pattern token and (?<name>...) regex groups both capture into entry.fields");

  const cPattern = w.compileFormatPattern('%d\\t%p\\t%X{reqId}\\t"%m"%n', "yyyy-MM-dd HH:mm:ss,SSS");
  assert(cPattern && cPattern.regex && cPattern.hasTs && cPattern.hasLevel, "a pattern with %d/%p/%X{reqId} compiles, with ts+level groups");
  const mPattern = cPattern.regex.exec('2024-01-15 10:00:00,000\tINFO\treq-42\t"hello"');
  assert(mPattern && mPattern.groups.reqId === "req-42", "the %X{} token captures its value under the chosen field name");

  const collide = w.compileFormatPattern("%X{level} %m", "");
  assert(collide.error && collide.error.includes("reserved"), "%X{} can't reuse a reserved field name (ts/level/thread/location/method/message)");

  const noMandatory = w.compileFormatPattern("%m", "");
  assert(!noMandatory.error && !noMandatory.hasTs && !noMandatory.hasLevel,
    "compiling itself has no hard requirement — Time/Level mandatory is a save-time rule instead (see 260b)");

  const vRegex = w.validateFormatRegex("^(?<ts>\\S+) (?<level>\\w+) (?<sessionId>\\S+) (?<message>.*)$");
  assert(!vRegex.error, "a hand-written regex with a custom named group (sessionId) compiles fine, no parsing-side change needed");
  const mRegex = vRegex.regex.exec("2024-01-15T10:00:00 ERROR sess-7 boom");
  const entry = w.applyFormatMatch(mRegex.groups, "raw line", null);
  assert(entry.fields.sessionId === "sess-7", "the custom group lands on entry.fields, keyed by its capture name");
  assert(!("sessionId" in entry), "...not as a top-level entry property (only the six reserved fields get those)");

  const plainEntry = w.applyFormatMatch({ ts: "x", level: "INFO", message: "hi" }, "hi", null);
  assert(Object.keys(plainEntry.fields).length === 0, "a format with no custom captures gets an empty fields bag (shared EMPTY_ENTRY_FIELDS, no per-entry allocation)");
});

await withApp(async (w, d, T) => {
  section("260b. Data model: formatColumnDefs/messageVisible fallback for legacy records; Time/Level mandatory at save time");
  await waitForFormatConfig(T);

  // A format record predating this feature (no columnDefs/messageVisible)
  // falls back exactly to today's fixed three, in the legacy order.
  const legacyFmt = {
    id: "fmt-legacy", name: "Legacy", mode: "pattern", pattern: '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n',
    regex: "", tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels: ["ERROR", "INFO"],
    builtin: false, edited: false, createdAt: Date.now(),
  };
  T.state.logFormats.push(legacyFmt);
  const defs = w.formatColumnDefs("fmt-legacy");
  assert(defs.map(x => x.key).join(",") === "thread,location,method", "no columnDefs -> the legacy fixed three, in the legacy order, got " + defs.map(x => x.key).join(","));
  assert(defs.every(x => x.kind === "default"), "...all flagged 'default' kind");
  assert(w.formatMessageVisible("fmt-legacy") === true, "no messageVisible -> visible (today's always-on behavior)");

  // Format dialog: Time and Level are the two mandatory columns — saving a
  // regex missing either group is blocked, even though neither is
  // technically required to compile (260a).
  w.openSettingsDialog();
  fireClick(d.querySelector("#btnAddFormat"), w);
  d.querySelector("#formatEditName").value = "No level";
  const typeRegex = src => { d.querySelector("#formatEditRegex").value = src; fireInput(d.querySelector("#formatEditRegex"), w); };
  typeRegex("^(?<ts>\\S+) (?<message>.*)$");
  fireClick(d.querySelector("#formatEditSave"), w);
  assert(!d.querySelector("#formatEditError").classList.contains("hidden") && d.querySelector("#formatEditError").textContent.includes("Level is required"),
    "saving a regex with no (?<level>) group is blocked with an error, got " + d.querySelector("#formatEditError").textContent);
  assert(!T.state.logFormats.some(f => f.name === "No level"), "...and nothing was saved");

  typeRegex("^(?<level>\\w+) (?<message>.*)$");
  fireClick(d.querySelector("#formatEditSave"), w);
  assert(!d.querySelector("#formatEditError").classList.contains("hidden") && d.querySelector("#formatEditError").textContent.includes("Time is required"),
    "saving a regex with no (?<ts>) group is blocked too");
  assert(!T.state.logFormats.some(f => f.name === "No level"), "...and still nothing was saved");

  typeRegex("^(?<ts>\\S+) (?<level>\\w+) (?<message>.*)$");
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.some(f => f.name === "No level"));
  assert(T.state.logFormats.some(f => f.name === "No level"), "...but with both groups present, saving succeeds");
});

await withApp(async (w, d, T) => {
  section("260c. Format dialog: columns — a typed regex's groups become columns, add/remove/reorder/rename, only captured ones saved, round-trips through save/reopen/IndexedDB");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  fireClick(d.querySelector("#btnAddFormat"), w);
  d.querySelector("#formatEditName").value = "ReqId format";

  const colKeys = () => [...d.querySelectorAll("#fwzColumns .fwz-col-row")].map(r => r.dataset.col).join(",");
  assert(colKeys() === "ts,level,thread,location,method,message", "a new format starts with Time, Level, the three default columns, Message");

  // A typed regex's named group that isn't a column yet becomes one.
  d.querySelector("#formatEditRegex").value = "^(?<ts>\\S+ \\S+)\\t(?<level>\\S+)\\t(?<thread>\\S+)\\t(?<reqId>\\S+)\\t(?<message>.*)$";
  fireInput(d.querySelector("#formatEditRegex"), w);
  assert(colKeys() === "ts,level,thread,location,method,reqId,message", "a typed regex's custom group (reqId) is added as a column, got " + colKeys());

  // Remove Location — a re-add chip appears; clicking it restores it before Message.
  const colDel = key => d.querySelector('#fwzColumns .fwz-col-row[data-col="' + key + '"] .filter-library-row-del');
  fireClick(colDel("location"), w);
  assert(colKeys() === "ts,level,thread,method,reqId,message", "removing Location drops it");
  const addChip = label => [...d.querySelectorAll("#fwzDefaultAdd button")].find(b => b.textContent === "+ " + label);
  assert(addChip("Location"), "a '+ Location' re-add chip appears once it's removed");
  fireClick(addChip("Location"), w);
  assert(colKeys() === "ts,level,thread,method,reqId,location,message", "clicking the chip re-adds it before Message, got " + colKeys());
  assert(!addChip("Location"), "...and the chip itself disappears once re-added");

  // Reorder: move reqId up above Method.
  fireClick(d.querySelector('#fwzColumns .fwz-col-row[data-col="reqId"] .filter-library-row-order'), w);
  assert(colKeys() === "ts,level,thread,reqId,method,location,message", "▲ reorders a custom column above a default one, got " + colKeys());

  // Rename reqId's title by double-clicking its label; the key stays.
  const label = d.querySelector('#fwzColumns .fwz-col-row[data-col="reqId"] .fwz-col-label');
  label.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true }));
  const renameInput = label.querySelector("input");
  assert(renameInput && renameInput.value === "reqId", "double-clicking a column title opens an inline rename field");
  renameInput.value = "Request Id";
  renameInput.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert(d.querySelector('#fwzColumns .fwz-col-row[data-col="reqId"] .fwz-col-label').textContent === "Request Id", "Enter commits the new title; the key stays reqId");

  // Columns the regex doesn't capture are flagged, and left out on save.
  assert(d.querySelector("#fwzStatus").textContent.includes("left out on save: Method, Location"),
    "the status line names listed columns the regex doesn't capture, got " + d.querySelector("#fwzStatus").textContent);

  d.querySelector("#formatEditMessageVisible").checked = false;
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.some(f => f.name === "ReqId format"));
  const fmt = T.state.logFormats.find(f => f.name === "ReqId format");
  assert(fmt.columnDefs.map(c => c.key).join(",") === "thread,reqId", "the saved columnDefs are the captured columns, in the arranged order, got " + fmt.columnDefs.map(c => c.key).join(","));
  assert(fmt.columnDefs.find(c => c.key === "reqId").kind === "custom" && fmt.columnDefs.find(c => c.key === "reqId").label === "Request Id",
    "the custom column's kind and (renamed) title are persisted");
  assert(fmt.columnDefs.find(c => c.key === "thread").kind === "default", "a default column's kind is persisted too");
  assert(fmt.messageVisible === false, "messageVisible is persisted");
  const stored = await w.listLogFormats();
  const storedFmt = stored.find(f => f.name === "ReqId format");
  assert(storedFmt.columnDefs.map(c => c.key).join(",") === "thread,reqId", "...and it persisted to IndexedDB");
  assert(storedFmt.messageVisible === false, "...messageVisible too");

  // Reopening the dialog shows the saved column list and Message toggle back.
  w.openFormatEditDialog(fmt.id);
  assert(colKeys() === "ts,level,thread,reqId,message", "reopening restores the saved columns, got " + colKeys());
  assert(d.querySelector("#formatEditMessageVisible").checked === false, "...and the saved Message-visibility state");
  assert(d.querySelector("#formatEditRegex").value === fmt.regex, "...and shows the saved regex");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("260d. End to end: a loaded custom-column format renders its columns, and the union of loaded formats drives the context menu + filter popup chips");
  await waitForFormatConfig(T);

  const reqIdFmt = {
    id: "fmt-reqid", name: "ReqId", mode: "pattern", pattern: '%d\\t%p\\t%X{reqId}\\t"%m"%n',
    regex: "", tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels: ["ERROR", "INFO"],
    columnDefs: [{ key: "reqId", kind: "custom", label: "Request Id" }], // Thread/Location/Method all dropped
    messageVisible: true, builtin: false, edited: false, createdAt: Date.now(),
  };
  T.state.logFormats.push(reqIdFmt);
  const reqIdLines = [0, 1, 2].map(i => `2024-01-15 10:00:0${i},000\t${i === 0 ? "ERROR" : "INFO"}\treq=${i}\t"hello ${i}"`).join("\n") + "\n";
  const f = await w.addFile("reqid.log", reqIdLines, () => {}, "fmt-reqid");
  T.state.activeId = f.id;
  w.render();

  assert(f.entries[0].fields.reqId === "req=0", "sanity: the custom column's value is captured on each entry");
  assert(w.activeColumnDefs().map(c => c.key).join(",") === "reqId", "activeColumnDefs() for this lone loaded format is just its own custom column (Thread/Location/Method all dropped)");
  assert(w.entryColumnValue(f.entries[1], "reqId") === "req=1", "entryColumnValue reads a custom column's value the same way as a built-in one");

  const reqIdCell = [...d.querySelectorAll('#tableRows .col-custom[data-col="reqId"]')][1]; // row for entries[1] ("req=1")
  assert(reqIdCell && reqIdCell.textContent.trim() === "req=1", "the rendered row shows the custom column, tagged data-col and the shared .col-custom class");
  assert(!d.querySelector("#tableRows .col-thread") && !d.querySelector("#tableRows .col-location") && !d.querySelector("#tableRows .col-method"),
    "the three default columns this format dropped render nothing at all");

  // The HEADER (a separate, otherwise-static DOM tree from the per-row
  // renderers above) must pick up the very same column set — render()
  // refreshes it via refreshColumnState() whenever activeColumnDefs()'s key
  // set actually changes (memoized against lastColumnStateKey), which
  // addFile's own w.render() call above should have just triggered.
  assert(d.querySelector('#tableHeader .th[data-col="reqId"]') && d.querySelector('#tableHeader .th[data-col="reqId"]').textContent.trim() === "Request Id",
    "the Filter header shows the custom column with its own label, picked up by the very first render() after loading this format's file");
  assert(!d.querySelector('#tableHeader .th[data-col="location"]') && !d.querySelector('#tableHeader .th[data-col="thread"]') && !d.querySelector('#tableHeader .th[data-col="method"]'),
    "...and none of the three columns this format dropped");
  assert(d.querySelector('#highlightHeader .th[data-col="reqId"]'), "the Highlight header picks up the same dynamic column set too");

  // Context menu: right-clicking the custom column's cell resolves to it.
  fireContextMenu(reqIdCell, w, 50, 50);
  assert(d.querySelector("#ctxFilterForColumnLabel").textContent === "Filter for this Request Id", "right-clicking the custom column's cell labels the action for it");
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "req=[*:int]", "the custom column's value fills the filter input, numeric content auto-wildcarded same as any other column (openFilterForEntryColumn) — got " + d.querySelector("#filterInput").value);
  assert(d.querySelector('.column-chip[data-col="reqId"]').classList.contains("active"), "the custom column's own chip is pre-selected in the filter popup");
  assert(!d.querySelector('.column-chip[data-col="thread"]'), "a column this format doesn't define (Thread) has no chip at all");
  w.closeFilterPopup();

  // Scoped to the active root file: a second file under the builtin default
  // (Thread/Location/Method, no custom columns) joins the same session —
  // the context menu / filter popup offer only the ACTIVE file's columns.
  const g = await w.addFile("default.log", makeLog(0, 2), () => {});
  T.state.activeId = g.id;
  w.render();
  const keysNow = () => w.activeColumnDefs().map(c => c.key).join(",");
  assert(keysNow() === "thread,location,method",
    "activeColumnDefs() follows the active root file (default format), got " + keysNow());
  const chipCols = () => [...d.querySelectorAll(".column-chip")].map(c => c.dataset.col);
  w.openFilterPopup();
  assert(chipCols().includes("thread") && !chipCols().includes("reqId"), "the filter popup's chip list offers only the active file's columns");
  w.closeFilterPopup();
  T.state.activeId = f.id;
  w.render();
  assert(keysNow() === "reqId", "switching back to the custom-column file restores its columns, got " + keysNow());
  w.openFilterPopup();
  assert(chipCols().includes("reqId") && !chipCols().includes("thread"), "...and its filter popup chips");
  w.closeFilterPopup();
});

await withApp(async (w, d, T) => {
  section("260e. Persistence: a filter's restriction to a custom column survives export/import and cache save/restore even when its owning format isn't currently loaded");
  await waitForFormatConfig(T);

  // The format that defines "reqId" is known (registered) but never loaded
  // as a root file in this test — knownTextFilterColumnKeys() is checked
  // against every KNOWN format, not just currently active ones.
  T.state.logFormats.push({
    id: "fmt-reqid-2", name: "ReqId 2", mode: "pattern", pattern: '%d\\t%p\\t%X{reqId}\\t"%m"%n',
    regex: "", tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels: ["ERROR", "INFO"],
    columnDefs: [{ key: "reqId", kind: "custom", label: "Request Id" }],
    messageVisible: true, builtin: false, edited: false, createdAt: Date.now(),
  });

  const logText = makeLog(0, 3);
  const fSave = await w.addFile("save-src.log", logText, () => {});
  const saveNode = w.createFilterNode(fSave.id, "text", "req-1", false, null, false, ["reqId", "totallyBogus"]);
  w.render();

  const branch = w.serializeFilterBranch(saveNode.id);
  assert(branch.roots[0].columns && branch.roots[0].columns.includes("reqId"), "serializeFilterBranch writes the custom-column restriction into the saved JSON verbatim");
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });

  const fLoad = await w.addFile("save-dest.log", logText, () => {});
  w.render();
  function setLoadTarget(targetId) {
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(targetId)};`;
    d.body.appendChild(s);
  }
  setLoadTarget(fLoad.id);
  w.importFilterJson(json);
  const loaded = T.state.nodes[fLoad.children[fLoad.children.length - 1]];
  assert(loaded.columns.includes("reqId"),
    "reqId survives import even though fmt-reqid-2 (the format that defines it) is never loaded as a root file — a saved filter's restriction on a not-currently-open format's column is kept, not silently dropped");
  assert(!loaded.columns.includes("totallyBogus"), "...but a key no KNOWN format defines at all is still stripped, same defensive posture as before this feature");

  // Same permissive-but-defensive policy for the session-cache carrier.
  const fCacheSrc = await w.addFile("cache-src.log", logText, () => {});
  w.createFilterNode(fCacheSrc.id, "text", "req-1", false, null, false, ["reqId", "totallyBogus"]);
  w.render();
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(fCacheSrc);
  const fCacheDest = await w.addFile("cache-dest.log", logText, () => {});
  w.materializeCachedFilters(fCacheDest, cacheRoots);
  const cached = Object.values(T.state.nodes).find(n => n.parentId === fCacheDest.id);
  assert(cached.columns.includes("reqId") && !cached.columns.includes("totallyBogus"),
    "materializeCachedFilters applies the same knownTextFilterColumnKeys() policy — reqId kept, totallyBogus stripped");
});

await withApp(async (w, d, T) => {
  section("260f. Level int-mode value matching + explicit per-level colors (format setup's level color-mapping)");
  await waitForFormatConfig(T);

  // Text mode (default): unaffected by this feature at all.
  T.state.logFormats.push({
    id: "fmt-text-lvl", name: "TextLvl", mode: "pattern", pattern: '%d\\t%p\\t"%m"%n',
    regex: "", tsFormat: "", levels: [{ value: "ERROR", name: "ERROR", color: null }],
    builtin: false, edited: false, createdAt: Date.now(),
  });
  assert(w.levelBucket("ERROR", "fmt-text-lvl") === "ERROR", "text-mode (default) matches the captured token against each level's NAME");

  // Int mode: the captured token (a numeric severity code, e.g. syslog)
  // matches each level definition's `value`, not its `name`.
  T.state.logFormats.push({
    id: "fmt-int-lvl", name: "IntLvl", mode: "pattern", pattern: '%d\\t%p\\t"%m"%n',
    regex: "", tsFormat: "", levelValueType: "int",
    levels: [
      { value: "3", name: "ERROR", color: "#ff4444" },
      { value: "6", name: "INFO", color: null },
    ],
    builtin: false, edited: false, createdAt: Date.now(),
  });
  assert(w.levelBucket("3", "fmt-int-lvl") === "ERROR", "int-mode matches the captured numeric code against each level's `value`, not its name");
  assert(w.levelBucket("6", "fmt-int-lvl") === "INFO", "...every mapped code resolves to its own level");
  assert(w.levelBucket("ERROR", "fmt-int-lvl") === "OTHER", "...the level's NAME itself is no longer a match in int mode (no text-prefix cascade for numeric codes)");
  assert(w.levelBucket("9", "fmt-int-lvl") === "OTHER", "an unmapped numeric code falls into OTHER, same catch-all as text mode");

  assert(w.levelColorVar("ERROR", "fmt-int-lvl") === "#ff4444", "an explicit per-level color is used directly as the CSS color value");
  assert(w.levelColorVar("INFO", "fmt-int-lvl") === "var(--level-info)",
    "a level with no explicit color (color:null) falls back to the automatic fixed-name theme var, same as before this feature");

  // formatLevelDefs upcasts a legacy plain-string levels array on read —
  // every pre-existing saved format keeps working unchanged.
  const legacyDefs = w.formatLevelDefs("fmt-default");
  assert(legacyDefs.every(d => d.color === null) && legacyDefs.map(d => d.name).join(",") === "ERROR,WARN,INFO,DEBUG",
    "the builtin default's plain-string levels list upcasts to {value,name,color:null} entries with no behavior change");
});
