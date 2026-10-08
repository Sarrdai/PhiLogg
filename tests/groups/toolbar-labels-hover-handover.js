// GROUP toolbar-labels-hover-handover — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP toolbar-labels-hover-handover — "Always" default, calm hover pill
   hand-over, disabled reason in the pill
   Origin: 2026-10-08. (1) Both toolbar-label settings default to "Always"
   (a stored "hover"/"never" still applies). (2) On-hover mode: the first
   pill of a hover session fades in, moving to a neighbour in the same group
   puts .labels-live on the container (transition:none) until the pointer
   leaves the group. (3) A disabled button's pill appends its reason
   (data-disabled-reason, CSS ::after, On-hover mode only).
   ============================================================ */
group("toolbar-labels-hover-handover");

// ---- a. defaults ----
const FOUR = ["sidebar-toolbar-labels", "level-labels", "filter-toolbar-labels", "view-toolbar-labels"];
await withApp(async (w, d, T) => {
  section("toolbar-labels-hover-handover a. All four settings default to 'hover' with empty localStorage");
  ["philogg-sidebar-toolbar-labels", "philogg-level-labels", "philogg-filter-toolbar-labels", "philogg-view-toolbar-labels"]
    .forEach(k => assert(w.localStorage.getItem(k) === null, "sanity: " + k + " not persisted"));
  assert(T.filterToolbarLabels === "hover" && T.viewToolbarLabels === "hover", "filter + view default to 'hover'");
  FOUR.forEach(p => assert(!d.body.classList.contains(p + "-always") && !d.body.classList.contains(p + "-never"), p + ": no body class at the default"));
  ["settingsSidebarToolbarLabels", "settingsLevelLabels", "settingsFilterToolbarLabels", "settingsViewToolbarLabels"]
    .forEach(id => assert(d.querySelector("#" + id).value === "hover", id + " shows On hover"));
  assert(w.normalizeToolbarLabelsMode("garbage") === "hover" && w.normalizeToolbarLabelsMode(null) === "hover", "unknown values fall back to hover");
});
await withApp(async (w, d, T) => {
  section("toolbar-labels-hover-handover a2. Stored values apply per setting");
  assert(d.body.classList.contains("sidebar-toolbar-labels-always") && !d.body.classList.contains("sidebar-toolbar-labels-never"), "sidebar: always");
  assert(d.body.classList.contains("level-labels-never"), "levels: never");
  assert(!d.body.classList.contains("filter-toolbar-labels-always") && !d.body.classList.contains("filter-toolbar-labels-never"), "filter: hover, no class");
  assert(d.body.classList.contains("view-toolbar-labels-never"), "view: never");
  assert(d.querySelector("#settingsSidebarToolbarLabels").value === "always" && d.querySelector("#settingsLevelLabels").value === "never", "selects reflect the stored values");
}, { beforeParse(window) {
  window.localStorage.setItem("philogg-sidebar-toolbar-labels", "always");
  window.localStorage.setItem("philogg-level-labels", "never");
  window.localStorage.setItem("philogg-filter-toolbar-labels", "hover");
  window.localStorage.setItem("philogg-view-toolbar-labels", "never");
} });

// ---- b. hand-over ----
await withApp(async (w, d, T) => {
  section("toolbar-labels-hover-handover b. Container keeps .labels-live across neighbours, drops it on mouseleave");
  const container = d.querySelector('[data-row-actions="viewbar"]');
  const hits = [...container.querySelectorAll(".row-action-hit")];
  assert(hits.length >= 3, "sanity: several hit zones");
  hits.forEach((h, i) => { h.getBoundingClientRect = () => ({ left: i * 40, right: i * 40 + 28, top: 0, bottom: 28, width: 28, height: 28 }); });
  const move = (x, y = 10) => container.dispatchEvent(new w.MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
  const live = () => container.classList.contains("labels-live");
  const expandedIdx = () => hits.findIndex(h => h.closest(".row-action-btn").classList.contains("expanded"));

  move(10);
  assert(expandedIdx() === 0 && !live(), "first pill: expanded, no live class (it fades in)");
  move(12);
  assert(expandedIdx() === 0 && !live(), "still the same button: still not live");
  move(50);
  assert(expandedIdx() === 1 && live(), "neighbour: pill swapped, container is live");
  move(35, 10); // gap between buttons: everything collapses...
  assert(expandedIdx() === -1 && live(), "...but a gap does not end the session");
  move(90);
  assert(expandedIdx() === 2 && live(), "next button after the gap: still live");
  container.dispatchEvent(new w.MouseEvent("mouseleave"));
  assert(!live() && expandedIdx() === -1, "leaving the group removes live and collapses");
  move(10);
  assert(expandedIdx() === 0 && !live(), "a new session starts with a fading first pill again");

  section("toolbar-labels-hover-handover b2. Plain-:hover containers (#levelBar, #libraryPresetBar) get the same hand-over");
  const bar = d.querySelector("#levelBar");
  bar.innerHTML = '<button class="row-action-btn" id="hA"><span class="row-action-label">A</span></button><button class="row-action-btn" id="hB"><span class="row-action-label">B</span></button>';
  const over = id => d.getElementById(id).dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  over("hA");
  assert(!bar.classList.contains("labels-live"), "first level pill: not live");
  over("hB");
  assert(bar.classList.contains("labels-live"), "second level pill: live");
  bar.dispatchEvent(new w.MouseEvent("mouseleave"));
  assert(!bar.classList.contains("labels-live"), "mouseleave clears it");

  section("toolbar-labels-hover-handover b3. CSS: live container has no pill transition; base pill keeps its fade");
  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  assert(rules.some(r => /\.labels-live \.row-action-label/.test(r.selectorText) && /\.labels-live \.tb-label/.test(r.selectorText) && /transition:\s*none/.test(r.cssText)),
    ".labels-live turns the transition off for both pill kinds");
  assert(rules.some(r => r.selectorText === ".row-action-label" && /transition:\s*opacity/.test(r.cssText)), "the base pill still fades (opacity transition)");
});

// ---- c. disabled reasons ----
await withApp(async (w, d, T) => {
  section("toolbar-labels-hover-handover c. Disabled buttons carry a reason, cleared once enabled");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 200, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const reason = a => [...d.querySelectorAll('[data-row-action="' + a + '"]')].map(b => b.getAttribute("data-disabled-reason"));
  const all = (a, v) => reason(a).length > 0 && reason(a).every(x => x === v);

  T.state.selectedId = null;
  w.updateRowActionButtons();
  assert(all("bookmark", "select a row first") && all("note", "select a row first"), "Bookmark/Note: select a row first, got " + reason("bookmark"));
  assert(all("filterBefore", "select a row first") && all("filterAfter", "select a row first"), "Before/After: select a row first");
  assert(all("addToSelection", "select a row first"), "Select: select a row first");
  assert(all("filterForMessage", "select one row"), "Message: select one row");
  assert(all("extractMessage", "select one row"), "Extract with no row: select one row, got " + reason("extractMessage"));
  const bm = d.querySelector('[data-row-action="bookmark"]');
  assert(bm.disabled && bm.title === "Bookmark", "On hover (default): the pill shows the reason, the tooltip stays plain: " + bm.title);
  assert(bm.querySelector(".row-action-label").getAttribute("data-disabled-reason") === "select a row first", "the label span carries it (CSS attr() source)");
  assert(bm.querySelector(".row-action-label .hint-name").textContent === "Bookmark", "label name line itself is unchanged");
  const viewSel = d.querySelector("#settingsViewToolbarLabels");
  const setView = v => { viewSel.value = v; viewSel.dispatchEvent(new w.Event("change", { bubbles: true })); };
  setView("never");
  assert(bm.title.startsWith("Bookmark \u00b7 select a row first"), "Never: the tooltip is the only place for the reason");
  setView("always");
  assert(bm.title.startsWith("Bookmark \u00b7 select a row first"), "Always: tooltip carries the reason");
  setView("hover");
  assert(bm.title === "Bookmark" && bm.getAttribute("data-disabled-reason") === "select a row first", "back to On hover: plain tooltip, reason still on the button");

  // select a row: everything with a row source enables and the reason goes away
  const entry = f.entries.find(e => /\d/.test(e.message || "")) || f.entries[0];
  T.state.selectedId = entry.id;
  w.updateRowActionButtons();
  ["bookmark", "note", "filterBefore", "filterAfter", "addToSelection", "filterForMessage"].forEach(a => {
    assert(reason(a).every(x => x === null), a + ": reason cleared once a row is selected");
  });
  assert(bm.title === "Bookmark", "tooltip back to the plain label: " + bm.title);
  const ext = d.querySelector('[data-row-action="extractMessage"]');
  if (ext.disabled) assert(ext.getAttribute("data-disabled-reason") === "select a row with a number or ID", "Extract on a row without number/ID: its own reason");
  else assert(!ext.hasAttribute("data-disabled-reason"), "Extract enabled: no reason");

  // multi-select of 2: single-row actions say "select one row"
  T.state.logMultiSelect = new Set([f.entries[0].id, f.entries[1].id]);
  w.updateRowActionButtons();
  assert(all("bookmark", "select one row") && all("filterForMessage", "select one row"), "multi-select: select one row");
  T.state.logMultiSelect = new Set();

  section("toolbar-labels-hover-handover c2. New / Context / Table / Repeat / Wrap reasons");
  T.state.activeId = null;
  w.updateRowActionButtons();
  assert(all("newFilter", "open a file first"), "New without active file: open a file first");
  T.state.activeId = f.id;
  w.updateRowActionButtons();
  assert(reason("newFilter").every(x => x === null), "New enabled: no reason");

  const assertBtn = d.querySelector("#tableAssertBtn");
  assert(assertBtn.disabled, "sanity: Value assertion disabled without a column selection");
  w.updateTableAssertButton();
  assert(assertBtn.getAttribute("data-disabled-reason") === "select a numeric column first", "Value assertion reason");
  assert(assertBtn.querySelector(".tb-label").getAttribute("data-disabled-reason") === "select a numeric column first", "...also on its .tb-label");
  assert(assertBtn.querySelector(".tb-label .hint-name").textContent === "Value assertion…", "tb-label text is the base title");

  T.state.sortColumn = "ts";
  w.updateRepeatButton();
  const rep = d.querySelector("#btnRepeatCollapse"), chev = d.querySelector("#btnRepeatMenu");
  assert(rep.getAttribute("data-disabled-reason") === "clear the column sort" && chev.getAttribute("data-disabled-reason") === "clear the column sort", "Repeat toggle + chevron: clear the column sort");
  assert(/needs the chronological order/.test(rep.title) && !/·/.test(rep.title), "Repeat keeps its own explanatory title");
  T.state.sortColumn = null;
  w.updateRepeatButton();
  assert(!rep.hasAttribute("data-disabled-reason") && !chev.hasAttribute("data-disabled-reason"), "Repeat: reason cleared when unlocked");

  section("toolbar-labels-hover-handover c3. The reason renders only in On-hover mode");
  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  const rr = rules.find(r => /data-disabled-reason/.test(r.selectorText));
  assert(rr && /attr\(data-disabled-reason\)/.test(rr.cssText) && /font-weight:\s*400/.test(rr.cssText) && /--text-secondary/.test(rr.cssText), "::after rule: attr content, normal weight, secondary colour");
  // The CSS escape "\00b7 " swallows one following space, so the source needs two to keep "Label · reason".
  assert(/content:" \\00b7  " attr\(data-disabled-reason\)/.test(fs.readFileSync(path.join(__dirname, "..", "philogg.html"), "utf8")), "separator keeps a space on both sides of the middle dot");
  const parts = rr.selectorText.split(",").map(s => s.trim());
  assert(parts.length === 3 && parts.every(s => /::after$/.test(s)), "three selectors, all ::after");
  assert(parts.filter(s => /:not\(\.filter-toolbar-labels-always\):not\(\.filter-toolbar-labels-never\)/.test(s)).length === 1 &&
    parts.filter(s => /:not\(\.view-toolbar-labels-always\):not\(\.view-toolbar-labels-never\)/.test(s)).length === 2,
    "each selector is scoped to its own setting being neither Always nor Never");
});
