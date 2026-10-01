// GROUP 309 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 309 — Native context menu off app-wide; path underline only when
   interactive; numeric [*] columns plottable
   Origin: 2026-09-27, person-reported bugs. (a) Right-clicking a Patterns
   row opened the webview's own menu (Back/Reload/Print/Inspect): a
   document-level "contextmenu" listener now suppresses it everywhere except
   editable fields. (b) Covered by GROUP 201's updated asserts (no underline
   until .fp-verified). (c) A Patterns-view "Filter" produces untyped [*]
   placeholders — their numeric values showed in the Table but the Plot tab
   only offered Index/t (ms); inferNumericTextColumns now types such a column
   int/float when every non-empty value is a plain number. The tree
   drag-and-drop rewrite (mouse events instead of HTML5 DnD) is covered in
   GROUP 7.
   ============================================================ */
group(309);
await withApp(async (w, d, T) => {
  section("309a. No native context menu, except in editable fields");
  const f = await w.addFile("a.log", makeLog(0, 6, { msgPrefix: "sensor", suffix: i => "temperature=" + (40 + i * 0.5).toFixed(1) + " mode=" + (i % 2 ? "on" : "off") + " done" }), () => {});
  T.state.activeId = f.id;
  w.render();
  w.applyFhView("patterns");
  const prow = d.querySelector("#patternsRows .pattern-row");
  assert(prow, "sanity: a Patterns row is rendered");
  const ctx = el => { const ev = new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev.defaultPrevented; };
  assert(ctx(prow), "right-click on a Patterns row: native menu suppressed");
  assert(ctx(d.body), "right-click on empty page area: native menu suppressed");
  assert(!ctx(d.querySelector("#filterInput")), "a text input keeps its native menu (cut/copy/paste)");

  section("309b. Untyped [*] columns holding plain numbers are plottable");
  const node = w.createFilterNode(f.id, "text", "sensor [*] temperature=[*] mode=[*] done");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  const typeOf = ci => T.extractColumns.find(c => c.colIndex === ci).type;
  assert(typeOf(0) === "int", "an all-integer [*] column is typed int, got " + typeOf(0));
  assert(typeOf(1) === "float", "a decimal [*] column is typed float, got " + typeOf(1));
  assert(typeOf(2) === "text", "a non-numeric [*] column stays text, got " + typeOf(2));
  w.applyFhView("plot");
  const yCols = [...d.querySelectorAll("#plotYList input[type=checkbox]")].map(cb => cb.dataset.col);
  assert(yCols.includes("0") && yCols.includes("1") && !yCols.includes("2"),
    "Plot offers the numeric [*] columns, not the text one, got " + JSON.stringify(yCols));
  w.switchExtractView("table");
});
