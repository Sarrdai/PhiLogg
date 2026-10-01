// GROUP 107 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 107 — Settings: "Close to system tray" (FEATURE_BACKLOG.md #51)
   Origin: this session (2026-08-25). Purely a local app-behavior
   preference (localStorage, like GROUP 76's quit-on-last-close), default
   ON this time (unlike GROUP 76's default off) since that's the requested
   desktop-build default. The wrapper (untestable under jsdom) mirrors this
   same key out of localStorage and consults it when a window close is
   requested; this file only owns persisting the checkbox state.
   ============================================================ */
group(107);
await withApp(async (w, d, T) => {
  section("107. Settings: \"Close to system tray\" (default on)");

  const checkbox = d.getElementById("settingsCloseToTray");
  assert(pillChecked(checkbox) === true, "on by default");
  assert(w.localStorage.getItem("philogg-close-to-tray") === null, "nothing persisted yet — default comes from the null->true fallback, not a stored value");

  fireClick(checkbox, w);
  assert(w.localStorage.getItem("philogg-close-to-tray") === "0", "disabling the toggle persists it");

  fireClick(checkbox, w);
  assert(w.localStorage.getItem("philogg-close-to-tray") === "1", "re-enabling persists back to \"1\"");
});
