/* ============================================================
   GROUP changelog-fragments — scripts/changelog.js (changelog.d/ fragments)
   Origin: 2026-10-01 (person-requested, Claude Code setup review: one
   fragment file per change instead of editing CHANGELOG.md). Fragments are
   listed newest first by their date prefix (other files in changelog.d/,
   like its README, are ignored); --fold puts them above CHANGELOG.md's first
   entry, keeps the header and the old entries, and deletes the fragments.
   No app window needed, like GROUP 146.
   ============================================================ */
group("changelog-fragments");
if (groupSelected()) {
  const os = require("os");
  const { listFragments, collect, fold } = require("../scripts/changelog.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "philogg-changelog-"));
  const dir = path.join(root, "changelog.d");
  fs.mkdirSync(dir);
  const entry = (title, date) => "- **" + title + " (" + date + ")**\n  - detail of " + title + "\n";
  fs.writeFileSync(path.join(dir, "README.md"), "# not a fragment\n");
  fs.writeFileSync(path.join(dir, "2026-10-01-alpha.md"), entry("feat: alpha", "2026-10-01"));
  fs.writeFileSync(path.join(dir, "2026-10-03-gamma.md"), entry("fix: gamma", "2026-10-03"));
  fs.writeFileSync(path.join(dir, "2026-10-02-beta.md"), "\n" + entry("docs: beta", "2026-10-02") + "\n\n");
  const header = "# PhiLogg — Changelog\n\nIntro line.\n\n";
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), header + entry("feat: old", "2026-09-30"));

  section("changelog-fragments a. Fragments are collected newest first, README ignored");
  assert(listFragments(root).map(f => path.basename(f)).join() === "2026-10-03-gamma.md,2026-10-02-beta.md,2026-10-01-alpha.md", "three fragments, newest first, no README");
  const text = collect(root);
  assert(text.indexOf("fix: gamma") < text.indexOf("docs: beta") && text.indexOf("docs: beta") < text.indexOf("feat: alpha"), "collect() keeps that order");
  assert(!/\n\n\n/.test(text) && text.split("\n\n").length === 3, "fragments are trimmed and separated by one blank line");

  section("changelog-fragments b. --fold moves them above the first CHANGELOG entry");
  assert(fold(root) === 3, "three fragments folded");
  const out = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  assert(out.startsWith(header + "- **fix: gamma"), "header unchanged, newest fragment right after it");
  assert(out.indexOf("feat: alpha") < out.indexOf("feat: old") && out.trimEnd().endsWith("detail of feat: old"), "old entries follow the folded ones");
  assert(/detail of feat: alpha\n\n- \*\*feat: old/.test(out), "one blank line between folded and old entries");
  assert(fs.readdirSync(dir).join() === "README.md", "fragment files deleted, README kept");
  assert(fold(root) === 0 && fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8") === out, "a second fold with nothing pending changes nothing");

  section("changelog-fragments c. The repo's changelog.d only holds well-formed fragments");
  for (const f of listFragments()) {
    const body = fs.readFileSync(f, "utf8").trim();
    assert(/^- \*\*\w+(\([^)]*\))?: .+ \(\d{4}-\d{2}-\d{2}[,)]/.test(body), path.basename(f) + " starts with a '- **type: title (date' bullet");
    assert(body.split("\n").length <= 8, path.basename(f) + " stays short (" + body.split("\n").length + " lines)");
  }
  fs.rmSync(root, { recursive: true, force: true });
}
