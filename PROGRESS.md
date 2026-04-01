# CMI Workflow App — Progress & Backlog

## Aktueller Stand (2026-04-01)

### Implementiert

- [x] **Grundstruktur**: Angular 21, standalone Components, Signal-basierter State
- [x] **Datenmodell v3**: Process eigenständig, ContextLinks, ProcessOwner, Kontrollfluss-Typen
- [x] **3 Top-Level-Views**: Prozess, Geschäft, Sitzung — jeweils eigenes Layout + Sidebar
- [x] **Dashboard**: Startseite wenn alle Tabs geschlossen (Meine Prozesse, Geschäfte, Sitzungen, Stats)
- [x] **Tab-System**: Multi-Typ-Tabs in App-Bar (Prozess/Geschäft/Sitzung mit eigenem Icon)
- [x] **Tab-Picker**: + Button öffnet Dropdown zum Öffnen neuer Tabs
- [x] **6 Demo-Prozesse**: Baugesuch, Akteneinsicht, Einbürgerung, Gemeinderat, Veranstaltung, KESB
- [x] **3 Demo-Sitzungen**: Gemeinderatssitzung, Gemeindeversammlung, KESB-Spruchkörpersitzung
- [x] **Kontextobjekte**: Geschäft + Sitzung, Querverknüpfungen, klickbar → öffnet Tab
- [x] **Prozess-View**: Eigene Sidebar (Prozessübersicht, Alle Aufgaben, Alle Dokumente)
- [x] **Geschäft-View**: Volles Menu, ganzer Prozess sichtbar, eigene Schritte hervorgehoben
- [x] **Sitzung-View**: Traktanden gruppiert, Sitzungsdokumente, Teilnehmende
- [x] **Kontrollfluss — Entscheidungen (Decision)**: Rauten-Icon, Verzweigungspfade mit Bedingungen + Zielen, Loop-Back-Erkennung
- [x] **Kontrollfluss — Parallele Pfade**: Nebeneinander, violette Markierung, Status-Dots pro Pfad
- [x] **Kontrollfluss — Sub-Prozesse**: Kinder-Schritte eingerückt mit eigenem Status
- [x] **Kontrollfluss — Schleifen (Loops)**: Rückwärts-Pfeil mit Bedingungstext
- [x] **Kontrollfluss — Ein-/Ausklappen**: Alle Typen (Decision, Parallel, Subprocess, Loop) mit +/− Toggle
- [x] **Flowchart-View**: Alternative Darstellung als Node-Graph mit typ-spezifischen Rahmen
- [x] **Sequenz/Flowchart-Toggle**: Umschalten zwischen beiden Ansichten
- [x] **Schrittdetail**: Aufgaben, Inputs, Aktionen, Abschlusskriterien, Conditionals, Verknüpfte Objekte (klickbar)

### Kontrollfluss-Daten pro Prozess

| Prozess | Decision | Parallel | Subprocess | Loop |
|---|---|---|---|---|
| Baugesuch | Baubewilligung (3 Pfade) | 3 Fachberichte | Öff. Auflage (3 Schritte) | Rohbaukontrolle |
| Einbürgerung | Kommission (3 Pfade) | Sprache + Integration | — | — |
| Gemeinderat | Beschluss (3 Pfade + Loop-Back) | — | — | — |
| Veranstaltung | — | 4 Fachstellen | — | — |
| KESB | Entscheid (4 Pfade) | — | Abklärung (4 Schritte) | — |
| Akteneinsicht | — | — | — | — |

---

## Backlog

### PRIORITÄT: Nächste Schritte

#### 6. Entscheidungslogik und Regeln (teilweise umgesetzt)
- [x] Bedingte Verzweigungen im Prozessfluss (visuell)
- [ ] Mehrstufige Entscheidungsbäume
- [ ] Switch/Default-Logiken
- [ ] Vergleichslogik auf Aufgabenresultaten, Objektfeldern, Variablen, Kontextdaten
- [ ] Kombination mehrerer Regeln
- [ ] Regeldefinition ohne Code (visueller Editor)
- [ ] Lesbare Darstellung für Fachanwender:innen
- [ ] Prozessvariablen (Workflow-interne Variablen)

#### 7. Kontrollfluss und Modellierungsmöglichkeiten (teilweise umgesetzt)
- [x] Sequenzieller Kontrollfluss
- [x] Paralleler Kontrollfluss
- [x] Sub-Prozesse
- [x] Schleifen mit Abbruchbedingung (visuell)
- [x] Flowchart-orientierte Darstellung
- [ ] Abhängigkeiten Then/Else (interaktiv)
- [ ] Verschachtelung von Kontrollflusselementen
- [ ] Warte-Aktivität (Zeitpunkt, Timer, Ereignis)
- [ ] Zusammenführungs-Schritt nach parallelen Pfaden

---

### 1. Grundlegende Anforderungen
- [ ] Trennung zwischen Workflow-Vorlage und Workflow-Instanz
- [ ] Wiederverwendbare Workflow-Vorlagen
- [ ] Versionierung von Workflow-Vorlagen
- [ ] Laufende Instanzen bleiben stabil bei Änderungen der Vorlage
- [ ] Start, Pause, Abbruch und Wiederaufnahme von Workflows
- [ ] Erzeugungslogik von Folgeaufgaben konfigurierbar
- [ ] Adhoc-Ergänzungen durch berechtigte Benutzer:innen

### 2. Trigger und Startmechanismen
- [ ] Manuelle Auslösung durch Benutzer:in im Geschäft
- [ ] Start aus Objektaktionen heraus (CWS, Schnittstellen, API)
- [ ] Ereignisbasierte Trigger
- [ ] Zeitbasierte Trigger
- [ ] Externe Trigger über API oder Events
- [ ] Kombination mehrerer Triggerbedingungen

### 3. Objekt- und Datenmodell-Integration
- [ ] Nutzung aller CMI-Objekte als Prozesskontext
- [ ] Zugriff auf Objektattribute lesend und schreibend
- [ ] Kontextvererbung über Prozessschritte hinweg
- [ ] Regeln zur automatischen Befüllung von Feldern

### 4. Aufgabenbasierter Workflow-Kern
- [ ] CMI-Aufgabe als zentrales Ausführungselement
- [ ] Workflow wartet auf Abschluss einer Aufgabe (Status)
- [ ] Aufgaben können Resultate liefern (Boolean, Status, Werte)
- [ ] Resultate stehen im weiteren Workflow zur Verfügung

### 5. Aktionen und Prozessschritte
- [ ] Standard-Aktionen vs. CWS-Aktionen ausdifferenzieren
- [ ] Standard-Aufgaben vs. Aufgaben aus Objektvorlagen
- [ ] Starten von Teilprozessen
- [ ] Dokumentenerzeugung aus Vorlagen
- [ ] Aufruf externer Services

### 8. Benutzerfreundlichkeit und Design
- [ ] Grafischer Workflow-Designer (Drag & Drop)
- [ ] Simulation und Vorschau von Workflows
- [ ] Validierung während der Modellierung

### 9. Anpassbarkeit laufender Instanzen
- [ ] Manuelles Eingreifen (Aufgaben hinzufügen, Schritte überspringen/wiederholen)
- [ ] Protokollierung aller Eingriffe

### 10. Rollen, Rechte und Governance
- [ ] Nutzung bestehender CMI-Berechtigungen
- [ ] Auditierbarkeit

### 11. Monitoring, Transparenz und Reporting
- [ ] Sicht auf laufende Instanzen
- [ ] Erkennung blockierter/hängender Prozesse
- [ ] Durchlaufzeiten, Abbruch- und Fehlerquoten

### 12. Integration und Erweiterbarkeit
- [ ] Nutzung über standardisierte APIs
- [ ] Eventbasierte Architektur

### 13. KI+ Unterstützung
- [ ] Assistierte Erstellung von Workflows (CoPilot-Style)
- [ ] Erklärung bestehender Workflows in Natursprache
- [ ] Entscheidungsunterstützung
- [ ] Dokumentenanalyse innerhalb von Prozessschritten
