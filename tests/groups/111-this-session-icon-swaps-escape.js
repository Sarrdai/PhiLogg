// GROUP 111 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 111 — This session: icon swaps, Escape closes Settings, file-
   selection thrash bugfix on session restore, "On open, scroll log to"
   setting, UI scale / Log text size split, UI font family setting.
   ============================================================ */
group(111);
await withApp(async (w, d, T) => {
  section("111a. Settings icon + pin icon identity, Escape closes the Settings dialog");

  // Gear/cog icon on #btnSettings (was a sun icon) — identity check via the
  // shape's own distinctive marker (a <circle> "hub" plus radiating <path>
  // spokes), not a byte-for-byte string match that would be brittle to
  // harmless attribute reordering.
  const settingsSvg = d.querySelector("#btnSettings svg");
  assert(settingsSvg && settingsSvg.querySelector("circle") && settingsSvg.querySelectorAll("path").length >= 1,
    "#btnSettings renders an svg icon with a circle+path shape (the gear)");

  // ICON_PIN (shared by #btnPinBookmarks, the sidebar peek toggle, and the
  // detail-panel peek toggle) is now a thumbtack (circle head + straight
  // needle path), not the old teardrop map-pin outline.
  const pinBtn = d.querySelector(".toggle-pin");
  const pinSvg = pinBtn.querySelector("svg");
  assert(pinSvg.innerHTML.includes('href="#i-pin"'), "#btnPinBookmarks (ICON_PIN) references the pin sprite symbol");
  const pinSym = d.querySelector("#i-pin");
  assert(pinSym && pinSym.querySelector("circle") && pinSym.querySelector("path"),
    "the pin symbol is a circle+path thumbtack shape");
  assert(!pinSym.innerHTML.includes("c-2.4 0-4.3"), "the old teardrop map-pin path is gone from the pin symbol");

  assert(d.querySelector("#settingsDialog").classList.contains("hidden"), "settings dialog starts hidden");
  fireClick(d.querySelector("#btnSettings"), w);
  assert(!d.querySelector("#settingsDialog").classList.contains("hidden"), "clicking the toolbar button opens the settings dialog");
  fireKeydown(d, w, "Escape");
  assert(d.querySelector("#settingsDialog").classList.contains("hidden"), "Escape closes the settings dialog, same as the other popups");
});

await withApp(async (w, d, T) => {
  section("111b. Bugfix: session restore no longer thrashes state.activeId (file-selection clarity)");

  const factory = new (require("fake-indexeddb").IDBFactory)();
  // Build+persist THREE files with the FIRST one active (not the last) —
  // the thrash bug (createFileNode unconditionally setting state.activeId
  // on every restored file) would have left activeId on the LAST restored
  // file, or visibly bounced through all three, before restoreSessionFromCache's
  // own correction. Verified against a real withApp instance below.
  await withApp(async (w2, d2, T2) => {
    const f1 = await w2.addFile("a.log", makeLog(0, 5), () => {});
    const f2 = await w2.addFile("b.log", makeLog(0, 5), () => {});
    const f3 = await w2.addFile("c.log", makeLog(0, 5), () => {});
    T2.state.activeId = f1.id;
    w2.render();
    await w2.persistFileNode(f1);
    await w2.persistFileNode(f2);
    await w2.persistFileNode(f3);
    await w2.persistMetaNow();
  }, { indexedDB: factory });

  await withApp(async (w2, d2, T2) => {
    const activeIdsSeenDuringRestore = [];
    const origRender = w2.render;
    w2.render = function () { activeIdsSeenDuringRestore.push(T2.state.activeId); return origRender.apply(this, arguments); };
    await T2.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    await sleep(150);

    assert(T2.state.rootIds.length === 3, "sanity: all three files came back via boot-time restore");
    const aNode = T2.state.rootIds.map(id => T2.state.nodes[id]).find(n => n.name === "a.log");
    assert(T2.state.activeId === aNode.id, "restore: activeId ends on the PERSISTED active file (a.log, the first one), not the last-loaded one");

    // No thrash: every render() call fired WHILE files were still being
    // restored (i.e. every one before the final result) must NOT have shown
    // some other, wrong file as active — createFileNode no longer sets
    // state.activeId at all during a restore, so those renders see it still
    // null/unset instead of bouncing through a1/b1/c1's ids in turn.
    const finalActiveId = activeIdsSeenDuringRestore[activeIdsSeenDuringRestore.length - 1];
    assert(finalActiveId === aNode.id, "the LAST render (post-restore) carries the correct final activeId");
    const midRestoreValues = activeIdsSeenDuringRestore.slice(0, -1);
    assert(midRestoreValues.every(v => v == null),
      "no render DURING the restore loop ever showed a wrong file as active (no thrash) — got: " + JSON.stringify(midRestoreValues));

    // Exactly one .tree-row ever carries .active in the resulting DOM.
    const activeRows = [...d2.querySelectorAll(".tree-row")].filter(r => r.classList.contains("active"));
    assert(activeRows.length === 1, "exactly one tree row is marked active after restore, got " + activeRows.length);
    assert(activeRows[0].querySelector(".tree-label").textContent === "a.log", "...and it's the correct (persisted-active) file's row");
  }, { indexedDB: factory });
});

await withApp(async (w, d, T) => {
  section("111c. Bugfix: session restore falls back to the first file when no active node was persisted");

  const factory = new (require("fake-indexeddb").IDBFactory)();
  await withApp(async (w2, d2, T2) => {
    const f1 = await w2.addFile("only.log", makeLog(0, 3), () => {});
    await w2.persistFileNode(f1);
    // buildCacheMeta only records an active node while state.activeId is
    // set — clearing it first persists a meta record with active:null,
    // simulating a stale/missing record without hand-building the shape.
    T2.state.activeId = null;
    await w2.persistFileNode(f1);
    await w2.persistMetaNow();
  }, { indexedDB: factory });

  await withApp(async (w2, d2, T2) => {
    await T2.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    await sleep(100);
    assert(T2.state.rootIds.length === 1, "sanity: the one file restored");
    assert(T2.state.activeId === T2.state.rootIds[0], "no persisted active node: falls back to the first (only) restored file instead of staying null");
  }, { indexedDB: factory });
});

await withApp(async (w, d, T) => {
  section("111d. Settings: \"On open, scroll log to\" (Start / End)");

  const select = d.querySelector("#settingsOpenScrollPosition");
  assert(select, "the new select exists in Settings -> Behavior");
  assert(select.value === "start", "default is \"Start\" — unchanged existing behavior");

  // jsdom has no real layout engine, so scrollHeight isn't naturally
  // non-zero — stub it directly, same pattern as Group 97.
  const tableBody0 = d.querySelector("#tableBody");
  Object.defineProperty(tableBody0, "scrollHeight", { value: 3000, configurable: true });

  // Default (Start): a freshly opened file's table scroll stays at 0.
  // addFile() itself creates+activates the node and drives every render, so
  // NOT re-setting state.activeId/calling render() again afterward here —
  // a redundant extra render would run the ordinary scroll-anchor "keep
  // reading position" logic against the just-opened file's own (unchanged)
  // entries and shift the scroll away from where the real open-time logic
  // already put it, defeating the very thing under test.
  const fStart = await w.addFile("start.log", makeLog(0, 60), () => {});
  assert(T.state.activeId === fStart.id, "sanity: addFile activates the newly opened file");
  assert(d.querySelector("#tableBody").scrollTop === 0, "default \"Start\": table scroll stays at 0 after opening a file");

  // Switch to "End".
  select.value = "end";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.localStorage.getItem("philogg-open-scroll-position") === "end", "\"End\" persists to localStorage");

  const fEnd = await w.addFile("end.log", makeLog(0, 60), () => {});
  const tableBody = d.querySelector("#tableBody");
  assert(tableBody.scrollTop > 0 && tableBody.scrollTop === tableBody.scrollHeight,
    "\"End\": table scroll jumps to the bottom right after opening a file");
  // tailFollow defaults true and is untouched by this — "Tailing begins
  // immediately from there" per the setting's own hint.
  assert(T.state.tailFollow === true, "tailFollow stays on (default) so tailing would continue from the bottom");

  // One-shot: the flag is consumed by the very first render that had
  // entries to scroll through, so a LATER re-render of the same file (e.g.
  // switching away and back) must not re-trigger the jump-to-end.
  const fOther = await w.addFile("other.log", makeLog(0, 5), () => {});
  assert(T.state.activeId === fOther.id, "sanity: addFile activates fOther");
  tableBody.scrollTop = 0; // simulate having scrolled/reset away from the bottom
  T.state.activeId = fEnd.id;
  T.state.tempAnchor = null;
  w.render();
  assert(tableBody.scrollTop === 0, "switching back to an already-opened file does not re-trigger scroll-to-end (one-shot flag already consumed)");

  select.value = "start";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
});

await withApp(async (w, d, T) => {
  section("111e. Font size split: UI scale (zoom) and Log text size (--log-text-scale) are independent");

  const uiDown = d.querySelector("#fontScaleDown");
  const uiValue = d.querySelector("#fontScaleValue");
  const logDown = d.querySelector("#logTextScaleDown");
  const logUp = d.querySelector("#logTextScaleUp");
  const logValue = d.querySelector("#logTextScaleValue");
  assert(uiDown && logDown && logUp, "both UI scale and Log text size steppers exist in Settings -> Appearance");
  assert(uiValue.textContent === "100%" && logValue.textContent === "100%", "both default to 100%");
  assert(w.document.documentElement.style.getPropertyValue("--log-text-scale") === "1", "--log-text-scale starts at 1 (no extra log-text scaling on top of UI scale, by default)");

  // Changing Log text size does NOT touch the whole-UI zoom.
  const zoomBefore = w.document.documentElement.style.zoom;
  fireClick(logUp, w);
  assert(logValue.textContent === "110%", "Log text size stepper moves independently");
  assert(w.document.documentElement.style.getPropertyValue("--log-text-scale") === "1.1", "--log-text-scale updated to 1.1");
  assert(w.document.documentElement.style.zoom === zoomBefore, "UI scale (zoom) is untouched by changing Log text size");
  assert(w.localStorage.getItem("philogg-log-text-scale") === "110", "Log text size persists under its own, separate localStorage key");

  // Changing UI scale does NOT touch --log-text-scale.
  const logVarBefore = w.document.documentElement.style.getPropertyValue("--log-text-scale");
  fireClick(uiDown, w);
  assert(uiValue.textContent === "90%", "UI scale stepper moves independently");
  assert(w.document.documentElement.style.getPropertyValue("--log-text-scale") === logVarBefore, "--log-text-scale is untouched by changing UI scale");
  assert(w.localStorage.getItem("philogg-font-scale") === "90", "UI scale persists under the original \"philogg-font-scale\" key (no migration needed)");

  // Reset both back to default.
  fireClick(d.querySelector("#fontScaleReset"), w);
  fireClick(d.querySelector("#logTextScaleReset"), w);
  assert(uiValue.textContent === "100%" && logValue.textContent === "100%", "both reset independently back to 100%");
});

await withApp(async (w, d, T) => {
  section("111f. Settings: UI font family (system stacks only, no web fonts)");

  const select = d.querySelector("#settingsUiFontSelect");
  assert(select, "the UI font select exists in Settings -> Appearance");
  assert(select.options.length >= 2, "offers a curated list of more than one font option");
  assert(select.value === "default", "defaults to the system-default stack");
  assert(w.document.documentElement.style.getPropertyValue("--font-ui").includes("-apple-system"),
    "default option reproduces the original --font-ui stack (no visual change until touched)");
  // No @font-face / remote font loading anywhere among the options — every
  // stack must be plain comma-separated system font names.
  [...select.options].forEach(opt => {
    assert(!/http|@font-face|url\(/i.test(opt.value), "font option \"" + opt.value + "\" fetches nothing external");
  });

  select.value = "mono";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.document.documentElement.style.getPropertyValue("--font-ui") === "var(--font-mono)", "selecting \"Monospace\" applies the monospace stack via --font-ui");
  assert(w.localStorage.getItem("philogg-ui-font") === "mono", "selection persists to localStorage");

  select.value = "default";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
});
