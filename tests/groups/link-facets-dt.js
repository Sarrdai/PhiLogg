// GROUP link-facets-dt — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-facets-dt — Facets on a link node: pairs per start-entry value with Δt
   Origin: 2026-10-09 (person-requested, backlog #120 part 1, analysis tools round).
   On a link node the Facets tab groups the PAIRS by the columns of their START entry
   (analysisGroupBy with dtOf/unpaired): per value the pair count, the starts without an
   end and a Δt stroke (min—max, median tick) on one scale per section; header line
   “A” → “B” · N pairs · M without end; sort Count | Median Δt | Without end. A click on a
   Level/Thread/Location/Method value adds the filter under the link node (Alt = NOT);
   custom columns and Source can't be filtered on a pair, so those values are not clickable.
   Normal nodes keep their facets. Sample data: tools/log-sim (motion, basic, sensors, custom format).
   ============================================================ */
group("link-facets-dt");

if (groupSelected()) {
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();

  async function motionLink(w, d, T, scenarios, entries, seed) {
    const [file] = LOGSIM.generateToStrings({ scenarios, entries, seed });
    const f = await w.addFile(file.name, file.text, () => {});
    const link = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id;
    T.state.entriesView = "filter";
    w.setFacetsOpen(true);
    w.render();
    return { f, link };
  }
  const sections = d => [...d.querySelectorAll("#facetPanelBody .facet-section")];
  const section_ = (d, key) => d.querySelector('#facetPanelBody .facet-section[data-col="' + key + '"]');
  const rowsOf = sec => [...sec.querySelectorAll(".facet-value:not(.facet-link-colhead)")];
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  // Independent per-value stats straight from the link node's pairs/unmatched.
  function brute(w, link, valueOf) {
    const map = new Map();
    const slot = v => { let s = map.get(v); if (!s) map.set(v, s = { count: 0, noEnd: 0, dts: [] }); return s; };
    for (const p of w.getEntries(link.id)) { const s = slot(valueOf(p)); s.count++; s.dts.push(p.dtMs); }
    for (const u of link._linkUnmatched) slot(valueOf(u)).noEnd++;
    return map;
  }

  await withApp(async (w, d, T) => {
    section("link-facets-dt a. header line, Thread rows: pairs, no end, Δt numbers vs a direct computation");
    const { f, link } = await motionLink(w, d, T, ["motion", "sensors", "basic", "bursts"], 6000, 7);
    const body = d.querySelector("#facetPanelBody");
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    const pairs = w.getEntries(link.id), un = link._linkUnmatched;
    assert(pairs.length > 100 && un.length > 5, "enough pairs/unpaired: " + pairs.length + "/" + un.length);
    assert(body.classList.contains("facet-link") && !/Not available/.test(body.textContent), "link layout class, no placeholder");
    assert(txt(body.querySelector(".facet-link-sum")) === "“Move requested” → “Position reached” · " + pairs.length + " pairs · " + un.length + " without end", "header: " + txt(body.querySelector(".facet-link-sum")));
    assert(txt(d.querySelector("#facetPanelCount")) === pairs.length + " pairs", "count label: " + txt(d.querySelector("#facetPanelCount")));
    const secs = sections(d);
    assert(secs.map(s => s.dataset.col).join() === "thread,location,method,level", "sections of the file's columns: " + secs.map(s => s.dataset.col).join());
    const exp = brute(w, link, p => p.thread);
    const th = section_(d, "thread");
    assert(txt(th.querySelector(".facet-section-note")) === exp.size + " values", "Thread: value count " + txt(th.querySelector(".facet-section-note")));
    const rows = rowsOf(th);
    assert(rows.length === Math.min(exp.size, 8), "rows: " + rows.length);
    rows.forEach(r => {
      const name = r.querySelector(".facet-value-name").textContent;
      const e = exp.get(name);
      assert(e, "thread " + name + " exists in the direct computation");
      assert(+txt(r.querySelector(".facet-count")) === e.count, name + ": pairs " + txt(r.querySelector(".facet-count")) + " vs " + e.count);
      assert((txt(r.querySelector(".facet-noend")) || "0") === String(e.noEnd), name + ": no end " + txt(r.querySelector(".facet-noend")) + " vs " + e.noEnd);
      const sorted = e.dts.slice().sort((x, y) => x - y);
      const tip = r.querySelector(".facet-dt").title;
      assert(tip === [sorted[0], med(sorted), sorted[sorted.length - 1]].map(w.formatMs).join(" · "), name + ": Δt tooltip '" + tip + "'");
    });
    assert(rows.map(r => +txt(r.querySelector(".facet-count"))).every((n, i, a) => i === 0 || a[i - 1] >= n), "default sort: by pair count, descending");
    // Shared Δt scale: the section's slowest pair ends at 100 %, every median tick sits at median/scale.
    const scale = Math.max(...[...exp.values()].map(e => Math.max(...e.dts)));
    const ends = rows.map(r => { const rng = r.querySelector(".facet-dt-rng"); return parseFloat(rng.style.left) + parseFloat(rng.style.width); });
    assert(Math.abs(Math.max(...ends) - 100) < 0.05, "one scale per section: the longest Δt ends at 100 %, got " + Math.max(...ends));
    rows.forEach(r => {
      const name = r.querySelector(".facet-value-name").textContent, e = exp.get(name);
      const left = parseFloat(r.querySelector(".facet-dt-med").style.left);
      assert(Math.abs(left - med(e.dts) / scale * 100) < 0.02, name + ": median tick at " + left.toFixed(2) + " % of the scale");
    });
    // Other sections group by the start entry too
    const loc = section_(d, "location");
    const expLoc = brute(w, link, p => p.location);
    assert(rowsOf(loc).length === 1 && +txt(rowsOf(loc)[0].querySelector(".facet-count")) === pairs.length && txt(loc.querySelector(".facet-section-note")) === "1 value" && expLoc.size === 1, "Location: one value for all pairs");
    const lvl = section_(d, "level");
    const expLvl = brute(w, link, p => w.levelBucket(p.level, p.formatId));
    assert(rowsOf(lvl).length === expLvl.size && rowsOf(lvl).every(r => +txt(r.querySelector(".facet-count")) === expLvl.get(r.querySelector(".facet-value-name").textContent).count), "Level: the start entries' levels");
    // pairs add up (the unpaired are not counted in Pairs)
    assert(rowsOf(th).reduce((n, r) => n + +txt(r.querySelector(".facet-count")), 0) === pairs.length, "all thread values together = the pairs");
    // a normal node keeps the old look
    T.state.activeId = f.id; w.render();
    assert(!body.classList.contains("facet-link") && !body.querySelector(".facet-link-head") && body.querySelector(".facet-value .facet-pct") && !body.querySelector(".facet-dt"), "file node: plain facets (pct, no Δt)");
    assert(txt(d.querySelector("#facetPanelCount")) === T.state.nodes[f.id].entries.length.toLocaleString("de-DE") + " entries", "file node: entries label");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-facets-dt b. sort control: Count | Median Δt | Without end");
    const { link } = await motionLink(w, d, T, ["motion", "sensors", "basic", "bursts"], 6000, 7);
    const body = d.querySelector("#facetPanelBody");
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    const btn = k => body.querySelector('[data-facet-sort="' + k + '"]');
    assert([...body.querySelectorAll("[data-facet-sort]")].map(b => b.textContent).join() === "Count,Median Δt,Without end", "three labelled options");
    assert(btn("count").getAttribute("aria-pressed") === "true" && btn("med").getAttribute("aria-pressed") === "false", "Count is the default");
    const exp = brute(w, link, p => p.thread);
    const names = () => rowsOf(section_(d, "thread")).map(r => r.querySelector(".facet-value-name").textContent);
    fireClick(btn("med"), w);
    assert(btn("med").getAttribute("aria-pressed") === "true" && btn("count").getAttribute("aria-pressed") === "false", "Median Δt pressed");
    const meds = names().map(n => med(exp.get(n).dts));
    assert(meds.length > 1 && meds.every((m, i) => i === 0 || meds[i - 1] >= m), "sorted by median Δt, descending: " + meds.join());
    fireClick(btn("unp"), w);
    const unps = names().map(n => exp.get(n).noEnd);
    assert(unps.every((m, i) => i === 0 || unps[i - 1] >= m) && unps[0] > 0, "sorted by without-end, descending: " + unps.join());
    fireClick(btn("count"), w);
    const cnts = names().map(n => exp.get(n).count);
    assert(cnts.every((m, i) => i === 0 || cnts[i - 1] >= m), "back to count order");
    // the sort order applies to what a click resolves to
    fireClick(btn("unp"), w);
    const firstName = names()[0];
    const before = Object.keys(T.state.nodes).length;
    fireClick(rowsOf(section_(d, "thread"))[0], w);
    const child = T.state.nodes[T.state.activeId];
    assert(Object.keys(T.state.nodes).length === before + 1 && child.parentId === link.id && child.columns.join() === "thread" && child.value === "^" + w.escapeRegExp(firstName) + "$", "the clicked (first sorted) value is the one filtered: " + child.value);
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-facets-dt c. click on a value: filter node under the link (Alt = NOT), one undo step");
    const { link } = await motionLink(w, d, T, ["motion", "sensors", "basic", "bursts"], 6000, 7);
    const body = d.querySelector("#facetPanelBody");
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    const pairs = w.getEntries(link.id);
    const row = () => rowsOf(section_(d, "thread"))[0];
    const name = row().querySelector(".facet-value-name").textContent;
    const undo0 = T.undoStack.length;
    fireClick(row(), w);
    let child = T.state.nodes[T.state.activeId];
    const want = pairs.filter(p => p.thread === name);
    assert(child.parentId === link.id && child.filterType === "text" && !child.inverted, "text filter under the link node");
    assert(w.getEntries(child.id).length === want.length && want.length > 0, "keeps exactly the pairs started on " + name + ": " + want.length);
    assert(T.undoStack.length === undo0 + 1, "one undo step");
    // Alt+click excludes
    T.state.activeId = link.id; w.render();
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    row().dispatchEvent(new w.MouseEvent("click", { bubbles: true, altKey: true }));
    child = T.state.nodes[T.state.activeId];
    assert(child.inverted && w.getEntries(child.id).length === pairs.length - want.length, "Alt+click: NOT filter, " + w.getEntries(child.id).length + " pairs left");
    // right-click excludes too
    T.state.activeId = link.id; w.render();
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    row().dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    assert(T.state.nodes[T.state.activeId].inverted && T.state.nodes[T.state.activeId].parentId === link.id, "right-click: NOT filter");
    // Level values filter too
    T.state.activeId = link.id; w.render();
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    const lrow = rowsOf(section_(d, "level"))[0];
    const lname = lrow.querySelector(".facet-value-name").textContent;
    fireClick(lrow, w);
    const lchild = T.state.nodes[T.state.activeId];
    assert(lchild.filterType === "level" && lchild.parentId === link.id && w.getEntries(lchild.id).length === pairs.filter(p => w.levelBucket(p.level, p.formatId) === lname).length, "Level value: level filter on the pairs");
    // the column header row of a section and the toggle do nothing harmful
    T.state.activeId = link.id; w.render();
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    const n0 = Object.keys(T.state.nodes).length;
    fireClick(section_(d, "thread").querySelector(".facet-link-colhead"), w);
    assert(Object.keys(T.state.nodes).length === n0, "the column header row is no value");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-facets-dt d. custom columns: values shown but not clickable (open point), level quick filter narrows the counts");
    await logsimRegister(w, T, "custom", "fmt-custom-dt");
    const [file] = LOGSIM.generateToStrings({ format: "custom", scenarios: ["motion", "basic"], entries: 3000, seed: 4 });
    const f = await w.addFile(file.name, file.text, () => {});
    const link = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id; T.state.entriesView = "filter"; w.setFacetsOpen(true); w.render();
    const body = d.querySelector("#facetPanelBody");
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    const keys = sections(d).map(s => s.dataset.col);
    const custom = keys.filter(k => !["thread", "location", "method", "level"].includes(k));
    assert(custom.length >= 1, "the custom format adds columns: " + keys.join());
    const cs = section_(d, custom[0]);
    assert(rowsOf(cs).length >= 1 && rowsOf(cs).every(r => r.classList.contains("facet-value-static")), "custom column values are static");
    const n0 = Object.keys(T.state.nodes).length;
    fireClick(rowsOf(cs)[0], w);
    rowsOf(cs)[0].dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    assert(Object.keys(T.state.nodes).length === n0 && T.state.activeId === link.id, "clicking a custom value creates nothing");
    // Level quick filter: INFO only → fewer pairs, header follows
    const all = w.getEntries(link.id).length;
    T.state.levelFilter = new Set(["INFO"]);
    w.render();
    await waitFor(() => /pairs/.test(txt(body.querySelector(".facet-link-sum"))) && txt(body.querySelector(".facet-link-sum")).includes(" " + w.applyLevelFilter(w.getEntries(link.id)).length + " pairs"), 3000);
    assert(w.applyLevelFilter(w.getEntries(link.id)).length <= all, "level filter applied to the pairs for the facets");
    T.state.levelFilter = new Set(); w.render();
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-facets-dt e. phone sheet: same renderer");
    const [file] = LOGSIM.generateToStrings({ scenarios: ["motion", "basic"], entries: 2000, seed: 7 });
    const f = await w.addFile(file.name, file.text, () => {});
    const link = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id; T.state.entriesView = "filter";
    w.innerWidth = 400; w.dispatchEvent(new w.Event("resize"));
    assert(d.body.classList.contains("layout-phone"), "sanity: phone tier");
    w.render();
    w.setFacetsOpen(true);
    const body = d.querySelector("#facetPanelBody");
    await waitFor(() => body.querySelector(".facet-link-head"), 3000);
    assert(d.querySelector("#detailPanel").classList.contains("lower-facets") && body.querySelector(".facet-dt") && body.querySelector('[data-facet-sort="med"]'), "pair facets in the phone sheet with the sort control");
    fireClick(rowsOf(section_(d, "thread"))[0], w);
    assert(T.state.nodes[T.state.activeId].parentId === link.id, "a tap filters under the link node");
  }, { indexedDB: new IDBFactory() });
}
