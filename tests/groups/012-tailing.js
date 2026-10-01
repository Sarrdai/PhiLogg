// GROUP 12 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 12 — Tailing
   Origin: 727a344e (initial feature, 24 assertions) + 94d8ec50 (rotation
   index-leak fix, folded into Group 10 above). Re-verifies growth via
   file.slice(offset), split-line buffering across poll boundaries, and
   truncation/rotation handling — using a fake FileSystemFileHandle since
   jsdom has no File System Access API.
   ============================================================ */
group(12);
await withApp(async (w, d, T) => {
  section("12. Tailing (growth, split lines, rotation)");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
        blob.slice = (start) => new w.Blob([text.slice(start)]);
        blob.text = async () => text.slice(0); // full text (offset math done by slice() above)
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        // Re-implement slice properly: Blob.slice needs byte semantics; since
        // this fixture's text is ASCII, string-index slicing is equivalent.
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }

  const initial = makeLog(0, 3);
  const handle = fakeHandle(initial);
  const f = await w.addFile("live.log", initial, () => {});
  f.tail = { handle, offset: initial.length, pending: "", failed: false, busy: false };
  w.render();
  assert(f.entries.length === 3, "initial tail state seeded with 3 entries");

  // Growth: append a new complete line
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"new entry"\n`;
  handle._setText(initial + appended);
  await w.tailTick();
  assert(f.entries.length === 4, "tailTick picks up newly appended complete line, got " + f.entries.length);

  // Split line across poll boundary: write a partial line (no trailing
  // newline yet), tick, then complete it on the next tick.
  const partial = `2024-01-15 10:00:04,000\tINFO\t"main"\tFoo.cs\tline 4\t[DoWork]\t"split mess`;
  handle._setText(initial + appended + partial);
  await w.tailTick();
  assert(f.entries.length === 4, "an unterminated trailing line is buffered, not parsed as a new entry yet");
  assert(f.tail.pending.length > 0, "unterminated text sits in tail.pending");
  handle._setText(initial + appended + partial + `age"\n`);
  await w.tailTick();
  assert(f.entries.length === 5, "completing the line on the next poll parses it as one entry, got " + f.entries.length);
  assert(f.entries[4].message === "split message", "the split line reassembled correctly across the poll boundary");

  // Rotation/truncation: file shrinks below the tracked offset -> reset and re-read from 0.
  const rotatedText = makeLog(0, 2, { msgPrefix: "rotated" });
  const staleEntryId = f.entries[0].id;
  handle._setText(rotatedText);
  await w.tailTick();
  assert(f.entries.length === 2, "rotation resets entries and re-reads from offset 0, got " + f.entries.length);
  assert(f.entries[0].message.includes("rotated"), "post-rotation entries reflect the new file content");
  assert(T.entryIndex[staleEntryId] === undefined, "rotated-out entries are released from entryIndex (94d8ec50 fix, re-verified live here)");
});
