// GROUP 201 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 201 — Clickable local file paths (linkifyPaths, eager verification, the popup)
   Origin: this session. Absolute Windows/Unix paths detected inside a
   rendered message field get wrapped in a .fp-candidate span regardless of
   build, with no underline of its own (updated by GROUP 309: only a
   verified path is underlined) — only under a desktop wrapper
   (window.philogg.pathExists) does verifyVisibleFpCandidates(), called once
   per render, verify each newly-seen path and, only if it exists, upgrade
   it to the full link look (.fp-verified) and offer "Open
   file"/"Open containing folder" on hover (openPath/revealPath). A path
   that doesn't exist never gets .fp-verified and never shows the popup.
   Updated by this session's follow-up (person-reported: "hovered for a
   while, nothing happened") to verify eagerly at render time, cached by
   path, instead of on a hover debounce — 199c/199e cover that.
   ============================================================ */
group(201);
await withApp(async (w, d, T) => {
  section("201a. absolute path detection: positive and negative cases");

  assert(w.linkifyPaths('plain text, no path here').indexOf("fp-candidate") === -1,
    "no false positive on ordinary text");
  assert(w.linkifyPaths(w.escapeHtml("ratio 3/4 and date 10/09/2026")).indexOf("fp-candidate") === -1,
    "no false positive on a bare fraction or a mid-text date (not preceded by a path-safe boundary)");
  const win = w.linkifyPaths(w.escapeHtml('see C:\\src\\Foo.cs for details'));
  assert(win.includes('<span class="fp-candidate" data-fp="C:\\src\\Foo.cs">C:\\src\\Foo.cs</span>'),
    "an absolute Windows path is wrapped, got " + win);
  const unix = w.linkifyPaths(w.escapeHtml('see /var/log/app.log for details'));
  assert(unix.includes('<span class="fp-candidate" data-fp="/var/log/app.log">/var/log/app.log</span>'),
    "an absolute Unix path is wrapped, got " + unix);
  const url = w.linkifyPaths(w.escapeHtml('fetched https://example.com/path/file failed'));
  assert(!url.includes("fp-candidate"), "a URL's own \"//\" is not mistaken for an absolute Unix path, got " + url);
  const tagged = w.linkifyPaths('<mark class="hl">/etc/passwd</mark> plain');
  assert(tagged === '<mark class="hl"><span class="fp-candidate" data-fp="/etc/passwd">/etc/passwd</span></mark> plain',
    "linkifyPaths skips existing tags themselves and only wraps text content, got " + tagged);

  // Follow-up (person-reported root cause): real paths have spaces and are
  // inconsistently quoted ("mal '' drumherum, mal gar nichts").
  const bareSpaced = w.linkifyPaths(w.escapeHtml('Saved to C:\\My Program\\config.xml'));
  assert(bareSpaced.includes('<span class="fp-candidate" data-fp="C:\\My Program\\config.xml">C:\\My Program\\config.xml</span>'),
    "an unquoted Windows path with a space in a segment is still detected when it ends in a recognizable extension, got " + bareSpaced);

  const bareSpacedTrailing = w.linkifyPaths(w.escapeHtml('C:\\My Program\\config.xml for details'));
  assert(bareSpacedTrailing.includes('<span class="fp-candidate" data-fp="C:\\My Program\\config.xml">C:\\My Program\\config.xml</span>') &&
    bareSpacedTrailing.endsWith('span> for details'),
    "...and still stops right after the extension, not swallowing the rest of the sentence, got " + bareSpacedTrailing);

  const singleQuoted = w.linkifyPaths(w.escapeHtml("see 'C:\\My Program\\config.xml' done"));
  assert(singleQuoted.includes('&#39;<span class="fp-candidate" data-fp="C:\\My Program\\config.xml">C:\\My Program\\config.xml</span>&#39;'),
    "a single-quoted path (spaces included) is detected, with the quote marks left outside the span, got " + singleQuoted);

  const doubleQuoted = w.linkifyPaths(w.escapeHtml('see "C:\\My Program\\config.xml" done'));
  assert(doubleQuoted.includes('&quot;<span class="fp-candidate" data-fp="C:\\My Program\\config.xml">C:\\My Program\\config.xml</span>&quot;'),
    "a double-quoted path is detected through its escaped &quot; boundary, got " + doubleQuoted);

  const backtickQuoted = w.linkifyPaths(w.escapeHtml('see `C:\\My Program\\config.xml` done'));
  assert(backtickQuoted.includes('`<span class="fp-candidate" data-fp="C:\\My Program\\config.xml">C:\\My Program\\config.xml</span>`'),
    "a backtick-quoted path is detected too, got " + backtickQuoted);

  const bareDir = w.linkifyPaths(w.escapeHtml('path C:\\Windows\\System32 is bare'));
  assert(bareDir.includes('<span class="fp-candidate" data-fp="C:\\Windows\\System32">C:\\Windows\\System32</span>'),
    "regression: a space-free, extension-less directory path still matches via the original fallback, got " + bareDir);

  // Second follow-up (person-reported): a filename with MORE THAN ONE dot
  // (very common — versioned files, dotted .NET assembly names) used to
  // truncate at the first dot once an extension-anchor heuristic was
  // introduced for the spaced case above. Fixed by never requiring an
  // extension at all: only directory segments (each terminated by "\") may
  // contain spaces, the final segment stays exactly as space-free as it
  // always was, so it naturally runs to the next real space with no
  // "where's the extension" guessing.
  const multiDotSimple = w.linkifyPaths(w.escapeHtml('Filtered C:\\eula.1028.txt'));
  assert(multiDotSimple.includes('<span class="fp-candidate" data-fp="C:\\eula.1028.txt">C:\\eula.1028.txt</span>'),
    "a space-free filename with two dots is captured in full, not truncated at the first one, got " + multiDotSimple);

  const multiDotSpaced = w.linkifyPaths(w.escapeHtml(
    'Create catalog entry for assembly: C:\\Program Files\\MyCompany\\My Program\\MyCompany.App.Program.exe'));
  assert(multiDotSpaced.includes(
    '<span class="fp-candidate" data-fp="C:\\Program Files\\MyCompany\\My Program\\MyCompany.App.Program.exe">' +
    'C:\\Program Files\\MyCompany\\My Program\\MyCompany.App.Program.exe</span>'),
    "spaced directory segments AND a three-dot filename together are captured in full, got " + multiDotSpaced);
});

await withApp(async (w, d, T) => {
  section("201b. rendered rows: a candidate always gets its dim \"detected\" underline, but the popup never opens without window.philogg (browser build)");

  const cs = w.getComputedStyle;
  await w.addFile("a.log", makeLog(0, 3, { msgPrefix: "wrote to /var/log/app.log ok" }), () => {});
  const node = T.state.nodes[T.state.rootIds[0]];
  T.state.activeId = node.id;
  w.render();

  const span = d.querySelector(".fp-candidate");
  assert(span && span.dataset.fp === "/var/log/app.log", "the rendered row wraps the detected path, got " + (span && span.dataset.fp));
  assert(!span.classList.contains("fp-verified"), "not .fp-verified, since no window.philogg exists here to confirm it");
  assert(!cs(span).textDecoration.includes("underline"),
    "an unverified candidate has no underline (GROUP 309 — the underline itself says the path is interactive)");

  span.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  assert(d.querySelector("#fpPathMenu").classList.contains("hidden"),
    "no window.philogg in this build, so hovering never opens the popup or verifies the path");
});

await withApp(async (w, d, T) => {
  section("201c. desktop build: a candidate verifies itself right at render time, no hover needed — hovering only opens the popup from the cache");

  let pathExistsCalls = 0;
  let openedPath = null;
  w.philogg.pathExists = () => { pathExistsCalls++; return Promise.resolve(true); };
  w.philogg.openPath = p => { openedPath = p; };

  await w.addFile("a.log", makeLog(0, 3, { msgPrefix: "wrote to /var/log/app.log ok" }), () => {});
  const node = T.state.nodes[T.state.rootIds[0]];
  T.state.activeId = node.id;
  w.render();
  await new Promise(r => setTimeout(r, 0)); // let the pathExists() promise settle

  const span = d.querySelector(".fp-candidate");
  assert(span.classList.contains("fp-verified"),
    "an existing path is already marked verified right after render — no mouseover was dispatched here at all");
  assert(w.getComputedStyle(span).textDecoration.includes("underline"), "a verified path is underlined");
  assert(pathExistsCalls === 1, "verified via exactly one pathExists() call, got " + pathExistsCalls);

  const menu = d.querySelector("#fpPathMenu");
  assert(menu.classList.contains("hidden"), "...but the popup itself still only opens on an actual hover");
  span.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  assert(!menu.classList.contains("hidden"), "hovering an already-verified span opens the popup immediately — no debounce, no new IPC call needed");
  assert(pathExistsCalls === 1, "...confirmed: still exactly one pathExists() call after hovering, got " + pathExistsCalls);

  const items = [...menu.querySelectorAll("[data-fp-action]")].map(i => i.dataset.fpAction);
  assert(items.includes("open") && items.includes("reveal"), "both actions are offered, got " + JSON.stringify(items));
  fireClick(menu.querySelector('[data-fp-action="open"]'), w);
  assert(openedPath === "/var/log/app.log", "\"Open file\" calls window.philogg.openPath with the path, got " + openedPath);
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]), pathExists: () => Promise.resolve(true), openPath: () => {} } });

await withApp(async (w, d, T) => {
  section("201d. two rows sharing the same path only trigger one pathExists() call (per-path cache/dedupe)");

  let pathExistsCalls = 0;
  w.philogg.pathExists = () => { pathExistsCalls++; return Promise.resolve(true); };

  await w.addFile("a.log", makeLog(0, 5, { msgPrefix: "wrote to /var/log/shared.log ok" }), () => {});
  const node = T.state.nodes[T.state.rootIds[0]];
  T.state.activeId = node.id;
  w.render();
  await new Promise(r => setTimeout(r, 0));

  const spans = [...d.querySelectorAll(".fp-candidate")];
  assert(spans.length >= 2, "sanity: more than one row rendered the same repeated path, got " + spans.length);
  assert(spans.every(s => s.classList.contains("fp-verified")), "every occurrence of the same path gets verified, not just the first one rendered");
  assert(pathExistsCalls === 1, "the repeated path is only checked once across all rows/renders, got " + pathExistsCalls + " call(s)");
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]), pathExists: () => Promise.resolve(true) } });

await withApp(async (w, d, T) => {
  section("201e. desktop build: a nonexistent path never gets verified or opens the popup");

  await w.addFile("a.log", makeLog(0, 3, { msgPrefix: "wrote to /var/log/gone.log ok" }), () => {});
  const node = T.state.nodes[T.state.rootIds[0]];
  T.state.activeId = node.id;
  w.render();
  await new Promise(r => setTimeout(r, 0));

  const span = d.querySelector(".fp-candidate");
  assert(!span.classList.contains("fp-verified"), "a nonexistent path is never marked verified");
  span.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  assert(d.querySelector("#fpPathMenu").classList.contains("hidden"), "...and the popup never opens for it");
}, { philogg: {
  getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]),
  pathExists: () => Promise.resolve(false),
} });
