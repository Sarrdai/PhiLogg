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
