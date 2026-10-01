# PhiLogg — Dialog & control UI standard

The canon every popup/dialog and its controls must follow. Written for
FEATURE_BACKLOG.md #69 (the consistency sweep) and binding on **every new or
changed dialog from now on** — a feature that adds a dialog or a control
follows this file rather than inventing its own look. It describes the
*current, agreed* target state; where the existing code already matches, it
documents the reusable class to reach for instead of a new one.

**Applied (2026-09-14, #69).** The sweep is complete — this is now the *live*
state, not a target: the `.pill-toggle` component below exists and every listed
single-boolean checkbox was converted to it, buttons collapsed to the
`.btn-mini` / `.btn-mini-secondary` pair with footer order secondary→primary,
and every overlong `.settings-row-hint` trimmed to one ≤~90-char line. Keep new
dialogs conforming to it. See `changelog.d/` (2026-09-14) and
`docs/ui-and-views.md` → "Boolean pill toggle & the dialog consistency sweep".

PhiLogg is one self-contained `philogg.html` with inline `<style>` — there
is no component framework, so "component" here means *a documented CSS class
+ markup shape to copy*, not an abstraction. Reuse the class; don't clone its
declarations into a new selector.

## Design tokens (never hardcode these)

Colors always go through the theme CSS vars — never a literal hex in a
dialog rule (a literal breaks every non-default theme):

- Text: `--text-primary` (labels, values), `--text-secondary` (secondary
  controls, body), `--text-tertiary` (hints, disabled-ish captions).
- Surfaces: `--bg-elevated` / `--bg-elevated-2` (dialog body / raised
  card), `--border` (all 1px separators and control borders).
- Accent: `--accent` (primary fill), `--accent-on` (text on an accent
  fill), `--accent-strong` (accent text/hover), `--accent-soft` (active
  segmented/pill background).

## Buttons

One size scale, one shape. Do not introduce a new button height.

| Class | Use |
|---|---|
| `.btn-mini` | **Primary** action of a dialog/group. Accent fill, `--accent-on` text, `padding:8px 12px`, `border-radius:6px`, `font-weight:650`. |
| `.btn-mini-secondary` | Any non-primary button in the same group (Cancel, secondary action). Transparent, `1px solid var(--border)`, `--text-secondary`. |
| `.btn-mini-dashed` / `.btn-mini-outline` | Additive/"add another" affordances and lightweight inline actions only. |

Rules:
- **Exactly one `.btn-mini` (primary) per action group.** Everything else
  in that group is `.btn-mini-secondary`. No two accent-filled buttons
  side by side.
- Footer button order is **secondary → primary**, primary right-aligned
  (Cancel left of Confirm).
- Disabled state is `opacity` + `cursor:default` via the existing
  `:disabled` rules — never a separate greyed color.
- No per-dialog width/height overrides on buttons. If a button looks
  wrong at the standard size, the container is wrong, not the button.

## Segmented (mode) selector — `.assert-mode-btn`

For **mutually exclusive modes** (2–4 options): the existing segmented
control. Already used by assert-mode, format edit pattern/regex, color
picker Free/Theme. One `.assert-mode-btn` per option, the active one
carries `.active` (accent border + `--accent-strong` text +
`--accent-soft` background). Reuse it for any new either/or choice
(e.g. #29's *Difference / Start time* mode) instead of a `<select>` or
radios.

## Boolean toggle — `.pill-toggle` (the #69 replacement for checkboxes)

A single on/off option is a **pill toggle**, not a native `<input
type="checkbox">`. This is the control #69 introduces and rolls out. Shape:

- A `<button type="button" role="switch" aria-checked="true|false"
  class="pill-toggle">` (label sits in the adjacent `.settings-row-text`
  or `<label>`, not inside the pill).
- Track `~34×20px`, `border-radius:10px`, `1px solid var(--border)`,
  transparent when off; **on** = `--accent` track, `--accent-on` knob.
- Knob is a circle that translates left→right on toggle; animate with a
  short `transform`/`background` transition (≤`.15s`), matching the
  `.panel-toggle-btn` transition feel.
- Toggle state in JS by flipping `aria-checked` + an `.on` class; read it
  back from `aria-checked`, never a `.checked` property.

**Convert to `.pill-toggle`** every existing single-boolean checkbox in a
dialog: `filterRegexCheckbox`, `filterCaseCheckbox`,
`filterWholeWordCheckbox`, `filterInvertCheckbox`, `linkExclusiveInput`,
`linkOrderEnforceInput`, `csvExportHeadersInput`,
`csvExportFullEntryInput`, `plotNormalize`, `plotAxisEqual`, and every
`settings*` / `fwSettings*` boolean.

**Exception — label-only toggles (`.label-toggle`).** In a dense option
row (the filter popup's Syntax/Search in rows) a boolean may instead be a
standalone single-label toggle: same `role="switch"`/`aria-checked`
protocol, no track/knob, no chrome at rest. Its thin `--accent-strong` bar
under the label is the on/off status light (the same rule as
`.icon-toggle`) — a label-only toggle without it is indistinguishable from
a button. Independent on/off options are never boxed into a shared
`.view-tabs` group — that look means "pick exactly one". Actions next to
them keep a framed button look.

**Do NOT convert** multi-select checkbox *lists* — these stay native
checkbox rows because they're a set-selection, not an on/off option:
column visibility (`colToggle*`), Plot Y-column picker (`plot-y-item`),
session-export per-file `session-include` / `session-embed`. Keep their
rows aligned (see Layout) but leave the checkbox semantics.

## Layout & rows — `.settings-row`

Every "label + control" line uses the `.settings-row` shape (label/hint on
the left in `.settings-row-text`, control right in `.settings-row-control`):

- `.settings-row-label`: `font-size:13.5px`, `font-weight:550`,
  `--text-primary`. The clickable label wires to its control.
- `.settings-row-hint`: `font-size:12px`, `--text-tertiary`,
  `line-height:1.5`. **One line, ≤ ~90 chars.** A hint states *what the
  option does*, not caveats, history, or examples — move anything longer
  out of the UI. Trim the existing verbose hints as part of #69.
- Controls in a column are **right-edge aligned**: same control width /
  right margin down the column so pills, selects and number inputs line
  up. `<select>` and `input[type=number]` use the existing
  `.settings-row-control select` / `input` rules — don't restyle per
  dialog.

## Dialog shell & header

- Body surface `--bg-elevated`, `1px solid var(--border)`, consistent
  `border-radius` and padding with the other dialogs (match Settings /
  Format Manager, don't pick a new radius).
- **Header**: a title row with the dialog name in `--text-primary`, a
  close affordance top-right. Same header height/weight across dialogs.
  No decorative subtitle lines — put orientation in a single
  `.settings-row-hint`-weight line if truly needed.
- Group related rows into `.settings-card` blocks with a
  `.settings-subsection-title` where a dialog has more than one logical
  group; a single `--border` separator between groups, not per-row rules
  (`.settings-card > .settings-row:last-of-type{border-bottom:none}`).

## Applying this (the #69 sweep, and every feature after)

1. Buttons → collapse to the `.btn-mini` / `.btn-mini-secondary` pair;
   fix the one-primary-per-group rule; order secondary→primary.
2. Single booleans → `.pill-toggle`; multi-select lists stay checkboxes
   but get aligned.
3. Modes → `.assert-mode-btn`.
4. Rows → `.settings-row`; right-align controls; trim every hint to one
   short line.
5. Headers → uniform title + close, uniform radius/padding.

Dialogs in scope for the sweep: filter popup (Ctrl+F / edit), Settings
(all sections), Format Manager, link dialog, time-range dialog, note
editor, theme import, folder-watch settings, CSV export, session
export/import, color picker — and any dialog added by concurrent feature
work (#29 clock-offset, #67 syntax-theme).
