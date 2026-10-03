// GROUP responsive-cards — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, makeLog, ...) is
// in scope.

/* ============================================================
   GROUP responsive-cards — card rows on phone (layout-phone, < 600px)
   Origin: 2026-10-02 (responsive layout, step 3). The Filtered view's log
   rows are cards (CSS on the same .log-row): height = CARD_HEAD (24) +
   min(lines, 4) * CARD_LINE (19) + CARD_VPAD (21), lines from
   messageWrapLines(), offsets path always on in phone. The numbers below
   mirror those constants on purpose: a CSS/JS drift must fail here.
   Also: the table header hidden, the selected card scrolled above the
   bottom sheet, and the sheet header printing no separators for empty parts.
   ============================================================ */
group("responsive-cards");

const cardW = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const cardText = LOGSIM.generateToStrings({ format: "default", entries: 400, seed: 5 })[0].text;
const CARD = (lines) => 24 + Math.min(lines, 4) * 19 + 21;

await withApp(async (w, d, T) => {
  section("responsive-cards a. Height formula: 1 / 3 / 10 line messages, clamp at 4, wrap by column count");
  const f = await w.addFile("a.log", cardText, () => {});
  T.state.activeId = f.id;
  w.render();
  cardW(w, 390);
  const e = msg => ({ id: "x", message: msg });
  const lines = n => Array.from({ length: n }, (_, i) => "line " + i).join("\n");

  T.state.multilineMessages = true;
  assert(w.cardHeightForEntry(e("one"), 40) === CARD(1) && CARD(1) === 64, "1 line: 24+19+21 = 64, got " + w.cardHeightForEntry(e("one"), 40));
  assert(w.cardHeightForEntry(e(lines(3)), 40) === CARD(3) && CARD(3) === 102, "3 lines: 102, got " + w.cardHeightForEntry(e(lines(3)), 40));
  assert(w.cardHeightForEntry(e(lines(10)), 40) === CARD(4) && CARD(4) === 121, "10 lines clamp to 4: 121, got " + w.cardHeightForEntry(e(lines(10)), 40));
  assert(w.cardHeightForEntry(e("x".repeat(85)), 40) === CARD(3), "85 chars at 40 cols = 3 wrapped lines");
  assert(w.cardHeightForEntry(e("x".repeat(400)), 40) === CARD(4), "a very long single line clamps to 4");
  T.state.multilineMessages = false;
  assert(w.cardHeightForEntry(e(lines(3)), 40) === CARD(1), "multiline off: the short 3-part message collapses to one line");
  assert(w.cardHeightForEntry(e(lines(10)), 0) === CARD(1), "unmeasurable width (cols 0): one line");
  T.state.multilineMessages = true;
  assert(w.cardHeightForEntry(e(lines(3)), 0) === CARD(3), "cols 0 with multiline: literal line count");
});

await withApp(async (w, d, T) => {
  section("responsive-cards b. Offsets total equals the sum of row heights; rendered rows carry the same heights");
  const f = await w.addFile("a.log", cardText, () => {});
  T.state.activeId = f.id;
  T.state.multilineMessages = true;
  w.render();
  cardW(w, 390);
  const entries = T.currentViewEntries;
  assert(entries.length > 100, "sanity: " + entries.length + " entries");
  assert(entries.some(x => x.message.includes("\n")), "sanity: the simulator produced multi-line messages");
  assert(w.needsRowOffsets() === true, "phone: the offsets path is always on");
  const offsets = w.eval("tableRowOffsets");
  const cols = w.eval("tableWrapCols");
  assert(cols >= 1, "wrap column count is set, got " + cols);
  let sum = 0;
  entries.forEach((x, i) => {
    const h = w.baseRowHeightForEntry(x, cols, false, true) + w.noteHeightForEntry(x);
    assert(offsets[i + 1] - offsets[i] === h, "offset step of row " + i + " equals its height");
    sum += h;
  });
  assert(offsets[entries.length] === sum, "offsets total " + offsets[entries.length] + " === sum " + sum);
  const rows = [...d.querySelectorAll("#tableRows .log-row")];
  assert(rows.length > 0, "rows rendered");
  const index = new Map(entries.map((x, i) => [x.id, i]));
  rows.forEach(r => {
    const i = index.get(r.dataset.entryId);
    assert(parseFloat(r.style.height) === offsets[i + 1] - offsets[i], "rendered row " + i + " style.height equals its offset step");
  });
  const steps = new Set(); for (let i = 0; i < entries.length; i++) steps.add(offsets[i + 1] - offsets[i]);
  assert(steps.size > 1, "heights vary with the message (" + [...steps].join(",") + ")");

  cardW(w, 1440);
  const desktopRow = d.querySelector("#tableRows .log-row");
  assert(parseFloat(desktopRow.style.height) !== 64, "desktop rows no longer use the card heights, got " + desktopRow.style.height);
});

await withApp(async (w, d, T) => {
  section("responsive-cards c. Tier switch keeps the anchored (selected) entry; header hidden only on phone");
  const f = await w.addFile("a.log", cardText, () => {});
  T.state.activeId = f.id;
  w.render();
  cardW(w, 1440);
  const entries = T.currentViewEntries;
  const target = entries[120];
  w.selectEntry(target.id, { scroll: true, index: 120 });
  assert(T.state.selectedId === target.id, "sanity: selected on desktop");
  const hdr = () => w.getComputedStyle(d.querySelector("#tableHeader")).display !== "none";
  assert(hdr(), "desktop: the table header shows");
  cardW(w, 820);
  assert(hdr(), "compact: the table header shows");
  cardW(w, 390);
  assert(!hdr(), "phone: the table header is hidden");
  assert(T.state.selectedId === target.id, "the selection survives the tier switch");
  const offsets = w.eval("tableRowOffsets");
  const idx = T.currentViewEntries.findIndex(x => x.id === target.id);
  const top = offsets[idx], bottom = offsets[idx + 1];
  const st = d.getElementById("tableBody").scrollTop, ch = d.getElementById("tableBody").clientHeight;
  assert(bottom > st && top < st + ch, "the anchored entry is still inside the viewport: row " + top + ".." + bottom + ", view " + st + ".." + (st + ch));
  cardW(w, 820);
  const o2 = w.eval("tableRowOffsets");
  assert(o2 === null || o2.length === T.currentViewEntries.length + 1, "back to compact: offsets consistent with the list");
  assert(T.state.selectedId === target.id, "selection kept going back as well");
});

await withApp(async (w, d, T) => {
  section("responsive-cards d. Selecting / prev-next scrolls the card above the bottom sheet");
  const f = await w.addFile("a.log", cardText, () => {});
  T.state.activeId = f.id;
  w.render();
  cardW(w, 390);
  const body = d.getElementById("tableBody");
  // The sheet takes its height out of the list in CSS; jsdom has no layout, so
  // the viewport height is stubbed the way the stylesheet shrinks it.
  Object.defineProperty(body, "clientHeight", { get: () => (d.body.classList.contains("sheet-open") ? 150 : 400), configurable: true });
  const inView = id => {
    const i = T.currentViewEntries.findIndex(x => x.id === id);
    const o = w.eval("tableRowOffsets");
    const st = body.scrollTop, ch = body.clientHeight;
    return o[i] >= st - 0.5 && o[i + 1] <= st + ch + 0.5;
  };
  const entries = T.currentViewEntries;
  w.selectEntry(entries[40].id, { scroll: true, index: 40 });
  assert(!d.body.classList.contains("sheet-open"), "a programmatic selection leaves the sheet closed");
  d.querySelector('#tableRows .log-row[data-entry-id="' + entries[40].id + '"]').click();
  assert(d.body.classList.contains("sheet-open"), "tapping the card opens the sheet");
  assert(inView(entries[40].id), "the selected card sits inside the area above the sheet (view height 150)");
  d.getElementById("detailNext").click();
  assert(T.state.selectedId === entries[41].id && inView(entries[41].id), "next keeps the new selection above the sheet");
  for (let i = 0; i < 6; i++) d.getElementById("detailNext").click();
  assert(inView(T.state.selectedId), "after several steps still visible");
  d.getElementById("detailPrev").click();
  assert(inView(T.state.selectedId), "prev too");
  d.getElementById("detailClose").click();
  assert(!d.body.classList.contains("sheet-open"), "closed");
});

await withApp(async (w, d, T) => {
  section("responsive-cards e. Sheet header: no separators for empty thread / location / method");
  const f = await w.addFile("a.log", cardText, () => {});
  T.state.activeId = f.id;
  w.render();
  const entry = f.entries[3];
  const meta = () => d.getElementById("detailMeta");
  entry.thread = ""; entry.location = ""; entry.method = "";
  w.selectEntry(entry.id, {});
  assert(!/·\s*$/.test(meta().textContent) && !meta().querySelector(".detail-thread, .detail-loc, .detail-method"),
    "all empty: no trailing '·', no empty spans, got '" + meta().textContent + "'");
  entry.thread = "worker-1";
  w.selectEntry(entry.id, {});
  assert(meta().querySelector(".detail-thread") && !meta().querySelector(".detail-loc") && !meta().querySelector(".detail-method") && !/·\s*$/.test(meta().textContent),
    "thread only: one separator before it, nothing after, got '" + meta().textContent + "'");
  entry.location = "a.cs:12"; entry.method = "Run";
  w.selectEntry(entry.id, {});
  assert(meta().querySelectorAll(".detail-sep").length === 3 && meta().querySelector(".detail-method"), "all set: the full field set with three separators");
});

await withApp(async (w, d, T) => {
  section("responsive-cards f. Greedy word wrap: exact fit, long words, whitespace runs, multiline on/off, per-row line-clamp");
  const f = await w.addFile("a.log", cardText, () => {});
  T.state.activeId = f.id;
  w.render();
  cardW(w, 390);
  const L = (t, cols) => w.cardWrapPartLines(t, cols);
  assert(L("aaaa bbbb", 9) === 1, "'aaaa bbbb' fits 9 columns exactly: 1 line");
  assert(L("aaaa bbbb", 8) === 2, "one column short: the second word moves down, 2 lines");
  assert(L("aaaa bbbb cccc", 9) === 2, "greedy: 'aaaa bbbb' / 'cccc'");
  assert(L("a".repeat(10), 4) === 3, "a word longer than the line breaks anywhere: ceil(10/4) = 3");
  assert(L("xx " + "a".repeat(10), 4) === 4, "a long word starts on a new line first, then splits: 'xx' + 3 chunks");
  assert(L("ab " + "c".repeat(5), 4) === 3, "'ab' / 'cccc' / 'c'");
  assert(L("aa" + " ".repeat(6) + "bb", 4) === 2, "a whitespace run that does not fit hangs at the line end: 'aa' / 'bb'");
  assert(L("aaaa", 4) === 1 && L("aaaa b", 4) === 2, "exact fill keeps one line, the next word wraps");
  assert(L("", 10) === 1, "empty is one line");

  const msg = m => ({ id: "m", message: m });
  T.state.multilineMessages = false;
  assert(w.cardLinesForEntry(msg("aaaa    bbbb"), 9) === 1, "multiline off: whitespace runs collapse ('aaaa bbbb' fits 9)");
  assert(w.cardLinesForEntry(msg("aaaa\nbbbb"), 9) === 1, "multiline off: a newline is just a space");
  T.state.multilineMessages = true;
  assert(w.cardLinesForEntry(msg("aaaa\nbbbb"), 9) === 2, "multiline on: the newline starts a new line");
  assert(w.cardLinesForEntry(msg("aaaa\n\nbbbb"), 9) === 3, "multiline on: an empty line counts");
  assert(w.cardLinesForEntry(msg("aaaa bbbb cccc\ndddd eeee ffff"), 9) === 4, "multiline on: each part wraps on its own (2 + 2)");
  assert(w.cardLinesForEntry(msg("x ".repeat(100)), 10) === 4, "clamped to 4");

  // every rendered row's own -webkit-line-clamp equals its predicted visible lines
  const cols = w.eval("tableWrapCols");
  const rows = [...d.querySelectorAll("#tableRows .log-row")];
  const byId = new Map(T.currentViewEntries.map(x => [x.id, x]));
  assert(rows.length > 0 && rows.every(r => {
    const e = byId.get(r.dataset.entryId);
    return r.querySelector(".col-msg").style.webkitLineClamp === String(w.cardLinesForEntry(e, cols));
  }), "each card's line-clamp is its predicted line count");
});

await withApp(async (w, d, T) => {
  section("responsive-cards g. Compact tier: the message always wraps (effective wrap), the stored setting and button state follow");
  const f = await w.addFile("a.log", cardText, () => {});
  T.state.activeId = f.id;
  w.render();
  const btn = d.querySelector(".toggle-wrap");
  assert(btn, "sanity: a wrap toggle exists");
  cardW(w, 1440);
  assert(T.state.wrapMessages === false && !w.wrapMessagesEff() && !d.body.classList.contains("wrap-messages"), "desktop: wrap off");
  assert(!btn.disabled && !btn.classList.contains("active"), "desktop: the button is free and off");
  const baseTitle = btn.title;
  cardW(w, 820);
  assert(w.wrapMessagesEff() === true && T.state.wrapMessages === false, "compact: effective wrap on, stored setting untouched");
  assert(d.body.classList.contains("wrap-messages"), "compact: the wrap CSS class is on");
  assert(btn.disabled && btn.classList.contains("active") && btn.title === "Always wrapped in a narrow window", "compact: button active, disabled, with the tooltip, got '" + btn.title + "'");
  assert(w.needsRowOffsets() === true && w.eval("tableWrapCols") >= 1, "compact: the exact-height wrap path is on (offsets + a column count)");
  const long = { id: "l", message: "word ".repeat(80) };
  assert(w.baseRowHeightForEntry(long, w.eval("tableWrapCols"), false, false) > w.eval("ROW_HEIGHT"), "compact: a long message makes a taller row");
  btn.click();
  assert(T.state.wrapMessages === false, "a click on the locked button changes nothing");
  cardW(w, 390);
  assert(!btn.disabled && btn.title === baseTitle, "phone: the button is back to normal (cards do their own wrapping)");
  cardW(w, 1440);
  assert(!btn.disabled && !btn.classList.contains("active") && !d.body.classList.contains("wrap-messages") && btn.title === baseTitle, "desktop again: wrap off, button restored");
  T.state.wrapMessages = true;
  w.updateWrapMsgButton();
  cardW(w, 820);
  assert(btn.classList.contains("active") && T.state.wrapMessages === true, "stored wrap on stays on in compact");
  cardW(w, 1440);
  assert(btn.classList.contains("active") && !btn.disabled, "...and back on desktop it is still the person's own setting");
});
