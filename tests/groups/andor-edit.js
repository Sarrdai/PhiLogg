// GROUP andor-edit — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP andor-edit — "Edit conditions…" dialog of AND/OR combiner nodes
   Origin: 2026-10-07 (FEATURE_BACKLOG #58). Menu/toolbar entry only for combiners with baked
   sides; the dialog edits operator + baked conditions in place (text rows vs chips, ▾ picks a
   baked COPY, add/remove, Save disabled below 2 conditions); Save = updateAndOrNodeWithUndo
   (ONE undo step restoring baked + filterType + name via captureNodeFields' `combine`); auto
   name regenerated only while still auto; live count = what the saved node returns.
   ============================================================ */
group("andor-edit");

if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourLog = TOUR.demoLog();
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const rowEl = (d, i) => d.querySelectorAll("#andOrSides .link-side")[i];
  const rowInput = (d, i) => rowEl(d, i).querySelector("input.link-side-input");
  const rowCount = d => d.querySelectorAll("#andOrSides .link-side").length;
  const pressed = el => el.getAttribute("aria-pressed") === "true";
  const typeInto = (w, input, value) => { input.value = value; input.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const save = d => d.querySelector("#andOrDialogSave");
  const hidden = d => d.querySelector("#andOrDialog").classList.contains("hidden");
  const txtNode = (w, f, v) => w.createFilterNode(f.id, "text", v, false, null, false, ["message"]);
  const countMsgs = (f, ...subs) => f.entries.filter(e => subs.some(s => e.message.includes(s))).length;
  const countBoth = (f, a, b) => f.entries.filter(e => e.message.includes(a) && e.message.includes(b)).length;

  await withApp(async (w, d, T) => {
    section("andor-edit a. entry points: tree menu + toolbar for a baked combiner only");
    const f = await w.addFile("app.log", tourLog, () => {});
    const a = txtNode(w, f, "Move requested");
    const b = txtNode(w, f, "axis=1");
    const node = w.createAndOrNode([a.id, b.id], "and");
    T.state.activeId = node.id;
    w.render();
    w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, node.id);
    const edit = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "edit");
    assert(edit && /Edit conditions/.test(txt(edit)), "tree menu offers 'Edit conditions…' for an AND node");
    assert([...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "unpack"), "Unpack is still there");
    let tb = w.describeSidebarToolbarActions().actions.find(x => x.action === "edit");
    assert(tb.label === "Edit conditions…" && !tb.disabled, "toolbar Edit: 'Edit conditions…', enabled");
    const legacy = txtNode(w, f, "x");
    legacy.filterType = "and"; legacy.baked = undefined; legacy.value = null;
    T.state.activeId = legacy.id;
    w.render();
    w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, legacy.id);
    assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "edit"), "no Edit entry for a combiner without baked sides");
    tb = w.describeSidebarToolbarActions().actions.find(x => x.action === "edit");
    assert(tb.disabled, "toolbar Edit disabled for it");
    assert(w.editFilterNode(legacy.id) === false && hidden(d), "editFilterNode refuses it");
    assert(w.editFilterNode(node.id) === true && !hidden(d), "editFilterNode opens the dialog for a baked AND");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("andor-edit b. dialog prefilled: text rows vs chips, labels, mode, live count");
    const f = await w.addFile("app.log", tourLog, () => {});
    const a = txtNode(w, f, "Move requested");
    const lv = w.createFilterNode(f.id, "level", ["INFO"]);
    const col = w.createFilterNode(f.id, "text", "axis=1", false, null, false, ["message"], false, false);
    col.columns = ["thread"]; // column-restricted: not a plain text condition
    const node = w.createAndOrNode([a.id, lv.id, col.id], "or");
    w.openAndOrDialog(node.id);
    assert(txt(d.querySelector("#andOrDialog .link-dialog-title")) === "Edit conditions", "title");
    assert(rowCount(d) === 3, "3 rows");
    assert(rowInput(d, 0) && rowInput(d, 0).value === "Move requested", "plain text -> text input");
    assert(!rowInput(d, 1) && rowEl(d, 1).querySelector(".link-side-chip") && !rowInput(d, 2) && rowEl(d, 2).querySelector(".link-side-chip"), "level and column-restricted -> chips");
    assert(txt(rowEl(d, 1).querySelector(".link-side-chip span")) === w.bakedConditionName(node.baked[1]), "chip named by bakedConditionName");
    assert(txt(rowEl(d, 0).querySelector(".link-side-lab")) === "" && txt(rowEl(d, 1).querySelector(".link-side-lab")) === "OR", "labels: empty, OR");
    assert(pressed(d.querySelector('#andOrMode [data-mode="or"]')) && !pressed(d.querySelector('#andOrMode [data-mode="and"]')), "mode OR pressed");
    assert(rowEl(d, 0).querySelectorAll("[data-row-remove]").length === 1, "remove buttons present with 3 rows");
    await waitFor(() => d.querySelector("#andOrLiveMatch").textContent.length > 0);
    const expected = w.getEntries(node.id).length;
    assert(txt(d.querySelector("#andOrLiveMatch")).replace(/\./g, "").startsWith(String(expected)), "live count equals the node's count (" + expected + "): " + txt(d.querySelector("#andOrLiveMatch")));
    fireClick(d.querySelector('#andOrMode [data-mode="and"]'), w);
    assert(txt(rowEl(d, 1).querySelector(".link-side-lab")) === "AND" && pressed(d.querySelector('#andOrMode [data-mode="and"]')), "mode switch relabels rows");
    fireClick(d.querySelector("#andOrDialogCancel"), w);
    assert(hidden(d) && node.filterType === "or" && node.baked.length === 3, "Cancel: nothing changed");
    w.openAndOrDialog(node.id);
    d.querySelector("#andOrDialog").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    assert(hidden(d), "backdrop click closes");
    w.openAndOrDialog(node.id);
    d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(hidden(d), "Escape closes");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("andor-edit c. swap a text condition, chip kept intact, AND -> OR, name rules, one undo");
    const f = await w.addFile("app.log", tourLog, () => {});
    const a = txtNode(w, f, "Move requested");
    const lv = w.createFilterNode(f.id, "level", ["INFO"]);
    const node = w.createAndOrNode([a.id, lv.id], "and");
    assert(node.name === "“Move requested” ∧ INFO", "auto name: " + node.name);
    const levelBaked = JSON.stringify(node.baked[1]);
    const before = JSON.stringify(w.captureNodeFields(node));
    const nBefore = w.getEntries(node.id).length;
    assert(nBefore === countMsgs(f, "Move requested"), "AND of Move requested and INFO");
    const undoLen = T.undoStack.length;
    w.openAndOrDialog(node.id);
    typeInto(w, rowInput(d, 0), "Position reached");
    fireClick(d.querySelector('#andOrMode [data-mode="or"]'), w);
    await waitFor(() => /\d/.test(d.querySelector("#andOrLiveMatch").textContent));
    const infoCount = f.entries.filter(e => e.message.includes("Position reached") || e.level === "INFO").length;
    assert(txt(d.querySelector("#andOrLiveMatch")).replace(/\./g, "").startsWith(String(infoCount)), "live count for OR: " + infoCount + " got " + txt(d.querySelector("#andOrLiveMatch")));
    fireClick(save(d), w);
    assert(hidden(d) && T.undoStack.length === undoLen + 1, "closed, exactly one undo step");
    assert(node.filterType === "or" && node.baked[0].value === "Position reached" && JSON.stringify(node.baked[1]) === levelBaked, "text swapped, level chip saved unchanged");
    assert(node.name === "“Position reached” ∨ INFO", "auto name regenerated: " + node.name);
    assert(w.getEntries(node.id).length === infoCount, "saved node returns what the live count showed");
    assert(T.state.activeId === node.id, "node active");
    w.undo();
    assert(node.filterType === "and" && JSON.stringify(w.captureNodeFields(node)) === before && w.getEntries(node.id).length === nBefore, "undo restores baked + filterType + name + entries");
    w.redo();
    assert(node.filterType === "or" && node.baked[0].value === "Position reached" && w.getEntries(node.id).length === infoCount && node.name === "“Position reached” ∨ INFO", "redo reapplies");
    // renamed node keeps its name
    node.name = "My combo";
    w.openAndOrDialog(node.id);
    typeInto(w, rowInput(d, 0), "Heartbeat");
    fireClick(save(d), w);
    assert(node.name === "My combo" && node.baked[0].value === "Heartbeat", "a renamed node keeps its name");
    const labeled = w.createAndOrNode([a.id, lv.id], "and");
    labeled.label = "Shown";
    w.openAndOrDialog(labeled.id);
    typeInto(w, rowInput(d, 0), "Heartbeat");
    fireClick(save(d), w);
    assert(labeled.label === "Shown" && labeled.name === "“Move requested” ∧ INFO", "a labeled node keeps its name too");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("andor-edit d. add / remove rows, Save disabled below 2, empty rows dropped, Enter saves");
    const f = await w.addFile("app.log", tourLog, () => {});
    const a = txtNode(w, f, "Move requested");
    const b = txtNode(w, f, "axis=1");
    const node = w.createAndOrNode([a.id, b.id], "and");
    w.openAndOrDialog(node.id);
    assert(rowEl(d, 0).querySelectorAll("[data-row-remove]").length === 0, "no remove button with 2 rows");
    fireClick(d.querySelector("#andOrAddStep"), w);
    assert(rowCount(d) === 3 && rowInput(d, 2).value === "" && d.activeElement === rowInput(d, 2), "+ Add condition: empty row, focused");
    assert(!save(d).disabled, "Save enabled: the empty row is simply dropped");
    await waitFor(() => d.querySelector("#andOrLiveMatch").textContent.length > 0);
    assert(rowEl(d, 0).querySelectorAll("[data-row-remove]").length === 1, "remove buttons with 3 rows");
    fireClick(rowEl(d, 1).querySelector("[data-row-remove]"), w);
    assert(rowCount(d) === 2 && rowInput(d, 0).value === "Move requested", "row removed");
    typeInto(w, rowInput(d, 1), "");
    assert(save(d).disabled, "Save disabled with 1 non-empty condition");
    await waitFor(() => !d.querySelector("#andOrHint").classList.contains("hidden"));
    assert(/at least 2/.test(d.querySelector("#andOrHint").textContent) && d.querySelector("#andOrResults").classList.contains("hidden"), "hint, no results");
    fireClick(save(d), w);
    assert(!hidden(d) && node.baked.length === 2, "disabled Save does nothing");
    fireClick(d.querySelector("#andOrAddStep"), w);
    typeInto(w, rowInput(d, 1), "axis=2");
    typeInto(w, rowInput(d, 2), "Position");
    rowInput(d, 2).dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    assert(hidden(d) && node.baked.length === 3 && node.baked.map(x => x.value).join() === "Move requested,axis=2,Position", "Enter saves 3 conditions");
    assert(node.name === "“Move requested” ∧ “axis=2” ∧ “Position”", "name regenerated: " + node.name);
    w.openAndOrDialog(node.id);
    fireClick(d.querySelector("#andOrAddStep"), w);
    fireClick(save(d), w);
    assert(node.baked.length === 3, "empty row dropped on save");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("andor-edit e. chip -> text, ▾ picks a baked copy (source deletion does not matter)");
    const f = await w.addFile("app.log", tourLog, () => {});
    const a = txtNode(w, f, "Move requested");
    const lv = w.createFilterNode(f.id, "level", ["INFO"]);
    const node = w.createAndOrNode([a.id, lv.id], "and");
    const src = txtNode(w, f, "axis=2");
    w.openAndOrDialog(node.id);
    fireClick(rowEl(d, 1).querySelector("[data-row-clear]"), w);
    assert(rowInput(d, 1) && rowInput(d, 1).value === "" && d.activeElement === rowInput(d, 1), "chip ✕ -> empty focused text input");
    assert(save(d).disabled, "Save disabled until the field is filled");
    fireClick(rowEl(d, 1).querySelector("[data-row-pick]"), w);
    const menu = d.querySelector("#andOrSideMenu");
    const items = [...menu.querySelectorAll("[data-pick-node]")].map(x => x.dataset.pickNode);
    assert(!menu.classList.contains("hidden") && items.includes(src.id) && items.includes(a.id) && !items.includes(node.id), "menu lists combinable filters, not the node itself");
    assert(menu.querySelector("[data-pick-text]"), "menu has 'Type a pattern'");
    fireClick(menu.querySelector('[data-pick-node="' + src.id + '"]'), w);
    assert(menu.classList.contains("hidden") && rowEl(d, 1).querySelector(".link-side-chip") && txt(rowEl(d, 1).querySelector(".link-side-chip span")) === "“axis=2”", "picked filter is a chip");
    fireClick(save(d), w);
    assert(node.baked[1].filterType === "text" && node.baked[1].value === "axis=2" && node.baked[1] !== src && !node.inputA, "baked copy of the filter");
    const n1 = w.getEntries(node.id).length;
    assert(n1 === countBoth(f, "Move requested", "axis=2"), "entries: both conditions");
    w.deleteNode ? w.deleteNode(src.id) : null;
    w.invalidateAllCaches();
    assert(w.getEntries(node.id).length === n1 && node.baked[1].value === "axis=2", "deleting the source filter does not change the combiner");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("andor-edit f. inverted combiner: live count honors NOT");
    const f = await w.addFile("app.log", tourLog, () => {});
    const a = txtNode(w, f, "Move requested");
    const b = txtNode(w, f, "axis=1");
    const node = w.createAndOrNode([a.id, b.id], "and");
    node.inverted = true;
    w.invalidateAllCaches();
    w.openAndOrDialog(node.id);
    await waitFor(() => d.querySelector("#andOrLiveMatch").textContent.length > 0);
    const n = w.getEntries(node.id).length;
    assert(txt(d.querySelector("#andOrLiveMatch")).replace(/\./g, "").startsWith(String(n)) && /NOT/.test(txt(d.querySelector("#andOrLiveMatch"))), "inverted count " + n + ": " + txt(d.querySelector("#andOrLiveMatch")));
    fireClick(save(d), w);
    assert(node.inverted === true, "inverted kept");
  }, { indexedDB: new IDBFactory() });
  await withApp(async (w, d, T) => {
    section("andor-edit g. popup-style text filters (no columns) are text fields and keep their column shape");
    const f = await w.addFile("app.log", tourLog, () => {});
    const a = w.createFilterNode(f.id, "text", "Move requested");
    const b = w.createFilterNode(f.id, "text", "axis=1");
    assert(!a.columns, "popup-style filter has no columns");
    const node = w.createAndOrNode([a.id, b.id], "and");
    const origA = JSON.parse(JSON.stringify(node.baked[0]));
    w.openAndOrDialog(node.id);
    assert(rowInput(d, 0) && rowInput(d, 1) && rowInput(d, 0).value === "Move requested", "two text fields");
    typeInto(w, rowInput(d, 1), "axis=2");
    fireClick(save(d), w);
    assert(JSON.stringify(node.baked[0]) === JSON.stringify(origA), "unchanged row stays deep-equal to the original");
    assert(node.baked[1].value === "axis=2" && !("columns" in node.baked[1]), "edited row keeps columns absent");
    assert(w.getEntries(node.id).length === countBoth(f, "Move requested", "axis=2"), "entries follow the edit");
    // a ["message"] condition stays ["message"]; a cleared chip becomes a message-column condition
    const m = txtNode(w, f, "Heartbeat"), lv = w.createFilterNode(f.id, "level", ["INFO"]);
    const n2 = w.createAndOrNode([m.id, lv.id], "or");
    w.openAndOrDialog(n2.id);
    typeInto(w, rowInput(d, 0), "Tick");
    fireClick(rowEl(d, 1).querySelector("[data-row-clear]"), w);
    typeInto(w, rowInput(d, 1), "Scan");
    fireClick(save(d), w);
    assert(n2.baked[0].columns.join() === "message" && n2.baked[0].value === "Tick" && n2.baked[1].columns.join() === "message" && n2.baked[1].value === "Scan", "column shapes kept / cleared chip is a message condition");
  }, { indexedDB: new IDBFactory() });
}
