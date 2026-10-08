// GROUP always-labels-toggle-level — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP always-labels-toggle-level — three controls that looked broken with
   the toolbar labels set to "Always" (person-reported 2026-10-08, mockup
   variant A + A): (1) the view-toolbar on/off toggles' accent bar spans the
   whole pill content (icon's left edge → label end, symmetric 12px) instead
   of a centered 60%; (2) level pills have no empty icon slot — a plain text
   pill with equal left/right padding; (3) the Collapse-repeats chevron stays
   icon-only. "On hover"/"Never" and the phone chips are unchanged.
   jsdom has no layout and no pseudo-element styles, so the bar is checked
   through the stylesheet rules and everything else through computed styles.
   ============================================================ */
group("always-labels-toggle-level");

const altRules = d => {
  const out = [];
  const walk = rules => { for (const r of rules) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) out.push(r); } };
  for (const sheet of d.styleSheets) walk(sheet.cssRules);
  return out;
};

await withApp(async (w, d, T) => {
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 1500, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const cs = el => w.getComputedStyle(el);
  const rules = altRules(d);
  const barRule = sel => rules.filter(r => r.selectorText === sel);
  const BASE_BAR = ".toolbar-icon-btn.icon-toggle::after";
  const ALWAYS_BAR = "body.view-toolbar-labels-always .toolbar-icon-btn.icon-toggle:has(.tb-hit)::after";

  const toggle = d.querySelector("#contextToolbar .toolbar-icon-btn.icon-toggle.toggle-textmatch");
  assert(toggle && toggle.querySelector(".tb-hit") && toggle.querySelector(".tb-label"), "sanity: a wrapped view-toolbar toggle exists");
  const chevron = d.querySelector("#btnRepeatMenu");
  assert(chevron && chevron.classList.contains("repeat-chevron") && chevron.querySelector(".tb-label"), "sanity: #btnRepeatMenu is the wrapped chevron");
  const levels = [...d.querySelectorAll("#levelBar .level-btn")];
  assert(levels.length >= 3, "sanity: the simulator log produces level pills, got " + levels.length);

  section("always-labels-toggle-level a. Hover mode: toggle bar 60% centered, level circle with hit slot + count, chevron label wired up");
  assert(barRule(BASE_BAR).length === 1 && /width:\s*60%/.test(barRule(BASE_BAR)[0].cssText), "base bar rule: width 60%");
  assert(/left:\s*50%/.test(barRule(BASE_BAR)[0].cssText) && /translateX\(-50%\)/.test(barRule(BASE_BAR)[0].cssText), "base bar rule: left 50% + translateX(-50%)");
  assert(cs(toggle).paddingRight !== "12px" && cs(toggle).paddingLeft !== "5px", "hover: toggle padding is not the Always pill padding");
  levels.forEach(l => {
    assert(cs(l).width === "28px", "hover: level pill is a 28px circle, got " + cs(l).width);
    assert(cs(l.querySelector(".row-action-hit")).display !== "none", "hover: level hit slot visible");
    assert(cs(l.querySelector(".level-count")).display !== "none", "hover: level count inside the circle");
  });
  assert(cs(chevron).width === "14px", "hover: chevron is 14px wide, got " + cs(chevron).width);
  assert(cs(chevron.querySelector(".tb-label")).display !== "none", "hover: the chevron keeps its (floating) label");

  section("always-labels-toggle-level b. Always view labels: toggle bar spans icon start to label end, symmetric");
  d.body.classList.add("view-toolbar-labels-always");
  assert(barRule(ALWAYS_BAR).length === 1, "an Always bar rule exists for the toggles");
  const bar = barRule(ALWAYS_BAR)[0].style;
  assert(bar.getPropertyValue("left") === "12px" && bar.getPropertyValue("right") === "12px", "bar left/right 12px, got " + bar.getPropertyValue("left") + " / " + bar.getPropertyValue("right"));
  assert(bar.getPropertyValue("width") === "auto" && bar.getPropertyValue("transform") === "none", "bar width auto, no translate");
  assert(cs(toggle).paddingLeft === "5px" && cs(toggle).paddingRight === "12px", "toggle padding 5px / 12px (icon inset 7px + 5px = 12px = label end gap), got " + cs(toggle).paddingLeft + " / " + cs(toggle).paddingRight);
  assert(cs(toggle.querySelector(".tb-hit")).width === "28px", "the 14px icon still sits centered in its 28px slot (7px inset)");
  assert(cs(toggle.querySelector(".tb-label")).position === "static", "toggle label inline");
  d.querySelectorAll(".toolbar-icon-btn.icon-toggle").forEach(b => {
    if (b.querySelector(".tb-hit")) assert(cs(b).paddingLeft === "5px", "every wrapped toggle gets the symmetric padding: " + b.className);
  });

  section("always-labels-toggle-level c. Chevron stays icon-only in Always view labels");
  assert(cs(chevron).width === "14px", "chevron still 14px, got " + cs(chevron).width);
  assert(cs(chevron).paddingRight !== "10px" && cs(chevron).paddingRight !== "12px", "chevron gets no pill padding, got " + cs(chevron).paddingRight);
  assert(cs(chevron.querySelector(".tb-label")).display === "none", "chevron label hidden");
  assert(chevron.title && chevron.title.length > 0, "chevron keeps its title tooltip");
  assert(cs(toggle.querySelector(".tb-label")).display !== "none", "regular toggle labels stay visible");
  d.body.classList.remove("view-toolbar-labels-always");

  section("always-labels-toggle-level d. Always filter labels: level pills are text-only with equal padding");
  d.body.classList.add("filter-toolbar-labels-always");
  levels.forEach(l => {
    const lab = l.querySelector(".row-action-label");
    assert(cs(l.querySelector(".row-action-hit")).display === "none", l.dataset.level + ": empty icon slot hidden");
    assert(cs(l).paddingLeft === "12px" && cs(l).paddingRight === "12px", l.dataset.level + ": padding 12px both sides, got " + cs(l).paddingLeft + " / " + cs(l).paddingRight);
    assert(cs(lab).marginLeft === "0px", l.dataset.level + ": label margin-left 0, got " + cs(lab).marginLeft);
    assert(cs(l).height === "28px" && cs(l).width === "auto", l.dataset.level + ": 28px high pill, auto width");
    assert(cs(l.querySelector(".level-count")).display === "none", l.dataset.level + ": no in-circle count (the label carries it)");
  });
  assert(rules.some(r => /#levelBar \.level-btn:hover:not\(:disabled\) \.row-action-label/.test(r.selectorText) && /filter-toolbar-labels-always/.test(r.selectorText) && /transform:\s*none/.test(r.cssText)),
    "hovering an Always level pill does not shift its label (ID hover rule overridden)");
  const rowBtn = d.querySelector("#viewBar .row-actions .row-action-btn:not(.level-btn):not(.rect)");
  if (rowBtn) assert(cs(rowBtn.querySelector(".row-action-hit")).display !== "none", "other filter-toolbar pills keep their icon slot");

  section("always-labels-toggle-level e. Phone layout and view toolbar are unaffected by the filter Always rules / vice versa");
  d.body.classList.add("layout-phone");
  assert(cs(levels[0]).paddingLeft === "12px" && cs(levels[0]).height === "32px", "phone chips keep their own 32px/12px shape, got " + cs(levels[0]).height);
  d.body.classList.remove("layout-phone");
  assert(cs(toggle).paddingLeft !== "5px", "filter 'Always' alone does not change the view-toolbar toggles");
  d.body.classList.remove("filter-toolbar-labels-always");
  assert(cs(levels[0]).paddingLeft === "0px" && cs(levels[0].querySelector(".row-action-hit")).display !== "none", "back to hover: level circle restored");
}, { toolbarLabels: "hover" });
