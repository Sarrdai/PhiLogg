// GROUP filter-number-hint - loaded by philogg.html's regression harness
// (tests/README.md -> "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, ...) is in scope.

/* ============================================================
   GROUP filter-number-hint - contextual hint row for numeric conditions
   Origin: 2026-10-07 (FEATURE_BACKLOG.md #111, variant C). A row
   #filterNumberHint below the Insert chips appears while the Text-syntax
   pattern holds a [*:int]/[*:float] token and writes a condition (">=10",
   "<20,>10", "|>=10") or a thousands format ("@en"/"@de") into the token
   under the caret; tapping the active chip removes it.
   ============================================================ */
group("filter-number-hint");
await withApp(async (w, d, T) => {
  section("filter-number-hint. numeric-condition hint row in the filter popup");
  const f = await w.addFile("a.log", makeLog(0, 20, { suffix: i => "score=" + i }), () => {});
  w.render();
  T.state.activeId = f.id;
  w.openFilterPopup();
  const input = d.querySelector("#filterInput");
  const hint = d.querySelector("#filterNumberHint");
  const chip = c => [...hint.querySelectorAll("button")].find(b => b.dataset.cond === ({ ">=10": "ge10", "<20,>10": "range", "|>=10": "abs", "@en": "en", "@de": "de" })[c]);
  const setVal = (v, caret) => {
    input.value = v;
    input.setSelectionRange(caret ?? v.length, caret ?? v.length);
    fireInput(input, w);
  };
  const shown = () => isVisible(hint, w);

  assert(!shown(), "hidden for an empty input");
  setVal("plain text");
  assert(!shown(), "hidden for plain text");
  setVal("id=[*:word]");
  assert(!shown(), "hidden when the only token is [*:word]");

  // shown with the right label after the [float] chip
  setVal("temperature=");
  fireClick(d.querySelector('.token-chip[data-token="float"]'), w);
  assert(input.value === "temperature=[*:float]", "sanity: float chip inserted, got " + input.value);
  assert(shown(), "shown once the pattern holds a float token");
  assert(d.querySelector("#filterNumberHintLabel").textContent === "Narrow [*:float]:", "label names the token type, got " + d.querySelector("#filterNumberHintLabel").textContent);
  assert(d.querySelector("#filterTokenChips").nextElementSibling === hint, "the row sits directly below the Insert chips");

  // regex mode hides it
  fireClick(d.querySelector("#filterSyntaxRegex"), w);
  assert(!shown(), "hidden in Regex mode");
  fireClick(d.querySelector("#filterSyntaxText"), w);
  assert(shown(), "shown again after switching back to Text");

  // tap semantics
  setVal("temperature=[*:float]");
  fireClick(chip(">=10"), w);
  assert(input.value === "temperature=[*:float>=10]", "tapping >=10 narrows the token, got " + input.value);
  assert(chip(">=10").getAttribute("aria-pressed") === "true" && chip("<20,>10").getAttribute("aria-pressed") === "false", "the active condition is marked aria-pressed");
  assert(input.selectionStart === "temperature=[*:float>=10".length && input.selectionEnd === input.selectionStart, "caret sits right after the condition, got " + input.selectionStart);
  fireClick(chip("<20,>10"), w);
  assert(input.value === "temperature=[*:float<20,>10]", "tapping another condition replaces it, got " + input.value);
  fireClick(chip("<20,>10"), w);
  assert(input.value === "temperature=[*:float]", "tapping the active condition removes it, got " + input.value);
  fireClick(chip("|>=10"), w);
  assert(input.value === "temperature=[*:float|>=10]", "abs condition, got " + input.value);

  // format + condition
  setVal("temperature=[*:float]");
  fireClick(chip("@de"), w);
  assert(input.value === "temperature=[*:float@de]", "@de sets the format, got " + input.value);
  fireClick(chip(">=10"), w);
  assert(input.value === "temperature=[*:float@de>=10]", "format stays before the condition, got " + input.value);
  fireClick(chip("@en"), w);
  assert(input.value === "temperature=[*:float@en>=10]", "formats are exclusive, got " + input.value);
  fireClick(chip("@en"), w);
  assert(input.value === "temperature=[*:float>=10]", "tapping the active format removes it, got " + input.value);

  // caret targeting with two tokens
  const two = "a=[*:int] b=[*:float]";
  setVal(two, 6); // inside the first token
  assert(d.querySelector("#filterNumberHintLabel").textContent === "Narrow [*:int]:", "caret inside token one targets it");
  fireClick(chip(">=10"), w);
  assert(input.value === "a=[*:int>=10] b=[*:float]", "only the targeted token changes, got " + input.value);
  setVal(two, two.length - 1 + 1); // after both
  assert(d.querySelector("#filterNumberHintLabel").textContent === "Narrow [*:float]:", "caret after both targets the last one before it");
  setVal(two, 0); // before both
  assert(d.querySelector("#filterNumberHintLabel").textContent === "Narrow [*:float]:", "caret before all tokens falls back to the last token");
  setVal(two, 11); // between: after first token, before second
  assert(d.querySelector("#filterNumberHintLabel").textContent === "Narrow [*:int]:", "caret between tokens targets the last one before it");

  // live match count reflects the change
  setVal("score=[*:int]");
  await new Promise(r => setTimeout(r, 200));
  assert(d.querySelector("#filterLiveMatch").textContent.includes("20 matches in 20"), "all rows match before narrowing, got " + d.querySelector("#filterLiveMatch").textContent);
  fireClick(chip(">=10"), w);
  await waitFor(() => d.querySelector("#filterLiveMatch").textContent.includes("10 matches in 20"), 2000);
  assert(d.querySelector("#filterLiveMatch").textContent.includes("10 matches in 20"), "live count reflects the tapped condition, got " + d.querySelector("#filterLiveMatch").textContent);
  w.closeFilterPopup();
});
