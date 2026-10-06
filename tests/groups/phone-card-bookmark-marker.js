// GROUP phone-card-bookmark-marker — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-card-bookmark-marker — bookmarked phone cards
   Origin: 2026-10-06 (phone usability round, step A2). The 10px corner glyph
   became a 16px accent bookmark on the first line plus an inset accent ring,
   phone tier only. jsdom has no layout: sizes/position are asserted on the
   CSS rules, the height contract on the rendered row heights.
   ============================================================ */
group("phone-card-bookmark-marker");

await withApp(async (w, d, T) => {
  section("phone-card-bookmark-marker a. Rules");
  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && r.media) walk(r.cssRules); else if (r.selectorText) rules.push({ sels: r.selectorText.split(",").map(x => x.trim()), css: r.style.cssText.replace(/\s/g, "") }); } };
  for (const sh of d.styleSheets) walk(sh.cssRules);
  const css = sel => rules.filter(r => r.sels.includes(sel)).map(r => r.css).join(";");
  const P = "body.layout-phone #tableRows ";
  assert(/right:10px/.test(css(P + ".col-bookmark-icon")) && /top:10px/.test(css(P + ".col-bookmark-icon")) && /height:20px/.test(css(P + ".col-bookmark-icon")), "icon box is the 20px first line");
  assert(/width:16px/.test(css(P + ".col-bookmark-icon svg")) && /height:16px/.test(css(P + ".col-bookmark-icon svg")), "glyph is 16px");
  assert(/padding-right/.test(css(P + ".log-row.row-bookmarked > .col-thread")), "thread text stops before the icon");
  const ring = css(P + ".log-row.row-bookmarked");
  assert(/box-shadow:inset/.test(ring) && !/border|padding|height/.test(ring), "ring is an inset box-shadow only (card height contract)");
  assert(/box-shadow/.test(css(P + ".log-row.row-bookmarked.selected")) && /var\(--accent\)/.test(css(P + ".log-row.row-bookmarked.selected")), "selected + bookmarked keeps the selected ring");
  assert(!rules.some(r => r.sels.some(s => /row-bookmarked/.test(s) && !/^body\.layout-phone\s/.test(s))), "every bookmark-ring rule is scoped to the phone tier");

  section("phone-card-bookmark-marker b. Rendered card");
  const f = await w.addFile("bm.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  w.render();
  const e0 = f.entries[0];
  const rowOf = () => d.querySelector('#tableRows [data-entry-id="' + e0.id + '"]');
  const before = rowOf().style.height;
  assert(!rowOf().classList.contains("row-bookmarked"), "not bookmarked yet");
  w.toggleBookmark(e0.id);
  w.render();
  assert(rowOf().classList.contains("row-bookmarked") && rowOf().querySelector(".col-bookmark-icon svg"), "bookmarked card has the class and the glyph");
  assert(rowOf().style.height === before, "card height unchanged by the bookmark (" + before + ")");
});
