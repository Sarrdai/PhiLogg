// GROUP 51 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 51 — Tree row DOM identity survives load ticks while the loading
   file itself IS the active view — a click on a DIFFERENT, already-loaded
   row doesn't get lost
   Origin: this session, person-reported follow-up to Group 50's fix:
   *"Während eine Datei lädt, muss ich noch immer mehrfach auf eine andere
   Klicken bis der Wechel erfolgt, es scheint nicht jeder Klick registriert
   zu werden. Nach dem wechsel auf die bereits vorhandene Datei funktioniert
   aber alles flüssig..."*

   Group 50 fixed the BACKGROUND case (loading file not active) but left the
   ACTIVE case's scheduleLoadRender calling a full render() on every parse
   tick, exactly as Group 49 originally shipped it. render() calls
   renderTree(), which tears down and rebuilds EVERY row in #tree from
   scratch — including whatever OTHER row a person is trying to click while
   the new file loads (auto-activated, so it's the active view from the
   start). A native click only fires if mousedown and mouseup land on the
   same, still-attached element; rebuilding that element out from under the
   gesture up to once per animation frame is exactly what made clicks not
   reliably register, matching the report precisely (works fine once
   already switched, since ticks stop mattering to the other file's row at
   that point).

   Fixed by splitting what a load tick actually needs to touch:
   updateLoadRowProgress (new: also writes the row's .tree-count now, not
   just the progress fill) handles the loading file's OWN row directly,
   without renderTree(), on every tick regardless of active state;
   renderLoadTickMainView (new) handles the rest of what the active view
   needs — table/minimap/level bar/status — also without renderTree().
   Structural tree changes (a row appearing at createFileNode, disappearing
   via flushLoadRender's cleanup) still go through a real render(), just
   never per-tick. Superseded later the same session (see Group 50's own
   header) by scheduleLoadRender dropping the per-tick full render
   ENTIRELY, active view or not — the tree-identity guarantee this group
   checks still holds (even more trivially now, since renderTree() is never
   called by a load tick at all), just no longer for the "was the active
   view's own content live too" reason originally documented here.
   ============================================================ */
group(51);
await withApp(async (w, d, T) => {
  section("51. A different, already-loaded row's DOM identity (and click-ability) survives parse ticks while the newly-loading file is the active view");

  // File A: small, finishes instantly — the row a person would be trying
  // to click on while B (below) loads and fills the active view.
  const fa = await w.addFile("a.log", makeLog(0, 5));
  T.state.activeId = fa.id;
  w.render();

  // Monkey-patch render()/renderTree() to count calls — same injected-
  // script technique Group 47/50 use (a second <script> in the same
  // document shares the realm's lexical scope, so reassigning a top-level
  // function declaration is visible page-wide).
  const s = d.createElement("script");
  s.textContent = `
    const __origRender = render;
    render = function() { window.__renderCalls = (window.__renderCalls||0)+1; return __origRender(); };
    const __origRenderTree = renderTree;
    renderTree = function() { window.__renderTreeCalls = (window.__renderTreeCalls||0)+1; return __origRenderTree(); };
  `;
  d.body.appendChild(s);

  // File B: large enough (15 PARSE_CHUNK_LINES chunks) that a handful of
  // ticks still leaves it genuinely mid-parse — loaded (not awaited),
  // auto-activating exactly like a real "Open…"/drag-drop always has.
  const textB = makeLog(0, 60000);
  w.__renderCalls = 0; w.__renderTreeCalls = 0;
  const donePromise = w.addFile("huge.log", textB);
  assert(T.state.activeId !== fa.id, "sanity: the newly-loading file auto-activated — it IS the active view for the ticks below, the exact reported scenario");
  assert(w.__renderTreeCalls === 1,
    "creating B's node rebuilds the tree exactly once, to insert its own row — a genuinely structural change (a new root), and the only tree rebuild this whole test expects — got " + w.__renderTreeCalls);

  // File A's row is captured HERE, right after the one legitimate,
  // structural rebuild above (which necessarily touched every row,
  // including A's, since the rootIds list itself changed) — what this test
  // actually covers is the SUSTAINED parse-tick period that follows, not
  // that one-off moment.
  const labelA = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  const rowA = labelA.closest(".tree-row");
  w.__renderTreeCalls = 0; w.__renderCalls = 0;

  // Let several real parse chunks land while B stays the active view
  // throughout — same idiom Group 49/50 use for a genuinely mid-parse state.
  const nodeB = T.state.nodes[T.state.activeId];
  for (let i = 0; i < 3 && nodeB.entries.length < 60000; i++) await new Promise(r => setTimeout(r, 0));
  assert(nodeB.entries.length > 0 && nodeB.entries.length < 60000,
    "file B is genuinely still mid-parse, actively being watched fill in — got " + nodeB.entries.length + "/60000");
  assert(w.__renderTreeCalls === 0, "none of B's parse ticks rebuilt the tree while B is the active view — got " + w.__renderTreeCalls + " renderTree() calls");
  assert(w.__renderCalls === 0, "none of B's parse ticks called render() at all anymore (not just renderTree()) — got " + w.__renderCalls);

  // File A's row is still the EXACT SAME DOM element as right after B was
  // created — the direct proof renderTree() genuinely left #tree alone for
  // every tick since; a rebuild would have replaced it with an
  // equal-but-different node.
  const labelA2 = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  assert(labelA2 !== undefined && labelA2.closest(".tree-row") === rowA,
    "file A's tree row survives B's active-view parse ticks as the exact same DOM element (identity preserved)");

  // The strongest proof: a real click dispatched on that same reference
  // still works and switches to file A — if the row had been torn down and
  // replaced at any point during the ticks, this reference's click listener
  // would be gone and nothing would happen.
  fireClick(rowA, w);
  assert(T.state.activeId === fa.id, "a click on file A's row (the same object reference held throughout B's parse ticks) correctly switches to it — no click was lost mid-load");

  await donePromise;
  assert(nodeB.entries.length === 60000, "file B finished loading in the background after the detour through being clicked away from");
});
