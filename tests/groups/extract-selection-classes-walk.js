// GROUP extract-selection-classes-walk — loaded by philogg.html's regression
// harness (tests/README.md -> "Group files").

/* ============================================================
   GROUP extract-selection-classes-walk — applyExtractSelectionClasses marks
   the rendered cells by one walk over them, not one querySelector per key
   Origin: 2026-10-06 (FEATURE_BACKLOG #98). Select-all on a 200k-row
   extraction ran 200k * columns querySelector calls. The result must be the
   one the per-key lookup gave: exactly the rendered value cells whose
   "row,col" key is in state.tableSelection carry cell-selected (never a
   gutter or spacer cell), and a header th is marked when its whole column is
   selected. The oracle below is the old per-key lookup, kept in the test.
   ============================================================ */
group("extract-selection-classes-walk");
if (groupSelected()) {
  section("extract-selection-classes-walk. select-all, a range, a single cell, a column and a scrolled window mark the same cells as the per-key lookup");
  await withApp(async (w, d, T) => {
    const lines = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 300, seed: 11 })[0].text;
    // An extraction over the simulator's own messages: every entry has a number in it.
    const f = await w.addFile("big.log", lines, () => {});
    const node = w.createFilterNode(f.id, "text", "[*:word] [*:int]");
    T.state.activeId = node.id;
    w.render();
    w.applyFhView("table");
    const total = T.extractRowsData.length;
    assert(total > 100, "sanity: a big extraction (" + total + " rows)");
    const body = d.querySelector("#extractBody");
    const renderedCells = () => [...body.querySelectorAll("td[data-col]")];
    assert(renderedCells().length > 0 && renderedCells().length < total * 2, "sanity: the table is virtualized, only a window is rendered");

    // The old behavior, as the oracle: one lookup per selected key.
    const expectedKeys = () => {
      const out = new Set();
      (T.state.tableSelection || new Set()).forEach(k => {
        const [r, c] = k.split(",");
        const td = body.querySelector('td[data-row="' + r + '"][data-col="' + c + '"]');
        if (td) out.add(td);
      });
      return out;
    };
    const check = label => {
      const want = expectedKeys();
      const got = new Set([...body.querySelectorAll(".cell-selected")]);
      assert(got.size === want.size && [...want].every(td => got.has(td)), label + ": " + got.size + " cells marked, expected " + want.size);
      assert([...got].every(td => td.hasAttribute("data-col") && !td.classList.contains("extract-gutter")), label + ": only value cells are marked, no gutter or spacer cell");
      const wantTh = new Set(T.extractColumns.filter(c => w.isColumnFullySelected(c.colIndex)).map(c => String(c.colIndex)));
      const gotTh = new Set([...d.querySelectorAll("#extractHead th.cell-selected")].map(th => th.dataset.col));
      assert(gotTh.size === wantTh.size && [...wantTh].every(c => gotTh.has(c)), label + ": header cells marked for fully selected columns " + [...wantTh].join(",") + " (got " + [...gotTh].join(",") + ")");
      return { marked: got.size, th: gotTh.size };
    };

    // nothing selected
    T.state.tableSelection = null;
    w.applyExtractSelectionClasses();
    assert(check("no selection").marked === 0, "no selection: nothing marked");

    // single cell
    w.selectCells([[3, T.extractColumns[0].colIndex]]);
    let r = check("single cell");
    assert(r.marked === 1 && r.th === 0, "single cell: exactly one cell, no header");

    // a range of rows (rendered window and beyond)
    w.selectCells(w.rowsRangeCells(2, 6));
    r = check("row range");
    assert(r.marked === 5 * T.extractColumns.length, "row range: 5 rows x all columns marked, got " + r.marked);

    // one whole column: its header too
    const c0 = T.extractColumns[0].colIndex;
    w.selectCells(w.columnCells(c0));
    r = check("column");
    assert(r.th === 1 && r.marked === renderedCells().filter(td => td.getAttribute("data-col") === String(c0)).length, "column: its header is marked and every rendered cell of it");

    // select-all, including rows far outside the rendered window
    w.selectCells(w.allCells());
    r = check("select-all");
    assert(r.marked === renderedCells().length && r.th === T.extractColumns.length, "select-all: every rendered value cell and every header is marked");
    assert(T.state.tableSelection.size === total * T.extractColumns.length, "select-all: the selection set holds every cell, rendered or not");

    // Ctrl+click toggle removes one cell again; the header of its column is no longer marked
    w.toggleCells([[0, c0]]);
    r = check("select-all minus one");
    assert(r.th === T.extractColumns.length - 1, "toggle: the column that lost a cell loses its header mark");

    // scroll: the rebuilt window carries the marks for ITS rows
    d.querySelector("#extractScroll").scrollTop = 150 * 28;
    w.renderExtractVisibleRows();
    check("after scrolling");
    w.selectCells(w.rowsRangeCells(150, 152));
    d.querySelector("#extractScroll").scrollTop = 0;
    w.renderExtractVisibleRows();
    r = check("selection outside the window");
    assert(r.marked === 0, "a selection entirely below the rendered window marks nothing");
    d.querySelector("#extractScroll").scrollTop = 150 * 28;
    w.renderExtractVisibleRows();
    r = check("selection back in view");
    assert(r.marked === 3 * T.extractColumns.length, "scrolled to the selection: its 3 rows are marked, got " + r.marked);
  });
}
