// GROUP toolbar-labels-split-settings — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP toolbar-labels-split-settings — four label settings, group-wise wrap
   Origin: 2026-10-08 (round 2). The two label settings became four:
   Files & Filters toolbar (#sidebarToolbar), Level labels (#levelBar +
   "Add level filter"), Filter toolbar (the remaining #viewBar buttons) and
   View toolbar, each Off | On hover | Inline (renamed from Never/Always). #viewBar wraps group-wise (flex-wrap, 6px row-gap) and
   hides separators left at a line start/end.
   ============================================================ */
group("toolbar-labels-split-settings");
await withApp(async (w, d, T) => {
  section("toolbar-labels-split-settings a. Each select drives only its own body class + key");
  const defs = [
    ["settingsSidebarToolbarLabels", "philogg-sidebar-toolbar-labels", "sidebar-toolbar-labels"],
    ["settingsLevelLabels", "philogg-level-labels", "level-labels"],
    ["settingsFilterToolbarLabels", "philogg-filter-toolbar-labels", "filter-toolbar-labels"],
    ["settingsViewToolbarLabels", "philogg-view-toolbar-labels", "view-toolbar-labels"],
  ];
  const set = (id, v) => { const s = d.getElementById(id); s.value = v; s.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const cls = p => ["inline", "off"].filter(m => d.body.classList.contains(p + "-" + m));
  defs.forEach(([id, key, prefix]) => {
    set(id, "inline");
    assert(w.localStorage.getItem(key) === "inline" && cls(prefix).join() === "inline", prefix + ": inline stored + class");
    defs.filter(x => x[2] !== prefix).forEach(o => assert(cls(o[2]).length === 0, prefix + " does not touch " + o[2]));
    set(id, "off");
    assert(w.localStorage.getItem(key) === "off" && cls(prefix).join() === "off", prefix + ": off");
    set(id, "hover");
    assert(w.localStorage.getItem(key) === "hover" && cls(prefix).length === 0, prefix + ": hover = no class");
  });
  const labels = d.querySelectorAll("#settingsSidebarToolbarLabels, #settingsLevelLabels");
  assert(labels.length === 2, "the two new selects exist in Settings");

  section("toolbar-labels-split-settings b. Button kinds map to their own setting (markup classes)");
  assert(d.querySelector("#btnApplyLevelToTree").classList.contains("level-apply"), "Add level filter carries .level-apply");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 200, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const sb = d.querySelectorAll("#sidebarToolbar .row-action-btn");
  assert(sb.length > 0 && [...sb].every(b => b.classList.contains("sidebar-btn") && b.classList.contains("rect")), "every #sidebarToolbar button is .sidebar-btn.rect");
  assert(d.querySelectorAll('[data-row-actions="viewbar"] .row-action-btn.sidebar-btn').length === 0, "Filter-Toolbar buttons are not sidebar buttons");

  section("toolbar-labels-split-settings c. CSS keyed on the right setting");
  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  const has = (selRe, cssRe) => rules.some(r => selRe.test(r.selectorText) && (!cssRe || cssRe.test(r.cssText)));
  assert(has(/body\.level-labels-inline:not\(\.layout-phone\) \.level-btn/, /padding/), "level Inline pill padding follows level-labels");
  assert(!rules.some(r => r.selectorText.split(",").some(p => /filter-toolbar-labels-inline/.test(p) && /\.level-btn(?!\))/.test(p) && !/:not\(\.level-btn\)/.test(p))), "no level rule is keyed on filter-toolbar-labels any more");
  assert(has(/body\.hover-descriptions-off\.level-labels-off \.level-btn \.row-action-label/, /display:\s*none/), "level Off (descriptions off) hides the floating card");
  assert(has(/body:not\(\.layout-phone\):not\(\.level-labels-inline\) \.level-btn \.level-count/), "in-circle count shows unless level labels are Inline");
  assert(has(/body\.sidebar-toolbar-labels-inline \.sidebar-btn/), "sidebar Inline rule");
  assert(has(/body\.hover-descriptions-off\.sidebar-toolbar-labels-off \.sidebar-btn \.row-action-label/, /display:\s*none/), "sidebar Off rule");
  assert(has(/body\.filter-toolbar-labels-inline \.row-action-btn:not\(\.rect\):not\(\.level-btn\):not\(\.level-apply\)/), "filter Inline excludes level + sidebar buttons");
  assert(has(/body\.view-toolbar-labels-inline \.row-action-btn\.rect:not\(\.sidebar-btn\)/), "view Inline excludes sidebar buttons");

  section("toolbar-labels-split-settings d. #viewBar wraps group-wise with a 6px row gap");
  const cs = el => w.getComputedStyle(el);
  const vb = d.querySelector("#viewBar");
  assert(cs(vb).display === "flex" && cs(vb).flexWrap === "wrap", "#viewBar: wrapping flex row");
  assert(cs(vb).rowGap === "6px", "row-gap 6px, got " + cs(vb).rowGap);
  const grp = d.querySelector('#vbAddFilter > [data-row-actions="viewbar"]');
  assert(cs(d.querySelector("#vbAddFilter")).flexShrink === "0" && cs(grp).flexWrap === "nowrap", "an action group is non-breaking (flex:none, nowrap row; see GROUP label-captions)");
  assert(has(/^#viewBar \.row-actions$/, /gap:\s*4px/), "inside-group gap 4px (CSS rule)");
  assert(cs(d.querySelector("#vbView")).flexShrink === "0", "the view tabs group never breaks apart");
  assert(has(/^#sidebarToolbar$/, /row-gap:\s*6px|gap:\s*6px 2px/), "#sidebarToolbar has the 6px row gap");

  section("toolbar-labels-split-settings e. Dangling separators (pure helper)");
  const it = (sep, y) => ({ sep, y });
  // line 1: A | B     line 2: | C
  assert(JSON.stringify(w.danglingSeparatorIndexes([it(0, 10), it(1, 10), it(0, 10), it(1, 50), it(0, 50)])) === "[3]", "separator at the start of line 2 hidden");
  // separator at the end of line 1 (next group wrapped)
  assert(JSON.stringify(w.danglingSeparatorIndexes([it(0, 10), it(1, 10), it(0, 50)])) === "[1]", "separator at the end of a line hidden");
  assert(JSON.stringify(w.danglingSeparatorIndexes([it(0, 10), it(1, 10), it(0, 10)])) === "[]", "separator between two items of one line kept");
  assert(JSON.stringify(w.danglingSeparatorIndexes([it(0, 10), it(1, null), it(0, 10), it(1, 10), it(0, 10)])) === "[]", "a non-displayed separator is ignored, groups hidden in between are skipped");
  assert(JSON.stringify(w.danglingSeparatorIndexes([it(1, 10), it(0, 10)])) === "[0]", "leading separator hidden");
  const bar = d.createElement("div");
  bar.innerHTML = '<span id="x1"></span><span class="row-action-separator" id="x2"></span><span id="x3"></span>';
  d.body.appendChild(bar);
  w.updateBarSeparators(bar);
  assert(!bar.querySelector(".sep-hidden"), "no layout (jsdom): nothing hidden");
});
