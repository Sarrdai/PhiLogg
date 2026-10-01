// GROUP 114 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 114 — Shortcut Manager in Settings (FEATURE_BACKLOG.md #48)
   Origin: this session. Replaces the old standalone #shortcutsPanel popup
   (GROUP 26) with a dedicated "Shortcuts" section inside Settings: a
   rebindable-actions table (matchesShortcut(ev, actionId) looks up
   localStorage-backed overrides instead of a hardcoded key check).
   Updated (FEATURE_BACKLOG.md #55): the old usage-instruction prose above
   the table and the separate "fixed reference" text block below it are
   gone. Fixed (non-rebindable) shortcuts are now appended as extra,
   greyed-out rows (.shortcut-row-fixed, no rebind/reset controls) inside
   the SAME #shortcutBindingsList, so the list still reads as complete.
   ============================================================ */
group(114);
await withApp(async (w, d, T) => {
  section("114a. Settings' Shortcuts section: rebindable rows + greyed-out fixed rows, no prose");

  assert(d.querySelector("#settingsDialog").classList.contains("hidden"), "sanity: Settings starts closed");
  w.openSettingsDialog();
  assert(!d.querySelector("#settingsDialog").classList.contains("hidden"), "openSettingsDialog opens Settings");
  assert(d.querySelector("#settingsSectionShortcuts"), "a dedicated Shortcuts section exists in Settings");
  assert(!d.querySelector("#settingsSectionShortcuts .settings-section-desc"), "the usage-instruction prose under the section title is gone");
  const rebindableRows = d.querySelectorAll("#shortcutBindingsList > div[data-action-id]");
  // Compared against the live SHORTCUT_ACTIONS length (a top-level const,
  // reachable via global eval) rather than a hardcoded number, so adding a
  // rebindable action (e.g. exportView, GROUP 283) doesn't need this edited.
  assert(rebindableRows.length === w.eval("SHORTCUT_ACTIONS.length") && rebindableRows.length >= 20, "the rebindable-actions rows render one per registered action");
  const fixedRows = d.querySelectorAll("#shortcutBindingsList > div.shortcut-row-fixed");
  assert(fixedRows.length > 0, "fixed (non-rebindable) shortcuts are listed too, so the list stays complete");
  fixedRows.forEach(row => {
    assert(!row.querySelector(".shortcut-rebind-btn") && !row.querySelector(".shortcut-reset-btn"),
      "a fixed row has no Change/Reset controls — it can't be edited or deleted");
  });
  assert(d.querySelector("#shortcutBindingsList").children.length === rebindableRows.length + fixedRows.length,
    "rebindable and fixed rows together make up the whole list");
});

await withApp(async (w, d, T) => {
  section("114b. Rebinding an action changes which key triggers it");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  w.render();
  w.selectEntry(f.entries[1].id);

  // Default: bare "B" bookmarks the selected row.
  fireKeydown(d, w, "b");
  assert(T.state.bookmarks.has(f.entries[1].id), "sanity: default 'B' shortcut still bookmarks");
  w.toggleBookmark(f.entries[1].id); // undo, back to a clean slate

  w.openSettingsDialog();
  // Each render*/rebind step rebuilds #shortcutBindingsList's rows from
  // scratch (renderShortcutBindingsList), so every query below is re-run
  // fresh against the DOM rather than caching a row/button reference across
  // a re-render (which would silently go stale/detached).
  fireClick(d.querySelector("[data-action-id='bookmark'] .shortcut-rebind-btn"), w);
  assert(d.querySelector("[data-action-id='bookmark'] .shortcut-rebind-btn").classList.contains("recording"),
    "the rebind button shows a recording state while listening");
  fireKeydown(d, w, "k");
  assert(w.localStorage.getItem("philogg.shortcutBindings") === JSON.stringify({ bookmark: { ctrl: false, shift: false, alt: false, key: "k" } }),
    "the new combo persists to localStorage under the action's id");
  assert(!d.querySelector("[data-action-id='bookmark'] .shortcut-rebind-btn").classList.contains("recording"),
    "recording ends once a key is captured (row re-rendered)");

  fireKeydown(d, w, "b");
  assert(!T.state.bookmarks.has(f.entries[1].id), "'B' no longer bookmarks after being rebound");
  fireKeydown(d, w, "k");
  assert(T.state.bookmarks.has(f.entries[1].id), "the newly bound 'K' now bookmarks the selected row instead");
});

await withApp(async (w, d, T) => {
  section("114c. Conflict detection, reset-one, and reset-all");

  w.openSettingsDialog();

  // Conflict: try to rebind "toggleDetail" (default Ctrl+J) onto "editFilter"'s (Ctrl+E) combo.
  fireClick(d.querySelector("[data-action-id='toggleDetail'] .shortcut-rebind-btn"), w);
  fireKeydown(d, w, "e", { ctrlKey: true });
  assert(!d.querySelector("#shortcutConflictNote").classList.contains("hidden"), "a conflicting combo shows the conflict note");
  assert(d.querySelector("#shortcutConflictNote").textContent.includes("Edit a filter"), "the conflict note names the action already using that combo");
  assert(w.localStorage.getItem("philogg.shortcutBindings") === null || !JSON.parse(w.localStorage.getItem("philogg.shortcutBindings") || "{}").toggleDetail,
    "the conflicting rebind is rejected — no override is stored for toggleDetail");
  fireKeydown(d, w, "Escape"); // cancel the still-active recording

  // Reset a single rebound action back to its default.
  fireClick(d.querySelector("[data-action-id='bookmark'] .shortcut-rebind-btn"), w);
  fireKeydown(d, w, "k");
  fireClick(d.querySelector("[data-action-id='bookmark'] .shortcut-reset-btn"), w);
  assert(!JSON.parse(w.localStorage.getItem("philogg.shortcutBindings") || "{}").bookmark, "the reset button clears that action's override");

  // Reset-all.
  fireClick(d.querySelector("[data-action-id='closeFile'] .shortcut-rebind-btn"), w);
  fireKeydown(d, w, "q", { ctrlKey: true });
  assert(JSON.parse(w.localStorage.getItem("philogg.shortcutBindings")).closeFile, "sanity: an override is stored before reset-all");
  fireClick(d.querySelector("#btnResetShortcuts"), w);
  assert(JSON.parse(w.localStorage.getItem("philogg.shortcutBindings")) && Object.keys(JSON.parse(w.localStorage.getItem("philogg.shortcutBindings"))).length === 0,
    "\"Reset all to defaults\" clears every override");
});
