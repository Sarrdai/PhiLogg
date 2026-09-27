# LLM assistant

A chat in which a **locally running LLM** (LM Studio, OpenAI-compatible API)
operates PhiLogg: it finds message types, creates filters, extraction and
link filters, shows tables and plots, and bookmarks/annotates entries. The
model never reads the raw log — it works through a small set of tools that
answer with summaries. Plan and phase history: `docs/llm-assistant-plan.md`
(German).

## Tool registry (`philogg.html`, "LLM assistant: tool registry")

`LLM_TOOLS` — `{ name, description, parameters (JSON Schema), run(args) }`,
handed to the model in the OpenAI `tools` shape by `llmToolSpecs()`.
`runLlmTool(name, args)` runs one call: `args` may be the model's raw JSON
string; it never throws and returns `{ result, text, error }` — `text` is
the JSON the model gets back, cut to `LLM_TOOL_BUDGET_CHARS` (6,000 chars ≈
1,500 tokens) by `llmFitBudget`, which halves the largest array (marking its
owner `truncated: true`) until the result fits.

| tool | returns |
|---|---|
| `get_overview` | files (count, time span, level counts), active node, current view, the whole tree (id, name, type, count, parent, depth) |
| `find_message_types(nodeId?, query?, limit)` | the node's messages grouped by shape (`normalizeMessagePattern`, as the Patterns tab), most frequent first: count, levels, first/last time, a typed extraction `pattern` (`patternFilterValue(…, true)`), and per placeholder a value distribution (≤ 10 distinct → value + count, else min/max or examples; `messagePatternValues` reads the values in placeholder order) |
| `create_filter(parentId, pattern, mode, invert)` | a `text` filter (substring, or extraction when the pattern has placeholders) or regex filter via `createFilterNode`: node id, match count, examples, for an extraction its columns and sample values — or an error text (invalid regex/pattern, inverted extraction, unknown parent) |
| `create_link(refId, targetId, direction, key?, maxDtMs?/minDtMs?)` | `createLinkNode` (N = 1, not exclusive): pairs, references, unpaired, Δt min/median/max, examples; `key` is a column name or wildcard pattern (`linkKey`), the Δt bounds become `linkDt` |
| `get_entries(nodeId, from, max ≤ 20)` | entries with id, time, level, message (first line, ≤ 200 chars) |
| `get_value_stats(nodeId, column)` | min/max/mean/p10/median/p90 of one extraction column (own or inherited pattern, `llmExtractRows`); a non-numeric column gets its value distribution |
| `show_view(nodeId, view, plot?)` | activates the node and opens log/filtered/table/plot/patterns; `plot` = `{type, x, y}` with `time`/`index`/`dt` or a column number/name, stored through `sanitizePlotConfig` |
| `annotate(entryIds, note?, bookmark?)` | sets bookmarks (never toggles one off) and notes (an existing note is kept, the finding appended) |

Entries are referenced by their id (`e1234`); a link pair by its first real
entry. Nodes the assistant created are listed in `llmCreatedNodeIds` — an
in-memory set, not a node field (a field would have to go through every
persistence carrier for purely cosmetic information) — and `renderNode`
marks them with a small ✦.

The registry exists in the browser build too, but nothing calls it there.

## Rust bridge (`desktop/src-tauri/llm`, `commands.rs`)

The HTTP side lives in the Tauri-free workspace crate `philogg-llm`
(`cargo test -p philogg-llm` runs without the webview toolchain):

- **Loopback only.** `parse_base_url` accepts `http://localhost`,
  `http://127.0.0.1` and `http://[::1]` (optional port and path) and nothing
  else — no https, no other host, no user info. `localhost` is connected as
  127.0.0.1, then ::1, without a DNS lookup; a redirect is an error, not
  followed; there is no proxy. This is why it is a small hand-written
  HTTP/1.1 client over `TcpStream` instead of an HTTP crate: the guarantee
  is a property of ~200 lines of code, not of a library's settings.
- **Streaming.** `stream_chat` POSTs `{base}/chat/completions` and reads the
  body (chunked, Content-Length or until close) line by line through
  `SseParser`; every event's data goes to the callback until `[DONE]`. A
  server answering with plain JSON produces one `Message` instead. A stream
  that closes without `[DONE]` or a `finish_reason` is an error ("the
  connection closed before the answer was complete").
- **Cancel.** The socket's read timeout is 200 ms; every wake-up checks the
  request's cancel flag, so Stop lands even while the model is still
  processing the prompt and nothing streams yet. Dropping the connection
  also stops LM Studio's generation. Idle limit: 10 minutes without a byte.
- `list_models` — `GET {base}/models` → `data[].id`.
- HTTP errors come back as `HTTP <status>: <error.message>`, an unreachable
  server as "cannot reach … — is LM Studio's server running?".

Tauri commands (`commands.rs`): `llm_models(baseUrl)`,
`llm_chat(requestId, baseUrl, request, onEvent)` — each chunk reaches the
page as `{type: "chunk", data}` (`{type: "message", data}` for a
non-streamed answer) over an IPC channel, and the page assembles text and
tool-call deltas itself — and `llm_cancel(requestId)` (flags in
`AppState.llm_requests`). `inject.js` exposes them as
`window.philogg.llmModels/llmChat/llmCancel`; `llmChat` is what the page
feature-detects the whole assistant on.

Tests: `cargo test -p philogg-llm` — URL checks, the SSE parser (comments,
multi-line data, CRLF, unterminated last event), and a local mock server
that streams LM-Studio-shaped chunks (text deltas, a tool-call delta split
across two HTTP chunks, `[DONE]`), answers plain JSON, drops the connection
mid-stream, returns HTTP errors/redirects, stays silent until cancelled.
