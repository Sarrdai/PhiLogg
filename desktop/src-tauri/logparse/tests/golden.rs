//! The shared golden fixture: `tests/fixtures/native-parse-golden.json` at
//! the repo root holds inputs plus what `philogg.html`'s own JS parser makes
//! of them (the jsdom suite's GROUP 264 keeps that side honest). Every case
//! must come out of this crate byte-for-byte the same — at every chunk size,
//! so the parallel split + stitch is covered too.

use philogg_logparse::batch::{decode_batch, encode_batch, for_each_batch};
use philogg_logparse::{decode, parse_text, Entry, FormatSpec, Parser};
use serde_json::Value;

fn golden() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../tests/fixtures/native-parse-golden.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("golden fixture")).expect("golden JSON")
}

fn case_text(case: &Value) -> String {
    match case.get("base64").and_then(Value::as_str) {
        Some(b64) => decode(&base64_decode(b64), case["spec"]["encoding"].as_str().unwrap_or("")),
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

/// The binary batch layout, pinned the same way: `native-batch-golden.json`
/// holds each golden case encoded as one batch, which the jsdom suite's
/// GROUP 264 decodes with the page's own `decodeNativeBatch`. Rewrite it
/// after a deliberate layout change with `UPDATE_NATIVE_BATCH=1 cargo test`.
#[test]
fn batches_round_trip_and_match_the_committed_encoding() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../tests/fixtures/native-batch-golden.json");
    let update = std::env::var_os("UPDATE_NATIVE_BATCH").is_some();
    let committed: Value = if update { Value::Object(Default::default()) } else {
        serde_json::from_str(&std::fs::read_to_string(path).expect("batch fixture")).unwrap()
    };
    let mut out = serde_json::Map::new();
    for case in golden()["cases"].as_array().unwrap() {
        if case.get("nativeSupported") == Some(&Value::Bool(false)) {
            continue;
        }
        let name = case["name"].as_str().unwrap();
        let parser = Parser::new(&serde_json::from_value(case["spec"].clone()).unwrap()).unwrap();
        let entries = parse_text(&case_text(case), &parser, 1 << 20, &|_, _| {});
        let bytes = encode_batch(&entries, 0.5);
        let (fraction, back) = decode_batch(&bytes);
        assert_eq!(fraction, 0.5);
        assert_eq!(back, entries, "{name}: decodes to the same entries");
        let b64 = base64_encode(&bytes);
        if !update {
            assert_eq!(committed[name].as_str(), Some(b64.as_str()), "{name}: encoding differs from the committed one");
        }
        out.insert(name.to_string(), Value::String(b64));
    }
    if update {
        std::fs::write(path, serde_json::to_string_pretty(&Value::Object(out)).unwrap() + "\n").unwrap();
    }
}

#[test]
fn batches_carry_every_entry_in_order() {
    let spec = FormatSpec { builtin: true, regex: None, date_regex: None, date_order: vec![], wrap_quote: String::new(), encoding: String::new() };
    let parser = Parser::new(&spec).unwrap();
    let text: String = (0..25).map(|i| format!("2024-01-15 10:00:{:02},000\tINFO\t\"m\"\tl\t[M]\t\"n{i} \u{e9}\"\n", i % 60)).collect();
    let entries = parse_text(&text, &parser, 100, &|_, _| {});
    let mut batches = Vec::new();
    for_each_batch(&entries, 10, 0.4, &mut |b| {
        batches.push(decode_batch(&b));
        Ok(())
    })
    .unwrap();
    assert_eq!(batches.len(), 3);
    assert_eq!(batches[2].0, 1.0);
    let all: Vec<Entry> = batches.into_iter().flat_map(|(_, e)| e).collect();
    assert_eq!(all, entries);
}

fn base64_encode(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for c in bytes.chunks(3) {
        let n = c.iter().enumerate().fold(0u32, |n, (i, &b)| n | (u32::from(b) << (16 - 8 * i)));
        for i in 0..4 {
            out.push(if i <= c.len() { A[(n >> (18 - 6 * i)) as usize & 63] as char } else { '=' });
        }
    }
    out
}
