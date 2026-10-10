# Verifying an implementer's round

The lead runs all of this itself — an implementer's own "tests pass" is
input, not proof.

## 1. Diff review

`git diff` (worktree agents: diff their branch). Check against the brief:
everything asked for is there, nothing outside scope changed, CLAUDE.md
gotchas respected (stopPropagation on popup openers, DOM identity,
immutable `node.value`, new node fields in every persistence carrier),
new test group added as its own `tests/groups/<slug>.js` file with its
`group("<slug>");` marker (never appended to the main test file), and
new or changed tests keep `tests/README.md`'s timing rules ("Extending this
suite", step 2: `waitFor` instead of fixed sleeps, "nothing happened"
checked right after the step, no wall-clock-dependent paths).

## 2. Tests

- Run the affected groups yourself, wider than the implementer's own:
  every group that exercises the changed functions or views
  (`grep -l "<function or selector>" tests/groups/*.js`), as
  `GROUP=a,b,c npm test`.
- A plan with several steps: after a step that changed code shared with
  other areas (renderers, the filter engine, persistence), one plain
  `npm test` before the next step. Otherwise no full run here.
- The session's one full run is `finish`'s `SHARDS=8 npm test` (more
  shards than cores, "Slowest groups" list). A failure there goes back to
  the same implementer as a correction; one only under load is a
  load-dependent test bug: fix it, don't re-run it away.
- Rust / Tauri changes: `cd desktop && npm run build`, plus
  `cargo test -p philogg-logparse` in `desktop/src-tauri/` if the native
  parser changed.
- Performance claims: measure in the real app (`docs/performance-testing.md`).

## 3. Screenshots

Always from simulator data, never hand-written logs (CLAUDE.md):

```bash
S=<scratchpad>
node tools/log-sim/cli.js --list                          # pick format/scenarios
node tools/log-sim/cli.js -n 800 --seed 7 [-f <fmt>] [-s <scenarios>] -o $S/sim/app.log
NODE_PATH="$(npm root -g)" node tools/log-sim/screenshot.js \
  --out $S/shot-<view>.png --theme dark --size 1440x900 \
  --eval "<js that opens the view / builds filters / clicks the control>" \
  $S/sim/*
```

- `--eval` recipes: `tools/log-sim/README.md`; reusable scene setup:
  `docs/screenshots/scenes/`. A setup the helper can't express → extend
  `screenshot.js`, not a private Playwright script.
- Look at every PNG (`Read` it). Compare with the mockup: layout, texts,
  states, alignment, overflow, empty/edge states.
- Styling changes: shoot `--theme dark` and `--theme light`.
- Interaction: shoot each relevant state (closed/open, 1 vs. many
  selected, …) via separate `--eval` runs.
- Changes to README-visible UI: regenerate the affected pictures with
  `docs/screenshots/generate.sh <name>` and review them too.

## 4. Docs

One `changelog.d/YYYY-MM-DD-<slug>.md` fragment (3–6 lines), the matching `docs/*.md`
section describes the new current state, README if user-visible,
PROJECT.md line count if it moved meaningfully.

## Outcome

- All clean → phase 5 (commit, present).
- Findings → one numbered correction message to the same implementer
  with the screenshot paths/test output, then repeat this checklist.
