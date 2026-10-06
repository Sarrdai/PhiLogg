// GROUP phone-sheet-drag — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-sheet-drag — the bottom-sheet grab handle resizes the sheet (phone only)
   Origin: 2026-10-06. Dragging #detailGrab moves the sheet top with the
   pointer (inline --sheet-h on body), release snaps to 35vh / 62vh / 90vh of
   window.innerHeight, a release below 20vh (or a fast fling down below the
   lowest snap) closes the sheet via closePhoneSheet (selection stays), a tap
   changes nothing, closing / leaving the phone tier clears the inline height
   (reopen = 62vh). jsdom has no layout: the panel rect is stubbed.
   Data: log-sim "basic" scenario.
   ============================================================ */
group("phone-sheet-drag");

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 400, seed: 33 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  w.innerWidth = 390; w.innerHeight = 800; w.dispatchEvent(new w.Event("resize"));
  const grab = d.getElementById("detailGrab"), panel = d.getElementById("detailPanel");
  const open = () => d.body.classList.contains("sheet-open");
  const sheetH = () => d.body.style.getPropertyValue("--sheet-h");
  let panelH = 496; // 62vh of 800
  panel.getBoundingClientRect = () => ({ height: panelH, top: 800 - panelH, bottom: 800, left: 0, right: 390, width: 390 });
  const ptr = (type, y, t) => {
    const ev = new w.MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
    Object.defineProperty(ev, "pointerId", { value: 1 });
    Object.defineProperty(ev, "timeStamp", { value: t });
    grab.dispatchEvent(ev);
  };
  // Drag from the grab at y0 to y1 over `ms` milliseconds, release.
  const drag = (y0, y1, ms) => { ptr("pointerdown", y0, 1000); ptr("pointermove", (y0 + y1) / 2, 1000 + ms / 2); ptr("pointermove", y1, 1000 + ms); ptr("pointerup", y1, 1000 + ms); };
  const openSheet = () => {
    const e = T.currentViewEntries[5];
    w.selectEntry(e.id, { scroll: true, index: 5 });
    d.querySelector('#tableRows .log-row[data-entry-id="' + e.id + '"]').click();
    panelH = 496;
    return e.id;
  };

  section("phone-sheet-drag a. CSS: a >=44px touch-action:none strip, phone only");
  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push({ sel: r.selectorText, css: r.cssText.replace(/\s+/g, "") }); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  const phoneGrab = rules.filter(r => r.sel === "body.layout-phone #detailGrab").map(r => r.css).join("");
  assert(/height:44px/.test(phoneGrab) && /touch-action:none/.test(phoneGrab), "phone grab: 44px tall, touch-action:none");
  assert(rules.filter(r => /#detailGrab/.test(r.sel)).every(r => /^body\.layout-phone\s/.test(r.sel) || r.sel === "#detailGrab" || /,/.test(r.sel)), "grab rules are phone-scoped (plus the base display:none)");

  section("phone-sheet-drag b. Snap points: 35vh / 62vh / 90vh");
  const id = openSheet();
  assert(open() && sheetH() === "", "sheet opens at the 62vh default (no inline height)");
  drag(304, 100, 400); // finger up 204px: 496 + 204 = 700 -> nearest snap 90vh = 720
  assert(sheetH() === "720px", "drag up snaps to 90vh = 720px, got '" + sheetH() + "'");
  panelH = 720;
  drag(80, 400, 400); // down 320: 720 - 320 = 400 -> nearest 35vh=280 / 62vh=496 -> 496
  assert(sheetH() === "496px", "drag down to ~400px snaps to 62vh = 496px, got '" + sheetH() + "'");
  panelH = 496;
  drag(304, 504, 400); // down 200: 296 -> 35vh = 280
  assert(sheetH() === "280px", "drag to ~296px snaps to 35vh = 280px, got '" + sheetH() + "'");
  assert(open() && T.state.selectedId === id, "still open, selection kept");

  section("phone-sheet-drag c. While dragging the sheet follows the pointer, no snap yet");
  panelH = 280;
  ptr("pointerdown", 520, 2000);
  ptr("pointermove", 400, 2100); // up 120 -> 400px
  assert(sheetH() === "400px" && grab.classList.contains("dragging"), "mid-drag --sheet-h is the raw 400px, got '" + sheetH() + "'");
  ptr("pointerup", 400, 2200);
  assert(sheetH() === "496px" && !grab.classList.contains("dragging"), "release snaps to 62vh");

  section("phone-sheet-drag d. Snap keeps the selected card above the sheet");
  const entries = T.currentViewEntries, si = entries.findIndex(e => e.id === T.state.selectedId);
  assert(si !== -1 && d.querySelector('#tableRows .log-row[data-entry-id="' + T.state.selectedId + '"]'), "selected card still rendered after the snap");

  section("phone-sheet-drag e. Tap on the grab does nothing");
  panelH = 496;
  const before = sheetH();
  ptr("pointerdown", 510, 3000); ptr("pointerup", 510, 3050);
  assert(sheetH() === before && open() && T.state.selectedId === id, "tap: height unchanged, sheet open, selection kept");

  section("phone-sheet-drag f. Release low closes (selection stays); reopen = 62vh");
  drag(304, 700, 600); // 496 - 396 = 100px < 20vh (160)
  assert(!open() && T.state.selectedId === id, "released below 20vh closes the sheet, selection stays");
  assert(sheetH() === "", "inline --sheet-h cleared on close");
  d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]').click();
  assert(open() && sheetH() === "", "reopened at the 62vh default");

  section("phone-sheet-drag g. Fast fling down below the lowest snap closes, slow drag there does not");
  panelH = 496;
  drag(304, 540, 100); // 496-236=260 (<35vh=280) at 2.36 px/ms
  assert(!open(), "fast fling to 260px closes the sheet");
  openSheet();
  drag(304, 540, 2000); // same distance, slow
  assert(open() && sheetH() === "280px", "slow drag to 260px snaps to 35vh instead, got '" + sheetH() + "'");

  section("phone-sheet-drag h. Leaving the phone tier clears the inline height; desktop unaffected");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
  assert(sheetH() === "", "desktop: inline --sheet-h cleared");
  const deskBefore = sheetH();
  ptr("pointerdown", 500, 5000); ptr("pointermove", 300, 5100); ptr("pointerup", 300, 5200);
  assert(sheetH() === deskBefore, "desktop: a pointer drag on the (hidden) grab does nothing");
  assert(!/--sheet-h/.test(panel.getAttribute("style") || ""), "desktop: panel has no inline sheet height");
});
