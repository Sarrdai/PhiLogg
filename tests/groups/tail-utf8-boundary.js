// GROUP tail-utf8-boundary \u2014 loaded by philogg.regression.test.js
// (tests/README.md \u2192 "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, makeLog, ...) is
// in scope.

/* ============================================================
   GROUP tail-utf8-boundary \u2014 a live-tail poll (or a windowed load's chunk)
   that ends inside a multi-byte UTF-8 character no longer corrupts it
   Origin: 2026-10-02 (code review). tailTick read the grown byte range with
   Blob.text() and set t.offset = f.size: a range ending inside a character
   decoded its cut half as U+FFFD, and the next poll, starting in the middle
   of the same character, decoded the other half as U+FFFD too ("Gr\u00fc\u00dfe" ->
   "Gr??\u00dfe", permanently). Now the range is decoded up to the last complete
   character (utf8CompleteLength / readUtf8Range) and t.offset advances by the
   bytes actually consumed, so the 1-3 held-back bytes are read again with the
   rest of their character. parseFileWindow's fixed 2 MB chunks had the same
   boundary problem and use the same helper.
   Handles are byte-accurate: a jsdom Blob built from a Uint8Array, so
   slice() cuts at real byte offsets (the older tailing groups use ASCII
   fixtures where bytes and string indices coincide).
   ============================================================ */
group("tail-utf8-boundary");
await withApp(async (w, d, T) => {
  section("tail-utf8-boundary a. utf8CompleteLength: only an incomplete trailing sequence is held back");

  const U = (...b) => new Uint8Array(b);
  const len = bytes => w.utf8CompleteLength(bytes);
  const enc = new TextEncoder();
  const E = s => enc.encode(s);
  const cat = (...parts) => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };

  assert(len(U()) === 0, "empty -> 0");
  assert(len(E("abc")) === 3, "ASCII is complete");
  // 2-byte: U+00FC "\u00fc" = C3 BC
  assert(len(E("\u00fc")) === 2, "a whole \u00fc is complete");
  assert(len(U(0xC3)) === 0, "a lone \u00fc lead byte is held back");
  assert(len(cat(E("a"), U(0xC3))) === 1, "...and only that byte, not the text before it");
  // 3-byte: U+20AC "\u20ac" = E2 82 AC
  assert(len(E("\u20ac")) === 3, "a whole \u20ac is complete");
  assert(len(U(0xE2, 0x82)) === 0, "\u20ac without its last byte is held back (2 bytes)");
  assert(len(U(0xE2)) === 0, "\u20ac with only its lead byte is held back (1 byte)");
  assert(len(cat(E("x"), U(0xE2, 0x82))) === 1, "...from the lead byte on, not just the last byte");
  // 4-byte: U+1F600 = F0 9F 98 80
  assert(len(E("\u{1F600}")) === 4, "a whole emoji is complete");
  assert(len(U(0xF0, 0x9F, 0x98)) === 0, "emoji missing 1 byte is held back (3 bytes)");
  assert(len(U(0xF0, 0x9F)) === 0, "emoji missing 2 bytes is held back (2 bytes)");
  assert(len(U(0xF0)) === 0, "emoji missing 3 bytes is held back (1 byte)");
  assert(len(cat(E("ab"), U(0xF0, 0x9F, 0x98))) === 2, "...from the lead byte on");
  assert(len(cat(E("\u20ac"), U(0xE2))) === 3, "a complete character followed by the start of the next: only the start is held back");
  // Stray / invalid bytes are not "incomplete": they stay and decode to U+FFFD like before.
  assert(len(U(0x80)) === 1, "a lone continuation byte is not held back");
  assert(len(U(0x80, 0x80, 0x80)) === 3, "three stray continuation bytes are not held back");
  assert(len(U(0xC0)) === 1 && len(U(0xC1)) === 1, "0xC0/0xC1 (never valid) are not held back");
  assert(len(U(0xF5)) === 1 && len(U(0xFF)) === 1, "0xF5-0xFF (never valid) are not held back");
  assert(len(U(0xE2, 0x41)) === 2, "a lead byte followed by ASCII is a broken sequence, not an incomplete one");
  assert(len(U(0xC3, 0xBC, 0xBC)) === 3, "more continuation bytes than the lead needs: stray, not incomplete");
  assert(len(U(0xE2, 0x82, 0xAC, 0x82)) === 4, "a stray continuation byte after a complete character is not held back");

  section("tail-utf8-boundary b. readUtf8Range: whole characters only, plain text() fallback for a stand-in without arrayBuffer()");
  const part = new w.Blob([cat(E("Gr"), U(0xC3))]);
  const r = await w.readUtf8Range(part, 3);
  assert(r.text === "Gr" && r.length === 2, "a range ending inside \u00fc decodes up to the character start, got " + JSON.stringify(r));
  const r2 = await w.readUtf8Range(new w.Blob([E("Gr\u00fc")]), 4);
  assert(r2.text === "Gr\u00fc" && r2.length === 4, "a complete range is decoded whole, got " + JSON.stringify(r2));
  const r3 = await w.readUtf8Range({ text: async () => "plain" }, 5);
  assert(r3.text === "plain" && r3.length === 5, "an object without arrayBuffer() falls back to text() and the given byte length");
});

await withApp(async (w, d, T) => {
  section("tail-utf8-boundary c. tailTick: a poll cut inside a multi-byte character keeps the character intact");

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const E = s => enc.encode(s);
  const cat = (...parts) => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
  const noFffd = s => !s.includes("\ufffd");

  // A byte-accurate fake FileSystemFileHandle: getFile() is a jsdom Blob over
  // the current bytes, so slice() and arrayBuffer() work on real byte offsets.
  function byteHandle(initial) {
    let bytes = initial;
    return {
      set(b) { bytes = b; },
      async getFile() { return new w.Blob([bytes]); },
    };
  }

  let seq = 0;
  async function tailedFile(baseBytes) {
    const handle = byteHandle(baseBytes);
    const f = await w.addFile("live" + (++seq) + ".log", dec.decode(baseBytes), () => {});
    f.tail = { handle, offset: baseBytes.length, pending: "", failed: false, busy: false, encoding: "utf-8" }; // as a load would have resolved it (the group is about UTF-8 cuts)
    return { f, handle };
  }

  const base = E(makeLog(0, 2));
  const baseEntries = 2;

  // Each case: the character, and a message built around it.
  const cases = [
    { name: "\u00fc (2 bytes)", ch: "\u00fc", prefix: "Gr\u00fc\u00dfe aus M\u00fcnchen" },
    { name: "\u20ac (3 bytes)", ch: "\u20ac", prefix: "Preis \u20ac100" },
    { name: "emoji (4 bytes)", ch: "\u{1F600}", prefix: "fertig \u{1F600} ok" },
  ];
  for (const c of cases) {
    const line = makeLog(2, 1, { msgPrefix: c.prefix });
    const full = E(line);
    const expectedMessage = c.prefix + " 0";
    const charStart = E(line.slice(0, line.indexOf(c.ch))).length;
    const charLen = E(c.ch).length;
    const beforeChar = dec.decode(full.slice(0, charStart));

    // Every cut position strictly inside the character.
    for (let k = 1; k < charLen; k++) {
      const { f, handle } = await tailedFile(base);
      handle.set(cat(base, full.slice(0, charStart + k)));
      await w.tailTick();
      assert(f.entries.length === baseEntries, `${c.name}, cut after ${k} byte(s): the unterminated line is not an entry yet`);
      assert(f.tail.offset === base.length + charStart, `${c.name}, cut after ${k} byte(s): the offset stops at the character start (held back ${k}), got ${f.tail.offset - base.length}`);
      assert(f.tail.pending === beforeChar && noFffd(f.tail.pending), `${c.name}, cut after ${k} byte(s): the pending text ends before the character with no U+FFFD, got ${JSON.stringify(f.tail.pending)}`);

      handle.set(cat(base, full));
      await w.tailTick();
      assert(f.entries.length === baseEntries + 1, `${c.name}, cut after ${k} byte(s): the completed line is exactly one entry, got ${f.entries.length}`);
      const e = f.entries[f.entries.length - 1];
      assert(e.message === expectedMessage, `${c.name}, cut after ${k} byte(s): the message survives intact, got ${JSON.stringify(e.message)}`);
      assert(f.tail.offset === base.length + full.length, `${c.name}, cut after ${k} byte(s): the offset ends at the file size after the completing poll`);
      assert(f.tail.pending === "", `${c.name}, cut after ${k} byte(s): nothing left pending`);
    }

    // Boundary exactly between characters: nothing is held back.
    for (const [label, at] of [["right before the character", charStart], ["right after the character", charStart + charLen]]) {
      const { f, handle } = await tailedFile(base);
      handle.set(cat(base, full.slice(0, at)));
      await w.tailTick();
      assert(f.tail.offset === base.length + at, `${c.name}, cut ${label}: the whole range is consumed (no hold-back)`);
      assert(noFffd(f.tail.pending), `${c.name}, cut ${label}: no U+FFFD in the pending text`);
      assert(f.tail.pending === dec.decode(full.slice(0, at)), `${c.name}, cut ${label}: the pending text is exactly the bytes read`);
      handle.set(cat(base, full));
      await w.tailTick();
      assert(f.entries.length === baseEntries + 1 && f.entries[f.entries.length - 1].message === expectedMessage, `${c.name}, cut ${label}: one correct entry after the next poll`);
    }
  }

  section("tail-utf8-boundary d. tailTick: held-back bytes alone are not growth, a progressively written emoji lands once");
  {
    const prefix = "fertig \u{1F600} ok";
    const line = makeLog(2, 1, { msgPrefix: prefix });
    const full = E(line);
    const charStart = E(line.slice(0, line.indexOf("\u{1F600}"))).length;
    const { f, handle } = await tailedFile(base);
    const changes = [];
    const origOnTailChange = w.onTailChange;
    w.onTailChange = (...args) => { changes.push(args[0]); return origOnTailChange(...args); };
    try {
      handle.set(cat(base, full.slice(0, charStart + 1)));
      await w.tailTick();
      const offsetAfterFirst = f.tail.offset;
      assert(offsetAfterFirst === base.length + charStart, "sanity: the first byte of the emoji is held back");
      f.tail.lastGrowth = Date.now() - 1000; // a recent sentinel: a poll that counts as growth would overwrite it
      const sentinel = f.tail.lastGrowth;
      changes.length = 0;

      // The same bytes again: only the held-back byte is "new" to this poll.
      await w.tailTick();
      assert(f.tail.offset === offsetAfterFirst, "a poll that only re-reads the held-back byte leaves the offset alone");
      assert(f.tail.lastGrowth === sentinel, "...does not touch lastGrowth (not growth)");
      assert(changes.length === 0, "...and reports no change");
      assert(f.entries.length === baseEntries, "...and adds no entry");

      // The writer adds one more byte of the emoji: still only held-back bytes.
      handle.set(cat(base, full.slice(0, charStart + 2)));
      await w.tailTick();
      assert(f.tail.offset === offsetAfterFirst && f.tail.lastGrowth === sentinel && changes.length === 0, "a poll that adds only another incomplete byte is still not growth");
      handle.set(cat(base, full.slice(0, charStart + 3)));
      await w.tailTick();
      assert(f.tail.offset === offsetAfterFirst && f.tail.lastGrowth === sentinel && changes.length === 0, "...even with 3 of 4 bytes written");

      // The character completes, the line terminates: one entry, one change.
      handle.set(cat(base, full));
      await w.tailTick();
      assert(f.entries.length === baseEntries + 1, "the completed line is one entry");
      assert(f.entries[f.entries.length - 1].message === prefix + " 0", "...with the emoji intact, got " + JSON.stringify(f.entries[f.entries.length - 1].message));
      assert(f.tail.offset === base.length + full.length, "the offset ends at the file size");
      assert(f.tail.lastGrowth !== sentinel, "the poll that consumed bytes counts as growth");
      assert(changes.length === 1, "...and reports exactly one change, got " + changes.length);
    } finally {
      w.onTailChange = origOnTailChange;
    }
  }

  section("tail-utf8-boundary e. tailTick: a genuinely invalid byte sequence is still replaced by U+FFFD (unchanged behaviour)");
  {
    // The simulator's own line with raw bytes spliced into the message:
    // 0xFF (never valid), a lone 0x80 (stray continuation) and 0xE2 followed
    // by ASCII (a lead byte whose sequence is broken, not incomplete).
    const line = makeLog(2, 1, { msgPrefix: "bad @A@ mid @B@ end @C@Z" });
    const parts = line.split(/@[ABC]@/);
    assert(parts.length === 4, "sanity: three splice points");
    const bytes = cat(E(parts[0]), Uint8Array.of(0xFF), E(parts[1]), Uint8Array.of(0x80), E(parts[2]), Uint8Array.of(0xE2), E(parts[3]));
    const expected = "bad \ufffd mid \ufffd end \ufffdZ 0";

    // Whole line in one poll.
    {
      const { f, handle } = await tailedFile(base);
      handle.set(cat(base, bytes));
      await w.tailTick();
      const e = f.entries[f.entries.length - 1];
      assert(f.entries.length === baseEntries + 1 && e.message === expected, "invalid bytes decode to U+FFFD exactly as before, got " + JSON.stringify(e.message));
      assert(f.tail.offset === base.length + bytes.length, "...and the whole range is consumed");
    }
    // A poll boundary right after the invalid byte: not held back, same result.
    {
      const { f, handle } = await tailedFile(base);
      const cut = E(parts[0]).length + 1; // just after the 0xFF
      handle.set(cat(base, bytes.slice(0, cut)));
      await w.tailTick();
      assert(f.tail.offset === base.length + cut, "a cut right after an invalid byte consumes it (nothing to wait for)");
      assert(f.tail.pending === parts[0] + "\ufffd", "...as U+FFFD, got " + JSON.stringify(f.tail.pending));
      handle.set(cat(base, bytes));
      await w.tailTick();
      assert(f.entries.length === baseEntries + 1 && f.entries[f.entries.length - 1].message === expected, "the line completes with the same message as a single read");
    }
  }

  section("tail-utf8-boundary f. tailTick: rotation while bytes are held back starts clean");
  {
    const line = makeLog(2, 1, { msgPrefix: "Preis \u20ac100" });
    const full = E(line);
    const charStart = E(line.slice(0, line.indexOf("\u20ac"))).length;
    const { f, handle } = await tailedFile(base);
    handle.set(cat(base, full.slice(0, charStart + 1)));
    await w.tailTick();
    assert(f.tail.offset === base.length + charStart && f.tail.pending.length > 0, "sanity: bytes are held back and a partial line is pending");

    // The file is replaced by a shorter one (rotation): below the held-back offset.
    const rotated = E(makeLog(0, 1, { msgPrefix: "rotated \u00fc" }));
    assert(rotated.length < f.tail.offset, "sanity: the new file is shorter than the tracked offset");
    handle.set(rotated);
    await w.tailTick();
    assert(f.entries.length === 1 && f.entries[0].message === "rotated \u00fc 0", "rotation re-reads from 0 and drops the held-back state, got " + JSON.stringify(f.entries.map(e => e.message)));
    assert(f.tail.offset === rotated.length && f.tail.pending === "", "the offset and pending text start clean");
  }
});

await withApp(async (w, d, T) => {
  section("tail-utf8-boundary g. parseFileWindow: a chunk boundary inside a character does not corrupt it");

  const enc = new TextEncoder();
  const E = s => enc.encode(s);
  const CHUNK = 2 * 1024 * 1024; // WINDOW_READ_CHUNK_BYTES
  const euroMsg = "Preis \u20ac100 ok";
  const build = pad => makeLog(0, 1, { msgPrefix: "x".repeat(pad) }) + makeLog(1, 1, { msgPrefix: euroMsg }) + makeLog(2, 1, { msgPrefix: "after" });
  // Tune the first entry's padding so the euro sign starts at the last byte of
  // the first 2 MB chunk: the chunk ends after its first byte.
  const probe = build(1); // (a padding of 0 would fall back to makeLog's default prefix)
  const pad = 1 + CHUNK - 1 - E(probe.slice(0, probe.indexOf("\u20ac"))).length;
  assert(pad > 0, "sanity: the fixture fits");
  const text = build(pad);
  const bytes = E(text);
  assert(E(text.slice(0, text.indexOf("\u20ac"))).length === CHUNK - 1, "sanity: the first byte of the euro sign is the last byte of chunk 1");
  assert(bytes.length > CHUNK, "sanity: the file spans two chunks");

  const file = new w.Blob([bytes]);
  const anchor = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const node = { entries: [] };
  const ok = await w.parseFileWindow(file, node, anchor, anchor + 3600 * 1000, () => {});
  assert(ok, "parseFileWindow succeeds");
  assert(node.entries.length === 3, "all three entries are parsed, got " + node.entries.length);
  const second = node.entries[1];
  assert(second && second.message === euroMsg + " 0", "the entry whose euro sign straddles the chunk boundary is intact, got " + JSON.stringify(second && second.message));
  assert(node.entries.every(e => !e.message.includes("\ufffd")), "no U+FFFD anywhere");
  assert(node.entries[2].message === "after 0", "the entry after it is unaffected");
});
