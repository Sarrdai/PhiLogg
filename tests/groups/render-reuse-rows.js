// GROUP render-reuse-rows — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP render-reuse-rows — syncChildren + log-row reuse
   (Filtered view and Context view)
   Covers: the shared syncChildren/domSame helper (keep identical, replace
   changed, keyed reorder, removal, token mismatch, form-control state,
   canvas, _syncDeep, zero mutations on a no-change sync) and its use for the
   log rows: a render that changed nothing keeps every row element and writes
   nothing to #tableRows / #highlightRows, a bookmark change replaces only the
   affected row, the Context view's scroll render keeps overlapping rows, and
   no stale row survives a filter change.
   Origin: 2026-11-12 (person-requested: no rebuilding of unchanged elements).
   ============================================================ */
group("render-reuse-rows");

// Mutation records pending on `target` (subtree), without waiting for the
// observer's microtask: takeRecords() hands them out synchronously.
function watchMutations(w, target) {
  const mo = new w.MutationObserver(() => {});
  mo.observe(target, { childList: true, attributes: true, characterData: true, subtree: true });
  return { take: () => mo.takeRecords().length, stop: () => mo.disconnect() };
}

await withApp(async (w, d, T) => {
  section("render-reuse-rows a. syncChildren unit behaviour");
  const mk = (tag, key, html, token) => {
    const e = d.createElement(tag);
    if (key !== undefined) e._syncKey = key;
    if (token !== undefined) e._syncToken = token;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const host = d.createElement("div");
  d.body.appendChild(host);
  const build = specs => specs.map(([k, h, t]) => mk("div", k, h, t));
  let res = w.syncChildren(host, build([["a", "A"], ["b", "B"], ["c", "C"]]));
  assert(host.children.length === 3 && res.length === 3 && res.every((el, i) => host.children[i] === el), "first sync inserts the fresh nodes and returns them");
  const first = [...host.children];

  const mon = watchMutations(w, host);
  res = w.syncChildren(host, build([["a", "A"], ["b", "B"], ["c", "C"]]));
  assert(mon.take() === 0, "a sync that changed nothing performs zero DOM mutations");
  assert(res.every((el, i) => el === first[i]) && [...host.children].every((el, i) => el === first[i]), "...and every old element is kept and returned");

  res = w.syncChildren(host, build([["a", "A"], ["b", "B2"], ["c", "C"]]));
  assert(host.children[0] === first[0] && host.children[2] === first[2] && host.children[1] !== first[1] && host.children[1].textContent === "B2",
    "a changed unit is replaced, its neighbours are kept");
  assert(mon.take() > 0, "...which does write to the DOM");

  const cur = [...host.children];
  res = w.syncChildren(host, build([["c", "C"], ["a", "A"], ["b", "B2"]]));
  assert([...host.children].map(e => e.textContent).join() === "C,A,B2" && [...host.children].every(e => cur.includes(e)), "keyed reorder moves the existing elements, none is rebuilt");

  const before = [...host.children];
  w.syncChildren(host, build([["c", "C"], ["b", "B2"]]));
  assert(host.children.length === 2 && host.children[0] === before[0] && host.children[1] === before[2] && !host.contains(before[1]), "a unit missing from the fresh list is removed, the rest kept");

  const tok1 = {}, tok2 = {};
  w.syncChildren(host, build([["t", "T", tok1]]));
  const t1 = host.children[0];
  w.syncChildren(host, build([["t", "T", tok1]]));
  assert(host.children[0] === t1, "same markup + same token keeps the element");
  w.syncChildren(host, build([["t", "T", tok2]]));
  assert(host.children[0] !== t1, "same markup but a different token replaces the element (its listeners captured another object)");
  w.syncChildren(host, build([["t", "T", [tok1, null]]]));
  const t2 = host.children[0];
  w.syncChildren(host, build([["t", "T", [tok1, null]]]));
  assert(host.children[0] === t2, "array tokens compare element-wise");
  w.syncChildren(host, build([["t", "T", [tok1, tok2]]]));
  assert(host.children[0] !== t2, "...and a differing array element replaces");

  // Duplicate keys: first wins, the second is built fresh.
  w.syncChildren(host, build([["k", "one"], ["k", "two"]]));
  assert(host.children.length === 2 && host.children[0].textContent === "one" && host.children[1].textContent === "two", "duplicate keys: both fresh nodes end up in the DOM");

  // Form controls: markup equal, live state differs.
  const withInput = (key, checked) => { const e = mk("div", key, '<input type="checkbox">'); e.firstChild.checked = checked; return e; };
  w.syncChildren(host, [withInput("i", false)]);
  const i1 = host.children[0];
  i1.firstChild.checked = true; // user ticked it
  w.syncChildren(host, [withInput("i", false)]);
  assert(host.children[0] !== i1 && host.children[0].firstChild.checked === false, "equal markup but a differing form-control state replaces the element");
  const i2 = host.children[0];
  w.syncChildren(host, [withInput("i", false)]);
  assert(host.children[0] === i2, "equal markup + equal control state keeps it");

  // Canvas: pixels are not markup, never kept.
  w.syncChildren(host, [mk("div", "cv", "<canvas></canvas>")]);
  const cv = host.children[0];
  w.syncChildren(host, [mk("div", "cv", "<canvas></canvas>")]);
  assert(host.children[0] !== cv, "a unit containing a <canvas> is never kept");

  // Unkeyed children match in order; text nodes compare by content.
  host.textContent = "";
  w.syncChildren(host, [mk("span", undefined, "x"), d.createTextNode("t"), mk("span", undefined, "y")]);
  const un = [...host.childNodes];
  w.syncChildren(host, [mk("span", undefined, "x"), d.createTextNode("t"), mk("span", undefined, "z")]);
  assert(host.childNodes[0] === un[0] && host.childNodes[1] === un[1] && host.childNodes[2] !== un[2], "unkeyed units match in order; text nodes are compared too");

  // _syncDeep: a transparent container keeps itself and syncs its children.
  const deep = (key, cls, kids) => { const e = mk("div", key); e._syncDeep = true; e.className = cls; kids.forEach(([k, h]) => e.appendChild(mk("div", k, h))); return e; };
  host.textContent = "";
  w.syncChildren(host, [deep("w", "x", [["p", "P"], ["q", "Q"]])]);
  const wrap = host.children[0], kidP = wrap.children[0], kidQ = wrap.children[1];
  w.syncChildren(host, [deep("w", "y", [["p", "P"], ["q", "Q2"], ["r", "R"]])]);
  assert(host.children[0] === wrap && wrap.className === "y", "_syncDeep: the container is kept and its attributes are synced");
  assert(wrap.children[0] === kidP && wrap.children[1] !== kidQ && wrap.children[1].textContent === "Q2" && wrap.children.length === 3, "_syncDeep: its children are synced with the same rules");
  mon.stop();
  host.remove();
});

// --- Filtered view -----------------------------------------------------------
await withApp(async (w, d, T) => {
  section("render-reuse-rows b. Filtered view: a render that changes nothing keeps every row");
  const [file] = LOGSIM.generateToStrings({ format: "default", entries: 400, seed: 7 });
  const f = await w.addFile(file.name, file.text, () => {});
  w.render();
  const tableRows = d.querySelector("#tableRows");
  const rowsOf = () => [...tableRows.children];
  const rowEls = () => rowsOf().filter(r => r.classList.contains("log-row"));
  assert(rowEls().length > 10, "sanity: the Filtered view renders rows, got " + rowEls().length);

  const before = rowsOf();
  const mon = watchMutations(w, tableRows);
  w.renderVisibleRows();
  assert(mon.take() === 0, "renderVisibleRows() with no state change writes nothing to #tableRows");
  assert(rowsOf().length === before.length && rowsOf().every((r, i) => r === before[i]), "...and every row element is the same object");
  const win = T.tableRowsWindow;
  assert(win.groups.flat().every((el, i) => el === before[i]), "tableRowsWindow.groups holds the elements that are really in the DOM");
  assert(win.first === tableRows.firstElementChild, "tableRowsWindow.first is the live first element");

  w.render();
  mon.take();
  assert(rowsOf().every((r, i) => r === before[i]), "a full render() with no state change keeps the row elements too");

  // Bookmark toggle: only the bookmarked row is replaced.
  const target = f.entries[5];
  const idOf = r => r.dataset.entryId;
  const prev = new Map(rowEls().map(r => [idOf(r), r]));
  assert(prev.has(target.id), "sanity: the entry to bookmark is in the window");
  w.toggleBookmark(target.id);
  w.renderVisibleRows();
  const now = new Map(rowEls().map(r => [idOf(r), r]));
  const changed = [...now].filter(([id, r]) => prev.get(id) !== r).map(([id]) => id);
  assert(changed.length === 1 && changed[0] === target.id, "toggling a bookmark replaces only that row, changed: " + changed.length);
  assert(now.get(target.id).classList.contains("row-bookmarked"), "...and the new row shows the bookmark");
  // Rows still show their own entry, and clicking a kept row acts on its entry.
  const other = f.entries[8];
  fireClick(now.get(other.id), w);
  assert(T.state.selectedId === other.id, "a click on a kept row selects its own entry");
  w.toggleBookmark(target.id);
  w.renderVisibleRows();

  // Selection moves: neighbours keep identity.
  const snap = new Map(rowEls().map(r => [idOf(r), r]));
  w.selectEntry(f.entries[9].id);
  w.renderVisibleRows();
  assert(rowEls().every(r => snap.get(idOf(r)) === r), "a selection change (targeted class update + render) keeps all row elements");
  assert(tableRows.querySelectorAll(".log-row.selected").length === 1 && tableRows.querySelector(".log-row.selected").dataset.entryId === f.entries[9].id, "...and exactly the selected row is marked");

  // Scroll render still works on top of synced rows.
  w.setTableScroll(40 * T.ROW_HEIGHT);
  w.renderVisibleRows(true);
  const wnd = T.tableRowsWindow;
  assert(wnd.groups.flat().every(el => el.parentNode === tableRows) && tableRows.children.length === wnd.groups.flat().length,
    "after a scroll render the window's groups are exactly #tableRows' children");
  mon.stop();

  section("render-reuse-rows c. Filtered view: no stale row after a filter change");
  const word = f.entries.find(e => e.message.split(/\s+/)[0].length > 3).message.split(/\s+/)[0];
  const node = w.createFilterNode(f.id, "text", word);
  T.state.activeId = node.id;
  w.render();
  const view = T.currentViewEntries;
  assert(view.length > 0 && view.length < f.entries.length, "sanity: the filter narrows the view, " + view.length + " of " + f.entries.length);
  const stale = rowEls().filter(r => {
    const e = view[Number(r.dataset.viewIdx)];
    return !e || e.id !== r.dataset.entryId || !r.textContent.includes(e.message.slice(0, 20));
  });
  assert(rowEls().length > 0 && stale.length === 0, "every row shows currentViewEntries[its view index], stale rows: " + stale.length);
  T.state.activeId = f.id;
  w.render();
  const view2 = T.currentViewEntries;
  assert(rowEls().every(r => view2[Number(r.dataset.viewIdx)].id === r.dataset.entryId), "...and again after going back to the unfiltered node");
});

// --- Context view ------------------------------------------------------------
await withApp(async (w, d, T) => {
  section("render-reuse-rows d. Context view: identity, scroll render, filter change");
  const [file] = LOGSIM.generateToStrings({ format: "default", entries: 600, seed: 7 });
  const f = await w.addFile(file.name, file.text, () => {});
  // A text filter that matches a handful of entries spread over the file: the
  // Context view then shows matches with gap fillers and (once revealed) runs.
  const word = f.entries[40].message.split(/\s+/).find(t => /^[A-Za-z]{5,}$/.test(t));
  const node = w.createFilterNode(f.id, "text", word);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("highlight");
  const hRows = d.querySelector("#highlightRows");
  const logRows = () => [...hRows.querySelectorAll(":scope > .log-row")];
  assert(logRows().length > 3, "sanity: the Context view renders rows, got " + logRows().length);
  // Reveal the first gap so the view holds a run (row handles) and fillers.
  const filler = hRows.querySelector(".ctx-gap-placeholder:not(.ctx-show-more)");
  if (filler) fireClick(filler, w);

  const before = [...hRows.children];
  const mon = watchMutations(w, hRows);
  w.renderHighlightVisibleRows();
  assert(mon.take() === 0, "renderHighlightVisibleRows() with no state change writes nothing to #highlightRows");
  assert(before.length === hRows.children.length && [...hRows.children].every((r, i) => r === before[i]), "...and keeps every row, note and filler element");
  const hw = T.highlightRowsWindow;
  assert(hw.lead.concat(hw.units.flat()).every((el, i) => el === before[i]), "highlightRowsWindow holds the elements that are really in the DOM");

  // A bookmark change replaces only the affected row.
  const snap = new Map(logRows().map(r => [r.dataset.entryId, r]));
  const bm = [...snap.keys()][1];
  T.state.bookmarks.set(bm, { bookmarkedAt: 1 });
  w.renderHighlightVisibleRows();
  const changed = logRows().filter(r => snap.get(r.dataset.entryId) !== r).map(r => r.dataset.entryId);
  assert(changed.length === 1 && changed[0] === bm, "a bookmark change replaces only that row in the Context view, changed: " + changed.length);
  T.state.bookmarks.delete(bm);
  w.renderHighlightVisibleRows();

  // Clicking a kept row acts on its own entry.
  const keep = logRows()[2];
  fireClick(keep, w);
  assert(T.state.selectedId === keep.dataset.entryId, "a click on a kept Context row selects its entry");

  // Scroll render: overlapping rows are kept, the window follows the scroll.
  const checkWindow = label => {
    const rows = logRows();
    const idx = rows.map(r => Number(r.dataset.viewIdx));
    const ok = rows.every(r => T.currentHighlightViewEntries[Number(r.dataset.viewIdx)].id === r.dataset.entryId);
    assert(rows.length > 0 && ok, label + ": every row shows currentHighlightViewEntries[its view index]");
    assert(idx.every((v, i) => i === 0 || v === idx[i - 1] + 1), label + ": the rendered rows are contiguous");
    const u = T.highlightRowsWindow;
    assert(u.lead.concat(u.units.flat()).length === hRows.children.length && u.lead.concat(u.units.flat()).every((el, i) => el === hRows.children[i]),
      label + ": the window record equals #highlightRows' children");
    return idx;
  };
  checkWindow("initial");
  const total = T.currentHighlightViewEntries.length;
  const startScroll = hRows.parentNode.scrollTop || 0;
  const rowsBefore = new Map(logRows().map(r => [r.dataset.entryId, r]));
  // Scroll a few rows down: overlap with the previous window.
  w.setHighlightScroll(startScroll + 4 * T.ROW_HEIGHT);
  w.renderHighlightVisibleRows(true);
  checkWindow("after a small scroll");
  const kept = logRows().filter(r => rowsBefore.get(r.dataset.entryId) === r);
  const overlap = logRows().filter(r => rowsBefore.has(r.dataset.entryId));
  assert(overlap.length > 0 && kept.length === overlap.length, "a scroll render keeps every row that stays in the window (" + kept.length + " of " + overlap.length + ")");
  // Far down and back up (jump with no overlap, then reuse again).
  const bodyH = hRows.parentNode;
  w.setHighlightScroll(Math.max(0, (T.highlightRowOffsets[total] || 0) - 10 * T.ROW_HEIGHT));
  w.renderHighlightVisibleRows(true);
  checkWindow("jumped to the end");
  w.setHighlightScroll(0);
  w.renderHighlightVisibleRows(true);
  const idxTop = checkWindow("back at the top");
  assert(idxTop[0] === 0, "scrolled back to the top the window starts at entry 0, got " + idxTop[0]);
  for (let s = 0; s < 6; s++) {
    w.setHighlightScroll(bodyH.scrollTop + 3 * T.ROW_HEIGHT);
    w.renderHighlightVisibleRows(true);
  }
  checkWindow("after stepping down");
  for (let s = 0; s < 6; s++) {
    w.setHighlightScroll(Math.max(0, bodyH.scrollTop - 3 * T.ROW_HEIGHT));
    w.renderHighlightVisibleRows(true);
  }
  checkWindow("after stepping back up");

  // Filter change: no stale row.
  const word2 = f.entries[90].message.split(/\s+/).find(t => /^[A-Za-z]{5,}$/.test(t) && t !== word);
  const node2 = w.createFilterNode(f.id, "text", word2 || word);
  T.state.activeId = node2.id;
  w.render();
  checkWindow("after a filter change");
  mon.stop();
});
