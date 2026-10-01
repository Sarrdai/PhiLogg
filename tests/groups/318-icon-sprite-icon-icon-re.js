// GROUP 318 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 318 — Icon sprite (icon(), ICON_* re-pointing, AND/OR tree icons)
   Origin: 2026-09-28. One hidden <svg> sprite at the top of <body> holds the
   approved <symbol id="i-…"> drawings; icon(name) references one via <use>.
   ICON_FILE/FILTER/RENAME/EDIT/INVERT/LINK/MERGE/CLOCK/BOOK/DISK/GEAR/CLOSE/
   ELLIPSIS now call it; ICON_COMBINE is split into ICON_AND / ICON_OR.
   ============================================================ */
group(318);
await withApp(async (w, d, T) => {
  section("318. sprite has every symbol; icon() markup; ICON_* migrated; AND/OR nodes get their own icon + tint class");
  const NAMES = "file filter rename edit not and or link merge clock book bookplus gear x more star starf search chev import export trash".split(" ");
  const sprite = d.querySelector("body > svg#iconSprite");
  assert(sprite, "a sprite <svg> sits at the top of <body>");
  // jsdom has no layout, so this asserts the inline style that takes the sprite out of flow. `hidden` does NOT hide an <svg> in Chromium
  // (it left a 15px line box that pushed #main down and made the whole app overflow the viewport); display:none would break <use> gradients.
  const sst = sprite.getAttribute("style") || "";
  assert(/position:\s*absolute/.test(sst) && /width:\s*0/.test(sst) && /height:\s*0/.test(sst) && /overflow:\s*hidden/.test(sst), "sprite is out of layout flow (position:absolute, 0x0, overflow:hidden), got " + sst);
  assert(!/display:\s*none/.test(sst), "sprite is not display:none");
  NAMES.forEach(n => { const s = sprite.querySelector("symbol#i-" + n); assert(s && s.getAttribute("viewBox") === "0 0 16 16", "symbol i-" + n + " present on a 16x16 grid"); });
  assert(w.icon("and") === '<svg class="icon" aria-hidden="true"><use href="#i-and"/></svg>', "icon(name) markup");
  assert(w.icon("x", "icon-xs").includes('class="icon icon-xs"'), "icon(name, cls) appends the class");
  const use = n => (w.eval(n).match(/href="#i-([a-z-]+)"/) || [])[1];
  const expect = { ICON_FILE: "file", ICON_FILTER: "filter", ICON_RENAME: "rename", ICON_EDIT: "edit", ICON_INVERT: "not", ICON_LINK: "link",
    ICON_MERGE: "merge", ICON_CLOCK: "clock", ICON_BOOK: "book", ICON_DISK: "bookplus", ICON_GEAR: "gear", ICON_CLOSE: "x",
    ICON_ELLIPSIS: "more", ICON_AND: "and", ICON_OR: "or" };
  Object.keys(expect).forEach(k => assert(use(k) === expect[k], k + " -> #i-" + expect[k] + ", got " + use(k)));
  assert(w.eval("typeof ICON_COMBINE") === "undefined", "ICON_COMBINE is gone (split into ICON_AND / ICON_OR)");

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  const andN = w.createAndOrNode([t1.id, t2.id], "and");
  const orN = w.createAndOrNode([t1.id, t2.id], "or");
  assert(w.nodeIconHTML(andN).includes("#i-and") && w.nodeIconHTML(orN).includes("#i-or"), "nodeIconHTML: AND -> and icon, OR -> or icon");
  w.render();
  const rows = [...d.querySelectorAll("#tree .tree-row")];
  assert(rows.some(r => r.classList.contains("filter-and")) && rows.some(r => r.classList.contains("filter-or")), "AND/OR tree rows carry filter-and / filter-or (icon tint hook)");
  const bulk = w.describeBulkActions([t1, t2]).actions;
  assert(bulk.find(a => a.action === "and").icon === w.eval("ICON_AND") && bulk.find(a => a.action === "or").icon === w.eval("ICON_OR"), "describeBulkActions uses ICON_AND / ICON_OR");

  // Every ICON_* constant in the page script goes through icon() (FEATURE_BACKLOG #93): no inline <svg viewBox/width/stroke attributes left,
  // and each referenced sprite symbol exists.
  const constNames = [...html.matchAll(/^const (ICON_[A-Z_0-9]+) = /gm)].map(m => m[1]);
  assert(constNames.length >= 60, "found the ICON_* constants in the page source, got " + constNames.length);
  constNames.forEach(k => {
    const v = w.eval(k);
    assert(!/viewBox|width=|stroke-width=/.test(v), k + " carries no inline svg sizing/stroke attributes");
    const ref = (v.match(/^<svg class="icon[^"]*" aria-hidden="true"><use href="#i-([a-z-]+)"\/><\/svg>$/) || [])[1];
    assert(ref && sprite.querySelector("symbol#i-" + ref), k + " -> existing sprite symbol, got " + ref);
  });
  // Badge symbols keep their letter / plus inside the symbol; filled glyph keeps its own fill.
  const symHtml = n => sprite.querySelector("symbol#i-" + n).innerHTML;
  [["file-auto", ">A<"], ["file-partial", ">P<"], ["merge-window", ">W<"]].forEach(([n, t]) =>
    assert(symHtml(n).includes("<text") && symHtml(n).includes(t) && symHtml(n).includes('fill="var(--bg-panel)"'), "badge symbol i-" + n + " keeps its circled letter"));
  assert(symHtml("filter-plus").includes("var(--bg-panel)") && symHtml("filter-plus").includes("#i-filter"), "filter-plus is the funnel plus a circled + badge");
  assert(symHtml("bookmark-filled").includes('fill="currentColor"'), "bookmark-filled is a filled glyph");
  // Distinct glyphs stay distinct symbols (caret vs panel chevron, load vs save, before/after arrows).
  assert(use("ICON_CARET_LEFT") !== use("ICON_CHEVRON_LEFT") && use("ICON_SAVE") !== use("ICON_LOAD") && use("ICON_TIME_BEFORE") !== use("ICON_TIME_AFTER"), "distinct glyphs keep distinct symbols");
  assert(use("ICON_FILE_PATH_LINKS") === "link", "ICON_FILE_PATH_LINKS reuses the link symbol (identical glyph)");
});
