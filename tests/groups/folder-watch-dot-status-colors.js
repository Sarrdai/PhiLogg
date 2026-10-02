// GROUP folder-watch-dot-status-colors - loaded by philogg.html's regression
// harness (tests/README.md -> "Group files"): runs inside its main async
// function, so every harness helper (assert, section, ...) is in scope.

/* ============================================================
   GROUP folder-watch-dot-status-colors - the folder-watch status dot uses a
   theme's "ok" color, not its accent (a reddish accent read as a problem)
   Origin: 2026-10-02 (person-requested).
   ============================================================ */
group("folder-watch-dot-status-colors");
await withApp(async (w, d) => {
  section("dot is --status-ok, failed is --level-error, every built-in theme defines --status-ok");
  const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const dot = css.match(/\.folder-watch-dot\{([^}]*)\}/)[1];
  assert(/background:var\(--status-ok\)/.test(dot) && !/var\(--accent\)/.test(dot), "dot background is --status-ok, got " + dot);
  assert(/\.folder-watch-icon\.failed \.folder-watch-dot\{background:var\(--level-error\)/.test(css), "failed dot stays --level-error");
  const themes = css.match(/:root(\[data-theme="[^"]+"\])?\{/g).length;
  const defs = css.match(/--status-ok:#[0-9a-f]{6};/g).length;
  assert(defs === 6 && themes >= 6, "six built-in themes each define --status-ok, got " + defs);
});
