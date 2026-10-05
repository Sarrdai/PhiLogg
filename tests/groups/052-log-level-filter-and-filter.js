// GROUP 52 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 52 — Log-level filter and filter creation stay usable (clickable,
   creatable) while the loading file is the active view, even though
   neither the level bar's counts nor a newly created filter's own row
   update live anymore during a load — feature-parity-with-tailing's
   original intent (never blocking the interaction) still holds; only the
   "and shows live progress while you wait" part was removed.
   Origin: this session, person-requested follow-up to Group 51: *"Jetzt
   würde ich aber gerne auch schon während des Ladevorgangs in der Lage
   sein, Log-Level Filter zu bedienen, neue Filter anlegen, etc."* —
   originally (also) gave the level bar's counts and a newly created
   filter's own row live per-tick updates (`updateLevelBarCounts`, and a
   filter-subtree walk inside what was then `updateLoadRowLiveData`), on
   top of proving neither was BLOCKED. Both of those specific live-update
   mechanisms were removed outright later the same session (see Group 50's
   own header) as part of stripping every load-tick visualization back to
   just the loading file's own row: *"Nehme... alle Visualisierungen des
   Ladevorgangs raus."* This group is REWRITTEN to match — DOM identity/
   click-ability coverage (never blocked, never torn down mid-load) is
   unchanged and still the main point; the two "...updates live" assertions
   are flipped to "...does NOT update automatically, only via a real
   render()", the new accurate behavior.
   ============================================================ */
group(52);
await withApp(async (w, d, T) => {
  section("52. Level-filter buttons stay clickable, and filter creation stays usable, while the loading file is the active view (neither auto-updates live anymore)");
  // Pinned to "explicit" mode: this group is about DOM-identity survival
  // across load ticks, not the tree-node feature — see GROUP 94 for that.

  // Monkey-patch renderLevelBar (the full rebuild) to count calls — same
  // injected-script technique used throughout this suite.
  const s = d.createElement("script");
  s.textContent = `
    const __origRenderLevelBar = renderLevelBar;
    renderLevelBar = function() { window.__renderLevelBarCalls = (window.__renderLevelBarCalls||0)+1; return __origRenderLevelBar(); };
  `;
  d.body.appendChild(s);

  // Large enough (15 PARSE_CHUNK_LINES chunks) to stay genuinely mid-parse
  // across a handful of real ticks — same idiom Groups 49-51 use.
  const text = makeLog(0, 60000, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });
  w.__renderLevelBarCalls = 0;
  const donePromise = w.addFile("huge.log", text); // auto-activates
  const newId = T.state.rootIds[T.state.rootIds.length - 1];
  const node = T.state.nodes[newId];
  assert(w.__renderLevelBarCalls === 1, "creating the node's own initial render rebuilds the level bar exactly once — got " + w.__renderLevelBarCalls);

  // Capture the ERROR button right after that one legitimate rebuild —
  // same "capture after the structural moment, not before" lesson Group 51
  // learned the hard way.
  const errBtnBefore = d.querySelector('.level-btn[data-level="ERROR"]');
  assert(errBtnBefore !== null, "sanity: the ERROR level button exists");
  const shownAtStart = parseInt(errBtnBefore.title.match(/[\d.]+$/)[0].replace(/\./g, ""), 10);
  w.__renderLevelBarCalls = 0;

  for (let i = 0; i < 3 && node.entries.length < 60000; i++) await new Promise(r => setTimeout(r, 0));
  assert(node.entries.length > 0 && node.entries.length < 60000, "file is genuinely still mid-parse — got " + node.entries.length + "/60000");
  assert(w.__renderLevelBarCalls === 0, "none of the parse ticks rebuilt the level bar — got " + w.__renderLevelBarCalls);

  const errBtnAfter = d.querySelector('.level-btn[data-level="ERROR"]');
  assert(errBtnAfter === errBtnBefore, "the ERROR level button survives parse ticks as the exact same DOM element (identity preserved)");
  const shownErr = parseInt(errBtnAfter.title.match(/[\d.]+$/)[0].replace(/\./g, ""), 10);
  assert(shownErr === shownAtStart, "the ERROR button's own displayed count does NOT auto-update during ticks anymore (updateLevelBarCounts was removed outright) — still " + shownErr + ", though the file's real ERROR count has grown well past it by now");

  // The real proof: a click on the reference held throughout the ticks
  // still works — if the button had been torn down and replaced at any
  // point, this reference's click listener would be gone.
  fireClick(errBtnBefore, w);
  assert(T.state.levelFilter.has("ERROR"), "a click on the level-filter button (same reference held throughout the ticks) correctly toggles it — no click was lost mid-load");
  // That click triggers a real render() (renderLevelBar() included), which
  // DOES pick up the true current count — same "explicit render still
  // shows live state" rule Group 49/50 establish elsewhere.
  const errBtnAfterClick = d.querySelector('.level-btn[data-level="ERROR"]');
  const shownAfterClick = parseInt(errBtnAfterClick.title.match(/[\d.]+$/)[0].replace(/\./g, ""), 10);
  assert(shownAfterClick > shownErr, "a real render (triggered by the click itself) DOES show the level bar's true current count, proving the earlier staleness was specifically about automatic per-tick updates — got " + shownAfterClick + " (was stuck at " + shownErr + ")");
  fireClick(d.querySelector('.level-btn[data-level="ERROR"]'), w);
  assert(!T.state.levelFilter.has("ERROR"), "sanity: toggled back off, state left clean for what follows");

  // Creating a new filter while the file is STILL loading: never actually
  // blocked (a discrete action, independent of the per-tick update path) —
  // but its own row's count does NOT auto-update afterward anymore either,
  // only the parent file's own row does.
  assert(node.entries.length < 60000, "sanity: still mid-load when the filter below gets created");
  const filterNode = w.createFilterNode(newId, "text", "message");
  T.state.activeId = filterNode.id;
  w.render();
  const countBefore = w.getEntries(filterNode.id).length;
  assert(countBefore > 0 && countBefore < 60000, "sanity: the new filter already matches some of what's loaded so far, not the eventual full 60000 — got " + countBefore);
  const filterRowShownBefore = parseInt(d.querySelector('.tree-row[data-node-id="' + filterNode.id + '"] .tree-count').textContent.replace(/\./g, ""), 10);

  for (let i = 0; i < 3 && node.entries.length < 60000; i++) await new Promise(r => setTimeout(r, 0));
  const filterRow = d.querySelector('.tree-row[data-node-id="' + filterNode.id + '"]');
  assert(filterRow !== null, "the newly created filter's row still exists after further ticks");
  assert(w.getEntries(filterNode.id).length > countBefore, "sanity: the filter's real (live-queried) match count has genuinely grown further while loading continued");
  const filterCountShown = parseInt(filterRow.querySelector(".tree-count").textContent.replace(/\./g, ""), 10);
  assert(filterCountShown === filterRowShownBefore,
    "the new filter's own row count does NOT auto-update during further ticks (only the parent file's own row does) — still " + filterCountShown + ", though its real match count has grown past it");

  await donePromise;
  assert(node.entries.length === 60000, "the file finished loading normally despite the detour through level-filter/filter-creation interaction");
});
