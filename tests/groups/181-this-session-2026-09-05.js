// GROUP 181 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 181 — this session (2026-09-05), person-requested: a real Settings
   -> Behavior setting (not a view-toolbar control) for whether the row-
   action/toolbar buttons' hover-revealed labels show Never, on Hover
   (default), or Always — independently for the Filter-Toolbar
   (`#settingsFilterToolbarLabels`) and the View Toolbars
   (`#settingsViewToolbarLabels`). Applied as a class on <body>
   (`filter-toolbar-labels-never`/`-always`, `view-toolbar-labels-never`/
   `-always`) rather than per-button state.
   ============================================================ */
group(181);
await withApp(async (w, d, T) => {
  section("181a. Defaults to 'hover' for both, with no localStorage entry yet");

  assert(w.localStorage.getItem("philogg-filter-toolbar-labels") === null, "sanity: nothing persisted yet");
  assert(w.localStorage.getItem("philogg-view-toolbar-labels") === null, "sanity: nothing persisted yet");
  assert(T.filterToolbarLabels === "hover" && T.viewToolbarLabels === "hover", "both default to 'hover'");
  assert(!d.body.classList.contains("filter-toolbar-labels-never") && !d.body.classList.contains("filter-toolbar-labels-always"),
    "no override class on <body> for the Filter-Toolbar at the default");
  assert(!d.body.classList.contains("view-toolbar-labels-never") && !d.body.classList.contains("view-toolbar-labels-always"),
    "no override class on <body> for View Toolbars at the default");
  assert(d.querySelector("#settingsFilterToolbarLabels").value === "hover", "select reflects the default");
  assert(d.querySelector("#settingsViewToolbarLabels").value === "hover", "select reflects the default");
});

await withApp(async (w, d, T) => {
  section("181b. Changing each select persists independently and toggles its own <body> class");

  const filterSelect = d.querySelector("#settingsFilterToolbarLabels");
  const viewSelect = d.querySelector("#settingsViewToolbarLabels");

  filterSelect.value = "never";
  filterSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.filterToolbarLabels === "never", "Filter-Toolbar setting updates in JS");
  assert(w.localStorage.getItem("philogg-filter-toolbar-labels") === "never", "...and persists to its own key");
  assert(d.body.classList.contains("filter-toolbar-labels-never"), "<body> carries the Filter-Toolbar 'never' class");
  assert(T.viewToolbarLabels === "hover", "View Toolbar setting is untouched by the Filter-Toolbar change");
  assert(!d.body.classList.contains("view-toolbar-labels-never"), "...no View Toolbar class added either");

  viewSelect.value = "always";
  viewSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.viewToolbarLabels === "always", "View Toolbar setting updates independently");
  assert(w.localStorage.getItem("philogg-view-toolbar-labels") === "always", "...and persists to its own key");
  assert(d.body.classList.contains("view-toolbar-labels-always"), "<body> carries the View Toolbar 'always' class");
  assert(d.body.classList.contains("filter-toolbar-labels-never"), "...while the Filter-Toolbar's earlier 'never' choice is still in effect");
});
