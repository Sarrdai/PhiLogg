// GROUP 89 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 89 — Bugfix (feature backlog #11): a file opened via desktop
   launch argument / file-association now gets tailed
   Origin: this session (2026-08-22). Root cause: loadUrlIntoTree (used for
   EVERY desktop-wrapper-opened file, including the very first one passed as
   a command-line argument — see the wrapper's windows.rs
   — and any later file-association/second-instance one via philoggLoadUrl, GROUP
   67 above) built the node purely from already-fetched text via addFile(),
   the exact same path used for a one-shot http(s) CI report link, so it
   never got a node.tail — the file just sat as a static snapshot even
   though the desktop wrapper serves it from a real file on disk that CAN
   grow. Fixed by recognizing the desktop wrapper's own
   `philogg://local/<id>/…` url scheme (which the wrapper re-reads fresh off
   disk on every request — see the wrapper's protocol.rs) and wiring
   node.tail with a handle that just re-fetches
   that same url, reusing the existing tailTick poll loop (GROUP 12)
   unchanged — which incidentally also covers the backlog item's second,
   softer ask ("periodically re-check static files for changes"): a file
   that never grows still gets polled every TAIL_POLL_MS for free, instead
   of never being looked at again after the initial load. An ordinary
   http(s) ?url= (CI report link, GROUP 66) deliberately does NOT get this —
   only the desktop-local scheme is recognized (isDesktopLocalUrl).
   ============================================================ */
group(89);
await withApp(async (w, d, T) => {
  section("89a. a philogg://local/… url gets tailed");
  const initial = makeLog(0, 3);
  w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(initial).buffer });
  await w.philoggLoadUrl("philogg://local/1/live.log");
  const node = T.state.nodes[T.state.rootIds[0]];
  assert(!!(node.tail && node.tail.handle), "the file loaded via the desktop-local url scheme got a live tail handle");
  assert(T.state.tailFollow === true, "opening a desktop-local file starts in tail-follow mode, same as a drag-dropped live file");

  // Prove the attached handle actually drives real growth through tailTick,
  // not just that a tail object got attached.
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"new entry"\n`;
  w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(initial + appended).buffer });
  await w.tailTick();
  assert(node.entries.length === 4, "tailTick picks up growth fetched through the desktop-local url's tail handle, got " + node.entries.length);
});

await withApp(async (w, d, T) => {
  section("89b. a plain http(s) ?url= report link is NOT tailed");
  const logText = makeLog(0, 2);
  w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(logText).buffer });
  await w.philoggLoadUrl("http://logs.example/build-42/output.log");
  const node = T.state.nodes[T.state.rootIds[0]];
  assert(!node.tail, "an ordinary http(s) report link stays a static snapshot, not auto-tailed");
});
