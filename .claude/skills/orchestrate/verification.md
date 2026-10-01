# Verifying an implementer's round

The lead runs all of this itself — an implementer's own "tests pass" is
input, not proof.

## 1. Diff review

`git diff` (worktree agents: diff their branch). Check against the brief:
everything asked for is there, nothing outside scope changed, CLAUDE.md
gotchas respected (stopPropagation on popup openers, DOM identity,
immutable `node.value`, new node fields in every persistence carrier),
test group added with its `group(N);` marker and TEST PROVENANCE line, and
new or changed tests keep `tests/README.md`'s timing rules ("Extending this
suite", step 2: `waitFor` instead of fixed sleeps, "nothing happened"
checked right after the step, no wall-clock-dependent paths).

## 2. Tests

- `cd tests && npm test` — full suite, note the pass count, and look at the
  "Slowest groups" list above it: a new or changed group in it gets a look.
- Before the session's final push: `SHARDS=8 npm test` once (more shards
  than cores). A failure only there is a load-dependent test bug: fix it,
  don't re-run it away.
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

CHANGELOG.md entry (dated, newest first), the matching `docs/*.md`
section describes the new current state, README if user-visible,
PROJECT.md line count if it moved meaningfully.

## Outcome

- All clean → phase 5 (commit, present).
- Findings → one numbered correction message to the same implementer
  with the screenshot paths/test output, then repeat this checklist.
