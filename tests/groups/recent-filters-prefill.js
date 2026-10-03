// GROUP recent-filters-prefill — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP recent-filters-prefill — the recent list opens only over an EMPTY input
   Origin: 2026-10-03. openFilterPopup() / openFindBar() used to draw the full
   list even when the entry point then (or already) filled the input
   ("Filter for this message", selection prefill, previous find query).
   ============================================================ */
group("recent-filters-prefill");

const RFP_KEY = "philogg.recentFilters";
const rfpSeed = w => w.localStorage.setItem(RFP_KEY, JSON.stringify(["alpha", "beta", "needle"].map(v => ({
  value: v, isRegex: false, caseSensitive: false, wholeWord: false, inverted: false, source: "filter" }))));

await withApp(async (w, d, T) => {
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id; w.render();
  rfpSeed(w);
  const fpOpen = () => !!d.querySelector("#filterPopup .recent-dd:not([hidden])");
  const fbOpen = () => !!d.querySelector("#findBar .recent-dd:not([hidden])");
  const fInput = d.getElementById("filterInput");
  const bInput = d.getElementById("findInput");

  section("recent-filters-prefill a. Filter popup");
  w.openFilterPopup();
  assert(fpOpen(), "plain new-filter popup: list shown over the empty input");
  w.closeFilterPopup();
  const entry = T.state.nodes[f.id].entries[0];
  w.openFilterForEntryColumn(entry, { key: "message", label: "Message" });
  assert(fInput.value !== "", "sanity: the input is prefilled");
  assert(!fpOpen(), "Filter for this message: list hidden over the prefill");
  fInput.value = "alp"; fireInput(fInput, w);
  assert(fpOpen() && d.querySelectorAll("#filterPopup .recent-dd .rd-row").length === 1, "typing afterwards shows the matching suggestion");
  w.closeFilterPopup();

  section("recent-filters-prefill b. Find bar");
  w.openFindBar();
  assert(fbOpen(), "empty find bar: list shown");
  bInput.value = "needle"; fireInput(bInput, w);
  w.closeFindBar();
  assert(bInput.value === "needle", "sanity: the previous query is remembered");
  w.openFindBar();
  assert(!fbOpen(), "reopened with the previous query: list hidden");
  bInput.value = "bet"; fireInput(bInput, w);
  assert(fbOpen(), "typing in the prefilled bar shows suggestions");
  w.closeFindBar();
  // selection prefill
  bInput.value = "";
  const p = d.createElement("p"); p.textContent = "selected"; d.body.appendChild(p);
  const range = d.createRange(); range.selectNodeContents(p);
  const sel = w.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  w.openFindBar();
  assert(bInput.value === "selected", "sanity: selection became the query, got " + bInput.value);
  assert(!fbOpen(), "selection prefill: list hidden");
  w.closeFindBar();
  sel.removeAllRanges();
  bInput.value = "";
  w.openFindBar();
  assert(fbOpen(), "empty again: list shown");
});
