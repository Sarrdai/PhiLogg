// GROUP 73 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 73 — Horizontal scrollbar in the log views
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Horizontal
   scrollbar in the Filter view — so long messages can be read in full".
   #tableBody scrolls horizontally; #tableHeader keeps its own scrollbar
   hidden and has its scrollLeft driven by #tableBody's scroll event, and
   its .row-grid's width kept in sync with the widest currently-rendered
   row (syncTableHeaderWidth, called from renderVisibleRows) since the
   header's own content (short column labels) would otherwise size much
   narrower than a long message. The actual visual overflow/scrollbar
   behavior is CSS/layout-driven (`.col-msg{min-width: max-content}` forcing
   the message column's grid track to refuse to shrink below its own
   content) and isn't independently verifiable here — jsdom has no real
   layout engine (see tests/README's "Known gaps") — so this covers the
   JS-observable parts: the overflow-x split itself (real computed style,
   not just a class) and the header sync/scroll-lockstep logic. GROUP 73b
   covers the follow-up bugfix's own JS logic (computeMaxMessageWidth/
   syncTableRowsWidth) directly.
   UPDATED 2026-09-02 (person-requested): the Context view scrolls
   horizontally too now, through its own mirror of the same pair
   (syncHighlightRowsWidth/syncHighlightHeaderWidth). This group used to
   assert the opposite — that #highlightBody stays clipped — which is dead
   code now, so it asserts the mirror instead.
   ============================================================ */
group(73);
await withApp(async (w, d, T) => {
  section("73. Horizontal scrollbar in the log views");

  const tableBody = d.getElementById("tableBody");
  const tableHeader = d.getElementById("tableHeader");
  const highlightBody = d.getElementById("highlightBody");
  const highlightHeader = d.getElementById("highlightHeader");

  assert(w.getComputedStyle(tableBody).overflowX === "auto", "Filter view's #tableBody scrolls horizontally");
  assert(w.getComputedStyle(tableHeader).overflowX === "hidden", "the header's own (synced, non-user-facing) scrollbar stays hidden");
  assert(w.getComputedStyle(highlightBody).overflowX === "auto",
    "the Context view scrolls horizontally too (person-requested — it used to clip long messages instead)");
  assert(w.getComputedStyle(highlightHeader).overflowX === "hidden", "…with its own header scrollbar hidden the same way");

  await w.addFile("a.log", makeLog(0, 5), () => {});
  w.render();

  const tableRows = d.getElementById("tableRows");
  Object.defineProperty(tableRows, "scrollWidth", { value: 1234, configurable: true });
  w.renderVisibleRows();
  const headerGrid = tableHeader.querySelector(".row-grid");
  assert(headerGrid.style.width === "1234px", "the header's row-grid width tracks the widest rendered row's natural width, got " + headerGrid.style.width);

  tableBody.scrollLeft = 42;
  tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  assert(tableHeader.scrollLeft === 42, "scrolling the Filter view's body drives the header's scrollLeft to match");

  // The Context view's own copy of both halves.
  const highlightRows = d.getElementById("highlightRows");
  Object.defineProperty(highlightRows, "scrollWidth", { value: 987, configurable: true });
  w.renderHighlightVisibleRows();
  assert(highlightHeader.querySelector(".row-grid").style.width === "987px",
    "the Context header's row-grid width tracks its own widest rendered row, got " + highlightHeader.querySelector(".row-grid").style.width);
  highlightBody.scrollLeft = 17;
  highlightBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  assert(highlightHeader.scrollLeft === 17, "scrolling the Context view's body drives its own header's scrollLeft to match");
});

/* ============================================================
   GROUP 73b — Row background/scroll-width bugfix (Filter view)
   Origin: this session (2026-08-21), person-reported follow-up to GROUP 73
   (screenshot: colored row backgrounds and the usable horizontal-scroll
   range stopped at the viewport edge instead of covering a long message's
   full width; a second report after the first fix showed only the row
   that itself held a long message grew — every other row in the same file
   stayed narrow, and the scrollbar's own range shrank back once that row
   scrolled out of the virtualized window). Root-caused to #tableRows
   giving every row a width sized from whatever the CURRENTLY RENDERED
   window happened to contain, never the full filtered list. Fixed by
   computing ONE width up front from the WIDEST message across the entire
   current view (computeMaxMessageWidth) and applying it to #tableRows
   itself (syncTableRowsWidth) — every .log-row is a plain width:auto
   block, so all of them inherit that one shared width uniformly. See
   changelog.d for the full root-cause writeup and the CSS
   comment near applyRowGrid for the calculation itself.
   Unlike the GROUP 73 CSS overflow mechanism, this fix's actual logic is
   plain JS over an entries array — genuinely testable here, not a jsdom
   "layout blind spot" case. jsdom has no real layout engine, so
   measureMsgWidth (see its own comment, and GROUP 73c below for its
   follow-up rewrite) falls back to a deterministic per-character estimate
   there — fine for relative/threshold assertions, not for exact pixel
   values, same caveat as the character-count-based approach itself (a real
   browser's font-metric precision is what ultimately matters, verified
   separately with Playwright per the changelog entry).
   ============================================================ */
group(73);
await withApp(async (w, d, T) => {
  section("73b. Row background/scroll-width bugfix (Filter view)");

  const tableRows = d.getElementById("tableRows");
  const tableBody = d.getElementById("tableBody");
  const tableSpacer = d.getElementById("tableSpacer");

  assert(w.computeMaxMessageWidth([]) === 0, "computeMaxMessageWidth of an empty list is 0");
  assert(w.computeMaxMessageWidth([{ message: "" }, { message: null }]) === 0, "...and of a list with no message text");

  const shortMsg = "hi";
  const longMsg = "x".repeat(200);
  assert(
    w.computeMaxMessageWidth([{ message: shortMsg }, { message: longMsg }]) > w.computeMaxMessageWidth([{ message: shortMsg }]),
    "computeMaxMessageWidth grows with the widest message ANYWHERE in the list, not just the first/last entry"
  );

  // Multiline mode: the WIDEST LINE decides the width, not the total
  // (unwrapped) character count — mirrors the on/off distinction
  // rowHeightForEntry already makes for row HEIGHT (line count, not total
  // length), since white-space:nowrap collapses a literal "\n" to a single
  // space (one visual line) while white-space:pre actually breaks on it.
  const mixedMessage = "a\n" + "y".repeat(50) + "\nb";
  T.state.multilineMessages = false;
  const singleLineW = w.computeMaxMessageWidth([{ message: mixedMessage }]);
  T.state.multilineMessages = true;
  const multilineW = w.computeMaxMessageWidth([{ message: mixedMessage }]);
  T.state.multilineMessages = false;
  assert(singleLineW > multilineW, "single-line mode measures the WHOLE message; multiline mode measures only its widest individual line");

  // End-to-end: #tableRows itself gets ONE explicit width from the widest
  // message in the whole file, applied uniformly — not a per-row width.
  const longSuffix = "x".repeat(200);
  await w.addFile("mix.log", makeLog(0, 5, { suffix: i => (i === 2 ? longSuffix : "") }), () => {});
  w.render();

  assert(tableRows.style.width !== "", "a file with one long message (among otherwise-short ones) gives #tableRows an explicit width");
  const widthPx = parseFloat(tableRows.style.width);
  assert(widthPx > tableSpacer.clientWidth, "...wider than the viewport (clientWidth stub is " + tableSpacer.clientWidth + "px)");

  // Scroll to a window of rows that does NOT include the long-message row
  // (index 2) and confirm #tableRows' width is untouched — exactly the
  // person-reported regression (background/scroll range used to shrink
  // back once the long-message row scrolled out of the rendered window).
  const widthBefore = tableRows.style.width;
  tableBody.scrollTop = 999;
  w.renderVisibleRows();
  assert(tableRows.style.width === widthBefore, "…and stays exactly the same width once the long-message row scrolls out of the rendered window");

  // A file with only short messages: nothing needs more than the viewport,
  // so #tableRows must go back to filling it — no leftover inline width
  // from the previous (long-message) file. The global clientWidth stub is
  // a narrow 800px (barely wider than the default fixed columns alone,
  // 811px — see applyRowGrid/DEFAULT_COLUMN_WIDTHS), which would make even
  // a short message "overflow" here; widen #tableSpacer's stub just for
  // this assertion to a value any short message genuinely fits inside,
  // matching what a real (much wider) desktop viewport gives for free.
  Object.defineProperty(tableSpacer, "clientWidth", { value: 5000, configurable: true });
  await w.addFile("short.log", makeLog(0, 5), () => {});
  w.render();
  assert(tableRows.style.width === "", "a file with only short messages leaves #tableRows filling the view (no inline width)");

  // Belt-and-braces CSS floor (person-reported, 2026-09-05): #tableRows'
  // stretch-fill relies on JS clearing its inline width at the right moment
  // (above) — should that ever go stale (a width computed once, before the
  // panel reached its final size, never revisited), a plain CSS min-width:
  // 100% on #tableRows/#highlightRows independently guarantees rows (and so
  // their .selected box-shadow outline) can never render narrower than the
  // view, no JS timing involved. min-width always wins over a smaller
  // explicit width per the CSS box model, so this is provably a no-op for
  // the long-message case above (explicit width there is already > 100%).
  assert(w.getComputedStyle(tableRows).minWidth === "100%", "#tableRows has a CSS min-width:100% floor, independent of the JS width sync");
  assert(w.getComputedStyle(d.getElementById("highlightRows")).minWidth === "100%", "#highlightRows has the same floor");
});

/* ============================================================
   GROUP 73c — measureMsgWidth rewrite: real DOM measurement, not canvas
   Origin: this session (2026-08-21), person-reported follow-up to GROUP 73b
   (built the exact "4 differently-long messages" repro the person asked
   for — short/medium/long/multi-line-stacktrace — and scrolled all the way
   right with Playwright): #tableRows WAS sized correctly per GROUP 73b's
   own logic, but consistently wider than where the longest message's text
   actually ended — a real, visible gap past the last character, growing
   with the message's length. Root cause: GROUP 73b's measureMsgWidth used
   Canvas2D's measureText(), which measurably diverges from Blink's own CSS
   layout text renderer for an IDENTICAL font-family/size string (confirmed
   directly: an offscreen canvas and a real DOM element given the same
   700-character string and the same explicit font declaration came back
   ~1.1% apart per character — small alone, but compounding linearly with
   message length, so a genuinely long line — the exact case this feature
   exists for — could end up hundreds of pixels short of matching reality).
   Not a rounding nit: two different browser text-rendering pipelines
   (canvas glyph shaping vs. layout line-boxing) simply don't promise
   pixel-identical advance widths for the same font, even same-engine.
   Fixed by dropping canvas entirely: measureMsgWidth now reads the natural
   width of a hidden, reused DOM element carrying the SAME `.col-msg` class
   real rows use (position:absolute, shrink-to-fit, off past any visible
   area) via offsetWidth — literally the same rendering path a real row
   uses, so it cannot diverge from it. See changelog.d for the
   measured numbers and the offsetWidth-vs-getBoundingClientRect zoom-safety
   check (offsetWidth stays in unscaled CSS px under state.fontScale's
   whole-UI zoom; getBoundingClientRect() doesn't — verified with
   Playwright, not assumed).
   jsdom has no real layout engine, so a freshly created, unstubbed
   element's offsetWidth is always 0 — same documented blind spot the
   highlight-marker tooltip positioning already works around — exercising
   measureMsgWidth's own MONO_CHAR_WIDTH_FALLBACK path exactly, deterministically.
   ============================================================ */
group(73);
await withApp(async (w, d, T) => {
  section("73c. measureMsgWidth rewrite: real DOM measurement, not canvas");

  assert(typeof w.measureMsgWidth === "function", "measureMsgWidth exists");
  assert(w.measureMsgWidth("") === 0, "measureMsgWidth of an empty string is 0");
  assert(
    w.measureMsgWidth("hello") === 5 * T.MONO_CHAR_WIDTH_FALLBACK,
    "in jsdom (no real layout engine, offsetWidth always 0 on a fresh element), measureMsgWidth falls back to exactly length * MONO_CHAR_WIDTH_FALLBACK"
  );
  assert(
    w.measureMsgWidth("a".repeat(50)) === 50 * T.MONO_CHAR_WIDTH_FALLBACK,
    "...proportionally, for a longer string"
  );

  // The measuring element is created once and reused (not a fresh element,
  // and not inserted, per call) — a perf guard: computeMaxMessageWidth
  // calls this once per render, not once per entry, specifically BECAUSE
  // a real layout-triggering measurement is too slow to do per-entry over
  // a large file; if this ever regressed into re-creating/re-inserting the
  // element every call, a huge file would reflow on every keystroke-speed
  // render.
  w.measureMsgWidth("first");
  const probesAfterFirst = d.querySelectorAll("body > div.col-msg").length;
  w.measureMsgWidth("second");
  const probesAfterSecond = d.querySelectorAll("body > div.col-msg").length;
  assert(probesAfterFirst === 1, "exactly one hidden measuring element exists after the first call, got " + probesAfterFirst);
  assert(probesAfterSecond === 1, "...and the SAME one is reused on a second call, not a new one appended, got " + probesAfterSecond);

  const probe = d.querySelector("body > div.col-msg");
  assert(w.getComputedStyle(probe).visibility === "hidden", "the measuring element is visibility:hidden (kept laid out for offsetWidth, just not painted)");
  assert(w.getComputedStyle(probe).position === "absolute", "...and taken out of flow (position:absolute) so it can't affect real layout");
});
