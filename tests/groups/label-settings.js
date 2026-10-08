// GROUP label-settings — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP label-settings — three independent toolbar concepts, the "?" quick
   switch and the hover-card nudge
   Origin: 2026-10-08 (label concept, variant A of the mockup). (1) Button
   labels per area: Off | On hover | Inline (body classes `<prefix>-off` /
   `-inline`). (2) Hover descriptions (global, default on, body class
   `hover-descriptions-off`). (3) Group captions (global, default off, body
   class `toolbar-captions`). They never touch each other. The header "?"
   button opens a small menu (Where is what?, the two switches, "All toolbar
   settings…") that stays in sync with Settings. After HOVER_NUDGE_AFTER hover
   cards one toast offers to hide the descriptions, once. jsdom has no layout:
   what each combination does is read from the stylesheet through computed
   styles (display / position / opacity) and the DOM.
   ============================================================ */
group("label-settings");

await withApp(async (w, d, T) => {
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 400, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const cs = el => w.getComputedStyle(el);
  const set = (id, v) => { const s = d.getElementById(id); s.value = v; s.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const LABELS = ["settingsSidebarToolbarLabels", "settingsLevelLabels", "settingsFilterToolbarLabels", "settingsViewToolbarLabels"];
  const setLabels = v => LABELS.forEach(id => set(id, v));
  const shown = e => cs(e).display !== "none";

  section("label-settings a. Defaults and storage: labels hover, descriptions on, captions off; legacy values fall back");
  LABELS.forEach(id => assert(d.getElementById(id).value === "hover", id + " defaults to On hover"));
  assert(d.getElementById("settingsHoverDescriptions").value === "1" && d.getElementById("settingsToolbarCaptions").value === "0", "descriptions On, captions Off in Settings");
  assert(!d.body.classList.contains("hover-descriptions-off") && !d.body.classList.contains("toolbar-captions"), "no body class at the defaults");
  assert(w.normalizeToolbarLabelsMode("never") === "hover" && w.normalizeToolbarLabelsMode("always") === "hover" && w.normalizeToolbarLabelsMode("inline") === "inline" && w.normalizeToolbarLabelsMode("off") === "off", "legacy never/always fall back to hover");
  LABELS.forEach(id => assert([...d.getElementById(id).options].map(o => o.textContent).join() === "Off,On hover,Inline", id + ": options Off / On hover / Inline"));
  set("settingsHoverDescriptions", "0");
  assert(w.localStorage.getItem("philogg-hover-descriptions") === "0" && d.body.classList.contains("hover-descriptions-off"), "descriptions Off: stored + body class");
  set("settingsHoverDescriptions", "1");
  assert(w.localStorage.getItem("philogg-hover-descriptions") === "1" && !d.body.classList.contains("hover-descriptions-off"), "descriptions On again");
  set("settingsToolbarCaptions", "1");
  assert(w.localStorage.getItem("philogg-toolbar-captions") === "1" && d.body.classList.contains("toolbar-captions"), "captions On: stored + body class");
  set("settingsToolbarCaptions", "0");
  assert(!d.body.classList.contains("toolbar-captions"), "captions Off again");

  section("label-settings b. Matrix: labels x descriptions x captions — each concept moves only its own classes");
  // One representative per area: [select id, button selector, prefix].
  const AREAS = [
    ["settingsSidebarToolbarLabels", '#sidebarToolbar [data-row-action="edit"]', "sidebar-toolbar-labels"],
    ["settingsLevelLabels", "#btnApplyLevelToTree", "level-labels"],
    ["settingsFilterToolbarLabels", '#viewBar [data-row-action="filterAfter"]', "filter-toolbar-labels"],
    ["settingsViewToolbarLabels", "#contextToolbar .toolbar-icon-btn.icon-toggle.toggle-textmatch", "view-toolbar-labels"],
  ];
  for (const mode of ["off", "hover", "inline"]) {
    for (const desc of [true, false]) {
      for (const caps of [true, false]) {
        setLabels(mode);
        set("settingsHoverDescriptions", desc ? "1" : "0");
        set("settingsToolbarCaptions", caps ? "1" : "0");
        const tag = mode + "/desc " + (desc ? "on" : "off") + "/captions " + (caps ? "on" : "off");
        assert(d.body.classList.contains("hover-descriptions-off") === !desc && d.body.classList.contains("toolbar-captions") === caps, tag + ": global classes follow their own setting");
        AREAS.forEach(([id, sel, prefix]) => {
          assert(d.body.classList.contains(prefix + "-off") === (mode === "off") && d.body.classList.contains(prefix + "-inline") === (mode === "inline"), tag + ": " + prefix + " classes");
          const b = d.querySelector(sel);
          assert(b, "sanity: " + sel);
          const lab = b.querySelector(".row-action-label, .tb-label");
          const descEl = lab.querySelector(".hint-desc");
          const more = lab.querySelector(".hint-more");
          if (mode === "hover") {
            assert(shown(lab) && cs(lab).position === "absolute", tag + " " + prefix + ": floating card");
          } else if (mode === "off") {
            assert(shown(lab) === desc && (!desc || cs(lab).position === "absolute"), tag + " " + prefix + ": floating card only with descriptions");
          } else {
            assert(shown(lab) && cs(lab).position === "static", tag + " " + prefix + ": the name sits inline");
            assert(shown(more) === desc && (!desc || cs(more).position === "absolute"), tag + " " + prefix + ": inline description card only with descriptions, floating");
          }
          if (mode !== "off" || desc) assert(shown(descEl) === desc, tag + " " + prefix + ": .hint-desc follows the descriptions setting");
        });
        assert(shown(d.querySelector("#vbView > .group-caption")) === caps, tag + ": View caption follows the captions setting only");
        assert(shown(d.querySelector("#sidebarToolbar .stb-group > .group-caption")) === caps, tag + ": sidebar captions follow the captions setting only");
      }
    }
  }
  setLabels("hover");
  set("settingsHoverDescriptions", "1");
  set("settingsToolbarCaptions", "0");

  section("label-settings c. Inline: compact pill, no clipping, the + badge stays on the icon");
  setLabels("inline");
  AREAS.forEach(([id, sel]) => {
    const b = d.querySelector(sel);
    assert(cs(b).width === "auto" && /^1[02]px$/.test(cs(b).paddingRight) && cs(b).overflow !== "hidden", sel + ": auto-width pill, 10px (toggles 12px) right padding, no overflow clipping");
    if (sel.startsWith("#sidebarToolbar")) {
      assert(!shown(b.querySelector(".hint-name")) && cs(b.querySelector(".row-action-short")).display === "inline" && cs(b.querySelector(".row-action-short")).marginLeft === "-3px", sel + ": the narrow sidebar shows the short name inline, small gap");
    } else {
      assert(cs(b.querySelector(".row-action-label, .tb-label")).marginLeft === (b.querySelector(".add-badge") ? "3px" : "-3px"), sel + ": small gap between icon and name (a + badge button leaves room for the +)");
    }
  });
  ["#btnApplyLevelToTree", "#viewbarNew .row-action-btn", "#sidebarToolbar [data-row-action=addToLibrary]"].forEach(sel => {
    const b = d.querySelector(sel);
    assert(b.querySelector(".row-action-hit .add-badge-wrap .add-badge"), sel + ": badge lives in the icon box");
  });
  assert(cs(d.querySelector("#btnApplyLevelToTree .row-action-label")).display !== "none", "Add level filter shows its name inline");
  assert(cs(d.querySelector("#btnApplyLevelToTree .row-action-label")).marginLeft === "3px" && cs(d.querySelector("#viewbarNew .row-action-label")).marginLeft === "3px", "badge buttons leave room for the + (name starts 3px right of the icon box), got " + cs(d.querySelector("#btnApplyLevelToTree .row-action-label")).marginLeft + " / " + cs(d.querySelector("#viewbarNew .row-action-label")).marginLeft);
  setLabels("hover");

  section("label-settings d. #fhTabs sits in the View group, its caption only with captions on");
  const vbView = d.getElementById("vbView");
  assert(vbView && vbView.classList.contains("vb-group") && vbView.querySelector("#fhTabs") && vbView.querySelector(":scope > .group-caption").textContent === "View", "#vbView > caption 'View' + #fhTabs");
  set("settingsToolbarCaptions", "0");
  assert(!shown(vbView.querySelector(".group-caption")), "captions off: no View caption");
  set("settingsToolbarCaptions", "1");
  assert(shown(vbView.querySelector(".group-caption")), "captions on: View caption");
  set("settingsToolbarCaptions", "0");

  section("label-settings e. The \"?\" menu: rows, switches in sync with Settings, persistence");
  const btnHelp = d.getElementById("btnHelp"), menu = d.getElementById("helpMenu");
  const key = k => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const sw = id => d.getElementById(id).getAttribute("aria-checked");
  assert(menu.classList.contains("hidden"), "closed at start");
  fireClick(btnHelp, w);
  assert(!menu.classList.contains("hidden") && btnHelp.getAttribute("aria-expanded") === "true", "the button opens the menu");
  assert([...menu.querySelectorAll("[role^=menuitem]")].map(e => e.textContent.replace(/\s+/g, " ").trim()).join("|") === "Where is what??|Hover descriptions|Group captions|All toolbar settings…", "rows: Where is what?, two switches, All toolbar settings…");
  assert(sw("helpMenuDesc") === "true" && sw("helpMenuCaps") === "false", "switches reflect the defaults");
  fireClick(d.getElementById("helpMenuCaps"), w);
  assert(!menu.classList.contains("hidden"), "a toggle keeps the menu open");
  assert(sw("helpMenuCaps") === "true" && d.body.classList.contains("toolbar-captions") && d.getElementById("settingsToolbarCaptions").value === "1" && w.localStorage.getItem("philogg-toolbar-captions") === "1", "captions switch: body, Settings select and storage");
  fireClick(d.getElementById("helpMenuDesc"), w);
  assert(sw("helpMenuDesc") === "false" && d.body.classList.contains("hover-descriptions-off") && d.getElementById("settingsHoverDescriptions").value === "0" && w.localStorage.getItem("philogg-hover-descriptions") === "0", "descriptions switch: body, Settings select and storage");
  // Settings -> menu direction
  set("settingsHoverDescriptions", "1");
  set("settingsToolbarCaptions", "0");
  assert(sw("helpMenuDesc") === "true" && sw("helpMenuCaps") === "false", "changing Settings updates the open menu");
  key("Escape");
  assert(menu.classList.contains("hidden") && btnHelp.getAttribute("aria-expanded") === "false", "Esc closes the menu");
  fireClick(btnHelp, w);
  assert(!menu.classList.contains("hidden"), "reopened");
  fireClick(d.querySelector("#tree"), w);
  assert(menu.classList.contains("hidden"), "a click outside closes it");
  fireClick(btnHelp, w);
  fireClick(btnHelp, w);
  assert(menu.classList.contains("hidden"), "the button toggles it");
  fireClick(btnHelp, w);
  fireClick(d.getElementById("helpMenuSettings"), w);
  assert(menu.classList.contains("hidden") && !d.getElementById("settingsDialog").classList.contains("hidden"), "All toolbar settings… closes the menu and opens Settings");
  w.closeSettingsDialog();
  assert(w.eval("anyEscapeOverlayOpen()") === false, "nothing left open");
  fireClick(btnHelp, w);
  assert(w.eval("anyEscapeOverlayOpen()") === true, "the open menu counts as an Esc overlay (the ? key does not open the overlay over it)");
  fireClick(d.getElementById("helpMenuWhere"), w);
  assert(menu.classList.contains("hidden") && !d.getElementById("whereIsWhat").classList.contains("hidden"), "Where is what? closes the menu and opens the overlay");
  w.hideWhereIsWhat();
  // Persisted state is applied at the next boot (see the boot test below).
  set("settingsHoverDescriptions", "0");
  set("settingsToolbarCaptions", "1");
  set("settingsHoverDescriptions", "1");
  set("settingsToolbarCaptions", "0");
}, { toolbarLabels: "hover" });

await withApp(async (w, d, T) => {
  section("label-settings f. Stored values apply at boot (descriptions off, captions on)");
  assert(d.body.classList.contains("hover-descriptions-off") && d.body.classList.contains("toolbar-captions"), "classes at boot");
  assert(d.getElementById("settingsHoverDescriptions").value === "0" && d.getElementById("settingsToolbarCaptions").value === "1", "selects reflect them");
  assert(d.getElementById("helpMenuDesc").getAttribute("aria-checked") === "false" && d.getElementById("helpMenuCaps").getAttribute("aria-checked") === "true", "menu switches reflect them");
}, { beforeParse(window) {
  window.localStorage.setItem("philogg-hover-descriptions", "0");
  window.localStorage.setItem("philogg-toolbar-captions", "1");
} });

await withApp(async (w, d, T) => {
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 200, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const nudge = d.getElementById("hoverNudge");
  const hintBtn = d.querySelector('#sidebarToolbar [data-row-action="edit"]');
  const views = () => parseInt(w.localStorage.getItem("philogg-hover-card-views") || "0", 10);
  const seen = () => w.localStorage.getItem("philogg-hover-nudge-seen");
  const open = () => !nudge.classList.contains("hidden");
  const reset = () => { w.eval("hoverCardViews = null; hoverNudgeShownThisPage = false;"); w.localStorage.removeItem("philogg-hover-card-views"); w.localStorage.removeItem("philogg-hover-nudge-seen"); nudge.classList.add("hidden"); };
  const hoverN = n => { for (let i = 0; i < n; i++) w.noteHoverCardShown(hintBtn); };
  w.eval("HOVER_NUDGE_AFTER = 4");

  section("label-settings g. The nudge appears exactly once, at the threshold");
  assert(w.eval("HOVER_NUDGE_AFTER") === 4 && w.eval("typeof HOVER_NUDGE_AFTER") === "number", "the threshold is one constant");
  hoverN(3);
  assert(views() === 3 && !open(), "below the threshold: counted, no toast");
  hoverN(1);
  assert(views() === 4 && open() && nudge.textContent.includes("Seen enough descriptions?"), "at the threshold: the toast shows");
  assert([...nudge.querySelectorAll("button")].map(b => b.textContent).join() === "Got it, hide them,Keep", "two buttons: Got it, hide them / Keep");
  nudge.classList.add("hidden"); // (dismissed without a button: the page flag still limits it to once per page)
  hoverN(5);
  assert(!open(), "not shown a second time on the same page");

  section("label-settings h. \"Keep\" only sets the seen flag");
  reset(); hoverN(4);
  assert(open(), "sanity: toast open");
  fireClick(d.getElementById("hoverNudgeKeep"), w);
  assert(!open() && seen() === "1" && !d.body.classList.contains("hover-descriptions-off") && w.localStorage.getItem("philogg-hover-descriptions") === null, "Keep: toast gone, flag set, descriptions untouched");
  w.eval("hoverNudgeShownThisPage = false;");
  hoverN(10);
  assert(!open(), "never again once seen");

  section("label-settings i. \"Got it, hide them\" turns the descriptions off, sets the flag and says where to get them back");
  reset(); hoverN(4);
  assert(open(), "sanity: toast open");
  fireClick(d.getElementById("hoverNudgeHide"), w);
  assert(!open() && seen() === "1", "toast gone, flag set");
  assert(d.body.classList.contains("hover-descriptions-off") && w.localStorage.getItem("philogg-hover-descriptions") === "0" && d.getElementById("settingsHoverDescriptions").value === "0", "descriptions are off (body, storage, Settings)");
  assert(d.getElementById("helpMenuDesc").getAttribute("aria-checked") === "false", "the ? menu switch follows");
  assert(/Descriptions are off\. Turn them on again in the \? menu or Settings\./.test(d.getElementById("copyToast").textContent), "follow-up toast: " + d.getElementById("copyToast").textContent);

  section("label-settings j. No toast with descriptions off (and no counting), nor on the phone or a coarse pointer");
  reset();
  hoverN(10);
  assert(views() === 0 && !open(), "descriptions off: hovers are not counted, no toast");
  w.setHoverDescriptions(true);
  w.eval("currentLayoutTier = 'phone'");
  hoverN(6);
  assert(!open(), "phone tier: no toast");
  w.eval("currentLayoutTier = 'desktop'; hoverNudgeShownThisPage = false;");
  const mm = w.matchMedia;
  w.matchMedia = q => ({ matches: /pointer:\s*coarse/.test(q), addEventListener() {}, removeEventListener() {} });
  hoverN(1);
  assert(!open(), "touch device (coarse pointer): no toast");
  w.matchMedia = mm;
  hoverN(1);
  assert(open(), "back on a mouse desktop the counter (already past the threshold) shows it");
  nudge.classList.add("hidden");

  section("label-settings k. A real pointer arriving on a different button counts one card view");
  reset();
  w.eval("hoverNudgeShownThisPage = false;");
  const bar = d.getElementById("levelBar");
  const chips = [...bar.querySelectorAll(".level-btn")];
  assert(chips.length >= 2, "sanity: level chips");
  const over = el => el.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  over(chips[0]); over(chips[0]);
  assert(views() === 1, "the same button twice counts once, got " + views());
  over(chips[1]);
  assert(views() === 2, "a different button counts again, got " + views());
}, { toolbarLabels: "hover" });
