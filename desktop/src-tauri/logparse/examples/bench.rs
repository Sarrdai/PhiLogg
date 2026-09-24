//! Times the native parser alone — read, parse, batch encoding — with no
//! webview involved. See docs/performance-testing.md.
//!
//!   cd desktop/src-tauri
//!   cargo run --release -p philogg-logparse --example bench -- <log-file> ['<spec json>']
//!
//! The spec defaults to the builtin default format; pass another
//! `nativeFormatSpec` result (e.g. copied from tests/fixtures/
//! native-parse-golden.json) to time a regex-mode format.
//! RAYON_NUM_THREADS=1 gives the single-core figure.
use std::time::Instant;

use philogg_logparse::batch::for_each_batch;
use philogg_logparse::{decode, parse_text, FormatSpec, Parser, DEFAULT_CHUNK_BYTES};

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().expect("usage: bench <log-file> [spec-json]");
    let spec: FormatSpec = serde_json::from_str(
        &args.next().unwrap_or_else(|| r#"{"builtin":true,"regex":null,"dateRegex":null}"#.into()),
    )
    .expect("spec JSON");
    let t0 = Instant::now();
    let text = decode(&std::fs::read(&path).expect("read"));
    let t1 = Instant::now();
    let entries = parse_text(&text, &Parser::new(&spec).expect("spec"), DEFAULT_CHUNK_BYTES, &|_, _| {});
    let t2 = Instant::now();
    let mut bytes = 0;
    for_each_batch(&entries, 25_000, 0.4, &mut |b| {
        bytes += b.len();
        Ok(())
    })
    .unwrap();
    let t3 = Instant::now();
    println!(
        "{} entries, {} threads: read+decode {:?}, parse {:?}, encode {:?} ({} MB of batches)",
        entries.len(),
        rayon::current_num_threads(),
        t1 - t0,
        t2 - t1,
        t3 - t2,
        bytes / 1_000_000
    );
}
