// GROUP 339 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 339 — Export / Share: direct "Copy for ticket" without the
   dialog (step 3): row context menu #ctxCopyTicket, rebindable shortcut
   copyForTicket (Ctrl+Shift+C), tree-menu item on a selection filter.
   One shared copyEntriesForTicket: gaps always on, header per the
   remembered toggle, remembered format (rich -> html + plain).
   Also: the rich entry divs wrap with overflow-wrap:anywhere (no
   mid-word breaks).
   ============================================================ */
group(339);
await withApp(async (w, d, T) => {
  const f = await w.addFile("app.log", makeLog(0, 40, { levels: ["ERROR", "INFO", "WARN", "INFO", "INFO"] }), () => {});
  const E = f.entries;
  T.state.activeId = f.id;
  w.render();
  let plain = null, written = null, writes = 0;
  w.ClipboardItem = function (items) { this.items = items; };
  w.navigator.clipboard.write = items => { written = items[0].items; return Promise.resolve(); };
  w.navigator.clipboard.writeText = t => { plain = t; writes++; return Promise.resolve(); };
  const reset = () => { plain = null; written = null; };
  const toast = () => d.querySelector("#copyToast").textContent;

  section("339a. row context menu item");
  const ids = [...d.querySelector("#contextMenu").children].map(c => c.id);
  assert(ids.indexOf("ctxCopyTicket") === ids.indexOf("ctxCopy") + 1, "Copy for ticket sits right after Copy");
  w.eval("exportGaps = false; exportHeader = false"); // gaps must still be ON for the direct paths
  T.state.logMultiSelect.clear();
  w.openContextMenu({ clientX: 10, clientY: 10 }, E[5]);
  fireClick(d.querySelector("#ctxCopyTicket"), w);
  assert(plain === "```\n" + E[5].raw + "\n```" && toast() === "Copied for ticket (1 entries)", "single right-clicked row, header off as remembered, got " + JSON.stringify(plain) + " / " + toast());
  assert(!isVisible(d.querySelector("#contextMenu"), w), "the menu closes");
  T.state.logMultiSelect.add(E[2].id); T.state.logMultiSelect.add(E[9].id);
  w.openContextMenu({ clientX: 10, clientY: 10 }, E[5]);
  reset();
  fireClick(d.querySelector("#ctxCopyTicket"), w);
  assert(plain === "```\n" + E[2].raw + "\n··· 6 lines · +7s ···\n" + E[9].raw + "\n```" && toast() === "Copied for ticket (2 entries)",
    "2+ marked rows are quoted (log order) with a gap line even though exportGaps is off, got " + JSON.stringify(plain));
  w.eval("exportHeader = true");
  reset();
  w.openContextMenu({ clientX: 10, clientY: 10 }, E[5]);
  fireClick(d.querySelector("#ctxCopyTicket"), w);
  assert(plain.startsWith("**app.log** (50 entries)".replace("50", "40")), "header on -> compact header first, got " + plain.split("\n")[0]);
  w.eval('exportFormat = "rich"');
  reset();
  w.openContextMenu({ clientX: 10, clientY: 10 }, E[5]);
  fireClick(d.querySelector("#ctxCopyTicket"), w);
  const html = written && await written["text/html"].text();
  assert(html && html.includes("border:1px solid #dcdfe4") && html.includes("··· 6 lines") && (await written["text/plain"].text()).startsWith("app.log (40 entries)"), "rich: text/html + plain text");
  assert(html.includes("overflow-wrap:anywhere") && html.includes("tab-size:4") && !html.includes("break-all"), "rich entry divs wrap without mid-word breaks");
  w.eval('exportFormat = "markdown"');
  T.state.logMultiSelect.clear();

  section("339b. shortcut copyForTicket");
  const b = w.eval('getShortcutBinding("copyForTicket")');
  assert(b.ctrl && b.shift && !b.alt && b.key === "c", "default binding is Ctrl+Shift+C");
  assert(w.eval('SHORTCUT_ACTIONS.filter(a => a.id !== "copyForTicket").every(a => { const x = getShortcutBinding(a.id); return !(x.ctrl && x.shift && !x.alt && x.key === "c"); })'), "no other action uses Ctrl+Shift+C");
  T.state.selectedId = null;
  reset(); w.showCopyToast("");
  fireKeydown(d, w, "C", { ctrlKey: true, shiftKey: true });
  assert(plain === null && toast() === "Nothing to copy", "nothing selected -> toast, no clipboard write");
  T.state.selectedId = E[7].id;
  fireKeydown(d, w, "C", { ctrlKey: true, shiftKey: true });
  assert(plain.includes(E[7].raw) && toast() === "Copied for ticket (1 entries)", "the selected row is quoted");
  T.state.logMultiSelect.add(E[1].id); T.state.logMultiSelect.add(E[4].id); T.state.logMultiSelect.add(E[5].id);
  fireKeydown(d, w, "C", { ctrlKey: true, shiftKey: true });
  assert(plain.includes(E[1].raw) && plain.includes("··· 2 lines") && !plain.includes(E[7].raw) && toast() === "Copied for ticket (3 entries)", "marked rows win over the selected row");
  T.state.logMultiSelect.clear();
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(plain === E[7].raw, "plain Ctrl+C still copies the raw row");

  section("339c. tree menu item on selection filters only; story export of a non-active node");
  const txt = w.createFilterNode(f.id, "text", "message 1", false);
  const sel = w.createSelectionFilterNode(f.id, [E[2].id, E[10].id, E[11].id, E[30].id]);
  sel.name = "Pool exhaustion";
  const menuItems = id => { w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {} }, id); return [...d.querySelectorAll("#treeContextMenu [data-action]")].map(x => x.dataset.action); };
  assert(!menuItems(txt.id).includes("copyTicket") && !menuItems(f.id).includes("copyTicket"), "not offered on a file or an ordinary filter");
  assert(menuItems(sel.id).includes("copyTicket"), "offered on a selection filter");
  T.state.activeId = txt.id;
  T.state.levelFilter.add("ERROR");
  reset();
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {} }, sel.id);
  fireClick(d.querySelector('#treeContextMenu [data-action="copyTicket"]'), w);
  assert(plain.startsWith("### Pool exhaustion\n\n**app.log** (40 entries) · 4 hand-picked entries"), "story heading for the (non-active) selection node, got " + JSON.stringify(plain && plain.split("\n").slice(0, 3)));
  assert(plain.includes(E[2].raw + "\n··· 7 lines · +8s ···\n" + E[10].raw + "\n" + E[11].raw + "\n··· 18 lines · +19s ···\n" + E[30].raw), "all four entries with gaps, level filter ignored");
  assert(toast() === "Copied for ticket (4 entries)" && T.state.activeId === txt.id, "toast; the active node is unchanged");
  T.state.levelFilter.clear();
  assert(w.collectExportContext().active === txt && w.collectExportContext(sel.id).active === sel && w.collectExportContext("nope") === null, "collectExportContext(nodeId) defaults to the active node");
});
