//! `philogg.html`'s two timestamp parsers (`parseTimestamp` for the builtin
//! default format, `parseTimestampGeneric` for every other one), minus the
//! time zone — except an `XXX` offset on the timestamp itself, which makes the
//! result absolute (`parse_generic`).
//!
//! Both end in `new Date(y, mo, d, h, mi, s, ms).getTime()` — *local* time.
//! This side stops one step short and returns the "naive" value
//! `Date.UTC(y, mo, d, h, mi, s, ms)` instead; the page converts it with the
//! very same JS engine (`localTimeFromNaive`), so DST gaps/overlaps and the
//! tz database are exactly the ones the rest of the page uses. What is
//! mirrored here is everything before that step: the `|| default` fallbacks,
//! the 0..99 → 1900+ year mapping, and out-of-range fields rolling over
//! (month 13, day 32, …) the way `MakeDay`/`MakeTime` do.

use regex::Regex;

const MS_PER_DAY: i64 = 86_400_000;

/// Days from 1970-01-01 to `y`-`m`-01 (proleptic Gregorian, `m` 1..=12).
fn days_from_civil(y: i64, m: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// `Date.UTC(year, month0, day, h, mi, s, ms)` for the integer arguments the
/// two parsers can produce.
pub fn naive_ms(year: i64, month0: i64, day: i64, h: i64, mi: i64, s: i64, ms: i64) -> i64 {
    // MakeFullYear: a two-digit year means 19xx.
    let year = if (0..=99).contains(&year) { 1900 + year } else { year };
    let ym = year + month0.div_euclid(12);
    let mn = month0.rem_euclid(12);
    let days = days_from_civil(ym, mn + 1) + day - 1;
    days * MS_PER_DAY + h * 3_600_000 + mi * 60_000 + s * 1_000 + ms
}

/// JS `String.prototype.trim()`: WhiteSpace + LineTerminator, which differs
/// from `str::trim` (no U+0085, plus U+FEFF).
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_space)
}

pub fn is_js_space(c: char) -> bool {
    matches!(c,
        '\t' | '\n' | '\u{B}' | '\u{C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}'
        | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}'
        | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn digits(s: &str) -> i64 {
    // Only ever handed \d-matched ASCII digits — at most 6 of them.
    s.bytes().fold(0, |n, b| n * 10 + i64::from(b - b'0'))
}

/// The builtin default format's `parseTimestamp`: exactly
/// `yyyy-MM-dd HH:mm:ss,SSS` after trimming, no fallbacks.
pub fn parse_default(raw: &str) -> Option<i64> {
    let t = js_trim(raw).as_bytes();
    let shape = b"dddd-dd-dd dd:dd:dd,ddd";
    if t.len() != shape.len() {
        return None;
    }
    for (b, want) in t.iter().zip(shape) {
        let ok = if *want == b'd' { b.is_ascii_digit() } else { b == want };
        if !ok {
            return None;
        }
    }
    let f = |a: usize, b: usize| digits(std::str::from_utf8(&t[a..b]).unwrap());
    Some(naive_ms(f(0, 4), f(5, 7) - 1, f(8, 10), f(11, 13), f(14, 16), f(17, 19), f(20, 23)))
}

/// A compiled `tsFormat` (`compileDateFormat` on the JS side): the anchored
/// match regex plus which token each capture group is.
pub struct DateFormat {
    pub regex: Regex,
    pub order: Vec<String>,
}

/// `parseUtcOffsetMinutes(s)`: `Z`, `±HH:MM` or `±HHMM` -> minutes east of UTC.
fn parse_utc_offset_minutes(s: &str) -> Option<i64> {
    if s == "Z" {
        return Some(0);
    }
    let b = s.as_bytes();
    let rest = match b.first()? {
        b'+' | b'-' => &s[1..],
        _ => return None,
    };
    let (hh, mm) = match rest.len() {
        4 => (&rest[..2], &rest[2..]),
        5 if rest.as_bytes()[2] == b':' => (&rest[..2], &rest[3..]),
        _ => return None,
    };
    if !(hh.bytes().all(|c| c.is_ascii_digit()) && mm.bytes().all(|c| c.is_ascii_digit())) {
        return None;
    }
    let (h, mi) = (digits(hh), digits(mm));
    if h > 23 || mi > 59 {
        return None;
    }
    Some(if b[0] == b'-' { -1 } else { 1 } * (h * 60 + mi))
}

/// `parseTimestampGeneric(raw, compiledDate)` with a compiled date format.
/// Returns the naive ts, or — when the format has an `XXX` token — the
/// absolute one (`naive - offset`) flagged `true`, which the page must not
/// localize again. `None` = NaN (no match, or an out-of-range offset).
pub fn parse_generic(raw: &str, fmt: &DateFormat) -> Option<(i64, bool)> {
    let caps = fmt.regex.captures(js_trim(raw))?;
    let part = |tok: &str| -> Option<&str> {
        // Last group wins on a repeated token — same as the JS loop's
        // plain `parts[tok] = m[i + 1]` overwrite.
        let mut found = None;
        for (i, t) in fmt.order.iter().enumerate() {
            if t == tok {
                found = caps.get(i + 1).map(|m| m.as_str());
            }
        }
        found
    };
    // `+parts.X || default`: an absent token or an all-zero value both fall
    // back to the default.
    let num = |v: Option<&str>, default: i64| match v.map(digits) {
        Some(n) if n != 0 => n,
        _ => default,
    };
    let y = num(part("yyyy"), 1970);
    let mo = num(part("MM"), 1) - 1;
    let d = num(part("dd"), 1);
    let h = num(part("HH"), 0);
    let mi = num(part("mm"), 0);
    let s = num(part("ss"), 0);
    let frac = part("SSS").unwrap_or("");
    let ms = if frac.is_empty() {
        0
    } else {
        // Math.round(+frac * Math.pow(10, 3 - frac.length)) — same doubles
        // (Math.pow(10, -k) === 0.1/0.01/0.001 exactly), same rounding (ties
        // toward +∞; the value is never negative, so `round` agrees).
        let scale = match frac.len() {
            1 => 100.0,
            2 => 10.0,
            3 => 1.0,
            4 => 0.1,
            5 => 0.01,
            _ => 0.001,
        };
        (digits(frac) as f64 * scale).round() as i64
    };
    let naive = naive_ms(y, mo, d, h, mi, s, ms);
    // An offset on the timestamp itself always wins over the format's zone.
    match part("XXX") {
        Some(off) => parse_utc_offset_minutes(off).map(|m| (naive - m * 60_000, true)),
        None => Some((naive, false)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_date_utc() {
        // Values from node: Date.UTC(...)
        assert_eq!(naive_ms(2024, 2, 31, 2, 30, 0, 0), 1_711_852_200_000);
        assert_eq!(naive_ms(2024, 12, 1, 0, 0, 0, 0), 1_735_689_600_000); // month 13 rolls over
        assert_eq!(naive_ms(2024, -1, 1, 0, 0, 0, 0), 1_701_388_800_000); // month 0 - 1
        assert_eq!(naive_ms(99, 0, 1, 0, 0, 0, 0), 915_148_800_000); // 99 -> 1999
        assert_eq!(naive_ms(2023, 1, 30, 25, 61, 61, 1500), 1_677_808_922_500);
        assert_eq!(naive_ms(1600, 0, 1, 0, 0, 0, 0), -11_676_096_000_000);
    }

    #[test]
    fn utc_offsets() {
        assert_eq!(parse_utc_offset_minutes("Z"), Some(0));
        assert_eq!(parse_utc_offset_minutes("+05:30"), Some(330));
        assert_eq!(parse_utc_offset_minutes("-0500"), Some(-300));
        assert_eq!(parse_utc_offset_minutes("+2400"), None);
        assert_eq!(parse_utc_offset_minutes("+05:60"), None);
        assert_eq!(parse_utc_offset_minutes("0530"), None);
        assert_eq!(parse_utc_offset_minutes("+5:30"), None);
    }

    #[test]
    fn default_format() {
        assert_eq!(parse_default(" 2024-03-31 02:30:00,123\t"), Some(1_711_852_200_123));
        assert_eq!(parse_default("2024-03-31 02:30:00.123"), None);
        assert_eq!(parse_default("2024-03-31 02:30:00,12"), None);
    }
}
