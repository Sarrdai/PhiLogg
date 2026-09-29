# Concept mockup for UI changes

Purpose: let the user decide *before* code is written. The mockup is a
decision document, not a pixel-perfect prototype.

## Content

1. **Today** — a real-app screenshot of the affected area (simulator data,
   see `verification.md` → "Screenshots"), embedded as data URI or
   uploaded asset. Crop to the relevant region when the change is small.
2. **Variants** — usually 2–3, labelled A/B/C. If the user proposed one,
   it is variant A and labelled as theirs. Each variant gets:
   - an interactive mock where interaction is the point (selection,
     toggles, hover, open/closed states). Variants that show the same
     thing share one state model and one set of preset buttons, so they
     can be compared side by side.
   - 1–2 sentences of behavior, plus a short pro/contra list.
3. **Details that decide implementation** — e.g. a table "state → what
   the control shows", tooltip texts, sizes compared to today.
4. **Recommendation** — one clearly marked box: which variant and why,
   what you would not do and why.

## Look

- Use PhiLogg's real design tokens from `philogg.html` `:root` (dark
  default: `--bg-panel #151924`, `--bg-elevated #1c2130`, `--border
  #262c3c`, `--text-primary #e7eaf1`, `--accent #4fc7c3`, …) for the
  mocked app parts, so the mock reads like the app. Re-read them from the
  file; they may have changed.
- Reuse real icons/SVG from `philogg.html` where they exist; new icons are
  marked as new.
- Page chrome (headings, notes) may follow the artifact design skill;
  the mocked UI follows the app.

## Mechanics

- Build it as an Artifact (`Artifact` tool, `quickstart`/artifact-design
  first as that tool requires). Source file lives in the scratchpad.
- Text for the user in German; identifiers/labels that will appear in the
  app in English, exactly as they would ship.
- Republish to the same URL for iterations, don't create a new artifact
  per round.
- Commit the mockup to the repo (`docs/mockups/`) only if the user wants
  it kept as reference.

Stop after publishing: send the link, name the recommendation in one
line, ask for the decision.
