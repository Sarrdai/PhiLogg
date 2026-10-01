// GROUP 146 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 146 — Release-only comment stripping (scripts/strip-comments.js)
   Origin: this session (2026-09-01, person-requested). Both release
   workflows now run the stripper over their throwaway copy of
   philogg.html, so a published build carries no source comments while the
   tracked file keeps every one of them. The risk this group exists for is
   a scanner bug that removes something that only LOOKS like a comment: a
   "//" inside a string (the philogg:// scheme and every URL in the file),
   a "/*" inside a CSS string, a slash inside a regex literal or character
   class, or a comment inside a template-literal ${} interpolation. Those
   corrupt the released file silently — it still parses, it just behaves
   differently — so the unit-level cases below are pinned first, then the
   real philogg.html is run through end to end.
   Unlike every other group here this one needs no jsdom window: the
   stripper is a plain Node module, exercised directly.
   ============================================================ */
group(146);
if (groupSelected()) { // the one group with no withApp of its own to gate it
  section("146a. Comments go, code stays");
  const strip = require("../scripts/strip-comments.js");

  assert(strip.stripJs("var a = 1; // trailing\nvar b = 2;\n") === "var a = 1; \nvar b = 2;\n",
    "a trailing line comment is removed, the code and the newline before it are not");
  assert(strip.stripJs("  // whole line\nvar a = 1;\n") === "var a = 1;\n",
    "a comment that is the only thing on its line takes the line (and its indent) with it");
  assert(strip.stripJs("var a = 1;\n/* multi\n   line */\nvar b = 2;\n") === "var a = 1;\nvar b = 2;\n",
    "a whole-line block comment takes its lines too");
  assert(strip.stripJs("var a = 1 /* mid */ + 2;") === "var a = 1  + 2;",
    "an inline block comment leaves a separator behind rather than joining two tokens");
  assert(strip.stripJs("var a = 1 /* mid\nline */ + 2;").includes("\n"),
    "a block comment spanning lines leaves a NEWLINE behind — it is a line terminator for ASI");

  section("146b. Things that only look like comments are left alone");
  assert(strip.stripJs('var u = "philogg://local/1/x.log";') === 'var u = "philogg://local/1/x.log";',
    "// inside a double-quoted string survives");
  assert(strip.stripJs("var u = 'http://a/*b*/c';") === "var u = 'http://a/*b*/c';",
    "both comment shapes inside a single-quoted string survive");
  assert(strip.stripJs('var s = "a\\\\" + "//not a comment";') === 'var s = "a\\\\" + "//not a comment";',
    "an escaped backslash does not swallow the closing quote");
  assert(strip.stripJs("var r = /a\\/\\/b/g;") === "var r = /a\\/\\/b/g;",
    "escaped slashes inside a regex literal survive");
  assert(strip.stripJs("var r = /[/*]/;") === "var r = /[/*]/;",
    "a slash inside a regex character class does not end the regex");
  assert(strip.stripJs("var r = s.replace(/[.*+?^${}()|[\\]\\\\]/g, x);") === "var r = s.replace(/[.*+?^${}()|[\\]\\\\]/g, x);",
    "the escapeRegex-shaped literal (a ${ and a } inside a class) is not read as a template");
  assert(strip.stripJs("var q = `a ${ b /* c */ } d`;") === "var q = `a ${ b  } d`;",
    "a comment inside a ${} interpolation IS stripped, the template text around it is not");
  assert(strip.stripJs("var q = `keep // this`;") === "var q = `keep // this`;",
    "template-literal text is never treated as code");
  assert(strip.stripJs("var q = `${ `${ x }` }//t`;") === "var q = `${ `${ x }` }//t`;",
    "a nested template closes the right interpolation — the trailing // stays template text");
  assert(strip.stripJs("var d = (a + b) / 2; // c\n") === "var d = (a + b) / 2; \n",
    "division after ) is not read as a regex opener");
  assert(strip.stripJs("var d = arr[0] / n;") === "var d = arr[0] / n;",
    "division after ] is not read as a regex opener either");

  section("146c. CSS and HTML halves");
  assert(strip.stripCss("a{color:red} /* x */\nb{color:blue}\n") === "a{color:red} \nb{color:blue}\n",
    "a CSS block comment is removed");
  assert(strip.stripCss('a{content:"/* not a comment */"}') === 'a{content:"/* not a comment */"}',
    "a comment shape inside a CSS string survives");
  assert(strip.stripHtml("<p>a</p>\n<!-- gone -->\n<p>b</p>\n") === "<p>a</p>\n<p>b</p>\n",
    "a whole-line HTML comment takes its line with it");
  assert(strip.stripHtml("<p>a</p><!-- x --><p>b</p>") === "<p>a</p> <p>b</p>",
    "an inline HTML comment leaves a separator");

  section("146d. The real philogg.html round-trips");
  const stripped = strip.stripDocument(html);
  // Guarded, because this same suite is also run against an ALREADY-stripped
  // copy as the stripper's own end-to-end check (PHILOGG_HTML=…, see
  // PROJECT.md -> "Release builds"). There, correctly, there is nothing left
  // to remove — everything else below still has to hold.
  const alreadyStripped = stripped.length === html.length;
  assert(stripped.length <= html.length, "stripping never grows the file");
  assert(alreadyStripped || stripped.length / html.length < 0.9,
    "...and removes a meaningful amount of a commented file, got " + ((1 - stripped.length / html.length) * 100).toFixed(1) + "%");
  assert(!stripped.includes("<!--"), "no HTML comment marker survives outside script/style");
  assert(strip.stripDocument(stripped) === stripped,
    "stripping is idempotent — a second pass changes nothing");
  assert(/const PHILOGG_BUILD = "[^"]*";/.test(stripped),
    "the build-hash line both release workflows grep for after stripping is still there");

  // Every character of the output must appear in the input in the same
  // order, minus the separators the stripper is allowed to insert. Cheap,
  // but it is what rules out the scanner reordering or inventing content
  // rather than only deleting it.
  let i = 0, j = 0, invented = 0;
  while (i < html.length && j < stripped.length) {
    if (html[i] === stripped[j]) j++;
    i++;
  }
  invented = stripped.length - j;
  assert(invented === 0, "the stripped file is a subsequence of the original (nothing invented), leftover: " + invented);

  // The load-bearing check: the same file, minus comments, still parses.
  // A mis-read regex literal almost always breaks this outright.
  // Two inline <script>s now (the tiny FOUC one right after <body>, and the
  // huge main one at the end) — take the LAST "<script>...</script>" pair
  // (the main app script), not the first opening tag, or this slice spans
  // across the HTML/markup sitting between the two scripts.
  const scriptBody = stripped.slice(
    stripped.lastIndexOf("<script>") + "<script>".length,
    stripped.lastIndexOf("</script>")
  );
  let parsed = true;
  try { new Function(scriptBody); } catch (err) { parsed = false; }
  assert(parsed, "the stripped script still parses as JavaScript");
}
