// GROUP 234 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 234 — Format Manager UI: the new "Meta" mode (ordered target-
   format picker, >=2-targets save guard) and removeLogFormat's new guard
   against deleting a format still used as a meta-format's target.
   ============================================================ */
group(234);
await withApp(async (w, d, T) => {
  section("234a. Format Manager: creating a meta-format via the UI (mode toggle, field visibility, ordered target picker, >=2-targets guard)");
  await waitForFormatConfig(T);
  fireClick(d.querySelector("#btnSettings"), w);
  fireClick(d.querySelector("#btnAddFormat"), w);

  fireClick(d.querySelector("#formatEditModeMeta"), w);
  assert(isVisible(d.querySelector("#formatEditMetaField"), w), "meta mode shows the target-format picker");
  assert(!isVisible(d.querySelector("#fwzNormalBody"), w),
    "...and hides the whole examples/columns/levels/regex/preview body — none of it applies to a meta-format");
  assert(isVisible(d.querySelector("#formatEditName"), w) && isVisible(d.querySelector("#formatEditRuleGlob"), w),
    "...while name and the optional filename rule stay (both apply to a meta-format too)");

  d.querySelector("#formatEditName").value = "Test meta";
  fireClick(d.querySelector("#formatEditSave"), w);
  assert(isVisible(d.querySelector("#formatEditError"), w) && d.querySelector("#formatEditError").textContent.includes("2"),
    "saving with 0 targets is rejected with an error mentioning the minimum, got " + d.querySelector("#formatEditError").textContent);

  const select = d.querySelector("#formatEditMetaTargetSelect");
  select.value = "fmt-demo-app";
  fireClick(d.querySelector("#formatEditMetaAddBtn"), w);
  let rows = [...d.querySelectorAll("#formatEditMetaTargets > div")];
  assert(rows.length === 1 && rows[0].textContent.includes("App log"), "adding a target lists it");

  fireClick(d.querySelector("#formatEditSave"), w);
  assert(isVisible(d.querySelector("#formatEditError"), w), "still rejected with only 1 target");

  select.value = "fmt-demo-syslog";
  fireClick(d.querySelector("#formatEditMetaAddBtn"), w);
  rows = [...d.querySelectorAll("#formatEditMetaTargets > div")];
  assert(rows.length === 2, "second target added, got " + rows.length);

  // Reorder: move the second row up, confirm the working order actually flipped.
  const upBtns = () => [...d.querySelectorAll("#formatEditMetaTargets .filter-library-row-order")].filter(b => b.title === "Move up");
  fireClick(upBtns()[1], w);
  rows = [...d.querySelectorAll("#formatEditMetaTargets > div")];
  assert(rows[0].textContent.includes("Syslog"), "moving the second target up reorders the working list");

  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => !isVisible(d.querySelector("#formatDialog"), w));
  const saved = T.state.logFormats.find(f => f.name === "Test meta");
  assert(saved && saved.mode === "meta", "saved as a meta-format");
  assert(saved.targetFormatIds.join(",") === "fmt-demo-syslog,fmt-demo-app",
    "the reordered target order is what gets saved, got " + saved.targetFormatIds.join(","));

  const row = [...d.querySelectorAll("#formatList .filter-library-row")].find(r => r.textContent.includes("Test meta"));
  assert(row && row.querySelector(".filter-library-row-meta").textContent.includes("Meta · 2 targets"), "the format list shows the meta target count");
}, { demoFormats: true });

await withApp(async (w, d, T) => {
  section("234b. removeLogFormat: a format still referenced as a meta-format's target can't be deleted until the meta-format is");
  await waitForFormatConfig(T);
  const before = T.state.logFormats.length;
  await w.removeLogFormat("fmt-demo-app");
  assert(T.state.logFormats.some(f => f.id === "fmt-demo-app"), "fmt-demo-app survives — it's still used as a target by the seeded meta-format");
  assert(T.state.logFormats.length === before, "nothing was removed");

  await w.removeLogFormat("fmt-demo-app-syslog-meta"); // remove the meta-format itself first
  assert(!T.state.logFormats.some(f => f.id === "fmt-demo-app-syslog-meta"), "the meta-format itself is removable like any other non-builtin format");
  await w.removeLogFormat("fmt-demo-app");
  assert(!T.state.logFormats.some(f => f.id === "fmt-demo-app"), "now that no meta-format targets it, fmt-demo-app can be removed");
}, { demoFormats: true });
