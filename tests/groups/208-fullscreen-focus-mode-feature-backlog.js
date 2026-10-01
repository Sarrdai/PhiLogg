// GROUP 208 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 208 — Fullscreen Focus Mode (FEATURE_BACKLOG.md #66)
   Origin: this session. A distraction-free mode (toggleFocusMode): removes
   the header outright, force-collapses the Files & Filters sidebar and the
   Entry Detail panel to their edge-hover overlays (reusing the existing
   collapse + hoverExpand mechanism), keeps #viewBar and the timeline minimap
   visible, and restores the prior collapse/hover state on exit. Real OS
   fullscreen is a Tauri-only capability, so the F11 shortcut (rebindable) is
   only HANDLED under the desktop wrapper (window.philogg present) and the page
   asks window.philogg.setFullscreen to go fullscreen; the plain browser build
   never binds F11. Esc is a secondary exit, but only when no overlay is open.
   Desktop/Rust side (window_set_fullscreen, inject.js) is not jsdom-testable —
   verified by code review + `cd desktop && npm run build`.
   ============================================================ */
group(208);
await withApp(async (w, d, T) => {
  section("208a. Enter Focus Mode: header removed, sidebar+detail force-collapsed & hover forced, viewBar/minimap kept");

  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();

  // Prior state: both panels expanded, hover-reveal OFF for both (a
  // non-default value, so the restore test below is meaningful).
  T.hoverExpandSidebar = false;
  T.hoverExpandDetail = false;
  assert(!w.isSidebarCollapsed(), "precondition: sidebar starts expanded");
  assert(!w.isDetailCollapsed(), "precondition: detail starts expanded");
  assert(isVisible(d.getElementById("toolbar"), w), "precondition: header visible");
  const minimapDisplayBefore = w.getComputedStyle(d.getElementById("timelineMinimap")).display;

  let fsCalls = [];
  w.philogg = { setFullscreen: on => { fsCalls.push(on); } };

  w.toggleFocusMode();

  assert(w.isFocusMode(), "toggleFocusMode() turns Focus Mode on");
  assert(d.body.classList.contains("focus-mode"), "body carries the focus-mode class");
  assert(!isVisible(d.getElementById("toolbar"), w), "header (#toolbar) is removed in Focus Mode");
  assert(w.isSidebarCollapsed(), "sidebar force-collapsed in Focus Mode");
  assert(w.isDetailCollapsed(), "Entry Detail force-collapsed in Focus Mode");
  assert(T.hoverExpandSidebar === true, "sidebar hover-reveal forced on regardless of the user's setting");
  assert(T.hoverExpandDetail === true, "detail hover-reveal forced on regardless of the user's setting");
  assert(isVisible(d.getElementById("viewBar"), w), "#viewBar stays visible in Focus Mode");
  assert(w.getComputedStyle(d.getElementById("timelineMinimap")).display === minimapDisplayBefore,
    "Focus Mode does not change the timeline minimap's visibility");
  assert(fsCalls.length === 1 && fsCalls[0] === true, "entering asks the desktop wrapper for real OS fullscreen (setFullscreen(true))");
  assert(T.focusModePrevState && T.focusModePrevState.sidebarCollapsed === false && T.focusModePrevState.hoverExpandSidebar === false,
    "prior state captured for restore on exit");
});

await withApp(async (w, d, T) => {
  section("208b. Exit Focus Mode restores the exact prior collapse + hover state");

  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();
  T.hoverExpandSidebar = false;
  T.hoverExpandDetail = false;

  let fsCalls = [];
  w.philogg = { setFullscreen: on => { fsCalls.push(on); } };

  w.toggleFocusMode(); // on
  w.toggleFocusMode(); // off

  assert(!w.isFocusMode(), "second toggle turns Focus Mode off");
  assert(!d.body.classList.contains("focus-mode"), "focus-mode class removed on exit");
  assert(isVisible(d.getElementById("toolbar"), w), "header restored on exit");
  assert(!w.isSidebarCollapsed(), "sidebar restored to its prior (expanded) state");
  assert(!w.isDetailCollapsed(), "Entry Detail restored to its prior (expanded) state");
  assert(T.hoverExpandSidebar === false, "sidebar hover-reveal restored to the user's prior setting");
  assert(T.hoverExpandDetail === false, "detail hover-reveal restored to the user's prior setting");
  assert(fsCalls.length === 2 && fsCalls[1] === false, "exiting asks the wrapper to leave fullscreen (setFullscreen(false))");
  assert(T.focusModePrevState === null, "captured prior-state cleared after restore");
});

await withApp(async (w, d, T) => {
  section("208c. A sidebar collapsed BEFORE Focus Mode stays collapsed on exit");

  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();
  w.toggleSidebarCollapsed(true); // user already had the sidebar collapsed
  assert(w.isSidebarCollapsed(), "precondition: sidebar collapsed before entering");

  w.philogg = { setFullscreen: () => {} };
  w.toggleFocusMode(); // on — still collapsed
  assert(w.isSidebarCollapsed(), "sidebar stays collapsed in Focus Mode");
  w.toggleFocusMode(); // off — must NOT expand it, since it was collapsed before
  assert(w.isSidebarCollapsed(), "sidebar remains collapsed after exit (prior state honoured, not blindly expanded)");
});

await withApp(async (w, d, T) => {
  section("208d. F11 shortcut is guarded to the desktop wrapper (window.philogg present)");

  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();

  // Plain browser build: no window.philogg. F11 must NOT toggle Focus Mode —
  // the browser's own F11 keeps priority.
  assert(!w.philogg, "precondition: no desktop wrapper");
  fireKeydown(d, w, "F11");
  assert(!w.isFocusMode(), "F11 is a no-op in the plain browser build (not bound)");

  // Desktop wrapper: window.philogg present. F11 now toggles Focus Mode.
  w.philogg = { setFullscreen: () => {} };
  fireKeydown(d, w, "F11");
  assert(w.isFocusMode(), "F11 toggles Focus Mode on under the desktop wrapper");
  fireKeydown(d, w, "F11");
  assert(!w.isFocusMode(), "F11 again toggles Focus Mode back off");
});

await withApp(async (w, d, T) => {
  section("208e. Esc exits Focus Mode, but only when no overlay is open");

  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();
  w.philogg = { setFullscreen: () => {} };
  w.toggleFocusMode();
  assert(w.isFocusMode(), "precondition: in Focus Mode");

  // An open popup: Esc closes it and leaves Focus Mode intact (single Esc must
  // never both close the overlay AND drop out of Focus Mode).
  w.openFilterPopup();
  assert(!d.getElementById("filterPopup").classList.contains("hidden"), "precondition: filter popup open");
  fireKeydown(d, w, "Escape");
  assert(d.getElementById("filterPopup").classList.contains("hidden"), "Esc closes the open popup");
  assert(w.isFocusMode(), "Esc did NOT also exit Focus Mode while an overlay was open");

  // Nothing open now: Esc exits Focus Mode.
  fireKeydown(d, w, "Escape");
  assert(!w.isFocusMode(), "Esc exits Focus Mode when no overlay is open");
});
