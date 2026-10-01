// GROUP 304 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 304 — LLM assistant, phase 4: the chat view (desktop/chat.html)
   and its wiring. The browser build shows no trace of the assistant; the
   desktop build (stubbed window.philogg) gets the toolbar button and
   Settings → Assistant (model list, connection test). chat.html is loaded
   in its own jsdom window and connected to the real main window through a
   fake transport that relays JSON the way Rust does: pull snapshots,
   streaming, clickable/greyed references, Stop, undo this round (incl.
   the confirm), the "not loaded" hint, and a lost "changed" note healing
   itself on the next pull. Sample data from tools/log-sim.
   ============================================================ */
group(304);

await withApp(async (w, d, T) => {
  section("304a. Browser build: no assistant anywhere");
  assert(!w.llmAvailable(), "no window.philogg.llmChat → not available");
  assert(!isVisible(d.getElementById("btnAssistant"), w), "no toolbar button");
  assert(!isVisible(d.getElementById("settingsNavItemLlm"), w) && !isVisible(d.getElementById("settingsSectionLlm"), w), "no Settings → Assistant");
  assert(T.llm.ready === null, "no session database opened");
});

await withApp(async (w, d, T) => {
  section("304b. Desktop build: toolbar button, Settings → Assistant");
  const stub = w.philogg;
  assert(w.llmAvailable() && isVisible(d.getElementById("btnAssistant"), w), "toolbar button shown");
  d.getElementById("btnAssistant").click();
  assert(stub.calls.some(c => c[0] === "window" && c[1] === "show"), "it opens (shows) the chat window");
  w.openSettingsDialog();
  assert(isVisible(d.getElementById("settingsSectionLlm"), w) && isVisible(d.getElementById("settingsNavItemLlm"), w), "Settings → Assistant shown");
  assert(d.getElementById("settingsLlmTemperature").value === "0.2" && d.getElementById("settingsLlmMaxTurns").value === "12", "defaults shown");
  d.getElementById("settingsLlmTest").click();
  const status = d.getElementById("settingsLlmStatus");
  assert(await waitFor(() => status.textContent.startsWith("Connected")), "connection test: " + status.textContent);
  assert(stub.calls.find(c => c[0] === "models")[1] === "http://localhost:1234/v1", "…against the default endpoint");
  const sel = d.getElementById("settingsLlmModel");
  assert([...sel.options].map(o => o.value).join() === ",qwen2.5-7b-instruct,llama-3.2-3b", "model dropdown from /v1/models");
  sel.value = "llama-3.2-3b";
  sel.dispatchEvent(new w.Event("change"));
  assert(w.localStorage.getItem("philogg-llm-model") === "llama-3.2-3b" && w.llmSettings().model === "llama-3.2-3b", "model choice stored");
  const ep = d.getElementById("settingsLlmEndpoint");
  ep.value = "http://localhost:9999/v1";
  ep.dispatchEvent(new w.Event("change"));
  d.getElementById("settingsLlmRefresh").click();
  assert(await waitFor(() => status.classList.contains("error")) && status.textContent.includes("LM Studio"), "an unreachable server shows the bridge's reason");
  const t = d.getElementById("settingsLlmTemperature");
  t.value = "7";
  t.dispatchEvent(new w.Event("change"));
  assert(t.value === "2" && w.llmSettings().temperature === 2, "temperature clamped to 0..2");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("304c. chat.html against the real main window: pull snapshots, stream, refs, Stop, undo");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["motion", "sensors"], entries: 1500, seed: 5 });
  const f = await w.addFile(file.name, file.text, () => {});
  await T.llm.ready;
  T.resetUndoRedo();
  const chat = openChatView(w, T);
  const { cd, cw } = chat;
  assert(await waitFor(() => cw.philoggChatView.snapshot), "the view pulls a snapshot on load");
  assert(cd.getElementById("chatEmpty").textContent.includes("temperature"), "empty chat: an example question");
  assert(cd.documentElement.style.getPropertyValue("--accent") !== "", "the main window's theme variables are applied");
  assert(cd.getElementById("chatToolbar").style.display === "" && cd.getElementById("btnDock").style.display === "" && cd.getElementById("btnOnTop").style.display === "", "controls follow snapshot.features and the transport (window: sessions, dock, always-on-top)");

  let streamSeen = false;
  const fake = llmFakeModel([
    { calls: [["create_filter", { parentId: f.id, pattern: "Position reached axis=2 " }]] },
    (req, res) => ({ content: "Filter " + res.create_filter[0].nodeId + " zeigt " + res.create_filter[0].matches + " Positionierungen." }),
  ]);
  const chatFn = fake.chat;
  fake.chat = (...a) => chatFn(...a);
  T.llmTransportOverride = fake;
  const input = cd.getElementById("chatInput");
  input.value = "Nur Achse 2 bitte";
  input.dispatchEvent(new cw.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert(chat.sent.some(m => m.type === "send" && m.text === "Nur Achse 2 bitte") && input.value === "", "Enter sends and clears the input");
  assert(await waitFor(() => cd.querySelectorAll(".round .msg-text").length === 1 && !cw.philoggChatView.snapshot.running), "the answer arrives by pull");
  const round = T.llm.sessions[0].rounds[0];
  const nodeId = round.created[0];
  assert(cd.querySelector(".msg-user").textContent === "Nur Achse 2 bitte" && cd.querySelector(".msg-tool").textContent.includes("create_filter → " + nodeId), "user message and the tool step");
  const link = cd.querySelector('.msg-text a.ref[data-token="' + nodeId + '"]');
  assert(link, "the node id in the answer is a link");
  T.state.activeId = f.id;
  link.click();
  assert(await waitFor(() => T.state.activeId === nodeId), "clicking it activates the node in the main window");
  assert(w.philogg.calls.some(c => c[1] === "focusMain"), "…and brings the main window forward");

  const undoBtn = cd.querySelector("button.undo-round");
  assert(undoBtn && !undoBtn.disabled, "undo-this-round button enabled");
  undoBtn.click();
  assert(await waitFor(() => !T.state.nodes[nodeId]), "it takes the round back");
  assert(await waitFor(() => cd.querySelector("button.undo-round").disabled && cd.querySelector(".ref-gone")), "then the button is disabled and the reference greyed out");

  // Stop while the model is still thinking; the streamed text shows meanwhile.
  const fake2 = llmFakeModel([]);
  let finishStream;
  fake2.chat = (id, ep, req, onEvent) => new Promise((res, rej) => {
    onEvent({ type: "chunk", data: { choices: [{ delta: { content: "Ich schaue …" } }] } });
    fake2.pending = { id, rej };
  });
  fake2.cancel = id => fake2.pending && fake2.pending.rej(new Error("cancelled"));
  T.llmTransportOverride = fake2;
  input.value = "Und jetzt?";
  cd.getElementById("chatSend").click();
  assert(await waitFor(() => cd.getElementById("chatSend").textContent === "Stop"), "while running the button is Stop");
  assert(await waitFor(() => (cd.querySelector(".msg-stream") || {}).textContent === "Ich schaue …"), "the streamed text is shown");
  cd.getElementById("chatSend").click();
  assert(await waitFor(() => (cd.querySelectorAll(".msg-status")[0] || {}).textContent === "Stopped."), "Stop → the round shows 'Stopped.'");
  assert(cd.getElementById("chatSend").textContent === "Send", "back to Send");

  // needsConfirm: the person built a filter under the round's node.
  T.llmTransportOverride = llmFakeModel([
    { calls: [["create_filter", { parentId: f.id, pattern: "Sensor T1" }]] }, { content: "ok" }]);
  await w.llmSend("Sensor T1");
  const r3 = T.llm.sessions[0].rounds[2];
  const mine = w.createFilterNode(r3.created[0], "text", "temperature");
  w.pushCreateUndo(mine);
  await waitFor(() => cd.querySelectorAll("button.undo-round").length === 3);
  cd.querySelectorAll("button.undo-round")[2].click();
  const asked = await answerChatDialog(cd);
  assert(asked === "Undo this round?" && await waitFor(() => !T.state.nodes[r3.created[0]]) && chat.sent.some(m => m.type === "undoRound" && m.force), "asks first (in-page dialog), then removes with force");

  // The hint for reference files that aren't loaded.
  w.deleteNode(f.id);
  w.llmNotify();
  assert(await waitFor(() => cd.getElementById("chatHint").textContent.includes(f.name)), "'refers to … — not loaded' hint");
  chat.close();
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("304d. A lost 'changed' note heals on the next pull");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["motion"], entries: 300, seed: 1 });
  const f = await w.addFile(file.name, file.text, () => {});
  await T.llm.ready;
  let dropping = true;
  const chat = openChatView(w, T, { drop: msg => dropping && msg.type === "changed" });
  await waitFor(() => chat.cw.philoggChatView.snapshot);
  T.llmTransportOverride = llmFakeModel([{ content: "eins" }, { content: "zwei" }]);
  await w.llmSend("a");
  await sleep(20);
  assert(chat.cd.querySelectorAll(".round").length === 0, "every note of round 1 was lost: the view is stale");
  dropping = false;
  await w.llmSend("b");
  assert(await waitFor(() => chat.cd.querySelectorAll(".round").length === 2), "the next note pulls the whole session — round 1 included");
  assert(chat.cd.querySelectorAll(".msg-text")[0].textContent === "eins", "…with its content");
  chat.close();
}, { philogg: llmDesktopStub(), beforeParse: llmOn });
