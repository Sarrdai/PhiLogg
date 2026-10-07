// GROUP homepage-terminal-wrap — loaded by philogg.regression.test.js (see
// tests/README.md → "Group files"); runs inside its main async function.

/* ============================================================
   GROUP homepage-terminal-wrap — hero terminal wraps long lines
   Origin: 2026-10-07 (backlog #106). The sample lines of the hero terminal
   must read completely, also at phone width: the message cell wraps, only
   the time and level columns stay on one line. jsdom has no layout, so the
   page's CSS rules are checked. Also: the feature-card screenshots are
   shot with the Entry detail panel collapsed (backlog #107).
   ============================================================ */
group("homepage-terminal-wrap");
if (groupSelected()) {
  const root = path.join(__dirname, "..");
  const css = fs.readFileSync(path.join(root, "site", "index.html"), "utf8").match(/<style>([\s\S]*?)<\/style>/)[1];
  const rule = sel => (css.match(new RegExp("(?:^|\\})\\s*" + sel.replace(/[.]/g, "\\.") + "\\{([^}]*)\\}", "m")) || [])[1] || "";

  section("homepage-terminal-wrap a. Message cell wraps, time and level do not");
  assert(!/white-space:\s*nowrap/.test(rule(".tl")), ".tl row no longer forbids wrapping");
  assert(!/text-overflow/.test(rule(".tl .msg")) && !/overflow:\s*hidden/.test(rule(".tl .msg")), "message cell does not cut with an ellipsis");
  assert(/overflow-wrap:\s*anywhere/.test(rule(".tl .msg")), "message cell breaks long words");
  assert(/white-space:\s*nowrap/.test(rule(".tl .ts")) && /white-space:\s*nowrap/.test(rule(".lv")), "time and level stay on one line");
  assert(/@media \(max-width:520px\)\{[^@]*\.tl\{grid-template-columns/.test(css), "narrow columns at phone width");

  section("homepage-terminal-wrap b. Card screenshots collapse the detail panel");
  for (const s of ["01-log-view", "03-plot", "04-link-view"])
    assert(/toggleDetailCollapsed\(true\)/.test(fs.readFileSync(path.join(root, "docs", "screenshots", "scenes", s + ".js"), "utf8")), s + " scene collapses Entry detail");
}
