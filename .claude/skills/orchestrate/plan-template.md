# Implementation plan template

Used for larger tasks (phase 3). Saved in the scratchpad as
`plan-<topic>.md`; the implementer gets the path and one step at a time.
Commit it to `docs/` only when the work spans several sessions.

```markdown
# Plan: <topic>

## Goal and decisions
<What the user wants; decisions taken (mockup variant + URL, texts,
 defaults); explicit non-goals>

## Current state
<How it works today: functions, data flow, relevant docs sections,
 gotchas that apply>

## Steps
### Step 1 — <name>
- Change: <what, where>
- Tests: <GROUP N: what to assert>
- Done when: <observable result, incl. what the screenshot must show>

### Step 2 — …

## Docs to update at the end
CHANGELOG.md entry, docs/<file>.md section, README feature list /
screenshots (docs/screenshots scenes), PROJECT.md line count.

## Risks
<Performance-sensitive paths, persistence carriers, DOM identity, …>
```
