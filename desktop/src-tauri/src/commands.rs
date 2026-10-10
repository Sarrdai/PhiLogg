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

use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, State, Window};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::pathguard;
use crate::state::{AppState, CLOSE_TO_TRAY_KEY};
use crate::windows;

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
    // Never written here: this command runs on the main thread — see
    // `settings::spawn_writer`.
    let _ = state.settings_writer.send(values);
}

/// Paints the native window (and the webview underneath the page) in the
/// page's own background color. That color is what shows in the strip a
/// resize uncovers before the webview has caught up with the new size —
/// hard-coded dark, it flashed dark bands around a light theme. Sent by
/// `inject.js` whenever the page's theme changes.
#[tauri::command]
pub fn set_window_background(window: tauri::WebviewWindow, rgb: [u8; 3]) {
    let _ = window.set_background_color(Some(tauri::window::Color(rgb[0], rgb[1], rgb[2], 0xff)));
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
        .add_filter("Log files", &["log", "txt", "gz"])
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
#[tauri::command(async)]
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
#[tauri::command(async)]
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

/// Native parsing (`window.philogg.parseLogFile`): reads the registered file
/// behind a `philogg://local/…` URL — the same id -> path lookup the
/// protocol handler does, so the page can't name an arbitrary path — and
/// parses it under `format` (the page's own `nativeFormatSpec`) on every core
/// via `philogg-logparse`, streaming the entries back over `on_event`:
/// `{type:"progress", fraction}` JSON while parsing, then the entries as
/// binary batches in file order (`logparse::batch` has the layout — JSON
/// batches were the first version and cost several times the parse itself).
///
/// Errors come back before anything is streamed (the format is compiled
/// first), which is what lets the page fall back to its own parser cleanly
/// — that is the designed outcome for a regex construct the native engine
/// can't run with JS semantics (lookaround, backreferences).
#[tauri::command]
pub async fn parse_log_file(
    app: AppHandle,
    url: String,
    format: philogg_logparse::FormatSpec,
    on_event: Channel,
) -> Result<ParseSummary, String> {
    let path = app
        .state::<AppState>()
        .local_file_for_url(&url)
        .ok_or_else(|| format!("not a local file: {url}"))?;
    tauri::async_runtime::spawn_blocking(move || parse_and_stream(&path, &format, &on_event))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
pub struct ParseSummary {
    /// Bytes read — the page's tail offset for the file.
    size: u64,
}

/// Share of the row's progress bar spent parsing; delivering the batches
/// fills the rest.
const PARSE_SHARE: f64 = 0.4;
const BATCH_ENTRIES: usize = 25_000;

fn parse_and_stream(
    path: &std::path::Path,
    format: &philogg_logparse::FormatSpec,
    channel: &Channel,
) -> Result<ParseSummary, String> {
    use philogg_logparse as lp;
    let parser = lp::Parser::new(format)?;
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    // A gzip-compressed log (`app.log.1.gz`) is inflated page-side: reject it
    // before anything is streamed, which sends the page down its ordinary
    // read + parse fallback (docs/desktop.md -> "Native parsing").
    if lp::is_gzip(&bytes) {
        return Err("gzip-compressed file: parsed by the page".into());
    }
    let size = bytes.len() as u64;
    let text = lp::decode(&bytes, &format.encoding);
    drop(bytes);

    let send = |json: String| channel.send(InvokeResponseBody::Json(json)).map_err(|e| e.to_string());
    // Parsing reports from worker threads; only every ~5% reaches the page.
    let reported = AtomicU64::new(0);
    let entries = lp::parse_text(&text, &parser, lp::DEFAULT_CHUNK_BYTES, &|done, total| {
        let pct = (done * 100 / total.max(1)) as u64;
        let prev = reported.load(Ordering::Relaxed);
        if pct >= prev + 5 && reported.compare_exchange(prev, pct, Ordering::Relaxed, Ordering::Relaxed).is_ok() {
            let fraction = PARSE_SHARE * pct as f64 / 100.0;
            let _ = send(format!(r#"{{"type":"progress","fraction":{fraction}}}"#));
        }
    });
    drop(text);
    lp::batch::for_each_batch(&entries, BATCH_ENTRIES, PARSE_SHARE, &mut |bytes| {
        channel.send(InvokeResponseBody::Raw(bytes)).map_err(|e| e.to_string())
    })?;
    Ok(ParseSummary { size })
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
///
/// The entry name is archive content, i.e. attacker-controlled, and the OS
/// opener RUNS executables and scripts — so an executable type
/// (`pathguard::is_executable_content`, judged on the basename that would be
/// written) is refused before anything touches the temp dir.
static OPEN_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);
#[tauri::command(async)]
pub fn open_extracted_entry(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    let basename = std::path::Path::new(&name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "file".to_string());
    if pathguard::is_executable_content(&basename) {
        return Err(format!("Refusing to open executable content from an archive: {basename}"));
    }
    let id = OPEN_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("philogg-zip-open-{}-{}", std::process::id(), id));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(basename);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| e.to_string())
}

/// "Save…" for every file the page writes (session, filter, Export / Share,
/// CSV, plot image, themes, …). WKWebView and WebKitGTK have no
/// `showSaveFilePicker`, so the page's own route ends in an `<a download>`,
/// and that goes nowhere useful here: wry cancels the download on macOS when
/// the app registers no download handler, and WebKitGTK writes it silently
/// into the XDG Downloads folder (or the process's working directory when
/// none is configured) without ever asking. So the OS save dialog runs out
/// here, like `pick_files`, and Rust writes the bytes to the path it chose —
/// the page never names a path, so this is no general write access.
///
/// The bytes arrive as the raw IPC body (no JSON number array — exports can
/// be tens of MB); the suggested name, the filter's description and the
/// extension as URI-encoded headers. Returns the saved file's name, `None`
/// when the dialog was cancelled, `Err` when writing failed.
#[tauri::command]
pub async fn save_file(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("save_file expects raw bytes".into());
    };
    let header = |key: &str| {
        request
            .headers()
            .get(key)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| urlencoding::decode(v).ok())
            .map(|v| v.into_owned())
            .unwrap_or_default()
    };
    let (name, description, ext) = (header("x-philogg-name"), header("x-philogg-description"), header("x-philogg-ext"));
    let mut dialog = app.dialog().file().set_title("Save").set_file_name(&name);
    let ext = ext.trim_start_matches('.');
    if !ext.is_empty() {
        dialog = dialog.add_filter(description, &[ext]);
    }
    let Some(path) = dialog.blocking_save_file().and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()))
}

/// Clickable-local-path feature: checks whether an absolute path the page
/// found in a log line actually exists on this machine before offering it
/// as a link. `std::fs::metadata` is a single syscall, but on a network path
/// that is a round trip — `async` keeps it (like every command here that
/// touches a page-supplied path) off the main thread, which a plain
/// `#[tauri::command]` runs on, so a slow share can't freeze the window.
///
/// That round trip is also the attack: the page checks every path-looking
/// string on every rendered row, and a UNC path in a hostile log
/// (`\\attacker.example\share\x`) makes Windows connect and send the user's
/// NTLM hash — without any click. So a remote path (`pathguard::is_remote_path`)
/// answers `false` here without touching the filesystem, unless the caller
/// passes `allow_remote` (the page's `{ allowRemote: true }`): only the IDE
/// integration does, for source files on a share built from the connected
/// IDE's own solution path, never for a candidate taken from log text.
/// `Option` so an older page that sends no flag means "not allowed".
#[tauri::command(async)]
pub fn path_exists(path: String, allow_remote: Option<bool>) -> bool {
    if pathguard::is_remote_path(&path) && !allow_remote.unwrap_or(false) {
        return false;
    }
    std::fs::metadata(&path).is_ok()
}

/// Clickable-local-path feature's "Open file" action — the file-itself
/// counterpart of `reveal_path`'s "Open containing folder". Also carries the
/// IDE integration's `jetbrains://rider/...` deep link (a URI, not a file).
///
/// The OS opener RUNS executables and scripts instead of showing them, and the
/// path comes from log text, so `pathguard::check_open_target` refuses
/// executable types and every URI scheme but the allow-listed `jetbrains`.
/// A remote (UNC) path is still allowed: the user chose to click it, and the
/// credential-leaking probe is cut off earlier, at `path_exists`.
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    pathguard::check_open_target(&path)?;
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

/// Clickable-local-path feature's "Open here" action: registers a path the
/// page found in a log line the same way `pick_files`/`list_folder` register
/// theirs, so the page can load it straight into the tree (via its own
/// `loadDesktopLocalFiles`) instead of handing it to the OS opener. Only
/// offered for a path `philogg.html` already considers a loadable log format
/// (`isCompatibleFolderFile`), but `path_exists` may be stale by the time this
/// runs, so it's re-checked here rather than trusted.
#[tauri::command(async)]
pub fn open_local_path(app: AppHandle, path: String) -> Result<LocalFile, String> {
    let p = std::path::PathBuf::from(&path);
    if !p.is_file() {
        return Err(format!("\"{}\" no longer exists", path));
    }
    let state = app.state::<AppState>();
    Ok(LocalFile::register(&state, &p))
}

#[tauri::command]
pub fn list_system_fonts(state: State<'_, AppState>) -> Vec<String> {
    let mut cache = state.fonts.lock().expect("fonts poisoned");
    cache.get_or_insert_with(crate::fonts::list).clone()
}

/// IDE Integration's "Connect" picker: every running Visual Studio instance
/// found in the Running Object Table, with whichever solution each has open
/// — plus a diagnostic message when the PowerShell/COM side itself failed,
/// so the Settings dialog can show the real reason instead of a generic
/// "none found" that's indistinguishable from "Visual Studio really isn't
/// running." See `vs_integration.rs`. `async` so a slow/hung `powershell`
/// invocation can't stall the webview's IPC callback.
#[tauri::command]
pub async fn vs_list_instances() -> crate::vs_integration::VsListResult {
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
/// which is the point a cold-launch `.zip`/folder open that had to wait for
/// the page can be handed over (see `windows::open_local`). Tauri has no
/// "first paint" event of its own, so the page reports it (see `inject.js`).
#[tauri::command]
pub fn app_ready(app: AppHandle) {
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

/// `inject.js`'s measurement of the PiP strip (view switcher + its two
/// buttons) in logical pixels: the mini window's minimum width.
#[tauri::command]
pub async fn pip_set_min_width(app: AppHandle, width: f64) {
    windows::set_pip_min_width(&app, width);
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

/// LLM assistant (`docs/llm-assistant.md`): the model list of the local
/// OpenAI-compatible server behind `base_url` (LM Studio's `/v1/models`).
/// `philogg-llm` refuses anything but a loopback URL.
#[tauri::command]
pub async fn llm_models(base_url: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || philogg_llm::list_models(&base_url))
        .await
        .map_err(|e| e.to_string())?
}

/// LLM assistant: LM Studio's native `/api/v0/models` (model state and
/// context lengths — the chat's context bar), passed through as JSON.
#[tauri::command]
pub async fn llm_model_details(base_url: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || philogg_llm::model_details(&base_url))
        .await
        .map_err(|e| e.to_string())?
}

/// LLM assistant: one chat-completions request (`request` is the page's own
/// OpenAI-shaped JSON, normally streaming). Every SSE chunk reaches the page
/// as `{type: "chunk", data}` over `on_event`, a non-streamed answer as
/// `{type: "message", data}`; the page assembles text and tool calls itself.
/// Resolves once the answer is complete, rejects with the reason otherwise
/// (unreachable server, HTTP error, dropped connection, "cancelled").
/// `request_id` is the page's own id, the handle `llm_cancel` takes.
#[tauri::command]
pub async fn llm_chat(
    app: AppHandle,
    request_id: String,
    base_url: String,
    request: serde_json::Value,
    on_event: Channel,
) -> Result<(), String> {
    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    app.state::<AppState>()
        .llm_requests
        .lock()
        .expect("llm_requests poisoned")
        .insert(request_id.clone(), cancel.clone());
    let body = request.to_string();
    let result = tauri::async_runtime::spawn_blocking(move || {
        philogg_llm::stream_chat(&base_url, &body, &cancel, &mut |event| {
            let (kind, data) = match event {
                philogg_llm::ChatEvent::Chunk(d) => ("chunk", d),
                philogg_llm::ChatEvent::Message(d) => ("message", d),
            };
            // The payload is JSON text from the server; one that doesn't
            // parse travels as a string so the page can report it.
            let data: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::Value::String(data));
            let msg = serde_json::json!({ "type": kind, "data": data }).to_string();
            on_event.send(InvokeResponseBody::Json(msg)).map_err(|e| e.to_string())
        })
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    app.state::<AppState>()
        .llm_requests
        .lock()
        .expect("llm_requests poisoned")
        .remove(&request_id);
    result
}

/// LLM assistant: the chat's Stop button. The request's socket read notices
/// within ~200 ms (`philogg-llm`'s poll interval) and drops the connection,
/// which also stops the server's generation.
#[tauri::command]
pub fn llm_cancel(request_id: String, state: State<'_, AppState>) {
    if let Some(flag) = state.llm_requests.lock().expect("llm_requests poisoned").get(&request_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// The LLM assistant's chat window (`windows.rs`): `"show"` (create on first
/// use, else show + focus), `"hide"`, `"alwaysOnTop"` with `on`, and
/// `"focusMain"` (a reference clicked in the chat brings the log forward).
/// `async` so the window is built off the IPC callback's stack — the same
/// precaution `pip_enter` takes (tauri-apps/wry#583 deadlocked a window
/// created from a synchronous command on Windows).
#[tauri::command]
pub async fn llm_chat_window(app: AppHandle, action: String, on: Option<bool>) {
    match action.as_str() {
        "show" => windows::show_chat(&app),
        "hide" => windows::hide_chat(&app),
        "alwaysOnTop" => windows::set_chat_on_top(&app, on.unwrap_or(false)),
        "focusMain" => windows::focus_main(&app),
        _ => {}
    }
}

/// Chat window → main window: the chat is a thin view, every command it
/// sends is handled by philogg.html's `philoggLlmViewMessage`.
#[tauri::command]
pub fn llm_view_to_main(app: AppHandle, msg: serde_json::Value) {
    if let Some(main) = app.get_webview_window(windows::MAIN) {
        let _ = main.eval(&format!("window.philoggLlmViewMessage && window.philoggLlmViewMessage({msg})"));
    }
}

/// Main window → chat window (a snapshot, a "changed" note, streamed text).
/// A no-op while the chat window doesn't exist.
#[tauri::command]
pub fn llm_main_to_view(app: AppHandle, msg: serde_json::Value) {
    if let Some(chat) = app.get_webview_window(windows::CHAT) {
        let _ = chat.eval(&format!("window.philoggChatReceive && window.philoggChatReceive({msg})"));
    }
}

/// What the page sends to `mcp_configure` (`window.philogg.mcpConfigure`).
#[derive(serde::Deserialize)]
pub struct McpConfig {
    enabled: bool,
    port: u32,
    token: String,
    tools: serde_json::Value,
}

/// What `mcp_configure` / `mcp_status` answer with.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    listening: bool,
    port: Option<u16>,
    calls: u64,
    /// Epoch milliseconds.
    last_call_at: Option<u64>,
    last_client: Option<String>,
    error: Option<String>,
}

/// How long an MCP `tools/call` waits for the page before it answers with
/// an error result.
const MCP_CALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

fn mcp_status_of(mcp: &crate::state::McpState) -> McpStatus {
    let stats = mcp.server.as_ref().map(|s| s.stats());
    McpStatus {
        listening: mcp.server.is_some(),
        port: mcp.server.as_ref().map(|s| s.port()),
        calls: stats.as_ref().map_or(0, |s| s.calls),
        last_call_at: stats
            .as_ref()
            .and_then(|s| s.last_call_at)
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64),
        last_client: stats.and_then(|s| s.last_client),
        error: mcp.error.clone(),
    }
}

/// Runs one MCP tool call in the main window and waits for the page's
/// `mcp_tool_result`. Runs on a connection thread of the MCP server, never
/// on the main thread, and holds no lock while it evals or waits.
fn mcp_call_page(app: &AppHandle, name: &str, args: serde_json::Value) -> (String, bool) {
    let Some(main) = app.get_webview_window(windows::MAIN) else {
        return ("PhiLogg's main window is not open.".to_string(), true);
    };
    let state = app.state::<AppState>();
    let id = format!("mcp-{}", state.mcp_next_id.fetch_add(1, Ordering::Relaxed));
    let (tx, rx) = std::sync::mpsc::channel();
    state.mcp_pending.lock().expect("mcp_pending poisoned").insert(id.clone(), tx);
    let js = |v: &serde_json::Value| serde_json::to_string(v).unwrap_or_else(|_| "null".to_string());
    let script = format!(
        "window.philoggMcpCall && window.philoggMcpCall({}, {}, {})",
        js(&serde_json::Value::String(id.clone())),
        js(&serde_json::Value::String(name.to_string())),
        js(&args)
    );
    let answer = match main.eval(&script) {
        Ok(()) => rx
            .recv_timeout(MCP_CALL_TIMEOUT)
            .unwrap_or_else(|_| ("PhiLogg did not answer within 300 s.".to_string(), true)),
        Err(e) => (format!("Could not reach PhiLogg's main window: {e}"), true),
    };
    state.mcp_pending.lock().expect("mcp_pending poisoned").remove(&id);
    answer
}

/// Starts, restarts or stops the MCP server (`philogg-mcp`) and returns its
/// status. Stopped when `enabled` is false, restarted when port or token
/// changed (or it is not running), otherwise only the tool list is swapped.
/// A bind failure is a status with `error`, not a rejection.
#[tauri::command]
pub fn mcp_configure(app: AppHandle, config: McpConfig, state: State<'_, AppState>) -> McpStatus {
    let mut mcp = state.mcp.lock().expect("mcp poisoned");
    if !config.enabled {
        mcp.server = None; // Drop stops it.
        mcp.error = None;
        return mcp_status_of(&mcp);
    }
    let port = u16::try_from(config.port).ok().filter(|p| *p != 0);
    let Some(port) = port else {
        mcp.server = None;
        mcp.error = Some(format!("Port {} is not valid.", config.port));
        return mcp_status_of(&mcp);
    };
    if mcp.server.is_some() && mcp.port == port && mcp.token == config.token {
        if let Some(server) = &mcp.server {
            server.set_tools(config.tools);
        }
        return mcp_status_of(&mcp);
    }
    mcp.server = None; // Free the old port first (the new one may be the same).
    let handle = app.clone();
    let call: philogg_mcp::CallTool = std::sync::Arc::new(move |name, args| mcp_call_page(&handle, name, args));
    match philogg_mcp::Server::start(port, config.token.clone(), config.tools, call) {
        Ok(server) => {
            mcp.server = Some(server);
            mcp.port = port;
            mcp.token = config.token;
            mcp.error = None;
        }
        Err(e) => {
            mcp.error = Some(if e.kind() == std::io::ErrorKind::AddrInUse {
                format!("Port {port} is in use.")
            } else {
                e.to_string()
            });
        }
    }
    mcp_status_of(&mcp)
}

#[tauri::command]
pub fn mcp_status(state: State<'_, AppState>) -> McpStatus {
    mcp_status_of(&state.mcp.lock().expect("mcp poisoned"))
}

/// The page's answer to one `philoggMcpCall` (answered at most once per id;
/// an unknown or already-expired id is ignored).
#[tauri::command]
pub fn mcp_tool_result(id: String, text: String, is_error: bool, state: State<'_, AppState>) {
    let tx = state.mcp_pending.lock().expect("mcp_pending poisoned").remove(&id);
    if let Some(tx) = tx {
        let _ = tx.send((text, is_error));
    }
}
