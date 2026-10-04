// GROUP browser-back-guard — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP browser-back-guard — the browser Back gesture stays in the app
   Origin: 2026-10-04 (phone usability test). One guard history entry is
   pushed on a user interaction; popstate (Back) then closes an open overlay,
   else the phone sheet, else steps the in-app nav history, else shows a
   "press Back again" toast and leaves the guard popped.
   ============================================================ */
group("browser-back-guard");

await withApp(async (w, d, T) => {
  await T.bootRestore;
  const back = () => w.dispatchEvent(new w.PopStateEvent("popstate", { state: null }));
  const lenAtStart = w.history.length;

  section("browser-back-guard a. Armed by a pointerdown, once");
  assert(!w.history.state, "no guard before any interaction");
  d.body.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
  assert(w.history.state && w.history.state.philoggBackGuard === true, "guard entry pushed");
  assert(w.history.length === lenAtStart + 1, "exactly one entry added");
  d.body.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
  assert(w.history.length === lenAtStart + 1, "a second interaction does not push again");
  await w.addFile("a.log", makeLog(0, 5), () => {});

  section("browser-back-guard b. Back closes an open overlay first and re-arms");
  w.openSettingsDialog();
  assert(!d.getElementById("settingsDialog").classList.contains("hidden"), "settings open");
  const lenB = w.history.length;
  back();
  assert(d.getElementById("settingsDialog").classList.contains("hidden"), "Back closed the dialog");
  assert(w.history.length === lenB + 1, "guard pushed again");

  section("browser-back-guard c. Phone sheet closes before nav history steps back");
  w.eval("currentLayoutTier = 'phone'; phoneSheetOpen = true; navHistoryIndex = 2;");
  let steps = 0;
  w.navigateBack = () => { steps++; };
  back();
  assert(w.eval("phoneSheetOpen") === false, "Back closed the phone sheet");
  assert(steps === 0, "nav history untouched while a sheet was open");

  section("browser-back-guard d. Then nav history steps back");
  back();
  assert(steps === 1, "navigateBack called once");
  w.eval("currentLayoutTier = 'desktop'");

  section("browser-back-guard e. Mouse Back button is not double-stepped");
  steps = 0;
  d.dispatchEvent(new w.MouseEvent("mouseup", { button: 3, bubbles: true, cancelable: true }));
  const stepsAfterMouse = steps;
  back();
  assert(stepsAfterMouse === 1 && steps === 1, "mouse button stepped once; the popstate right after did not step again");
  w.eval("lastMouseNavAt = 0");

  section("browser-back-guard f. Nothing to step back to: toast, guard stays popped");
  w.eval("navHistoryIndex = 0");
  d.getElementById("copyToast").textContent = "";
  const lenF = w.history.length;
  back();
  assert(/Back again/.test(d.getElementById("copyToast").textContent), "toast explains the next Back leaves");
  assert(w.history.length === lenF, "guard was not re-armed");
  assert(steps === 1, "no further step");
  d.body.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
  assert(w.history.length === lenF + 1, "re-armed lazily on the next interaction");

  section("browser-back-guard g. Forward onto the guard just marks it armed");
  w.dispatchEvent(new w.PopStateEvent("popstate", { state: { philoggBackGuard: true } }));
  assert(w.history.length === lenF + 1, "no push, no step");

  section("browser-back-guard h. Escape still closes the overlay");
  w.openSettingsDialog();
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(d.getElementById("settingsDialog").classList.contains("hidden"), "Escape closed settings via the shared closer");
});
