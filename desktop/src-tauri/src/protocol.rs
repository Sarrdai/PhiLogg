//! The custom `philogg://` scheme — the Tauri counterpart to
//! `desktop/main.js`'s `protocol.handle("philogg", …)`.
//!
//! It stands in for `http(s)` for the same reason it does there: it must NOT
//! be `file:`, since `philogg.html`'s own `loadFromUrlParam()` guard refuses
//! `?url=` fetches from a `file:` page (matching the real browser
//! restriction that guard exists for). Serving the page from a custom scheme
//! sidesteps that without weakening the guard.
//!
//! One platform wrinkle, and the reason `inject.rs` ships a `fetch`
//! shim: Tauri does not expose a real custom scheme to the webview on
//! Windows. There, a scheme registered as `philogg` is served as
//! `http://philogg.localhost/…` instead, and on macOS/Linux as
//! `philogg://localhost/…` — in neither case as `philogg://local/…`, which
//! is the exact shape `philogg.html`'s `isDesktopLocalUrl()` looks for to
//! decide a loaded URL is a tail-able local file. Rather than change
//! `philogg.html` (this wrapper's core rule), the page
//! is handed the canonical `philogg://local/<id>/<name>` URL and a tiny
//! injected `fetch` wrapper rewrites it to whatever this platform actually
//! serves. So both URL shapes reach the handler below and both are accepted.
use std::path::PathBuf;

use tauri::http::{Request, Response};
use tauri::{Manager, UriSchemeContext, UriSchemeResponder};

use crate::state::AppState;

pub const SCHEME: &str = "philogg";

/// The base URL the webview actually resolves this scheme to on this
/// platform. See the module comment for why it isn't simply `philogg://`.
pub fn base_url() -> &'static str {
    if cfg!(windows) {
        "http://philogg.localhost/"
    } else {
        "philogg://localhost/"
    }
}

pub fn app_url(query: Option<&str>) -> String {
    match query {
        Some(q) => format!("{}app/philogg.html?{}", base_url(), q),
        None => format!("{}app/philogg.html", base_url()),
    }
}

/// Normalizes a request URI down to the path segments after the scheme's
/// host, accepting every shape the platforms above can produce.
fn segments(uri: &str) -> Vec<String> {
    let rest = match uri.split_once("://") {
        Some((_, rest)) => rest,
        None => uri,
    };
    let path = rest.split(['?', '#']).next().unwrap_or("");
    let mut parts: Vec<String> = path
        .split('/')
        .filter(|s| !s.is_empty())
        .map(|s| urlencoding::decode(s).map(|c| c.into_owned()).unwrap_or_else(|_| s.to_string()))
        .collect();
    // Drop the host segment unless it is itself one of our two roots — i.e.
    // `philogg://local/1/a.log` keeps `local`, `philogg://localhost/local/…`
    // and `http://philogg.localhost/local/…` drop theirs.
    if !parts.is_empty() && parts[0] != "app" && parts[0] != "local" {
        parts.remove(0);
    }
    parts
}

fn text(status: u16, body: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(body.as_bytes().to_vec())
        .expect("static response")
}

fn read(path: &PathBuf, content_type: &str) -> Response<Vec<u8>> {
    match std::fs::read(path) {
        Ok(bytes) => Response::builder()
            .status(200)
            .header("content-type", content_type)
            // Never cached: a `philogg://local/…` file is re-fetched on every
            // tail tick precisely because it may have grown since the last
            // read (see `urlTailHandle` in philogg.html).
            .header("cache-control", "no-store")
            .header("access-control-allow-origin", "*")
            .body(bytes)
            .expect("file response"),
        Err(err) => text(404, &err.to_string()),
    }
}

/// Asynchronous on purpose: a log file served through `philogg://local/…`
/// can be hundreds of megabytes and is re-read on every tail tick, and the
/// synchronous variant of this hook would block the webview's own thread for
/// the duration of each read.
pub fn handle<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().to_string();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let parts = segments(&uri);
        let response = match parts.first().map(String::as_str) {
            Some("app") => match parts.get(1).map(String::as_str) {
                None | Some("philogg.html") => read(&state.html_path, "text/html; charset=utf-8"),
                Some(_) => text(404, "Not found"),
            },
            Some("local") => match parts.get(1).and_then(|id| state.local_file(id)) {
                Some(path) => read(&path, "text/plain; charset=utf-8"),
                None => text(404, "Not found"),
            },
            _ => text(404, "Not found"),
        };
        responder.respond(response);
    });
}
