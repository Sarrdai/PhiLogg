// GROUP 306 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 306 — LLM assistant, phase 6: docking. The chat as an <iframe>
   side panel in the main window (postMessage transport), dock/undock
   (window hidden/shown), the toolbar button toggling the docked panel, the
   docked state remembered across a restart, and chat.html's own docked
   transport.
   ============================================================ */
group(306);
await withApp(async (w, d, T) => {
  section("306a. Dock / undock in the main window");
  await T.llm.ready;
  const stub = w.philogg;
  const panel = d.getElementById("llmDockPanel");
  assert(!isVisible(panel, w), "not docked by default");
  w.llmHandleViewMessage({ type: "dock" }, () => {});
  const frame = panel.querySelector("iframe");
  assert(isVisible(panel, w) && frame && frame.getAttribute("src") === "chat.html", "dock: the side panel holds chat.html in an iframe");
  assert(stub.calls.some(c => c[1] === "hide") && w.localStorage.getItem("philogg-llm-docked") === "1", "…the window is hidden, the state remembered");
  const posted = [];
  frame.contentWindow.postMessage = m => posted.push(JSON.parse(JSON.stringify(m)));
  w.dispatchEvent(new w.MessageEvent("message", { data: { philoggChat: { type: "getSnapshot" } }, source: frame.contentWindow }));
  assert(await waitFor(() => posted.some(m => m.philoggChat && m.philoggChat.type === "snapshot")), "a pull from the iframe is answered into the iframe");
  const snap = posted.find(m => m.philoggChat.type === "snapshot").philoggChat;
  assert(snap.features.includes("dock") && snap.features.includes("sessions"), "features: dock, sessions");
  w.dispatchEvent(new w.MessageEvent("message", { data: { philoggChat: { type: "send", text: "x" } }, source: w }));
  await sleep(10);
  assert(!T.llm.sessions.length, "messages from any other source are ignored");
  T.llmTransportOverride = llmFakeModel([{ content: "hallo" }]);
  posted.length = 0;
  w.dispatchEvent(new w.MessageEvent("message", { data: { philoggChat: { type: "send", text: "hi" } }, source: frame.contentWindow }));
  assert(await waitFor(() => T.llm.sessions.length === 1 && T.llm.sessions[0].rounds[0].status === "done"), "the docked chat drives the loop");
  assert(posted.some(m => m.philoggChat.type === "changed"), "…and gets 'changed' notes");
  d.getElementById("btnAssistant").click();
  assert(!isVisible(panel, w) && panel.querySelector("iframe") === frame, "toolbar button hides the docked panel (the chat keeps running in the iframe)");
  d.getElementById("btnAssistant").click();
  assert(isVisible(panel, w), "…and shows it again");
  const shows = stub.calls.filter(c => c[1] === "show").length;
  w.llmHandleViewMessage({ type: "undock" }, () => {});
  assert(!isVisible(panel, w) && !panel.querySelector("iframe") && w.localStorage.getItem("philogg-llm-docked") === "0", "undock: panel gone, state remembered");
  assert(stub.calls.filter(c => c[1] === "show").length === shows + 1, "…and the window is shown again");
  posted.length = 0;
  w.llmNotify();
  assert(!posted.length, "the removed iframe gets no more notes");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("306b. The docked state survives a restart");
  const panel = d.getElementById("llmDockPanel");
  assert(isVisible(panel, w) && panel.querySelector("iframe"), "docked at boot");
  assert(!w.philogg.calls.some(c => c[1] === "show"), "the window is not opened");
}, { philogg: llmDesktopStub(), beforeParse: win => { llmOn(win); win.localStorage.setItem("philogg-llm-docked", "1"); } });

{
  if (groupSelected()) {
    section("306c. chat.html's docked transport (postMessage to the parent)");
    const toParent = [];
    const fakeParent = { postMessage: m => toParent.push(m) };
    const dom = new JSDOM(CHAT_HTML, {
      runScripts: "dangerously", pretendToBeVisual: true,
      beforeParse(cw) { Object.defineProperty(cw, "parent", { value: fakeParent, configurable: true }); },
    });
    const cw = dom.window, cd = cw.document;
    assert(toParent.length === 1 && toParent[0].philoggChat.type === "getSnapshot", "on load it pulls through the parent");
    const snapshot = { type: "snapshot", available: true, features: ["sessions", "answers", "dock"], sessions: [], activeSessionId: null, session: null, running: false, theme: {} };
    cw.dispatchEvent(new cw.MessageEvent("message", { data: { philoggChat: snapshot }, source: {} }));
    assert(!cw.philoggChatView.snapshot, "a message from anything but the parent is ignored");
    cw.dispatchEvent(new cw.MessageEvent("message", { data: { philoggChat: snapshot }, source: fakeParent }));
    assert(cw.philoggChatView.snapshot && cd.getElementById("btnDock").dataset.state === "undock" && cd.getElementById("btnOnTop").style.display === "none", "docked: an undock button, no always-on-top");
    assert(cd.getElementById("chatWc").style.display === "none", "docked: no window controls");
    cd.getElementById("btnDock").click();
    assert(toParent[toParent.length - 1].philoggChat.type === "undock", "undock goes to the parent");
    dom.window.close();
  }
}
