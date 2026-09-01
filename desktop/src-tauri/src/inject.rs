//! Everything this wrapper adds to the **unmodified** `philogg.html`.
//!
//! Two kinds of injection are needed: things that must exist before the
//! page's own top-level script runs (the settings snapshot, the `fetch`
//! shim, the `window.philogg` bridge) and things that need the DOM (the
//! window controls, the drag region). Tauri's `initialization_script` covers
//! both cases in one place: it runs before any page script *and* re-runs on every
//! navigation, so the DOM-dependent half just waits for `DOMContentLoaded`
//! itself and survives a reload (which the "Clear Cache" tray action does)
//! with no re-injection hook needed on the Rust side.
//!
//! `philogg.html` is never edited — same rule as `desktop/`.
use std::collections::BTreeMap;

const TEMPLATE: &str = include_str!("inject.js");

/// Builds the per-window script. `settings` is baked in as a literal rather
/// than fetched over IPC because the page reads many `philogg-*` keys once,
/// synchronously, at top-level script parse — see `settings.rs`.
pub fn script(settings: &BTreeMap<String, String>, nonce: &str, base_url: &str) -> String {
    let settings_json = serde_json::to_string(settings).unwrap_or_else(|_| "{}".to_string());
    TEMPLATE
        .replace("__PHILOGG_SETTINGS__", &settings_json)
        .replace("__PHILOGG_NONCE__", nonce)
        .replace("__PHILOGG_BASE__", base_url)
        .replace("__PHILOGG_IS_MAC__", if cfg!(target_os = "macos") { "true" } else { "false" })
}
