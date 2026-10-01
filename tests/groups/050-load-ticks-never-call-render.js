// GROUP 50 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 50 — Load ticks NEVER call render() — active view or background —
   and only the loading file's own row (progress fill + count) updates,
   on every single tick; nothing else (level bar, filter-child rows,
   Filtered/Full/minimap view) updates live during a load anymore
   Origin: this session, in four steps. First (2026-08-18, person-
   requested): *"...Von dem gerade ladenden Log möchte ich dann nur noch
   den Fortschrittsbalken am Dateinamen sehen."* — originally fixed by only
   skipping the full render for a BACKGROUND load, later made to apply to
   the active view too (see changelog.d's history for that arc). Then,
   same session, a further follow-up removed the live Filtered/Full/minimap
   view during loading entirely: *"Das ist noch immer merkbar langsamer...
   Falls das nicht möglich ist würde ich die Visualisierung beim Laden
   lieber ausschalten."* — real decoupling isn't realistic for this
   codebase's shape, so scheduleLoadRender was simplified to two cheap
   per-tick DOM writes (the row, and the level bar's counts), never a
   render(). Then a THIRD follow-up (same day) found switching to a
   different, already-loaded file mid-load still felt faster, suspecting
   the still-live level-bar counts: *"Liegt das daran, dass die Zähler für
   die Level... noch mitzählen? Nehme... alle Visualisierungen des
   Ladevorgangs raus... Und auch Ladebalken etc. darf eine etwas reduzierte
   Updaterate bekommen."* — updateLevelBarCounts() was deleted outright as
   dead code (see git history), the filter-subtree walk
   updateLoadRowLiveData used to do was dropped too (only the loading
   file's OWN row updates now, via the renamed updateLoadRowProgress), and
   a real-time throttle was added around the row update. A FOURTH
   follow-up (still same day) had that throttle taken back out again —
   person-reported it made no noticeable difference and looked visibly
   stuttery ("stockend"): *"nehme die 200ms wieder raus... Das scheint
   keinen merklichen Unterschied zu machen... das weglassen der anderen UI
   Updates hat schon genug gebracht."* `scheduleLoadRender` is back to
   doing its (now much cheaper, thanks to the third step) per-tick work on
   every single tick, unthrottled.
   A later session added ONE narrow exception to "nothing else updates
   live" (updateLiveGrowingTotal, GROUP 254) that kept #tableSpacer's
   height/the visible rows tracking the active node's live entry count
   during a load, to fix a stale scrollbar total on a large actively-
   growing merge. Removed again in a further session, person-requested
   after noticing it (and a separate meta-format focus-flicker bug, see
   GROUP 245/246) let partial content show before a load actually
   finished: "Rendern erst wenn vollständig geladen soll für alles
   gelten." The scrollbar now goes back to staying stale during a load,
   same as the rest of the view — see GROUP 254's own rewritten header.
   ============================================================ */
group(50);
await withApp(async (w, d, T) => {
  section("50. Load ticks never call render(); only the loading file's own row updates, every tick");

  // File A: small, finishes instantly — the file the person is actually
  // looking at throughout this test.
  const fa = await w.addFile("a.log", makeLog(0, 5));
  T.state.activeId = fa.id;
  w.render();

  // Monkey-patch render() to count calls — same injected-script technique
  // used throughout this suite (a second <script> in the same document
  // shares the realm's lexical scope, so reassigning a top-level function
  // declaration is visible page-wide).
  const s = d.createElement("script");
  s.textContent = `
    const __origRender = render;
    render = function() { window.__renderCalls = (window.__renderCalls||0)+1; return __origRender(); };
  `;
  d.body.appendChild(s);

  // File B: large enough (15 PARSE_CHUNK_LINES chunks) that a handful of
  // parse ticks still leaves plenty left over, exercising the real parse
  // loop's own setTimeout(0) yields for genuinely mid-parse entries/DOM
  // state — same idiom Group 49 uses. Auto-activates, so it IS the active
  // view for what follows (the scenario that used to matter most).
  const textB = makeLog(0, 60000);
  w.__renderCalls = 0;
  const donePromise = w.addFile("huge.log", textB);
  const newId = T.state.rootIds.find(id => id !== fa.id);
  const nodeB = T.state.nodes[newId];
  assert(newId, "the new file is a real root node immediately, before it's read a single chunk");
  assert(T.state.activeId === newId, "sanity: creating a new file auto-activates it (unchanged, existing behavior)");
  assert(w.__renderCalls === 1, "creating the node renders exactly once, to insert its row — got " + w.__renderCalls);
  w.__renderCalls = 0;

  await new Promise(r => setTimeout(r, 0));
  assert(nodeB.entries.length > 0 && nodeB.entries.length < 60000,
    "file B is genuinely still mid-parse — got " + nodeB.entries.length + "/60000");
  assert(w.__renderCalls === 0, "none of B's parse ticks called render(), even though B IS the active view — got " + w.__renderCalls);

  const labelB = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "huge.log");
  assert(labelB !== undefined, "file B's row still exists in the tree while it loads");
  const rowB = labelB.closest(".tree-row");
  const fillB = rowB.querySelector(".tree-load-fill");
  assert(fillB !== null, "file B's row still carries a progress fill while it loads");
  assert(parseInt(fillB.style.width, 10) > 0, "file B's progress fill width reflects its progress via the cheap direct-DOM path — got " + fillB.style.width);
  const countB = parseInt(rowB.querySelector(".tree-count").textContent.replace(/\./g, ""), 10);
  assert(countB === nodeB.entries.length, "file B's row count also updates via the same cheap path, on every tick — got " + countB);

  // A further tick keeps updating the row too — no throttle window to land
  // inside of anymore.
  await new Promise(r => setTimeout(r, 0));
  const countAfterAnotherTick = parseInt(rowB.querySelector(".tree-count").textContent.replace(/\./g, ""), 10);
  assert(nodeB.entries.length > countB, "sanity: the underlying data has genuinely grown further");
  assert(countAfterAnotherTick === nodeB.entries.length && countAfterAnotherTick > countB,
    "the row's DOM text is updated again on the very next tick, matching the data exactly — got " + countAfterAnotherTick);

  // #tableSpacer's height (and hence the native scrollbar) stays frozen
  // during a load tick too, same as everything else — a previous session's
  // updateLiveGrowingTotal exception (which tracked it live for the active
  // node) was removed again; see GROUP 254's rewritten header.
  const spacerHeight = parseInt(d.querySelector("#tableSpacer").style.height, 10) || 0;
  const liveTotal = nodeB.entries.length * T.ROW_HEIGHT;
  assert(spacerHeight < liveTotal,
    "the table spacer's height stays stale, NOT tracking B's live entry count, even while B is the active view — spacer=" + spacerHeight + ", live total=" + liveTotal);

  // The person switches to a different, already-loaded file mid-load — B
  // keeps streaming in the background exactly the same way it did as the
  // active view, since scheduleLoadRender no longer distinguishes the two.
  // Run it the rest of the way rather than sampling mid-flight again — the
  // invariant checked is just that background progress reaches full
  // completion untouched.
  T.state.activeId = fa.id;
  w.render();
  w.__renderCalls = 0;
  await donePromise;
  assert(w.__renderCalls === 1, "none of B's remaining background ticks called render() — only the load's own natural-completion render did — got " + w.__renderCalls);
  assert(w.getVisibleEntries().length === fa.entries.length, "the Filtered view still shows file A's own entries, unaffected by B loading (and finishing) in the background");
  assert(nodeB.entries.length === 60000, "file B finished loading with the full entry count despite the detour through the background");
  assert(typeof nodeB.loadFraction !== "number", "loadFraction is cleared once B finishes loading");
  // Re-queried fresh, not via the earlier rowB reference: flushLoadRender's
  // natural-completion render is a real, full render() (renderTree()
  // included), which tears down and rebuilds every tree row — rowB is
  // stale past this point, same "capture after the structural moment"
  // lesson Group 51 documents.
  const labelB2 = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "huge.log");
  const countB2 = parseInt(labelB2.closest(".tree-row").querySelector(".tree-count").textContent.replace(/\./g, ""), 10);
  assert(countB2 === 60000 && countB2 > countAfterAnotherTick, "file B's row count reflects the full final total once its natural-completion render runs — got " + countB2 + " (was " + countAfterAnotherTick + " mid-load)");
});
