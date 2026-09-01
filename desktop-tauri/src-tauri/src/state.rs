//! Shared, process-wide state for the Tauri wrapper.
//!
//! The Electron wrapper keeps all of this in module-level `let`s in
//! `desktop/main.js` (`localFiles`, `nextLocalId`, `isQuitting`, the font
//! cache, …). Rust has no equivalent ambient mutable module scope, so the
//! same values live here and are reached through Tauri's managed state.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

/// `philogg.html`'s own key for the "close to system tray" setting. Mirrored
/// out of the page's `localStorage` (see `settings.rs`) and cached here so
/// the window's close handler can answer synchronously — unlike
/// `desktop/main.js`, which has to `executeJavaScript()` the value back out
/// of the renderer at close time.
pub const CLOSE_TO_TRAY_KEY: &str = "philogg-close-to-tray";

pub struct AppState {
    /// id -> absolute local path, served at `philogg://local/<id>/<basename>`.
    /// Populated only from paths the OS itself handed us (argv /
    /// file-association / macOS open-file), same trust level as a native
    /// file-open dialog — mirrors `localFiles` in `desktop/main.js`.
    local_files: Mutex<HashMap<String, PathBuf>>,
    next_local_id: AtomicU64,
    /// Absolute path to the `philogg.html` this build serves.
    pub html_path: PathBuf,
    /// `settings.json` in the same well-known config directory as everything
    /// else this wrapper persists.
    pub settings_path: PathBuf,
    /// Distinguishes a real quit (tray's Quit, Cmd+Q, OS shutdown) from the
    /// hide-to-tray path, so the close interception doesn't loop.
    pub is_quitting: AtomicBool,
    pub close_to_tray: AtomicBool,
    /// Process-lifetime cache for the system font list (enumeration shells
    /// out to the OS, which is slow enough to be worth doing once).
    pub fonts: Mutex<Option<Vec<String>>>,
    /// Changes every process start; the injected script uses it to hydrate
    /// `localStorage` from `settings.json` exactly once per run rather than
    /// on every reload (see `inject.js`).
    pub nonce: String,
    /// Last `philogg-*` dump written to disk, so an unchanged poll doesn't
    /// touch the file at all.
    pub last_settings: Mutex<Option<String>>,
}

impl AppState {
    pub fn new(html_path: PathBuf, settings_path: PathBuf) -> Self {
        Self {
            local_files: Mutex::new(HashMap::new()),
            next_local_id: AtomicU64::new(1),
            html_path,
            settings_path,
            is_quitting: AtomicBool::new(false),
            close_to_tray: AtomicBool::new(true),
            fonts: Mutex::new(None),
            nonce: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos().to_string())
                .unwrap_or_else(|_| "0".to_string()),
            last_settings: Mutex::new(None),
        }
    }

    /// Registers a path and returns the canonical URL the page should load.
    ///
    /// The `<basename>` segment is only along for the ride so
    /// `philogg.html`'s own `loadUrlIntoTree` (which names a loaded file
    /// after the URL's last path segment, same as any other `?url=` deep
    /// link) shows the real file name instead of the bare id — the lookup
    /// below still keys off the id alone.
    pub fn register_local_file(&self, path: &Path) -> String {
        let id = self.next_local_id.fetch_add(1, Ordering::Relaxed).to_string();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| id.clone());
        self.local_files
            .lock()
            .expect("local_files poisoned")
            .insert(id.clone(), path.to_path_buf());
        format!("philogg://local/{}/{}", id, urlencoding::encode(&name))
    }

    pub fn local_file(&self, id: &str) -> Option<PathBuf> {
        self.local_files
            .lock()
            .expect("local_files poisoned")
            .get(id)
            .cloned()
    }

    /// Resolves a `philogg://local/<id>/<basename>` URL back to a path. The
    /// renderer knows such a file solely by that URL (never a raw path), so
    /// this is the only way "Open File Location" can reach the real file —
    /// same reason `desktop/main.js` has a `revealLocalUrl` handler at all.
    pub fn local_file_for_url(&self, url: &str) -> Option<PathBuf> {
        let rest = url.split("://").nth(1)?;
        // Accepts both the canonical `philogg://local/<id>/…` form and the
        // platform-rewritten one the injected fetch shim uses on Windows
        // (`http://philogg.localhost/local/<id>/…`) — see `inject.rs`.
        let mut segments = rest.split('/').filter(|s| !s.is_empty());
        let first = segments.next()?;
        let id = if first == "local" {
            segments.next()?
        } else {
            let marker = segments.next()?;
            if marker != "local" {
                return None;
            }
            segments.next()?
        };
        self.local_file(id)
    }
}
