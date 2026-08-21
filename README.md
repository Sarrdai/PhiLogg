# PhiLogg

A local, single-file, offline-capable log viewer for a pipe/tab-delimited
log4net-style log format. Built to replace LogViewPlus for that specific
format, with a nested filter tree, value extraction into a spreadsheet-like
table, plotting, and nearest-neighbor event correlation across log lines.

No install, no build step, no server, no external dependencies (not even a
CDN font). The entire application is one `philogg.html` file — download it,
open it in a browser, and it works, including offline and directly from
`file://`.

## Screenshots

| | |
|---|---|
| ![Log view](homepage/screenshots/01-log-view.png) Log view with filter tree | ![Extraction table](homepage/screenshots/02-extraction-table.png) Extraction table |
| ![Plot](homepage/screenshots/03-plot.png) Plotting extracted values | ![Link view](homepage/screenshots/04-link-view.png) Link (nearest-neighbor pairing) view |
| ![Full/Filtered split](homepage/screenshots/05-highlight-split.png) Full/Filtered split with highlight colors | ![Bookmarks](homepage/screenshots/06-detail-bookmarks.png) Bookmarks & detail panel |
| ![Dark theme](homepage/screenshots/07-dark-theme.png) Dark theme (default) | |

A guided feature tour with more screenshots lives in [`homepage/index.html`](homepage/index.html) —
open it in a browser to view it.

## Key features

- **Nested filter tree** — chain text, time-range, value-extraction, AND/OR,
  nearest-neighbor link, time-context and count-context filters; each level
  narrows/transforms the result of the one above it.
- **Value extraction** — turn a pattern like `x=[value:float] y=[value:float]`
  into a spreadsheet-style table with per-column stats, value assertions, and
  a Plot tab (line/bar/scatter, zoom/pan, click a point to jump to its log
  entry).
- **Link filter** — pair up nearest-preceding/following entries across two
  filters (e.g. "the last position reading before each error"), chainable
  into multi-hop tuples via a guided dialog.
- **Full/Filtered split** — one narrowed "Filtered" view plus a
  color-highlightable "Full" view of the whole file, side by side or
  stacked.
- **Live tailing & folder watch** (Chromium, File System Access API) — an
  actively-written log file updates in place; a watched folder picks up new
  files automatically.
- **Multi-file drag-and-drop** — every dropped file shows up in the tree
  right away (grayed while it waits its turn to load), and loading several
  at once offers to merge them into one chronologically-sorted file.
- **Deep-link loading** — `philogg.html?url=<encoded-url>` fetches and opens
  a log at boot, for linking straight to a log from CI/a report (requires
  PhiLogg itself served over `http(s)`, not opened as a local file, and CORS
  on the remote log server).
- **Bookmarks, undo/redo, timeline minimap with drag-to-select.**
- **Session cache** — reload the browser tab and get your files, filters,
  and settings back.
- **Filter save/load** (`.json`) and a **reusable filter library** for
  presets you apply across different files.
- **Session export/import** — package an analysis (files, filters,
  bookmarks) to share with a colleague.
- **Configurable log formats** (Settings → Format Manager) — define
  additional formats (a log4net/LogViewPlus-style pattern, or a raw regex
  for edge cases) and map them to files by filename pattern; the default
  format still works with zero configuration.
- **Light & dark theme**, resizable/toggleable columns, multiline message
  display, multi-row select + copy.

See [`homepage/index.html`](homepage/index.html) for the full, illustrated
feature list, and `PROJECT.md` for how each of these actually works
internally.

## Getting started

1. Download `philogg.html` (or clone this repo).
2. Open it in a browser — double-click it, or `File → Open` from any
   browser. No server needed.
3. Load a log file via **Open…** or drag-and-drop.

Works in any modern browser for one-shot file loading. **Live tailing and
folder watch require the File System Access API**, currently
Chromium-based browsers only (Chrome, Edge, …) — Firefox and others still
open and analyze files, just as static snapshots.

## The log format it reads

Out of the box, PhiLogg reads a log4net-style conversion pattern:

```
%d\t%p\t"%t"\t%c\t[%M]\t"%m"%n
```

i.e. tab-separated `timestamp / level / "thread" / file:line / [method] /
"message"`. The parser is tolerant: any line that doesn't look like a new
entry is treated as a continuation of the previous entry's message, so
multi-line stack traces come through intact.

Other formats are configurable via **Settings → Format Manager**: define a
format the same way (a `%d %p %t %c %M %m %n`-style pattern) or drop down to
a raw regex for shapes the pattern language can't express, then map
filenames to it with a glob rule (e.g. `app-*.log`). See
[`examples/bracket-format.log`](examples/bracket-format.log) for a sample in
a different shape to try it against.

## Repository layout

```
philogg.html                          the application — everything lives here
tests/
  philogg.regression.test.js          jsdom regression suite (drives the real file via DOM events)
  README.md                           testing conventions
tools/
  log-simulator.html                  standalone tool: writes a growing .log file (any configured pattern), for testing tailing/folder watch
desktop/
  README.md                           Electron wrapper: build/run steps, current status
  main.js, package.json, electron-builder.yml   file associations + CLI file opening (loads philogg.html unmodified)
homepage/
  index.html                          static feature-tour / marketing page
  screenshots/                        screenshots used by the homepage and this README
examples/
  general.log                         a sample log file in the default format
  bracket-format.log                  a sample log file in a different format, for trying the Format Manager
scripts/
  install_pkgs.sh                     helper for installing test dependencies
.github/workflows/release.yml         manual workflow: stamps a version and publishes a tester build
.github/workflows/desktop-release.yml manual workflow: builds the desktop/ Electron wrapper per OS (untested, see desktop/README.md)
PROJECT.md                            architecture, design decisions, full changelog (start here to work on the code)
FEATURE_BACKLOG.md                    unelaborated feature ideas
CLAUDE.md                             instructions for AI coding sessions on this repo
```

## Development

Regression tests use jsdom to load the real `philogg.html` and drive it
through actual DOM events (clicks, drag, keyboard, form submits):

```bash
cd tests
npm install
npm test
```

See `tests/README.md` for the suite's conventions before extending it.
`tools/log-simulator.html` is a separate, standalone tool for exercising
live tailing / folder watch against a real, growing file.

Project documentation is split by audience:

- **This README** — what PhiLogg is and how to use it, for people.
- **`PROJECT.md`** — architecture, design rationale, known gotchas, and the
  full session-by-session changelog. Read this first before changing code,
  human or AI session alike.
- **`FEATURE_BACKLOG.md`** — raw, unelaborated ideas for future work.
- **`CLAUDE.md`** — short, load-every-session instructions for AI coding
  sessions.

## Versioning & releases

`philogg.html` carries a `PHILOGG_VERSION` constant, which stays the literal
string `"dev"` in source control. The manual **"Build tester release"**
GitHub Action (`.github/workflows/release.yml`) stamps a checked-out commit's
short SHA into a copy of the file and publishes it as a GitHub Release asset
— the tracked file in this repo is never modified by it.

## License

PhiLogg is **proprietary software**, © Philipp Klein. All rights reserved.
It is currently shared only for a limited testing phase; redistribution and
modification are not permitted. See the in-app **License** panel
(the scales-of-justice icon in the toolbar) for the full terms, or contact
philogg@kleinphilipp.de.
