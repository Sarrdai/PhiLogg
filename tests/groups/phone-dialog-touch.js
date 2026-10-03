// GROUP phone-dialog-touch — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-dialog-touch — touch sizing of the phone tier's menus and dialogs
   Origin: 2026-10-03. Shared body.layout-phone rules: menu rows >= 40px, dialog
   buttons >= 40px, inputs/selects 16px + 40px, steppers 40x40, the filter popup
   fits the screen; the pointer:coarse block bumps the same targets to 44px; the
   long-press menus are clamped into the viewport (fitPopupToViewport). jsdom has
   no layout, so sizes are asserted on the CSS rules (real geometry: Chromium
   audit via tools/log-sim/screenshot.js).
   ============================================================ */
group("phone-dialog-touch");

await withApp(async (w, d, T) => {
  const rules = [];
  const walk = (list, coarse) => {
    for (const r of list) {
      if (r.media) walk(r.cssRules, coarse || /pointer:\s*coarse/.test(r.media.mediaText || r.conditionText || ""));
      else if (r.selectorText) rules.push({ sels: r.selectorText.split(",").map(x => x.trim()), css: r.style.cssText.replace(/\s/g, ""), coarse });
    }
  };
  for (const sheet of d.styleSheets) walk(sheet.cssRules, false);
  const has = (sel, decl, coarse = false) => rules.some(r => r.coarse === coarse && r.sels.includes(sel) && r.css.includes(decl));
  const P = "body.layout-phone ";

  section("phone-dialog-touch a. Phone base rules (40px, 16px inputs)");
  assert(has(P + ".ctx-item", "min-height:40px"), "menu rows (.ctx-item: row, tree, add-to-selection, info menus) >= 40");
  assert(has(P + "#libraryMenu .lib-it", "min-height:40px"), "library menu rows >= 40");
  ["select", 'input[type="number"]', 'input[type="datetime-local"]', 'input[type="text"]:not(.stepper-value)'].forEach(sel => {
    assert(has(P + ".link-dialog-card " + sel, "height:40px") && has(P + ".link-dialog-card " + sel, "font-size:16px"), "dialog " + sel + " is 40px tall, 16px font");
  });
  assert(has(P + "#noteDialogInput", "font-size:16px"), "note textarea 16px");
  assert(has(P + ".link-dialog-card .btn-mini", "min-height:40px") && has(P + ".link-dialog-card .btn-mini-secondary", "min-height:40px")
    && has(P + ".link-dialog-card .btn-mini-outline", "min-height:40px"), "dialog buttons >= 40");
  assert(has(P + "#filterPopup .btn-mini", "min-height:40px"), "filter popup 'Add filter' >= 40");
  assert(has(P + ".link-dialog-card .stepper .stepper-btn", "width:40px") && has(P + ".link-dialog-card .stepper", "height:40px"), "steppers 40x40");
  assert(has(P + ".link-dialog-card input.stepper-value", "align-self:stretch"), "stepper input fills the stepper height (was 14px)");
  assert(has(P + ".time-range-clear", "width:40px") && has(P + ".filter-library-row-icon", "height:40px"), "time-range clear + library icon buttons 40");
  assert(has(P + "#filterPopup #btnCloseFilterPopup", "width:40px") && has(P + "#filterPopup .token-chip", "height:40px") && has(P + "#filterPopup .label-toggle", "height:40px"),
    "filter popup close / chips / pills 40");
  assert(has(P + "#filterInput", "font-size:16px"), "filter input 16px");
  assert(has(P + "#filterPopup", "width:calc(100%-16px)") && has(P + "#filterPopup", "overflow-x:hidden"), "filter popup fits the width, never widens the page");
  assert(has(P + ".filter-results-head", "flex-wrap:wrap") && has(P + ".filter-live-meta", "min-width:0"), "live result rows wrap instead of overflowing");
  assert(has(P + ".link-hop-row input[type=\"number\"]", "width:56px"), "link hop input >= 56 wide");
  assert(has(P + ".link-option-controls", "flex:11100%") || has(P + ".link-option-controls", "flex:1 1 100%".replace(/\s/g, "")), "link option controls wrap under their label");
  assert(has(P + "#libraryMenu", "left:8px") && has(P + "#libraryMenu", "top:60px"), "library menu sits on screen on the phone");

  assert(has(P + "#filterPopup .filter-footer-row", "position:sticky") && has(P + "#filterPopup .filter-footer-row", "bottom:0"), "filter popup action row is sticky at the bottom");
  assert(has(P + ".link-dialog-card .link-dialog-actions", "position:sticky") && has(P + ".link-dialog-card .link-dialog-actions", "bottom:0"), "dialog Cancel/Create row is sticky at the bottom");
  assert(!rules.some(r => !r.coarse && r.sels.some(x => !/^body\.layout-phone\s/.test(x)) && r.sels.some(x => /filter-footer-row|link-dialog-actions/.test(x)) && r.css.includes("sticky")), "no sticky footer outside the phone tier");

  section("phone-dialog-touch b. pointer:coarse bumps to 44");
  assert(has(P + ".ctx-item", "min-height:44px", true) && has(P + "#libraryMenu .lib-it", "min-height:44px", true), "menu rows 44");
  assert(has(P + ".link-dialog-card select", "height:44px", true) && has(P + '.link-dialog-card input[type="datetime-local"]', "height:44px", true), "dialog inputs 44");
  assert(has(P + ".link-dialog-card .btn-mini", "min-height:44px", true) && has(P + "#filterPopup .btn-mini", "min-height:44px", true), "dialog buttons 44");
  assert(has(P + ".link-dialog-card .stepper .stepper-btn", "width:44px", true) && has(P + ".time-range-clear", "width:44px", true), "steppers + clear 44");
  assert(has(P + "#filterPopup .token-chip", "height:44px", true) && has(P + "#filterPopup #btnCloseFilterPopup", "height:44px", true), "filter popup chips + close 44");
  assert(has(P + ".link-dialog-card .pill-toggle::before", "inset:-12px-6px", true), "link dialog toggles get a 44px hit area");

  section("phone-dialog-touch c. Desktop base sizes unchanged, everything tier-scoped");
  assert(has(".ctx-item", "padding:8px10px") && !rules.some(r => !r.coarse && r.sels.includes(".ctx-item") && r.css.includes("min-height")), "desktop .ctx-item has no min-height");
  assert(has(".stepper", "height:30px") && has(".link-dialog-card", "width:min(400px,88%)"), "desktop stepper 30px, card width unchanged");
  assert(has("#filterPopup", "width:min(620px,92%)"), "desktop filter popup width unchanged");
  const phoneRules = rules.filter(r => /^body\.layout-phone /.test(r.sels[0]) && !r.sels.some(s => /layout-compact/.test(s)) && /link-dialog-card|ctx-item|lib-it|filterPopup|filterInput|stepper|time-range-clear/.test(r.sels.join()));
  assert(phoneRules.length > 20 && phoneRules.every(r => r.sels.every(s => /^body\.layout-phone\s/.test(s))), "all new rules are body.layout-phone scoped");

  section("phone-dialog-touch d. fitPopupToViewport clamps into the viewport (phone only)");
  const menu = d.createElement("div");
  d.body.appendChild(menu);
  menu.style.cssText = "position:fixed; left:300px; top:700px;";
  menu.getBoundingClientRect = () => ({ left: parseFloat(menu.style.left), top: parseFloat(menu.style.top), width: 240, height: 300, right: 0, bottom: 0 });
  Object.defineProperty(d.documentElement, "clientWidth", { configurable: true, value: 375 });
  w.innerHeight = 812;
  w.innerWidth = 375; w.dispatchEvent(new w.Event("resize"));
  w.fitPopupToViewport(menu);
  assert(parseFloat(menu.style.left) === 375 - 240 - 8, "phone: right edge keeps the 8px margin, left=" + menu.style.left);
  assert(parseFloat(menu.style.top) === 812 - 300 - 8, "phone: bottom edge keeps the 8px margin, top=" + menu.style.top);
  menu.style.left = "300px"; menu.style.top = "700px";
  w.innerWidth = 1440; Object.defineProperty(d.documentElement, "clientWidth", { configurable: true, value: 1440 });
  w.dispatchEvent(new w.Event("resize"));
  w.fitPopupToViewport(menu);
  assert(menu.style.left === "300px" && menu.style.top === "700px", "desktop: untouched");
});
