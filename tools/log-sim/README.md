# Log simulator

Generates realistic sample logs that exercise every PhiLogg feature — in
every log format PhiLogg parses — either as finished files (by entry count
or approximate size) or growing live for tailing and folder watch.

| File | What it is |
| --- | --- |
| `core.js` | The generator engine: scenarios, formats, size control, ZIP writer. UMD — `require`d by Node, loaded by the page via `<script src>`. |
| `cli.js` | Headless front end (Node ≥ 18, no dependencies). |
| `screenshot.js` | Opens `philogg.html` in headless Chromium with generated files (and their format definitions) loaded, and saves a screenshot. |
| `../log-simulator.html` | Browser UI: the same options, download or write to a folder, plus live writing (tailing, rotation, burst, truncate). |

Same seed + same options = byte-identical output in the CLI and the UI, in
every time zone (timestamps are wall-clock values, not converted).

## Quick start

```bash
node tools/log-sim/cli.js --list                        # formats + scenarios, with the features each one feeds
node tools/log-sim/cli.js -n 20                         # 20 entries, default format, to stdout
node tools/log-sim/cli.js -n 5000 -o /tmp/demo/app.log  # one file
node tools/log-sim/cli.js --size 100MB -o /tmp/big.log  # ~6 s
```

## Formats (`-f`)

| Name | Output | PhiLogg setup |
| --- | --- | --- |
| `default` | builtin log4net-style, tab-separated | none |
| `custom` | log4j-like line + custom columns `requestId`/`user`/`tenant` | import `<prefix>.logformat.json` |
| `bracket` | `[ts] LEVEL (thread) message` | import `<prefix>.logformat.json` |
| `jsonl` | JSON Lines: nested `ctx`, literal dotted key `"http.status"`, arrays, objects | import `<prefix>.logformat.json` |
| `syslog` | RFC 5424, numeric PRI as level (Integer level mode) | import `<prefix>.logformat.json` |
| `mixed` | default lines interleaved with syslog lines | import the syslog definition, then add a Meta format `[syslog, Default]` |
| `plain` | bare messages, `.txt` | open, then the text viewer's "Filter lines" |

Whenever output goes to a file or folder, the matching PhiLogg format
definition (`philogg-log-format` export, with a filename rule for the
generated names) is written next to it — import it via Open → Import… or by
dropping it onto PhiLogg. `--format-json` prints it instead.

## Scenarios (`-s`, default: all)

`basic`, `stacktrace`, `position`, `motion`, `timing`, `sensors`, `arrays`,
`embedded`, `paths`, `ids`, `bursts`, `gaps`, `levels`, `text` —
`--list` shows what each one contains, which PhiLogg feature it targets and
a filter to try (e.g. `motion` → Link filter with a same-thread key and a
Δt condition; `arrays` → array columns and the Heatmap). Select with
`-s motion,position` or exclude with `-s all,-gaps,-text`.

`ties` is **opt-in** (`optIn: true`, never part of `all`, so every existing
seed keeps its exact output): control-loop ticks of 3-6 `Tick N step k/M`
lines at the exact same millisecond; under `-f mixed` the steps alternate
between default and syslog lines. For same-timestamp log order
(`-s ties,basic`).

`grouped` is opt-in too: numbers with thousands separators below and above
1000 — `Throughput 1,234.5 msg/s` (en), `Meter reading 12.345,6 kWh` (de)
and `Batch imported 12,345 records` (en integer, ambiguous without
`[*:int@en]`). For extraction number formats (`-s grouped`).

`tuples` is opt-in as well: messages that list names first and values after —
`Probe offset (xo, yo, zo): (1.4 , 7.98, 9.76)`, `=(1.4mm , ...)`,
`[cx; cy] -> [12px; 40px]`, `{a/b}={3/4}`, `xs, ys: 1.2mu, 3.4mu`,
`<u, v> = <1.2 m, 3.4 m>`, group units (`(xo, yo, zo) [mm]: (...)`,
`(tx, ty) = (...) mm`, `xs, ys, zs: ... µm`) and space-separated
`(gx gy gz) = (1 2 3)`; 11 fixed shapes with drifting values. For speaking
column names from a name list (`-s tuples,basic`).

## Amount and files

- `-n 5000` entries or `--size 20MB` per file.
- `--files 4` writes `<prefix>-1..4<ext>` into the `-o` directory.
  `--layout rotate` (default) continues one timeline across the files
  (folder watch); `--layout parallel` gives each file its own service over
  the same time range (merge, Sources), `--skew 1500` shifts each file's
  clock by 1.5 s per index (per-file clock offset).
- `--gzip` (each file `.gz`), `--zip -o out.zip` (one archive, stored),
  `--crlf`, `--seed`, `--start 2026-01-15T08:00:00`, `--rate 10` (entries per
  second of log time).

## Live writing (tailing)

```bash
node tools/log-sim/cli.js --follow -o /tmp/watch/ --interval 200 --rotate-lines 500 --duration 60
```

Appends in real time (current wall-clock timestamps), opening/closing the
file per entry so a tailing reader sees every line at once; `--rotate-lines`
starts the next file (folder watch). The browser UI adds burst and truncate
buttons.

## For Claude sessions

Use this instead of writing sample log lines by hand:

```bash
# test/demo data, format definition written alongside
node tools/log-sim/cli.js -f jsonl -n 3000 -o "$SCRATCH/demo/"
# screenshot of the real app with that data (Playwright is preinstalled globally)
NODE_PATH="$(npm root -g)" node tools/log-sim/screenshot.js --out "$SCRATCH/shot.png" "$SCRATCH"/demo/*
# --eval runs page JS before the shot (the app's own functions, e.g. createFilterNode / render / applyFhView), --theme dark
```

`docs/screenshots/generate.sh` + `docs/screenshots/scenes/` (the README's
screenshots) is the worked example of everything below.

### Building the scene with `--eval`

`--eval` runs in the page after the files are parsed and before the shot,
with the app's globals in scope (`state`, `createFilterNode`, `render`, …).
Prefer clicking the real buttons for UI state — it goes through the same
code as a person would:

```bash
node tools/log-sim/cli.js -s position,basic -n 3000 -o "$SCRATCH/ev/"
NODE_PATH="$(npm root -g)" node tools/log-sim/screenshot.js --out plot.png --eval '
  const f = state.rootIds[0];                       // first loaded file
  createFilterNode(f, "text", "Position update x=[*:float] y=[*:float] z=[*:float]");
  render();
  document.querySelector("[data-fh-tab=\"plot\"]").click();
' "$SCRATCH"/ev/*.log
```

- `createFilterNode(parentId, filterType, value, …)` creates and activates a
  node and returns it (`.id` as the parent of a nested filter). A `"text"`
  filter with `[*:…]` placeholders is an extraction (Table/Plot tabs);
  `"level"` takes e.g. `["ERROR","WARN"]`.
- Tabs: `[data-fh-tab="…"]` buttons (`table`, `plot`, …). Plot settings,
  chart type and other controls: click them / set a select's value and
  dispatch `change`.
- Longer setups: keep them in a file, `--eval "$(cat setup.js)"`; raise
  `--wait` for heavy views.
- These are internal functions, not a stable API — if a recipe breaks after
  a `philogg.html` change, fix the recipe (or add a `screenshot.js` option).

### When the simulator can't produce a case

Extend it — don't hand-write lines. A new scenario is one entry in
`SCENARIOS` (`label`, `weight`, `hint`, `make(g, ts)` returning
`{level, thread, cls, method, msg, cont, ctx, json}`, follow-ups via
`g.schedule`); a new format is one entry in `FORMATS` (`render` plus an
`exportFormat` whose regex matches it). Cover it in GROUP 300 of
`tests/philogg.regression.test.js`.

Inside the regression suite, `require("../tools/log-sim/core.js")` and use
`generateToStrings({format, entries, seed})` (see GROUP 300).
