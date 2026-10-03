// GROUP responsive-touch — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP responsive-touch — 44px touch targets in the phone + compact tiers
   Origin: 2026-10-03 (touch targets). Every @media (pointer:coarse) rule is
   scoped to body.layout-phone / body.layout-compact, so the desktop tier
   (also on touch laptops) is untouched; the long-press helper is compact-only.
   jsdom has no layout: sizes are asserted on the CSS text, not measured.
   ============================================================ */
group("responsive-touch");

const setWidthT = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };

await withApp(async (w, d, T) => {
  section("responsive-touch a. Desktop guard: every pointer:coarse selector is tier-scoped");
  const coarse = [];
  const walk = (rules, inCoarse) => {
    for (const r of rules) {
      if (r.media) walk(r.cssRules, inCoarse || /pointer:\s*coarse/.test(r.media.mediaText || r.conditionText || ""));
      else if (r.selectorText && inCoarse) coarse.push(r);
    }
  };
  for (const sheet of d.styleSheets) walk(sheet.cssRules, false);
  assert(coarse.length > 10, "found the coarse-pointer rules, got " + coarse.length);
  const bad = [];
  for (const r of coarse) {
    for (const sel of r.selectorText.split(",").map(x => x.trim())) {
      if (!/^body\.layout-(phone|compact)\s/.test(sel)) bad.push(sel);
    }
  }
  assert(bad.length === 0, "all coarse selectors scoped to a tier class, offenders: " + bad.slice(0, 5).join(" | "));

  section("responsive-touch b. The block carries the 44px sizes");
  const css = coarse.map(r => r.cssText).join("\n");
  const has = (sel, decl) => coarse.some(r => r.selectorText.includes(sel) && r.style.cssText.replace(/\s/g, "").includes(decl));
  assert(has("body.layout-phone .toolbar-icon-btn", "width:44px") && has("body.layout-compact .panel-toggle-btn", "height:44px"), "header icon buttons 44x44");
  assert(has("body.layout-phone .level-btn", "height:44px") && has("body.layout-compact .level-btn", "width:44px"), "level pills / circles 44");
  assert(has("body.layout-phone .detail-phone-btn", "width:44px") && has("body.layout-phone #settingsClose", "height:44px"), "sheet buttons + settings close 44");
  assert(has("body.layout-phone .view-tab", "height:44px") && has("body.layout-compact .view-tab", "height:44px")
    && has("body.layout-phone #detailViewTabs .view-tab", "height:44px"), "the .view-tab buttons themselves are 44 tall");
  assert(has("body.layout-compact .view-tabs", "height:auto") && has("body.layout-phone #detailViewTabs", "height:auto"), "...and their containers grow");
  assert(has("body.layout-phone #btnDrawer", "width:44px") && has("body.layout-phone #btnFindPhone", "height:44px")
    && has("body.layout-phone #btnSettings", "height:44px") && has("body.layout-compact #btnDrawer", "height:44px"), "id-based header buttons 44 (beats the phone shell's 40)");
  assert(has("body.layout-compact #btnOpen", "width:44px") && has("body.layout-phone #btnSave", "height:44px")
    && has("body.layout-compact #sidebarToolbar .stb-btn", "height:44px"), "drawer header + filter-toolbar buttons 44");
  // No id-based sizing rule in the phone shell may out-rank the coarse block: every such 40px rule needs a later coarse override.
  const shell40 = [];
  for (const sheet of d.styleSheets) for (const r of sheet.cssRules) {
    if (r.selectorText && /body\.layout-phone\s+#/.test(r.selectorText) && !/#detailGrab/.test(r.selectorText) && /(?:^|[;\s])(width|height|min-height):\s*40px/.test(r.style.cssText)) shell40.push(r.selectorText);
  }
  const uncovered = shell40.filter(sel => !sel.split(",").every(x => coarse.some(r => r.selectorText.split(",").map(y => y.trim()).includes(x.trim()))));
  assert(uncovered.length === 0, "every phone-shell 40px id rule has a same-selector coarse override, missing: " + uncovered.join(" | "));
  assert(has("body.layout-compact #btnLibrary", "height:44px"), "#btnLibrary 44 in compact");
  assert(has(".tree-row", "min-height:48px"), "tree rows 48");
  assert(has("body.layout-phone .tree-swatch", "pointer-events:none"), "phone swatch is display-only");
  assert(has("body.layout-compact .tree-row.active .tree-mute", "width:44px"), "compact: mute/del shown on the active row");
  assert(has("body.layout-phone .tree-mute", "display:none"), "phone: mute/del hidden");
  assert(has("#settingsDialog .pill-toggle", "width:52px") && has("#settingsDialog .accent-swatch", "width:32px"), "pill toggle 52x32, accent swatch 32");
  assert(has("#settingsDialog .settings-nav-item", "min-height:44px"), "settings nav 44");
  assert(has("#settingsDialog .stepper .stepper-btn", "width:44px"), "steppers 44");
  assert(!/40px/.test(css), "no 40px target left in the coarse block");
});

await withApp(async (w, d, T) => {
  section("responsive-touch c. Long-press: compact only");
  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  T.state.activeId = f.id;
  w.render();
  const timers = [];
  let nextId = 1;
  w.setTimeout = (fn, ms) => { const t = { id: nextId++, fn, ms, cleared: false }; timers.push(t); return t.id; };
  w.clearTimeout = id => { const t = timers.find(x => x.id === id); if (t) t.cleared = true; };
  let menus = [];
  d.addEventListener("contextmenu", ev => { if (!ev.isTrusted) menus.push(ev); });
  const press = () => {
    timers.length = 0; menus = [];
    const target = d.querySelector("#tree .tree-row");
    const ev = new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 40, clientY: 50 });
    Object.defineProperty(ev, "pointerType", { value: "touch" });
    Object.defineProperty(ev, "isPrimary", { value: true });
    target.dispatchEvent(ev);
    const t = timers.filter(x => x.ms === 500);
    t.release = () => target.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true }));
    return t;
  };
  setWidthT(w, 820);
  let t = press();
  assert(t.length === 1, "compact: touch press arms the timer");
  t[0].fn();
  assert(menus.length === 1, "compact: fires one contextmenu");
  t.release();
  setWidthT(w, 1440);
  t = press();
  assert(t.length === 0 && menus.length === 0, "desktop: no timer, no contextmenu");
  t.release();
  setWidthT(w, 390);
  t = press();
  assert(t.length === 0 && menus.length === 0, "phone: no timer, no contextmenu");
});
