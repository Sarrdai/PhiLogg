// GROUP phone-hidden-actions — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): runs inside its main async function, so
// every harness helper (withApp, assert, section, makeLog, isVisible, ...) is in scope.

/* ============================================================
   GROUP phone-hidden-actions — actions whose result needs a view phone hides
   Origin: 2026-10-04 (usability test). Phone shows only the Filtered view:
   the row menu's "Extract" (feeds Table/Plot) and the sidebar toolbar's
   "Add to library…" (library is applied via #btnLibrary) are omitted there.
   Desktop/compact unchanged; the toolbar rebuilds on a tier change.
   ============================================================ */
group("phone-hidden-actions");

const phaWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };

await withApp(async (w, d, T) => {
  section("phone-hidden-actions a. row menu: Extract hidden on phone only");
  const f = await w.addFile("a.log", makeLog(0, 20, { msgPrefix: "processed 42 items" }), () => {});
  T.state.activeId = f.id;
  w.render();
  const ev = { clientX: 10, clientY: 10 };
  for (const [px, name, want] of [[1440, "desktop", true], [820, "compact", true], [390, "phone", false]]) {
    phaWidth(w, px);
    w.openContextMenu(ev, f.entries[0]);
    assert(isVisible(d.querySelector("#ctxExtractMessage"), w) === want, name + ": Extract " + (want ? "visible" : "hidden"));
    assert(isVisible(d.querySelector("#ctxFilterForColumn"), w), name + ": 'Filter for this ...' stays");
    w.closeContextMenu();
  }
});

await withApp(async (w, d, T) => {
  section("phone-hidden-actions b. sidebar toolbar: Add to library absent on phone, back after tier switch");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const flt = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = flt.id; T.state.multiSelect = new Set([flt.id]);
  const lib = () => d.querySelector('#sidebarToolbar [data-row-action="addToLibrary"]');
  const names = () => [...d.querySelectorAll("#sidebarToolbar [data-row-action]")].map(b => b.dataset.rowAction);
  phaWidth(w, 1440); w.render();
  assert(!!lib() && !lib().disabled, "desktop: Add to library present and enabled");
  phaWidth(w, 820);
  assert(!!lib(), "compact: Add to library present");
  phaWidth(w, 390);
  assert(!lib(), "phone: Add to library omitted, got " + names().join(","));
  assert(names().includes("rename") && names().includes("clockOffset") && names().includes("mute"), "phone: the other toolbar actions stay");
  assert(!d.querySelector("#sidebarToolbar").lastElementChild.classList.contains("row-action-separator"), "phone: no dangling separator");
  phaWidth(w, 1440);
  assert(!!lib() && !lib().disabled, "back on desktop: Add to library is rebuilt");
  // Direct switch phone -> compact too
  phaWidth(w, 390); assert(!lib(), "phone again: omitted");
  phaWidth(w, 820); assert(!!lib(), "phone -> compact: present");
});
