// GROUP 169 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 169 — Entry detail: "format + syntax highlight embedded XML/JSON"
   (this session, person-requested; since 2026-09-27 the Pretty stage of
   #detailViewTabs, formerly the #detailFormatToggle button). The default
   view (169a); auto-detects well-formed XML/JSON fragments EMBEDDED anywhere in
   the message's free text, pretty-prints and syntax-highlights just
   those, leaves the rest plain — still a one-click, persisted toggle to
   turn back off. Also detects a third fragment type — a .NET-style
   ToString() object dump ("{ Key = Value, ... }", not valid JSON:
   unquoted keys, "=" instead of ":") — as a conservative fallback once
   JSON.parse has already rejected the candidate (169g/h, follow-up
   request this session). Also covers the optional per-theme
   "syntaxHighlightColors" block (SYNTAX_COLOR_KEYS) in the theme template
   download / import round trip. Each fragment block also gets a newline
   before and after it (person-requested follow-up this session, 169i/j/k)
   so it renders on its own, left-aligned line rather than inline with
   surrounding text.
   ============================================================ */
group(169);
await withApp(async (w, d, T) => {
  section("169a. Pretty is the default view, persists, and gates plain vs formatted rendering");

  const btn = d.querySelector('#detailViewTabs [data-detail-view="pretty"]');
  const parsedBtn = d.querySelector('#detailViewTabs [data-detail-view="parsed"]');
  assert(btn && btn.classList.contains("active") && T.detailView === "pretty",
    "Pretty is the default view (person-requested)");
  assert(w.localStorage.getItem("philogg-detail-view") === null,
    "the Pretty default is a fallback for an UNSET key, nothing is written to localStorage just from starting up");

  const f = await w.addFile("app.log", makeLog(0, 3), () => {});
  f.entries[0].message = 'Sending Control <ctrl><cmd>reset</cmd></ctrl> successful';
  T.state.selectedId = f.entries[0].id;
  w.updateDetailPanel();
  const detailEl = d.querySelector("#detailMessage");
  assert(detailEl.querySelector(".syn-block.syn-xml"), "ON (default): the embedded XML fragment is wrapped and pretty-printed without any click needed");
  assert(detailEl.textContent.startsWith("Sending Control") && detailEl.textContent.trim().endsWith("successful"),
    "ON: the surrounding plain text is untouched, got " + JSON.stringify(detailEl.textContent));

  fireClick(parsedBtn, w);
  assert(T.detailView === "parsed" && w.localStorage.getItem("philogg-detail-view") === "parsed",
    "clicking Parsed switches the view and persists that explicit choice");
  assert(detailEl.textContent === f.entries[0].message, "Parsed: the message text is shown unchanged");
  assert(!detailEl.querySelector(".syn-block"), "Parsed: no syntax-highlight markup is present");

  fireClick(btn, w);
  assert(T.detailView === "pretty" && btn.classList.contains("active") && w.localStorage.getItem("philogg-detail-view") === "pretty",
    "clicking Pretty switches back and persists");
});

await withApp(async (w, d, T) => {
  section("169b. XML detection + highlight: tag/attr-name/attr-value spans, nesting, self-closing");

  const f = await w.addFile("app.log", makeLog(0, 1), () => {});
  f.entries[0].message = 'before <root attr="v1"><child x="1">text</child><self/></root> after';
  T.state.selectedId = f.entries[0].id;
  w.updateDetailPanel();
  const html = d.querySelector("#detailMessage").innerHTML;
  assert(html.includes('<span class="syn-tag">root</span>'), "root tag name highlighted, got " + html);
  assert(html.includes('<span class="syn-attr-name">attr</span>'), "attribute name highlighted");
  assert(html.includes('<span class="syn-attr-value">"v1"</span>'), "attribute value highlighted");
  assert(html.includes('<span class="syn-tag">child</span>'), "nested tag highlighted");
  assert(html.includes('<span class="syn-tag">self</span>') && html.includes('/&gt;'), "self-closing nested tag rendered with a self-close marker");
  assert(d.querySelector("#detailMessage").textContent.startsWith("before ") && d.querySelector("#detailMessage").textContent.trim().endsWith("after"),
    "surrounding plain text ('before '/' after') is preserved outside the fragment");
});

await withApp(async (w, d, T) => {
  section("169c. JSON detection + highlight: keys, string/number/boolean/null values, punctuation");

  const f = await w.addFile("app.log", makeLog(0, 1), () => {});
  f.entries[0].message = 'Response: {"status":"ok","code":200,"ok":true,"extra":null} done';
  T.state.selectedId = f.entries[0].id;
  w.updateDetailPanel();
  const html = d.querySelector("#detailMessage").innerHTML;
  assert(html.includes('<span class="syn-block syn-json">'), "a JSON block is rendered, got " + html);
  assert(html.includes('<span class="syn-key">"status"</span>'), "object key highlighted");
  assert(html.includes('<span class="syn-string">"ok"</span>'), "string value highlighted");
  assert(html.includes('<span class="syn-number">200</span>'), "number value highlighted");
  assert(html.includes('<span class="syn-bool-null">true</span>') && html.includes('<span class="syn-bool-null">null</span>'),
    "boolean and null values highlighted");
  const text = d.querySelector("#detailMessage").textContent;
  assert(text.startsWith("Response: ") && text.trim().endsWith("done"), "surrounding plain text is preserved");
});

await withApp(async (w, d, T) => {
  section("169d. Conservative detection: malformed/unbalanced fragments and stray </{ are left as plain text");

  const f = await w.addFile("app.log", makeLog(0, 1), () => {});
  f.entries[0].message = 'a < b and if (x < y) { do() } but <open>never closed, {"bad": } too';
  T.state.selectedId = f.entries[0].id;
  w.updateDetailPanel();
  const el = d.querySelector("#detailMessage");
  assert(!el.querySelector(".syn-block"), "nothing here is well-formed XML/JSON, so no fragment is highlighted at all, got " + el.innerHTML);
  assert(el.textContent === f.entries[0].message, "the message is shown verbatim (escaped-and-back-out) when nothing validates");
});

await withApp(async (w, d, T) => {
  section("169e. XSS safety: an unmatched '<script>'-shaped fragment and formatted output both stay inert markup");

  const f = await w.addFile("app.log", makeLog(0, 1), () => {});
  // <img ...> is unclosed (no matching </img>, and its own src= attribute
  // isn't even quoted, so it isn't a valid candidate tag at all) — must
  // never become real DOM markup. <safe a="&amp;"/> IS well-formed XML (a
  // self-closing tag with a properly-escaped attribute value); its
  // formatted output must re-escape that "&" rather than emit it raw.
  f.entries[0].message = 'payload <img src=x onerror="alert(1)"> unclosed and <safe a="&amp;"/> ok';
  T.state.selectedId = f.entries[0].id;
  w.updateDetailPanel();
  const el = d.querySelector("#detailMessage");
  assert(!el.querySelector("img"), "an unmatched (unclosed) tag never becomes real DOM markup, only escaped text");
  const selfClosing = el.querySelector(".syn-block.syn-xml");
  assert(selfClosing, "the well-formed self-closing <safe .../> fragment IS detected and formatted");
  assert(selfClosing.innerHTML.includes('<span class="syn-attr-value">"&amp;"</span>'),
    "the attribute's decoded '&' is HTML-re-escaped in the output, not injected raw, got " + selfClosing.innerHTML);
});

await withApp(async (w, d, T) => {
  section("169f. Theme export/import: optional syntaxHighlightColors round trip");
  const captured = [];
  w.downloadJsonFallback = (json, name) => captured.push({ json, name });
  const cs0 = w.getComputedStyle(d.documentElement);
  const colors = {};
  T.THEME_COLOR_KEYS.forEach(k => { colors[k] = cs0.getPropertyValue("--" + k).trim(); });
  const syntaxHighlightColors = {};
  T.SYNTAX_COLOR_KEYS.forEach(k => { syntaxHighlightColors[k] = cs0.getPropertyValue("--" + k).trim(); });
  syntaxHighlightColors["syntax-tag"] = "#ff00ff";

  // Import WITH a syntaxHighlightColors block: the editor keeps it as part
  // of the theme, and those colors are applied inline as CSS vars.
  w.importThemeJson(JSON.stringify({ format: "philogg-theme", version: 1, name: "With Syntax Colors", colors, syntaxHighlightColors }));
  assert(d.querySelector("#themeEditorIncludeSyntax").checked, "a file with syntax colors opens with 'Part of this theme' checked");
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(T.customThemes.length === 1, "theme with a syntaxHighlightColors block imports fine");
  let imported = T.customThemes[0];
  assert(imported.syntaxColors && imported.syntaxColors["syntax-tag"] === "#ff00ff", "the custom syntax color is stored on the theme");
  let cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--syntax-tag").trim() === "#ff00ff", "the custom theme's syntax-tag color is applied inline as a CSS var, got " + cs.getPropertyValue("--syntax-tag"));

  // Import WITHOUT any syntaxHighlightColors block at all: valid, the
  // syntax group starts unchecked, no syntaxColors stored, and the app
  // falls back to whatever :root/[data-theme] declares.
  w.importThemeJson(JSON.stringify({ format: "philogg-theme", version: 1, name: "No Syntax Colors", colors }));
  assert(!d.querySelector("#themeEditorIncludeSyntax").checked, "a file without syntax colors opens with 'Part of this theme' unchecked");
  assert(d.querySelector('.te-row[data-key="syntax-tag"] .te-value').disabled, "...and the syntax rows disabled");
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(T.customThemes.length === 2, "a theme file with NO syntaxHighlightColors block is still accepted");
  imported = T.customThemes.find(t => t.name === "No Syntax Colors");
  assert(imported && !imported.syntaxColors, "no syntaxColors is stored for a theme that didn't provide the block");
  cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--syntax-tag").trim() === "#e8a94a",
    "with no per-theme override, --syntax-tag falls back to the :root default (Dark's own hardcoded value) via the cascade, got " + JSON.stringify(cs.getPropertyValue("--syntax-tag")));

  // Export carries the block only when the theme has it.
  await w.exportCustomThemeToFile(T.customThemes[0].id);
  await w.exportCustomThemeToFile(imported.id);
  assert(captured.length === 2, "two exports written, got " + captured.length);
  const withBlock = JSON.parse(captured[0].json), withoutBlock = JSON.parse(captured[1].json);
  assert(withBlock.format === "philogg-theme" && withBlock.syntaxHighlightColors["syntax-tag"] === "#ff00ff", "the export of a theme with syntax colors carries them");
  assert(!("syntaxHighlightColors" in withoutBlock), "the export of a theme without them has no block");
  assert(captured[0].name === "With_Syntax_Colors.theme.json", "suggested file name, got " + captured[0].name);
});

await withApp(async (w, d, T) => {
  section("169g. .NET-style ToString() dump ('{ Key = Value, ... }', not valid JSON) is detected as its own fragment type");

  const f = await w.addFile("app.log", makeLog(0, 1), () => {});
  f.entries[0].message = "Setting selected test procedure to 'Evaluate' with parameters 'TestProcedureParameters { Type = MyProgramRecipe, ViewerName = , MyProgramRecipeId = 4c382e97-c47e-4227-a034-8e1f14ddabc4, CapabilityName = MyProgram }'.";
  T.state.selectedId = f.entries[0].id;
  w.updateDetailPanel();
  const el = d.querySelector("#detailMessage");
  const html = el.innerHTML;
  assert(el.querySelector(".syn-block"), "the dump block is detected and formatted, got " + html);
  assert(html.includes('<span class="syn-key">Type</span>'), "unquoted key highlighted, got " + html);
  assert(html.includes('<span class="syn-string">MyProgramRecipe</span>'), "unquoted value highlighted");
  assert(html.includes('<span class="syn-key">ViewerName</span><span class="syn-punct"> = </span><span class="syn-punct">,</span>') ||
    /syn-key">ViewerName<\/span><span class="syn-punct"> = <\/span>\n?\s*<span class="syn-punct">,<\/span>/.test(html),
    "a blank value ('ViewerName = ,') renders with no stray value span, got " + html);
  assert(el.textContent.startsWith("Setting selected test procedure") && el.textContent.trim().endsWith("."),
    "surrounding plain text (including the outer 'TestProcedureParameters' name and quotes) is preserved outside the { } block");

  section("169h. A brace block whose segments don't all fit 'key = value' stays plain (no misfire)");
  f.entries[0].message = "if (x < y) { do(); other() } and { a = 1, just some text }";
  w.updateDetailPanel();
  assert(!d.querySelector("#detailMessage").querySelector(".syn-block"),
    "neither brace block is a valid JSON object nor does every segment match 'key = value', so nothing is highlighted");

  section("169i. Every fragment block gets its own line (a newline before and after), so it renders left-aligned");
  f.entries[0].message = 'before <root a="1"/> mid {"x":1} after';
  w.updateDetailPanel();
  const text169i = d.querySelector("#detailMessage").textContent;
  assert(text169i.startsWith("before \n") && /\n mid \n/.test(text169i) && text169i.trim().endsWith("after"),
    "a newline precedes and follows each fragment, got " + JSON.stringify(text169i));
  assert(text169i.split("\n").length >= 5, "at least 4 line breaks for 2 fragments (one before + one after each), got " + JSON.stringify(text169i));

  section("169j. No spurious blank line when the message already puts the fragment on its own line");
  f.entries[0].message = 'before\n<root a="1"/>\nafter';
  w.updateDetailPanel();
  const text169j = d.querySelector("#detailMessage").textContent;
  assert(!text169j.includes("\n\n"), "no doubled newline when the surrounding text already had one, got " + JSON.stringify(text169j));

  section("169k. A fragment at the very start/end of the message doesn't get a leading/trailing blank line");
  f.entries[0].message = '<root a="1"/> after';
  w.updateDetailPanel();
  assert(!d.querySelector("#detailMessage").textContent.startsWith("\n"), "a fragment at the very start has no leading blank line");
  f.entries[0].message = 'before <root a="1"/>';
  w.updateDetailPanel();
  assert(!d.querySelector("#detailMessage").textContent.endsWith("\n"), "a fragment at the very end has no trailing blank line");
});
