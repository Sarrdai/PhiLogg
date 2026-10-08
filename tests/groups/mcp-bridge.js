// GROUP mcp-bridge — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP mcp-bridge — MCP server in the desktop app, page side (backlog #119):
   window.philoggMcpCall (queue behind the assistant's round, one undo step
   per call, ✦ marking, answers through philogg.mcpToolResult) and
   Settings → Assistant → "External agents (MCP)" (toggle, port, token,
   Claude Code command, status line). The browser build shows none of it.
   The Rust half is covered by `cargo test -p philogg-mcp`. Data: log simulator. */
group("mcp-bridge");

await withApp(async (w, d, T) => {
  section("mcp-bridge a. Browser build: no MCP group, a stray call answers nothing harmful");
  assert(!w.mcpAvailable(), "no window.philogg.mcpConfigure → not available");
  assert(!isVisible(d.getElementById("settingsMcpCard"), w) && !isVisible(d.getElementById("settingsMcpGroupTitle"), w), "no MCP group");
  assert(!isVisible(d.getElementById("settingsLlmGroupTitle"), w), "no 'Local model' title either");
  assert(typeof w.philoggMcpCall === "function", "the bridge function exists in every build");
  w.philoggMcpCall("b1", "get_overview", {});
  assert(true, "a call without a bridge does not throw");
});

await withApp(async (w, d, T) => {
  section("mcp-bridge b. Desktop build: group, toggle, port, token, command");
  const stub = w.philogg;
  w.openSettingsDialog();
  assert(isVisible(d.getElementById("settingsMcpCard"), w) && isVisible(d.getElementById("settingsMcpGroupTitle"), w), "MCP group shown");
  assert(isVisible(d.getElementById("settingsLlmGroupTitle"), w) && d.getElementById("settingsLlmGroupTitle").textContent === "Local model", "'Local model' title above the existing card");
  assert(d.getElementById("settingsMcpGroupTitle").textContent === "External agents (MCP)", "group title text");
  assert(!stub.calls.some(c => c[0] === "mcpConfigure"), "off by default: the server is not configured at boot");
  assert(d.getElementById("settingsMcpStatusText").textContent === "Off", "status Off");
  assert(d.getElementById("settingsMcpPort").value === "7337", "default port 7337");

  d.getElementById("settingsMcpEnabled").click();
  assert(await waitFor(() => stub.calls.some(c => c[0] === "mcpConfigure")), "enabling configures the server");
  let cfg = stub.calls.filter(c => c[0] === "mcpConfigure").pop()[1];
  assert(cfg.enabled === true && cfg.port === 7337 && /^[0-9a-f]{64}$/.test(cfg.token), "enabled, port 7337, 64-hex token");
  assert(cfg.tools.map(t => t.name).join() === w.llmToolSpecs().map(s => s.function.name).join(), "tools = the assistant's tool registry");
  assert(cfg.tools[0].inputSchema && cfg.tools[0].description, "tools carry description and inputSchema");
  assert(w.localStorage.getItem("philogg-mcp-enabled") === "1" && w.localStorage.getItem("philogg-mcp-token") === cfg.token, "stored");
  assert(await waitFor(() => d.getElementById("settingsMcpStatusText").textContent === "Listening on 127.0.0.1:7337 · no calls yet"), "status: listening, no calls");

  const tokEl = d.getElementById("settingsMcpToken");
  const cmdEl = d.getElementById("settingsMcpCommand");
  assert(tokEl.textContent === cfg.token.slice(0, 4) + "•".repeat(20), "token masked: first 4 chars + bullets");
  assert(cmdEl.textContent === 'claude mcp add --transport http philogg http://127.0.0.1:7337/mcp --header "Authorization: Bearer ' + tokEl.textContent + '"', "command with port and masked token");
  assert(!cmdEl.textContent.includes(cfg.token), "the real token is not in the command text");
  d.getElementById("settingsMcpTokenShow").click();
  assert(tokEl.textContent === cfg.token && cmdEl.textContent.includes(cfg.token), "Show reveals the token (field and command)");
  d.getElementById("settingsMcpTokenShow").click();
  assert(tokEl.textContent.includes("•"), "Hide masks it again");

  let copied = null;
  w.copyTextToClipboard = t => { copied = t; };
  d.getElementById("settingsMcpCopy").click();
  assert(copied === 'claude mcp add --transport http philogg http://127.0.0.1:7337/mcp --header "Authorization: Bearer ' + cfg.token + '"', "Copy puts the real token into the clipboard");
  assert(d.getElementById("settingsMcpToast").textContent === "Copied", "…and says so");

  const n0 = stub.calls.filter(c => c[0] === "mcpConfigure").length;
  d.getElementById("settingsMcpTokenRegen").click();
  assert(await waitFor(() => stub.calls.filter(c => c[0] === "mcpConfigure").length === n0 + 1), "Regenerate reconfigures the server");
  const cfg2 = stub.calls.filter(c => c[0] === "mcpConfigure").pop()[1];
  assert(/^[0-9a-f]{64}$/.test(cfg2.token) && cfg2.token !== cfg.token && cfg2.enabled, "…with a new token, no confirmation");

  const port = d.getElementById("settingsMcpPort");
  port.value = "8123";
  port.dispatchEvent(new w.Event("change"));
  assert(await waitFor(() => stub.calls.filter(c => c[0] === "mcpConfigure").length === n0 + 2), "a port change reconfigures");
  const cfg3 = stub.calls.filter(c => c[0] === "mcpConfigure").pop()[1];
  assert(cfg3.port === 8123 && cfg3.token === cfg2.token, "…with the new port, same token");
  assert(cmdEl.textContent.includes("127.0.0.1:8123/mcp") && d.getElementById("settingsMcpUrl").textContent === "http://127.0.0.1:8123/mcp", "command and URL follow the port");
  port.value = "80";
  port.dispatchEvent(new w.Event("change"));
  assert(port.value === "1024" && w.mcpPort() === 1024, "port clamped to 1024..65535");

  d.getElementById("settingsMcpEnabled").click();
  assert(await waitFor(() => stub.calls.filter(c => c[0] === "mcpConfigure").pop()[1].enabled === false), "switching off configures enabled: false");
  assert(d.getElementById("settingsMcpStatusText").textContent === "Off", "status Off again");

  // Status refresh: polled while the dialog is open and the server is on.
  stub.mcpState = { listening: true, port: 1024, calls: 12, lastCallAt: new Date(2026, 9, 8, 14, 32, 7).getTime(), lastClient: "claude-code", error: null };
  d.getElementById("settingsMcpEnabled").click();
  assert(await waitFor(() => d.getElementById("settingsMcpStatusText").textContent.includes("12 calls"), 3000), "status shows Rust's numbers");
  assert(d.getElementById("settingsMcpStatusText").textContent === "Listening on 127.0.0.1:1024 · 12 calls · last 14:32:07 from claude-code", "full status line, got " + d.getElementById("settingsMcpStatusText").textContent);
  w.closeSettingsDialog();
  const polls = stub.calls.filter(c => c[0] === "mcpStatus").length;
  await new Promise(r => setTimeout(r, 1300));
  assert(stub.calls.filter(c => c[0] === "mcpStatus").length === polls, "no polling while the dialog is closed");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("mcp-bridge c. Boot with MCP on: the server is configured again; no assistant needed");
  const stub = w.philogg;
  const c = stub.calls.find(x => x[0] === "mcpConfigure");
  assert(c && c[1].enabled && c[1].port === 9001 && c[1].token === "ab".repeat(32), "stored config sent at boot");
  assert(isVisible(d.getElementById("settingsMcpCard"), w), "group shown with the assistant switched off");
}, {
  philogg: llmDesktopStub(),
  beforeParse: win => { win.localStorage.setItem("philogg-mcp-enabled", "1"); win.localStorage.setItem("philogg-mcp-port", "9001"); win.localStorage.setItem("philogg-mcp-token", "ab".repeat(32)); },
});

await withApp(async (w, d, T) => {
  section("mcp-bridge d. Status line texts");
  const v = w.mcpStatusView;
  assert(v(false, null, 0).text === "Off", "off");
  assert(v(true, { listening: true, port: 7337, calls: 0 }, 0).text === "Listening on 127.0.0.1:7337 · no calls yet" && v(true, { listening: true, port: 7337, calls: 0 }, 0).kind === "ok", "listening, no calls (green)");
  const t = new Date(2026, 9, 8, 9, 5, 3).getTime();
  assert(v(true, { listening: true, port: 7337, calls: 12, lastCallAt: t, lastClient: "claude-code" }, 0).text === "Listening on 127.0.0.1:7337 · 12 calls · last 09:05:03 from claude-code", "calls + client");
  assert(v(true, { listening: true, port: 7337, calls: 1, lastCallAt: t, lastClient: null }, 0).text === "Listening on 127.0.0.1:7337 · 1 call · last 09:05:03", "1 call, client unknown: no 'from'");
  const q = v(true, { listening: true, port: 7337, calls: 3, lastCallAt: t, lastClient: "x" }, 2);
  assert(q.text.endsWith(" · 2 calls wait for the assistant's round") && q.kind === "wait", "queued calls (amber)");
  assert(v(true, { listening: true, port: 7337, calls: 3, lastCallAt: t, lastClient: "x" }, 1).text.endsWith(" · 1 call waits for the assistant's round"), "singular");
  const e = v(true, { listening: false, port: null, error: "Port 7337 is in use." }, 0);
  assert(e.text === "Port 7337 is in use. Pick another port." && e.kind === "err", "port in use (danger)");

  // End to end: the error reaches the DOM and the danger class.
  w.philogg.mcpConfigure = () => Promise.resolve({ listening: false, port: null, calls: 0, lastCallAt: null, lastClient: null, error: "Port 7337 is in use." });
  w.openSettingsDialog();
  d.getElementById("settingsMcpEnabled").click();
  assert(await waitFor(() => d.getElementById("settingsMcpStatusText").textContent === "Port 7337 is in use. Pick another port."), "error text shown");
  assert(d.getElementById("settingsMcpStatus").classList.contains("err") && d.getElementById("settingsMcpDot").classList.contains("err"), "…in the danger style");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("mcp-bridge e. philoggMcpCall: result, ✦ marking, one undo step, errors");
  const f = await llmSimFile(w, ["motion"], 500, 3);
  T.resetUndoRedo();
  const res = () => w.philogg.calls.filter(c => c[0] === "mcpToolResult");
  w.philoggMcpCall("m1", "create_filter", { parentId: f.id, pattern: "Move requested" });
  assert(res().length === 1 && res()[0][1] === "m1" && res()[0][3] === false, "answered once, not an error");
  const out = JSON.parse(res()[0][2]);
  assert(out.nodeId && T.state.nodes[out.nodeId], "the node exists, result text is the tool's JSON");
  assert(T.llmCreatedNodeIds.has(out.nodeId), "it carries the ✦ marking");
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "create" && T.undoStack[0].nodeId === out.nodeId && T.undoStack[0].label === "MCP: create_filter", "exactly one undo step, labelled");
  w.undo();
  assert(!T.state.nodes[out.nodeId], "undo removes the node");

  T.resetUndoRedo();
  w.philoggMcpCall("m2", "no_such_tool", {});
  assert(res().length === 2 && res()[1][1] === "m2" && res()[1][3] === true && res()[1][2].includes("Unknown tool"), "unknown tool → isError");
  assert(T.undoStack.length === 0, "…and no undo step");
  w.philoggMcpCall("m3", "create_filter", { parentId: "nope", pattern: "x" });
  assert(res()[2][1] === "m3" && res()[2][3] === true, "a failing tool call → isError");
  assert(T.undoStack.length === 0, "…no undo step either");

  // Several nodes in one call → one batch (create_filter with several patterns, if offered; else skipped)
  const spec = w.llmToolSpecs().map(s => s.function).find(fn => fn.parameters && fn.parameters.properties && fn.parameters.properties.patterns);
  if (spec) {
    w.philoggMcpCall("m4", spec.name, { parentId: f.id, patterns: ["Move requested", "Position reached"] });
    assert(res()[3][1] === "m4", "multi-node tool answered");
  }
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("mcp-bridge f. A call waits while the assistant's round runs");
  const f = await llmSimFile(w, ["motion"], 500, 3);
  T.resetUndoRedo();
  const res = () => w.philogg.calls.filter(c => c[0] === "mcpToolResult");
  const fake = llmFakeModel(["hang"]);
  T.llmTransportOverride = fake;
  const p = w.llmSend("Zeig mir etwas");
  assert(await waitFor(() => fake.pending) && T.llm.running, "a round is running");
  w.philoggMcpCall("q1", "create_filter", { parentId: f.id, pattern: "Move requested" });
  w.philoggMcpCall("q2", "create_filter", { parentId: f.id, pattern: "Position reached" });
  assert(res().length === 0, "no result yet");
  assert(Object.keys(T.state.nodes).filter(id => T.llmCreatedNodeIds.has(id)).length === 0, "nothing created yet");
  const wait = w.mcpStatusView(true, { listening: true, port: 7337, calls: 2, lastCallAt: 1, lastClient: null }, 2);
  assert(wait.kind === "wait", "(status view would show the queue)");
  w.llmStop();
  await p;
  assert(await waitFor(() => res().length === 2), "after the round ends both results arrive");
  assert(res()[0][1] === "q1" && res()[1][1] === "q2" && !res()[0][3] && !res()[1][3], "in FIFO order, no errors");
  assert(T.undoStack.length === 2 && T.undoStack.every(a => a.label && a.label.startsWith("MCP: ")), "one undo step per call");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });
