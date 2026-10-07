// GROUP phone-patterns-sheet — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-patterns-sheet — Patterns as the third tab of the phone bottom sheet
   Origin: 2026-10-06 (usability round D, phone step 2; mockup variant 2A).
   Entry | Facets | Patterns (#lowerTabPatterns only in the phone tier). The
   Patterns tab lists fixed-height cards (count, %, level, 2-line pattern)
   from the shared patterns analysis with its own count sort chip; a tap =
   "show only" (text filter, lands on Filtered, sheet closes), the ⊘ = NOT
   filter (sheet stays, 6s "Pattern hidden" undo toast), a long-press opens
   #patternMenu (Show only / Hide / Jump / Copy; no Extract). Desktop and
   tablet keep their lower panel and the desktop Patterns view's own sort.
   Data: log-sim "basic" scenario.
   ============================================================ */
group("phone-patterns-sheet");

const ppSetWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const ppPointer = (w, type, opts) => {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  Object.defineProperty(ev, "pointerId", { value: 9 });
  Object.defineProperty(ev, "isPrimary", { value: true });
  return ev;
};

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 400, seed: 31 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const btn = d.getElementById("btnAnalyzePhone"), panel = d.getElementById("detailPanel");
  const tabE = d.getElementById("lowerTabDetail"), tabF = d.getElementById("lowerTabFacets"), tabP = d.getElementById("lowerTabPatterns");
  const pbody = d.getElementById("phonePatternsBody"), info = d.getElementById("phonePatternsInfo"), chip = d.getElementById("phonePatternsSort");
  const open = () => d.body.classList.contains("sheet-open");
  const cards = () => [...d.querySelectorAll("#phonePatternsRows .pp-row")];
  const counts = () => cards().map(c => +c.querySelector(".pp-head b").textContent.replace(/\./g, ""));
  const toast = d.getElementById("copyToast");

  section("phone-patterns-sheet a. The Patterns tab exists in the phone tier only");
  ppSetWidth(w, 1440);
  assert(!isVisible(tabP, w) && isVisible(tabF, w), "desktop: no Patterns lower tab, Facets as before");
  ppSetWidth(w, 800);
  assert(!isVisible(tabP, w), "compact: no Patterns lower tab");
  ppSetWidth(w, 390);
  assert(isVisible(tabP, w) && tabP.textContent === "Patterns", "phone: Patterns tab shown");
  assert([...d.querySelectorAll("#lowerTabs .lower-tab")].map(t => t.id).join() === "lowerTabDetail,lowerTabWhy,lowerTabStats,lowerTabFacets,lowerTabPatterns" && d.querySelector("#lowerTabStats").hidden, "order Entry | Why | (Statistics, never offered on the phone) | Facets | Patterns");
  assert(btn.title === "Facets and patterns (Ctrl+I)", "Analyze tooltip");

  section("phone-patterns-sheet b. Switching to Patterns: header text, cards, constant height, clamp");
  fireClick(btn, w);
  assert(open() && panel.classList.contains("lower-facets"), "Analyze opens on Facets");
  fireClick(tabP, w);
  assert(panel.classList.contains("lower-patterns") && !panel.classList.contains("lower-facets") && tabP.getAttribute("aria-selected") === "true", "Patterns tab selected");
  assert(isVisible(pbody, w) && !isVisible(d.getElementById("facetPanelBody"), w) && !isVisible(d.getElementById("detailBody"), w), "patterns body shown, facets/detail hidden");
  assert(btn.getAttribute("aria-pressed") === "true", "Analyze button pressed on Patterns");
  await waitFor(() => cards().length > 0, 3000);
  const nPat = w.eval("patternsAnalysis('" + f.id + "')").result.groups.length;
  assert(info.textContent === T.currentViewEntries.length.toLocaleString("de-DE") + " entries → " + nPat.toLocaleString("de-DE") + " patterns", "header text, got '" + info.textContent + "'");
  assert(chip.textContent === "Count ↓" && isVisible(chip, w), "sort chip default Count ↓");
  const c0 = cards();
  assert(c0.every(c => c.style.height === "64px") && d.getElementById("phonePatternsSpacer").style.height === nPat * 64 + "px", "fixed 64px cards in a count x 64px spacer");
  const cs = counts();
  assert(cs.every((v, i) => i === 0 || cs[i - 1] >= v), "sorted by count descending");
  assert(c0[0].querySelector(".pp-text") && c0[0].querySelector(".level-badge") && /%$/.test(c0[0].querySelector(".pp-head span").textContent), "count, %, level badge, text");
  assert(c0[0].querySelector(".pp-hide").getAttribute("aria-label") === "Hide this pattern" && c0[0].querySelector(".pp-hide svg"), "hide button with label");
  const rules = [];
  const walk = rs => { for (const r of rs) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  const ruleOf = sel => rules.find(r => r.selectorText === sel);
  assert(ruleOf(".pp-text") && /line-clamp:\s*2/.test(ruleOf(".pp-text").cssText) && ruleOf(".pp-hide").style.flexBasis === "44px", "CSS: text clamped to 2 lines, 44px hide area");
  assert(ruleOf("body.layout-phone .facet-value") && ruleOf("body.layout-phone .facet-value").style.minHeight === "36px", "CSS: facet value rows are 36px high on the phone");

  section("phone-patterns-sheet c. Sort chip flips the order and leaves the desktop view's sort alone");
  const first = c0[0].querySelector(".pp-text").textContent;
  const deskSort = w.eval("[patternsSortKey, patternsSortDir]");
  fireClick(chip, w);
  assert(chip.textContent === "Count ↑", "chip flips to Count ↑");
  const cs2 = counts();
  assert(cs2.every((v, i) => i === 0 || cs2[i - 1] <= v) && cards()[0].querySelector(".pp-text").textContent !== first, "ascending now");
  assert(w.eval("[patternsSortKey, patternsSortDir]").join() === deskSort.join(), "desktop Patterns sort state untouched");
  fireClick(chip, w);
  assert(chip.textContent === "Count ↓" && counts()[0] === cs[0], "flips back");

  section("phone-patterns-sheet d. Tab switching and 'last used Analyze tab'");
  fireClick(tabF, w);
  assert(panel.classList.contains("lower-facets") && !panel.classList.contains("lower-patterns"), "to Facets");
  fireClick(tabP, w);
  fireClick(btn, w);
  assert(!open() && !panel.classList.contains("lower-patterns"), "Analyze on Patterns closes");
  fireClick(btn, w);
  assert(open() && panel.classList.contains("lower-patterns"), "Analyze reopens on the last-used tab (Patterns)");
  await waitFor(() => cards().length > 0, 3000);
  fireClick(d.getElementById("detailClose"), w);
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(open() && panel.classList.contains("lower-facets"), "Ctrl+I opens on Facets");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(!open(), "Ctrl+I closes");
  fireClick(btn, w);
  fireClick(tabP, w);
  fireClick(btn, w);
  assert(!open(), "(back on Patterns as the last used tab, closed)");
  assert(w.localStorage.getItem("philogg-lower-tab") !== "facets", "nothing persisted into philogg-lower-tab");

  section("phone-patterns-sheet e. Tap = show only: text filter, Filtered, sheet closes");
  fireClick(btn, w);
  await waitFor(() => cards().length > 0, 3000);
  const parent = T.state.activeId;
  const group = w.eval("patternsAnalysis('" + parent + "')").result.groups.slice().sort((a, b) => b.count - a.count)[0];
  fireClick(cards()[0], w);
  const node = T.state.nodes[T.state.activeId];
  assert(T.state.activeId !== parent && node.parentId === parent && node.filterType === "text" && !node.inverted, "a text filter child is active");
  assert(node.value === w.patternFilterValue(group.key, group.floatMask, false), "value = the pattern with [*] placeholders");
  assert(!open() && w.eval("fhActiveTab") === "filter", "sheet closed, Filtered view");

  section("phone-patterns-sheet f. ⊘ = NOT filter, sheet stays on Patterns, list recounts, Undo toast restores");
  T.state.activeId = f.id; w.render();
  fireClick(btn, w);
  await waitFor(() => cards().length > 0, 3000);
  const before = cards().length, undoTop = w.eval("undoStack.length");
  const hid = cards()[0].querySelector(".pp-text").textContent;
  fireClick(cards()[0].querySelector(".pp-hide"), w);
  const nn = T.state.nodes[T.state.activeId];
  assert(nn.parentId === f.id && nn.inverted && nn.filterType === "text", "an inverted text child is active");
  assert(open() && panel.classList.contains("lower-patterns"), "sheet stays open on Patterns");
  await waitFor(() => cards().length > 0 && cards()[0].querySelector(".pp-text").textContent !== hid, 3000);
  assert(!cards().some(c => c.querySelector(".pp-text").textContent === hid), "the hidden pattern is gone from the recounted list");
  assert(/Pattern hidden/.test(toast.textContent) && toast.classList.contains("has-action"), "toast 'Pattern hidden' with an action");
  fireClick(toast.querySelector(".toast-action"), w);
  assert(T.state.activeId === f.id && open() && w.eval("undoStack.length") === undoTop, "Undo restores the parent, sheet still open");
  await waitFor(() => cards().length > 0 && cards()[0].querySelector(".pp-text").textContent === hid, 3000);

  section("phone-patterns-sheet g. Long-press menu: items, Copy, Hide, Jump, Show only; no Extract");
  const menu = d.getElementById("patternMenu");
  const lp = async el => {
    el.dispatchEvent(ppPointer(w, "pointerdown", { clientX: 40, clientY: 300 }));
    await waitFor(() => !menu.classList.contains("hidden"), 3000, "menu opens after the long-press");
    el.dispatchEvent(ppPointer(w, "pointerup", { clientX: 40, clientY: 300 }));
    fireClick(el, w);
  };
  const nodesBefore = Object.keys(T.state.nodes).length;
  await lp(cards()[1]);
  assert(Object.keys(T.state.nodes).length === nodesBefore && T.state.activeId === f.id, "long-press created nothing");
  const g1 = phoneGroupAt(1);
  assert(d.getElementById("patternMenuText").textContent === w.patternDisplayText(g1.key), "header = full pattern display text");
  assert([...menu.querySelectorAll(".ctx-item")].map(i => i.textContent.trim()).join("|") === "Show only this|Hide this|Jump to first entry|Copy pattern", "four items, no Extract");
  fireClick(menu.querySelector('[data-act="copy"]'), w);
  assert(menu.classList.contains("hidden") && /Copied/.test(toast.textContent), "Copy closes the menu and toasts");
  await lp(cards()[1]);
  d.body.dispatchEvent(ppPointer(w, "pointerdown", { clientX: 5, clientY: 5 }));
  assert(menu.classList.contains("hidden"), "an outside press closes it");
  d.body.dispatchEvent(ppPointer(w, "pointerup", { clientX: 5, clientY: 5 }));
  await lp(cards()[1]);
  fireKeydown(d, w, "Escape");
  assert(menu.classList.contains("hidden"), "Esc closes it");
  await lp(cards()[1]);
  fireClick(menu.querySelector('[data-act="jump"]'), w);
  assert(!open() && T.state.selectedId === g1.first.id, "Jump closes the sheet and selects the group's first entry");
  fireClick(btn, w);
  await waitFor(() => cards().length > 0, 3000);
  await lp(cards()[1]);
  fireClick(menu.querySelector('[data-act="hide"]'), w);
  assert(T.state.nodes[T.state.activeId].inverted && open() && panel.classList.contains("lower-patterns"), "Hide this = ⊘ (sheet stays)");
  T.state.activeId = f.id; w.render();
  await waitFor(() => cards().length > 0, 3000);
  await lp(cards()[0]);
  fireClick(menu.querySelector('[data-act="filter"]'), w);
  assert(!open() && !T.state.nodes[T.state.activeId].inverted && T.state.activeId !== f.id, "Show only this = tap (sheet closes)");

  function phoneGroupAt(i) { return w.eval("phonePatternsSorted.list[" + i + "]"); }

  section("phone-patterns-sheet h. Link node; leaving the phone tier clears the tab");
  T.state.activeId = f.id; w.render();
  const second = w.createFilterNode(f.id, "text", "Connection");
  const link = w.createLinkNode(f.id, second.id, "after", 1);
  T.state.activeId = link.id; w.render();
  fireClick(btn, w);
  assert(open() && panel.classList.contains("lower-patterns") && /Not available for a link filter/.test(pbody.textContent), "link node: placeholder, no crash");
  ppSetWidth(w, 1440);
  assert(!open() && !panel.classList.contains("lower-patterns") && !isVisible(pbody, w), "desktop: sheet state gone, patterns body hidden");
  assert(w.eval("phonePatternsSorted") === null, "no list kept");
});
