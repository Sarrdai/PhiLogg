// GROUP touch-dismiss-click-popups — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP touch-dismiss-click-popups — a touch tap outside a click-dismissed popup only closes it
   Origin: 2026-10-04 (tablet retest). Filter popup, columns panel, open menu, library menu and
   color picker close in the bubble-phase document click, so the same tap also selected the log
   row underneath. A non-mouse press outside one now consumes its click (like the context menus,
   GROUP touch-dismiss-tap-consumed); the close itself stays click-timed. Mouse is unchanged.
   Data: log-sim "basic" scenario.
   ============================================================ */
group("touch-dismiss-click-popups");

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 300, seed: 43 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  w.innerWidth = 820; w.dispatchEvent(new w.Event("resize"));
  const card = id => d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]');
  const ptr = (el, pointerType) => {
    const ev = new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "pointerType", { value: pointerType });
    el.dispatchEvent(ev);
  };
  const tap = (el, pointerType = "touch") => { ptr(el, pointerType); fireClick(el, w); };
  const entries = T.currentViewEntries;
  const target = entries[5];
  const popups = {
    filterPopup: { el: () => d.getElementById("filterPopup"), open: () => w.openFilterPopup(), inside: () => d.getElementById("filterPopup") },
    columnsPanel: { el: () => d.getElementById("columnsPanel"), open: () => fireClick(d.querySelector(".toggle-columns"), w), inside: () => d.getElementById("columnsPanel") },
    openMenu: { el: () => d.getElementById("openMenu"), open: () => w.toggleOpenMenu(), inside: () => d.getElementById("openMenu") },
    libraryMenu: { el: () => d.getElementById("libraryMenu"), open: () => w.openLibraryMenu(), inside: () => d.getElementById("libraryMenu") },
    colorPickerPopup: { el: () => d.getElementById("colorPickerPopup"), open: () => w.openColorPicker(f.id, d.getElementById("btnOpen"), () => {}), inside: () => d.getElementById("colorPickerPopup") },
  };
  const hidden = p => p.el().classList.contains("hidden");

  for (const [name, p] of Object.entries(popups)) {
    section("touch-dismiss-click-popups " + name + " a. touch tap on a row closes it and does not select the row");
    T.state.selectedId = null;
    p.open();
    assert(!hidden(p), name + " open");
    tap(card(target.id));
    assert(hidden(p), name + " closed");
    assert(T.state.selectedId !== target.id, name + ": row not selected, got " + T.state.selectedId);
    tap(card(target.id));
    assert(T.state.selectedId === target.id, name + ": the next tap selects normally");

    section("touch-dismiss-click-popups " + name + " b. mouse: closes and the row is selected (unchanged)");
    T.state.selectedId = null;
    p.open();
    tap(card(target.id), "mouse");
    assert(hidden(p), name + " closed (mouse)");
    assert(T.state.selectedId === target.id, name + ": mouse click also selects");

    section("touch-dismiss-click-popups " + name + " c. a tap inside does not close it");
    p.open();
    const inner = p.inside();
    tap(inner);
    assert(!hidden(p), name + " stays open after a tap inside");
    w.closeFilterPopup(); w.closeColumnsPanel(); w.closeOpenMenu(); w.closeLibraryMenu(); w.closeColorPicker();
  }
});
