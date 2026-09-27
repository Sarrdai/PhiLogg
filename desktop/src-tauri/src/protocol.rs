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

/// The LLM assistant's chat window page.
pub fn chat_url() -> String {
    format!("{}app/chat.html", base_url())
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

/// Parses a single-range `Range: bytes=…` header against a file of `len`
/// bytes into an inclusive `(start, end)` pair. `None` means "serve the whole
/// file" (no header, or a form this doesn't handle, e.g. several ranges);
/// `Some(Err(()))` means the range lies outside the file (416).
fn parse_range(header: Option<&str>, len: u64) -> Option<Result<(u64, u64), ()>> {
    let spec = header?.trim().strip_prefix("bytes=")?;
    if spec.contains(',') {
        return None;
    }
    let (a, b) = spec.split_once('-')?;
    let (a, b) = (a.trim(), b.trim());
    let range = if a.is_empty() {
        // Suffix form `bytes=-N`: the last N bytes.
        let n: u64 = b.parse().ok()?;
        if n == 0 || len == 0 {
            return Some(Err(()));
        }
        (len.saturating_sub(n), len - 1)
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() { u64::MAX } else { b.parse().ok()? };
        if start >= len || end < start {
            return Some(Err(()));
        }
        (start, end.min(len - 1))
    };
    Some(Ok(range))
}

/// Like `read`, but honours a `Range` header, reading only the requested
/// bytes. The page's tail poll, the folder minimap's head/tail probe and a
/// windowed load each need a few KB of a file that may be hundreds of MB —
/// without this every one of them read the whole file off disk and copied
/// it into the webview (a tail poll every 1.5 s per open file).
fn read_local(path: &PathBuf, range: Option<&str>) -> Response<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};
    if range.is_none() {
        return read(path, "text/plain; charset=utf-8");
    }
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(err) => return text(404, &err.to_string()),
    };
    let len = match file.metadata() {
        Ok(m) => m.len(),
        Err(err) => return text(404, &err.to_string()),
    };
    let builder = Response::builder()
        .header("content-type", "text/plain; charset=utf-8")
        .header("cache-control", "no-store")
        .header("accept-ranges", "bytes")
        .header("access-control-allow-origin", "*")
        .header("access-control-expose-headers", "content-range");
    match parse_range(range, len) {
        None => read(path, "text/plain; charset=utf-8"),
        Some(Err(())) => builder
            .status(416)
            .header("content-range", format!("bytes */{len}"))
            .body(Vec::new())
            .expect("range response"),
        Some(Ok((start, end))) => {
            let mut bytes = vec![0u8; (end - start + 1) as usize];
            let read_ok = file
                .seek(SeekFrom::Start(start))
                .and_then(|_| file.read_exact(&mut bytes));
            match read_ok {
                Ok(()) => builder
                    .status(206)
                    .header("content-range", format!("bytes {start}-{end}/{len}"))
                    .body(bytes)
                    .expect("range response"),
                // Shrank between metadata() and the read (truncated or
                // rotated mid-request): the page just polls again.
                Err(err) => text(404, &err.to_string()),
            }
        }
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
    let range = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let parts = segments(&uri);
        let response = match parts.first().map(String::as_str) {
            Some("app") => match parts.get(1).map(String::as_str) {
                None | Some("philogg.html") => read(&state.html_path, "text/html; charset=utf-8"),
                Some("chat.html") => read(&state.chat_html_path, "text/html; charset=utf-8"),
                Some(_) => text(404, "Not found"),
            },
            Some("local") => match parts.get(1).and_then(|id| state.local_file(id)) {
                Some(path) => read_local(&path, range.as_deref()),
                None => text(404, "Not found"),
            },
            _ => text(404, "Not found"),
        };
        responder.respond(response);
    });
}

#[cfg(test)]
mod tests {
    use super::parse_range;

    #[test]
    fn ranges() {
        assert_eq!(parse_range(None, 100), None);
        assert_eq!(parse_range(Some("bytes=0-0"), 100), Some(Ok((0, 0))));
        assert_eq!(parse_range(Some("bytes=10-19"), 100), Some(Ok((10, 19))));
        assert_eq!(parse_range(Some("bytes=90-"), 100), Some(Ok((90, 99))));
        assert_eq!(parse_range(Some("bytes=90-500"), 100), Some(Ok((90, 99))));
        assert_eq!(parse_range(Some("bytes=-10"), 100), Some(Ok((90, 99))));
        assert_eq!(parse_range(Some("bytes=-500"), 100), Some(Ok((0, 99))));
        assert_eq!(parse_range(Some("bytes=100-"), 100), Some(Err(())));
        assert_eq!(parse_range(Some("bytes=0-0"), 0), Some(Err(())));
        assert_eq!(parse_range(Some("bytes=5-2"), 100), Some(Err(())));
        assert_eq!(parse_range(Some("bytes=0-1,5-6"), 100), None);
        assert_eq!(parse_range(Some("items=0-1"), 100), None);
    }
}
