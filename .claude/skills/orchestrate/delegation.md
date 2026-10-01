# Briefing an implementer

The implementer starts cold: it knows only CLAUDE.md, its agent
definition, and what you write. Everything you already found out goes in
the brief — it must not re-derive it.

## Brief template (Agent prompt)

```
## Goal
<1–3 sentences: what the user gets, in behavior terms>

## Spec
<Chosen mockup variant + its artifact URL, or the plan path:
 "Follow the plan in <scratchpad>/plan-<topic>.md, step N only.">
<Exact texts, sizes, states, edge cases the user decided>

## Where
<Functions / CSS selectors / line ranges in philogg.html you already
 located; relevant PROJECT.md / docs/*.md sections; gotchas that apply
 (e.g. new filter-node field → all persistence carriers)>

## Root cause (bugs only)
<Your diagnosis — fix that, not the symptom>

## Tests
<Which GROUP to extend or add, what to assert>

## Out of scope
<What not to touch / not to "improve" along the way>

## Progress
Append one line per milestone to <scratchpad>/progress-<topic>.md
(time, what is done, what is next or what blocks).

## Report back
Files changed, test group(s) + result, anything you deviated from or
could not do, open questions. Do not commit.
```

## Rules

- One brief = one coherent step. A second step is a new message to the
  same agent after verification.
- Say what is decided and what the agent may decide itself.
- The lead commits after verification; implementers leave changes
  uncommitted in the working tree (worktree agents: they commit in their
  worktree branch, the lead merges).

## Correction messages (SendMessage to the same agent)

Concrete, not "doesn't look right":

```
Round 2 corrections:
1. <what> — seen: <screenshot path / test output>, expected: <…>
2. …
Keep everything else as is. Report back as before.
```
