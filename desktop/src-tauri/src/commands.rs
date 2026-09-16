//! Everything the injected script (`inject.rs`) can call.
//!
//! A wrapper's own `#[tauri::command]`s need no ACL entry — only core and
//! plugin commands do — so `capabilities/default.json` stays down to
//! `core:default`, and the page gets exactly this surface and nothing else.
//! That still holds for the `dialog` plugin added here: it is driven from
//! Rust (`pick_files`), never invoked from the page, exactly like `opener`.
//! Deliberately narrow: the file/folder routes the page cannot take itself,
//! plus the few window actions a webview has no native say over (maximize,
//! minimize, close, and the injected window controls).
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};

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
///
/// `mtime` (milliseconds since the Unix epoch, same units as a `File`
/// object's `lastModified`) is `None` only when the filesystem can't report
/// one (a `metadata()` error, or a platform with no mtime at all) — the page
/// falls back to name-order sorting for that file only (scanFolderHandle).
/// Populated here rather than making the page fetch the file just to ask its
/// `lastModified`: that round-trip fetches real content over the
/// `philogg://local/…` scheme for nothing, and — the reason this field
/// exists at all — the resulting `Blob` has no `lastModified` in the first
/// place, so that fetch bought scanFolderHandle's "newest" sort nothing.
#[derive(serde::Serialize)]
pub struct LocalFile {
    url: String,
    path: String,
    name: String,
    mtime: Option<u64>,
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
            mtime: file_mtime_millis(path),
        }
    }
}

/// A file's modification time in the same shape as JS `Date.now()`/a
/// `File`'s `lastModified`: milliseconds since the Unix epoch. `None` on any
/// failure (missing file, permission error, a filesystem that doesn't track
/// mtime) — never fatal to the caller, just a name-order sort for that file.
fn file_mtime_millis(path: &std::path::Path) -> Option<u64> {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

/// "Open… → File(s)…" under this wrapper. No system webview resolves a
/// `File` object back to its OS path, so the page's own in-page picker can
/// only ever produce pathless files; the OS dialog has to run out here
/// instead — that is the only way a picked file arrives with its
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

/// The subfolder half of `list_folder`'s non-recursive walk: this directory's
/// immediate subdirectories, so the page's own `scanFolderHandle` recursion
/// (`philogg.html`, gated on `settings.includeSubfolders`) has something to
/// recurse into. `nativeDirHandle.values()` calls this alongside `list_folder`
/// and yields each result as a fresh nested `nativeDirHandle`, which is why a
/// native (Tauri) watched folder's "Include subfolders" used to be a silent
/// no-op — `list_folder` only ever returned files, so `walk()` never found a
/// directory entry to descend into.
#[tauri::command]
pub fn list_subfolders(path: String) -> Result<Vec<PickedFolder>, String> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let entry_path = entry.path();
        // `entry_path.is_dir()`, not `entry.file_type()`, for the same
        // symlink reason as list_folder's `is_file()` check above.
        if entry_path.is_dir() {
            out.push(PickedFolder::new(&entry_path));
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
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

/// ZIP-sources refinement (item 3, this session): a non-log entry extracted
/// from an opened ZIP (philogg.html's openZipEntryExternally) has only its
/// bytes in memory — extract() never writes to disk — so this writes them
/// to a fresh temp file and hands that path to `tauri-plugin-opener`'s
/// `open_path`, the same plugin `reveal_path`/`reveal_local_url` above
/// already depend on (no new crate needed). The temp file keeps the entry's
/// own basename (not its full in-archive relative path, and sanitized down
/// to just the basename so a malicious/unusual entry name can't escape the
/// per-call temp subdirectory) so the OS's extension-based app resolution
/// still works, and lives under a subdirectory unique per call (process id +
/// a monotonic counter, no random/uuid dependency needed) so two same-named
/// entries opened back to back — or from two different archives — never
/// collide. Deliberately left behind afterward: the OS app that opens it may
/// still be reading long after this command returns, same lifetime
/// tradeoff every other use of `std::env::temp_dir()` in this file accepts.
static OPEN_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);
#[tauri::command]
pub fn open_extracted_entry(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    let basename = std::path::Path::new(&name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "file".to_string());
    let id = OPEN_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("philogg-zip-open-{}-{}", std::process::id(), id));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(basename);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| e.to_string())
}

/// Clickable-local-path feature: checks whether an absolute path the page
/// found in a log line actually exists on this machine before offering it
/// as a link. `std::fs::metadata` is a single syscall — safe to call on
/// hover with no debounce concerns on the Rust side.
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::fs::metadata(&path).is_ok()
}

/// Clickable-local-path feature's "Open file" action — the file-itself
/// counterpart of `reveal_path`'s "Open containing folder".
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_system_fonts(state: State<'_, AppState>) -> Vec<String> {
    let mut cache = state.fonts.lock().expect("fonts poisoned");
    cache.get_or_insert_with(crate::fonts::list).clone()
}

/// IDE Integration's "Connect" picker: every running Visual Studio instance
/// found in the Running Object Table, with whichever solution each has open.
/// See `vs_integration.rs`. `async` so a slow/hung `powershell` invocation
/// can't stall the webview's IPC callback.
#[tauri::command]
pub async fn vs_list_instances() -> Vec<crate::vs_integration::VsInstance> {
    crate::vs_integration::list_instances()
}

/// IDE Integration's "Open in Visual Studio" action: asks the connected
/// instance (by the moniker `vs_list_instances` handed back) to open `path`
/// at `line` and come to the foreground. See `vs_integration.rs`.
#[tauri::command]
pub async fn vs_open_file(moniker: String, path: String, line: u32) -> Result<(), String> {
    crate::vs_integration::open_file(&moniker, &path, line)
}

#[tauri::command]
pub fn window_minimize(window: Window) {
    let _ = window.minimize();
}

/// The single maximize/restore route, shared by the injected `<->`/rectangle
/// window-control button, F11, and a double-click on the toolbar's drag
/// region — all three toggle the SAME native maximize state, so dragging a
/// maximized window restores it under the cursor the same way whichever
/// trigger entered it. (Person-requested: F11/double-click were previously
/// a separate borderless-fullscreen, whose "restore on drag" had to be
/// hand-rolled and never felt like the native maximize.)
#[tauri::command]
pub fn window_toggle_maximize(window: Window) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

/// Focus Mode's fullscreen half (`FEATURE_BACKLOG.md` #66). Real OS
/// fullscreen is a Tauri-only capability — the plain browser build has no
/// `window.philogg` and never reaches this — driven from the page's
/// `toggleFocusMode()` through `window.philogg.setFullscreen`. Deliberately
/// distinct from `window_toggle_maximize` (F11's previous meaning): Focus Mode
/// wants true borderless fullscreen, and the page owns the enter/leave
/// decision so the shortcut stays rebindable in its Shortcut Manager.
#[tauri::command]
pub fn window_set_fullscreen(window: Window, enabled: bool) {
    let _ = window.set_fullscreen(enabled);
}

/// Goes through the window's own close request rather than hiding directly,
/// so the injected close button lands on exactly the same close-to-tray
/// decision as the OS's own close would (see `main.rs`).
#[tauri::command]
pub fn window_close(window: Window) {
    let _ = window.close();
}

/// Called by the injected script once `philogg.html` has actually painted,
/// which is the point the splash can be dismissed. Tauri has no
/// "first paint" event of its own, so the page reports it (see `inject.js`).
#[tauri::command]
pub fn app_ready(app: AppHandle) {
    windows::dismiss_splash(&app);
    windows::flush_pending_local(&app);
}

/// The page's exit half of PiP (see philogg.html's `jumpAfterPip`): restores
/// the full window before a "jump to another view" interaction runs its
/// reveal. `async` so the invoke resolves as a promise the page can `.then()`
/// off — the ordering is load-bearing: the command only resolves after
/// `windows::exit_pip` has applied the geometry restore, so the reveal's
/// scroll/anchor math runs against the restored (full-size) viewport rather
/// than the small PiP one.
#[tauri::command]
pub async fn pip_exit(app: AppHandle) {
    windows::exit_pip(&app);
}

/// The injected diagonal `<->` button's enter half (see `inject.js`): shrinks
/// the window into picture-in-picture. `async` for the same reason as
/// `pip_exit` — keeps the whole PiP surface off the WebView2 IPC callback's
/// own call stack.
#[tauri::command]
pub async fn pip_enter(app: AppHandle) {
    windows::enter_pip(&app);
}

/// The mini window's X button: ends picture-in-picture (restoring the full
/// window) and then minimizes it, so the app goes back to the taskbar showing
/// the full view rather than quitting — the exact inverse of `pip_enter`.
/// Restore-before-minimize ordering matters: `exit_pip` restores the geometry
/// first, so a later restore from the taskbar lands on the full-size window.
#[tauri::command]
pub async fn pip_minimize(app: AppHandle) {
    windows::exit_pip(&app);
    if let Some(window) = app.get_webview_window(windows::MAIN) {
        let _ = window.minimize();
    }
}
