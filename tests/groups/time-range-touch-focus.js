// GROUP time-range-touch-focus — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP time-range-touch-focus — no autofocus in the time-range dialog on touch
   Origin: 2026-10-04 (tablet retest). openTimeRangeDialog focused the From input, which
   pops the on-screen keyboard on touch. isCoarsePointer() skips the focus; desktop keeps it.
   ============================================================ */
group("time-range-touch-focus");

for (const coarse of [true, false]) {
  await withApp(async (w, d, T) => {
    section("time-range-touch-focus " + (coarse ? "a. coarse pointer: not focused" : "b. fine pointer: From input focused"));
    const f = await w.addFile("a.log", makeLog(0, 20), () => {});
    w.matchMedia = q => ({ matches: coarse && /pointer:\s*coarse/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    assert(w.isCoarsePointer() === coarse, "isCoarsePointer() follows matchMedia");
    w.openTimeRangeDialog("create", f.id, null);
    assert(!d.getElementById("timeRangeDialog").classList.contains("hidden"), "dialog open");
    const from = d.getElementById("timeRangeFromInput");
    assert(coarse ? d.activeElement !== from : d.activeElement === from, "From input " + (coarse ? "not " : "") + "focused");
  });
}
