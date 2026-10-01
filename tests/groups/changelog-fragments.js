/* ============================================================
   GROUP changelog-fragments — scripts/changelog.js (changelog.d/)
   Origin: 2026-10-01 (person-requested, Claude Code setup review: one file
   per change instead of a shared CHANGELOG.md). Entries are listed newest
   first by their date prefix, and within a day by name descending (the
   running number of converted entries); other files in changelog.d/, like
   its README, are ignored; a date argument cuts off older entries. Every
   entry in the repo's changelog.d starts with the "- **type: title (date"
   bullet.
   No app window needed, like GROUP 146.
   ============================================================ */
group("changelog-fragments");
if (groupSelected()) {
  const os = require("os");
  const { listFragments, collect } = require("../scripts/changelog.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "philogg-changelog-"));
  const dir = path.join(root, "changelog.d");
  fs.mkdirSync(dir);
  const entry = (title, date) => "- **" + title + " (" + date + ")**\n  - detail of " + title + "\n";
  fs.writeFileSync(path.join(dir, "README.md"), "# not a fragment\n");
  fs.writeFileSync(path.join(dir, "2026-09-30-01-early.md"), entry("feat: early", "2026-09-30"));
  fs.writeFileSync(path.join(dir, "2026-09-30-02-late.md"), entry("fix: late", "2026-09-30"));
  fs.writeFileSync(path.join(dir, "2026-10-01-alpha.md"), entry("feat: alpha", "2026-10-01"));
  fs.writeFileSync(path.join(dir, "2026-10-03-gamma.md"), "\n" + entry("fix: gamma", "2026-10-03") + "\n\n");

  section("changelog-fragments a. Entries are collected newest first, README ignored");
  assert(listFragments(root).map(f => path.basename(f)).join() === "2026-10-03-gamma.md,2026-10-01-alpha.md,2026-09-30-02-late.md,2026-09-30-01-early.md", "newest date first, a day's numbered entries in reverse order, no README");
  const text = collect(root);
  assert(["fix: gamma", "feat: alpha", "fix: late", "feat: early"].every((t, i, a) => i === 0 || text.indexOf(a[i - 1]) < text.indexOf(t)), "collect() keeps that order");
  assert(!/\n\n\n/.test(text) && text.split("\n\n").length === 4, "entries are trimmed and separated by one blank line");
  assert(listFragments(root, "2026-10-01").length === 2 && !collect(root, "2026-10-01").includes("late"), "a date argument keeps only entries from that day on");
  fs.rmSync(root, { recursive: true, force: true });

  section("changelog-fragments b. The repo's changelog.d only holds well-formed entries");
  const real = listFragments();
  assert(real.length > 300, "the converted history is there: " + real.length + " entries");
  const bad = real.filter(f => !/^- \*\*\S/.test(fs.readFileSync(f, "utf8"))).map(f => path.basename(f));
  assert(bad.length === 0, "every entry starts with a '- **' bullet: " + bad.join(", "));
  assert(!fs.existsSync(path.join(__dirname, "..", "CHANGELOG.md")), "no CHANGELOG.md beside it any more");
}
