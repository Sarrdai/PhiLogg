// GROUP link-view-timeline — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-view-timeline — Link view pair blocks as a timeline
   Origin: 2026-10-09 (link view restyle, mockup variant B "Zeitleiste"). A block is
   [Δt column | rail column | rows]: one .pair-gutter per block (title, dataset.entryIds,
   combined-entry context menu), one .pair-dot per real entry (level class on its cell),
   "+Δt" in row 2..n (row 1 empty), no .pair-brace / .pair-row-bar / .pair-delta any more.
   An unmatched block gets one more row-height line ("—" cell, hollow dot, .pair-missing).
   Block height = (rows + unmatched line) * row height + 8 (linkBlockHeight); jsdom has no
   layout, so the rendered height is the sum of the gutter cells' / rows' inline heights.
   ============================================================ */
group("link-view-timeline");

if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourLog = TOUR.demoLog();
  const blocksDom = d => [...d.querySelectorAll("#linkBody .pair-block")];
  const cellsH = b => [...b.querySelector(".pair-gutter").children].reduce((s, c) => s + parseInt(c.style.height, 10), 0);
  const rowsH = b => [...b.querySelector(".pair-rows").children].reduce((s, c) => s + parseInt(c.style.height, 10), 0);

  await withApp(async (w, d, T) => {
    section("link-view-timeline a. pair: gutter, dots, Δt cells, heights");
    const f = await w.addFile("app.log", tourLog, () => {});
    const link = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id;
    T.state.entriesView = "filter";
    w.render();
    const blocks = blocksDom(d);
    assert(blocks.length > 0, "blocks rendered");
    assert(!d.querySelector(".pair-brace, .pair-row-bar, .pair-delta"), "no brace / row bar / delta line left in the DOM");
    for (const b of blocks.slice(0, 5)) {
      const i = +b.dataset.pairIndex;
      const real = T.linkPairsData[i].realEntries;
      assert(b.querySelectorAll(".pair-gutter").length === 1, "one gutter per block");
      const g = b.querySelector(".pair-gutter");
      assert(g.dataset.entryIds === real.map(e => e.id).join(",") && /right-click/.test(g.title), "gutter carries entry ids and title");
      assert(b.querySelectorAll(".pair-dot").length === real.length && b.querySelectorAll(".pair-row").length === real.length, "one dot and one row per real entry");
      const cells = [...g.querySelectorAll(".pair-g-cell")];
      cells.forEach((c, k) => assert(c.classList.contains(w.levelClass(real[k].level, real[k].formatId)) && c.querySelector(".pair-dot"), "dot cell " + k + " carries the entry's level class"));
      const dts = [...g.querySelectorAll(".pair-dt")].map(e => e.textContent);
      assert(dts[0] === "", "first Δt cell is empty");
      for (let k = 1; k < real.length; k++) {
        assert(dts[k] === "+" + w.formatDuration(real[k].ts - real[k - 1].ts) && /^\+\d/.test(dts[k]), "Δt cell " + k + " is +duration, got " + dts[k]);
        assert(g.querySelectorAll(".pair-dt")[k].title === dts[k], "full value in title");
      }
      assert(cellsH(b) + 8 === w.linkBlockHeight(real.length, false) && rowsH(b) === cellsH(b), "block height = linkBlockHeight (cells and rows agree)");
    }
    assert(w.linkBlockHeight(2, false) === 60 && w.linkBlockHeight(3, false) === 86 && w.linkBlockHeight(2, true) === 86, "pair 60px, 3-chain 86px, pair + unmatched line 86px");
    assert(T.linkBlockOffsets[1] === 60, "offsets use the 60px pair block");

    // selection toggles .pair-selected; click on gutter and on a row both work
    fireClick(blocks[0].querySelector(".pair-gutter"), w);
    assert(blocks[0].classList.contains("pair-selected") && T.linkSelectedPairIndex === 0, "gutter click selects");
    fireClick(blocks[0].querySelector(".pair-row"), w);
    assert(!blocks[0].classList.contains("pair-selected"), "a row click toggles it off again");
    fireClick(blocks[0].querySelector(".pair-row"), w);
    assert(blocks[0].classList.contains("pair-selected"), "...and on");

    // right-click on the gutter opens the context menu for the combined pair
    const ev = new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 });
    blocks[1].querySelector(".pair-gutter").dispatchEvent(ev);
    assert(ev.defaultPrevented && !d.querySelector("#contextMenu").classList.contains("hidden"), "gutter right-click opens the context menu");
    assert(d.querySelector("#ctxPairWith").style.display === "none", "...for the combined pair entry (no 'Pair with…', that is for real rows)");
    // ...while a row's right-click targets the single real entry
    const ev2 = new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 });
    blocks[1].querySelector(".pair-row").dispatchEvent(ev2);
    assert(d.querySelector("#ctxPairWith").style.display !== "none", "a row right-click targets the single real entry ('Pair with…' shown)");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-view-timeline b. 3-hop chain: three dots, two Δt cells, 86px");
    const f = await w.addFile("app.log", tourLog, () => {});
    const hops = [
      { baked: w.bakedTextCondition("Position reached"), direction: "after", n: 1 },
      { baked: w.bakedTextCondition("Heartbeat OK"), direction: "after", n: 1 },
    ];
    const chain = w.hopsToLinkChain(w.bakedTextCondition("Move requested"), hops, {});
    const created = w.createLinkNodeFromBaked(f.id, chain.bakedA, chain.bakedB, chain.linkDirection, chain.linkN, {});
    assert(created && w.getEntries(created.id).length > 0, "sanity: the 3-hop chain has tuples");
    T.state.activeId = created.id;
    T.state.entriesView = "filter";
    w.render();
    const blocks = blocksDom(d);
    const three = blocks.filter(b => b.querySelectorAll(".pair-dot").length === 3);
    assert(three.length > 0, "chain blocks have 3 dots (" + blocks.length + " blocks)");
    const b = three[0];
    const dts = [...b.querySelectorAll(".pair-dt")].map(e => e.textContent);
    assert(dts[0] === "" && /^\+/.test(dts[1]) && /^\+/.test(dts[2]), "Δt: empty, +…, +…: " + dts.join("|"));
    assert(cellsH(b) + 8 === 86 && w.linkBlockHeight(3, false) === 86 && T.linkBlockOffsets[1] - T.linkBlockOffsets[0] === cellsH(blocks[0]) + 8, "86px for a 3-chain");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-view-timeline c. unmatched inline block: extra line, hollow dot, missing text");
    const f = await w.addFile("app.log", tourLog, () => {});
    const link = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id;
    T.state.entriesView = "filter";
    w.render();
    const chip = d.querySelector("#linkUnChip");
    fireClick(chip, w);
    fireClick(chip, w); // only unmatched
    const blocks = blocksDom(d);
    const b = blocks[0];
    assert(b.classList.contains("pair-unmatched"), "unmatched block");
    assert(b.querySelectorAll(".pair-dot").length === 2 && b.querySelectorAll(".pair-g-missing .pair-dot").length === 1, "one dot for the real entry + the hollow warn dot");
    assert(b.querySelector(".pair-g-missing .pair-dt").textContent === "—", "the dash in the Δt cell");
    assert(b.querySelector(".pair-g-cell .pair-dt").textContent === "", "first row Δt empty");
    const miss = b.querySelector(".pair-missing");
    assert(miss && miss.textContent === "no “Position reached” found", "missing text kept: " + (miss && miss.textContent));
    assert(cellsH(b) === 52 && rowsH(b) === 52 && cellsH(b) + 8 === w.linkBlockHeight(1, true) && w.linkBlockHeight(1, true) === 60, "unmatched block: (1 + 1) rows + margin = 60px");
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("");
    assert(/\.pair-g-missing \.pair-rail::before\{[^}]*dashed var\(--warn\)/.test(css) && /\.pair-g-missing \.pair-dt\{color:var\(--warn\)/.test(css), "dashed warn segment and warn Δt dash in the CSS");
    for (const lv of ["error", "warn", "info", "debug", "fatal", "trace", "custom-1", "custom-6", "other"]) {
      assert(css.includes(".lvl-" + lv + " .pair-dot{"), "dot colour rule for lvl-" + lv);
    }
    assert(!css.includes("pair-row-bar") && !css.includes("pair-brace") && !css.includes(".pair-delta"), "old brace / bar / delta CSS gone");
  }, { indexedDB: new IDBFactory() });
}
