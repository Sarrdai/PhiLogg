// GROUP facets-grid-align — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP facets-grid-align — the Facets grid packs its rows at the top
   Origin: 2026-10-13 (backlog #128). In a bottom panel taller than its sections the
   #facetPanelBody grid stretched its rows (align-content's default), so a link node's
   Facets showed a large empty band between the header line and the sections — it read
   as the Entry detail drawn over the Facets. jsdom has no layout, so this asserts the
   rule itself; the geometry was checked in headless Chromium (600px panel, gap 127 → 0).
   Simulator data only: `flows`, seed 7, 800 entries.
   ============================================================ */
group("facets-grid-align");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("facets-grid-align a. #facetPanelBody packs rows at the start, on a link node and a normal node");
    const [sim] = LOGSIM.generateToStrings({ scenarios: ["flows"], entries: 800, seed: 7 });
    const f = await w.addFile(sim.name, sim.text, () => {});
    const start = w.createFilterNode(f.id, "text", "Flow [*] started");
    const end = w.createFilterNode(f.id, "text", "Flow [*] ended");
    const link = w.createLinkNode(start.id, end.id, "after", 1);
    const body = d.querySelector("#facetPanelBody");
    for (const id of [link.id, f.id]) {
      T.state.activeId = id; T.state.entriesView = "filter";
      w.render(); w.setFacetsOpen(true);
      const cs = w.getComputedStyle(body);
      assert(cs.display === "grid", "Facets body is a grid (" + id + "): " + cs.display);
      assert(cs.alignContent === "start", "rows packed at the top, not stretched (" + id + "): " + cs.alignContent);
    }
  });
}
