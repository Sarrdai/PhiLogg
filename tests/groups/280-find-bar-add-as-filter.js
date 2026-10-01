// GROUP 280 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 280 — Find bar: "Add as filter" promotes the search
   Origin: FEATURE_BACKLOG.md #3 (2026-09-25). "Add as filter" (and
   Ctrl+Enter in the find input) turns the current search into a "text"
   filter node under the active node via the SAME createFilterNode call the
   Ctrl+F popup's commitFilter makes — so the node has exactly the shape a
   popup-created one has (no new field to thread through the persistence
   carriers), keeps exactly the rows the search counted, closes the bar and
   reveals the Filtered view. Also: the three find shortcuts are listed and
   rebindable in the Shortcut Manager.
   ============================================================ */
group(280);
await withApp(async (w, d, T) => {
  section("280. Find bar: Add as filter / Ctrl+Enter create the same node Ctrl+F would; Shortcut Manager lists + rebinds the find keys");
  const fb = d.createElement("script");
  fb.textContent = "window.__find = { get state() { return findState; } };";
  d.body.appendChild(fb);
  const F = () => w.__find.state;
  const f = await w.addFile("a.log", makeLog(0, 60, { suffix: i => (i % 7 === 0 ? "Needle" : "hay") }), () => {});
  T.state.activeId = f.id;
  w.render();
  w.applyFhView("highlight"); // start on Context: adding must reveal Filtered
  const bar = d.getElementById("findBar");
  const input = d.getElementById("findInput");
  const addBtn = d.getElementById("findAddFilterBtn");

  fireKeydown(d, w, "g", { ctrlKey: true });
  input.value = "needle";
  fireInput(input, w);
  await sleep(200);
  assert(F().hits.length === 9, "sanity: 9 hits");
  const childCount0 = f.children.length;
  fireClick(addBtn, w);
  assert(f.children.length === childCount0 + 1, "Add as filter created exactly one child of the active node");
  const node = T.state.nodes[f.children[f.children.length - 1]];
  assert(node.type === "filter" && node.filterType === "text" && node.value === "needle" && !node.caseSensitive && !node.isRegex && !node.inverted,
    "...a plain text filter carrying the query");
  assert(node.name === "“needle”", "...named like a Ctrl+F filter, got " + node.name);
  assert(w.getEntries(node.id).length === 9, "...keeping exactly the 9 rows the search counted");
  assert(T.state.activeId === node.id, "...and it became the active node");
  assert(!isVisible(bar, w) && d.activeElement !== input, "the find bar closed after promoting the search");
  assert(T.fhActiveTab === "filter", "the Filtered view was revealed (the new filter's result lives there)");

  // Same shape as a node the Ctrl+F popup creates for the same query.
  T.state.activeId = f.id;
  w.render();
  fireKeydown(d, w, "f", { ctrlKey: true });
  d.getElementById("filterInput").value = "needle";
  fireSubmit(d.getElementById("filterForm"), w);
  const popupNode = T.state.nodes[f.children[f.children.length - 1]];
  assert(popupNode !== node && popupNode.value === "needle", "sanity: the popup created its own node");
  const shape = n => Object.keys(n).filter(k => !k.startsWith("_")).sort().join(",");
  assert(shape(node) === shape(popupNode), "the find-bar node has exactly the popup node's fields: " + shape(node) + " vs " + shape(popupNode));

  // Case + regex carry over; Ctrl+Enter is the keyboard path.
  T.state.activeId = f.id;
  w.render();
  fireKeydown(d, w, "g", { ctrlKey: true });
  fireClick(d.getElementById("findCaseBtn"), w);
  fireClick(d.getElementById("findRegexBtn"), w);
  input.value = "(";
  fireInput(input, w);
  const before = f.children.length;
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(f.children.length === before && isVisible(bar, w), "Ctrl+Enter with an invalid regex creates nothing and keeps the bar open");
  input.value = "Need+le";
  fireInput(input, w);
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  const rxNode = T.state.nodes[f.children[f.children.length - 1]];
  assert(f.children.length === before + 1 && rxNode.isRegex === true && rxNode.caseSensitive === true && rxNode.value === "Need+le",
    "Ctrl+Enter (even before the debounce fired) adds a case-sensitive regex filter from the toggles");
  assert(rxNode.name === "/Need+le/" && w.getEntries(rxNode.id).length === 9, "...named /Need+le/, 9 rows");

  // Shortcut Manager: listed, and a rebind takes effect.
  w.renderShortcutBindingsList();
  const row = id => d.querySelector('#shortcutBindingsList [data-action-id="' + id + '"]');
  const keys = id => [...row(id).querySelectorAll("kbd")].map(k => k.textContent).join("+");
  assert(row("findInView") && keys("findInView") === "Ctrl+G", "Shortcut Manager lists 'Find in the current view' as Ctrl+G, got " + (row("findInView") && keys("findInView")));
  assert(row("findNext") && keys("findNext") === "F3", "...'next match' as F3");
  assert(row("findPrev") && keys("findPrev") === "Shift+F3", "...'previous match' as Shift+F3");
  assert(keys("newFilter") === "Ctrl+F", "...and Ctrl+F is still 'New filter'");
  fireClick(row("findInView").querySelector(".shortcut-rebind-btn"), w);
  fireKeydown(d, w, "k", { ctrlKey: true, altKey: true });
  assert(keys("findInView") === "Ctrl+Alt+K", "rebinding the find shortcut works, got " + keys("findInView"));
  fireKeydown(d, w, "g", { ctrlKey: true });
  assert(!isVisible(bar, w), "the old Ctrl+G no longer opens the bar");
  fireKeydown(d, w, "k", { ctrlKey: true, altKey: true });
  assert(isVisible(bar, w), "the new chord does");
  fireClick(d.getElementById("btnResetShortcuts"), w);
  fireKeydown(d, w, "Escape");
});
