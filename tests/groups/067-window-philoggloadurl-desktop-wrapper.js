// GROUP 67 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

// 66d (the location.protocol === "file:" guard) is NOT covered here: jsdom
// treats every file: URL as an opaque origin and throws on ANY localStorage
// access (confirmed for both "file:///x.html" and "file://localhost/x.html"
// — no URL shape avoids it), which the app's own boot sequence (initTheme,
// cacheEnabled) touches before loadFromUrlParam ever runs — unrelated to the
// guard's own logic, but it means a jsdom window can't reach this branch at
// all. window.location itself also can't be shadowed/faked afterwards
// (Object.defineProperty on either `location` or `location.protocol` is
// rejected by jsdom as non-configurable). See tests/README.md "Known gaps".
// The guard (four lines, `if (location.protocol === "file:") {...}`) is
// straightforward enough to cover by code review instead.

/* ============================================================
   GROUP 67 — window.philoggLoadUrl: desktop wrapper hands a
   later-opened file into the already-running window
   Origin: this session (2026-08-20), person-reported (Windows desktop
   build): a second file opened via file-association double-click spawned
   a whole new app window instead of landing in the one already open, and
   the first file loaded showed up in the tree named "1" instead of its
   real file name. Root causes: (1) the wrapper's single-instance handler
   unconditionally created a new window instead of reusing an existing
   one, and (2) the philogg://local/<id> URL it built carried
   only the opaque numeric id as its last path segment, which is exactly
   what loadFromUrlParam's name-from-URL logic (GROUP 66) picks up. Fixed
   by (1) refactoring loadFromUrlParam's fetch-and-add body out into
   loadUrlIntoTree(url), exposed as window.philoggLoadUrl for the main
   wrapper to call on an existing window, and (2) having the wrapper embed
   the real basename as a second path segment
   (philogg://local/<id>/<name>) so the existing last-segment naming logic
   picks up the true file name for free. Covered here: the page-side
   half (loadUrlIntoTree/philoggLoadUrl itself, and that repeated calls
   accumulate files rather than replace them) — the wrapper's own window
   and single-instance handling isn't reachable from this jsdom suite,
   see tests/README.md.
   ============================================================ */
group(67);
await withApp(async (w, d, T) => {
  section("67a. window.philoggLoadUrl is exposed as the same logic loadFromUrlParam uses");
  assert(typeof w.philoggLoadUrl === "function", "window.philoggLoadUrl is a function");
  const logText = makeLog(0, 2);
  w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(logText).buffer });
  await w.philoggLoadUrl("philogg://local/1/first.log");
  assert(T.state.rootIds.length === 1, "one file was added, got " + T.state.rootIds.length);
  assert(T.state.nodes[T.state.rootIds[0]].name === "first.log", "file name comes from the URL's last path segment, got " + T.state.nodes[T.state.rootIds[0]].name);
});

await withApp(async (w, d, T) => {
  section("67b. a second philoggLoadUrl call adds a second file instead of replacing the first");
  const log1 = makeLog(0, 2), log2 = makeLog(0, 3);
  let requested = [];
  w.fetch = async (u) => { requested.push(u); const text = requested.length === 1 ? log1 : log2; return { ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(text).buffer }; };
  await w.philoggLoadUrl("philogg://local/1/first.log");
  await w.philoggLoadUrl("philogg://local/2/second.log");
  assert(requested.length === 2, "fetch was called once per opened file");
  assert(T.state.rootIds.length === 2, "both files ended up in the same tree, got " + T.state.rootIds.length);
  const names = T.state.rootIds.map(id => T.state.nodes[id].name).sort();
  assert(names[0] === "first.log" && names[1] === "second.log", "both real file names are present, got " + names.join(", "));
});
