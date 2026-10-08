// "Where is what" overlay (press ? in the app): dark theme, Filtered view of a
// selected filter node with a row selected, the entry detail panel open.
setThemeMode("dark"); // Catppuccin Mocha
toggleDetailCollapsed(false);
const f = state.nodes[S.file];
const traces = f.entries.filter(e => e.level === "ERROR" && e.message.includes("Caused by"));
show(S.errors, "filter");
selectEntry(traces[1].id, { scroll: true, center: true });
showWhereIsWhat();
