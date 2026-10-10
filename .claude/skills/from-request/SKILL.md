---
name: from-request
description: Entry point for a new idea, feature or bug the user describes in the prompt — classifies it, finds the root cause first for bugs, clarifies features in one round of questions, decides between doing it now and parking it in the backlog, then runs it through orchestrate or package-sessions. Use when the user brings a new request that is neither a backlog number nor usability-test results ("mir ist aufgefallen…", "ich hätte gern…", "Bug: …"), and whenever the user invokes /from-request.
---

# From a new request to an implementation

This session becomes the orchestrator: before step 1, check the model
(`orchestrate` → "Model choice" → "Not on Opus?") and wait for the
user's confirmation if it is not Opus.

## 1. Classify

| Kind | Sign | Next |
|---|---|---|
| **Bug** | something that worked, or should work, does not | step 2a |
| **Feature / change** | new or different behavior | step 2b |
| **Idea for later** | "irgendwann", "notier dir", no urgency | step 2c |

Unsure between bug and intended behavior: check the docs (`docs/*.md`,
`PROJECT.md`) for how it is meant to work and ask with that in hand.

## 2a. Bug: diagnose first

- Reproduce it: with simulator data (CLAUDE.md, never hand-written log
  lines), a failing `GROUP` test, or a screenshot run. Not reproducible →
  ask for the missing detail (mode, file, steps) instead of guessing.
- Find the root cause (CLAUDE.md "Diagnose before implementing"), then
  tell the user cause and planned fix in a few sentences. A fix with no
  design decision goes ahead without waiting; one that changes visible
  behavior waits for the go.

## 2b. Feature: clarify once

- Restate the goal in the user's terms, check `FEATURE_BACKLOG.md` for an
  existing entry (then continue with `from-backlog`) and the docs for what
  exists today.
- Ask everything open in one message with your recommended answers; pick
  defaults for the rest. UI changes then go to the mockup (`orchestrate`,
  phase 2).

## 2c. Idea for later: park it

Add a `FEATURE_BACKLOG.md` row (`LAST_ID` rule, CLAUDE.md): `Vorschlag`,
`Begründung` with the user's reason and any open question, `Aufwand`, and
a `Prio` the user names or you propose. Commit it (`docs:`) and stop.

## 3. Implement

- One coherent change: follow `orchestrate` (for bugs from phase 3, the
  diagnosis is done).
- A request that falls into several independent parts: decide per
  package-sessions → "One session or a round".
- Bugs: write the regression test first and see it fail on the unfixed
  code, then fix until it passes.
