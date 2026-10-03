// GROUP wrap-rows-padding — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP wrap-rows-padding — wrapped-row char capacity uses the rows
   element's real CSS padding
   Origin: 2026-10-03 (tablet usability test). wrapColsForBody/
   syncTableRowsWidth used a fixed 14+16 padding while #tableRows really has
   26px+ left padding (phone: 0), so wrapped rows were allocated too few lines
   and overlapped. The padding is now read via getComputedStyle (rowsHPadding).
   ============================================================ */
group("wrap-rows-padding");
await withApp(async (w, d, T) => {
  section("wrap-rows-padding a. The column count follows the computed padding of #tableRows / #highlightRows");
  const fa = await w.addFile("a.log", makeLog(0, 4, { suffix: () => "y".repeat(240) }), () => {});
  T.state.activeId = fa.id;
  const tableBody = d.querySelector("#tableBody"), highlightBody = d.querySelector("#highlightBody");
  Object.defineProperty(tableBody, "clientWidth", { value: 2000, configurable: true });
  Object.defineProperty(highlightBody, "clientWidth", { value: 2000, configurable: true });
  T.state.wrapMessages = true;
  w.render();

  const realGcs = w.getComputedStyle.bind(w);
  const pads = { tableRows: [26, 16], highlightRows: [26, 16] };
  w.getComputedStyle = (el, ...r) => {
    const cs = realGcs(el, ...r);
    const p = el && el.id && pads[el.id];
    return p ? new Proxy(cs, { get: (t, k) => k === "paddingLeft" ? p[0] + "px" : k === "paddingRight" ? p[1] + "px" : (typeof t[k] === "function" ? t[k].bind(t) : t[k]) }) : cs;
  };
  try {
    const cw = w.msgCharWidth();
    const gutter = w.tableGutterW();
    const expect = pad => Math.max(1, Math.floor((2000 - pad - gutter - cw) / cw));
    assert(w.wrapColsForBody(tableBody) === expect(42), "table: capacity uses the real 26+16 padding, got " + w.wrapColsForBody(tableBody) + " expected " + expect(42));
    assert(w.wrapColsForBody(tableBody) !== expect(30) || cw > 12, "...not the old fixed 30");

    pads.tableRows = [0, 0]; // layout-phone: padding:2px 0 20px 0
    assert(w.wrapColsForBody(tableBody) === expect(0), "phone-style zero padding gives more columns, got " + w.wrapColsForBody(tableBody));
    pads.tableRows = [29, 16]; // --color-mark-w: 6px -> +3px
    assert(w.wrapColsForBody(tableBody) === expect(45), "a wider color mark shrinks the capacity, got " + w.wrapColsForBody(tableBody));

    // Context view: gutter = lastColumnEdgeX + COLUMN_GRID_GAP, same as the table's in log mode
    pads.highlightRows = [38, 16];
    assert(w.wrapColsForBody(highlightBody) === expect(54), "Context view reads #highlightRows' own padding, got " + w.wrapColsForBody(highlightBody));
    pads.highlightRows = [26, 16];
    assert(w.wrapColsForBody(highlightBody) === expect(42), "...and follows it");
  } finally { w.getComputedStyle = realGcs; }

  section("wrap-rows-padding b. Unresolvable padding values fall back to the old default");
  w.getComputedStyle = () => ({ paddingLeft: "", paddingRight: "" });
  try {
    const cw2 = w.msgCharWidth();
    const fb = w.wrapColsForBody(tableBody);
    assert(fb === Math.max(1, Math.floor((2000 - 30 - w.tableGutterW() - cw2) / cw2)), "fallback padding 30, got " + fb);
  } finally { w.getComputedStyle = realGcs; }
});
