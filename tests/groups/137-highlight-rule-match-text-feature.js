// GROUP 137 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 137 — Highlight-rule match text (FEATURE_BACKLOG.md #20)
   Extends the inline substring marking of GROUP 93 from the active filter
   path to HIGHLIGHT RULES (any coloured "text" filter node under the file,
   wherever it sits in the tree), painted in each rule's own colour as a
   stacked underline stripe instead of a background — so the filter mark and
   any number of rule colours can share the same characters without one
   having to win. Own view-bar toggle, #btnHighlightMatchText (person-chosen
   over a colour-picker toggle or a Settings checkbox), default ON, and
   unlike GROUP 93's marking it also paints the Full view.
   Also covers the isRegex fix this needed: textFilterMatchSpec used to
   ignore node.isRegex and search the regex SOURCE as a literal substring,
   so a regex filter marked nothing at all.
   ============================================================ */
group(137);
await withApp(async (w, d, T) => {
  section("137. Highlight-rule match text + regex match-spec fix");
  w.applyFhView("stacked"); // both Log views on screen: the Context view is only built while visible (GROUP 270)

  const btn = d.querySelector(".toggle-highlightmatch");
  const textMatchBtn = d.querySelector(".toggle-textmatch");

  // --- Defaults ---
  assert(btn && isVisible(btn, w), ".toggle-highlightmatch exists and is visible");
  assert(btn.classList.contains("active") && T.highlightMatchTextEnabled === true, "highlight-rule match text defaults ON");
  assert(btn.innerHTML.includes("<svg"), "the button carries an icon of its own");

  // messages read "alpha beta N" — "alpha" is what the ACTIVE filter matches,
  // "beta" what a rule matches, and "alph" gives a second rule that overlaps
  // the first rule's own span (for the stacking assertion below).
  const f = await w.addFile("app.log", makeLog(0, 12, { msgPrefix: "alpha beta" }), () => {});

  // Two rules, both TOP-LEVEL under the file — deliberately NOT in the
  // active filter's ancestor chain, which is the whole difference from
  // GROUP 93's node set.
  const ruleBeta = w.createFilterNode(f.id, "text", "beta", false, null, false, ["message"]);
  w.setHighlightColor(ruleBeta.id, "#ff0000");
  const ruleAlpha = w.createFilterNode(f.id, "text", "alpha", false, null, false, ["message"]);
  w.setHighlightColor(ruleAlpha.id, "#00ff00");
  const uncolored = w.createFilterNode(f.id, "text", "Foo", false, null, false, ["location"]);

  // The active node: a text filter matching "alpha", i.e. exactly the span
  // ruleAlpha also covers — the overlap case.
  const active = w.createFilterNode(f.id, "text", "alpha", false, null, false, ["message"]);
  T.state.activeId = active.id;
  w.render();

  const filteredMsg = () => d.querySelector("#tableRows .log-row .col-msg").innerHTML;
  const fullMsg = () => d.querySelector("#highlightRows .log-row .col-msg").innerHTML;

  // --- Node set: coloured text filters anywhere under the file, not the
  //     active chain; an uncoloured filter never contributes ---
  const hlNodes = w.getHighlightMatchNodes();
  assert(hlNodes.length === 2, "getHighlightMatchNodes() returns exactly the two coloured text filters");
  assert(hlNodes.some(n => n.id === ruleBeta.id) && hlNodes.some(n => n.id === ruleAlpha.id),
    "...both of them, even though neither is in the active node's ancestor chain");
  assert(!hlNodes.some(n => n.id === uncolored.id), "...and never an uncoloured filter node");

  // --- Filtered view: the rule's colour rides an underline stripe, drawn as
  //     a background-image INSIDE the mark's own box. Never a box-shadow
  //     below it: .row-grid is align-items:center and the log-row cells are
  //     overflow:hidden, so anything under the text line box is clipped away
  //     and never appears in the log views at all (person-reported) ---
  const betaMark = filteredMsg().match(/<mark class="hl-match-mark mark-seg"[^>]*>beta<\/mark>/);
  assert(betaMark && betaMark[0].includes("linear-gradient(#ff0000,#ff0000)"),
    "a rule's match is underlined in the rule's own colour, with no background mark of its own");
  assert(betaMark && /background-size:100% 2px/.test(betaMark[0]) && /background-position:left bottom/.test(betaMark[0]),
    "...as a 2px lane pinned to the bottom of the mark's own box");
  assert(!/box-shadow|padding-bottom/.test(filteredMsg()),
    "...and never as a box-shadow/padding below it, which the overflow:hidden cells would clip");

  // --- Overlap: "alpha" is both the active filter's match AND ruleAlpha's.
  //     One <mark>, keeping the filter's background class and gaining the
  //     rule's stripe — neither wins, both apply ---
  const overlap = filteredMsg().match(/<mark class="text-match-mark mark-seg mm-start mm-end mm-stripe"[^>]*>alpha<\/mark>/);
  assert(overlap && overlap[0].includes("linear-gradient(#00ff00,#00ff00)"),
    "a span matched by BOTH the active filter and a rule keeps the filter background and gains the rule stripe");

  // --- Segmented marks drop the rounding/side padding a standalone filter
  //     mark carries, so pieces of one rule's underline join seamlessly ---
  assert(/mark-seg/.test(filteredMsg()), "marks from the segmenting path carry .mark-seg");
  assert(/mark\.mark-seg\{padding:0; border-radius:0;\}/.test(w.document.documentElement.innerHTML),
    "...and .mark-seg really zeroes the padding and rounding that would notch the join");

  // --- Full view marks rules but NOT the active filter path ---
  assert(/<mark class="hl-match-mark mark-seg"[^>]*#ff0000[^>]*>beta<\/mark>/.test(fullMsg()),
    "the Full view paints rule matches too (unlike the filter-path marking, which never applied there)");
  assert(/<mark class="hl-match-mark mark-seg"[^>]*#00ff00[^>]*>alpha<\/mark>/.test(fullMsg()),
    "...and 'alpha' is a plain rule stripe there, not the active filter's background mark");
  assert(!/text-match-mark/.test(fullMsg()), "the Full view never marks the active filter path's own matches");

  // --- Two rules over the same characters share ONE lane, alternating
  //     colours horizontally. The lane depth must not depend on how many
  //     rules happen to cover a segment: an earlier version stacked a stripe
  //     per rule and took each one's depth from the segment's own rule count,
  //     so the SAME rule sat at 2px beside a word and at 4px under it and
  //     the line visibly stepped down mid-sentence (person-reported) ---
  const ruleAlph = w.createFilterNode(f.id, "text", "alph", false, null, false, ["message"]);
  w.setHighlightColor(ruleAlph.id, "#0000ff");
  T.state.activeId = active.id;
  w.render();
  const both = fullMsg().match(/<mark[^>]*>alph<\/mark>/);        // ruleAlpha + ruleAlph
  const alphaOnly = fullMsg().match(/<mark[^>]*>a<\/mark>/);      // ruleAlpha alone, right after it
  assert(both && /#00ff00/.test(both[0]) && /#0000ff/.test(both[0]),
    "characters covered by two rules carry both colours in one mark");
  assert(both && /repeating-linear-gradient\(90deg,#[0-9a-f]{6} 0px 5px,#[0-9a-f]{6} 5px 10px\)/.test(both[0]),
    "...as one lane alternating the two colours in 5px slices, not two stacked stripes");
  assert(both && alphaOnly, "the overlapped run and the run right after it are separate marks");
  assert(/background-size:100% 2px/.test(both[0]) && /background-size:100% 2px/.test(alphaOnly[0]),
    "both keep the SAME 2px lane — a rule's line runs straight through an overlap instead of stepping down");
  assert(!/padding-bottom|box-shadow/.test(both[0]), "...and the overlap costs no vertical room at all");
  w.setHighlightColor(ruleAlph.id, null);
  T.state.activeId = active.id;
  w.render();

  // --- Entry detail: rules paint there too, and are NOT gated by the
  //     filter-path marking's own "show in entry detail" toggle ---
  T.state.selectedId = f.entries[1].id;
  const detailCb = d.querySelector("#settingsTextMatchHighlightDetail");
  fireClick(detailCb, w);
  const detailHtml = () => d.querySelector("#detailMessage").innerHTML;
  assert(/<mark class="hl-match-mark mark-seg"[^>]*#ff0000[^>]*>beta<\/mark>/.test(detailHtml()),
    "entry detail shows rule stripes even with the filter-path 'show in entry detail' toggle off");
  assert(!/text-match-mark/.test(detailHtml()), "...and that toggle still suppresses the filter-path mark itself");
  fireClick(detailCb, w);

  // --- A coloured NON-text node contributes nothing (nothing to underline) ---
  const levelRule = w.createFilterNode(f.id, "level", ["ERROR"]);
  w.setHighlightColor(levelRule.id, "#123456");
  T.state.activeId = active.id;
  w.render();
  assert(!w.getHighlightMatchNodes().some(n => n.id === levelRule.id), "a coloured 'level' rule is not a match-text node");
  assert(!/#123456/.test(fullMsg()), "...and never contributes a stripe");

  // --- The button gates rules only; the filter-path marking is untouched ---
  fireClick(btn, w);
  assert(!T.highlightMatchTextEnabled && !btn.classList.contains("active"), "clicking the button turns rule marking off");
  assert(w.localStorage.getItem("philogg-highlight-match-text") === "0", "state persisted as off");
  assert(!/hl-match-mark/.test(filteredMsg()) && !/background-image/.test(filteredMsg()), "no rule stripes anywhere in the Filtered view while off");
  assert(!/<mark/.test(fullMsg()), "...nor in the Full view");
  assert(/<mark class="text-match-mark">alpha<\/mark>/.test(filteredMsg()),
    "...while the active filter's own mark keeps working, unchanged and independent");
  assert(textMatchBtn.classList.contains("active"), "the two toggles are genuinely independent buttons");

  // --- Regression (person-reported, screenshot-driven): toggling this
  //     button used to shift TEXT LAYOUT of the unrelated active-filter
  //     marking, because the filter-path match rendered through two
  //     different code paths depending on whether a coloured rule ALSO
  //     matched the same field — markCombinedHtml's mark-seg path zeroed
  //     mark.text-match-mark's padding, the plain markRangesHtml fallback
  //     (taken whenever no highlight rule contributes ranges, which is
  //     exactly the case right now, button off) didn't, so the same
  //     "alpha" match was 2px wider with the button off than on. Marking
  //     must never change layout, only what's painted on top — pin the fix
  //     at its source: mark.text-match-mark carries no horizontal padding
  //     at all, unconditionally, regardless of which path renders it. ---
  // Isolate the actual RULE (not the surrounding explanatory comment, which
  // deliberately quotes the old "padding:0 1px" value in prose) — a comment
  // has no trailing "{...}" block, so anchoring on `mark.text-match-mark{`
  // through its own closing brace only ever captures the declaration.
  const styleText = d.querySelector("style").textContent;
  const ruleMatch = styleText.match(/mark\.text-match-mark\{([^}]*)\}/);
  assert(ruleMatch, "mark.text-match-mark's rule is present in the stylesheet");
  assert(/padding:0;/.test(ruleMatch[1]),
    "mark.text-match-mark declares padding:0 in the stylesheet, on every path (not just the mark-seg one)");
  assert(!/padding:\s*0\s+1px/.test(ruleMatch[1]),
    "the old layout-shifting `padding:0 1px` is gone from the rule itself");
  fireClick(btn, w);
  assert(T.highlightMatchTextEnabled && w.localStorage.getItem("philogg-highlight-match-text") === "1", "clicking again turns it back on");
  w.initHighlightMatchTextSetting();
  assert(btn.classList.contains("active"), "initHighlightMatchTextSetting re-applies the persisted state to the button");

  // --- isRegex fix: a regex filter's spec used to fall through to a literal
  //     substring search of its own SOURCE, which marked nothing. Rule
  //     colours are cleared first so the assertions below read one whole
  //     mark rather than a span cut up by an overlapping rule's boundary.
  w.setHighlightColor(ruleBeta.id, null);
  w.setHighlightColor(ruleAlpha.id, null);
  const rx = w.createFilterNode(f.id, "text", "beta\\s+\\d+", false, null, false, ["message"], true);
  assert(rx.isRegex === true, "the regex node really carries isRegex");
  const rxSpec = w.textFilterMatchSpec(rx);
  assert(rxSpec && rxSpec.regex instanceof w.RegExp, "textFilterMatchSpec compiles a real RegExp for an isRegex node");
  assert(w.findMatchRanges("alpha beta 7", rxSpec).length === 1, "...and findMatchRanges finds its actual match");
  T.state.activeId = rx.id;
  w.render();
  assert(/<mark class="text-match-mark">beta 0<\/mark>/.test(filteredMsg()),
    "a regex filter now marks what it actually matched, not the literal pattern text");
  assert(!/beta\\s/.test(filteredMsg()), "...and the literal pattern source is nowhere in the row");

  // An invalid regex fails to a null spec (no throw), same graceful failure
  // getEntries already had for it.
  const bad = w.createFilterNode(f.id, "text", "([unclosed", false, null, false, ["message"], true);
  assert(w.textFilterMatchSpec(bad) === null, "an invalid regex yields a null spec instead of throwing");
  T.state.activeId = bad.id;
  w.render();
  assert(d.querySelectorAll("#tableRows .log-row").length === 0, "...and the view just comes up empty");

  // --- Rules on the regex path get the same treatment ---
  w.setHighlightColor(rx.id, "#abcdef");
  T.state.activeId = f.id;
  w.render();
  assert(/<mark class="hl-match-mark mark-seg"[^>]*#abcdef[^>]*>beta 0<\/mark>/.test(fullMsg()),
    "a coloured regex rule underlines its real match in the Full view too");
});
