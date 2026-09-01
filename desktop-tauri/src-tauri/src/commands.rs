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

/// One watched folder, as `philogg.html`'s folder watch needs it: the path
/// it will list through `list_folder`, and the display name its section
/// header shows (a real `FileSystemDirectoryHandle`'s `name`).
#[derive(serde::Serialize)]
pub struct PickedFolder {
    path: String,
    name: String,
}

impl PickedFolder {
    pub(crate) fn new(path: &std::path::Path) -> Self {
        PickedFolder {
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string_lossy().to_string()),
            path: path.to_string_lossy().to_string(),
        }
    }
}

/// "Open… → Folder…" under this wrapper — the folder-watch counterpart of
/// `pick_files`, and the reason the feature works here at all.
///
/// `philogg.html`'s own route is `showDirectoryPicker()`, which is a webview
/// API and therefore subject to the *engine's* rules: Chromium refuses a
/// directory handle for anything on its hardcoded sensitive-directory list
/// (Desktop, Downloads, …) with a "contains system files" error, and no
/// embedder switch turns that off — not in Tauri, not in WebView2. WKWebView
/// and WebKitGTK don't implement the API at all, so off Windows there was no
/// folder watch here in the first place. Listing the folder from Rust
/// sidesteps both: the OS dialog has no blocklist, and neither does
/// `read_dir`. Async for the same reason `pick_files` is.
#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Option<PickedFolder> {
    app.dialog()
        .file()
        .set_title("Watch folder for log files")
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| PickedFolder::new(&p))
}

/// The listing half of the folder watch: the folder's own immediate entries
/// (non-recursive, matching `philogg.html`'s `scanFolderHandle`), filtered
/// by the extensions the *page* considers loadable — that list is the page's
/// knowledge (`FOLDER_WATCH_EXTENSIONS`), so it travels in rather than being
/// duplicated here. Each match is registered like any other file this
/// wrapper opens, so it arrives with both its `philogg://local/…` URL (which
/// doubles as its tail handle) and its real path.
///
/// Called on every scan tick, hence `register_local_file`'s path dedupe.
/// An IO error (folder deleted, renamed, or unreadable) comes back as `Err`,
/// which the page already handles: `rescanFolder`'s catch marks the folder
/// failed.
///
/// The path comes from the page rather than from the OS, unlike every other
/// route here. That is unavoidable — a watched folder has to survive a
/// restart, and after one the only place its path still exists is the page's
/// own IndexedDB record — and it is no widening of what the page can already
/// reach: `reveal_path` takes a page-supplied path too, and the page is this
/// wrapper's own content served from its own scheme, never remote.
#[tauri::command]
pub fn list_folder(
    app: AppHandle,
    path: String,
    extensions: Vec<String>,
) -> Result<Vec<LocalFile>, String> {
    let exts: Vec<String> = extensions.iter().map(|e| e.to_lowercase()).collect();
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let entry_path = entry.path();
        // `entry.path().is_file()` and not `entry.file_type()`: the latter
        // describes the symlink itself, and a symlinked log file is a real
        // one as far as reading it goes.
        if !entry_path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if !exts.is_empty() && !exts.iter().any(|e| name.ends_with(e)) {
            continue;
        }
        paths.push(entry_path);
    }
    // The page sorts the listing itself; sorted here too so a scan tick
    // yields a stable order regardless of what the filesystem hands back.
    paths.sort();
    let state = app.state::<AppState>();
    Ok(paths.iter().map(|p| LocalFile::register(&state, p)).collect())
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
