// GROUP 33 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 33 — Bugfix: minimap viewport indicator now covers the LAST shown
   entry's full bar, not just the single x position its exact timestamp
   happens to land at (person-reported via screenshot: "the range indicator
   only runs to the START of the last included bin — it should still include
   this bin"). Root cause: updateMinimapViewportIndicator used
   minimapTsToX(entry.ts) directly for both edges — a continuous, per-moment
   position — while the density bars themselves are drawn per BUCKET
   (bucketOf() in renderTimelineMinimap). An entry landing anywhere other
   than exactly at its bucket's right edge left the highlighted rectangle
   visibly short of that bucket's own bar, making an entry that's actually
   IN the current view look like it sits outside the highlighted range.
   Fixed with a new minimapBarSpan(ts) helper (mirrors bucketOf()'s exact
   formula) giving the bucket's full [left, right) span; the indicator now
   uses .left for the first shown entry and .right for the last.
   ============================================================ */
group(33);
await withApp(async (w, d, T) => {
  section("33. Minimap viewport indicator covers the last shown entry's full bar (bugfix)");
  // Craft exact ts offsets so, with the suite's stubbed 800px container
  // width (bucketCount = round(800/3) = 267, bucket width = 800/267 in px
  // and (tMax-tMin)/267 in ms), the shown entry sits only 500ms into its
  // 10,000ms-wide bucket — close enough to the bucket's LEFT edge that the
  // old raw-position code visibly fell short of the bucket's right edge.
  const anchor = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const line = (offsetMs, level, msg) => {
    const dt = new Date(anchor + offsetMs);
    const p2 = n => String(n).padStart(2, "0"), p3 = n => String(n).padStart(3, "0");
    const ts = `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())},${p3(dt.getMilliseconds())}`;
    return `${ts}\t${level}\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`;
  };
  const lines = [
    line(0, "INFO", "start"),
    line(2000500, "ERROR", "target"), // 500ms into bucket 200 of 267 (bucket width 10,000ms)
    line(2670000, "INFO", "end"),     // anchors tMax so bucketCount * 10,000ms === the file's span exactly
  ];
  const f = await w.addFile("bins.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  // Isolate to the single ERROR entry (mirrors the reported screenshot's
  // "filtered to ERROR" level quick-filter). Pinned to "explicit" mode so the
  // click stays on the classic state.levelFilter path — see GROUP 94 for the
  // new default "auto" tree-node behavior.
  T.levelFilterTreeMode = "explicit";
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  assert(T.currentViewEntries.length === 1 && T.currentViewEntries[0].message === "target",
    "sanity: the level filter isolated the single crafted ERROR entry");

  const targetTs = f.entries[1].ts;
  const naiveX = w.minimapTsToX(targetTs);
  const span = w.minimapBarSpan(targetTs);
  assert(span.right - naiveX > 1,
    "sanity: the crafted timestamp lands closer to its bucket's start than its end (right edge at least 1px past the raw position), got " + (span.right - naiveX).toFixed(2));

  // Split into two rects by a later session (see Group 34) — with exactly
  // one entry shown, both cover the same single bucket, so both should land
  // on its exact bounds.
  for (const id of ["#minimapRenderedRangeRect", "#minimapFullRangeRect"]) {
    const rect = d.querySelector(id);
    assert(!rect.classList.contains("hidden"), id + " is visible");
    const x = parseFloat(rect.getAttribute("x"));
    const width = parseFloat(rect.getAttribute("width"));
    assert(Math.abs(x - span.left) < 0.15, id + "'s left edge matches the shown entry's bucket LEFT edge, got x=" + x + " expected " + span.left.toFixed(1));
    assert(Math.abs((x + width) - span.right) < 0.15,
      id + "'s right edge reaches the shown entry's bucket RIGHT edge — not just its raw timestamp position (the bug) — got right=" + (x + width).toFixed(1) + " expected " + span.right.toFixed(1));
    assert(x + width > naiveX + 1,
      id + " visibly extends past where the old buggy calculation would have stopped, got right=" + (x + width).toFixed(1) + " vs old=" + naiveX.toFixed(1));
  }
});
