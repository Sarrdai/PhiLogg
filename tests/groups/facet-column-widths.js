// GROUP facet-column-widths — facet columns are sized by their content when they fit on one row.
// Origin: 2026-10-06 usability round E3.
group("facet-column-widths");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("facet-column-widths a. facetColumnTemplate");
    assert(w.facetColumnTemplate([200, 400], 800) === "minmax(200px, 200fr) minmax(400px, 400fr)", "fits: weighted template, got " + w.facetColumnTemplate([200, 400], 800));
    assert(w.facetColumnTemplate([200, 400], 600) !== null, "exactly fitting still fits");
    assert(w.facetColumnTemplate([300, 400], 600) === null, "too wide: null (default wrapping grid)");
    assert(w.facetColumnTemplate([], 600) === null && w.facetColumnTemplate([200], 0) === null, "nothing to size / no width: null");

    section("facet-column-widths b. needs are clamped to [90, 320] + row overhead");
    const body = d.querySelector("#facetPanelBody");
    const oh = 28 + 8 + 42 + 30 + 12 + 1;
    const [file] = LOGSIM.generateToStrings({ format: "default", entries: 200, seed: 3 });
    const f = await w.addFile(file.name, file.text, () => {});
    T.state.activeId = f.id;
    // jsdom has no layout: stub the probe width through offsetWidth and the body width.
    Object.defineProperty(body, "clientWidth", { configurable: true, get: () => 3000 });
    let probeW = 10;
    Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return this.classList && this.classList.contains("facet-value-name") ? probeW : 0; } });
    fireClick(d.querySelector("#lowerTabFacets"), w);
    await waitFor(() => body.querySelector(".facet-section"));
    const render = () => w.renderFacetPanel();
    render();
    let needs = body._facetNeeds;
    assert(needs && needs.length > 0 && needs.every(n => n === 90 + oh), "very short names clamp to 90, got " + JSON.stringify(needs));
    probeW = 5000;
    render();
    assert(body._facetNeeds.every(n => n === 320 + oh), "very long names clamp to 320, got " + JSON.stringify(body._facetNeeds));
    assert(/^minmax\(/.test(body.style.gridTemplateColumns), "fits at 3000px: explicit template, got " + body.style.gridTemplateColumns);
    Object.defineProperty(body, "clientWidth", { configurable: true, get: () => 300 });
    w.facetApplyColumns();
    assert(body.style.gridTemplateColumns === "", "too narrow: default grid restored");
  });
}
