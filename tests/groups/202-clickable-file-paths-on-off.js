// GROUP 202 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 202 — Clickable file paths: on/off toggle (.toggle-filepaths),
   and extending the feature to the Full/Context view
   Origin: this session, person-requested. A settings button in both view
   toolbars (#contextToolbar and #filteredToolbar — same shared .toggle-X
   convention every other display toggle already uses) turns linkifyPaths
   on/off, default ON, persisted like every other toggle
   (localStorage["philogg-file-path-links-enabled"]). Since both toolbars
   already offer identical toggles for every other display feature (notes,
   multiline, columns, textmatch, highlightmatch) and both affect their own
   view, this session also wired linkifyPaths into
   renderHighlightVisibleRows() (the Full/Context view) — previously it
   only ran in renderVisibleRows() (Table/Filtered) — so the new button
   actually controls something in the toolbar it sits in.
   ============================================================ */
group(202);
await withApp(async (w, d, T) => {
  section("202a. .toggle-filepaths: exists in both toolbars, defaults ON, persists across a click");

  const btns = [...d.querySelectorAll(".toggle-filepaths")];
  assert(btns.length === 2, "one copy in #contextToolbar, one in #filteredToolbar, got " + btns.length);
  assert(btns.every(b => isVisible(b, w)), "both are visible");
  assert(btns.every(b => b.classList.contains("active")) && T.filePathLinksEnabled === true,
    "clickable file paths default ON");
  assert(btns.every(b => b.innerHTML.includes("<svg")), "each carries an icon of its own");

  fireClick(btns[0], w);
  assert(!T.filePathLinksEnabled && btns.every(b => !b.classList.contains("active")),
    "clicking either copy flips the shared state and updates BOTH buttons");
  assert(w.localStorage.getItem("philogg-file-path-links-enabled") === "0", "state persisted as off");

  fireClick(btns[1], w);
  assert(T.filePathLinksEnabled && btns.every(b => b.classList.contains("active")), "clicking the other copy turns it back on");
  assert(w.localStorage.getItem("philogg-file-path-links-enabled") === "1", "...persisted as on again");
});

await withApp(async (w, d, T) => {
  section("202b. the toggle actually gates rendering in BOTH the Table and the Full/Context view");
  w.applyFhView("stacked"); // both Log views on screen: the Context view is only built while visible (GROUP 270)

  const f = await w.addFile("a.log", makeLog(0, 3, { msgPrefix: "wrote to /var/log/app.log ok" }), () => {});
  T.state.activeId = f.id;
  w.render();

  assert(d.querySelector("#tableRows .fp-candidate"), "Table view: a candidate renders while the toggle is on");
  assert(d.querySelector("#highlightRows .fp-candidate"),
    "Full/Context view: a candidate renders there too — this session wired linkifyPaths into renderHighlightVisibleRows");

  fireClick(d.querySelector(".toggle-filepaths"), w);
  assert(!d.querySelector("#tableRows .fp-candidate"), "off: no candidate spans in the Table view — plain markFieldHtml output only");
  assert(!d.querySelector("#highlightRows .fp-candidate"), "off: none in the Full/Context view either");
  assert(d.querySelector("#tableRows .col-msg").textContent.includes("/var/log/app.log"),
    "...the path text itself is still there, just not wrapped/linkified");

  fireClick(d.querySelector(".toggle-filepaths"), w);
  assert(d.querySelector("#tableRows .fp-candidate") && d.querySelector("#highlightRows .fp-candidate"),
    "turning it back on restores candidates in both views");
});

await withApp(async (w, d, T) => {
  section("202c. desktop build: verification/caching is shared across both views — a path seen in both costs one pathExists() call");
  w.applyFhView("stacked"); // both Log views on screen: the Context view is only built while visible (GROUP 270)

  let pathExistsCalls = 0;
  w.philogg.pathExists = () => { pathExistsCalls++; return Promise.resolve(true); };

  const f = await w.addFile("a.log", makeLog(0, 3, { msgPrefix: "wrote to /var/log/app.log ok" }), () => {});
  T.state.activeId = f.id;
  w.render();
  await new Promise(r => setTimeout(r, 0));

  const tableSpan = d.querySelector("#tableRows .fp-candidate");
  const fullSpan = d.querySelector("#highlightRows .fp-candidate");
  assert(tableSpan.classList.contains("fp-verified") && fullSpan.classList.contains("fp-verified"),
    "the same path renders verified in both views");
  assert(pathExistsCalls === 1, "...from a single shared pathExists() call, not one per view, got " + pathExistsCalls);
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]), pathExists: () => Promise.resolve(true) } });
