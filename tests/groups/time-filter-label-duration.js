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
    const label = n => [...d.querySelectorAll(".tree-label")].find(x => x.textContent === n.name);
    const mk = (value, type) => { const n = w.createFilterNode(f.id, type, value); w.render(); return n; };

    const shortSpan = mk({ from: ts[0], to: ts[0] + 4200 }, "timerange");
    let l = label(shortSpan);
    assert(l, "sanity: label rendered");
    const dur = l.querySelector(".tl-dur");
    assert(dur && /^\d+(\.\d+)?\s?m?s$/.test(dur.textContent), "4.2 s span: own .tl-dur, got " + (dur && dur.textContent));
    assert(l.querySelector(".tl-range") && l.classList.contains("tree-label-dur"), "bounds live in .tl-range");
    assert(l.textContent === shortSpan.name, "textContent equals the plain name, got " + l.textContent);

    const longSpan = mk({ from: ts[0], to: ts[0] + 65000 }, "timerange");
    l = label(longSpan);
    assert(l && l.querySelector(".tl-dur") && l.textContent === longSpan.name, "span >= 10 s: duration element too");

    const after = mk(ts[3], "after");
    l = label(after);
    assert(l && !l.querySelector(".tl-dur") && l.classList.contains("tree-label-wrap") && l.textContent === after.name, "after node: no duration element, unchanged wrap");
  });
}
