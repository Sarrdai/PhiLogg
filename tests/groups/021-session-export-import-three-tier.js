// GROUP 21 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 21 — Session export / import (three-tier file matching)
   Origin: this session. Covers the whole testing plan from the design spec:
   tier-1 exact round-trip, tier-2 auto-match against a grown (tailed)
   receiving copy, tier-2 rejection on a density mismatch, tier-3 manual
   pick with the ts+fingerprint bookmark fallback, the version guard, and
   the embedded-log materialization path. All file writes are captured by
   stubbing downloadBlobFallback (jsdom has no showSaveFilePicker, so the
   export path deterministically takes the download fallback).
   ============================================================ */
group(21);
{
  const baseText = makeLog(0, 30);
  let exportedJson = null;        // captured plain export (no embedded text)
  let exportedEmbeddedJson = null; // captured export WITH embedded log text
  let savedRaw5 = null, savedRaw15 = null; // raws of the two bookmarked entries

  // --- Window A: build a session and export it through the real dialog ---
  await withApp(async (w, d, T) => {
    section("21. Session export/import");
    const f = await w.addFile("worker-3.log", baseText, () => {});
    const other = await w.addFile("unrelated.log", makeLog(5000, 4), () => {});
    w.render();

    // Fingerprint sanity + tail-invalidation hook for the cached full hash.
    const h1 = w.fingerprintText("abc");
    assert(h1.length === 16 && h1 === w.fingerprintText("abc") && h1 !== w.fingerprintText("abd"),
      "export: fingerprint is 16 hex chars, deterministic, input-sensitive");
    const full = w.getFileFullHash(f);
    assert(f._fullHash === full, "export: full-file fingerprint cached on the node");
    w.invalidateCachesForRoots([f.id]);
    assert(f._fullHash === null, "export: tail-scoped invalidation clears the cached fingerprint");

    // Filters: text -> AND combiner (linkedRef), highlight colour on the sibling.
    const t1 = w.createFilterNode(f.id, "text", "message 1");
    const t2 = w.createFilterNode(f.id, "text", "ERROR");
    t2.highlightColor = "#ff0000";
    const combo = w.createAndOrNode([t1.id, t2.id], "and");

    // Bookmarks on entries 5 and 15 (15 will be missing in the tier-3 fixture).
    savedRaw5 = f.entries[5].raw;
    savedRaw15 = f.entries[15].raw;
    w.toggleBookmark(f.entries[5].id);
    T.state.notes.set(f.entries[5].id, "check this"); // general-purpose note, independent of the bookmark itself
    w.toggleBookmark(f.entries[15].id);
    T.state.levelFilter.add("ERROR");
    T.state.sortColumn = "level";
    T.state.sortDir = "desc";
    T.state.activeId = combo.id;

    // Import/Export lives behind the "Open…"/"Save" icon buttons in the
    // sidebar header now (FEATURE_BACKLOG.md #56), NOT the per-node/
    // tree-background context menu — the node menu must no longer carry
    // either entry.
    w.render();
    fireContextMenu(d.querySelector(".tree-row"), w);
    const menuHtml = d.querySelector("#treeContextMenu").innerHTML;
    assert(!menuHtml.includes("Export session") && !menuHtml.includes("Import session"),
      "export: node context menu no longer offers Export/Import session");
    w.closeTreeContextMenu();

    const btnOpenSess = d.querySelector("#btnOpen");
    const openMenuSess = d.querySelector("#openMenu");
    assert(openMenuSess.classList.contains("hidden"), "open menu starts hidden");
    fireClick(btnOpenSess, w);
    assert(!openMenuSess.classList.contains("hidden"), "clicking \"Open\" reveals the dropdown");
    const openActions = [...openMenuSess.querySelectorAll("[data-action]")].map(i => i.dataset.action);
    assert(openActions.join(",") === "files,folder,zip,import",
      "open menu offers File(s)…/Folder…/ZIP…/Import…, got " + openActions.join(","));
    fireClick(d.body, w);
    assert(openMenuSess.classList.contains("hidden"), "clicking outside the open menu closes it");
    assert(!!d.querySelector("#btnSave"), "\"Save\" button (session export) exists");

    // Export dialog: one row per root file, per-file include + embed checkboxes.
    let captured = [];
    w.downloadBlobFallback = (blob, name) => { const e = { name, json: null }; captured.push(e); blob.text().then(t => { e.json = t; }); };
    w.openSessionExportDialog();
    assert(!d.querySelector("#sessionExportDialog").classList.contains("hidden"), "export: dialog opens");
    const rows = d.querySelectorAll("#sessionExportRows .session-file-row");
    assert(rows.length === 2, "export: one dialog row per loaded root file");
    // Deselect the unrelated file — its filters/bookmarks must not be exported.
    d.querySelector('.session-include[data-file-id="' + other.id + '"]').checked = false;
    fireClick(d.querySelector("#sessionExportConfirm"), w);
    await waitFor(() => captured.length === 1 && captured[0].json !== null);
    assert(captured.length === 1 && captured[0].name.startsWith("philogg-session-"),
      "export: confirm writes exactly one JSON via the download fallback");
    exportedJson = captured[0].json;
    const doc = JSON.parse(exportedJson);
    assert(doc.format === "philogg-session-export" && doc.version === 1, "export: envelope format/version");
    assert(doc.files.length === 1 && doc.files[0].name === "worker-3.log", "export: deselected file excluded");
    const rec = doc.files[0];
    assert(rec.entryCount === 30 && typeof rec.fullHash === "string" && rec.fullHash.length === 16,
      "export: entryCount + 16-char fullHash present");
    assert(rec.timeSpan && rec.timeSpan.start === f.entries[0].ts && rec.timeSpan.end === f.entries[29].ts,
      "export: timeSpan spans first..last entry ts");
    assert(rec.text === undefined, "export: log text NOT embedded by default");
    assert(rec.bookmarks.length === 2 && rec.bookmarks[0].ordinal === 5
      && typeof rec.bookmarks[0].ts === "number" && rec.bookmarks[0].raw === w.fingerprintText(savedRaw5),
      "export: bookmarks carry ordinal + ts + raw fingerprint");
    assert(rec.notes.length === 1 && rec.notes[0].ordinal === 5 && rec.notes[0].text === "check this",
      "export: notes carry ordinal + text, separately from bookmarks");
    assert(doc.settings.levelFilter.includes("ERROR") && doc.settings.sortColumn === "level"
      && doc.settings.sortDir === "desc", "export: session-wide settings serialized");
    assert(doc.settings.active && doc.settings.active.exportId === rec.exportId && doc.settings.active.ref != null,
      "export: active filter recorded as exportId + ref");

    // Second export WITH embedded text for the embedded-log test below.
    captured = [];
    w.openSessionExportDialog();
    d.querySelector('.session-include[data-file-id="' + other.id + '"]').checked = false;
    d.querySelector('.session-embed[data-file-id="' + f.id + '"]').checked = true;
    fireClick(d.querySelector("#sessionExportConfirm"), w);
    await waitFor(() => captured.length === 1 && captured[0].json !== null);
    exportedEmbeddedJson = captured[0].json;
    assert(JSON.parse(exportedEmbeddedJson).files[0].text.includes("message 15"),
      "export: per-file embed checkbox includes the rebuilt log text");
  });

  // --- Tier 1: import against a byte-identical file (different name) ---
  await withApp(async (w, d, T) => {
    const f = await w.addFile("renamed-copy.log", baseText, () => {});
    w.render();
    w.importSessionJson(exportedJson);
    await sleep(80);
    assert(d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "tier1: identical content auto-matches with no dialog (name is display-only)");
    // 5, not 3: the three imported top-level filters (t1, t2, the AND
    // combiner — always placed directly under the file, see "Core data
    // model" in PROJECT.md) plus the auto "Bookmarks"/"Notes" nodes
    // re-derived from the imported bookmarks/notes (see
    // syncBookmarksFilterNode/syncNotesFilterNode, called at the end of
    // applySessionEntryByOrdinal/ByContent). createAndOrNode/
    // syncBookmarksFilterNode both unshift, so exact order isn't guaranteed
    // — find nodes by value/filterType instead.
    assert(f.children.length === 5, "tier1: all three top-level filters applied, plus the re-derived auto 'Bookmarks'/'Notes' nodes");
    const childNodes = f.children.map(id => T.state.nodes[id]);
    assert(childNodes.some(n => n.filterType === "bookmarks"), "tier1: auto 'Bookmarks' node re-created from the imported bookmarks");
    assert(childNodes.some(n => n.filterType === "notes"), "tier1: auto 'Notes' node re-created from the imported notes");
    const r1 = childNodes.find(n => n.filterType === "text" && n.value === "message 1");
    const r2 = childNodes.find(n => n.filterType === "text" && n.value === "ERROR");
    assert(r1 && r2 && r2.highlightColor === "#ff0000",
      "tier1: filter values + highlight colour round-trip");
    const combo = childNodes.find(n => n.filterType === "and");
    assert(combo && combo.baked[0] && combo.baked[0].value === "message 1" && combo.baked[1] && combo.baked[1].value === "ERROR",
      "tier1: AND node's bakedA/bakedB round-tripped as plain data");
    assert(w.getEntries(combo.id).length === 2, "tier1: AND node re-evaluates correctly (msgs 10,15)");
    assert(T.state.bookmarks.size === 2 && T.state.bookmarks.has(f.entries[5].id),
      "tier1: bookmarks attach by ordinal");
    assert(T.state.notes.size === 1 && T.state.notes.get(f.entries[5].id) === "check this",
      "tier1: notes attach by ordinal, separately from bookmarks");
    assert(T.state.levelFilter.has("ERROR") && T.state.sortColumn === "level" && T.state.sortDir === "desc",
      "tier1: session-wide settings applied");
    assert(T.state.activeId === combo.id, "tier1: active node restored via exportId + ref");
    assert(d.querySelector("#copyToast").textContent.includes("1 file matched automatically")
      && d.querySelector("#copyToast").textContent.includes("2 of 2 bookmarks placed")
      && d.querySelector("#copyToast").textContent.includes("1 of 1 note placed"),
      "tier1: summary toast reports files + bookmark + note placement");
  });

  // --- Tier 2: receiving copy of the tailed log kept growing ---
  await withApp(async (w, d, T) => {
    const grownText = baseText + makeLog(30, 5); // 5 entries appended after the exported window
    const f = await w.addFile("grown.log", grownText, () => {});
    w.render();
    const m = w.matchExportedFile(JSON.parse(exportedJson).files[0], [f.id]);
    assert(m.matchId === f.id && m.tier === 2,
      "tier2: match is confirmed by the window fingerprint, NOT the (differing) full hash");
    w.importSessionJson(exportedJson);
    await sleep(80);
    assert(d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "tier2: grown file auto-matches via the overlapping time window");
    assert(f.children.length === 5, "tier2: filters applied to the grown file, plus the auto 'Bookmarks'/'Notes' nodes");
    assert(T.state.bookmarks.has(f.entries[5].id) && f.entries[5].raw === savedRaw5,
      "tier2: ordinal-based bookmark lands on the identical in-window entry");
  });

  // --- Tier 2 rejection -> tier 3 manual pick + bookmark content fallback ---
  await withApp(async (w, d, T) => {
    // Same time span, but entry 15 removed: window entry count 29 != 30 must
    // demote the match to the manual dialog instead of silently applying.
    const lines = baseText.trimEnd().split("\n");
    lines.splice(15, 1);
    const f = await w.addFile("worker-old.log", lines.join("\n") + "\n", () => {});
    w.render();
    w.importSessionJson(exportedJson);
    await sleep(80);
    assert(!d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "tier3: density mismatch inside the window falls through to the manual dialog");
    assert(d.querySelector("#sessionMatchMeta").innerHTML.includes("worker-3.log"),
      "tier3: dialog shows the export entry's own metadata");
    assert(d.querySelector("#sessionMatchOptions").innerHTML.includes("possible match"),
      "tier3: the near-miss candidate is badged as possible match");
    const radio = d.querySelector('input[name="sessionMatchTarget"][value="file:' + f.id + '"]');
    assert(!!radio, "tier3: the loaded file is offered as a target");
    radio.checked = true;
    fireClick(d.querySelector("#sessionMatchApply"), w);
    await sleep(80);
    assert(f.children.length === 5, "tier3: filters applied to the manually picked file, plus the auto 'Bookmarks'/'Notes' nodes");
    assert(T.state.bookmarks.size === 1, "tier3: only the still-present bookmarked line resolves");
    const [bid] = [...T.state.bookmarks.keys()];
    assert(T.entryIndex[bid].raw === savedRaw5,
      "tier3: bookmark re-anchored via ts + raw fingerprint, not the stale ordinal");
    assert(T.state.notes.size === 1 && T.state.notes.get(bid) === "check this",
      "tier3: note re-anchored the same way, landing on the same surviving entry");
    assert(d.querySelector("#copyToast").textContent.includes("1 resolved manually")
      && d.querySelector("#copyToast").textContent.includes("1 of 2 bookmarks placed"),
      "tier3: summary toast reports manual resolution + partial bookmark placement");
  });

  // --- Version guard: newer file refuses to import, nothing applied ---
  await withApp(async (w, d, T) => {
    const f = await w.addFile("any.log", baseText, () => {});
    w.render();
    const doc = JSON.parse(exportedJson);
    doc.version = 99;
    w.importSessionJson(JSON.stringify(doc));
    await sleep(80);
    assert(d.querySelector("#copyToast").textContent.includes("newer version"),
      "version guard: future version refused with a toast");
    assert(f.children.length === 0 && T.state.bookmarks.size === 0,
      "version guard: nothing partially applied");
  });

  // --- Embedded log: import into an empty session materializes the file ---
  await withApp(async (w, d, T) => {
    w.importSessionJson(exportedEmbeddedJson);
    await sleep(80);
    assert(!d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "embedded: no candidates -> manual dialog");
    const radio = d.querySelector('input[name="sessionMatchTarget"][value="embedded"]');
    assert(!!radio && radio.closest("label").textContent.includes("Load the embedded log"),
      "embedded: dialog offers loading the embedded log (only when text is present)");
    radio.checked = true;
    fireClick(d.querySelector("#sessionMatchApply"), w);
    // addFile parses async; the auto "Bookmarks"/"Notes" nodes added this
    // session mean there's slightly more synchronous work queued after the
    // parse than the old fixed sleep(120) reliably outlasted — wait on the
    // actual condition instead of a longer guess (see tests/README.md
    // "never poll a proxy condition", applied here via the file's own entry
    // count rather than a bespoke promise).
    await waitFor(() => T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].entries.length > 0);
    assert(T.state.rootIds.length === 1, "embedded: file materialized from the export");
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.name === "worker-3.log" && f.entries.length === 30,
      "embedded: name + entry count round-trip through the embedded text");
    assert(f.children.length === 5 && T.state.bookmarks.has(f.entries[5].id),
      "embedded: filters + ordinal bookmarks applied to the materialized file, plus the auto 'Bookmarks'/'Notes' nodes");
    const combo = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "and");
    assert(combo && T.state.activeId === combo.id, "embedded: active filter (the AND combiner) restored");
  });

  // --- Plain export sanity: a non-session JSON is rejected ---
  await withApp(async (w, d, T) => {
    await w.addFile("x.log", makeLog(0, 3), () => {});
    w.importSessionJson(JSON.stringify({ format: "philogg-filters", roots: [] }));
    await sleep(40);
    assert(d.querySelector("#copyToast").textContent.includes("Not a PhiLogg session file"),
      "guard: filter-branch JSON is rejected as a session file");
  });
}
