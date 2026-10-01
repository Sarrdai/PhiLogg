// GROUP 219 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 219 — Shared "stepper" control (harmonized −/+ and prev/next pills)
   Origin: this session (2026-09-15, person-requested): the native
   number-spinner inputs in the Value assertion dialog, Plot settings'
   axis-range fields and Settings' "Lines revealed per step", the Time/Count
   context dialogs, Plot view's own zoom control, the inline image viewer's
   zoom control, and the Context view's match navigator all used their own
   one-off styling for "a value with a decrement/increment (or prev/next)
   control flanking it". Unified into one shared look — a single seamless
   bordered pill, no gap between the value and its flanking buttons — built
   on one shared bit of CSS (.stepper/.stepper-btn/.stepper-value) and JS
   (initNumberStepper, stepperInputHtml), same pattern the pre-existing UI
   scale / Log text size / Anchor fade duration steppers already used (their
   own near-duplicate .font-scale-stepper/.temp-anchor-fade-stepper CSS
   blocks are folded into the same .stepper now instead). The value area is
   editable everywhere a person can usefully type a number (Value assertion,
   Plot axis range, "Lines revealed per step", Time/Count context) and
   read-only where it is a pure position readout (Context match nav, the two
   zoom-level displays, UI scale/Log text size/Anchor fade duration).
   This group covers what's NEW here — the Dec/Inc button wiring itself and
   the shared CSS contract; the underlying fields' own change-driven
   behavior (persistence, plotConfig, assertions, …) is already covered by
   GROUPs 1 (Time context), 14 (Value assertion), 71/111e (font scale),
   138/151 (Context view), and the Plot-range/zoom assertions inside the
   Plot groups — this group does not re-test any of that.
   ============================================================ */
group(219);
await withApp(async (w, d, T) => {
  section("219a. .stepper is one shared, seamless pill — CSS contract");

  const css = d.querySelector("style").textContent;
  const ruleFor = re => { const m = css.match(re); return m && m[0]; };
  const stepperRule = ruleFor(/\n\s*\.stepper\{[^}]*\}/); // NOT ".stepper .stepper-btn{" or ".link-field-row .stepper{" — the base rule's OWN selector is exactly ".stepper", preceded only by a newline+indent
  assert(stepperRule && stepperRule.includes("border:1px solid var(--border)") && stepperRule.includes("border-radius:8px"),
    "the .stepper container is a single bordered pill, got " + stepperRule);
  const btnRule = ruleFor(/\.stepper \.stepper-btn\{[^}]*\}/);
  assert(btnRule && btnRule.includes("border:none"),
    "its flanking buttons carry no border of their own — one shared pill outline, not one per button, got " + btnRule);
  const navRule = ruleFor(/\.stepper\.stepper-nav \.toolbar-icon-btn\{[^}]*\}/);
  assert(navRule && navRule.includes("border:none") && navRule.includes("background:transparent"),
    "Context match nav's own .toolbar-icon-btn pair folds into the same seamless pill when nested in .stepper-nav, got " + navRule);
  assert(!css.includes(".font-scale-stepper") && !css.includes(".temp-anchor-fade-stepper"),
    "the old font-scale-stepper/temp-anchor-fade-stepper duplicate CSS blocks are gone — UI scale/Log text size/Anchor fade duration now share .stepper too");

  section("219b. Editable steppers: clicking Dec/Inc nudges the input and fires the same 'change' typing+blur would");

  // Settings -> Behavior -> "Lines revealed per step" — already-tested
  // change-driven clamp/persist behavior (GROUP 151f) stays behind #settingsContextExpandStep's own listener; only the buttons are new here.
  const stepInput = d.querySelector("#settingsContextExpandStep");
  assert(stepInput.value === "10", "sanity: default is 10");
  fireClick(d.querySelector("#settingsContextExpandStepInc"), w);
  assert(stepInput.value === "11" && T.contextExpandStep === 11, "Inc nudges the field AND drives the same app state a typed 'change' would");
  fireClick(d.querySelector("#settingsContextExpandStepDec"), w);
  fireClick(d.querySelector("#settingsContextExpandStepDec"), w);
  assert(stepInput.value === "9" && T.contextExpandStep === 9, "Dec nudges back down, two clicks = two steps");

  // Value assertion dialog
  const f = await w.addFile("stepper.log", makeLog(0, 5, { suffix: i => "n=" + i }), () => {});
  const node = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  d.querySelector('#extractHead th[data-col="0"]').dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  fireClick(d.querySelector("#tableAssertBtn"), w);
  assert(d.querySelector("#assertMinInput").value === "", "sanity: assertion fields start empty (optional)");
  fireClick(d.querySelector("#assertMinInputInc"), w);
  fireClick(d.querySelector("#assertMinInputInc"), w);
  assert(d.querySelector("#assertMinInput").value === "2",
    "Inc on an empty field starts from 0 and steps by 1, same as the native spinner it replaces");
  fireClick(d.querySelector("#assertMaxInputDec"), w);
  assert(d.querySelector("#assertMaxInput").value === "-1",
    "Dec on an empty field goes negative — min/max have no lower clamp (a legitimate assertion range)");
  fireClick(d.querySelector("#assertModeTarget"), w);
  fireClick(d.querySelector("#assertToleranceInputDec"), w);
  assert(d.querySelector("#assertToleranceInput").value === "0",
    "…but Tolerance IS clamped to min 0 (a negative tolerance is meaningless)");
  fireClick(d.querySelector("#assertDialogCancel"), w);

  // Plot axis range (X min) — same plotConfig.xMin field the 2D/3D range
  // groups already cover for typing; only the new Dec/Inc pair is exercised here.
  T.state.activeId = w.createFilterNode(f.id, "text", "n=[*:int]").id;
  w.render();
  w.applyFhView("plot");
  assert(d.querySelector("#plotXMinDec") && d.querySelector("#plotXMinInc"), "sanity: the Plot X-range field grew its own Dec/Inc pair");
  fireClick(d.querySelector("#plotXMinInc"), w);
  assert(d.querySelector("#plotXMin").value === "1" && T.plotConfig.xMin === "1",
    "Inc on the Plot X-range min field writes plotConfig.xMin, same field GROUP 128's typed-range assertions cover");
  // Follow-up, same session (person-reported via screenshot: the second
  // range field's own +/- buttons were pushed off the visible edge of
  // #plotControls) — the range steppers use the compact size specifically
  // because two side by side, at the default 30px-row size, didn't fit
  // inside the sidebar at all.
  assert(d.querySelector("#plotXMin").closest(".stepper").classList.contains("stepper-compact"),
    "the Plot axis-range steppers use .stepper-compact, not the default size — two side by side is the tightest spot this control sits in");
  // Chart Type buttons: flex:1 1 0 (not "auto"), a CSS-level check like
  // GROUP 217's own (jsdom has no real layout engine to measure rendered
  // pixel widths — see tests/README's "Known gaps") — a zero flex-basis is
  // what makes "Scatter" (7 letters) and "3D" (2) end up the same width
  // instead of each sized off its own label, person-reported.
  const typeBtnRule = ruleFor(/\.plot-type-btn\{[^}]*\}/);
  assert(typeBtnRule && /flex:1 1 0\b/.test(typeBtnRule),
    "chart-type buttons use a zero flex-basis so all four split the row evenly regardless of label length, got " + typeBtnRule);

  // Time context dialog
  const refNode = w.createFilterNode(f.id, "text", "n=3");
  w.openContextDialog(refNode.id);
  assert(d.querySelector("#contextBeforeInput").value === "0", "sanity: Time context fields start at 0");
  fireClick(d.querySelector("#contextBeforeInputInc"), w);
  fireClick(d.querySelector("#contextBeforeInputInc"), w);
  assert(d.querySelector("#contextBeforeInput").value === "2", "Time context's 'Milliseconds before' Inc button works the same way");
  fireClick(d.querySelector("#contextDialogCancel"), w);

  section("219c. Context view match nav: the ‹ / n·m / › trio is now ONE seamless pill, prev/next keep .toolbar-icon-btn");

  const f2 = await w.addFile("navpill.log", makeLog(0, 40, { suffix: i => (i % 20 === 0 ? "hit" : "other") }), () => {});
  const hitFilter = w.createFilterNode(f2.id, "text", "hit"); // entries 0, 20
  T.state.activeId = hitFilter.id;
  w.render();
  w.applyFhView("highlight");

  const prev = d.querySelector("#ctxPrevMatch"), next = d.querySelector("#ctxNextMatch"), label = d.querySelector("#contextNavLabel");
  const navPill = prev.closest(".stepper");
  assert(navPill && navPill.classList.contains("stepper-nav") && navPill.contains(next) && navPill.contains(label),
    "prev/label/next all sit inside one shared .stepper.stepper-nav container");
  assert(prev.classList.contains("toolbar-icon-btn") && next.classList.contains("toolbar-icon-btn"),
    "…while the buttons themselves keep the app's own icon-button class (GROUP 151c), so the hover-reveal-label mechanic and disabled styling still apply");
  assert(label.classList.contains("stepper-value"), "the label carries .stepper-value like every other stepper's readout");
  fireClick(next, w);
  assert(label.textContent.trim() === "2 / 2",
    "clicking the (now seamless) next button still walks match-to-match — with no prior selection, the top-visible row (the first match itself) counts as \"from\", so next lands on the second match — same behavior as before the visual harmonization, got " + JSON.stringify(label.textContent));
});
