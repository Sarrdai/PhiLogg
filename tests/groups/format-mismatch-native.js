// GROUP format-mismatch-native — the "No line matches the log format" panel also appears on the
// load routes that never hold the file's text: the native (Rust) parser and the Blob byte-range
// worker route. Origin: 2026-10-06 usability round E1 (jsdom has no Worker, so the worker route is
// driven by stubbing canParseBlobInWorker/parseLogTextInWorker, which readParseFileNode resolves as
// globals; the real-Chromium case is checked by the lead).
group("format-mismatch-native");
if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourText = Object.fromEntries(TOUR.generateTour().map(f => [f.path, f.text]))["welcome.log"];
  const tourLines = tourText.replace(/\r?\n$/, "").split(/\r\n|\n/).length;
  const bridge = { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) };
  const panelOf = (d, body) => d.querySelector(body + " .fmt-mismatch-panel");
  const shown = (w, p) => !!p && p.classList.contains("show") && w.getComputedStyle(p).display !== "none";

  await withApp(async (w, d, T) => {
    section("format-mismatch-native a. native route: 0 entries -> panel with the line count; Open as plain text re-parses");
    await waitForFormatConfig(T);
    w.fetchCalls = [];
    w.fetch = async url => {
      w.fetchCalls.push(String(url));
      const buf = new w.TextEncoder().encode(tourText).buffer;
      return { ok: true, status: 200, arrayBuffer: async () => buf, blob: async () => new w.Blob([tourText]) };
    };
    bridge.parseLogFile = async (url, spec, onMessage) => { onMessage({ type: "progress", fraction: 1 }); return { size: new w.TextEncoder().encode(tourText).byteLength }; };
    await w.loadDesktopLocalFiles({ files: [{ name: "welcome.log", url: "philogg://local/1/welcome.log", path: "/tmp/welcome.log" }] });
    const f = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "welcome.log");
    assert(f && f.entries.length === 0 && f.noFormatMatch && f.noFormatMatch.lines === tourLines, "noFormatMatch set with " + tourLines + " lines, got " + (f && f.noFormatMatch && f.noFormatMatch.lines));
    assert(f.tail, "sanity: the native route leaves a tail on the node");
    T.state.activeId = f.id; w.render();
    const fp = panelOf(d, "#tableBody");
    assert(shown(w, fp), "the panel is shown");
    assert(fp.querySelector("p").textContent === tourLines.toLocaleString("de-DE") + " lines were read. Pick the format that fits, or open the file as plain text.", "sub-line, got " + fp.querySelector("p").textContent);
    fireClick(fp.querySelector(".fmt-mismatch-plain"), w);
    await waitFor(() => f.entries.length === tourLines);
    assert(f.formatId === "fmt-plaintext" && !f.noFormatMatch && !shown(w, panelOf(d, "#tableBody")), "re-parsed as plain text, panel gone");
  }, { philogg: bridge });

  await withApp(async (w, d, T) => {
    section("format-mismatch-native b. native route with entries never reads the file");
    await waitForFormatConfig(T);
    w.fetchCalls = [];
    w.fetch = async url => { w.fetchCalls.push(String(url)); throw new Error("must not fetch"); };
    const f = w.createFileNode("x.log");
    f.entries.push({ id: "e-x", message: "m" });
    await w.noteFormatMismatchFromBlob(f, () => { throw new Error("must not read"); });
    assert(!f.noFormatMatch && w.fetchCalls.length === 0, "entries present: nothing read");
    f.entries.length = 0;
    await w.noteFormatMismatchFromBlob(f, () => { throw new Error("unreadable"); });
    assert(!f.noFormatMatch, "a read failure is swallowed, the file stays an empty file");
  }, { philogg: bridge });

  await withApp(async (w, d, T) => {
    section("format-mismatch-native c. Blob worker route (stubbed): 0 entries -> panel");
    await waitForFormatConfig(T);
    w.canParseBlobInWorker = async () => true;
    w.parseLogTextInWorker = async () => {};
    const node = w.createFileNode("welcome.log");
    const file = new w.File([tourText], "welcome.log");
    await w.readParseFileNode(node, "welcome.log", file, null);
    assert(node.entries.length === 0 && node.noFormatMatch && node.noFormatMatch.lines === tourLines, "noFormatMatch from the Blob, got " + (node.noFormatMatch && node.noFormatMatch.lines));
    T.state.activeId = node.id; w.render();
    assert(shown(w, panelOf(d, "#tableBody")), "the panel is shown");
  });
}
