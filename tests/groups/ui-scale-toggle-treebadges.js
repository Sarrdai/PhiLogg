group("ui-scale-toggle-treebadges");
await withApp(async (w, d, T) => {
  section("ui-scale-toggle-treebadges: dialogs size in %, pill toggle has no border, tree Reconnect/load share the hit-badge pill");
  const css = d.querySelector("style").textContent;
  const body = sel => { const m = css.match(new RegExp(sel.replace(/[.:#()\[\]="]/g, "\$&") + "\{([^}]*)\}")); return m && m[1]; };

  for (const sel of [".settings-page-card", ".fw-settings-card", ".te-card", ".fwz-card"]) {
    assert(!/\d+v[hw]/.test(body(sel) || ""), sel + " is not sized in vh/vw (they ignore the root zoom of UI scale)");
  }
  assert(/#app\{[^}]*height:100%/.test(css), "#app fills its parent instead of 100vh");

  const pill = body(".pill-toggle") || "";
  assert(/border:none/.test(pill) && /box-sizing:border-box/.test(pill), ".pill-toggle has no border (ring is an inset shadow, so zoom rounding can't shift the knob)");
  assert(/top:50%/.test(body(".pill-toggle::after") || ""), "pill knob is centered with top:50% + translateY(-50%) (a transform is not pixel-snapped, so the knob height stays equal across rows under fractional zoom)");

  for (const sel of [".folder-watch-reconnect", ".tree-load-badge"]) {
    const b = body(sel) || "";
    assert(/border-radius:9px/.test(b) && /line-height:14px/.test(b) && /font-size:10px/.test(b), sel + " uses the .tree-hit-badge pill metrics");
  }
});
