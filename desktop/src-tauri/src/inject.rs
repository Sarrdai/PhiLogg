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
use crate::formats::ProvidedFile;
use std::collections::BTreeMap;

const TEMPLATE: &str = include_str!("inject.js");

/// Builds the per-window script. `settings` is baked in as a literal rather
/// than fetched over IPC because the page reads many `philogg-*` keys once,
/// synchronously, at top-level script parse — see `settings.rs`.
pub fn script(
    settings: &BTreeMap<String, String>,
    nonce: &str,
    base_url: &str,
    provided_formats: &[ProvidedFile],
) -> String {
    let settings_json = serde_json::to_string(settings).unwrap_or_else(|_| "{}".to_string());
    // The page uses this list instead of fetching `formats/index.json` (see
    // `formats.rs`). `</` and U+2028/2029 are escaped so the literal is safe
    // wherever the script ends up.
    let formats_json = serde_json::to_string(provided_formats)
        .unwrap_or_else(|_| "[]".to_string())
        .replace("</", "<\\/")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");
    TEMPLATE
        .replace("__PHILOGG_SETTINGS__", &settings_json)
        .replace("__PHILOGG_NONCE__", nonce)
        .replace("__PHILOGG_BASE__", base_url)
        .replace("__PHILOGG_IS_MAC__", if cfg!(target_os = "macos") { "true" } else { "false" })
        .replace("__PHILOGG_IS_WINDOWS__", if cfg!(target_os = "windows") { "true" } else { "false" })
        // Last: file text must never be scanned for the placeholders above.
        .replace("__PHILOGG_PROVIDED_FORMATS__", &format!("window.__PHILOGG_PROVIDED_FORMATS__ = {};", formats_json))
}

#[cfg(test)]
mod tests {
    use super::script;
    use crate::formats::ProvidedFile;
    use std::collections::BTreeMap;

    #[test]
    fn script_bakes_in_the_provided_formats_literal() {
        let files = vec![ProvidedFile {
            name: "a.logformat.json".into(),
            source: "C:\\formats\\a.logformat.json".into(),
            text: "{\"x\":\"</script>\u{2028}\"}".into(),
        }];
        let js = script(&BTreeMap::new(), "n", "philogg://app", &files);
        assert!(js.contains("window.__PHILOGG_PROVIDED_FORMATS__ = [{\"name\":\"a.logformat.json\""));
        assert!(!js.contains("</script>") && !js.contains('\u{2028}'));
        assert!(!js.contains("__PHILOGG_PROVIDED_FORMATS__\n(function"), "placeholder replaced");
        let none = script(&BTreeMap::new(), "n", "philogg://app", &[]);
        assert!(none.contains("window.__PHILOGG_PROVIDED_FORMATS__ = [];"));
    }
}
