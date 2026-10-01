// GROUP 76 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 76 — Settings: "Closing the last log file quits the app"
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md item, default off.
   Purely a local app-behavior preference (localStorage, like the theme
   toggle), meaningful mainly under the desktop wrapper — a bare
   window.close() is enough there since the wrapper routes the page's own
   window.close() into a real window close (see docs/desktop.md);
   in an ordinary browser tab it's a no-op. window.close
   is stubbed here (and restored afterwards) rather than actually invoked,
   since a real jsdom window.close() would tear the test window down mid-run.
   ============================================================ */
group(76);
await withApp(async (w, d, T) => {
  section("76. Settings: \"Closing the last log file quits the app\" (default off)");

  w.philogg = {}; // desktop build: Ctrl+W is the closeFile default (browser build: Alt+W, GROUP 323)
  const checkbox = d.getElementById("settingsQuitOnLastClose");
  assert(pillChecked(checkbox) === false, "off by default");

  const originalClose = w.close;
  let closeCalls = 0;
  w.close = () => { closeCalls++; };
  try {
    const f = await w.addFile("a.log", makeLog(0, 3), () => {});
    T.state.activeId = f.id;
    w.render();

    fireKeydown(d, w, "w", { ctrlKey: true });
    assert(closeCalls === 0, "closing the last file does nothing extra while the setting is off");
    assert(w.localStorage.getItem("philogg-quit-on-last-close") === null, "nothing persisted yet — setting untouched");

    fireClick(checkbox, w);
    assert(w.localStorage.getItem("philogg-quit-on-last-close") === "1", "enabling the toggle persists it");

    const f2 = await w.addFile("b.log", makeLog(0, 3), () => {});
    const other = await w.addFile("c.log", makeLog(0, 3), () => {});
    T.state.activeId = f2.id;
    w.render();

    fireKeydown(d, w, "w", { ctrlKey: true });
    assert(closeCalls === 0, "closing one of two open files doesn't quit — one file (\"c.log\") still remains");
    assert(T.state.rootIds.length === 1, "sanity: one file remains");

    T.state.activeId = other.id;
    w.render();
    fireKeydown(d, w, "w", { ctrlKey: true });
    assert(closeCalls === 1, "closing the very last open file quits the app when the setting is on");
  } finally {
    w.close = originalClose;
  }
});
