use super::*;
use std::net::TcpListener;
use std::sync::Arc;
use std::thread;

/// A one-shot local HTTP server: accepts one connection, captures the
/// request, and writes `response` (raw bytes, sent in the given pieces with
/// a short pause between them so the client really reads a stream).
fn mock(pieces: Vec<Vec<u8>>, hold_open: bool) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let handle = thread::spawn(move || {
        let (mut sock, _) = listener.accept().unwrap();
        sock.set_read_timeout(Some(Duration::from_millis(500))).unwrap();
        let mut req = Vec::new();
        let mut buf = [0u8; 4096];
        // Read headers + Content-Length body.
        loop {
            let n = sock.read(&mut buf).unwrap_or(0);
            if n == 0 { break; }
            req.extend_from_slice(&buf[..n]);
            let text = String::from_utf8_lossy(&req).to_string();
            if let Some(end) = text.find("\r\n\r\n") {
                let len = text.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap())).unwrap_or(0);
                if req.len() >= end + 4 + len { break; }
            }
        }
        for p in pieces {
            if sock.write_all(&p).is_err() { break; }
            let _ = sock.flush();
            thread::sleep(Duration::from_millis(15));
        }
        if hold_open {
            // Keeps the connection open without sending anything — a model
            // still processing the prompt.
            thread::sleep(Duration::from_millis(1500));
        }
        String::from_utf8_lossy(&req).to_string()
    });
    (format!("http://127.0.0.1:{port}/v1"), handle)
}

fn chunked(parts: &[&str]) -> Vec<Vec<u8>> {
    let mut out = vec![b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n".to_vec()];
    for p in parts {
        out.push(format!("{:x}\r\n{}\r\n", p.len(), p).into_bytes());
    }
    out.push(b"0\r\n\r\n".to_vec());
    out
}

fn collect(url: &str, body: &str) -> (Result<(), String>, Vec<ChatEvent>) {
    let never = AtomicBool::new(false);
    let mut events = Vec::new();
    let r = stream_chat(url, body, &never, &mut |e| {
        events.push(e);
        Ok(())
    });
    (r, events)
}

#[test]
fn loopback_only() {
    let ok = parse_base_url("http://localhost:1234/v1/").unwrap();
    assert_eq!(ok.host, "localhost:1234");
    assert_eq!(ok.path, "/v1");
    assert_eq!(ok.addrs.len(), 2);
    assert!(ok.addrs.iter().all(|a| a.ip().is_loopback()));
    assert_eq!(parse_base_url("http://127.0.0.1:8080").unwrap().path, "");
    assert_eq!(parse_base_url("http://[::1]:1234/v1").unwrap().addrs, vec![SocketAddr::from((Ipv6Addr::LOCALHOST, 1234))]);
    assert_eq!(parse_base_url("http://LOCALHOST/v1").unwrap().addrs[0].port(), 80);
    for bad in [
        "https://localhost:1234/v1",
        "http://192.168.1.10:1234/v1",
        "http://example.com/v1",
        "http://localhost.evil.com/v1",
        "http://127.0.0.2:1234",
        "http://user@localhost:1234",
        "http://localhost:99999",
        "ftp://localhost",
        "localhost:1234",
    ] {
        assert!(parse_base_url(bad).is_err(), "{bad} must be refused");
    }
}

#[test]
fn sse_parser() {
    let mut p = SseParser::default();
    assert_eq!(p.line(": keep-alive"), None);
    assert_eq!(p.line("data: {\"a\":1}"), None);
    assert_eq!(p.line(""), Some("{\"a\":1}".into()));
    assert_eq!(p.line(""), None, "a blank line alone is no event");
    p.line("event: message");
    p.line("data:first");
    p.line("data: second\r");
    assert_eq!(p.line("\r"), Some("first\nsecond".into()), "multi-line data, CRLF endings, optional space");
    p.line("data: [DONE]");
    assert_eq!(p.finish(), Some("[DONE]".into()), "an unterminated event still counts at the end");
}

#[test]
fn streams_text_and_tool_call_deltas() {
    let text1 = "data: {\"choices\":[{\"delta\":{\"content\":\"Hal\"}}]}\n\n";
    // One SSE event split across two HTTP chunks.
    let tool_a = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"c1\",\"function\":{\"name\":\"get_overview\",\"argum";
    let tool_b = "ents\":\"\"}}]}}]}\n\n";
    let tool_c = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n";
    let done = ": ping\n\ndata: [DONE]\n\n";
    let (url, server) = mock(chunked(&[text1, tool_a, tool_b, tool_c, done]), false);
    let (r, events) = collect(&url, "{\"stream\":true}");
    assert_eq!(r, Ok(()));
    assert_eq!(events.len(), 3);
    assert!(matches!(&events[0], ChatEvent::Chunk(d) if d.contains("Hal")));
    assert!(matches!(&events[1], ChatEvent::Chunk(d) if d.contains("\"arguments\":\"\"") && d.contains("get_overview")));
    assert!(matches!(&events[2], ChatEvent::Chunk(d) if d.contains("tool_calls\"}]")));
    let req = server.join().unwrap();
    assert!(req.starts_with("POST /v1/chat/completions HTTP/1.1\r\n"), "{req}");
    assert!(req.contains("Host: 127.0.0.1:"));
    assert!(req.ends_with("{\"stream\":true}"));
}

#[test]
fn plain_json_answer_and_content_length() {
    let body = "{\"choices\":[{\"message\":{\"content\":\"hi\"},\"finish_reason\":\"stop\"}]}";
    let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", body.len(), body);
    let (url, _s) = mock(vec![resp.into_bytes()], false);
    let (r, events) = collect(&url, "{}");
    assert_eq!(r, Ok(()));
    assert_eq!(events, vec![ChatEvent::Message(body.into())]);
}

#[test]
fn stream_without_done_but_finished_is_ok() {
    let resp = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"x\"},\"finish_reason\":\"stop\"}]}\n\n";
    let (url, _s) = mock(vec![resp.as_bytes().to_vec()], false);
    let (r, events) = collect(&url, "{}");
    assert_eq!(r, Ok(()));
    assert_eq!(events.len(), 1);
}

#[test]
fn connection_drop_mid_stream_is_an_error() {
    let mut pieces = chunked(&["data: {\"choices\":[{\"delta\":{\"content\":\"par\"}}]}\n\n"]);
    pieces.pop(); // no terminating chunk: the server just goes away
    let (url, _s) = mock(pieces, false);
    let (r, events) = collect(&url, "{}");
    assert_eq!(events.len(), 1, "what arrived before the drop is still delivered");
    assert!(r.unwrap_err().contains("closed"));
}

#[test]
fn http_errors_carry_the_server_message() {
    let body = "{\"error\":{\"message\":\"No models loaded\"}}";
    let resp = format!("HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", body.len(), body);
    let (url, _s) = mock(vec![resp.into_bytes()], false);
    assert_eq!(collect(&url, "{}").0, Err("HTTP 404: No models loaded".into()));
    let (url, _s) = mock(vec![b"HTTP/1.1 302 Found\r\nLocation: http://example.com/\r\nContent-Length: 0\r\n\r\n".to_vec()], false);
    assert!(collect(&url, "{}").0.unwrap_err().contains("redirects are not followed"));
}

#[test]
fn unreachable_server() {
    // Bind and drop: nothing listens on this port any more.
    let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let err = list_models(&format!("http://127.0.0.1:{port}/v1")).unwrap_err();
    assert!(err.contains("cannot reach") && err.contains("LM Studio"), "{err}");
}

#[test]
fn models() {
    let body = "{\"object\":\"list\",\"data\":[{\"id\":\"qwen2.5-7b-instruct\"},{\"id\":\"llama-3.2-3b\"}]}";
    let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", body.len(), body);
    let (url, server) = mock(vec![resp.into_bytes()], false);
    assert_eq!(list_models(&url).unwrap(), vec!["qwen2.5-7b-instruct".to_string(), "llama-3.2-3b".to_string()]);
    assert!(server.join().unwrap().starts_with("GET /v1/models HTTP/1.1\r\n"));
}

#[test]
fn cancel_while_the_model_is_silent() {
    let head = b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n".to_vec();
    let (url, _s) = mock(vec![head], true);
    let cancel = Arc::new(AtomicBool::new(false));
    let c2 = cancel.clone();
    let started = Instant::now();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(300));
        c2.store(true, Ordering::Relaxed);
    });
    let r = stream_chat(&url, "{}", &cancel, &mut |_| Ok(()));
    assert_eq!(r, Err("cancelled".into()));
    assert!(started.elapsed() < Duration::from_millis(1200), "cancel lands within a poll interval, took {:?}", started.elapsed());
}

#[test]
fn callback_error_stops_the_stream() {
    let (url, _s) = mock(chunked(&["data: {}\n\n", "data: {}\n\n", "data: [DONE]\n\n"]), false);
    let never = AtomicBool::new(false);
    let mut n = 0;
    let r = stream_chat(&url, "{}", &never, &mut |_| {
        n += 1;
        Err("page went away".into())
    });
    assert_eq!((r, n), (Err("page went away".into()), 1));
}
