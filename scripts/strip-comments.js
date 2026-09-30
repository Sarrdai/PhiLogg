#!/usr/bin/env node
// Release-only comment stripper for philogg.html.
//
// The tracked philogg.html keeps every comment — they are most of what makes
// a 20k-line single file navigable. The copies that leave the repo as a
// release asset or packaged into a desktop installer do not need them, so
// the release build (.github/workflows/build-release-assets.yml) runs this
// over its checked-out copy right after the version stamp and before
// publishing. Nothing is ever committed back.
//
//   node scripts/strip-comments.js <input.html> [output.html]
//
// With no output path the file is rewritten in place. Deliberately
// dependency-free (same reasoning as desktop/src-tauri/icons/generate.js):
// a release job must not need an npm install to run it.
//
// This is a comment stripper, not a minifier: whitespace, names and line
// structure are left alone, so a stack trace from a release build still lands
// on a recognizable line. Removing a comment that occupied a whole line
// removes that line too, which is where nearly all of the saving comes from.
//
// Why hand-written rather than a regex: philogg.html is full of strings that
// contain "//" (URLs, the philogg:// scheme) and of regex literals that
// contain quotes and slashes, so anything short of an actual scanner
// corrupts the file. The scanner tracks strings, template literals (including
// nested ${} interpolation), and regex literals — see regexAllowed() for the
// one genuinely ambiguous case, `/` after `}` or a keyword.
"use strict";

const fs = require("fs");

// A `/` starts a regex literal, rather than a division, only where an
// expression may begin. Approximated the standard way: by the previous
// significant token. `)` and `]` are deliberately absent (`(a + b) / 2` is
// division); `}` is present, since a block-closing brace is far more common
// in this file than an object literal being divided.
const REGEX_PRECEDERS = new Set(
  ["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^", "<", ">", "/"]
);
const REGEX_KEYWORDS = new Set(
  ["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]
);

// Shared by all three strippers. `out` is the output built so far; a comment
// that is the only thing on its line takes the whole line with it (its own
// indentation, and the newline that ended it), instead of leaving a blank one
// behind. Returns the index to continue scanning from.
function dropComment(state, src, afterCommentIdx, hadNewline) {
  const lineStart = state.out.lastIndexOf("\n") + 1;
  const aloneOnLine = /^[ \t]*$/.test(state.out.slice(lineStart));
  let j = afterCommentIdx;
  while (j < src.length && (src[j] === " " || src[j] === "\t")) j++;
  const restIsLineEnd = j >= src.length || src[j] === "\n";
  if (aloneOnLine && restIsLineEnd) {
    // Whole line was just this comment: drop the indentation and the newline
    // too. The previous line's own newline is already emitted, so this cannot
    // join two statements together.
    state.out = state.out.slice(0, lineStart);
    return j < src.length ? j + 1 : j;
  }
  // Otherwise the comment may have to leave something behind, but only what
  // is actually missing: a newline if it spanned lines (a multi-line comment
  // counts as a line terminator for automatic semicolon insertion), and
  // otherwise a space only where removing it would join two tokens. Emitting
  // unconditionally would pad every stripped line with stray whitespace.
  if (hadNewline) {
    if (!state.out.endsWith("\n")) state.out += "\n";
  } else if (!/\s$/.test(state.out) && j < src.length && !/\s/.test(src[j])) {
    state.out += " ";
  }
  return afterCommentIdx;
}

function stripJs(src) {
  const state = { out: "" };
  // One frame per template-literal interpolation being scanned: `depth` is the
  // brace nesting inside it, so the `}` that closes the ${...} can be told
  // apart from any `}` of an object/block written inside it.
  const stack = [{ template: false, depth: 0 }];
  let last = ""; // previous significant token, for regexAllowed
  let i = 0;

  const regexAllowed = () => last === "" || REGEX_PRECEDERS.has(last) || REGEX_KEYWORDS.has(last);

  while (i < src.length) {
    const ctx = stack[stack.length - 1];
    const c = src[i];

    if (ctx.template) {
      if (c === "\\") { state.out += src.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { state.out += c; i++; stack.pop(); last = "`"; continue; }
      if (c === "$" && src[i + 1] === "{") {
        state.out += "${"; i += 2; stack.push({ template: false, depth: 0, inTemplate: true }); last = "";
        continue;
      }
      state.out += c; i++; continue;
    }

    if (c === "/" && src[i + 1] === "/") {
      let j = i + 2;
      while (j < src.length && src[j] !== "\n") j++;
      i = dropComment(state, src, j, false);
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      i = dropComment(state, src, stop, src.slice(i, stop).includes("\n"));
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      state.out += src.slice(i, j + 1); i = j + 1; last = "str";
      continue;
    }
    if (c === "`") {
      state.out += c; i++; stack.push({ template: true }); continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1, inClass = false, closed = false;
      while (j < src.length) {
        const r = src[j];
        if (r === "\\") { j += 2; continue; }
        if (r === "\n") break; // unterminated — not a regex after all
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) { closed = true; break; }
        j++;
      }
      if (closed) {
        j++;
        while (j < src.length && /[a-z]/.test(src[j])) j++; // flags
        state.out += src.slice(i, j); i = j; last = "re";
        continue;
      }
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      state.out += word; i = j; last = word;
      continue;
    }
    if (/\s/.test(c)) { state.out += c; i++; continue; } // whitespace keeps `last`
    if (c === "{") { ctx.depth++; }
    else if (c === "}") {
      if (ctx.depth === 0 && ctx.inTemplate) { state.out += c; i++; stack.pop(); last = "}"; continue; }
      ctx.depth--;
    }
    state.out += c; i++; last = c;
  }
  return state.out;
}

// CSS needs strings tracked too (`content: "/*"` is legal), but nothing else.
function stripCss(src) {
  const state = { out: "" };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      i = dropComment(state, src, stop, src.slice(i, stop).includes("\n"));
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      state.out += src.slice(i, j + 1); i = j + 1;
      continue;
    }
    state.out += c; i++;
  }
  return state.out;
}

function stripHtml(src) {
  const state = { out: "" };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const stop = end === -1 ? src.length : end + 3;
      i = dropComment(state, src, stop, src.slice(i, stop).includes("\n"));
      continue;
    }
    state.out += src[i]; i++;
  }
  return state.out;
}

// A <script>/<style> body can't contain its own closing tag (the HTML parser
// would end the element there), so a plain index scan is enough to find the
// block boundaries — no nesting to worry about.
function stripDocument(html) {
  let out = "";
  let i = 0;
  const openTag = /<(script|style)\b[^>]*>/gi;
  while (i < html.length) {
    openTag.lastIndex = i;
    const m = openTag.exec(html);
    if (!m) { out += stripHtml(html.slice(i)); break; }
    out += stripHtml(html.slice(i, m.index)) + m[0];
    const bodyStart = m.index + m[0].length;
    const closing = "</" + m[1].toLowerCase();
    const bodyEnd = html.toLowerCase().indexOf(closing, bodyStart);
    const stop = bodyEnd === -1 ? html.length : bodyEnd;
    const body = html.slice(bodyStart, stop);
    out += m[1].toLowerCase() === "script" ? verifyJs(stripJs(body), body) : stripCss(body);
    i = stop;
  }
  return out;
}

// The one check worth having: if the scanner mis-read a regex literal as a
// division (or vice versa) the result is almost certainly not parseable any
// more, and a release must fail here rather than ship a broken page.
function verifyJs(stripped, original) {
  for (const src of [stripped, original]) {
    try {
      new Function(src);
    } catch (err) {
      if (src === stripped) {
        throw new Error("stripping produced unparseable JS: " + err.message);
      }
      // The original doesn't parse either (top-level `return`, etc.) — nothing
      // for this check to say, so don't fail the build over it.
      process.stderr.write("strip-comments: skipping parse check (input does not parse standalone)\n");
    }
  }
  return stripped;
}

function main(argv) {
  const [input, output] = argv;
  if (!input) {
    process.stderr.write("usage: node strip-comments.js <input.html> [output.html]\n");
    process.exit(2);
  }
  const before = fs.readFileSync(input, "utf8");
  const after = stripDocument(before);
  fs.writeFileSync(output || input, after);
  const saved = Buffer.byteLength(before) - Buffer.byteLength(after);
  process.stdout.write(
    "strip-comments: " + input + " " + Buffer.byteLength(before) + " -> " + Buffer.byteLength(after) +
    " bytes (-" + saved + ", " + ((saved / Buffer.byteLength(before)) * 100).toFixed(1) + "%)\n"
  );
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { stripDocument, stripJs, stripCss, stripHtml };
