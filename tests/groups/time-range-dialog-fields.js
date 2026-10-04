// GROUP time-range-dialog-fields — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP time-range-dialog-fields — time-range dialog: time-only text fields
   Origin: 2026-10-04 (person-requested, usability round C step 2). The two
   datetime-local inputs became HH:MM:SS(.mmm) text fields; the date is implied
   by a chip when the root file lies on one day, else one date input per bound;
   -1s/+1s buttons and ArrowUp/Down nudge; live "Duration … · N entries" line;
   plain-text files get whole line-number fields.
   ============================================================ */
group("time-range-dialog-fields");

const trType = (w, input, text) => { input.value = text; input.dispatchEvent(new w.Event("input", { bubbles: true })); };
const trKey = (w, input, key, opts = {}) => input.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));

await withApp(async (w, d, T) => {
  section("time-range-dialog-fields a. Single-day file: chip, prefill, typing, errors");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const q = s => d.querySelector(s);
  const from = q("#timeRangeFromInput"), to = q("#timeRangeToInput");
  w.openTimeRangeDialog("create", f.id, { from: f.entries[5].ts, to: f.entries[20].ts });
  assert(from.value === "10:00:05.000" && to.value === "10:00:20.000", "prefill HH:MM:SS.mmm: " + from.value + " / " + to.value);
  assert(from.type === "text" && from.getAttribute("inputmode") === "decimal" && from.getAttribute("autocomplete") === "off", "text field, decimal keypad, no autocomplete");
  assert(!q("#timeRangeDateChip").classList.contains("hidden") && q("#timeRangeDateChip").textContent === "Mon 2024-01-15", "date chip: " + q("#timeRangeDateChip").textContent);
  assert(q("#timeRangeFromDateRow").classList.contains("hidden") && q("#timeRangeToDateRow").classList.contains("hidden"), "no date inputs on a one-day file");
  assert(q("#timeRangeMeta").textContent === "Duration 15.0s · 16 entries", "meta: " + q("#timeRangeMeta").textContent);

  for (const [txt, ms] of [["10:00:07", 7000], ["10:00", 0], ["10:00:07.5", 7500], ["10:00:07.25", 7250], ["10:00:07.123", 7123]]) {
    trType(w, from, txt);
    assert(w.timeRangeDialogBound("from") === new Date(2024, 0, 15, 10, 0, 0, 0).getTime() + ms, "accepts '" + txt + "', got " + w.timeRangeDialogBound("from"));
  }
  trType(w, from, "10:00:05"); trType(w, to, "10:00:09");
  assert(q("#timeRangeMeta").textContent === "Duration 4.0s · 5 entries", "meta follows typing: " + q("#timeRangeMeta").textContent);
  trType(w, to, "");
  assert(q("#timeRangeMeta").textContent === "25 entries", "open bound: count only: " + q("#timeRangeMeta").textContent);

  trType(w, from, "25:00:00");
  fireClick(q("#timeRangeDialogSubmit"), w);
  assert(!q("#timeRangeDialogError").classList.contains("hidden") && q("#timeRangeDialogError").textContent === "Use HH:MM:SS(.mmm)", "invalid text -> inline error");
  assert(!q("#timeRangeDialog").classList.contains("hidden") && f.children.length === 0, "no submit on invalid text");
  trType(w, from, "garbage");
  fireClick(q("#timeRangeDialogSubmit"), w);
  assert(q("#timeRangeDialogError").textContent === "Use HH:MM:SS(.mmm)" && f.children.length === 0, "garbage rejected");
  trType(w, from, "");
  assert(q("#timeRangeDialogError").classList.contains("hidden"), "error clears on input");
  fireClick(q("#timeRangeDialogSubmit"), w);
  assert(q("#timeRangeDialogError").textContent === "Set at least one of From / To.", "both empty -> existing message");

  trType(w, from, "10:00:03"); trType(w, to, "10:00:10");
  trKey(w, to, "Enter");
  assert(f.children.length === 1 && q("#timeRangeDialog").classList.contains("hidden"), "Enter in a field submits");
  const node = T.state.nodes[f.children[0]];
  assert(node.value.from === f.entries[3].ts && node.value.to === f.entries[10].ts, "created via applyTimeWindow: " + JSON.stringify(node.value));
});

await withApp(async (w, d, T) => {
  section("time-range-dialog-fields b. Nudge buttons, arrow keys, empty fields start at file bounds");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const q = s => d.querySelector(s);
  const from = q("#timeRangeFromInput"), to = q("#timeRangeToInput");
  w.openTimeRangeDialog("create", f.id, null);
  assert(from.value === "" && to.value === "" && q("#timeRangeMeta").textContent === "", "empty prefill, empty meta");
  fireClick(q("#timeRangeFromPlus"), w);
  assert(from.value === "10:00:00.000", "+1s on empty From starts at the first entry: " + from.value);
  fireClick(q("#timeRangeFromPlus"), w);
  assert(from.value === "10:00:01.000", "then +1s: " + from.value);
  fireClick(q("#timeRangeToMinus"), w);
  assert(to.value === "10:00:29.000", "-1s on empty To starts at the last entry: " + to.value);
  trKey(w, to, "ArrowDown");
  assert(to.value === "10:00:28.000", "ArrowDown -1s: " + to.value);
  trKey(w, to, "ArrowUp", { shiftKey: true });
  assert(to.value === "10:01:28.000", "Shift+ArrowUp +1 min: " + to.value);
  assert(q("#timeRangeFromMinus").textContent === "−1s" && q("#timeRangeToPlus").textContent === "+1s", "button texts");
  assert(q("#timeRangeMeta").textContent === "Duration 1m 27s · 29 entries", "meta after nudges: " + q("#timeRangeMeta").textContent);
});

await withApp(async (w, d, T) => {
  section("time-range-dialog-fields c. Multi-day file: date input per bound");
  const lines = makeLog(0, 30).split("\n");
  const log = lines.map((l, i) => i >= 20 ? l.replace("2024-01-15", "2024-01-16") : l).join("\n");
  const f = await w.addFile("m.log", log, () => {});
  const q = s => d.querySelector(s);
  w.openTimeRangeDialog("create", f.id, { from: f.entries[5].ts, to: f.entries[25].ts });
  assert(q("#timeRangeDateChip").classList.contains("hidden"), "no chip");
  assert(!q("#timeRangeFromDateRow").classList.contains("hidden") && !q("#timeRangeToDateRow").classList.contains("hidden"), "date row per bound");
  assert(q("#timeRangeFromDate").value === "2024-01-15" && q("#timeRangeToDate").value === "2024-01-16", "dates prefilled from the bounds");
  assert(q("#timeRangeFromInput").value === "10:00:05.000" && q("#timeRangeToInput").value === "10:00:25.000", "time-only fields");
  assert(w.timeRangeDialogBound("to") === f.entries[25].ts, "bound combines date input + time");
  q("#timeRangeToDate").value = "2024-01-15";
  q("#timeRangeToDate").dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(w.timeRangeDialogBound("to") === f.entries[19].ts + 6000 && q("#timeRangeMeta").textContent.startsWith("Duration 20.0s"), "changing the date moves the bound: " + q("#timeRangeMeta").textContent);
  fireClick(q("#timeRangeDialogCancel"), w);
  // empty bound prefilled with the file's first / last day
  w.openTimeRangeDialog("create", f.id, null);
  assert(q("#timeRangeFromDate").value === "2024-01-15" && q("#timeRangeToDate").value === "2024-01-16", "empty bounds default to the file's first/last day");
  // single-day file but a prefill on another day -> date inputs
  const g = await w.addFile("s.log", makeLog(0, 10), () => {});
  w.openTimeRangeDialog("create", g.id, { from: new Date(2024, 0, 14, 9, 0, 0).getTime(), to: g.entries[3].ts });
  assert(!q("#timeRangeFromDateRow").classList.contains("hidden") && q("#timeRangeFromDate").value === "2024-01-14", "off-day prefill switches to date inputs");
});

await withApp(async (w, d, T) => {
  section("time-range-dialog-fields d. Edit mode: saves in place, meta counts the parent's entries");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const node = w.createFilterNode(f.id, "timerange", { from: f.entries[5].ts, to: f.entries[10].ts });
  w.render();
  const q = s => d.querySelector(s);
  w.openTimeRangeDialog("edit", node.id, w.timeRangeOfNode(node));
  assert(q("#timeRangeDialogTitle").textContent === "Edit time filter" && q("#timeRangeDialogSubmit").textContent === "Save", "edit title/button");
  assert(q("#timeRangeMeta").textContent === "Duration 5.0s · 6 entries", "meta: " + q("#timeRangeMeta").textContent);
  trType(w, q("#timeRangeToInput"), "10:00:15");
  assert(q("#timeRangeMeta").textContent === "Duration 10.0s · 11 entries", "edit meta counts against the parent: " + q("#timeRangeMeta").textContent);
  fireClick(q("#timeRangeDialogSubmit"), w);
  assert(node.value.to === f.entries[15].ts && f.children.length === 1, "saved in place");
  // reversed bounds swap silently
  w.openTimeRangeDialog("edit", node.id, w.timeRangeOfNode(node));
  trType(w, q("#timeRangeFromInput"), "10:00:25"); trType(w, q("#timeRangeToInput"), "10:00:02");
  fireClick(q("#timeRangeDialogSubmit"), w);
  assert(node.value.from === f.entries[2].ts && node.value.to === f.entries[25].ts, "reversed bounds swapped: " + JSON.stringify(node.value));
});

await withApp(async (w, d, T) => {
  section("time-range-dialog-fields e. Plain-text file: whole line numbers, ±1 line");
  const f = await w.addFile("notes.txt", Array.from({ length: 100 }, (_, i) => "line " + i).join("\n") + "\n", () => {}, "fmt-plaintext");
  const q = s => d.querySelector(s);
  w.openTimeRangeDialog("create", f.id, { from: 5, to: 90 });
  assert(q("#timeRangeFromInput").value === "5" && q("#timeRangeToInput").value === "90", "line numbers shown");
  assert(q("#timeRangeDateChip").classList.contains("hidden") && q("#timeRangeFromDateRow").classList.contains("hidden"), "no date UI");
  assert(q("#timeRangeMeta").textContent === "86 entries", "meta without duration: " + q("#timeRangeMeta").textContent);
  fireClick(q("#timeRangeFromPlus"), w);
  assert(q("#timeRangeFromInput").value === "6", "+1 = one line: " + q("#timeRangeFromInput").value);
  trType(w, q("#timeRangeToInput"), "10:00");
  fireClick(q("#timeRangeDialogSubmit"), w);
  assert(q("#timeRangeDialogError").textContent === "Use a whole line number" && f.children.length === 0, "non-integer rejected");
  trType(w, q("#timeRangeToInput"), "50");
  fireClick(q("#timeRangeDialogSubmit"), w);
  const node = T.state.nodes[f.children[0]];
  assert(node && node.value.from === 6 && node.value.to === 50 && node.name === "line 6 – line 50", "created: " + (node && node.name));
});
