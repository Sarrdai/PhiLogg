//! `FEATURE_BACKLOG.md` #33: mirror `philogg.html`'s `philogg-*`
//! `localStorage` keys into a plain, human-editable `settings.json` in a
//! well-known config directory, without touching `philogg.html` itself.
//!
//! Two halves, with different timing constraints. The *read* half must land
//! before `philogg.html`'s own top-level script runs (many `philogg-*` keys
//! are read once, synchronously, at script parse). The values are already
//! known to the Rust side at window-creation time, so they are baked
//! straight into the window's initialization script as a JSON literal — no
//! IPC, no preload, and nothing that can race the page. The *write* half
//! polls instead (see `inject.rs`), since writes only ever happen later, in
//! response to a user action.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// The config directory this wrapper owns. Deliberately **not** the
/// identifier-derived `app_config_dir()` (`com.kleinphilipp.philogg`)
/// but a plain, readable name, so `settings.json` is findable by hand.
/// See `desktop/README.md`.
pub fn config_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    use tauri::Manager;
    let base = app
        .path()
        .config_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("PhiLogg")
}

/// Missing file (first run) or corrupt/hand-edited JSON both start clean
/// rather than crash — `philogg.html` then falls back to its own defaults,
/// exactly as on a first run.
pub fn read(path: &Path) -> BTreeMap<String, String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return BTreeMap::new();
    };
    serde_json::from_str::<BTreeMap<String, serde_json::Value>>(&text)
        .map(|parsed| {
            parsed
                .into_iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

pub fn write(path: &Path, values: &BTreeMap<String, String>) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(values) {
        let _ = std::fs::write(path, json);
    }
}
