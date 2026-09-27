//! The desktop wrapper's HTTP side of the LLM assistant
//! (`docs/llm-assistant.md`): an OpenAI-compatible chat-completions client
//! (LM Studio's `/v1/models` and `/v1/chat/completions`, streamed as SSE)
//! that talks to **loopback addresses only**.
//!
//! Deliberately a tiny hand-written HTTP/1.1 client over `TcpStream`
//! instead of an HTTP crate: the only peer is a local server, so there is no
//! TLS, no proxy, no redirect and no DNS to get right — and "loopback only"
//! is a property of this code, not a setting of a library (the host is one
//! of three literal names, `localhost` is connected as 127.0.0.1 / ::1
//! without a lookup, a redirect is an error). A short socket read timeout
//! lets a cancel land within ~200 ms even while the model is still
//! processing the prompt and nothing streams yet.
//!
//! Tauri-free on purpose, like `philogg-logparse`: `cargo test -p
//! philogg-llm` runs without the webview toolchain.
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// Socket read timeout — how often a blocked read wakes up to look at the
/// cancel flag, not a limit on the response.
const POLL: Duration = Duration::from_millis(200);
/// Nothing at all received for this long: give up. Generous, since a large
/// prompt on a small machine can take minutes before the first token.
const IDLE_LIMIT: Duration = Duration::from_secs(600);

/// A parsed, loopback-checked base URL such as `http://localhost:1234/v1`.
#[derive(Debug, Clone, PartialEq)]
pub struct BaseUrl {
    pub addrs: Vec<SocketAddr>,
    /// The `Host` header value (`localhost:1234`).
    pub host: String,
    /// The path prefix without a trailing slash (`/v1`).
    pub path: String,
}

/// Accepts `http://localhost`, `http://127.0.0.1` and `http://[::1]` (with
/// an optional port and path) and nothing else — the technical guarantee
/// that the assistant never talks to anything but this machine.
pub fn parse_base_url(url: &str) -> Result<BaseUrl, String> {
    let url = url.trim();
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| format!("only http://localhost, http://127.0.0.1 or http://[::1] are allowed, got \"{url}\""))?;
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };
    if authority.contains('@') {
        return Err("a user name in the URL is not allowed".into());
    }
    let (host, port) = if let Some(v6) = authority.strip_prefix('[') {
        let end = v6.find(']').ok_or("malformed IPv6 address")?;
        let port = &v6[end + 1..];
        (&authority[..end + 2], port.strip_prefix(':'))
    } else {
        match authority.rsplit_once(':') {
            Some((h, p)) => (h, Some(p)),
            None => (authority, None),
        }
    };
    let port: u16 = match port {
        Some(p) => p.parse().map_err(|_| format!("invalid port \"{p}\""))?,
        None => 80,
    };
    let lower = host.to_ascii_lowercase();
    let addrs = match lower.as_str() {
        "localhost" => vec![
            SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
            SocketAddr::from((Ipv6Addr::LOCALHOST, port)),
        ],
        "127.0.0.1" => vec![SocketAddr::from((Ipv4Addr::LOCALHOST, port))],
        "[::1]" => vec![SocketAddr::from((Ipv6Addr::LOCALHOST, port))],
        _ => return Err(format!("only loopback hosts (localhost, 127.0.0.1, [::1]) are allowed, got \"{host}\"")),
    };
    let path = path.split(['?', '#']).next().unwrap_or("").trim_end_matches('/').to_string();
    Ok(BaseUrl { addrs, host: format!("{lower}:{port}"), path })
}

/// One Server-Sent Events parser, fed line by line.
#[derive(Default)]
pub struct SseParser {
    data: Vec<String>,
}

impl SseParser {
    /// Feeds one line (without its line break; a trailing `\r` is ignored).
    /// Returns the event's data once a blank line completes it.
    pub fn line(&mut self, line: &str) -> Option<String> {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            if self.data.is_empty() {
                return None;
            }
            let data = self.data.join("\n");
            self.data.clear();
            return Some(data);
        }
        if line.starts_with(':') {
            return None; // comment / keep-alive
        }
        let (field, value) = match line.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (line, ""),
        };
        if field == "data" {
            self.data.push(value.to_string());
        }
        None
    }

    /// End of stream: an event not closed by a blank line still counts.
    pub fn finish(&mut self) -> Option<String> {
        self.line("")
    }
}

/// What `stream_chat` hands its callback.
#[derive(Debug, PartialEq)]
pub enum ChatEvent {
    /// One SSE `data:` payload (a `chat.completion.chunk` JSON object).
    Chunk(String),
    /// The whole response, when the server answered with plain JSON
    /// instead of a stream.
    Message(String),
}

/// A socket reader that wakes up every `POLL` to check the cancel flag.
struct Cancellable<'a> {
    stream: TcpStream,
    cancel: &'a AtomicBool,
    last_data: Instant,
}

impl Read for Cancellable<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        loop {
            if self.cancel.load(Ordering::Relaxed) {
                // Not ErrorKind::Interrupted: std's read_line/read_to_end
                // retry on that one forever.
                return Err(std::io::Error::other(CANCELLED));
            }
            match self.stream.read(buf) {
                Ok(n) => {
                    self.last_data = Instant::now();
                    return Ok(n);
                }
                Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {
                    if self.last_data.elapsed() > IDLE_LIMIT {
                        return Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "the server sent nothing for 10 minutes"));
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
                Err(e) => return Err(e),
            }
        }
    }
}

/// A response body in HTTP/1.1 chunked transfer encoding.
struct Chunked<R> {
    inner: R,
    left: usize,
    done: bool,
}

impl<R: BufRead> Read for Chunked<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.done {
            return Ok(0);
        }
        if self.left == 0 {
            let mut size = String::new();
            if self.inner.read_line(&mut size)? == 0 {
                return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "connection closed mid-response"));
            }
            let hex = size.trim().split(';').next().unwrap_or("");
            self.left = usize::from_str_radix(hex, 16)
                .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "bad chunk size"))?;
            if self.left == 0 {
                self.done = true;
                return Ok(0);
            }
        }
        let want = buf.len().min(self.left);
        let n = self.inner.read(&mut buf[..want])?;
        if n == 0 {
            return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "connection closed mid-response"));
        }
        self.left -= n;
        if self.left == 0 {
            let mut crlf = String::new();
            self.inner.read_line(&mut crlf)?;
        }
        Ok(n)
    }
}

struct Response<'a> {
    status: u16,
    content_type: String,
    body: Box<dyn BufRead + 'a>,
}

const CANCELLED: &str = "cancelled";

fn io_err(e: std::io::Error) -> String {
    e.to_string()
}

fn send<'a>(base: &BaseUrl, method: &str, path: &str, body: Option<&str>, cancel: &'a AtomicBool) -> Result<Response<'a>, String> {
    let mut last_err = None;
    let mut stream = None;
    for addr in &base.addrs {
        match TcpStream::connect_timeout(addr, CONNECT_TIMEOUT) {
            Ok(s) => {
                stream = Some(s);
                break;
            }
            Err(e) => last_err = Some(e),
        }
    }
    let mut stream = stream.ok_or_else(|| {
        format!(
            "cannot reach {} ({}) — is LM Studio's server running?",
            base.host,
            last_err.map(|e| e.to_string()).unwrap_or_default()
        )
    })?;
    stream.set_read_timeout(Some(POLL)).map_err(|e| e.to_string())?;
    let _ = stream.set_nodelay(true);
    let body = body.unwrap_or("");
    let head = format!(
        "{method} {}{path} HTTP/1.1\r\nHost: {}\r\nAccept: text/event-stream, application/json\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        base.path,
        base.host,
        body.len()
    );
    stream.write_all(head.as_bytes()).and_then(|_| stream.write_all(body.as_bytes())).map_err(|e| e.to_string())?;

    let mut reader = BufReader::new(Cancellable { stream, cancel, last_data: Instant::now() });
    let mut status_line = String::new();
    reader.read_line(&mut status_line).map_err(io_err)?;
    let status: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| format!("not an HTTP response: {:?}", status_line.trim()))?;
    let (mut chunked, mut length, mut content_type) = (false, None, String::new());
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).map_err(io_err)? == 0 {
            return Err("connection closed in the response headers".into());
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            let (k, v) = (k.trim().to_ascii_lowercase(), v.trim());
            match k.as_str() {
                "transfer-encoding" => chunked = v.to_ascii_lowercase().contains("chunked"),
                "content-length" => length = v.parse::<u64>().ok(),
                "content-type" => content_type = v.to_ascii_lowercase(),
                _ => {}
            }
        }
    }
    if (300..400).contains(&status) {
        return Err(format!("HTTP {status}: redirects are not followed (loopback only)"));
    }
    let body: Box<dyn BufRead> = if chunked {
        Box::new(BufReader::new(Chunked { inner: reader, left: 0, done: false }))
    } else if let Some(n) = length {
        Box::new(BufReader::new(reader.take(n)))
    } else {
        Box::new(reader)
    };
    Ok(Response { status, content_type, body })
}

fn read_all(body: &mut dyn BufRead) -> Result<String, String> {
    let mut bytes = Vec::new();
    body.read_to_end(&mut bytes).map_err(io_err)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn http_error(status: u16, body: &str) -> String {
    // OpenAI-style `{"error": {"message": …}}` / `{"error": "…"}` first.
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            let e = v.get("error")?;
            e.get("message").and_then(|m| m.as_str()).or(e.as_str()).map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(300).collect());
    format!("HTTP {status}: {detail}")
}

/// `GET {base}/models` → the model ids (`data[].id`).
pub fn list_models(base_url: &str) -> Result<Vec<String>, String> {
    let base = parse_base_url(base_url)?;
    let never = AtomicBool::new(false);
    let mut res = send(&base, "GET", "/models", None, &never)?;
    let body = read_all(&mut res.body)?;
    if res.status != 200 {
        return Err(http_error(res.status, &body));
    }
    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| format!("unexpected /models answer: {e}"))?;
    Ok(v.get("data")
        .and_then(|d| d.as_array())
        .map(|a| a.iter().filter_map(|m| m.get("id").and_then(|i| i.as_str()).map(str::to_string)).collect())
        .unwrap_or_default())
}

/// `POST {base}/chat/completions` with `body` (the page's request JSON,
/// normally `"stream": true`). Every SSE event's data reaches `on_event` as
/// a `Chunk`, in order, until `[DONE]`; a server that answers with plain
/// JSON instead produces one `Message`. A stream that ends without `[DONE]`
/// or a `finish_reason` is an error (the connection dropped mid-answer).
pub fn stream_chat(
    base_url: &str,
    body: &str,
    cancel: &AtomicBool,
    on_event: &mut dyn FnMut(ChatEvent) -> Result<(), String>,
) -> Result<(), String> {
    let base = parse_base_url(base_url)?;
    let mut res = send(&base, "POST", "/chat/completions", Some(body), cancel)?;
    if res.status != 200 {
        let text = read_all(&mut res.body).unwrap_or_default();
        return Err(http_error(res.status, &text));
    }
    if !res.content_type.contains("text/event-stream") {
        let text = read_all(&mut res.body)?;
        return on_event(ChatEvent::Message(text));
    }
    let mut sse = SseParser::default();
    let mut finished = false;
    let mut line = String::new();
    loop {
        line.clear();
        let n = res.body.read_line(&mut line).map_err(io_err)?;
        let event = if n == 0 { sse.finish() } else { sse.line(line.trim_end_matches('\n')) };
        if let Some(data) = event {
            if data.trim() == "[DONE]" {
                return Ok(());
            }
            if chunk_finished(&data) {
                finished = true;
            }
            on_event(ChatEvent::Chunk(data))?;
        }
        if n == 0 {
            return if finished { Ok(()) } else { Err("the connection closed before the answer was complete".into()) };
        }
    }
}

/// Whether an SSE chunk carries a `finish_reason` (the answer is complete
/// even if the server then closes without `[DONE]`).
fn chunk_finished(data: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(data)
        .ok()
        .and_then(|v| v.get("choices")?.get(0)?.get("finish_reason")?.as_str().map(|_| ()))
        .is_some()
}

#[cfg(test)]
mod tests;
