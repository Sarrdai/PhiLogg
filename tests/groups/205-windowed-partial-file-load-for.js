// GROUP 205 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 205 — Windowed/partial file load for the folder-watch minimap's
   dragged-window Load (person-requested feasibility follow-up to the
   folder-watch minimap, GROUP 204): instead of reading a whole large file
   just to hide everything outside the drawn window behind a "timerange"
   filter, findWindowStartOffset binary-searches for (approximately) where
   the window starts and parseFileWindow reads/parses forward only until it
   ends — loadFolderFileWindowed wires this into loadFolderMinimapSelection,
   falling back to a normal full loadFolderFile below a size threshold, when
   the file's range isn't known yet, or when the file doesn't look safely
   sorted. Resulting nodes are tagged node.partial = { from, to }, threaded
   through snapshotSubtree/restoreSubtree and persistFileNode (same class of
   field node.formatId/node.merged already are).
   ============================================================ */
group(205);
await withApp(async (w, d, T) => {
  section("205a. findWindowStartOffset + parseFileWindow: jump to (approximately) where a time window starts and read/parse only that far, not the whole file");

  // 1400 one-second-apart entries, each padded well past its natural size
  // so the fixture is comfortably larger than WINDOW_READ_CHUNK_BYTES
  // (2MB) — otherwise the forward read's single chunk could cover most or
  // all of a too-small fixture on its own, making the byte-savings
  // assertion below meaningless regardless of whether the optimization
  // actually did anything.
  const N = 1400;
  const filler = "X".repeat(14000);
  function makeSortedLog(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
      const ss = i % 60, mm = Math.floor(i / 60) % 60, hh = 10 + Math.floor(i / 3600);
      lines.push(`2024-01-15 ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"message ${i} ${filler}"`);
    }
    return lines.join("\n") + "\n";
  }
  const text = makeSortedLog(N);
  assert(text.length > 16 * 1024 * 1024, "sanity: the fixture is comfortably larger than one forward-read chunk, got " + text.length);
  const anchor = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const tsAt = i => anchor + i * 1000;

  // Minimal file-like fixture (.size + .slice(start,end).text(), the only
  // members findWindowStartOffset/parseFileWindow ever touch — no FileReader
  // involved on this path, unlike loadFolderFile's own full-read path) that
  // also counts how many bytes were actually requested via slice(), to pin
  // down the actual performance claim: a narrow window reads far less than
  // the whole file, not just "returns the right entries".
  let bytesRequested = 0;
  const file = {
    get size() { return text.length; }, // pure-ASCII fixture: string length === byte length
    slice(start, end) {
      const e = end === undefined ? text.length : end;
      bytesRequested += Math.max(0, e - start);
      const sliced = text.slice(start, e);
      return { text: async () => sliced };
    },
  };

  const targetIdx = 700; // well into the middle of the file
  const { offset, consistent } = await w.findWindowStartOffset(file, undefined, tsAt(targetIdx)); // no formatId -> DEFAULT_FORMAT_ID, same as parseFileWindow's own default
  assert(consistent, "a properly sorted file is reported consistent");
  assert(offset <= text.indexOf(`line ${targetIdx}\t`), "the found offset is at or before the target entry's own line — never starts after it");

  const node = { entries: [] }; // formatId omitted on purpose: parseFileWindow falls back to DEFAULT_FORMAT_ID itself
  const ok = await w.parseFileWindow(file, node, tsAt(targetIdx), tsAt(targetIdx + 9), () => {});
  assert(ok, "parseFileWindow succeeds on a sorted file");
  const gotIndices = new Set(node.entries.map(e => Number(e.message.split(" ")[1])));
  for (let i = targetIdx; i <= targetIdx + 9; i++) assert(gotIndices.has(i), `window includes entry ${i}`);
  assert(node.entries.length < N / 4, "far fewer entries were parsed than the whole file, got " + node.entries.length + " of " + N);
  assert(bytesRequested < text.length / 4, "far fewer bytes were requested than the whole file's size, got " + bytesRequested + " of " + text.length);
});

await withApp(async (w, d, T) => {
  section("205b. loadFolderFileWindowed: below the size threshold, or with no known range yet, falls back to a normal full load (no node.partial)");

  function fakeFileHandle(text) {
    return {
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start, end) => {
          const sliced = text.slice(start, end === undefined ? text.length : end);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }

  const smallText = makeLog(0, 5); // a few hundred bytes — nowhere near WINDOWED_LOAD_MIN_FILE_SIZE
  const folder = { id: "fm-w-folder-1", name: "w1", files: [] };
  const rec1 = { name: "small.log", relPath: "small.log", nodeId: null, handle: fakeFileHandle(smallText), _range: { first: 0, last: 4000 } };
  folder.files.push(rec1);
  await w.loadFolderFileWindowed(folder, rec1, 0, 4000);
  assert(rec1.nodeId && T.state.nodes[rec1.nodeId], "a node was loaded");
  assert(T.state.nodes[rec1.nodeId].entries.length === 5, "the small file falls back to a full load — all 5 entries present, got " + T.state.nodes[rec1.nodeId].entries.length);
  assert(!T.state.nodes[rec1.nodeId].partial, "a fallback full load is NOT flagged node.partial");

  const rec2 = { name: "norange.log", relPath: "norange.log", nodeId: null, handle: fakeFileHandle(smallText) }; // no _range at all
  await w.loadFolderFileWindowed(folder, rec2, 0, 4000);
  assert(rec2.nodeId && T.state.nodes[rec2.nodeId].entries.length === 5, "no known range also falls back to a full load, got " + (T.state.nodes[rec2.nodeId] && T.state.nodes[rec2.nodeId].entries.length));
});

await withApp(async (w, d, T) => {
  section("205c. loadFolderFileWindowed: a large file above the threshold gets only its window read, flagged node.partial, and an already-open file is never re-read");

  // 600 entries, one second apart, each padded well past normal size so the
  // whole file safely exceeds WINDOWED_LOAD_MIN_FILE_SIZE (8MB) without
  // needing hundreds of thousands of real entries (keeps this test's own
  // parse work small even though the FILE itself is big — which is exactly
  // the point of the feature under test).
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
  assert(bigText.length > 8 * 1024 * 1024, "sanity: the fixture is actually above the 8MB threshold, got " + bigText.length);
  const anchor = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const tsAt = i => anchor + i * 1000;

  function fakeFileHandle(text) {
    return {
      async getFile() {
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

  const folder = { id: "fm-w-folder-2", name: "w2", files: [] };
  const from = tsAt(250), to = tsAt(259);
  const rec = { name: "big.log", relPath: "big.log", nodeId: null, handle: fakeFileHandle(bigText), _range: { first: tsAt(0), last: tsAt(N - 1) } };
  folder.files.push(rec);

  await w.loadFolderFileWindowed(folder, rec, from, to);
  assert(rec.nodeId && T.state.nodes[rec.nodeId], "a node was loaded");
  const node = T.state.nodes[rec.nodeId];
  assert(node.partial && node.partial.from === from && node.partial.to === to, "the node is flagged partial with the requested window");
  const gotIndices = new Set(node.entries.map(e => Number(e.message.split(" ")[1])));
  for (let i = 250; i <= 259; i++) assert(gotIndices.has(i), `window includes entry ${i}`);
  assert(node.entries.length < N / 3, "far fewer than all " + N + " entries were parsed, got " + node.entries.length);

  // Already open: a second call must not re-read the file at all.
  rec.handle = { async getFile() { throw new Error("should not be called — the file is already open"); } };
  await w.loadFolderFileWindowed(folder, rec, from, to);
  assert(node.entries.length < N / 3, "re-calling on an already-open partial node does not trigger another read");
});

await withApp(async (w, d, T) => {
  section("205d. loadFolderFileWindowed: a file that isn't chronologically sorted falls back to a full load instead of silently returning wrong/missing entries");

  const N = 600;
  const filler = "X".repeat(14000);
  // Strictly DESCENDING timestamps end to end — a clean, unambiguous
  // violation of the "sorted start to end" assumption findWindowStartOffset
  // depends on. findWindowStartOffset's own cheap head/tail bookend check
  // (compares the file's very first and very last entries before bisecting
  // at all) reliably catches exactly this shape; the bisection loop's own
  // local monotonicity check is best-effort and doesn't by itself guarantee
  // catching every possible non-monotonic arrangement, so this test targets
  // the case that IS guaranteed to be caught.
  function makeReversedLog(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
      const sec = n - 1 - i;
      lines.push(`2024-01-15 10:${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"message ${i} ${filler}"`);
    }
    return lines.join("\n") + "\n";
  }
  const text = makeReversedLog(N);
  assert(text.length > 8 * 1024 * 1024, "sanity: fixture is above the 8MB threshold");
  const anchor = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();

  // Unlike 205c's plain-object fixture (windowed reads only, never
  // FileReader), this one must ALSO survive the full-load fallback this
  // test expects (readFileWithProgress -> FileReader.readAsText, which
  // needs a genuine Blob) — same real-w.Blob-plus-overridden-.slice/.text
  // shape earlier groups' own fakeFileHandle fixtures use.
  function fakeFileHandle(txt) {
    return {
      async getFile() {
        const blob = new w.Blob([txt]);
        Object.defineProperty(blob, "size", { get: () => txt.length, configurable: true });
        blob.text = async () => txt;
        blob.slice = (start, end) => {
          const e = end === undefined ? txt.length : end;
          const sliced = txt.slice(start, e);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  const folder = { id: "fm-w-folder-3", name: "w3", files: [] };
  const rec = { name: "unsorted.log", relPath: "unsorted.log", nodeId: null, handle: fakeFileHandle(text), _range: { first: anchor, last: anchor + (N - 1) * 1000 } };
  folder.files.push(rec);

  await w.loadFolderFileWindowed(folder, rec, anchor + 250 * 1000, anchor + 259 * 1000);
  assert(rec.nodeId && T.state.nodes[rec.nodeId], "a node was loaded (via the fallback, not left empty)");
  const node = T.state.nodes[rec.nodeId];
  assert(!node.partial, "an unsafely-sorted file falls back to a full load, not a (possibly wrong) partial one");
  assert(node.entries.length === N, "the fallback full load parsed every entry, got " + node.entries.length + " of " + N);
});

await withApp(async (w, d, T) => {
  section("205e. node.partial survives close+undo, and folderMinimapMergeWindow unions two partial sources' ranges on merge");

  const N = 600;
  const filler = "X".repeat(14000);
  function makeBigLog(n, msgPrefix) {
    const lines = [];
    for (let i = 0; i < n; i++) {
      lines.push(`2024-01-15 10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"${msgPrefix} ${i} ${filler}"`);
    }
    return lines.join("\n") + "\n";
  }
  const anchor = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const tsAt = i => anchor + i * 1000;

  function fakeFileHandle(text) {
    return { async getFile() { return { size: text.length, slice(start, end) { const e = end === undefined ? text.length : end; const s = text.slice(start, e); return { text: async () => s }; } }; } };
  }

  // Two large, overlapping files, both windowed-loaded and merged via
  // folderMinimapMergeWindow, end up with a UNIONED node.partial. The
  // merge RESULT (unlike either folder-owned source file) has no folderId
  // of its own (see mergeFiles) — closing it goes through the real
  // deleteFile-with-undo path (deleteFilterNodeWithUndo's plain node.type
  // === "file" branch, snapshotSubtree/pushUndo/restoreSubtree), unlike a
  // folder-owned file's own close (closeFolderFile — no undo snapshot at
  // all, just returns to the grayed listing), so this is also where
  // node.partial surviving close+undo is actually exercised.
  const folder2 = { id: "fm-w-folder-5", name: "w5", files: [], inlineViewers: new Map() };
  const recX = { name: "x.log", relPath: "x.log", nodeId: null, handle: fakeFileHandle(makeBigLog(N, "x")), _range: { first: tsAt(0), last: tsAt(N - 1) } };
  const recY = { name: "y.log", relPath: "y.log", nodeId: null, handle: fakeFileHandle(makeBigLog(N, "y")), _range: { first: tsAt(0), last: tsAt(N - 1) } };
  folder2.files.push(recX, recY);
  T.state.folders.push(folder2);
  T.fmFolderId = folder2.id;
  T.fmSelectedRecKeys = new Set();
  T.fmSelectedWindow = { from: tsAt(100), to: tsAt(120) };
  await w.folderMinimapMergeWindow(folder2);

  assert(recX.nodeId && T.state.nodes[recX.nodeId].partial, "source x.log was windowed-loaded and flagged partial");
  assert(recY.nodeId && T.state.nodes[recY.nodeId].partial, "source y.log was windowed-loaded and flagged partial");
  const mergedId = T.state.nodes[T.state.activeId].parentId; // active node is the timerange filter created on top of the merge
  const merged = T.state.nodes[mergedId];
  assert(merged && merged.merged === true, "a merged node was created from the two windowed sources");
  assert(merged.partial && merged.partial.from === tsAt(100) && merged.partial.to === tsAt(120),
    "the merged node's own partial range is the union of both sources' windows, got " + JSON.stringify(merged.partial));

  w.deleteFilterNodeWithUndo(mergedId);
  assert(!T.state.nodes[mergedId], "the merged node is gone after closing it");
  w.undo();
  assert(T.state.nodes[mergedId] && T.state.nodes[mergedId].partial, "node.partial survives close+undo (snapshotSubtree/restoreSubtree)");
  assert(T.state.nodes[mergedId].partial.from === tsAt(100) && T.state.nodes[mergedId].partial.to === tsAt(120),
    "the restored partial range still matches exactly what was originally merged");
});
