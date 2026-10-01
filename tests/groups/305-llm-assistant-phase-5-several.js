// GROUP 305 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 305 — LLM assistant, phase 5: several chat sessions (new, switch,
   rename, delete — persisted, newest first, reference files as subtitle,
   each with its own history) and answer buttons for the model's questions.
   ============================================================ */
group(305);
await withApp(async (w, d, T) => {
  section("305a. Sessions: new, switch, rename, delete; separate histories");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["motion", "sensors"], entries: 600, seed: 4 });
  const f = await w.addFile(file.name, file.text, () => {});
  await T.llm.ready;
  const chat = openChatView(w, T);
  const { cd, cw } = chat;
  await waitFor(() => cw.philoggChatView.snapshot);
  const fake = llmFakeModel([
    { calls: [["create_filter", { parentId: f.id, pattern: "Sensor T1" }]] },
    { content: "Welche Größe interessiert dich?\n- temperature\n- pressure\n- voltage" },
    { content: "Neue Sitzung, neues Glück." },
    { content: "Temperatur also." },
  ]);
  T.llmTransportOverride = fake;
  await w.llmSend("Sensoren");
  const a = T.llm.activeSessionId;
  assert(await waitFor(() => cd.querySelectorAll("button.answer-opt").length === 3), "the question's options became buttons");
  assert([...cd.querySelectorAll("button.answer-opt")].map(b => b.textContent).join("|") === "temperature|pressure|voltage", "…one per '- ' line");
  cd.getElementById("btnNewSession").click();
  assert(await waitFor(() => T.llm.activeSessionId !== a && cw.philoggChatView.snapshot.session === null || (cw.philoggChatView.snapshot.session && cw.philoggChatView.snapshot.session.rounds.length === 0)), "New chat: an empty session is active");
  const b = T.llm.activeSessionId;
  assert(b !== a && cd.querySelectorAll(".round").length === 0, "…and the view is empty");
  cd.getElementById("btnNewSession").click();
  await sleep(10);
  assert(T.llm.activeSessionId === b && T.llm.sessions.length === 2, "New on an untouched empty chat reuses it");
  await w.llmSend("Hallo");
  const req = fake.requests[fake.requests.length - 1];
  assert(req.messages.length === 2 && req.messages[1].content === "Hallo", "the new session's request carries only its own history");
  const opts = () => [...cd.getElementById("sessionSelect").options];
  assert(await waitFor(() => opts().length === 2 && opts()[0].value === b), "dropdown: both sessions, newest first");
  assert(opts()[1].textContent === "Sensoren — " + f.name, "title from the first question, reference file as subtitle, got " + opts()[1].textContent);
  const sel = cd.getElementById("sessionSelect");
  sel.value = a;
  sel.dispatchEvent(new cw.Event("change"));
  // Both sessions have one round, so the count alone also matches the view
  // still showing b; wait for a's own round and its buttons before clicking one.
  assert(await waitFor(() => T.llm.activeSessionId === a && cd.querySelectorAll(".round").length === 1 && cd.querySelector(".round .msg-user").textContent === "Sensoren"),
    "switching shows the other session's rounds");
  assert(await waitFor(() => cd.querySelectorAll("button.answer-opt").length === 3), "…with its question's answer buttons");
  cd.querySelectorAll("button.answer-opt")[0].click();
  assert(await waitFor(() => T.llm.sessions.find(s => s.id === a).rounds.length === 2), "an answer button sends its text as the next message");
  const last = fake.requests[fake.requests.length - 1];
  assert(last.messages.some(m => m.content === "Sensoren") && last.messages[last.messages.length - 1].content === "temperature", "…into that session's own history");
  assert(await waitFor(() => cd.querySelectorAll("button.answer-opt").length === 0), "buttons only under the newest round's question");
  cd.getElementById("btnRenameSession").click();
  await waitFor(() => !cd.getElementById("chatDialog").classList.contains("hidden"));
  assert(cd.getElementById("chatDialogInput").value === "Sensoren", "the rename dialog is prefilled with the current title");
  await answerChatDialog(cd, "Sensor-Analyse");
  assert(await waitFor(() => T.llm.sessions.find(s => s.id === a).title === "Sensor-Analyse"), "rename");
  assert(await waitFor(async () => ((await w.llmDbOp("readonly", s => s.getAll())) || []).some(s => s.id === a && s.title === "Sensor-Analyse")), "…persisted");
  cd.getElementById("btnDeleteSession").click();
  assert(await answerChatDialog(cd) === "Delete this chat?", "delete asks first");
  assert(await waitFor(() => T.llm.sessions.length === 1 && T.llm.activeSessionId === b), "delete removes the chat, the other one becomes active");
  assert(await waitFor(async () => { const all = await w.llmDbOp("readonly", s => s.getAll()); return all && all.length && !all.some(s => s.id === a); }), "…from IndexedDB too");
  assert(T.state.nodes[T.llm.sessions.length && Object.keys(T.state.nodes).find(id => T.llmCreatedNodeIds.has(id))], "the filters a deleted chat created stay in the tree");
  assert(!w.llmRenameSession(b, "   ") && !w.llmSwitchSession("nope"), "blank rename / unknown session refused");
  T.llmTransportOverride = llmFakeModel(["hang"]);
  const p = w.llmSend("warte");
  await waitFor(() => T.llm.running);
  assert(!w.llmDeleteSession(b) && w.llmStartNewSession() === null && !w.llmSwitchSession(b), "no delete/new/switch while a round runs");
  assert(await waitFor(() => cd.getElementById("sessionSelect").disabled && cd.getElementById("btnNewSession").disabled), "…and the chat disables those controls");
  w.llmStop();
  await p;
  chat.close();
}, { philogg: llmDesktopStub(), beforeParse: llmOn, indexedDB: new IDBFactory() });
