// GROUP find-shortcut-ctrl-f — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP find-shortcut-ctrl-f — Ctrl+F opens the find bar, New filter moved
   to Ctrl+Shift+F, facets to Ctrl+I, Ctrl+G / Ctrl+Shift+G are fixed
   find next/previous aliases, and a header find button exists on desktop.
   Origin: 2026-10-04 (usability test 2026-10-03/04: users expect Ctrl+F = find).
   ============================================================ */
group("find-shortcut-ctrl-f");
{
  const fb = (d) => { const s = d.createElement("script"); s.textContent = "window.__find = { get state() { return findState; } };"; d.body.appendChild(s); };
  const ctrl = (d, w, k, o = {}) => fireKeydown(d, w, k, { ctrlKey: true, ...o });

  await withApp(async (w, d, T) => {
    section("find-shortcut-ctrl-f a. Defaults, Shortcut Manager rows, header button");
    w.renderShortcutBindingsList();
    const row = id => d.querySelector('#shortcutBindingsList [data-action-id="' + id + '"]');
    const keys = id => [...row(id).querySelectorAll("kbd")].map(k => k.textContent).join("+");
    assert(keys("findInView") === "Ctrl+F", "findInView default is Ctrl+F, got " + keys("findInView"));
    assert(keys("newFilter") === "Ctrl+Shift+F", "newFilter default is Ctrl+Shift+F, got " + keys("newFilter"));
    assert(keys("toggleFacets") === "Ctrl+I", "toggleFacets default is Ctrl+I, got " + keys("toggleFacets"));
    const fixed = [...d.querySelectorAll("#shortcutBindingsList .shortcut-row-fixed")].find(r => /browser alias/.test(r.textContent));
    assert(fixed && /Ctrl\+G/.test(fixed.textContent) && /Ctrl\+Shift\+G/.test(fixed.textContent), "Shortcut Manager lists the Ctrl+G / Ctrl+Shift+G alias row");
    assert(!fixed.querySelector(".shortcut-rebind-btn"), "...with no Change control (fixed)");
    const btn = d.getElementById("btnFindPhone");
    assert(btn && w.getComputedStyle(btn).display !== "none", "#btnFindPhone is visible in the desktop layout");
    assert(/Ctrl\+F/.test(btn.title), "...and its tooltip mentions Ctrl+F, got " + btn.title);
    assert(/Ctrl\+I/.test(d.getElementById("lowerTabFacets").title), "the Facets tab tooltip says Ctrl+I");
  });

  await withApp(async (w, d, T) => {
    section("find-shortcut-ctrl-f b. Ctrl+F opens, Ctrl+F again selects the query without stepping; Ctrl+G / Ctrl+Shift+G step and reopen");
    fb(d);
    const F = () => w.__find.state;
    const f = await w.addFile("a.log", makeLog(0, 60, { suffix: i => (i % 7 === 0 ? "Needle" : "hay") }), () => {});
    T.state.activeId = f.id; w.render();
    const bar = d.getElementById("findBar"), input = d.getElementById("findInput");
    const hitIds = f.entries.filter((e, i) => i % 7 === 0).map(e => e.id);
    ctrl(d, w, "f");
    assert(isVisible(bar, w) && d.activeElement === input, "Ctrl+F opens the bar and focuses the input");
    assert(d.getElementById("filterPopup").classList.contains("hidden"), "...no filter popup");
    input.value = "needle"; fireInput(input, w);
    await sleep(200);
    assert(F().done && F().hits.length === 9, "search found 9 hits");
    const sel0 = T.state.selectedId;
    input.setSelectionRange(2, 2);
    ctrl(d, w, "f");
    assert(input.selectionStart === 0 && input.selectionEnd === input.value.length, "Ctrl+F with focus selects the whole query");
    assert(T.state.selectedId === sel0, "...and does not move the hit");
    assert(sel0 === hitIds[0], "sanity: selection is on the first hit");
    ctrl(d, w, "g");
    assert(T.state.selectedId === hitIds[1], "Ctrl+G steps to the next hit");
    ctrl(d, w, "g", { shiftKey: true });
    assert(T.state.selectedId === hitIds[0], "Ctrl+Shift+G steps back");
    ctrl(d, w, "G", { shiftKey: true });
    assert(T.state.selectedId === hitIds[8], "Ctrl+Shift+G (uppercase key as real browsers send it) wraps to the last hit");
    fireKeydown(d, w, "Escape");
    assert(!isVisible(bar, w), "Esc closes the bar");
    ctrl(d, w, "g");
    assert(isVisible(bar, w), "Ctrl+G with the bar closed reopens it");
    assert(T.state.selectedId === hitIds[0], "...and steps on the remembered query (wraps to the first hit)");
    fireKeydown(d, w, "Escape");
    ctrl(d, w, "g", { shiftKey: true });
    assert(isVisible(bar, w) && T.state.selectedId === hitIds[8], "Ctrl+Shift+G with the bar closed reopens and steps back");
  });

  await withApp(async (w, d, T) => {
    section("find-shortcut-ctrl-f c. Ctrl+Shift+F opens the filter popup (also from the find input); Ctrl+I toggles facets");
    const f = await w.addFile("a.log", makeLog(0, 30), () => {});
    T.state.activeId = f.id; w.render();
    const popup = d.getElementById("filterPopup"), bar = d.getElementById("findBar");
    ctrl(d, w, "F", { shiftKey: true });
    assert(!popup.classList.contains("hidden"), "Ctrl+Shift+F opens the filter popup");
    assert(!isVisible(bar, w), "...not the find bar");
    fireKeydown(d, w, "Escape");
    ctrl(d, w, "f");
    assert(isVisible(bar, w) && d.activeElement === d.getElementById("findInput"), "Ctrl+F opens the find bar, input focused");
    ctrl(d, w, "F", { shiftKey: true });
    assert(!popup.classList.contains("hidden"), "Ctrl+Shift+F opens the filter popup while typing in the find input");
    fireKeydown(d, w, "Escape"); fireKeydown(d, w, "Escape");
    if (d.activeElement && d.activeElement.blur) d.activeElement.blur(); // jsdom keeps focus in the hidden popup's input
    const panel = d.getElementById("facetPanelBody");
    const open0 = isVisible(panel, w);
    ctrl(d, w, "i");
    assert(isVisible(panel, w) !== open0, "Ctrl+I toggles the Facets tab");
    ctrl(d, w, "i");
    assert(isVisible(panel, w) === open0, "...and back");
  });

  await withApp(async (w, d, T) => {
    section("find-shortcut-ctrl-f d. Text file: Ctrl+F opens the editor find bar, Ctrl+Shift+F the filter popup");
    const [doc] = LOGSIM.generateToStrings({ format: "plain", entries: 40, seed: 7 });
    await w.loadFileDescriptors([{ file: new w.File([doc.text], doc.name), handle: null }]);
    T.state.activeId = T.state.rootIds[0]; w.render();
    const popup = d.getElementById("filterPopup"), bar = d.getElementById("findBar");
    ctrl(d, w, "f");
    assert(isVisible(bar, w) && popup.classList.contains("hidden"), "Ctrl+F on a text file opens the find bar");
    fireKeydown(d, w, "Escape");
    ctrl(d, w, "F", { shiftKey: true });
    assert(!popup.classList.contains("hidden"), "Ctrl+Shift+F on a text file opens the filter popup");
  });

  await withApp(async (w, d, T) => {
    section("find-shortcut-ctrl-f e. A user rebinding of another action to Ctrl+G wins over the alias");
    const f = await w.addFile("a.log", makeLog(0, 30, { suffix: i => (i % 7 === 0 ? "Needle" : "hay") }), () => {});
    T.state.activeId = f.id; w.render();
    const bar = d.getElementById("findBar");
    w.renderShortcutBindingsList();
    const row = id => d.querySelector('#shortcutBindingsList [data-action-id="' + id + '"]');
    fireClick(row("toggleFacets").querySelector(".shortcut-rebind-btn"), w);
    ctrl(d, w, "g");
    const panel = d.getElementById("facetPanelBody");
    const open0 = isVisible(panel, w);
    assert(!isVisible(bar, w), "sanity: the recording keypress did not open the find bar");
    ctrl(d, w, "g");
    assert(isVisible(panel, w) !== open0, "Ctrl+G now toggles the facets (the rebinding)");
    assert(!isVisible(bar, w), "...and does not act as the find alias");
    fireClick(d.getElementById("btnResetShortcuts"), w);
    ctrl(d, w, "g");
    assert(isVisible(bar, w), "after Reset, Ctrl+G is the find alias again");
  });
}
