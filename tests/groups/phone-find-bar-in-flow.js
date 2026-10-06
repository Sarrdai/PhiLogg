// GROUP phone-find-bar-in-flow — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-find-bar-in-flow — the phone find bar takes layout space
   Origin: 2026-10-06. On the phone tier #findBar is in normal flow at the top
   of #fhSplit (position:relative, flex:none) instead of floating over the
   first cards, so tableBody.clientHeight is the real visible list height and
   a find step to hit 1 at the very top is not hidden under the bar. Opening /
   closing re-renders the list (the viewport changes). Desktop / compact keep
   the floating absolute bar. jsdom has no layout: CSS via the CSSOM, the
   viewport via a stubbed clientHeight.
   Data: log-sim "basic" scenario.
   ============================================================ */
group("phone-find-bar-in-flow");

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 400, seed: 37 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();

  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push({ sel: r.selectorText, css: r.cssText.replace(/\s+/g, "") }); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  const css = sel => rules.filter(r => r.sel.split(",").map(x => x.trim()).includes(sel)).map(r => r.css).join("");

  section("phone-find-bar-in-flow a. CSS: in flow on phone, floating on the base");
  const phone = css("body.layout-phone #findBar");
  assert(/position:relative/.test(phone) && /flex:00auto/.test(phone) && /margin:4px8px/.test(phone), "phone: position:relative, flex none, 8px side margins");
  assert(!/position:absolute/.test(phone), "phone: not absolute");
  assert(/position:absolute/.test(css("#findBar")), "base (desktop / compact): still absolute, floats over the list");

  const body = d.getElementById("tableBody");
  const BAR_H = 108;
  let viewportH = 600;
  Object.defineProperty(body, "clientHeight", { configurable: true, get: () => viewportH - (d.getElementById("findBar").classList.contains("hidden") || !d.body.classList.contains("layout-phone") ? 0 : BAR_H) });

  section("phone-find-bar-in-flow b. Open / close re-render the list on phone");
  w.innerWidth = 390; w.innerHeight = 800; w.dispatchEvent(new w.Event("resize"));
  const spy = w.eval("(() => { window.__rv = 0; const o = renderVisibleRows; renderVisibleRows = function () { window.__rv++; return o.apply(this, arguments); }; return () => window.__rv; })()");
  const before = spy();
  w.openFindBar();
  assert(spy() > before, "openFindBar re-renders (list viewport shrank)");
  const afterOpen = spy();
  w.closeFindBar();
  assert(spy() > afterOpen, "closeFindBar re-renders (list viewport grew)");

  section("phone-find-bar-in-flow c. Find step to hit 1 at the top lands below the bar");
  const input = d.getElementById("findInput"), count = d.getElementById("findCount");
  const firstWord = T.currentViewEntries[0].message.split(/\s+/).find(x => x.length > 3) || "a";
  w.openFindBar();
  input.value = firstWord; fireInput(input, w);
  await waitFor(() => /^\d+ \/ \d+$/.test(count.textContent) || /matches?$/.test(count.textContent), { timeout: 3000 });
  fireKeydown(d, w, "F3");
  await waitFor(() => !!T.state.selectedId, { timeout: 3000 });
  const idx = T.currentViewEntries.findIndex(e => e.id === T.state.selectedId);
  assert(idx !== -1, "a hit is selected");
  // The viewport the renderer sees excludes the bar: the scroll target keeps the whole hit row inside it.
  assert(body.clientHeight === viewportH - BAR_H, "tableBody viewport = list height minus the in-flow bar (" + body.clientHeight + ")");
  assert(!!d.querySelector('#tableRows .log-row[data-entry-id="' + T.state.selectedId + '"]'), "the hit's card is rendered");
  w.closeFindBar();
  assert(body.clientHeight === viewportH, "closed: full list height again");

  section("phone-find-bar-in-flow d. Desktop: the bar does not change the list viewport");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
  w.openFindBar();
  assert(body.clientHeight === viewportH, "desktop: viewport height unchanged by the bar");
  w.closeFindBar();

  section("phone-find-bar-in-flow e. A row taller than the viewport keeps its top edge visible");
  // Phone card under an open find bar + sheet: the list viewport can be shorter than one card.
  viewportH = Math.max(1, Math.floor(T.ROW_HEIGHT / 2));
  body.scrollTop = 0;
  w.scrollToIndex(50);
  const top50 = w.eval("tableRowOffsets && needsRowOffsets() ? tableRowOffsets[50] : 50 * tableRowH()");
  assert(Math.abs(w.eval("physicalToLogicalScrollPx(tableBody.scrollTop)") - top50) <= 1,
    "scrolled to the row's top, not its bottom (" + body.scrollTop + " vs " + top50 + ")");
  viewportH = 600;
});
