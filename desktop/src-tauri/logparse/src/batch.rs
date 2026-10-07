//! The binary batch the page receives entries in (`decodeNativeBatch` in
//! `philogg.html` reads it). JSON was the first transport and cost ~7x the
//! whole parse: ~3 bytes of JSON per byte of log through the IPC, then
//! `JSON.parse` on the page's main thread. This layout instead carries every
//! string once in one UTF-8 buffer that the page decodes with a single
//! `TextDecoder` call, and fields are `substring`s of it — a field that
//! already occurs inside the entry's `raw` (most of them) isn't written
//! twice.
//!
//! Layout, little-endian:
//!
//! | offset            | type              | content                              |
//! |-------------------|-------------------|--------------------------------------|
//! | 0                 | f64               | progress fraction                    |
//! | 8                 | u32               | entry count `n`                      |
//! | 12                | u32               | table length `w` (bytes)             |
//! | 16                | f64 × n           | naive `ts`, NaN for none             |
//! | 16 + 8n           | `w` bytes         | per-entry string references (varints)|
//! | 16 + 8n + w       | UTF-8 bytes       | string buffer (to the end)           |
//!
//! Positions and lengths are UTF-16 code units of the decoded buffer, each an
//! unsigned LEB128 varint (7 bits per byte, low bits first, high bit =
//! "more"). Per entry: `raw`'s start as a delta from the previous entry's
//! `raw` start, `raw`'s length; then `(start - rawStart, len)` for `tsRaw,
//! level, thread, location, method, message`; then
//! `flags = hasMsgOpenQuote | tsAbsolute << 1 | customFieldCount << 2`
//! (`tsAbsolute`: the entry's `ts` is already an absolute UTC instant — its
//! timestamp carried an `XXX` offset — so the page must not localize it); the open quote's
//! `(start - rawStart, len)` if present; then per custom field
//! `(name, value)` the same way. Every string is written after its entry's
//! `raw` or inside it, so every relative start is non-negative — and small,
//! which is what keeps the table at a few bytes per field.

use rayon::prelude::*;

use crate::Entry;

fn utf16_len(s: &str) -> u32 {
    (if s.is_ascii() { s.len() } else { s.encode_utf16().count() }) as u32
}

fn varint(out: &mut Vec<u8>, mut v: u32) {
    while v >= 0x80 {
        out.push((v as u8) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

struct Writer {
    table: Vec<u8>,
    buf: String,
    /// UTF-16 length of `buf` so far.
    pos: u32,
}

impl Writer {
    fn append(&mut self, s: &str) -> u32 {
        let start = self.pos;
        self.buf.push_str(s);
        self.pos += utf16_len(s);
        start
    }

    /// References `s` inside the entry's already-written `raw` (at `raw_at`)
    /// when it occurs there, otherwise appends it; writes the relative ref.
    fn field(&mut self, s: &str, raw: &str, raw_ascii: bool, raw_at: u32) {
        let found = if s.is_empty() { Some(0) } else { raw.find(s) };
        let start = match found {
            Some(b) => raw_at + if raw_ascii { b as u32 } else { utf16_len(&raw[..b]) },
            None => self.append(s),
        };
        varint(&mut self.table, start - raw_at);
        varint(&mut self.table, utf16_len(s));
    }
}

/// One batch message.
pub fn encode_batch(entries: &[Entry], fraction: f64) -> Vec<u8> {
    let mut w = Writer { table: Vec::with_capacity(entries.len() * 24), buf: String::new(), pos: 0 };
    let mut prev_raw = 0;
    for e in entries {
        let raw_at = w.append(&e.raw);
        varint(&mut w.table, raw_at - prev_raw);
        varint(&mut w.table, utf16_len(&e.raw));
        prev_raw = raw_at;
        let ascii = e.raw.is_ascii();
        for f in [&e.ts_raw, &e.level, &e.thread, &e.location, &e.method, &e.message] {
            w.field(f, &e.raw, ascii, raw_at);
        }
        varint(&mut w.table, u32::from(e.msg_open_quote.is_some()) | u32::from(e.ts_absolute) << 1 | (e.fields.len() as u32) << 2);
        if let Some(q) = &e.msg_open_quote {
            w.field(q, &e.raw, ascii, raw_at);
        }
        for (k, v) in &e.fields {
            w.field(k, &e.raw, ascii, raw_at);
            w.field(v, &e.raw, ascii, raw_at);
        }
    }
    let mut out = Vec::with_capacity(16 + entries.len() * 8 + w.table.len() + w.buf.len());
    out.extend(fraction.to_le_bytes());
    out.extend((entries.len() as u32).to_le_bytes());
    out.extend((w.table.len() as u32).to_le_bytes());
    for e in entries {
        out.extend(e.ts.map_or(f64::NAN, |t| t as f64).to_le_bytes());
    }
    out.extend(&w.table);
    out.extend(w.buf.as_bytes());
    out
}

/// Encodes `entries` in batches of `batch` — in parallel, a few batches at a
/// time — and hands them to `send` in order. `fraction` runs from `base` to 1.
pub fn for_each_batch(
    entries: &[Entry],
    batch: usize,
    base: f64,
    send: &mut dyn FnMut(Vec<u8>) -> Result<(), String>,
) -> Result<(), String> {
    let batches: Vec<&[Entry]> = entries.chunks(batch.max(1)).collect();
    let n = batches.len();
    let window = rayon::current_num_threads().max(1) * 2;
    for (wi, group) in batches.chunks(window).enumerate() {
        let messages: Vec<Vec<u8>> = group
            .par_iter()
            .enumerate()
            .map(|(k, b)| encode_batch(b, base + (1.0 - base) * (wi * window + k + 1) as f64 / n as f64))
            .collect();
        for m in messages {
            send(m)?;
        }
    }
    Ok(())
}

/// The reader side, for tests: what `decodeNativeBatch` does on the page.
pub fn decode_batch(bytes: &[u8]) -> (f64, Vec<Entry>) {
    let f64_at = |o: usize| f64::from_le_bytes(bytes[o..o + 8].try_into().unwrap());
    let u32_at = |o: usize| u32::from_le_bytes(bytes[o..o + 4].try_into().unwrap());
    let n = u32_at(8) as usize;
    let tlen = u32_at(12) as usize;
    let table = &bytes[16 + 8 * n..16 + 8 * n + tlen];
    let text: Vec<u16> = std::str::from_utf8(&bytes[16 + 8 * n + tlen..]).unwrap().encode_utf16().collect();
    let mut p = 0;
    let mut next = || {
        let (mut v, mut shift) = (0u32, 0);
        loop {
            let b = table[p];
            p += 1;
            v |= u32::from(b & 0x7F) << shift;
            if b < 0x80 {
                return v;
            }
            shift += 7;
        }
    };
    let mut raw_at = 0;
    let mut entries = Vec::with_capacity(n);
    for i in 0..n {
        raw_at += next();
        let raw_len = next();
        let at = |s: u32, l: u32| String::from_utf16(&text[s as usize..(s + l) as usize]).unwrap();
        let mut e = Entry { ts: (!f64_at(16 + 8 * i).is_nan()).then(|| f64_at(16 + 8 * i) as i64), raw: at(raw_at, raw_len), ..Default::default() };
        for f in [&mut e.ts_raw, &mut e.level, &mut e.thread, &mut e.location, &mut e.method, &mut e.message] {
            let (s, l) = (next(), next());
            *f = at(raw_at + s, l);
        }
        let flags = next();
        e.ts_absolute = flags & 2 == 2;
        if flags & 1 == 1 {
            let (s, l) = (next(), next());
            e.msg_open_quote = Some(at(raw_at + s, l));
        }
        for _ in 0..flags >> 2 {
            let (ks, kl) = (next(), next());
            let (vs, vl) = (next(), next());
            e.fields.push((at(raw_at + ks, kl), at(raw_at + vs, vl)));
        }
        entries.push(e);
    }
    (f64_at(0), entries)
}
