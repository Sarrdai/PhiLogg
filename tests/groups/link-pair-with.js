// GROUP link-pair-with — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-pair-with — row context menu "Pair with…" and pick mode
   Origin: 2026-10-04 (link usability round B, step 3). Menu item on real rows (hidden on a
   link-view pair), pick banner (waiting / picked with the signed Δt and the shared name=value
   fields), start/end row markers, "Pair all like these…" opens the link dialog prefilled
   (message patterns, direction from the rows' order, key job preselected), Esc/Cancel/Close,
   other-file toast, selection untouched while picking, picking in the Context view and on the
   real rows of a link-view block, pick mode cancelled when the file goes away.
   ============================================================ */
group("link-pair-with");

if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourLog = TOUR.demoLog();
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const ctxEv = () => ({ clientX: 10, clientY: 10, preventDefault() {}, target: null });
  const rowFor = (d, e) => d.querySelector('#tableRows [data-entry-id="' + e.id + '"]');
  const esc = (w, d) => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const banner = d => d.querySelector("#pairPickBanner");

  async function setup(w, d, T) {
    const f = await w.addFile("app.log", tourLog, () => {});
    const start = f.entries.find(e => e.message.includes("Move requested") && e.message.includes("job=J-00001"));
    const end = f.entries.find(e => e.message.includes("Position reached") && e.message.includes("job=J-00001"));
    const flt = w.createFilterNode(f.id, "text", "job=J-00001");
    T.state.activeId = flt.id;
    T.state.entriesView = "filter";
    w.render();
    return { f, start, end, flt };
  }

  await withApp(async (w, d, T) => {
    section("link-pair-with a. menu item on real rows, hidden on a pair; banner waiting -> picked with signed Δt");
    const { f, start, end } = await setup(w, d, T);
    assert(!!rowFor(d, start) && !!rowFor(d, end), "sanity: both rows are rendered in the filtered view");
    w.openContextMenu(ctxEv(), start);
    const item = d.querySelector("#ctxPairWith");
    assert(isVisible(item, w) && txt(item) === "Pair with…" && item.querySelector("svg"), "'Pair with…' with the link icon on a real row");
    assert(item.nextElementSibling === d.querySelector("#ctxWhyRow") && item.previousElementSibling === d.querySelector("#ctxExtractMessage"), "placed right after Extract");
    w.closeContextMenu();
    w.openContextMenu(ctxEv(), { isPair: true, id: "pair1", ts: 1, message: "x", first: start, second: end });
    assert(!isVisible(d.querySelector("#ctxPairWith"), w), "hidden for a link-view pair");
    w.closeContextMenu();

    const selBefore = T.state.selectedId;
    w.openContextMenu(ctxEv(), start);
    fireClick(d.querySelector("#ctxPairWith"), w);
    assert(d.querySelector("#contextMenu").classList.contains("hidden"), "the menu closes");
    assert(!banner(d).classList.contains("hidden") && /^Click the end event · start: Move requested axis=1 target=-13\.204 job=J-00001/.test(txt(banner(d))), "waiting banner: " + txt(banner(d)));
    assert(txt(banner(d).querySelector("[data-pp]")) === "Cancel", "Cancel button");
    assert(banner(d).nextElementSibling && banner(d).nextElementSibling.id === "viewArea", "banner sits above the views");
    assert(rowFor(d, start).classList.contains("pair-start") && d.body.classList.contains("pair-picking"), "start row marked");
    fireClick(rowFor(d, start), w);
    assert(/^Click the end event/.test(txt(banner(d))), "clicking the start row again keeps waiting");
    fireClick(rowFor(d, end), w);
    assert(T.state.selectedId === selBefore, "the pick did not select the row");
    assert(txt(banner(d)).startsWith("Δt +213 ms between the two rows · same ") && /axis=1/.test(txt(banner(d))) && /job=J-00001/.test(txt(banner(d))) && !/target=/.test(txt(banner(d))), "picked banner: " + txt(banner(d)));
    assert(rowFor(d, end).classList.contains("pair-end") && rowFor(d, start).classList.contains("pair-start"), "both rows marked");
    assert([...banner(d).querySelectorAll("[data-pp]")].map(b => txt(b)).join() === "Close,Pair all like these…", "Close + Pair all like these…");
    // a re-render keeps the markers (new row nodes carry the classes)
    w.render();
    assert(rowFor(d, end).classList.contains("pair-end") && rowFor(d, start).classList.contains("pair-start"), "markers survive a re-render");
    fireClick(banner(d).querySelector('[data-pp="cancel"]'), w);
    assert(banner(d).classList.contains("hidden") && !rowFor(d, start).classList.contains("pair-start") && !d.body.classList.contains("pair-picking"), "Close ends pick mode and clears the markers");
    // outside pick mode a click selects as before
    fireClick(rowFor(d, end), w);
    assert(T.state.selectedId === end.id, "normal click selects outside pick mode");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-pair-with b. Pair all like these…: dialog prefill, direction, key; reversed pick = previous");
    const { f, start, end } = await setup(w, d, T);
    w.openContextMenu(ctxEv(), start); fireClick(d.querySelector("#ctxPairWith"), w);
    fireClick(rowFor(d, end), w);
    fireClick(banner(d).querySelector('[data-pp="pairall"]'), w);
    assert(banner(d).classList.contains("hidden") && !w.document.body.classList.contains("pair-picking"), "pick mode ends");
    assert(!d.querySelector("#linkDialog").classList.contains("hidden"), "link dialog open");
    const inputs = d.querySelectorAll("#linkSides input.link-side-input");
    assert(inputs[0].value === "Move requested axis=[*:int] target=[*:float] job=[*:word]" && inputs[1].value === "Position reached axis=[*:int] actual=[*:float] job=[*:word]", "message patterns as Start/End: " + inputs[0].value + " | " + inputs[1].value);
    assert(d.querySelector('#linkSides .link-hop-dir [data-dir="after"]').getAttribute("aria-pressed") === "true", "end after start: next");
    await waitFor(() => /192/.test(d.querySelector("#linkLiveMatch").textContent));
    assert(d.querySelector('#linkKeyChips [data-key-chip="s:job=[*:word]"]').getAttribute("aria-pressed") === "true", "the ID-like field is preselected as key");
    w.closeLinkDialog();

    // reversed: start = the end event, end = the move -> previous, negative Δt
    w.openContextMenu(ctxEv(), end); fireClick(d.querySelector("#ctxPairWith"), w);
    fireClick(rowFor(d, start), w);
    assert(txt(banner(d)).startsWith("Δt -213 ms between"), "earlier end row: negative Δt, got " + txt(banner(d)));
    fireClick(banner(d).querySelector('[data-pp="pairall"]'), w);
    assert(d.querySelector('#linkSides .link-hop-dir [data-dir="before"]').getAttribute("aria-pressed") === "true", "end before start: previous");
    w.closeLinkDialog();
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-pair-with c. Esc cancels, other-file toast, file removal cancels");
    const { f, start, end } = await setup(w, d, T);
    const g = await w.addFile("other.log", tourLog, () => {});
    T.state.activeId = f.id;
    w.render();
    w.openContextMenu(ctxEv(), start); fireClick(d.querySelector("#ctxPairWith"), w);
    esc(w, d);
    assert(banner(d).classList.contains("hidden"), "Esc cancels pick mode");
    // other file: switch active node to the other file, click one of its rows
    T.state.activeId = f.id; w.render();
    const rowsF = d.querySelectorAll("#tableRows .log-row");
    w.openContextMenu(ctxEv(), start); fireClick(d.querySelector("#ctxPairWith"), w);
    T.state.activeId = g.id; w.render();
    assert(!banner(d).classList.contains("hidden"), "switching to another loaded file keeps pick mode while the start's file is loaded");
    const gRow = d.querySelector("#tableRows .log-row");
    fireClick(gRow, w);
    assert(d.querySelector("#copyToast").textContent.includes("Pick a row from the same file") && /^Click the end event/.test(txt(banner(d))), "row of another file: toast, still waiting");
    w.deleteFilterNodeWithUndo(f.id);
    w.render();
    assert(banner(d).classList.contains("hidden"), "start's file gone: pick mode cancelled");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-pair-with c2. same-timestamp rows: the direction follows the log order");
    const log = ["alpha one", "beta two"].map(m => `2024-01-15 10:00:00,000\tINFO\t"T1"\tFoo.cs\tline 0\t[DoWork]\t"${m}"`).join("\n") + "\n";
    const f = await w.addFile("ties.log", log, () => {});
    T.state.activeId = f.id; T.state.entriesView = "filter"; w.render();
    const [e1, e2] = f.entries;
    assert(e1.ts === e2.ts, "sanity: equal timestamps");
    const dirOf = async (a, b) => {
      w.openContextMenu(ctxEv(), a); fireClick(d.querySelector("#ctxPairWith"), w);
      fireClick(rowFor(d, b), w);
      assert(/^Δt \+0 ms/.test(txt(banner(d))), "tie: Δt +0 ms");
      fireClick(banner(d).querySelector('[data-pp="pairall"]'), w);
      const dir = d.querySelector('#linkSides .link-hop-dir [aria-pressed="true"]').dataset.dir;
      w.closeLinkDialog();
      return dir;
    };
    assert(await dirOf(e1, e2) === "after" && await dirOf(e2, e1) === "before", "tie: a later log line is 'after', an earlier one 'before'");
  });

  await withApp(async (w, d, T) => {
    section("link-pair-with d. picking in the Context view and on real rows inside a link-view block");
    const { f, start, end } = await setup(w, d, T);
    w.applyFhView("stacked");
    w.render();
    const hrow = e => d.querySelector('#highlightRows [data-entry-id="' + e.id + '"]');
    assert(!!hrow(start) && !!hrow(end), "sanity: both rows render in the Context view");
    {
      w.openContextMenu(ctxEv(), start); fireClick(d.querySelector("#ctxPairWith"), w);
      assert(hrow(start).classList.contains("pair-start"), "Context view: start marked");
      fireClick(hrow(end), w);
      assert(/^Δt \+213 ms/.test(txt(banner(d))) && hrow(end).classList.contains("pair-end"), "Context view: the pick works");
      w.cancelPairPick();
    }
    w.applyFhView("filter");
    T.state.entriesView = "filter";
    const A = w.bakedTextCondition("Move requested"), B = w.bakedTextCondition("Position reached");
    const link = w.createLinkNodeFromBaked(f.id, A, B, "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id;
    w.render();
    const prow = d.querySelector(".pair-block .pair-row");
    assert(!!prow, "sanity: link view rows");
    const rows = [...d.querySelectorAll(".pair-block")[0].querySelectorAll(".pair-row")];
    const selBefore = T.linkSelectedPairIndex;
    w.openContextMenu(ctxEv(), start); fireClick(d.querySelector("#ctxPairWith"), w);
    fireClick(rows[1], w);
    assert(T.linkSelectedPairIndex === selBefore, "the pick did not select the pair block");
    assert(/^Δt \+213 ms/.test(txt(banner(d))), "link view real row picked: " + txt(banner(d)));
    assert(rows[0].classList.contains("pair-start") && rows[1].classList.contains("pair-end"), "markers on the link-view rows");
    w.cancelPairPick();
  }, { indexedDB: new IDBFactory() });
}
