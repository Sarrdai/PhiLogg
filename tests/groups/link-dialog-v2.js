// GROUP link-dialog-v2 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-dialog-v2 — the link dialog: Start/End text fields, "Same" chips, edit mode, entry points
   Origin: 2026-10-04 (link usability round B, step 2). Sides are text fields with a "▾" to
   pick an existing filter; defaults next + the recommended key (job on the tour demo log);
   preview "192 pairs · 13 without end · median · max", slowest first, then the first start
   without an end; Δt "36 of 192 pairs"; Create makes ONE node (also for several steps);
   "Edit link…" (tree menu, toolbar, editFilterNode) saves via updateLinkNodeWithUndo (one undo
   step); entry points: multi-select, "Link with…", the filter popup's "Link two events…".
   ============================================================ */
group("link-dialog-v2");

if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourLog = TOUR.demoLog();
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const side = (d, i) => d.querySelectorAll("#linkSides .link-side")[i];
  const sideInput = (d, i) => side(d, i).querySelector("input.link-side-input");
  const chip = (d, id) => d.querySelector('#linkKeyChips [data-key-chip="' + id + '"]');
  const pressed = el => el.getAttribute("aria-pressed") === "true";
  const previewDone = async (w, d) => { await waitFor(() => d.querySelector("#linkLiveMatch").textContent.length > 0 || !d.querySelector("#linkHint").classList.contains("hidden")); };

  await withApp(async (w, d, T) => {
    section("link-dialog-v2 a. defaults on the tour log: next, key job preselected, preview numbers");
    const f = await w.addFile("app.log", tourLog, () => {});
    w.openLinkDialog({ rootId: f.id, start: { text: "Move requested" }, hops: [{ text: "Position reached" }] });
    assert(txt(d.querySelector("#linkDialogTitle")) === "Link events" && txt(d.querySelector("#linkDialogCreate")) === "Create", "title Link events, button Create");
    assert(sideInput(d, 0).value === "Move requested" && sideInput(d, 1).value === "Position reached", "Start/End are text fields with the given patterns");
    assert(d.querySelectorAll("#linkSides .link-side-pick, #linkSides [data-side-pick]").length === 2, "each side has a ▾");
    const hopRow = d.querySelector("#linkSides .link-hop-row");
    assert(pressed(hopRow.querySelector('[data-dir="after"]')) && txt(hopRow.querySelector('[data-dir="after"]')) === "next" && txt(hopRow.querySelector('[data-dir="before"]')) === "previous", "direction segmented control defaults to next, other is previous");
    assert(hopRow.querySelector(".link-hop-n").value === "1" && hopRow.querySelector(".link-hop-ord").textContent === "st", "1st");
    await waitFor(() => /192/.test(d.querySelector("#linkLiveMatch").textContent));
    assert(pressed(chip(d, "s:job=[*:word]")) && /recommended/.test(chip(d, "s:job=[*:word]").textContent), "the recommended job chip is preselected and labelled");
    assert(!pressed(chip(d, "s:axis=[*:word]")) && !/recommended/.test(chip(d, "s:axis=[*:word]").textContent), "axis is offered but not recommended");
    assert([...d.querySelectorAll("#linkKeyChips [data-key-chip]")].some(c => c.dataset.keyChip === "c:thread") && !!chip(d, "none") && !!chip(d, "pattern"), "column options, none and pattern… are offered");
    const head = txt(d.querySelector("#linkLiveMatch"));
    assert(/^192 pairs · 13 without end · median \S+ · max 3\.9s$/.test(head), "preview head: 192 pairs · 13 without end · median … · max 3.9s, got " + head);
    const rows = [...d.querySelectorAll("#linkResultsSamples .filter-sample-row")];
    assert(rows.length === 3 && txt(rows[0].querySelector(".filter-sample-badge")) === "Δt 3.9s", "slowest pair first (3.9 s)");
    assert(txt(rows[2].querySelector(".filter-sample-badge")) === "no end" && txt(rows[1].querySelector(".filter-sample-badge")).startsWith("Δt "), "the last sample row is the first start without an end");
    assert(!d.querySelector("#linkDialogCreate").disabled, "Create enabled");
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(node.filterType === "link" && node.linkDirection === "after" && node.linkN === 1 && node.linkKey && node.linkKey.pattern === "job=[*:word]" && !node.linkDt, "Create: link node, after, 1st, key job");
    assert(node.bakedA.value === "Move requested" && node.bakedA.columns.join() === "message" && node.bakedB.value === "Position reached", "baked text sides");
    assert(w.getEntries(node.id).length === 192 && node._linkUnmatched.length === 13, "the node pairs 192, 13 without end");
    assert(d.querySelector("#linkDialog").classList.contains("hidden"), "dialog closed");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-dialog-v2 b. Δt row: 'of' count, key chips, pattern… validation, empty End disables Create");
    const f = await w.addFile("app.log", tourLog, () => {});
    w.openLinkDialog({ rootId: f.id, start: { text: "Move requested" } });
    assert(d.querySelector("#linkDialogCreate").disabled, "empty End: Create disabled");
    await waitFor(() => !d.querySelector("#linkHint").classList.contains("hidden"));
    assert(/end event/.test(d.querySelector("#linkHint").textContent), "hint: type or pick an end event");
    assert(d.querySelector("#linkSides .link-side-chip") === null && d.activeElement === sideInput(d, 1), "End is a text field and focused");
    linkDlgType(w, d, sideInput(d, 1), "Position reached");
    await waitFor(() => /192/.test(d.querySelector("#linkLiveMatch").textContent));
    assert(!d.querySelector("#linkDialogCreate").disabled, "End typed: Create enabled");
    assert(d.querySelector("#linkHint").classList.contains("hidden"), "hint gone");
    fireClick(d.querySelector("#linkDtInput"), w);
    d.querySelector("#linkDtValue").value = "500";
    d.querySelector("#linkDtValue").dispatchEvent(new w.Event("input", { bubbles: true }));
    await waitFor(() => /^36 of 192 pairs/.test(txt(d.querySelector("#linkLiveMatch"))));
    assert(/13 without end/.test(txt(d.querySelector("#linkLiveMatch"))), "Δt keeps the unmatched count of the pairing");
    // key: thread chip -> 205 pairs
    fireClick(chip(d, "c:thread"), w);
    await waitFor(() => /^\d+ of 205 pairs/.test(txt(d.querySelector("#linkLiveMatch"))));
    await waitFor(() => d.querySelector("#linkHint").classList.contains("warn") && !d.querySelector("#linkHint").classList.contains("hidden"));
    assert(/Longest pair 7m/.test(d.querySelector("#linkHint").textContent), "a 7 min pair on the Thread key: the hint suggests another Same key, got " + d.querySelector("#linkHint").textContent);
    fireClick(chip(d, "none"), w);
    fireClick(d.querySelector("#linkDtInput"), w);
    await waitFor(() => /^205 pairs/.test(txt(d.querySelector("#linkLiveMatch"))) && d.querySelector("#linkHint").classList.contains("hidden"));
    fireClick(chip(d, "pattern"), w);
    assert(isVisible(d.querySelector("#linkKeyPatternRow"), w), "pattern… shows the input");
    linkDlgType(w, d, d.querySelector("#linkKeyPattern"), "axis");
    await waitFor(() => d.querySelector("#linkLiveMatch").textContent.startsWith("Invalid key pattern"));
    linkDlgType(w, d, d.querySelector("#linkKeyPattern"), "axis=[*:word]");
    await waitFor(() => /^205 pairs/.test(txt(d.querySelector("#linkLiveMatch"))) || /pairs/.test(txt(d.querySelector("#linkLiveMatch"))));
    // switch back to the recommended chip, with Δt on, then Create
    fireClick(chip(d, "s:job=[*:word]"), w);
    fireClick(d.querySelector("#linkDtInput"), w);
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(node.linkDt && node.linkDt.op === ">" && node.linkDt.ms === 500 && node.linkKey.pattern === "job=[*:word]" && w.getEntries(node.id).length === 36, "Create stores Δt > 500 ms and the job key: 36 pairs");
    // reopen: nothing sticky
    w.openLinkDialog({ rootId: f.id, start: { text: "a" }, hops: [{ text: "b" }] });
    assert(!pillChecked(d.querySelector("#linkDtInput")) && d.querySelector("#linkDtValue").disabled, "reopening starts with Δt off");
    w.closeLinkDialog();
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-dialog-v2 c. ▾ picks an existing filter (read-only chip), ✕ goes back to typing");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const move = w.createFilterNode(f.id, "text", "move requested");
    const reached = w.createFilterNode(f.id, "text", "position reached");
    w.createFilterNode(move.id, "text", "axis 1");
    w.render();
    w.openLinkDialog({ rootId: f.id, start: { text: "move requested" }, hops: [{}] });
    fireClick(side(d, 1).querySelector("[data-side-pick]"), w);
    const menu = d.querySelector("#linkSideMenu");
    assert(!menu.classList.contains("hidden"), "▾ opens the menu");
    const items = [...menu.querySelectorAll("[data-pick-node]")].map(i => i.textContent);
    assert(items.length === 3 && items.includes("“position reached”") && items.includes("“axis 1”") && !!menu.querySelector("[data-pick-text]"), "the file's filters plus 'Type a pattern': " + items);
    assert(menu.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true })) === false, "no native context menu on the popup");
    fireClick(menu.querySelector('[data-pick-node="' + reached.id + '"]'), w);
    assert(menu.classList.contains("hidden") && side(d, 1).querySelector(".link-side-chip") && !side(d, 1).querySelector("input"), "picked: the side is a chip");
    assert(txt(side(d, 1).querySelector(".link-side-chip")).includes("position reached"), "chip carries the filter's name");
    await waitFor(() => /pairs/.test(d.querySelector("#linkLiveMatch").textContent));
    assert(!d.querySelector("#linkDialogCreate").disabled, "ready");
    // menu closes on an outside click inside the dialog
    fireClick(side(d, 0).querySelector("[data-side-pick]"), w);
    assert(!menu.classList.contains("hidden"), "menu open again");
    fireClick(d.querySelector("#linkDialogTitle"), w);
    assert(menu.classList.contains("hidden"), "a click elsewhere in the dialog closes the menu");
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(node.bakedB.value === "position reached" && node.bakedB.filterType === "text" && node.name.includes("position reached") && w.getEntries(node.id).length === 3, "Create baked the picked filter's condition: " + node.name);
    // ✕ on the chip
    w.openLinkDialog({ rootId: f.id, start: { text: "x" }, hops: [{ nodeId: reached.id }] });
    fireClick(side(d, 1).querySelector("[data-side-clear]"), w);
    assert(!!sideInput(d, 1) && sideInput(d, 1).value === "", "✕ turns the chip back into an empty text field");
    assert(d.querySelector("#linkDialogCreate").disabled, "…and Create is disabled again");
    w.closeLinkDialog();
  });

  await withApp(async (w, d, T) => {
    section("link-dialog-v2 d. + Add step, remove step, order-enforce gating, one node for the whole chain");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    w.openLinkDialog({ rootId: f.id, start: { text: "move requested" }, hops: [{ text: "position reached" }] });
    fireClick(d.querySelector("#linkAddStep"), w);
    assert(d.querySelectorAll("#linkSides .link-hop-row").length === 2 && d.querySelectorAll("#linkSides .link-side").length === 3, "a second End row with its own sentence");
    assert(d.querySelector("#linkDialogCreate").disabled, "the new End is empty: Create disabled");
    linkDlgType(w, d, sideInput(d, 2), "move requested");
    assert(d.querySelector("#linkOrderEnforceRow").classList.contains("hidden"), "same directions: enforce-order hidden");
    linkDlgSetDir(w, d, 1, "before");
    assert(!d.querySelector("#linkOrderEnforceRow").classList.contains("hidden"), "mixed directions: enforce-order shown");
    linkDlgSetDir(w, d, 1, "after");
    assert(d.querySelector("#linkOrderEnforceRow").classList.contains("hidden"), "same again: hidden");
    await waitFor(() => /pairs/.test(d.querySelector("#linkLiveMatch").textContent));
    fireClick(d.querySelector("[data-side-remove]"), w);
    assert(d.querySelectorAll("#linkSides .link-side").length === 2, "remove step: back to Start + End");
    linkDlgType(w, d, sideInput(d, 1), "position reached");
    fireClick(d.querySelector("#linkAddStep"), w);
    linkDlgType(w, d, sideInput(d, 2), "move requested");
    d.querySelectorAll("#linkSides .link-hop-n")[1].value = "2";
    d.querySelectorAll("#linkSides .link-hop-n")[1].dispatchEvent(new w.Event("input", { bubbles: true }));
    assert(d.querySelectorAll("#linkSides .link-hop-ord")[1].textContent === "nd", "ordinal suffix follows N");
    const before = Object.values(T.state.nodes).filter(n => n.filterType === "link").length;
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const links = Object.values(T.state.nodes).filter(n => n.filterType === "link");
    assert(links.length === before + 1, "ONE link node for a 2-step chain");
    const c = w.linkChainToHops(links[links.length - 1]);
    assert(c.hops.length === 2 && c.hops[1].n === 2 && c.hops[0].baked.value === "position reached", "the chain holds both steps");
  });

  await withApp(async (w, d, T) => {
    section("link-dialog-v2 e. multi-select adapter (ids): first = start, rest = ends, default next");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const a = w.createFilterNode(f.id, "text", "move requested");
    const b = w.createFilterNode(f.id, "text", "position reached");
    w.render();
    const { actions } = w.describeBulkActions([a, b]);
    assert(actions.some(x => x.action === "link"), "Link… is still a bulk action");
    w.openLinkDialog([a.id, b.id]);
    assert(side(d, 0).querySelector(".link-side-chip") && txt(side(d, 0)).includes("move requested") && txt(side(d, 1)).includes("position reached"), "ids become filter chips");
    assert(pressed(d.querySelector('#linkSides .link-hop-dir [data-dir="after"]')), "direction next by default");
    w.closeLinkDialog();
    assert(d.querySelector("#linkDialog").classList.contains("hidden"), "closed");
  });

  await withApp(async (w, d, T) => {
    section("link-dialog-v2 f. edit: Edit link… everywhere, key chip selection, Save = one undo step");
    const f = await w.addFile("app.log", tourLog, () => {});
    const A = w.bakedTextCondition("Move requested"), B = w.bakedTextCondition("Position reached");
    const node = w.createLinkNodeFromBaked(f.id, A, B, "after", 1, { key: { pattern: "job=[*:word]" }, dt: { op: ">", ms: 2000 }, exclusive: true });
    w.render();
    const ctxItems = () => { w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {} }, node.id); return [...d.querySelectorAll("#treeContextMenu .ctx-item")].map(i => i.textContent.trim()); };
    let labels = ctxItems();
    assert(labels.includes("Edit link…") && !labels.includes("Edit filter…") && labels.includes("Link with…"), "tree menu on a link: Edit link… and Link with…, got " + labels);
    w.closeTreeContextMenu();
    T.state.activeId = node.id;
    const tb = w.describeSidebarToolbarActions().actions;
    const edit = tb.find(x => x.action === "edit");
    assert(edit.label === "Edit link…" && !edit.disabled && tb.some(x => x.action === "linkWith" && !x.disabled), "toolbar: Edit link… enabled, Link with… present");
    assert(w.editFilterNode(node.id) === true, "editFilterNode handles link");
    assert(txt(d.querySelector("#linkDialogTitle")) === "Edit link" && txt(d.querySelector("#linkDialogCreate")) === "Save", "title Edit link, button Save");
    assert(sideInput(d, 0).value === "Move requested" && sideInput(d, 1).value === "Position reached", "plain text sides come back as text fields");
    assert(pressed(chip(d, "s:job=[*:word]")), "the node's key selects its suggestion chip");
    assert(pillChecked(d.querySelector("#linkDtInput")) && d.querySelector("#linkDtValue").value === "2" && d.querySelector("#linkDtUnit").value === "s" && d.querySelector("#linkDtOp").value === ">", "Δt 2 s restored");
    assert(pillChecked(d.querySelector("#linkExclusiveInput")) && d.querySelector("#linkMore").open, "exclusive restored, More options open");
    await waitFor(() => /pairs/.test(d.querySelector("#linkLiveMatch").textContent));
    const undoLen = T.undoStack.length, nodes = Object.keys(T.state.nodes).length;
    linkDlgSetDir(w, d, 0, "before");
    fireClick(chip(d, "c:thread"), w);
    fireClick(d.querySelector("#linkDialogCreate"), w);
    assert(Object.keys(T.state.nodes).length === nodes && node.linkDirection === "before" && node.linkKey.column === "thread" && T.undoStack.length === undoLen + 1, "Save edits the node in place, one undo step");
    assert(T.state.activeId === node.id, "the edited node stays active");
    w.undo();
    assert(node.linkDirection === "after" && node.linkKey.pattern === "job=[*:word]" && node.linkDt.ms === 2000 && node.linkExclusive, "undo restores the whole definition");
    // an unrelated key pattern and a non-text side
    node.linkKey = { pattern: "axis [*:int]" };
    node.bakedB = { filterType: "level", value: ["INFO"], inverted: false };
    w.editFilterNode(node.id);
    assert(pressed(chip(d, "pattern")) && d.querySelector("#linkKeyPattern").value === "axis [*:int]", "an unknown key pattern selects pattern… with the input filled");
    assert(side(d, 1).querySelector(".link-side-chip") && txt(side(d, 1)).includes("INFO"), "a non-text side shows as a read-only chip labelled by its description");
    w.closeLinkDialog();
    // a renamed node keeps its name through Save
    node.name = "Mine";
    w.editFilterNode(node.id);
    fireClick(side(d, 1).querySelector("[data-side-clear]"), w);
    linkDlgType(w, d, sideInput(d, 1), "Position reached");
    fireClick(d.querySelector("#linkDialogCreate"), w);
    assert(node.name === "Mine" && node.bakedB.value === "Position reached", "custom name kept");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-dialog-v2 g. entry points: Link with… (tree menu, toolbar), filter popup 'Link two events…'");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const move = w.createFilterNode(f.id, "text", "move requested");
    w.render();
    w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {} }, move.id);
    const item = [...d.querySelectorAll("#treeContextMenu .ctx-item")].find(i => i.textContent.trim() === "Link with…");
    assert(!!item, "tree menu offers Link with… on a text filter");
    fireClick(item, w);
    assert(!d.querySelector("#linkDialog").classList.contains("hidden") && txt(side(d, 0)).includes("move requested") && side(d, 0).querySelector(".link-side-chip"), "Start = that filter");
    assert(!!sideInput(d, 1) && sideInput(d, 1).value === "" && d.activeElement === sideInput(d, 1), "End empty and focused");
    w.closeLinkDialog();
    T.state.activeId = move.id;
    const lw = w.describeSidebarToolbarActions().actions.find(x => x.action === "linkWith");
    assert(lw && !lw.disabled, "toolbar Link with… enabled on a filter");
    w.handleSidebarToolbarActionClick("linkWith");
    assert(!d.querySelector("#linkDialog").classList.contains("hidden") && txt(side(d, 0)).includes("move requested"), "toolbar opens the dialog with that start");
    w.closeLinkDialog();
    T.state.activeId = f.id;
    assert(w.describeSidebarToolbarActions().actions.find(x => x.action === "linkWith").disabled, "disabled on a file node");
    // filter popup
    T.state.activeId = f.id;
    w.openFilterPopup();
    const btn = d.querySelector("#filterLinkEventsBtn");
    assert(!!btn && btn.textContent === "Link two events…" && !btn.classList.contains("hidden"), "popup footer has the link");
    d.querySelector("#filterInput").value = "move requested [*:int]";
    fireClick(btn, w);
    assert(d.querySelector("#filterPopup").classList.contains("hidden"), "the popup closes");
    assert(!d.querySelector("#linkDialog").classList.contains("hidden") && sideInput(d, 0).value === "move requested [*:int]", "the popup's text is the Start");
    assert(d.activeElement === sideInput(d, 1), "End focused");
    w.closeLinkDialog();
    // edit mode of the popup hides the link
    w.openEditFilterPopup(move.id);
    assert(d.querySelector("#filterLinkEventsBtn").classList.contains("hidden"), "hidden while editing a filter");
    w.closeFilterPopup();
  });

  await withApp(async (w, d, T) => {
    section("link-dialog-v2 h. phone: ★ instead of the long recommendation, full-screen sheet CSS");
    w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
    assert(d.body.classList.contains("layout-phone"), "sanity: phone tier");
    const f = await w.addFile("app.log", tourLog, () => {});
    w.openLinkDialog({ rootId: f.id, start: { text: "Move requested" }, hops: [{ text: "Position reached" }] });
    await waitFor(() => /192/.test(d.querySelector("#linkLiveMatch").textContent));
    const rec = chip(d, "s:job=[*:word]");
    assert(rec.textContent.includes("★") && !/recommended/.test(rec.textContent), "phone: ★ marks the recommendation");
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("").replace(/\s+/g, "");
    assert(css.includes("body.layout-phone#linkDialog.link-dialog-card{width:100%;"), "phone: the dialog card is a full-screen sheet");
    w.closeLinkDialog();
    w.innerWidth = 1400; w.dispatchEvent(new w.Event("resize"));
  }, { indexedDB: new IDBFactory() });
}
