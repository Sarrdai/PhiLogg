// GROUP design-polish-p12 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p12 — detail panel empty state (E4) and start screen (E5)
   Origin: 2026-10-10 design polish round, package P12.
   E4: with nothing selected the Entry detail panel is only its tab bar (class .no-sel, hint
   right-aligned in the bar), it reopens on the first selection, an explicit user collapse stays,
   and Table/Plot do not show an entry that was selected in another view.
   E5: the start screen is a drop zone with real open buttons and kbd hints from the registry.
   jsdom has no layout: heights are checked through classes and the inline height, not pixels.
   ============================================================ */
group("design-polish-p12");

if (groupSelected()) {
  const simFile = async (w, scenarios, entries, seed) => {
    const [file] = LOGSIM.generateToStrings({ scenarios, entries, seed });
    return w.addFile(file.name, file.text, () => {});
  };

  await withApp(async (w, d, T) => {
    section("design-polish-p12 a. detail panel: bar only without a selection, opens on the first one");
    const f = await simFile(w, ["basic"], 400, 7);
    T.state.activeId = f.id; T.state.selectedId = null; w.render();
    const panel = d.querySelector("#detailPanel"), hint = d.querySelector("#detailPlaceholder");
    assert(panel.classList.contains("empty") && panel.classList.contains("no-sel"), "nothing selected: panel is the bar only (.no-sel)");
    assert(hint.parentElement.id === "detailPanelHeader", "the hint lives in the tab bar");
    assert(hint.querySelector(".dp-desktop").textContent === "Select a row to see its full message", "hint text");
    assert(w.getComputedStyle(hint).display !== "none" && w.getComputedStyle(hint).marginLeft === "auto", "hint is shown and right-aligned");
    assert(w.getComputedStyle(d.querySelector("#detailBody")).display === "none", "no body, no empty area");
    assert(d.querySelector("#detailResizer").style.display === "none", "no resize handle on the bar");
    assert(!panel.classList.contains("collapsed"), "that is not the user collapse");
    panel.style.height = "260px"; // the user's remembered height
    w.selectEntry(f.entries[3].id);
    assert(!panel.classList.contains("empty") && !panel.classList.contains("no-sel"), "first selection opens the panel");
    assert(panel.style.height === "260px", "it returns to the remembered height: " + panel.style.height);
    assert(w.getComputedStyle(hint).display === "none", "hint hidden with an entry");
    assert(d.querySelector("#detailResizer").style.display === "block", "resize handle is back");
    T.state.selectedId = null; w.updateDetailPanel();
    assert(panel.classList.contains("no-sel") && panel.style.height === "260px", "clearing the selection shrinks it again, the remembered height stays");

    section("design-polish-p12 b. an explicit collapse is respected");
    w.toggleDetailCollapsed(true);
    assert(panel.classList.contains("collapsed") && !panel.classList.contains("no-sel"), "collapsed by the user: no .no-sel on top");
    w.selectEntry(f.entries[5].id);
    assert(panel.classList.contains("collapsed"), "a selection does not force a collapsed panel open");
    T.state.selectedId = null; w.updateDetailPanel();
    w.toggleDetailCollapsed(false);
    assert(!panel.classList.contains("collapsed") && panel.classList.contains("no-sel") && panel.style.height === "260px",
      "expanding with nothing selected: bar again, remembered height " + panel.style.height);
    // collapsing while the bar shows must not remember 34px
    w.toggleDetailCollapsed(true); w.toggleDetailCollapsed(false);
    assert(panel.style.height === "260px", "collapse from the bar keeps the remembered height: " + panel.style.height);

    section("design-polish-p12 c. other bottom tabs keep their room");
    w.selectEntry(f.entries[2].id);
    T.state.selectedId = null;
    w.setLowerTab("facets");
    assert(!panel.classList.contains("no-sel"), "Facets tab without a selection is not the bar");
    assert(w.getComputedStyle(hint).display === "none", "hint only on the Entry tab");
    w.setLowerTab("detail");
    assert(panel.classList.contains("no-sel"), "back on Entry detail: the bar");
  });

  await withApp(async (w, d, T) => {
    section("design-polish-p12 d. Table/Plot show no entry selected in another view");
    const f = await simFile(w, ["basic", "sensors"], 400, 3);
    const node = w.createFilterNode(f.id, "text", "temperature=[*:float] C pressure=[*:float] bar");
    T.state.activeId = node.id; w.render();
    const panel = d.querySelector("#detailPanel");
    w.applyFhView("filter");
    const other = f.entries.find(e => !/temperature=/.test(e.message));
    if (!other) { assert(true, "(no entry outside the pattern in this sample)"); return; }
    T.state.selectedId = other.id; w.updateDetailPanel();
    w.applyFhView("table");
    await waitFor(() => T.extractRowsData && T.extractRowsData.length > 0, { timeout: 3000 });
    assert(panel.classList.contains("empty") && panel.classList.contains("no-sel"), "Table: the entry selected elsewhere is not shown, empty state");
    assert(d.querySelector("#detailOutside").style.display === "none", "no 'not part of the current filter' notice");
    assert(d.querySelector("#detailMessage").textContent === "", "no stale message");
    w.applyFhView("plot");
    assert(panel.classList.contains("empty"), "Plot: same");
    w.applyFhView("table");
    const row = T.extractRowsData[1].entry;
    w.selectEntry(row.id); w.updateDetailPanel();
    assert(!panel.classList.contains("empty") && d.querySelector("#detailMessage").textContent.length > 0, "an entry selected in Table shows");
    w.applyFhView("filter");
    assert(!panel.classList.contains("empty"), "...and stays in the log view");
  });

  await withApp(async (w, d, T) => {
    section("design-polish-p12 e. start screen: drop zone, buttons, kbd hints");
    const es = d.querySelector("#emptyState");
    assert(T.state.rootIds.length === 0 && es.style.display === "flex" && es.classList.contains("start"), "no file: start screen");
    const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
    assert(/#emptyState\.start \.start-zone\{[^}]*1\.5px dashed var\(--border-soft\)[^}]*border-radius:14px/.test(css), "dashed 1.5px --border-soft zone, radius 14");
    assert(/#emptyState\.start\.drag-over \.start-zone\{[^}]*var\(--accent\)[^}]*var\(--accent-soft\)/.test(css), "drag-over: accent border, accent-soft fill");
    assert(d.querySelector("#emptyState h2").textContent === "Drop log files or a folder here", "heading");
    assert(!/Open…|“Open”/.test(es.textContent.replace(/Open (files|folder)…/g, "")), "no text refers to an 'Open…' button");
    const filesBtn = d.querySelector("#startOpenFiles"), folderBtn = d.querySelector("#startOpenFolder");
    assert(filesBtn.textContent === "Open files…" && filesBtn.classList.contains("btn-mini"), "primary 'Open files…'");
    assert(folderBtn.textContent === "Open folder…", "'Open folder…'");
    assert(folderBtn.hidden === !w.FOLDER_WATCH_SUPPORTED && folderBtn.hidden === !(w.showDirectoryPicker || (w.philogg && w.philogg.listFolder)), "folder button only where folder picking exists");
    // wired to the existing open actions (same functions the Open menu calls)
    let calls = [];
    const origF = w.openFilesPicker, origD = w.openFolderPickerFlow;
    w.openFilesPicker = () => calls.push("files"); w.openFolderPickerFlow = () => calls.push("folder");
    fireClick(filesBtn, w); fireClick(folderBtn, w);
    w.openFilesPicker = origF; w.openFolderPickerFlow = origD;
    assert(calls.join() === "files,folder", "buttons call openFilesPicker / openFolderPickerFlow: " + calls);
    // kbd hints = registry
    const kbds = [...d.querySelectorAll("#startKbds > span")].map(s => [...s.querySelectorAll("kbd")].map(k => k.textContent).join("+"));
    assert(kbds[0] === w.shortcutLabel("findInView") && kbds[1] === w.shortcutLabel("newFilter") && kbds[2] === "?", "kbd hints follow the registry: " + kbds);
    assert(d.querySelectorAll("#startKbds kbd").length >= 5, "keys are <kbd> elements");
    // drag-over highlights the zone instead of the full-window overlay
    const ev = new w.Event("dragenter", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"] } });
    w.dispatchEvent(ev);
    assert(es.classList.contains("drag-over") && d.querySelector("#dropOverlay").classList.contains("hidden"), "drag over: zone highlighted, no overlay");
    const lv = new w.Event("dragleave", { bubbles: true, cancelable: true });
    Object.defineProperty(lv, "dataTransfer", { value: { types: ["Files"] } });
    w.dispatchEvent(lv);
    assert(!es.classList.contains("drag-over"), "drag leave clears it");
    // other empty-state texts are plain
    const f = await simFile(w, ["basic"], 50, 3);
    T.state.activeId = null; w.setTreeCursor(null); w.render();
    assert(!es.classList.contains("start") && d.querySelector("#emptyState h2").textContent === "No file selected", "'No file selected' is not the drop zone");
    assert(w.getComputedStyle(d.querySelector(".start-actions")).display === "none", "...and has no buttons");
  });
}
