// GROUP shortcut-dynamic-tooltips — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP shortcut-dynamic-tooltips — tooltips/texts naming a rebindable
   shortcut follow the binding (shortcutLabel / refreshShortcutTooltips), and
   rebinding an action to Ctrl+G / Ctrl+Shift+G shows a non-blocking note and
   marks the fixed find alias row "overridden by ...".
   Origin: 2026-10-05 (usability round C).
   ============================================================ */
group("shortcut-dynamic-tooltips");
{
  const ctrl = (d, w, k, o = {}) => fireKeydown(d, w, k, { ctrlKey: true, ...o });
  const rebind = (d, w, id, k, o) => {
    w.renderShortcutBindingsList();
    fireClick(d.querySelector('#shortcutBindingsList [data-action-id="' + id + '"] .shortcut-rebind-btn'), w);
    fireKeydown(d, w, k, o);
  };

  await withApp(async (w, d, T) => {
    section("shortcut-dynamic-tooltips a. Rebinding / reset rewrites the tooltips");
    const f = await w.addFile("a.log", makeLog(0, 10), () => {});
    T.state.activeId = f.id; w.render();
    const title = id => d.getElementById(id).title;
    assert(title("btnFindPhone") === "Find in view (Ctrl+F)", "default find tooltip, got " + title("btnFindPhone"));
    assert(w.eval('shortcutLabel("exportView")') === "Ctrl+Shift+E", "shortcutLabel builds the combo text");
    rebind(d, w, "findInView", "k", { ctrlKey: true, altKey: true });
    assert(title("btnFindPhone") === "Find in view (Ctrl+Alt+K)", "rebinding updates #btnFindPhone, got " + title("btnFindPhone"));
    assert(d.querySelector('[data-sc-text="{findInView}"]').textContent === "Ctrl+Alt+K", "the welcome text follows too");
    rebind(d, w, "toggleSidebar", "y", { ctrlKey: true });
    assert(/Ctrl\+Y/.test(title("sidebarToggle")), "sidebar toggle tooltip follows, got " + title("sidebarToggle"));
    rebind(d, w, "toggleDetail", "u", { ctrlKey: true });
    assert(/Ctrl\+U/.test(title("detailToggle")), "detail toggle tooltip follows, got " + title("detailToggle"));
    assert(/Ctrl\+U/.test(title("lowerTabDetail")), "Entry detail tab tooltip follows, got " + title("lowerTabDetail"));
    rebind(d, w, "toggleFacets", "o", { ctrlKey: true });
    assert(/Ctrl\+O\)/.test(title("lowerTabFacets")), "Facets tab tooltip follows, got " + title("lowerTabFacets"));
    rebind(d, w, "exportView", "x", { ctrlKey: true, shiftKey: true });
    assert(title("btnExport") === "Export / Share (Ctrl+Shift+X)", "export tooltip follows, got " + title("btnExport"));
    rebind(d, w, "findNext", "p", { altKey: true });
    assert(/Alt\+P/.test(title("findNextBtn")), "find next button tooltip follows, got " + title("findNextBtn"));
    rebind(d, w, "undo", "q", { ctrlKey: true });
    w.eval('pushUndo({ kind: "text", label: "x", undo() {}, redo() {} })');
    assert(/\(Ctrl\+Q\)$/.test(title("btnUndo")), "undo tooltip follows after an action, got " + title("btnUndo"));
    rebind(d, w, "zoomIn", "9", { ctrlKey: true });
    assert(title("fontScaleUp") === "Increase UI scale (Ctrl+9)", "font scale tooltip follows, got " + title("fontScaleUp"));

    fireClick(d.getElementById("btnResetShortcuts"), w);
    assert(title("btnFindPhone") === "Find in view (Ctrl+F)", "reset all restores the find tooltip");
    assert(title("btnExport") === "Export / Share (Ctrl+Shift+E)", "reset all restores the export tooltip");
    assert(/\(Ctrl\+Z\)$/.test(title("btnUndo")), "reset all restores the undo tooltip, got " + title("btnUndo"));
    assert(/Ctrl\+J/.test(title("lowerTabDetail")) && /Ctrl\+B/.test(title("sidebarToggle")), "reset all restores toggles");
    rebind(d, w, "findInView", "k", { ctrlKey: true, altKey: true });
    fireClick(d.querySelector('#shortcutBindingsList [data-action-id="findInView"] .shortcut-reset-btn'), w);
    assert(title("btnFindPhone") === "Find in view (Ctrl+F)", "reset one restores the find tooltip");
  });

  await withApp(async (w, d, T) => {
    section("shortcut-dynamic-tooltips b. Rebinding to Ctrl+G: non-blocking note, overridden alias row");
    const f = await w.addFile("a.log", makeLog(0, 30, { suffix: i => (i % 7 === 0 ? "Needle" : "hay") }), () => {});
    T.state.activeId = f.id; w.render();
    const note = d.getElementById("shortcutConflictNote");
    w.renderShortcutBindingsList();
    const aliasRow = () => [...d.querySelectorAll("#shortcutBindingsList .shortcut-row-fixed")].find(r => /browser alias/.test(r.textContent));
    assert(!/overridden by/.test(aliasRow().textContent), "sanity: no override at first");
    rebind(d, w, "toggleFacets", "g", { ctrlKey: true });
    const saved = JSON.parse(w.localStorage.getItem("philogg.shortcutBindings"));
    assert(saved.toggleFacets && saved.toggleFacets.key === "g" && saved.toggleFacets.ctrl, "the binding is saved (not blocked)");
    assert(!note.classList.contains("hidden") && note.classList.contains("hint"), "a neutral (hint) note is shown");
    assert(/Ctrl\+G was the find bar's "next match" alias/.test(note.textContent) && /Show\/hide Facets/.test(note.textContent) &&
      /F3 still finds the next match/.test(note.textContent), "note text, got " + note.textContent);
    assert(/overridden by Show\/hide Facets/.test(aliasRow().textContent), "alias row says overridden by the action");
    const kbds = aliasRow().querySelectorAll("kbd");
    assert(kbds[0].classList.contains("overridden") && !kbds[1].classList.contains("overridden"), "only Ctrl+G is struck");

    rebind(d, w, "bookmark", "g", { ctrlKey: true, shiftKey: true });
    assert(/Ctrl\+Shift\+G was the find bar's "previous match" alias/.test(note.textContent) && /Shift\+F3 still finds the previous match/.test(note.textContent),
      "shift variant note, got " + note.textContent);
    assert(aliasRow().querySelectorAll("kbd.overridden").length === 2, "both alias keys struck");

    // Ctrl+G runs the rebound action (existing behavior), not the find alias.
    ctrl(d, w, "g");
    assert(!w.eval("findBarOpen()"), "Ctrl+G did not open the find bar (the rebinding wins)");

    fireClick(d.getElementById("btnResetShortcuts"), w);
    assert(!/overridden by/.test(aliasRow().textContent) && aliasRow().querySelectorAll("kbd.overridden").length === 0, "reset clears the overridden marker");
    ctrl(d, w, "g");
    assert(w.eval("findBarOpen()"), "after reset Ctrl+G is the find alias again");
  });

  await withApp(async (w, d, T) => {
    section("shortcut-dynamic-tooltips c. A normal rebinding shows no note");
    rebind(d, w, "bookmark", "k");
    assert(d.getElementById("shortcutConflictNote").classList.contains("hidden"), "no note for an ordinary combo");
  });
}
