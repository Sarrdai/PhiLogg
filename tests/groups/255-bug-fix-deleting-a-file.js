// GROUP 255 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 255 — Bug fix: deleting a file mid-load no longer leaves stale
   entries/leaked entryIndex ids behind, or fires a redundant render for
   the now-dead node (loadOneFileIntoTree/parseLogTextAsync/parseFileWindow
   all now guard against a delete raced under an in-flight load).
   ============================================================ */
group(255);
await withApp(async (w, d, T) => {
  section("255a. Deleting a file mid-parse stops further entries leaking into the orphaned node/entryIndex, and skips the wasted extra render");
  const text = makeLog(0, 9000, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });
  const before = new Set(T.state.rootIds);
  const donePromise = w.addFile("huge.log", text);
  const newId = T.state.rootIds.find(id => !before.has(id));
  const node = T.state.nodes[newId];
  T.state.activeId = newId;

  await new Promise(r => setTimeout(r, 0)); // let the first parse chunk land
  const midCount = node.entries.length;
  assert(midCount > 0 && midCount < 9000, "sanity: genuinely mid-parse");

  const s = d.createElement("script");
  s.textContent = `
    const __origRender = render;
    render = function() { window.__renderCalls = (window.__renderCalls||0)+1; return __origRender(); };
  `;
  d.body.appendChild(s);
  w.__renderCalls = 0;

  w.deleteFilterNodeWithUndo(newId); // the person closes it before it's done
  assert(!T.state.nodes[newId], "the node is gone right away");

  await donePromise; // let the rest of the (now-orphaned) parse run to completion
  assert(node.entries.length === midCount,
    "no further entries were appended to the orphaned node after deletion — got " + node.entries.length + ", expected " + midCount);
  assert(node.entries.every(e => !T.entryIndex[e.id]), "every one of the node's own entries is absent from entryIndex once deleted (none leaked back in post-deletion)");
  assert(w.__renderCalls === 0, "the orphaned load's own finally block skips its render entirely once the node is gone — got " + w.__renderCalls);
});

await withApp(async (w, d, T) => {
  section("255b. Deleting a windowed folder-watch load mid-parseFileWindow doesn't resurrect it via the 'not ok -> full reload' fallback");
  const N = 600;
  const filler = "X".repeat(14000);
  function makeBigLog(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
      lines.push(`2024-01-15 10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"message ${i} ${filler}"`);
    }
    return lines.join("\n") + "\n";
  }
  const bigText = makeBigLog(N);
  assert(bigText.length > 8 * 1024 * 1024, "sanity: the fixture is above the windowed-load threshold");
  const anchor = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const tsAt = i => anchor + i * 1000;

  let getFileCalls = 0;
  function fakeFileHandle(text) {
    return {
      async getFile() {
        getFileCalls++;
        return {
          size: text.length,
          slice(start, end) {
            const e = end === undefined ? text.length : end;
            const sliced = text.slice(start, e);
            return { text: async () => sliced };
          },
        };
      },
    };
  }

  const folder = { id: "fm-w-folder-255", name: "w255", files: [] };
  const from = tsAt(250), to = tsAt(259);
  const rec = { name: "big.log", relPath: "big.log", nodeId: null, handle: fakeFileHandle(bigText), _range: { first: tsAt(0), last: tsAt(N - 1) } };
  folder.files.push(rec);

  const donePromise = w.loadFolderFileWindowed(folder, rec, from, to);
  // Node creation happens after the handle's own (async) getFile() resolves
  // — wait for it to land in the tree, same "before" diff idiom Group 49
  // uses, before deleting it mid-window-read.
  await waitFor(() => T.state.rootIds.length > 0);
  const nodeId = T.state.rootIds[0];

  w.deleteFilterNodeWithUndo(nodeId);
  assert(!T.state.nodes[nodeId], "the node is gone right away");

  await donePromise;
  assert(!T.state.nodes[nodeId], "still gone once the windowed read finishes — not resurrected");
  assert(getFileCalls === 1, "no full-file fallback reload was triggered by the deletion (getFile() called exactly once, not a second time for loadFolderFile's own full read)");
});
