// GROUP 95 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 95 — "level" filter node tree-row label colored by log level(s),
   each word its own solid color (no gradient)
   Origin: this session (2026-08-23), person-requested follow-up to Group
   94's level-tree-node feature: "schreibe die Einträge im Files & Filter
   Tree in der Farbe des Log Levels. auch kombiniert wenn mehrere Level an
   sind." First cut used a background-clip:text gradient for a combined
   node; same-day follow-up ("ohne Farbgradient, jedes Wort in der eigenen
   Farbe") replaced that with one <span> per level name, each in that
   level's own solid theme color, comma-separated exactly like the node's
   plain-text name.
   ============================================================ */
group(95);
await withApp(async (w, d, T) => {
  section("95. \"level\" filter node tree-row label: each level word its own solid color");

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();

  /* ---------- Single level: one colored word, no gradient/clip styling anywhere ---------- */
  const errorNode = w.createFilterNode(f.id, "level", ["ERROR"]);
  w.render();
  let label = d.querySelector('.tree-row[data-node-id="' + errorNode.id + '"] .tree-label');
  let words = [...label.querySelectorAll("span")];
  assert(words.length === 1 && words[0].textContent === "ERROR" && words[0].style.color === "var(--level-error)",
    "a single-level node's label has one span, colored in that level's own color");
  assert(!label.style.color && !label.style.backgroundImage, "no color/gradient on the label element itself — coloring lives on the per-word span");

  /* ---------- Combined levels: each word its own color, comma-separated, no gradient ---------- */
  const comboNode = w.createFilterNode(f.id, "level", ["ERROR", "INFO"]);
  w.render();
  label = d.querySelector('.tree-row[data-node-id="' + comboNode.id + '"] .tree-label');
  words = [...label.querySelectorAll("span")];
  assert(words.length === 2 && words[0].textContent === "ERROR" && words[0].style.color === "var(--level-error)"
    && words[1].textContent === "INFO" && words[1].style.color === "var(--level-info)",
    "combined levels render as two separately-colored words, ERROR red / INFO blue, no blended gradient between them");
  assert(label.textContent === "ERROR, INFO", "the words plus separator read exactly like the node's plain-text name");
  assert(!label.style.backgroundImage && !label.style.webkitBackgroundClip, "no gradient/background-clip styling used anywhere for the combined case");

  // Word order follows the node's own value array order (canonical LEVELS
  // order in practice, since that's what applyLevelSelectionToTree always
  // writes) — not click/creation order.
  const reorderedNode = w.createFilterNode(f.id, "level", ["WARN", "DEBUG"]);
  w.render();
  label = d.querySelector('.tree-row[data-node-id="' + reorderedNode.id + '"] .tree-label');
  words = [...label.querySelectorAll("span")];
  assert(words[0].textContent === "WARN" && words[0].style.color === "var(--level-warn)"
    && words[1].textContent === "DEBUG" && words[1].style.color === "var(--level-debug)",
    "word/color order follows the node's value array order");

  /* ---------- A non-"level" filter node gets no span/color styling at all ---------- */
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  w.render();
  label = d.querySelector('.tree-row[data-node-id="' + textNode.id + '"] .tree-label');
  assert(label.querySelectorAll("span").length === 0 && label.textContent === "“message 1”",
    "a plain text filter node's label is untouched — plain text, no spans");
});
