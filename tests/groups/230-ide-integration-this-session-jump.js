// GROUP 230 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 230 — IDE Integration (this session): jump from a log entry's
   Location straight into a running IDE. Covers only the pure, DOM/IPC-free
   remap logic — parseIdeLocation, resolveIdeSourcePath, and buildRiderUri
   (near the context-menu wiring). The
   Visual Studio COM/PowerShell side (desktop/src-tauri/src/vs_integration.rs),
   the Settings dialog's Connect flow, and the context-menu items' live
   window.philogg-gated visibility are Windows-desktop-only and unreachable
   under jsdom — see tests/README.md "Known gaps".
   ============================================================ */
group(230);
await withApp(async (w) => {
  section("230a. parseIdeLocation: raw path + line extraction");

  const parsed = w.parseIdeLocation("C:\\src\\Foo.cs line 152");
  assert(parsed && parsed.path === "C:\\src\\Foo.cs" && parsed.line === 152,
    "well-formed \"path line N\" parses to the whole path + numeric line, got " + JSON.stringify(parsed));

  assert(w.parseIdeLocation("C:\\src\\Foo.cs") === null, "a location with no \" line N\" suffix returns null");
  assert(w.parseIdeLocation("") === null, "an empty location returns null");
  assert(w.parseIdeLocation(null) === null, "a null/undefined location returns null rather than throwing");

  const withLineWord = w.parseIdeLocation("C:\\src\\online\\Foo.cs line 9");
  assert(withLineWord && withLineWord.path === "C:\\src\\online\\Foo.cs" && withLineWord.line === 9,
    "a path containing the substring \"line\" earlier still resolves against the LAST \" line N\" suffix, got " + JSON.stringify(withLineWord));
});

await withApp(async (w) => {
  section("230b. resolveIdeSourcePath: pattern-based anchor remap, excluding the match itself");

  // Corrected understanding of the feature's own motivating example
  // (person-reported this session, via a real Visual Studio/Rider test):
  // the anchor folder ("Projects") is the folder the solution/project sits
  // DIRECTLY inside, not that folder's parent — so solutionDir itself ends
  // in "...\Projects", and the relative part must NOT repeat it.
  const logged = "C:\\git\\myProject\\Code\\Projects\\MyCompany.Core\\Notification\\NotificationService.cs line 152";
  const solutionDir = "D:\\dev\\myProject\\Code\\Projects";
  const resolved = w.resolveIdeSourcePath(logged, "Projects", solutionDir);
  assert(resolved.path === "D:\\dev\\myProject\\Code\\Projects\\MyCompany.Core\\Notification\\NotificationService.cs" && resolved.line === 152,
    "resolves onto the local solution directory, joining only what comes AFTER the anchor match (not the match itself), got " + JSON.stringify(resolved));
  assert(!resolved.path.includes("Projects\\Projects"), "sanity: the anchor segment is never duplicated in the resolved path");

  const caseInsensitive = w.resolveIdeSourcePath(logged, "projects", solutionDir);
  assert(caseInsensitive.path === resolved.path, "the anchor pattern match is case-insensitive (\"projects\" still matches \"Projects\")");

  const missingAnchor = w.resolveIdeSourcePath(logged, "NoSuchFolder", solutionDir);
  assert(missingAnchor.error === "anchor-not-found", "an anchor pattern absent from the path reports anchor-not-found, got " + JSON.stringify(missingAnchor));

  const noLine = w.resolveIdeSourcePath("C:\\git\\myProject\\Code\\Projects\\Foo.cs", "Projects", solutionDir);
  assert(noLine.error === "no-location", "a location with no line number reports no-location, got " + JSON.stringify(noLine));

  // The anchor's plain name occurs twice, and this time the LATER
  // occurrence is a coincidental nested folder, not the real anchor — a
  // bare, ambiguous pattern picks the wrong (deepest) one and loses
  // "MyCompany.Core" from the relative path; a longer, multi-segment
  // pattern (either slash style) disambiguates correctly. This is the
  // concrete "Projects twice in the path" scenario the person raised.
  const tricky = "C:\\git\\myProject\\Code\\Projects\\MyCompany.Core\\Projects\\Foo.cs line 3";
  const bareAmbiguous = w.resolveIdeSourcePath(tricky, "Projects", solutionDir);
  assert(bareAmbiguous.path === "D:\\dev\\myProject\\Code\\Projects\\Foo.cs",
    "sanity: a bare, ambiguous anchor name resolves against the wrong (deepest, coincidental) occurrence here, got " + bareAmbiguous.path);
  const disambiguated = w.resolveIdeSourcePath(tricky, "Code\\Projects", solutionDir);
  assert(disambiguated.path === "D:\\dev\\myProject\\Code\\Projects\\MyCompany.Core\\Projects\\Foo.cs",
    "a longer, multi-segment pattern matches only the real anchor and disambiguates correctly, got " + disambiguated.path);
  const disambiguatedForwardSlash = w.resolveIdeSourcePath(tricky, "Code/Projects", solutionDir);
  assert(disambiguatedForwardSlash.path === disambiguated.path,
    "the pattern's own slash style doesn't matter — \"Code/Projects\" matches a backslash path the same way");

  // '*' wildcard, same convention as compileGlob's file-pattern matching.
  const wildcard = w.resolveIdeSourcePath(logged, "Pro*ts", solutionDir);
  assert(wildcard.path === resolved.path, "a '*' wildcard inside the pattern matches like compileGlob's own '*' would, got " + wildcard.path);

  // solutionDir with a trailing separator doesn't produce a doubled one.
  const trailingSlash = w.resolveIdeSourcePath(logged, "Projects", solutionDir + "\\");
  assert(trailingSlash.path === resolved.path, "a trailing separator on solutionDir doesn't double up in the joined path, got " + trailingSlash.path);

  // The real-world report this fix is built on: Rider's case (solutionDir
  // "", a plain project-relative path, no local join) must NOT include the
  // anchor segment — confirmed against a real, working jetbrains:// link.
  const riderLogged = "D:\\ThisUser\\dev\\myRepo\\Code\\Projects\\MyCompany.Controller.Scripting\\ScriptingService.cs line 1";
  const riderResolved = w.resolveIdeSourcePath(riderLogged, "Projects", "");
  assert(riderResolved.path === "MyCompany.Controller.Scripting\\ScriptingService.cs" && riderResolved.line === 1,
    "Rider's project-relative path excludes the anchor segment itself, matching the confirmed-working real-world example, got " + JSON.stringify(riderResolved));
});

await withApp(async (w) => {
  section("230c. buildRiderUri: jetbrains:// deep-link construction, encoding, and the 0-based line number");

  // Person-confirmed real-world bug: the protocol's own line number is
  // 0-based (opening at the human-facing "line 1" landed on line 2), unlike
  // parseIdeLocation's/Visual Studio's 1-based line — buildRiderUri is the
  // one place that gets converted.
  const uri = w.buildRiderUri("myProject", "MyCompany.Core/Notification/NotificationService.cs", 152);
  assert(uri === "jetbrains://rider/navigate/reference?project=myProject&path=MyCompany.Core%2FNotification%2FNotificationService.cs:151",
    "builds the documented jetbrains://rider/navigate/reference URI, with the path URL-encoded and the line converted to 0-based, got " + uri);

  const lineOne = w.buildRiderUri("myProject", "Foo.cs", 1);
  assert(lineOne.endsWith(":0"), "the exact reported bug: a human-facing \"line 1\" must produce the 0-based \":0\", not \":1\", got " + lineOne);

  const withSpaces = w.buildRiderUri("My Project", "src/Weird Name.cs", 1);
  assert(withSpaces.includes("project=My%20Project") && withSpaces.includes("path=src%2FWeird%20Name.cs:0"),
    "a project name or path containing spaces is percent-encoded, got " + withSpaces);
});
