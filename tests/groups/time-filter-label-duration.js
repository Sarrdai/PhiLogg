// GROUP time-filter-label-duration — the duration of a time-filter tree label is its own non-shrinking element.
// Origin: 2026-10-06 usability round E3.
group("time-filter-label-duration");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("time-filter-label-duration a. duration element, textContent unchanged");
    const [file] = LOGSIM.generateToStrings({ format: "default", entries: 60, seed: 4 });
    const f = await w.addFile(file.name, file.text, () => {});
    T.state.activeId = f.id;
    const ts = f.entries.map(e => e.ts);
    const label = n => d.querySelector(`.tree-row[data-node-id="${n.id}"] .tree-label`);
    const mk = (value, type) => { const n = w.createFilterNode(f.id, type, value); w.render(); return n; };

    const shortSpan = mk({ from: ts[0], to: ts[0] + 4200 }, "timerange");
    let l = label(shortSpan);
    assert(l, "sanity: label rendered");
    const dur = l.querySelector(".tl-dur");
    assert(dur && /^\d+(\.\d+)?\s?m?s$/.test(dur.textContent), "4.2 s span: own .tl-dur, got " + (dur && dur.textContent));
    assert(l.querySelector(".tl-range") && l.classList.contains("tree-label-time"), "bounds live in .tl-range");
    assert(l.textContent === w.timeRangeFilterName(shortSpan.value, f.id, true), "textContent is the compact name (no ms), got " + l.textContent);

    const longSpan = mk({ from: ts[0], to: ts[0] + 65000 }, "timerange");
    l = label(longSpan);
    assert(l && l.querySelector(".tl-dur") && l.textContent === w.timeRangeFilterName(longSpan.value, f.id, true), "span >= 10 s: duration element too");

    const after = mk(ts[3], "after");
    l = label(after);
    assert(l && !l.querySelector(".tl-dur") && l.textContent === after.name, "after node: no duration element, plain one-line label");
  });
}
