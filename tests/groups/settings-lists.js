// GROUP settings-lists — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP settings-lists — Settings dialog cleanup, step 2 (variant C): group
   headers with the add button on the right, lists that grow instead of
   scrolling inside, fixed action slots in the Log Formats lists, grouped
   Shortcuts whose key chips are the "change" button, tooltips per the mock.
   Origin: 2026-10-07 (person-requested settings cleanup, follows
   settings-grid). jsdom has no layout: "no inner scroll" is checked as "no
   max-height / overflow rule on the list", "same x position" as "same slot
   (child index + one shared grid template) in every row".
   ============================================================ */
group("settings-lists");

const SLOT_FORMATS = ["bracket", "jsonl", "logfmt", "syslog", "custom"];

await withApp(async (w, d, T) => {
  section("settings-lists a. Group headers: title (+ count) left, the add button right; no card footers");
  await waitForFormatConfig(T);
  for (const f of SLOT_FORMATS) await logsimRegister(w, T, f, "fmt-sl-" + f);
  w.openSettingsDialog();
  w.renderFormatList();
  w.renderFormatRuleList();
  const head = id => d.getElementById(id).closest(".settings-subsection-title");
  [["btnAddFormat", "+ Add format"], ["btnAddFormatRule", "+ Add rule"], ["btnThemeNew", "+ New theme"], ["btnSyntaxNew", "+ New scheme"]].forEach(([id, text]) => {
    const btn = d.getElementById(id);
    assert(btn.textContent === text && btn.className === "btn-mini-dashed", "#" + id + " reads '" + text + "' and keeps the dashed style");
    assert(head(id) && head(id).firstElementChild !== btn && head(id).lastElementChild === btn, "#" + id + " sits at the right end of its group header");
    assert(w.getComputedStyle(head(id)).display === "flex", "the group header is a flex row");
  });
  assert(!d.querySelector("#settingsDialog .settings-card-footer"), "no card footer is left in Settings");
  assert(d.getElementById("formatCount").textContent === "6" && head("btnAddFormat").textContent.startsWith("Formats6"), "the Formats header carries the count (5 simulator formats + the default)");
  assert(d.getElementById("formatRuleCount").textContent === "5", "the Filename rules header carries the rule count");
  assert(d.querySelector("#settingsFormatRulesTitle + .settings-group-note").textContent === "First match wins. Files without a match use the default format.", "the rules note sits under its header");
  assert(d.getElementById("settingsCustomThemesTitle").firstElementChild.textContent === "Custom themes" && d.getElementById("settingsCustomSyntaxTitle").firstElementChild.textContent === "Custom syntax schemes", "custom list titles are short");
  // Same spacing above every group header, the first one under the desc included.
  const titles = [...d.querySelectorAll("#settingsSectionAppearance .settings-subsection-title, #settingsSectionBehavior .settings-subsection-title, #settingsSectionFormats .settings-subsection-title")];
  assert(titles.length >= 14 && titles.every(t => w.getComputedStyle(t).marginTop === "24px"), "every group header has the same 24px top margin");
  ["settingsSectionAppearance", "settingsSectionBehavior", "settingsSectionFormats", "settingsSectionShortcuts"].forEach(id =>
    assert(w.getComputedStyle(d.querySelector("#" + id + " .settings-section-desc")).marginBottom === "0px", "#" + id + ": the desc adds no extra gap above the first group"));

  section("settings-lists b. Empty states of the custom lists: new texts, the card's normal padding");
  assert(d.querySelector("#customThemeList .filter-library-empty").textContent === "No custom themes yet. Create one, or drop a theme file onto the app.", "custom themes empty text");
  assert(d.querySelector("#customSyntaxSchemeList .filter-library-empty").textContent === "No custom schemes yet.", "custom schemes empty text");
  d.querySelectorAll("#customThemeList .filter-library-empty, #customSyntaxSchemeList .filter-library-empty").forEach(e =>
    assert(w.getComputedStyle(e).paddingLeft === "18px", "an empty state is padded like a row (18px), not flush left"));

  section("settings-lists c. Format and rule lists don't scroll inside and share one slot grid");
  ["formatList", "formatRuleList"].forEach(id => {
    const cs = w.getComputedStyle(d.getElementById(id));
    assert(cs.maxHeight !== "min(220px, 30vh)" && (cs.maxHeight === "" || cs.maxHeight === "none") && cs.overflowY !== "auto" && cs.overflowY !== "scroll", "#" + id + " has no max-height / inner scroll");
  });
  const fRows = [...d.querySelectorAll("#formatList .filter-library-row")];
  assert(fRows.length === 6, "sanity: six format rows, got " + fRows.length);
  fRows.forEach(r => {
    assert(r.children.length === 4, "a format row always has four cells (name, Edit, Export, icon slot), got " + r.children.length);
    assert(w.getComputedStyle(r).display === "grid" && w.getComputedStyle(r).gridTemplateColumns === "minmax(0,1fr) 62px 70px 30px", "format rows share the slot grid");
    assert(r.children[1].textContent === "Edit" && r.children[2].textContent === "Export", "Edit sits in slot 2 and Export in slot 3 of every row");
  });
  assert(fRows[0].children[3].title === "Reset to default" && /list-icon-btn/.test(fRows[0].children[3].className), "the default's icon slot is the Reset to default icon button");
  assert(fRows.slice(1).every(r => r.children[3].title === "Delete format" && r.children[3].classList.contains("filter-library-row-del")), "the others' icon slot is the delete ×");
  assert(fRows[0].querySelector(".filter-library-row-name .link-target-label").textContent === "default", "the default row carries a 'default' chip");
  assert(fRows[0].querySelector(".filter-library-row-meta").textContent === "Pattern · fallback for all files", "the default's meta line: " + fRows[0].querySelector(".filter-library-row-meta").textContent);
  const bracket = fRows.find(r => r.textContent.includes("bracket"));
  assert(/^Regex · 1 rule · \d+ levels$/.test(bracket.querySelector(".filter-library-row-meta").textContent), "meta line is short (mode · rules · level count), got " + bracket.querySelector(".filter-library-row-meta").textContent);
  assert(fRows.every(r => !/default|\bDEBUG\b/.test(r.querySelector(".filter-library-row-meta").textContent) || r === fRows[0]), "no level names are listed in the meta line");
  assert(fRows[1].querySelector('[title="Export as JSON"]'), "Export tooltip is 'Export as JSON'");
  const rRows = [...d.querySelectorAll("#formatRuleList .filter-library-row")];
  assert(rRows.length === 5, "sanity: five rule rows");
  rRows.forEach((r, i) => {
    assert(r.children.length === 5 && w.getComputedStyle(r).gridTemplateColumns === "30px 30px minmax(0,1fr) 62px 30px", "rule rows share the slot grid (up, down, text, Edit, ×)");
    assert(r.children[0].title === "Move up" && r.children[1].title === "Move down" && r.children[3].textContent === "Edit" && r.children[4].title === "Delete rule", "slots in order for row " + i);
    assert(r.children[0].disabled === (i === 0) && r.children[1].disabled === (i === rRows.length - 1), "first ▲ and last ▼ are disabled");
  });
  assert(rRows[0].querySelector(".filter-library-row-meta").textContent.startsWith("→ "), "the rule's format is shown as '→ name'");

  section("settings-lists d. Shortcuts: grouped, the chip is the change button, ↺ only for overridden bindings");
  const sc = d.getElementById("shortcutBindingsList");
  const groupTitles = [...sc.querySelectorAll(":scope > .settings-subsection-title")].map(e => e.textContent);
  assert(groupTitles.join("|") === "Filters|Find|Views & panels|Rows|Edit|Fixed (not changeable)", "shortcut groups, got " + groupTitles.join("|"));
  assert(sc.querySelectorAll(":scope > .settings-card").length === 6, "one card per group");
  const actionIds = w.eval("SHORTCUT_ACTIONS.map(a => a.id + ':' + a.group)");
  assert(actionIds.every(x => x.split(":")[1]) && w.eval("SHORTCUT_ACTIONS.every(a => SHORTCUT_GROUP_ORDER.includes(a.group))"), "every action has a known group");
  const cardIds = i => [...sc.querySelectorAll(":scope > .settings-card")[i].querySelectorAll("[data-action-id]")].map(r => r.dataset.actionId).join(",");
  assert(cardIds(0) === "newFilter,editFilter,renameFilter,muteFilter,focusTree", "Filters group: " + cardIds(0));
  assert(cardIds(1) === "findInView,findNext,findPrev,nextMatch,prevMatch", "Find group: " + cardIds(1));
  assert(cardIds(2) === "viewTab1,viewTab2,viewTab3,viewTab4,viewTab5,toggleSidebar,toggleDetail,toggleFacets,toggleFocus,zoomIn,zoomOut", "Views & panels group: " + cardIds(2));
  assert(cardIds(3) === "bookmark,addNote,copyForTicket,exportView" && cardIds(4) === "undo,redo,closeFile", "Rows and Edit groups");
  const row = id => d.querySelector("[data-action-id='" + id + "']");
  assert(w.getComputedStyle(row("bookmark")).gridTemplateColumns === "minmax(0,1fr) 150px 30px", "shortcut rows use the label | chip | reset-slot grid");
  assert(!d.querySelector(".shortcut-row .btn-mini-outline") && !/Change/.test(sc.textContent), "no 'Change' button any more");
  assert(row("bookmark").querySelector(".shortcut-rebind-btn").title === "Click to change", "the chip's tooltip is 'Click to change'");
  assert(!d.querySelector(".shortcut-reset-btn") && sc.querySelectorAll(".list-slot").length >= 28, "no ↺ while nothing is overridden (empty slots instead)");
  fireClick(row("bookmark").querySelector(".shortcut-rebind-btn"), w);
  assert(w.eval("shortcutRecordingId") === "bookmark" && row("bookmark").querySelector(".shortcut-rebind-btn").textContent === "Press keys…", "clicking the chip starts recording; it reads 'Press keys…'");
  fireKeydown(d, w, "k");
  assert(row("bookmark").querySelector(".shortcut-reset-btn").title === "Reset to default", "after a rebinding the row has a ↺ 'Reset to default'");
  assert(row("bookmark").querySelector(".shortcut-rebind-btn").classList.contains("overridden-binding"), "an overridden chip is marked (accent color)");
  assert(d.querySelectorAll(".shortcut-reset-btn").length === 1, "...and only that row has one");
  fireClick(row("bookmark").querySelector(".shortcut-reset-btn"), w);
  assert(!d.querySelector(".shortcut-reset-btn") && !row("bookmark").querySelector(".shortcut-rebind-btn").classList.contains("overridden-binding"), "↺ resets and the slot is empty again");
  const head2 = d.querySelector("#settingsSectionShortcuts .settings-section-head");
  assert(head2.contains(d.getElementById("btnResetShortcuts")) && d.getElementById("btnResetShortcuts").textContent === "Reset all", "'Reset all' sits in the section header on the right");
  const fixed = [...sc.querySelectorAll(".shortcut-row-fixed")];
  assert(fixed.length > 10 && fixed.every(r => !r.querySelector(".shortcut-rebind-btn") && !r.querySelector(".shortcut-reset-btn") && r.children.length === 3), "fixed rows keep three cells and no controls");
});

await withApp(async (w, d, T) => {
  section("settings-lists e. Provided formats: tooltips and slots");
  // Provided records live in memory only (PROJECT.md); build one the way loadProvidedFormats does.
  await waitForFormatConfig(T);
  T.state.logFormats.push(Object.assign({ id: "fmt-provided-x", builtin: false, edited: false, createdAt: 1, provided: true, providedSource: "formats/x.logformat.json" },
    JSON.parse(JSON.stringify(T.state.logFormats.find(f => f.id === "fmt-default"))), { id: "fmt-provided-x", name: "Provided X", builtin: false, provided: true }));
  w.openSettingsDialog();
  w.renderFormatList();
  const row = [...d.querySelectorAll("#formatList .filter-library-row")].find(r => r.textContent.includes("Provided X"));
  assert(row && row.children.length === 4, "a provided row keeps four cells");
  assert(row.children[1].textContent === "Duplicate" && row.children[1].title === "Duplicate as own format", "Duplicate tooltip is 'Duplicate as own format'");
  assert(row.querySelector(".link-target-label").title === "Read-only, from formats/x.logformat.json", "the Provided chip says 'Read-only, from <file>'");
  assert(row.children[3].classList.contains("list-slot"), "a provided row has an empty icon slot (no reset, no delete)");
});
