// GROUP 196 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(196);
await withApp(async (w, d, T) => {
  section("196. A background-tailed file growing does NOT trigger a full render() — only the ACTIVE view's tailed root does");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => { const sliced = text.slice(start); const b = new w.Blob([sliced]); b.text = async () => sliced; return b; };
        return blob;
      },
    };
  }

  const activeInitial = makeLog(0, 3);
  const activeHandle = fakeHandle(activeInitial);
  const active = await w.addFile("active.log", activeInitial, () => {});
  active.tail = { handle: activeHandle, offset: activeInitial.length, pending: "", failed: false, busy: false };

  const bgInitial = makeLog(0, 3, { msgPrefix: "bg" });
  const bgHandle = fakeHandle(bgInitial);
  const bg = await w.addFile("background.log", bgInitial, () => {});
  bg.tail = { handle: bgHandle, offset: bgInitial.length, pending: "", failed: false, busy: false };

  T.state.activeId = active.id;
  w.render();

  const originalRender = w.render;
  let renderCount = 0;
  w.render = (...args) => { renderCount++; return originalRender.apply(w, args); };

  // Simulate an in-progress tree interaction (e.g. a row rename) by grabbing
  // the background file's own tree row node identity before the tick.
  const bgRowBefore = d.querySelector('.tree-row[data-node-id="' + bg.id + '"]');
  assert(bgRowBefore, "sanity: background file has a tree row");

  bgHandle._setText(bgInitial + `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"bg new"\n`);
  await w.tailTick();

  assert(renderCount === 0,
    "a tailed file growing in the BACKGROUND (not behind the active view) triggers zero render() calls — " +
    "before the fix, onTailChange() called render() unconditionally on every append, which via renderTree()'s " +
    "innerHTML wipe-and-rebuild reset any in-progress, unrelated tree UI state on every poll tick");
  assert(bg.entries.length === 4, "the background file's own entries still update from the tail poll, got " + bg.entries.length);
  const bgRowAfter = d.querySelector('.tree-row[data-node-id="' + bg.id + '"]');
  assert(bgRowAfter === bgRowBefore, "the background file's tree row DOM node identity is preserved (no renderTree() rebuild)");
  assert(bgRowAfter.querySelector(".tree-count").textContent === "4",
    "…yet its row's own entry count is still refreshed via the existing updateLoadRowProgress cheap-update path");

  // Growth on the file BEHIND the active view still does a real render(),
  // proving the fix didn't just silently stop tailing from ever rendering.
  activeHandle._setText(activeInitial + `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"active new"\n`);
  await w.tailTick();
  assert(renderCount === 1, "growth behind the ACTIVE view still triggers exactly one render(), got " + renderCount);
  assert(active.entries.length === 4, "the active file's entries updated too, got " + active.entries.length);

  w.render = originalRender;
});
