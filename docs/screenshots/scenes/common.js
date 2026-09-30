// Shared filter tree for the README screenshots (see ../generate.sh).
// Runs inside philogg.html via tools/log-sim/screenshot.js --eval, after
// app.log (log simulator, seed 7) has loaded. Scene files are appended to
// this one and pick what is active/visible; `S` holds the created nodes.
const S = {};
// Every picture is light (Catppuccin Latte) unless its scene says otherwise —
// pinned here so it doesn't depend on the headless browser's OS preference.
setThemeMode("light");
S.file = state.rootIds[0];
S.errors = createFilterNode(S.file, "level", ["ERROR"]);
S.errors.highlightColor = "#d9534f";
S.warn = createFilterNode(S.file, "level", ["WARN"]);
S.warn.highlightColor = "#e0a030";
S.requests = createFilterNode(S.file, "text", "completed in [*:int]ms status=[*:int]");
S.requests.name = "Request durations";
S.position = createFilterNode(S.file, "text", "Position update x=[*:float] y=[*:float] z=[*:float]");
S.position.name = "Position";
S.spectrum = createFilterNode(S.file, "text", "Spectrum channel=A bins=[*]");
S.spectrum.name = "Spectrum A";
S.moves = createFilterNode(S.file, "text", "Move requested");
S.reached = createFilterNode(S.file, "text", "Position reached");
S.link = createLinkNode(S.moves.id, S.reached.id, "after", 1, { key: { pattern: "job=[*]" } });
S.axis2 = createFilterNode(S.file, "text", "axis-2", false, null, false, ["thread"]);
S.axis2.name = "Thread axis-2";
const show = (node, tab) => {
  state.activeId = node.id;
  render();
  const b = document.querySelector('[data-fh-tab="' + tab + '"]');
  if (b && !b.classList.contains("active")) b.click();
};
// Picks the <option> whose text starts with `label` and fires change, the
// way a person changes a plot control.
const pick = (sel, label) => {
  const el = document.querySelector(sel);
  const opt = [...el.options].find(o => o.textContent.trim().toLowerCase().startsWith(label.toLowerCase()));
  el.value = opt.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
const click = sel => document.querySelector(sel).click();
