//! Translates a JavaScript regex source (no flags, non-unicode mode — exactly
//! how `philogg.html` compiles every format regex) into the `regex` crate's
//! syntax with the same matching semantics.
//!
//! The two engines agree on leftmost-first matching, greedy/lazy quantifiers
//! and named groups; where they differ is what the shorthand classes mean:
//! JS `\d`/`\w`/`\b` are ASCII-only, JS `\s` is its own fixed set, and JS `.`
//! excludes `\r`, U+2028 and U+2029 besides `\n`. Those are rewritten into
//! explicit classes. Anything this engine can't express the same way —
//! lookaround, backreferences, and a few legacy Annex-B forms — is refused
//! with `Err`, and the caller falls back to parsing in JS.
//!
//! Known remaining difference: a non-unicode JS regex counts UTF-16 code
//! units, so `.{2}` against one astral character (an emoji) matches in JS but
//! not here. Log formats essentially never count characters that way.

/// JS `\s`: WhiteSpace + LineTerminator (ECMA-262), as class members.
const JS_SPACE: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";
const JS_DIGIT: &str = "0-9";
const JS_WORD: &str = "0-9A-Za-z_";
/// JS `.` (no `s` flag): anything but a LineTerminator.
const JS_DOT: &str = r"[^\n\r\x{2028}\x{2029}]";

pub fn translate(src: &str) -> Result<String, String> {
    let chars: Vec<char> = src.chars().collect();
    let mut out = String::with_capacity(src.len() + 16);
    let mut i = 0;
    let mut in_class = false;
    // Whether the class being emitted has had any member yet — JS `[]`/`[^]`
    // (empty class) have no equivalent spelling here.
    let mut class_start = false;

    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if c == '\\' {
            let n = next.ok_or("trailing backslash")?;
            i += 2;
            let piece = translate_escape(n, &chars, &mut i, in_class)?;
            if in_class && matches!(n, 'd' | 'D' | 'w' | 'W' | 's' | 'S') {
                // JS treats a `-` next to a class escape as a literal; the
                // regex crate would read it as a range operator.
                if chars.get(i) == Some(&'-') && chars.get(i + 1) != Some(&']') {
                    return Err("class escape used as a range bound".into());
                }
            }
            out.push_str(&piece);
            class_start = false;
            continue;
        }
        if in_class {
            match c {
                ']' => {
                    if class_start {
                        return Err("empty character class".into());
                    }
                    in_class = false;
                    out.push(']');
                }
                // Literal in a JS class, but nested-class / set-operation
                // syntax in this engine.
                '[' | '&' | '~' => out.push_str(&hex_escape(c)),
                '-' if next == Some('-') => return Err("'--' in a character class".into()),
                _ => out.push(c),
            }
            class_start = false;
            i += 1;
            continue;
        }
        match c {
            '[' => {
                in_class = true;
                class_start = true;
                out.push('[');
                i += 1;
                if chars.get(i) == Some(&'^') {
                    out.push('^');
                    i += 1;
                }
                continue;
            }
            '.' => out.push_str(JS_DOT),
            '(' => {
                if next == Some('?') {
                    match chars.get(i + 2) {
                        Some(':') => {}
                        Some('<') if !matches!(chars.get(i + 3), Some('=') | Some('!')) => {}
                        _ => return Err("lookaround or group modifier".into()),
                    }
                }
                out.push('(');
            }
            '{' => {
                if let Some(len) = quantifier_len(&chars[i..]) {
                    out.extend(&chars[i..i + len]);
                    i += len;
                    continue;
                }
                out.push_str(r"\{");
            }
            '}' => out.push_str(r"\}"),
            ']' => out.push_str(r"\]"),
            _ => out.push(c),
        }
        i += 1;
    }
    if in_class {
        return Err("unterminated character class".into());
    }
    Ok(out)
}

/// `{n}`, `{n,}` or `{n,m}` at the start of `s` — the only brace forms JS
/// reads as a quantifier; any other `{` is a literal there (Annex B).
fn quantifier_len(s: &[char]) -> Option<usize> {
    let mut i = 1;
    let digits = |i: &mut usize| {
        let start = *i;
        while s.get(*i).is_some_and(|c| c.is_ascii_digit()) {
            *i += 1;
        }
        *i > start
    };
    if !digits(&mut i) {
        return None;
    }
    if s.get(i) == Some(&',') {
        i += 1;
        digits(&mut i);
    }
    (s.get(i) == Some(&'}')).then_some(i + 1)
}

fn hex_escape(c: char) -> String {
    format!(r"\x{{{:X}}}", c as u32)
}

fn class_or_set(members: &str, negated: bool, in_class: bool) -> String {
    match (negated, in_class) {
        (false, true) => members.to_string(),
        (false, false) => format!("[{members}]"),
        // A nested class inside a class is a union in this engine.
        (true, _) => format!("[^{members}]"),
    }
}

/// `n` is the character after the backslash; `i` already points past it and
/// is advanced further for multi-character escapes (`\xHH`, `\uHHHH`).
fn translate_escape(n: char, chars: &[char], i: &mut usize, in_class: bool) -> Result<String, String> {
    Ok(match n {
        'd' => class_or_set(JS_DIGIT, false, in_class),
        'D' => class_or_set(JS_DIGIT, true, in_class),
        'w' => class_or_set(JS_WORD, false, in_class),
        'W' => class_or_set(JS_WORD, true, in_class),
        's' => class_or_set(JS_SPACE, false, in_class),
        'S' => class_or_set(JS_SPACE, true, in_class),
        'b' if in_class => r"\x08".to_string(),
        'b' => r"(?-u:\b)".to_string(),
        'B' if !in_class => r"(?-u:\B)".to_string(),
        't' | 'n' | 'r' | 'f' | 'v' => format!("\\{n}"),
        '0' if !chars.get(*i).is_some_and(|c| c.is_ascii_digit()) => r"\x00".to_string(),
        'x' => {
            let hex: String = chars.iter().skip(*i).take(2).collect();
            if hex.len() != 2 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err("legacy \\x escape".into());
            }
            *i += 2;
            format!(r"\x{{{hex}}}")
        }
        'u' => {
            let hex: String = chars.iter().skip(*i).take(4).collect();
            if hex.len() != 4 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err("legacy \\u escape".into());
            }
            let code = u32::from_str_radix(&hex, 16).map_err(|e| e.to_string())?;
            if (0xD800..=0xDFFF).contains(&code) {
                return Err("surrogate escape".into());
            }
            *i += 4;
            format!(r"\x{{{hex}}}")
        }
        // Backreferences, legacy octal, \c, \k, \p and identity escapes of
        // letters (which this engine gives other meanings) — refused.
        c if c.is_ascii_alphanumeric() => return Err(format!("unsupported escape \\{c}")),
        // Every other escaped character is itself, literally.
        c => hex_escape(c),
    })
}

#[cfg(test)]
mod tests {
    use super::translate;
    use regex::Regex;

    fn re(src: &str) -> Regex {
        Regex::new(&translate(src).unwrap()).unwrap()
    }

    #[test]
    fn shorthand_classes_are_ascii_like_js() {
        assert!(re(r"^\d+$").is_match("0123"));
        assert!(!re(r"^\d+$").is_match("\u{663}")); // Arabic-Indic three
        assert!(!re(r"^\w$").is_match("é"));
        assert!(re(r"^\s$").is_match("\u{FEFF}"));
        assert!(!re(r"^\s$").is_match("\u{85}"));
        assert!(re(r"^[\d\s]+$").is_match("1 2\u{A0}3"));
        assert!(re(r"^[^\d]$").is_match("x"));
        assert!(re(r"^[\D]$").is_match("x"));
        assert!(re(r"\bfoo\b").is_match("a foo b"));
        assert!(re(r"é\bx").is_match("éx")); // é isn't a JS word char
    }

    #[test]
    fn dot_excludes_js_line_terminators() {
        assert!(!re("^.$").is_match("\r"));
        assert!(!re("^.$").is_match("\u{2028}"));
        assert!(re("^.$").is_match("\u{85}"));
    }

    #[test]
    fn literals_and_braces() {
        assert!(re(r"^a\/b\.c$").is_match("a/b.c"));
        assert!(re(r"^x{2}$").is_match("xx"));
        assert!(re(r"^x{,2}$").is_match("x{,2}"));
        assert!(re(r"^a{$").is_match("a{"));
        assert!(re(r"^}$").is_match("}"));
        assert!(re(r"^[[&~]+$").is_match("[&~"));
        assert!(re(r"^\u0041\x42$").is_match("AB"));
        assert!(re(r"^(?<ts>\d+) (?:x|y)$").is_match("12 y"));
    }

    #[test]
    fn unsupported_constructs_are_refused() {
        for src in [r"(?<=a)b", r"(?<!a)b", r"a(?=b)", r"a(?!b)", r"(a)\1", r"\k<x>", r"\p{L}", r"\cA", r"[]", r"[^]", r"\q"] {
            assert!(translate(src).is_err(), "{src}");
        }
    }
}
