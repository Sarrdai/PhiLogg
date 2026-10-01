// GROUP 254 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 254 — REWRITTEN (this session, person-requested: "Rendern erst
   wenn vollständig geladen soll für alles gelten"). Originally covered a
   narrow exception (updateLiveGrowingTotal) that kept the log view's
   scrollbar total (#tableSpacer's height) tracking an actively-loading
   active node's live entry count on every load tick, to fix a stale
   scrollbar on a large actively-growing merge. That exception is now
   removed outright — it violated the broader "nothing renders until fully
   loaded" rule this whole area exists to enforce (see GROUP 50's header),
   and stacked with the meta-format per-stream focus flicker (GROUP 245/
   246) it was the second of two ways partial content leaked out mid-load.
   The scrollbar goes back to reflecting a stale total until the load's
   natural-completion render fires, same as every other part of the view
   during a load — an accepted tradeoff, not a regression.
   ============================================================ */
group(254);
await withApp(async (w, d, T) => {
  section("254a. #tableSpacer's height stays stale during a load tick, even for the active node (updateLiveGrowingTotal removed)");
  const fa = await w.addFile("a.log", makeLog(0, 5));
  T.state.activeId = fa.id;
  w.render();
  const spacerBefore = parseInt(d.querySelector("#tableSpacer").style.height, 10);
  assert(spacerBefore === fa.entries.length * T.ROW_HEIGHT + 22, "sanity: spacer matches the real render's entry count");

  // Simulate a load tick growing entries in place, same shape
  // fillMergedEntries's own chunk loop uses.
  for (let i = 0; i < 50; i++) fa.entries.push({ id: "extra-" + i, ts: Date.now(), level: "INFO", message: "extra", formatId: fa.formatId });
  w.scheduleLoadRender(fa.id);

  const spacerAfter = parseInt(d.querySelector("#tableSpacer").style.height, 10);
  assert(spacerAfter === spacerBefore,
    "the spacer height stays at its last real-render value after a scheduleLoadRender tick, not the new live entry count — got " + spacerAfter);
});

await withApp(async (w, d, T) => {
  section("254b. #tableSpacer stays stale for a background (non-active) node's load tick too (unchanged invariant)");
  const fa = await w.addFile("a.log", makeLog(0, 5));
  const fb = await w.addFile("b.log", makeLog(0, 5));
  T.state.activeId = fa.id;
  w.render();
  const spacerBefore = parseInt(d.querySelector("#tableSpacer").style.height, 10);

  for (let i = 0; i < 50; i++) fb.entries.push({ id: "extra-" + i, ts: Date.now(), level: "INFO", message: "extra", formatId: fb.formatId });
  w.scheduleLoadRender(fb.id); // fb is not active — should not touch the spacer

  const spacerAfter = parseInt(d.querySelector("#tableSpacer").style.height, 10);
  assert(spacerAfter === spacerBefore, "the spacer is untouched by a background (non-active) node's load tick");
});

await withApp(async (w, d, T) => {
  section("254c. #tableSpacer stays stale during a load tick even with a level filter narrowing the active view (unchanged invariant)");
  const fa = await w.addFile("a.log", makeLog(0, 5));
  T.state.activeId = fa.id;
  T.state.levelFilter = new Set(["info"]); // narrows the view
  w.render();
  const spacerBefore = parseInt(d.querySelector("#tableSpacer").style.height, 10);

  for (let i = 0; i < 50; i++) fa.entries.push({ id: "extra-" + i, ts: Date.now(), level: "INFO", message: "extra", formatId: fa.formatId });
  w.scheduleLoadRender(fa.id);

  const spacerAfter = parseInt(d.querySelector("#tableSpacer").style.height, 10);
  assert(spacerAfter === spacerBefore, "with a level filter narrowing the view, the spacer stays at its last real-render value");
});
