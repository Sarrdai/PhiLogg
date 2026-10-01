// GROUP 186 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 186 — this session (2026-09-08), Paket A: two new Filter-Toolbar
   (#viewBar) row-actions. "Extract" is a one-click version of "Message"
   (same auto-extraction pattern from buildNumericExtractPattern/
   collapseNewlinesToWildcard) that skips the filter popup entirely and
   commits the pattern straight to a new "text" filter node. "New" is a
   one-click "openFilterPopup()", identical to Ctrl+F. Also: a distinct
   "Message" icon (ICON_MESSAGE_EXTRACT, a speech bubble) replacing the
   generic funnel it used to share with every other filter action.
   (Renumbered from a colliding "184" at merge time — Paket C already
   claimed 184, Paket B claimed 185.)
   ============================================================ */
group(186);
await withApp(async (w, d, T) => {
  section("186a. Extract: one-click filter creation from the message column, no popup shown");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  const entry = f.entries[3];
  w.selectEntry(entry.id);

  const extractBtn = d.querySelector('[data-row-action="extractMessage"]');
  assert(extractBtn !== null && extractBtn.disabled === false, "sanity: Extract button exists and is enabled with a row selected");

  const beforeChildCount = f.children.length;
  fireClick(extractBtn, w);

  assert(d.querySelector("#filterPopup").classList.contains("hidden") === true,
    "the filter popup is NOT shown by Extract — the node is created directly");
  assert(f.children.length === beforeChildCount + 1, "Extract creates exactly one new filter node");

  const created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "text", "the created node is a plain 'text' filter node");
  assert(/\[\*:(int|float|time)\]/.test(created.value),
    "its pattern contains a [*:int]/[*:float]/[*:time] wildcard token, got " + JSON.stringify(created.value));
  assert(Array.isArray(created.columns) && created.columns.length === 1 && created.columns[0] === "message",
    "the node is restricted to the message column, same as 'Filter for this message'");
  assert(T.state.activeId === created.id, "creating it activates the new node, same as the other row-actions");

  // --- Same primitive commitFilter() uses (createFilterNode), so nothing
  // marks this node as special: editing it afterward (F2 -> openEditFilterPopup)
  // works exactly like any other plain text filter node. ---
  w.openEditFilterPopup(created.id);
  assert(d.querySelector("#filterPopup").classList.contains("hidden") === false, "opening edit on the Extract-created node opens the popup normally");
  assert(d.querySelector("#filterInput").value === created.value, "...prefilled with the extracted pattern");
  assert(d.querySelector("#filterSubmitBtn").textContent === "Save", "...in edit mode (submit button reflects editing, not a fresh 'Add filter')");
  fireClick(d.querySelector("#btnCloseFilterPopup"), w);
});

await withApp(async (w, d, T) => {
  section("186b. New: one-click openFilterPopup(), same outcome as Ctrl+F, needs only an active node");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const newBtn = d.querySelector('[data-row-action="newFilter"]');
  assert(newBtn !== null, "the New button exists in the Filter-Toolbar");
  assert(newBtn.disabled === false, "New is enabled with an active node even though no row is selected");
  assert(d.querySelector("#filterPopup").classList.contains("hidden") === true, "sanity: popup starts closed");

  fireClick(newBtn, w);

  assert(d.querySelector("#filterPopup").classList.contains("hidden") === false, "clicking New opens the filter popup");
  assert(d.querySelector("#filterInput").value === "", "...with an empty pattern input, fresh 'Add filter' mode");
  assert(d.querySelector("#filterSubmitBtn").textContent === "Add filter", "...and the submit button reads 'Add filter'");
  fireClick(d.querySelector("#btnCloseFilterPopup"), w);

  // --- Disabled with no active node at all (nothing to add the filter under) ---
  T.state.activeId = null;
  w.updateRowActionButtons();
  assert(d.querySelector('[data-row-action="newFilter"]').disabled === true, "New disables once there is no active node");
});

await withApp(async (w, d, T) => {
  section("186c. \"Message\" gets its own distinct icon, no longer sharing the generic funnel ICON_FILTER");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const messageBtn = d.querySelector('[data-row-action="filterForMessage"]');
  const afterBtn = d.querySelector('[data-row-action="filterAfter"]'); // uses its own arrow icon, unrelated
  const messageSvg = messageBtn.querySelector(".row-action-hit svg").innerHTML;
  // Guard against an accidental revert to the shared funnel path — the
  // generic ICON_FILTER's single path is exactly this shape.
  const funnelPath = 'M2 3h12l-4.5 5.5v4L7 14v-5.5Z';
  assert(!messageSvg.includes(funnelPath), "'Message' no longer renders the generic funnel path, got " + messageSvg);
  assert(messageSvg !== afterBtn.querySelector(".row-action-hit svg").innerHTML, "'Message' icon differs from 'After's icon (sanity: they're not accidentally identical)");
});
