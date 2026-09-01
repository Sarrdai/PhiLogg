//! Everything the injected script (`inject.rs`) can call.
//!
//! A wrapper's own `#[tauri::command]`s need no ACL entry — only core and
//! plugin commands do — so `capabilities/default.json` stays down to
//! `core:default`, and the page gets exactly this surface and nothing else.
//! That still holds for the `dialog` plugin added here: it is driven from
//! Rust (`pick_files`), never invoked from the page, exactly like `opener`.
//! That is the same deliberately narrow bridge `desktop/preload.js` is, plus
//! the few window actions Tauri needs a round-trip for that Electron got
//! natively (fullscreen, and the injected window controls).
use std::collections::BTreeMap;
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, State, Window};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::state::{AppState, CLOSE_TO_TRAY_KEY};
use crate::{settings, windows};

/// The write half of the settings mirror (see `settings.rs`). Called by the
/// injected poll only when its own diff says something actually changed, and
/// diffed again here so a rewritten-but-identical dump never touches disk.
#[tauri::command]
pub fn save_settings(values: BTreeMap<String, String>, state: State<'_, AppState>) {
    // `philogg-close-to-tray` is cached the moment it arrives so the window's
    // close handler can answer without reaching back into the page.
    state.close_to_tray.store(
        values
            .get(CLOSE_TO_TRAY_KEY)
            .map(|v| v != "0")
            .unwrap_or(true),
        Ordering::Relaxed,
    );
    let json = serde_json::to_string(&values).unwrap_or_default();
    let mut last = state.last_settings.lock().expect("last_settings poisoned");
    if last.as_deref() == Some(json.as_str()) {
        return;
    }
    *last = Some(json);
    settings::write(&state.settings_path, &values);
}

/// `FEATURE_BACKLOG.md` #52 ("Open File Location"), path half — the file
/// came from a `File` object whose real path the page already knows.
#[tauri::command]
pub fn reveal_path(app: AppHandle, path: String) {
    if path.is_empty() {
        return;
    }
    let _ = app.opener().reveal_item_in_dir(path);
}

/// One file the wrapper opened on the page's behalf: the URL it is served
/// under, plus the real path that URL stands for. Both halves matter —
/// `philogg.html` loads (and tails) the URL, and needs the path for
/// "Open File Location"/"Copy Path".
#[derive(serde::Serialize)]
pub struct LocalFile {
    url: String,
    path: String,
    name: String,
}

impl LocalFile {
    pub(crate) fn register(state: &AppState, path: &std::path::Path) -> Self {
        LocalFile {
            url: state.register_local_file(path),
            path: path.to_string_lossy().to_string(),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string_lossy().to_string()),
        }
    }
}

/// "Open… → File(s)…" under this wrapper. Electron can let `philogg.html`
/// run its own in-page picker and still resolve each `File` back to a path
/// afterwards (`webUtils`); no system webview can, so the OS dialog has to
/// run out here — that is the only way a picked file arrives with its
/// location still attached. `philogg.html`'s own picker stays in place for
/// every other build; see its `openFilesPicker`.
///
/// Async on purpose: `blocking_pick_files` parks the calling thread until
/// the dialog closes, which would deadlock the main thread. Async commands
/// run on Tauri's worker pool instead.
#[tauri::command]
pub async fn pick_files(app: AppHandle) -> Vec<LocalFile> {
    let picked = app
        .dialog()
        .file()
        .set_title("Open log files")
        .add_filter("Log files", &["log", "txt"])
        .add_filter("All files", &["*"])
        .blocking_pick_files();
    let state = app.state::<AppState>();
    picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .map(|p| LocalFile::register(&state, &p))
        .collect()
}

/// "Copy Path" for a file the page knows only by its `philogg://local/…`
/// URL (a file-association open) — same id -> path lookup `reveal_local_url`
/// does, but handing the answer back instead of acting on it.
#[tauri::command]
pub fn path_for_local_url(app: AppHandle, url: String) -> Option<String> {
    app.state::<AppState>()
        .local_file_for_url(&url)
        .map(|p| p.to_string_lossy().to_string())
}

/// #52's other half: a `philogg://local/<id>/…` file is known to the page
/// only by that URL, so the id -> path lookup has to happen here.
#[tauri::command]
pub fn reveal_local_url(app: AppHandle, url: String) {
    let state = app.state::<AppState>();
    if let Some(path) = state.local_file_for_url(&url) {
        let _ = app.opener().reveal_item_in_dir(path.to_string_lossy().to_string());
    }
}

#[tauri::command]
pub fn list_system_fonts(state: State<'_, AppState>) -> Vec<String> {
    let mut cache = state.fonts.lock().expect("fonts poisoned");
    cache.get_or_insert_with(crate::fonts::list).clone()
}

/// `FEATURE_BACKLOG.md` #31/#36: F11 flips the same native fullscreen state
/// the window's own maximize control uses, so either one can exit what the
/// other entered. Electron catches the key in the main process via
/// `before-input-event`; a Tauri webview has no equivalent hook, so the key
/// is caught in the page (see `inject.rs`) and routed here.
#[tauri::command]
pub fn toggle_fullscreen(window: Window) {
    let current = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!current);
}

#[tauri::command]
pub fn window_minimize(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_toggle_maximize(window: Window) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

/// Goes through the window's own close request rather than hiding directly,
/// so the injected close button lands on exactly the same close-to-tray
/// decision as the OS's own close would (see `main.rs`).
#[tauri::command]
pub fn window_close(window: Window) {
    let _ = window.close();
}

/// Called by the injected script once `philogg.html` has actually painted,
/// which is the point the splash can be dismissed — the equivalent of
/// Electron's `"ready-to-show"`, which Tauri has no counterpart for.
#[tauri::command]
pub fn app_ready(app: AppHandle) {
    windows::dismiss_splash(&app);
}
