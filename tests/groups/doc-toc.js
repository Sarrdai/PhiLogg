/* ============================================================
   GROUP doc-toc — scripts/doc-toc.js: table of contents for long docs
   Origin: 2026-10-01 (person-requested: every documentation file over 100
   lines lists its headings, as a repo rule). The TOC lists ## and ###
   headings (### indented) with GitHub anchors, sits right below the # title
   or below a skill's front matter, ignores headings inside code fences, is
   rewritten when headings change, removed when the file drops to 100 lines,
   and leaves LICENSE.md alone; --check only reports. Finally: every doc in
   the repo is up to date.
   No app window needed, like GROUP 146.
   ============================================================ */
group("doc-toc");
if (groupSelected()) {
  const os = require("os");
  const toc = require("../scripts/doc-toc.js");
  const filler = n => Array.from({ length: n }, (_, i) => "text line " + i).join("\n");
  const longDoc = "# Title\n\nIntro.\n\n## First part\n" + filler(60) + "\n### Sub `code` — detail\n```\n## not a heading\n```\n## First part\n" + filler(60) + "\n";

  section("doc-toc a. A long file gets its headings listed below the title");
  const out = toc.withToc(longDoc);
  const lines = out.split("\n");
  assert(lines[0] === "# Title" && lines[1] === "" && lines[2] === toc.START, "TOC block right below the title, one blank line between");
  const block = out.slice(out.indexOf(toc.START), out.indexOf(toc.END));
  assert(block.includes("\n- [First part](#first-part)\n  - [Sub code — detail](#sub-code--detail)\n- [First part](#first-part-1)\n"), "## and indented ###, backticks dropped, GitHub anchors incl. a repeated heading: " + JSON.stringify(block));
  assert(!block.includes("not a heading"), "headings inside a code fence are not listed");
  assert(out.slice(out.indexOf(toc.END)).startsWith(toc.END + "\n\nIntro."), "the original text follows after one blank line");
  assert(toc.withToc(out) === out, "running it again changes nothing");

  section("doc-toc b. Stale, short, front matter, check mode");
  const renamed = out.replace("## First part\ntext line 0", "## Renamed part\ntext line 0");
  const refreshed = toc.withToc(renamed);
  assert(refreshed.includes("- [Renamed part](#renamed-part)") && !refreshed.includes("(#first-part)\n  -"), "a renamed heading refreshes the TOC");
  assert(toc.withToc("# Short\n\n## A\n\n## B\n") === "# Short\n\n## A\n\n## B\n", "100 lines or fewer: no TOC");
  assert(toc.withToc(out.split("\n").slice(0, 20).join("\n")).indexOf(toc.START) === -1, "a file that shrank below the limit loses its TOC");
  const skill = "---\nname: x\ndescription: y\n---\n\n# Skill\n\n## One\n" + filler(100) + "\n## Two\n";
  const skillOut = toc.withToc(skill);
  assert(skillOut.startsWith("---\nname: x\ndescription: y\n---\n\n# Skill\n\n" + toc.START), "front matter stays first, TOC below the skill's title");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "philogg-toc-"));
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs", "long.md"), longDoc);
  fs.writeFileSync(path.join(root, "LICENSE.md"), longDoc);
  assert(toc.run(root, { check: true }).join() === "docs/long.md" && fs.readFileSync(path.join(root, "docs", "long.md"), "utf8") === longDoc, "--check reports the stale file and writes nothing; LICENSE.md is excluded");
  assert(toc.run(root).join() === "docs/long.md" && toc.run(root, { check: true }).length === 0, "a normal run fixes it");
  assert(fs.readFileSync(path.join(root, "LICENSE.md"), "utf8") === longDoc, "LICENSE.md untouched");
  fs.rmSync(root, { recursive: true, force: true });

  section("doc-toc c. Every doc in the repo has an up-to-date TOC");
  const stale = toc.run(undefined, { check: true });
  assert(stale.length === 0, "run `node scripts/doc-toc.js`: " + stale.join(", "));
  assert(toc.listDocs().includes("CLAUDE.md") && toc.listDocs().includes(".claude/skills/orchestrate/SKILL.md"), "CLAUDE.md and the skills are covered");
}
