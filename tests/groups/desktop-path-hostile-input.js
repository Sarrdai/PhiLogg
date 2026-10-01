// GROUP desktop-path-hostile-input — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, fs, path, ...) is
// in scope.

/* ============================================================
   GROUP desktop-path-hostile-input — a hostile log file must not make the
   desktop app contact a remote machine just by being scrolled into view,
   nor get an executable launched through the "open" actions.
   Origin: 2026-10-02 (code review). linkifyPaths wraps every path-looking
   string in a rendered row and verifyVisibleFpCandidates asks the wrapper
   (window.philogg.pathExists) about each one; on Windows, asking about
   `\\attacker.example\share\x` opens an SMB connection and sends the user's
   NTLM credentials. So: a remote path (isRemoteFilePath, mirroring Rust's
   pathguard::is_remote_path) is never wrapped and never reaches pathExists;
   only the IDE jump, which builds its path from the connected IDE's own
   solution directory, passes { allowRemote: true }. The wrapper refuses to
   open executable types (open_path, open_extracted_entry) — the page shows
   the refusal instead of failing silently. The Rust side has its own unit
   tests (desktop/src-tauri/src/pathguard.rs).
   ============================================================ */
group("desktop-path-hostile-input");

// A stand-in for the desktop wrapper's bridge: the methods every window in
// these groups needs, plus whatever the section overrides.
const hostileBridge = extra => ({
  getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]),
  pathExists: () => Promise.resolve(true), openPath: () => {},
  ...extra,
});

await withApp(async (w) => {
  section("hostile-a. isRemoteFilePath: UNC, device and NT-object paths are remote; local paths are not (mirrors pathguard.rs)");

  for (const p of [
    String.raw`\\server\share\x.log`,
    String.raw`\\attacker.example\share\x`,
    String.raw`\\server`,
    String.raw`\\192.168.0.5\c$\x.log`,
    String.raw`\\host@SSL\DavWWWRoot\x.log`,
    "//server/share/x.log",
    String.raw`\/server/share`,
    String.raw`/\server\share`,
    String.raw`\\?\UNC\server\share\x.log`,
    String.raw`\\?\unc\server\share`,
    "//?/UNC/server/share",
    String.raw`\\.\pipe\x`,
    String.raw`\\.\C:\x`,
    String.raw`\\?\GLOBALROOT\Device\Mup\server\share`,
    String.raw`\\?\Volume{01234567-89ab-cdef-0123-456789abcdef}\x.log`,
    String.raw`\??\UNC\server\share\x`,
    String.raw`  \\server\share`,
  ]) assert(w.isRemoteFilePath(p) === true, JSON.stringify(p) + " must be remote");

  for (const p of [
    String.raw`\\?\C:\logs\app.log`,
    String.raw`\\?\c:\logs`,
    String.raw`\\?\C:`,
    "//?/C:/logs/app.log",
    String.raw`\??\C:\logs\app.log`,
    String.raw`C:\logs\app.log`,
    "C:/logs/app.log",
    "/var/log/app.log",
    "/usr/lib/x",
    String.raw`\server\share`,
    String.raw`logs\app.log`,
    "app.log",
    "",
  ]) assert(w.isRemoteFilePath(p) === false, JSON.stringify(p) + " must not be remote");
});

await withApp(async (w) => {
  section("hostile-b. linkifyPaths leaves a remote path as plain text, bare or inside quotes/backticks; a local one still becomes a candidate");

  const escaped = text => w.linkifyPaths(w.escapeHtml(text));
  for (const text of [
    String.raw`see \\attacker.example\share\x.log now`,
    String.raw`see '\\attacker.example\share\x.log' now`,
    String.raw`see "\\attacker.example\share\x.log" now`,
    String.raw`see ` + "`" + String.raw`\\attacker.example\share\x.log` + "`" + ` now`,
    "see '//server/share/x.log' now",
    'see "//server/share/x.log" now',
    "see `//server/share/x.log` now",
    "see //server/share/x.log now",
    String.raw`see '\\?\UNC\server\share\x' now`,
    String.raw`see "\\?\UNC\server\share\x" now`,
    String.raw`see \\?\UNC\server\share\x now`,
    String.raw`see '\\.\pipe\x' now`,
    String.raw`see '/\server\share\x.log' now`,
  ]) {
    const out = escaped(text);
    assert(!out.includes("fp-candidate"), "no candidate span for " + JSON.stringify(text) + ", got " + out);
    assert(out === w.escapeHtml(text), "the remote text stays exactly as it was (quotes and all) for " + JSON.stringify(text) + ", got " + out);
  }

  const mixed = escaped(String.raw`'\\attacker.example\share\x.log' then C:\logs\app.log done`);
  assert(mixed.includes('<span class="fp-candidate" data-fp="C:\\logs\\app.log">C:\\logs\\app.log</span>') &&
    (mixed.match(/fp-candidate/g) || []).length === 1,
    "a local path next to a remote one is still wrapped, and only it, got " + mixed);
  const localExtended = escaped(String.raw`opened '\\?\C:\logs\app.log' ok`);
  assert(localExtended.includes('data-fp="\\\\?\\C:\\logs\\app.log"'),
    "a local extended-length path (\\\\?\\C:\\...) is still a candidate, got " + localExtended);
  const quotedLocal = escaped(String.raw`opened 'C:\My Program\a.log' ok`);
  assert(quotedLocal.includes('&#39;<span class="fp-candidate" data-fp="C:\\My Program\\a.log">'),
    "a quoted local path is unchanged (quotes outside the span), got " + quotedLocal);
});

await withApp(async (w, d, T) => {
  section("hostile-c. rendered rows: a hostile message makes no pathExists call for any remote path; exactly the local candidate is verified");
  w.applyFhView("stacked"); // both Log views on screen: the Context view is only built while visible (GROUP 270)

  const calls = [];
  w.philogg.pathExists = (p, opts) => { calls.push({ p, opts }); return Promise.resolve(true); };

  const hostile = [
    String.raw`leak \\attacker.example\share\x.log`,
    "and //server/share/x.log",
    "and '//quoted/share/x.log'",
    "and `" + String.raw`\\tick\share\x.log` + "`",
    String.raw`and \\?\UNC\server\share\x`,
    String.raw`and '\\?\UNC\server\share\y'`,
    String.raw`and C:\logs\app.log ok`,
  ].join(" ");
  const f = await w.addFile("a.log", makeLog(0, 3, { msgPrefix: hostile }), () => {});
  T.state.activeId = f.id;
  w.render();

  // verifyVisibleFpCandidates runs synchronously inside the render: whatever
  // it was going to ask, it has asked by now.
  assert(calls.length === 1 && calls[0].p === String.raw`C:\logs\app.log`,
    "the spy saw exactly the local path, got " + JSON.stringify(calls.map(c => c.p)));
  assert(calls[0].opts === undefined || !calls[0].opts.allowRemote,
    "...asked without allowRemote, got " + JSON.stringify(calls[0].opts));

  for (const sel of ["#tableRows", "#highlightRows"]) {
    const spans = [...d.querySelectorAll(sel + " .fp-candidate")];
    assert(spans.length > 0 && spans.every(s => s.dataset.fp === String.raw`C:\logs\app.log`),
      sel + ": the only candidate spans are the local path, got " + JSON.stringify(spans.map(s => s.dataset.fp)));
    const text = d.querySelector(sel + " .col-msg").textContent;
    assert(text.includes(String.raw`\\attacker.example\share\x.log`) && text.includes("//server/share/x.log") &&
      text.includes(String.raw`\\?\UNC\server\share\x`),
      sel + ": the remote text itself is still displayed, as plain text, got " + text);
  }
  await waitFor(() => d.querySelector("#tableRows .fp-candidate").classList.contains("fp-verified"));
  assert(calls.length === 1, "no further pathExists call after the verification settled, got " + calls.length);

  section("hostile-d. defence in depth: a remote .fp-candidate that reaches verifyVisibleFpCandidates anyway is skipped");
  const box = d.createElement("div");
  box.innerHTML =
    '<span class="fp-candidate" data-fp="\\\\attacker.example\\share\\x.log">x</span>' +
    '<span class="fp-candidate" data-fp="//server/share/x.log">x</span>' +
    '<span class="fp-candidate" data-fp="\\\\?\\UNC\\server\\share\\x">x</span>';
  w.verifyVisibleFpCandidates(box);
  assert(calls.length === 1, "no pathExists call for any of the three remote candidates, got " + JSON.stringify(calls.map(c => c.p)));
  assert(![...box.querySelectorAll(".fp-candidate")].some(s => s.classList.contains("fp-verified")), "...and none was marked verified");

  section("hostile-e. the clickable-paths toggle still works: off drops every span, on brings back only the local candidate");
  fireClick(d.querySelector(".toggle-filepaths"), w);
  assert(!d.querySelector("#tableRows .fp-candidate"), "off: no candidate spans at all");
  fireClick(d.querySelector(".toggle-filepaths"), w);
  const back = [...d.querySelectorAll("#tableRows .fp-candidate")];
  assert(back.length > 0 && back.every(s => s.dataset.fp === String.raw`C:\logs\app.log`),
    "on again: just the local candidate, got " + JSON.stringify(back.map(s => s.dataset.fp)));
  assert(calls.length === 1, "...served from the cache, still one pathExists call in total, got " + calls.length);
}, { philogg: hostileBridge() });

await withApp(async (w, d, T) => {
  section("hostile-f. the Visual Studio jump is the one caller that passes { allowRemote: true } (its path comes from the IDE's own solution directory)");

  const calls = [];
  const opened = [];
  w.philogg.pathExists = (p, opts) => { calls.push({ p, opts }); return Promise.resolve(true); };
  w.philogg.vsOpenFile = (moniker, p, line) => { opened.push({ moniker, p, line }); return Promise.resolve(); };

  // ideVsConnection / ideAnchorFolder are top-level lets: set them from a
  // second script sharing the page's lexical scope (see withApp's bridge).
  const solutionDir = String.raw`\\fileserver\share\Projects`;
  const s = d.createElement("script");
  s.textContent = "ideVsConnection = " + JSON.stringify({ moniker: "m1", solutionDir, label: "Sol.sln" }) +
    '; ideAnchorFolder = "Projects";';
  d.body.appendChild(s);

  w.openEntryInVisualStudio({ location: String.raw`C:\git\app\Projects\Core\Foo.cs` + " line 12" });
  await waitFor(() => opened.length === 1);
  assert(calls.length === 1 && calls[0].p === String.raw`\\fileserver\share\Projects\Core\Foo.cs`,
    "the jump asks about the resolved network path, got " + JSON.stringify(calls.map(c => c.p)));
  assert(calls[0].opts && calls[0].opts.allowRemote === true,
    "...with { allowRemote: true } as second argument, got " + JSON.stringify(calls[0].opts));
  assert(opened[0].p === calls[0].p && opened[0].line === 12, "...and then opens it in the connected instance, got " + JSON.stringify(opened));

  // A log-derived candidate in the same window never gets the flag.
  const f = await w.addFile("a.log", makeLog(0, 3, { msgPrefix: "wrote to /var/log/app.log ok" }), () => {});
  T.state.activeId = f.id;
  w.render();
  assert(calls.length === 2 && calls[1].p === "/var/log/app.log", "the log-derived candidate was verified, got " + JSON.stringify(calls.map(c => c.p)));
  assert(calls[1].opts === undefined || !calls[1].opts.allowRemote,
    "...without allowRemote, got " + JSON.stringify(calls[1].opts));
}, { philogg: hostileBridge() });

await withApp(async (w, d, T) => {
  section("hostile-g. \"Open file\" on a candidate the wrapper refuses (rejected openPath) shows the reason in the toast");

  const refusal = "Refusing to open executable content: Setup.exe";
  const attempts = [];
  w.philogg.openPath = p => { attempts.push(p); return Promise.reject(refusal); }; // a plain string, like a Tauri Err(String)

  const f = await w.addFile("a.log", makeLog(0, 1, { msgPrefix: String.raw`ran C:\Users\x\Downloads\Setup.exe ok` }), () => {});
  T.state.activeId = f.id;
  w.render();
  await waitFor(() => d.querySelector(".fp-candidate").classList.contains("fp-verified"));

  const span = d.querySelector(".fp-candidate");
  span.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  fireClick(d.querySelector('#fpPathMenu [data-fp-action="open"]'), w);
  assert(attempts.length === 1 && attempts[0] === String.raw`C:\Users\x\Downloads\Setup.exe`, "sanity: openPath was asked, got " + JSON.stringify(attempts));
  await waitFor(() => d.querySelector("#copyToast").textContent.includes(refusal));
  assert(d.querySelector("#copyToast").textContent.includes("Setup.exe"), "the toast names the file and carries the wrapper's reason, got " + d.querySelector("#copyToast").textContent);
  assert(d.querySelector("#fpPathMenu").classList.contains("hidden"), "the popup still closes after the click");

  // An Error object (a bridge that wraps its failures) reads the same way.
  w.philogg.openPath = () => Promise.reject(new Error("no application is associated with this file"));
  span.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  fireClick(d.querySelector('#fpPathMenu [data-fp-action="open"]'), w);
  await waitFor(() => d.querySelector("#copyToast").textContent.includes("no application is associated"));
}, { philogg: hostileBridge() });

await withApp(async (w, d, T) => {
  section("hostile-h. ZIP \"open externally\": the wrapper's refusal for an executable entry reaches the toast as text, not \"undefined\"");

  w.Response = Response;
  w.DecompressionStream = DecompressionStream;
  const refusal = "Refusing to open executable content from an archive: setup.exe";
  let asked = null;
  w.philogg.openExtractedEntry = (name) => { asked = name; return Promise.reject(refusal); };

  const zipBuf = buildZipFixture([{ name: "setup.exe", data: "MZ fake", method: 0 }]);
  await w.openZipSource(new w.File([zipBuf], "logs.zip"), "logs.zip");
  d.querySelector("#zipList .folder-watch-file").dispatchEvent(new w.Event("dblclick", { bubbles: true }));

  await waitFor(() => d.querySelector("#copyToast").textContent.includes(refusal));
  const toast = d.querySelector("#copyToast").textContent;
  assert(asked === "setup.exe" && !toast.includes("undefined"), "the toast carries the reason, got " + toast);
  assert(T.state.rootIds.length === 0, "...and nothing was loaded into the tree");
}, { philogg: hostileBridge({ openExtractedEntry: () => Promise.resolve() }) });
