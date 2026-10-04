// GROUP level-bar-touch-layout — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP level-bar-touch-layout — level bar on phone and tablet
   (Runde C / C2, step 3). Phone: chip text is first letter + count ("F 15",
   "Other 33"), one scrolling row with a right-edge fade only while chips are
   hidden to the right. Tablet (compact): when #viewBar's content does not fit,
   #levelBar gets its own full-width row (#viewBar.level-own-row), decided from
   the chips' natural width so it cannot oscillate. Desktop unchanged.
   jsdom has no layout: scrollWidth/offsetWidth are stubbed.
   ============================================================ */
group("level-bar-touch-layout");

const lbtWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const lbtTour = () => {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  return TOUR.generateTour().find(f => f.path === "demo/app.log").text;
};
const lbtDef = (w, el, props) => Object.entries(props).forEach(([k, v]) => Object.defineProperty(el, k, { configurable: true, get: typeof v === "function" ? v : () => v }));

await withApp(async (w, d, T) => {
  section("level-bar-touch-layout a. Phone chip text and the right-edge fade");
  await waitForFormatConfig(T);
  const f = await w.addFile("app.log", lbtTour(), () => {});
  T.state.activeId = f.id;
  lbtWidth(w, 390);
  w.render();
  const chip = l => d.querySelector('#levelBar .level-btn[data-level="' + l + '"]');
  const vis = l => chip(l).querySelector(".level-short").textContent;
  assert(vis("FATAL") === "F 15" && vis("ERROR") === "E 134" && vis("WARN") === "W 256" && vis("INFO") === "I 1.356", "short texts: letter + count, got " + ["FATAL", "ERROR", "WARN", "INFO"].map(vis).join(" | "));
  assert(vis("OTHER") === "Other 33", "Other spelled out, got " + vis("OTHER"));
  assert(chip("OTHER").title === "Other 33 (VERBOSE 21 · NOTICE 12)", "the full name stays in the tooltip");
  const css = a => w.getComputedStyle(a).display;
  assert(css(chip("ERROR").querySelector(".level-short")) !== "none" && css(chip("ERROR").querySelector(".row-action-label")) === "none", "phone shows the short text, not the long label");

  const bar = d.querySelector("#levelBar");
  let sw = 600, cw = 300, sl = 0;
  lbtDef(w, bar, { scrollWidth: () => sw, clientWidth: () => cw, scrollLeft: () => sl });
  w.updateLevelBarLayout();
  assert(bar.classList.contains("has-more-right"), "chips hidden to the right: fade on");
  sl = 300;
  w.updateLevelBarLayout();
  assert(!bar.classList.contains("has-more-right"), "scrolled to the end: fade off");
  sl = 0; sw = 300;
  w.updateLevelBarLayout();
  assert(!bar.classList.contains("has-more-right"), "everything fits: no fade");
  sw = 600;
  bar.dispatchEvent(new w.Event("scroll"));
  assert(bar.classList.contains("has-more-right"), "the scroll event re-evaluates the fade");
  lbtWidth(w, 1440);
  w.render();
  assert(!bar.classList.contains("has-more-right"), "desktop: no fade class");
  assert(css(chip("ERROR").querySelector(".level-short")) === "none" && css(chip("ERROR").querySelector(".row-action-label")) !== undefined, "desktop hides the short text");
});

await withApp(async (w, d, T) => {
  section("level-bar-touch-layout b. Tablet: own row when the toolbar does not fit, stable, desktop unchanged");
  await waitForFormatConfig(T);
  const f = await w.addFile("app.log", lbtTour(), () => {});
  T.state.activeId = f.id;
  lbtWidth(w, 820);
  w.render();
  assert(d.body.classList.contains("layout-compact"), "sanity: compact tier");
  const viewBar = d.querySelector("#viewBar"), bar = d.querySelector("#levelBar");
  let avail = 2000, others = 600;
  lbtDef(w, viewBar, { clientWidth: () => avail });
  [...viewBar.children].forEach(c => { if (c !== bar) lbtDef(w, c, { offsetWidth: 0 }); });
  const first = [...viewBar.children].find(c => c !== bar);
  lbtDef(w, first, { offsetWidth: () => others });
  [...bar.children].forEach(c => lbtDef(w, c, { offsetWidth: 44 }));
  const n = bar.children.length;
  const cs = w.getComputedStyle(viewBar);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const chipsW = n * 44 + (n - 1) * 6 + pad; // the padding counts against the available width
  w.updateLevelBarLayout();
  assert(!viewBar.classList.contains("level-own-row"), "fits in one row: no own row");
  avail = others + chipsW - 1;
  w.updateLevelBarLayout();
  assert(viewBar.classList.contains("level-own-row"), "one pixel too narrow: the level bar gets its own row");
  // Stable: re-evaluating (and the layout change itself) never flips it back.
  lbtDef(w, bar, { offsetWidth: avail }); // in own-row mode the bar is as wide as the whole row
  for (let i = 0; i < 4; i++) w.updateLevelBarLayout();
  assert(viewBar.classList.contains("level-own-row"), "repeated evaluation does not oscillate");
  avail = others + chipsW;
  w.updateLevelBarLayout();
  assert(!viewBar.classList.contains("level-own-row"), "exactly fitting: back to one row");
  // CSS: the own-row rule exists for the compact tier only.
  const rules = [];
  const walk = rs => { for (const r of rs) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  const own = rules.find(r => r.selectorText === "body.layout-compact #viewBar.level-own-row > #levelBar");
  assert(own && own.style.order === "1" && /100%/.test(own.style.flex), "own-row CSS: #levelBar takes (nearly) the full row, ordered after the rest");
  const facets = rules.find(r => r.selectorText === "body.layout-compact #viewBar.level-own-row > #btnFacets");
  assert(facets && facets.style.order === "2", "own-row CSS: the Facets button is ordered after the chips, so it shares their row instead of getting a row of its own");
  assert(/calc\(100% - \d+px\)/.test(own.style.flex), "the chips' basis leaves room for the Facets button on the same row");
  assert(rules.every(r => !/level-own-row/.test(r.selectorText) || /layout-compact/.test(r.selectorText)), "every own-row rule is scoped to the compact tier");
  // Desktop and phone never carry the class.
  avail = 10;
  lbtWidth(w, 1440);
  w.render();
  assert(!viewBar.classList.contains("level-own-row"), "desktop: never an own row");
  lbtWidth(w, 390);
  w.render();
  assert(!viewBar.classList.contains("level-own-row"), "phone: never an own row (it scrolls)");
});
