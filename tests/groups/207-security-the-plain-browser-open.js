// GROUP 207 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 207 — Security: the plain-browser "open a non-log ZIP entry
   externally" fallback builds a Blob: URL and window.open()s it. A Blob URL
   inherits PhiLogg's OWN origin, so an active-content type (HTML/XHTML/SVG)
   would execute the archived file's scripts against PhiLogg's localStorage.
   safeTabBlobMimeType neutralizes those to text/plain (inert source view);
   every other type keeps its real MIME. The desktop wrapper never reaches
   this path (openExtractedEntry hands bytes to the OS instead), and images
   route to the in-app inline viewer, so nothing legitimate is downgraded.
   ============================================================ */
group(207);
section("GROUP 207 — ZIP external-open Blob tab can't execute archived HTML/SVG in PhiLogg's origin");

await withApp(async (w, d, T) => {
  section("207a. safeTabBlobMimeType downgrades script-capable extensions to text/plain, passes every other type through unchanged");

  ["evil.svg", "page.html", "page.htm", "doc.xhtml", "doc.xht", "UPPER.SVG"].forEach(name =>
    assert(w.safeTabBlobMimeType(name) === "text/plain", name + " is served as inert text/plain, got " + w.safeTabBlobMimeType(name)));

  assert(w.safeTabBlobMimeType("manual.pdf") === "application/pdf", ".pdf keeps its real MIME so the tab still renders it, got " + w.safeTabBlobMimeType("manual.pdf"));
  assert(w.safeTabBlobMimeType("data.bin") === "application/octet-stream", "an unknown type still downloads as octet-stream, got " + w.safeTabBlobMimeType("data.bin"));
  // Guards against a future refactor that would route the inline image
  // viewer's own Blob through this helper: a real image type must survive.
  assert(w.safeTabBlobMimeType("shot.png") === "image/png", ".png keeps image/png (only html/xhtml/svg are neutralized), got " + w.safeTabBlobMimeType("shot.png"));
});

await withApp(async (w, d, T) => {
  section("207b. end to end: double-clicking a .svg ZIP entry (no desktop wrapper) opens a Blob tab whose type is text/plain, so the archived <script> never runs in PhiLogg's origin");

  w.Response = Response;
  w.DecompressionStream = DecompressionStream;
  // No window.philogg here (withApp leaves it undefined unless opts.philogg is
  // passed), so openZipEntryExternally takes the plain-browser Blob fallback.
  assert(!w.philogg, "precondition: no desktop wrapper, so the Blob-tab fallback is the path exercised");

  const evil = '<svg xmlns="http://www.w3.org/2000/svg"><script>parent.__pwned=1</script></svg>';
  const zipBuf = buildZipFixture([{ name: "evil.svg", data: evil, method: 0 }]);
  await w.openZipSource(new w.File([zipBuf], "logs.zip"), "logs.zip");

  let capturedBlob = null, openedUrl = null;
  w.URL.createObjectURL = blob => { capturedBlob = blob; return "blob:mock"; };
  w.URL.revokeObjectURL = () => {};
  w.open = url => { openedUrl = url; };

  const row = d.querySelector("#zipList .folder-watch-file");
  row.dispatchEvent(new w.Event("dblclick", { bubbles: true }));
  await waitFor(() => capturedBlob !== null);

  assert(openedUrl === "blob:mock", "the Blob URL is opened in a tab (the fallback path), got " + openedUrl);
  assert(capturedBlob.type === "text/plain", "the .svg entry's Blob is neutralized to text/plain, not image/svg+xml, got " + capturedBlob.type);
  assert(w.__pwned === undefined, "the archived <svg><script> never executed against PhiLogg's origin");
  assert(T.state.rootIds.length === 0, "external-open still creates no tree node for a non-log entry");
});
