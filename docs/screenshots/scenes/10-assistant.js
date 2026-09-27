// The LLM assistant, docked: a scripted conversation (the reference
// scenario from docs/llm-assistant-plan.md) replayed through the real
// agent loop with a stand-in for the local model — the screenshot needs no
// LM Studio. The desktop bridge is stubbed so the (desktop-only) feature
// shows up in the browser; the docked panel loads desktop/chat.html.
window.philogg = { llmChat: () => Promise.reject(new Error("scripted")), llmCancel() {}, llmModels: async () => [], llmChatWindow() {}, llmViewNotify() {} };
localStorage.setItem("philogg-llm-enabled", "1"); // off by default
initLlmAssistantUi();
(async () => {
  const results = req => {
    const names = {}, out = {};
    req.messages.forEach(m => (m.tool_calls || []).forEach(tc => { names[tc.id] = tc.function.name; }));
    req.messages.filter(m => m.role === "tool").forEach(m => { (out[names[m.tool_call_id]] = out[names[m.tool_call_id]] || []).push(JSON.parse(m.content)); });
    return out;
  };
  const last = (r, n) => r[n][r[n].length - 1];
  const script = [
    () => ({ calls: [["get_overview", {}], ["find_message_types", { query: "position reached" }], ["find_message_types", { query: "temperature" }]] }),
    r => ({ calls: [["create_filter", { parentId: S.file, pattern: "Sensor T1 temperature=[*:float]" }]] }),
    r => ({ content: "I found 'Position reached axis=<#> …' (axes 1–4) and the T1 temperature readings (" + last(r, "create_filter").nodeId + "). Which axis do you mean?\n- 1\n- 2\n- 3\n- 4" }),
    r => ({ calls: [["create_filter", { parentId: S.file, pattern: "Position reached axis=2 " }]] }),
    r => ({ calls: [["create_link", { refId: last(r, "create_filter").nodeId, targetId: r.create_filter[0].nodeId, direction: "after" }]] }),
    r => ({ calls: [["create_filter", { parentId: last(r, "create_link").nodeId, pattern: "temperature=[*:float]" }]] }),
    r => ({ calls: [["show_view", { nodeId: last(r, "create_filter").nodeId, view: "plot", plot: { type: "line", x: "time", y: "1" } }]] }),
    r => ({ content: "Link " + last(r, "create_link").nodeId + " pairs every positioning of axis 2 with the next T1 reading (" + last(r, "create_link").pairs + " pairs). The plot in " + last(r, "show_view").nodeId + " shows the temperature after each one." }),
  ];
  llmTransportOverride = {
    chat(id, ep, req, onEvent) {
      const ans = script.shift()(results(req));
      if (ans.content) onEvent({ type: "chunk", data: { choices: [{ delta: { content: ans.content } }] } });
      (ans.calls || []).forEach(([name, args], i) => onEvent({ type: "chunk", data: { choices: [{ delta: { tool_calls: [{ index: i, id: "c" + script.length + i, function: { name, arguments: JSON.stringify(args) } }] } }] } }));
      return Promise.resolve();
    },
    cancel() {},
  };
  await llmSend("I'm interested in the temperature after every positioning.");
  await llmSend("Axis 2.");
  llmDock();
  llmDockFrame.src = "docs/../desktop/chat.html";
  await new Promise(res => llmDockFrame.addEventListener("load", res));
  await new Promise(res => setTimeout(res, 300));
})();
