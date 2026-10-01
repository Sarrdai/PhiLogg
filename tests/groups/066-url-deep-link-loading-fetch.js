// GROUP 66 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 66 — ?url= deep-link loading (fetch a log at boot)
   Origin: this session (2026-08-20), person-requested: associate PhiLogg
   with files/CI links by letting philogg.html?url=<encoded-url> fetch and
   open a log straight from an http(s) URL at boot — the shared mechanism
   both a CI report link to a log artifact and the planned desktop wrapper
   (which serves a local file through a loopback URL) build on, instead of
   two separate loading paths. jsdom ships no fetch at all (by design), so
   these tests install a fake `window.fetch` directly before calling the
   exposed `loadFromUrlParam()` (a function declaration, so it's a window
   property per the usual jsdom bridge gotcha) — bypassing the fire-and-
   forget call the boot script itself makes (which races the fake fetch's
   installation and is a no-op anyway against the default test URL, which
   carries no ?url=).
   ============================================================ */
group(66);
await withApp(async (w, d, T) => {
  section("66a. ?url= fetch success adds the file");
  const logText = makeLog(0, 3);
  await w.history.replaceState(null, "", "http://localhost/philogg.html?url=" + encodeURIComponent("http://logs.example/build-42/output.log"));
  let requestedUrl = null;
  w.fetch = async (u) => { requestedUrl = u; return { ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(logText).buffer }; };
  await w.loadFromUrlParam();
  assert(requestedUrl === "http://logs.example/build-42/output.log", "fetch was called with the exact ?url= value");
  assert(T.state.rootIds.length === 1, "exactly one file was opened, got " + T.state.rootIds.length);
  const node = T.state.nodes[T.state.rootIds[0]];
  assert(node.name === "output.log", "the file name is derived from the URL's last path segment, got " + node.name);
  assert(node.entries.length === 3, "the fetched text was parsed into entries, got " + node.entries.length);
});

await withApp(async (w, d, T) => {
  section("66b. ?url= HTTP error shows a toast, no file added");
  await w.history.replaceState(null, "", "http://localhost/philogg.html?url=" + encodeURIComponent("http://logs.example/missing.log"));
  w.fetch = async () => ({ ok: false, status: 404, text: async () => "" });
  await w.loadFromUrlParam();
  assert(T.state.rootIds.length === 0, "no file was added on a 404");
  assert(d.querySelector("#copyToast").textContent.includes("404"), "the toast reports the HTTP status");
});

await withApp(async (w, d, T) => {
  section("66c. ?url= network/CORS failure shows a toast, no file added");
  await w.history.replaceState(null, "", "http://localhost/philogg.html?url=" + encodeURIComponent("http://blocked.example/x.log"));
  w.fetch = async () => { throw new w.TypeError("Failed to fetch"); };
  await w.loadFromUrlParam();
  assert(T.state.rootIds.length === 0, "no file was added when fetch rejects");
  assert(d.querySelector("#copyToast").textContent.includes("network or CORS"), "the toast names network/CORS as the likely cause");
});
