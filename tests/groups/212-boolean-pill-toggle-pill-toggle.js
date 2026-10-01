// GROUP 212 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 212 — Boolean pill toggle (.pill-toggle), the docs/ui-standard.md #69
   consistency-sweep replacement for single-boolean checkboxes across every
   dialog. Origin: this session (2026-09-14, FEATURE_BACKLOG.md #69). Covers
   the component contract: a role=switch button whose state lives in
   aria-checked (+ an `.on` class), flips on a direct click AND on a click of
   its associated <label for=…> (browser-forwarded), reads back correctly, and
   drives the app via a dispatched `change` event. Also spot-checks that a
   representative converted control in each family (filter popup, Settings,
   CSV export, plot) is now a pill and still behaves.
   ============================================================ */
group(212);
await withApp(async (w, d, T) => {
  section("212a. .pill-toggle component: click + label-click flip aria-checked/.on, read back via aria-checked");

  // The filter popup's switches are label-only view-tab toggles since
  // 2026-09-23 (Group 263) — the link dialog's pill is the reference here.
  const pill = d.querySelector("#linkExclusiveInput");
  assert(pill.tagName === "BUTTON" && pill.getAttribute("role") === "switch" && pill.classList.contains("pill-toggle"),
    "a converted boolean is a <button role=switch class=pill-toggle>, not a native checkbox");
  assert(pill.getAttribute("aria-checked") === "false" && !pill.classList.contains("on"),
    "it starts off (aria-checked=false, no .on class)");
  assert(pill.checked === undefined, "a pill has no .checked property (it's a button, not an input)");

  // Direct click flips it on: aria-checked + .on class, readable via aria.
  fireClick(pill, w);
  assert(pill.getAttribute("aria-checked") === "true" && pill.classList.contains("on") && pillChecked(pill),
    "a direct click flips aria-checked to true and adds .on");
  fireClick(pill, w);
  assert(pill.getAttribute("aria-checked") === "false" && !pill.classList.contains("on") && !pillChecked(pill),
    "a second click flips it back off");

  // Clicking the associated <label for=…> toggles it too (browser forwards
  // the click to the labelled button, which the delegated handler catches).
  const label = d.querySelector('label[for="linkExclusiveInput"]');
  assert(label, "the pill has an adjacent <label for> wiring the text to it");
  fireClick(label, w);
  assert(pillChecked(pill), "clicking the label toggles the pill on");
  fireClick(label, w);
  assert(!pillChecked(pill), "clicking the label again toggles it back off");

  // A toggle dispatches a real `change` event, so change-driven app logic
  // keeps working — the same protocol drives the filter popup's label-only
  // switches: turning NOT on re-runs the live match as "kept (NOT)".
  const pf = await w.addFile("pill.log", makeLog(0, 4), () => {});
  T.state.activeId = pf.id;
  w.openFilterPopup();
  const notToggle = d.querySelector("#filterInvertCheckbox");
  d.querySelector("#filterInput").value = "message";
  fireInput(d.querySelector("#filterInput"), w);
  fireClick(notToggle, w);
  await new Promise(r => setTimeout(r, 200));
  assert(pillChecked(notToggle) && d.querySelector("#filterLiveMatch").textContent.includes("kept (NOT) in"),
    "toggling the NOT switch fired change -> evaluateLiveMatch re-ran in NOT mode, got " + d.querySelector("#filterLiveMatch").textContent);
  fireClick(notToggle, w);
  w.closeFilterPopup();

  // pillGet/pillSet round-trip (the app's own helpers, exposed as functions):
  // pillSet(el,true) with no fireChange flag mirrors the old `.checked =` and
  // does NOT dispatch change.
  if (typeof w.pillSet === "function" && typeof w.pillGet === "function") {
    let changes = 0;
    pill.addEventListener("change", () => changes++);
    w.pillSet(pill, true);
    assert(w.pillGet(pill) === true && pill.getAttribute("aria-checked") === "true", "pillSet(el,true) sets state, pillGet reads it back");
    assert(changes === 0, "pillSet without the fireChange flag does not dispatch a change event");
    w.pillSet(pill, true, true);
    assert(changes === 1, "pillSet(el,on,true) DOES dispatch a change event");
    w.pillSet(pill, false);
  }
  w.closeFilterPopup();
});

await withApp(async (w, d, T) => {
  section("212b. Converted controls across dialogs are pills and still drive their state");

  // Settings boolean.
  const quit = d.getElementById("settingsQuitOnLastClose");
  assert(quit.classList.contains("pill-toggle") && quit.getAttribute("role") === "switch", "a Settings boolean is a pill");
  assert(w.localStorage.getItem("philogg-quit-on-last-close") === null, "nothing persisted yet");
  fireClick(quit, w);
  assert(w.localStorage.getItem("philogg-quit-on-last-close") === "1", "clicking the Settings pill persists via its change handler");

  // Every listed single-boolean id is now a role=switch pill (and none of the
  // deliberately-untouched multi-select checkbox lists were converted).
  // (The filter popup's three switches moved to the label-only view-tab
  // look on 2026-09-23 — Groups 149/263.)
  const pillIds = ["linkExclusiveInput", "linkOrderEnforceInput",
    "settingsCloseToTray", "settingsHoverExpandSidebar", "settingsHoverExpandDetail",
    "settingsHideMinimapFullRangeInFullView", "settingsTempAnchorAcrossFiles",
    "settingsTextMatchHighlightRows", "settingsTextMatchHighlightDetail"];
  pillIds.forEach(id => {
    const p = d.getElementById(id);
    assert(p && p.tagName === "BUTTON" && p.classList.contains("pill-toggle") && p.getAttribute("role") === "switch",
      "#" + id + " is a .pill-toggle button");
  });

  // The multi-select column-visibility list stays native checkboxes (JS-
  // rendered on open by renderColumnsPanel — Custom Columns feature, the
  // set is per-format/dynamic now, not four fixed ids).
  fireClick(d.querySelector(".toggle-columns"), w);
  ["delta", "thread", "location", "method"].forEach(key => {
    const c = d.querySelector('#columnsList input[data-col="' + key + '"]');
    assert(c && c.tagName === "INPUT" && c.type === "checkbox",
      'the "' + key + '" column-visibility item (a set-selection list item) stays a native checkbox, not a pill');
  });

  // Session-export per-file toggles stay native checkboxes too.
  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  w.render();
  await w.openSessionExportDialog();
  const inc = d.querySelector(".session-include");
  assert(inc && inc.tagName === "INPUT" && inc.type === "checkbox", "session-export per-file 'include' stays a native checkbox (multi-select)");
});
