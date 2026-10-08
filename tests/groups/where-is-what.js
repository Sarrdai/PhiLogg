// GROUP where-is-what — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP where-is-what — the "Where is what" overlay and its first-start hint
   Origin: 2026-10-08 (label concept, step 3). WHERE_IS_WHAT is one table of
   {sel, label, side}; showWhereIsWhat() dims the window and draws one numbered
   callout per visible region (hidden/absent ones skipped, of a `group` only
   the first visible one). Esc / click / the help button close it and focus
   returns to the opener; `?` and F1 open it unless a text field has focus.
   Phone tier: no button, no overlay. The hint "New here? See where everything
   is." shows once after the first log (flag philogg-where-is-what-seen; the
   shared harness pre-sets the flag, this group opts in with whereHint:true).
   jsdom has no layout: the placement rule runs as a pure function on rects
   taken from the real app (headless Chromium, 1440x900 and 1100x800).
   ============================================================ */
group("where-is-what");

// Region rects ([side, left, top, right, bottom, calloutW, calloutH]) as
// measured in the real app at both sizes, scene docs/screenshots/scenes/11.
const REAL_LAYOUTS = {
  "1440x900": { W: 1440, H: 900, foot: {x:623,y:866,w:194,h:26},
    items: [
      ["in", 0, 121, 270, 900, 140, 26],
      ["bottom", 0, 84, 270, 121, 207, 26],
      ["top", 174, 55, 198, 79, 98, 26],
      ["top", 206, 55, 230, 79, 115, 26],
      ["top", 277, 50, 1440, 120, 252, 39],
      ["bottom", 293, 128, 593, 156, 74, 26],
      ["bottom", 607, 128, 843, 156, 100, 26],
      ["bottom", 852, 128, 1008, 156, 176, 26],
      ["bottom", 1091, 128, 1119, 156, 95, 26],
      ["inr", 277, 165, 1440, 201, 128, 26],
      ["in", 277, 232, 1440, 703, 104, 26],
      ["in", 277, 710, 1440, 900, 212, 39],
      ["bottom", 1186, 11, 1248, 39, 107, 26],
      ["bottom", 1264, 11, 1292, 39, 121, 26],
      ["bottom", 1308, 11, 1336, 39, 108, 26],
      ["bottom", 1396, 11, 1424, 39, 87, 26],
    ] },
  "1100x800": { W: 1100, H: 800, foot: {x:453,y:766,w:194,h:26},
    items: [
      ["in", 0, 121, 270, 800, 140, 26],
      ["bottom", 0, 84, 270, 121, 207, 26],
      ["top", 174, 55, 198, 79, 98, 26],
      ["top", 206, 55, 230, 79, 115, 26],
      ["top", 277, 50, 1100, 120, 252, 39],
      ["bottom", 293, 128, 593, 156, 74, 26],
      ["bottom", 607, 128, 843, 156, 100, 26],
      ["bottom", 852, 128, 1008, 156, 176, 26],
      ["bottom", 293, 162, 321, 190, 95, 26],
      ["inr", 277, 199, 1100, 235, 128, 26],
      ["in", 277, 266, 1100, 603, 104, 26],
      ["in", 277, 610, 1100, 800, 212, 39],
      ["bottom", 846, 11, 908, 39, 107, 26],
      ["bottom", 924, 11, 952, 39, 121, 26],
      ["bottom", 968, 11, 996, 39, 108, 26],
      ["bottom", 1056, 11, 1084, 39, 87, 26],
    ] },

};

await withApp(async (w, d, T) => {
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 400, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const err = w.createFilterNode(f.id, "level", ["ERROR"]);
  T.state.activeId = err.id;
  w.render();
  const key = (k, extra, target) => (target || d).dispatchEvent(new w.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})));
  const overlay = d.getElementById("whereIsWhat");
  const open = () => !overlay.classList.contains("hidden");
  const TABLE = w.eval("WHERE_IS_WHAT");

  section("where-is-what a. The table: every selector matches at most one element, enough regions are visible");
  assert(TABLE.length >= 15, "table has the regions, got " + TABLE.length);
  TABLE.forEach(e => assert(d.querySelectorAll(e.sel).length <= 1, e.sel + " resolves to at most one element"));
  assert(new Set(TABLE.map(e => e.sel)).size === TABLE.length, "no selector listed twice");
  TABLE.forEach(e => assert(e.label && e.label.split(/\s+/).length <= 5 && ["top", "bottom", "left", "right", "in", "inr"].includes(e.side), e.sel + ": 1-5 word label and a known side"));
  const regions = w.whereCurrentRegions();
  assert(regions.length >= 8, "at least 8 regions visible in a loaded desktop layout, got " + regions.length);
  const groups = regions.map(r => r.entry.group).filter(Boolean);
  assert(groups.length === new Set(groups).size, "one region per group (toolbar, rows)");
  assert(regions.every(r => !r.el.closest(".hidden")), "no hidden element is drawn");

  section("where-is-what b. Header button, title and the fixed-shortcut row");
  const btn = d.getElementById("btnHelp");
  assert(btn && btn.title.startsWith("Where is what?") && btn.getAttribute("aria-label") === "Where is what?", "help button with title/aria-label");
  assert(btn.nextElementSibling === d.getElementById("btnSettings"), "sits right before Settings");
  assert(overlay.getAttribute("role") === "dialog" && overlay.getAttribute("aria-label") === "Where is what" && !overlay.hasAttribute("aria-modal"), "role=dialog, labelled, not aria-modal");
  assert(w.eval("FIXED_SHORTCUTS.some(f => f.display && f.display.includes('?') && f.display.includes('F1'))"), "listed in Settings -> Shortcuts (fixed)");
  assert(!open(), "closed at start");

  section("where-is-what c. Open via the button: one callout per visible region, screen-reader list, focus");
  btn.focus();
  fireClick(btn, w);
  assert(open(), "overlay is open");
  const pills = d.querySelectorAll("#whereIsWhat .wiw-callout:not(.wiw-foot)");
  const expected = w.whereCurrentRegions().length;
  assert(pills.length === expected && expected >= 8, "one callout per visible region: " + pills.length + "/" + expected);
  assert([...pills].map(p => p.querySelector(".wiw-num").textContent).join() === Array.from({ length: expected }, (_, i) => i + 1).join(), "numbered 1..N");
  assert(pills[0].parentElement.getAttribute("aria-hidden") === "true", "callouts are aria-hidden");
  const sr = [...d.querySelectorAll("#whereIsWhat .wiw-sr li")].map(li => li.textContent);
  assert(sr.length === expected && sr.some(t => t.startsWith("Level filter")), "visually hidden list names the regions");
  assert(d.activeElement === overlay, "focus moves into the overlay");
  assert(d.querySelectorAll("#whereIsWhat .wiw-box").length === expected, "one outline per region");
  assert(btn.getAttribute("aria-expanded") === "true", "button reports it");
  key("F1");
  assert(!open(), "F1 while open closes it again");
  assert(d.activeElement === btn, "focus returns to the opener (the button)");

  section("where-is-what d. Esc, click anywhere, and the button close it; focus returns");
  fireClick(btn, w); assert(open(), "open again");
  key("Escape");
  assert(!open() && d.activeElement === btn, "Esc closes, focus on the button");
  const row = d.querySelector("#tree .tree-row, #tree [data-node-id]") || d.querySelector("#tree > *");
  row.setAttribute("tabindex", "0"); row.focus();
  w.showWhereIsWhat(); assert(open(), "global showWhereIsWhat() opens");
  fireClick(overlay, w);
  assert(!open() && d.activeElement === row, "click closes, focus returns to what had it");
  w.showWhereIsWhat();
  assert(open(), "reopened");
  fireClick(btn, w);
  assert(!open(), "the button toggles it closed");
  w.showWhereIsWhat(); w.hideWhereIsWhat();
  assert(!open() && overlay.childNodes.length === 0, "hideWhereIsWhat() closes and clears the overlay");

  section("where-is-what e. ? and F1 open it, except inside text fields or with modifiers");
  d.body.focus && d.body.focus();
  key("?", { shiftKey: true });
  assert(open(), "? opens");
  key("Escape");
  const input = d.getElementById("findInput");
  input.classList.remove("hidden"); input.focus();
  key("?", { shiftKey: true }, input);
  assert(!open(), "? inside an input does nothing");
  const ta = d.createElement("textarea"); d.body.appendChild(ta); ta.focus();
  key("?", { shiftKey: true }, ta);
  assert(!open(), "? inside a textarea does nothing");
  ta.remove();
  const ce = d.createElement("div"); ce.setAttribute("contenteditable", "true");
  Object.defineProperty(ce, "isContentEditable", { value: true }); ce.tabIndex = 0; d.body.appendChild(ce); ce.focus();
  key("?", { shiftKey: true }, ce);
  assert(!open(), "? inside a contenteditable does nothing");
  ce.remove(); input.blur(); d.body.focus && d.body.focus();
  key("?", { ctrlKey: true });
  assert(!open(), "Ctrl+? does nothing");
  key("F1");
  assert(open(), "F1 opens"); key("Escape"); assert(!open(), "closed");

  section("where-is-what f. Hidden regions are skipped");
  const before = w.whereCurrentRegions().length;
  d.getElementById("timelineMinimap").classList.add("hidden");
  const mini = w.whereCurrentRegions();
  assert(before - mini.length === 1 && !mini.some(r => r.entry.sel === "#timelineMinimap"), "a hidden minimap is not a region");
  d.getElementById("timelineMinimap").classList.remove("hidden");

  section("where-is-what g. Phone tier: no button, no overlay, the key does nothing");
  d.body.classList.add("layout-phone");
  assert(w.getComputedStyle(btn).display === "none", "help button hidden on the phone");
  w.showWhereIsWhat();
  assert(!open(), "showWhereIsWhat() has no effect on the phone");
  key("?", { shiftKey: true }); key("F1");
  assert(!open(), "? / F1 do nothing on the phone");
  d.body.classList.remove("layout-phone");
});

// ---- h. placement: no two callouts overlap (real rects, both sizes) ----
await withApp(async (w) => {
  section("where-is-what h. placeWhereCallouts: no overlaps, inside the window, deterministic");
  Object.keys(REAL_LAYOUTS).forEach(name => {
    const L = REAL_LAYOUTS[name];
    const items = L.items.map(([side, l, t, r, b, cw, ch]) => ({ side, rect: { left: l, top: t, right: r, bottom: b }, w: cw, h: ch }));
    const run = () => w.placeWhereCallouts(items, { w: L.W, h: L.H }, [L.foot]);
    const boxes = run();
    assert(boxes.length === items.length, name + ": one box per item");
    const all = boxes.concat([L.foot]);
    let overlaps = 0;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], c = all[j];
      if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) overlaps++;
    }
    assert(overlaps === 0, name + ": no two callouts intersect (" + overlaps + ")");
    assert(boxes.every(b => b.x >= 0 && b.y >= 0 && b.x + b.w <= L.W && b.y + b.h <= L.H), name + ": every callout inside the window");
    assert(JSON.stringify(run()) === JSON.stringify(boxes), name + ": deterministic");
  });
  // A crowd of identical regions still ends up without overlaps (nudging).
  const crowd = Array.from({ length: 12 }, () => ({ side: "bottom", rect: { left: 100, top: 100, right: 130, bottom: 120 }, w: 120, h: 26 }));
  const cb = w.placeWhereCallouts(crowd, { w: 800, h: 600 }, []);
  let bad = 0;
  for (let i = 0; i < cb.length; i++) for (let j = i + 1; j < cb.length; j++) if (cb[i].x < cb[j].x + cb[j].w && cb[j].x < cb[i].x + cb[i].w && cb[i].y < cb[j].y + cb[j].h && cb[j].y < cb[i].y + cb[i].h) bad++;
  assert(bad === 0, "twelve callouts for the same spot are nudged apart");
});

// ---- h2. root zoom (font scale): layout px vs. visual px ----
await withApp(async (w) => {
  section("where-is-what h2. whereZoomScale converts the zoomed overlay's layout px to visual px");
  assert(w.whereZoomScale(960, 1440) === 1.5, "150 %: 960 layout px = 1440 visual px");
  assert(Math.abs(w.whereZoomScale(1800, 1440) - 0.8) < 1e-9, "80 %: 1800 layout px = 1440 visual px");
  assert(w.whereZoomScale(0, 1440) === 1 && w.whereZoomScale(1440, 1440) === 1, "no layout (jsdom) / 100 %: 1");
  // Placement in visual px, converted back for left/top: a callout placed at x lands at x / z in the zoomed layer.
  const z = w.whereZoomScale(960, 1440);
  const [b] = w.placeWhereCallouts([{ side: "bottom", rect: { left: 1300, top: 20, right: 1430, bottom: 60 }, w: 150 * z, h: 24 * z }], { w: 1440, h: 900 }, []);
  assert(b.x + b.w <= 1440 - 4 && (b.x / z) + 150 <= 960, "callout stays inside the window after the layout-px conversion");
});

// ---- i. first-start hint ----
await withApp(async (w, d, T) => {
  section("where-is-what i. Hint: shown once after the first log, Show me opens the overlay, never again");
  const hint = d.getElementById("whereHint");
  assert(hint.classList.contains("hidden") && w.localStorage.getItem("philogg-where-is-what-seen") === null, "sanity: no flag, hint hidden before a log is loaded");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 7 });
  await w.addFile(sim.name, sim.text, () => {});
  assert(!hint.classList.contains("hidden"), "hint shows after the first log");
  assert(hint.textContent.includes("New here? See where everything is."), "text");
  assert([...hint.querySelectorAll("button")].map(b => b.textContent).join() === "Show me,Dismiss", "buttons Show me / Dismiss");
  assert(w.localStorage.getItem("philogg-where-is-what-seen") === null, "showing it does not set the flag");
  fireClick(d.getElementById("whereHintShow"), w);
  assert(!d.getElementById("whereIsWhat").classList.contains("hidden"), "Show me opens the overlay");
  assert(hint.classList.contains("hidden") && w.localStorage.getItem("philogg-where-is-what-seen") === "1", "hint gone, flag set");
  w.hideWhereIsWhat();
  const [sim2] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 8 });
  await w.addFile("second.log", sim2.text, () => {});
  assert(hint.classList.contains("hidden"), "not shown again for the next log");
}, { whereHint: true });
await withApp(async (w, d) => {
  section("where-is-what j. Dismiss sets the flag and does not open the overlay");
  const hint = d.getElementById("whereHint");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 7 });
  await w.addFile(sim.name, sim.text, () => {});
  assert(!hint.classList.contains("hidden"), "shown");
  fireClick(d.getElementById("whereHintDismiss"), w);
  assert(hint.classList.contains("hidden") && w.localStorage.getItem("philogg-where-is-what-seen") === "1", "Dismiss hides it and sets the flag");
  assert(!d.getElementById("whereIsWhat") || d.getElementById("whereIsWhat").classList.contains("hidden"), "Dismiss does not open the overlay");
}, { whereHint: true });
await withApp(async (w, d) => {
  section("where-is-what k. Opening the overlay by any means sets the flag and hides the hint");
  const hint = d.getElementById("whereHint");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 7 });
  await w.addFile(sim.name, sim.text, () => {});
  assert(!hint.classList.contains("hidden"), "shown");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true, cancelable: true }));
  assert(hint.classList.contains("hidden") && w.localStorage.getItem("philogg-where-is-what-seen") === "1", "? sets the flag and hides the hint");
}, { whereHint: true });
await withApp(async (w, d) => {
  section("where-is-what l. No hint on the phone tier or for ?session= deep links");
  d.body.classList.add("layout-phone");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 7 });
  await w.addFile(sim.name, sim.text, () => {});
  assert(d.getElementById("whereHint").classList.contains("hidden"), "phone: hidden");
}, { whereHint: true });
await withApp(async (w, d) => {
  section("where-is-what m. ?session= deep link: no hint");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 7 });
  await w.addFile(sim.name, sim.text, () => {});
  assert(d.getElementById("whereHint").classList.contains("hidden"), "deep link: hidden");
}, { whereHint: true, url: "http://localhost/philogg.html?session=tour.session.json" });
