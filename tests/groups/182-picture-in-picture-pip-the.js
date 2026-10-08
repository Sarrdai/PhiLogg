// GROUP 182 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 182 — Picture-in-picture (PiP), the desktop wrapper's replacement
   for the abandoned popout-window approach.
   Origin: this session (revised: PiP is now entered via an injected diagonal
   <-> window-control button rather than a "minimize to PiP" setting, so the
   jsdom half shrank accordingly). jsdom can't reach real window geometry
   (set_size/set_always_on_top/unminimize) or the injected buttons — those
   need a live `cd desktop && npm run tauri dev` — but the page-side half is
   fully exercisable: the `philoggSetPip` hook the wrapper calls to flip
   `state.pipActive` + `html.pip-mode`, the `html.pip-mode` chrome-hide CSS
   list (a tripwire like GROUP 140 — renaming one of those ids would break
   PiP with nothing failing here), and `jumpAfterPip`'s routing (direct when
   not in PiP, through a stubbed `window.philogg.exitPip` when in PiP).
   ============================================================ */
group(182);
await withApp(async (w, d, T) => {
  section("182b. philoggSetPip toggles state.pipActive + html.pip-mode");

  assert(T.state.pipActive === false, "starts out of PiP");
  assert(!d.documentElement.classList.contains("pip-mode"), "no pip-mode class on <html> yet");

  w.philoggSetPip(true);
  assert(T.state.pipActive === true, "philoggSetPip(true) sets the runtime flag");
  assert(d.documentElement.classList.contains("pip-mode"), "...and adds html.pip-mode");

  w.philoggSetPip(false);
  assert(T.state.pipActive === false, "philoggSetPip(false) clears the runtime flag");
  assert(!d.documentElement.classList.contains("pip-mode"), "...and removes html.pip-mode");
});

await withApp(async (w, d, T) => {
  section("182c. html.pip-mode CSS hides chrome (tripwire)");

  const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const rule = css.match(/html\.pip-mode\s+#emptyState\s*\{[\s\S]*?\}/);
  assert(rule, "an html.pip-mode rule block exists");
  assert(/display\s*:\s*none\s*!important/.test(rule[0]), "...with the display:none !important tripwire");
  // Each of these ids must stay a chrome element the wrapper's PiP hides —
  // silently renaming one would break PiP's content-only view with nothing
  // failing here. (The list is deliberately a strict set: content view
  // chrome like .tail-jump-btn is NOT hidden.) #treeActionBar dropped this
  // session (FEATURE_BACKLOG.md #77, retired outright in favor of
  // #sidebarToolbar) — no replacement entry needed, #sidebarToolbar is a
  // descendant of #sidebar, already covered by that entry.
  for (const id of ["#toolbar", "#sidebar", "#extractToolbar", "#tableToolbar",
    "#plotToolbar", "#plotControls", "#contextToolbar", "#filteredToolbar", "#linkToolbar",
    "#detailPanel", "#detailResizer", "#timelineMinimap", "#emptyState"]) {
    assert(css.includes("html.pip-mode " + id), "html.pip-mode hides " + id);
  }
  assert(!css.includes("html.pip-mode #treeActionBar"),
    "#treeActionBar is retired (FEATURE_BACKLOG.md #77) — no stray rule targeting it should remain");

  // #viewBar is not hidden wholesale — it collapses and hides everything but
  // #vbView (the View group around #fhTabs), whose tabs are surfaced into the mini strip (position:fixed above the
  // injected #tauri-pip). Pin that contract too: the ViewMode switcher stays
  // usable in PiP.
  assert(css.includes("html.pip-mode #fhTabs"), "html.pip-mode surfaces #fhTabs (the ViewMode switcher)");
  assert(/html\.pip-mode\s+#fhTabs\s*\{[\s\S]*?position\s*:\s*fixed/.test(css),
    "...as a fixed element, so it sits in the mini strip rather than inside the (collapsed) #viewBar");
  assert(css.includes("html.pip-mode #viewBar > :not(#vbView)"),
    "...and #viewBar's other children (level bar, row-actions) are hidden");
});

await withApp(async (w, d, T) => {
  section("182d. jumpAfterPip: direct call when not in PiP");

  let called = null;
  w.jumpAfterPip(function (a, b) { called = [a, b]; }, ["x", "y"]);
  assert(called && called[0] === "x" && called[1] === "y", "not in PiP: fn runs directly with its args");
});

await withApp(async (w, d, T) => {
  section("182e. jumpAfterPip: routes through window.philogg.exitPip when in PiP");

  let exitResolve;
  let exitCalls = 0;
  w.philogg = { exitPip: () => { exitCalls++; return new w.Promise(r => { exitResolve = r; }); } };
  T.state.pipActive = true; // simulate the wrapper having entered PiP

  let called = null;
  w.jumpAfterPip(function (a) { called = a; }, ["z"]);
  assert(exitCalls === 1, "in PiP: exitPip is invoked");
  assert(called === null, "...but the jump has not run yet (awaits exitPip)");

  exitResolve();
  await w.Promise.resolve(); // flush the .then() microtask
  assert(called === "z", "after exitPip resolves, the jump runs with its args");
});
