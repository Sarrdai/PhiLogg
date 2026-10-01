// GROUP 97 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 97 — Live tail follow on the Highlight/Full view too
   Origin: this session, FEATURE_BACKLOG.md #25 ("Optional tail auto-follow
   for the Highlight view — currently deliberately static while the Filter
   view follows tailed entries") plus a person-requested extension: any
   scroll/jump that lands back near the bottom of a tailed view (not just a
   click on the floating "Newest" button) should re-engage follow the same
   way the button does. state.tailFollow is one shared flag now driving BOTH
   #tableBody (Filtered) and #highlightBody (Highlight/Full) — see
   onTailChange/renderHighlightView's pendingHighlightScroll and the two
   scroll listeners' maybeReengageTailFollow call.
   jsdom has no real layout engine, so scrollHeight isn't naturally non-zero
   the way it would be in a browser — each scenario below stubs it directly
   on the relevant body element (same pattern Group 73 already uses for
   #tableRows.scrollWidth) so "distance from bottom" math has something real
   to compare against.
   ============================================================ */
group(97);
await withApp(async (w, d, T) => {
  section("97a. Tail growth auto-follows the Highlight/Full view too, not just Filtered");
  w.applyFhView("stacked"); // both Log views on screen: the Context view is only built while visible (GROUP 270)

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        return blob;
      },
    };
  }

  const initial = makeLog(0, 3);
  const handle = fakeHandle(initial);
  const f = await w.addFile("live.log", initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false };
  w.render();
  assert(T.state.tailFollow === true, "follow starts engaged (default state)");

  const tableBody = d.getElementById("tableBody");
  const highlightBody = d.getElementById("highlightBody");
  const tailJumpBtn = d.getElementById("tailJumpBtn");
  const tailJumpBtnHighlight = d.getElementById("tailJumpBtnHighlight");
  Object.defineProperty(tableBody, "scrollHeight", { value: 3000, configurable: true });
  Object.defineProperty(highlightBody, "scrollHeight", { value: 3000, configurable: true });

  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"new entry"\n`;
  handle._setText(initial + appended);
  await w.tailTick();
  assert(T.currentHighlightViewEntries.length === 4, "the Highlight/Full view's own entry list grew from the tail update too");
  assert(tableBody.scrollTop === 3000, "Filtered view still follows tail growth to the bottom (no regression)");
  assert(highlightBody.scrollTop === 3000, "Highlight/Full view NOW also follows tail growth to the bottom");
  assert(isVisible(tailJumpBtn, w) === false && isVisible(tailJumpBtnHighlight, w) === false,
    "both jump buttons stay hidden while follow is engaged");

  section("97b. Scrolling away from the bottom disengages follow — in either view, one shared flag");

  await new Promise(r => setTimeout(r, 200)); // clear the programmatic-scroll grace window
  highlightBody.scrollTop = 0;
  highlightBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  assert(T.state.tailFollow === false, "scrolling away from the bottom in the Highlight view disengages follow");
  assert(isVisible(tailJumpBtnHighlight, w) === true, "the Highlight view's own jump button appears");
  assert(isVisible(tailJumpBtn, w) === true,
    "the Filtered view's jump button appears too — tailFollow is one shared flag, not per-view");

  section("97c. Scrolling/jumping back near the bottom re-engages follow — same effect as the jump button");

  highlightBody.scrollTop = 3000; // e.g. a native "jump to last line" shortcut landing at the end
  highlightBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  assert(T.state.tailFollow === true, "scrolling/jumping back to the bottom re-engages follow, without needing the button click");
  assert(isVisible(tailJumpBtnHighlight, w) === false, "the jump button hides again once follow re-engages");

  section("97d. Same disengage/re-engage-on-scroll behavior for the pre-existing Filtered view");

  await new Promise(r => setTimeout(r, 200));
  tableBody.scrollTop = 0;
  tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  assert(T.state.tailFollow === false, "scrolling away from the bottom in the Filtered view disengages follow");
  tableBody.scrollTop = 3000;
  tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  assert(T.state.tailFollow === true, "scrolling back to the bottom in the Filtered view re-engages follow too");

  section("97e. Clicking a row in the Highlight view disengages follow, same as the Filtered view");

  w.selectHighlightEntry(f.entries[0].id);
  assert(T.state.tailFollow === false, "selecting a row in the Highlight view stops follow from yanking the view away from it");

  section("97f. #tailJumpBtnHighlight re-engages follow and jumps to the newest entry, mirroring #tailJumpBtn");

  highlightBody.scrollTop = 0;
  tailJumpBtnHighlight.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(T.state.tailFollow === true, "clicking the Highlight view's jump button re-engages follow");
  assert(highlightBody.scrollTop === 3000, "...and jumps straight to the newest entry");
  assert(tableBody.scrollTop === 3000, "...and the Filtered view is brought along too (one shared follow state)");
});

await withApp(async (w, d, T) => {
  section("103. Re-clicking the already-active filter in the tree (after a dblclick jumped to Context) still reveals the Filtered view");

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const nodeA = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = nodeA.id;
  w.render();

  const rowFor = id => [...d.querySelectorAll(".tree-row")].find(r => r.dataset.nodeId === id);

  assert(T.fhActiveTab === "filter", "sanity: selecting the filter starts out on the Filtered tab");
  w.applyFhView("highlight");
  assert(T.fhActiveTab === "highlight", "sanity: jumped to Full (e.g. via double-click on a Filtered row)");

  // activeId is already nodeA — clicking its own tree row again does NOT
  // change state.activeId, so render()'s activeId-changed check
  // (lastActiveIdForReveal) alone would never fire. Regression for the bug
  // where clicking an already-selected filter left the user stuck on Full.
  fireClick(rowFor(nodeA.id), w);
  assert(T.state.activeId === nodeA.id, "sanity: activeId unchanged — same filter clicked again");
  assert(T.fhActiveTab === "filter", "re-clicking the already-active filter still jumps Full -> Filtered");

  /* ---------- Stacked: re-clicking the same filter does NOT change fhLayout ---------- */
  w.applyFhView("stacked");
  fireClick(rowFor(nodeA.id), w);
  assert(T.fhLayout === "stacked", "Stacked stays unchanged when re-clicking the already-active filter");
});
