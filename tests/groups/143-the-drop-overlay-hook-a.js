// GROUP 143 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 143 — The drop-overlay hook a natively-handled drag needs
   Origin: this session. Tauri's native drag-drop handler is the only one
   that carries real OS paths, and turning it on suppresses the HTML
   dragenter/dragover/drop events philogg.html drives its own #dropOverlay
   from. So the wrapper drives the overlay through a named hook instead of
   reaching into #dropOverlay itself — this group is that contract, plus
   the dropped-folder case for a wrapper that can't list folders itself.
   Re-pointed by the session that added GROUP 145: a wrapper that CAN list
   folders now watches a dropped one, so 143b is specifically the fallback
   for one that can't (an older build, or a wrapper without listFolder).
   ============================================================ */
group(143);
await withApp(async (w, d, T) => {
  section("143a. philoggDropOverlay toggles the same overlay an HTML drag would");

  const overlay = d.querySelector("#dropOverlay");
  assert(overlay.classList.contains("hidden"), "sanity: the overlay starts hidden");
  w.philoggDropOverlay(true);
  assert(!overlay.classList.contains("hidden"), "the wrapper can show the drop overlay");
  w.philoggDropOverlay(false);
  assert(overlay.classList.contains("hidden"), "...and hide it again");

  // A native drop replaces the HTML sequence wholesale, so the hook must
  // also leave the page's own dragenter/dragleave counter balanced — a
  // stale count would strand the overlay open on the next real HTML drag.
  w.philoggDropOverlay(true);
  w.philoggDropOverlay(false);
  w.dispatchEvent(Object.assign(new w.Event("dragleave", { bubbles: true, cancelable: true }),
    { dataTransfer: { types: ["Files"] } }));
  assert(overlay.classList.contains("hidden"), "the counter is left balanced, not negative or stuck");
});

await withApp(async (w, d, T) => {
  section("143b. A dropped folder is reported, not silently ignored (wrapper without listFolder)");

  assert(typeof w.philogg.listFolder === "undefined",
    "fixture sanity: this bridge cannot list folders — the case GROUP 145d is the counterpart to");
  await w.philoggLoadLocalFiles({ files: [], folders: ["/home/user/logs"] });
  assert(T.state.rootIds.length === 0, "a folder path alone loads nothing");
  const toast = d.querySelector("#copyToast").textContent;
  assert(/folder/i.test(toast) && /Open/.test(toast),
    "the person is told why, and pointed at Open… → Folder… instead, got " + toast);
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });
