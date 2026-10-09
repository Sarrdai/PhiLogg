// GROUP i6-tour-dialogs — loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP i6-tour-dialogs — Round I, package I6 (small fixes), items 2-4
   Origin: 2026-10-09 (desktop usability test, 1440x900).
   2. "Show me" (Where is what): the four header-button callouts form a
      staircase (one row each, `row` in WHERE_IS_WHAT) instead of crowding one
      line; the detail panel's note reads "Detail, Why, Facets, Neighbors".
   3. "Save session…" opens a dialog titled "Save session" with a "Save" button.
   4. Link events dialog: the ordinal suffix sits inside the number field
      ("1st", not "1 st"), and the dialog hangs from a fixed top edge instead
      of staying centred (it moved up while steps were added).
   jsdom has no layout: the placement runs as the pure function on the real
   rects/sizes measured in the app (1440x900); geometry was checked in
   screenshots.
   ============================================================ */
group("i6-tour-dialogs");

await withApp(async (w, d, T) => {
  section("i6-tour-dialogs a. tour: detail-panel note and the header staircase");
  const TABLE = w.eval("WHERE_IS_WHAT");
  const detail = TABLE.find(e => e.sel === "#detailPanel");
  assert(detail.note === "Detail, Why, Facets, Neighbors", "note names the four tabs, got " + detail.note);
  const names = ["#hdrHistory", "#btnExport", "#btnFindPhone", "#btnSettings"];
  const entries = names.map(s => TABLE.find(e => e.sel === s));
  assert(entries.every(e => Number.isInteger(e.row)) && new Set(entries.map(e => e.row)).size === 4, "each header button has its own row: " + entries.map(e => e.row));
  // Real rects ([left, top, right, bottom]) and callout sizes (w, h) of the four buttons at 1440x900.
  const real = [[1186, 11, 1248, 39, 107, 26], [1264, 11, 1292, 39, 121, 26], [1308, 11, 1336, 39, 108, 26], [1396, 11, 1424, 39, 87, 26]];
  const items = real.map((r, i) => ({ rect: { left: r[0], top: r[1], right: r[2], bottom: r[3] }, w: r[4], h: r[5], side: entries[i].side, row: entries[i].row }));
  const foot = { x: 623, y: 866, w: 194, h: 26 };
  const boxes = w.placeWhereCallouts(items, { w: 1440, h: 900 }, [foot]);
  for (let i = 0; i < boxes.length; i++) {
    assert(boxes[i].y >= 39, "callout " + i + " sits below the header buttons, y=" + boxes[i].y);
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), "callouts " + i + " and " + j + " do not overlap");
      assert(Math.abs(a.y - b.y) >= a.h, "callouts " + i + " and " + j + " are on different rows");
    }
  }
  assert(boxes[3].y < boxes[2].y && boxes[2].y < boxes[1].y && boxes[1].y < boxes[0].y, "Settings nearest, Undo/redo farthest: " + boxes.map(b => b.y));
  boxes.forEach((b, i) => assert(b.x >= 4 && b.x + b.w <= 1440 - 4, "callout " + i + " inside the window"));
});

await withApp(async (w, d, T) => {
  section("i6-tour-dialogs b. 'Save session…' opens 'Save session' with a 'Save' button");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 60, seed: 7 });
  await w.addFile(sim.name, sim.text, () => {});
  w.render();
  assert(d.querySelector("#btnSave").title === "Save session…", "the header button is 'Save session…'");
  w.openSessionExportDialog();
  const dlg = d.querySelector("#sessionExportDialog");
  assert(!dlg.classList.contains("hidden"), "the dialog is open");
  assert(dlg.querySelector(".link-dialog-title").textContent === "Save session", "title, got " + dlg.querySelector(".link-dialog-title").textContent);
  assert(d.querySelector("#sessionExportConfirm").textContent === "Save", "confirm button, got " + d.querySelector("#sessionExportConfirm").textContent);
  assert(!/Export session/.test(dlg.textContent), "no 'Export session' left in the dialog");
});

await withApp(async (w, d, T) => {
  section("i6-tour-dialogs c. link dialog: '1st' inside the field, fixed top edge");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const a = w.createFilterNode(f.id, "text", "Move requested");
  const b = w.createFilterNode(f.id, "text", "Position reached");
  w.render();
  w.openLinkDialog([a.id, b.id]);
  const field = d.querySelector(".link-hop-row .link-hop-field");
  assert(!!field && field.querySelector("input.link-hop-n") && field.querySelector(".link-hop-ord"), "number input and suffix share one .link-hop-field");
  assert(field.querySelector(".link-hop-ord").textContent === "st" && field.querySelector("input").value === "1", "1 + st");
  const input = field.querySelector("input");
  input.value = "2"; input.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(field.querySelector(".link-hop-ord").textContent === "nd", "the suffix follows the number inside the same field");
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(/\.link-sentence \.link-hop-field\{[^}]*border:\s*1px solid/.test(css) && /\.link-sentence \.link-hop-ord\{margin:0;\}/.test(css), "CSS: the field carries the frame, the suffix has no margin");
  assert(/#linkDialog\{align-items:\s*flex-start;[^}]*padding-top:\s*max\(16px,\s*10vh\)/.test(css), "CSS: the link dialog hangs from a fixed top (no vertical centring)");
  assert(/body\.layout-phone #linkDialog\{padding-top:0;\}/.test(css), "CSS: phone stays full height");
});
