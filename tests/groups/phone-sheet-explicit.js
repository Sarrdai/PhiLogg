// GROUP phone-sheet-explicit — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-sheet-explicit — the phone entry-detail sheet opens only on a card tap
   Origin: 2026-10-03. body.sheet-open = a selected entry AND the UI flag
   phoneSheetOpen (set by a plain card tap). Find steps / minimap-like
   programmatic selections select + highlight without opening it; once open
   the sheet follows the selection; close hides it but keeps the selection;
   clearing the selection resets the flag. Desktop is unaffected.
   Data: log-sim "basic" scenario.
   ============================================================ */
group("phone-sheet-explicit");

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 400, seed: 31 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  const open = () => d.body.classList.contains("sheet-open");
  const input = d.getElementById("findInput"), count = d.getElementById("findCount");
  const card = id => d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]');
  const hasCount = () => /^\d+ \/ \d+$/.test(count.textContent);

  section("phone-sheet-explicit a. Find steps select without opening the sheet");
  fireKeydown(d, w, "f", { ctrlKey: true });
  input.value = "heartbeat"; fireInput(input, w);
  await waitFor(() => /matches?$/.test(count.textContent) || hasCount(), 3000);
  fireKeydown(d, w, "F3");
  assert(T.state.selectedId && hasCount() && !open(), "first find step selects a hit, sheet stays closed, got '" + count.textContent + "'");
  const first = T.state.selectedId;
  fireKeydown(d, w, "F3");
  assert(T.state.selectedId && T.state.selectedId !== first && !open(), "second step moves the selection, sheet still closed");

  section("phone-sheet-explicit b. Tapping the selected card opens it; steps follow while open");
  const hit = T.state.selectedId;
  assert(card(hit), "the current hit's card is rendered");
  card(hit).click();
  assert(open() && T.state.selectedId === hit, "tap on the selected card opens the sheet");
  fireKeydown(d, w, "F3");
  assert(open() && T.state.selectedId !== hit && hasCount(), "another find step keeps the sheet open and follows the hit");
  const stepped = T.state.selectedId;
  const entries = T.currentViewEntries, si = entries.findIndex(e => e.id === stepped);
  d.getElementById("detailNext").click();
  assert(open() && T.state.selectedId === entries[si + 1].id, "next keeps it open and follows");

  section("phone-sheet-explicit c. Close hides the sheet, keeps selection and counter");
  fireKeydown(d, w, "F3");
  assert(open() && hasCount(), "back on a hit with the sheet open, got '" + count.textContent + "'");
  const beforeClose = T.state.selectedId, counterBefore = count.textContent;
  d.getElementById("detailClose").click();
  assert(!open() && T.state.selectedId === beforeClose, "close hides the sheet, selection kept");
  assert(count.textContent === counterBefore, "find counter keeps '" + counterBefore + "', got '" + count.textContent + "'");
  fireKeydown(d, w, "F3", { shiftKey: true });
  assert(!open() && T.state.selectedId, "a find step after closing does not reopen it");

  section("phone-sheet-explicit d. Programmatic selection and re-selection after deselect stay closed");
  const target = entries[10].id;
  w.selectEntry(target, { scroll: true, index: 10 });
  assert(!open() && T.state.selectedId === target, "minimap-like selectEntry with the sheet closed does not open it");
  card(target).click();
  assert(open(), "tap opens it");
  w.eval("selectEntry(null)");
  assert(T.state.selectedId == null && !open(), "clearing the selection hides the sheet");
  w.selectEntry(entries[12].id, { scroll: true, index: 12 });
  assert(T.state.selectedId === entries[12].id && !open(), "selecting again afterwards does not reopen it");

  section("phone-sheet-explicit e. Desktop width: selection and detail panel unaffected");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
  w.selectEntry(entries[20].id, { scroll: true, index: 20 });
  assert(T.state.selectedId === entries[20].id && !d.getElementById("detailPanel").classList.contains("empty"), "desktop: selection fills the detail panel");
  assert(d.getElementById("detailMeta").textContent.length > 0, "desktop: detail meta rendered");
});
