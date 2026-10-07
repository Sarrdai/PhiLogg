// GROUP add-badge — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP add-badge — one shared "add badge" (accent disc + plus on the icon's
   bottom-right) on exactly four "creates something new" buttons: New (funnel),
   #btnOpen (file), "Add to library…" (book) and "Add level filter" (level
   dots). No badge on any other #viewBar / sidebar-toolbar button.
   Origin: 2026-10-07 (person-requested, concept-mockup decision).
   ============================================================ */
group("add-badge");

await withApp(async (w, d, T) => {
  section("add-badge a. exactly the four buttons carry one badge, with their object icon");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const flt = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = flt.id; T.state.multiSelect = new Set([flt.id]);
  w.render();
  const one = (btn, what) => {
    assert(btn, what + ": button exists");
    assert(btn.querySelectorAll(".add-badge").length === 1, what + ": exactly one badge");
    const badge = btn.querySelector(".add-badge");
    assert(badge.getAttribute("aria-hidden") === "true", what + ": badge is aria-hidden");
    assert(badge.parentElement.classList.contains("add-badge-wrap"), what + ": badge sits in the icon wrapper");
    assert(badge.parentElement.querySelector("svg:not(.add-badge svg)"), what + ": wrapper holds the icon");
    assert(w.getComputedStyle(badge).pointerEvents === "none", what + ": badge ignores pointer events");
    return btn;
  };
  const nw = one(d.querySelector('#viewbarNew [data-row-action="newFilter"]'), "New");
  assert(nw.querySelector('svg.icon use[href="#i-filter"]'), "New shows the funnel");
  assert(!nw.querySelector('path[d="M8 3.5v9M3.5 8h9"]'), "no plain '+' path left in New");
  assert(nw.title === "New", "New tooltip unchanged");
  const op = one(d.querySelector("#btnOpen"), "#btnOpen");
  assert(op.querySelector('path[d="M4 1.5h5.5L12.5 4.5V14.5H4Z"]'), "#btnOpen shows the file glyph");
  assert(!op.querySelector('path[d="M8 2.5v11M2.5 8h11"]'), "no plain '+' in #btnOpen");
  assert(op.querySelector(".btn-short-label").textContent === "Open", "phone short label stays 'Open'");
  const bs = w.getComputedStyle(op.querySelector(".add-badge"));
  assert(bs.width === "9px", "badge in the 24px header button is 9px, got " + bs.width);
  const lib = one(d.querySelector('#sidebarToolbar [data-row-action="addToLibrary"]'), "Add to library…");
  assert(lib.querySelector('svg.icon use[href="#i-book"]'), "Add to library… shows the plain book");
  assert(!lib.querySelector('use[href="#i-bookplus"]'), "no bookplus left there");
  const lv = one(d.querySelector("#btnApplyLevelToTree"), "Add level filter");
  assert(lv.querySelector('svg.icon use[href="#i-level"]'), "Add level filter keeps the level dots");
  assert(w.getComputedStyle(lv.querySelector(".add-badge")).width === "11px", "badge elsewhere is 11px");
  // On #viewBar's circles the badge anchors to the 28px .row-action-hit (button edge),
  // not the 13px icon, so it covers none of the glyph (the level icon's INFO dot).
  const pos = e => w.getComputedStyle(e).position;
  for (const [btn, what] of [[lv, "Add level filter"], [nw, "New"]]) {
    const b = btn.querySelector(".add-badge");
    assert(pos(b.parentElement) === "static" && pos(b.closest(".row-action-hit")) === "relative",
      what + ": badge positioned against .row-action-hit (wrap static, hit relative)");
  }
  for (const [btn, what] of [[op, "#btnOpen"], [lib, "Add to library…"]])
    assert(pos(btn.querySelector(".add-badge-wrap")) === "relative", what + " (borderless): badge positioned against the icon wrapper");

  // Nothing else gets one.
  assert(d.querySelectorAll("#viewBar .add-badge").length === 2, "#viewBar holds exactly two badges (level + New)");
  assert(!d.querySelector('#viewBar [data-row-actions="viewbar"] .add-badge'), "none on Before/After/Time range/Message/Extract");
  assert(d.querySelectorAll("#sidebarToolbar .add-badge").length === 1, "sidebar toolbar holds exactly one badge");
  assert(!d.querySelector(".ctx-menu .add-badge, #openMenu .add-badge"), "none in menus");
  assert(d.querySelectorAll(".add-badge").length === 4, "four badges in the whole page, got " + d.querySelectorAll(".add-badge").length);

  // Re-render of the sidebar toolbar keeps it at one.
  const flt2 = w.createFilterNode(f.id, "text", "message 2");
  T.state.activeId = flt2.id; T.state.multiSelect = new Set([flt2.id]);
  w.render();
  assert(d.querySelectorAll('#sidebarToolbar [data-row-action="addToLibrary"] .add-badge').length === 1, "still one badge after selection change");
  assert(d.querySelectorAll("#sidebarToolbar .add-badge").length === 1, "still one in the toolbar overall");
});
