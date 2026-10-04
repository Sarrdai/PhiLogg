// GROUP responsive-phone — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, makeLog, ...) is
// in scope.

/* ============================================================
   GROUP responsive-phone — the phone shell (layout-phone, < 600px)
   Origin: 2026-10-02 (responsive layout, step 2). Reader mode: header reduced
   to drawer / title / find / settings, one-line tour banner with more/less,
   no view tabs (Filtered only), the entry detail as a bottom sheet,
   no editing (no tree drag, no column resize, no format editor), Ctrl+B =
   drawer in compact/phone. Visibility is asserted through getComputedStyle
   (class-based rules, so jsdom's cascade handles them).
   ============================================================ */
group("responsive-phone");

const phoneWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const vis = (d, w, sel) => { const e = d.querySelector(sel); return !!e && w.getComputedStyle(e).display !== "none"; };

await withApp(async (w, d, T) => {
  section("responsive-phone a. Header: controls per tier, title block, find button");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();

  phoneWidth(w, 1440);
  assert(vis(d, w, "#btnExport") && vis(d, w, "#btnUndo") && vis(d, w, "#navHistoryGroup") && vis(d, w, "#statusText"), "desktop: export/undo/nav/status visible");
  assert(vis(d, w, "#btnFindPhone") && !vis(d, w, "#phoneTitle") && !vis(d, w, "#btnDrawer"), "desktop: find button shown, no title block, no drawer button");
  phoneWidth(w, 820);
  assert(vis(d, w, "#btnExport") && vis(d, w, "#navHistoryGroup") && vis(d, w, "#btnDrawer") && vis(d, w, "#btnFindPhone") && !vis(d, w, "#phoneTitle"),
    "compact: header keeps its items, drawer + find buttons added, no phone title block");
  phoneWidth(w, 390);
  ["#btnExport", "#btnUndo", "#btnRedo", "#navHistoryGroup", "#statusText", "#btnAssistant", ".brand-name", ".brand-version"].forEach(sel =>
    assert(!vis(d, w, sel), "phone: " + sel + " hidden"));
  ["#btnDrawer", "#phoneTitle", "#btnFindPhone", "#btnSettings", ".brand-mark"].forEach(sel =>
    assert(vis(d, w, sel), "phone: " + sel + " visible"));

  const title = d.querySelector("#phoneTitle");
  assert(title.querySelector("b").textContent === "a.log" && title.querySelector("span").textContent === "30 entries",
    "root file active: its name and entry count, got " + title.textContent);
  const flt = w.createFilterNode(f.id, "text", f.entries[0].message.split(/\s+/)[0]);
  T.state.activeId = flt.id;
  w.render();
  const n = w.getEntries(flt.id).length;
  assert(title.querySelector("b").textContent === w.nodeDisplayName(flt) && title.querySelector("span").textContent === "a.log · " + n.toLocaleString("de-DE") + " entries",
    "filter node active: its label, then '<file> · <n> entries', got " + title.textContent);

  assert(d.querySelector("#findBar").classList.contains("hidden"), "sanity: find bar closed");
  d.querySelector("#btnFindPhone").click();
  assert(!d.querySelector("#findBar").classList.contains("hidden"), "the find button opens the find bar");
});

await withApp(async (w, d, T) => {
  section("responsive-phone b. Tour banner: one line, more/less, TRY hint only expanded on phone");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  w.setSessionBanner("Read **this** first, it is a rather long hint line.");
  const banner = d.querySelector("#tourBanner"), more = d.querySelector("#tourBannerMore");

  phoneWidth(w, 1440);
  assert(!vis(d, w, "#tourBannerMore") && !vis(d, w, ".tour-banner-hint"), "desktop: no more button, no TRY hint");
  assert(vis(d, w, "#tourBannerClose"), "desktop: close stays");
  phoneWidth(w, 390);
  assert(vis(d, w, "#tourBannerMore") && more.textContent === "more" && !banner.classList.contains("expanded"), "phone: collapsed with a 'more' button");
  assert(!vis(d, w, ".tour-banner-hint"), "collapsed: no TRY hint");
  assert(vis(d, w, "#tourBannerClose"), "phone: '× close tour' stays");
  more.click();
  assert(banner.classList.contains("expanded") && more.textContent === "less" && more.getAttribute("aria-expanded") === "true", "more expands");
  assert(vis(d, w, ".tour-banner-hint") && /TRY/.test(d.querySelector(".tour-banner-hint").textContent), "expanded: the TRY hint line shows");
  more.click();
  assert(!banner.classList.contains("expanded") && more.textContent === "more" && !vis(d, w, ".tour-banner-hint"), "less collapses again");
  more.click();
  w.setSessionBanner("Another banner");
  assert(!banner.classList.contains("expanded") && more.textContent === "more", "a new banner starts collapsed");
  more.click();
  d.querySelector("#tourBannerClose").click();
  assert(banner.classList.contains("hidden"), "close tour hides the banner");
});

await withApp(async (w, d, T) => {
  section("responsive-phone c. No view tabs on phone: #fhTabs hidden, everything falls back to Filtered");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();
  phoneWidth(w, 1440);
  w.applyFhView("highlight");
  assert(T.fhActiveTab === "highlight", "sanity: desktop on the Context tab");
  phoneWidth(w, 390);
  assert(T.fhActiveTab === "filter" && T.fhLayout === "tabs", "switching to phone while on Context lands on Filtered, got " + T.fhActiveTab);
  assert(!vis(d, w, "#fhTabs"), "phone: the whole tab group is hidden");
  assert(vis(d, w, "#levelBar"), "phone: the level bar stays");
  w.applyFhView("patterns");
  w.render();
  assert(T.fhActiveTab === "filter", "a render that lands on Patterns falls back to Filtered, got " + T.fhActiveTab);
  w.applyFhView("patterns");
  w.jumpToViewTab(1);
  assert(T.fhActiveTab === "filter", "Ctrl+1 (Patterns slot) stays on Filtered on phone, got " + T.fhActiveTab);
  w.applyFhView("table");
  w.render();
  assert(T.fhActiveTab === "filter", "a render that lands on Table falls back to Filtered, got " + T.fhActiveTab);
  w.applyFhView("highlight");
  w.render();
  assert(T.fhActiveTab === "filter", "...and Context too");
  phoneWidth(w, 820);
  assert(vis(d, w, "#fhTabs"), "compact shows the tab group again");
  const shown2 = [...d.querySelectorAll("#fhTabs .view-tab")].map(b => b.dataset.fhTab);
  assert(shown2.includes("highlight") && shown2.includes("patterns"), "compact lists Patterns and Context again, got " + shown2.join());
  w.jumpToViewTab(1);
  assert(T.fhActiveTab === "patterns", "compact: Ctrl+1 reaches Patterns");
  phoneWidth(w, 1440);
  assert(vis(d, w, "#fhTabs"), "desktop shows the tab group");
});

await withApp(async (w, d, T) => {
  section("responsive-phone d. Entry detail is a bottom sheet: opens on a card tap, close keeps the selection, prev/next");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();
  phoneWidth(w, 390);
  const open = () => d.body.classList.contains("sheet-open");
  const btn = id => d.getElementById(id);
  assert(!open() && T.state.selectedId == null, "nothing selected: sheet closed");
  ["detailPrev", "detailNext", "detailClose"].forEach(id => assert(vis(d, w, "#" + id), "phone: #" + id + " visible"));
  assert(!vis(d, w, "#detailToggle") && !vis(d, w, "#detailResizer") && vis(d, w, "#detailGrab"), "phone: collapse toggle and resizer hidden, grab bar shown");

  const entries = T.currentViewEntries;
  w.selectEntry(entries[3].id, { scroll: true, index: 3 });
  assert(!open() && T.state.selectedId === entries[3].id, "a programmatic selection does not open the sheet");
  const card = id => d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]');
  card(entries[3].id).click();
  assert(open() && T.state.selectedId === entries[3].id, "tapping a card opens the sheet");
  btn("detailNext").click();
  assert(T.state.selectedId === entries[4].id, "next selects the following entry");
  btn("detailPrev").click();
  btn("detailPrev").click();
  assert(T.state.selectedId === entries[2].id, "prev steps back");
  assert(open(), "still open while stepping");
  btn("detailClose").click();
  assert(!open() && T.state.selectedId === entries[2].id, "close hides the sheet and keeps the selection");
  assert(d.querySelector("#tableRows .log-row.selected"), "the card keeps the selected class");

  phoneWidth(w, 1440);
  assert(!vis(d, w, "#detailPrev") && vis(d, w, "#detailToggle"), "desktop: the sheet buttons are gone, the collapse toggle is back");
});

await withApp(async (w, d, T) => {
  section("responsive-phone e. Editing off: no tree drag, no column resize handles, Open… menu, format editor notice");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const flt = w.createFilterNode(f.id, "text", f.entries[0].message.split(/\s+/)[0]);
  const flt2 = w.createFilterNode(f.id, "text", "zzz-none");
  T.state.activeId = f.id;
  w.render();

  const drag = (fromId, toId) => {
    const rows = [...d.querySelectorAll("#tree .tree-row")];
    const from = rows.find(r => r.dataset.nodeId === fromId) || rows[1];
    from.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 20 }));
    d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 60, clientY: 80 }));
    const started = d.body.classList.contains("tree-dragging");
    d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: 60, clientY: 80 }));
    return started;
  };
  phoneWidth(w, 1440);
  assert(drag(flt.id) === true, "sanity: desktop starts a tree drag");
  w.render();
  phoneWidth(w, 390);
  assert(drag(flt.id) === false, "phone: a tree drag never starts");

  assert(!vis(d, w, ".col-resize-handle"), "phone: column resize handles hidden");
  assert(!vis(d, w, '#openMenu .ctx-item[data-action="folder"]') && !vis(d, w, '#openMenu .ctx-item[data-action="zip"]'), "phone: Open… has no Folder…/ZIP…");
  assert(vis(d, w, '#openMenu .ctx-item[data-action="files"]') && vis(d, w, '#openMenu .ctx-item[data-action="import"]'), "phone: File(s)… and Import… stay");

  const dlg = d.getElementById("formatDialog");
  w.openFormatEditDialog(null);
  assert(dlg.classList.contains("hidden"), "phone: the format dialog does not open");
  assert(/needs a wider window/.test(d.getElementById("copyToast").textContent), "...a notice explains why, got: " + d.getElementById("copyToast").textContent);
  phoneWidth(w, 820);
  w.openFormatEditDialog(null);
  assert(!dlg.classList.contains("hidden"), "compact: the format dialog opens");
});

await withApp(async (w, d, T) => {
  section("responsive-phone f. Ctrl+B toggles the drawer in compact/phone, the collapse on desktop");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  const ctrlB = () => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "b", code: "KeyB", ctrlKey: true, bubbles: true, cancelable: true }));
  const sidebar = d.getElementById("sidebar");
  phoneWidth(w, 820);
  ctrlB();
  assert(d.body.classList.contains("drawer-open") && !sidebar.classList.contains("collapsed"), "compact: Ctrl+B opens the drawer, no desktop collapse");
  ctrlB();
  assert(!d.body.classList.contains("drawer-open"), "...and closes it");
  phoneWidth(w, 390);
  ctrlB();
  assert(d.body.classList.contains("drawer-open") && !sidebar.classList.contains("collapsed"), "phone: same");
  phoneWidth(w, 1440);
  ctrlB();
  assert(sidebar.classList.contains("collapsed") && !d.body.classList.contains("drawer-open"), "desktop: Ctrl+B still collapses the sidebar");
});
