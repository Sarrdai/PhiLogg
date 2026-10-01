// GROUP 313 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 313 — Assistant chat: context window bar (person-requested). The
   last request's token usage (LM Studio's final stream chunk with
   stream_options.include_usage, empty `choices`) against the model's loaded
   context length from LM Studio's native /api/v0/models
   (window.philogg.llmModelDetails, fetched once per round): a progress bar
   above the input with a "used / limit (%)" label, warn/full colors, and
   the details (prompt/answer tokens, context length, model) in the
   tooltip. A server without that API → used tokens only, no bar. */
group(313);
await withApp(async (w, d, T) => {
  section("313a. Usage + loaded context length → the chat's context bar");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["motion"], entries: 300, seed: 13 });
  await w.addFile(file.name, file.text, () => {});
  const chat = openChatView(w, T);
  const { cd, cw } = chat;
  assert(await waitFor(() => cw.philoggChatView.snapshot), "the view pulls a snapshot");
  const box = cd.getElementById("chatContext");
  assert(box.classList.contains("hidden"), "no request yet → no context bar");

  const fake = llmFakeModel([
    { calls: [["get_overview", {}]], usage: { prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020 }, model: "qwen2.5-7b-instruct" },
    { content: "Fertig.", usage: { prompt_tokens: 6000, completion_tokens: 600, total_tokens: 6600 }, model: "qwen2.5-7b-instruct" },
  ]);
  const detailCalls = [];
  fake.modelDetails = ep => (detailCalls.push(ep), Promise.resolve({ object: "list", data: [
    { id: "llama-3.2-3b", state: "not-loaded", max_context_length: 131072 },
    { id: "qwen2.5-7b-instruct", state: "loaded", max_context_length: 32768, loaded_context_length: 8192 },
  ] }));
  T.llmTransportOverride = fake;
  await w.llmSend("Was steht im Log?");
  await T.llm.contextFetch;
  assert(fake.requests.every(r => r.stream_options && r.stream_options.include_usage === true), "every request asks for the usage chunk");
  const ctx = T.llm.sessions[0].context;
  assert(ctx.used === 6600 && ctx.prompt === 6000 && ctx.completion === 600 && ctx.model === "qwen2.5-7b-instruct", "the LAST turn's usage is the fill, got " + JSON.stringify(ctx));
  assert(ctx.limit === 8192 && ctx.limitKind === "loaded", "limit: the loaded context length, not the model maximum");
  assert(detailCalls.length === 1 && detailCalls[0] === "http://localhost:1234/v1", "model details fetched once per round, from the configured endpoint");

  assert(await waitFor(() => !box.classList.contains("hidden") && cd.getElementById("chatContextLabel").textContent === "6.6k / 8.2k (81%)"),
    "bar shown with used / limit (%), got " + cd.getElementById("chatContextLabel").textContent);
  assert(Math.abs(parseFloat(cd.getElementById("chatContextFill").style.width) - 6600 / 8192 * 100) < 0.01, "fill width is the used share");
  assert(box.classList.contains("warn") && !box.classList.contains("full"), "≥ 80% → warn color");
  assert(box.title.includes("prompt (system, tools, history): 6,000") && box.title.includes("answer: 600")
    && box.title.includes("Context length: 8,192 (loaded)") && box.title.includes("Model: qwen2.5-7b-instruct"), "tooltip details: " + box.title);

  section("313b. A server without LM Studio's native API → used tokens only");
  T.llmTransportOverride = Object.assign(llmFakeModel([{ content: "ok", usage: { prompt_tokens: 1200, completion_tokens: 3 }, model: "other-model" }]),
    { modelDetails: () => Promise.reject(new Error("HTTP 404: Unexpected endpoint or method.")) });
  await w.llmSend("Und?");
  await T.llm.contextFetch;
  const c2 = T.llm.sessions[0].context;
  assert(c2.used === 1203 && c2.limit === null && c2.model === "other-model", "total from prompt + completion, no limit carried over from another model");
  assert(await waitFor(() => cd.getElementById("chatContextLabel").textContent === "1.2k tokens"), "label: used tokens only");
  assert(cd.getElementById("chatContextBar").style.display === "none" && box.title.includes("Context length: unknown"), "no bar, tooltip says the length is unknown");
  chat.close();

  section("313c. Picking the limit from /api/v0/models");
  const pick = (details, model) => JSON.stringify(w.llmContextLimitFrom(details, model));
  const list = { data: [{ id: "a", state: "not-loaded", max_context_length: 4096 }, { id: "b", state: "loaded", max_context_length: 32768, loaded_context_length: 16384 }] };
  assert(pick(list, "") === '{"limit":16384,"limitKind":"loaded"}', "no model chosen → the loaded one");
  assert(pick(list, "a") === '{"limit":4096,"limitKind":"max"}', "no loaded length → the model maximum, marked as such");
  assert(pick(list, "zzz") === "null" && pick(null, "a") === "null", "unknown model / no answer → null");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });
