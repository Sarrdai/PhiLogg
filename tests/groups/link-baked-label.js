// GROUP link-baked-label — a custom filter name (rename) travels into the baked
// condition, so a link built from renamed filters is named by those labels.
// Origin: 2026-10-05 (person-reported: the link dialog ignored a picked filter's custom label).
group("link-baked-label");

if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourLog = TOUR.demoLog();
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const side = (d, i) => d.querySelectorAll("#linkSides .link-side")[i];

  async function twoFilters(w, rename) {
    const f = await w.addFile("app.log", tourLog, () => {});
    const a = w.createFilterNode(f.id, "text", "Move requested");
    const b = w.createFilterNode(f.id, "text", "Position reached");
    if (rename) { w.renameFilterNodeWithUndo(a.id, "Start of move"); w.renameFilterNodeWithUndo(b.id, "Arrived"); }
    w.render();
    return { f, a, b };
  }

  await withApp(async (w, d, T) => {
    section("link-baked-label a. a link from two renamed filters is named by their labels");
    const { f, a, b } = await twoFilters(w, true);
    assert(w.bakeNodeCondition(a).label === "Start of move", "bakeNodeCondition copies the label");
    w.openLinkDialog({ rootId: f.id, start: { nodeId: a.id }, hops: [{ nodeId: b.id }] });
    assert(txt(side(d, 0).querySelector(".link-side-chip")).includes("Start of move") && txt(side(d, 1).querySelector(".link-side-chip")).includes("Arrived"), "chips show the labels");
    await waitFor(() => /pairs/.test(d.querySelector("#linkLiveMatch").textContent));
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(node.filterType === "link" && node.name.includes("Start of move") && node.name.includes("Arrived") && !node.name.includes("Move requested"),
      "link node name uses both labels, got: " + node.name);
    assert(node.bakedA.label === "Start of move" && node.bakedB.label === "Arrived", "baked sides carry the labels");
    assert(w.getEntries(node.id).length === 192, "matching unchanged: 192 pairs, got " + w.getEntries(node.id).length);

    section("link-baked-label b. Edit link keeps the named chip (not a text field)");
    w.openLinkDialog(w.linkSpecFromNode(node));
    assert(side(d, 0).querySelector(".link-side-chip") && !side(d, 0).querySelector("input"), "start stays a chip");
    assert(txt(side(d, 0).querySelector(".link-side-chip")).includes("Start of move") && txt(side(d, 1).querySelector(".link-side-chip")).includes("Arrived"), "edit dialog shows the labels");
    w.closeLinkDialog();

    section("link-baked-label c. Unpack gives the materialized nodes their labels back");
    w.unpackAndOrLinkNode(node.id);
    const sibs = T.state.nodes[node.parentId].children.map(id => T.state.nodes[id]);
    const un = sibs.filter(n => n.id !== a.id && n.id !== b.id && n.id !== node.id && n.filterType === "text");
    assert(un.length === 2 && un.map(n => n.label).sort().join() === "Arrived,Start of move", "unpacked nodes carry label: " + un.map(n => n.label));
    assert(un.every(n => /^“/.test(n.name)), "their name is still the condition");

    section("link-baked-label d. filter file and session export keep the label");
    const branch = w.serializeFilterBranch(node.id, false);
    const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
    assert(json.includes('"label":"Start of move"'), "filter file JSON holds the baked label");
    const sess = JSON.stringify(w.buildSessionExport([f.id], new Set()));
    assert(sess.includes('"label":"Start of move"') && sess.includes('"label":"Arrived"'), "session export holds the baked labels");
    const f2 = await w.addFile("other.log", tourLog, () => {});
    T.state.activeId = f2.id;
    w.importFilterBranchJson(json);
    const imp = T.state.nodes[T.state.activeId];
    assert(imp.filterType === "link" && imp.bakedA.label === "Start of move" && imp.bakedB.label === "Arrived", "an imported filter file restores the baked labels");
    assert(imp.name.includes("Arrived"), "and its name");
  });

  await withApp(async (w, d, T) => {
    section("link-baked-label e. unrenamed filters stay named from their condition");
    const { f, a, b } = await twoFilters(w, false);
    assert(w.bakeNodeCondition(a).label === undefined, "no label on the baked condition");
    w.openLinkDialog({ rootId: f.id, start: { nodeId: a.id }, hops: [{ nodeId: b.id }] });
    await waitFor(() => /pairs/.test(d.querySelector("#linkLiveMatch").textContent));
    fireClick(d.querySelector("#linkDialogCreate"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(node.name.includes("Move requested") && node.name.includes("Position reached"), "name from the conditions, got: " + node.name);
    w.openLinkDialog(w.linkSpecFromNode(node));
    assert(txt(side(d, 0).querySelector(".link-side-chip")).includes("“Move requested”"), "edit dialog chip still shows the condition name");
    w.closeLinkDialog();
  });
}
