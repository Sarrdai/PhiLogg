// GROUP 193 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 193 — Filter library: Toolbar presets (pin + icon)
   Origin: this session, person-requested. The filter library gained a
   Filter-Toolbar section: a preset flagged showInToolbar renders as a
   circle-pill .row-action-btn in the "Library Filter" group (#libraryPresetBar),
   clicking it applies the preset onto the active node. Each preset can be
   assigned an icon (LIBRARY_ICON_SET) shown in its pill, falling back to
   ICON_FILTER when unset. Pin + icon are library-RECORD fields
   (showInToolbar/icon), not filter-node fields, so no persistence carrier
   threading is involved. The manage dialog gained the pin toggle (a
   .settings-switch pill) and an inline icon grid per row.
   Icon grid extended (this session, person-requested): a LIBRARY_EMOJI_SET
   section (native Unicode, no image assets — same rendering in-browser and
   under the Tauri desktop wrapper, both just OS webviews) alongside the
   original SVG set, plus a free-text fallback input for any emoji outside
   the curated list. icon is tagged "emoji:<char>" vs. a bare/"svg:"-prefixed
   SVG-set name; legacy bare names still resolve (backward compat).
   UPDATED, same-day later session: the management buttons (Add to Library /
   Library) that used to live in a separate right-aligned #libraryManageBar
   group alongside #libraryPresetBar are REMOVED from #viewBar entirely —
   relocated into the Files & Filters sidebar toolbar (see GROUP 220/221).
   193a's assertions about #libraryManageBar/#btnAddToLibrary/#btnOpenLibrary
   are removed accordingly; #libraryPresetBar's own pinned-presets behavior
   (everything else in this group) is unaffected and still passes unchanged.
   ============================================================ */
group(193);
await withApp(async (w, d, T) => {
  section("193a. Pinned preset renders as a toolbar pill; clicking it applies onto the active node");

  const fa = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const textNode = w.createFilterNode(fa.id, "text", "message 1");
  T.state.activeId = textNode.id;
  w.render();

  // Save a preset directly (the save flow itself is covered by 59a).
  const savePromise = w.saveFilterToLibrary(textNode.id, "toolbar preset");
  await new Promise(r => setTimeout(r, 0));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await savePromise;
  await waitFor(async () => (await w.listFilterLibrary()).length === 1);

  // Unpinned by default → no pill yet.
  await w.renderLibraryToolbarPresets();
  assert(d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 0,
    "an unpinned preset produces no toolbar pill");

  // Pin it via the manage dialog's toggle.
  await w.openFilterLibraryDialog(fa.id);
  await waitFor(() => !!d.querySelector("#filterLibraryList .lib-star"));
  fireClick(d.querySelector("#filterLibraryList .lib-star"), w); // star = pin to the toolbar

  await waitFor(() => d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 1);
  const pill = d.querySelector("#libraryPresetBar .row-action-btn[data-lib-key]");
  assert(pill, "pinning the preset adds a pill to #libraryPresetBar");
  assert(pill.querySelector(".row-action-label .hint-name").textContent === "toolbar preset", "the pill carries the preset name as its label");
  T.state.activeId = textNode.id; T.state.multiSelect = new Set();
  pill.dispatchEvent(new w.MouseEvent("mouseenter"));
  assert(pill.title === "Apply toolbar preset to " + w.nodeDisplayName(textNode), "pill tooltip names the preset and the target, got " + pill.title);
  // No icon assigned yet → ICON_FILTER fallback (the sprite's funnel).
  assert(pill.querySelector(".row-action-hit").innerHTML.includes("#i-filter"), "with no icon assigned the pill shows the ICON_FILTER fallback");
  // Pills live in the "Library Filter" group (#libraryPresetBar) — the old
  // management buttons that used to sit alongside it in #libraryManageBar
  // are gone from #viewBar entirely (see GROUP 220/221's own regression
  // guard for their absence).
  assert(!d.querySelector("#libraryPresetBar").hidden, "the Library Filter group is shown while a preset is pinned");

  // Close dialog, switch active node to a fresh file, click the pill → the
  // preset applies onto the active node (same mechanism as dialog "Apply").
  w.closeFilterLibraryDialog();
  const fb = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "message" }), () => {});
  T.state.activeId = fb.id;
  w.render();
  const before = fb.children.length;
  fireClick(d.querySelector("#libraryPresetBar .row-action-btn[data-lib-key]"), w);
  assert(fb.children.length === before + 1, "clicking the pill applies the preset onto the active node (a fresh filter is created under it)");
  const appliedNode = T.state.nodes[fb.children[fb.children.length - 1]];
  assert(appliedNode.filterType === "text" && appliedNode.value === "message 1", "the applied node carries the preset's filter definition, re-evaluated against the active file");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("193b. Assigning an icon updates the pill; unpinning removes it");

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const node = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = node.id;
  w.render();
  const savePromise = w.saveFilterToLibrary(node.id, "with icon");
  await new Promise(r => setTimeout(r, 0));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await savePromise;
  await waitFor(async () => (await w.listFilterLibrary()).length === 1);
  const key = (await w.listFilterLibrary())[0].key;

  // Pin + assign the "clock" icon via updateFilterLibraryEntry (the same
  // mutator the dialog's toggle/grid call).
  await w.updateFilterLibraryEntry(key, { showInToolbar: true, icon: "clock" });
  await waitFor(() => d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 1);
  const pill = d.querySelector("#libraryPresetBar .row-action-btn[data-lib-key]");
  assert(pill.querySelector(".row-action-hit").innerHTML.includes("#i-clock"), "the pill shows the assigned 'clock' icon, not the funnel fallback");

  // The icon field actually persisted on the record.
  const rec = (await w.listFilterLibrary())[0];
  assert(rec.icon === "clock" && rec.showInToolbar === true, "icon + pin persisted on the library record");

  // Open the manage dialog: the leading icon button reflects the choice, and
  // clicking it opens the inline icon grid.
  await w.openFilterLibraryDialog(f.id);
  await waitFor(() => !!d.querySelector("#filterLibraryList .filter-library-row-icon"));
  fireClick(d.querySelector("#filterLibraryList .filter-library-row-icon"), w);
  await waitFor(() => !!d.querySelector("#filterLibraryList .filter-library-icon-grid"));
  // 12 = current LIBRARY_ICON_SET size (curated subset of ICON_*, extended later).
  assert(d.querySelectorAll("#filterLibraryList .filter-library-icon-grid button:not(.filter-library-icon-emoji)").length === 12,
    "the inline icon grid offers one SVG button per LIBRARY_ICON_SET entry (12 today)");
  // 40 = current LIBRARY_EMOJI_SET size (native-Unicode alternative, no assets).
  assert(d.querySelectorAll("#filterLibraryList .filter-library-icon-grid button.filter-library-icon-emoji").length === 40,
    "the inline icon grid also offers one emoji button per LIBRARY_EMOJI_SET entry (40 today)");

  // Picking an emoji tags the record as "emoji:<char>" and renders it as text
  // (not SVG markup) on both the row's leading icon button and the pill.
  const emojiBtn = d.querySelector("#filterLibraryList .filter-library-icon-grid button.filter-library-icon-emoji");
  const chosenEmoji = emojiBtn.textContent;
  fireClick(emojiBtn, w);
  await waitFor(async () => (await w.listFilterLibrary())[0].icon === "emoji:" + chosenEmoji);
  const recAfterEmoji = (await w.listFilterLibrary())[0];
  assert(recAfterEmoji.icon === "emoji:" + chosenEmoji, "clicking an emoji button persists icon as \"emoji:<char>\"");
  await waitFor(() => {
    const p = d.querySelector("#libraryPresetBar .row-action-btn[data-lib-key]");
    return !!p && p.querySelector(".row-action-hit").textContent === chosenEmoji;
  });
  const pillAfterEmoji = d.querySelector("#libraryPresetBar .row-action-btn[data-lib-key]");
  assert(pillAfterEmoji.querySelector(".row-action-hit").classList.contains("filter-library-icon-emoji"),
    "the pill renders an emoji icon via plain text, tagged with .filter-library-icon-emoji, not SVG markup");
  // The dialog row re-renders on its own IndexedDB read, after the pill's.
  assert(await waitFor(() => !d.querySelector("#filterLibraryList .filter-library-row-icon").innerHTML.includes("<svg")),
    "the row's leading icon button also switches to plain emoji text, dropping the SVG markup");

  // A legacy bare-name icon (pre-existing records, no "svg:"/"emoji:" prefix)
  // still resolves through the same picker/pill machinery (backward compat).
  await w.updateFilterLibraryEntry(key, { icon: "clock" });
  await waitFor(async () => (await w.listFilterLibrary())[0].icon === "clock");
  await waitFor(() => {
    const p = d.querySelector("#libraryPresetBar .row-action-btn[data-lib-key]");
    return !!p && p.querySelector(".row-action-hit").innerHTML.includes("<circle");
  });

  // Free-text fallback: typing a single emoji applies it; multi-character
  // input is rejected (icon left unchanged).
  fireClick(d.querySelector("#filterLibraryList .filter-library-row-icon"), w);
  await waitFor(() => !!d.querySelector("#filterLibraryList .filter-library-icon-freeinput"));
  const freeInput = d.querySelector("#filterLibraryList .filter-library-icon-freeinput");
  freeInput.value = "🍕";
  freeInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  await waitFor(async () => (await w.listFilterLibrary())[0].icon === "emoji:🍕");
  assert((await w.listFilterLibrary())[0].icon === "emoji:🍕", "the free-text input accepts a single emoji not in the curated grid");

  fireClick(d.querySelector("#filterLibraryList .filter-library-row-icon"), w);
  await waitFor(() => !!d.querySelector("#filterLibraryList .filter-library-icon-freeinput"));
  const freeInput2 = d.querySelector("#filterLibraryList .filter-library-icon-freeinput");
  freeInput2.value = "abc";
  freeInput2.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert((await w.listFilterLibrary())[0].icon === "emoji:🍕", "multi-character free-text input is rejected; the icon stays unchanged");

  w.closeFilterLibraryDialog();

  // Unpin → pill disappears.
  await w.updateFilterLibraryEntry(key, { showInToolbar: false });
  await waitFor(() => d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 0);
  assert(d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 0, "unpinning removes the toolbar pill");
  assert(d.querySelector("#libraryPresetBar").hidden && !d.querySelector("#libraryPresetSep").hidden,
    "the pill group collapses when nothing is pinned, the separator stays (the Library ▾ button always follows it)");
}, { indexedDB: new IDBFactory() });
