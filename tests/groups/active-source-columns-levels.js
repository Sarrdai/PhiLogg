// GROUP active-source-columns-levels — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP active-source-columns-levels — the level bar and the table's middle
   columns follow the ACTIVE node's root file, not the union of every open
   file. A meta-format merge's source node (under "Sources") is its own root,
   so it shows only its own format's columns/levels; the merge root keeps the
   union of its sources' formats; a lit level-filter chip survives a switch
   to a scope that does not list it. Data: the log simulator ("mixed" through
   a meta format, "syslog" and "default" as separate files).
   ============================================================ */
group("active-source-columns-levels");

const ascBar = d => [...d.querySelectorAll("#levelBar .level-btn")].map(b => b.dataset.level).join(",");
const ascHeader = d => [...d.querySelectorAll("#tableHeader .th[data-col]")].map(h => h.dataset.col).filter(c => c !== "delta" && c !== "message").join(",");
const ascKeys = w => w.activeColumnDefs().map(c => c.key).join(",");
const ascActivate = (w, T, id) => { T.state.activeId = id; w.render(); };

await withApp(async (w, d, T) => {
  section("active-source-columns-levels a. Meta-format merge: each source shows its own format, the merge root the union");
  await waitForFormatConfig(T);
  await logsimRegister(w, T, "mixed", "fmt-sim-syslog");
  const meta = { id: "fmt-sim-meta", name: "Sim meta", mode: "meta", targetFormatIds: ["fmt-sim-syslog", "fmt-default"], builtin: false, edited: false, createdAt: 0 };
  T.state.logFormats.push(meta);
  const [file] = LOGSIM.generateToStrings({ format: "mixed", entries: 300, seed: 9 });
  const merged = await w.loadMetaFormatText(file.name, file.text, meta);
  const sysSrc = T.state.nodes[merged.sources.find(s => /syslog/i.test(s.name)).id];
  const defSrc = T.state.nodes[merged.sources.find(s => !/syslog/i.test(s.name)).id];
  assert(sysSrc && defSrc && sysSrc.formatId === "fmt-sim-syslog" && defSrc.formatId === "fmt-default", "sanity: two source nodes, one per format");
  const sysCols = w.formatColumnDefs("fmt-sim-syslog").map(c => c.key), defCols = w.formatColumnDefs("fmt-default").map(c => c.key);
  assert(sysCols.some(k => !defCols.includes(k)) && defCols.some(k => !sysCols.includes(k)), "sanity: the formats' column sets differ");
  const sysLv = w.formatLevels("fmt-sim-syslog"), defLv = w.formatLevels("fmt-default");

  ascActivate(w, T, merged.id);
  assert(ascKeys(w) === [...new Set([...sysCols, ...defCols])].join(",") || ascKeys(w) === [...new Set([...defCols, ...sysCols])].join(","),
    "the merge root shows the union of both formats' columns, got " + ascKeys(w));
  assert(ascHeader(d) === ascKeys(w), "...and the header follows, got " + ascHeader(d));
  const mergedBar = ascBar(d).split(",");
  assert([...sysLv, ...defLv].every(l => mergedBar.includes(l)), "the merge root's bar lists both formats' levels, got " + mergedBar.join(","));

  ascActivate(w, T, sysSrc.id);
  assert(ascKeys(w) === sysCols.join(","), "the syslog source shows only syslog columns, got " + ascKeys(w));
  assert(ascHeader(d) === sysCols.join(","), "...in the rendered header too, got " + ascHeader(d));
  assert(!d.querySelector('#tableRows [class*="col-method"]') && !d.querySelector('#tableRows [class*="col-location"]'), "...and no empty Default columns in the rows");
  const sysBar = ascBar(d).split(",");
  assert(sysLv.every(l => sysBar.includes(l)) && !defLv.filter(l => !sysLv.includes(l)).some(l => sysBar.includes(l)),
    "the syslog source's bar has the syslog levels and none of the other format's, got " + sysBar.join(","));

  ascActivate(w, T, defSrc.id);
  assert(ascKeys(w) === defCols.join(",") && ascHeader(d) === defCols.join(","), "the Default source shows only the Default columns, got " + ascKeys(w) + " / " + ascHeader(d));
  const defBar = ascBar(d).split(",");
  assert(defLv.every(l => defBar.includes(l)) && !sysLv.filter(l => !defLv.includes(l)).some(l => defBar.includes(l)),
    "the Default source's bar has no syslog-only levels, got " + defBar.join(","));

  // A filter node under a source keeps that source's scope.
  const flt = w.createFilterNode(sysSrc.id, "text", "a");
  ascActivate(w, T, flt.id);
  assert(ascKeys(w) === sysCols.join(",") && ascBar(d) === sysBar.join(","), "a filter node under the syslog source stays in that source's scope");

  ascActivate(w, T, merged.id);
  assert(ascKeys(w) === [...new Set([...sysCols, ...defCols])].join(",") || ascKeys(w) === [...new Set([...defCols, ...sysCols])].join(","),
    "back on the merge root: the union again, got " + ascKeys(w));
  assert(ascHeader(d) === ascKeys(w), "...and the header follows");
});

await withApp(async (w, d, T) => {
  section("active-source-columns-levels b. Separate unmerged files: each shows its own format");
  await waitForFormatConfig(T);
  await logsimRegister(w, T, "syslog", "fmt-sim-syslog");
  const [sf] = LOGSIM.generateToStrings({ format: "syslog", entries: 200, seed: 3 });
  const [df] = LOGSIM.generateToStrings({ format: "default", entries: 200, seed: 3 });
  const s = await w.addFile(sf.name, sf.text, () => {});
  const f = await w.addFile(df.name, df.text, () => {});
  assert(s.formatId === "fmt-sim-syslog" && f.formatId === "fmt-default", "sanity: two formats, two roots");
  const sysCols = w.formatColumnDefs("fmt-sim-syslog").map(c => c.key), defCols = w.formatColumnDefs("fmt-default").map(c => c.key);
  ascActivate(w, T, s.id);
  assert(ascKeys(w) === sysCols.join(",") && ascHeader(d) === sysCols.join(","), "the syslog file shows its own columns, got " + ascKeys(w));
  const sysBar = ascBar(d);
  ascActivate(w, T, f.id);
  assert(ascKeys(w) === defCols.join(",") && ascHeader(d) === defCols.join(","), "the default file shows its own columns, got " + ascKeys(w));
  assert(ascBar(d) !== sysBar, "...and its own bar");
  assert(w.canonicalLevelOrder(["INFO", "ERROR"]).join(",") === "ERROR,INFO", "canonicalLevelOrder follows the active file's order");
  const hasMsg = w.activeMessageVisible();
  assert(hasMsg === true, "Message stays visible");
});

await withApp(async (w, d, T) => {
  section("active-source-columns-levels c. A lit level chip keeps its place when the new scope does not list it");
  await waitForFormatConfig(T);
  await logsimRegister(w, T, "syslog", "fmt-sim-syslog");
  const [sf] = LOGSIM.generateToStrings({ format: "syslog", entries: 200, seed: 3 });
  const [df] = LOGSIM.generateToStrings({ format: "default", entries: 200, seed: 3 });
  const s = await w.addFile(sf.name, sf.text, () => {});
  const f = await w.addFile(df.name, df.text, () => {});
  // NOTICE: a syslog level the Default format does not list (its NOTICE lines are Other there).
  const lvl = "NOTICE";
  assert(w.formatLevels("fmt-sim-syslog").includes(lvl) && !w.formatLevels("fmt-default").includes(lvl), "sanity: syslog lists " + lvl + ", the Default format does not");
  ascActivate(w, T, s.id);
  fireClick(d.querySelector('#levelBar .level-btn[data-level="' + lvl + '"]'), w);
  assert(T.state.levelFilter.has(lvl), "the syslog-only level is lit");
  ascActivate(w, T, f.id);
  const chip = d.querySelector('#levelBar .level-btn[data-level="' + lvl + '"]');
  assert(chip && chip.classList.contains("active"), "its chip stays (lit) on the Default file, which does not list it");
  assert(chip.querySelector(".level-count").textContent === "0", "...with the active node's count (0)");
  assert(w.canonicalLevelOrder([lvl, "ERROR"]).join(",") === "ERROR," + lvl, "canonicalLevelOrder keeps the lit level in order");
  fireClick(chip, w);
  assert(!T.state.levelFilter.has(lvl) && !d.querySelector('#levelBar .level-btn[data-level="' + lvl + '"]'), "turning it off removes the chip again");
});

await withApp(async (w, d, T) => {
  section("active-source-columns-levels d. Nothing open: the default columns and levels");
  await waitForFormatConfig(T);
  assert(ascKeys(w) === "thread,location,method", "no file open: the default middle columns, got " + ascKeys(w));
  assert(ascBar(d) === "ERROR,WARN,INFO,DEBUG", "no file open: the default level bar, got " + ascBar(d));
  assert(w.activeMessageVisible() === true, "no file open: Message visible");
  // No active node but roots open: falls back to the union over every root.
  await logsimRegister(w, T, "syslog", "fmt-sim-syslog");
  const [sf] = LOGSIM.generateToStrings({ format: "syslog", entries: 50, seed: 3 });
  const [df] = LOGSIM.generateToStrings({ format: "default", entries: 50, seed: 3 });
  const s = await w.addFile(sf.name, sf.text, () => {});
  const f = await w.addFile(df.name, df.text, () => {});
  T.state.activeId = null;
  const keys = ascKeys(w).split(",");
  assert([...w.formatColumnDefs("fmt-sim-syslog"), ...w.formatColumnDefs("fmt-default")].every(c => keys.includes(c.key)), "no active node: the union over all roots, got " + keys.join(","));
});
