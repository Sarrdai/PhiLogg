# changelog.d — the changelog, one file per change

Every session that changes behavior adds **one new file here**. New files
never conflict, so parallel branches merge cleanly. There is no
`CHANGELOG.md`: `node scripts/changelog.js` prints this folder as one
newest-first history, `node scripts/changelog.js 2026-09-01` only the
entries since that date (e.g. for release notes).

## File

- Name: `YYYY-MM-DD-<slug>.md` — the date the change was made, a short
  kebab-case slug (`2026-10-02-text-files-find-bar.md`). One file per
  branch/change; a later round on the same branch edits its own file.
  (Entries converted from the old `CHANGELOG.md` carry a running number
  after the date, `2026-09-25-03-...`, which keeps a day's original order.)
- Content: exactly one entry:

  ```markdown
  - **feat: what changes for the user (YYYY-MM-DD, person-requested)**
    - What and why, in a few lines.
    - **Tests**: GROUP <slug>. Docs: docs/<file>.md, README.
  ```

- **3–6 lines.** What a user or a later session needs to know: what changed
  and why. Test mechanics, measurements and debugging stories belong in the
  test group's banner and the commit message, not here. (Many converted
  entries are much longer; that is history, not the model to follow.)
- The prefix matches the Conventional Commit type of the change (`feat:`,
  `fix:`, `docs:`, `test:`, `chore:`, ...).

## Reading

`grep -rl <term> changelog.d` finds the entries about something;
`ls changelog.d | tail` shows the newest.
