// GROUP label-captions — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP label-captions — "Always" = icon-only buttons + group captions
   Origin: 2026-10-08 (label concept, step 1). In "Always" the filter, view and
   sidebar label settings no longer grow a text pill on every button: each GROUP
   gets a small uppercase caption above its icon-only buttons (the level chips
   keep their name+count pills). #viewBar is made of non-breaking .vb-group
   wrappers, #sidebarToolbar of three captioned groups (Edit / Effect /
   Library). jsdom has no layout: captions and pills are checked through the
   markup (aria-hidden caption spans) and computed styles (display / position)
   of the stylesheet rules, with the setting applied through its own select.
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
    ["#vbLevel", "Level"], ["#vbAddFilter", "Add filter"], ["#vbPresets", "Presets"], ["#vbCreate", "Create"],
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
  assert(!d.querySelector("#fhTabs .group-caption") && !d.querySelector("#levelBar .group-caption"), "the tab switcher and the chips carry no caption of their own");

  section("label-captions b. Captions show in Always only (per setting), never in On hover / Never");
  ["hover", "never"].forEach(mode => {
    setAll(mode);
    CAPTIONS.forEach(([sel]) => assert(!shown(d.querySelector(sel + " > .group-caption")), mode + ": caption hidden for " + sel));
  });
  // Each setting switches on only its own captions.
  const OWNERS = [
    ["settingsLevelLabels", ["#vbLevel"]],
    ["settingsFilterToolbarLabels", ["#vbAddFilter", "#vbCreate"]],
    ["settingsSidebarToolbarLabels", ["#sidebarToolbar .stb-group[data-stb-group=edit]", "#sidebarToolbar .stb-group[data-stb-group=effect]", "#sidebarToolbar .stb-group[data-stb-group=library]"]],
    ["settingsViewToolbarLabels", ["#contextToolbar [data-toolbar-group=settings]", "#filteredToolbar [data-toolbar-group=actions]", "#tableToolbar [data-toolbar-group=actions]", "#plotToolbar [data-toolbar-group=controls]"]],
  ];
  OWNERS.forEach(([id, own]) => {
    setAll("hover");
    set(id, "always");
    own.forEach(sel => {
      if (sel === "#vbLevel") assert(d.querySelector("#levelBar .level-btn"), "sanity: level chips exist");
      assert(shown(d.querySelector(sel + " > .group-caption")), id + " always: caption shown for " + sel);
    });
    CAPTIONS.map(c => c[0]).filter(s => !own.includes(s) && s !== "#vbPresets" && !(id === "settingsViewToolbarLabels" && VIEW_TOOLBARS.some(t => s.startsWith(t))))
      .forEach(sel => assert(!shown(d.querySelector(sel + " > .group-caption")), id + " always: caption of " + sel + " stays hidden"));
  });
  setAll("always");
  VIEW_TOOLBARS.forEach(t => d.querySelectorAll(t + " > .toolbar-group > .group-caption").forEach(c => assert(shown(c), "view Always: caption shown in " + t + " (" + c.textContent + ")")));
  const presets = d.querySelector("#vbPresets > .group-caption");
  assert(d.querySelector("#libraryPresetBar").hidden && !shown(presets), "Presets caption hidden while no preset is pinned");
  d.querySelector("#libraryPresetBar").hidden = false;
  assert(shown(presets), "Presets caption shown once a preset is pinned (the preset bar is displayed)");
  d.querySelector("#libraryPresetBar").hidden = true;
  d.body.classList.add("layout-phone");
  assert(!shown(d.querySelector("#vbAddFilter > .group-caption")) && !shown(d.querySelector("#sidebarToolbar .group-caption")), "phone: captions never show");
  d.body.classList.remove("layout-phone");

  section("label-captions c. No button label becomes an inline pill in Always (level chips excepted)");
  setAll("always");
  const labelSel = ".row-action-label, .tb-label";
  const btns = [...d.querySelectorAll("#viewBar .row-action-btn:not(.level-btn), #sidebarToolbar .row-action-btn, #contextToolbar, #filteredToolbar, #tableToolbar, #plotToolbar")]
    .flatMap(c => c.matches(".row-action-btn") ? [c] : [...c.querySelectorAll(".toolbar-icon-btn")]);
  assert(btns.length >= 20, "sanity: many icon buttons covered, got " + btns.length);
  btns.forEach(b => {
    const lab = b.querySelector(labelSel);
    if (!lab) return;
    const id = b.getAttribute("data-row-action") || b.id || b.className;
    assert(cs(lab).display === "none", "Always: label of " + id + " is not rendered inline (display none, got " + cs(lab).display + ")");
    assert(cs(b).width !== "auto" && cs(b).paddingRight !== "10px", "Always: " + id + " keeps its icon-only width (no pill growth)");
    assert(b.title && b.title.length, id + " keeps its title tooltip");
  });
  const lvl = [...d.querySelectorAll("#levelBar .level-btn")];
  assert(lvl.length >= 3, "sanity: level chips");
  lvl.forEach(l => {
    assert(cs(l.querySelector(".row-action-label")).position === "static" && cs(l.querySelector(".row-action-label")).display !== "none", l.dataset.level + ": level chips keep their name+count pill in Always");
  });
  assert(cs(d.querySelector("#btnApplyLevelToTree .row-action-label")).display === "none", "Add level filter is icon-only in Always");
  // Never/hover behaviour is untouched: floating label spans still exist and are absolutely positioned.
  setAll("hover");
  btns.forEach(b => { const lab = b.querySelector(labelSel); if (lab) assert(cs(lab).position === "absolute", "hover: floating label of " + (b.getAttribute("data-row-action") || b.id)); });
  setAll("never");
  btns.forEach(b => { const lab = b.querySelector(labelSel); if (lab) assert(cs(lab).display === "none", "never: label hidden for " + (b.getAttribute("data-row-action") || b.id)); });

  section("label-captions d. The Collapse-repeats chevron stays icon-only and keeps its own rules");
  setAll("always");
  const chev = d.querySelector("#btnRepeatMenu");
  assert(cs(chev).width === "14px" && cs(chev.querySelector(".tb-label")).display === "none", "chevron: 14px, no label in Always");
  setAll("hover");
  assert(cs(chev.querySelector(".tb-label")).display !== "none", "chevron keeps its floating label in On hover");

  section("label-captions e. #sidebarToolbar: three captioned groups, one row of icons each");
  setAll("always");
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
  assert(kids.map(c => c.id).join() === "fhTabs,vbLevel,vbAddFilter,vbPresets,vbCreate", "bar children: tabs + four groups, got " + kids.map(c => c.id).join());
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
    ["always", "hover", "never"].forEach(m => {
      setAll(m);
      assert(cs(b).overflow !== "hidden", sel + " (" + m + "): button does not clip its badge overhang, overflow=" + cs(b).overflow);
    });
  });

  section("label-captions h. Always grows the view toolbars by the caption row, nothing scrolls or clips");
  setAll("hover");
  VIEW_TOOLBARS.forEach(t => assert(cs(d.querySelector(t)).height === "36px" && cs(d.querySelector(t)).overflowX === "visible", t + " hover: fixed 36px row, overflow visible (floating labels unclipped)"));
  setAll("always");
  VIEW_TOOLBARS.forEach(t => {
    const bar = d.querySelector(t);
    assert(cs(bar).height !== "36px" && cs(bar).minHeight === "36px", t + " always: height auto (grows by the caption row), min 36px");
    assert(cs(bar).overflowX === "visible", t + " always: no inner scrolling any more (icon-only buttons always fit)");
    assert(cs(bar).alignItems === "flex-end", t + " always: groups sit on the buttons' baseline");
  });
  assert(cs(d.querySelector("#levelBar .level-btn .row-action-label")).zIndex === "auto", "the level chip pill does not paint above popups (z-index auto)");
}, { toolbarLabels: "hover" });
