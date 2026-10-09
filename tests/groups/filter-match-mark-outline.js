// GROUP filter-match-mark-outline — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP filter-match-mark-outline — filter-path match marks
   (mark.text-match-mark) are a soft 18% --warn fill with a 1px inset
   outline instead of a solid block. On the segmenting path a filter range
   cut into pieces must read as ONE box: .mm-start / .mm-end only on the
   pieces at the range's real ends, .mm-stripe on pieces under a rule colour
   (the stripe replaces the bottom edge). Find hits keep their own class.
   Pure markup/CSS checks on markCombinedHtml, no timing involved.
   ============================================================ */
group("filter-match-mark-outline");

await withApp(async (w, d, T) => {
  section("filter-match-mark-outline a. Plain path: one mark per range, no edge classes");
  const plain = w.markCombinedHtml("abc DEFGH xyz", [[4, 9]], [], null, null);
  assert(plain === 'abc <mark class="text-match-mark">DEFGH</mark> xyz', "plain path unchanged: one mark, no mm-* classes (" + plain + ")");

  section("filter-match-mark-outline b. Range cut by a rule boundary");
  // filter range [4,10) "DEFGHI"; a rule covers [6,8) "FG" -> pieces DE | FG | HI
  const text = "abc DEFGHI xyz";
  const html = w.markCombinedHtml(text, [[4, 10]], [{ start: 6, end: 8, color: "#ff0000" }], null, null);
  const marks = [...html.matchAll(/<mark class="([^"]*)"[^>]*>([^<]*)<\/mark>/g)].map(m => ({ cls: m[1].split(" "), txt: m[2] }));
  assert(marks.length === 3 && marks.map(m => m.txt).join("|") === "DE|FG|HI", "three pieces (" + html + ")");
  const has = (m, c) => m.cls.includes(c);
  assert(marks.every(m => has(m, "text-match-mark") && has(m, "mark-seg")), "all pieces are segmented filter marks");
  assert(has(marks[0], "mm-start") && !has(marks[0], "mm-end"), "first piece: start class only");
  assert(has(marks[2], "mm-end") && !has(marks[2], "mm-start"), "last piece: end class only");
  assert(!has(marks[1], "mm-start") && !has(marks[1], "mm-end"), "middle piece: neither");
  assert(has(marks[1], "mm-stripe") && !has(marks[0], "mm-stripe") && !has(marks[2], "mm-stripe"), "only the piece under the rule colour carries the stripe class");
  // Rule-only piece (outside the filter range) is a plain hl mark without mm-*.
  const hlOnly = w.markCombinedHtml(text, [[4, 10]], [{ start: 0, end: 3, color: "#00ff00" }], null, null);
  assert(/<mark class="hl-match-mark mark-seg"[^>]*>abc<\/mark>/.test(hlOnly), "a rule-only piece stays hl-match-mark without mm-* classes");

  section("filter-match-mark-outline c. Find hit inside a filter range stays a find mark");
  const f = w.markCombinedHtml(text, [[4, 10]], [], null, [[6, 8]]);
  const fm = [...f.matchAll(/<mark class="([^"]*)"[^>]*>([^<]*)<\/mark>/g)].map(m => ({ cls: m[1].split(" "), txt: m[2] }));
  assert(fm.length === 3 && fm[1].txt === "FG" && fm[1].cls.includes("find-match-mark") && !fm[1].cls.some(c => c.startsWith("mm-") || c === "text-match-mark"),
    "the find piece is find-match-mark with no new classes (" + f + ")");
  assert(fm[0].cls.includes("mm-start") && fm[2].cls.includes("mm-end"), "...while the filter pieces around it keep their start / end classes");

  section("filter-match-mark-outline d. Stylesheet");
  const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const rule = css.match(/mark\.text-match-mark\{([^}]*)\}/);
  assert(rule, "mark.text-match-mark rule present");
  assert(/--warn\) 18%/.test(rule[1]), "18% fill");
  assert(/box-shadow:inset 0 0 0 1px color-mix\(in srgb, var\(--warn\) 70%/.test(rule[1]), "1px inset outline at 70%");
  assert(/padding:0/.test(rule[1]) && /border-radius:2px/.test(rule[1]), "padding:0 and 2px radius");
  assert(/mark\.text-match-mark\.mm-start\{/.test(css) && /mark\.text-match-mark\.mm-end\{/.test(css) && /mark\.text-match-mark\.mm-stripe\{--sb:0px/.test(css), "edge classes are styled");
  assert(css.indexOf("mark.mark-seg{") > css.indexOf("mark.text-match-mark{") && css.indexOf("mark.find-match-mark{") > css.indexOf("mark.mark-seg{"),
    "order rules kept: mark-seg after text-match-mark, find-match-mark after mark-seg");
});
