// GROUP tree-info-submenu-details — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP tree-info-submenu-details — tree context menu "Info" submenu
   Origin: 2026-10-06 (phone usability round, step A1). Placement goes through
   placeSubmenuBesideAnchor (never over its own "Info" trigger, phone included),
   touch opens on the click only, and the bubble now carries Type / Entries
   (+ Format / Time span for a file root) rows built when it opens.
   jsdom has no layout: rects are stubbed on the anchor / menu.
   ============================================================ */
group("tree-info-submenu-details");

const tidRect = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
const tidOverlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const tidRows = d => [...d.querySelectorAll("#treeCtxInfoMenu .ctx-info-row")].map(r => [r.querySelector(".ctx-info-k").textContent, r.querySelector(".ctx-info-v").textContent]);

await withApp(async (w, d, T) => {
  section("tree-info-submenu-details a. Rows for a file root and a filter");
  const f = await w.addFile("info.log", makeLog(0, 12), () => {});
  const flt = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = f.id; w.render();

  const open = id => {
    w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, id);
    return d.querySelector('#treeContextMenu [data-action="info"]');
  };
  let trig = open(f.id);
  assert(trig && !trig.hasAttribute("data-info-text"), "the trigger no longer carries the text in a data attribute");
  fireClick(trig, w);
  let rows = Object.fromEntries(tidRows(d));
  const n = f.entries.length.toLocaleString("de-DE");
  assert(rows.Type === "File", "file Type row, got " + JSON.stringify(rows));
  assert(rows.Entries === n + " / " + n, "file Entries row, got " + rows.Entries);
  assert(rows.Format && rows.Format === w.findLogFormat(f.formatId).name, "file Format row shows the format name, got " + rows.Format);
  const ts = f.entries.map(e => e.ts).filter(Number.isFinite);
  const lo = w.formatTime(Math.min(...ts));
  assert(rows["Time span"] && rows["Time span"].startsWith(lo + " → "), "file Time span starts with the first timestamp, got " + rows["Time span"]);
  assert(d.querySelector("#treeCtxInfoMenu .ctx-meta").textContent === "info.log", "the name is still shown");

  trig = open(flt.id);
  fireClick(trig, w);
  rows = Object.fromEntries(tidRows(d));
  const shown = w.getEntries(flt.id).length.toLocaleString("de-DE");
  assert(rows.Type === "Filter" && rows.Entries === shown + " / " + n, "filter rows, got " + JSON.stringify(rows));
  assert(!("Format" in rows) && !("Time span" in rows), "filter has no Format / Time span rows");

  section("tree-info-submenu-details b. All text is escaped");
  const evil = w.createFilterNode(f.id, "text", "<img src=x onerror=alert(1)>");
  fireClick(open(evil.id), w);
  assert(!d.querySelector("#treeCtxInfoMenu img") && d.querySelector("#treeCtxInfoMenu").textContent.includes("<img"), "markup in the name stays text");
});

await withApp(async (w, d, T) => {
  section("tree-info-submenu-details c. Placement never covers the trigger; touch opens on click only");
  const f = await w.addFile("pos.log", makeLog(0, 8), () => {});
  T.state.activeId = f.id; w.render();
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, f.id);
  const trig = d.querySelector('#treeContextMenu [data-action="info"]');
  const menu = d.querySelector("#treeCtxInfoMenu");
  Object.defineProperty(menu, "offsetWidth", { configurable: true, get: () => 260 });
  Object.defineProperty(menu, "offsetHeight", { configurable: true, get: () => 150 });
  const place = (vw, vh, r) => {
    w.innerWidth = vw; w.innerHeight = vh;
    trig.getBoundingClientRect = () => r;
    fireClick(trig, w);
    const left = parseFloat(menu.style.left), top = parseFloat(menu.style.top);
    return tidRect(left, top, left + 260, top + 150);
  };
  let r = tidRect(10, 100, 250, 144);
  assert(place(1280, 800, r).left === 250, "desktop: beside (right of) the trigger");
  assert(!tidOverlap(place(1280, 800, r), r), "desktop: no overlap");
  r = tidRect(8, 300, 238, 344); // phone 390x844: 238 + 260 > 386, nothing left of it
  const pr = place(390, 844, r);
  assert(!tidOverlap(pr, r), "phone 390x844: submenu does not cover the Info trigger, got " + JSON.stringify(pr));
  assert(pr.left >= 0 && pr.right <= 390 && pr.top >= 0 && pr.bottom <= 844, "phone: inside the viewport");

  menu.classList.add("hidden");
  const ptr = (type, pt) => { const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, "pointerType", { value: pt }); return ev; };
  trig.dispatchEvent(ptr("pointerdown", "touch"));
  trig.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  assert(menu.classList.contains("hidden"), "touch: the synthesized mouseover does not open the submenu");
  fireClick(trig, w);
  assert(!menu.classList.contains("hidden"), "touch: the click opens it");
  menu.classList.add("hidden");
  trig.dispatchEvent(ptr("pointerover", "mouse"));
  trig.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  assert(!menu.classList.contains("hidden"), "mouse: hover still opens it");
});
