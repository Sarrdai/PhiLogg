// GROUP 93 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 93 — Text-filter match highlighting (this session, 2026-08-23,
   person-requested alternative implementation of FEATURE_BACKLOG.md #13's
   "why is this row here" popup idea — that entry itself is left untouched).
   Marks the substring an active "text" filter node actually matched, right
   inside the Filter view's rows and/or the entry-detail panel. The master
   on/off is a view-bar toggle button, #btnTextMatchHighlight (same
   plain-persistent-toggle shape as #btnPinBookmarks/#btnMultilineMsg,
   person-requested move out of Settings same-day follow-up). Settings ->
   Behavior keeps #settingsTextMatchHighlightScope ("last"/"any", default
   "last") and the two independent "where" toggles,
   #settingsTextMatchHighlightRows/-Detail (both default ON) — a same-day
   follow-up explicitly asked for these rows to stay visible/editable
   regardless of the master button's state (a standing preference the button
   just flips, not a gate on configuring it).
   ============================================================ */
group(93);
await withApp(async (w, d, T) => {
  section("93. Text-filter match highlighting");

  const btn = d.querySelector(".toggle-textmatch");
  const scopeSelect = d.querySelector("#settingsTextMatchHighlightScope");
  const rowsCb = d.querySelector("#settingsTextMatchHighlightRows");
  const detailCb = d.querySelector("#settingsTextMatchHighlightDetail");

  // --- Defaults ---
  assert(btn.classList.contains("active") && T.textMatchHighlightEnabled === true, "master view-bar button defaults ON");
  assert(scopeSelect.value === "last" && T.textMatchHighlightScope === "last", "settings scope defaults to 'last'");
  assert(pillChecked(rowsCb) === true && T.textMatchHighlightInRows === true, "'show in rows' defaults ON");
  assert(pillChecked(detailCb) === true && T.textMatchHighlightInDetail === true, "'show in entry detail' defaults ON");
  assert(isVisible(scopeSelect, w) && isVisible(rowsCb, w) && isVisible(detailCb, w), "all three settings controls are visible");

  // --- Clicking the master button off does NOT hide/disable the Settings
  //     controls — they stay a fully editable standing preference, only the
  //     highlighting itself (checked separately below) is suppressed ---
  fireClick(btn, w);
  assert(!T.textMatchHighlightEnabled && !btn.classList.contains("active"), "clicking the button turns the master off");
  assert(w.localStorage.getItem("philogg-text-match-highlight-enabled") === "0", "master state persisted as off");
  assert(isVisible(scopeSelect, w) && !scopeSelect.disabled, "scope select stays visible and enabled while the master button is off");
  assert(isVisible(rowsCb, w) && !rowsCb.disabled && isVisible(detailCb, w) && !detailCb.disabled,
    "both 'where' toggles stay visible and enabled too — no dependency of Settings on the button's state");
  scopeSelect.value = "any";
  scopeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.textMatchHighlightScope === "any", "the scope preference is still changeable while the master button is off");
  scopeSelect.value = "last";
  scopeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  fireClick(btn, w);
  assert(T.textMatchHighlightEnabled && btn.classList.contains("active"), "clicking it again turns the master back on");

  // file -> nodeA (text "alpha", matches everything) -> nodeB (text "1",
  // scoped to the message column — a column-less filter searches the whole
  // raw line, see textFilterMatches, and the raw line's date/hour always
  // contains a "1", which would make this scenario trivially match every
  // row; matches messages containing "1": msg 1 and 10-19 = 11 of 20, same
  // shape as GROUP 2's substring assertion).
  const f = await w.addFile("app.log", makeLog(0, 20, { msgPrefix: "alpha" }), () => {});
  const nodeA = w.createFilterNode(f.id, "text", "alpha", false, null, false, ["message"]);
  const nodeB = w.createFilterNode(nodeA.id, "text", "1", false, null, false, ["message"]);

  // --- "last" scope, active = nodeB (a text filter): only nodeB's match
  //     ("1") is marked, not nodeA's ("alpha") ---
  T.state.activeId = nodeB.id;
  w.render();
  let msgEl = d.querySelector("#tableRows .log-row .col-msg");
  assert(msgEl.innerHTML.includes('<mark class="text-match-mark">1</mark>'), "'last' scope marks the active node's own match");
  assert(!msgEl.innerHTML.includes(">alpha<") && !/<mark[^>]*>alpha<\/mark>/.test(msgEl.innerHTML),
    "'last' scope does NOT mark the ancestor's match, only the active node's");

  // --- "last" scope, active = nodeA itself (also a text filter): nodeA's
  //     own match ("alpha") is marked ---
  T.state.activeId = nodeA.id;
  w.render();
  msgEl = d.querySelector("#tableRows .log-row .col-msg");
  assert(/<mark class="text-match-mark">alpha<\/mark>/i.test(msgEl.innerHTML), "'last' scope on nodeA marks nodeA's own match");

  // --- "any" scope, active = nodeB: BOTH ancestor chain matches are marked ---
  scopeSelect.value = "any";
  scopeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.localStorage.getItem("philogg-text-match-highlight-scope") === "any", "scope choice persisted");
  T.state.activeId = nodeB.id;
  w.render();
  msgEl = d.querySelector("#tableRows .log-row .col-msg");
  assert(/<mark class="text-match-mark">alpha<\/mark>/i.test(msgEl.innerHTML) && msgEl.innerHTML.includes('<mark class="text-match-mark">1</mark>'),
    "'any' scope marks matches from every text-filter node in the chain, not just the active one");

  // --- "last" scope with the active node NOT a text filter: no highlight at
  //     all, even though its parent (nodeB) is a text filter — no fallback
  //     to a text-filter ancestor, per the explicit design decision ---
  scopeSelect.value = "last";
  scopeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  const afterNode = w.createFilterNode(nodeB.id, "after", f.entries[0].ts);
  T.state.activeId = afterNode.id;
  w.render();
  msgEl = d.querySelector("#tableRows .log-row .col-msg");
  assert(!/<mark/.test(msgEl.innerHTML), "'last' scope shows no highlight when the active node itself isn't a text filter (no ancestor fallback)");
  assert(w.getTextMatchHighlightNodes().length === 0, "getTextMatchHighlightNodes() returns nothing for a non-text active node in 'last' scope");

  // --- Column-scoped text filter: a "thread"-restricted filter marks the
  //     Thread column, not the Message column (per the "highlight in the
  //     matching column" design decision) ---
  const threadNode = w.createFilterNode(f.id, "text", "main", false, null, false, ["thread"]);
  T.state.activeId = threadNode.id;
  w.render();
  const row = d.querySelector("#tableRows .log-row");
  assert(/<mark class="text-match-mark">main<\/mark>/i.test(row.querySelector(".col-thread").innerHTML), "a thread-scoped filter marks the Thread column");
  assert(!/<mark/.test(row.querySelector(".col-msg").innerHTML), "...and does NOT mark the Message column, which the filter isn't scoped to");

  // --- "Show in rows" OFF suppresses row marks; "show in entry detail" is
  //     independent and keeps working ---
  T.state.activeId = nodeB.id;
  w.render();
  fireClick(rowsCb, w);
  assert(w.localStorage.getItem("philogg-text-match-highlight-rows") === "0", "'show in rows' persisted off");
  msgEl = d.querySelector("#tableRows .log-row .col-msg");
  assert(!/<mark/.test(msgEl.innerHTML), "turning off 'show in rows' removes row marks immediately");

  T.state.selectedId = f.entries[1].id; // message "alpha 1" — contains nodeB's "1" match
  w.updateDetailPanel();
  const detailMsgEl = d.querySelector("#detailMessage");
  assert(/<mark class="text-match-mark">1<\/mark>/.test(detailMsgEl.innerHTML), "entry-detail message still marks matches while row-highlighting is off (independent toggle)");

  fireClick(detailCb, w);
  assert(w.localStorage.getItem("philogg-text-match-highlight-detail") === "0", "'show in entry detail' persisted off");
  w.updateDetailPanel();
  assert(!/<mark/.test(d.querySelector("#detailMessage").innerHTML), "turning off 'show in entry detail' removes detail-panel marks immediately");
  assert(d.querySelector("#detailMessage").textContent.length > 0, "detail message text itself is still shown (falls back to plain textContent, not emptied)");

  // --- The master button (not the settings rows) is what actually gates
  //     everything: turning it off suppresses matches even with scope="any"
  //     and both 'where' toggles back on ---
  fireClick(rowsCb, w);
  fireClick(detailCb, w);
  fireClick(btn, w);
  msgEl = d.querySelector("#tableRows .log-row .col-msg");
  assert(!/<mark/.test(msgEl.innerHTML), "master button off suppresses row marks regardless of the 'where' toggles");
  w.updateDetailPanel();
  assert(!/<mark/.test(d.querySelector("#detailMessage").innerHTML), "...and detail-panel marks too");
  fireClick(btn, w); // back on for the rest of the group

  // --- Wildcard/value-token text filters are matched too, numeric
  //     conditions and all (findMatchRanges/textFilterMatchSpec directly,
  //     same primitives the row/detail rendering above uses) ---
  const wcNode = w.createFilterNode(f.id, "text", "alpha [*:int>=10]");
  const spec = w.textFilterMatchSpec(wcNode);
  assert(spec && spec.wildcardRegex, "a wildcard/value-token text filter compiles a wildcardRegex match spec");
  const rangesHit = w.findMatchRanges("alpha 15", spec);
  assert(rangesHit.length === 1 && rangesHit[0][0] === 0 && rangesHit[0][1] === "alpha 15".length,
    "wildcard match range covers the full matched span for a value that satisfies the numeric condition");
  const rangesMiss = w.findMatchRanges("alpha 5", spec);
  assert(rangesMiss.length === 0, "wildcard match finds no range when the numeric condition ([*:int>=10]) isn't satisfied");

  // --- initTextMatchHighlightSettings re-applies persisted flags on
  //     (re-)init, same path real boot uses ---
  w.localStorage.setItem("philogg-text-match-highlight-enabled", "0");
  w.localStorage.setItem("philogg-text-match-highlight-scope", "any");
  w.localStorage.setItem("philogg-text-match-highlight-rows", "1");
  w.localStorage.setItem("philogg-text-match-highlight-detail", "1");
  w.initTextMatchHighlightSettings();
  assert(!T.textMatchHighlightEnabled && !btn.classList.contains("active"), "initTextMatchHighlightSettings re-applies the persisted master state to the button");
  assert(T.textMatchHighlightScope === "any" && scopeSelect.value === "any", "...and re-applies the persisted scope");
  assert(pillChecked(rowsCb) === true && pillChecked(detailCb) === true, "...and re-applies both persisted 'where' toggles");
});
