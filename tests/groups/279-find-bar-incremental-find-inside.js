// GROUP 279 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 279 — Find bar: incremental find inside the current view
   Origin: FEATURE_BACKLOG.md #3 (2026-09-25). Ctrl+F always created a
   filter node, so "just look for this string once" cost a tree node you
   then deleted. The find bar (#findBar) is a non-destructive search over
   the CURRENT view's entry array (the data model, not the DOM): Ctrl+G
   opens it, typing searches (150ms debounce) and jumps to the first hit,
   F3/Shift+F3 and Enter/Shift+Enter step with wrap-around, "n / m" counts
   matching rows, hits are marked (mark.find-match-mark) in rendered rows,
   Esc closes it. Ctrl+Shift+F opens the filter popup (Ctrl+F/G since 2026-10-04). The scan is
   time-sliced for huge views (279b drives that path by making
   performance.now() jump, so each 2048-entry batch ends a slice).
   ============================================================ */
group(279);
await withApp(async (w, d, T) => {
  section("279a. Find bar: Ctrl+F, find-as-you-type, F3/Enter navigation with wrap, marks, toggles, Esc — no filter node created");
  const fb = d.createElement("script");
  fb.textContent = "window.__find = { get state() { return findState; } };";
  d.body.appendChild(fb);
  const F = () => w.__find.state;

  const f = await w.addFile("a.log", makeLog(0, 60, { suffix: i => (i % 7 === 0 ? "Needle" : "hay") }), () => {});
  T.state.activeId = f.id;
  w.render();
  const bar = d.getElementById("findBar");
  const input = d.getElementById("findInput");
  const count = d.getElementById("findCount");
  const nodeCount0 = Object.keys(T.state.nodes).length;
  const hitIds = f.entries.filter((e, i) => i % 7 === 0).map(e => e.id); // entries 0,7,...,56
  assert(!isVisible(bar, w), "the find bar starts hidden");

  fireKeydown(d, w, "f", { ctrlKey: true });
  assert(isVisible(bar, w), "Ctrl+F opens the find bar");
  assert(d.activeElement === input, "...and focuses its input");
  assert(d.getElementById("filterPopup").classList.contains("hidden"), "...without opening the filter popup");

  input.value = "needle";
  fireInput(input, w);
  assert(F().hits.length === 0, "typing is debounced — nothing searched synchronously");
  await sleep(200);
  assert(F().done && F().hits.length === 9, "the debounced search finds all 9 matching rows (case-insensitive), got " + F().hits.length);
  assert(F().entries === T.currentViewEntries && F().kind === "filter", "it searched the Filtered view's own entry list (the data model)");
  assert(T.state.selectedId === hitIds[0], "find-as-you-type selects the first hit");
  assert(count.textContent === "1 / 9", "the counter reads n / m, got " + JSON.stringify(count.textContent));
  const marks = [...d.querySelectorAll("#tableRows mark.find-match-mark")];
  assert(marks.length > 0 && marks.every(m => m.textContent.toLowerCase() === "needle"),
    "hits are marked in the rendered rows, got " + JSON.stringify(marks.map(m => m.textContent)));
  assert(Object.keys(T.state.nodes).length === nodeCount0, "searching created no filter node");

  fireKeydown(d, w, "F3");
  assert(T.state.selectedId === hitIds[1] && count.textContent === "2 / 9", "F3 steps to the next hit (2 / 9), got " + count.textContent);
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert(T.state.selectedId === hitIds[2] && count.textContent === "3 / 9", "Enter in the input steps to the next hit too");
  fireKeydown(d, w, "F3", { shiftKey: true });
  assert(T.state.selectedId === hitIds[1], "Shift+F3 steps back");
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
  assert(T.state.selectedId === hitIds[0], "Shift+Enter steps back too");
  fireKeydown(d, w, "F3", { shiftKey: true });
  assert(T.state.selectedId === hitIds[8] && count.textContent === "9 / 9", "previous from the first hit wraps to the last (9 / 9)");
  assert(d.querySelector('#tableRows [data-entry-id="' + hitIds[8] + '"]'),
    "the last hit (row 56, outside the initial render window) was scrolled into the rendered window");
  fireKeydown(d, w, "F3");
  assert(T.state.selectedId === hitIds[0], "next from the last hit wraps to the first");
  fireKeydown(d, w, "f", { ctrlKey: true });
  assert(T.state.selectedId === hitIds[0] && input.selectionStart === 0 && input.selectionEnd === input.value.length,
    "Ctrl+F with the find input already focused selects the query and does not step (see GROUP find-shortcut-ctrl-f)");
  fireKeydown(d, w, "g", { ctrlKey: true });
  assert(T.state.selectedId === hitIds[1], "Ctrl+G is a find-next alias");

  // A step starts from the current selection, wherever it came from.
  w.selectEntry(f.entries[30].id);
  assert(count.textContent === "9 matches", "a selected non-hit shows the total only, got " + JSON.stringify(count.textContent));
  fireKeydown(d, w, "F3");
  assert(T.state.selectedId === f.entries[35].id && count.textContent === "6 / 9", "F3 from a selected row goes to the next hit after it");
  w.selectEntry(f.entries[30].id);
  fireKeydown(d, w, "F3", { shiftKey: true });
  assert(T.state.selectedId === f.entries[28].id, "Shift+F3 from a selected row goes to the hit before it");

  // Toggles and the shared query language.
  const caseBtn = d.getElementById("findCaseBtn");
  const regexBtn = d.getElementById("findRegexBtn");
  fireClick(caseBtn, w);
  assert(caseBtn.getAttribute("aria-pressed") === "true" && F().hits.length === 0 && count.textContent === "No results",
    "Aa makes the search case-sensitive: 'needle' no longer matches 'Needle'");
  fireClick(caseBtn, w);
  assert(F().hits.length === 9, "toggling Aa off again restores the 9 hits");
  fireClick(regexBtn, w);
  input.value = "Need+le";
  fireInput(input, w);
  await sleep(200);
  assert(F().hits.length === 9, "regex mode: /Need+le/ finds the same 9 rows, got " + F().hits.length);
  input.value = "(";
  fireInput(input, w);
  await sleep(200);
  assert(count.textContent === "Invalid regex" && input.classList.contains("input-regex-error") && F().hits.length === 0,
    "an invalid regex is flagged instead of throwing");
  assert(d.getElementById("findAddFilterBtn").disabled, "...and can't be added as a filter");
  fireClick(regexBtn, w);
  input.value = "message [*:int] Needle";
  fireInput(input, w);
  await sleep(200);
  assert(F().hits.length === 9, "a wildcard-token pattern searches exactly like a filter would (same query language), got " + F().hits.length);

  // The list a view shows changes -> the hits follow it.
  input.value = "needle";
  fireInput(input, w);
  await sleep(200);
  const sub = w.createFilterNode(f.id, "text", "message 1");
  w.render();
  assert(F().entries === T.currentViewEntries && T.currentViewEntries.length === 11,
    "switching to a new filter re-scans the new Filtered list");
  assert(F().hits.length === 1 && T.currentViewEntries[F().hits[0]].message.includes("message 14"),
    "...and only its rows count (message 14 is the one 'Needle' among 1,10-19), got " + F().hits.length);
  T.state.activeId = f.id;
  w.render();
  assert(F().hits.length === 9, "back on the file node: 9 hits again");

  // The Context view is searched when it's the view on screen.
  w.applyFhView("highlight");
  assert(F().kind === "highlight" && F().entries === T.currentHighlightViewEntries, "on the Context tab the find bar searches the Context view's list (for a file node the very same array — only the view a step selects in changes)");
  w.selectHighlightEntry(f.entries[20].id);
  fireKeydown(d, w, "F3");
  assert(T.state.selectedId === f.entries[21].id && T.state.entriesView === "highlight",
    "F3 there selects the next hit in the Context view");
  // On a filter node the Context view is its own list (matches + revealed
  // context rows, collapsed gaps excluded) — that's what gets searched.
  T.state.activeId = sub.id;
  w.render();
  w.applyFhView("highlight");
  const ctxList = T.currentHighlightViewEntries;
  const ctxExpected = ctxList.filter(e => /needle/i.test(e.raw)).length;
  assert(F().kind === "highlight" && F().entries === ctxList && ctxList !== T.currentViewEntries && F().hits.length === ctxExpected,
    "on a filter node's Context view the hits come from that view's own list (" + ctxExpected + " expected), got " + F().hits.length);
  T.state.activeId = f.id;
  w.render();
  w.applyFhView("filter");

  // Esc closes: marks gone, focus released, still no node created.
  input.focus();
  fireKeydown(d, w, "Escape");
  assert(!isVisible(bar, w), "Esc closes the find bar");
  assert(d.activeElement !== input, "...and releases the input's focus (so app shortcuts work again)");
  assert(!d.querySelector("mark.find-match-mark"), "...and removes every find mark");
  assert(Object.keys(T.state.nodes).length === nodeCount0 + 1, "the whole search session created no node (the one extra is the explicit 'message 1' filter)");
  void sub;

  // Ctrl+Shift+F: the filter popup.
  fireKeydown(d, w, "F", { ctrlKey: true, shiftKey: true });
  assert(!d.getElementById("filterPopup").classList.contains("hidden") && !isVisible(bar, w),
    "Ctrl+Shift+F opens the filter popup, not the find bar");
  fireKeydown(d, w, "F3");
  assert(!isVisible(bar, w), "F3 typed into another input (the filter popup's) is left alone");
  fireKeydown(d, w, "Escape");

  // F3 with the bar closed reopens it on the remembered query and steps.
  d.activeElement && d.activeElement.blur && d.activeElement.blur();
  w.selectEntry(f.entries[0].id);
  fireKeydown(d, w, "F3");
  assert(isVisible(bar, w) && input.value === "needle" && T.state.selectedId === hitIds[1],
    "F3 with the bar closed reopens it with the last query and steps to the next hit");
  fireClick(d.getElementById("findCloseBtn"), w);
  assert(!isVisible(bar, w), "the close button closes it");
});

await withApp(async (w, d, T) => {
  section("279b. Find bar on a large view: the scan is time-sliced, a step pressed mid-scan is applied when it finishes");
  const fb = d.createElement("script");
  fb.textContent = "window.__find = { get state() { return findState; } };";
  d.body.appendChild(fb);
  const F = () => w.__find.state;
  const N = 6000;
  const f = await w.addFile("big.log", makeLog(0, N, { suffix: i => (i % 1000 === 999 ? "Needle" : "hay") }), () => {});
  T.state.activeId = f.id;
  w.render();
  // Every performance.now() call advances 50ms, so every 2048-entry batch
  // exceeds the slice budget and the scan yields — deterministic slicing
  // without needing a genuinely huge file.
  let fakeNow = 0;
  Object.defineProperty(w.performance, "now", { value: () => (fakeNow += 50), configurable: true });

  const input = d.getElementById("findInput");
  input.value = "needle";
  fireKeydown(d, w, "f", { ctrlKey: true }); // opens with the typed query, no auto-jump
  assert(!F().done && F().hits.length === 2, "the first slice ran synchronously and stopped after one batch (hits 999, 1999), got " + F().hits.length);
  assert(d.getElementById("findCount").textContent.endsWith("…"), "the counter shows a running partial count while scanning");
  fireKeydown(d, w, "F3");
  assert(T.state.selectedId == null || T.state.selectedId !== f.entries[999].id, "a step pressed mid-scan waits for the scan");
  assert(await waitFor(() => F().done), "the scan finishes over later slices");
  assert(F().hits.length === 6, "all 6 hits were found across the slices, got " + F().hits.length);
  assert(T.state.selectedId === f.entries[999].id, "the step pressed mid-scan was applied once it finished (first hit)");
  assert(d.getElementById("findCount").textContent === "1 / 6", "counter 1 / 6");
  input.value = "hay";
  fireInput(input, w);
  input.value = "needle x";
  fireInput(input, w);
  await sleep(200);
  assert(await waitFor(() => F().done) && F().hits.length === 0 && F().query === "needle x",
    "a newer query supersedes the older one (debounce + scan generation), got query " + JSON.stringify(F().query));
});
