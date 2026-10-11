// GROUP llm-config-styles — LLM/MCP configuration tools, step 2: list_config
// (styles), create_style (custom UI themes + custom syntax schemes) and
// delete_config_item (theme, syntax). Synchronous, stored in localStorage at
// once, not undoable, createdBy: "assistant" on a new record; only such records
// can be deleted by a tool.
// Origin: 2026-10-11 (person-requested, plan-llm-config-tools step 2).
group("llm-config-styles");
if (groupSelected()) {
  const stored = (w, key) => JSON.parse(w.localStorage.getItem(key) || "[]");

  await withApp(async (w, d, T) => {
    section("llm-config-styles a. list_config(styles): built-ins, slots, keys");
    const r = llmRun(w, "list_config", { kind: "styles" });
    assert(!r.error && r.result.kind === "styles", "listed, got " + r.error);
    const res = r.result;
    assert(res.themes.some(t => t.id === "catppuccin-mocha" && t.slots && t.slots.includes("dark")) && res.themes.some(t => t.id === "catppuccin-latte" && t.slots.includes("light")), "built-in themes with the slots holding them");
    assert(res.themes.every(t => !t.custom && !t.byAssistant), "no custom theme yet");
    assert(res.syntaxSchemes[0].id === "follow-theme" && res.syntaxSchemes[0].active === true, "syntax: Follow app theme is active by default, got " + JSON.stringify(res.syntaxSchemes[0]));
    assert(res.colorKeys.theme.includes("accent") && res.colorKeys.theme.includes("syntax-tag") && res.colorKeys.syntax.length === 8, "color keys listed");
    assert(["light", "dark", "system"].includes(res.mode) && ["light", "dark"].includes(res.showing), "mode + showing scheme");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-styles b. create_style theme: base by name, colors over it, soft keys follow, activation, localStorage, no undo");
    const undo = T.undoStack.length;
    const base = w.currentComputedColors(T.THEME_COLOR_KEYS);
    const r = llmRun(w, "create_style", { kind: "theme", name: "Ocean", base: "Classic Dark", colors: { accent: "#0099ff", "--bg-app": "#001122" } });
    assert(!r.error && r.result.saved && /^custom:/.test(r.result.id) && r.result.byAssistant, "created, got " + r.error);
    const rec = T.customThemes.find(t => t.id === r.result.id);
    assert(rec && rec.createdBy === "assistant" && rec.name === "Ocean", "record carries the marker");
    assert(rec.colors.accent === "#0099ff" && rec.colors["bg-app"] === "#001122", "given colors applied (also with a -- prefix)");
    assert(rec.colors["text-primary"] === "#e6e9ef" || /^#|rgb/.test(rec.colors["text-primary"]), "other keys come from the base: " + rec.colors["text-primary"]);
    assert(/^rgba\(0,153,255/.test(rec.colors["accent-soft"]), "accent-soft re-derived from the new accent, got " + rec.colors["accent-soft"]);
    assert(THEME_KEYS_OK(T, rec.colors), "all theme color keys present");
    assert(r.result.active === true && w.currentThemeId() === rec.id, "applied at once");
    assert(stored(w, "philogg-custom-themes").some(t => t.id === rec.id && t.createdBy === "assistant"), "stored in localStorage synchronously");
    assert(d.querySelector("#customThemeList").textContent.includes("Ocean"), "Settings list re-rendered");
    assert(T.undoStack.length === undo, "not an undo step");
    const l = llmRun(w, "list_config", { kind: "styles" }).result.themes.find(t => t.id === rec.id);
    assert(l && l.custom && l.byAssistant && l.slots, "listed as custom + byAssistant with its slot");

    const noAct = llmRun(w, "create_style", { kind: "theme", name: "Quiet", colors: { accent: "#ff00aa" }, activate: false }).result;
    assert(noAct.saved && noAct.active === false && w.currentThemeId() === rec.id, "activate: false keeps the current theme");
    const q = T.customThemes.find(t => t.id === noAct.id);
    assert(q.colors["bg-app"] === rec.colors["bg-app"], "default base = the active theme (Ocean), got " + q.colors["bg-app"]);
    assert(base["bg-app"] !== undefined, "(sanity) computed colors readable");
    assert(w.document.documentElement.getAttribute("data-theme") === rec.id, "reading a base left the data-theme attribute alone");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-styles c. create_style errors: unknown key, invalid color, name, base, kind");
    const n0 = T.customThemes.length;
    let r = llmRun(w, "create_style", { kind: "theme", name: "X", colors: { "bg-appp": "#000" } });
    assert(r.error && /Unknown color key "bg-appp"/.test(r.error) && /bg-app/.test(r.error), "unknown key lists the valid ones, got " + r.error);
    r = llmRun(w, "create_style", { kind: "theme", name: "X", colors: { accent: "not-a-color" } });
    assert(r.error && /not a CSS color/.test(r.error), "invalid color, got " + r.error);
    r = llmRun(w, "create_style", { kind: "theme", colors: { accent: "#fff" } });
    assert(r.error && /name is required/.test(r.error), "name required");
    r = llmRun(w, "create_style", { kind: "theme", name: "X", base: "Nonexistent" });
    assert(r.error && /Unknown base/.test(r.error) && /Classic Dark/.test(r.error), "unknown base lists the names, got " + r.error);
    assert(llmRun(w, "create_style", { name: "X" }).error, "kind required");
    r = llmRun(w, "create_style", { kind: "syntax", name: "X", colors: { accent: "#fff" } });
    assert(r.error && /Unknown color key "accent"/.test(r.error), "a syntax scheme only takes syntax-* keys, got " + r.error);
    r = llmRun(w, "create_style", { kind: "theme", styleId: "dark", colors: { accent: "#fff" } });
    assert(r.error && /Unknown styleId/.test(r.error), "built-in themes cannot be changed, got " + r.error);
    r = llmRun(w, "create_style", { kind: "theme", styleId: "syntax:abc" });
    assert(r.error && /not a theme/.test(r.error), "kind/styleId mismatch");
    assert(T.customThemes.length === n0 && !w.localStorage.getItem("philogg-custom-themes"), "failed calls store nothing");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-styles d. modify by styleId: fields replaced, rest stays, marker and id kept; the person's own theme can be changed");
    const id = llmRun(w, "create_style", { kind: "theme", name: "Mod", base: "Classic Light", colors: { accent: "#aa0000" }, activate: false }).result.id;
    const before = T.customThemes.find(t => t.id === id);
    const r = llmRun(w, "create_style", { kind: "theme", styleId: id, name: "Mod 2", colors: { "text-primary": "#111111" } });
    assert(!r.error && r.result.id === id, "modified: " + r.error);
    const after = T.customThemes.find(t => t.id === id);
    assert(after.name === "Mod 2" && after.colors["text-primary"] === "#111111" && after.colors.accent === "#aa0000" && after.colors["bg-app"] === before.colors["bg-app"] && after.createdBy === "assistant", "name + one color changed, the rest and the marker stay");
    assert(T.customThemes.filter(t => t.id === id).length === 1, "replaced, not duplicated");
    assert(r.result.active === false && w.currentThemeId() !== id, "a modified inactive theme is not activated");
    llmRun(w, "create_style", { kind: "theme", styleId: id, activate: true });
    assert(w.currentThemeId() === id, "activate: true applies it");
    llmRun(w, "create_style", { kind: "theme", styleId: id, colors: { "bg-app": "#123456" } });
    assert(w.document.documentElement.style.getPropertyValue("--bg-app") === "#123456", "changing the ACTIVE theme re-applies it right away");
    T.customThemes.push({ id: "custom:own", name: "Own", colors: Object.assign({}, after.colors), activeTextLight: false });
    const o = llmRun(w, "create_style", { kind: "theme", styleId: "custom:own", name: "Own v2" });
    assert(!o.error && T.customThemes.find(t => t.id === "custom:own").name === "Own v2" && !T.customThemes.find(t => t.id === "custom:own").createdBy, "the person's own theme can be changed and stays theirs");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-styles e. syntax schemes: create from a built-in base, modify, activate, localStorage");
    const r = llmRun(w, "create_style", { kind: "syntax", name: "Mine", base: "catppuccin-mocha", colors: { "syntax-tag": "#ff0000" } });
    assert(!r.error && /^syntax:/.test(r.result.id) && r.result.active === true, "created + activated: " + r.error);
    const rec = T.customSyntaxSchemes.find(s => s.id === r.result.id);
    const mocha = T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === "catppuccin-mocha");
    assert(rec.createdBy === "assistant" && rec.colors["syntax-tag"] === "#ff0000" && rec.colors["syntax-key"] === mocha.colors["syntax-key"], "base colors + override");
    assert(Object.keys(rec.colors).length === 8, "all eight keys");
    assert(T.syntaxSchemeChoice === rec.id && w.localStorage.getItem("philogg-syntax-scheme") === rec.id, "scheme chosen and remembered");
    assert(w.document.documentElement.style.getPropertyValue("--syntax-tag") === "#ff0000", "applied to the document");
    assert(stored(w, "philogg-custom-syntax-schemes").some(s => s.id === rec.id && s.createdBy === "assistant"), "stored in localStorage");
    assert(d.querySelector("#customSyntaxSchemeList").textContent.includes("Mine"), "list re-rendered");
    const m = llmRun(w, "create_style", { kind: "syntax", styleId: rec.id, colors: { "syntax-string": "#00ff00" } });
    assert(!m.error && T.customSyntaxSchemes.find(s => s.id === rec.id).colors["syntax-string"] === "#00ff00" && T.customSyntaxSchemes.find(s => s.id === rec.id).colors["syntax-tag"] === "#ff0000", "modify keeps the rest");
    const l = llmRun(w, "list_config", { kind: "styles" }).result.syntaxSchemes.find(s => s.id === rec.id);
    assert(l.custom && l.byAssistant && l.active, "listed as custom, assistant's, active");
    const other = llmRun(w, "create_style", { kind: "syntax", name: "Other", activate: false }).result;
    assert(other.saved && T.syntaxSchemeChoice === rec.id, "activate: false keeps the active scheme");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-styles f. delete_config_item theme/syntax: only the assistant's own; active one falls back");
    const t = llmRun(w, "create_style", { kind: "theme", name: "Del", colors: { accent: "#00aa00" } }).result.id;
    const s = llmRun(w, "create_style", { kind: "syntax", name: "DelS" }).result.id;
    assert(w.currentThemeId() === t && T.syntaxSchemeChoice === s, "sanity: both active");
    let r = llmRun(w, "delete_config_item", { kind: "theme", id: "dark" });
    assert(r.error && /built in and belongs to the person/.test(r.error), "built-in theme refused, got " + r.error);
    r = llmRun(w, "delete_config_item", { kind: "syntax", id: "catppuccin-mocha" });
    assert(r.error && /belongs to the person/.test(r.error), "built-in scheme refused, got " + r.error);
    T.customThemes.push({ id: "custom:own", name: "Own", colors: {} });
    T.customSyntaxSchemes.push({ id: "syntax:own", name: "OwnS", colors: {} });
    r = llmRun(w, "delete_config_item", { kind: "theme", id: "custom:own" });
    assert(r.error && /belongs to the person/.test(r.error) && T.customThemes.some(x => x.id === "custom:own"), "the person's own theme refused");
    r = llmRun(w, "delete_config_item", { kind: "syntax", id: "syntax:own" });
    assert(r.error && /belongs to the person/.test(r.error) && T.customSyntaxSchemes.some(x => x.id === "syntax:own"), "the person's own scheme refused");
    r = llmRun(w, "delete_config_item", { kind: "theme", id: t });
    assert(!r.error && r.result.deleted === t && !T.customThemes.some(x => x.id === t), "own theme deleted synchronously");
    assert(w.currentThemeId() !== t && !stored(w, "philogg-custom-themes").some(x => x.id === t), "the active one fell back, removed from localStorage");
    r = llmRun(w, "delete_config_item", { kind: "syntax", id: s });
    assert(!r.error && !T.customSyntaxSchemes.some(x => x.id === s) && T.syntaxSchemeChoice === "follow-theme" && !stored(w, "philogg-custom-syntax-schemes").some(x => x.id === s), "own scheme deleted, selection fell back to Follow app theme");
    assert(/Unknown theme id/.test(llmRun(w, "delete_config_item", { kind: "theme", id: t }).error), "second delete: unknown id");
    assert(!d.querySelector("#customThemeList").textContent.includes("Del"), "list re-rendered");
  });

  await withApp(async (w, d, T) => {
    section("llm-config-styles g. MCP path");
    const answers = [];
    w.philogg = Object.assign(w.philogg || {}, { mcpToolResult: (id, text, isError) => { answers.push({ id, text, isError }); return Promise.resolve(); } });
    w.philoggMcpCall(1, "create_style", { kind: "theme", name: "ViaMcp", colors: { accent: "#123abc" } });
    await waitFor(() => answers.length === 1);
    assert(!answers[0].isError && JSON.parse(answers[0].text).saved === true && T.customThemes.some(t => t.name === "ViaMcp" && t.createdBy === "assistant"), "MCP create_style answered");
    w.philoggMcpCall(2, "create_style", { kind: "theme", name: "Bad", colors: { accent: "nope" } });
    await waitFor(() => answers.length === 2);
    assert(answers[1].isError === true, "errors are flagged");
  });
}
function THEME_KEYS_OK(T, colors) { return T.THEME_COLOR_KEYS.every(k => typeof colors[k] === "string" && colors[k]); }
