use super::*;
use std::net::{IpAddr, TcpStream};

const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn fake() -> CallTool {
    Arc::new(|name, args| {
        if name == "boom" {
            ("it failed".to_string(), true)
        } else {
            (format!("{name}:{args}"), false)
        }
    })
}

fn ctx() -> Ctx {
    Ctx::new(7337, TOKEN.to_string(), json!([{ "name": "get_overview", "description": "d", "inputSchema": {} }]), fake())
}

fn req(body: &str) -> Request {
    Request {
        method: "POST".into(),
        path: "/mcp".into(),
        headers: vec![
            ("host".into(), "127.0.0.1:7337".into()),
            ("authorization".into(), format!("Bearer {TOKEN}")),
        ],
        body: body.as_bytes().to_vec(),
    }
}

fn body_json(r: &Response) -> Value {
    serde_json::from_slice(&r.body).unwrap()
}

fn rpc(c: &Ctx, body: Value) -> Value {
    let r = handle(&req(&body.to_string()), c);
    assert_eq!(r.status, 200);
    body_json(&r)
}

fn set(r: &mut Request, name: &str, value: &str) {
    r.headers.retain(|(k, _)| k != name);
    r.headers.push((name.into(), value.into()));
}

#[test]
fn initialize_negotiates_version_and_records_client() {
    let c = ctx();
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"claude-code"}}}));
    assert_eq!(v["id"], 1);
    assert_eq!(v["result"]["protocolVersion"], "2024-11-05");
    assert_eq!(v["result"]["serverInfo"]["name"], "philogg");
    assert_eq!(v["result"]["capabilities"]["tools"]["listChanged"], false);
    assert!(v["result"]["instructions"].as_str().unwrap().contains("get_overview"));
    assert_eq!(c.stats.lock().unwrap().last_client.as_deref(), Some("claude-code"));
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"1999-01-01"}}));
    assert_eq!(v["result"]["protocolVersion"], "2025-06-18");
    assert_eq!(c.stats.lock().unwrap().last_client, None);
}

#[test]
fn ping_and_tools_list() {
    let c = ctx();
    assert_eq!(rpc(&c, json!({"jsonrpc":"2.0","id":"a","method":"ping"}))["result"], json!({}));
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":3,"method":"tools/list"}));
    assert_eq!(v["result"]["tools"][0]["name"], "get_overview");
}

#[test]
fn tools_call_wraps_result_and_counts() {
    let c = ctx();
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_overview","arguments":{"x":1}}}));
    assert_eq!(v["result"]["content"][0]["type"], "text");
    assert_eq!(v["result"]["content"][0]["text"], "get_overview:{\"x\":1}");
    assert_eq!(v["result"]["isError"], false);
    // Missing arguments become {}.
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"boom"}}));
    assert_eq!(v["result"]["content"][0]["text"], "it failed");
    assert_eq!(v["result"]["isError"], true);
    let st = c.stats.lock().unwrap().clone();
    assert_eq!(st.calls, 2);
    assert!(st.last_call_at.is_some());
}

#[test]
fn tools_call_invalid_params() {
    let c = ctx();
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":5}}));
    assert_eq!(v["error"]["code"], -32602);
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"a","arguments":[1]}}));
    assert_eq!(v["error"]["code"], -32602);
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":8,"method":"tools/call"}));
    assert_eq!(v["error"]["code"], -32602);
    assert_eq!(c.stats.lock().unwrap().calls, 0);
}

#[test]
fn notification_and_client_response_get_202() {
    let c = ctx();
    let r = handle(&req(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#), &c);
    assert_eq!((r.status, r.body.len()), (202, 0));
    let r = handle(&req(r#"{"jsonrpc":"2.0","id":9,"result":{}}"#), &c);
    assert_eq!((r.status, r.body.len()), (202, 0));
}

#[test]
fn parse_error_batch_and_unknown_method() {
    let c = ctx();
    let r = handle(&req("{nope"), &c);
    assert_eq!(r.status, 200);
    let v = body_json(&r);
    assert_eq!(v["error"]["code"], -32700);
    assert_eq!(v["id"], Value::Null);
    let v = rpc(&c, json!([{"jsonrpc":"2.0","id":1,"method":"ping"}]));
    assert_eq!(v["error"]["code"], -32600);
    let v = rpc(&c, json!({"jsonrpc":"2.0","id":10,"method":"resources/list"}));
    assert_eq!(v["error"]["code"], -32601);
    assert_eq!(v["id"], 10);
}

#[test]
fn token_checks() {
    let c = ctx();
    let mut r = req("{}");
    r.headers.retain(|(k, _)| k != "authorization");
    let resp = handle(&r, &c);
    assert_eq!(resp.status, 401);
    assert!(resp.headers.iter().any(|(k, v)| *k == "WWW-Authenticate" && v == "Bearer"));
    set(&mut r, "authorization", "Bearer wrong");
    assert_eq!(handle(&r, &c).status, 401);
    set(&mut r, "authorization", &format!("Bearer {}x", TOKEN));
    assert_eq!(handle(&r, &c).status, 401);
    set(&mut r, "authorization", TOKEN);
    assert_eq!(handle(&r, &c).status, 401);
    set(&mut r, "authorization", &format!("Bearer {TOKEN}"));
    assert_eq!(handle(&r, &c).status, 202);
    // An empty configured token never authorizes.
    let empty = Ctx::new(7337, String::new(), json!([]), fake());
    set(&mut r, "authorization", "Bearer ");
    assert_eq!(handle(&r, &empty).status, 401);
}

#[test]
fn constant_time_compare() {
    assert!(ct_eq(b"abc", b"abc"));
    assert!(!ct_eq(b"abc", b"abd"));
    assert!(!ct_eq(b"abc", b"abcd"));
    assert!(!ct_eq(b"", b"a"));
    assert!(ct_eq(b"", b""));
}

#[test]
fn host_checks() {
    let c = ctx();
    let mut r = req(r#"{"jsonrpc":"2.0","method":"x"}"#);
    for ok in ["127.0.0.1:7337", "localhost:7337", "[::1]:7337", "LOCALHOST:7337"] {
        set(&mut r, "host", ok);
        assert_eq!(handle(&r, &c).status, 202, "{ok}");
    }
    for bad in ["evil.com:7337", "127.0.0.1:7338", "127.0.0.1", "localhost.evil.com:7337", "evil.com"] {
        set(&mut r, "host", bad);
        assert_eq!(handle(&r, &c).status, 403, "{bad}");
    }
    r.headers.retain(|(k, _)| k != "host");
    assert_eq!(handle(&r, &c).status, 403);
}

#[test]
fn origin_checks() {
    let c = ctx();
    let mut r = req(r#"{"jsonrpc":"2.0","method":"x"}"#);
    assert_eq!(handle(&r, &c).status, 202);
    for ok in ["http://127.0.0.1", "http://127.0.0.1:5173", "http://localhost:80", "http://[::1]:9", "http://localhost"] {
        set(&mut r, "origin", ok);
        assert_eq!(handle(&r, &c).status, 202, "{ok}");
    }
    for bad in ["http://evil.com", "https://localhost", "http://localhost.evil.com", "http://localhost:", "http://127.0.0.1:x", "null"] {
        set(&mut r, "origin", bad);
        assert_eq!(handle(&r, &c).status, 403, "{bad}");
    }
}

#[test]
fn host_is_checked_before_token() {
    let c = ctx();
    let mut r = req("{}");
    set(&mut r, "host", "evil.com:7337");
    set(&mut r, "authorization", "Bearer wrong");
    assert_eq!(handle(&r, &c).status, 403);
}

#[test]
fn method_path_and_body_limits() {
    let c = ctx();
    for m in ["GET", "DELETE", "PUT"] {
        let mut r = req("");
        r.method = m.into();
        let resp = handle(&r, &c);
        assert_eq!(resp.status, 405);
        assert!(resp.headers.iter().any(|(k, v)| *k == "Allow" && v == "POST"));
    }
    let mut r = req("{}");
    r.path = "/other".into();
    assert_eq!(handle(&r, &c).status, 404);
    r.path = "/mcp?x=1".into();
    assert_eq!(handle(&r, &c).status, 202);
    let mut r = req("{}");
    set(&mut r, "transfer-encoding", "chunked");
    assert_eq!(handle(&r, &c).status, 411);
    let mut r = req("");
    set(&mut r, "content-length", &(MAX_BODY + 1).to_string());
    assert_eq!(handle(&r, &c).status, 413);
}

#[test]
fn set_tools_swaps_list() {
    let mut s = Server::start(0, TOKEN.into(), json!([]), fake()).unwrap();
    s.set_tools(json!([{ "name": "t" }]));
    let out = post(s.port(), TOKEN, r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#);
    let v: Value = serde_json::from_str(out.split("\r\n\r\n").nth(1).unwrap()).unwrap();
    assert_eq!(v["result"]["tools"][0]["name"], "t");
    s.stop();
}

/// Sends a raw request, returns the full response text.
fn raw(port: u16, request: &str) -> String {
    let mut s = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
    s.write_all(request.as_bytes()).unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    out
}

fn post(port: u16, token: &str, body: &str) -> String {
    raw(
        port,
        &format!(
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        ),
    )
}

#[test]
fn sockets_round_trip_and_loopback_only() {
    let mut s = Server::start(0, TOKEN.into(), json!([{ "name": "get_overview" }]), fake()).unwrap();
    let port = s.port();
    assert!(s.local_addr().ip().is_loopback());
    assert_ne!(port, 0);

    let out = post(port, TOKEN, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"t"}}}"#);
    assert!(out.starts_with("HTTP/1.1 200 OK\r\n"), "{out}");
    assert!(out.contains("Content-Type: application/json"));
    assert!(out.contains("Connection: close"));
    let out = post(port, TOKEN, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_overview","arguments":{}}}"#);
    let body = out.split("\r\n\r\n").nth(1).unwrap();
    let v: Value = serde_json::from_str(body).unwrap();
    assert_eq!(v["result"]["content"][0]["text"], "get_overview:{}");
    assert_eq!(s.stats().calls, 1);
    assert_eq!(s.stats().last_client.as_deref(), Some("t"));

    assert!(post(port, "nope", "{}").starts_with("HTTP/1.1 401"));
    let out = raw(port, &format!("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {TOKEN}\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n"));
    assert!(out.starts_with("HTTP/1.1 411"), "{out}");
    let out = raw(port, &format!("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {TOKEN}\r\nContent-Length: 99999999\r\n\r\n"));
    assert!(out.starts_with("HTTP/1.1 413"), "{out}");
    let out = raw(port, &format!("GET /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {TOKEN}\r\n\r\n"));
    assert!(out.starts_with("HTTP/1.1 405") && out.contains("Allow: POST"), "{out}");
    let big = format!("GET /{} HTTP/1.1\r\n\r\n", "a".repeat(20_000));
    assert!(raw(port, &big).starts_with("HTTP/1.1 431"));

    // A non-loopback address of this machine must not reach the server.
    if let Some(ip) = non_loopback_ip() {
        assert!(TcpStream::connect_timeout(&SocketAddr::new(ip, port), Duration::from_millis(500)).is_err());
    }
    s.stop();
}

/// The machine's outgoing IPv4 address, if it has one besides loopback.
fn non_loopback_ip() -> Option<IpAddr> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("192.0.2.1:9").ok()?;
    let ip = sock.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

#[test]
fn stop_frees_the_port() {
    let mut s = Server::start(0, TOKEN.into(), json!([]), fake()).unwrap();
    let port = s.port();
    assert!(Server::start(port, TOKEN.into(), json!([]), fake()).is_err());
    s.stop();
    let s2 = Server::start(port, TOKEN.into(), json!([]), fake()).unwrap();
    assert_eq!(s2.port(), port);
    drop(s2);
    assert!(TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok());
}
