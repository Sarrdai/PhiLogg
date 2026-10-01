// GROUP 164 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 164 — Folder watch settings dialog: filename patterns (with
   per-pattern auto-open-newest/auto-close-keep-N/show-newest-M), and
   include-subfolders + show-relative-path.
   Origin: this session (2026-09-03), person-requested. Adds a gear button
   (.folder-watch-settings) on each watched folder's header, opening
   #folderWatchSettingsDialog (styled after #settingsDialog). See
   defaultFolderSettings/matchFolderPattern/scanFolderHandle/
   applyFolderAutoRules in philogg.html's "Folder watch" section.
   EXTENDED same session (person-reported follow-up): "Auto-close — keep
   only N open" is a genuine SLIDING WINDOW over the N newest matches now —
   a newer file arriving opens itself, evicting the previous oldest open
   one, instead of silently staying unopened (the auto rules block was
   REWRITTEN in place, so the old "auto-open-newest opens, then a single
   later file triggers exactly one close" framing is gone, replaced by the
   two-open/keep-2/a-3rd-arrives scenario below). Also covers
   nodeDisplayName() keeping a folder-watch file's relative-path name once
   it's actually opened, not just in the still-grayed listing.
   EXTENDED again same session (person-reported: the sliding window still
   looked broken): the REPRO block at the end re-tests keep-N through
   MANUALLY opened files, the real settings-dialog number input, and the
   real folderScanTick() poll (not a manual rescanFolder() call) — this is
   what led to the actual second bug, "newest" was pure filename order
   (sortFolderRecsByRecency now prefers real file mtime, falling back to
   name order only when mtime is unavailable — see scanFolderHandle/
   folderSettingsNeedRecency/applyFolderAutoRules), covered by a dedicated
   Z-old.log/A-new.log case where alphabetical and chronological order
   disagree. "Show relative path" is also now re-verified through the real
   dialog checkboxes (not direct folder.settings mutation), toggled live in
   both directions on an ALREADY-open file, not just right after opening it.
   ============================================================ */
group(164);
await withApp(async (w, d, T) => {
  section("164. Folder watch settings — patterns, subfolders, auto rules");

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
  // entries: plain "name.log" for a file, ["dirname", {..nested entries}] for
  // a subfolder, or [text, lastModified] to also stub the file's mtime.
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

  // --- Filename patterns: only files matching at least one configured
  // pattern are listed, on top of the existing fixed *.log extension filter.
  const patternFiles = { "App1.log": makeLog(0, 2), "App2.log": makeLog(10, 2), "Input1.log": makeLog(20, 2), "other.log": makeLog(30, 2) };
  const patternDir = fakeDirHandle("plogs", patternFiles);
  await w.addWatchedFolder(patternDir);
  const pFolder = T.state.folders[0];
  assert(pFolder.settings && pFolder.settings.patterns.length === 1 && pFolder.settings.patterns[0].pattern === "*",
    "a freshly watched folder defaults to a single \"*\" pattern (matches everything, same as before this feature)");
  assert(pFolder.files.length === 4, "default \"*\" pattern lists every compatible file, got " + pFolder.files.length);

  pFolder.settings.patterns = [
    { pattern: "App*.log", autoOpenNewest: false, autoCloseKeep: null, showNewest: null },
    { pattern: "Input*.log", autoOpenNewest: false, autoCloseKeep: null, showNewest: null },
  ];
  await w.rescanFolder(pFolder);
  assert(pFolder.files.map(f => f.name).sort().join(",") === "App1.log,App2.log,Input1.log",
    "after narrowing to App*.log/Input*.log, other.log (matches neither) drops out of the listing, got " + pFolder.files.map(f => f.name).join(","));

  // --- Settings dialog: gear button opens it, reflects current folder,
  // subfolder toggle exposes "show relative path", "+ Add pattern" appends
  // a "*" pattern row, editing a pattern's text input re-scans live.
  w.render();
  const gearBtn = d.querySelector(".folder-watch-settings");
  assert(gearBtn !== null, "settings gear button rendered on the folder header");
  fireClick(gearBtn, w);
  const dialog = d.querySelector("#folderWatchSettingsDialog");
  assert(!dialog.classList.contains("hidden"), "clicking the gear opens the folder watch settings dialog");
  assert(d.querySelector("#fwSettingsFolderName").textContent === "plogs", "dialog header names the folder it's editing");
  assert(d.querySelectorAll(".fw-pattern-card").length === 2, "one pattern card rendered per configured pattern, got " + d.querySelectorAll(".fw-pattern-card").length);

  fireClick(d.querySelector("#fwBtnAddPattern"), w);
  await waitFor(() => d.querySelectorAll(".fw-pattern-card").length === 3);
  assert(pFolder.settings.patterns.length === 3 && pFolder.settings.patterns[2].pattern === "*", "\"+ Add pattern\" appends a new \"*\" pattern");

  fireClick(d.querySelector("#fwSettingsClose"), w);
  assert(d.querySelector("#folderWatchSettingsDialog").classList.contains("hidden"), "close button hides the dialog again");

  // --- Include subfolders: recursive scan (the subfolder tree display
  // itself is GROUP 317).
  const subFiles = { "Root.log": makeLog(0, 1), "sub": { "Nested.log": makeLog(1, 1) } };
  const subDir = fakeDirHandle("sublogs", subFiles);
  await w.addWatchedFolder(subDir);
  const sFolder = T.state.folders.find(f => f.name === "sublogs");
  assert(sFolder.files.length === 1, "without \"include subfolders\", nested files are not listed, got " + sFolder.files.length);

  // Toggled through the REAL dialog checkbox (not by mutating
  // folder.settings directly), to also catch a UI-wiring-only bug.
  w.render();
  fireClick([...d.querySelectorAll(".folder-watch-settings")].find(b => b.closest(".folder-watch").querySelector(".folder-watch-name").textContent === "sublogs"), w);
  assert(d.querySelector("#fwSettingsShowRelPath") === null, "the retired \"show relative path\" switch is gone (subfolders render as a tree now)");
  fireClick(d.querySelector("#fwSettingsSubfolders"), w);
  await waitFor(() => sFolder.settings.includeSubfolders === true && sFolder.files.length === 2);
  fireClick(d.querySelector("#fwSettingsClose"), w);
  const nestedRec = sFolder.files.find(f => f.name === "Nested.log");
  assert(nestedRec && nestedRec.relPath === "sub/Nested.log", "the nested file's relPath includes its subfolder, got " + (nestedRec && nestedRec.relPath));

  // --- Per-pattern auto rules: auto-open newest, auto-close keep N (a
  // SLIDING WINDOW over the newest N — person-reported: a new, newer file
  // arriving must itself open, evicting the previous oldest, not leave the
  // open set unchanged), show newest M. "Newest" = last in the
  // (alphabetical) sort order, same convention the folder listing itself
  // already sorts by.
  const ruleFiles = { "R-01.log": makeLog(0, 1), "R-02.log": makeLog(1, 1), "R-03.log": makeLog(2, 1) };
  const ruleDir = fakeDirHandle("rulelogs", ruleFiles);
  await w.addWatchedFolder(ruleDir);
  const rFolder = T.state.folders.find(f => f.name === "rulelogs");
  rFolder.settings.patterns = [{ pattern: "*", autoOpenNewest: false, autoCloseKeep: 2, showNewest: null }];
  await w.rescanFolder(rFolder);
  assert(rFolder.files.find(f => f.name === "R-02.log").nodeId && rFolder.files.find(f => f.name === "R-03.log").nodeId,
    "keep-2 opened the 2 newest matches (R-02, R-03) right away");
  assert(!rFolder.files.find(f => f.name === "R-01.log").nodeId, "keep-2 left R-01.log (outside the newest-2 window) closed");
  const r03IdBefore = rFolder.files.find(f => f.name === "R-03.log").nodeId;
  assert(T.state.activeId === r03IdBefore, "the last-opened file (the newest of the window) is selected/activated");
  assert(T.state.tailFollow === true, "auto-opening a handle-backed file leaves tailFollow engaged (auto-scroll)");

  // A new, newer file arrives: the window slides — R-04 opens, R-02 (now
  // the oldest of the previously-open two) closes, R-03 stays open.
  ruleFiles["R-04.log"] = makeLog(3, 1);
  await w.rescanFolder(rFolder);
  assert(rFolder.files.find(f => f.name === "R-04.log").nodeId, "R-04.log (the new newest) was itself opened by the sliding keep-2 window, got nodeId=" + rFolder.files.find(f => f.name === "R-04.log").nodeId);
  assert(!rFolder.files.find(f => f.name === "R-02.log").nodeId,
    "R-02.log (fell out of the newest-2 window) was auto-closed to make room for R-04.log");
  assert(rFolder.files.some(f => f.name === "R-02.log"), "R-02.log stays listed grayed out after auto-close, not removed");
  const r03Now = rFolder.files.find(f => f.name === "R-03.log");
  assert(r03Now.nodeId === r03IdBefore, "R-03.log (still inside the window) was left open, untouched");

  // Show newest M: drop closed listing entries older than the M most recent.
  // Current state: R-01/R-02 closed+grayed, R-03/R-04 open. Adding R-00
  // (sorts first) makes 5 files; keeping the newest 2 by sort order
  // (R-03, R-04) drops the older closed ones (R-00, R-01, R-02) — the open
  // files stay regardless.
  rFolder.settings.patterns = [{ pattern: "*", autoOpenNewest: false, autoCloseKeep: null, showNewest: 2 }];
  ruleFiles["R-00.log"] = makeLog(-1, 1);
  await w.rescanFolder(rFolder);
  const namesAfterShowNewest = rFolder.files.map(f => f.name).sort();
  assert(namesAfterShowNewest.join(",") === "R-03.log,R-04.log",
    "show-newest-2 kept only the 2 newest closed/open matches — the still-open R-03/R-04 survive, the closed R-00/R-01/R-02 are dropped — got " + namesAfterShowNewest.join(","));

  // --- REPRO: person-reported — files opened MANUALLY (not by an auto
  // rule) first, "Auto-close — keep only N" enabled AFTER via the actual
  // settings dialog UI (not by mutating folder.settings directly), and the
  // new file discovered via the REAL polling path (folderScanTick, not a
  // manual rescanFolder() call) — to rule out anything specific to how the
  // other assertions above drove the feature.
  const manualFiles = { "M-01.log": makeLog(0, 1), "M-02.log": makeLog(1, 1) };
  const manualDir = fakeDirHandle("manuallogs", manualFiles);
  await w.addWatchedFolder(manualDir);
  const mFolder = T.state.folders.find(f => f.name === "manuallogs");
  const mBoxRows = () => [...d.querySelectorAll(".folder-watch")].find(box => box.querySelector(".folder-watch-name").textContent === "manuallogs").querySelectorAll(".folder-watch-file");
  w.render();
  fireDblClick([...mBoxRows()].find(r => r.querySelector(".folder-watch-file-name").textContent === "M-01.log"), w);
  await waitFor(() => mFolder.files.find(f => f.name === "M-01.log").nodeId !== null);
  w.render();
  fireDblClick([...mBoxRows()].find(r => r.querySelector(".folder-watch-file-name").textContent === "M-02.log"), w);
  await waitFor(() => mFolder.files.find(f => f.name === "M-02.log").nodeId !== null);
  assert(mFolder.files.every(f => f.nodeId), "sanity: both files were opened manually, no auto rule involved yet");

  w.render();
  fireClick([...d.querySelectorAll(".folder-watch-settings")].find(b => b.closest(".folder-watch").querySelector(".folder-watch-name").textContent === "manuallogs"), w);
  const numInput = d.querySelector("#fwPatternList input[type=\"number\"]");
  numInput.value = "2";
  numInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  await waitFor(() => mFolder.settings.patterns[0].autoCloseKeep === 2);
  fireClick(d.querySelector("#fwSettingsClose"), w);
  assert(mFolder.files.every(f => f.nodeId), "enabling keep-2 with exactly 2 already open changes nothing yet");

  manualFiles["M-03.log"] = makeLog(2, 1);
  await w.folderScanTick(); // the REAL discovery path, not a manual rescanFolder()
  await waitFor(() => mFolder.files.find(f => f.name === "M-03.log") && mFolder.files.find(f => f.name === "M-03.log").nodeId !== null);
  assert(mFolder.files.find(f => f.name === "M-03.log").nodeId,
    "a new file discovered by the real folderScanTick poll is opened by the keep-2 sliding window, same as a manual rescanFolder()");
  // Person-reported (this session): a file opened BY HAND is never closed
  // by "keep only N open" — only files the rule itself opened are fair game
  // for it to later close again. M-01.log was opened manually before the
  // rule even existed, so it stays open even though it falls outside the
  // newest-2 window once M-03.log arrives.
  assert(mFolder.files.find(f => f.name === "M-01.log").nodeId,
    "the manually opened OLDEST file (M-01.log) stays open — \"keep only N open\" never auto-closes a file the person opened by hand");
  assert(mFolder.files.find(f => f.name === "M-02.log").nodeId, "the still-in-window M-02.log was left open");

  // --- "Newest" uses real file mtime when available, not just filename
  // order: a naming scheme where the chronologically newer file doesn't
  // happen to sort last as a plain string (e.g. unpadded day-of-month) must
  // still be picked correctly by auto-open/auto-close/show-newest.
  const mtimeFiles = {
    "Z-old.log": [makeLog(0, 1), 1000],   // sorts LAST alphabetically, but is the OLDEST by mtime
    "A-new.log": [makeLog(1, 1), 3000],   // sorts FIRST alphabetically, but is the NEWEST by mtime
  };
  const mtimeDir = fakeDirHandle("mtimelogs", mtimeFiles);
  await w.addWatchedFolder(mtimeDir);
  const mtFolder = T.state.folders.find(f => f.name === "mtimelogs");
  mtFolder.settings.patterns = [{ pattern: "*", autoOpenNewest: false, autoCloseKeep: 1, showNewest: null }];
  await w.rescanFolder(mtFolder);
  assert(mtFolder.files.find(f => f.name === "A-new.log").nodeId,
    "keep-1 opened A-new.log (newest by mtime, even though it sorts FIRST alphabetically)");
  assert(!mtFolder.files.find(f => f.name === "Z-old.log").nodeId,
    "Z-old.log (oldest by mtime, even though it sorts LAST alphabetically) was correctly left/closed");
});
