---
name: orchestrate
description: PhiLogg's standard way of running a feature/fix session — the main (Opus) session scopes the task with the user, builds a concept mockup first for UI changes, then delegates implementation to Sonnet `implementer` subagents (directly or via a written plan), verifies their work with tests and real-app screenshots, steers corrections, and presents each finished round with screenshots. Use at the start of any session that will change `philogg.html`, the simulator, or the desktop wrapper, and whenever the user invokes /orchestrate.
---

# Orchestrate: lead session → mockup → delegate → verify → present

The main session is the **lead**: it owns scoping, decisions, verification
and communication with the user. Implementation is done by `implementer`
subagents (`.claude/agents/implementer.md`, runs on Sonnet). The lead
does not write feature code itself except for trivial one-line touch-ups
found during verification — anything bigger goes back to an implementer.

Talk to the user in their language (German); everything written to the
repo stays English (CLAUDE.md).

## Phase 1 — Scope the task

- Restate the goal in a few sentences, in the user's terms.
- For bugs: diagnose the root cause yourself first (CLAUDE.md
  "Diagnose before implementing") — the diagnosis goes into the brief.
- Read the relevant `PROJECT.md` / `docs/*.md` sections and code so the
  brief can name concrete functions, gotchas and test groups.
- Ask only questions whose answer changes what gets built. Anything with a
  sensible default: pick it, state it, move on.

## Phase 2 — Concept mockup (UI changes only)

Any change to what the user sees — new control, layout, popup, toolbar,
visual style — starts with a mockup, **and the lead stops there until the
user has decided**. Skip it for pure logic/bug fixes with no visual
change, or when the user already fixed the design in detail.

How to build it: see `mockup.md` in this folder (screenshot of today's
state, 2–3 interactive variants, pros/cons, one recommendation, published
as an Artifact).

After the user's decision, iterate the mockup if they asked for changes;
otherwise go on to phase 3 with the chosen variant as the spec.

## Phase 3 — Delegate

Pick by complexity:

| Task | Handover |
|---|---|
| Small, one area, clear spec (a fix, a control, a style tweak) | **Direct brief** in the Agent prompt |
| Several areas, new data/persistence fields, multi-step, or > ~1 h of work | **Written plan** first (`plan-template.md`), saved to the scratchpad, implementer gets the path |

Show the user a short summary of the plan only when it still contains an
open decision; otherwise proceed.

Spawning — see `delegation.md` for the brief template:

- `subagent_type: "implementer"`, `run_in_background: true` unless you
  have nothing else to do meanwhile.
- **One implementer at a time on `philogg.html`** (single 42k-line file —
  parallel edits conflict). Parallel agents only for disjoint files
  (e.g. `tools/log-sim/` vs. `desktop/src-tauri/`), each with
  `isolation: "worktree"` if they could touch shared files.
- Split big plans into steps and hand them out one at a time; verify each
  step before the next.
- Keep the agent's ID: corrections go to the **same** agent via
  `SendMessage` so it keeps its context; spawn a new one only when the
  context is spent or the task changes.

## Phase 4 — Verify (lead, every round)

Never forward an implementer's "done" unchecked. See `verification.md`:

1. Read the diff (`git diff`) against the brief and CLAUDE.md gotchas.
2. Full test suite, pass count and slowest groups noted; one `SHARDS=8`
   stress run before the final push.
3. Real-app screenshots of every changed view (simulator data), compared
   against the mockup / expected behavior; both themes if styling changed.
4. Docs/CHANGELOG/README updated as CLAUDE.md requires.

Anything off → concrete correction message to the same implementer
(what is wrong, where, expected vs. seen, attach the screenshot path),
then verify again. Loop until clean.

## Phase 5 — Present the round

Only after verification passed:

- Commit (Conventional Commit prefix, no Claude attribution — CLAUDE.md)
  and push to the session branch.
- Show the result **with screenshots** (`SendUserFile`, `display:
  "render"`, one caption each), or an Artifact with before/after when a
  comparison matters.
- Short summary: what changed, test pass count, deviations from the
  mockup and why, open points / suggested next step.

Then wait for the user's feedback; their feedback starts the next round
at phase 1–3 as needed.
