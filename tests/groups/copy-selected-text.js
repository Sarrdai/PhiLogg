// GROUP copy-selected-text — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP copy-selected-text — text marked inside ONE entry copies as exactly
   that substring (Ctrl+C and right-click)
   Origin: 2026-10-09 (person-requested). Ctrl+C on a row used to always copy
   the whole raw line, right-click in the Entry Detail panel showed nothing.
   Rule: non-empty selection inside one .log-row/.pair-row (and < 2 rows
   multi-selected) -> Ctrl+C is left to the native copy, the row menu gets
   "Copy selected text" (#ctxCopySelection); inside Detail/Why/editor the
   right-click opens #textCopyMenu. Multi-selection / selection spanning rows
   still copies whole rows.
   ============================================================ */
group("copy-selected-text");
await withApp(async (w, d, T) => {
  section("copy-selected-text a. Ctrl+C and the row menu");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  const rowAt = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
  const hRowAt = i => d.querySelector('#highlightRows [data-entry-id="' + f.entries[i].id + '"]');
  const clickWith = (el, opts) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...opts }));
  const textNodeOf = el => { const w2 = d.createTreeWalker(el, 4); let n; while ((n = w2.nextNode())) if (n.nodeValue.length > 3) return n; return null; };
  const select = (a, ao, b, bo) => { const r = d.createRange(); r.setStart(a, ao); r.setEnd(b, bo); const s = w.getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString(); };
  const ctxMenu = (row, entry) => row.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
  const ctrlC = () => { const ev = new w.KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }); d.dispatchEvent(ev); return ev; };
  const itemShown = () => isVisible(d.querySelector("#ctxCopySelection"), w);

  clickWith(rowAt(2), {});
  const t2 = textNodeOf(rowAt(2));
  const sub = select(t2, 0, t2, 3);
  assert(sub.length === 3, "sanity: 3 chars selected, got " + JSON.stringify(sub));

  // Ctrl+C with a selection inside the selected row: native copy (not prevented, no whole line)
  copied = null;
  let ev = ctrlC();
  assert(!ev.defaultPrevented && copied === null, "selection inside one row: Ctrl+C is left to the native copy");

  // No selection: whole raw line as before
  w.getSelection().removeAllRanges();
  ev = ctrlC();
  assert(copied === f.entries[2].raw, "no selection: Ctrl+C copies the raw line");

  // Selection spanning two rows (Shift-range style) with a multi-selection: whole rows
  clickWith(rowAt(2), {});
  clickWith(rowAt(4), { shiftKey: true });
  select(textNodeOf(rowAt(2)), 0, textNodeOf(rowAt(4)), 2);
  assert(T.state.logMultiSelect.size === 3, "sanity: shift range multi-selected");
  copied = null;
  ev = ctrlC();
  assert(ev.defaultPrevented && copied === [2, 3, 4].map(i => f.entries[i].raw).join("\n"), "multi-selection + native cross-row selection: whole rows are copied");

  // Selection spanning two rows without multi-selection: whole row(s) as before
  clickWith(rowAt(2), {});
  select(textNodeOf(rowAt(2)), 0, textNodeOf(rowAt(3)), 2);
  copied = null;
  ev = ctrlC();
  assert(ev.defaultPrevented && copied === f.entries[2].raw, "selection spanning two rows: raw line copy as before");

  // 2+ multi-selection with a selection inside one of the rows: rows win
  clickWith(rowAt(2), {});
  clickWith(rowAt(5), { ctrlKey: true });
  select(textNodeOf(rowAt(5)), 0, textNodeOf(rowAt(5)), 3);
  copied = null;
  ev = ctrlC();
  assert(ev.defaultPrevented && copied === [2, 5].map(i => f.entries[i].raw).join("\n"), "multi-selection wins over a text selection in one row");

  // --- Row context menu ---
  clickWith(rowAt(2), {});
  const t2b = textNodeOf(rowAt(2));
  const sub2 = select(t2b, 1, t2b, 6);
  ctxMenu(rowAt(2));
  assert(itemShown(), "right-click on the row with a selection in it shows 'Copy selected text'");
  assert(d.querySelector("#ctxMeta").nextElementSibling.classList.contains("ctx-sep") &&
    d.querySelector("#ctxMeta").nextElementSibling.nextElementSibling.id === "ctxCopySelection", "item sits right below the meta line");
  // the selection collapsing afterwards must not matter
  w.getSelection().removeAllRanges();
  copied = null;
  fireClick(d.querySelector("#ctxCopySelection"), w);
  assert(copied === sub2, "click copies exactly the selected substring " + JSON.stringify(sub2) + ", got " + JSON.stringify(copied));
  assert(d.querySelector("#contextMenu").classList.contains("hidden"), "menu closes after the click");

  // no selection
  w.getSelection().removeAllRanges();
  ctxMenu(rowAt(2));
  assert(!itemShown(), "no selection: item hidden");
  w.closeContextMenu();

  // selection in another row
  select(textNodeOf(rowAt(3)), 0, textNodeOf(rowAt(3)), 4);
  ctxMenu(rowAt(2));
  assert(!itemShown(), "selection in another row: item hidden");
  w.closeContextMenu();

  // multi-selection
  clickWith(rowAt(2), {});
  clickWith(rowAt(5), { ctrlKey: true });
  select(textNodeOf(rowAt(5)), 0, textNodeOf(rowAt(5)), 4);
  ctxMenu(rowAt(5));
  assert(!itemShown(), "multi-selection: item hidden");
  w.closeContextMenu();

  section("copy-selected-text b. Highlight view row");
  clickWith(rowAt(2), {});
  w.showFhTab("highlight");
  const ht = textNodeOf(hRowAt(3));
  const hsub = select(ht, 0, ht, 5);
  ctxMenu(hRowAt(3));
  assert(itemShown(), "Highlight view row with selection: item visible");
  copied = null;
  fireClick(d.querySelector("#ctxCopySelection"), w);
  assert(copied === hsub, "Highlight view: copies the substring");
  w.showFhTab("filter");

  section("copy-selected-text c. Detail panel / #textCopyMenu");
  clickWith(rowAt(2), {});
  w.selectEntry(f.entries[2].id);
  const menu = d.querySelector("#textCopyMenu");
  const msgText = textNodeOf(d.querySelector("#detailMessage"));
  assert(msgText, "sanity: detail message has text");
  const dsub = select(msgText, 0, msgText, 4);
  const dm = d.querySelector("#detailMessage");
  dm.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));
  assert(!menu.classList.contains("hidden"), "right-click with a selection in Detail opens #textCopyMenu");
  copied = null;
  fireClick(d.querySelector("#textCopyItem"), w);
  assert(copied === dsub, "#textCopyMenu copies the selected substring");
  assert(menu.classList.contains("hidden"), "menu closes after copy");

  // no selection
  w.getSelection().removeAllRanges();
  dm.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));
  assert(menu.classList.contains("hidden"), "no selection: #textCopyMenu stays closed");

  // right-click on a log row never opens it
  select(msgText, 0, msgText, 4);
  ctxMenu(rowAt(2));
  assert(menu.classList.contains("hidden"), "right-click on a log row never opens #textCopyMenu");
  w.closeContextMenu();

  // Escape closes it
  dm.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));
  assert(!menu.classList.contains("hidden"), "sanity: open again");
  fireKeydown(d, w, "Escape");
  assert(menu.classList.contains("hidden"), "Escape closes #textCopyMenu");
});
