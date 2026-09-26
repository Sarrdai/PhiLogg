//! Native counterpart of `philogg.html`'s log parsing loop, for the desktop
//! wrapper: the same per-line header/continuation rules, the same field
//! extraction and the same timestamp arithmetic, but reading the file
//! directly and parsing it on every core at once.
//!
//! The page stays the single source of truth for *what* a format means: it
//! compiles the format itself (`nativeFormatSpec` in `philogg.html`) and hands
//! over the resulting regex source, date regex and quote rule. This crate
//! only executes that description — see `jsregex` for how JS regex semantics
//! are kept, and `timestamp` for why timestamps come back "naive".
//!
//! Every function here names the JS function it mirrors; a change to one side
//! needs the same change on the other. `tests/fixtures/native-parse-golden.json`
//! (checked by both this crate's tests and the jsdom regression suite) is the
//! tripwire for the two drifting apart.

pub mod batch;
pub mod jsregex;
pub mod timestamp;

use std::sync::atomic::{AtomicUsize, Ordering};

use rayon::prelude::*;
use regex::{CaptureLocations, Regex};
use serde::ser::{SerializeMap, Serializer};
use serde::{Deserialize, Serialize};

use timestamp::{js_trim, DateFormat};

/// What `nativeFormatSpec` (philogg.html) sends for one format.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatSpec {
    /// The builtin default format, unedited: `HEADER_RE` + `parseHeaderLine`.
    pub builtin: bool,
    /// `RegExp.prototype.source` of the compiled format regex. `None` for a
    /// format that failed to compile — JS then treats every line as its own
    /// untimestamped entry, and so does this side.
    pub regex: Option<String>,
    /// `compileDateFormat(tsFormat).matchRegex.source`; `None` means a
    /// free-form timestamp, which only `Date.parse` can read — the page fills
    /// those in itself from `tsRaw`.
    pub date_regex: Option<String>,
    #[serde(default)]
    pub date_order: Vec<String>,
    /// `messageWrapQuote(regex.source)`, or `""`.
    #[serde(default)]
    pub wrap_quote: String,
}

/// One parsed entry, in the page's own entry shape (`parseHeaderLine` /
/// `applyFormatMatch`). `ts` is naive (see `timestamp`), `None` for NaN.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Entry {
    pub ts_raw: String,
    pub ts: Option<i64>,
    pub level: String,
    pub thread: String,
    pub location_short: String,
    pub location_full: String,
    pub method: String,
    pub message: String,
    pub raw: String,
    /// Custom columns, in capture-group order.
    pub fields: Vec<(String, String)>,
    pub msg_open_quote: Option<String>,
}

impl Serialize for Entry {
    /// The golden fixture's entry shape (`tests/golden.rs`): the page's own
    /// keys and order, `id` left empty. The page itself receives entries as
    /// binary batches instead — see `batch`.
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        struct Fields<'a>(&'a [(String, String)]);
        impl Serialize for Fields<'_> {
            fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
                let mut m = s.serialize_map(Some(self.0.len()))?;
                for (k, v) in self.0 {
                    m.serialize_entry(k, v)?;
                }
                m.end()
            }
        }
        let mut m = s.serialize_map(None)?;
        m.serialize_entry("id", "")?;
        m.serialize_entry("tsRaw", &self.ts_raw)?;
        m.serialize_entry("ts", &self.ts)?;
        m.serialize_entry("level", &self.level)?;
        m.serialize_entry("thread", &self.thread)?;
        m.serialize_entry("locationShort", &self.location_short)?;
        m.serialize_entry("locationFull", &self.location_full)?;
        m.serialize_entry("method", &self.method)?;
        m.serialize_entry("message", &self.message)?;
        m.serialize_entry("raw", &self.raw)?;
        m.serialize_entry("fields", &Fields(&self.fields))?;
        if let Some(q) = &self.msg_open_quote {
            m.serialize_entry("msgOpenQuote", q)?;
        }
        m.end()
    }
}

const RESERVED_FIELD_KEYS: [&str; 6] = ["ts", "level", "thread", "location", "method", "message"];

enum Kind {
    /// `compileOneFormat`'s unedited-builtin branch.
    Builtin,
    /// A compiled pattern/regex-mode format.
    Regex {
        re: Regex,
        /// (capture index, name) of every named group, in order.
        names: Vec<(usize, String)>,
        date: Option<DateFormat>,
        wrap_quote: String,
    },
    /// `compileOneFormat`'s "failed to compile" fallback.
    EveryLine,
}

pub struct Parser {
    kind: Kind,
}

impl Parser {
    pub fn new(spec: &FormatSpec) -> Result<Self, String> {
        let kind = if spec.builtin {
            Kind::Builtin
        } else if let Some(src) = &spec.regex {
            let re = compile_js(src)?;
            let names = re
                .capture_names()
                .enumerate()
                .filter_map(|(i, n)| n.map(|n| (i, n.to_string())))
                .collect();
            let date = match &spec.date_regex {
                Some(d) => Some(DateFormat { regex: compile_js(d)?, order: spec.date_order.clone() }),
                None => None,
            };
            Kind::Regex { re, names, date, wrap_quote: spec.wrap_quote.clone() }
        } else {
            Kind::EveryLine
        };
        Ok(Parser { kind })
    }

    /// `isHeaderLine(line) ? parseHeader(line) : null` in one pass.
    pub fn parse_header(&self, line: &str, locs: &mut Option<CaptureLocations>) -> Option<Entry> {
        match &self.kind {
            Kind::Builtin => is_default_header(line).then(|| self.parse_default_header(line)),
            Kind::EveryLine => Some(self.apply_format_match(&[("message", Some(line))], line, None)),
            Kind::Regex { re, names, date, wrap_quote } => {
                let locs = locs.get_or_insert_with(|| re.capture_locations());
                re.captures_read(locs, line)?;
                let groups: Vec<(&str, Option<&str>)> = names
                    .iter()
                    .map(|(i, n)| (n.as_str(), locs.get(*i).map(|(a, b)| &line[a..b])))
                    .collect();
                let mut entry = self.apply_format_match(&groups, line, date.as_ref());
                // markOpenMessageQuote
                if !wrap_quote.is_empty() && !line.ends_with(wrap_quote.as_str()) {
                    entry.msg_open_quote = Some(wrap_quote.clone());
                }
                Some(entry)
            }
        }
    }


    /// `parseHeaderLine(line)`.
    fn parse_default_header(&self, line: &str) -> Entry {
        let tokens: Vec<&str> = line.split('\t').collect();
        let tok = |i: usize| tokens.get(i).copied().unwrap_or("");
        let ts_raw = tok(0);
        let level = js_trim(tok(1)).to_uppercase();
        let thread = strip_quotes(tok(2));
        let method_idx = (3..tokens.len()).find(|&i| is_bracketed(tokens[i]));
        let (location_raw, method, message) = match method_idx {
            None => {
                let cut = 3.max(tokens.len().saturating_sub(1));
                let loc = tokens.get(3..cut).map(|t| t.join(" ")).unwrap_or_default();
                (loc, String::new(), strip_quotes(tokens.last().copied().unwrap_or("")))
            }
            Some(mi) => {
                let m = tokens[mi];
                (tokens[3..mi].join(" "), m[1..m.len() - 1].to_string(), strip_quotes(&tokens[mi + 1..].join("\t")))
            }
        };
        let (location_short, location_full) = format_location(&location_raw);
        Entry {
            ts_raw: ts_raw.to_string(),
            ts: timestamp::parse_default(ts_raw),
            level: if level.is_empty() { "INFO".into() } else { level },
            thread,
            location_short,
            location_full,
            method,
            message,
            raw: line.to_string(),
            fields: Vec::new(),
            msg_open_quote: None,
        }
    }

    /// `applyFormatMatch(groups, line, compiledDate)`. A group that didn't
    /// participate in the match is `None` (JS `undefined`).
    fn apply_format_match(&self, groups: &[(&str, Option<&str>)], line: &str, date: Option<&DateFormat>) -> Entry {
        let get = |k: &str| groups.iter().find(|(n, _)| *n == k).and_then(|(_, v)| *v);
        // `groups.x || ""`: undefined and "" both fall back.
        let non_empty = |k: &str| get(k).filter(|v| !v.is_empty());
        let (location_short, location_full) = format_location(get("location").unwrap_or(""));
        let fields = groups
            .iter()
            .filter(|(n, _)| !RESERVED_FIELD_KEYS.contains(n))
            .filter_map(|(n, v)| v.map(|v| (n.to_string(), strip_quotes(v))))
            .collect();
        let ts_raw = non_empty("ts");
        Entry {
            ts_raw: ts_raw.unwrap_or("").to_string(),
            // No compiled date: Date.parse territory, filled in by the page.
            ts: ts_raw.and_then(|t| date.and_then(|d| timestamp::parse_generic(t, d))),
            level: non_empty("level").map_or_else(|| "INFO".to_string(), |l| js_trim(l).to_uppercase()),
            thread: strip_quotes(non_empty("thread").unwrap_or("")),
            location_short,
            location_full,
            method: non_empty("method").unwrap_or("").to_string(),
            message: get("message").map_or_else(|| line.to_string(), strip_quotes),
            raw: line.to_string(),
            fields,
            msg_open_quote: None,
        }
    }
}

/// `formatLocation(loc)`: `{short, full}`.
fn format_location(loc: &str) -> (String, String) {
    let short = location_short(loc).unwrap_or_else(|| loc.to_string());
    (short, loc.to_string())
}

/// The `m[2] + ":" + m[3]` of formatLocation's
/// `/^(.*?)[\\/]([^\\/]+?)\s+line\s+(\d+)\s*$/i`, worked out from the end
/// instead of run as a regex (it was half the parse time). The tail
/// `\s+line\s+\d+\s*$` can only sit in one place; the lazy file name then
/// starts after the last separator and stops where the whitespace before
/// `line` begins. `location_matches_the_regex` below checks this against the
/// regex itself.
fn location_short(loc: &str) -> Option<String> {
    let t = loc.trim_end_matches(timestamp::is_js_space);
    let digits_at = t.trim_end_matches(|c: char| c.is_ascii_digit()).len();
    if digits_at == t.len() {
        return None;
    }
    let before_digits = &t[..digits_at];
    let before_ws = before_digits.trim_end_matches(timestamp::is_js_space);
    let b = before_ws.as_bytes();
    if before_ws.len() == before_digits.len() || b.len() < 4 || !b[b.len() - 4..].eq_ignore_ascii_case(b"line") {
        return None;
    }
    let head = &before_ws[..b.len() - 4];
    let ws_at = head.trim_end_matches(timestamp::is_js_space).len();
    if ws_at == head.len() {
        return None;
    }
    let sep = head.rfind(['\\', '/'])?;
    if head[..sep].contains(['\n', '\r', '\u{2028}', '\u{2029}']) {
        return None;
    }
    let name_at = sep + 1;
    // The name needs one character; if the whitespace starts right after the
    // separator, that character is whitespace and one more must follow.
    let name_end = if ws_at > name_at {
        ws_at
    } else {
        let first = head[name_at..].chars().next()?.len_utf8();
        if name_at + first >= head.len() {
            return None;
        }
        name_at + first
    };
    Some(format!("{}:{}", &head[name_at..name_end], &t[digits_at..]))
}

fn compile_js(src: &str) -> Result<Regex, String> {
    Regex::new(&jsregex::translate(src)?).map_err(|e| e.to_string())
}

/// `HEADER_RE.test(line)`: `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}\t`.
fn is_default_header(line: &str) -> bool {
    let b = line.as_bytes();
    let shape = b"dddd-dd-dd dd:dd:dd,ddd\t";
    b.len() >= shape.len()
        && b.iter().zip(shape).all(|(c, want)| if *want == b'd' { c.is_ascii_digit() } else { c == want })
}

/// `/^\[.*\]$/.test(token)` — `.` stops at a JS line terminator.
fn is_bracketed(t: &str) -> bool {
    t.len() >= 2
        && t.starts_with('[')
        && t.ends_with(']')
        && !t[1..t.len() - 1].contains(['\n', '\r', '\u{2028}', '\u{2029}'])
}

/// `stripQuotes(s)`.
pub fn strip_quotes(s: &str) -> String {
    let s = js_trim(s);
    if s.len() >= 2 && s.starts_with('"') && s.ends_with('"') {
        s[1..s.len() - 1].to_string()
    } else {
        s.to_string()
    }
}

/// `appendContinuationLine(entry, line)`.
pub fn append_continuation(entry: &mut Entry, line: &str) {
    let mut text = line;
    if let Some(q) = &entry.msg_open_quote {
        if let Some(stripped) = text.strip_suffix(q.as_str()) {
            text = stripped;
            entry.msg_open_quote = None;
        }
    }
    entry.message.push('\n');
    entry.message.push_str(text);
    entry.raw.push('\n');
    entry.raw.push_str(line);
}

/// True for a gzip stream (magic bytes `1f 8b`). The native parser never
/// inflates: `parse_log_file` rejects such a file before streaming anything,
/// and the page falls back to its own route, which inflates with
/// `DecompressionStream("gzip")` (philogg.html, "gzip-compressed logs").
pub fn is_gzip(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b
}

/// Bytes → text the way `FileReader.readAsText` (the page's own file read)
/// does it: BOM sniffing for UTF-8/UTF-16LE/UTF-16BE, UTF-8 otherwise, and
/// U+FFFD for every malformed sequence.
pub fn decode(bytes: &[u8]) -> String {
    fn utf16(bytes: &[u8], le: bool) -> String {
        let units = bytes.chunks_exact(2).map(|p| if le { u16::from_le_bytes([p[0], p[1]]) } else { u16::from_be_bytes([p[0], p[1]]) });
        let mut s: String = char::decode_utf16(units).map(|r| r.unwrap_or('\u{FFFD}')).collect();
        if bytes.len() % 2 == 1 {
            s.push('\u{FFFD}');
        }
        s
    }
    match bytes {
        [0xEF, 0xBB, 0xBF, rest @ ..] => String::from_utf8_lossy(rest).into_owned(),
        [0xFF, 0xFE, rest @ ..] => utf16(rest, true),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, false),
        _ => String::from_utf8_lossy(bytes).into_owned(),
    }
}

/// What one chunk of lines produced: its entries, plus the non-empty lines
/// before its first header — those continue the previous chunk's last entry.
struct ChunkResult<'a> {
    leading: Vec<&'a str>,
    entries: Vec<Entry>,
}

/// Default size of the line-aligned slices `parse_text` hands to rayon.
pub const DEFAULT_CHUNK_BYTES: usize = 1 << 20;

/// `parseLogTextAsync`'s loop over `text.split(/\r\n|\n/)`, run on
/// line-aligned slices in parallel and stitched back together in order.
/// `on_progress(bytes_done, bytes_total)` is called as slices finish (from
/// worker threads).
pub fn parse_text(text: &str, parser: &Parser, chunk_bytes: usize, on_progress: &(dyn Fn(usize, usize) + Sync)) -> Vec<Entry> {
    let total = text.len();
    let mut bounds = Vec::new();
    let mut start = 0;
    loop {
        let want = start + chunk_bytes.max(1);
        let end = if want >= total {
            total
        } else {
            text.as_bytes()[want..].iter().position(|&b| b == b'\n').map_or(total, |p| want + p + 1)
        };
        bounds.push((start, end));
        if end >= total {
            break;
        }
        start = end;
    }
    let done = AtomicUsize::new(0);
    let chunks: Vec<ChunkResult> = bounds
        .par_iter()
        .map(|&(s, e)| {
            let r = parse_chunk(&text[s..e], e == total, parser);
            on_progress(done.fetch_add(e - s, Ordering::Relaxed) + (e - s), total);
            r
        })
        .collect();
    let mut out: Vec<Entry> = Vec::with_capacity(chunks.iter().map(|c| c.entries.len()).sum());
    for c in chunks {
        if let Some(last) = out.last_mut() {
            for line in c.leading {
                append_continuation(last, line);
            }
        } // else: lines before the first header are dropped
        out.extend(c.entries);
    }
    out
}

fn parse_chunk<'a>(chunk: &'a str, is_last: bool, parser: &Parser) -> ChunkResult<'a> {
    // A non-final chunk ends right after a '\n', so its split has one empty
    // piece too many; in the final chunk that piece is real (JS keeps it).
    let body = if is_last { chunk } else { &chunk[..chunk.len() - 1] };
    let mut pieces = body.split('\n').peekable();
    let mut res = ChunkResult { leading: Vec::new(), entries: Vec::new() };
    let mut locs = None;
    while let Some(piece) = pieces.next() {
        // /\r\n|\n/: a '\r' goes with the '\n' after it — but the text's very
        // last piece has no '\n' after it, so its '\r' stays.
        let terminated = !is_last || pieces.peek().is_some();
        let line = if terminated { piece.strip_suffix('\r').unwrap_or(piece) } else { piece };
        if let Some(e) = parser.parse_header(line, &mut locs) {
            res.entries.push(e);
        } else if !line.is_empty() {
            match res.entries.last_mut() {
                Some(cur) => append_continuation(cur, line),
                None => res.leading.push(line),
            }
        }
    }
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gzip_magic_is_detected() {
        assert!(is_gzip(&[0x1f, 0x8b, 0x08, 0x00]));
        assert!(!is_gzip(&[0x1f]));
        assert!(!is_gzip(b"2024-01-15 10:00:00,000\tINFO"));
        assert!(!is_gzip(&[]));
    }

    /// Every sequence of up to five tokens from an alphabet that hits each
    /// branch, against formatLocation's own regex (via the JS translation).
    #[test]
    fn location_matches_the_regex() {
        let re = compile_js(r"^(.*?)[\\/]([^\\/]+?)\s+[lL][iI][nN][eE]\s+(\d+)\s*$").unwrap();
        let alphabet = ["a", "/", "\\", " ", "\t", "line", "LiNe", "7", "42", "\r", "\u{A0}", "\u{2028}", "é"];
        let mut level = vec![String::new()];
        for _ in 0..5 {
            level = level.iter().flat_map(|s| alphabet.iter().map(move |a| format!("{s}{a}"))).collect();
            for s in &level {
                let want = re.captures(s).map(|c| format!("{}:{}", &c[2], &c[3]));
                assert_eq!(location_short(s), want, "{s:?}");
            }
        }
        for s in ["C:\\src\\Foo.cs\tline 152", "/a/b/c.py  LINE 7 ", "x/ line 5", "x/  line 5", "x/y line  12\u{3000}", "a\rb/c line 1"] {
            let want = re.captures(s).map(|c| format!("{}:{}", &c[2], &c[3]));
            assert_eq!(location_short(s), want, "{s:?}");
        }
    }
}
