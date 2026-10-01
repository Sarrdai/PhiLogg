// GROUP 165 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 165 — Off-main-thread parsing (parseLogTextInWorker) + concurrent
   multi-file loading
   Origin: this session (2026-09-04), person-requested: with typical logs at
   50-100MB and 2-4 loaded together, parsing (not I/O) is the CPU-bound part,
   and the main thread's own chunked loop only ever yields between chunks —
   it never runs two files' parses at once. buildLogParseWorkerSrc() bundles
   the parsing subset of functions above (getCompiledFormat's dependencies)
   into a Worker script via Function.prototype.toString() — no hand-copied
   mirror to drift — and loadFileDescriptors now runs the whole batch
   concurrently instead of one file at a time (see GROUP 68's addendum).
   jsdom has no Worker global, so parseLogTextAsync's own fallback path is
   exercised by every other file-loading group in this suite already; this
   group instead (a) proves the concurrent-batch path produces correct,
   non-colliding entries per file, and (b) runs the actual built worker
   source in a bare vm sandbox (mocked self/postMessage, no browser APIs) to
   verify it parses identically to the main-thread path — for both the
   builtin default format and a custom regex-mode format, since compileOneFormat
   takes a different branch for each.
   ============================================================ */
group(165);
await withApp(async (w, d, T) => {
  section("165a. Concurrent multi-file load: each file's entries land correctly, ids don't collide across files");
  const fa = new w.File([makeLog(0, 5, { msgPrefix: "fileA" })], "concA.log", { type: "text/plain" });
  const fb = new w.File([makeLog(0, 5, { msgPrefix: "fileB" })], "concB.log", { type: "text/plain" });
  const fc = new w.File([makeLog(0, 5, { msgPrefix: "fileC" })], "concC.log", { type: "text/plain" });

  const donePromise = w.loadFileDescriptors([
    { file: fa, handle: null }, { file: fb, handle: null }, { file: fc, handle: null },
  ]);
  fireKeydown(d, w, "Escape"); // answer "No" to the merge prompt
  await donePromise;

  assert(T.state.rootIds.length === 3, "all 3 concurrently-loaded files landed as root nodes, got " + T.state.rootIds.length);
  const nodes = T.state.rootIds.map(id => T.state.nodes[id]);
  for (const n of nodes) assert(n.entries.length === 5, n.name + " has all 5 of its own entries, got " + n.entries.length);
  const prefixByFile = { "concA.log": "fileA", "concB.log": "fileB", "concC.log": "fileC" };
  for (const n of nodes) {
    assert(n.entries.every(e => e.message.startsWith(prefixByFile[n.name])),
      n.name + "'s entries are its own, not mixed in from a file loaded concurrently alongside it");
  }
  const allIds = nodes.flatMap(n => n.entries.map(e => e.id));
  assert(new Set(allIds).size === allIds.length, "no entry id collides across the 3 concurrently-parsed files, got " + allIds.length + " ids / " + new Set(allIds).size + " unique");
  assert(allIds.every(id => T.entryIndex[id]), "every entry from every concurrently-loaded file is registered in the shared entryIndex");
});

await withApp(async (w, d, T) => {
  section("165b. buildLogParseWorkerSrc() output, run in a bare sandbox (no browser APIs), parses the builtin default format identically to the main-thread path");
  const text = makeLog(0, 4);
  const src = w.buildLogParseWorkerSrc();

  const posted = [];
  const sandboxSelf = {};
  const ctx = vm.createContext({ self: sandboxSelf, postMessage: msg => posted.push(msg) });
  vm.runInContext(src, ctx);
  assert(typeof sandboxSelf.onmessage === "function", "the built source installs self.onmessage in a plain sandbox, no browser globals needed");

  // DEFAULT_LOG_FORMAT is a top-level `const` (not window-exposed — see the
  // withApp comment on that jsdom gotcha); compileOneFormat's builtin fast
  // path only checks fmt.builtin && !fmt.edited, so this minimal stand-in
  // takes the exact same branch.
  const defaultFmt = { id: "fmt-default", builtin: true, edited: false };
  sandboxSelf.onmessage({ data: { text, fmt: defaultFmt } });
  // Entries come back as binary batches (see GROUP 268), decoded by the page.
  const workerEntries = posted.filter(m => m.type === "batch").flatMap(m => w.decodeNativeBatch(m.buf, m.strings).entries);
  assert(posted.some(m => m.type === "done" && m.total === workerEntries.length + 1),
    // +1: makeLog's trailing "\n" produces one empty trailing line, matching
    // the main-thread loop's own lines.length semantics (blank lines after
    // the last header don't start a new entry, but still count as a line).
    "a \"done\" message reports the same line count the sandbox actually walked");

  const reference = await w.addFile("165b-reference.log", text, () => {});
  assert(workerEntries.length === reference.entries.length,
    "sandboxed worker source produced the same entry count as the real (fallback, jsdom has no Worker) main-thread parse, got " + workerEntries.length + " vs " + reference.entries.length);
  for (let i = 0; i < reference.entries.length; i++) {
    const w1 = workerEntries[i], r1 = reference.entries[i];
    assert(w1.ts === r1.ts && w1.level === r1.level && w1.thread === r1.thread && w1.message === r1.message,
      "entry " + i + " matches field-for-field between the sandboxed worker source and the main-thread fallback path");
  }
});

await withApp(async (w, d, T) => {
  section("165c. Same sandbox check, for a custom regex-mode format (compileOneFormat's non-builtin branch, which the default format's fast path never exercises)");
  const customFmt = {
    id: "fmt-165c", name: "Custom", mode: "regex", builtin: false, edited: false,
    regex: '^(?<ts>\\S+ \\S+)\\|(?<level>\\w+)\\|(?<message>.*)$',
    tsFormat: "", pattern: "", levels: [],
  };
  const lines = [
    "2024-01-15 10:00:00|INFO|first custom line",
    "2024-01-15 10:00:01|WARN|second custom line",
    "not a header, continues the previous entry",
  ];
  const text = lines.join("\n") + "\n";

  const posted = [];
  const sandboxSelf = {};
  const ctx = vm.createContext({ self: sandboxSelf, postMessage: msg => posted.push(msg) });
  vm.runInContext(w.buildLogParseWorkerSrc(), ctx);
  sandboxSelf.onmessage({ data: { text, fmt: customFmt } });
  // formatId is stamped on the main thread when a batch is adopted (GROUP 268).
  const entries = posted.filter(m => m.type === "batch").flatMap(m => w.decodeNativeBatch(m.buf, m.strings).entries);

  assert(entries.length === 2, "the regex-mode format's header/continuation split works inside the sandboxed worker source, got " + entries.length);
  assert(entries[0].level === "INFO" && entries[1].level === "WARN", "level group matched correctly for a custom regex format");
  assert(entries[1].message.includes("second custom line") && entries[1].message.includes("continues the previous entry"),
    "a continuation line (no match against the custom regex) still gets appended to the open entry's message");
});
