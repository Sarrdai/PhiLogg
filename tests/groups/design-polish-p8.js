// GROUP design-polish-p8 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p8 — native selects and checkboxes (C3)
   Origin: 2026-10-10 design polish round, package P8.
   ============================================================ */
group("design-polish-p8");

await withApp(async (w, d, T) => {
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
  const esc = sel => sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = sel => {
    const m = css.match(new RegExp("^\\s*" + esc(sel) + "\\s*\\{([^}]*)\\}", "m"));
    return m ? m[1] : "";
  };
  const cs = el => w.getComputedStyle(el);

  section("design-polish-p8 a. select rule: appearance none, 32px, border-soft, bg-popover, chevron");
  const sel = body("select");
  assert(/appearance:none/.test(sel), "select appearance none");
  assert(/height:32px/.test(sel), "select height 32px");
  assert(/font-family:var\(--font-ui\)/.test(sel), "select uses the UI font");
  assert(/border:1px solid var\(--border-soft\)/.test(sel) && /border-radius:6px/.test(sel), "1px border-soft, radius 6px");
  assert(/background-color:var\(--bg-popover\)/.test(sel), "bg-popover fill");
  assert(/linear-gradient\(.*var\(--text-secondary\)/.test(sel) && !/#[0-9a-f]{3,6}\b/i.test(sel), "chevron drawn from a token, no literal colors");
  assert(/select:focus-visible\{[^}]*outline:2px solid var\(--accent-strong\)/.test(css), "select focus-visible ring");

  section("design-polish-p8 b. checkbox rule: 16px box, accent when checked");
  const cb = body('input[type="checkbox"]');
  assert(/appearance:none/.test(cb) && /width:16px/.test(cb) && /height:16px/.test(cb), "checkbox 16px, appearance none");
  assert(/border:1px solid var\(--border\)/.test(cb) && /border-radius:4px/.test(cb), "1px border, radius 4");
  assert(/background:var\(--accent\)/.test(body('input[type="checkbox"]:checked')), "checked = accent fill");
  assert(/background:var\(--accent-on\)/.test(body('input[type="checkbox"]::after')) && /mask:url/.test(body('input[type="checkbox"]::after')), "check mark is an --accent-on SVG mask");
  assert(/input\[type="checkbox"\]:focus-visible/.test(css) && /input\[type="checkbox"\]:disabled\{/.test(css), "focus-visible ring and disabled state");

  section("design-polish-p8 c. real controls in the plot panel, computed look");
  const rows = [[0, 0, 0], [50, 25, 5], [100, 50, 10]];
  const log = rows.map(([x, y, z], i) =>
    `2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y} z=${z}"`
  ).join("\n") + "\n";
  const f = await w.addFile("p8.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int] z=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  const xs = d.querySelector("#plotXSelect");
  assert(xs && xs.tagName === "SELECT", "#plotXSelect is a real <select>");
  assert(cs(xs).appearance === "none" && cs(xs).height === "32px", "plot select computed: appearance none, 32px, got " + cs(xs).appearance + " " + cs(xs).height);
  assert(/gradient/.test(cs(xs).backgroundImage), "plot select shows the chevron");
  const boxes = [...d.querySelectorAll('#plotYList input[type="checkbox"]')];
  assert(boxes.length >= 2 && boxes.every(b => b.tagName === "INPUT" && b.type === "checkbox"), "Y list items are real checkboxes");
  assert(cs(boxes[0]).appearance === "none" && cs(boxes[0]).width === "16px" && cs(boxes[0]).height === "16px", "checkbox computed 16px, appearance none");
  const on = boxes.find(b => b.checked), off = boxes.find(b => !b.checked);
  assert(on && off, "some checked, some not");
  assert(on.matches(":checked") && !off.matches(":checked"), "the real :checked state drives the look");
  const unit = d.querySelector(".plot-y-unit");
  if (unit) assert(/text-tertiary/.test(body(".plot-y-unit")), "unit suffix in tertiary color");

  section("design-polish-p8 d. every select in the app keeps the chevron (no shorthand overrides)");
  const bad = [...d.querySelectorAll("select")].filter(s => !s.classList.contains("settings-seg-src") && !/gradient/.test(cs(s).backgroundImage)).map(s => s.id || s.className);
  assert(bad.length === 0, "selects without the chevron: " + bad.join());
  assert(!/accent-color/.test(body(".plot-y-item input")), "no leftover accent-color on plot checkboxes");
});
