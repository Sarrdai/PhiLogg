# Session board: every session reports its status

One private Artifact shows all PhiLogg cloud sessions at a glance:
orchestrators with their packages as a tree, continuations, who waits for
the user, what is paused, and the plan usage.

**Board:** https://claude.ai/artifact/53kyphTY6TuPpFtQypVVjF

Every session that runs under `orchestrate` or `package-sessions` keeps
its own entry current with the `ArtifactData` tool (deferred: load it with
ToolSearch `select:ArtifactData`). A failed write never blocks the work:
try once, then carry on.

## Entry

Collection `sessions`, document ID = your own session ID (`get_session`
without `session_id` → `ccr.id`). Timestamps UTC ISO (`date -u +%FT%TZ`).

| Field | Content |
|---|---|
| `title` | Round and package, as in the session title |
| `kind` | `orchestrator`, `package`, `subagent` or `single` (a session without orchestrator) |
| `status` | see below |
| `note` | One line: the current step, or exactly what you wait for |
| `parent` | Orchestrator's session ID (packages and subagents) |
| `continues` | Session ID this one takes over from (handover, pause) |
| `branch`, `model` | Working branch; `opus` / `sonnet` |
| `resumes_at` | `paused` only: when work continues (`five_hour.resetsAt`) |
| `started_at`, `updated_at` | Start; time of this write |

| `status` | When |
|---|---|
| `running` | Working |
| `waiting_user` | Ending a turn with a question or mockup decision for the user |
| `waiting` | Orchestrator idle until packages report |
| `paused` | Paused before the usage limit (`usage-budget.md`) |
| `blocked` | Cannot go on without something outside the session |
| `done` | Finished and reported |

## When to write

- **Start:** `set` the full entry; keep the `version` from the result.
- **Each status change** (and a changed `note` worth seeing from outside,
  such as a new plan step): `update` with `status`, `note`,
  `updated_at` and `if_version` = the last version you got. Version
  unknown or refused: `get` the entry, then update.
- Not more often: each call lands in your context.
- **Orchestrator** also writes a `subagent` entry for each subagent
  package (`doc_id` `agent-<round>-<slug>`, `parent` = its own ID).
- **Every session** (orchestrator, package, lead) writes `meta/usage`
  after each of its budget checks (`usage-budget.md`): `update` with
  `five_hour` and `seven_day`, each `{utilization, resets_at}` (UTC ISO),
  plus `read_at` (the reading's event time) and `by` (its title), pinned
  with `if_version`. Version unknown or refused: `get` it, then write only
  if your `read_at` is newer than the stored one.
- **A session that takes over** (handover, continuation after a pause)
  sets `continues` to the predecessor's ID. The predecessor's entry stays
  as it is: the board shows it inside its successor's card, and packages
  of a replaced orchestrator appear under the new one.
