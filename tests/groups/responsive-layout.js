// GROUP responsive-layout — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, makeLog, ...) is
// in scope.

/* ============================================================
   GROUP responsive-layout — layout tiers by window width, the sidebar as an
   overlay drawer below 1024px, long-press → context menu on touch
   Origin: 2026-10-02 (responsive layout, step 1). Tiers: desktop >= 1024,
   compact 600-1023 (body.layout-compact), phone < 600 (body.layout-phone).
   applyRowGrid() hides Δt + every middle column except Thread in compact,
   Δt + every middle column in phone. The long-press helper's timer is
   captured by stubbing window.setTimeout, so nothing here sleeps.
   ============================================================ */
group("responsive-layout");

const setWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const rowGrid = d => d.documentElement.style.getPropertyValue("--row-grid");

await withApp(async (w, d, T) => {
  section("responsive-layout a. Tier classes follow the window width");
  const cls = () => [d.body.classList.contains("layout-compact"), d.body.classList.contains("layout-phone")];
  const btn = d.getElementById("btnDrawer");
  assert(btn && btn.getAttribute("aria-label") === "Files and filters", "#btnDrawer exists with its aria-label");
  assert(d.getElementById("toolbar").firstElementChild === btn, "#btnDrawer is the first item in #toolbar");

  setWidth(w, 1440);
  assert(w.layoutTier() === "desktop" && cls().join() === "false,false", "1440 → desktop, no tier class");
  setWidth(w, 1024);
  assert(w.layoutTier() === "desktop" && cls().join() === "false,false", "1024 is still desktop");
  setWidth(w, 1023);
  assert(w.layoutTier() === "compact" && cls().join() === "true,false", "1023 → compact only");
  setWidth(w, 820);
  assert(cls().join() === "true,false", "820 → layout-compact");
  setWidth(w, 600);
  assert(cls().join() === "true,false", "600 is still compact");
  setWidth(w, 599);
  assert(w.layoutTier() === "phone" && cls().join() === "false,true", "599 → layout-phone and NOT layout-compact");
  setWidth(w, 390);
  assert(cls().join() === "false,true", "390 → layout-phone");
  setWidth(w, 1440);
  assert(cls().join() === "false,false", "back to desktop removes both classes");

  // A mobile browser widens innerWidth to fit overflowing content (e.g. the
  // compact layout at first paint, 461px on a 390px phone) while the layout
  // viewport (documentElement.clientWidth) stays at the meta-viewport width:
  // the tier must follow the latter, or a phone never reaches layout-phone.
  Object.defineProperty(d.documentElement, "clientWidth", { configurable: true, get: () => 390 });
  setWidth(w, 461);
  assert(w.layoutTier() === "phone" && cls().join() === "false,true", "innerWidth 461 / clientWidth 390 (overflowed phone) → layout-phone");
  Object.defineProperty(d.documentElement, "clientWidth", { configurable: true, get: () => 0 });
  setWidth(w, 1440);
  assert(cls().join() === "false,false", "clientWidth 0 (no layout engine) falls back to innerWidth");
  Object.defineProperty(d.documentElement, "clientWidth", { configurable: true, get: () => w.innerWidth });
});

await withApp(async (w, d, T) => {
  section("responsive-layout b. applyRowGrid track list per tier");
  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  T.state.activeId = f.id;
  w.render();
  setWidth(w, 1440);
  assert(rowGrid(d) === "5px 178px 72px 66px 92px 158px 168px 1fr", "desktop: every column, got " + rowGrid(d));
  setWidth(w, 820);
  assert(rowGrid(d) === "5px 178px 0px 66px 92px 0px 0px 1fr", "compact: Δt/Location/Method 0px, Thread kept, got " + rowGrid(d));
  setWidth(w, 390);
  assert(rowGrid(d) === "5px 178px 0px 66px 0px 0px 0px 1fr", "phone: Δt and all middle columns 0px, got " + rowGrid(d));
  assert(T.state.columnVisible.thread === true && T.state.columnVisible.delta !== false, "stored column visibility untouched");
  setWidth(w, 1440);
  assert(rowGrid(d) === "5px 178px 72px 66px 92px 158px 168px 1fr", "back to desktop restores every track");
});

await withApp(async (w, d, T) => {
  section("responsive-layout c. Drawer: closed by default, button / scrim / Escape / node activation");
  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  T.state.activeId = f.id;
  w.render();
  const btn = d.getElementById("btnDrawer");
  const open = () => d.body.classList.contains("drawer-open");

  setWidth(w, 820);
  assert(!open(), "compact: drawer closed by default");
  btn.click();
  assert(open() && btn.getAttribute("aria-expanded") === "true", "hamburger opens the drawer");
  btn.click();
  assert(!open() && btn.getAttribute("aria-expanded") === "false", "hamburger again closes it");

  btn.click();
  d.getElementById("drawerScrim").click();
  assert(!open(), "scrim click closes");

  btn.click();
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(!open(), "Escape closes");

  btn.click();
  d.querySelector("#sidebar .tree-expander, #sidebar .tree-chevron")?.click();
  const row = d.querySelector("#tree .tree-row");
  assert(row, "sanity: a tree row exists");
  row.click();
  assert(!open(), "activating a tree node closes the drawer");

  btn.click();
  assert(open(), "reopened");
  setWidth(w, 1440);
  assert(!open(), "growing to desktop drops the drawer state");
  btn.click();
  assert(!open(), "desktop: the (hidden) button cannot open it");

  setWidth(w, 390);
  btn.click();
  assert(open(), "phone tier uses the same drawer");
  setWidth(w, 820);
  assert(!open(), "a tier change closes the drawer");
});

await withApp(async (w, d, T) => {
  section("responsive-layout d. Long-press dispatches exactly one contextmenu after 500ms (touch only, compact + phone tiers)");
  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  T.state.activeId = f.id;
  w.render();
  const timers = [];
  let nextId = 1;
  w.setTimeout = (fn, ms) => { const t = { id: nextId++, fn, ms, cleared: false }; timers.push(t); return t.id; };
  w.clearTimeout = id => { const t = timers.find(x => x.id === id); if (t) t.cleared = true; };
  const getTarget = () => d.querySelector("#tree .tree-row"); // re-queried: a click re-renders the tree
  let target = getTarget();
  let menus = [];
  d.addEventListener("contextmenu", ev => { if (!ev.isTrusted) menus.push(ev); });
  let clicks = 0;
  d.addEventListener("click", () => clicks++); // bubbling phase: the swallowed click never gets here

  const ptr = (type, x, y, pointerType = "touch") => {
    const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(ev, "pointerType", { value: pointerType });
    Object.defineProperty(ev, "isPrimary", { value: true });
    return ev;
  };
  const press = (x = 40, y = 50, type = "touch") => { timers.length = 0; menus = []; target = getTarget(); target.dispatchEvent(ptr("pointerdown", x, y, type)); return timers.filter(t => t.ms === 500); };

  setWidth(w, 820);
  let t = press();
  assert(t.length === 1, "compact tier: a touch press arms one 500ms timer");
  t[0].fn();
  assert(menus.length === 1, "fires exactly one contextmenu, got " + menus.length);
  assert(menus[0].target === target && menus[0].clientX === 40 && menus[0].clientY === 50 && menus[0].bubbles && menus[0].cancelable,
    "...on the original target with the press coordinates");
  target.dispatchEvent(ptr("pointerup", 40, 50));
  target = getTarget();
  const before = clicks;
  target.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(clicks === before, "the click after the long press is swallowed");
  target.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(clicks === before + 1, "only that one click: the next one goes through");

  t = press();
  target.dispatchEvent(ptr("pointerup", 40, 50));
  assert(t[0].cleared, "early release cancels the timer");
  t[0].fn();
  assert(menus.length === 0, "...and a late timer callback does nothing");

  t = press();
  target.dispatchEvent(ptr("pointermove", 45, 54)); // 6.4px: still a press
  assert(!t[0].cleared, "small movement (< 10px) keeps the press alive");
  target.dispatchEvent(ptr("pointermove", 40, 62)); // 12px from the origin
  assert(t[0].cleared, "movement > 10px cancels");
  t[0].fn();
  assert(menus.length === 0, "...no contextmenu");

  t = press(40, 50, "mouse");
  assert(t.length === 0, "mouse pointers never arm the helper");
  t = press(40, 50, "pen");
  assert(t.length === 0, "neither do pens");

  setWidth(w, 1440);
  t = press();
  assert(t.length === 0, "desktop tier: no long-press helper (even for touch pointers)");

  setWidth(w, 390);
  t = press();
  assert(t.length === 1, "phone tier: a touch press arms the 500ms timer too");
  t[0].fn();
  assert(menus.length === 1, "phone: fires exactly one contextmenu, got " + menus.length);
  target.dispatchEvent(ptr("pointerup", 40, 50));
  const phoneBefore = clicks;
  getTarget().dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(clicks === phoneBefore, "phone: the click after the long press is swallowed (no row selection)");
  t = press();
  target.dispatchEvent(ptr("pointermove", 40, 65)); // a scroll gesture
  assert(t[0].cleared, "phone: moving > 10px (scrolling) cancels the press");
  t[0].fn();
  assert(menus.length === 0, "phone: ...no contextmenu while scrolling");
});
