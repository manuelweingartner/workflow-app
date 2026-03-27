# Workflow-Engine Mockup

Vereinfachte Workflow-Engine als Angular-Webapp. Im Gegensatz zu klassischen Workflow-Engines (BPMN-Diagramme mit Gateways, Lanes etc.) wird der Prozess als **linearer Ablauf** dargestellt, damit auch Nicht-Techniker den Prozess verstehen koennen. Komplexitaet (Conditionals, Skripte, KI-Aktionen) wird innerhalb der Schritte verborgen.

## Demo-Szenario

Baugesuch-Workflow einer Gemeinde (11 Prozessschritte, von Gesuchseingabe bis Archivierung).

## Starten

```bash
cd workflow-app
npm install
npx ng serve
```

Oeffne http://localhost:4200

## Architektur

- **Angular 21** mit Standalone Components und Signals (kein NgModules, kein RxJS)
- **Kein Backend** — alle Daten in-memory im `ProcessService`
- Kein CSS-Framework — handgeschriebene Styles pro Komponente

### Struktur

```
src/app/
  models/process.model.ts        — Datenmodell (Dossier, Steps, Tasks, Inputs, Actions, Criteria, Conditionals)
  services/process.service.ts     — Zentraler State + Business-Logik + Mock-Daten
  components/
    header/                       — Top-Bar mit CMI-Logo und Dossier-Titel
    sidebar/                      — Fixe Navigation (7 Menuepunkte)
    dossier-overview/             — Dashboard mit horizontalem Prozess-Strip, aktuellem Schritt, Kennzahlen
    dossier-details/              — Alle Felder thematisch gruppiert (nicht prozessual)
    process-overview/             — Lineare Schrittliste mit Status-Icons und Insert-Button
    step-detail/                  — Detailansicht eines Schritts (Aufgaben, Inputs, Aktionen, Kriterien, Conditionals)
    documents-view/               — Aggregierte Dokumenten-Tabelle ueber alle Schritte
    tasks-view/                   — Aggregierte Aufgaben-Tabelle mit Filter
```

## Umgesetzte Features

### Prozessmodell
- Linearer Prozess mit Schritten, je 1:n Aufgaben, Inputs (Felder + Dokumente), Aktionen, Abschlusskriterien, Conditionals
- Prozessschritte einfuegen (nur ab dem aktuellen Schritt, nicht zwischen vergangenen)
- Neue Schritte mit editierbarem Header (Titel, Verantwortlich, Kategorie, Faelligkeit)

### Workflow-Logik
- Aufgaben-Status toggeln: Klick zykelt open → in-progress → done
- Automatische Aktivierung: Erster Task-Toggle setzt Schritt auf "In Bearbeitung"
- Kriterien abhaken: Klick toggelt erfuellt/nicht erfuellt
- Schritt abschliessen: Nur wenn "In Bearbeitung" + alle Aufgaben done + alle Kriterien met
- Naechsten Schritt automatisch starten beim Abschluss
- Abgeschlossene Schritte sind read-only
- Pending-Schritte zeigen Hinweis dass sie noch nicht aktiv sind

### Verlinkung
- Dokumente, Aufgaben und Felder sind ueber alle Schritte hinweg aggregiert und verlinkt
- Navigation von aggregierten Ansichten zurueck zum Prozessschritt
- Aufgaben-Status auch in der Gesamtsicht toggelbar
- Sidebar-Badges dynamisch

### Aktionen
- Drei Typen: Standard (blau), Skript (lila), KI+ (Gradient)
- Nur sprechende Titel und Beschreibung, kein Code sichtbar

### Ansichten
- **Dossieruebersicht**: Horizontaler Prozess-Strip, aktueller Schritt, Kennzahlen
- **Dossierdetails**: Felder thematisch gruppiert (Beteiligte, Grundstueck, Pruefung, etc.)
- **Prozessuebersicht**: Lineare Schrittliste mit Detail-Panel rechts
- **Dokumente**: Tabelle mit Upload-Status und Pflicht-Kennzeichnung
- **Aufgaben**: Tabelle mit Status-Filter und Toggle

## Offene Punkte

### Funktional
- Subprozesse (ein Schritt verweist auf einen eigenen Prozess)
- Eskalation / Timer (automatische Aktionen bei Fristueberschreitung)
- Rueckspruenge (Schritt zuruecksetzen bei Maengeln)
- Conditionals zur Laufzeit auswerten (aktuell nur deklarativ)
- Aktionen tatsaechlich ausfuehren (Skript-Runner, API-Calls, KI-Integration)
- Inputs mit Two-Way-Binding (Werte aendern und persistieren)
- Dokument-Upload
- Notizen und Beteiligungen (noch Placeholder)
- Benutzer/Rollen-System
- Parallele Aufgaben ueber Schritte hinweg

### Technisch
- Backend / Persistenz (REST-API, Datenbank)
- Routing (aktuell alles ueber Signals, keine URL-Navigation)
- Formular-Validierung
- Unit-Tests
- Responsive Design / Mobile
