// GROUP 301 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 301 — 2026-09-27 (person-requested): entry detail "Raw | Parsed |
   Pretty" switch (#detailViewTabs — Raw is the entry's original text, every
   physical line, tabs, quotes; persisted; replaces the Format toggle; whole-line
   filter matches marked; a link pair shows each real entry's own raw), the
   location kept in full everywhere (locationShort/formatLocation removed,
   the field is entry.location — detail header, sort), a link pair row
   selected in the table now reaches the detail panel, and an empty []/{}
   right after an identifier (.NET "Object[] arguments") is no embedded
   JSON fragment. Sample data from tools/log-sim (stacktrace/motion
   scenarios, jsonl + plain formats).
   ============================================================ */
group(301);
await withApp(async (w, d, T) => {
  section("301a. The location stays in full: entry.location, detail header, sort");
  const [st] = LOGSIM.generateToStrings({ scenarios: ["stacktrace"], entries: 200, seed: 7 });
  const f = await w.addFile(st.name, st.text, () => {});
  const entry = f.entries.find(e => e.message.startsWith("Unhandled exception"));
  assert(entry && /^C:\\src\\.+\.cs line \d+$/.test(entry.location), "the parsed location is the whole path plus line, got " + (entry && entry.location));
  assert(!("locationShort" in entry) && !("locationFull" in entry) && typeof w.formatLocation === "undefined", "no short/full split any more");
  assert(w.entryColumnValue(entry, "location") === entry.location, "the Location column reads entry.location");
  T.state.activeId = f.id;
  w.render();
  w.selectEntry(entry.id);
  const loc = d.querySelector("#detailMeta .detail-loc");
  assert(loc && loc.textContent === entry.location && loc.title === entry.location, "the detail header shows the full location (and carries it as title), got " + (loc && loc.textContent));
  const sorted = f.entries.slice().sort((a, b) => a.location.localeCompare(b.location));
  T.state.sortColumn = "location"; T.state.sortDir = "asc";
  w.render();
  const firstRow = d.querySelector("#tableRows [data-entry-id]");
  const firstShown = firstRow && f.entries.find(e => e.id === firstRow.dataset.entryId);
  assert(firstShown.location === sorted[0].location, "sorting by Location orders by the full location, first row " + firstShown.location);
  T.state.sortColumn = null;
  w.render();

  section("301b. Raw | Parsed | Pretty: Raw is the original text, unchanged; persisted");
  w.selectEntry(entry.id);
  const tab = v => d.querySelector('#detailViewTabs [data-detail-view="' + v + '"]');
  const msgEl = d.querySelector("#detailMessage");
  assert([...d.querySelectorAll("#detailViewTabs .view-tab")].map(b => b.textContent).join("|") === "Raw|Parsed|Pretty" && !d.querySelector("#detailFormatToggle"),
    "three stages in one switch, the separate Format toggle is gone");
  assert(tab("pretty").classList.contains("active") && T.detailView === "pretty", "Pretty is the default");
  const strip = t => t.split("\n").map(l => l.trim()).join("\n");
  assert(strip(msgEl.textContent) === strip(entry.message), "Pretty on a message without JSON/XML shows the parsed text (stack-trace styling only re-indents frames)");
  tab("raw").click();
  assert(tab("raw").classList.contains("active") && tab("raw").getAttribute("aria-pressed") === "true" && tab("pretty").getAttribute("aria-pressed") === "false", "Raw is now the active tab");
  assert(msgEl.textContent === entry.raw, "Raw shows entry.raw exactly");
  assert(entry.raw.includes("\t\"Unhandled exception") && entry.raw.split("\n").length === entry.message.split("\n").length && entry.raw.split("\n").length > 3,
    "sanity: the raw text keeps the tab-separated header with its quotes and every continuation line");
  assert(msgEl.textContent.includes("\n   at "), "stack-trace indentation kept");
  assert(w.localStorage.getItem("philogg-detail-view") === "raw", "the choice is persisted");
  const other = f.entries.find(e => e !== entry);
  w.selectEntry(other.id);
  assert(msgEl.textContent === other.raw, "Raw stays on for the next selected entry");
  tab("parsed").click();
  assert(msgEl.textContent === other.message && T.detailView === "parsed" && w.localStorage.getItem("philogg-detail-view") === "parsed", "Parsed shows the parsed message");
  w.localStorage.setItem("philogg-detail-view", "raw");
  w.initDetailViewSetting();
  w.updateDetailPanel();
  assert(tab("raw").classList.contains("active") && msgEl.textContent === other.raw, "initDetailViewSetting restores the persisted view");
  w.localStorage.setItem("philogg-detail-view", "bogus");
  w.initDetailViewSetting();
  assert(T.detailView === "pretty", "an unknown stored value falls back to Pretty");
  w.setDetailView("raw");

  section("301c. Raw marks whole-line filter matches, not column-restricted ones");
  const textNode = w.createFilterNode(f.id, "text", "Unhandled exception");
  T.state.activeId = textNode.id;
  w.render();
  w.selectEntry(entry.id);
  const marks = [...msgEl.querySelectorAll("mark")].map(m => m.textContent);
  assert(marks.includes("Unhandled exception") && msgEl.textContent === entry.raw, "the active text filter's match is marked in the raw text, got " + JSON.stringify(marks));
  const threadNode = w.createFilterNode(f.id, "text", entry.thread, false, null, false, ["thread"]);
  T.state.activeId = threadNode.id;
  w.render();
  w.selectEntry(entry.id);
  assert(msgEl.querySelectorAll("mark").length === 0, "a column-restricted filter marks nothing in the raw text");
  assert(d.querySelector("#detailMeta .detail-thread mark"), "sanity: it still marks its own column in the header");

  section("301d. An empty []/{} after an identifier is no embedded fragment");
  const net = entry.message.split("\n").find(l => l.includes("Object[] arguments"));
  assert(net, "sanity: the simulated .NET stack trace has an 'Object[] arguments' frame");
  assert(w.findEmbeddedFragments(entry.message).length === 0, "no fragment detected in the stack trace");
  const html = w.formatMessageWithHighlight(entry.message);
  assert(!/syn-json|syn-xml/.test(html) && html.includes(w.escapeHtml(net.trim())), "the frame stays on one line (stack-trace styling only, no JSON/XML block)");
  assert(w.findEmbeddedFragments("new List{} and int[] x").length === 0, "{} after an identifier is skipped too");
  assert(w.findEmbeddedFragments("items: [] ok").length === 1 && w.findEmbeddedFragments('Response: {"a":[]} done').length === 1,
    "an empty array after punctuation/space and JSON containing [] are still fragments");
  assert(w.findEmbeddedFragments("value Foo[\"x\"] done").length === 1, "a non-empty bracket span after an identifier is judged as before (valid JSON [\"x\"])");
});

await withApp(async (w, d, T) => {
  section("301e. A link pair: reaches the detail panel from the table, Raw shows each entry's own text");
  const [mo] = LOGSIM.generateToStrings({ scenarios: ["motion"], entries: 300, seed: 3 });
  const f = await w.addFile(mo.name, mo.text, () => {});
  const moves = w.createFilterNode(f.id, "text", "Move requested");
  const reached = w.createFilterNode(f.id, "text", "Position reached");
  const link = w.createLinkNode(moves.id, reached.id, "after", 1);
  const child = w.createFilterNode(link.id, "text", "axis");
  T.state.activeId = child.id;
  w.render();
  const row = d.querySelector("#tableRows [data-entry-id]");
  assert(row && row.dataset.entryId.startsWith("pair:"), "sanity: a filter under a link lists pair rows in the table");
  row.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  const pair = w.selectedEntry();
  assert(pair && pair.isPair && pair.id === T.state.selectedId, "the selected pair resolves via selectedEntry()");
  assert(w.currentRowActionEntry() === null, "row actions stay off for a pair row (no entryIndex entry) instead of throwing");
  const msgEl = d.querySelector("#detailMessage");
  w.setDetailView("parsed");
  assert(!d.querySelector("#detailPanel").classList.contains("empty") && msgEl.textContent === pair.message, "Parsed shows the pair's combined message");
  w.setDetailView("raw");
  const parts = [...msgEl.querySelectorAll(".detail-raw-part")].map(p => p.textContent);
  const real = w.getTupleEntries(pair);
  assert(parts.length === 2 && parts[0] === real[0].raw && parts[1] === real[1].raw && !msgEl.textContent.includes("⟶"),
    "Raw shows each real entry's original text in its own block, no synthetic separator, got " + JSON.stringify(parts));
});

await withApp(async (w, d, T) => {
  section("301f. Raw for JSON Lines and plain text: the line as read");
  await waitForFormatConfig(T);
  const [jl] = LOGSIM.generateToStrings({ format: "jsonl", entries: 50, seed: 2 });
  await logsimRegister(w, T, "jsonl", "fmt-sim-jsonl");
  const fj = await w.addFile(jl.name, jl.text, () => {});
  const ej = fj.entries.find(e => e.raw.startsWith("{"));
  T.state.activeId = fj.id;
  w.render();
  w.selectEntry(ej.id);
  w.setDetailView("raw");
  const msgEl = d.querySelector("#detailMessage");
  assert(msgEl.textContent === ej.raw && jl.text.split("\n").includes(ej.raw), "JSON Lines: Raw shows the compact JSON line from the file");
  w.setDetailView("parsed");
  assert(msgEl.textContent !== ej.raw, "sanity: Parsed shows the message key's value instead");
  const [pl] = LOGSIM.generateToStrings({ format: "plain", entries: 30, seed: 2 });
  const fp = await w.addFile(pl.name, pl.text, () => {}, "fmt-plaintext");
  const ep = fp.entries[3];
  T.state.activeId = fp.id;
  w.render();
  w.selectEntry(ep.id);
  w.setDetailView("raw");
  assert(msgEl.textContent === ep.raw && ep.raw === pl.text.split("\n")[3], "plain text: Raw is the line itself");
});
