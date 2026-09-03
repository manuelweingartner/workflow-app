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
7. **Sonderpädagogik** (12 Knoten, Schulverwaltung): Subprocess (Schulische Abklärung: 4 Teilschritte), Parallel (SPD, Logopädie, KJPD), Decision (4 Massnahme-Optionen), Loop (jährliche Überprüfung), Schritt 7007 → Sitzung BK-2026-05
8. **Schuleinschreibung** (9 Knoten, Schulverwaltung): **Jahrgangs- bzw. Massenverfahren**, läuft nicht pro Fall sondern einmal pro Schuljahr über einen ganzen Jahrgang. Schnittstelle als zeitgesteuerter Trigger (ContactSync), Warte-Aktivität auf ein Fremdsystem (Klapp), Loop mit **gefülltem** Rumpf (Mahnlauf, endet an der Mahnstufe), Schritt 8006 legt je Kind ein Lernendendossier an. Traktandiert in BK-2026-05.

4 Sitzungen:
- GR-2026-10: Gemeinderatssitzung 15.10.2026 (5 Traktanden, 2 mit Geschäfts-Verknüpfung)
- BK-2026-05: Bildungskommission 21.10.2026 (6 Traktanden, Sonderpädagogik Bucher + Zwischenbericht Einschreibung)
- KESB-2026-16: KESB-Spruchkörpersitzung 17.11.2026 (3 Traktanden, Gefahrenmeldung Schneider)
- GV-2027-06: Gemeindeversammlung 18.06.2027 (4 Traktanden, Einbürgerung Rossi)

(Traktandum 5 der Bildungskommission ist der Zwischenbericht zur Einschreibung, Verschiedenes ist Nr. 6.)

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

## Zwei Kardinalitäten, nicht vermischen

Die Prozesse 1 bis 7 sind **Einzelfallverfahren**: eine Instanz, ein Fall, eine
Person. Prozess 8 (Schuleinschreibung) ist ein **Massenverfahren**: eine Instanz,
ein ganzer Jahrgang. Das ist eine bewusste Trennung, keine Inkonsistenz.

**Die beiden nicht in einen Prozess mischen.** Eine Instanz zeigt einen
Fortschrittsbalken und einen aktuellen Schritt. Ein gemischter Prozess würde
zuerst «24 Kinder importiert» und danach «Verfügung für Ademi Elira» anzeigen,
was schlicht falsch wäre. Der Übergang passiert stattdessen explizit in Schritt
8006 «Einzelfälle eröffnen», das je Kind ein **Lernendendossier** anlegt.

**Ein Einzelfallverfahren für den Schuleintritt ist bewusst nicht modelliert**
(am 01.09.2026 entfernt, es überschnitt sich fachlich mit der Einschreibung).
Wer es später braucht: Schritt 8006 ist die Andockstelle, dort würde je Kind eine
Instanz gestartet.

## Schnittstellen-Simulation (ContactSync, Klapp)

`Action.type` kennt neben `standard | script | ai` auch **`interface`**. Solche
Aktionen tragen ein `syncResult: SyncRun` und werden im Schrittdetail als Panel
gerendert (Endpunkt, Konfiguration, Zähler, Warnungen, optional der Anmeldestand
je Kind). Registriert werden sie in **`SYNC_ACTIONS`** in `process.service.ts`,
analog zu `ASSESSMENT_ACTIONS` für die KI+-Aktionen. Eine `interface`-Aktion ohne
Registry-Eintrag behält den einfachen Knopf.

**Es verlässt kein Request den Browser.** Alle Läufe sind deterministisch erzeugt,
damit eine Demo wiederholbar ist. Kein `Math.random()`, kein `new Date()`: das
Referenzdatum steht in `SYNC_POLL_DATE`, der Rücklauf pro Mahnstufe in
`MAHNLAUF_RUECKLAUF` (7 / 6 / 4 von 18 offenen Fällen, der letzte Fall bleibt
bewusst offen und muss telefonisch nachgefasst werden).

Methoden im Service:
- `runSyncAction()` läuft die Schnittstelle neu. Beim Klapp-Rückkanal ist das
  **nicht destruktiv**: die Liste je Kind bleibt, höchstens eine weitere Familie
  meldet sich an. Andere Schnittstellen werden aus dem Builder neu gebaut.
- `runKlappMahnlauf()` ist der Schleifenrumpf: Brief an alle Offenen, danach
  meldet sich ein deterministischer Anteil an. Begrenzt durch `maxMahnstufe`.
- `applyActionEffects()` schreibt die Folgen eines Laufs in den Schritt:
  Feldwerte, erledigte Aufgaben, vorhandene Dokumente. **Nur was die Maschine
  wirklich tut**, wird abgehakt. Was ein Mensch bestätigen muss, bleibt offen,
  damit in der Demo sichtbar ist, wo der menschliche Entscheid sitzt.

## Dokument-Aktionen: Word und Excel gehen wirklich auf

`DOCUMENT_ACTIONS` in `process.service.ts` erzeugt **echte Dateien im Browser**
und gibt sie zum Download. Word öffnet HTML mit der Endung `.doc` und dem
MIME-Typ `application/msword` zuverlässig, Excel öffnet CSV mit Semikolon. Das
spart eine docx-Bibliothek, externe Libraries sind in diesem Repo bewusst nicht
erlaubt.

| Aktion | Datei | Inhalt |
|---|---|---|
| `sei-a2` Lückenliste exportieren | `Datenluecken_KG_2027-28.csv` | 9 Beanstandungen mit Fremdkey und Massnahme |
| `sei-a4` Serienbrief generieren | `Registrationsbriefe_KG_2027-28.doc` | 24 Briefe, je Familie ein Klapp-Zugangscode `KG27-00xx` |
| `sei-a6` Erinnerungsbrief generieren | `Erinnerungsbriefe_KG_2027-28.doc` | **nur** die Familien mit offener Anmeldung, Mahnstufe im Text |

Der Erinnerungsbrief liest den aktuellen Klapp-Stand: er adressiert genau die
noch offenen Familien und nennt die richtige Mahnstufe. Belegt: 18 Briefe mit
«1. Erinnerung», nach einem Mahnlauf 11 Briefe mit «2. Erinnerung».

**Wichtig zur Erreichbarkeit:** fachlich gehört diese Aktion in den
Schleifenrumpf (Schritt 8005), dort ist sie in der Instanzansicht aber **nicht
anklickbar**, weil der Rumpf nur als Struktur gezeichnet wird. Darum sitzt der
Knopf «Erinnerungsbriefe in Word öffnen» zusätzlich direkt im Klapp-Panel neben
dem Mahnlauf (`buildReminderLetters()`). Wer die Aktion aus dem Rumpf entfernt,
muss den Knopf mitentfernen. Ein bereits vorhandenes
Dokumentfeld kann über «In Word öffnen» neu erzeugt werden, die Datei ist damit
immer aktuell.

Der eigentliche Download passiert in der Komponente (`step-detail`), nicht im
Service: Blob und Anchor sind DOM-Sache. Ein BOM voran, sonst raten Word und
Excel beim Encoding.

## Demo-Zustand der Schuleinschreibung

**Die Instanz steht auf Schritt 8002**, also 1 von 7 Schritten erledigt (seit
03.09.2026, vorher 8003). 8001 ist abgeschlossen und zeigt den historischen
ContactSync-Lauf im Panel. Ab 8002 klickt man vorwärts.

**Warum 8002 und nicht 8003:** Dokument- und Schnittstellenknöpfe rendert das
Schrittdetail nur bei `step.status === 'in-progress'`. Auf einem abgeschlossenen
Schritt steht ein Dummy-«Ausführen» ohne Wirkung. Stand die Instanz auf 8003,
liess sich die Lückenliste in 8002 darum nicht öffnen.

Der Demo-Pfad:
1. **8002** «Lückenliste exportieren»: öffnet die CSV in Excel und hakt die
   Aufgabe «Nacherfassung auslösen» ab. Danach das Kriterium «Nacherfassung
   ausgelöst» setzen und den Schritt abschliessen, 8003 wird aktiv.
2. **8003** «Einschulungs-Angebot an Klapp senden»: Panel mit den
   Angebotsoptionsgruppen. Danach «In Word öffnen»: 24 Registrationsbriefe, das
   Dokumentfeld gilt danach als vorhanden.
3. **8004** «Abgleich auslösen»: Anmeldestand je Kind, 6 von 24. Das Panel ist
   hier nur Anzeige, es verweist aufs Gateway. Schritt abschliessen.
4. **Gateway «Anmeldungen noch offen?»**: hier läuft die Schleife. «Runde
   durchlaufen» dreimal (18, dann 11, dann 5 Briefe), danach sperrt der Knopf
   und ein Fall bleibt fürs Telefon. «Schleife verlassen & weiter» führt auf 8006.
5. Rückwärts anschauen: **8001** zeigt den ContactSync-Lauf mit 26 bezogenen
   Kontakten und drei Warnungen.

**Die Mobilnummer kommt nirgends mehr vor** (03.09.2026, Rückmeldung aus der
Fachabteilung): für die Klapp-Registration braucht es keine Mobilnummer, die
Erwähnung hätte verwirrt. Die dritte Lückenkategorie heisst jetzt in Aufgabe,
Notiz und CSV «Klapp-taugliche Kontaktdaten».

## Die Schleife wird am Gateway bedient

**Das war eine Sackgasse und ist am 01.09.2026 behoben.** Zwei Gründe:

1. `completeStep()` kennt **keine Iteration**. Es schaltet linear den nächsten
   Schritt der obersten Ebene auf `in-progress`, ein Loop-Gateway ist für die
   Mechanik ein Knoten wie jeder andere.
2. Im Schrittdetail liegt der gesamte Block mit Aufgaben, Aktionen und dem Knopf
   «Schritt abschliessen» hinter `@if (step.kind !== 'gateway')`. Ein Gateway
   hatte damit **keinen Abschluss-Knopf**: wer dort ankam, kam nicht weiter.

Jetzt rendert der Loop-Zweig in der Instanz eine eigene Steuerung: aktuelle Runde,
offener Rest, Fortschrittsbalken, ein erklärender Satz und zwei Knöpfe.

- **«Runde durchlaufen»** ist der Schleifenrumpf: erzeugt den Erinnerungsbrief
  für genau die offenen Familien als Word-Datei und erfasst danach den Rücklauf.
  Gesperrt, sobald kein Fall mehr offen ist oder die Mahnstufe erschöpft ist.
- **«Schleife verlassen & weiter»** ruft `completeStep()` auf dem Gateway auf und
  geht auf den nächsten Schritt.

Der Zustand liegt bewusst **nicht** auf dem Gateway, sondern auf dem
Sync-Lauf mit Anmeldeliste (`findKlappActionSpot`, `loopStatus`,
`canRunLoopRound`, `runLoopRound`, `exitLoop`). Das Gateway zeigt nur die
Aggregate, die Liste je Kind bleibt beim Monitoring-Schritt 8004. So gibt es
genau eine Wahrheit.

**Deshalb sitzen auf 8004 keine Aktionsknöpfe mehr.** Früher standen dort
«Mahnlauf simulieren» und «Erinnerungsbriefe», also die Schleife am falschen
Ort. Heute steht dort ein Verweis auf das Gateway. Wer die Knöpfe zurückholt,
hat die Schleife wieder an zwei Stellen.

### Zwei Fallen, die dabei zugeschlagen haben (01.09.2026)

**1. `loopCondition` ging beim Elsa-Roundtrip verloren.** Der Adapter schrieb die
Bedingung nur nach `metadata.displayText`, und `buildLoopGateway()` im Translator
setzte `loopCondition: sv.title`. Im Schrittdetail stand darum der **Titel** als
Bedingung («Anmeldungen noch offen?» statt «Offene Anmeldungen > 0 und Mahnstufe
< 3»). Betraf jede Schleife, auch die im Baugesuch. Behoben: `loopCondition`
reist jetzt in der `simpleView` mit, der Translator liest
`sv.loopCondition ?? node.metadata?.displayText ?? sv.title`.

**2. Die Steuerung verschwand still, wenn der Abgleich nie lief.** `loopStatus()`
gab `undefined` zurueck, solange kein Sync-Lauf mit Anmeldeliste existierte, und
das Template rendert dann nichts. Da `canCompleteStep()` Schritte mit
`stepType: 'activity'` ohne Bedingung durchlaesst, kann man 8004 abschliessen,
**ohne** «Abgleich ausloesen» geklickt zu haben. Genau dann war das Gateway wieder
eine Sackgasse. Behoben: `loopStatus()` liefert im Zweifel den Ausgangsstand
(seiteneffektfrei, es wird aus dem Template gerufen), `runLoopRound()` zieht den
Lauf per `ensureKlappRun()` nach, und ein Hinweis sagt es.

**Merke:** ein Getter, den das Template aufruft, darf keinen Zustand anlegen. Und
eine Steuerung, die bei fehlenden Daten einfach nicht rendert, ist von einem
Fehler nicht zu unterscheiden. Lieber rendern und erklaeren.

## Felder bewusst knapp gehalten

**Maximal drei Felder pro Schritt.** Was der Schnittstellen-Panel oder eine
erzeugte Datei ohnehin zeigt, steht nicht zusätzlich als Feld da. Konkret
entfernt (01.09.2026, war zu überladen):

| entfernt | steht stattdessen in |
|---|---|
| Datenquelle, Selektions-ID | Konfigurationsblock des ContactSync-Panels |
| Fehlender zweiter Elternteil, Sorgerecht unbestätigt, Keine Klapp-tauglichen Kontaktdaten | zu einem Feld «Datenlücken» zusammengefasst, Aufschlüsselung in der CSV |
| Briefvorlage, Versanddatum | nicht entscheidungsrelevant |
| Anmeldefrist auf 8004, Maximale Mahnstufe | Klapp-Panel («Frist 30.09.2026», «Mahnstufe 0 von 3») |
| Anmeldung abgeschlossen auf 8004 | Klapp-Panel als Zähler. Es war ein **editierbares Textfeld für einen berechneten Wert**, also gleich doppelt falsch |
| Empfänger auf 8005 | Schritttitel und Panel |
| Zielobjekt je Kind auf 8006 | Schritttitel und Aufgaben |

Wer Felder ergänzt: erst prüfen, ob der Wert nicht schon im Panel steht. Doppelt
geführte Werte laufen auseinander, sobald einer davon berechnet wird.

**Achtung bei Aufgaben:** ein Klick auf eine Aufgabe schaltet
`offen -> in Arbeit -> erledigt`, es braucht also **zwei** Klicks bis erledigt.
Und Schritte mit `stepType: 'activity'` verbergen Aufgaben und Kriterien und
lassen sich direkt abschliessen (`canCompleteStep` lässt sie durch). Das
betrifft 8001, 8003, 8004 und ist bestehende Konvention, kein Fehler. 8002 ist
ein `task`-Schritt: dort müssen alle Aufgaben erledigt und beide Kriterien
gesetzt sein, bevor «Schritt abschliessen» freigibt.

### Fachliche Quellen (Confluence, Stand 01.09.2026)

Die Endpunkte und Feldnamen sind **echt**, nicht erfunden. Wer sie ändert, sollte
zuerst dort nachlesen:
- **Schuleinschreibung via Klapp** (DOK, Seite 5506531331): Einschulung wird bei
  Klapp als **Angebot mit Angebotsoptionsgruppen** abgebildet. Endpunkte
  `/process/klapp/OfferRequest/OfferList/{mainCategory}/{studentGuid}`,
  `/offerDetail/{offerGuid}`, `POST /register`, `PUT|DELETE /request/{guid}`.
  Harte Einschränkung: Daten gehen nur zu Klapp, **solange die Aufgabe im Status
  «Erfasst» steht**. Mehrfachauswahl unterstützt Klapp nicht.
- **Einführung ContactSync mit Beziehungen und Haushalten** (DOK, Seite
  5354192911): ab ContactSync 5 und CMI R26 synchronisiert ein **Geplanter Task**
  Schulkinder samt Familiensituation aus der Innosolv-EWK. Endpunkt
  **`FindSchulkinder`**, gesteuert über eine **Selektions-ID** (Altersbereich,
  Gebiete, Gruppenkriterien). Eltern kommen über **Beziehungen** mit, Wohnsituation
  über **Haushalte**, Kinder tragen `OptionenFremdsystem = INCLUDE_RELATIONS`.
- Die Datenlücken in Schritt 8002 sind die realen: **das Sorgerecht in der EWK ist
  oft nicht aktuell** (die Stellen setzen gern ein «ja» ohne Beleg), und es gibt
  einen Report für **fehlende Mütter bzw. Väter**, also Kinder ohne zweiten
  Elternteil. Das ist der Grund, warum die Prüfung diese drei Punkte zählt.
- CMI nennt das Einzelfall-Dossier im Schulumfeld **Lernendendossier**.


## Zeilenenden: das Repo ist gemischt

`core.autocrlf` ist **false** und es gibt kein `.gitattributes`, Dateien liegen
also byteweise so im Repo, wie sie geschrieben wurden. Der Bestand ist
grösstenteils **LF**, mit einer Ausnahme: `step-detail.component.ts` ist
**CRLF**. Das ist so gewachsen, nicht gewollt.

**Falle bei Skript-Edits (am 01.09.2026 zugeschlagen):** wer eine Datei mit
Python liest und schreibt, kippt ungewollt die Zeilenenden, weil `open()` beim
Lesen CRLF zu LF übersetzt und ein `newline=''` beim Schreiben dann LF
hinausschreibt. Ergebnis war ein Diff über 3191 Zeilen für 145 echte
Änderungen. **Beim Lesen ebenfalls `newline=''` setzen** oder binaer arbeiten:

```python
s = io.open(p, encoding='utf-8', newline='').read()      # CRLF bleibt CRLF
io.open(p, 'w', encoding='utf-8', newline='').write(s)
```

Nach jedem Skript-Edit `git diff --stat` gegen `git diff --stat
--ignore-all-space` halten. Klaffen die Zahlen auseinander, sind es die
Zeilenenden. Ein `.gitattributes` würde das dauerhaft lösen, würde aber alle
Dateien neu normalisieren und gehört darum in einen eigenen Commit.

## Wichtig

- Kein `flutter analyze` o.ä. — das ist kein Flutter-Projekt
- Build: `npx ng build` — CSS-Budget in angular.json auf 10kB/16kB erhöht
- Analyse: `npx ng build` prüft TypeScript-Fehler mit
