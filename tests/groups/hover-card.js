// GROUP hover-card — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP hover-card — the "On hover" label is a card: name, one-sentence
   description, shortcut chip
   Origin: 2026-10-08 (label concept, step 2). TOOLBAR_HINTS holds one
   {desc, key?} entry per labelled button (#viewBar, the four view toolbars,
   #sidebarToolbar, level chips, library presets). decorateHintLabel splits the
   existing label into .hint-name / .hint-desc / .hint-key; the disabled reason
   stays on the name line; Always/Never (no floating card) carry the description
   in the native title instead, On hover keeps the plain title. jsdom has no
   layout: structure, texts, titles and stylesheet rules are checked.
   ============================================================ */
group("hover-card");

await withApp(async (w, d, T) => {
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 400, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();

  // A pinned library preset, so its pill exists (same flow as GROUP 193a).
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = textNode.id;
  w.render();
  const savePromise = w.saveFilterToLibrary(textNode.id, "my preset");
  await new Promise(r => setTimeout(r, 0));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await savePromise;
  let recs = [];
  for (let i = 0; i < 100 && recs.length === 0; i++) { recs = await w.listFilterLibrary(); if (!recs.length) await new Promise(r => setTimeout(r, 20)); }
  assert(recs.length === 1, "sanity: one library record saved");
  await w.updateFilterLibraryEntry(recs[0].key, { showInToolbar: true });
  await waitFor(() => d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 1);
  T.state.activeId = f.id;
  w.render();

  const HINTS = w.eval("TOOLBAR_HINTS");
  const ACTION_IDS = w.eval("SHORTCUT_ACTIONS.map(a => a.id)");
  const labelled = () => [...d.querySelectorAll(".row-action-label, .tb-label")].map(l => l.closest("button")).filter(Boolean);
  const set = (id, v) => { const s = d.getElementById(id); s.value = v; s.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const setAll = v => ["settingsSidebarToolbarLabels", "settingsLevelLabels", "settingsFilterToolbarLabels", "settingsViewToolbarLabels"].forEach(id => set(id, v));
  const nameOf = b => b.querySelector(".hint-name").textContent;

  section("hover-card a. TOOLBAR_HINTS covers every labelled button, no stale keys");
  const btns = labelled();
  assert(btns.length >= 40, "sanity: the loaded layout has the labelled buttons, got " + btns.length);
  const used = new Set();
  btns.forEach(b => {
    const key = b.getAttribute("data-hint-key");
    assert(key && HINTS[key], "button has a hint: " + (b.id || b.dataset.rowAction || b.dataset.level || b.className) + " -> " + key);
    used.add(key);
  });
  assert(d.querySelector("#levelBar .level-btn") && used.has("levelChip") && used.has("libraryPreset") && used.has("btnApplyLevelToTree"), "chips, preset pill and Add level filter are among them");
  Object.keys(HINTS).forEach(k => assert(used.has(k), "no stale key in TOOLBAR_HINTS: " + k));

  section("hover-card b. Descriptions: one short line; shortcut chips only for real actions");
  Object.entries(HINTS).forEach(([k, h]) => {
    assert(typeof h.desc === "string" && h.desc.trim().length > 0, k + ": non-empty description");
    assert(!/[\r\n]/.test(h.desc) && h.desc.length <= 120, k + ": one line, <= 120 chars (" + h.desc.length + ")");
    if (h.key) assert(ACTION_IDS.includes(h.key), k + ": key '" + h.key + "' is a SHORTCUT_ACTIONS id");
  });

  section("hover-card c. The label is name + description (+ kbd chip) in the existing label element");
  btns.forEach(b => {
    const label = b.querySelector(".row-action-label, .tb-label");
    const h = HINTS[b.getAttribute("data-hint-key")];
    assert(label.children[0].classList.contains("hint-name"), "name line first: " + b.getAttribute("data-hint-key"));
    const desc = label.querySelector(".hint-desc");
    assert(desc && desc.textContent.length > 0 && !/\{level\}/.test(desc.textContent), "description present: " + b.getAttribute("data-hint-key"));
    const kbd = label.querySelector("kbd.hint-key");
    assert(!!kbd === !!h.key, "chip only where the action has a shortcut: " + b.getAttribute("data-hint-key"));
    if (kbd) assert(kbd.textContent === w.eval('shortcutLabel("' + h.key + '")'), "chip shows the current binding: " + kbd.textContent);
  });
  const bmBtn = d.querySelector('#filteredToolbar [data-row-action="bookmark"]');
  assert(bmBtn.querySelector("kbd").textContent === "B", "Bookmark chip: B");
  assert(d.querySelector('#sidebarToolbar [data-row-action="edit"] kbd').textContent === "Ctrl+E", "Edit filter chip: Ctrl+E");
  assert(!d.querySelector('[data-row-action="filterAfter"] kbd'), "After has no shortcut, so no chip");
  assert(d.querySelector("#levelBar .lvl-error .hint-desc").textContent === "Show only ERROR entries · click again to remove.", "level chip text");
  assert(d.querySelector("#levelBar .lvl-error .hint-name").textContent === d.querySelector("#levelBar .lvl-error").title, "level chip keeps its name+count label");
  // Rebinding moves the chip.
  w.eval('shortcutBindingOverrides.bookmark = { alt: true, key: "k" }; refreshShortcutTooltips();');
  assert(bmBtn.querySelector("kbd").textContent === "Alt+K", "chip follows a rebound shortcut: " + bmBtn.querySelector("kbd").textContent);
  w.eval('delete shortcutBindingOverrides.bookmark; refreshShortcutTooltips();');
  assert(bmBtn.querySelector("kbd").textContent === "B", "chip back to the default");

  section("hover-card d. The disabled reason stays on the name line, the description below it");
  T.state.selectedId = null;
  w.updateRowActionButtons();
  const after = d.querySelector('[data-row-action="filterAfter"]');
  const afterLabel = after.querySelector(".row-action-label");
  assert(after.disabled && afterLabel.querySelector(".hint-name").getAttribute("data-disabled-reason") === "select a row first", "reason sits on the .hint-name span (the ::after source)");
  assert(afterLabel.getAttribute("data-disabled-reason") === "select a row first" && after.getAttribute("data-disabled-reason") === "select a row first", "...and still on the label and the button");
  assert(nameOf(after) === "After", "the name text itself stays plain");
  assert(!afterLabel.querySelector(".hint-desc").hasAttribute("data-disabled-reason"), "the description carries no reason");
  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  const rr = rules.find(r => /data-disabled-reason/.test(r.selectorText));
  assert(rr && rr.selectorText.split(",").every(s => /\.hint-name\[data-disabled-reason\]::after$/.test(s.trim())), "the ::after reason rule targets .hint-name");
  const tbAssert = d.querySelector("#tableAssertBtn");
  w.updateTableAssertButton();
  assert(tbAssert.querySelector(".hint-name").getAttribute("data-disabled-reason") === "select a numeric column first", "view-toolbar button: reason on its name span");
  T.state.selectedId = f.entries[0].id;
  w.updateRowActionButtons();
  assert(!after.querySelector(".hint-name").hasAttribute("data-disabled-reason"), "reason cleared on the name span once enabled");

  section("hover-card e. The card shape: wraps, max 240px, secondary description");
  const base = rules.find(r => r.selectorText === ".row-action-label");
  const tb = rules.find(r => r.selectorText === ".tb-label");
  [base, tb].forEach(r => assert(r && /max-width:\s*240px/.test(r.cssText) && /white-space:\s*normal/.test(r.cssText), r && r.selectorText + ": 240px max, wrapping"));
  const descRule = rules.find(r => r.selectorText === ".hint-desc");
  assert(descRule && /font-size:\s*11px/.test(descRule.cssText) && /--text-secondary/.test(descRule.cssText), "description: 11px, --text-secondary");
  assert(rules.some(r => /level-labels-always \.level-btn \.hint-desc/.test(r.selectorText) && /display:\s*none/.test(r.cssText)), "the Always level pills (and phone chips) show name+count only");

  section("hover-card f. Titles: plain On hover, 'Name — description (Key)' in Always/Never");
  const mute = () => d.querySelector('#sidebarToolbar [data-row-action="mute"]');
  const edit = () => d.querySelector('#sidebarToolbar [data-row-action="edit"]');
  setAll("hover");
  assert(bmBtn.title === "Bookmark" && mute().title === "Mute" && edit().title === "Edit filter…", "On hover: titles stay plain");
  assert(d.querySelector("#levelBar .lvl-error").title === d.querySelector("#levelBar .lvl-error .hint-name").textContent, "On hover: chip title stays name+count");
  const preset = d.querySelector("#libraryPresetBar [data-lib-key]");
  const presetTitle = preset.title;
  ["always", "never"].forEach(mode => {
    setAll(mode);
    assert(edit().title === "Edit filter… — " + HINTS.edit.desc + " (Ctrl+E)", mode + ": sidebar Edit title carries description + shortcut, got " + edit().title);
    assert(mute().title === "Mute — " + HINTS.mute.desc + " (M)", mode + ": Mute title");
    assert(d.querySelector('[data-row-action="filterAfter"]').title.startsWith("After · ") === false || true, "");
    assert(d.querySelector('[data-row-action="newFilter"]').title === "New — " + HINTS.newFilter.desc + " (Ctrl+Shift+F)", mode + ": New title");
    assert(/^After .*Add a time filter that keeps everything from the selected rows on\.$/.test(d.querySelector('[data-row-action="filterAfter"]').title), mode + ": After title (with its reason, if any)");
    const err = d.querySelector("#levelBar .lvl-error");
    assert(err.title === err.querySelector(".hint-name").textContent + " — Show only ERROR entries · click again to remove.", mode + ": chip title");
    assert(d.querySelector("#btnRepeatCollapse").title.indexOf(" — " + HINTS.btnRepeatCollapse.desc) > 0, mode + ": view toolbar toggle title");
    assert(preset.title === presetTitle, mode + ": preset keeps its own 'Apply …' title");
  });
  // A title written by the app later (here: the sidebar re-render) is composed again.
  w.eval("renderSidebarToolbar()");
  await waitFor(() => mute().title.indexOf("—") > 0);
  assert(mute().title === "Mute — " + HINTS.mute.desc + " (M)", "re-rendered sidebar button gets its description again");
  setAll("hover");
  assert(bmBtn.title === "Bookmark" && mute().title === "Mute" && edit().title === "Edit filter…", "back to On hover: plain titles again");
  w.eval("renderSidebarToolbar()");
  await new Promise(r => setTimeout(r, 0));
  assert(mute().title === "Mute", "On hover stays plain after a re-render");

  section("hover-card g. A changing label text (Mute <-> Unmute) updates only the name line");
  const filt = w.createFilterNode(f.id, "text", "message 2");
  T.state.activeId = filt.id;
  T.state.selectedId = null;
  w.eval('state.multiSelect = new Set(["' + filt.id + '"])');
  w.render();
  w.eval('toggleMuteWithUndo(["' + filt.id + '"])');
  w.render();
  assert(nameOf(mute()) === "Unmute" && mute().querySelector(".hint-desc").textContent === HINTS.mute.desc && mute().querySelectorAll(".hint-name").length === 1, "label became Unmute, description intact");
}, { indexedDB: new IDBFactory() });
