// GROUP minimap-zoom-indicator — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP minimap-zoom-indicator — a zoomed minimap says so at a glance
   Origin: 2026-10-08 (person-requested). While minimapViewTrail is non-empty
   the minimap shows an accent frame (.zoomed), a "Zoom N % · from–to ⤢ Whole
   file" chip in the meta line, an overview strip with the zoom window as a
   box and edge arrows on the sides the log continues on. Not zoomed: none
   of it. jsdom has no layout; show/hide is read from classes and styles.
   ============================================================ */
group("minimap-zoom-indicator");

await withApp(async (w, d, T) => {
  section("minimap-zoom-indicator a. Not zoomed -> nothing; zoomed -> chip, box, arrows; chip returns");
  const f = await w.addFile("a.log", makeLog(0, 120), () => {}); // 10:00:00 .. 10:01:59, one entry per second
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const e = i => f.entries[i].ts;
  const mini = d.querySelector("#timelineMinimap");
  const meta = d.querySelector("#timelineMinimapMeta");
  const box = d.querySelector("#timelineMinimapOverviewBox");
  const chip = () => meta.querySelector(".minimap-zoom-chip");
  const edgeOn = id => d.querySelector(id).classList.contains("on");

  assert(!chip() && !mini.classList.contains("zoomed"), "whole file: no chip, no .zoomed");
  assert(!edgeOn("#timelineMinimapEdgeL") && !edgeOn("#timelineMinimapEdgeR"), "whole file: no edge arrows");
  assert(w.getComputedStyle(d.querySelector("#timelineMinimapOverview")).display === "none", "whole file: overview strip hidden");

  w.setMinimapView(e(30), e(60));
  assert(mini.classList.contains("zoomed"), "zoomed class set");
  assert(chip() && /^Zoom 2[56] % · 10:00:30–10:01:00\s+⤢ Whole file$/.test(chip().textContent), "chip text: " + (chip() && chip().textContent));
  assert(w.getComputedStyle(d.querySelector("#timelineMinimapOverview")).display === "block", "overview strip visible");
  const l = parseFloat(box.style.left), wd = parseFloat(box.style.width);
  assert(Math.abs(l - 30 / 119 * 100) < 0.1 && Math.abs(wd - 30 / 119 * 100) < 0.1, "box left/width in % of the file: " + box.style.left + " / " + box.style.width);
  assert(edgeOn("#timelineMinimapEdgeL") && edgeOn("#timelineMinimapEdgeR"), "both edge arrows in the middle of the file");

  chip().click();
  assert(T.minimapView.trail.length === 0 && !chip() && !mini.classList.contains("zoomed"), "chip click: whole file, chip gone");

  section("minimap-zoom-indicator b. View at the file's start/end hides that edge arrow");
  w.setMinimapView(e(0), e(30));
  assert(!edgeOn("#timelineMinimapEdgeL") && edgeOn("#timelineMinimapEdgeR"), "start of file: no left arrow, right arrow");
  assert(parseFloat(box.style.left) === 0, "box starts at 0 %");
  w.minimapViewReset();
  w.setMinimapView(e(90), e(119));
  assert(edgeOn("#timelineMinimapEdgeL") && !edgeOn("#timelineMinimapEdgeR"), "end of file: left arrow, no right arrow");

  section("minimap-zoom-indicator c. Percent label below 1 %");
  w.minimapViewReset();
  const g = await w.addFile("b.log", makeLog(0, 4000), () => {});
  T.state.activeId = g.id;
  w.render();
  w.setMinimapView(g.entries[100].ts, g.entries[100].ts + 2000);
  assert(chip() && /^Zoom <1 % /.test(chip().textContent), "chip says <1 %: " + (chip() && chip().textContent));
});
