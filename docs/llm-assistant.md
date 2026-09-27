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

## Agent loop and sessions (`philogg.html`, "LLM assistant: agent loop and sessions")

Everything runs in the **main window**; the chat is a view (next section).
`llmAvailable()` (`window.philogg.llmChat` exists) gates the feature, so the
browser build has none of it — not even the boot-time `llmInit()`.

**A round** is one message of the person (`llmSend(text)`):
`llmBuildRequest` → system prompt + history + `llmToolSpecs()` (streaming,
`temperature`, `model` only when one is chosen) → the bridge
(`llmTransport()`, `window.philogg.llmChat`) → `llmAnswerAssembler` joins the
streamed text and tool-call deltas (by `index`; a non-streamed
`{type:"message"}` answer works the same) → tool calls run through
`runLlmTool`, each result goes back as a `tool` message and appears in the
tree immediately (`render()` after every batch of calls) → next model turn,
until the model answers with text (a result or a question — asking is not a
tool, it simply ends the round), the turn limit hits (Settings, default 12),
Stop, or an error. `<think>…</think>` blocks are dropped from answers.

Round states: `done`, `stopped`, `limit`, `error` (the message is kept on the
round). While a round streams, views get `{type:"stream", text}` notes —
cosmetic, the next snapshot supersedes them.

**Stop** (`llmStop`) cancels the request through `window.philogg.llmCancel`
and ends the loop at once (the pending request promise is raced against an
abort promise). Nothing is rolled back — Stop may mean "wrong direction" or
"I've seen enough", and the app can't tell which. `llmHealHistory` gives
every tool call left unanswered a "cancelled" tool message, as the
chat-completions format requires.

**Undo.** Every node a tool creates is recorded (`llmRoundCreated` →
`round.created`, and `llmCreatedNodeIds` for the tree marker). When the round
ends, `llmPushRoundBatch` pushes one `"batch"` of `"create"` actions — Ctrl+Z
takes back the whole round. **"Undo this round"** (`llmUndoRound(roundId,
force)`): if that batch is still on top of the undo stack it is simply
`undo()`; otherwise the round's remaining nodes (only the top-most ones —
nested ones go with their parent) are deleted as a new `"batch"` of
`"delete"` actions, itself undoable. If the person created filters below
them, it returns `{needsConfirm, foreign}` and deletes nothing until called
with `force`. Nothing left → `{reason: "nothing left"}`, and the round's
button is disabled (`undo: "none"` in the snapshot). Bookmarks/notes set by
`annotate` and view changes are not part of the undo step.

**Context budget.** Tool messages keep a one-line summary
(`llmToolSummary`, e.g. `create_filter → n42 "…", 318 match(es)`); tool
results of rounds older than the last `LLM_KEEP_FULL_ROUNDS` (2) are sent as
that summary. The system prompt (`LLM_SYSTEM_PROMPT`: concepts, pattern
syntax with examples, discover → ask when ambiguous → build → show, rules)
never changes, so LM Studio's prompt cache keeps working.

**Sessions** are stored in their own IndexedDB database (`philogg-llm`,
store `sessions`, one record per session: `{id, title, files, history,
rounds, version, …}`), never in the log session cache; the active one's id in
`localStorage` (`philogg-llm-active-session`). A session's title is its first
question.

**References.** `llmCaptureRefs` scans a round's answers and tool summaries
for ids (`n42`, `e1234`) that exist at that moment and stores what outlives
a restart: a node with its name and definition, an entry as its file's
session-cache key (`cacheKey`) plus ordinal — the scheme bookmarks already
use — and the app run (`LLM_RUN_ID`, new per page load). The files touched
become the session's reference files. `llmResolveRef` decides per snapshot:

| situation | entry | node |
|---|---|---|
| same run, node exists | link | link |
| same run, node deleted | link | greyed out (`gone` — ids are never reused within a run) |
| other run, reference file loaded | link (by ordinal) | text |
| reference file not loaded | text | text |

A snapshot also lists the session's reference files that aren't loaded
(`missingFiles`), shown as a hint in the chat. `llmRevealRef(roundId, token)`
activates the node or `jumpToEntry`s the entry.

Tests (GROUP 303) drive the loop with a scripted fake model
(`llmTransportOverride`) that streams its answers the way LM Studio does:
the reference scenario (message types → question → link → extraction under
the link → plot), compaction, Stop, limit, errors, undo per round, "undo this
round", and references across a simulated restart.
