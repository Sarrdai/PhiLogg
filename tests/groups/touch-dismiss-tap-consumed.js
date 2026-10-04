// GROUP touch-dismiss-tap-consumed — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP touch-dismiss-tap-consumed — a touch press that closes a context menu
   does not also act on what is underneath
   Origin: 2026-10-04 (phone usability test). The capture-phase pointerdown
   dismiss closed the menu, then the browser's click reached the card under the
   finger (opened the sheet / selected) and two such taps formed a dblclick.
   Non-mouse presses that closed a menu now consume their click and a dblclick
   shortly after; mouse behavior is unchanged.
   Data: log-sim "basic" scenario.
   ============================================================ */
group("touch-dismiss-tap-consumed");

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 300, seed: 43 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  const menu = d.getElementById("contextMenu");
  const card = id => d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]');
  const ptr = (el, pointerType) => {
    const ev = new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "pointerType", { value: pointerType });
    el.dispatchEvent(ev);
  };
  const tap = (el, pointerType = "touch") => { ptr(el, pointerType); fireClick(el, w); };
  const entries = T.currentViewEntries;
  const [a, b, c] = [entries[2], entries[4], entries[6]];
  const openMenu = () => { fireContextMenu(card(a.id), w); assert(!menu.classList.contains("hidden"), "context menu open"); };
  const open = () => d.body.classList.contains("sheet-open");

  section("touch-dismiss-tap-consumed a. Touch tap on a card while a menu is open only closes it");
  openMenu();
  const selBefore = T.state.selectedId;
  tap(card(b.id));
  assert(menu.classList.contains("hidden"), "menu closed");
  assert(T.state.selectedId === selBefore && T.state.selectedId !== b.id && !open(), "card not selected, sheet not opened");

  section("touch-dismiss-tap-consumed b. The next tap works normally");
  tap(card(b.id));
  assert(T.state.selectedId === b.id && open(), "second tap selects and opens the sheet");
  d.getElementById("detailClose").click();

  section("touch-dismiss-tap-consumed c. A dblclick right after a swallowed dismiss tap is swallowed");
  openMenu();
  tap(card(c.id));
  const tabBefore = T.fhActiveTab;
  fireDblClick(card(c.id), w);
  assert(T.fhActiveTab === tabBefore && T.state.selectedId === b.id, "dblclick ignored (no jump, selection unchanged)");

  section("touch-dismiss-tap-consumed d. A press that never becomes a click does not swallow a later tap");
  openMenu();
  ptr(card(c.id), "touch"); // scroll gesture: closes the menu, no click follows
  assert(menu.classList.contains("hidden"), "menu closed by the press");
  ptr(card(c.id), "touch"); fireClick(card(c.id), w); // a fresh tap, no menu open
  assert(T.state.selectedId === c.id, "next tap selects, got " + T.state.selectedId);

  section("touch-dismiss-tap-consumed e. A touch tap with no menu open is unaffected");
  tap(card(a.id));
  assert(T.state.selectedId === a.id, "plain touch tap selects");

  section("touch-dismiss-tap-consumed f. Mouse press outside closes the menu and the click still acts");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
  openMenu();
  tap(card(b.id), "mouse");
  assert(menu.classList.contains("hidden"), "mouse: menu closed");
  assert(T.state.selectedId === b.id, "mouse: the click also selects the card, got " + T.state.selectedId);
});
