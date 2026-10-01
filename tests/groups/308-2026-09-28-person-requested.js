// GROUP 308 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 308 — 2026-09-28 (person-requested): an on/off switch for the
   assistant in Settings → Assistant, default off. Off: no toolbar button,
   no chat, no docked panel, sessions not even loaded; switching off stops
   a running round and closes the window/panel (the docked preference
   stays), a still-open view gets no answers.
   ============================================================ */
group(308);
await withApp(async (w, d, T) => {
  section("308a. Default off; switching on and off");
  const stub = w.philogg;
  const btn = d.getElementById("btnAssistant"), toggle = d.getElementById("settingsLlmEnabled"), panel = d.getElementById("llmDockPanel");
  assert(!isVisible(btn, w) && toggle.getAttribute("aria-checked") === "false", "default: off, no chat button");
  assert(isVisible(d.getElementById("settingsSectionLlm"), w), "the Settings section is there to switch it on");
  assert(T.llm.ready === null && !isVisible(panel, w), "off: no sessions loaded, no docked panel (despite the docked preference)");
  const replies = [];
  w.llmHandleViewMessage({ type: "getSnapshot" }, m => replies.push(m));
  await sleep(10);
  assert(!replies.length, "off: a view gets no answers");
  toggle.click();
  assert(toggle.getAttribute("aria-checked") === "true" && w.localStorage.getItem("philogg-llm-enabled") === "1", "the switch stores on");
  assert(isVisible(btn, w) && T.llm.ready !== null, "on: button shown, sessions loaded");
  assert(isVisible(panel, w) && panel.querySelector("iframe"), "on: the remembered docked panel comes back");
  await T.llm.ready;
  T.llmTransportOverride = llmFakeModel(["hang"]);
  const p = w.llmSend("warte");
  await waitFor(() => T.llm.running);
  toggle.click();
  const r = await p;
  assert(r.status === "stopped" && !T.llm.running, "switching off stops a running round");
  assert(!isVisible(btn, w) && !isVisible(panel, w) && !panel.querySelector("iframe"), "off: button and docked panel gone");
  assert(stub.calls.some(c => c[1] === "hide"), "…the chat window is hidden");
  assert(w.localStorage.getItem("philogg-llm-enabled") === "0" && w.localStorage.getItem("philogg-llm-docked") === "1", "stored off; the docked preference stays");
}, { philogg: llmDesktopStub(), beforeParse: win => win.localStorage.setItem("philogg-llm-docked", "1") });
