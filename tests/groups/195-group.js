// GROUP 195 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(195);
await withApp(async (w, d, T) => {
  section("195a. \"Show M newest files\" doesn't re-trigger a merge+render on every poll for a file it hid");

  function fakeFileHandle(name, text) {
    return { kind: "file", name, async getFile() {
      const blob = new w.Blob([text]);
      Object.defineProperty(blob, "name", { value: name, configurable: true });
      Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
      blob.text = async () => text;
      blob.slice = (start) => { const sliced = text.slice(start); const b = new w.Blob([sliced]); b.text = async () => sliced; return b; };
      return blob;
    }};
  }
  function fakeDirHandle(name, fileMap) {
    return { kind: "directory", name, async *values() { for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]); } };
  }

  // 3 static files on disk, "Show newest 1" configured — rule 1 of
  // applyFolderAutoRules drops the 2 older CLOSED ones from folder.files on
  // every merge, even though they're still on disk and match every poll.
  const fileMap = { "a-old.log": makeLog(0, 3), "b-mid.log": makeLog(0, 3), "c-new.log": makeLog(0, 3) };
  const dir = fakeDirHandle("logs", fileMap);
  await w.addWatchedFolder(dir);
  const folder = T.state.folders[0];
  folder.settings.patterns = [{ pattern: "*", autoOpenNewest: false, autoCloseKeep: null, showNewest: 1 }];
  await w.rescanFolder(folder);
  assert(folder.files.length === 1, "\"Show newest 1\" leaves only the newest file listed after the initial scan");

  const originalRender = w.render;
  let renderCount = 0;
  w.render = (...args) => { renderCount++; return originalRender.apply(w, args); };
  // Several poll ticks with NOTHING actually changed on disk.
  for (let i = 0; i < 4; i++) await w.folderScanTick();
  assert(folder.files.length === 1, "the hidden files stay hidden across repeated polls, not re-appearing and re-vanishing");
  assert(renderCount === 0,
    "a stable folder triggers ZERO extra render() calls from folderScanTick — before the fix, \"Show newest M\" " +
    "made every poll see its own hidden files as \"new\" again, re-merging and re-hiding them forever (the " +
    "person-reported laggy scrolling + a selected row getting yanked back into view on its own, via " +
    "renderTable's captureViewAnchor/restoreViewAnchor reacting to that unwanted render())");
  w.render = originalRender;

  // A genuine new file arriving must still be picked up (the actual feature
  // this mechanism exists for), so the fix must not have broken detection.
  fileMap["d-newest.log"] = makeLog(0, 3);
  await w.folderScanTick();
  assert(folder.files.length === 1 && folder.files[0].name === "d-newest.log",
    "a real new file on disk is still detected and \"Show newest 1\" still swaps the window onto it");
});
