# CMI Workflow App — Prototyp

## Projekt

Angular-Prototyp für das CMI Workflow-System. Zeigt Prozesssteuerung mit Geschäften, Sitzungen und Kontextobjekten.

- **Sprache mit User**: Deutsch. Code-Kommentare: Englisch.
- **Prototyp-URL**: http://localhost:4200/
- **Start**: `ng serve` im Projektverzeichnis

## Tech Stack

- Angular 21.2 (standalone components, Signals)
- TypeScript 5.9, SCSS
- Kein Angular Router (view-switching via signal in `app.ts`)
- Kein Backend — alle Daten als Mock-Konstanten in `process.service.ts`
- Google Fonts: Roboto + Material Icons (CDN in `styles.scss`)

## Architektur

```
src/app/
├── app.ts                    # Root — switched zwischen 3 View-Typen + Dashboard
├── app.config.ts             # Angular config (minimal)
├── app.routes.ts             # Leer — kein Router verwendet
├── models/
│   └── process.model.ts      # Alle Interfaces (Process, Dossier, Sitzung, AppTab, Branch, etc.)
├── services/
│   └── process.service.ts    # Zentraler State + Tab-Management + Mock-Daten
└── components/
    ├── header/               # App-Bar (Multi-Typ-Tabs + Picker) + App-Header (typ-abhängig)
    ├── sidebar/              # Navigation links mit Badges (wiederverwendbar für alle Views)
    ├── dashboard/            # Startseite wenn keine Tabs offen (Meine Prozesse, Geschäfte, Sitzungen)
    ├── process-view/         # PROZESS-LAYOUT: eigene Sidebar (Übersicht, Aufgaben, Dokumente)
    ├── sitzung-view/         # SITZUNG-LAYOUT: Traktanden, Sitzungsdokumente, Teilnehmende
    ├── process-overview/     # Prozessschritte mit Kontrollfluss (Sequenz + Flowchart Toggle)
    ├── step-detail/          # Detail eines Schritts (Aufgaben, Inputs, Aktionen, Kriterien, Kontexte)
    ├── dossier-overview/     # Dashboard mit Prozess-Strip, Stats, aktueller Schritt
    ├── dossier-details/      # Felder thematisch gruppiert (aus Prozessschritten)
    ├── documents-view/       # Dokumente aller Schritte
    ├── tasks-view/           # Aufgaben aller Schritte
    ├── notes-view/           # Notizen (intern/extern)
    ├── participants-view/    # Beteiligte Personen
    └── service-request/      # Portal-Kommunikation (Nachrichten, Dokumente, Formulardaten)
```

## 3 Top-Level-Views + Dashboard

- **Dashboard** — Wenn keine Tabs offen: Suchleiste, Begrüssung, Stats, Meine Prozesse, Geschäfte, Sitzungen
- **Prozess** (Tab-Icon: `account_tree`) — Eigenständige Prozesssicht mit Sidebar: Prozessübersicht, Alle Aufgaben, Alle Dokumente
- **Geschäft** (Tab-Icon: `folder`) — Dossier-Sicht mit vollem Menu. Zeigt ganzen Prozess, eigene Schritte hervorgehoben, andere ausgegraut
- **Sitzung** (Tab-Icon: `event`) — Sitzungssicht mit Traktanden, Sitzungsdokumente, Teilnehmende. Traktanden verlinken auf Geschäfte

## Datenmodell (Kernkonzepte)

### Process (eigenständig)
- `id`, `title`, `processOwner` (Name, Rolle, E-Mail)
- `steps: ProcessStep[]` — die Schritte des Prozesses

### ProcessStep
- Status: `completed | in-progress | pending`
- `stepType?: 'standard' | 'decision' | 'parallel' | 'subprocess'`
- `branches?: Branch[]` — Verzweigungen bei Entscheidungen
- `parallelPaths?: ProcessStep[][]` — parallele Ausführungspfade
- `subSteps?: ProcessStep[]` — Kinder-Schritte bei Sub-Prozessen
- `loopBackToStepId? + loopCondition?` — Schleifen-Rückverweis
- `collapsed?: boolean` — Ein-/Ausklappen aller Kontrollfluss-Details (+/−)
- `contextLinks: ContextLink[]` — 0-n Verknüpfungen zu Kontextobjekten
- Enthält: tasks, inputs (Felder + Dokumente), actions, completionCriteria, conditionals

### Sitzung
- `id`, `number`, `title`, `date`, `chairperson`, `organization`
- `traktanden: Traktandum[]` — mit contextLinks zu Geschäften und processStepIds
- `participants: SitzungParticipant[]`, `documents: SitzungDocument[]`

### ContextObject
- Typen: `geschaeft | sitzung | projekt | andere`
- Prozessschritte können mit beliebigen Kontextobjekten verknüpft werden
- Verknüpfte Objekte im Schrittdetail klickbar → öffnet entsprechenden Tab

### Dossier (= Geschäft als Kontext)
- Referenziert einen Prozess via `processId`
- Hat eigene Notes, Participants, ServiceRequest

### AppTab (Multi-Typ-Tab-System)
- `type: 'prozess' | 'geschaeft' | 'sitzung'`
- Tabs öffnen/schliessen/wechseln, alle Tabs zu → Dashboard

## Service-Pattern

`ProcessService` ist der zentrale State-Manager (providedIn: root):
- Signals: `_processes`, `_contextObjects`, `_dossiers`, `_sitzungen`, `_tabs`, `_activeTabId`
- Tab-Management: `openTab(type, refId)`, `closeTab(id)`, `switchTab(id)`
- Computed: `activeTab`, `activeTabType`, `activeProcess`, `activeSitzung`, `dossier$`, `isDashboard`
- Kontext: `stepsForActiveContext`, `contextProgress`, `isStepLinkedToContext()`
- Mutations via `structuredClone` + signal.set (immutable updates)

## Konventionen

- Alle Komponenten sind `standalone: true` mit inline template + styles
- Keine externen UI-Libraries — alles custom CSS nach CMI-Design
- Farben: `#009fe3` (Primär/CMI-Blau), `#586475` (Header-Grau), `#3f971a` (Grün/Erledigt), `#8c0909` (Rot/Überfällig), `#7c3aed` (Violett/Parallel+Sitzung), `#f59e0b` (Gelb/Entscheidung)
- Material Icons inline via `<i class="material-icons">icon_name</i>`
- Kontrollfluss-Elemente alle ein-/ausklappbar via +/− Button

## Mock-Daten

8 Prozesse + Dossiers mit Kontrollfluss:
1. **Baugesuch** (11 Schritte): Subprocess (Öff. Auflage), Parallel (3 Fachberichte), Decision (Bewilligt/Auflagen/Abgelehnt), Loop (Rohbaukontrolle)
2. **Akteneinsicht** (7 Schritte)
3. **Einbürgerung** (9 Schritte): Parallel (Sprache+Integration), Decision (Empfohlen/Nicht/Zurückgestellt), Schritt 6 → Sitzung GV-2027-06
4. **Gemeinderat** (8 Schritte): Decision (Angenommen/Abgelehnt/Zurückgestellt mit Loop-Back), Schritte 5+6 → Sitzung GR-2026-10
5. **Veranstaltung** (9 Schritte): Parallel (4 Fachstellen), Schritt 6 → Sitzung GR-2026-10
6. **KESB** (9 Schritte): Subprocess (Abklärung: 4 Teilschritte), Decision (4 Massnahme-Optionen), Schritt 6 → Sitzung KESB-2026-16
7. **Schuleintritt** (9 Knoten, Schulverwaltung): Parallel (Schulreifeabklärung: Kindergarten, SPD, Schularzt), Subprocess (Standortgespräch: 3 Teilschritte), Decision (Regeleintritt/Rückstellung/vorzeitiger Eintritt), Schritt 6006 → Sitzung BK-2026-05
8. **Sonderpädagogik** (12 Knoten, Schulverwaltung): Subprocess (Schulische Abklärung: 4 Teilschritte), Parallel (SPD, Logopädie, KJPD), Decision (4 Massnahme-Optionen), Loop (jährliche Überprüfung), Schritt 7007 → Sitzung BK-2026-05

4 Sitzungen:
- GR-2026-10: Gemeinderatssitzung 15.10.2026 (5 Traktanden, 2 mit Geschäfts-Verknüpfung)
- BK-2026-05: Bildungskommission 21.10.2026 (6 Traktanden, Schuleintritt Ademi + Sonderpädagogik Bucher)
- KESB-2026-16: KESB-Spruchkörpersitzung 17.11.2026 (3 Traktanden, Gefahrenmeldung Schneider)
- GV-2027-06: Gemeindeversammlung 18.06.2027 (4 Traktanden, Einbürgerung Rossi)

### Zeitachse der Mock-Daten

**Referenz-„heute" ist der 01.09.2026** (Stand des Refreshs vom 01.09.2026). Daran
hängt alles: abgeschlossene Schritte liegen im Juni bis August 2026, offene
Fristen im September 2026, geplante Sitzungen ab Oktober 2026.

Beim nächsten Refresh gilt: **Saison-Events werden nicht mitverschoben, sondern
auf ihre nächste echte Zukunfts-Ausgabe gesetzt.** Dorffest (Sommer) steht darum
auf dem 19./20.06.2027, die Streetparade auf dem 14.08.2027 (zweiter Samstag im
August), die Gemeindeversammlung „Sommer" auf dem 18.06.2027. Ein reiner
Monats-Shift würde ein Dorffest in den November legen.

Die Verfahrensdaten selbst sind pro Cluster verschoben, nicht global: Baugesuch
liegt weiter zurück als die übrigen Geschäfte, die beiden Elsa-Instanzen
(`inst-proc-bau-demo1`, `inst-proc-eb-demo1`) haben ihre eigene Achse. Wer
Datumsangaben ändert, muss die `startedAt` der Instanzen und die
`completedDate` des jeweils ersten Schritts zusammenhalten, sonst startet eine
Instanz nach ihrem ersten erledigten Schritt.

## Wichtig

- Kein `flutter analyze` o.ä. — das ist kein Flutter-Projekt
- Build: `npx ng build` — CSS-Budget in angular.json auf 10kB/16kB erhöht
- Analyse: `npx ng build` prüft TypeScript-Fehler mit
