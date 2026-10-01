# Konzept: Textdateien als ein Knoten, Editor als Context-Ansicht

Status: **Umgesetzt** (2026-10-01) — aktueller Stand in `docs/ui-and-views.md`
(Abschnitt "Text files"). Interaktives
Mockup: https://claude.ai/artifact/DxE8868LJws1pQkKRyhRwd (Variantenvergleich
A/B/C, der zu dieser Entscheidung geführt hat:
https://claude.ai/artifact/UWSbsB4vBGqAbvJAwzDN7x). Nach der Umsetzung
beschreibt `docs/ui-and-views.md` den aktuellen Stand; dieses Dokument
bleibt als Begründung stehen.

## Problem

Eine `.txt`/`.json`/`.xml`-Datei öffnet heute im Inline-Viewer
(`openInlineViewer`, `state.inlineViewer`) — einem eigenen Objekt, keinem
Baumknoten. Um darin zu filtern, erzeugt „Filter lines“ bzw. Strg+F
(`openInlineViewerAsTextLog`) eine **zweite, echte Datei** im
Plain-text-Format, die per `node.viewerSource` unter den Viewer gehängt
wird. Folgen:

- Dieselbe Datei steht zweimal im Baum, die Filter hängen zwei Ebenen tief.
- Pretty Print wird bei der Umwandlung eingefroren (`orders.json (pretty)`);
  wer danach Raw will, bekommt einen dritten Knoten.
- Die Textversion sieht aus wie ein Log (grauer Level-Streifen,
  Trennlinien, 28px-Zeilen), obwohl es keine Levels gibt.

## Entscheidung

Eine Textdatei lädt über **jeden** Weg (Öffnen, Drop, Ordner, ZIP,
Desktop-Dateizuordnung) direkt als **ein Dateiknoten im Plain-text-Format**
(`PLAINTEXT_FORMAT_ID`). Es gibt keinen Viewer, kein „Filter lines“ und
keine Verschachtelung mehr. Der Inline-Viewer bleibt nur für Bilder.

Für diese Dateien ändern sich die beiden vorhandenen Ansichten:

- **Context** zeigt den **Editor** (heutiger Text-Viewer: Falten,
  JSON/XML-Farben, freie Textauswahl) mit der ganzen Datei. Bei einem
  Filter-Knoten sind dessen Trefferzeilen hinterlegt und die Suchtreffer
  markiert.
- **Filtered** zeigt die Tabelle im **Textmodus**: kein Level-Streifen,
  keine Trennlinien, Zeilengeometrie wie im Editor.

Es gibt **keinen zusätzlichen Schalter**; der Sprung vom Treffer in die
ganze Datei ist dasselbe Doppelklick/Enter wie bei Logs.

## Was welcher Knoten zeigt

| Knoten | Start-Tab | Context | Filtered |
|---|---|---|---|
| Datei | Context | Editor, ganze Datei, keine Hinterlegung | alle Zeilen, Textmodus |
| Filter | Filtered | Editor, ganze Datei, Trefferzeilen hinterlegt, Suchtreffer markiert | nur Trefferzeilen; Minimap zeigt ihre Lage |
| AND/OR, Link | Filtered | wie Filter, hinterlegt sind die Zeilen des Ergebnisses | wie bei Logs |

## Regeln

| Thema | Verhalten |
|---|---|
| Laden | Alle Einstiegspunkte, die heute `openInlineViewer` mit `kind === "text"` aufrufen, laden stattdessen einen Dateiknoten im Plain-text-Format. Ordner-Auto-Regeln bleiben wie heute log-only. |
| Kopfleiste | Beide Ansichten haben dieselbe Kopfleiste: „LINE“ über der Zeilennummer, daneben der Dateiname (bei JSON mit „· pretty“/„· raw“). Sie ersetzt in Filtered den Spaltenkopf „Line \| Message“. |
| Deckungsgleich | Filtered im Textmodus: eigene Zeilenhöhe gleich der Editor-Zeilenhöhe (skaliert mit `logTextScale`), gleicher Gutter (Zeilennummer + Faltspalte), Text an derselben x-Position, gleiche Schrift. Beide Toolbars gleich hoch. |
| Tab-Wechsel | Die oberste sichtbare Zeile bleibt an ihrer Bildschirmposition (Anker = Zeilennummer). Fehlt sie in der Zielansicht, ist der Anker die ausgewählte Zeile, sonst die nächste Trefferzeile darunter. |
| Sprung | Doppelklick/Enter in Filtered springt in Context desselben Knotens an die Zeile (`revealInHighlightView`), zentriert und kurz hervorgehoben. Liegt sie in einem eingeklappten Block, klappt nur dieser Pfad auf. |
| Context-Inhalt | Ganze Datei statt „… N lines“-Streifen; die Streifen-Einstellungen greifen hier nicht. Falten übernimmt deren Rolle. |
| Auswahl | Context: freie Textauswahl, Kopieren wie im Editor. Filtered: Zeilenauswahl, Lesezeichen, Notizen, Entry-Detail-Panel wie bei Logs. |
| Raw/Pretty | Nur JSON. **Pretty ist Default** für gültiges JSON, ungültiges JSON lädt still als Raw. Schalter in der Context-Toolbar, Einstellung der Datei (persistiert). Umschalten parst die Datei neu; Textfilter rechnen neu, Zeilenbereichs-Filter behalten ihre Nummern. XML hat kein Pretty Print. |
| Wrap | Ein gemeinsamer Wrap-Schalter für beide Ansichten, damit die Zeilenhöhen gleich bleiben. |
| Strg+F | Legt am aktiven Knoten einen Filter an, in beiden Tabs. |
| Stacked | Editor oben, Filtered unten; Doppelklick unten scrollt oben zur Zeile. |
| Historie | Anker in Context ist die Zeilennummer (bei Textdateien ohnehin die Entry-Zeit). |
| Tabs | Patterns, Table und Plot bleiben sichtbar wie bei Logs. |
| Minimap | Bleibt in Context sichtbar und zeigt die Trefferlage; ein Klick scrollt den Editor. |
| Find-Leiste | Strg+G sucht in Context im Editor-Text und springt durch die Fundstellen. |
| Große Dateien | Der Editor wird virtualisiert wie die Log-Tabelle (entschieden 2026-10-01 nach Messung: 19 MB brauchten im alten Viewer wie im ersten Editor 23–33 s). |
| Alte Sessions | Gespeicherte Text-Viewer und „(pretty)“-Textversionen werden nicht migriert (unter 1.0.0 erlaubt); die Datei lädt beim nächsten Öffnen als normale Textdatei. |

## Verworfene Varianten

- **A — immer parsen, nur Tabelle im Textmodus:** verliert Falten und
  freie Textauswahl.
- **B — beim ersten Filter umwandeln, Original als Source darunter:** die
  Datei stünde weiter doppelt im Baum, und ein Knoten, der beim ersten
  Filter Typ und Platz wechselt, kostet Aufwand in Undo, Cache und
  Ordner/ZIP.
- **C, erste Fassung — eigener Text/Lines-Schalter:** durch die
  vorhandenen Tabs Context/Filtered ersetzt.
