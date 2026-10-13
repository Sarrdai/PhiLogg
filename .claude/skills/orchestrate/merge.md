# Parallel work on philogg.html and merging it back

Several implementers or package sessions may change `philogg.html` at the
same time, each on its own branch. Git merges the one big file line by
line like any other: changes in different places merge cleanly, changes
in the same place conflict, and those would conflict just the same if the
code were split into files. What must never happen is two agents editing
the same checkout — that's what the branch per agent is for.

## When to run in parallel

- Each brief names the areas it touches (functions, CSS blocks, test
  groups). Steps whose areas overlap in the shared core — `state` and its
  initialization, `render()`/`renderTree()`, persistence carriers of a
  filter-node field, the keyboard-shortcut table, `:root` design tokens —
  run one after another; everything else may run in parallel.
- Parallelism only pays off for independent steps. Steps that build on
  each other stay sequential, as do steps whose main work is in the
  shared core.
- Each parallel agent adds its own cold start and its own share of the
  five-hour window (`usage-budget.md`).

## Setup

- **Subagents:** `isolation: "worktree"` for every implementer that runs
  while another one also edits `philogg.html`. A worktree has no
  `tests/node_modules` (git-ignored); the brief tells the implementer to
  link it first:
  `ln -s <main checkout>/tests/node_modules tests/node_modules`.
  Worktree implementers commit on their worktree branch (`delegation.md`).
- **Package sessions:** each parallel package gets its own branch off the
  round's branch (`<round-branch>-<package>`), named in its start prompt.
- Every brief / start prompt says: insert new code at its topical place
  (next to the related function, in the matching `switch` case), not at
  the end of a section or file — two agents appending at the same spot
  conflict without any real overlap.

## Integrating (lead / orchestrator)

Merge one branch at a time into the round's branch (or the session
branch), in the order the steps finish:

```bash
git config merge.conflictStyle zdiff3   # conflicts also show the common base
git merge --no-ff <agent-or-package-branch>
```

After each merge, before the next one:

1. Conflicts resolved (below).
2. **Check what Git cannot see.** A clean merge can still be wrong: both
   sides added the same keyboard shortcut, `state` field name, CSS class,
   element id, function name (the later definition silently wins), or a
   test group with the same slug. `git diff HEAD^1 HEAD -- philogg.html`
   and grep for the names each side introduced.
3. `GROUP=<both sides' groups> npm test` (`finish` → "Merge current
   main", `philogg.html` row). Failure → fix it in the merge (small) or
   send it back to the step that broke it.

The one `SHARDS=8` run stays at the end of the round (`finish`).

## Resolving conflicts

| Conflict | Who resolves |
|---|---|
| A few hunks, both sides' intent clear from the briefs (typical: both inserted next to the same anchor) | **Lead** itself: usually keep both, in a sensible order |
| Many hunks, or both sides changed the same logic | **Merge agent** (below) |
| The intent of one side is unclear | Ask its author first: `SendMessage` to the implementer (if its context is still there) or `send_message` to the package session |
| Both sides' behavior can't coexist (a design question) | The user decides; never pick a side silently |

**Merge agent:** a fresh `implementer` (Sonnet; escalate per "Model
choice") started on the round's branch with the conflict in the working
tree. Its brief:

```
## Goal
Resolve the merge of <branch B> into <branch A> so both changes work.

## Side A / Side B
<per side: brief or start prompt (or its path), the report, its commits,
 its test groups>

## Conflicts
<git diff --name-only --diff-filter=U; conflict count per file>

## Rules
Keep both behaviors unless the briefs say otherwise; never drop a side's
test. Report anything that can't coexist instead of choosing.
Check the "Git cannot see" list in merge.md.

## Tests
GROUP=<A's groups>,<B's groups> npm test, all green.

## Report back
How each conflict was resolved, test result, open questions. Do not commit.
```

The lead reviews the resolution like any implementer step
(`verification.md`) and commits the merge.
