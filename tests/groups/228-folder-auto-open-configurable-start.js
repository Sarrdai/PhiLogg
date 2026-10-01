// GROUP 228 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 228 — Folder auto-open: configurable start filters, sourced from
   the Filter Library, several selectable with one Primary
   (FEATURE_BACKLOG.md #71)
   Origin: this session (2026-09-16), person-requested ("Quelle für die
   Filterauswahl ist die Filter Library"); EXTENDED same session, same
   person, before this ever shipped: an initial single-<select> version
   (exactly one preset per pattern) was replaced with a checkbox list
   (`startFilterKeys`, several presets per pattern) plus a "Primary" radio
   among the checked ones (`startPrimaryFilterKey`) — the one a person
   "jumps into" when the file opens. `defaultFolderPattern`/
   `applyFolderStartFilter` (philogg.html's "Folder watch" section): the
   listed keys are applied the moment THIS PATTERN auto-opens a file
   (auto-open-newest / auto-close keep-N-open) — never for a file opened
   by hand, mirroring the existing rec.openedByAuto/autoOpenFired "person
   vs. auto" distinction — with the Primary key's own applyFilterFromLibrary
   call made LAST, so its activeId/revealFilteredView is what the person
   actually lands in regardless of the other presets' own list order.
   Reuses applyFilterFromLibrary unchanged per preset, exactly like the
   "Apply from library…" context-menu action. UI: `fwPatternStartFiltersBlock`
   in #fwPatternList — one `.fw-startfilter-item` checkbox row per saved
   preset, an empty-library message when none are saved yet, and a
   same-`name`-grouped native radio per pattern card (native mutual
   exclusivity) that's disabled until its own checkbox is checked; checking
   the FIRST preset for a pattern auto-picks it as Primary, and unchecking
   the current Primary auto-promotes another still-checked preset (or clears
   it if none remain) — a non-empty selection always has exactly one Primary.
   ============================================================ */
group(228);
await withApp(async (w, d, T) => {
  section("228a. defaultFolderPattern carries no start filters; the checkbox list + auto-managed Primary");

  function fakeFileHandle(name, text, lastModified) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        if (typeof lastModified === "number") Object.defineProperty(blob, "lastModified", { value: lastModified, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  function fakeDirHandle(name, entries) {
    return {
      kind: "directory", name,
      async *values() {
        for (const key of Object.keys(entries)) {
          const val = entries[key];
          if (typeof val === "string") yield fakeFileHandle(key, val);
          else if (Array.isArray(val)) yield fakeFileHandle(key, val[0], val[1]);
          else yield fakeDirHandle(key, val);
        }
      },
    };
  }

  await w.addWatchedFolder(fakeDirHandle("startlogs", { "A.log": makeLog(0, 5) }));
  const folder = T.state.folders.find(f => f.name === "startlogs");
  assert(Array.isArray(folder.settings.patterns[0].startFilterKeys) && folder.settings.patterns[0].startFilterKeys.length === 0
    && folder.settings.patterns[0].startPrimaryFilterKey === null,
    "defaultFolderPattern's \"*\" pattern defaults to no start filters and no Primary");

  // Before any preset is saved, the block shows the empty-library message.
  w.render();
  fireClick(d.querySelector(".folder-watch-settings"), w);
  assert(d.querySelector("#fwPatternList .filter-library-empty") && d.querySelector("#fwPatternList .filter-library-empty").textContent.includes("No saved filters yet"),
    "with nothing saved to the Filter Library yet, the Start filters block shows the empty-library message");
  assert(d.querySelectorAll("#fwPatternList .fw-startfilter-item").length === 0, "...and no checkbox rows");
  fireClick(d.querySelector("#fwSettingsClose"), w);

  // Two saved presets to select from (same save flow as GROUP 59).
  const src = await w.addFile("src.log", makeLog(0, 20), () => {});
  w.render();
  const errNode = w.createFilterNode(src.id, "text", "message 1");
  const saveErr = w.saveFilterToLibrary(errNode.id, "Errors");
  await new Promise(r => setTimeout(r, 0));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await saveErr;
  const warnNode = w.createFilterNode(src.id, "text", "message 2");
  const saveWarn = w.saveFilterToLibrary(warnNode.id, "Warnings");
  await new Promise(r => setTimeout(r, 0));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await saveWarn;
  await waitFor(async () => (await w.listFilterLibrary()).length === 2);
  const records = await w.listFilterLibrary();
  const recErrors = records.find(r => r.name === "Errors");
  const recWarnings = records.find(r => r.name === "Warnings");

  w.render();
  fireClick(d.querySelector(".folder-watch-settings"), w);
  const items = () => [...d.querySelectorAll("#fwPatternList .fw-startfilter-item")];
  assert(items().length === 2, "one checkbox row per saved Filter Library preset, got " + items().length);
  const rowFor = name => items().find(it => it.querySelector(".filter-library-row-name").textContent === name);
  assert(!rowFor("Errors").querySelector('input[type="radio"]').checked && rowFor("Errors").querySelector('input[type="radio"]').disabled,
    "an unchecked preset's Primary radio starts unchecked and disabled");

  // Checking the FIRST preset auto-picks it as Primary.
  fireClick(rowFor("Errors").querySelector('input[type="checkbox"]'), w);
  await waitFor(() => folder.settings.patterns[0].startFilterKeys.includes(recErrors.key));
  assert(folder.settings.patterns[0].startPrimaryFilterKey === recErrors.key, "the first preset checked for a pattern becomes Primary automatically");
  assert(rowFor("Errors").querySelector('input[type="radio"]').checked && !rowFor("Errors").querySelector('input[type="radio"]').disabled,
    "its own Primary radio is now checked and enabled");

  // Checking a SECOND preset leaves the existing Primary alone.
  fireClick(rowFor("Warnings").querySelector('input[type="checkbox"]'), w);
  await waitFor(() => folder.settings.patterns[0].startFilterKeys.includes(recWarnings.key));
  assert(folder.settings.patterns[0].startPrimaryFilterKey === recErrors.key, "adding a second preset does not steal Primary from the first");
  assert(!rowFor("Warnings").querySelector('input[type="radio"]').checked && !rowFor("Warnings").querySelector('input[type="radio"]').disabled,
    "the newly checked preset's own radio is enabled but not (yet) the Primary");

  // Switching Primary via the radio (native same-name group).
  fireClick(rowFor("Warnings").querySelector('input[type="radio"]'), w);
  await waitFor(() => folder.settings.patterns[0].startPrimaryFilterKey === recWarnings.key);
  assert(!rowFor("Errors").querySelector('input[type="radio"]').checked, "picking a new Primary un-checks the previous one's radio (native radio-group exclusivity)");

  // Unchecking the CURRENT Primary auto-promotes the other still-checked preset.
  fireClick(rowFor("Warnings").querySelector('input[type="checkbox"]'), w);
  await waitFor(() => !folder.settings.patterns[0].startFilterKeys.includes(recWarnings.key));
  assert(folder.settings.patterns[0].startPrimaryFilterKey === recErrors.key,
    "unchecking the current Primary auto-promotes the remaining checked preset instead of leaving no Primary");

  // Re-check Warnings and make it Primary again — the state this pattern
  // carries into 228b's auto-open assertions below.
  fireClick(rowFor("Warnings").querySelector('input[type="checkbox"]'), w);
  await waitFor(() => folder.settings.patterns[0].startFilterKeys.includes(recWarnings.key));
  fireClick(rowFor("Warnings").querySelector('input[type="radio"]'), w);
  await waitFor(() => folder.settings.patterns[0].startPrimaryFilterKey === recWarnings.key);
  fireClick(d.querySelector("#fwSettingsClose"), w);
  assert(folder.settings.patterns[0].startFilterKeys.slice().sort().join(",") === [recErrors.key, recWarnings.key].sort().join(","),
    "both presets stay selected after closing the dialog");

  section("228b. Auto-opened files get every selected start filter applied; the Primary one is what the view jumps into");

  assert(folder.files.every(f => !f.nodeId), "sanity: nothing in \"startlogs\" is open yet");
  folder.settings.patterns[0].autoOpenNewest = true;
  await w.rescanFolder(folder);
  await waitFor(() => !!folder.files.find(f => f.name === "A.log").nodeId);
  const aNode = T.state.nodes[folder.files.find(f => f.name === "A.log").nodeId];
  assert(aNode.children.length === 2, "the auto-opened file got BOTH selected start filters applied as children, got " + aNode.children.length);
  const childValues = aNode.children.map(id => T.state.nodes[id].value).sort();
  assert(JSON.stringify(childValues) === JSON.stringify(["message 1", "message 2"]),
    "...each carrying its own preset's filter definition, got " + JSON.stringify(childValues));
  const warningsChildId = aNode.children.find(id => T.state.nodes[id].value === "message 2");
  assert(T.state.activeId === warningsChildId,
    "the PRIMARY filter (\"Warnings\", applied last) is what ends up active/selected — the person jumps into it, not into \"Errors\" even though it was applied first");

  // A file matching the SAME pattern but opened BY HAND never gets any
  // start filter — only an auto-open/auto-close rule's own opens do.
  await w.addWatchedFolder(fakeDirHandle("manuallogs", { "M.log": makeLog(0, 5) }));
  const mFolder = T.state.folders.find(f => f.name === "manuallogs");
  mFolder.settings.patterns[0].startFilterKeys = [recErrors.key, recWarnings.key];
  mFolder.settings.patterns[0].startPrimaryFilterKey = recWarnings.key;
  w.render();
  const mRow = [...d.querySelectorAll(".folder-watch")].find(box => box.querySelector(".folder-watch-name").textContent === "manuallogs")
    .querySelector(".folder-watch-file");
  fireDblClick(mRow, w);
  await waitFor(() => !!mFolder.files.find(f => f.name === "M.log").nodeId);
  const mNode = T.state.nodes[mFolder.files.find(f => f.name === "M.log").nodeId];
  assert(mNode.children.length === 0, "a file opened by hand never gets any start filter applied, even with several configured, got " + mNode.children.length + " children");
}, { indexedDB: new IDBFactory() });
