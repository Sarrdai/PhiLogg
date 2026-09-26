# Export / Share — ticket-oriented export and findings report

How an analysis leaves PhiLogg so it can be communicated through a ticket
system (Jira Cloud / Server / Data Center, GitHub, GitLab, Azure DevOps, …).
Implements FEATURE_BACKLOG.md #31 (export the current view as
`.log`/`.csv`/`.tsv`) and #32 (standalone findings report) in one combined,
ticket-shaped design. Code: `philogg.html`, section "Export / Share
(ticket-oriented)", right after the extraction table's CSV export dialog.
Tests: `tests/philogg.regression.test.js` GROUPS 281–283.

## Concept

### Who reads it, and what they need

The reader of a ticket has neither PhiLogg nor the log file. What they need
from the person who did the analysis, in reading order:

1. **What was looked at** — source file name(s) and total entry count.
2. **When** — the time span the matching entries cover.
3. **How the result was obtained** — the filter chain as a human-readable
   narrative, one step per line, each with the entry count it left over
   ("File: app.log — 12000", "Text contains: “timeout” — 120",
   "Level: ERROR — 42"). The chain *is* the explanation of the analysis:
   anyone can reproduce it with any tool.
4. **How much** — "x of y entries matched".
5. **What mattered** — the entries the analyst bookmarked or annotated,
   with their notes. These are the findings in the narrow sense.
6. **The evidence** — a bounded excerpt of the matching raw lines, and the
   full data as an attachment.

### Two outputs, because tickets have two channels

Ticket fields have size limits (Jira: 32,767 characters per description or
comment) and render markup; attachments don't. So Export / Share produces:

- **(a) "Copy for ticket"** — a compact clipboard snippet to paste into the
  ticket description or a comment. Always bounded: at most
  `TICKET_SNIPPET_MAX_CHARS` (30,000) characters, an adjustable number of
  excerpt lines (default 20, 0 = none), each excerpt entry capped at
  `TICKET_ENTRY_MAX_CHARS` (1,000; a huge stack trace can't eat the whole
  budget), at most `TICKET_FINDINGS_MAX` (25) bookmark/note lines. Whatever
  is cut says so explicitly ("… 380 more matching entries — see the attached
  export"), so a reader never mistakes an excerpt for the whole result.
- **(b) "Save as attachment"** — files carrying the *full* current view:
  - **`.log`** — the raw lines, exactly as in the source file (multi-line
    entries keep their continuation lines). The lightest attachment and the
    one any log tool re-opens.
  - **`.csv`** — RFC 4180 (comma, `"`-quoting, CRLF rows, header row); one
    column per visible log column (Time, Level, the loaded formats' middle
    columns incl. custom columns, Message). Multi-line messages stay intact
    inside quotes.
  - **`.tsv`** — same columns, tab-separated, for pasting into a spreadsheet
    in any locale. A TSV field can't carry tabs or line breaks, so a tab
    becomes a space and a line break becomes the two characters `\n`.
  - **Report (`.html`)** — a standalone, self-contained findings report: the
    snippet's header, the full filter chain, *all* bookmarks/notes, and
    *every* matching entry (bookmarked ones marked ★ with their note inline).
    Opens in any browser, no PhiLogg needed. Inline CSS only, no script, no
    external resource; every piece of log/user text goes through
    `escapeHtml`, so a log line containing markup can't execute when the
    report is opened.

### Format flavors — one choice, remembered

The same snippet in three markups, picked with one segmented control and
remembered (`localStorage["philogg-export-format"]`, mirrored into the
desktop build's `settings.json` like every `philogg-*` key):

| Flavor | For | Markup used |
|---|---|---|
| **Markdown** (default) | Jira Cloud (its editor converts pasted Markdown), GitHub, GitLab, Azure DevOps, Slack/Teams | `###` heading, `**bold**`, `` `code` ``, numbered/bullet lists, fenced code block (fence grows past the longest backtick run in the lines) |
| **Jira wiki** | Jira Server / Data Center (wiki renderer), Confluence wiki markup | `h3.`, `*bold*`, `{{mono}}`, `#`/`*` lists, `{noformat}` block (no language highlighting, no markup interpretation inside) |
| **Plain text** | e-mail, chat, any other tracker | no markup; excerpt indented by four spaces |

Free text that isn't inside a code block (filter names, notes, messages in
the bookmark list) is escaped per flavor so a `*` or `_` in a log message
doesn't turn the rest of the ticket bold.

### What "the current view" is

The active tree node's result with the level quick-filter applied —
`applyLevelFilter(getEntries(state.activeId))`, the same set the Filtered
view shows, in log order. Deliberately **not** included: the display-only
table sort, and entries pinned in only by "pin bookmarks into the Filtered
view" (bookmarks have their own section instead). A Link node exports its
pair entries (the two raw lines joined by ` ⟶ `, as the Link view shows
them). The level quick-filter, when set, appears as its own last step in the
filter chain.

Bookmarks and notes listed are those of the active node's **root file**
(every bookmarked or annotated entry of that file, in log order) — they are
the analyst's findings regardless of which filter happens to be active.

### Where it lives

One entry point: the **Export / Share** button in the top toolbar (left of
Settings), plus a rebindable shortcut (**Ctrl+Shift+E**, Shortcut Manager
id `exportView`). It opens `#exportDialog`: a one-line summary of the view,
the flavor switch, the excerpt-lines number, a read-only live preview of
the snippet, the four attachment buttons, and **Copy for ticket** as the
dialog's primary action. With nothing loaded (no active node) the shortcut
and button just toast "Nothing to export". The existing, narrower paths stay
as they were: Ctrl+C on selected log rows (`copyLogSelectionToClipboard`),
and the extraction table's own "Export as CSV…" (extracted columns rather
than log columns).

### Saving files — browser and desktop

The same mechanism every other file save in the app uses
(`saveFilterToFile`, `saveCsvToFile`, theme templates): `showSaveFilePicker`
where the engine has it (Chromium browsers, and the Windows desktop build's
WebView2), otherwise a `Blob` + `<a download>` (`downloadBlobFallback`).
Cancelling the picker (`AbortError`) saves nothing and doesn't fall back.
No new `window.philogg` bridge call was needed.

### Performance for huge views

Nothing is collected from the DOM — every builder walks the entry array
directly. Files are built as an array of string chunks
(`EXPORT_CHUNK_ENTRIES` = 5,000 entries per chunk) handed to one `Blob`, so
a million-entry export never builds one giant string or one part per line.
The snippet only ever touches the first N entries plus one O(n) pass for
the time range. The chain's per-step counts come from `getEntries`, which
is memoized per node (`node._cache`), so they're cache hits.

### Privacy

Nothing leaves the machine except through an explicit user action — the
clipboard write on "Copy for ticket", or a file the user saves. No upload,
no link, no ticket-system API. Only file *names* are included, never local
paths.

### Consciously left out (candidates for the backlog)

- **Context lines around excerpt entries** ("±N lines" in the snippet) —
  the excerpt is the first N matching entries only.
- **Excerpt selection other than "first N"** (e.g. bookmarked-first, or the
  last N / around the selected row).
- **Rich-text clipboard** (`text/html` alongside the Markdown) for editors
  that don't convert pasted Markdown (Confluence Cloud, Outlook).
- **Direct ticket-system integration** (create/comment via REST API) —
  would need credentials and network access, contradicting the offline,
  nothing-leaves-the-machine design.
- **Markdown report file** (`.md` attachment) — the HTML report covers the
  "readable without PhiLogg" need; a `.md` variant would be a thin wrapper
  over the snippet builder without limits.
- **Screenshot/Plot image in the report** (the Plot tab's PNG save exists
  separately).
- **Timezone annotation** of timestamps — they're shown as parsed, local
  time, like the app itself.
- **Multiple views in one report** (several filters side by side).
