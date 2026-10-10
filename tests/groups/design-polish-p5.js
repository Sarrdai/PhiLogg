// GROUP design-polish-p5 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p5 — header and brand mark (C2)
   Origin: 2026-10-10 design polish round, package P5. SVG brand mark (accent square, log lines,
   funnel) instead of the "L", version as a pill, header buttons are the plain ghost buttons,
   favicon uses the same mark.
   ============================================================ */
group("design-polish-p5");

await withApp(async (w, d, T) => {
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
  const body = sel => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = css.match(new RegExp("^\\s*" + esc + "\\s*\\{([^}]*)\\}", "m"));
    return m ? m[1] : "";
  };

  section("design-polish-p5 a. brand mark");
  const mark = d.querySelector("#toolbar .brand > svg.brand-mark");
  assert(!!mark, "brand mark is an inline SVG inside .brand");
  assert(mark.querySelector("rect") && mark.querySelectorAll("path").length === 2, "rect + lines path + funnel path");
  assert(mark.querySelector("rect").getAttribute("fill") === "var(--accent)", "square uses var(--accent)");
  assert(mark.innerHTML.includes("var(--accent-on)"), "lines and funnel use var(--accent-on)");
  assert(mark.getAttribute("aria-hidden") === "true", "decorative");
  assert(!d.querySelector("span.brand-mark") && !/^\s*L\s*$/.test(d.querySelector(".brand").firstElementChild.textContent), "no L text mark");
  assert(d.querySelector(".brand-row") === null, "no brand-row wrapper");

  section("design-polish-p5 b. version pill");
  const ver = body(".brand-version");
  assert(/border-radius:999px/.test(ver) && /color-mix\(in srgb, var\(--text-primary\) 6%, transparent\)/.test(ver) && /color:var\(--text-tertiary\)/.test(ver), "pill rule: " + ver);
  const kids = [...d.querySelector(".brand").children].map(c => c.id || c.getAttribute("class"));
  assert(kids.join() === "brand-mark,brand-name,brandVersion", "order: mark, name, version pill: " + kids.join());
  assert(/display:flex/.test(body(".brand")) && !/column/.test(body(".brand")), ".brand is a row");

  section("design-polish-p5 c. header buttons are the plain ghost buttons");
  assert(!/^\s*#toolbar \.toolbar-icon-btn/m.test(css), "no #toolbar .toolbar-icon-btn overrides left");
  const rest = body(".toolbar-icon-btn");
  assert(/border:0/.test(rest) && /border-radius:6px/.test(rest), "base rule: no border, 6px radius");
  ["btnUndo", "btnExport", "btnFindPhone", "btnHelp", "btnSettings"].forEach(id =>
    assert(d.getElementById(id).classList.contains("toolbar-icon-btn"), "#" + id + " uses the shared ghost class"));
  assert(/width:1px/.test(body("#navHistoryGroup::before, #hdrHistory::after")) || /#hdrHistory::after/.test(css), "hairline separators between header groups");

  section("design-polish-p5 d. favicon");
  const fav = d.querySelector('link[rel="icon"]');
  assert(!!fav && decodeURIComponent(fav.getAttribute("href")).includes("M15.5 15.5h6"), "favicon link carries the brand mark (funnel path)");
  assert(/%234fc7c3|#4fc7c3/.test(fav.getAttribute("href")), "favicon uses literal colors");
});
