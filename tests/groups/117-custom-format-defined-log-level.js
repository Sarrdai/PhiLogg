// GROUP 117 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 117 — Custom (format-defined) log level names
   Origin: this session (2026-08-26), extending GROUP 116. A format's
   `levels` list is no longer limited to the fixed five: it may contain
   arbitrary names (NOTICE, FATAL, VERBOSE, ...). levelBucket() is now
   format-aware — an exact case-insensitive match against the owning
   format's list wins, otherwise the historical prefix cascade, otherwise
   OTHER (unrecognized free text never gets a bucket of its own). Custom
   names take a color from a rotating --level-custom-N palette, assigned by
   position among that format's custom names (customLevelSlot / levelClass
   -> lvl-custom-N). The Format Manager editor grows a text input + Add
   button and a delete control on custom rows.
   ============================================================ */
group(117);
await withApp(async (w, d, T) => {
  section("117a. levelBucket is format-aware: exact match wins, cascade then OTHER");
  await waitForFormatConfig(T);

  const mkFmt = (id, name, levels) => ({
    id, name, mode: "pattern", pattern: '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n', regex: "",
    tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels, builtin: false, edited: false, createdAt: Date.now(),
  });
  T.state.logFormats.push(mkFmt("fmt-notice", "Noticeful", ["ERROR", "NOTICE", "INFO", "VERBOSE"]));

  assert(w.levelBucket("NOTICE", "fmt-notice") === "NOTICE", "a name the format lists buckets to itself");
  assert(w.levelBucket("notice", "fmt-notice") === "NOTICE", "...case-insensitively, normalized to uppercase");
  assert(w.levelBucket("  Verbose  ", "fmt-notice") === "VERBOSE", "...and whitespace-trimmed");
  assert(w.levelBucket("NOTICE", "fmt-default") === "OTHER", "the same text under a format that does NOT list it stays OTHER");
  assert(w.levelBucket("NOTICE") === "OTHER", "...and with no format context at all");
  assert(w.levelBucket("WARNING", "fmt-notice") === "WARN",
    "a level the format's list omits still falls through the fixed prefix cascade");
  assert(w.levelBucket("FATAL", "fmt-notice") === "FATAL", "...FATAL is its own bucket (no longer ERROR)");
  assert(w.levelBucket("SOMETHING-ELSE", "fmt-notice") === "OTHER",
    "unrecognized free text collapses into OTHER rather than inventing a dynamic bucket");
  assert(w.levelBucket("", "fmt-notice") === "OTHER" && w.levelBucket(null, "fmt-notice") === "OTHER", "empty/missing level text is OTHER");

  // Slots are assigned among the CUSTOM names only, in list order.
  assert(w.customLevelSlot("NOTICE", "fmt-notice") === 1 && w.customLevelSlot("VERBOSE", "fmt-notice") === 2,
    "custom names take palette slots by their position among the format's custom names");
  assert(w.customLevelSlot("ERROR", "fmt-notice") === 0 && w.customLevelSlot("OTHER", "fmt-notice") === 0,
    "the six fixed names and OTHER never take a custom slot");
  assert(w.customLevelSlot("NOTICE") === 1, "with no format context the slot is resolved from the stored formats, deterministically");
  assert(w.levelClass("NOTICE", "fmt-notice") === "lvl-custom-1" && w.levelClass("VERBOSE", "fmt-notice") === "lvl-custom-2",
    "levelClass maps a custom bucket onto its lvl-custom-N class");
  assert(w.levelClass("NOTICE") === "lvl-custom-1", "...also for a bare bucket name (the level bar has no single format)");
  assert(w.levelClass("ERROR", "fmt-notice") === "lvl-error" && w.levelClass("zzz", "fmt-notice") === "lvl-other",
    "known buckets and unrecognized text keep their old classes");
  assert(w.levelClass("NOTICE", "fmt-default") === "lvl-other",
    "an entry whose OWN format doesn't list the name is not borrowed into another format's color");
});

await withApp(async (w, d, T) => {
  section("117b. Custom levels in the level bar, counts, rows and filter nodes");
  await waitForFormatConfig(T);
  T.state.logFormats.push({
    id: "fmt-notice", name: "Noticeful", mode: "pattern", pattern: '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n', regex: "",
    tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels: ["ERROR", "NOTICE", "INFO", "VERBOSE"],
    builtin: false, edited: false, createdAt: Date.now(),
  });

  const f = await w.addFile("a.log", makeLog(0, 8, { levels: ["ERROR", "NOTICE", "INFO", "VERBOSE"] }), () => {}, "fmt-notice");
  T.state.activeId = f.id;
  w.render();

  const barLevels = () => [...d.querySelectorAll("#levelBar .level-btn")].map(b => b.dataset.level);
  assert(barLevels().join(",") === "ERROR,NOTICE,INFO,VERBOSE",
    "the level bar shows the custom names alongside the fixed ones, in list order, got " + barLevels().join(","));
  const btn = lvl => d.querySelector('.level-btn[data-level="' + lvl + '"]');
  assert(btn("NOTICE").classList.contains("lvl-custom-1"), "the NOTICE button carries its palette class");
  assert(btn("VERBOSE").classList.contains("lvl-custom-2"), "...and the second custom name gets a DIFFERENT slot");
  assert(Number(btn("NOTICE").title.match(/[\d.]+$/)[0]) === 2,
    "getLevelCounts counts the custom bucket (it keys off each entry's computed bucket, not a fixed name list), got " +
    btn("NOTICE").title);

  // Rows carry the same class, so the palette color reaches the table too.
  const rowCls = [...d.querySelectorAll("#tableRows .log-row")].map(r => r.className);
  assert(rowCls.some(c => c.includes("lvl-custom-1")) && rowCls.some(c => c.includes("lvl-custom-2")),
    "log rows of custom-level entries get their lvl-custom-N class");

  // Quick-filtering by a custom level works end to end.
  fireClick(btn("NOTICE"), w);
  assert(T.state.levelFilter.has("NOTICE") && T.currentViewEntries.length === 2, "clicking a custom level chip narrows the Filtered view to those entries");
  fireClick(d.querySelector("#btnApplyLevelToTree"), w);
  const levelNode = Object.values(T.state.nodes).find(n => n.type === "filter" && n.filterType === "level");
  assert(levelNode && levelNode.value.join(",") === "NOTICE", "Add to tree creates a level node holding that name");
  assert(w.getEntries(levelNode.id).every(e => e.level === "NOTICE") && w.getEntries(levelNode.id).length === 2,
    "the level node filters to exactly the custom-level entries");
  const label = [...d.querySelectorAll("#tree .tree-label")].find(el => el.textContent.includes("NOTICE"));
  assert(label && [...label.querySelectorAll("span")].some(s => s.style.color === "var(--level-custom-1)"),
    "the tree row colors the custom level word via its palette var");

  // An entry whose text no format lists still lands in OTHER.
  const g = await w.addFile("b.log", makeLog(0, 2, { levels: ["BOGUS"] }), () => {}, "fmt-notice");
  assert(g.entries.every(e => w.levelBucket(e.level, e.formatId) === "OTHER"), "unlisted level text still buckets to OTHER");
});

await withApp(async (w, d, T) => {
  section("117c. Two formats, independent slot assignment; same slot for the same position");
  await waitForFormatConfig(T);
  const mk = (id, levels) => ({
    id, name: id, mode: "pattern", pattern: '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n', regex: "",
    tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels, builtin: false, edited: false, createdAt: Date.now(),
  });
  T.state.logFormats.push(mk("fmt-a", ["ERROR", "NOTICE", "AUDIT"]));
  T.state.logFormats.push(mk("fmt-b", ["INFO", "CRITICAL"]));

  assert(w.customLevelSlot("NOTICE", "fmt-a") === 1 && w.customLevelSlot("AUDIT", "fmt-a") === 2,
    "within one format, custom names get distinct consecutive slots");
  assert(w.customLevelSlot("CRITICAL", "fmt-b") === 1,
    "a different format restarts at slot 1 — the assignment is per-format and positional");
  assert(w.levelClass("CRITICAL", "fmt-b") === "lvl-custom-1" && w.levelClass("AUDIT", "fmt-a") === "lvl-custom-2",
    "...and that reaches the CSS class");

  const a = await w.addFile("a.log", makeLog(0, 6, { levels: ["ERROR", "NOTICE", "AUDIT"] }), () => {}, "fmt-a");
  T.state.activeId = a.id;
  const b = await w.addFile("b.log", makeLog(0, 4, { levels: ["INFO", "CRITICAL"] }), () => {}, "fmt-b");
  const barOf = id => { T.state.activeId = id; w.render(); return [...d.querySelectorAll("#levelBar .level-btn")].map(x => x.dataset.level).join(","); };
  assert(barOf(a.id) === "ERROR,NOTICE,AUDIT", "each file's bar lists only its own format's levels, custom names included, got " + barOf(a.id));
  assert(barOf(b.id) === "INFO,CRITICAL", "...the second file's bar likewise, got " + barOf(b.id));

  // Sorting by Level puts custom buckets between TRACE and OTHER, by slot.
  assert(w.levelSortRank("NOTICE", "fmt-a") === 6 && w.levelSortRank("AUDIT", "fmt-a") === 7,
    "custom buckets rank after TRACE, ordered by slot");
  assert(w.levelSortRank("OTHER") > w.levelSortRank("AUDIT", "fmt-a"), "OTHER still sorts last");
  assert(w.levelSortRank("FATAL") === 0 && w.levelSortRank("ERROR") === 1 && w.levelSortRank("DEBUG") === 4 && w.levelSortRank("TRACE") === 5, "the six fixed levels keep their ranks (FATAL most severe)");
});

await withApp(async (w, d, T) => {
  section("117d. Format editor: add / reject duplicates / delete / persist a custom level");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  const defaultRow = () => d.querySelector("#formatList .filter-library-row");
  fireClick(defaultRow().querySelector("button.btn-mini-outline"), w); // Edit the builtin default

  const rows = () => [...d.querySelectorAll("#formatEditLevels .format-level-row")];
  const input = d.querySelector("#formatEditLevelNew");
  const addBtn = d.querySelector("#formatEditLevelAddBtn");
  const errEl = d.querySelector("#formatEditLevelError");
  assert(rows().length === 6 && input && addBtn, "the editor still lists the six fixed rows, plus an add-custom field");
  assert(rows().every(r => !r.querySelector(".filter-library-row-del")), "fixed rows have no delete control (they're unchecked instead)");

  input.value = "  notice ";
  fireClick(addBtn, w);
  assert(rows().map(r => r.dataset.level).join(",") === "ERROR,WARN,INFO,DEBUG,FATAL,TRACE,NOTICE",
    "Add appends the trimmed/uppercased custom name as a new row, got " + rows().map(r => r.dataset.level).join(","));
  const noticeRow = () => d.querySelector('.format-level-row[data-level="NOTICE"]');
  assert(noticeRow().querySelector("input").checked, "a freshly added custom level is checked");
  assert(noticeRow().querySelector(".format-level-name-input").style.color === "var(--level-custom-1)",
    "...and previews its palette color while still being edited");
  assert(noticeRow().querySelector(".filter-library-row-del"), "a custom row gets a delete control");
  assert(input.value === "", "the add field clears after a successful add");

  // Validation: duplicates (either case, or against a fixed row) and blanks.
  input.value = "NoTiCe"; fireClick(addBtn, w);
  assert(rows().length === 7 && !errEl.classList.contains("hidden") && errEl.textContent.includes("already"),
    "a case-insensitive duplicate is rejected with an error instead of a second row");
  input.value = "warn"; fireClick(addBtn, w);
  assert(rows().length === 7 && errEl.textContent.includes("already"), "...including a duplicate of one of the fixed rows");
  input.value = "   "; fireClick(addBtn, w);
  assert(rows().length === 7 && errEl.textContent.includes("Enter"), "whitespace-only input is refused");
  input.value = "OTHER"; fireClick(addBtn, w);
  assert(rows().length === 7 && errEl.textContent.includes("catch-all"), "OTHER is reserved and can't be added");

  // Enter in the field adds too.
  input.value = "AUDIT";
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert(rows().map(r => r.dataset.level).join(",").endsWith("NOTICE,AUDIT"), "Enter in the add field appends the name too");
  assert(d.querySelector('.format-level-row[data-level="AUDIT"] .format-level-name-input').style.color === "var(--level-custom-2)",
    "the second custom row previews the second palette slot");

  // Reorder a custom row like any other, then drop the fixed TRACE/DEBUG.
  const upBtn = lvl => [...d.querySelector('.format-level-row[data-level="' + lvl + '"]').querySelectorAll("button.filter-library-row-order")][0];
  fireClick(upBtn("NOTICE"), w);
  assert(rows().map(r => r.dataset.level).join(",") === "ERROR,WARN,INFO,DEBUG,FATAL,NOTICE,TRACE,AUDIT", "▲ moves a custom row like any other");
  const cb = lvl => d.querySelector('.format-level-row[data-level="' + lvl + '"] input');
  cb("DEBUG").checked = false; cb("DEBUG").dispatchEvent(new w.Event("change"));

  fireClick(d.querySelector("#formatEditSave"), w);
  // fmt.levels is the v2 {value,name,color}[] shape (Custom Columns' level
  // int/text/explicit-color mapping) — this reads just the names, in order.
  const saved = () => T.state.logFormats.find(f => f.id === "fmt-default").levels.map(l => l.name).join(",");
  // saveFormatEdit's IndexedDB write is async — wait for the stored list.
  await waitFor(() => saved() === "ERROR,WARN,INFO,NOTICE,AUDIT");
  assert(saved() === "ERROR,WARN,INFO,NOTICE,AUDIT",
    "the saved list is the checked rows (custom names included) in the arranged order, got " + saved());
  const stored = await w.listLogFormats();
  assert(stored.find(f => f.id === "fmt-default").levels.map(l => l.name).join(",") === "ERROR,WARN,INFO,NOTICE,AUDIT", "...and it persisted to IndexedDB");
  assert(w.formatLevels("fmt-default").join(",") === "ERROR,WARN,INFO,NOTICE,AUDIT",
    "formatLevels no longer strips names outside the fixed five");

  // Reopen: custom rows come back, in order, with the fixed leftovers appended.
  fireClick(defaultRow().querySelector("button.btn-mini-outline"), w);
  assert(rows().map(r => r.dataset.level).join(",") === "ERROR,WARN,INFO,NOTICE,AUDIT,FATAL,DEBUG,TRACE",
    "reopening restores the saved order with the unused fixed levels appended, got " + rows().map(r => r.dataset.level).join(","));
  assert(cb("NOTICE").checked && !cb("DEBUG").checked, "...and each row's saved checked state");

  // Deleting a custom row removes it entirely.
  fireClick(noticeRow().querySelector(".filter-library-row-del"), w);
  assert(!d.querySelector('.format-level-row[data-level="NOTICE"]'), "the delete control removes the custom row");
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => saved() === "ERROR,WARN,INFO,AUDIT"); // async IndexedDB write
  assert(saved() === "ERROR,WARN,INFO,AUDIT", "...and saving drops it from the stored list, got " + saved());
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("117e. A filter node referencing a deleted custom level degrades without crashing");
  await waitForFormatConfig(T);
  const fmt = T.state.logFormats.find(f => f.id === "fmt-default");
  fmt.levels = ["ERROR", "WARN", "INFO", "NOTICE"];

  const f = await w.addFile("a.log", makeLog(0, 8, { levels: ["ERROR", "NOTICE", "INFO", "WARN"] }), () => {});
  T.state.activeId = f.id;
  w.render();
  fireClick(d.querySelector('.level-btn[data-level="NOTICE"]'), w);
  fireClick(d.querySelector("#btnApplyLevelToTree"), w);
  const node = Object.values(T.state.nodes).find(n => n.type === "filter" && n.filterType === "level");
  assert(node && node.value.join(",") === "NOTICE", "sanity: a level node on the custom level exists");
  assert(w.getEntries(node.id).length === 2, "sanity: it matches the two NOTICE entries");

  // Now the format drops NOTICE — the node keeps its value, the bar loses the
  // button, and the entries fall back to OTHER. Nothing throws.
  fmt.levels = ["ERROR", "WARN", "INFO"];
  w.invalidateAllCaches();
  w.render();
  const barLevels = [...d.querySelectorAll("#levelBar .level-btn")].map(b => b.dataset.level);
  assert(barLevels.join(",") === "ERROR,WARN,INFO,OTHER", "the removed custom level no longer has its own bar button; its entries show up under Other, got " + barLevels.join(","));
  assert(node.value.join(",") === "NOTICE", "the existing filter node keeps its (now unknown) value rather than being rewritten");
  assert(w.getEntries(node.id).length === 0, "...and simply matches nothing now that those entries bucket to OTHER");
  const label = [...d.querySelectorAll("#tree .tree-label")].find(el => el.textContent.includes("NOTICE"));
  assert(label && [...label.querySelectorAll("span")].every(s => !s.style.color),
    "its tree label renders in the default text color — no color, no crash");
  assert(w.levelClass("NOTICE") === "lvl-other", "and the name falls back to the generic OTHER styling");
});
