// GROUP table-text-selection — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP table-text-selection — own text selection model of the Filter and
   Context rows (flow + Alt/Ctrl+Alt block of whole cells), "selection wins"
   copy rule
   Origin: 2026-10-09 (person-requested, plan-table-selection step 2).
   Native selection cannot span virtual-scrolled rows, so tableTextSel
   ({view, mode, anchor, focus}, points = entry + column key + character
   offset into the cell VALUE text) is bound to entries, painted with the CSS
   Custom Highlight API (absent in jsdom: model and copy are tested here, the
   painting in the real browser), copied as cells joined by \t and rows by \n.
   ============================================================ */
group("table-text-selection");
await withApp(async (w, d, T) => {
  section("table-text-selection a. model and copy text");
  const f = await w.addFile("a.log", makeLog(0, 12), () => {});
  T.state.activeId = f.id;
  w.render();
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  const rowAt = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
  const hRowAt = i => d.querySelector('#highlightRows [data-entry-id="' + f.entries[i].id + '"]');
  const clickWith = (el, opts) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...opts }));
  const ctrlC = () => { const ev = new w.KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }); d.dispatchEvent(ev); return ev; };
  const cols = [...rowAt(2).querySelectorAll(":scope > [data-sel-col]")].map(c => c.dataset.selCol);
  assert(cols[0] === "time" && cols[1] === "delta" && cols[2] === "level" && cols[cols.length - 1] === "message" && cols.length >= 5,
    "rows carry data-sel-col cells in display order, got " + cols);
  const cellText = (i, col, rowFn = rowAt) => rowFn(i).querySelector(':scope > [data-sel-col="' + col + '"]').textContent;
  const pt = (i, col, offset) => ({ entryId: f.entries[i].id, col, offset });
  const set = (mode, a, b, view = "filter") => T.setTableTextSelection(view, mode, a, b);

  // Flow, same row: from anchor to focus across the columns in between
  const i1 = cols.indexOf("level"), i2 = cols.indexOf("message");
  set("flow", pt(2, "level", 1), pt(2, "message", 4));
  let exp = [cellText(2, "level").slice(1), ...cols.slice(i1 + 1, i2).map(c => cellText(2, c)), cellText(2, "message").slice(0, 4)].join("\t");
  assert(T.tableTextSelText() === exp, "flow within one row: " + JSON.stringify(T.tableTextSelText()) + " vs " + JSON.stringify(exp));
  set("flow", pt(2, "message", 7), pt(2, "message", 2));
  assert(T.tableTextSelText() === cellText(2, "message").slice(2, 7), "flow inside one cell, reversed drag");

  // Flow over 3 rows with partial first and last cell
  const mid = cols.indexOf("thread") >= 0 ? "thread" : cols[3];
  const im = cols.indexOf(mid);
  set("flow", pt(2, "level", 1), pt(4, mid, 3));
  const row2 = [cellText(2, "level").slice(1), ...cols.slice(i1 + 1).map(c => cellText(2, c))];
  const row3 = cols.map(c => cellText(3, c));
  const row4 = [...cols.slice(0, im).map(c => cellText(4, c)), cellText(4, mid).slice(0, 3)];
  exp = [row2.join("\t"), row3.join("\t"), row4.join("\t")].join("\n");
  assert(T.tableTextSelText() === exp, "flow over 3 rows with partial ends");
  set("flow", pt(4, mid, 3), pt(2, "level", 1));
  assert(T.tableTextSelText() === exp, "same text when dragged upwards");

  // Block: rows x columns between, whole cells, either direction
  const b0 = cols.indexOf("level"), b1 = im;
  exp = [2, 3, 4].map(i => cols.slice(b0, b1 + 1).map(c => cellText(i, c)).join("\t")).join("\n");
  set("block", pt(2, "level", 0), pt(4, mid, 0));
  assert(T.tableTextSelText() === exp, "block text is whole cells: " + JSON.stringify(T.tableTextSelText()));
  set("block", pt(4, mid, 2), pt(2, "level", 1));
  assert(T.tableTextSelText() === exp, "block, reversed direction and offsets ignored");

  // Values: time / Δt / level / message without decorations
  set("block", pt(3, "time", 0), pt(3, "message", 0));
  const t3 = T.tableTextSelText().split("\t");
  assert(t3[0] === cellText(3, "time") && t3[1] === cellText(3, "delta") && t3[2] === cellText(3, "level") && t3[t3.length - 1] === cellText(3, "message"),
    "time, Δt, level and message values equal what the cells show");
  assert(/^[+−]/.test(t3[1]), "Δt value comes from the shared delta helper, got " + t3[1]);
  assert(T.tableTextSelText().split("\n").length === 1, "single row, no newline");
  // A column the person hid (0px track, cell still in the DOM) is never copied
  T.state.columnVisible.delta = false;
  set("block", pt(3, "time", 0), pt(3, "message", 0));
  const t3h = T.tableTextSelText().split("\t");
  assert(t3h.length === t3.length - 1 && t3h[1] === cellText(3, "level"), "hidden Δt column is skipped, got " + JSON.stringify(t3h));
  T.state.columnVisible.delta = true;

  section("table-text-selection b. survives renders, cleared by the right things");
  set("flow", pt(2, "level", 1), pt(4, mid, 3));
  const before = T.tableTextSelText();
  w.render();
  assert(T.tableTextSel && T.tableTextSelText() === before, "survives a re-render of the visible rows (entry-bound)");
  assert(rowAt(2).dataset.viewIdx === "2", "rows carry their view index");
  fireKeydown(d, w, "Escape", {});
  assert(T.tableTextSel === null && T.tableTextSelText() === "", "Escape clears the selection");
  // Escape with no selection leaves the rest of the Escape chain alone
  clickWith(rowAt(2), {});
  clickWith(rowAt(4), { shiftKey: true });
  fireKeydown(d, w, "Escape", {});
  assert(T.state.logMultiSelect.size === 0, "Escape without a text selection still clears the row multi-selection");

  set("flow", pt(2, "level", 1), pt(4, mid, 3));
  rowAt(7).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  assert(T.tableTextSel === null, "a plain mousedown on a row clears the selection");
  set("flow", pt(2, "level", 1), pt(4, mid, 3));
  rowAt(7).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 }));
  assert(T.tableTextSel !== null, "a right mousedown does not clear it");
  set("flow", pt(2, "level", 1), pt(4, mid, 3));
  w.showFhTab("highlight");
  assert(T.tableTextSelText() === "" && T.tableTextSel === null, "switching the view drops the selection");
  w.showFhTab("filter");
  set("flow", pt(2, "level", 1), { entryId: "no-such-entry", col: mid, offset: 3 });
  assert(T.tableTextSelText() === "" && T.tableTextSel === null, "an endpoint entry outside the view drops the selection");

  section("table-text-selection c. Ctrl+C: selection wins");
  clickWith(rowAt(2), {});
  clickWith(rowAt(5), { shiftKey: true });
  assert(T.state.logMultiSelect.size === 4, "sanity: 4 rows multi-selected");
  set("flow", pt(3, "message", 2), pt(3, "message", 8));
  copied = null;
  let ev = ctrlC();
  assert(ev.defaultPrevented && copied === cellText(3, "message").slice(2, 8), "multi-selection + text selection: Ctrl+C copies the text, got " + JSON.stringify(copied));
  assert(T.state.logMultiSelect.size === 4, "the row multi-selection is untouched");
  T.clearTableTextSel();
  copied = null;
  ev = ctrlC();
  assert(copied === [2, 3, 4, 5].map(i => f.entries[i].raw).join("\n"), "multi-selection without a text selection: Ctrl+C copies the rows");
  w.getSelection().removeAllRanges();
  fireKeydown(d, w, "Escape", {});
  clickWith(rowAt(3), {});
  copied = null;
  ctrlC();
  assert(copied === f.entries[3].raw, "no selection, no multi-selection: the raw line as before");

  section("table-text-selection d. row context menu");
  const ctxMenu = row => row.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
  const itemShown = () => isVisible(d.querySelector("#ctxCopySelection"), w);
  clickWith(rowAt(2), {});
  clickWith(rowAt(5), { ctrlKey: true });
  set("block", pt(3, "level", 0), pt(4, mid, 0));
  const blockText = T.tableTextSelText();
  ctxMenu(rowAt(3));
  assert(itemShown(), "right-click on a row of the selection: 'Copy selected text' shown (even with a multi-selection)");
  assert(T.tableTextSel !== null, "right-click did not clear the selection");
  copied = null;
  fireClick(d.querySelector("#ctxCopySelection"), w);
  assert(copied === blockText, "the item copies the selection text");
  ctxMenu(rowAt(8));
  assert(!itemShown(), "right-click on a row outside the selection: item hidden");
  assert(T.tableTextSel !== null, "...and the selection stays");
  w.closeContextMenu();
  T.clearTableTextSel();
  ctxMenu(rowAt(3));
  assert(!itemShown(), "no selection: item hidden");
  w.closeContextMenu();

  section("table-text-selection e. gestures");
  let caret = null;
  d.caretRangeFromPoint = () => caret;
  const caretIn = (el, off) => { const r = d.createRange(); r.setStart(el, off); r.setEnd(el, off); caret = r; };
  const msgCellOf = (i, rowFn = rowAt) => rowFn(i).querySelector(':scope > [data-sel-col="message"]');
  const msgText = (i, rowFn = rowAt) => msgCellOf(i, rowFn).firstChild;
  const mouse = (target, type, opts) => target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100, ...opts }));
  clickWith(rowAt(1), {});
  const selBefore = T.state.selectedId;
  caretIn(msgText(2), 3);
  mouse(msgCellOf(2, rowAt), "mousedown", { clientX: 100 });
  assert(T.tableTextSel === null, "mousedown alone starts no selection");
  caretIn(msgText(4), 5);
  mouse(msgCellOf(4, rowAt), "mousemove", { clientX: 101 });
  assert(T.tableTextSel === null, "a move under 3px is not a drag");
  mouse(msgCellOf(4, rowAt), "mousemove", { clientX: 140 });
  assert(T.tableTextSel && T.tableTextSel.mode === "flow" && T.tableTextSel.view === "filter", "plain drag starts a flow selection");
  assert(T.tableTextSel.anchor.offset === 3 && T.tableTextSel.focus.offset === 5 && T.tableTextSel.focus.entryId === f.entries[4].id, "offsets come from the caret under the pointer");
  mouse(msgCellOf(4, rowAt), "mouseup", { clientX: 140 });
  clickWith(rowAt(4), {});
  assert(T.state.selectedId === selBefore && T.state.logMultiSelect.size === 0, "the click after a drag is swallowed (row selection unchanged)");
  clickWith(rowAt(6), {});
  assert(T.state.selectedId === f.entries[6].id, "the next click works again");
  mouse(msgCellOf(2, rowAt), "mousedown", { clientX: 100, altKey: true });
  mouse(msgCellOf(4, rowAt), "mousemove", { clientX: 140, altKey: true });
  mouse(msgCellOf(4, rowAt), "mouseup", { clientX: 140, altKey: true });
  assert(T.tableTextSel && T.tableTextSel.mode === "block", "Alt+drag starts a block selection");
  mouse(msgCellOf(3, rowAt), "mousedown", { clientX: 100, altKey: true, ctrlKey: true });
  mouse(msgCellOf(5, rowAt), "mousemove", { clientX: 140, altKey: true, ctrlKey: true });
  mouse(msgCellOf(5, rowAt), "mouseup", { clientX: 140, altKey: true, ctrlKey: true });
  assert(T.tableTextSel && T.tableTextSel.mode === "block" && T.tableTextSel.anchor.entryId === f.entries[3].id, "Ctrl+Alt+drag starts a block selection too");
  mouse(msgCellOf(2, rowAt), "mousedown", { clientX: 100, shiftKey: true });
  mouse(msgCellOf(4, rowAt), "mousemove", { clientX: 140, shiftKey: true });
  mouse(msgCellOf(4, rowAt), "mouseup", { clientX: 140, shiftKey: true });
  assert(T.tableTextSel === null, "Shift+drag starts no text selection (row multi-selection gesture)");

  // Decorations are skipped when mapping the caret to a value offset
  const cell = rowAt(8).querySelector(':scope > [data-sel-col="message"]');
  cell.insertAdjacentHTML("afterbegin", '<span class="repeat-badge">×3</span>');
  const valueNode = cell.lastChild;
  caretIn(valueNode, 2);
  mouse(msgCellOf(8, rowAt), "mousedown", { clientX: 100 });
  caretIn(valueNode, 6);
  mouse(msgCellOf(8, rowAt), "mousemove", { clientX: 140 });
  mouse(msgCellOf(8, rowAt), "mouseup", { clientX: 140 });
  assert(T.tableTextSel.anchor.offset === 2 && T.tableTextSel.focus.offset === 6, "the repeat badge does not shift offsets");
  assert(T.tableTextSelText() === f.entries[8].message.slice(2, 6), "copied text has no badge text, got " + JSON.stringify(T.tableTextSelText()));
  T.clearTableTextSel();

  section("table-text-selection f. Context view rows");
  w.showFhTab("highlight");
  clickWith(hRowAt(1), {});
  caretIn(msgText(2, hRowAt), 1);
  mouse(msgCellOf(2, hRowAt), "mousedown", { clientX: 100 });
  caretIn(msgText(3, hRowAt), 4);
  mouse(msgCellOf(3, hRowAt), "mousemove", { clientX: 140 });
  mouse(msgCellOf(3, hRowAt), "mouseup", { clientX: 140 });
  assert(T.tableTextSel && T.tableTextSel.view === "highlight", "drag in the Context rows selects there");
  const hText = T.tableTextSelText();
  const hCol = (i, c) => cellText(i, c, hRowAt);
  const hExp = [f.entries[2].message.slice(1), [...cols.slice(0, -1).map(c => hCol(3, c)), f.entries[3].message.slice(0, 4)].join("\t")].join("\n");
  assert(hText === hExp, "Context rows copy the partial first and last cell, got " + JSON.stringify(hText));
  copied = null;
  clickWith(hRowAt(2), {});
  const cEv = ctrlC();
  assert(cEv.defaultPrevented && copied === hText, "Ctrl+C copies the Context selection text");
});
