---
name: from-backlog
description: Entry point for implementing one or more FEATURE_BACKLOG.md entries by their Nr — reads the entry, checks it is still current, settles its open questions with the user, runs the implementation through orchestrate (or package-sessions for several entries) and retires the entry when done. Use when the user names a backlog number ("#87", "Backlog 45 umsetzen"), asks to implement backlog items, and whenever the user invokes /from-backlog.
---

# From a backlog entry to an implementation

This session becomes the orchestrator: before step 1, check the model
(`orchestrate` → "Model choice" → "Not on Opus?") and wait for the
user's confirmation if it is not Opus.

The argument is one or more `Nr`s from `FEATURE_BACKLOG.md` (e.g.
`/from-backlog 87` or `/from-backlog 45 86`).

## 1. Read and re-check the entry

- Find the row by its `Nr`. Unknown or `verworfen`: say so and stop, unless
  the user confirms they want a rejected item after all.
- Backlog entries are raw ideas and can be stale. Before planning, check
  against the code and `changelog.d/` whether it is already done in part,
  whether its premises still hold, and which `docs/*.md` section covers
  the area. Report what you found in one or two sentences.

## 2. Scope it with the user

- Restate the goal in behavior terms and list the open questions the
  entry names (many rows say "Open question: …") plus any you found.
- Pick sensible defaults yourself and state them; ask only what changes
  what gets built — all questions in one message, with your recommendation.
- `Aufwand` groß or several areas: propose splitting into steps (a written
  plan, `orchestrate` → phase 3) and say which step this session does.

## 3. Implement

- One entry: follow `orchestrate` from phase 2 on (mockup first for UI
  changes, then delegate, verify, present).
- Several independent entries: decide per package-sessions → "One session
  or a round". In a round, every entry is its own package; the start
  prompt carries the entry's `Nr`, its text and the answers from step 2.

## 4. Retire the entry

In the same branch as the implementation, before `finish`:

- Remove the row from `FEATURE_BACKLOG.md`. Its `Nr` is retired, `LAST_ID`
  does not change (CLAUDE.md).
- A part that stays open (a later step, a follow-up found on the way)
  becomes a **new** entry with the next `LAST_ID`, naming the old `Nr` it
  came from; the old row is not kept as a placeholder.
- Name the `Nr` in the `changelog.d/` fragment and in the commit message
  (`feat: time zone per format (backlog #86)`).
