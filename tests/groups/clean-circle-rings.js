// GROUP clean-circle-rings — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): every harness helper is in scope.

/* ============================================================
   GROUP clean-circle-rings — circular elements draw their rings as inset
   box-shadows / outlines, not as a border next to a background
   Origin: 2026-10-02. A border plus a background on one curved edge are two
   separately antialiased layers (colour fringe at the seam, worse with
   filter:brightness on hover); 1.5px rings blur at 100%/125% scaling; the
   dashed 13px swatch looked broken; hover rings touched the circle. Now:
   .level-btn has no border (ring = inset box-shadow, hover = tinted fill),
   .tree-swatch is borderless with an inset hairline (empty = solid ring),
   swatch hover rings are 2px outlines with a 2px gap, and the status dot /
   rail marker use integer ring widths.
   ============================================================ */
group("clean-circle-rings");
await withApp(async (w, d, T) => {
  section("clean-circle-rings a. level buttons: no border, ring as box-shadow, solid fill when checked, no brightness filter");
  T.levelFilterTreeMode = "explicit";
  const f = await w.addFile("a.log", makeLog(0, 8, { levels: ["ERROR", "ERROR", "WARN", "INFO", "INFO", "INFO", "DEBUG", "DEBUG"] }), () => {});
  T.state.activeId = f.id;
  w.render();
  const cs = el => w.getComputedStyle(el);
  const css = d.querySelector("style").textContent;
  const rule = sel => { const m = css.match(new RegExp(sel.replace(/[.:#()]/g, "\$&") + "\{[^}]*\}")); return m ? m[0] : ""; };

  let btn = d.querySelector('.level-btn[data-level="ERROR"]');
  assert(parseFloat(cs(btn).borderTopWidth) === 0, "unchecked level button has 0 border width, got " + cs(btn).borderTopWidth);
  assert(rule(".level-btn.lvl-error").includes("box-shadow:inset 0 0 0 2px var(--level-error)"), "unchecked ERROR ring is an inset 2px box-shadow");
  assert(cs(btn).backgroundColor === "transparent" || cs(btn).backgroundColor === "rgba(0, 0, 0, 0)", "unchecked fill is transparent, got " + cs(btn).backgroundColor);
  fireClick(btn, w);
  btn = d.querySelector('.level-btn[data-level="ERROR"]');
  assert(btn.classList.contains("active"), "sanity: ERROR checked");
  assert(parseFloat(cs(btn).borderTopWidth) === 0, "checked level button has 0 border width");
  assert(rule(".level-btn.active.lvl-error").includes("background:var(--level-error)"), "checked ERROR is a solid fill");
  const fl = cs(btn).filter;
  assert(!fl || fl === "none", "checked level button has no filter, got " + fl);
  assert(!/\.level-btn:hover\{[^}]*filter/.test(css), "no filter:brightness hover on level buttons");
  assert(rule(".level-btn.lvl-error:hover").includes("color-mix(in srgb, var(--level-error) 18%, transparent)"), "unchecked hover tints the fill");
  assert(rule(".level-btn.active.lvl-error:hover").includes("85%, #fff"), "checked hover lightens the fill");
  assert(!/\.level-btn\.lvl-[a-z0-9-]+\{border-color/.test(css), "no per-level border-color rules remain");

  section("clean-circle-rings b. swatches: no dashed border, solid empty ring, outline hover with a gap");
  assert(/\.tree-swatch\{[^}]*border:0/.test(css), ".tree-swatch is borderless");
  assert(!/\.tree-swatch[^{]*\{[^}]*dashed/.test(css), "no dashed style on .tree-swatch");
  assert(rule(".tree-swatch.empty").includes("box-shadow:inset 0 0 0 1px var(--text-tertiary)"), "empty swatch = solid 1px inset ring");
  for (const sel of [".tree-swatch:hover", ".accent-swatch:hover", ".accent-swatch.active", ".format-level-swatch:hover", ".cp-preset:hover"]) {
    const r = rule(sel);
    assert(r.includes("outline:2px solid") && r.includes("outline-offset:2px") && !r.includes("box-shadow"), sel + " uses a 2px outline with a 2px gap, got " + r);
  }
  const sw = d.createElement("button");
  sw.className = "tree-swatch empty";
  d.body.appendChild(sw);
  assert(parseFloat(cs(sw).borderTopWidth) === 0 && cs(sw).borderTopStyle !== "dashed", "empty swatch computed: no border, not dashed");
  sw.remove();

  section("clean-circle-rings c. no fractional ring widths on circular elements");
  for (const sel of [".sidebar-rail-marker-dot", ".folder-watch-dot", ".folder-watch-icon.ping-once::after"]) {
    const m = css.match(new RegExp(sel.replace(/[.:#()]/g, "\$&") + "\{[^}]*\}"));
    assert(m && !/1\.5px/.test(m[0]), sel + " has no 1.5px ring, got " + (m && m[0]));
  }
});
