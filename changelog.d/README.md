# changelog.d — one file per change

Every session that changes behavior adds **one new file here** instead of
editing `CHANGELOG.md`. New files never conflict, so parallel branches merge
cleanly. `CHANGELOG.md` holds everything up to 2026-10-01 and receives the
fragments only when a release folds them in (`node scripts/changelog.js
--fold`, see `PROJECT.md` → "Release builds").

## File

- Name: `YYYY-MM-DD-<slug>.md` — the date the change was made, a short
  kebab-case slug (`2026-10-02-text-files-find-bar.md`). One file per
  branch/change; a later round on the same branch edits its own file.
- Content: exactly one entry in `CHANGELOG.md`'s format:

  ```markdown
  - **feat: what changes for the user (YYYY-MM-DD, person-requested)**
    - What and why, in a few lines.
    - **Tests**: GROUP <slug>. Docs: docs/<file>.md, README.
  ```

- **3–6 lines.** What a user or a later session needs to know: what changed
  and why. Test mechanics, measurements and debugging stories belong in the
  test group's banner and the commit message, not here.
- The prefix matches the Conventional Commit type of the change (`feat:`,
  `fix:`, `docs:`, `test:`, `chore:`, ...).

## Reading

`node scripts/changelog.js` prints all pending fragments newest first;
`grep -r <term> changelog.d CHANGELOG.md` searches both.
