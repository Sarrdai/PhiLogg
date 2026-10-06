---
name: from-usability-test
description: Entry point from usability-test results to implementation — collects the findings of one or more usability reports, sorts each into fix now, backlog, device check or question, groups the fixes into packages, agrees the round with the user and hands it to a fresh orchestrator session. Use after a usability test (or several) when the findings should be worked off, when the user asks to turn test results into a round, and whenever the user invokes /from-usability-test.
---

# From usability test to a round

Runs in the session that holds the test results: the test session itself,
or a session the user gives the reports to (files or pasted text — another
session's scratchpad is not readable). It ends by starting an orchestrator
session; it implements nothing itself.

## 1. Collect the findings

- Take the "Findings, most severe first" section of every report
  (`usability-test` skill, step 5). Several modes (desktop, tablet, phone)
  often report the same problem: merge those into one finding and keep
  every mode it shows up in.
- Check each finding against the current `main` before planning it: a
  later round may already have fixed it (`changelog.d/`, a quick look at
  the code). Drop what is fixed and say so.

## 2. Sort each finding

| Bucket | When | Goes to |
|---|---|---|
| **Fix now** | bug, blocked workflow, friction with a clear fix | a package of this round |
| **Backlog** | idea, larger feature, unclear value | `FEATURE_BACKLOG.md` entry (`LAST_ID` rule, CLAUDE.md) |
| **Device check** | only a real device or desktop build can tell | `docs/device-test-checklist.md` |
| **Question** | needs the user's decision before it can be sorted | the one question message in step 4 |

## 3. Cut packages

- One package = one coherent area that one session finishes in roughly
  an hour or two (e.g. "phone undo", "facets layout"). UI changes and
  pure bug fixes go into separate packages: a UI package starts with a
  mockup and waits for the user, a bug package does not.
- Name them `<Round letter><n> – <topic>` (A1, A2, …; next free letter).
- For bugs, write down what you already know (repro steps, suspected
  function, test group): it goes into the package's start prompt.
- One package or two small ones: skip the orchestrator, run them here or
  in one new session with `orchestrate` (package-sessions → "One session
  or a round").

## 4. Agree the round with the user

One message, in the user's language: the package list (goal, findings it
covers, UI or bug), the backlog and device-check items, and all open
questions at once with your recommended answer. Wait for the go.

## 5. Hand over to the orchestrator

- Write the backlog entries and device checks on the round's branch (a
  `docs:` commit) so they are not lost if the round changes course.
- Start the orchestrator with `create_session` (Sonnet, see `orchestrate`
  → "Model choice"; branch = the round's branch, title `Orchestrator
  Runde <X>`). Start prompt: the agreed
  package list with each package's findings and known diagnosis, the
  user's answers, the branch, and "Follow the package-sessions skill".
  A fresh session is cheaper than continuing in the test session: the test
  run's screenshots and logs stay behind.
- Tell the user the orchestrator's title; this session's job ends here.
