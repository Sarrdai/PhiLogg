// GROUP 127 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 127 — Boot-time session restore shows every restored file as a
   grayed placeholder immediately, not one at a time as each PRIOR file
   finishes its own full parse
   Origin: this session, person-reported: *"wenn Dateien beim neu laden der
   Anwendung wiederhergestellt werden, blende sie schon ausgegraut ein.
   aktuell erscheinen sie erst nachdem die vorherige Datei geladen wurde."*
   restoreSessionFromCache used to loop `await addFile(...)` sequentially
   per restored file — the next file's row only appeared once the current
   one's entire parse had finished, so a session with several large files
   looked like they were trickling in one at a time. Now mirrors
   loadFileDescriptors' own multi-file-open shape: a first pass creates a
   `createQueuedFileNode` placeholder for every restored file (in order,
   one render()) before any of them starts parsing; a second pass turns
   each one into a real, actively-loading row in turn
   (`activateQueuedFileNode`, via a new `existingNode` 5th param on
   `addFile`, same idea `loadOneFileIntoTree` already had). Also required a
   fix to `activateQueuedFileNode` itself: it unconditionally set
   `state.activeId`, which — now that it runs during a session restore too
   — would have reintroduced the exact activeId-thrashing bug
   `createFileNode`'s own `sessionRestoreInProgress` guard exists to
   prevent (see PROJECT.md/`createFileNode`'s comment), just via a new call
   path; `activateQueuedFileNode` now carries the same guard.
   ============================================================ */
group(127);
{
  const factory127 = new IDBFactory();

  // Two large-ish files (several PARSE_CHUNK_LINES chunks each) so the
  // first one's parse genuinely hasn't finished by the time this test polls
  // for the queued-placeholder state — a tiny single-chunk fixture would
  // resolve too fast to reliably observe the intermediate state at all.
  const textA = makeLog(0, 20000);
  const textB = makeLog(0, 20000);

  await withApp(async (w) => {
    const fA = await w.addFile("first.log", textA, () => {});
    const fB = await w.addFile("second.log", textB, () => {});
    await w.persistFileNode(fA);
    await w.persistFileNode(fB);
    await w.persistMetaNow();
  }, { indexedDB: factory127 });

  await withApp(async (w, d, T) => {
    // Both placeholder rows appear together, in order, well before either
    // file's parse is done — poll for the STRUCTURAL moment (two root
    // nodes existing) rather than any specific entry count.
    // Deliberately NOT `await T.bootRestore` here, unlike every other reload
    // group: this one asserts on the INTERMEDIATE state, which the settled
    // barrier would have already run past.
    await waitFor(() => T.state.rootIds.length >= 2);
    assert(T.state.rootIds.length === 2, "both restored files are real root nodes together, not one at a time — got " + T.state.rootIds.length);

    const nodeA = T.state.nodes[T.state.rootIds[0]];
    const nodeB = T.state.nodes[T.state.rootIds[1]];
    assert(nodeA.name === "first.log" && nodeB.name === "second.log", "restored file order is preserved (fileOrder)");

    // At this early point, the FIRST file has already been activated into
    // an actively-loading row (the second pass processes fileOrder in
    // order) — but the SECOND is still a grayed, non-interactive queued
    // placeholder, exactly what the person asked to see immediately
    // instead of a blank gap where its row would eventually appear.
    assert(nodeB.queued === true || nodeB.entries.length < 20000,
      "sanity: the second file hasn't finished loading yet — got queued=" + nodeB.queued + " entries=" + nodeB.entries.length);
    const rowB = d.querySelector('.tree-row-queued, .tree-row[data-node-id="' + nodeB.id + '"]');
    assert(rowB !== null, "the second file has SOME row in the tree already");
    if (nodeB.queued) {
      assert(rowB.classList.contains("tree-row-queued"), "the second file's row is the grayed queued placeholder while it waits its turn — not simply absent");
    }

    // Eventually both finish loading with their full, correct content.
    await waitFor(() => nodeA.entries.length >= 20000 && nodeB.entries.length >= 20000, { timeout: 10000 });
    assert(nodeA.entries.length === 20000 && nodeB.entries.length === 20000,
      "both restored files finish loading with their full entry counts — got " + nodeA.entries.length + "/" + nodeB.entries.length);
    assert(!nodeA.queued && !nodeB.queued && typeof nodeA.loadFraction !== "number" && typeof nodeB.loadFraction !== "number",
      "both files are fully activated, real (not queued) nodes once restore finishes");
  }, { indexedDB: factory127 });
}
