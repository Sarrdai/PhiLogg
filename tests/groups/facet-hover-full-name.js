// GROUP facet-hover-full-name — hovering a truncated facet value shows its full name in place.
// Origin: 2026-10-13 (backlog #134). jsdom has no layout: clientWidth/scrollWidth of the name cells are stubbed;
// the geometry (name grows over bar/count/%, no column shift, no panel scrollbar) was checked in headless Chromium.
group("facet-hover-full-name");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("facet-hover-full-name a. only truncated names get .facet-trunc; hover swaps a shortened path to its full text");
    const [sim] = LOGSIM.generateToStrings({ format: "default", entries: 400, seed: 7 });
    const f = await w.addFile(sim.name, sim.text, () => {});
    T.state.activeId = f.id; w.render();
    const body = d.querySelector("#facetPanelBody");
    const CHAR = 7, CELL = 140; // 20 characters fit
    const isName = el => el.classList && el.classList.contains("facet-value-name");
    Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return isName(this) ? CELL : 0; } });
    Object.defineProperty(w.HTMLElement.prototype, "scrollWidth", { configurable: true, get() { return isName(this) ? this.textContent.length * CHAR : 0; } });
    w.setFacetsOpen(true);
    w.renderFacetPanel();
    const names = [...body.querySelectorAll(".facet-value-name")];
    const cut = names.filter(n => (n.dataset.full || n.textContent).length * CHAR > CELL);
    const fits = names.filter(n => (n.dataset.full || n.textContent).length * CHAR <= CELL);
    assert(cut.length > 0 && fits.length > 0, "sanity: simulator data has long and short values (" + cut.length + "/" + fits.length + ")");
    assert(cut.every(n => n.classList.contains("facet-trunc")), "every too-long value is flagged");
    assert(fits.every(n => !n.classList.contains("facet-trunc")), "no short value is flagged");
    const paths = cut.filter(n => n.classList.contains("facet-path"));
    const row = (paths[0] || cut[0]).closest(".facet-value");
    assert(row && /click: filter/.test(row.title), "row keeps its title hint");

    section("facet-hover-full-name b. mouseover / mouseout");
    const ev = (type, target, related) => { const e = new w.MouseEvent(type, { bubbles: true, relatedTarget: related || null }); target.dispatchEvent(e); };
    const target = paths[0] || cut[0];
    const shown = target.textContent, full = target.dataset.full != null ? target.dataset.full : shown;
    ev("mouseover", row.querySelector(".facet-count"), row.parentElement); // entering the row anywhere (here: its count cell)
    assert(target.textContent === full, "row hover shows the full text, got " + target.textContent);
    assert(/px$/.test(target.style.getPropertyValue("--facet-hover-max")), "hover width is clamped to the panel (--facet-hover-max)");
    ev("mouseout", target, row.parentElement);
    assert(target.textContent === shown, "mouseout restores the shortened text");
    assert(!target.style.getPropertyValue("--facet-hover-max"), "clamp removed");
    const plain = fits[0];
    ev("mouseover", plain, plain.closest(".facet-value").parentElement);
    assert(!plain.style.getPropertyValue("--facet-hover-max"), "non-truncated value: no hover effect");

    section("facet-hover-full-name c. CSS: opaque elevated background, above the count column, desktop hover only");
    const html = d.documentElement.innerHTML;
    assert(/\.facet-value:hover > \.facet-value-name\.facet-trunc\{[^}]*var\(--bg-elevated-2\)/.test(html) && /@media \(hover:hover\)/.test(html), "rule present");
    assert(/\.facet-value:hover > \.facet-value-name\.facet-trunc\{[^}]*z-index:3/.test(html), "z-index above the count / % columns");

    section("facet-hover-full-name d. re-render re-evaluates the flag");
    Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return isName(this) ? 100000 : 0; } });
    w.renderFacetPanel();
    assert(!body.querySelector(".facet-trunc"), "everything fits: no flags after re-render");
  });
}
