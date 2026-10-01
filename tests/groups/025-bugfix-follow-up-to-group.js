// GROUP 25 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 25 — Bugfix follow-up to Group 24 (person-reported, 2026-08-13)
   Bug 1: "Extract numbers from this message" set filterInput.value directly
   without firing an "input" event, so evaluateLiveMatch — and, since Group
   24, the live pattern preview riding its same debounce — never ran until
   the person typed something themselves. Fixed by calling evaluateLiveMatch()
   explicitly right after the assignment, same as insertTokenAtCursor and
   openEditFilterPopup already did after their own direct .value writes.
   Bug 2: right-click -> "Edit filter…" opened #filterPopup but it closed
   itself again in the SAME click — treeContextMenu's click handler didn't
   stopPropagation, so the click kept bubbling to document's global "click
   outside a popup closes it" handler; by then #filterPopup had just lost
   its "hidden" class, and ev.target (the menu item, still in the DOM,
   closeTreeContextMenu only toggles a CSS class) is outside #filterPopup,
   so that handler closed it right back. Same class of bug as the preview
   span / pattern chip fix in Group 24 — one more instance of "a click
   handler that opens something else must not let the click keep bubbling
   to a close-on-outside-click listener." F2 was unaffected (not a click
   event, never reaches that handler), which is why only the right-click
   path was reported broken.
   ============================================================ */
group(25);
await withApp(async (w, d, T) => {
  section("25. Bugfixes: extract-numbers live preview + right-click edit popup");
  const log = `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"id=1 name=n1 score=1.5"\n`;
  const f = await w.addFile("a.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  // --- Bug 1 --- ("Extract numbers from this message" was renamed to
  // "Filter for this message" in a later session — #ctxFilterForColumn is
  // its current id, see Group 40 for the rename's own coverage; the
  // underlying live-preview bugfix being re-verified here is unaffected.)
  const entryRow = d.querySelector(".log-row");
  fireContextMenu(entryRow, w, 50, 50);
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  await new Promise(r => setTimeout(r, 200)); // shared debounce, see evaluateLiveMatch
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "sanity: popup opens from 'Filter for this message'");
  assert(d.querySelector("#filterInput").value.includes("[*:"), "sanity: a pattern was inserted");
  const preview = d.querySelector("#filterPatternPreview");
  assert(!preview.classList.contains("hidden"), "live pattern preview appears immediately, without the person typing anything first");
  assert(preview.querySelectorAll(".preview-value-span").length > 0, "preview shows highlighted spans immediately, not just after a manual edit");
  w.closeFilterPopup();

  // --- Bug 2 ---
  const textNode = w.createFilterNode(f.id, "text", "id=");
  w.render();
  const row = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(row, w, 60, 60);
  const editItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "edit");
  assert(editItem, "sanity: context menu offers 'Edit filter…' for a text filter");
  fireClick(editItem, w);
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "right-click 'Edit filter…' opens the popup and it STAYS open (doesn't immediately self-close via the click-outside handler)");
  assert(d.querySelector("#filterInput").value === "id=", "the popup opened for the correct node (its current value)");
  w.closeFilterPopup();
});
