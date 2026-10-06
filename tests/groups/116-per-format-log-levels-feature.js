// GROUP 116 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 116 — Per-format log levels (FEATURE_BACKLOG.md #47)
   Origin: this session (2026-08-26). A LogFormat now carries its own
   ordered `levels` list (a subset of the fixed ERROR/WARN/INFO/DEBUG/TRACE
   bucket set; OTHER stays the implicit catch-all), edited in the Format
   Manager's format editor. The level bar renders the UNION of the level
   lists of every open file's format, concatenated in tree order and
   de-duplicated (activeLevelOrder), and a level filter node's value array
   is canonically ordered by that same union (canonicalLevelOrder). Formats
   without the field (every builtin, and anything created before this)
   fall back to the old fixed ERROR/WARN/INFO/DEBUG list, so single-format
   usage is unchanged. levelBucket's own prefix cascade is untouched.
   ============================================================ */
group(116);
await withApp(async (w, d, T) => {
  section("116a. Default format: unchanged level set/order; entries stamped with their format");
  await waitForFormatConfig(T);

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const barLevels = () => [...d.querySelectorAll("#levelBar .level-btn")].map(b => b.dataset.level);
  assert(barLevels().join(",") === "ERROR,WARN,INFO,DEBUG",
    "a file under the builtin default shows the classic four buttons in the classic order, got " + barLevels().join(","));
  assert(w.activeLevelOrder().join(",") === "ERROR,WARN,INFO,DEBUG", "activeLevelOrder falls back to the default list");
  assert(w.formatLevels("fmt-default").join(",") === "ERROR,WARN,INFO,DEBUG", "formatLevels of a format with no stored list returns the default");
  assert(w.formatLevels("fmt-does-not-exist").join(",") === "ERROR,WARN,INFO,DEBUG", "formatLevels of an unknown id returns the default too");

  assert(f.entries.every(e => e.formatId === "fmt-default"), "every parsed entry is stamped with its file's formatId");

  // levelBucket's cascade itself is untouched by this feature.
  assert(w.levelBucket("FATAL") === "FATAL" && w.levelBucket("ERR") === "ERROR" && w.levelBucket("TRACE") === "TRACE" && w.levelBucket("NOTICE") === "OTHER",
    "levelBucket's prefix cascade is unchanged (FATAL->FATAL, ERR->ERROR, TRACE->TRACE, unknown->OTHER)");
});

await withApp(async (w, d, T) => {
  section("116b. A format's own levels drive the bar; two open formats union in tree order");
  await waitForFormatConfig(T);

  // Same log4net shape as the default, so the fixture text parses either way
  // — only the `levels` list differs between the two formats.
  const mkFmt = (id, name, levels) => ({
    id, name, mode: "pattern", pattern: '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n', regex: "",
    tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels, builtin: false, edited: false, createdAt: Date.now(),
  });
  T.state.logFormats.push(mkFmt("fmt-trace", "Trace-first", ["ERROR", "WARN", "TRACE"]));
  T.state.logFormats.push(mkFmt("fmt-terse", "Terse", ["INFO", "ERROR"]));

  const a = await w.addFile("a.log", makeLog(0, 6, { levels: ["ERROR", "WARN", "TRACE"] }), () => {}, "fmt-trace");
  T.state.activeId = a.id;
  w.render();
  const barLevels = () => [...d.querySelectorAll("#levelBar .level-btn")].map(b => b.dataset.level);
  assert(a.formatId === "fmt-trace", "sanity: the file is pinned to the custom format");
  assert(barLevels().join(",") === "ERROR,WARN,TRACE",
    "the bar shows exactly that format's levels, in its order (DEBUG dropped, TRACE added), got " + barLevels().join(","));
  const traceBtn = d.querySelector('.level-btn[data-level="TRACE"]');
  assert(traceBtn && traceBtn.classList.contains("lvl-trace"), "the TRACE button carries its own lvl-trace class");
  assert(Number(traceBtn.title.match(/[\d.]+$/)[0]) === 2, "the TRACE button counts its entries, got " + traceBtn.title);

  // Second file, different format: the bar follows the active file only.
  const b = await w.addFile("b.log", makeLog(0, 4, { levels: ["INFO"] }), () => {}, "fmt-terse");
  T.state.activeId = b.id;
  w.render();
  assert(b.formatId === "fmt-terse", "sanity: the second file uses the other custom format");
  assert(barLevels().join(",") === "INFO,ERROR",
    "the bar shows only the active file's format list (not the other open file's), got " + barLevels().join(","));
  T.state.activeId = a.id;
  w.render();
  assert(barLevels().join(",") === "ERROR,WARN,TRACE",
    "switching the active file switches the bar back, got " + barLevels().join(","));
  // The union survives for a merged root.
  const m = await w.mergeFiles([a.id, b.id]);
  T.state.activeId = m.id;
  w.render();
  assert(barLevels().join(",") === "ERROR,WARN,TRACE,INFO",
    "a merge of both files shows the union of both formats' lists, de-duplicated, got " + barLevels().join(","));
  assert(b.entries.every(e => e.formatId === "fmt-terse"), "the second file's entries are stamped with their own format");
});

await withApp(async (w, d, T) => {
  section("116c. A level filter node's value is canonically ordered by the union, not the old fixed list");
  await waitForFormatConfig(T);
  T.state.logFormats.push({
    id: "fmt-rev", name: "Reversed", mode: "pattern", pattern: '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n', regex: "",
    tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels: ["DEBUG", "INFO", "WARN", "ERROR"], builtin: false, edited: false, createdAt: Date.now(),
  });
  const f = await w.addFile("a.log", makeLog(0, 8, { levels: ["ERROR", "INFO", "DEBUG", "WARN"] }), () => {}, "fmt-rev");
  T.state.activeId = f.id;
  w.render();

  assert(w.canonicalLevelOrder(["ERROR", "DEBUG"]).join(",") === "DEBUG,ERROR",
    "canonicalLevelOrder re-sorts into the active union order, got " + w.canonicalLevelOrder(["ERROR", "DEBUG"]).join(","));
  assert(w.canonicalLevelOrder(["OTHER", "INFO"]).join(",") === "INFO,OTHER",
    "levels outside the union (OTHER) are kept, appended after the ordered ones");

  // "Add to tree" turns the chip selection into one level node — its value
  // array must come out in the union order, not ERROR/WARN/INFO/DEBUG.
  const findLevelBtn = lvl => d.querySelector('.level-btn[data-level="' + lvl + '"]');
  fireClick(findLevelBtn("ERROR"), w);
  fireClick(findLevelBtn("DEBUG"), w);
  fireClick(d.querySelector("#btnApplyLevelToTree"), w);
  const levelNode = Object.values(T.state.nodes).find(n => n.type === "filter" && n.filterType === "level");
  assert(levelNode, "Add to tree created a level filter node");
  assert(levelNode.value.join(",") === "DEBUG,ERROR",
    "the level node's value is ordered by the format's own level order, got " + levelNode.value.join(","));
  const label = [...d.querySelectorAll("#tree .tree-label")].find(el => el.textContent.includes("DEBUG"));
  assert(label && label.textContent.replace(/\s/g, "") === "DEBUG,ERROR",
    "the tree row's level label lists the levels in the same order, got " + (label && label.textContent));
  assert([...label.querySelectorAll("span")].some(s => s.style.color === "var(--level-debug)"),
    "each known level word is colored via its own --level-* var");
});

await withApp(async (w, d, T) => {
  section("116d. Format Manager: levels list editor round-trips through save/reopen/IndexedDB");
  await waitForFormatConfig(T);
  w.openSettingsDialog();

  const defaultRow = () => d.querySelector("#formatList .filter-library-row");
  fireClick(defaultRow().querySelector("button.btn-mini-outline"), w); // "Edit" the builtin default
  const rows = () => [...d.querySelectorAll("#formatEditLevels .format-level-row")];
  assert(rows().length === 6, "the editor lists all six known level buckets, got " + rows().length);
  assert(rows().map(r => r.dataset.level).join(",") === "ERROR,WARN,INFO,DEBUG,FATAL,TRACE",
    "...the format's own levels first (in its order), then the unused ones appended");
  assert(rows().slice(0, 4).every(r => r.querySelector("input").checked) && !rows()[4].querySelector("input").checked && !rows()[5].querySelector("input").checked,
    "the format's four levels are checked, the unused FATAL and TRACE are not");
  assert(rows()[0].querySelector("button").disabled, "the first row's ▲ is disabled");

  // Reorder (TRACE up one, above DEBUG) and enable it; drop DEBUG.
  const upBtn = lvl => [...d.querySelector('.format-level-row[data-level="' + lvl + '"]').querySelectorAll("button")][0];
  fireClick(upBtn("TRACE"), w);
  assert(rows().map(r => r.dataset.level).join(",") === "ERROR,WARN,INFO,DEBUG,TRACE,FATAL", "▲ moves a level up one slot");
  const cb = lvl => d.querySelector('.format-level-row[data-level="' + lvl + '"] input');
  cb("TRACE").checked = true; cb("TRACE").dispatchEvent(new w.Event("change"));
  cb("DEBUG").checked = false; cb("DEBUG").dispatchEvent(new w.Event("change"));

  // fmt.levels is now the v2 {value,name,color}[] shape (Custom Columns'
  // level int/text/explicit-color mapping) for anything saved through the
  // editor, but DEFAULT_LOG_FORMAT.levels (and hence a just-Reset record)
  // stays the legacy plain-string shape on purpose — same both-shapes
  // tolerance formatLevelDefs itself has. This helper reads just the names,
  // in order, from either shape.
  const levelNames = fmt => fmt.levels.map(l => (l && typeof l === "object") ? l.name : l).join(",");

  fireClick(d.querySelector("#formatEditSave"), w);
  // saveFormatEdit awaits its IndexedDB write BEFORE updating state.logFormats,
  // so polling the in-memory list covers both assertions below — and unlike
  // the fixed 20ms sleep it was, it holds up under a loaded shard.
  await waitFor(() => {
    const f = T.state.logFormats.find(f => f.id === "fmt-default");
    return f && levelNames(f) === "ERROR,WARN,INFO,TRACE";
  });
  const fmt = T.state.logFormats.find(f => f.id === "fmt-default");
  assert(levelNames(fmt) === "ERROR,WARN,INFO,TRACE",
    "the saved list is the checked levels in the arranged order, got " + levelNames(fmt));
  const stored = await w.listLogFormats();
  assert(levelNames(stored.find(f => f.id === "fmt-default")) === "ERROR,WARN,INFO,TRACE", "...and it persisted to IndexedDB");

  // Reopening the editor shows the saved order back, unused level appended.
  fireClick(defaultRow().querySelector("button.btn-mini-outline"), w);
  assert(rows().map(r => r.dataset.level).join(",") === "ERROR,WARN,INFO,TRACE,FATAL,DEBUG", "reopening restores the saved order");
  assert(!cb("DEBUG").checked && cb("TRACE").checked, "...and the saved enabled/disabled state");

  // Saving with nothing checked is refused rather than storing an empty list.
  ["ERROR", "WARN", "INFO", "TRACE"].forEach(l => { cb(l).checked = false; cb(l).dispatchEvent(new w.Event("change")); });
  fireClick(d.querySelector("#formatEditSave"), w);
  assert(!d.querySelector("#formatEditError").classList.contains("hidden") && d.querySelector("#formatEditError").textContent.includes("at least one"),
    "saving with no level checked shows an error instead of storing an empty list");
  assert(levelNames(T.state.logFormats.find(f => f.id === "fmt-default")) === "ERROR,WARN,INFO,TRACE", "...and the stored list is untouched");
  fireClick(d.querySelector("#formatEditCancel"), w);

  // Reset restores the builtin default's original level list too.
  const findResetBtn = () => [...defaultRow().querySelectorAll("button")].find(b => b.textContent === "Reset");
  const staleResetBtn = findResetBtn();
  fireClick(staleResetBtn, w);
  // resetDefaultFormat's re-render is what happens AFTER its IndexedDB write
  // resolves — and it only changes the level list here, so the row's text is
  // no barrier. renderFormatList rebuilds the row's nodes, so a fresh button
  // that isn't the one just clicked is the post-write signal (see 70f for why
  // waiting on the state instead tears the window down mid-write).
  await waitFor(() => { const b = findResetBtn(); return !!b && b !== staleResetBtn; });
  assert(levelNames(T.state.logFormats.find(f => f.id === "fmt-default")) === "ERROR,WARN,INFO,DEBUG",
    "Reset reverts the builtin default's levels to the original four");
}, { indexedDB: new IDBFactory() });
