// GROUP 211 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 211 — Word wrap in the views (FEATURE_BACKLOG.md #68)
   Origin: this session (2026-09-14). Two independent, session-cache-persisted
   toggles: one in the log-view toolbars (state.wrapMessages, also governs the
   Entry Detail message), one in the Text-View toolbar (state.wrapTextView).
   Both DISTINCT from the multiline toggle (multiline = literal "\n" breaks;
   wrap = soft-wrapping a single long line). See docs/ui-and-views.md and
   docs/persistence-and-sync.md.
   ============================================================ */
group(211);
await withApp(async (w, d, T) => {
  section("211a. Log-view word-wrap toggle: flips state + body class, wraps long rows, independent of multiline, persists");
  // Long single-line messages so a wrapped row is measurably taller than one
  // ROW_HEIGHT (jsdom stubs clientWidth to 800; measureMsgWidth falls back to
  // the monospace char-width constant, so wrapColsForBody yields a real count).
  const fa = await w.addFile("a.log", makeLog(0, 6, { suffix: () => "y".repeat(240) }), () => {});
  T.state.activeId = fa.id;
  // The default fixed columns total wider than withApp's stubbed 800px body,
  // leaving no message track; give #tableBody a realistically wide viewport so
  // wrapColsForBody yields a positive character capacity (real browsers are).
  Object.defineProperty(d.querySelector("#tableBody"), "clientWidth", { value: 2000, configurable: true });
  w.render();

  const btnWrap = d.querySelector("#filteredToolbar .toggle-wrap");
  const btnWrapCtx = d.querySelector("#contextToolbar .toggle-wrap");
  assert(btnWrap && btnWrapCtx, "a word-wrap toggle exists in BOTH log toolbars (Filtered + Context)");
  assert(!T.state.wrapMessages, "wrapMessages off by default");
  assert(!btnWrap.classList.contains("active"), "log word-wrap button starts inactive");
  assert(!d.body.classList.contains("wrap-messages"), "no .wrap-messages body class by default");

  fireClick(btnWrap, w);
  assert(T.state.wrapMessages === true, "click flips state.wrapMessages on");
  assert(d.body.classList.contains("wrap-messages"), "body gains .wrap-messages");
  assert(btnWrap.classList.contains("active") && btnWrapCtx.classList.contains("active"), "both toolbars' wrap buttons show active (shared .toggle-wrap)");
  assert(w.needsRowOffsets() === true, "wrap forces the variable-height offsets virtualization path");

  w.render();
  const longRow = d.querySelector('#tableRows [data-entry-id="' + fa.entries[0].id + '"]');
  assert(longRow, "the long-message row is rendered");
  assert(parseInt(longRow.style.height, 10) > T.ROW_HEIGHT,
    "with wrap on the long-message row is taller than a single ROW_HEIGHT (soft-wrapped to several lines), got " + longRow.style.height);

  // Independent of the multiline toggle — both can be on at once.
  const btnMulti = d.querySelector("#filteredToolbar .toggle-multiline");
  fireClick(btnMulti, w);
  assert(T.state.wrapMessages === true && T.state.multilineMessages === true, "wrap and multiline are independently on");
  assert(d.body.classList.contains("wrap-messages") && d.body.classList.contains("multiline-messages"), "both body classes present together");
  fireClick(btnWrap, w);
  assert(T.state.wrapMessages === false && T.state.multilineMessages === true, "turning wrap off leaves multiline untouched (independent flags)");
  fireClick(btnMulti, w); // back to a clean baseline

  w.render();
  const shortAgain = d.querySelector('#tableRows [data-entry-id="' + fa.entries[0].id + '"]');
  assert(parseInt(shortAgain.style.height, 10) === T.ROW_HEIGHT, "with wrap (and multiline) off the row is back to one ROW_HEIGHT, got " + shortAgain.style.height);

  // Session-cache round-trip of BOTH flags (same tier as multilineMessages).
  T.state.wrapMessages = true;
  T.state.wrapTextView = true;
  w.updateWrapMsgButton();
  w.updateWrapTextViewButton();
  await w.persistMetaNow();
  const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
  assert(meta && meta.settings.wrapMessages === true, "cache: wrapMessages written to meta.settings");
  assert(meta && meta.settings.wrapTextView === true, "cache: wrapTextView written to meta.settings");
}, { indexedDB: new IDBFactory() });
