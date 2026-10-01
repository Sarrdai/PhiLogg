# Handoff-Brief für Claude Design: Realistisches Mockup "Vereinheitlichte Toolbar"

Basiert auf `docs/archive/ui-concept-unified-extraction.md` (v3) und den Sketches in
`docs/images/`. Zweck dieses Dokuments: als Prompt/Briefing an Claude Design
übergeben, um ein **visuell realistisches, größtenteils statisches Mockup**
zu bekommen — kein Backend, keine echte Filterlogik. Einzige geforderte
Interaktivität: der View-Toggle (Context/Filtered/Table/Plot/Stacked) muss
tatsächlich zwischen den fünf Zuständen umschalten.

---

## 1. Auftrag in einem Satz

Baue ein Mockup von PhiLoggs Hauptansicht in seinem echten dunklen
Standard-Theme, das zeigt, wie `#viewBar` (Tabs, Level-Filter, Breadcrumb)
und eine vereinheitlichte "Slot-Zeile" darunter für fünf Views — **Context,
Filtered, Table, Plot, Stacked** — aussehen, wobei Layout, Höhe und
Position aller Elemente zwischen den Views maximal stabil bleiben.

## 2. Scope: was funktionieren muss vs. was nur aussehen muss

**Muss funktionieren:**
- Der Tab-Umschalter `Context | Filtered | Table | Plot | Stacked` in
  `#viewBar` — Klick wechselt sichtbar die Slot-Zeile und die
  Content-Fläche darunter zum jeweiligen View-Zustand.

**Darf rein statisch/dekorativ sein** (mit Hover-States gerne, aber ohne
echte Funktion):
- Alle Icon-Buttons (Pin/Notes/Multiline/Columns/TextMatch/HighlightMatch,
  Undo/Redo, Settings, Nav-Pfeile, Sidebar-Buttons)
- Filterbaum-Interaktionen (Klick auf Baumzeilen darf die aktive Zeile
  optisch markieren, muss aber keine echten Daten laden)
- Minimap-Drag, Plot-Zoom/-Pan, Tabellen-Scrollen, Detail-Panel-Resize
- Level-Filter-Pillen, Breadcrumb-Klicks

**Nicht bauen:** echtes Parsen/Filtern von Logdaten, echte Plot-Bibliothek
(ein statisches SVG-Liniendiagramm reicht), echtes Speichern/Laden.

## 3. Visuelle Sprache — reale Design-Tokens

Dunkles Standard-Theme aus `philogg.html` (`:root`, Zeile 8ff.), 1:1
übernehmen:

| Token | Wert | Verwendung |
|---|---|---|
| `--bg-panel` | `#151924` | Haupt-Panel-Hintergrund (Toolbars, Sidebar) |
| `--bg-elevated` | `#1c2130` | Erhöhte Flächen (Cards, Popups) |
| `--bg-elevated-2` | `#232939` | Hover-Zustand auf `--bg-elevated` |
| `--border` | `#262c3c` | Trennlinien, `border-bottom` unter Toolbars |
| `--text-primary` | `#e7eaf1` | Haupttext |
| `--text-secondary` | `#8a92a8` | Sekundärtext (Meta, Labels) |
| `--text-tertiary` | `#565f75` | Platzhalter, sehr dezente Hinweise |
| `--accent` | `#4fc7c3` | Aktive Zustände, Fokus, Links |
| `--accent-strong` | `#7fe0dc` | Hover auf Accent-Elementen |

Typografie: UI-Schrift ist eine System-Sans (kein Custom-Font nötig, z.B.
Inter/SF Pro-artig); `--font-mono` (`SF Mono`/`SFMono-Regular`/`Consolas`/
`Menlo`, monospace) für Log-Zeilen, Pattern-Vorschau, Zahlen/Timestamps.

Grundformen: `border-radius:7px` für Icon-Buttons (28×28px, siehe
`.toolbar-icon-btn`), Zeilenhöhe der schmalen Toolbars fest **30px**
(`#contextToolbar`/`#plotToolbar` in Echt), Sidebar/Content im
Verhältnis ca. 290px : Rest (siehe `docs/images/sketch-mainview.svg`).

Als visuelle Referenz die vier bereits vorhandenen Sketches beilegen:
`docs/images/sketch-mainview.svg`,
`docs/images/sketch-context-filtered-stacked.svg`,
`docs/images/sketch-table-plot.svg`,
`docs/images/concept-unified-toolbar.svg` — sie zeigen Anordnung und
Beschriftung, nicht die finale Optik (Handzeichnungsstil ist nur fürs
Diagramm, das Mockup soll ein echtes, "fertiges" App-Aussehen haben).

## 4. Screen-Aufbau (ein Artboard, fünf Tab-Zustände)

Von oben nach unten, für **jeden** der fünf Tab-Zustände identisch
positioniert:

1. **`#toolbar`** (Header, 40px): Wortmarke "PhiLogg" links, Zurück/Vor-
   Pfeile, rechts Statustext ("nginx.log · 42 318 Zeilen"), Undo/Redo,
   Settings-Icon.
2. **Sidebar** (links, 290px breit, volle Höhe): Header "Files & filters"
   mit Open/Save/Collapse-Buttons, darunter der Filterbaum mit 4-5
   Beispielzeilen (siehe Abschnitt 6 für Beispieldaten), eine davon aktiv
   markiert.
3. **`#timelineMinimap`** (Content-Bereich, oben, ~46px): schematisches
   Sparkline-artiges Zeitachsen-Diagramm mit Meta-Text.
4. **`#statusStrip`** (14px, dünne Statuszeile).
5. **`#viewBar`** (34px) — **das zentrale Element dieses Mockups**:
   - Tab-Gruppe `Context | Filtered | Table | Plot | Stacked` — genau
     dieser Button macht den Tab-Wechsel interaktiv.
   - Level-Filter-Pillen (`ERR`/`WARN`/`INFO`, o.ä.)
   - Breadcrumb rechts: `root › payment errors › response times`
6. **Slot-Zeile** (30px, fest, je Tab-Zustand anderer Inhalt — siehe
   Abschnitt 5).
7. **Content-Fläche** (Rest der Höhe): je Tab-Zustand anderer Inhalt
   (Abschnitt 5).
8. **`#detailPanel`** (unten, ~98px): "Entry detail"-Header + Platzhalter.

## 5. Inhalt der Slot-Zeile & Content-Fläche je Tab

- **Context**: Slot-Zeile = Log-Toggle-Icons (Pin/Notes/Multiline/Columns/
  TextMatch/HighlightMatch) + `‹ 3/12 match › Expand all / Collapse all`.
  Content = Log-Tabelle mit farblich hervorgehobenen Treffer-Zeilen und
  1-2 eingeklappten "⌄ N Zeilen ausgeblendet"-Lücken dazwischen.
- **Filtered**: Slot-Zeile = dieselben 6 Toggle-Icons an derselben Position
  (Beweis: kein Sprung zu Context). Content = dieselbe Log-Tabelle, aber
  nur die Treffer-Zeilen, keine Lücken.
- **Table**: Slot-Zeile = **eine** Chip-Zeile: Pattern-Vorschau
  (`user=[*:str] took [*:float]ms` mit farbig hervorgehobenen
  Platzhaltern) + Stats-Chips (`min 4ms`/`max 812ms`/`avg 61ms`) +
  Treffer-Zahl, alles in einer 30px-Zeile (horizontal scrollbar/kompakt,
  keine Toggle-Icons). Content = Tabelle mit Spalten `Index`, `t(ms)`,
  `user`, `duration_ms` und ~10 Beispielzeilen.
- **Plot**: Slot-Zeile = Zoom-Controls (`− 100% + ⟲`), zwei
  "Filter: …"-Buttons, rechts `⛶`/`💾` — keine Toggle-Icons. Content =
  ein statisches Liniendiagramm (SVG, x-Achse Zeit, y-Achse
  `duration_ms`) mit Achsenbeschriftung und ein, zwei Datenpunkt-Tooltips
  als eingefrorenes Beispiel.
- **Stacked**: Slot-Zeile = dieselbe wie Context/Filtered (6 Toggle-Icons).
  Content = oberes Panel Context (kompakt), unteres Panel Filtered
  (kompakt), horizontale Trennlinie dazwischen.

## 6. Beispieldaten (damit es "echt" aussieht, nicht wie Lorem Ipsum)

Filterbaum (Sidebar), 4 Zeilen:
- `nginx errors` (Typ: text)
- `payment link` (Typ: link, aktiv/markiert)
- `response times` (Typ: text, mit Wildcard-Pattern → hat Table/Plot)
- `slow queries` (Typ: text)

Log-Zeilen (Context/Filtered), Spalten `Time | Δt | Level | Thread | Loc |
Message`, z.B.:
```
14:32:07.128  +12ms  ERROR  worker-3  payments.go:88   user=jdoe took 812ms
14:32:07.140  +12ms  INFO   worker-1  auth.go:45        session refreshed
14:32:08.301  +1.2s  WARN   worker-2  payments.go:102  retrying payment gateway
```

Extraction-Tabelle (Table), Spalten `Index | t(ms) | user | duration_ms`,
z.B. 6-8 Zeilen mit plausiblen Werten zwischen 4 und 812.

## 7. Was NICHT Teil dieses Mockups ist

- Keine weiteren Popups/Dialoge (Settings, Filter-Builder,
  Color-Picker) — die bestehende Dokumentation (`docs/ui-sketches.md`)
  deckt die schon ab, hier geht es nur um `#viewBar` + Slot-Zeile.
- Kein Light-Theme/Theme-Switcher — ein Zustand (Dark) reicht für dieses
  Mockup.
- Keine mobile/responsive Variante — Desktop-Breite (~1400px) reicht.

## 8. Abnahmekriterium

Beim Durchklicken der 5 Tabs soll optisch sofort auffallen: `#toolbar`,
Sidebar, Minimap, StatusStrip, die Tab-Leiste selbst, LevelBar und
Breadcrumb bewegen sich **nicht einen Pixel** — nur die Slot-Zeile
(gleiche Höhe, anderer Inhalt) und die Content-Fläche darunter ändern
sich.
