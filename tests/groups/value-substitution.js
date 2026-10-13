// GROUP value-substitution — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP value-substitution — backlog #131, step 1 (engine, display, toggle).
   A log format's `substitutions` rules map a column's ID (thread, ...) to a
   name announced in a message ("Hello, this is Server '[*:word]'"): per file,
   retroactive, first name wins; the name shows in rows, Facets, Details and
   exports, filters on the column match name OR original, the "Show original
   values" toolbar toggle (global, persisted) flips every view to the IDs, and
   the rule list rides the format record (export/import/session). Data: the
   log simulator's scenario `devices` (three servers announce a name, the
   fourth never does).
   ============================================================ */
group("value-substitution");

const vsRule = { id: "sub-1", column: "thread", pattern: "Hello, this is Server '[*:word]'" };
const vsDevices = (entries, seed) => LOGSIM.generateToStrings({ format: "default", scenarios: ["devices"], entries, seed })[0];
// The announced names by thread ID, straight from the generated entries.
const vsGenerated = (entries, seed) => {
  const g = LOGSIM.createGenerator({ format: "default", scenarios: ["devices"], seed });
  return Array.from({ length: entries }, () => g.next());
};
const vsNames = (entries, seed) => {
  const names = {};
  vsGenerated(entries, seed).forEach(e => { const m = /^Hello, this is Server '(.+)'$/.exec(e.msg); if (m && !names[e.thread]) names[e.thread] = m[1]; });
  return names;
};
const vsSetRules = (w, rules) => { w.findLogFormat("fmt-default").substitutions = rules; };
const vsRowThreads = d => [...d.querySelectorAll("#tableRows .col-thread")].map(c => c.textContent);

await withApp(async (w, d, T) => {
  section("value-substitution a. Rules survive the format export/import/session carriers; invalid ones are dropped");
  await waitForFormatConfig(T);
  const ok = { id: "r1", column: "thread", pattern: "Hello, this is Server '[*:word]'", glob: "app-*.log" };
  const bad = [
    { id: "b1", column: "message", pattern: "Hello [*:word]" },            // message column is not substitutable
    { id: "b2", column: "time", pattern: "Hello [*:word]" },
    { id: "b3", column: "thread", pattern: "Hello [*:word] [*:int]" },     // two placeholders
    { id: "b4", column: "thread", pattern: "no placeholder" },
    { id: "b5", column: "thread" },                                         // no pattern
    { id: "b6", column: "", pattern: "x [*:word]" },
    null, "x",
  ];
  const src = { name: "Subst fmt", mode: "regex", regex: "(?<ts>\\d+)\\t(?<level>\\w+)\\t(?<message>.*)", tsFormat: "yyyy", levels: ["INFO"], substitutions: [ok, ...bad] };
  const parsed = w.normalizeLogFormatExport(src, []);
  assert(!parsed.error, "the format with rules normalizes, got " + parsed.error);
  assert(JSON.stringify(parsed.logFormat.substitutions) === JSON.stringify([ok]), "only the valid rule is kept (with its glob), got " + JSON.stringify(parsed.logFormat.substitutions));
  const none = w.normalizeLogFormatExport(Object.assign({}, src, { substitutions: bad }), []);
  assert(!("substitutions" in none.logFormat), "a list without a valid rule leaves no field");
  assert(w.eval("LOG_FORMAT_EXPORT_FIELDS").includes("substitutions"), "substitutions is an export field");
  const id = await w.ensureSessionLogFormat(src);
  assert(id && T.state.logFormats.find(f => f.id === id).substitutions.length === 1, "a session record's logFormat keeps its rules");
  const fmt = T.state.logFormats.find(f => f.id === id);
  const exported = w.serializeLogFormatExport(id);
  assert(JSON.stringify(exported.logFormat.substitutions) === JSON.stringify([ok]), "the .logformat.json export carries the rules");
  assert(w.parseLogFormatExport(JSON.stringify(exported)).logFormat.substitutions.length === 1, "...and imports them again");
  assert(fmt.substitutions[0].glob === "app-*.log", "glob preserved");
});

await withApp(async (w, d, T) => {
  section("value-substitution b. Engine: whole file, retroactive, first name wins, unannounced IDs stay");
  await waitForFormatConfig(T);
  vsSetRules(w, [vsRule]);
  const file = vsDevices(300, 7);
  const f = await w.addFile(file.name, file.text, () => {});
  const names = vsNames(300, 7);
  assert(Object.keys(names).length === 3, "sanity: three servers announce a name, got " + JSON.stringify(names));
  assert(f._sub && f._sub.size === 3, "three mappings were built, got " + (f._sub && f._sub.size));
  const ids = [...new Set(f.entries.map(e => e.thread))];
  assert(ids.length === 4, "sanity: four thread IDs");
  for (const e of f.entries) {
    const want = names[e.thread] || e.thread;
    if (w.entryColumnValue(e, "thread") !== want) throw new Error("thread " + e.thread + " shows " + w.entryColumnValue(e, "thread") + ", expected " + want);
  }
  assert(true, "every entry (also the lines before the announcement) shows its server's name; the unannounced ID stays");
  const first = f.entries.find(e => names[e.thread]);
  assert(f.entries.indexOf(first) < f.entries.findIndex(e => /^Hello, this is Server/.test(e.message)), "sanity: lines of a named server exist before its announcement");
  assert(f.entries.every(e => e.thread.startsWith("srv-")), "the raw entry.thread is never rewritten");
  assert(w.entryRawColumnValue(first, "thread") === first.thread && w.entryAltColumnValue(first, "thread") === first.thread, "the alternative value of a named cell is the original");
  const plain = f.entries.find(e => !names[e.thread]);
  assert(w.entryAltColumnValue(plain, "thread") === "", "an unnamed cell has no alternative");

  // A later rule naming the same ID never replaces the first name.
  const g = await w.addFile("sim-second.log", file.text, () => {});
  await w.setFormatSubstitutions("fmt-default", [vsRule, { id: "sub-2", column: "thread", pattern: "Hello, [*:word]" }]);
  assert(g._sub.size === 3 && g.entries.every(e => w.entryColumnValue(e, "thread") === (names[e.thread] || e.thread)), "first name wins for an ID, also across rules");
});

await withApp(async (w, d, T) => {
  section("value-substitution c. Rows, Facets, Details and export show the names; tooltips show the other value");
  await waitForFormatConfig(T);
  vsSetRules(w, [vsRule]);
  const file = vsDevices(300, 7);
  const f = await w.addFile(file.name, file.text, () => {});
  const names = vsNames(300, 7);
  T.state.activeId = f.id; w.render();
  const shown = vsRowThreads(d);
  assert(shown.length > 0 && shown.every(t => /^(control|storage|gateway|srv-[0-9a-f]{8})$/.test(t)), "row cells show names or unannounced IDs, got " + [...new Set(shown)].join(","));
  const named = [...d.querySelectorAll("#tableRows .col-thread")].find(c => names[Object.keys(names).find(id => names[id] === c.textContent)]);
  if (named) {
    const id = Object.keys(names).find(k => names[k] === named.textContent);
    assert(named.title === id, "the tooltip of a named cell is the original ID, got " + named.title);
  }
  const unnamed = [...d.querySelectorAll("#tableRows .col-thread")].find(c => /^srv-/.test(c.textContent));
  if (unnamed) assert(unnamed.title === unnamed.textContent, "an unnamed cell's tooltip stays its own value");
  assert(!d.querySelector("#tableRows .col-thread [class*=subst]"), "no visual marker on a substituted value");

  // Facets: grouped by name, tooltip = original.
  fireClick(d.querySelector("#lowerTabFacets"), w);
  await waitFor(() => d.querySelector('.facet-section[data-col="thread"] .facet-value'));
  const rows = [...d.querySelectorAll('.facet-section[data-col="thread"] .facet-value')];
  const facetNames = rows.map(r => r.querySelector(".facet-value-name").textContent);
  assert(facetNames.length === 4 && ["control", "storage", "gateway"].every(n => facetNames.includes(n)), "Facets group by name, got " + facetNames);
  const ctl = rows.find(r => r.querySelector(".facet-value-name").textContent === "control");
  const ctlId = Object.keys(names).find(k => names[k] === "control");
  assert(ctl.title.startsWith(ctlId + " "), "a facet value's tooltip names the original ID, got " + ctl.title);
  const sumCounts = rows.reduce((n, r) => n + +r.querySelector(".facet-count").textContent.replace(/\D/g, ""), 0);
  assert(sumCounts === 300, "the counts add up to all entries, got " + sumCounts);

  // Details: "name (original)", Raw untouched.
  const row = f.entries.find(e => e.thread === ctlId);
  T.state.selectedId = row.id; w.updateDetailPanel();
  const meta = d.querySelector("#detailMeta").textContent;
  assert(meta.includes("control (" + ctlId + ")"), "Details show 'name (original)', got " + meta);
  assert(row.raw.includes('"' + ctlId + '"'), "the raw line keeps the original");

  // Export cell value.
  assert(w.exportCellValue(row, "thread") === "control", "export columns use the displayed value");
});

await withApp(async (w, d, T) => {
  section("value-substitution d. Filters on the column match the name OR the original");
  await waitForFormatConfig(T);
  vsSetRules(w, [vsRule]);
  const file = vsDevices(300, 7);
  const f = await w.addFile(file.name, file.text, () => {});
  const names = vsNames(300, 7);
  const ctlId = Object.keys(names).find(k => names[k] === "control");
  const total = f.entries.filter(e => e.thread === ctlId).length;
  assert(total > 3, "sanity: the control server logs several lines, got " + total);
  const byName = w.createFilterNode(f.id, "text", "control", false, null, true, ["thread"]);
  const byId = w.createFilterNode(f.id, "text", ctlId, false, null, true, ["thread"]);
  assert(w.getEntries(byName.id).length === total, "a thread filter for the name matches all that server's lines, got " + w.getEntries(byName.id).length);
  assert(w.getEntries(byId.id).length === total, "a filter for the original ID keeps working");
  const wild = w.createFilterNode(f.id, "text", "[*:word]", false, null, true, ["thread"]);
  assert(w.getEntries(wild.id).length === f.entries.length, "a column-restricted wildcard pattern reads the displayed value");
  const rx = w.createFilterNode(f.id, "text", "^control$", false, null, true, ["thread"], true);
  assert(w.getEntries(rx.id).length === total, "a regex restricted to the column matches the name");
  const facetNode = w.createFacetFilterNode(f.id, { key: "thread", label: "Thread" }, "control", false);
  assert(facetNode && w.getEntries(facetNode.id).length === total, "the filter a facet click creates matches the named server");
  // Sorting by the Thread column uses the displayed names.
  const sorted = f.entries.slice().sort(w.entryComparator("thread", "asc", null)).map(e => w.entryColumnValue(e, "thread"));
  assert(sorted.every((v, i) => i === 0 || sorted[i - 1].localeCompare(v) <= 0), "sorting by the column follows the shown names");
});

await withApp(async (w, d, T) => {
  section("value-substitution e. The 'Show original values' toggle: visibility, effect, persistence");
  await waitForFormatConfig(T);
  const btn = () => d.querySelector("#filteredToolbar .toggle-substitutions");
  const btn2 = () => d.querySelector("#contextToolbar .toggle-substitutions");
  const plainFile = vsDevices(300, 7);
  const a = await w.addFile("plain-" + plainFile.name, plainFile.text, () => {});
  T.state.activeId = a.id; w.render();
  assert(btn().classList.contains("hidden") && btn2().classList.contains("hidden"), "hidden while the scope has no substitution");

  vsSetRules(w, [Object.assign({}, vsRule, { glob: "sim-*" })]); // rules are per format: the glob keeps the plain-* file out
  const b = await w.addFile(vsDevices(300, 7).name, vsDevices(300, 7).text, () => {});
  T.state.activeId = b.id; w.render();
  assert(!btn().classList.contains("hidden") && !btn2().classList.contains("hidden"), "visible in both toolbars once the scope has a substituted value");
  assert(btn().querySelector("svg") && btn().title === "Show original values" || btn().querySelector(".tb-label"), "the button has its icon and label");
  assert(btn().getAttribute("aria-pressed") === "false" && !btn().classList.contains("active"), "not pressed by default");
  const names = vsNames(300, 7);
  assert(vsRowThreads(d).some(t => Object.values(names).includes(t)), "names shown by default");

  fireClick(btn(), w);
  assert(btn().classList.contains("active") && btn().getAttribute("aria-pressed") === "true" && btn2().classList.contains("active"), "pressed in both toolbars");
  assert(vsRowThreads(d).every(t => /^srv-[0-9a-f]{8}$/.test(t)), "pressed: rows show the original IDs");
  assert(w.localStorage.getItem("philogg-show-original-values") === "1", "persisted");
  const ctlId = Object.keys(names).find(k => names[k] === "control");
  const row = b.entries.find(e => e.thread === ctlId);
  T.state.selectedId = row.id; w.updateDetailPanel();
  assert(d.querySelector("#detailMeta").textContent.includes(ctlId + " (control)"), "pressed: Details show 'original (name)', got " + d.querySelector("#detailMeta").textContent);
  assert(w.exportCellValue(row, "thread") === ctlId, "pressed: export columns use the originals");
  fireClick(d.querySelector("#lowerTabFacets"), w);
  await waitFor(() => d.querySelector('.facet-section[data-col="thread"] .facet-value'));
  let fn = [...d.querySelectorAll('.facet-section[data-col="thread"] .facet-value-name')].map(n => n.textContent);
  assert(fn.length === 4 && fn.every(n => /^srv-/.test(n)), "pressed: Facets list the IDs, got " + fn);
  const ctlFacet = [...d.querySelectorAll('.facet-section[data-col="thread"] .facet-value')].find(r => r.querySelector(".facet-value-name").textContent === ctlId);
  assert(ctlFacet.title.startsWith("control "), "pressed: the facet tooltip shows the name, got " + ctlFacet.title);

  // Plain file in the same session: the toggle is scope-bound.
  T.state.activeId = a.id; w.render();
  assert(btn().classList.contains("hidden"), "hidden again on a file without substitution");

  fireClick(d.querySelector("#filteredToolbar .toggle-substitutions"), w); // hidden button, still wired: toggles back
  assert(w.localStorage.getItem("philogg-show-original-values") === "0", "toggled back and persisted");
  T.state.activeId = b.id; w.render();
  fn = [...d.querySelectorAll('.facet-section[data-col="thread"] .facet-value-name')].map(n => n.textContent);
  assert(fn.includes("control"), "released: Facets group by name again, got " + fn);
});

await withApp(async (w, d, T) => {
  section("value-substitution f. The pressed state is restored from localStorage");
  w.localStorage.setItem("philogg-show-original-values", "1");
  w.initShowOriginalValuesSetting();
  assert(w.eval("showOriginalValues") === true, "a persisted '1' restores the pressed state");
  w.localStorage.setItem("philogg-show-original-values", "0");
  w.initShowOriginalValuesSetting();
  assert(w.eval("showOriginalValues") === false, "'0' restores released");
});

await withApp(async (w, d, T) => {
  section("value-substitution g. Rule glob: only files whose name matches; a meta-format stream uses the physical name");
  await waitForFormatConfig(T);
  vsSetRules(w, [Object.assign({}, vsRule, { glob: "sim-*.log" }), { id: "sub-2", column: "location", pattern: "Disk usage [*:int]%", glob: "never-*.log" }]);
  const file = vsDevices(200, 7);
  const f = await w.addFile(file.name, file.text, () => {});
  assert(f._sub && f._sub.size === 3, "a file matching the glob gets its names, got " + (f._sub && f._sub.size));
  const g = await w.addFile("other-" + file.name.replace(/^sim-/, ""), file.text, () => {});
  assert(!g._sub || g._sub.size === 0, "a file whose name does not match the glob gets none");
  assert(g.entries.every(e => w.entryColumnValue(e, "thread") === e.thread), "...and shows the raw IDs");
  const virtual = { type: "file", formatId: "fmt-default", name: "Simulator [x]", physicalName: file.name, entries: [] };
  const r = w.fileSubstitutionRules(virtual);
  assert(r && r.rules.length === 1 && r.rules[0].column === "thread", "a meta-format stream matches the glob against the physical file name");
});

await withApp(async (w, d, T) => {
  section("value-substitution h. Changing the rules rebuilds the maps and the views");
  await waitForFormatConfig(T);
  const file = vsDevices(300, 7);
  const f = await w.addFile(file.name, file.text, () => {});
  T.state.activeId = f.id; w.render();
  assert(!f._sub, "no rules: no map");
  const before = vsRowThreads(d).join();
  assert(await w.setFormatSubstitutions("fmt-default", [vsRule, { id: "x", column: "thread", pattern: "no placeholder" }]), "setFormatSubstitutions accepts the list");
  assert(w.findLogFormat("fmt-default").substitutions.length === 1, "invalid rules are dropped from the list");
  assert(f._sub && f._sub.size === 3, "the loaded file got its map without a reload");
  assert(vsRowThreads(d).join() !== before && vsRowThreads(d).some(t => /^(control|storage|gateway)$/.test(t)), "the rows re-rendered with names");
  const node = w.createFilterNode(f.id, "text", "control", false, null, true, ["thread"]);
  const n1 = w.getEntries(node.id).length;
  assert(n1 > 0, "the filter on the name matches");
  await w.setFormatSubstitutions("fmt-default", []);
  assert(!f._sub && !("substitutions" in w.findLogFormat("fmt-default")), "removing the rules clears the map and the field");
  assert(w.getEntries(node.id).length === 0, "the cached filter result was dropped with the map");
  assert(f.entries.every(e => e.sub === undefined), "no entry keeps a stale map");
  assert(vsRowThreads(d).every(t => /^srv-/.test(t)), "rows show the IDs again");
});

await withApp(async (w, d, T) => {
  section("value-substitution i. Live tail: a later announcement names earlier lines and re-renders");
  await waitForFormatConfig(T);
  vsSetRules(w, [vsRule]);
  const file = vsDevices(200, 7);
  const lines = file.text.split("\n");
  const cut = lines.findIndex(l => l.includes("Hello, this is Server")); // before the first announcement
  const initial = lines.slice(0, cut).join("\n") + "\n";
  let text = initial;
  const handle = {
    async getFile() {
      const t = text;
      const blob = new w.Blob([t]);
      Object.defineProperty(blob, "size", { get: () => t.length, configurable: true });
      blob.slice = start => { const s = t.slice(start); const b = new w.Blob([s]); b.text = async () => s; return b; };
      blob.text = async () => t;
      return blob;
    },
  };
  const f = await w.addFile(file.name, initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false };
  T.state.activeId = f.id; w.render();
  const btn = () => d.querySelector("#filteredToolbar .toggle-substitutions");
  assert(!f._sub || f._sub.size === 0, "before the first announcement nothing is named");
  assert(btn().classList.contains("hidden"), "...and the toggle is hidden");
  const node = w.createFilterNode(f.id, "text", "gateway", false, null, true, ["thread"]);
  assert(w.getEntries(node.id).length === 0, "the name matches nothing yet");
  const earlier = f.entries.length;
  text = file.text;
  await w.tailTick();
  assert(f.entries.length > earlier, "the tail picked up the rest, got " + f.entries.length);
  const names = vsNames(200, 7);
  assert(f._sub && f._sub.size === Object.keys(names).length, "the announcements added their names, got " + (f._sub && f._sub.size));
  const gwId = Object.keys(names).find(k => names[k] === "gateway");
  const gwLines = f.entries.filter(e => e.thread === gwId).length;
  assert(gwLines > 0 && w.getEntries(node.id).length === gwLines, "the cached filter was refreshed: it now matches ALL the server's lines, incl. earlier ones, got " + w.getEntries(node.id).length + "/" + gwLines);
  assert(!btn().classList.contains("hidden"), "the toggle appears");
  assert(vsRowThreads(d).some(t => Object.values(names).includes(t)), "the rows re-rendered with the names");
});

await withApp(async (w, d, T) => {
  section("value-substitution j. A merge shows each entry with its source's map");
  await waitForFormatConfig(T);
  vsSetRules(w, [vsRule]);
  const a = vsDevices(150, 7), b = vsDevices(150, 8);
  const fa = await w.addFile("sim-a.log", a.text, () => {});
  const fb = await w.addFile("sim-b.log", b.text, () => {});
  const namesA = vsNames(150, 7), namesB = vsNames(150, 8);
  const merged = await w.mergeFiles([fa.id, fb.id]);
  T.state.activeId = merged.id; w.render();
  assert(!merged._sub, "the merge itself has no map");
  assert(merged.entries.length === 300, "sanity: 300 entries merged");
  for (const e of merged.entries) {
    const want = namesA[e.thread] || namesB[e.thread] || e.thread;
    if (w.entryColumnValue(e, "thread") !== want) throw new Error("merged entry " + e.thread + " shows " + w.entryColumnValue(e, "thread") + ", expected " + want);
  }
  assert(true, "every merged entry shows the name from its own source's map");
  assert(!d.querySelector("#filteredToolbar .toggle-substitutions").classList.contains("hidden"), "the toggle is visible on the merge");
  fireClick(d.querySelector("#lowerTabFacets"), w);
  await waitFor(() => d.querySelector('.facet-section[data-col="thread"] .facet-value'));
  const fn = [...d.querySelectorAll('.facet-section[data-col="thread"] .facet-value-name')].map(n => n.textContent);
  assert(fn.includes("control") && fn.includes("storage") && fn.includes("gateway"), "the merge's Facets group by name, got " + fn);
});
