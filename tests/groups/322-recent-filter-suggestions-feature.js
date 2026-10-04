// GROUP 322 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 322 — Recent-filter suggestions (FEATURE_BACKLOG #13)
   Origin: 2026-09-29. localStorage "philogg.recentFilters" (recorded by
   commitFilter and the find bar's Enter / "Add as filter"), one dropdown
   component under #filterInput and #findInput: substring matching with
   exact-match suppression, keyboard (arrows / Enter / Tab / Escape /
   Shift+Delete), mouse (mousedown apply, x remove), edit mode closed until
   typing, storage failures tolerated.
   ============================================================ */
group(322);

const RF_KEY = "philogg.recentFilters";
const rfKey = (el, w, key, opts = {}) => { const ev = new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }); el.dispatchEvent(ev); return ev; };
const rfList = w => JSON.parse(w.localStorage.getItem(RF_KEY) || "[]");
const rfRows = d => [...d.querySelectorAll("#filterPopup .recent-dd:not([hidden]) .rd-row")];
const rfMouseDown = (el, w) => el.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
const rfSeed = (w, n) => w.localStorage.setItem(RF_KEY, JSON.stringify(Array.from({ length: n }, (_, i) => ({
  value: "term" + i, isRegex: false, caseSensitive: false, wholeWord: false, inverted: false, source: "filter" }))));

await withApp(async (w, d, T) => {
  section("322a. commitFilter records value + flags (source filter); dedupe on value+flags moves to top; empty is not recorded; cap 50");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  T.state.activeId = f.id; w.render();
  const commit = (val, { regex = false, cs = false, ww = false, not = false } = {}) => {
    w.openFilterPopup();
    const inp = d.getElementById("filterInput");
    inp.value = val; fireInput(inp, w);
    w.pillSet(d.getElementById("filterCaseCheckbox"), cs);
    w.pillSet(d.getElementById("filterWholeWordCheckbox"), ww);
    w.pillSet(d.getElementById("filterInvertCheckbox"), not);
    w.setFilterRegexMode(regex);
    w.updateFilterAvailability();
    w.commitFilter();
  };
  commit("message 1", { cs: true, not: true });
  let l = rfList(w);
  assert(l.length === 1 && l[0].value === "message 1" && l[0].caseSensitive === true && l[0].inverted === true &&
    l[0].isRegex === false && l[0].wholeWord === false && l[0].source === "filter", "recorded with all flags, got " + JSON.stringify(l));
  commit("message 2");
  commit("message 1", { cs: true, not: true });
  l = rfList(w);
  assert(l.length === 2 && l[0].value === "message 1" && l[1].value === "message 2", "same value+flags moves to the top instead of duplicating");
  commit("message 1");
  assert(rfList(w).length === 3, "same value with different flags is a separate entry");
  commit("message 3", { regex: true });
  assert(rfList(w)[0].isRegex === true, "regex flag recorded");
  w.openFilterPopup(); d.getElementById("filterInput").value = "   "; w.commitFilter();
  assert(rfList(w).length === 4, "empty/whitespace values are not recorded");
  rfSeed(w, 50);
  commit("brand new");
  l = rfList(w);
  assert(l.length === 50 && l[0].value === "brand new" && !l.some(r => r.value === "term49"), "history is capped at 50 (oldest dropped)");
});

await withApp(async (w, d, T) => {
  section("322b. list under the popup input: empty input shows the recent list (max 8), header texts, source icon slot, badges, hint");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  T.state.activeId = f.id; w.render();
  rfSeed(w, 12);
  const l = rfList(w);
  l[0] = { value: "alpha", isRegex: true, caseSensitive: true, wholeWord: true, inverted: true, source: "find" };
  w.localStorage.setItem(RF_KEY, JSON.stringify(l));
  w.openFilterPopup();
  const rows = rfRows(d);
  assert(rows.length === 8, "at most 8 rows shown of 12, got " + rows.length);
  assert(d.querySelector("#filterPopup .rd-head").textContent === "Recent filters", "header: Recent filters");
  assert(d.querySelector("#filterPopup .rd-hint").textContent.includes("Shift+Del remove"), "footer hint present");
  assert(d.querySelector(".filter-input-wrap .recent-dd") && w.getComputedStyle(d.querySelector(".recent-dd")).position === "absolute", "dropdown is absolutely positioned inside the input wrap (overlay, no layout push)");
  assert(rows[0].querySelector(".rd-src use") && rows[0].querySelector(".rd-src use").getAttribute("href") === "#i-search", "find-bar entry gets the search icon");
  assert(!rows[1].querySelector(".rd-src") && rows[1].querySelector(".rd-src-empty"), "filter entry gets the empty slot");
  assert([...rows[0].querySelectorAll(".rd-badge")].map(b => b.textContent).join("|") === ".*|Aa|W|NOT" && rows[0].querySelector(".rd-badge.not"), "badges .* Aa W NOT (NOT styled)");
  assert(rows[0].querySelector(".rd-x").title === "Remove from history", "x has the tooltip");
  // typing
  const inp = d.getElementById("filterInput");
  inp.value = "ERM"; fireInput(inp, w);
  const m = rfRows(d);
  assert(m.length === 8 && d.querySelector("#filterPopup .rd-head").textContent === "Matching recent filters", "typing: matching header, 'term*' entries shown (cap 8)");
  assert(m[0].querySelector("mark").textContent === "erm", "typed substring is wrapped in <mark>, keeping the entry's own casing");
  inp.value = "zzz"; fireInput(inp, w);
  assert(rfRows(d).length === 0, "no matches: no list");
  inp.value = "TERM3"; fireInput(inp, w);
  assert(rfRows(d).length === 0, "an entry exactly equal (case-insensitive) to the input is not shown");
  inp.value = "term1"; fireInput(inp, w);
  assert(rfRows(d).map(r => r.querySelector(".rd-val").textContent).join() === "term10,term11", "'term1' matches term10 and term11 (term1 itself suppressed)");
  w.closeFilterPopup();
  assert(!d.querySelector(".recent-dd:not([hidden])"), "closing the popup hides the list");
});

await withApp(async (w, d, T) => {
  section("322c. keyboard: Down + Enter applies value and flags WITHOUT committing; Enter with no selection commits; Escape closes list first, then the popup; Shift+Delete removes");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  T.state.activeId = f.id; w.render();
  w.localStorage.setItem(RF_KEY, JSON.stringify([
    { value: "message 1.*", isRegex: true, caseSensitive: true, wholeWord: false, inverted: true, source: "filter" },
    { value: "message 2", isRegex: false, caseSensitive: false, wholeWord: false, inverted: false, source: "find" },
    { value: "message 3", isRegex: false, caseSensitive: false, wholeWord: false, inverted: false, source: "filter" },
  ]));
  const nodes0 = Object.keys(T.state.nodes).length;
  w.openFilterPopup();
  const inp = d.getElementById("filterInput");
  assert(rfRows(d).every(r => !r.classList.contains("sel")), "no row selected initially");
  const ev = rfKey(inp, w, "ArrowDown");
  assert(ev.defaultPrevented && rfRows(d)[0].classList.contains("sel"), "ArrowDown selects the first row");
  rfKey(inp, w, "ArrowDown"); rfKey(inp, w, "ArrowUp");
  assert(rfRows(d)[0].classList.contains("sel") && rfRows(d).filter(r => r.classList.contains("sel")).length === 1, "ArrowUp moves back up");
  rfKey(inp, w, "Enter");
  assert(inp.value === "message 1.*" && w.isFilterRegexMode() && w.pillGet(d.getElementById("filterCaseCheckbox")) &&
    w.pillGet(d.getElementById("filterInvertCheckbox")) && !w.pillGet(d.getElementById("filterWholeWordCheckbox")), "Enter applied the value and set Regex, Match case, NOT (Whole word off)");
  assert(!d.getElementById("filterPopup").classList.contains("hidden") && Object.keys(T.state.nodes).length === nodes0, "applying does NOT commit: popup open, no new node");
  assert(rfRows(d).length === 0, "the list closed after applying");
  await sleep(250);
  assert(!d.getElementById("filterResults").classList.contains("hidden") && d.getElementById("filterLiveMatch").textContent !== "", "live match was re-evaluated after the programmatic write");
  // Enter without a selection = commit
  inp.value = "message 3"; fireInput(inp, w);
  w.setFilterRegexMode(false); w.pillSet(d.getElementById("filterInvertCheckbox"), false); w.pillSet(d.getElementById("filterCaseCheckbox"), false);
  d.getElementById("filterForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  assert(d.getElementById("filterPopup").classList.contains("hidden") && Object.keys(T.state.nodes).length === nodes0 + 1, "Enter/submit without a selection adds the filter as before");
  // Escape twice
  w.openFilterPopup();
  assert(rfRows(d).length > 0, "list shown again on the next open");
  rfKey(inp, w, "Escape");
  assert(rfRows(d).length === 0 && !d.getElementById("filterPopup").classList.contains("hidden"), "first Escape closes only the list");
  rfKey(inp, w, "Escape");
  assert(d.getElementById("filterPopup").classList.contains("hidden"), "second Escape closes the popup");
  // Tab applies a selection
  w.openFilterPopup();
  rfKey(inp, w, "ArrowDown"); rfKey(inp, w, "ArrowDown");
  const tab = rfKey(inp, w, "Tab");
  assert(tab.defaultPrevented && inp.value === rfList(w)[1].value, "Tab with a selection applies it too");
  // Shift+Delete
  w.openFilterPopup();
  const before = rfList(w).map(r => r.value);
  rfKey(inp, w, "Delete");
  assert(rfList(w).length === before.length, "plain Delete with nothing selected removes nothing");
  rfKey(inp, w, "ArrowDown");
  rfKey(inp, w, "Delete", { shiftKey: true });
  assert(rfList(w).length === before.length - 1 && rfList(w)[0].value === before[1], "Shift+Delete removes the selected entry");
  assert(rfRows(d).length === before.length - 1, "and the list redraws");
});

await withApp(async (w, d, T) => {
  section("322d. mouse: mousedown applies (default prevented so the input keeps focus), x removes, clicking elsewhere in the popup closes the list, no click leaks to the click-outside close");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  T.state.activeId = f.id; w.render();
  w.localStorage.setItem(RF_KEY, JSON.stringify([
    { value: "message 4", isRegex: false, caseSensitive: true, wholeWord: false, inverted: false, source: "filter" },
    { value: "message 5", isRegex: false, caseSensitive: false, wholeWord: false, inverted: false, source: "filter" },
  ]));
  w.openFilterPopup();
  const inp = d.getElementById("filterInput");
  const md = new w.MouseEvent("mousedown", { bubbles: true, cancelable: true });
  rfRows(d)[0].querySelector(".rd-val").dispatchEvent(md);
  assert(md.defaultPrevented, "mousedown is default-prevented (focus stays in the input)");
  assert(inp.value === "message 4" && w.pillGet(d.getElementById("filterCaseCheckbox")), "mousedown applied value + Match case");
  assert(!d.getElementById("filterPopup").classList.contains("hidden"), "popup still open");
  fireClick(d.querySelector(".recent-dd .rd-row .rd-val"), w);
  assert(!d.getElementById("filterPopup").classList.contains("hidden"), "the click after mousedown does not trigger the global click-outside close");
  // x removes
  w.openFilterPopup();
  rfRows(d)[0].querySelector(".rd-x").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  assert(inp.value === "", "mousedown on the x does not apply the row");
  fireClick(rfRows(d)[0].querySelector(".rd-x"), w);
  assert(rfList(w).length === 1 && rfList(w)[0].value === "message 5" && rfRows(d).length === 1, "x removes the entry from storage and list");
  assert(!d.getElementById("filterPopup").classList.contains("hidden"), "popup survived the x click");
  // click elsewhere in the popup
  fireClick(d.querySelector("#filterPopup .filter-settings-row .filter-section-label"), w);
  assert(rfRows(d).length === 0 && !d.getElementById("filterPopup").classList.contains("hidden"), "clicking elsewhere in the popup closes only the list");
});

await withApp(async (w, d, T) => {
  section("322e. edit mode: list stays closed until the user types; storage that throws does not break the popup");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  const n = w.createFilterNode(f.id, "text", "message 7");
  w.localStorage.setItem(RF_KEY, JSON.stringify([
    { value: "message 77", isRegex: false, caseSensitive: false, wholeWord: false, inverted: false, source: "filter" },
    { value: "other", isRegex: false, caseSensitive: false, wholeWord: false, inverted: false, source: "filter" },
  ]));
  w.openEditFilterPopup(n.id);
  const inp = d.getElementById("filterInput");
  assert(rfRows(d).length === 0, "edit mode: no list on open");
  inp.value = "message 7"; inp.value = "message"; fireInput(inp, w);
  assert(rfRows(d).map(r => r.querySelector(".rd-val").textContent).join() === "message 77", "typing in edit mode shows matches");
  w.commitFilter();
  assert(rfList(w)[0].value === "message" && rfList(w)[0].source === "filter", "Save in edit mode records the value");
  // storage throwing
  const proto = Object.getPrototypeOf(w.localStorage);
  const origGet = proto.getItem, origSet = proto.setItem;
  proto.getItem = () => { throw new Error("blocked"); };
  proto.setItem = () => { throw new Error("blocked"); };
  let threw = null;
  try {
    w.openFilterPopup();
    const i2 = d.getElementById("filterInput");
    i2.value = "message 2"; fireInput(i2, w);
    w.commitFilter();
  } catch (e) { threw = e; }
  proto.getItem = origGet; proto.setItem = origSet;
  assert(!threw, "a throwing localStorage does not break open/typing/commit: " + (threw && threw.message));
  assert(d.getElementById("filterPopup").classList.contains("hidden"), "the filter was still committed (popup closed)");
});

await withApp(async (w, d, T) => {
  section("322f. find bar: Enter and 'Add as filter' record source find with case/regex only; the list applies value + case + regex; not recorded per keystroke");
  const f = await w.addFile("a.log", makeLog(0, 60, { suffix: i => (i % 7 === 0 ? "Needle" : "hay") }), () => {});
  T.state.activeId = f.id; w.render();
  fireKeydown(d, w, "f", { ctrlKey: true });
  const input = d.getElementById("findInput");
  assert(rfList(w).length === 0, "nothing recorded by opening the bar");
  input.value = "needle"; fireInput(input, w);
  await sleep(200);
  assert(rfList(w).length === 0, "typing does not record");
  rfKey(input, w, "Enter");
  let l = rfList(w);
  assert(l.length === 1 && l[0].value === "needle" && l[0].source === "find" && l[0].caseSensitive === false && l[0].isRegex === false &&
    l[0].wholeWord === false && l[0].inverted === false, "Enter records the term (source find), got " + JSON.stringify(l));
  fireClick(d.getElementById("findCaseBtn"), w);
  fireClick(d.getElementById("findRegexBtn"), w);
  input.value = "Need.e"; fireInput(input, w);
  await sleep(200);
  d.getElementById("findAddFilterBtn").click();
  l = rfList(w);
  assert(l[0].value === "Need.e" && l[0].caseSensitive === true && l[0].isRegex === true && l[0].source === "find", "'Add as filter' records with its case/regex flags");
  assert(d.getElementById("findBar").classList.contains("hidden"), "sanity: Add as filter closed the bar");
  // reopen: list + apply
  fireKeydown(d, w, "f", { ctrlKey: true });
  const dd = d.querySelector("#findBar .recent-dd");
  assert(dd && dd.hidden, "reopening with the previous query (no other entry contains it) shows no list");
  input.value = ""; fireInput(input, w);
  assert(dd.querySelectorAll(".rd-row").length === 2 && dd.querySelector(".rd-head").textContent === "Recent filters", "empty input: both entries listed");
  rfKey(input, w, "ArrowDown"); rfKey(input, w, "ArrowDown");
  rfKey(input, w, "Enter");
  assert(input.value === "needle" && !w.eval("pressedGet(findCaseBtn)") && !w.eval("pressedGet(findRegexBtn)"), "applying the second entry sets value and clears case/regex");
  assert(dd.hidden, "list closed after applying");
  await sleep(50);
  assert(w.eval("findState.query") === "needle" && w.eval("findState.hits.length") > 0, "the search re-ran with the applied entry");
  // Escape order
  input.value = ""; fireInput(input, w);
  assert(!dd.hidden, "list visible again");
  rfKey(input, w, "Escape");
  assert(dd.hidden && !d.getElementById("findBar").classList.contains("hidden"), "first Escape closes only the list");
  rfKey(input, w, "Escape");
  fireKeydown(d, w, "Escape");
  assert(d.getElementById("findBar").classList.contains("hidden"), "next Escape closes the find bar");
  // apply via mousedown in the popup list too: entries from find show with badges
  w.openFilterPopup();
  const r0 = rfRows(d)[0];
  assert(r0.querySelector(".rd-src") && [...r0.querySelectorAll(".rd-badge")].map(b => b.textContent).join() === ".*,Aa", "find entries appear in the filter popup list with search icon and .* Aa badges");
  rfMouseDown(r0, w);
  assert(d.getElementById("filterInput").value === "Need.e" && w.isFilterRegexMode(), "applying a find entry in the popup sets value + Regex");
});
