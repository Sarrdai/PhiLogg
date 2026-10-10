// GROUP pip-phone-all-views — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP pip-phone-all-views — the desktop mini window keeps every view at phone width
   Origin: 2026-10-10 (person-requested). The mini window (PiP, 420x320 by
   default) lands in the phone tier, whose phoneEnforceTab/applyFhView switched
   Table/Plot back to Filtered and whose CSS hid the view switcher. Under
   state.pipActive the phone tier no longer restricts views (phoneViewsOnly);
   the switcher sets the window's minimum width instead (inject.js). Leaving
   the mini window at phone width restores the Filtered-only rule.
   Data: log-sim "timing" scenario ("completed in [*:int]ms").
   ============================================================ */
group("pip-phone-all-views");

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["timing"], entries: 300, seed: 43 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  const node = w.createFilterNode(f.id, "text", "completed in [*:int]ms");
  T.state.activeId = node.id;
  w.render();
  const tabBtn = tab => d.querySelector('#fhTabs [data-fh-tab="' + tab + '"]');
  const shown = sel => w.getComputedStyle(d.querySelector(sel)).display !== "none";
  const resize = width => { w.innerWidth = width; w.dispatchEvent(new w.Event("resize")); };

  section("pip-phone-all-views a. Entering the mini window keeps Table at phone width");
  resize(1440);
  w.applyFhView("table");
  assert(T.fhActiveTab === "table", "sanity: Table is showing on desktop");
  w.philoggSetPip(true); // the wrapper flags PiP before it shrinks the window
  resize(420);
  assert(w.layoutTier() === "phone", "sanity: 420px is the phone tier");
  assert(T.fhActiveTab === "table", "Table stays in the phone-width mini window, got " + T.fhActiveTab);
  assert(shown("#fhTabs") && shown("#vbView"), "the view switcher stays visible in the mini window at phone width");
  assert(!d.getElementById("phoneExtractHint").classList.contains("show"), "no 'needs a wider screen' hint while the mini window shows Table");

  section("pip-phone-all-views b. Every view is reachable through the switcher");
  for (const tab of ["plot", "filter", "highlight", "table"]) {
    fireClick(tabBtn(tab), w);
    assert(T.fhActiveTab === tab, "switcher click lands on " + tab + ", got " + T.fhActiveTab);
  }
  fireKeydown(d, w, "5", { ctrlKey: true });
  assert(T.fhActiveTab === "plot", "Ctrl+5 opens Plot in the mini window, got " + T.fhActiveTab);

  section("pip-phone-all-views c. Leaving the mini window at phone width restores Filtered only");
  w.philoggSetPip(false);
  assert(T.fhActiveTab === "filter", "out of the mini window the phone tier falls back to Filtered, got " + T.fhActiveTab);
  assert(!shown("#fhTabs"), "the phone tier hides the view switcher again");
  w.applyFhView("table");
  assert(T.fhActiveTab === "filter", "applyFhView coerces to Filtered again outside the mini window");
});
