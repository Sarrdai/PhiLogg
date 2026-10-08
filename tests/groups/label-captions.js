// GROUP label-captions — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP label-captions — group captions (Settings -> Group captions)
   Origin: 2026-10-08 (label concept step 1, reworked in the label settings
   split). One global setting (`philogg-toolbar-captions`, body class
   `toolbar-captions`, default off) switches the small uppercase caption above
   every toolbar group, independent of the four button-label modes. #viewBar
   is made of non-breaking .vb-group wrappers (incl. the "View" group around
   the view tabs), #sidebarToolbar of three captioned groups (Edit / Effect /
   Library). jsdom has no layout: captions are checked through the markup
   (aria-hidden caption spans) and computed styles (display / position) of the
   stylesheet rules, with the setting applied through its own select.
   ============================================================ */
group("label-captions");

await withApp(async (w, d, T) => {
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 400, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const cs = el => w.getComputedStyle(el);
  const set = (id, v) => { const s = d.getElementById(id); s.value = v; s.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const SETTINGS = ["settingsSidebarToolbarLabels", "settingsLevelLabels", "settingsFilterToolbarLabels", "settingsViewToolbarLabels"];
  const setAll = v => SETTINGS.forEach(id => set(id, v));
  const shown = c => cs(c).display !== "none";

  // Captions: [selector of the caption's parent group, settings select that governs it, expected text]
  const VIEW_TOOLBARS = ["#contextToolbar", "#filteredToolbar", "#tableToolbar", "#plotToolbar"];
  const CAPTIONS = [
    ["#vbView", "View"], ["#vbLevel", "Level"], ["#vbAddFilter", "Add filter"], ["#vbPresets", "Presets"], ["#vbCreate", "Create"],
    ["#sidebarToolbar .stb-group[data-stb-group=edit]", "Edit"], ["#sidebarToolbar .stb-group[data-stb-group=effect]", "Effect"], ["#sidebarToolbar .stb-group[data-stb-group=library]", "Library"],
    ["#contextToolbar [data-toolbar-group=controls]", "Matches"], ["#contextToolbar [data-toolbar-group=settings]", "Display"], ["#contextToolbar [data-toolbar-group=actions]", "Selection"],
    ["#filteredToolbar [data-toolbar-group=settings]", "Display"], ["#filteredToolbar [data-toolbar-group=actions]", "Selection"],
    ["#tableToolbar [data-toolbar-group=actions]", "Actions"], ["#plotToolbar [data-toolbar-group=controls]", "View"], ["#plotToolbar [data-toolbar-group=actions]", "Actions"],
  ];

  section("label-captions a. Every group carries one aria-hidden caption span");
  CAPTIONS.forEach(([sel, text]) => {
    const g = d.querySelector(sel);
    assert(g, "group exists: " + sel);
    const caps = [...g.children].filter(c => c.classList.contains("group-caption"));
    assert(caps.length === 1 && caps[0].textContent === text && caps[0].getAttribute("aria-hidden") === "true", sel + ": one aria-hidden caption '" + text + "', got " + caps.map(c => c.textContent).join("|"));
  });
  assert(!d.querySelector("#fhTabs .group-caption") && !d.querySelector("#levelBar .group-caption"), "the tab switcher and the chips carry no caption of their own (the group does)");

  const setCaps = on => set("settingsToolbarCaptions", on ? "1" : "0");
  section("label-captions b. One global setting switches every caption, whatever the label modes are");
  assert(w.localStorage.getItem("philogg-toolbar-captions") === null && !d.body.classList.contains("toolbar-captions"), "default: captions off");
  const captionsShownFor = () => CAPTIONS.map(c => c[0]).filter(sel => shown(d.querySelector(sel + " > .group-caption")));
  ["hover", "off", "inline"].forEach(mode => {
    setAll(mode);
    CAPTIONS.forEach(([sel]) => assert(!shown(d.querySelector(sel + " > .group-caption")), mode + ", captions off: caption hidden for " + sel));
  });
  setCaps(true);
  assert(w.localStorage.getItem("philogg-toolbar-captions") === "1" && d.body.classList.contains("toolbar-captions"), "captions on: stored + body class");
  ["hover", "off", "inline"].forEach(mode => {
    setAll(mode);
    CAPTIONS.map(c => c[0]).filter(sel => sel !== "#vbPresets").forEach(sel => {
      if (sel === "#vbLevel") assert(d.querySelector("#levelBar .level-btn"), "sanity: level chips exist");
      assert(shown(d.querySelector(sel + " > .group-caption")), mode + ", captions on: caption shown for " + sel);
    });
  });
  setAll("hover");
  VIEW_TOOLBARS.forEach(t => d.querySelectorAll(t + " > .toolbar-group > .group-caption").forEach(c => assert(shown(c), "caption shown in " + t + " (" + c.textContent + ")")));
  const presets = d.querySelector("#vbPresets > .group-caption");
  assert(d.querySelector("#libraryPresetBar").hidden && !shown(presets), "Presets caption hidden while no preset is pinned");
  d.querySelector("#libraryPresetBar").hidden = false;
  assert(shown(presets), "Presets caption shown once a preset is pinned (the preset bar is displayed)");
  d.querySelector("#libraryPresetBar").hidden = true;
  d.body.classList.add("layout-phone");
  assert(!shown(d.querySelector("#vbAddFilter > .group-caption")) && !shown(d.querySelector("#sidebarToolbar .group-caption")), "phone: captions never show");
  d.body.classList.remove("layout-phone");
  setCaps(false);
  assert(captionsShownFor().length === 0 && w.localStorage.getItem("philogg-toolbar-captions") === "0", "captions off again: all hidden, stored 0");

  section("label-captions c. With captions on the buttons stay icon-only in On hover (no pill growth), level chips unchanged");
  setCaps(true);
  setAll("hover");
  const labelSel = ".row-action-label, .tb-label";
  const btns = [...d.querySelectorAll("#viewBar .row-action-btn:not(.level-btn), #sidebarToolbar .row-action-btn, #contextToolbar, #filteredToolbar, #tableToolbar, #plotToolbar")]
    .flatMap(c => c.matches(".row-action-btn") ? [c] : [...c.querySelectorAll(".toolbar-icon-btn")]);
  assert(btns.length >= 20, "sanity: many icon buttons covered, got " + btns.length);
  btns.forEach(b => {
    const lab = b.querySelector(labelSel);
    if (!lab) return;
    const id = b.getAttribute("data-row-action") || b.id || b.className;
    assert(cs(lab).position === "absolute", "captions on, hover: floating label of " + id);
    assert(cs(b).width !== "auto" && cs(b).paddingRight !== "10px", "captions on, hover: " + id + " keeps its icon-only width (no pill growth)");
  });
  const lvl = [...d.querySelectorAll("#levelBar .level-btn")];
  assert(lvl.length >= 3, "sanity: level chips");
  lvl.forEach(l => assert(cs(l).width === "28px", l.dataset.level + ": still a 28px circle in On hover"));

  section("label-captions d. The Collapse-repeats chevron stays icon-only and keeps its own rules");
  setAll("inline");
  const chev = d.querySelector("#btnRepeatMenu");
  assert(cs(chev).width === "14px" && cs(chev.querySelector(".tb-label")).display === "none", "chevron: 14px, no label in Inline");
  setAll("hover");
  assert(cs(chev.querySelector(".tb-label")).display !== "none", "chevron keeps its floating label in On hover");

  section("label-captions e. #sidebarToolbar: three captioned groups, one row of icons each");
  setAll("hover");
  const stb = d.querySelector("#sidebarToolbar");
  const groups = [...stb.querySelectorAll(":scope > .stb-group")];
  assert(groups.map(g => g.dataset.stbGroup).join() === "edit,effect,library", "groups Edit, Effect, Library, got " + groups.map(g => g.dataset.stbGroup).join());
  const actionsOf = g => [...g.querySelectorAll(".row-action-btn")].map(b => b.dataset.rowAction).join();
  assert(actionsOf(groups[0]) === "rename,edit,linkWith", "Edit: Rename, Edit filter, Link with, got " + actionsOf(groups[0]));
  assert(actionsOf(groups[1]) === "invert,mute,clockOffset", "Effect: Invert/NOT, Mute, Adjust clock, got " + actionsOf(groups[1]));
  assert(actionsOf(groups[2]) === "addToLibrary", "Library: Add to library, got " + actionsOf(groups[2]));
  groups.forEach(g => {
    const row = g.querySelector(":scope > .stb-group-row");
    assert(row && cs(row).display === "flex" && cs(row).flexWrap !== "wrap", "one non-wrapping row of icons in " + g.dataset.stbGroup);
    assert(cs(g).flexWrap !== "wrap" && cs(g).flexDirection === "column", "group " + g.dataset.stbGroup + " is a caption-over-row column that never splits");
  });
  assert(stb.querySelectorAll(":scope > .row-action-separator").length === 2, "a separator between each pair of groups");
  assert(!stb.querySelector(":scope > .row-action-btn"), "no loose button outside a group (no ragged rows)");
  assert(stb.querySelector('[data-row-action="addToLibrary"] .add-badge'), "Add to library keeps its add badge");

  section("label-captions f. #viewBar: non-breaking groups, the bar wraps only between them");
  const vb = d.querySelector("#viewBar");
  assert(cs(vb).display === "flex" && cs(vb).flexWrap === "wrap", "#viewBar is a wrapping flex row");
  const kids = [...vb.children].filter(c => !c.classList.contains("row-action-separator"));
  assert(kids.map(c => c.id).join() === "vbView,vbLevel,vbAddFilter,vbPresets,vbCreate", "bar children: five groups (View incl.), got " + kids.map(c => c.id).join());
  kids.forEach(c => assert(cs(c).flexGrow === "0" && cs(c).flexShrink === "0", c.id + " is flex:none (moves as a whole)"));
  kids.filter(c => c.classList.contains("vb-group")).forEach(g => {
    assert(cs(g).flexDirection === "column", g.id + ": caption above the row");
    const row = g.querySelector(".vb-group-row, .row-actions");
    assert(cs(row).display === "flex", g.id + ": inner row is a flex row");
  });
  assert(cs(d.querySelector("#vbLevel > .vb-group-row")).flexWrap === "nowrap" && cs(d.querySelector("#vbPresets > .vb-group-row")).flexWrap === "nowrap" && cs(d.querySelector("#vbAddFilter > .row-actions")).flexWrap === "nowrap" && cs(d.querySelector("#vbCreate > .row-actions")).flexWrap === "nowrap",
    "no group wraps inside itself (rows are nowrap)");
  assert(d.querySelector("#vbPresets #btnLibrary") && d.querySelector("#vbLevel #btnApplyLevelToTree") && d.querySelector("#vbCreate [data-row-action=newFilter]"), "Library, Add level filter and New sit in their groups");
  assert(!d.querySelector("#viewBar > .row-action-btn") && !d.querySelector("#viewBar > #levelBar"), "no loose buttons directly in the bar");

  section("label-captions g. The \"+\" badge is anchored to the icon box and never clipped");
  ["#btnApplyLevelToTree", "#viewbarNew .row-action-btn", "#sidebarToolbar [data-row-action=addToLibrary]"].forEach(sel => {
    const b = d.querySelector(sel);
    assert(b && b.querySelector(".row-action-hit .add-badge-wrap .add-badge"), sel + ": badge lives inside the 28px icon box");
    ["inline", "hover", "off"].forEach(m => {
      setAll(m);
      assert(cs(b).overflow !== "hidden", sel + " (" + m + "): button does not clip its badge overhang, overflow=" + cs(b).overflow);
    });
  });

  section("label-captions h. Captions grow the view toolbars by the caption row, nothing scrolls or clips");
  setCaps(false);
  setAll("hover");
  VIEW_TOOLBARS.forEach(t => assert(cs(d.querySelector(t)).height === "36px" && cs(d.querySelector(t)).overflowX === "visible", t + " captions off: fixed 36px row, overflow visible (floating labels unclipped)"));
  setCaps(true);
  VIEW_TOOLBARS.forEach(t => {
    const bar = d.querySelector(t);
    assert(cs(bar).height !== "36px" && cs(bar).minHeight === "36px", t + " captions on: height auto (grows by the caption row), min 36px");
    assert(cs(bar).overflowX === "visible", t + " captions on: no inner scrolling");
    assert(cs(bar).alignItems === "flex-end", t + " captions on: groups sit on the buttons' baseline");
  });
  setAll("inline");
  VIEW_TOOLBARS.forEach(t => assert(cs(d.querySelector(t)).overflowX === "visible", t + " inline: no inner scrolling or clipping"));

  section("label-captions i. The \"View\" group wraps the view tabs: shown with captions only, hidden with the tabs");
  setCaps(false);
  const vbView = d.querySelector("#vbView");
  assert(vbView && vbView.querySelector(":scope > .vb-group-row > #fhTabs"), "#fhTabs sits in #vbView's row");
  assert(!vbView.classList.contains("vb-hidden") && cs(vbView).display !== "none", "tabs visible (a log is open): the group is displayed");
  assert(!shown(vbView.querySelector(":scope > .group-caption")), "captions off: no View caption, the group is just the tabs");
  setCaps(true);
  assert(shown(vbView.querySelector(":scope > .group-caption")) && vbView.querySelector(":scope > .group-caption").textContent === "View", "captions on: View caption above the tabs");
  w.setFhTabsVisible(false);
  assert(cs(d.querySelector("#fhTabs")).display === "none" && cs(vbView).display === "none", "hidden tabs hide the whole group (no orphan caption)");
  w.setFhTabsVisible(true);
  assert(cs(vbView).display !== "none", "shown again");
}, { toolbarLabels: "hover" });
