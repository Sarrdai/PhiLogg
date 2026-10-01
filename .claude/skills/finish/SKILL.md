---
name: finish
description: PhiLogg's end-of-session routine for any session that changed files — merge current main with the repo's conflict rules, run the full suite (and one SHARDS=8 stress run) when code changed, check the docs, push the session branch and report without opening a PR. Use when the work of a session or round is done, before telling the user it is finished, and whenever the user invokes /finish.
---

# Finish: merge main → test → docs → push → report

Run this at the end of every session that changed files, and also mid-way
when the SessionStart line says the branch is behind `main` before you build
further on it. The `orchestrate` skill's phase 5 calls it.

## 1. Merge current main

```bash
git fetch origin main && git merge origin/main
```

Never rebase or force-push a branch that is already pushed. Conflict rules:

| File | Resolution |
|---|---|
| `changelog.d/*.md` | Can't conflict (one new file per change). If two branches picked the same file name, rename yours. |
| `CHANGELOG.md` | Gone since 2026-10-01: if a branch started earlier still edits it, delete the file again and move its new entry into a `changelog.d/` file. |
| `tests/groups/*.js` | New groups can't conflict (one new file each). Two branches changing the same group: merge the assertions, re-run that group. |
| `tests/philogg.regression.test.js` | Harness and shared helpers only since 2026-10-01. A branch started earlier that added or changed a group in it: move that group's change into its `tests/groups/NNN-*.js` file (a new group becomes a new file) and take `main`'s side of the main file. |
| `FEATURE_BACKLOG.md` | Keep both sides' rows. `LAST_ID` = the higher value; if both sides used the same new ID, give yours the next free one (`LAST_ID` + 1) and fix any reference to it in your branch. |
| `PROJECT.md`, `docs/*.md`, `README.md` | Merge by content: the result must describe the current state of both changes, not two narratives. |
| `philogg.html` | Resolve by understanding both changes; re-run the groups of both sides (`GROUP=a,b npm test`). |

## 2. Tests (only when code changed)

Code = `philogg.html`, `tests/**`, `scripts/**`, `tools/**`, or the
`window.philogg`/`nativeDirHandle` contract (CLAUDE.md lists what doesn't
count). Before a long run, put it on the status line ("Volle Suite läuft,
ca. 2–3 min"), then:

```bash
cd tests && npm test            # full suite: pass count + "Slowest groups"
SHARDS=8 npm test               # once before the final push: load stress
```

- Compare the pass count with `main`'s: lower without a removed group means a
  group silently stopped running.
- A failure only under `SHARDS=8` is a load-dependent test bug: fix it per
  `tests/README.md` → "Extending this suite", step 2. Never re-run it away.
- Rust/Tauri changes: `cd desktop && npm run build`, plus `cargo test -p
  philogg-logparse` in `desktop/src-tauri/` when the native parser changed.

## 3. Docs check

- `node scripts/doc-toc.js` — refreshes the table of contents of every
  Markdown file over 100 lines (CLAUDE.md rule); commit what it changes.
- One fragment `changelog.d/YYYY-MM-DD-<slug>.md`, 3–6 lines (format:
  `changelog.d/README.md`). A later round on the same branch edits it.
- The matching `docs/*.md` section (or `PROJECT.md`) describes the current
  state; README if user-visible; `PROJECT.md` line count if it moved a lot.
- An implemented concept/plan file moved to `docs/archive/` with its status
  line updated.
- New backlog entries took their ID from `LAST_ID`; implemented ones removed.
- A rule or workflow change (`CLAUDE.md`, `.claude/**`) is on its own branch
  off `main`, not mixed into this one (CLAUDE.md → "Process changes").

## 4. Commit and push

- Conventional Commit prefix (`feat:`/`fix:` move the version; `docs:`,
  `test:`, `chore:` don't). No `!`, `BREAKING CHANGE:` or `Release-As:`.
- No Claude attribution lines (CLAUDE.md).
- `git push -u origin <branch>`.

## 5. Report

Tell the user, in their language: what changed, test pass count (and the
`SHARDS=8` result), branch name, open points. **Do not open a PR** and do
not request a review unless the user asked for one (CLAUDE.md).
