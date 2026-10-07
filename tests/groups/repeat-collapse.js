// GROUP repeat-collapse — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP repeat-collapse — "Collapse repeats" (×N) in the Filtered view
   (FEATURE_BACKLOG.md #7, step 1: core). Consecutive repeated rows of the
   current view fold into one head row with a ×N badge; rules "Identical" and
   "Same pattern"; toggle + chevron menu; preference in localStorage; disabled
   under a column sort; inline expand via badge click and →/←.
   Data: the log simulator's opt-in `spam` scenario (loops of identical and
   counter lines).
   Origin: 2026-10-07 (person-requested, FEATURE_BACKLOG.md #7).
   ============================================================ */
group("repeat-collapse");

const [rcFile] = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic", "spam"], entries: 1200, seed: 22 });
// Independent reference fold over parsed entries: the row list as [{ head, n }].
function rcRef(entries, opts) {
  opts = opts || {};
  const key = e => [e.formatId, opts.noSource ? "" : e.sourceId, e.level, opts.noThread ? "" : e.thread, e.location, e.method,
    opts.pattern ? w0.normalizeRepeatMessage(e.message) : e.message].join("\u0001");
  const rows = [];
  for (const e of entries) {
    const last = rows[rows.length - 1];
    if (last && last.key === key(e)) last.n++;
    else rows.push({ head: e, n: 1, key: key(e) });
  }
  return rows;
}
let w0 = null; // the window of the section running right now (normalizeRepeatMessage lives there)

async function rcOpen(w, T, text) {
  w0 = w;
  await waitForFormatConfig(T);
  const f = await w.addFile(rcFile.name, text || rcFile.text, () => {});
  T.state.activeId = f.id;
  w.render();
  return f;
}
const rcBtn = d => d.querySelector("#filteredToolbar .toggle-repeat");
const rcRowFor = (d, id) => d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]');
// Scrolls the row list so the entry's row is rendered and returns its element.
function rcShow(w, T, d, id) {
  const idx = T.currentViewEntries.findIndex(e => e.id === id);
  assert(idx !== -1, "entry " + id + " has a row");
  w.scrollToIndex(idx, { center: true });
  return rcRowFor(d, id);
}
const rcBadgeNum = row => { const b = row && row.querySelector(".repeat-badge"); return b ? parseInt(b.textContent.replace(/[^0-9]/g, ""), 10) : null; };

await withApp(async (w, d, T) => {
  section("repeat-collapse a. Off by default; Identical folds the exact loops to one row ×N");
  const f = await rcOpen(w, T);
  const entries = f.entries;
  const toggle = rcBtn(d);
  assert(toggle && !toggle.classList.contains("active"), "the toggle exists in the Filtered toolbar and is off by default");
  assert(T.currentViewEntries.length === entries.length && !d.querySelector("#tableRows .repeat-badge"), "off: one row per entry, no badges");
  const spacerOff = parseFloat(d.querySelector("#tableSpacer").style.height);

  fireClick(toggle, w);
  assert(toggle.classList.contains("active"), "clicking the toggle switches collapsing on");
  const ref = rcRef(entries);
  assert(ref.length < entries.length && ref.some(r => r.n >= 50), "the data holds long identical loops");
  assert(T.currentViewEntries.length === ref.length, "Identical: " + ref.length + " rows for " + entries.length + " entries, got " + T.currentViewEntries.length);
  assert(T.currentViewEntries.every((e, i) => e === ref[i].head), "the rows are the runs' first entries, in order");
  const big = ref.reduce((a, r) => (r.n > a.n ? r : a), ref[0]);
  const bigRow = rcShow(w, T, d, big.head.id);
  assert(rcBadgeNum(bigRow) === big.n, "the head of the longest loop carries x" + big.n + ", got " + rcBadgeNum(bigRow));
  assert(/repeats/.test(bigRow.querySelector(".repeat-badge").title) && /click to expand/.test(bigRow.querySelector(".repeat-badge").title), "badge tooltip: count and 'click to expand', got " + bigRow.querySelector(".repeat-badge").title);
  assert(!bigRow.querySelector(".repeat-badge").classList.contains("repeat-pattern"), "Identical: solid badge");
  const single = ref.find(r => r.n === 1);
  assert(single && !rcShow(w, T, d, single.head.id).querySelector(".repeat-badge"), "a row without repeats has no badge");

  const rowH = T.ROW_HEIGHT;
  const spacerOn = parseFloat(d.querySelector("#tableSpacer").style.height);
  assert(Math.abs((spacerOff - spacerOn) - (entries.length - ref.length) * rowH) < 1, "the spacer counts rows, not entries (" + spacerOff + " -> " + spacerOn + ")");

  fireClick(toggle, w);
  assert(!toggle.classList.contains("active") && T.currentViewEntries.length === entries.length && !d.querySelector("#tableRows .repeat-badge"), "off again: every entry has its row back");
});

await withApp(async (w, d, T) => {
  section("repeat-collapse b. Same pattern folds the counter loop, Identical does not; different threads never fold");
  const f = await rcOpen(w, T);
  const entries = f.entries;
  const counter = entries.findIndex(e => /^Retry 1\/\d+: /.test(e.message));
  assert(counter !== -1, "the data holds a 'Retry 1/n' counter loop");
  const total = parseInt(/^Retry 1\/(\d+)/.exec(entries[counter].message)[1], 10);

  fireClick(rcBtn(d), w); // Identical
  assert(T.currentViewEntries.some(e => e.id === entries[counter + 1].id), "Identical: the counter loop's second line keeps its own row");

  // chevron menu: opens, shows the rules, picking one switches the rule
  const chevron = d.querySelector("#btnRepeatMenu");
  const menu = d.querySelector("#repeatMenu");
  assert(menu.classList.contains("hidden"), "the rule menu starts closed");
  fireClick(chevron, w);
  assert(!menu.classList.contains("hidden"), "the chevron opens the rule menu");
  assert(menu.querySelector('[data-repeat-rule="identical"]').classList.contains("on") && !menu.querySelector('[data-repeat-rule="pattern"]').classList.contains("on"), "Identical is the picked rule");
  assert(menu.querySelector('[data-repeat-action="toggle"]').classList.contains("on"), "the menu's Collapse repeats item is on");
  fireClick(menu.querySelector('[data-repeat-rule="pattern"]'), w);
  assert(menu.classList.contains("hidden"), "picking a rule closes the menu");
  assert(rcBtn(d).classList.contains("active"), "collapsing is on");
  assert(w.localStorage.getItem("philogg-repeat-rule") === "pattern" && w.localStorage.getItem("philogg-repeat-collapse") === "1", "rule and toggle persisted to localStorage");

  const ref = rcRef(entries, { pattern: true });
  assert(T.currentViewEntries.length === ref.length && ref.length < rcRef(entries).length, "Same pattern folds more than Identical (" + ref.length + " rows)");
  const run = ref.find(r => r.head.id === entries[counter].id);
  assert(run && run.n === total, "the counter loop is one run of " + total + ", got " + (run && run.n));
  const row = rcShow(w, T, d, entries[counter].id);
  assert(rcBadgeNum(row) === total, "its head carries x" + total);
  assert(row.querySelector(".repeat-badge").classList.contains("repeat-pattern"), "Same pattern: dashed badge");
  const vary = [...row.querySelectorAll(".repeat-vary")];
  assert(vary.length >= 1 && vary.some(v => v.textContent === "1" && v.title === "1 – " + total), "the counter that differs inside the run is underlined with its range, got " + vary.map(v => v.textContent + "=" + v.title).join(";"));
  assert(!vary.some(v => v.textContent === String(total)), "the constant '/" + total + "' is not underlined");

  // different thread / source never fold, even with equal message
  const noThread = rcRef(entries, { pattern: true, noThread: true }).length;
  assert(noThread < ref.length, "the data holds equal messages on different threads (" + noThread + " < " + ref.length + ")");
  assert(T.currentViewEntries.length === ref.length, "...which stay separate rows");

  // toggle menu item switches collapsing off, keeps the rule
  fireClick(chevron, w);
  fireClick(menu.querySelector('[data-repeat-action="toggle"]'), w);
  assert(!rcBtn(d).classList.contains("active") && T.currentViewEntries.length === entries.length, "the menu's toggle item switches collapsing off");
  assert(w.localStorage.getItem("philogg-repeat-collapse") === "0" && w.localStorage.getItem("philogg-repeat-rule") === "pattern", "off persisted, rule kept");
});

await withApp(async (w, d, T) => {
  section("repeat-collapse c. Expand inline via badge click and arrow keys; selection moves to the head; delta after a run");
  const f = await rcOpen(w, T);
  const entries = f.entries;
  fireClick(rcBtn(d), w);
  const ref = rcRef(entries);
  const runIdx = ref.findIndex((r, i) => r.n >= 5 && i + 1 < ref.length && r.n <= 30);
  assert(runIdx !== -1, "a medium identical run exists");
  const run = ref[runIdx], next = ref[runIdx + 1];
  const startIdx = entries.indexOf(run.head);
  const members = entries.slice(startIdx, startIdx + run.n);

  // delta of the row after the folded run: measured from the run's LAST member
  const nextRow = rcShow(w, T, d, next.head.id);
  const expectedDelta = w.formatDelta(next.head.ts - members[members.length - 1].ts);
  assert(nextRow.querySelector(".col-delta").textContent === expectedDelta, "delta after the run is measured from its last member: " + expectedDelta + ", got " + nextRow.querySelector(".col-delta").textContent);

  // badge click expands
  const rowsBefore = T.currentViewEntries.length;
  let headRow = rcShow(w, T, d, run.head.id);
  fireClick(headRow.querySelector(".repeat-badge"), w);
  assert(T.currentViewEntries.length === rowsBefore + run.n - 1, "expanded: the members' rows join the list");
  assert(T.state.selectedId === run.head.id, "the badge click selects the head");
  headRow = rcRowFor(d, run.head.id);
  assert(/▾/.test(headRow.querySelector(".repeat-badge").textContent) && /click to collapse/.test(headRow.querySelector(".repeat-badge").title), "an open badge shows the caret and offers 'collapse'");
  const memberRows = members.slice(1).map(m => rcRowFor(d, m.id));
  assert(memberRows.every(Boolean) && memberRows.every(r => r.classList.contains("repeat-member")), "the members render as .repeat-member rows below the head");
  assert(memberRows.filter(r => r.classList.contains("repeat-member-last")).length === 1 && memberRows[memberRows.length - 1].classList.contains("repeat-member-last"), "only the last member closes the bracket");
  assert(!memberRows.some(r => r.querySelector(".repeat-badge")), "members have no badge");
  const afterRow = rcRowFor(d, next.head.id);
  assert(!afterRow || afterRow.querySelector(".col-delta").textContent === expectedDelta, "the delta of the row after an open run is the same");

  // select a member, ← folds and selects the head
  fireClick(memberRows[2], w);
  assert(T.state.selectedId === members[3].id, "a member can be selected");
  fireKeydown(d, w, "ArrowLeft");
  assert(T.currentViewEntries.length === rowsBefore && T.state.selectedId === run.head.id, "<- on a member folds the run and selects the head");
  assert(!rcRowFor(d, members[1].id), "the members' rows are gone again");

  // → expands the selected head, a second → does nothing
  fireKeydown(d, w, "ArrowRight");
  assert(T.currentViewEntries.length === rowsBefore + run.n - 1, "-> on the selected head expands the run");
  fireKeydown(d, w, "ArrowRight");
  assert(T.currentViewEntries.length === rowsBefore + run.n - 1, "-> on an open run does nothing");
  // ← on the head folds, selection stays on the head
  fireKeydown(d, w, "ArrowLeft");
  assert(T.currentViewEntries.length === rowsBefore && T.state.selectedId === run.head.id, "<- on the head folds the run");
  // ↓ walks the rows (head -> next row), not into hidden members
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.selectedId === next.head.id, "Down moves from a folded head to the next row");

  // badge click again collapses; a click on the row itself does not expand
  headRow = rcShow(w, T, d, run.head.id);
  fireClick(headRow, w);
  assert(T.currentViewEntries.length === rowsBefore, "a click on the row itself does not expand");
  fireClick(headRow.querySelector(".repeat-badge"), w);
  assert(T.currentViewEntries.length === rowsBefore + run.n - 1, "badge click expands");
  fireClick(rcRowFor(d, run.head.id).querySelector(".repeat-badge"), w);
  assert(T.currentViewEntries.length === rowsBefore, "badge click on an open run collapses it");

  // a selected member that gets folded away (toggle off/on) moves to its head
  fireClick(rcBtn(d), w); // off
  assert(T.currentViewEntries.length === entries.length, "off: all rows");
  w.selectEntry(members[4].id);
  fireClick(rcBtn(d), w); // on
  assert(T.state.selectedId === run.head.id, "toggling on: the selection moves to the head of the run that hid it");
  fireClick(rcBtn(d), w); // off
  fireClick(rcBtn(d), w); // on, nothing expanded any more
  assert(T.currentViewEntries.length === rowsBefore, "expanded runs are not remembered across the toggle");
});

await withApp(async (w, d, T) => {
  section("repeat-collapse d. Disabled under a column sort; entries of different files never fold");
  const f = await rcOpen(w, T);
  const entries = f.entries;
  const toggle = rcBtn(d);
  fireClick(toggle, w);
  assert(T.currentViewEntries.length < entries.length, "folding is on");
  T.state.sortColumn = "level";
  T.state.sortDir = "asc";
  w.render();
  assert(toggle.disabled && !toggle.classList.contains("active"), "under a column sort the toggle is disabled");
  assert(/chronological order/.test(toggle.title), "...with the explaining tooltip, got " + toggle.title);
  assert(d.querySelector("#btnRepeatMenu").disabled, "...and so is the chevron");
  assert(T.currentViewEntries.length === entries.length && !d.querySelector("#tableRows .repeat-badge"), "no folding under the sort");
  T.state.sortColumn = null;
  w.render();
  assert(!toggle.disabled && toggle.classList.contains("active") && T.currentViewEntries.length < entries.length, "clearing the sort re-enables and folds again");

  // two copies of the same log merged: equal messages, different source files
  fireClick(toggle, w); // off for the setup
  const g = await w.addFile("copy.log", rcFile.text, () => {});
  const merged = await w.mergeFiles([f.id, g.id]);
  T.state.activeId = merged.id;
  w.render();
  fireClick(toggle, w); // on
  const ref = rcRef(merged.entries);
  assert(rcRef(merged.entries, { noSource: true }).length < ref.length, "ignoring the source would fold more (the check has teeth)");
  assert(T.currentViewEntries.length === ref.length, "merged files: equal rows of different sources stay separate (" + ref.length + ")");
});

await withApp(async (w, d, T) => {
  section("repeat-collapse e. The preference survives a reload");
  const f = await rcOpen(w, T);
  assert(rcBtn(d).classList.contains("active"), "collapsing starts on from the stored preference");
  assert(d.querySelector("#repeatMenu [data-repeat-rule=pattern]").classList.contains("on"), "...with the stored rule");
  assert(T.currentViewEntries.length === rcRef(f.entries, { pattern: true }).length, "...and the rows are folded by that rule");
}, { beforeParse(win) { win.localStorage.setItem("philogg-repeat-collapse", "1"); win.localStorage.setItem("philogg-repeat-rule", "pattern"); } });
