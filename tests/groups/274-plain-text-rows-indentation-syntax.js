// GROUP 274 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 274 — Plain-text rows: indentation, syntax highlighting, nesting
   Origin: 2026-09-25, person-requested follow-up to Group 273 — keep a
   plain-text line's leading spaces/tabs and the viewer's JSON/XML syntax
   highlighting in the filter views. Covers: the .col-msg.plaintext class,
   token ranges (JSON, XML incl. an attribute value with "&"), tokens
   combined with filter-match marks in markCombinedHtml, highlighted rows in
   the Filtered view (none for an ordinary log). The "Filter lines" nesting
   under a text viewer (274c/274d) is gone: text files load as one
   plain-text node (GROUP 347).
   ============================================================ */
group(274);
{
  const JSON_TEXT = '{"name":"pump","temp":21.5,"on":true}';

  await withApp(async (w, d, T) => {
    section("274a. Token ranges and their merge with filter-match marks");
    const j = w.jsonTokenRanges('"a": 1');
    assert(j.length === 2 && j[0].cls === "tok-key" && j[1].cls === "tok-number", "JSON: key + number");
    const x = w.xmlTokenRanges('<a b="c&d"/>');
    assert(x.map(r => r.cls).join(",") === "tok-tag,tok-attr,tok-string,tok-tag", "XML: tag, attr, value (with &), close (" + x.map(r => r.cls).join(",") + ")");
    const cmt = w.xmlTokenRanges("<!" + "-- note --" + ">");
    assert(cmt.length === 1 && cmt[0].cls === "tok-comment", "XML comments still tokenized (regex avoids a literal comment opener)");
    assert(w.highlightXmlText('<a b="c&d"/>').includes('<span class="tok-string">&quot;c&amp;d&quot;</span>'), "viewer output escapes inside the token");
    assert(w.highlightJsonText('{"a":1}') === '{<span class="tok-key">&quot;a&quot;:</span><span class="tok-number">1</span>}', "viewer JSON output unchanged");
    const html = w.markCombinedHtml('"a": 12', [[5, 6]], [], w.jsonTokenRanges('"a": 12'));
    assert(html.includes('<mark class="text-match-mark mark-seg"><span class="tok-number">1</span></mark><span class="tok-number">2</span>'), "a match inside a token: the token span sits inside the mark, split at the mark's edge (" + html + ")");
  });

  await withApp(async (w, d, T) => {
    section("274b. Filtered view: indentation kept, JSON highlighted, marks still shown; an ordinary log gets no tokens");
    const [doc] = LOGSIM.generateToStrings({ format: "jsondoc", entries: 6, seed: 3 });
    await w.loadFileDescriptors([{ file: new w.File([doc.text], doc.name), handle: null }]);
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.formatId === "fmt-plaintext" && f.textSyntax === "json", "the .json loaded as a plain-text file node with its syntax");
    const flt = w.createFilterNode(f.id, "text", "level");
    T.state.activeId = flt.id;
    w.render();
    const msg = d.querySelector("#tableRows .log-row .col-msg");
    assert(msg && msg.classList.contains("plaintext"), "message cell carries .plaintext (white-space:pre)");
    assert(/^ {6}"level": "/.test(msg.textContent), "leading spaces kept in the cell text (" + JSON.stringify(msg.textContent) + ")");
    assert(msg.querySelector(".tok-key") && msg.querySelector(".tok-string"), "key and string highlighted");
    assert(msg.querySelector("mark.text-match-mark"), "the filter match is still marked");
    // Person-reported: an empty level badge painted a small grey block right
    // before every message (its padding/background spilling out of the
    // collapsed Level track).
    assert(!d.querySelector("#tableRows .log-row .level-badge"), "plain-text rows render no level badge");
    T.state.activeId = f.id;
    w.render();
    assert(T.minimapBucketCount >= 1 && T.minimapBucketCount <= f.entries.length,
      "minimap: no more buckets than lines (else every other bucket is empty — a striped minimap), got " + T.minimapBucketCount + " for " + f.entries.length + " lines");
    const log = await w.addFile("app.log", makeLog(0, 3), () => {});
    T.state.activeId = log.id;
    w.render();
    const logMsg = d.querySelector("#tableRows .log-row .col-msg");
    assert(logMsg && !logMsg.classList.contains("plaintext") && !logMsg.querySelector("[class^='tok-']"), "ordinary log rows: no plaintext class, no tokens");
  });
}
