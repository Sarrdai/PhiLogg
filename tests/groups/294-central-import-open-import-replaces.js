// GROUP 294 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 294 — Central import: Open → "Import…" (replaces "Import
   session…") and a file dropped/opened anywhere both dispatch on the JSON
   `format` marker (importPhiloggJsonText). A filter branch attaches under
   the active node with a toast naming it; the other scattered import
   entry points are gone. */
group(294);
await withApp(async (w, d, T) => {
  section("294a. Central import: Open → Import…, dispatch by format marker, filter branch under the active node");
  const toast = () => d.querySelector("#copyToast").textContent;
  // Removed entry points.
  ["#btnThemeImport", "#btnThemeTemplate", "#btnSyntaxImport", "#btnSyntaxTemplate", "#btnImportFormat",
   "#filterFileInput", "#sessionFileInput", "#themeFileInput", "#syntaxSchemeFileInput"].forEach(sel => {
    assert(!d.querySelector(sel), sel + " no longer exists");
  });
  assert(!d.querySelector('#openMenu [data-action="importSession"]'), "the Open menu has no 'Import session…' any more");

  // Open → Import… goes through the (multi-file) hidden input.
  let clicked = false;
  const input = d.querySelector("#importFileInput");
  input.click = () => { clicked = true; };
  fireClick(d.querySelector("#btnOpen"), w);
  const item = d.querySelector('#openMenu [data-action="import"]');
  assert(item && item.textContent.trim() === "Import…", "the Open menu offers 'Import…'");
  fireClick(item, w);
  assert(clicked && input.multiple, "Import… opens the file picker (several files at once)");

  // No file loaded yet: a filter file can't go anywhere.
  const f0 = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const textNode = w.createFilterNode(f0.id, "text", "message 1");
  w.render();
  const branch = w.serializeFilterBranch(textNode.id, false);
  const filterJson = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });

  // Filter branch → under the ACTIVE node, toast says where.
  T.state.activeId = f0.id;
  const kidsBefore = T.state.nodes[f0.id].children.length;
  assert(w.importPhiloggJsonText(filterJson) === true, "a filter file is a PhiLogg export");
  assert(T.state.nodes[f0.id].children.length === kidsBefore + 1, "the filter is attached under the active node");
  const added = T.state.nodes[T.state.nodes[f0.id].children[kidsBefore]];
  assert(added.filterType === "text" && added.value === textNode.value, "...as a copy of the saved filter");
  assert(T.state.activeId === added.id, "the imported filter becomes active");
  assert(toast().includes("Filter imported under") && toast().includes("a.log"), "the toast names where it went, got " + toast());

  // Picked through Import…: the change handler reads every file; a non-
  // PhiLogg JSON is reported, not loaded.
  T.state.activeId = textNode.id;
  const childKids = T.state.nodes[textNode.id].children.length;
  Object.defineProperty(input, "files", { configurable: true, value: [new w.File([filterJson], "f.json"), new w.File(['{"hello":1}'], "other.json")] });
  input.dispatchEvent(new w.Event("change"));
  await waitFor(() => toast().includes("other.json"));
  assert(T.state.nodes[textNode.id].children.length === childKids + 1, "a picked filter file attaches under the (new) active node");
  assert(toast().includes("other.json is not a PhiLogg export"), "a picked non-PhiLogg file is reported, got " + toast());
  assert(T.state.looseInlineViewers.size === 0, "...and not opened");

  // Session files go to the session import; dropped as well.
  let sessionText = null;
  w.importSessionJson = text => { sessionText = text; };
  const sessionJson = JSON.stringify({ format: "philogg-session-export", version: 1, files: [] });
  await w.loadFileDescriptors([{ file: new w.File([sessionJson], "s.json"), handle: null }]);
  assert(sessionText === sessionJson, "a dropped session file runs the session import");

  // Unknown / non-JSON text is not an export.
  assert(w.importPhiloggJsonText('{"format":"something-else"}') === false && w.importPhiloggJsonText("nope") === false, "other JSON/text is not a PhiLogg export");
});

await withApp(async (w, d, T) => {
  section("294b. Central import: no active node → toast; theme + scheme drops queue their editors");
  const toast = () => d.querySelector("#copyToast").textContent;
  assert(w.importPhiloggJsonText(JSON.stringify({ format: "philogg-filters", version: 2, roots: [] })) === true, "a filter file is handled even with nothing loaded");
  assert(toast().startsWith("Open a log file first"), "...with a toast saying why nothing happened, got " + toast());

  const editor = d.querySelector("#themeEditorDialog");
  await w.loadFileDescriptors([
    { file: new w.File([JSON.stringify({ format: "philogg-theme", version: 1, name: "Dropped theme", colors: { "bg-app": "#010203" } })], "t.json"), handle: null },
    { file: new w.File([JSON.stringify({ format: "philogg-syntax-scheme", version: 1, name: "Dropped scheme", colors: { "syntax-tag": "#abcdef" } })], "s.json"), handle: null },
  ]);
  assert(isVisible(editor, w) && d.querySelector("#themeEditorName").value === "Dropped theme", "the first dropped export opens its editor");
  assert(Object.keys(T.state.nodes).length === 0, "...and no file is loaded");
  fireClick(d.querySelector("#themeEditorCancel"), w);
  assert(isVisible(editor, w) && d.querySelector("#themeEditorName").value === "Dropped scheme", "closing it opens the queued second one");
  assert(d.querySelector("#themeEditorTitle").textContent === "Import syntax scheme", "...in its own (syntax) mode");
  fireClick(d.querySelector("#themeEditorCancel"), w);
  assert(!isVisible(editor, w) && T.customThemes.length === 0 && T.customSyntaxSchemes.length === 0, "cancelling both adds nothing");
});
