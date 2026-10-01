// GROUP 198 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 198 — Desktop wrapper: the HTML drop path steps aside for native
   drag-drop, and a failed load reports why
   Origin: this session, person-reported: "In der Tauri Variante kann ich
   keine einzelnen Dateien mehr Laden. Weder per Drag&Drop noch über den
   Dialog... erscheint kurz grau im Tree, dann verschwindet sie und das
   'Could not load' Popup erscheint." windows.rs's own comment states that
   Tauri's native drag-drop handler is "left ON, which suppresses the HTML
   drop events philogg.html would otherwise use" — but that suppression is
   a platform/webview-version assumption, not something this page enforces.
   If it ever doesn't hold, a single OS drop reaches BOTH the wrapper's
   native handler (which loads the real path via philogg://local, see
   loadDesktopLocalFiles) AND philogg.html's own window "drop" listener
   (which would then race it with a second, redundant load attempt of the
   same drop) — exactly the flash-then-"Couldn't load" symptom reported.
   Fix: the HTML-level dragenter/dragover/dragleave/drop listeners now bail
   out via nativeDragDropOwnsThis() whenever window.philogg exists, so the
   wrapper's own native handling is the only thing that ever processes an
   OS file drop there, regardless of whether the browser-level suppression
   is airtight on a given platform. Also: the swallowed failure reason
   behind "Couldn't load" is now included in the toast, so a real read/parse
   failure is distinguishable from this race without needing devtools.
   ============================================================ */
group(198);
await withApp(async (w, d, T) => {
  section("198a. window's own drop listener no-ops under a desktop wrapper — native handling owns it");

  let loadFilesCalls = 0;
  const originalLoadFiles = w.loadFiles;
  w.loadFiles = (...args) => { loadFilesCalls++; return originalLoadFiles.apply(w, args); };

  const file = new w.File([makeLog(0, 2)], "dropped.log", { type: "text/plain" });
  const dt = { types: ["Files"], files: [file], items: [] };
  w.dispatchEvent(Object.assign(new w.Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
  await new Promise(r => setTimeout(r, 0));

  assert(loadFilesCalls === 0,
    "philogg.html's own drop handler must not process an OS file drop when window.philogg exists — " +
    "the wrapper's native handler already did (or is about to), got " + loadFilesCalls + " call(s)");
  assert(T.state.rootIds.length === 0, "...so no node was created from the HTML-side attempt either");
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });

await withApp(async (w, d, T) => {
  section("198b. window's own drop listener still works normally in the plain browser build (no window.philogg)");

  const file = new w.File([makeLog(0, 2)], "dropped.log", { type: "text/plain" });
  const dt = { types: ["Files"], files: [file], items: [] };
  w.dispatchEvent(Object.assign(new w.Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
  await new Promise(r => setTimeout(r, 0));

  assert(T.state.rootIds.length === 1, "a plain browser build (no desktop wrapper) still loads a dropped file via the HTML path");
  const node = T.state.nodes[T.state.rootIds[0]];
  assert(node && node.name === "dropped.log", "...as the dropped file, got " + (node && node.name));
});

await withApp(async (w, d, T) => {
  section("198c. a failed wrapper-supplied load now names the underlying reason, not just the filename");

  w.fetch = async () => ({ ok: false, status: 404 });
  await w.philoggLoadLocalFiles({ files: [{ url: "philogg://local/9/gone.log", path: "/logs/gone.log", name: "gone.log" }] });
  const toast = d.querySelector("#copyToast").textContent;
  assert(toast.includes("gone.log"), "...still names the file, got " + toast);
  assert(toast.includes("404"), "...and now includes the actual failure reason instead of a bare \"couldn't load\", got " + toast);
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });

await withApp(async (w, d, T) => {
  section("198d. A wrapper-picked/dropped file loads through arrayBuffer(), not blob() — person-reported: a real ~80KB file failed via blob() while an ~3KB one didn't, and the same file loaded fine through the folder-watch route (urlTailHandle.getFile(), which already used arrayBuffer())");

  // No `blob` on this mock at all — if loadDesktopLocalFiles' openFile() ever
  // regresses back to res.blob(), this throws (res.blob is not a function)
  // and the assertions below fail instead of passing for the wrong reason.
  const text = makeLog(0, 5);
  w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(text).buffer });
  await w.philoggLoadLocalFiles({ files: [{ url: "philogg://local/3/big.log", path: "/logs/big.log", name: "big.log" }] });

  const node = T.state.nodes[T.state.rootIds[T.state.rootIds.length - 1]];
  assert(node && !node.queued, "the file loads (and its placeholder is activated) using only arrayBuffer(), got " + (node && JSON.stringify({ name: node.name, queued: node.queued })));
  assert(node.entries.length === 5, "...fully parsed via the arrayBuffer-backed File, got " + (node && node.entries.length));
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });
