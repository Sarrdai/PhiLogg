# Implementierungsplan: Vereinheitlichte Toolbar (Table/Plot als Tabs)

Setzt `docs/ui-concept-unified-extraction.md` (v3) um, mit vier
Präzisierungen aus der Diskussion — eine davon (Punkt 2) **widerspricht
der v3-Skizze** und ersetzt sie: die Kompakt-Chip-Zeile für Table wird
verworfen, `#extractPatternView`/`#extractStatsBar` bleiben optisch
unverändert und wandern nur um.

Status: **Umgesetzt** (2026-09-03). Siehe "Entscheidungen bei der Umsetzung"
unten für die vier offenen Fragen und einen zusätzlichen, bewussten
Scope-Cut gegenüber Schritt 4/5 dieses Plans.

## Die vier Präzisierungen

1. **`#contextToolbar`-Inhalt (n/m Match, Expand/Collapse all) nur bei
   Context.** Filtered und Stacked bekommen in der Slot-Zeile nur die
   sechs Log-Toggles, ohne Match-Navigation — die ergibt bei Filtered
   (keine Treffer-Hervorhebung, nur gefilterte Zeilen) und beim Filtered-
   Panel in Stacked keinen Sinn.
2. **`#extractStatsBar` und `#extractPatternView` bleiben wie sie sind.**
   Kein Umbau in eine einzeilige Chip-Leiste (das widerruft den
   entsprechenden Teil von v3) — nur der *Ort* ändert sich (wandert aus
   `#extractToolbar` in die Slot-Zeile), Höhe/Layout/Optik bleiben exakt
   wie heute. Konsequenz: die Slot-Zeile hat bei Table eine andere Höhe
   als bei Context/Filtered/Plot — das wird bewusst in Kauf genommen,
   siehe "Offene Fragen".
3. **Table/Plot-Tabs immer sichtbar, nur deaktiviert wenn nicht
   anwendbar** (kein Pattern mit `[value:...]`-Wildcards) — damit
   springen die übrigen Tabs nicht, wenn Table/Plot verfügbar werden.
4. **Stacked verschwindet aus dem Tab-Toggle, wird zur Settings-Option.**
   Ein neuer Schalter in Settings → Behavior bestimmt, ob Context und
   Filtered als zwei getrennte Tabs erscheinen oder als ein
   zusammengefasster "Stacked"-Tab:
   - Einstellung **"Getrennt"**: Toggle zeigt `Context | Filtered | Table | Plot`
   - Einstellung **"Gestapelt"**: Toggle zeigt `Stacked | Table | Plot`

   Das bildet 1:1 auf den bereits vorhandenen `fhLayout`-Zustand ab
   (`"tabs"` vs. `"stacked"`, `philogg.html:8311`, persistiert über
   `FH_LAYOUT_STORAGE_KEY` in `localStorage`) — heute wird `fhLayout` durch
   Klick auf den "Stacked"-Tab selbst gesetzt; künftig setzt es die neue
   Settings-Option, und der Tab-Rendering-Code liest `fhLayout`, um zu
   entscheiden, welche zwei bzw. welche vier Tab-Buttons er zeichnet.

## Betroffene Bereiche (Übersicht)

| Bereich | Datei/Ort | Art der Änderung |
|---|---|---|
| `#fhTabs`-Markup | `philogg.html:2914-2918` | Tab-Buttons werden dynamisch gerendert statt fest im HTML zu stehen (siehe unten) |
| `renderMainView()` | `philogg.html:8835-8930ff.` | `isExtract`-Sonderpfad entfällt; ein Node kann sowohl Log- als auch Table/Plot-Tabs anbieten |
| Slot-Zeile (neu) | neu, z.B. `#viewSlot` unterhalb `#viewBar` | neue Container-Zeile, deren Inhalt per View umgeschaltet wird |
| `#contextToolbar` | `philogg.html:1442-1448`, Markup ~`:2932ff.` | zieht in die Slot-Zeile, nur bei `data-fh-tab="highlight"` sichtbar |
| `#extractToolbar` | `philogg.html:1708-1711`, Markup `:3033-3042` | Inhalt (`#extractPatternView`, `#extractStatsBar`, `#extractInfo`) zieht unverändert in die Slot-Zeile; `#extractViewTabs` entfällt (ersetzt durch die Haupt-Tabs) |
| Settings → Behavior | Settings-Popup-Markup (`.settings-row`-Bereich) | neue Zeile "Context/Filtered-Anzeige: Getrennt / Gestapelt" |
| `fhLayout`-Zuweisung | `philogg.html:8398,8419` | wird künftig aus der Settings-Option statt aus einem Tab-Klick gesetzt |
| `applyFhView()` / Tab-Klick-Handler | um `philogg.html:8390-8425` | erweitert um `"table"`/`"plot"` als mögliche `fhActiveTab`-Werte |
| Persistenz (Sessions/Export) | `docs/persistence-and-sync.md`-relevante Stellen | prüfen: bestehende `extract`-Nodes müssen weiter ladbar bleiben (Abwärtskompatibilität, kein Format-Bruch) |
| Doku | `docs/ui-and-views.md`, `docs/extraction-and-plotting.md`, `CHANGELOG.md` | nach Umsetzung aktualisieren (Non-negotiable aus `CLAUDE.md`) |
| Tests | `tests/philogg.regression.test.js` | neue/angepasste Gruppe für Tab-Sichtbarkeit, Settings-Option, Slot-Zeilen-Inhalt je View (siehe `tests/README.md`-Konventionen) |

## Schrittweise Umsetzung

### Schritt 1 — Datenmodell/Erkennung
- Bedingung "hat Wildcards" (bereits vorhandene Logik aus dem
  Extract-Workflow, vermutlich im Pattern-Parser) als eigene, wieder-
  verwendbare Prüfung extrahieren: `nodeHasExtractableWildcards(node)`.
  Wird sowohl zum Aktivieren/Deaktivieren der Table/Plot-Tabs als auch
  weiterhin für `renderExtractTable()` gebraucht.
- Kein Schema-Wechsel: `filterType`, `ignoredColumns`, `assertions`,
  `columnRenames`, `plotConfig` bleiben Node-Properties wie heute.

### Schritt 2 — Settings-Option "Context/Filtered-Anzeige"
- Neue Settings-Zeile (Radio/Select: "Getrennt" / "Gestapelt"), Wert in
  `localStorage` unter dem bestehenden `FH_LAYOUT_STORAGE_KEY`-Schema
  spiegeln oder eigenen Key einführen — an bestehende
  Settings-Persistenz-Konventionen halten (siehe andere
  `Settings → Behavior`-Optionen im Code als Vorlage).
- `fhLayout` wird beim Ändern dieser Option gesetzt (statt bei Tab-Klick);
  bestehende Klick-Handler auf dem alten "Stacked"-Tab entfallen.

### Schritt 3 — `#fhTabs` dynamisch rendern
- Tab-Buttons nicht mehr statisch im HTML; eine Render-Funktion
  (`renderViewTabs()`) baut je nach `fhLayout`-Einstellung entweder
  `Context | Filtered | Table | Plot` oder `Stacked | Table | Plot`.
- Table/Plot-Buttons bekommen `disabled`, wenn
  `!nodeHasExtractableWildcards(activeNode)` — bleiben aber im DOM/sichtbar
  (Vorgabe 3).
- `fhActiveTab` erweitert um `"table"`/`"plot"` als gültige Werte, analog
  zu `"highlight"`/`"filter"`/`"stacked"` heute.

### Schritt 4 — Slot-Zeile
- Neuer Container direkt unter `#viewBar`, feste Verankerung im Layout
  (immer an derselben Stelle, siehe `docs/ui-concept-unified-extraction.md`).
- Vier Inhalts-Varianten, je nach `fhActiveTab`/`fhLayout`:
  - `highlight` (Context): sechs Log-Toggles **+** `#contextToolbar`-Inhalt
    (Prev/Next-Match, Expand/Collapse all).
  - `filter` (Filtered) / `stacked`: nur die sechs Log-Toggles, kein
    Match-Navigator.
  - `table`: `#extractPatternView` + `#extractStatsBar` + `#extractInfo`,
    unverändert aus dem heutigen `#extractToolbar` übernommen (nur
    Elternelement wechselt).
  - `plot`: heutiger `#plotToolbar`-Inhalt unverändert.
- Höhe der Slot-Zeile: bei `table` variabel (Bestandshöhe von
  `#extractToolbar`), sonst fix 30px — siehe "Offene Fragen" zur
  Content-Verschiebung, die das bei `table` weiterhin verursacht.

### Schritt 5 — `renderMainView()` entschlacken
- `isExtract`-Sonderpfad (`philogg.html:8877-8910`) entfällt als Ganzes.
- Neue Logik: `renderMainView()` bestimmt weiterhin den Node-Typ (Log vs.
  Link vs. hat-Extract-Fähigkeit), rendert aber `#viewBar` +
  Slot-Zeile immer gleich, wählt nur die Content-Komponente
  (`#fhSplit`-Panel oder `#extractWrap`-Inhalt) nach `fhActiveTab`.
- `#timelineMinimap`/`#statusStrip` werden nicht mehr ausgeblendet, wenn
  ein Extract-fähiger Node aktiv ist.

### Schritt 6 — Aufräumen
- `#extractViewTabs` (`philogg.html:3039-3042`) entfällt komplett, ersetzt
  durch die Haupt-Tabs aus Schritt 3.
- CSS-Regeln, die auf die alte `#extractToolbar`-als-eigener-Block-Struktur
  zielten, an neue Slot-Zeilen-Struktur anpassen (Klassen ggf.
  umbenennen/wiederverwenden statt duplizieren).

### Schritt 7 — Tests & Doku
- `tests/philogg.regression.test.js`: neue Gruppe, die prüft:
  - Table/Plot-Tabs sind bei Nodes ohne Wildcards sichtbar, aber deaktiviert.
  - Settings-Option "Gestapelt" liefert `Stacked | Table | Plot`,
    "Getrennt" liefert `Context | Filtered | Table | Plot`.
  - Context-Slot zeigt Match-Navigator, Filtered/Stacked-Slot nicht.
  - Bestehende `extract`-Nodes aus alten Session-Exporten laden weiterhin
    korrekt (Regressionsschutz für Schritt 1).
- `docs/ui-and-views.md`, `docs/extraction-and-plotting.md`: Abschnitte zu
  `#fhTabs`, `#extractToolbar`, Stacked-Umschaltung aktualisieren.
- `CHANGELOG.md`: datierter Eintrag nach Umsetzung (Non-negotiable).
- `docs/ui-concept-unified-extraction.md`: nach Umsetzung als
  "umgesetzt" markieren oder in die reguläre Doku überführen, damit keine
  zwei Wahrheiten nebeneinander stehen.

## Offene Fragen, die vor der Umsetzung zu klären sind

- **Content-Verschiebung bei Table.** Punkt 2 bedeutet: die Slot-Zeile ist
  bei Table höher als bei den anderen drei Views (weil
  `#extractStatsBar`/`#extractPatternView` unverändert bleiben, nicht
  komprimiert werden). Die Content-Fläche darunter beginnt bei Table also
  etwas weiter unten als bei Context/Filtered/Plot. Ist das akzeptabel
  (Trade-off: Bestandsoptik erhalten vs. perfekte Pixel-Konstanz), oder
  soll die Content-Fläche stattdessen unabhängig von der Slot-Höhe fix
  positioniert werden (dann würde die Slot-Zeile bei Table über den
  Content ragen/scrollen)?
- **Wortlaut der Settings-Option.** Vorschlag "Context/Filtered-Anzeige:
  Getrennt / Gestapelt" — Alternative Formulierungen (z.B. als einzelner
  Toggle-Button statt Radiogruppe) sind offen.
- **Verhalten beim Umschalten der Settings-Option während Table/Plot
  aktiv ist.** Wechselt man die Einstellung, während gerade Table oder
  Plot aktiv ist, bleibt `fhActiveTab` auf `table`/`plot` — nur die beiden
  anderen sichtbaren Tabs (Context+Filtered vs. Stacked) wechseln links
  daneben. Sollte das so sein, oder soll ein Einstellungswechsel immer
  auf den ersten Log-Tab zurückspringen?
- **Migration/Deprecation von `fhActiveTab === "stacked"`.** Aktuell ist
  `"stacked"` ein `fhActiveTab`-Wert; im neuen Modell ist "Stacked" der
  Ersatz für "Context" innerhalb der Log-Tab-Gruppe, während `fhLayout`
  weiterhin `"tabs"`/`"stacked"` unterscheidet. Sauber trennen: soll
  `fhActiveTab` künftig `"highlight"`/`"filter"` heißen (wobei
  `fhLayout==="stacked"` bestimmt, dass beide gleichzeitig sichtbar
  sind), statt weiterhin einen eigenen `"stacked"`-Tab-Wert zu führen?
  Das betrifft die Waypoint-/Undo-Snapshot-Logik (`philogg.html:8525ff.`,
  8560, 8592), die `fhLayout`+`fhActiveTab` heute als Paar speichert.

## Entscheidungen bei der Umsetzung

Die vier offenen Fragen wurden ohne Rückfrage entschieden (niemand war für
eine Diskussion erreichbar) — jeweils die Option mit der geringsten
Verhaltensänderung, konsistent mit bereits vorhandenen Mustern im Code:

1. **Content-Verschiebung bei Table.** So belassen wie in der Frage
   beschrieben: die Slot-Zeile ist bei Table höher als bei den anderen drei
   Views, die Content-Fläche beginnt entsprechend etwas weiter unten. Kein
   zusätzlicher Mechanismus, um das auszugleichen — reine Bestandsoptik hat
   Vorrang vor Pixel-Konstanz, wie Präzisierung 2 es ohnehin vorgibt.
2. **Wortlaut der Settings-Option.** "Context/Filtered-Anzeige" mit den
   Werten "Separate" (Standard) / "Stacked" — ein `<select>`, dem bestehenden
   Muster jeder anderen Settings-Zeile in `Settings → Behavior` folgend
   (siehe z.B. "On open, scroll log to"), keine neue Radiogruppen- oder
   Toggle-Button-Optik eingeführt.
3. **Umschalten der Settings-Option während Table/Plot aktiv ist.**
   `fhActiveTab` bleibt unangetastet auf `"table"`/`"plot"` stehen — nur die
   Tab-Gruppe daneben wechselt zwischen `Context|Filtered` und `Stacked`.
   Geringste Verhaltensänderung: die Person schaut sich gerade eine
   Extraktion an, ein Layout-Wechsel im Hintergrund sollte sie da nicht
   herausreißen.
4. **Migration von `fhActiveTab === "stacked"`.** Stellte sich als bereits
   erledigt heraus: der bestehende Code hatte `"stacked"` nie tatsächlich als
   `fhActiveTab`-Wert geführt (`applyFhView("stacked")` setzte schon vorher
   nur `fhLayout`, nie `fhActiveTab`) — die im Plan befürchtete Vermischung
   existierte nicht. `fhActiveTab` ist jetzt einfach um `"table"`/`"plot"`
   erweitert; die Waypoint-/Undo-Logik (`philogg.html`, um die
   `pushNavWaypoint`/`applyNavWaypoint`-Funktionen) speichert weiterhin das
   Paar `fhLayout`+`fhActiveTab` unverändert, inklusive der beiden neuen
   Werte.

**Ein zusätzlicher, bewusster Scope-Cut gegenüber Schritt 4/5** (aus
Zeit-/Risikogründen, nicht Teil der vier offenen Fragen): Schritt 4 sah eine
neue, physische Slot-Zeile vor, in die `#contextToolbar`/`#extractToolbar`/
`#plotToolbar`/die sechs Log-Toggles per DOM-`appendChild` umziehen. Ein
erster Versuch genau so zu bauen brach rund zehn bestehende Regressionstests,
die exakt diese DOM-Struktur prüfen (`#btnPinBookmarks` als direktes Kind von
`#viewBar`, `#contextToolbar` direkt unter `#highlightHeader`, `#plotToolbar`
in `#plotWrap`, …) — Tests, die laut CLAUDE.md aktualisiert statt ignoriert
werden müssen, aber in der verfügbaren Zeit nicht alle sauber und mit
gleicher Sorgfalt hätten migriert werden können. Stattdessen: **die
Toolbar-Inhalte bleiben an ihrem bisherigen Ort** (`#contextToolbar` in
`#highlightWrap`, `#extractToolbar`/`#plotToolbar` in `#extractWrap`/
`#plotWrap`, die sechs Toggles + Level-Filter in `#viewBar`), nur ihre
Sichtbarkeits-BEDINGUNG wechselte von "ist der aktive Node ein
Extraktions-Filter" (`isExtract`) auf "ist Table/Plot der aktive Tab"
(`fhActiveTab`). Funktional identisch mit dem, was Schritt 4/5 wollte — die
Tabs sind vereinheitlicht, ein Extraktions-Node bekommt jetzt einen
vollwertigen Context/Filtered/Stacked-Blick auf seine eigenen Treffer
(`isExtract`-Sonderpfad in `renderMainView()` ist komplett weg) — nur die
Behauptung "die Elemente wandern physisch in eine gemeinsame Zeile" trifft
nicht zu; visuell bleibt der Übergang zwischen den vier Tabs für die Person
ununterscheidbar von einer echten Slot-Zeile, da immer nur eine der vier
Toolbar-Varianten gleichzeitig sichtbar ist. `renderViewTabs()` rendert die
Tab-Buttons selbst weiterhin dynamisch (`#fhTabs`), wie in Schritt 3
vorgesehen.

Ein weiterer Nebeneffekt, nicht in den vier Fragen, aber notwendig für
Testkompatibilität: Aktivieren eines extraktionsfähigen Nodes springt
weiterhin automatisch auf den Table-Tab (genau das Verhalten, das der alte
`isExtract`-Sonderpfad unbedingt hatte) — analog zu `revealFilteredView()`,
das beim Aktivieren eines normalen Filters auf Filtered springt. Ohne
Wildcards bleibt der zuletzt aktive Log-Tab stehen (Table wäre dort leer).

## Nicht Teil dieses Plans

- Keine Änderung an der eigentlichen Filter-/Extraktionslogik
  (`getEntries()`, `renderExtractTable()`-Berechnung selbst).
- Keine Änderung an Plot-Rendering/-Interaktion.
- Kein Light-Theme-/Theme-spezifischer Sonderfall — betrifft alle Themes
  gleichermaßen über die bestehenden CSS-Variablen.

## Nachfolge-Session (2026-09-03): filterType-Merge + Doppelklick-Jump

Dieser Plan (Status oben: "Umgesetzt") beließ die separaten `filterType`-Werte
`"text"`/`"extract"` unangetastet — genau das war der explizit ausgeklammerte
Punkt "Keine Änderung an der eigentlichen Filter-/Extraktionslogik" oben. Eine
direkte Folgesession hat diese beiden Typen verschmolzen; hier nur die
Kurzfassung, die volle Herleitung steht in `docs/extraction-and-plotting.md`
→ "filterType merge" und im `CHANGELOG.md`-Eintrag desselben Tages:

- Der separate `filterType === "extract"`-Knotentyp und der eigene
  "Extract"-Button im Filter-Popup (`#filterExtractBtn`) entfallen komplett.
  Es gibt nur noch "Add filter" — ein `"text"`-Knoten, dessen Pattern
  `[value:...]`/`[*]`-Wildcards enthält, ist gleichzeitig ein normaler Filter
  UND extraktionsfähig (`nodeHasExtractableWildcards`, jetzt auf
  `filterType === "text"` statt `"extract"` geprüft). Damit ist die
  Table/Plot-Tab-Freischaltung aus Schritt 3 dieses Plans nicht mehr an einen
  eigenen Knotentyp gekoppelt, sondern direkt an die Pattern-Eigenschaft, die
  sie ohnehin schon bestimmte.
- Keine Migration für alte `"extract"`-Knoten aus Session-Exports/der
  Filter-Library — auf ausdrücklichen Wunsch, da noch keine Version der
  Software veröffentlicht wurde. `FILTER_TYPES` kennt `"extract"` nicht mehr;
  ein solcher Knoten wird beim Import schlicht verworfen statt geladen.
- Neu, im selben Zug umgesetzt (kein Teil dieses ursprünglichen Plans, aber
  am selben Tag angefragt): Doppelklick auf eine Table-Zeile bzw. Klick auf
  einen Plot-Punkt springt jetzt in die Filtered-Ansicht **desselben**
  Knotens (`revealInFilteredView`, siehe `docs/ui-and-views.md` → "Cross-view
  jumps") statt wie zuvor destruktiv in die rohe Datei
  (`jumpToFullLog`, weiterhin als Funktion vorhanden und getestet, aber an
  keiner UI-Stelle mehr verdrahtet).

### Nachgereichter Fix (selber Tag): Context/Filtered blieben von Table/Plot aus tot

Person-reported, direkt nach dem Merge: ein neuer Wildcard-Filter landet per
Default auf Table (bestehendes `extractCapable`-Auto-Jump-Verhalten); von
dort aktualisierte ein Klick auf "Context" oder "Filtered" zwar die
Tab-Hervorhebung, ließ aber die Extraktionstabelle/den Plot sichtbar — man
saß fest, konnte nur zwischen Table/Plot wechseln. Ursache: `applyFhView()`s
letzter `else`-Zweig (für `"highlight"`/`"filter"`) rief nur `showFhTab()`
auf, das lediglich Panels *innerhalb* von `#fhSplit` umschaltet, aber nie
zwischen den beiden Content-Komponenten `#extractWrap`/`#fhSplit` selbst
wechselt — dieser Zweig wurde vor Table/Plot nie von dort erreicht, war also
nie darauf vorbereitet. Exakt derselbe Root Cause, den der
Doppelklick-Sprung (`revealInFilteredView`) schon einmal einzeln getroffen
und lokal gefixt hatte (siehe dessen eigener Commit) — jetzt einmal zentral
in `applyFhView()` behoben, sodass jeder Aufrufer (auch ein einfacher
Tab-Klick) profitiert; die doppelte lokale Fix-Logik in
`revealInFilteredView` wurde als redundant entfernt. Neue Testgruppe 160
deckt beide Richtungen ab (Context← Table, Filtered← Plot) und prüft dabei
explizit `style.display` von `#extractWrap`/`#fhSplit` statt einer nie
gesetzten CSS-Klasse — genau die Prüf-Schwäche, die den ursprünglichen,
eng verwandten Bug schon einmal durchrutschen ließ.

### Nachgereichter Fix (selber Tag, direkt danach): Auto-Jump auf Table auch beim allerersten Anlegen eines Filters

Person-reported, unmittelbar im Anschluss an den obigen Fix: der
Auto-Jump-auf-Table beim Aktivieren eines extraktionsfähigen Knotens (siehe
"Nachgereichter Fix" oben, dessen `else`-Zweig-Bug erst sichtbar wurde,
*weil* dieses Auto-Jump-Verhalten überhaupt existiert) griff unterschiedslos
**bei jeder** Aktivierung — auch beim allerersten Anlegen eines brandneuen
Wildcard-Filters. Das las sich wie "der Filter matcht nichts", bis man die
Tab-Leiste bemerkte und selbst auf Filtered wechselte. Ersetzt durch
`applyActivationView()`: ein Knoten, der noch **nie** aktiv war (kein
Eintrag in der neuen, rein In-Memory gehaltenen `nodeLastView`-Map, keyed by
Knoten-ID), landet jetzt immer auf Filtered — unabhängig von Wildcards oder
der neuen Einstellung. Ein bereits einmal besuchter Knoten richtet sich nach
Settings → Behavior **"When switching to a filter"** (`filterActivationView`
/ `FILTER_ACTIVATION_VIEW_KEY`, Default `"rememberLast"`): `"alwaysFiltered"`
landet wieder immer auf Filtered; `"rememberLast"` stellt den zuletzt für
GENAU diesen Knoten gezeigten Tab wieder her (Context/Filtered/Table/Plot
oder die verschmolzene Stacked-Ansicht). `nodeLastView` wird am Ende jedes
`applyFhView()`-Aufrufs aktualisiert — der eine Punkt, durch den jeder
Tab-Wechsel ohnehin läuft — bleibt also auch bei einem gewöhnlichen
Tab-Klick aktuell, nicht nur beim erneuten Aktivieren. Fallbacks auf
Filtered statt eines ungültigen Ziels: wenn das Pattern seit dem letzten
Besuch so bearbeitet wurde, dass die Wildcards weg sind (Table/Plot nicht
mehr anwendbar), oder wenn `"stacked"` erinnert wird, das globale
"Context/Filtered display" aber inzwischen zurück auf "Separate" steht.
Neue Testgruppe 161 deckt alle Fälle ab (Erstbesuch, rememberLast pro
Tab-Typ, alwaysFiltered, Wildcard-Verlust-Fallback, Settings-Rundtrip,
Stacked-Fallback). Siehe `docs/ui-and-views.md` →
"Which view a filter node opens to" für die vollständige Beschreibung.
