// GROUP design-polish-p11 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p11 — minimap and stat line (E1)
   Origin: 2026-10-10 design polish round, package P11.
   Overlay bars are stacked per level in proportion to the bucket's counts (quiet levels muted,
   WARN and worse full strength), burst flags stay inside the strip, the stat line has UI-font
   labels, mono values, color squares for the level counts and the Bursts chip as its own pill.
   jsdom has no layout: the stubbed minimap is 800 px wide, offsetWidth is stubbed where needed.
   ============================================================ */
group("design-polish-p11");

if (groupSelected()) {
  const simFile = async (w, scenarios, entries, seed) => {
    const [file] = LOGSIM.generateToStrings({ scenarios, entries, seed });
    return w.addFile(file.name, file.text, () => {});
  };

  await withApp(async (w, d, T) => {
    section("design-polish-p11 a. per-level counts per bucket and stacked heights");
    const f = await simFile(w, ["basic", "bursts"], 3000, 7);
    T.state.activeId = f.id; T.state.sortColumn = null; w.render();
    const R = T.minimapRanks, lv = T.minimapOvLevels, ov = T.minimapBars.ov, n = T.minimapBucketCount;
    assert(lv.length === n * R, "one count per bucket and rank: " + lv.length);
    let total = 0, mixed = 0;
    for (let b = 0; b < n; b++) {
      let sum = 0, kinds = 0;
      for (let r = 0; r < R; r++) { sum += lv[b * R + r]; if (lv[b * R + r]) kinds++; }
      assert(sum === ov[b], "bucket " + b + ": level counts add up to the overlay count (" + sum + " vs " + ov[b] + ")");
      total += sum; if (kinds > 1) mixed++;
    }
    assert(total === f.entries.length && mixed > 0, "all entries counted once, some buckets mix levels: " + mixed);
    // the per-entry path (a filtered view) gives the same counts as the aggregate path for a whole-file node
    const all = w.createFilterNode(f.id, "text", "");
    const before = Array.from(lv);
    T.state.activeId = all.id; w.render();
    const viaEntries = T.minimapOvLevels;
    if (all.entries && all.entries.length === f.entries.length) assert(Array.from(viaEntries).join() === before.join(), "entry pass equals aggregate pass");
    T.state.activeId = f.id; w.render();

    // stacked rects of a bucket with several levels
    // one <path> per level, a sub-path "M x y h w v hgt h-w z" per bucket segment
    const rects = [];
    d.querySelectorAll("#timelineMinimapSvg .minimap-ov-bar").forEach(p => {
      for (const m of p.getAttribute("d").matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h/g)) rects.push({ cls: p.getAttribute("class"), x: +m[1], y: +m[2], h: +m[4] });
    });
    assert(d.querySelectorAll("#timelineMinimapSvg .minimap-ov-bar").length <= R, "at most one path per level, not an element per segment");
    const xOf = r => r.x;
    const b = Array.from({ length: n }, (_, i) => i).find(i => { let k = 0; for (let r = 0; r < R; r++) if (lv[i * R + r]) k++; return k >= 3; });
    assert(b !== undefined, "a bucket with three or more levels exists");
    const barW = T.minimapWidth / n;
    const seg = rects.filter(r => Math.abs(xOf(r) - b * barW) < 0.06).sort((p, q) => q.y - p.y);
    const H = +d.querySelector("#timelineMinimapSvg").getAttribute("viewBox").split(" ")[3];
    const hs = seg.map(r => r.h), ys = seg.map(r => r.y);
    const sumH = hs.reduce((a, c) => a + c, 0);
    assert(seg.length >= 3, "one rect per level present: " + seg.length);
    assert(Math.abs(ys[0] - (H - hs[0])) < 0.11 && ys.every((y, i) => i === 0 || Math.abs(y - (ys[i - 1] - hs[i])) < 0.2), "segments stack on each other from the bottom");
    assert(Math.abs(ys[seg.length - 1] - (H - sumH)) < 0.3, "stack top = bottom - sum of heights");
    const ranksPresent = []; for (let r = R - 1; r >= 0; r--) if (lv[b * R + r]) ranksPresent.push(r);
    assert(seg.map(r => r.cls).join() === ranksPresent.map(r => "minimap-ov-bar " + w.minimapLevelClass(r)).join(), "least severe at the bottom, most severe on top");
    // proportional (segments that are not min-clamped)
    ranksPresent.forEach((r, i) => {
      if (r <= 2) return;
      assert(Math.abs(hs[i] / sumH - lv[b * R + r] / ov[b]) < 0.03, "rank " + r + " height share " + (hs[i] / sumH).toFixed(3) + " vs count share " + (lv[b * R + r] / ov[b]).toFixed(3));
    });
    const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
    assert(/\.minimap-ov-bar\.minimap-lvl-info\{fill:color-mix\(in srgb, var\(--level-info\) \d+%, var\(--bg-app\)\)/.test(css), "INFO is muted via color-mix");
    assert(/\.minimap-ov-bar\.minimap-lvl-debug\{fill:color-mix/.test(css) && /\.minimap-ov-bar\.minimap-lvl-trace\{fill:color-mix/.test(css) && /\.minimap-ov-bar\.minimap-lvl-other\{fill:color-mix/.test(css), "DEBUG, TRACE and Other are muted too");
    assert(!/\.minimap-ov-bar\.minimap-lvl-(error|warn|fatal)\{/.test(css), "WARN, ERROR and FATAL keep their full-strength fill");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("design-polish-p11 b. a lone error in a busy bucket keeps a visible segment");
    const f = await simFile(w, ["basic"], 2000, 3);
    T.state.activeId = f.id; w.render();
    const err = d.querySelectorAll("#timelineMinimapSvg .minimap-lvl-error, #timelineMinimapSvg .minimap-lvl-warn, #timelineMinimapSvg .minimap-lvl-fatal");
    const hs = [...err].flatMap(p => [...p.getAttribute("d").matchAll(/v([\d.]+)h/g)].map(m => +m[1]));
    assert(hs.length > 0 && hs.every(h => h >= 1), "WARN-or-worse segments are at least 1 px high (" + hs.length + " segments)");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("design-polish-p11 c. burst flags stay inside the strip at both edges");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    T.state.activeId = f.id; T.state.sortColumn = null; w.render();
    Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return this.classList && this.classList.contains("minimap-burst") ? 40 : 0; } });
    const bursts = w.analysisTimeline(f.entries).bursts;
    const W = T.minimapWidth;
    const flags = () => [...d.querySelectorAll("#minimapBursts .minimap-burst")];
    let b = bursts[0];
    w.setMinimapView(b.from - 100, b.from + 30000);
    let fl = flags().find(x => x.dataset.burst !== undefined && Math.abs(parseFloat(x.dataset.x) - (w.minimapTsToX(b.from) + w.minimapTsToX(b.to)) / 2) < 0.2);
    assert(fl, "the left-edge burst is shown");
    assert(parseFloat(fl.dataset.x) < 20, "true x is near the left edge: " + fl.dataset.x);
    assert(parseFloat(fl.style.left) === 20, "flag shifted in so it starts at 0: " + fl.style.left);
    let stem = [...d.querySelectorAll("#minimapBursts .minimap-burst-stem")].find(s => Math.abs(parseFloat(s.style.left) - parseFloat(fl.dataset.x)) < 0.06);
    assert(stem, "the stem stays at the true x");
    b = bursts[bursts.length - 1];
    w.setMinimapView(b.to - 30000, b.to + 100);
    fl = flags().find(x => Math.abs(parseFloat(x.dataset.x) - (w.minimapTsToX(b.from) + w.minimapTsToX(b.to)) / 2) < 0.2);
    assert(fl && parseFloat(fl.dataset.x) > W - 20, "true x near the right edge: " + (fl && fl.dataset.x));
    assert(parseFloat(fl.style.left) === W - 20, "flag shifted in so it ends at the strip's right edge: " + fl.style.left + " vs " + (W - 20));
    flags().forEach(x => { const l = parseFloat(x.style.left); assert(l - 20 >= -0.01 && l + 20 <= W + 0.01, "every flag fully inside: " + l); });
    delete w.HTMLElement.prototype.offsetWidth;
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("design-polish-p11 d. stat line: UI-font labels, mono values, color squares, Bursts pill");
    const f = await simFile(w, ["bursts", "basic", "motion"], 6000, 7);
    T.state.activeId = f.id; w.render();
    const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
    assert(/#timelineMinimapMeta\{[^}]*font-family:var\(--font-ui\)/.test(css), "labels use the UI font");
    assert(/#timelineMinimapMeta b\{[^}]*var\(--font-mono\)/.test(css), "values are mono");
    const meta = d.querySelector("#timelineMinimapMeta");
    assert([...meta.querySelectorAll(".minimap-meta-rest > span:not(.minimap-meta-level) b")].length === 3, "Start, End, Duration values are <b>");
    assert(!/·/.test(meta.textContent), "no dot separators, got " + meta.textContent);
    const counts = w.getLevelCounts(f.id);
    const segs = [...meta.querySelectorAll(".minimap-meta-level")];
    assert(segs.length > 0, "level segments present");
    segs.forEach(s => {
      const lvl = s.dataset.level, sq = s.querySelector("i.minimap-meta-sq");
      assert(sq && sq.getAttribute("style").includes("background:" + (w.levelColorVar(lvl) || "var(--text-secondary)")), lvl + ": color square in the level color");
      assert(s.querySelector("b").textContent === (counts[lvl] || 0).toLocaleString("de-DE"), lvl + ": count in a value element");
      assert(!/^[A-Z] \d/.test(s.textContent), lvl + ": no letter prefix, got " + s.textContent);
    });
    assert(/\.minimap-meta-sq\{[^}]*width:7px; height:7px; border-radius:2px/.test(css), "squares are 7px with 2px radius");
    assert(/\.minimap-burst-chip\{[^}]*border-radius:999px/.test(css) && /\.minimap-burst-chip\{[^}]*var\(--font-ui\)/.test(css), "Bursts chip is a UI-font pill");
    assert(/\.minimap-burst-chip\[aria-pressed="true"\]\{[^}]*var\(--accent-soft\)/.test(css), "pressed pill is filled with accent-soft");
    const pr = +(css.match(/has-burst-chip #timelineMinimapMeta\{padding-right:(\d+)px/) || [])[1];
    assert(pr >= 80, "the stat line reserves room so the pill never touches it: " + pr);
  }, { indexedDB: new IDBFactory() });
}
