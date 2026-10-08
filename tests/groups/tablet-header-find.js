// GROUP tablet-header-find — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP tablet-header-find — header, find, levels, time range, texts
   (tablet UX round, step 2). Origin: 2026-10-03 usability test.
   Find button on the compact tier too; the compact header names the active
   filter ("<filter> · n / total entries", tap opens the drawer); level
   circles show their count (compact, "On hover" labels); unchecked "Always"
   pills use the level color; the log views' "Time range" button is never
   disabled (falls back to a dialog prefilled with the visible span); the
   minimap meta strip carries level letters (FATAL its own segment); English placeholder/hint texts, touch variants.
   ============================================================ */
group("tablet-header-find");

const thSetWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const thCssRules = d => {
  const out = [];
  const walk = rules => { for (const r of rules) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) out.push(r); } };
  for (const sheet of d.styleSheets) walk(sheet.cssRules);
  return out;
};

await withApp(async (w, d, T) => {
  section("tablet-header-find a. Find button on tablet; header names the active filter");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["levels"], entries: 300, seed: 5 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const find = d.querySelector("#btnFindPhone");
  const status = d.querySelector("#statusText");
  assert(w.getComputedStyle(find).display !== "none", "desktop: the header Find button is shown too (Ctrl+F button)");
  const rootText = status.textContent;
  assert(/^1 file · [\d.]+ entries$/.test(rootText), "desktop: status text unchanged, got " + rootText);

  thSetWidth(w, 800);
  assert(d.body.classList.contains("layout-compact"), "sanity: 800px is the compact tier");
  assert(w.getComputedStyle(find).display !== "none", "tablet: the header Find button is shown");
  find.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(!d.querySelector("#findBar").classList.contains("hidden"), "tapping it opens the find bar");
  w.closeFindBar && w.closeFindBar();
  assert(status.textContent === rootText, "tablet + root file active: status text is the plain files text, got " + status.textContent);

  const flt = w.createFilterNode(f.id, "text", { value: "entry", caseSensitive: false, wholeWord: false, inverted: false, regex: false });
  T.state.activeId = typeof flt === "object" && flt ? flt.id : T.state.activeId;
  w.render();
  const total = f.entries.length.toLocaleString("de-DE");
  const shown = w.getEntries(T.state.activeId).length.toLocaleString("de-DE");
  const name = w.nodeDisplayName(T.state.nodes[T.state.activeId]);
  assert(T.state.activeId !== f.id, "sanity: a filter node is active");
  assert(status.textContent === name + " · " + shown + " / " + total + " entries", "tablet + filter active: '<name> · n / total entries', got " + status.textContent);
  assert(w.getComputedStyle(status).cursor === "pointer", "the status text looks tappable");
  assert(!d.body.classList.contains("drawer-open"), "sanity: drawer closed");
  status.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(d.body.classList.contains("drawer-open"), "tapping the status text opens the drawer");
  w.setDrawerOpen(false);
  T.state.activeId = f.id;
  w.render();
  assert(status.textContent === rootText, "back on the root file: plain text again");
  const notNode = w.createFilterNode(f.id, "text", "entry", true);
  T.state.activeId = notNode.id;
  w.render();
  assert(status.textContent.startsWith("¬ " + w.nodeDisplayName(notNode) + " · "), "tablet + inverted filter: header carries the ¬ prefix, got " + status.textContent);
  thSetWidth(w, 1400);
  T.state.activeId = flt.id;
  w.render();
  assert(status.textContent === rootText, "desktop with a filter active: still the plain files text");
});

await withApp(async (w, d, T) => {
  section("tablet-header-find b. Level circles show counts (compact); Always pills use the level color");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["levels"], entries: 300, seed: 5 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const counts = w.getLevelCounts(f.id);
  const err = () => d.querySelector('.level-btn[data-level="ERROR"]');
  const cnt = () => err().querySelector(".level-count");
  assert(cnt() && cnt().textContent === w.levelCountShort(counts.ERROR || 0), "the ERROR circle carries its count, got " + (cnt() && cnt().textContent));
  assert(w.getComputedStyle(cnt()).display !== "none", "desktop: the count is shown inside the circle too");
  thSetWidth(w, 800);
  assert(w.getComputedStyle(cnt()).display !== "none", "tablet: the count is shown in the circle");
  d.body.classList.add("level-labels-always");
  assert(w.getComputedStyle(cnt()).display === "none", "tablet, 'Always' labels: no duplicate count in the pill");
  d.body.classList.remove("level-labels-always");
  thSetWidth(w, 400);
  assert(w.getComputedStyle(cnt()).display === "none", "phone: pills keep their own label, no circle count");
  thSetWidth(w, 1400);

  const rules = thCssRules(d);
  ["error", "warn", "info", "debug", "trace"].forEach(l => {
    assert(rules.some(r => r.selectorText === "body.level-labels-always .level-btn.lvl-" + l + ":not(.active) .row-action-label" && r.style.color === "var(--level-" + l + ")"),
      "'Always' mode: an unchecked " + l + " pill's label uses the level color");
    assert(rules.some(r => r.selectorText === ".level-btn.active.lvl-" + l + " .level-count" && /-on\)/.test(r.style.color)),
      "checked " + l + " circle: the count uses the fill's on-color");
  });
}, { toolbarLabels: "hover" });

await withApp(async (w, d, T) => {
  section("tablet-header-find c. 'Time range' is never disabled in the log views");
  const f = await w.addFile("range.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const btn = () => d.querySelector('[data-row-action="timeRangeFromSelection"]');
  const dlg = d.querySelector("#timeRangeDialog");
  const kids = () => f.children.length;
  assert(btn().disabled === false, "Filtered view, nothing selected: not disabled");
  const k0 = kids();
  btn().dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(!dlg.classList.contains("hidden"), "click opens the time range dialog");
  const firstEntry = f.entries[0];
  assert(w.timeRangeDialogBound("from") === firstEntry.ts, "From is prefilled with the first visible row's time, got " + d.querySelector("#timeRangeFromInput").value);
  assert(d.querySelector("#timeRangeToInput").value !== "" && d.querySelector("#timeRangeToInput").value >= d.querySelector("#timeRangeFromInput").value, "To is prefilled with the last visible row's time");
  assert(kids() === k0, "nothing is created until the dialog is submitted");
  d.querySelector("#timeRangeDialogCancel").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(dlg.classList.contains("hidden"), "dialog cancels");

  T.state.logMultiSelect = new Set([f.entries[3].id, f.entries[9].id]);
  w.updateRowActionButtons();
  btn().dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(dlg.classList.contains("hidden") && kids() === k0 + 1, "with 2+ rows multi-selected it creates the range filter directly, as before");
  T.state.logMultiSelect = new Set();
  T.state.activeId = f.id;
  w.updateRowActionButtons();
  assert(btn().disabled === false, "Context view: not disabled either");
});

await withApp(async (w, d, T) => {
  section("tablet-header-find d. Minimap strip: level letters, FATAL is its own segment, Other is spelled out");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["levels"], entries: 400, seed: 5 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const segs = [...d.querySelectorAll("#timelineMinimapMeta .minimap-meta-level")];
  assert(segs.length >= 4, "level segments exist, got " + segs.length);
  const counts = w.getLevelCounts(f.id);
  segs.forEach(s => {
    const lvl = s.dataset.level;
    const text = lvl === "OTHER" ? "Other" : lvl.charAt(0);
    assert(s.textContent === text + " " + (counts[lvl] || 0).toLocaleString("de-DE"), lvl + " segment reads '<letter> <count>' (Other spelled out), got " + s.textContent);
  });
  const fatal = f.entries.filter(e => /^FATAL/i.test(e.level)).length;
  assert(fatal > 0, "sanity: the simulated file has FATAL lines");
  const fs = segs.find(s => s.dataset.level === "FATAL");
  assert(fs && fs.textContent === "F " + fatal.toLocaleString("de-DE"), "FATAL has its own F segment with its own count, got " + (fs && fs.textContent));
  const e = segs.find(s => s.dataset.level === "ERROR");
  assert(e.title === "Show/hide Error in this file's view" && !/incl\./.test(e.title), "ERROR's tooltip says show/hide and no longer mentions folded FATAL lines, got " + e.title);
  assert(segs.findIndex(s => s.dataset.level === "FATAL") < segs.findIndex(s => s.dataset.level === "ERROR"), "FATAL comes before ERROR");
  assert(!d.querySelector("#timelineMinimapMeta").innerHTML.includes("T 0"), "TRACE is not listed with a zero count");
});

await withApp(async (w, d, T) => {
  section("tablet-header-find e. Texts");
  assert(d.querySelector("#filterInput").placeholder === "Text contains… or a pattern with [*:float]", "filter input placeholder is English");
  const ph = d.querySelector("#detailPlaceholder");
  const desk = ph.querySelector(".dp-desktop"), touch = ph.querySelector(".dp-touch");
  assert(touch.textContent === "Tap a row to see its full message here.", "touch text as specified");
  assert(/^Select a log entry/.test(desk.textContent), "desktop text unchanged");
  assert(w.getComputedStyle(touch).display === "none" && w.getComputedStyle(desk).display !== "none", "desktop shows the desktop text");
  thSetWidth(w, 800);
  assert(w.getComputedStyle(touch).display !== "none" && w.getComputedStyle(desk).display === "none", "tablet shows the touch text");
  thSetWidth(w, 1400);
  const rules = thCssRules(d);
  assert(rules.some(r => r.selectorText === "body.layout-compact .recent-dd .rd-hint, body.layout-phone .recent-dd .rd-hint" || r.selectorText === "body.layout-compact .recent-dd .rd-hint") , "the keyboard hint of the recent-filter dropdown is hidden on touch tiers");
});
