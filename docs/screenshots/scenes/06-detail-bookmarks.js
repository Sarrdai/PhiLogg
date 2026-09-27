const f = state.nodes[S.file];
const traces = f.entries.filter(e => e.level === "ERROR" && e.message.includes("Caused by"));
[traces[1], traces[4], traces[7]].forEach(e => toggleBookmark(e.id));
show(S.errors, "filter");
selectEntry(traces[1].id, { scroll: true, center: true });
