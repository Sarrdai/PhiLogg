// GROUP 296 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 296 — Filter library presets: an Export button per preset
   (philogg-filter-library file: name, icon, roots, activeRef); an imported
   preset opens the "Save to filter library" dialog prefilled (name + icon),
   which now also lets a normal save pick the icon. */
group(296);
await withApp(async (w, d, T) => {
  section("296. Filter library preset export/import through the prefilled Save-to-library dialog; icon pick on save");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = textNode.id;
  w.render();

  // Normal save: pick an icon in the dialog.
  w.openFilterLibrarySaveDialog(textNode.id);
  const saveDialog = d.querySelector("#filterLibrarySaveDialog");
  fireClick(d.querySelector("#filterLibrarySaveIconBtn"), w);
  const grid = d.querySelector("#filterLibrarySaveIconGrid .filter-library-icon-grid");
  assert(grid, "the icon button opens the icon grid in the dialog");
  fireClick([...grid.querySelectorAll("button")].find(b => b.textContent === "🔥"), w);
  assert(!d.querySelector("#filterLibrarySaveIconGrid .filter-library-icon-grid") && d.querySelector("#filterLibrarySaveIconBtn").textContent === "🔥", "picking closes the grid and shows the icon");
  d.querySelector("#filterLibraryNameInput").value = "Hot";
  fireClick(d.querySelector("#filterLibrarySaveConfirm"), w);
  await new Promise(r => setTimeout(r, 0));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await waitFor(async () => (await w.listFilterLibrary()).length === 1);
  let records = await w.listFilterLibrary();
  assert(records[0].name === "Hot" && records[0].icon === "emoji:🔥", "the chosen icon is saved with the preset, got " + records[0].icon);

  // Export from the library dialog.
  const captured = [];
  w.downloadBlobFallback = (blob, name) => { const e = { name, json: null }; captured.push(e); blob.text().then(t => { e.json = t; }); };
  await w.openFilterLibraryDialog(f.id);
  const libRow = d.querySelector("#filterLibraryList .filter-library-row");
  fireClick(libRow.querySelector(".lib-export"), w);
  await waitFor(() => captured.length === 1 && captured[0].json !== null);
  const file = JSON.parse(captured[0].json);
  assert(file.format === "philogg-filter-library" && file.name === "Hot" && file.icon === "emoji:🔥" && file.roots.length === 1, "Export writes a philogg-filter-library file");
  assert(captured[0].name.endsWith(".filterpreset.json"), "suggested file name, got " + captured[0].name);
  w.closeFilterLibraryDialog();

  // Parse errors.
  assert(w.parseFilterLibraryExport('{"format":"philogg-filters"}') === null, "a filter file is not a preset file");
  assert(w.parseFilterLibraryExport(JSON.stringify({ format: "philogg-filter-library", version: 1, roots: [] })).error, "a preset without filters is rejected");
  assert(w.parseFilterLibraryExport(JSON.stringify({ format: "philogg-filter-library", version: 1, roots: [{ filterType: "bookmarks" }] })).error, "a preset with a filter this version can't load is rejected");

  // Import: dropped → the Save dialog, prefilled; Save adds a new record.
  await w.loadFileDescriptors([{ file: new w.File([captured[0].json], captured[0].name), handle: null }]);
  assert(!saveDialog.classList.contains("hidden"), "a dropped preset file opens the Save-to-library dialog");
  assert(d.querySelector("#filterLibraryNameInput").value === "Hot" && d.querySelector("#filterLibrarySaveIconBtn").textContent === "🔥", "...prefilled with its name and icon");
  d.querySelector("#filterLibraryNameInput").value = "Hot (imported)";
  fireClick(d.querySelector("#filterLibrarySaveConfirm"), w);
  assert(d.querySelector("#exportScopeDialog").classList.contains("hidden"), "an import needs no export-scope prompt");
  await waitFor(async () => (await w.listFilterLibrary()).length === 2);
  records = await w.listFilterLibrary();
  const rec = records.find(r => r.name === "Hot (imported)");
  assert(rec && rec.icon === "emoji:🔥" && rec.showInToolbar === false && JSON.stringify(rec.roots) === JSON.stringify(file.roots), "the imported preset is a new record with the file's filter");
  assert(Object.keys(T.state.nodes).length === 2, "importing a preset creates no filter node");

  // Cancel imports nothing.
  w.importPhiloggJsonText(captured[0].json);
  fireClick(d.querySelector("#filterLibrarySaveCancel"), w);
  assert(saveDialog.classList.contains("hidden") && (await w.listFilterLibrary()).length === 2, "Cancel adds nothing");
}, { indexedDB: new IDBFactory() });
