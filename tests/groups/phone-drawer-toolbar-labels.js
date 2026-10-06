// GROUP phone-drawer-toolbar-labels — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-drawer-toolbar-labels — labels under the drawer's toolbar icons (phone only)
   Origin: 2026-10-06. #sidebarToolbar (Rename / Edit / Link / NOT / Mute /
   Clock) shows a short 10px label under each icon on the phone tier,
   whatever the "View Toolbar button labels" setting says; the short text is
   built by buildRowActionsHtml from describeSidebarToolbarActions (`short`),
   so Mute <-> Unmute follows the node state. The drawer header's Open / Save
   get the same under-icon labels. Desktop / compact keep the hover/always/never
   behaviour (the short label stays display:none there).
   Data: log-sim "basic" scenario.
   ============================================================ */
group("phone-drawer-toolbar-labels");

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 200, seed: 35 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  const node = w.createFilterNode(f.id, "text", "heartbeat");
  T.state.activeId = node.id;
  w.innerWidth = 390; w.innerHeight = 800; w.dispatchEvent(new w.Event("resize"));
  w.render();
  const shorts = () => [...d.querySelectorAll("#sidebarToolbar [data-row-action]")].map(b => (b.querySelector(".row-action-short") || {}).textContent);
  const btn = a => d.querySelector('#sidebarToolbar [data-row-action="' + a + '"]');

  const rules = [];
  const walk = (list, coarse) => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules, coarse || /pointer:\s*coarse/.test((r.media && r.media.mediaText) || "")); else if (r.selectorText) rules.push({ sel: r.selectorText, css: r.cssText.replace(/\s+/g, ""), coarse }); } };
  for (const sh of d.styleSheets) walk(sh.cssRules, false);
  const css = sel => rules.filter(r => !r.coarse && r.sel.split(",").map(x => x.trim()).includes(sel)).map(r => r.css).join("");

  section("phone-drawer-toolbar-labels a. Short label texts on phone");
  assert(d.body.classList.contains("layout-phone"), "phone tier active");
  assert(JSON.stringify(shorts()) === JSON.stringify(["Rename", "Edit", "Link", "NOT", "Mute", "Clock"]), "labels Rename/Edit/Link/NOT/Mute/Clock, got " + JSON.stringify(shorts()));
  assert(btn("rename").title === "Rename…" && btn("invert").title === "Invert (NOT)", "titles keep the full text");

  section("phone-drawer-toolbar-labels b. Dynamic labels stay in sync");
  w.toggleMuteWithUndo([node.id]); w.render();
  assert(btn("mute").querySelector(".row-action-short").textContent === "Unmute", "muted: Mute -> Unmute");
  w.toggleMuteWithUndo([node.id]); w.render();
  assert(btn("mute").querySelector(".row-action-short").textContent === "Mute", "unmuted: back to Mute");
  w.toggleInvertWithUndo(node.id); w.render();
  assert(btn("invert").title === "Remove NOT" && btn("invert").querySelector(".row-action-short").textContent === "NOT", "inverted: title Remove NOT, short label stays NOT");
  w.toggleInvertWithUndo(node.id); w.render();

  section("phone-drawer-toolbar-labels c. CSS: label under the icon, >=44px wide, floating label hidden");
  const btnCss = css("body.layout-phone #sidebarToolbar .row-action-btn");
  assert(/flex-direction:column/.test(btnCss) && /width:44px/.test(btnCss) && /height:auto/.test(btnCss) && /min-height:5\dpx/.test(btnCss), "column layout, 44px wide, grows in height");
  assert(/display:none!important/.test(css("body.layout-phone #sidebarToolbar .row-action-btn .row-action-label")), "floating hover/always label hidden on phone");
  const shortCss = css("body.layout-phone #sidebarToolbar .row-action-short");
  assert(/display:block/.test(shortCss) && /font-size:10px/.test(shortCss) && /text-overflow:ellipsis/.test(shortCss) && /white-space:nowrap/.test(shortCss) && /color:var\(--text-secondary\)/.test(shortCss), "10px, one line, ellipsis, secondary colour");
  assert(/opacity:0?\.45/.test(css("body.layout-phone #sidebarToolbar .row-action-btn:disabled .row-action-short")), "disabled buttons dim their label too");
  assert(/display:none/.test(css(".row-action-short")), "short label hidden by default (every other tier)");

  section("phone-drawer-toolbar-labels d. Drawer header Open / Save");
  const lbl = id => (d.querySelector("#" + id + " .btn-short-label") || {}).textContent;
  assert(lbl("btnOpen") === "Open" && lbl("btnSave") === "Save", "labels Open / Save present");
  assert(/display:block/.test(css("body.layout-phone #sidebarHeader .btn-short-label")) && /display:none/.test(css(".btn-short-label")), "shown on phone only");
  assert(d.getElementById("btnOpen").title === "Open…" && d.getElementById("btnSave").title === "Save session…", "titles unchanged");

  section("phone-drawer-toolbar-labels e. Desktop and compact: no under-icon labels");
  const scoped = rules.filter(r => /row-action-short|btn-short-label/.test(r.sel) && /display:block/.test(r.css));
  assert(scoped.length >= 2 && scoped.every(r => r.sel.split(",").every(s => /^body\.layout-phone\s/.test(s.trim()))), "every rule that shows a short label is phone-scoped");
  const labelRules = rules.filter(r => /view-toolbar-labels-(always|never)/.test(r.sel) && /row-action/.test(r.sel));
  assert(labelRules.length >= 3 && labelRules.every(r => !/layout-phone/.test(r.sel)), "desktop always/never label rules untouched");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize")); w.render();
  assert(d.body.classList.contains("layout-phone") === false, "desktop tier");
  assert(!d.body.classList.contains("layout-phone") && btn("rename") && btn("rename").querySelector(".row-action-label").textContent === "Rename…", "desktop: the floating label keeps the full text");
});
