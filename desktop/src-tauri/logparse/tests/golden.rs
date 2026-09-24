//! The shared golden fixture: `tests/fixtures/native-parse-golden.json` at
//! the repo root holds inputs plus what `philogg.html`'s own JS parser makes
//! of them (the jsdom suite's GROUP 264 keeps that side honest). Every case
//! must come out of this crate byte-for-byte the same — at every chunk size,
//! so the parallel split + stitch is covered too.

use philogg_logparse::{decode, parse_text, FormatSpec, Parser};
use serde_json::Value;

fn golden() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../tests/fixtures/native-parse-golden.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("golden fixture")).expect("golden JSON")
}

fn case_text(case: &Value) -> String {
    match case.get("base64").and_then(Value::as_str) {
        Some(b64) => decode(&base64_decode(b64)),
        None => case["text"].as_str().expect("text").to_string(),
    }
}

/// Just enough base64 for the fixture — not worth a dependency.
fn base64_decode(s: &str) -> Vec<u8> {
    let val = |c: u8| match c {
        b'A'..=b'Z' => c - b'A',
        b'a'..=b'z' => c - b'a' + 26,
        b'0'..=b'9' => c - b'0' + 52,
        b'+' => 62,
        b'/' => 63,
        _ => panic!("bad base64"),
    };
    let bytes: Vec<u8> = s.bytes().filter(|&c| c != b'=').collect();
    let mut out = Vec::new();
    for chunk in bytes.chunks(4) {
        let n = chunk.iter().enumerate().fold(0u32, |n, (i, &c)| n | (u32::from(val(c)) << (18 - 6 * i)));
        out.extend(&n.to_be_bytes()[1..chunk.len()]);
    }
    out
}

#[test]
fn golden_cases_match_the_js_parser() {
    let golden = golden();
    let cases = golden["cases"].as_array().expect("cases");
    assert!(cases.len() >= 10, "fixture looks truncated");
    for case in cases {
        let name = case["name"].as_str().unwrap();
        let spec: FormatSpec = serde_json::from_value(case["spec"].clone()).expect("spec");
        let parser = Parser::new(&spec);
        if case.get("nativeSupported") == Some(&Value::Bool(false)) {
            assert!(parser.is_err(), "{name}: must be refused so the page falls back to JS");
            continue;
        }
        let parser = parser.unwrap_or_else(|e| panic!("{name}: {e}"));
        let text = case_text(case);
        for chunk in [1, 7, 64, 1 << 20] {
            let entries = parse_text(&text, &parser, chunk, &|_, _| {});
            let got = serde_json::to_value(&entries).unwrap();
            let want = &case["entries"];
            assert_eq!(got.as_array().unwrap().len(), want.as_array().unwrap().len(), "{name} (chunk {chunk}): entry count");
            for (i, (g, w)) in got.as_array().unwrap().iter().zip(want.as_array().unwrap()).enumerate() {
                assert_eq!(g, w, "{name} (chunk {chunk}) entry #{i}");
            }
        }
    }
}

#[test]
fn chunk_messages_carry_every_entry_in_order() {
    let spec = FormatSpec { builtin: true, regex: None, date_regex: None, date_order: vec![], wrap_quote: String::new() };
    let parser = Parser::new(&spec).unwrap();
    let text: String = (0..25).map(|i| format!("2024-01-15 10:00:{:02},000\tINFO\t\"m\"\tl\t[M]\t\"n{i}\"\n", i % 60)).collect();
    let entries = parse_text(&text, &parser, 100, &|_, _| {});
    let mut messages = Vec::new();
    philogg_logparse::for_each_chunk_message(&entries, 10, 0.4, &mut |m| {
        messages.push(serde_json::from_str::<Value>(&m).unwrap());
        Ok(())
    })
    .unwrap();
    assert_eq!(messages.len(), 3);
    let all: Vec<&str> = messages.iter().flat_map(|m| m["entries"].as_array().unwrap()).map(|e| e["message"].as_str().unwrap()).collect();
    assert_eq!(all, (0..25).map(|i| format!("n{i}")).collect::<Vec<_>>());
    assert_eq!(messages[2]["fraction"], 1.0);
    assert!(messages.iter().all(|m| m["type"] == "chunk"));
}
