// GROUP 49 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 49 — File usable while it's still loading
   Origin: this session, person-requested ("die Datei... direkt beim
   Ladevorgang bedienbar machen, ... die Minimap fortlaufend zu befüllen").

   createFileNode (see philogg.html) now creates the real file node and
   inserts it into the tree BEFORE any text is read, and parseLogTextAsync
   appends completed entries onto node.entries chunk by chunk instead of
   only handing them all over once the whole file is parsed. This group
   proves that data is genuinely there and correctly reflected by an
   EXPLICIT render() mid-parse (a real click, not an automatic tick — a
   load tick's own automatic updates, narrowed to just the loading row, are
   Group 50/51/52's job) — the tree row, table, level bar and minimap all
   show the true mid-parse state once asked to, the same way an already-open
   tailed file does (Group 12), just driven by the initial parse instead of
   a poll. Unlike tail auto-follow, the view deliberately does NOT scroll to
   chase the growing content — renderTable's existing "start at the top of a
   new list" default applies unchanged, so the Filtered view just stays
   where it is while the file streams in.
   ============================================================ */
group(49);
await withApp(async (w, d, T) => {
  section("49. A large file streams into the tree/table/level-bar/minimap live while it's still parsing, without auto-scrolling");
  // Force multiple PARSE_CHUNK_LINES (4000) chunks so the parse actually
  // yields to the event loop more than once mid-parse — a small
  // single-chunk log (as every other fixture in this suite uses) resolves
  // in one hop and can't exercise this. Goes through addFile (text already
  // in memory) rather than loadFileDescriptors/File/FileReader: the
  // FileReader-backed read path is already covered by Group 30d/48b, and
  // its own timing is real-I/O-dependent and would make this test racy —
  // addFile's own synchronous prefix (createFileNode, then straight into
  // parseLogTextAsync's first chunk) is what actually makes the file
  // usable while loading, and is deterministic to catch mid-parse.
  const text = makeLog(0, 9000, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });

  const before = new Set(T.state.rootIds);
  const donePromise = w.addFile("huge.log", text); // not awaited yet — inspect mid-parse state below
  const newId = T.state.rootIds.find(id => !before.has(id));
  assert(newId, "the file is a real root node before parsing has even started (createFileNode runs synchronously, before addFile's first await)");
  const node = T.state.nodes[newId];
  T.state.activeId = newId;
  w.render();

  // Wait for exactly one parse chunk (4000 lines) to land, but not for the
  // whole 9000-line parse to finish — the first PARSE_CHUNK_LINES yield was
  // already scheduled by the synchronous prefix above, ahead of this tick,
  // so it resolves (and the loop runs synchronously up to the NEXT chunk
  // boundary) before this awaits.
  await new Promise(r => setTimeout(r, 0));
  const midCount = node.entries.length;
  assert(midCount > 0 && midCount < 9000,
    "entries stream into node.entries mid-parse instead of only appearing once the whole file is done — got " + midCount + "/9000");

  // The tree row's own count reflects the growing entries live (renderNode
  // reads getEntries(id).length, same as any other file node). Forced via an
  // explicit render() here rather than waiting on the internal rAF-batched
  // one (scheduleLoadRender) to actually fire — Group 47 already covers that
  // batching mechanism itself; this checks the DATA it would render is
  // already correct, deterministically.
  w.render();
  const label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "huge.log");
  const countEl = label.closest(".tree-row").querySelector(".tree-count");
  const treeCount = parseInt(countEl.textContent.replace(/\./g, ""), 10);
  assert(treeCount === node.entries.length, "the tree row's own entry count reflects the mid-parse entries, not zero or the eventual 9000 total — got " + countEl.textContent);

  // The level bar's per-level counts are live too, not stuck at whatever was
  // cached at the very first (still-empty) render — this is exactly the
  // node._levelCounts staleness invalidateCachesForRoots(node.id) exists to
  // prevent (see scheduleLoadRender/flushLoadRender's own comment).
  const levelCounts = w.getLevelCounts(newId);
  const midErrorCount = levelCounts.ERROR || 0;
  assert(midErrorCount > 0 && midErrorCount < 1800, // 9000/5 ERROR entries total
    "level-bar counts reflect the mid-parse entries live, not a stale empty/cached snapshot — got ERROR=" + midErrorCount);

  // The table/minimap are usable, not empty, mid-parse — same active-node
  // pipeline any already-loaded file uses.
  const visibleMid = w.getVisibleEntries();
  assert(visibleMid.length === node.entries.length, "the Filtered view already shows the mid-parse entries instead of an empty table");
  assert(d.querySelector("#emptyState").style.display === "none", "the empty-state placeholder is not shown while entries are already streaming in");

  // No auto-scroll while it streams in: renderTable's default "start back
  // at the top of the list" behavior applies to every incremental render
  // exactly as it would to any other node switch — nothing in the load path
  // sets pendingTableScroll to "bottom" the way tail auto-follow does.
  assert(d.querySelector("#tableBody").scrollTop === 0,
    "the Filtered view stays pinned at the top while the file streams in, instead of jumping to follow the growing content like tail auto-follow does");

  await donePromise;
  assert(node.entries.length === 9000, "parsing finished with the full entry count");
  assert(typeof node.loadFraction !== "number", "loadFraction is cleared once loading finishes");
  const finalCounts = w.getLevelCounts(newId);
  assert(finalCounts.ERROR === 1800 && finalCounts.INFO === 7200,
    "level-bar counts are correct once loading finishes (not left stuck at a mid-parse snapshot) — got ERROR=" + finalCounts.ERROR + " INFO=" + finalCounts.INFO);
});
