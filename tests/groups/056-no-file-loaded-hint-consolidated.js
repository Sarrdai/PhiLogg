// GROUP 56 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 56 — "No file loaded" hint consolidated to #emptyState only
   Origin: this session (person-requested): with zero files loaded, don't
   show the #viewBar toolbar (level filter etc.) anymore, and remove the
   duplicate "no file" hints that used to live in the tree sidebar
   (#dropHint) and the toolbar status text (#statusText showing "No files
   loaded") — #emptyState's centered message is now the ONLY such hint.
   ============================================================ */
group(56);
await withApp(async (w, d, T) => {
  section("56. No-file-loaded state: single centered hint, no toolbar/sidebar duplicates");

  assert(T.state.rootIds.length === 0, "sanity: no files loaded yet");
  assert(d.querySelector("#dropHint") === null, "#dropHint no longer exists in the tree sidebar");
  assert(d.querySelector("#emptyState").style.display === "flex", "#emptyState (centered hint) is shown");
  assert(d.querySelector("#emptyState h2").textContent.includes("No log file loaded"), "#emptyState still carries its message");
  assert(d.querySelector("#statusText").textContent === "", "toolbar status text carries no 'No files loaded' duplicate hint");
  assert(d.querySelector("#viewBar").style.display === "none", "the toolbar with the level filter/tabs/breadcrumb is hidden entirely");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  assert(d.querySelector("#emptyState").style.display === "none", "#emptyState hides once a file is loaded");
  assert(d.querySelector("#viewBar").style.display === "", "#viewBar reappears once a file is loaded");
  assert(d.querySelector("#statusText").textContent.includes("1 file"), "toolbar status text shows the real file/entry count again, got " + d.querySelector("#statusText").textContent);
});
