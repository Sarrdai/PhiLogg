// GROUP 297 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 297 — JSON Lines format mode (FEATURE_BACKLOG.md #82): a format
   with mode "json" reads each "{"-line as one object; time/level/message
   come from configurable keys, custom columns from paths (nested dots,
   [n] indexes, ["a.b"] escapes, a literal dotted key winning first);
   objects/arrays land as JSON text; the worker source parses identically. */
group(297);
const JSON_297_FMT = {
  id: "fmt-json297", name: "JSON 297", mode: "json", builtin: false, edited: false, createdAt: 0,
  tsKey: "@t", levelKey: "@l", messageKey: "@m", tsFormat: "",
  columnDefs: [
    { key: "ctx_userId", kind: "custom", label: "ctx.userId", path: "ctx.userId" },
    { key: "ctx_req_id", kind: "custom", label: "ctx.req.id", path: "ctx.req.id" },
    { key: "tags", kind: "custom", label: "tags", path: "tags" },
    { key: "tags_0", kind: "custom", label: "tags[0]", path: "tags[0]" },
    { key: "http_status", kind: "custom", label: "http.status", path: "http.status" },
    { key: "odd", kind: "custom", label: '["a.b"].c', path: '["a.b"].c' },
  ],
};
const JSON_297_TEXT = [
  '{"@t":"2026-09-27T10:15:02.113","@l":"Error","@m":"Order failed","ctx":{"userId":4711,"req":{"id":"r-93a"}},"tags":["db","retry"],"http.status":500,"a.b":{"c":true}}',
  "   at Orders.Submit() line 42",
  '{"@t":1790000000,"@l":"Information","@m":"Retry ok","ctx":{"userId":12},"http":{"status":200}}',
  "{not json at all",
].join("\n") + "\n";
await withApp(async (w, d, T) => {
  section("297a. JSON path parsing/resolution and column keys");
  const segs = w.parseJsonPath('ctx.items[1]["a.b"][-1]');
  assert(JSON.stringify(segs) === JSON.stringify([{ name: "ctx" }, { name: "items" }, { index: 1 }, { name: "a.b", quoted: true }, { index: -1 }]), "segments: " + JSON.stringify(segs));
  const obj = { ctx: { items: [0, { "a.b": [1, 2, 3] }] }, "http.status": 404, http: { status: 200 }, "x.y": { z: 1 } };
  const get = p => w.resolveJsonPath(obj, w.parseJsonPath(p), 0);
  assert(get('ctx.items[1]["a.b"][-1]') === 3, "nested dots, index, quoted key, negative index");
  assert(get("http.status") === 404, "a literal dotted key wins over the nested path");
  assert(get("x.y.z") === 1, "a literal dotted prefix is found, the rest resolved below it");
  assert(get("ctx.nope") === undefined && get("ctx.items[5]") === undefined && get("ctx[0]") === undefined, "missing paths resolve to undefined");
  assert(w.jsonValueText([1, "a"]) === '[1,"a"]' && w.jsonValueText(null) === "" && w.jsonValueText(false) === "false", "values as text");
  const taken = new Set();
  assert(w.jsonColumnKey("ctx.req.id", taken) === "ctx_req_id" && w.jsonColumnKey("ctx_req.id", taken) === "ctx_req_id_2", "sanitized, de-duplicated keys");
  assert(w.jsonColumnKey("message", taken) === "message_" && w.jsonColumnKey('["0x"]', taken) === "f_0x", "reserved and digit-leading keys");
  assert(w.parseJsonTimestamp(1790000000, null) === 1790000000000 && w.parseJsonTimestamp(1790000000123, null) === 1790000000123, "epoch seconds and ms");
  assert(w.parseJsonTimestamp("1790000000", null) === 1790000000000, "an all-digit string is epoch too");
});

await withApp(async (w, d, T) => {
  section("297b. A file under a JSON format: entries, continuation line, unparsable line");
  await waitForFormatConfig(T);
  T.state.logFormats.push(JSON.parse(JSON.stringify(JSON_297_FMT)));
  T.state.formatRules.push({ id: "rule-json297", glob: "*.jsonl", formatId: JSON_297_FMT.id, order: 0, createdAt: 0 });
  const f = await w.addFile("app.jsonl", JSON_297_TEXT, () => {});
  assert(f.formatId === JSON_297_FMT.id && f.entries.length === 3, "3 entries, got " + f.entries.length);
  const [a, b, c] = f.entries;
  assert(a.level === "ERROR" && a.ts === new Date(2026, 8, 27, 10, 15, 2, 113).getTime(), "level upper-cased, ISO time parsed");
  assert(a.message === "Order failed\n   at Orders.Submit() line 42", "a non-JSON line continues the entry's message, got " + JSON.stringify(a.message));
  assert(a.fields.ctx_userId === "4711" && a.fields.ctx_req_id === "r-93a" && a.fields.tags === '["db","retry"]' && a.fields.tags_0 === "db", "nested, array and index columns");
  assert(a.fields.http_status === "500" && b.fields.http_status === "200", "literal dotted key first, nested path otherwise");
  assert(a.fields.odd === "true", "an escaped dotted key segment");
  assert(b.ts === 1790000000000 && w.levelBucket(b.level, b.formatId) === "INFO" && !("ctx_req_id" in b.fields), "epoch time, INFORMATION -> INFO, a missing path adds no field");
  assert(c.message === "{not json at all" && c.level === "INFO" && isNaN(c.ts), "an unparsable object line keeps the whole line as its message");
  assert(w.entryColumnValue(a, "ctx_req_id") === "r-93a", "custom columns read through entryColumnValue");
  assert(w.nativeFormatSpec(JSON_297_FMT) === null, "a JSON format never goes to the native parser");
});

await withApp(async (w, d, T) => {
  section("297c. The worker source parses a JSON format identically");
  const posted = [];
  const sandboxSelf = {};
  const ctx = vm.createContext({ self: sandboxSelf, postMessage: msg => posted.push(msg) });
  vm.runInContext(w.buildLogParseWorkerSrc(), ctx);
  sandboxSelf.onmessage({ data: { text: JSON_297_TEXT, fmt: JSON_297_FMT } });
  const entries = posted.filter(m => m.type === "batch").flatMap(m => w.decodeNativeBatch(m.buf, m.strings).entries);
  assert(entries.length === 3, "3 entries from the worker, got " + entries.length);
  assert(entries[0].message.startsWith("Order failed\n") && entries[0].fields.ctx_req_id === "r-93a" && entries[0].fields.tags === '["db","retry"]', "fields survive the binary batch");
  assert(entries[1].ts === 1790000000000 && entries[2].message === "{not json at all", "timestamps and fallback lines match the main-thread parse");
});

await withApp(async (w, d, T) => {
  section("297d. Format dialog: JSON examples switch to JSON Lines, keys guessed, columns picked, saved, reopened, exported");
  await waitForFormatConfig(T);
  const change = elx => elx.dispatchEvent(new w.Event("change", { bubbles: true }));
  w.openFormatEditDialog(null);
  w.fwzAppendText(JSON_297_TEXT);
  assert(d.querySelector("#formatEditModeJson").classList.contains("active"), "JSON example lines switch a new format to JSON Lines");
  assert(isVisible(d.querySelector("#fwzJsonCols"), w) && !isVisible(d.querySelector("#fwzRegexField"), w) && !isVisible(d.querySelector("#fwzRegexCols"), w) && !isVisible(d.querySelector("#fwzClearMarks"), w),
    "the key panel replaces the marked columns, the regex field and the marking tools");
  assert(d.querySelector("#fwzJsonTsKey").value === "@t" && d.querySelector("#fwzJsonLevelKey").value === "@l" && d.querySelector("#fwzJsonMessageKey").value === "@m", "Serilog compact keys guessed");
  const paths = [...d.querySelectorAll("#fwzJsonKeys input")].map(cb => cb.dataset.path);
  assert(JSON.stringify(paths) === JSON.stringify(["ctx.userId", "ctx.req.id", "tags", '["http.status"]', '["a.b"].c', "http.status"]), "detected leaf paths, mapped keys left out: " + JSON.stringify(paths));
  const cb = p => [...d.querySelectorAll("#fwzJsonKeys input")].find(x => x.dataset.path === p);
  cb('["a.b"].c').checked = false;
  change(cb('["a.b"].c'));
  d.querySelector("#fwzJsonPathNew").value = "tags[0]";
  fireClick(d.querySelector("#fwzJsonPathAddBtn"), w);
  const head = [...d.querySelectorAll("#fwzPreview .fwz-prev-head span")].map(x => x.textContent);
  assert(head.includes("tags[0]") && !head.includes('["a.b"].c') && head.includes("ctx.req.id"), "the preview shows the picked columns: " + head.join(","));
  const firstRow = d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)")[0];
  assert(firstRow && firstRow.textContent.includes("r-93a") && firstRow.textContent.includes("Order failed"), "the preview parses the examples");
  d.querySelector("#formatEditName").value = "Serilog JSON";
  await w.saveFormatEdit();
  const fmt = T.state.logFormats.find(f => f.name === "Serilog JSON");
  assert(fmt && fmt.mode === "json" && fmt.tsKey === "@t" && fmt.levelKey === "@l" && fmt.messageKey === "@m" && fmt.regex === "", "saved as a JSON format");
  assert(fmt.columnDefs.map(c => c.path).join(",") === 'ctx.userId,ctx.req.id,tags,["http.status"],http.status,tags[0]', "column paths saved: " + fmt.columnDefs.map(c => c.path).join(","));
  assert(fmt.columnDefs.every(c => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c.key)) && new Set(fmt.columnDefs.map(c => c.key)).size === fmt.columnDefs.length, "keys are unique identifiers");
  assert(fmt.sampleSetup && fmt.sampleSetup.lines.length === 4 && fmt.levels.some(l => l.name === "ERROR"), "examples and levels saved");
  const keyBefore = fmt.columnDefs.find(c => c.path === "tags[0]").key;

  w.openFormatEditDialog(fmt.id);
  assert(d.querySelector("#formatEditModeJson").classList.contains("active") && d.querySelector("#fwzJsonTsKey").value === "@t", "Edit reopens the JSON kind with its keys");
  assert(!cb('["a.b"].c').checked && cb("tags[0]").checked, "unchecked stays unchecked, added path stays checked");
  await w.saveFormatEdit();
  assert(T.state.logFormats.find(f => f.id === fmt.id).columnDefs.find(c => c.path === "tags[0]").key === keyBefore, "column keys stay stable across edits");

  const exported = w.serializeLogFormatExport(fmt.id);
  const parsed = w.parseLogFormatExport(JSON.stringify(exported));
  assert(parsed && !parsed.error && parsed.logFormat.mode === "json" && parsed.logFormat.tsKey === "@t" && parsed.logFormat.columnDefs.some(c => c.path === "tags[0]"), "export/import carries the JSON keys and paths");

  T.state.formatRules.push({ id: "rule-297d", glob: "*.jsonl", formatId: fmt.id, order: 0, createdAt: 0 });
  const f = await w.addFile("svc.jsonl", JSON_297_TEXT, () => {});
  const k = fmt.columnDefs.find(c => c.path === "ctx.req.id").key;
  assert(f.entries[0].fields[k] === "r-93a", "a file under the saved format fills the columns");
  T.state.activeId = f.id;
  w.render();
  const cell = d.querySelector('#tableBody [data-col="' + k + '"]');
  assert(cell && cell.textContent === "r-93a", "the column shows in the log table");
});
