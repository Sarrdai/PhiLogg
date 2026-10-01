// GROUP 276 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 276 — Context view: tab switch opens the selection's surroundings,
   and the "Expand around matches" toolbar button
   Origin: 2026-09-25, person-reported + person-requested. (1) Switching
   Filtered -> Context with a selected match left its surroundings shut
   under the "aroundJump" setting — they only opened on the next click or
   nav-arrow jump, since showFhTab never ran applyContextJumpExpansion.
   (2) A new toolbar button next to Expand all / Collapse all that reveals
   exactly one expansion step around EVERY match.
     a) the switch opens the window around the selection, both when the
        Context view is stale (built by the switch itself) and when it is
        current (a selection change only), via the real #fhTabs button.
     b) under "collapsed" a switch opens nothing.
     c) the button: one step above and below every match (entries mode),
        an absolute state (replaces Expand all's), hand-owned afterwards
        (the next jump takes none of it back); time mode uses the timespan.
   ============================================================ */
group(276);
await withApp(async (w, d, T) => {
  section("276a. Filtered -> Context opens the window around the selected match");
  // "hit" every 10th line -> matches 0,10,...,50, gaps 1,11,...,51 (9 lines each).
  const f = await w.addFile("ctxtab.log", makeLog(0, 60, { suffix: i => (i % 10 === 0 ? "hit" : "other") }), () => {});
  const hitFilter = w.createFilterNode(f.id, "text", "hit");
  const openRanges = () => [...T.contextExpansions.keys()].sort((a, b) => a - b)
    .map(k => T.contextExpansions.get(k).map(r => r.from + "-" + r.to).join(",")).join("|");
  const contextTab = () => d.querySelector('#fhTabs [data-fh-tab="highlight"]');
  T.state.activeId = hitFilter.id;
  w.render(); // lands on Filtered, the hidden Context view is marked stale
  assert(T.fhActiveTab === "filter", "sanity: a new filter lands on Filtered");
  T.state.selectedId = f.entries[20].id;
  fireClick(contextTab(), w);
  assert(T.fhActiveTab === "highlight", "sanity: the tab button switched to Context");
  assert(openRanges() === "11-20|21-30",
    "the switch itself opens a step above and below the selected match, got " + openRanges());
  const row = d.querySelector('#highlightRows [data-entry-id="' + f.entries[25].id + '"]');
  assert(row, "…and the revealed context rows are rendered right away");

  fireClick(d.querySelector('#fhTabs [data-fh-tab="filter"]'), w);
  T.state.selectedId = f.entries[40].id; // selection change only — the Context view stays current
  fireClick(contextTab(), w);
  assert(openRanges() === "31-40|41-50",
    "a non-stale view too: the window moves to the new selection, the old one is taken back, got " + openRanges());
  assert(d.querySelector('#highlightRows [data-entry-id="' + f.entries[40].id + '"].selected'),
    "the selected match is in the rendered window");

  section("276b. Under \"collapsed\" the switch leaves the view shut");
  T.contextInitialExpansion = "collapsed";
  fireClick(d.querySelector("#ctxCollapseAll"), w);
  fireClick(d.querySelector('#fhTabs [data-fh-tab="filter"]'), w);
  T.state.selectedId = f.entries[20].id;
  fireClick(contextTab(), w);
  assert(T.fhActiveTab === "highlight" && T.contextExpansions.size === 0,
    "nothing opened, got " + openRanges());

  section("276c. Expand around matches: one step around every match");
  const btn = d.querySelector("#ctxExpandAround");
  assert(btn && !btn.disabled, "the button exists and is enabled with gaps to open");
  T.contextExpandStep = 3;
  fireClick(d.querySelector("#ctxExpandAll"), w);
  fireClick(btn, w);
  assert(openRanges() === "1-4,7-10|11-14,17-20|21-24,27-30|31-34,37-40|41-44,47-50|51-54",
    "three lines below and above each match, replacing Expand all's state, got " + openRanges());
  T.contextInitialExpansion = "aroundJump";
  w.moveContextMatchSelection(1); // -> 30: its own window adds nothing new (already open)
  w.moveContextMatchSelection(1); // -> 40
  assert(openRanges() === "1-4,7-10|11-14,17-20|21-24,27-30|31-34,37-40|41-44,47-50|51-54",
    "hand-owned: later jumps take none of it back, got " + openRanges());
  T.contextExpandStepUnit = "time";
  T.contextExpandStepMs = 2500; // one entry per second -> two entries each way
  fireClick(btn, w);
  assert(openRanges() === "1-3,8-10|11-13,18-20|21-23,28-30|31-33,38-40|41-43,48-50|51-53",
    "time mode reveals the configured timespan around each match, got " + openRanges());
  T.contextExpandStepUnit = "entries";
  T.contextExpandStep = 10;
});
