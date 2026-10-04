// GROUP drawer-header-tap — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP drawer-header-tap — header buttons act on the first tap while the drawer is open
   Origin: 2026-10-04 (tablet retest). #drawerScrim covered #toolbar, so the first tap on
   Undo only closed the drawer. The header now sits above the scrim (z 56) and a capture
   listener on #toolbar closes the drawer while the click continues to its button;
   #btnDrawer keeps toggling. Layout is not measured (jsdom): z-index via the CSS rules.
   ============================================================ */
group("drawer-header-tap");

await withApp(async (w, d, T) => {
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const flt = w.createFilterNode(f.id, "text", "message 1");
  w.render();
  w.innerWidth = 820; w.dispatchEvent(new w.Event("resize"));
  const open = () => d.body.classList.contains("drawer-open");

  section("drawer-header-tap a. One click on Undo undoes AND closes the open drawer");
  w.deleteFilterNodeWithUndo(flt.id);
  w.render();
  assert(!T.state.nodes[flt.id], "filter deleted");
  fireClick(d.getElementById("btnDrawer"), w);
  assert(open(), "drawer open");
  fireClick(d.getElementById("btnUndo"), w);
  assert(!!T.state.nodes[flt.id], "the first click on Undo restored the filter");
  assert(!open(), "...and closed the drawer");

  section("drawer-header-tap b. #btnDrawer still toggles");
  fireClick(d.getElementById("btnDrawer"), w);
  assert(open(), "opens");
  fireClick(d.getElementById("btnDrawer"), w);
  assert(!open(), "closes again (capture listener does not double-close/reopen)");

  section("drawer-header-tap c. Header rule lifts #toolbar above the scrim");
  const z = sel => {
    let best = null;
    for (const sheet of d.styleSheets) for (const r of sheet.cssRules) {
      if (r.selectorText && r.selectorText.split(",").map(x => x.trim()).includes(sel) && r.style.zIndex) best = +r.style.zIndex;
    }
    return best;
  };
  const tb = z("body.layout-compact.drawer-open #toolbar"), tbP = z("body.layout-phone.drawer-open #toolbar");
  let scrimZ = 0;
  for (const sheet of d.styleSheets) for (const r of sheet.cssRules) {
    if (r.selectorText && r.selectorText.includes("#drawerScrim") && r.style.zIndex) scrimZ = +r.style.zIndex;
  }
  assert(tb > scrimZ && tbP > scrimZ && scrimZ > 0, "toolbar z (" + tb + "/" + tbP + ") above scrim z (" + scrimZ + ")");
  assert(tb < 60, "...but below the drawer (60), which still covers the header's left part");

  section("drawer-header-tap d. Phone: a header button closes the drawer too");
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  fireClick(d.getElementById("btnDrawer"), w);
  assert(open(), "phone drawer open");
  fireClick(d.getElementById("btnSettings"), w);
  assert(!open(), "Settings click closed the drawer");
});
