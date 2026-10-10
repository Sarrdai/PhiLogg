// GROUP 326 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 326 — Plot tab role chips: badges per chart type, role menu
   (setPlotColumnRole), sidebar sync, Table tab unchanged, menu survives a
   re-render, clickable 2D axis titles. */
group(326);
await withApp(async (w, d, T) => {
  const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: ["sensors"], entries: 60, seed: 3 });
  const f = await w.addFile(file.name, file.text, () => {});
  const node = w.createFilterNode(f.id, "text", "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  const chip = ci => d.querySelector('#extractPatternView .pattern-chip[data-col="' + ci + '"]');
  const badges = ci => [...chip(ci).querySelectorAll(".pattern-role")].map(b => b.textContent).join("");
  const menu = () => d.querySelector("#plotRoleMenu");
  const menuOpen = () => !!menu() && !menu().classList.contains("hidden");
  const item = label => [...menu().querySelectorAll(".ctx-item")].find(i => i.textContent.replace(/^\u2713/, "").startsWith(label));
  const pick = label => { const it = item(label); assert(it, "menu item '" + label + "' exists"); fireClick(it, w); };
  const sel = (id, v) => { const e = d.querySelector(id); e.value = String(v); e.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const type = t => fireClick(d.querySelector('.plot-type-btn[data-type="' + t + '"]'), w);

  section("326a. Table tab: no badges, no Row group, click still toggles ignore");
  assert(!d.querySelector(".pattern-role") && !d.querySelector(".pattern-grp"), "no badges / Row group on the Table tab");
  fireClick(chip(3), w);
  assert(w.isColumnIgnored(node, 3), "click ignores the column in the Table tab");
  fireClick(chip(3), w);
  assert(!w.isColumnIgnored(node, 3), "click includes it again");
  assert(!menuOpen(), "no role menu on the Table tab");

  section("326b. Plot tab, line: Row group, badges, menu items");
  w.applyFhView("plot");
  type("line");
  assert([...d.querySelectorAll(".pattern-grp")].map(g => g.textContent).join() === "Row,Message", "Row and Message labels");
  assert(chip(-2) && chip(-1) && d.querySelector(".pattern-sep"), "Row chips for Index and t (ms) plus a separator");
  assert(chip(-2).querySelector(".pattern-chip-num").textContent === "#" && chip(-1).querySelector(".pattern-chip-num").textContent === "t", "glyphs # and t");
  assert(badges(-1) === "X" && badges(1) === "Y", "line default: t (ms) = X, temperature = Y, got " + badges(-1) + "/" + badges(1));
  assert(chip(2).querySelector(".pattern-role.empty").textContent === "+", "a plottable chip without role shows the dashed +");
  assert(!chip(0).querySelector(".pattern-role"), "the word chip has no badge");
  fireClick(chip(2), w);
  assert(menuOpen() && menu().textContent.includes("pressure [bar]"), "click opens the role menu with the column header, got " + (menu() && menu().textContent));
  assert(item("Color by").classList.contains("disabled"), "Color by is disabled on line");
  assert(item("Z axis").classList.contains("disabled"), "Z axis is disabled on line");
  assert(item("Not plotted").classList.contains("disabled"), "Not plotted disabled without a role");
  pick("Y axis");
  assert(!menuOpen(), "menu closed after choosing");
  assert(T.plotConfig.yCols.includes(1) && T.plotConfig.yCols.includes(2), "Y (add/remove) adds pressure, got " + JSON.stringify(T.plotConfig.yCols));
  assert(badges(2) === "Y", "badge follows");
  assert(d.querySelector('#plotYList input[data-col="2"]').checked, "the sidebar Y list shows it too");
  fireClick(chip(2), w);
  assert(item("Y axis").textContent.includes("\u2713"), "Y axis has a check when active");
  pick("Not plotted");
  assert(!T.plotConfig.yCols.includes(2) && badges(2) === "+", "Not plotted removes it from Y");
  fireClick(chip(-2), w);
  assert(item("Not plotted").classList.contains("disabled"), "Not plotted disabled when X is the only role");
  fireKeydown(d, w, "Escape");
  assert(!menuOpen(), "Escape closes the menu");

  section("326c. Plot tab, scatter: X / Color by via the menu, sidebar select follows, outside click closes");
  type("scatter");
  fireClick(chip(3), w);
  pick("X axis");
  assert(T.plotConfig.xCol === 3 && d.querySelector("#plotXSelect").value === "3", "X axis pick sets xCol and the sidebar select, got " + T.plotConfig.xCol + "/" + d.querySelector("#plotXSelect").value);
  assert(badges(3) === "X", "badge X on voltage");
  fireClick(chip(2), w);
  pick("Color by");
  assert(T.plotConfig.colorCol === 2 && badges(2) === "C", "Color by sets colorCol, badge C");
  fireClick(chip(2), w);
  assert(item("Color by").textContent.includes("\u2713"), "Color by is checked");
  fireClick(d.body, w);
  assert(!menuOpen(), "outside click closes the menu");
  fireClick(chip(2), w);
  pick("Y axis");
  assert(T.plotConfig.yCols[0] === 2 && badges(2) === "YC" && !badges(1).includes("Y"), "scatter Y moves to the front (yCols[0]), got " + JSON.stringify(T.plotConfig.yCols));
  // a sidebar change is reflected in the badges
  sel("#plotYSelectSingle", 1);
  assert(badges(1) === "Y" && badges(2) === "C", "sidebar Y select updates the badges, got " + badges(1) + "/" + badges(2));

  section("326d. 3D and radar");
  type("3d");
  fireClick(chip(1), w);
  pick("Z axis");
  assert(T.plotConfig.zCol === 1 && badges(1).includes("Z"), "Z axis on 3d");
  assert([-2, -1, 0, 1, 2, 3].map(badges).join("|").includes("X") , "3d has an X badge");
  type("radar");
  const cols = T.plotConfig.multiCols;
  assert(cols.length >= 1 && badges(cols[0]) === "1", "radar: badge is the 1-based position in multiCols, got " + JSON.stringify(cols));
  fireClick(chip(3), w);
  assert(item("X axis").classList.contains("disabled"), "X axis disabled on radar");
  const had = T.plotConfig.multiCols.includes(3);
  pick(had ? "Remove from columns" : "Add to columns");
  assert(T.plotConfig.multiCols.includes(3) === !had, "Add/Remove toggles multiCols");
  assert(had ? badges(3) === "+" : /^\d+$/.test(badges(3)), "badge follows multiCols");
  type("parallel");
  fireClick(chip(3), w);
  pick("Color by");
  assert(T.plotConfig.colorCol === 3 && badges(3).includes("C"), "parallel supports Color by, got " + T.plotConfig.colorCol + " " + badges(2));

  section("326e. Ignore column from the menu; menu survives a re-render (tail tick stand-in)");
  type("line");
  fireClick(chip(3), w);
  pick("Ignore column");
  assert(w.isColumnIgnored(node, 3) && !chip(3).querySelector(".pattern-role"), "ignored via menu, no badge on the ignored chip");
  fireClick(chip(3), w);
  assert(item("Include column") && menu().querySelectorAll(".ctx-item").length === 1, "ignored chip's menu holds only Include column");
  pick("Include column");
  assert(!w.isColumnIgnored(node, 3), "included again");
  fireClick(chip(-1), w);
  assert(!item("Ignore column") && !item("Include column"), "Row chips have no ignore item");
  w.renderExtractTable(node);
  assert(menuOpen(), "an open menu survives a renderExtractTable re-render");
  assert(chip(-1) && badges(-1) === "X", "chips were rebuilt with badges");
  w.applyFhView("table");
  assert(!menuOpen(), "switching to the Table tab closes the menu");
  assert(!d.querySelector(".pattern-role") && !d.querySelector(".pattern-grp"), "Table tab: badges and Row group gone again");

  section("326f. 2D axis titles are clickable");
  w.applyFhView("plot");
  type("scatter");
  sel("#plotXSelect", -1);
  const xTitle = d.querySelector('#plotSvg .plot-axis-clickable[data-axis="x"]');
  assert(xTitle && !d.querySelector("#plotSvg .plot-axis-caret") && xTitle.textContent === "Time", "the X title is clickable, keeps its plain text, and has no caret");
  fireClick(xTitle, w);
  assert(menuOpen() && menu().textContent.includes("temperature [C]"), "axis menu lists the columns with units");
  pick("voltage");
  assert(T.plotConfig.xCol === 3 && d.querySelector("#plotXSelect").value === "3", "axis menu pick changes xCol and the sidebar, got " + T.plotConfig.xCol + "/" + d.querySelector("#plotXSelect").value);
  sel("#plotColorSelect", 2);
  const cTitle = d.querySelector('#plotSvg .plot-axis-clickable[data-axis="color"]');
  assert(cTitle, "the color-bar title is clickable");
  fireClick(cTitle, w);
  pick("None");
  assert(T.plotConfig.colorCol === null, "None clears the color column");
});
