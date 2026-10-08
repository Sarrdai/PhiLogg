// GROUP inline-labels-toggle-level — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP inline-labels-toggle-level — inline pills of the toggles, the level
   chips and the Collapse-repeats chevron (person-reported 2026-10-08, kept
   through the label settings split; renamed from inline-labels-toggle-level).
   In "Inline": (1) view-toolbar toggles are pills with a symmetric status
   bar; (2) the level chips are text pills with no empty icon slot and equal
   left/right padding; (3) the Collapse-repeats chevron stays icon-only.
   "On hover"/"Off" and the phone chips are unchanged.
   jsdom has no layout and no pseudo-element styles, so the bar is checked
   through the stylesheet rules and everything else through computed styles.
   ============================================================ */
group("inline-labels-toggle-level");

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
  const INLINE_BAR = "body.view-toolbar-labels-inline .toolbar-icon-btn.icon-toggle:has(.tb-hit):not(.repeat-chevron)::after";

  const toggle = d.querySelector("#contextToolbar .toolbar-icon-btn.icon-toggle.toggle-textmatch");
  assert(toggle && toggle.querySelector(".tb-hit") && toggle.querySelector(".tb-label"), "sanity: a wrapped view-toolbar toggle exists");
  const chevron = d.querySelector("#btnRepeatMenu");
  assert(chevron && chevron.classList.contains("repeat-chevron") && chevron.querySelector(".tb-label"), "sanity: #btnRepeatMenu is the wrapped chevron");
  const levels = [...d.querySelectorAll("#levelBar .level-btn")];
  const l0Label = () => levels[0].querySelector(".row-action-label");
  assert(levels.length >= 3, "sanity: the simulator log produces level pills, got " + levels.length);

  section("inline-labels-toggle-level a. Hover mode: toggle bar 60% centered, level circle with hit slot + count, chevron label wired up");
  assert(barRule(BASE_BAR).length === 1 && /width:\s*60%/.test(barRule(BASE_BAR)[0].cssText), "base bar rule: width 60%");
  assert(/left:\s*50%/.test(barRule(BASE_BAR)[0].cssText) && /translateX\(-50%\)/.test(barRule(BASE_BAR)[0].cssText), "base bar rule: left 50% + translateX(-50%)");
  assert(cs(toggle).paddingRight !== "12px" && cs(toggle).paddingLeft !== "5px", "hover: toggle padding is not the Inline pill padding");
  levels.forEach(l => {
    assert(cs(l).width === "28px", "hover: level pill is a 28px circle, got " + cs(l).width);
    assert(cs(l.querySelector(".row-action-hit")).display !== "none", "hover: level hit slot visible");
    assert(cs(l.querySelector(".level-count")).display !== "none", "hover: level count inside the circle");
  });
  assert(cs(chevron).width === "14px", "hover: chevron is 14px wide, got " + cs(chevron).width);
  assert(cs(chevron.querySelector(".tb-label")).display !== "none", "hover: the chevron keeps its (floating) label");

  section("inline-labels-toggle-level b. Inline view labels: chevron stays icon-only, toggles are pills with a symmetric bar");
  d.body.classList.add("view-toolbar-labels-inline");
  assert(cs(chevron).width === "14px", "chevron still 14px, got " + cs(chevron).width);
  assert(cs(chevron).paddingRight !== "10px" && cs(chevron).paddingRight !== "12px", "chevron gets no pill padding, got " + cs(chevron).paddingRight);
  assert(cs(chevron.querySelector(".tb-label")).display === "none", "chevron label hidden");
  assert(chevron.title && chevron.title.length > 0, "chevron keeps its title tooltip");
  assert(cs(toggle).paddingLeft === "5px" && cs(toggle).paddingRight === "12px", "toggles get the symmetric pill padding 5px / 12px, got " + cs(toggle).paddingLeft + " / " + cs(toggle).paddingRight);
  assert(cs(toggle.querySelector(".tb-label")).position === "static" && cs(toggle.querySelector(".tb-label")).display !== "none", "the toggle label sits inline");
  assert(barRule(INLINE_BAR).length === 1 && /left:\s*12px/.test(barRule(INLINE_BAR)[0].cssText) && /right:\s*12px/.test(barRule(INLINE_BAR)[0].cssText), "the status bar spans the pill content (12px both sides)");
  d.body.classList.remove("view-toolbar-labels-inline");

  section("inline-labels-toggle-level c. Inline level labels: level pills are text-only with equal padding");
  d.body.classList.add("level-labels-inline");
  levels.forEach(l => {
    const lab = l.querySelector(".row-action-label");
    assert(cs(l.querySelector(".row-action-hit")).display === "none", l.dataset.level + ": empty icon slot hidden");
    assert(cs(l).paddingLeft === "12px" && cs(l).paddingRight === "12px", l.dataset.level + ": padding 12px both sides, got " + cs(l).paddingLeft + " / " + cs(l).paddingRight);
    assert(cs(lab).marginLeft === "0px", l.dataset.level + ": label margin-left 0, got " + cs(lab).marginLeft);
    assert(cs(l).height === "28px" && cs(l).width === "auto", l.dataset.level + ": 28px high pill, auto width");
    assert(cs(l.querySelector(".level-count")).display === "none", l.dataset.level + ": no in-circle count (the label carries it)");
  });
  assert(rules.some(r => /#levelBar \.level-btn:hover:not\(:disabled\) \.row-action-label/.test(r.selectorText) && /level-labels-inline/.test(r.selectorText) && /transform:\s*none/.test(r.cssText)),
    "hovering an Inline level pill does not shift its label (ID hover rule overridden)");
  assert(cs(l0Label()).zIndex === "auto", "level pill label does not paint above popups (z-index auto)");

  section("inline-labels-toggle-level d. Phone layout and view toolbar are unaffected by the level Inline rules / vice versa");
  d.body.classList.add("layout-phone");
  assert(cs(levels[0]).paddingLeft === "12px" && cs(levels[0]).height === "32px", "phone chips keep their own 32px/12px shape, got " + cs(levels[0]).height);
  d.body.classList.remove("layout-phone");
  assert(cs(toggle).paddingLeft !== "5px", "level 'Inline' alone does not change the view-toolbar toggles");
  d.body.classList.remove("level-labels-inline");
  assert(cs(levels[0]).paddingLeft === "0px" && cs(levels[0].querySelector(".row-action-hit")).display !== "none", "back to hover: level circle restored");
}, { toolbarLabels: "hover" });
