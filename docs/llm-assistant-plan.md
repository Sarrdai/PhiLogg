# Implementierungsplan: LLM-Assistent (lokales LLM, Desktop-Build)

Status: **Plan, nicht umgesetzt** (2026-09-27). Konkretisiert Backlog-Eintrag
#70 ("LLM integration with a chat window"); der Eintrag wird entfernt, sobald
Phase 4 (erste nutzbare Version) gelandet ist.

## Ziel

Ein Chat, über den ein **lokal laufendes LLM** (LM Studio) PhiLogg bedient:
Filter anlegen, Link-Filter bilden, Tabelle/Plot öffnen, Einträge bookmarken
und kommentieren. Das LLM bekommt **nie das Rohlog**, sondern arbeitet über
Werkzeuge, die Zusammenfassungen liefern (Anzahlen, Muster, Werteverteilungen,
wenige Beispielzeilen). Jeder Schritt landet sofort als echter Knoten im
Filterbaum — der Mensch sieht Zwischenergebnisse, bevor eine Rückfrage kommt.

Kein "löse mein Problem"-Agent, sondern ein **Bediener auf Zuruf**.
Referenzszenario (mit dem Simulator reproduzierbar, `-s motion,sensors`):

> "Mich interessiert der Temperaturwert nach jeder Positionierung."
> → LLM sucht Nachrichtentypen, findet `Move requested axis=<#> …`,
>   `Position reached axis=<#> …` (axis ∈ {1,2,3}) und
>   `Sensor T1 temperature=<#> C …`, legt die Extraktionsfilter an
> → Rückfrage: "Welche Achse — 1, 2 oder 3? Und Positionierung = *reached*?"
> → Link-Filter `Position reached (axis=2) → temperature`, auf Wunsch Plot.

## Rahmenbedingungen

- **Nur Desktop-Build.** Der Browser-Build bleibt ohne Netzwerkaufrufe. Das
  Feature ist per Feature-Detection an `window.philogg.llmChat` gebunden —
  fehlt die Funktion, existiert weder Button noch Chat.
- **Nur lokal.** Der HTTP-Aufruf läuft auf der Rust-Seite und akzeptiert
  ausschließlich Loopback-Hosts (`localhost`, `127.0.0.1`, `::1`). Das ist
  die technische Garantie für "Local First", nicht nur eine Voreinstellung.
- **LM Studio** über die OpenAI-kompatible API (`/v1/models`,
  `/v1/chat/completions` mit `tools`, Streaming per SSE). Nichts
  LM-Studio-Spezifisches darüber hinaus — Ollama o. ä. wäre später nur eine
  andere URL.
- **Kleine Modelle sind die Engstelle**: wenige Werkzeuge (≈ 8), flache
  Parameter, kompakte Ergebnisse, kleines Kontextfenster (8–32k) einplanen.

## Architektur

```
 Chat-Fenster (dünne Ansicht)          Hauptfenster: philogg.html
 ─────────────────────────────         ─────────────────────────────────────
 rendert Session-Snapshot   ◄─pull──   LLM-Sessions (einzige Wahrheit)
 sendet Eingaben/Befehle    ──event─►  Agent-Loop ──► Werkzeug-Registry
                                            │            (Filter, Link, Plot,
                                            ▼             Bookmark, Notiz …)
                                       window.philogg.llmChat
                                            │ (Tauri-Command + Channel)
                                            ▼
                                       Rust: HTTP/SSE → LM Studio (loopback)
```

**Lehre aus dem verworfenen Popout-Fenster** (`docs/desktop.md` →
"Picture-in-picture"): dessen Geschichte waren Sync-Bugs durch verpasste
State-*Pushes* in das zweite Fenster plus ein Deadlock beim Fenster-Erzeugen
unter Windows (tauri-apps/wry#583). Konsequenzen für diesen Plan:

1. **Das Chat-Fenster spiegelt keinen Log-/Baum-Zustand**, nur das Chat-
   Protokoll. Alles, was es über den Baum wissen muss (Knotenname, Anzahl),
   steht bereits als Text im Protokoll.
2. **Pull statt Push**: Das Hauptfenster sendet nur "Session X hat Version N";
   das Chat-Fenster holt sich daraufhin den *kompletten* Session-Snapshot
   (Chat-Protokolle sind klein). Ein verpasstes Event heilt sich beim
   nächsten selbst — es gibt keine inkrementellen Deltas, die verloren gehen
   können. Ausnahme: Streaming-Tokens der laufenden Antwort (rein kosmetisch,
   der finale Snapshot überschreibt sie).
3. **Fenster-Erzeugung** aus einem `async`-Command bzw. über den Main-Thread,
   wie es `enter_pip`/`create_main` heute tun — im Spike (Phase 0) unter
   Windows verifizieren.
4. **Agent-Loop und Sessions leben im Hauptfenster.** Schließen/Verstecken
   des Chat-Fensters bricht keine laufende Anfrage ab; Andocken ist nur ein
   Wechsel der Ansicht.

### Wo der Chat-UI-Code liegt (Entscheidung in Phase 0)

- **Empfehlung: `desktop/chat.html`** — eine kleine, eigenständige Seite,
  als Resource neben `philogg.html` gepackt und über
  `philogg://app/chat.html` ausgeliefert. Grund: `philogg.html` hat kein
  zentrales `init()` (≈ 1.200 Top-Level-Funktionen, verstreute
  Initialisierung inkl. Session-Cache-Restore) — ein `?view=chat`-Modus
  müsste all das zuverlässig unterdrücken, und eine zweite App-Instanz, die
  versehentlich den Session-Cache anfasst, ist genau die Fehlerklasse, die
  vermieden werden soll.
- Die Seite übernimmt das Theme über den Snapshot (CSS-Variablen), hat eine
  Transport-Abstraktion (`send(msg)` / `onMessage`) und läuft damit sowohl
  als eigenes Fenster (Tauri-Events) als auch angedockt (Phase 6, als
  `<iframe>` im Hauptfenster — gleicher Origin, `postMessage`).
- Tests: die Regression-Suite lädt `chat.html` zusätzlich in jsdom mit
  einem Fake-Transport (neue GROUP).

## Werkzeuge (Tool-API)

Eine Registry in `philogg.html`: `{ name, description, parameters (JSON
Schema), run(args) → Ergebnis-Objekt }`. Dieselbe Registry kann später auch
von einem MCP-Server bedient werden — nicht Teil dieses Plans.

| Werkzeug | Zweck | baut auf |
|---|---|---|
| `get_overview` | geladene Dateien, aktiver Knoten, Filterbaum (id, Name, Typ, Anzahl), Zeitraum, Level-Zählung | `state.nodes`, Level-Counts |
| `find_message_types(nodeId?, query?, limit)` | Muster mit Anzahl, Level, erstem/letztem Zeitpunkt **plus Werteverteilung je Platzhalter** (≤ 10 distinkte Werte → Werte+Anzahl, sonst Typ + Min/Max) | `makeEntryAnalysis`, `normalizeMessagePattern` |
| `create_filter(parentId, pattern, mode, invert)` | Text-/Regex-/Extraktionsfilter; Ergebnis = nodeId, Trefferzahl, 3–5 Beispielzeilen, extrahierte Beispielwerte **oder Fehlermeldung**, damit das Modell die Pattern-Syntax selbst korrigieren kann | `createFilterNode`, Live-Pattern-Preview |
| `create_link(refId, targetId, direction, key?, dt?)` | Link-Filter; Ergebnis = Paaranzahl, ungepaarte, Δt-Min/Median/Max, Beispiele | `createLinkNode` |
| `get_entries(nodeId, from?, max ≤ 20)` | wenige Rohzeilen, hart begrenzt, Nachrichten gekürzt | `getEntries` |
| `get_value_stats(nodeId, column)` | Min/Max/Mittel/Perzentile einer Extraktionsspalte | Statistics-Panel |
| `show_view(nodeId, view, plot?)` | aktiviert Knoten, öffnet Filtered/Table/Plot; `plot` = Typ + Achsen, läuft durch `sanitizePlotConfig` | `applyFhView`, `plotConfig` |
| `annotate(entryIds, note?, bookmark?)` | Bookmark und/oder Notiz an Einträge (Notizen tragen den Befund für den Menschen) | `toggleBookmark`, `state.notes` |

Rückfragen sind **kein Werkzeug**, sondern eine normale Antwort, die die
Runde beendet. Optional (Phase 5): Das Modell darf Antwortoptionen als
Liste markieren, die der Chat als Buttons rendert.

Regeln für alle Werkzeuge:
- Ergebnis-Budget ≈ 1.500 Tokens (Zeichenlimit mit Kürzungshinweis).
- IDs statt Wiederholung: Knoten und Einträge werden per ID referenziert; der
  Chat rendert sie als anklickbare Links (Klick = `revealInFilteredView` /
  Knoten aktivieren; tote IDs werden ausgegraut).
- Validierung der Argumente, Fehler als Text zurück ans Modell (kein Throw).

## Agent-Loop

- OpenAI-Chat-Format: `system` + Verlauf + `tools`; Antwort mit `tool_calls`
  → Werkzeuge ausführen → Ergebnisse als `tool`-Nachrichten → erneut, bis
  eine Textantwort kommt oder das **Rundenlimit** (Default 12) greift.
- **Eine Nutzer-Runde = ein Undo-Schritt.** Neue Undo-Art `"batch"`, die die
  einzelnen `"create"`-Schritte (`pushCreateUndo`) einer Runde bündelt;
  Ctrl+Z nimmt alles zurück, was das LLM in dieser Runde angelegt hat.
- **Kennzeichnung** vom LLM angelegter Knoten: eine In-Memory-Menge von
  Node-IDs (kleines Symbol im Baum), **kein neues Node-Feld** — ein Feld
  müsste durch alle Persistenz-Träger gefädelt werden (siehe CLAUDE.md), für
  eine rein kosmetische Info lohnt das nicht.
- **Kontext-Haushalt**: ältere Werkzeug-Ergebnisse im Verlauf werden nach N
  Runden durch einen Einzeiler ersetzt ("create_filter → n42, 318 Treffer");
  der System-Prompt bleibt konstant (Prompt-Cache von LM Studio).
- **Abbrechen**: Stop-Button bricht Stream und Loop ab; bereits angelegte
  Knoten bleiben (und sind per Undo entfernbar).
- **System-Prompt** (die "Bedienungsanleitung", ≈ 1–2k Tokens): PhiLogg-
  Begriffe (Filterbaum, Extraktion, Link), Pattern-Syntax mit 3–4 Beispielen,
  Vorgehen *entdecken → bei Mehrdeutigkeit fragen → bauen → zeigen*,
  Regeln (nie raten, kurz antworten, Befunde als Notiz an Einträge).

## Chat-Fenster und Sessions

- **Eigenes Fenster** (`WebviewWindow` "chat"), Größe und Position frei,
  gemerkt in `settings.json` (wie `pip_prev`).
- **Über der App schweben**: Default = Fenster mit `parent` = Hauptfenster
  (owned window: liegt immer über PhiLogg, minimiert mit ihm, verdeckt aber
  keine anderen Programme). Option im Chat-Fenster: **"Immer im
  Vordergrund"** (`set_always_on_top`, global).
- **Minimieren in die App**: Das X des Chat-Fensters versteckt es nur;
  ein Button in der Toolbar des Hauptfensters (mit Aktivitäts-Punkt bei
  laufender Anfrage) holt es zurück.
- **Andocken** (Phase 6): Chat als Seitenpanel im Hauptfenster; das Fenster
  wird dabei geschlossen, Undocken öffnet es an der gemerkten Position.
- **Sessions**: Liste im Chat (Seitenleiste oder Dropdown) — *Neu*,
  *Wechseln*, *Umbenennen*, *Löschen*. Titel automatisch aus der ersten
  Frage. Persistenz im Hauptfenster (eigener IndexedDB-Store, nicht im
  Session-Cache der Logs). Sessions sind nicht an ein Log gebunden;
  Referenzen auf nicht mehr existierende Knoten erscheinen ausgegraut.
- **Einstellungen** (Settings → Assistant, nur Desktop): Endpoint-URL
  (Default `http://localhost:1234/v1`), Modell (Dropdown aus `/v1/models`),
  Temperatur, Rundenlimit, Verbindungstest.

## Phasen

Jede Phase ist für sich mergebar und getestet.

**Phase 0 — Spike (klein, teils lokal beim Nutzer)**
- LM Studio + 1–2 Kandidatenmodelle mit Tool-Support: per `curl` mit einer
  Handvoll Werkzeug-Schemas prüfen, ob Tool-Calls zuverlässig kommen und
  Streaming mit Tool-Calls funktioniert. Ergebnis: Modellempfehlung.
- Zweites Tauri-Fenster mit `parent` unter Windows öffnen/schließen/
  verstecken ohne Deadlock; Laden von `philogg://app/chat.html`.
- Entscheidung Chat-UI-Ort (Empfehlung oben) festhalten.

**Phase 1 — Werkzeug-Registry in `philogg.html` (ohne LLM)**
- Registry + die acht Werkzeuge, Ergebnis-Budgets, Fehlertexte.
- Erweiterung der Muster-Analyse um Werteverteilung je Platzhalter
  (auch im Patterns-Tab als Tooltip nutzbar — optional).
- Tests: jede Funktion gegen Simulator-Logs (`motion`, `sensors`, `ids`),
  inkl. Budget-Einhaltung und Fehlerpfade. Werkzeuge sind im Browser-Build
  vorhanden, aber unsichtbar (kein Aufrufer).

**Phase 2 — Rust-Brücke**
- Commands `llm_models(baseUrl)` und `llm_chat(baseUrl, request, channel)`
  mit Streaming über `tauri::ipc::Channel`, `llm_cancel(requestId)`.
- Kleine HTTP-Abhängigkeit (Vorschlag: `ureq` im eigenen Thread — kein
  async-Runtime-Zuwachs); SSE-Zeilenparser.
- Loopback-Prüfung der URL.
- `inject.js`: `window.philogg.llmModels/llmChat/llmCancel`.
- Tests: `cargo test` für SSE-Parser und Loopback-Prüfung; `npm run build`.

**Phase 3 — Agent-Loop + Sessions (headless)**
- Loop, Undo-`"batch"`, Knoten-Kennzeichnung, Kontext-Haushalt, Abbruch,
  Session-Store (IndexedDB), System-Prompt.
- Tests: Fake-Modell mit geskripteten Antworten spielt das
  Referenzszenario durch (Muster suchen → Rückfrage → Link → Plot) und prüft
  Baum, Undo-Verhalten und Verlaufskompaktierung — deterministisch, ohne
  LM Studio.

**Phase 4 — Chat-Fenster (erste nutzbare Version)**
- `chat.html`, Fenster-Commands (öffnen/verstecken/Geometrie/
  Always-on-top), Toolbar-Button, Pull-Snapshot-Protokoll, Streaming-Anzeige,
  klickbare Knoten-/Eintrags-Referenzen, Stop-Button, Settings-Abschnitt.
- Eine Session (Wechseln/Löschen folgt in Phase 5).
- Tests: `chat.html` in jsdom mit Fake-Transport; manueller Test mit LM
  Studio am Referenzszenario; Screenshot für README via Simulator.
- Backlog-Eintrag #70 entfernen; `docs/desktop.md`, neuer Abschnitt in
  `docs/` für die Werkzeuge, README, CHANGELOG.

**Phase 5 — Mehrere Sessions**
- Neu/Wechseln/Umbenennen/Löschen, automatische Titel, optionale
  Antwort-Buttons für Rückfragen.

**Phase 6 — Andocken**
- Seitenpanel im Hauptfenster mit `chat.html` als `<iframe>`, Dock/Undock-
  Umschaltung, gemerkter Zustand.

## Offene Fragen

1. Modellwahl und minimale Modellgröße — Ergebnis aus Phase 0.
2. Soll ein Stop mitten in einer Runde die bereits angelegten Knoten
   automatisch zurücknehmen, oder bleiben sie (Plan: bleiben, Undo möglich)?
3. Brauchen Sessions einen Bezug zum Log (z. B. Dateiname im Titel), um
   später zu wissen, worauf sie sich bezogen?
4. Datei-Export einer Session (Protokoll + Filter-JSON) — später, falls
   Bedarf.
