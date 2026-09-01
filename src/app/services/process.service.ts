import { Injectable, signal, computed } from '@angular/core';
import {
  Process, ProcessStep, Dossier, ContextObject, ContextLink,
  Input, Task, CompletionCriterion, PortalMessage, PortalDocument, Note, Participant,
  AppTab, TabType, Sitzung, GatewayType, WorkflowEvent, AiAssessment,
  SyncRun, KlappRegistration,
} from '../models/process.model';
import { processToElsa } from '../elsa/process-to-elsa.adapter';
import { translateWorkflow } from '../elsa/workflow-translator';
import { mergeInstanceState } from '../elsa/instance-state-merger';
import { pruneFuture } from '../elsa/future-pruner';
import { ElsaWorkflow } from '../elsa/elsa-workflow.types';

// Run all mock Process objects through the Elsa pipeline:
// Process → Elsa shape → translateWorkflow → mergeInstanceState → pruneFuture
function buildProcessesViaElsa(sources: Process[]): Process[] {
  // Deduplicate workflows by id (multiple instances may share one template)
  const workflows = new Map<string, ElsaWorkflow>();
  const pairs = sources.map(p => processToElsa(p));
  for (const { workflow } of pairs) {
    if (!workflows.has(workflow.id)) workflows.set(workflow.id, workflow);
  }
  return pairs.map(({ workflow, instance }) => {
    const wf = workflows.get(workflow.id)!;
    const template = translateWorkflow(wf);
    const sourceProcess = sources.find(s => s.id === instance.instanceId)!;
    const merged = mergeInstanceState(template, instance);
    // Preserve original kind ('template' for processes that weren't instances)
    if (sourceProcess.kind !== 'instance') {
      merged.id = sourceProcess.id;
      merged.kind = 'template';
      merged.templateId = undefined;
      merged.startedAt = undefined;
      merged.startedBy = undefined;
      merged.instanceState = undefined;
      // Templates show the full structure; don't prune unknown futures.
      return merged;
    }
    return pruneFuture(merged);
  });
}

// ============================================================
// KI+ assessment demo seeding
// ------------------------------------------------------------
// The Elsa pipeline rebuilds every instance's steps from the shared template,
// so per-instance field values and step positioning cannot be expressed in the
// instance source objects. We therefore seed them here, on the already-built
// processes, right before they go into the signal. Goal: each demo instance sits
// exactly on its KI+ assessment step (earlier steps completed, later steps
// pending), so the "KI+ schlägt vor, Mensch entscheidet" pattern can be
// demonstrated end-to-end across several processes.
// ============================================================

interface FieldOverride { stepId: string; label: string; value: string; }

interface DemoInstanceSeed {
  instanceId: string;
  assessmentStepId: string;       // step positioned as in-progress (carries the KI+ action)
  decisionLabels: string[];       // select inputs the user fills; emptied so they start blank
  title?: string;
  startedAt?: string;
  startedBy?: string;
  fieldOverrides?: FieldOverride[];
  stripContextLinks?: boolean;    // drop inherited (template) Geschäft links
  replaceText?: { from: string; to: string };  // rename inherited text (e.g. document names)
}

const DEMO_INSTANCE_SEEDS: DemoInstanceSeed[] = [
  // Veranstaltung: Dorffest (template defaults already describe the Dorffest).
  {
    instanceId: 'inst-dossier-va', assessmentStepId: 'va-3', decisionLabels: ['Risikostufe'],
    title: 'Dorffest Sommer 2027', startedAt: '20.07.2026', startedBy: 'Frei Barbara',
  },
  // Veranstaltung: Streetparade (large-scale; overrides the event data).
  {
    instanceId: 'inst-dossier-va2', assessmentStepId: 'va-3', decisionLabels: ['Risikostufe'],
    title: 'Streetparade Zürich 2027', startedAt: '12.07.2026', startedBy: 'Hans Berger',
    stripContextLinks: true, replaceText: { from: 'Dorffest', to: 'Streetparade' },
    fieldOverrides: [
      { stepId: 'va-1', label: 'Veranstalter', value: 'Verein Streetparade Zürich' },
      { stepId: 'va-1', label: 'Veranstaltung', value: 'Streetparade Zürich 2027' },
      { stepId: 'va-1', label: 'Datum', value: '14.08.2027' },
      { stepId: 'va-1', label: 'Erwartete Besucherzahl', value: "ca. 900'000" },
    ],
  },
  // Gemeinderatsanfrage: KI+ Ressort-Triage.
  {
    instanceId: 'inst-dossier-gr', assessmentStepId: 'gr-2', decisionLabels: ['Zuständiges Ressort'],
    startedAt: '01.08.2026', startedBy: 'Schmid Andrea',
  },
  // KESB-Gefahrenmeldung: KI+ Gefährdungs-Screening.
  {
    instanceId: 'inst-dossier-kesb', assessmentStepId: 'kes-2',
    decisionLabels: ['Dringlichkeitsstufe', 'Sofortmassnahmen nötig'],
    startedAt: '04.08.2026', startedBy: 'Dr. Gerber Nicole',
  },
  // Akteneinsicht: KI+ Datenschutz-Check.
  {
    instanceId: 'inst-dossier-ae', assessmentStepId: 'ae-2', decisionLabels: ['Berechtigungsstatus'],
    startedAt: '10.08.2026', startedBy: 'Weber Claudia',
  },
  // Sonderpädagogik: KI+ Förderbedarf-Screening.
  {
    instanceId: 'inst-dossier-sp', assessmentStepId: 'sp-2', decisionLabels: ['Empfohlene Massnahmenstufe'],
    startedAt: '29.06.2026', startedBy: 'Vogt Daniel',
  },
];

function setStepInputValue(steps: ProcessStep[], stepId: string, label: string, value: string): void {
  const step = steps.find((s) => s.id === stepId);
  const input = step?.inputs.find((i) => i.label === label);
  if (input) input.value = value;
}

// Reset a step (and everything nested below it) to a fresh, not-yet-started state.
function resetStepSubtreeToPending(step: ProcessStep): void {
  step.status = 'pending';
  step.completedDate = undefined;
  step.tasks = step.tasks.map((t) => ({ ...t, status: 'open' as const, resultValue: undefined }));
  step.completionCriteria = step.completionCriteria.map((c) => ({ ...c, met: false }));
  step.inputs = step.inputs.map((i) => (i.type === 'document' ? { ...i, uploaded: false } : i));
  // A step that has not run yet carries no run results either.
  step.actions = step.actions.map((a) => ({ ...a, aiResult: undefined, syncResult: undefined }));
  step.parallelPaths?.forEach((path) => path.forEach(resetStepSubtreeToPending));
  step.subSteps?.forEach(resetStepSubtreeToPending);
  step.branches?.forEach((b) => b.steps.forEach(resetStepSubtreeToPending));
}

function seedDemoInstances(processes: Process[]): Process[] {
  for (const p of processes) {
    const seed = p.kind === 'instance'
      ? DEMO_INSTANCE_SEEDS.find((s) => s.instanceId === p.id)
      : undefined;
    if (!seed) continue;

    // The Elsa pipeline shares step/input/action array references between the
    // template and all its instances (one workflow definition). Deep-clone this
    // instance's steps before mutating, so per-instance values don't leak across.
    p.steps = structuredClone(p.steps);
    if (seed.title) p.title = seed.title;
    if (seed.startedAt) p.startedAt = seed.startedAt;
    if (seed.startedBy) p.startedBy = seed.startedBy;
    const actor = seed.startedBy ?? p.startedBy ?? 'Sachbearbeiter:in';

    // Position the instance: everything before the assessment step is done, the
    // assessment step is in progress, everything after is pending.
    const assessmentIdx = p.steps.findIndex((s) => s.id === seed.assessmentStepId);
    p.steps.forEach((step, i) => {
      if (assessmentIdx === -1) return;
      if (i < assessmentIdx) {
        step.status = 'completed';
      } else if (i === assessmentIdx) {
        step.status = 'in-progress';
        step.completedDate = undefined;
        step.tasks = step.tasks.map((t) => ({ ...t, status: 'open' as const, resultValue: undefined }));
        step.completionCriteria = step.completionCriteria.map((c) => ({ ...c, met: false }));
      } else {
        resetStepSubtreeToPending(step);
      }
    });

    if (seed.stripContextLinks) {
      const stripLinks = (s: ProcessStep) => {
        s.contextLinks = [];
        s.parallelPaths?.forEach((path) => path.forEach(stripLinks));
        s.subSteps?.forEach(stripLinks);
        s.branches?.forEach((b) => b.steps.forEach(stripLinks));
      };
      p.steps.forEach(stripLinks);
    }

    // Rename inherited template text (e.g. "Konzept_Dorffest.pdf") across all inputs.
    if (seed.replaceText) {
      const { from, to } = seed.replaceText;
      const rename = (s: ProcessStep) => {
        s.inputs = s.inputs.map((i) => ({
          ...i,
          value: i.value?.split(from).join(to),
          documentName: i.documentName?.split(from).join(to),
        }));
        s.parallelPaths?.forEach((path) => path.forEach(rename));
        s.subSteps?.forEach(rename);
        s.branches?.forEach((b) => b.steps.forEach(rename));
      };
      p.steps.forEach(rename);
    }

    for (const ov of seed.fieldOverrides ?? []) {
      setStepInputValue(p.steps, ov.stepId, ov.label, ov.value);
    }
    // Decision fields are filled by the user, deliberately not by the KI+, so blank.
    for (const label of seed.decisionLabels) {
      setStepInputValue(p.steps, seed.assessmentStepId, label, '');
    }

    // Audit log: a started event plus one per already-completed step (newest first).
    const completed = assessmentIdx > 0 ? p.steps.slice(0, assessmentIdx) : [];
    p.events = [
      ...completed.slice().reverse().map((s, k) => ({
        id: `${p.id}-evc${k}`,
        timestamp: `2026-08-0${Math.min(9, 2 + k)}T10:00:00Z`,
        type: 'step_completed' as const,
        description: `Schritt «${s.title}» abgeschlossen`,
        actor, stepId: s.id, stepTitle: s.title,
      })),
      {
        id: `${p.id}-ev0`, timestamp: '2026-08-01T09:00:00Z', type: 'started' as const,
        description: `Workflow «${p.title}» gestartet von ${actor}`, actor,
      },
    ];
  }
  return processes;
}

// --- KI+ risk-assessment generator ----------------------------------------
// Heuristic, deterministic stand-in for a configured KI+ assistant. Reads the
// event name and expected attendance from the instance and produces a realistic
// summary + detailed analysis. A village fair reads very differently from a
// city-scale rave.

function readInputValue(proc: Process, label: string): string {
  for (const s of proc.steps) {
    const input = s.inputs?.find((i) => i.label === label);
    if (input?.value) return input.value;
  }
  return '';
}

function parseAttendance(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export interface GeneratedAssessment {
  recommendedLevel: string;
  summary: string;
  detail: string;
}

function generateRiskAssessment(proc: Process): GeneratedAssessment {
  const name = readInputValue(proc, 'Veranstaltung') || proc.title;
  const veranstalter = readInputValue(proc, 'Veranstalter') || 'Veranstalter unbekannt';
  const datum = readInputValue(proc, 'Datum') || 'Datum offen';
  const besucherRaw = readInputValue(proc, 'Erwartete Besucherzahl');
  const besucher = parseAttendance(besucherRaw);
  const besucherLabel = besucherRaw || 'unbekannt';
  const lower = name.toLowerCase();

  const isLargeScale =
    /streetparade|street\s?parade|rave|technoparade|techno|festival|grossanlass/.test(lower) ||
    besucher >= 50000;
  const isSmall = besucher > 0 && besucher < 1000 && !isLargeScale;

  const meta =
    `<p class="ai-meta"><strong>Veranstalter:</strong> ${veranstalter} &nbsp;·&nbsp; ` +
    `<strong>Datum:</strong> ${datum} &nbsp;·&nbsp; ` +
    `<strong>Erwartete Besucherzahl:</strong> ${besucherLabel}</p>`;

  if (isLargeScale) {
    return {
      recommendedLevel: 'Hoch',
      summary:
        `<p><strong>${name}</strong> (${veranstalter}, erwartet <strong>${besucherLabel}</strong> Besuchende, ${datum}) ist ein urbaner Grossanlass.</p>` +
        `<p><strong>Massgebende Risiken:</strong></p>` +
        `<ul>` +
        `<li><strong>Crowd-Management:</strong> Gefahr von Gedränge und Panik auf engem Stadtraum</li>` +
        `<li><strong>Sanität und Notfall:</strong> umfangreiches Konzept mit mehreren Sanitätsposten</li>` +
        `<li><strong>Verkehr:</strong> grossflächige Strassen- und ÖV-Sperrungen</li>` +
        `<li><strong>Lärm:</strong> erhebliche Immissionen über viele Stunden</li>` +
        `<li><strong>Sucht- und Drogenprävention:</strong> Drug-Checking, Wasserabgabe</li>` +
        `</ul>` +
        `<p>Erfordert ein Grossaufgebot von Polizei und Rettungsdiensten sowie kantonale Koordination.</p>` +
        `<p><strong>Empfohlene Risikostufe: Hoch.</strong></p>`,
      detail:
        meta +
        `<h4>1. Personensicherheit / Crowd-Management</h4>` +
        `<p>Bei sechsstelligen Besucherzahlen auf begrenztem Stadtraum besteht erhöhte Gefahr von Gedränge und Panik. Erforderlich sind:</p>` +
        `<ul><li>Zonierung und Einbahn-Personenführung</li><li>klar definierte Flucht- und Rettungswege</li><li>Echtzeit-Dichtemonitoring</li></ul>` +
        `<h4>2. Sanität und Notfall</h4>` +
        `<ul><li>mehrere Sanitätsposten mit Führungsstruktur (Care-Team, Spitalkoordination)</li><li>freigehaltene Notfallachsen für Rettungsfahrzeuge</li><li>zahlreiche Einsätze zu erwarten (Kreislauf, Alkohol, Drogen)</li></ul>` +
        `<h4>3. Verkehr und öffentlicher Raum</h4>` +
        `<ul><li>grossflächige Strassensperrungen</li><li>Anpassung von Tram- und Buslinien, Park-and-Ride</li><li>Besucherlenkung ab Bahnhöfen, Abstimmung mit Verkehrsbetrieben und SBB</li></ul>` +
        `<h4>4. Lärm und Immissionen</h4>` +
        `<p>Mehrere Soundsysteme mit hohem Schalldruck über viele Stunden. Notwendig: Lärmgutachten, Pegelauflagen, Anwohnerinformation sowie Ausnahmebewilligung für die Nachtruhe.</p>` +
        `<h4>5. Sucht- und Drogenprävention</h4>` +
        `<p>Präventionsstände, Drug-Checking-Angebote und Wasserabgabe reduzieren die Gesundheitsrisiken spürbar.</p>` +
        `<h4>6. Bewilligungen und Fachstellen</h4>` +
        `<ul><li>Feuerpolizei (temporäre Bauten, Pyrotechnik)</li><li>Kantonspolizei (Sicherheit, Verkehr)</li><li>Lebensmittelkontrolle (zahlreiche Stände)</li><li>Umweltamt / Lärmschutz</li></ul>` +
        `<p>Aufgrund der Tragweite ist eine kantonale Koordination angezeigt.</p>` +
        `<p><strong>Gesamtbeurteilung:</strong> Aufgrund von Besucherzahl, urbaner Dichte und Lärm- bzw. Verkehrswirkung wird die Risikostufe <strong>Hoch</strong> empfohlen. Die definitive Einstufung obliegt der sachbearbeitenden Person.</p>`,
    };
  }

  if (isSmall) {
    return {
      recommendedLevel: 'Tief',
      summary:
        `<p><strong>${name}</strong> (${veranstalter}, erwartet <strong>${besucherLabel}</strong> Besuchende, ${datum}) ist ein kleiner, lokal begrenzter Anlass.</p>` +
        `<p><strong>Überschaubare Risiken:</strong></p>` +
        `<ul>` +
        `<li><strong>Festwirtschaft:</strong> Lebensmittelhygiene</li>` +
        `<li><strong>Temporäre Baute:</strong> allenfalls ein kleines Zelt</li>` +
        `<li><strong>Nachtruhe:</strong> moderate Musik-Lautstärke</li>` +
        `</ul>` +
        `<p>Mit einem einfachen Sicherheitskonzept gut beherrschbar.</p>` +
        `<p><strong>Empfohlene Risikostufe: Tief.</strong></p>`,
      detail:
        meta +
        `<h4>1. Personensicherheit</h4><p>Geringe Besucherzahl, keine besondere Gedrängegefahr. Übliche Sorgfalt genügt.</p>` +
        `<h4>2. Festwirtschaft / Lebensmittel</h4><ul><li>Lebensmittelhygiene bei Verpflegungsständen</li><li>Kühlkette und Handhygiene</li></ul>` +
        `<h4>3. Lärm</h4><p>Musik in moderatem Rahmen; Endzeit und Pegel mit der Anwohnerschaft abstimmen.</p>` +
        `<h4>4. Fachstellen</h4><p>In der Regel genügen Lebensmittelkontrolle und bei temporären Bauten die Feuerpolizei.</p>` +
        `<p><strong>Gesamtbeurteilung:</strong> Risikostufe <strong>Tief</strong> empfohlen. Die definitive Einstufung obliegt der sachbearbeitenden Person.</p>`,
    };
  }

  // Default: a typical local/communal event (village fair, market, sports day).
  return {
    recommendedLevel: 'Mittel',
    summary:
      `<p><strong>${name}</strong> (${veranstalter}, erwartet <strong>${besucherLabel}</strong> Besuchende, ${datum}) ist ein etablierter lokaler Anlass mit familiärem Charakter.</p>` +
      `<p><strong>Hauptrisiken:</strong></p>` +
      `<ul>` +
      `<li><strong>Festwirtschaft:</strong> Lebensmittelhygiene, Hitze</li>` +
      `<li><strong>Temporäre Bauten:</strong> Festzelt und Bühne (Brandschutz, Statik)</li>` +
      `<li><strong>Verkehr und Nachtruhe:</strong> Parkierung und Musik</li>` +
      `</ul>` +
      `<p>Mit einem soliden Sicherheitskonzept und den üblichen Fachstellen-Auflagen gut beherrschbar.</p>` +
      `<p><strong>Empfohlene Risikostufe: Mittel.</strong></p>`,
    detail:
      meta +
      `<h4>1. Personensicherheit</h4><p>Mittlere Besucherzahl über mehrere Stunden bzw. Tage. Empfohlen sind ausreichend dimensionierte Zu- und Ausgänge sowie ein einfacher Ordnungsdienst.</p>` +
      `<h4>2. Festwirtschaft und Lebensmittel</h4><ul><li>Lebensmittelhygiene, Kühlkette und Trinkwasser sicherstellen</li><li>bei Sommerhitze zusätzlich Wasserabgabe und Schattenplätze</li></ul>` +
      `<h4>3. Temporäre Bauten und Brandschutz</h4><ul><li>Brandschutznachweise für Festzelt und Bühne</li><li>freie Fluchtwege und Feuerlöscher</li><li>bei Pyrotechnik gesonderte Bewilligung</li></ul>` +
      `<h4>4. Verkehr und Nachtruhe</h4><ul><li>lokale Verkehrsführung, Parkierung und Beschilderung</li><li>Musik mit definierter Endzeit, Anwohnerinformation, allenfalls Ausnahmebewilligung Nachtruhe</li></ul>` +
      `<h4>5. Fachstellen</h4><ul><li>Feuerpolizei (Festzelt)</li><li>Kantonspolizei (Verkehr / Sicherheit)</li><li>Lebensmittelkontrolle (Stände)</li><li>Umweltamt / Lärmschutz</li></ul>` +
      `<p><strong>Gesamtbeurteilung:</strong> Aufgrund von Grösse und temporären Bauten wird die Risikostufe <strong>Mittel</strong> empfohlen. Die definitive Einstufung obliegt der sachbearbeitenden Person.</p>`,
  };
}

// --- Gemeinderat: Ressort-Triage ------------------------------------------
function generateTriageAssessment(proc: Process): GeneratedAssessment {
  const antrag = readInputValue(proc, 'Antragsteller:in') || readInputValue(proc, 'Antragsteller') || 'unbekannt';
  const betreff = readInputValue(proc, 'Betreff') || proc.title;
  const t = betreff.toLowerCase();

  let ressort = 'Bau & Planung';
  let begruendung = 'Zuordnung anhand des Gesamtkontexts der Anfrage.';
  let sekundaer = '';
  if (/tempo|verkehr|strasse|parkier|velo|fussg|signal|kreisel|schulweg|mobilit/.test(t)) {
    ressort = 'Verkehr & Infrastruktur';
    begruendung = 'Die Anfrage betrifft Verkehrssicherheit und Strassenraum, klar im Bereich Verkehr und Infrastruktur.';
    if (/schul|kind/.test(t)) sekundaer = 'Bildung (Aspekt Schulwegsicherheit)';
  } else if (/schul|bildung|kita|lehr|tagesstruktur/.test(t)) {
    ressort = 'Bildung'; begruendung = 'Die Anfrage betrifft den Bildungsbereich.';
  } else if (/bau|zone|planung|raumplan|umbau|quartier|ortsplan/.test(t)) {
    ressort = 'Bau & Planung'; begruendung = 'Die Anfrage betrifft Planung und Baurecht.';
  } else if (/steuer|gebühr|budget|finanz|rechnung|kredit/.test(t)) {
    ressort = 'Finanzen'; begruendung = 'Die Anfrage betrifft Finanzen und Gebühren.';
  } else if (/sozial|alter|integration|asyl|familie|gesundheit/.test(t)) {
    ressort = 'Soziales'; begruendung = 'Die Anfrage betrifft den Sozialbereich.';
  }

  const meta = `<p class="ai-meta"><strong>Antragsteller:in:</strong> ${antrag} &nbsp;·&nbsp; <strong>Betreff:</strong> ${betreff}</p>`;
  const sekLi = sekundaer ? `<li><strong>Sekundär betroffen:</strong> ${sekundaer}</li>` : '';
  return {
    recommendedLevel: ressort,
    summary:
      `<p>Anfrage <strong>«${betreff}»</strong> von ${antrag}.</p>` +
      `<p>${begruendung}</p>` +
      `<ul><li><strong>Vorschlag zuständiges Ressort:</strong> ${ressort}</li>${sekLi}</ul>` +
      `<p><strong>Empfohlenes Ressort: ${ressort}.</strong></p>`,
    detail:
      meta +
      `<h4>1. Klassifikation der Anfrage</h4><p>${begruendung}</p>` +
      `<h4>2. Vorschlag</h4><ul><li><strong>Federführung:</strong> ${ressort}</li>${sekLi || '<li>Keine wesentliche Mitbetroffenheit weiterer Ressorts erkannt.</li>'}</ul>` +
      `<h4>3. Hinweise zur weiteren Bearbeitung</h4><ul><li>Bei ressortübergreifenden Aspekten Mitbericht einholen</li><li>allfällige Fristen und Vorstoss-Typ (Anfrage, Motion, Postulat) prüfen</li></ul>` +
      `<p><strong>Gesamtbeurteilung:</strong> Federführung durch <strong>${ressort}</strong> empfohlen. Die definitive Zuweisung obliegt der sachbearbeitenden Person.</p>`,
  };
}

// --- KESB: Gefährdungs-Screening ------------------------------------------
function generateKesbScreening(proc: Process): GeneratedAssessment {
  const betroffen = readInputValue(proc, 'Betroffene Person(en)') || 'unbekannt';
  const art = readInputValue(proc, 'Art der Gefährdung') || readInputValue(proc, 'Betreff') || '';
  const a = art.toLowerCase();

  let level = 'Mittel';
  let sofort = 'Nein';
  let einschaetzung = 'Hinweise auf eine Gefährdung, jedoch ohne akute Anzeichen.';
  if (/akut|gewalt|misshandl|missbrauch|suizid|lebensgefahr|sofort|flucht/.test(a)) {
    level = 'Sofort'; sofort = 'Ja';
    einschaetzung = 'Anzeichen einer akuten, schwerwiegenden Gefährdung. Es ist umgehend zu handeln.';
  } else if (/vernachläss|verwahrlos|verdacht|kindeswohl|überforder/.test(a)) {
    level = 'Hoch'; sofort = 'Nein';
    einschaetzung = 'Ernstzunehmende Hinweise auf eine Gefährdung des Kindeswohls, eine zeitnahe Abklärung ist angezeigt.';
  } else if (/konflikt|streit|finanz|betreuung/.test(a)) {
    level = 'Mittel'; einschaetzung = 'Belastungssituation mit Klärungsbedarf, ohne akute Gefährdung.';
  }
  const minor = /kind|jährig|jahre|minderjähr/.test(betroffen.toLowerCase());

  const meta = `<p class="ai-meta"><strong>Betroffene Person(en):</strong> ${betroffen} &nbsp;·&nbsp; <strong>Art der Gefährdung:</strong> ${art}</p>`;
  return {
    recommendedLevel: level,
    summary:
      `<p>Meldung betreffend <strong>${betroffen}</strong>, gemeldet als <strong>${art}</strong>.</p>` +
      `<p>${einschaetzung}</p>` +
      `<ul>` +
      `<li><strong>Vorschlag Dringlichkeitsstufe:</strong> ${level}</li>` +
      `<li><strong>Sofortmassnahmen nötig:</strong> ${sofort}</li>` +
      (minor ? `<li>Minderjährige betroffen, erhöhte Sorgfalt</li>` : '') +
      `</ul>` +
      `<p><strong>Empfohlene Dringlichkeitsstufe: ${level}.</strong></p>`,
    detail:
      meta +
      `<h4>1. Erste Einschätzung</h4><p>${einschaetzung}</p>` +
      `<h4>2. Risikoindikatoren</h4><ul>` +
      (minor ? `<li>minderjährige, abhängige Person betroffen</li>` : `<li>keine minderjährige Person ausgewiesen</li>`) +
      `<li>gemeldeter Sachverhalt: ${art}</li>` +
      `<li>Abgleich mit bisherigen Meldungen zur betroffenen Person empfohlen</li></ul>` +
      `<h4>3. Sofortmassnahmen</h4><p>${sofort === 'Ja'
        ? 'Eine superprovisorische Massnahme bzw. sofortige Sicherung ist zu prüfen.'
        : 'Aktuell keine superprovisorische Massnahme angezeigt, eine zeitnahe Abklärung genügt voraussichtlich.'}</p>` +
      `<h4>4. Nächste Schritte</h4><ul><li>Abklärungsauftrag erteilen</li><li>Abklärungsperson mandatieren</li><li>Fristen gemäss Dringlichkeit setzen</li></ul>` +
      `<p><strong>Gesamtbeurteilung:</strong> Dringlichkeitsstufe <strong>${level}</strong> empfohlen. Die definitive Beurteilung obliegt der KESB.</p>`,
  };
}

// --- Akteneinsicht: Datenschutz-Check / Berechtigung ----------------------
function generateDatenschutzCheck(proc: Process): GeneratedAssessment {
  const antrag = readInputValue(proc, 'Antragsteller') || readInputValue(proc, 'Antragsteller:in') || 'unbekannt';
  const dossier = readInputValue(proc, 'Betroffenes Dossier') || proc.title;
  const d = dossier.toLowerCase();

  let status = 'Berechtigt (persönliche Betroffenheit)';
  let basis = 'Die antragstellende Person ist im betroffenen Dossier persönlich betroffen.';
  if (/planung|verkehr|zone|raumplan|öffentlich|projekt|infrastruktur|budget|gemeinde/.test(d)) {
    status = 'Berechtigt (öffentliches Interesse)';
    basis = 'Das Dossier betrifft eine Angelegenheit von öffentlichem Interesse, ein berechtigtes Einsichtsinteresse ist plausibel.';
  }

  const meta = `<p class="ai-meta"><strong>Antragsteller:in:</strong> ${antrag} &nbsp;·&nbsp; <strong>Betroffenes Dossier:</strong> ${dossier}</p>`;
  return {
    recommendedLevel: status,
    summary:
      `<p>Einsichtsgesuch von <strong>${antrag}</strong> betreffend <strong>${dossier}</strong>.</p>` +
      `<p>${basis}</p>` +
      `<ul>` +
      `<li><strong>Vorschlag Berechtigung:</strong> ${status}</li>` +
      `<li><strong>Datenschutz:</strong> Personendaten Dritter sind vor Herausgabe zu schwärzen</li>` +
      `</ul>` +
      `<p><strong>Empfehlung: ${status}.</strong></p>`,
    detail:
      meta +
      `<h4>1. Berechtigung</h4><p>${basis}</p>` +
      `<h4>2. Datenschutz-Prüfung</h4><ul>` +
      `<li>schützenswerte Personendaten Dritter im Dossier wahrscheinlich, vor Herausgabe schwärzen</li>` +
      `<li>besonders schützenswerte Daten (Gesundheit, Massnahmen) gesondert prüfen</li>` +
      `<li>Verhältnismässigkeit zwischen Einsichtsinteresse und Persönlichkeitsschutz wahren</li></ul>` +
      `<h4>3. Empfohlenes Vorgehen</h4><ul><li>Identität der antragstellenden Person verifizieren</li><li>relevante Akten zusammenstellen und schwärzen</li><li>Umfang der Einsicht begründet festlegen</li></ul>` +
      `<p><strong>Gesamtbeurteilung:</strong> <strong>${status}</strong> empfohlen, unter Auflage der Schwärzung von Personendaten Dritter. Die definitive Beurteilung obliegt der sachbearbeitenden Person.</p>`,
  };
}

// --- KI+ Förderbedarf-Screening -------------------------------------------
// Liest den beobachteten Förderbedarf und die Vorgeschichte und schlägt eine
// Massnahmenstufe samt zuständiger Fachstelle vor.
function generateSonderpaedAssessment(proc: Process): GeneratedAssessment {
  const kind = readInputValue(proc, 'Kind') || 'Kind unbekannt';
  const klasse = readInputValue(proc, 'Klasse') || 'unbekannt';
  const bedarf = readInputValue(proc, 'Beobachteter Förderbedarf') || '';
  const vorher = readInputValue(proc, 'Bisherige Massnahmen') || 'keine dokumentiert';
  const einverstaendnis = readInputValue(proc, 'Einverständnis Erziehungsberechtigte') || 'Ausstehend';
  const t = bedarf.toLowerCase();

  const sprache = /sprach|logop|lesen|schreiben|artikul|stotter|wortschatz/.test(t);
  const verhalten = /verhalten|aggress|konzentr|adhs|aufmerksam|rückzug|sozial/.test(t);
  const schwer = /autis|behinder|kognitiv|geistig|mehrfach|schwer/.test(t);

  let stufe = 'Niederschwellige Förderung (schulintern)';
  let fachstelle = 'Schulinterne Förderung, Klassenteam';
  let begruendung = 'Der beschriebene Bedarf lässt sich voraussichtlich schulintern auffangen.';
  if (schwer) {
    stufe = 'Verstärkte Massnahme (Sonderschulung)';
    fachstelle = 'Schulpsychologischer Dienst, Abklärung nach standardisiertem Verfahren';
    begruendung = 'Die Hinweise deuten auf einen umfassenden, länger dauernden Bedarf. Das ruft nach einer verstärkten Massnahme mit Kostengutsprache.';
  } else if (sprache && verhalten) {
    stufe = 'Integrative Förderung (IF)';
    fachstelle = 'Schulpsychologischer Dienst und Logopädischer Dienst';
    begruendung = 'Es liegen Hinweise auf mehrere Förderbereiche vor. Eine integrative Förderung mit logopädischem Anteil ist angezeigt.';
  } else if (sprache) {
    stufe = 'Logopädische Therapie';
    fachstelle = 'Logopädischer Dienst, ergänzend Schulpsychologie';
    begruendung = 'Die Beobachtungen betreffen den Bereich Sprache, Lesen und Schreiben. Eine logopädische Abklärung ist der richtige Einstieg.';
  } else if (verhalten) {
    stufe = 'Integrative Förderung (IF)';
    fachstelle = 'Schulpsychologischer Dienst';
    begruendung = 'Die Beobachtungen betreffen Verhalten und Aufmerksamkeit. Eine schulpsychologische Abklärung ist angezeigt.';
  }

  const vorherWirkungslos = /ohne wirkung|ohne ausreichende|kein formeller|erfolglos/.test(vorher.toLowerCase());
  const eskalation = vorherWirkungslos
    ? 'Die bisherige schulinterne Förderung hat nicht ausreichend gewirkt, eine formelle Massnahme ist damit begründet.'
    : 'Vor einer formellen Massnahme ist zu belegen, dass die schulinternen Möglichkeiten ausgeschöpft sind.';
  const hinweisEinverstaendnis = einverstaendnis === 'Liegt vor'
    ? 'Das Einverständnis der Erziehungsberechtigten liegt vor, die Abklärung kann starten.'
    : 'Ohne Einverständnis der Erziehungsberechtigten darf keine Abklärung durchgeführt werden.';

  const meta = `<p class="ai-meta"><strong>Kind:</strong> ${kind} &nbsp;·&nbsp; <strong>Klasse:</strong> ${klasse} &nbsp;·&nbsp; <strong>Einverständnis:</strong> ${einverstaendnis}</p>`;
  return {
    recommendedLevel: stufe,
    summary:
      `<p>Antrag für <strong>${kind}</strong> (${klasse}).</p>` +
      `<p>${begruendung}</p>` +
      `<ul>` +
      `<li><strong>Vorschlag Massnahmenstufe:</strong> ${stufe}</li>` +
      `<li><strong>Zuständige Fachstelle:</strong> ${fachstelle}</li>` +
      `</ul>` +
      `<p><strong>Empfehlung: ${stufe}.</strong></p>`,
    detail:
      meta +
      `<h4>1. Beobachteter Förderbedarf</h4><p>${bedarf || 'Keine Angaben im Antrag.'}</p>` +
      `<h4>2. Vorgeschichte</h4><p>${vorher}</p><p>${eskalation}</p>` +
      `<h4>3. Vorschlag</h4><ul>` +
      `<li><strong>Massnahmenstufe:</strong> ${stufe}</li>` +
      `<li><strong>Abklärung durch:</strong> ${fachstelle}</li>` +
      `<li>${hinweisEinverstaendnis}</li></ul>` +
      `<h4>4. Hinweise zum Verfahren</h4><ul>` +
      `<li>Förderziele im schulischen Standortgespräch nach ICF festlegen</li>` +
      `<li>Massnahme befristen und nach einem Schuljahr überprüfen</li>` +
      `<li>bei einer verstärkten Massnahme Kostengutsprache des Kantons einholen</li></ul>` +
      `<p><strong>Gesamtbeurteilung:</strong> <strong>${stufe}</strong> vorgeschlagen. Der Entscheid obliegt der Bildungskommission, diese Beurteilung ist eine Entscheidgrundlage.</p>`,
  };
}

// Registry of KI+ assessment actions: action id -> assistant, the decision the
// user makes afterwards, and the generator that produces the recommendation.
// AI actions NOT listed here (document drafts, summaries) keep the plain button.
interface AssessmentConfig {
  assistantName: string;
  decisionLabel: string;
  generate: (proc: Process) => GeneratedAssessment;
}
const ASSESSMENT_ACTIONS: Record<string, AssessmentConfig> = {
  'va-a2': { assistantName: 'KI+ Risikoanalyse Veranstaltungen', decisionLabel: 'Risikostufe', generate: generateRiskAssessment },
  'gr-a2': { assistantName: 'KI+ Ressort-Triage', decisionLabel: 'Zuständiges Ressort', generate: generateTriageAssessment },
  'kes-a2': { assistantName: 'KI+ Gefährdungs-Screening', decisionLabel: 'Dringlichkeitsstufe', generate: generateKesbScreening },
  'ae-a2': { assistantName: 'KI+ Datenschutz-Check', decisionLabel: 'Berechtigungsstatus', generate: generateDatenschutzCheck },
  'sp-a2': { assistantName: 'KI+ Förderbedarf-Screening', decisionLabel: 'Empfohlene Massnahmenstufe', generate: generateSonderpaedAssessment },
};

// ============================================================
// SCHNITTSTELLEN-LAEUFE (simuliert)
// ============================================================
// Fachliche Grundlage: CMI ContactSync (geplanter Task, Endpunkt FindSchulkinder
// gegen die Innosolv-EWK, Beziehungen und Haushalte ab ContactSync 5 / CMI R26)
// und das Klapp-Angebotsmodell fuer die Schuleinschreibung (Angebotsoptions-
// gruppen, Uebertragung nur bei Aufgabenstatus "Erfasst").
// Es verlaesst kein Request den Browser: alle Laeufe sind deterministisch erzeugt.

// Kindergarten-Jahrgang 2027/28 der Gemeinde Dorfname, 24 Kinder.
const KG_JAHRGANG_2027: { name: string; angemeldetAm?: string }[] = [
  { name: 'Aebi Mila', angemeldetAm: '31.08.2026' },
  { name: 'Ammann Nino' },
  { name: 'Baumgartner Lia', angemeldetAm: '31.08.2026' },
  { name: 'Berisha Endrit' },
  { name: 'Bühler Jonas' },
  { name: 'Da Silva Sofia', angemeldetAm: '01.09.2026' },
  { name: 'Egger Levin' },
  { name: 'Frei Noah' },
  { name: 'Gasser Elin' },
  { name: 'Hodzic Amina' },
  { name: 'Huber Malin', angemeldetAm: '01.09.2026' },
  { name: 'Iseli Ben' },
  { name: 'Kaufmann Nora' },
  { name: 'Keller Mia' },
  { name: 'Lüthi Timo' },
  { name: 'Marti Anouk' },
  { name: 'Nguyen Linh', angemeldetAm: '31.08.2026' },
  { name: 'Odermatt Silas' },
  { name: 'Pereira Diogo' },
  { name: 'Roth Fiona' },
  { name: 'Schneider Emil', angemeldetAm: '01.09.2026' },
  { name: 'Steiner Lynn' },
  { name: 'Tanner Cyril' },
  { name: 'Zimmermann Alina' },
];

// Wie viele der offenen Faelle nach dem 1., 2. und 3. Erinnerungsbrief antworten.
// Deterministisch, damit die Demo reproduzierbar bleibt: 18 offen, dann 7 / 6 / 4,
// der letzte Fall bleibt und muss telefonisch nachgefasst werden.
const MAHNLAUF_RUECKLAUF = [7, 6, 4];
const MAHNLAUF_DATUM = ['18.09.2026', '25.09.2026', '30.09.2026'];

// Reference "today" of the mock data. A constant, not new Date(), so a demo stays
// reproducible and simulated runs carry dates that fit the surrounding mock data.
const SYNC_POLL_DATE = '01.09.2026';
const SYNC_POLL_TIMESTAMP = '01.09.2026 11:00';

function klappRegistrationList(): KlappRegistration[] {
  return KG_JAHRGANG_2027.map((k) => ({
    name: k.name,
    status: k.angemeldetAm ? ('angemeldet' as const) : ('offen' as const),
    registeredAt: k.angemeldetAm,
    reminders: 0,
  }));
}

// Zaehler aus der Anmeldeliste neu berechnen, damit Panel und Liste nie auseinanderlaufen.
function klappMetrics(regs: KlappRegistration[], mahnstufe: number, maxMahnstufe: number): { label: string; value: string }[] {
  const angemeldet = regs.filter((r) => r.status === 'angemeldet').length;
  return [
    { label: 'Jahrgang', value: `${regs.length} Kinder` },
    { label: 'Anmeldung abgeschlossen', value: `${angemeldet}` },
    { label: 'Offen', value: `${regs.length - angemeldet}` },
    { label: 'Mahnstufe', value: `${mahnstufe} von ${maxMahnstufe}` },
  ];
}

// Inbound: Stammdaten des Jahrgangs aus der Einwohnerkontrolle.
function contactSyncRun(): SyncRun {
  return {
    status: 'done',
    systemName: 'CMI ContactSync',
    direction: 'CMI ← Innosolv EWK',
    endpoint: 'GET FindSchulkinder',
    config: [
      { label: 'Provider', value: 'Innosolv EWK (innoconnect/api)' },
      { label: 'Selektions-ID', value: 'SEL-4711 (4 bis 6 Jahre, Gebiet Dorf-Ost)' },
      { label: 'Geplanter Task', value: 'täglich 02:15, WaitTimeInSeconds 2' },
      { label: 'Fremdkey-Präfix', value: 'innosolv.Contact=' },
      { label: 'Option auf dem Kontakt', value: 'INCLUDE_RELATIONS' },
    ],
    lastRun: '24.08.2026 02:15',
    outcome: 'warnung',
    metrics: [
      { label: 'Bezogene Kontakte', value: '26' },
      { label: 'Davon Jahrgang 2027/28', value: '24' },
      { label: 'Beziehungen erstellt', value: '46' },
      { label: 'Haushalte erstellt', value: '22' },
      { label: 'Laufzeit', value: '41 min' },
    ],
    warnings: [
      '3 Kinder ohne zweiten Elternteil in der EWK. Entspricht dem Report «fehlende Mütter bzw. Väter».',
      '2 Kinder mit Sorgerecht «ja» ohne Belegdokument. Der EWK-Wert gilt als unbestätigt und ist nachzufragen.',
      '1 Kind ohne Haushaltnummer. Die Wohnsituation ist manuell zu erfassen.',
    ],
  };
}

// Outbound: das Einschulungs-Angebot samt Optionsgruppen an Klapp.
function klappOfferRun(): SyncRun {
  return {
    status: 'done',
    systemName: 'Klapp',
    direction: 'CMI → Klapp',
    endpoint: 'GET /process/klapp/OfferRequest/offerDetail/{offerGuid}',
    config: [
      { label: 'mainCategory', value: 'Einschulung' },
      { label: 'Angebot', value: 'Einschulung Kindergarten 2027/28' },
      { label: 'Integration', value: 'CMI Schule aktiviert (Verwaltung → Integrationen)' },
      { label: 'Voraussetzung', value: 'Aufgabe im Status «Erfasst»' },
    ],
    lastRun: '31.08.2026 14:20',
    outcome: 'warnung',
    metrics: [
      { label: 'Angebotsoptionsgruppen', value: '7' },
      { label: 'Davon Pflichtgruppen', value: '5' },
      { label: 'Empfänger', value: '24 Lernende' },
      { label: 'Übertragen', value: '24 von 24' },
    ],
    warnings: [
      'Mehrfachauswahl wird von Klapp nicht unterstützt. Die Frage zum Betreuungsbedarf ist als drei Ja/Nein-Gruppen abgebildet.',
      'Das Angebot wird nur übertragen, solange die Aufgabe im Status «Erfasst» steht. Ein Statuswechsel stoppt den Abgleich still.',
    ],
  };
}

// Inbound: der Rueckkanal, welche Familie die Anmeldung abgeschlossen hat.
function klappRegistrationRun(): SyncRun {
  const regs = klappRegistrationList();
  return {
    status: 'done',
    systemName: 'Klapp',
    direction: 'CMI ← Klapp',
    endpoint: 'POST /process/klapp/OfferRequest/register',
    config: [
      { label: 'Weitere Endpunkte', value: 'PUT und DELETE /process/klapp/OfferRequest/request/{guid}' },
      { label: 'Angebot', value: 'Einschulung Kindergarten 2027/28' },
      { label: 'Abgleich', value: 'stündlich, zusätzlich manuell auslösbar' },
    ],
    lastRun: '01.09.2026 09:00',
    outcome: 'warnung',
    metrics: klappMetrics(regs, 0, MAHNLAUF_RUECKLAUF.length),
    warnings: [
      '3 Familien haben kein Klapp-Konto. Der Registrationsbrief mit Zugangscode ist zwingend, eine Anmeldung ohne Konto ist nicht möglich.',
      '1 Familie mit unklarem Sorgerecht. Die Anmeldung ist nur durch den sorgeberechtigten Elternteil gültig.',
    ],
    registrations: regs,
    deadline: '30.09.2026',
    mahnstufe: 0,
    maxMahnstufe: MAHNLAUF_RUECKLAUF.length,
  };
}

// Registry der simulierten Schnittstellen-Aktionen.
// Aktionen vom Typ 'interface', die hier NICHT stehen, behalten den einfachen Knopf.
// Ein Lauf darf mehr als das Panel füllen: er schreibt Ergebniswerte in die
// Felder des Schritts und hakt die Aufgaben ab, die tatsächlich die Maschine
// erledigt. Was ein Mensch bestätigen muss, bleibt offen.
interface SyncActionDef {
  build: () => SyncRun;
  writesInputs?: { label: string; value: string }[];
  completesTasks?: string[];
}

const SYNC_ACTIONS: Record<string, SyncActionDef> = {
  'sei-a1': {
    build: contactSyncRun,
    writesInputs: [
      { label: 'Bezogene Kinder', value: '24' },
      { label: 'Datenquelle', value: 'Innosolv EWK über CMI ContactSync' },
      { label: 'Selektions-ID', value: 'SEL-4711' },
    ],
    // Der geplante Task und der Bezug sind Maschinenarbeit. Das Abgrenzen des
    // Jahrgangs (sei-t3) bleibt bei der Schulverwaltung.
    completesTasks: ['sei-t1', 'sei-t2'],
  },
  'sei-a3': {
    build: klappOfferRun,
    completesTasks: ['sei-t8'],
  },
  'sei-a5': {
    build: klappRegistrationRun,
    completesTasks: ['sei-t12'],
  },
};

// ============================================================
// DOKUMENT-AKTIONEN (echte Dateien, die Word bzw. Excel öffnen)
// ============================================================
// Der Prototyp erzeugt hier wirklich eine Datei im Browser und gibt sie zum
// Download. Word öffnet HTML mit der Endung .doc und dem passenden MIME-Typ
// zuverlässig, das spart eine docx-Bibliothek (externe Libraries sind in
// diesem Repo bewusst nicht erlaubt). Excel öffnet CSV mit Semikolon.

interface DocumentActionDef {
  fileName: string;
  mime: string;
  build: () => string;
  completesTasks?: string[];
  uploadsDocuments?: string[];   // Labels der Dokumentfelder, die danach als vorhanden gelten
}

const BRIEF_ABSENDER = `Gemeinde Dorfname<br>Schulverwaltung<br>Dorfstrasse 1<br>8000 Dorfname`;

function zugangscode(index: number): string {
  return `KG27-${String(index + 1).padStart(4, '0')}`;
}

/** Word-taugliches HTML-Grundgerüst. Print-Ansicht, A4, Ränder wie ein Amtsbrief. */
function wordDocument(title: string, body: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" `
    + `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
    + `<head><meta charset="utf-8"><title>${title}</title>`
    + `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->`
    + `<style>@page { size: A4; margin: 2.5cm 2.5cm 2cm 2.5cm; }`
    + `body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.4; color: #000; }`
    + `.absender { font-size: 9pt; color: #444; margin-bottom: 28pt; }`
    + `.empfaenger { margin-bottom: 28pt; }`
    + `.ort { text-align: right; margin-bottom: 24pt; }`
    + `h1 { font-size: 12pt; margin: 0 0 14pt; }`
    + `table { border-collapse: collapse; font-size: 10pt; }`
    + `th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; }`
    + `th { background: #eee; }`
    + `.code { font-family: Consolas, monospace; font-size: 13pt; letter-spacing: 1pt; }`
    + `.codebox { border: 1px solid #333; padding: 8pt 12pt; display: inline-block; margin: 8pt 0 14pt; }`
    + `.gruss { margin-top: 22pt; }`
    + `.pb { page-break-before: always; }`
    + `</style></head><body>${body}</body></html>`;
}

/** Serienbrief: ein Registrationsbrief je Familie, mit Klapp-Zugangscode. */
function serienbriefRegistration(): string {
  const seiten = KG_JAHRGANG_2027.map((kind, i) => {
    const nachname = kind.name.split(' ')[0];
    return `<div class="${i === 0 ? '' : 'pb'}">`
      + `<p class="absender">${BRIEF_ABSENDER}</p>`
      + `<p class="empfaenger">Erziehungsberechtigte von ${kind.name}<br>Familie ${nachname}<br>8000 Dorfname</p>`
      + `<p class="ort">Dorfname, 31. August 2026</p>`
      + `<h1>Anmeldung zum Kindergarten, Schuljahr 2027/28</h1>`
      + `<p>Sehr geehrte Erziehungsberechtigte</p>`
      + `<p>Ihr Kind <strong>${kind.name}</strong> tritt im August 2027 in den Kindergarten der `
      + `Gemeinde Dorfname ein. Die Anmeldung erfolgt über Klapp, die Kommunikationsplattform `
      + `unserer Schule.</p>`
      + `<p>Bitte registrieren Sie sich mit dem folgenden persönlichen Zugangscode und füllen `
      + `Sie das Anmeldeformular vollständig aus:</p>`
      + `<p class="codebox">Zugangscode <span class="code">${zugangscode(i)}</span></p>`
      + `<p><strong>Anmeldefrist: 30. September 2026.</strong> Ohne Anmeldung innerhalb der Frist `
      + `können wir Ihrem Kind keinen Kindergartenplatz zuteilen und erinnern Sie schriftlich.</p>`
      + `<p>Haben Sie kein Smartphone oder keinen Internetzugang, melden Sie sich bitte bei der `
      + `Schulverwaltung. Wir nehmen die Anmeldung dann persönlich auf.</p>`
      + `<p>Freundliche Grüsse</p>`
      + `<p class="gruss">Schulverwaltung Dorfname<br>Sandra Meier, Leiterin</p>`
      + `</div>`;
  }).join('');
  return wordDocument('Registrationsbriefe Kindergarten 2027/28', seiten);
}

/** Erinnerungsbrief: nur an Familien mit offener Anmeldung. */
function erinnerungsbrief(offene: string[], mahnstufe: number): string {
  const liste = offene.length ? offene : KG_JAHRGANG_2027.filter((k) => !k.angemeldetAm).map((k) => k.name);
  const seiten = liste.map((name, i) => {
    const nachname = name.split(' ')[0];
    const idx = KG_JAHRGANG_2027.findIndex((k) => k.name === name);
    return `<div class="${i === 0 ? '' : 'pb'}">`
      + `<p class="absender">${BRIEF_ABSENDER}</p>`
      + `<p class="empfaenger">Erziehungsberechtigte von ${name}<br>Familie ${nachname}<br>8000 Dorfname</p>`
      + `<p class="ort">Dorfname, ${MAHNLAUF_DATUM[Math.min(mahnstufe, MAHNLAUF_DATUM.length) - 1] ?? '18.09.2026'}</p>`
      + `<h1>Erinnerung: Anmeldung zum Kindergarten, Schuljahr 2027/28</h1>`
      + `<p>Sehr geehrte Erziehungsberechtigte</p>`
      + `<p>Am 31. August 2026 haben wir Ihnen den Registrationsbrief für die Anmeldung Ihres `
      + `Kindes <strong>${name}</strong> zugestellt. Bis heute ist bei uns keine abgeschlossene `
      + `Anmeldung eingegangen.</p>`
      + `<p class="codebox">Zugangscode <span class="code">${idx >= 0 ? zugangscode(idx) : 'siehe Erstbrief'}</span></p>`
      + `<p><strong>Bitte melden Sie Ihr Kind bis zum 30. September 2026 an.</strong> `
      + `Dies ist die ${mahnstufe}. Erinnerung. Bleibt die Anmeldung aus, nimmt die `
      + `Schulverwaltung telefonisch Kontakt mit Ihnen auf.</p>`
      + `<p>Falls Sie sich bereits angemeldet haben, betrachten Sie dieses Schreiben als `
      + `gegenstandslos und melden sich bitte kurz bei uns.</p>`
      + `<p>Freundliche Grüsse</p>`
      + `<p class="gruss">Schulverwaltung Dorfname<br>Sandra Meier, Leiterin</p>`
      + `</div>`;
  }).join('');
  return wordDocument(`Erinnerungsbriefe Kindergarten 2027/28 (Mahnstufe ${mahnstufe})`, seiten);
}

/** Lückenliste für die Einwohnerkontrolle. Semikolon, damit Excel es direkt öffnet. */
function dataGapCsv(): string {
  const zeilen: string[] = [
    'Kind;Fremdkey;Beanstandung;Auswirkung;Massnahme',
    'Berisha Endrit;innosolv.Contact=88214;Kein zweiter Elternteil in der EWK;Anmeldung nur durch einen Elternteil moeglich;Nachfrage Einwohnerkontrolle',
    'Iseli Ben;innosolv.Contact=88231;Kein zweiter Elternteil in der EWK;Anmeldung nur durch einen Elternteil moeglich;Nachfrage Einwohnerkontrolle',
    'Roth Fiona;innosolv.Contact=88259;Kein zweiter Elternteil in der EWK;Anmeldung nur durch einen Elternteil moeglich;Nachfrage Einwohnerkontrolle',
    'Egger Levin;innosolv.Contact=88220;Sorgerecht "ja" ohne Belegdokument;Anmeldung angreifbar;Belegdokument einfordern',
    'Marti Anouk;innosolv.Contact=88244;Sorgerecht "ja" ohne Belegdokument;Anmeldung angreifbar;Belegdokument einfordern',
    'Tanner Cyril;innosolv.Contact=88263;Keine Haushaltnummer geliefert;Wohnsituation unklar;Haushalt manuell erfassen',
    'Frei Noah;innosolv.Contact=88223;Keine Mobilnummer;Kein Klapp-Konto moeglich;Anmeldung persoenlich aufnehmen',
    'Keller Mia;innosolv.Contact=88238;Keine Mobilnummer;Kein Klapp-Konto moeglich;Anmeldung persoenlich aufnehmen',
    'Steiner Lynn;innosolv.Contact=88261;Keine Mobilnummer;Kein Klapp-Konto moeglich;Anmeldung persoenlich aufnehmen',
  ];
  return zeilen.join('\r\n');
}

const DOCUMENT_ACTIONS: Record<string, DocumentActionDef> = {
  'sei-a2': {
    fileName: 'Datenluecken_KG_2027-28.csv',
    mime: 'text/csv;charset=utf-8',
    build: dataGapCsv,
    completesTasks: ['sei-t7'],
  },
  'sei-a4': {
    fileName: 'Registrationsbriefe_KG_2027-28.doc',
    mime: 'application/msword',
    build: serienbriefRegistration,
    completesTasks: ['sei-t9', 'sei-t10'],
    uploadsDocuments: ['Serienbrief (Druckstapel)'],
  },
  'sei-a6': {
    fileName: 'Erinnerungsbriefe_KG_2027-28.doc',
    mime: 'application/msword',
    build: () => erinnerungsbrief([], 1),
    completesTasks: ['sei-t15', 'sei-t16'],
    uploadsDocuments: ['Erinnerungsbrief (Druckstapel)'],
  },
};

export interface LinkedDocument {
  input: Input;
  stepId: string;
  stepNumber: string;
  stepTitle: string;
}

export interface LinkedTask {
  task: Task;
  stepId: string;
  stepNumber: string;
  stepTitle: string;
}

export interface LinkedField {
  input: Input;
  stepId: string;
  stepNumber: string;
  stepTitle: string;
}

@Injectable({ providedIn: 'root' })
export class ProcessService {
  // --- Core data ---
  private _processes = signal<Process[]>(seedDemoInstances(buildProcessesViaElsa(ALL_PROCESSES)));
  private _contextObjects = signal<ContextObject[]>(ALL_CONTEXT_OBJECTS);
  private _dossiers = signal<Dossier[]>(ALL_DOSSIERS);
  private _sitzungen = signal<Sitzung[]>(ALL_SITZUNGEN);

  // --- Tab system ---
  private _tabs = signal<AppTab[]>([]);
  private _activeTabId = signal<string>('');
  private _showDashboard = signal(false);
  private selectedStepId = signal<string | null>(null);
  private _activeMenu = signal('process');

  readonly tabs = this._tabs.asReadonly();
  readonly activeTabId = computed(() => this._showDashboard() ? '' : this._activeTabId());
  readonly activeTab = computed(() => this._tabs().find((t) => t.id === this._activeTabId()) ?? this._tabs()[0]);
  readonly activeTabType = computed<TabType>(() => this.activeTab().type);

  readonly activeMenu = this._activeMenu.asReadonly();
  readonly dossiers = this._dossiers.asReadonly();
  readonly processes = this._processes.asReadonly();
  readonly contextObjects = this._contextObjects.asReadonly();
  readonly sitzungen = this._sitzungen.asReadonly();

  // --- Active objects based on tab type ---
  readonly dossier$ = computed(() => {
    const tab = this.activeTab();
    if (tab.type !== 'geschaeft') return this._dossiers()[0]; // fallback
    return this._dossiers().find((d) => d.id === tab.referenceId) ?? this._dossiers()[0];
  });

  readonly activeProcess = computed<Process | null>(() => {
    const tab = this.activeTab();
    if (tab.type === 'prozess') {
      return this._processes().find((p) => p.id === tab.referenceId) ?? null;
    }
    if (tab.type === 'geschaeft') {
      const pid = this.dossier$().processId;
      return this._processes().find((p) => p.id === pid) ?? null;
    }
    return null;
  });

  readonly activeSitzung = computed<Sitzung | null>(() => {
    const tab = this.activeTab();
    if (tab.type !== 'sitzung') return null;
    return this._sitzungen().find((s) => s.id === tab.referenceId) ?? null;
  });

  // --- All steps of the active process (top-level spine only — used by visualization loops) ---
  readonly steps = computed(() => this.activeProcess()?.steps ?? []);

  // --- All work steps recursively flattened (used for progress, docs, tasks) ---
  readonly allStepsFlat = computed(() =>
    this.flattenSteps(this.activeProcess()?.steps ?? [])
  );

  // --- Context: in Geschäft-view the dossier is the active context ---
  readonly activeContextId = computed(() => {
    const tab = this.activeTab();
    return tab.type === 'geschaeft' ? tab.referenceId : null;
  });

  // --- Steps linked to the active context (dossier/geschäft) ---
  readonly stepsForActiveContext = computed(() => {
    const ctxId = this.activeContextId();
    if (!ctxId) return this.allStepsFlat();
    return this.allStepsFlat().filter((s) =>
      s.contextLinks.some((cl) => cl.contextId === ctxId)
    );
  });

  // --- Check if a step is linked to the active context ---
  isStepLinkedToContext(stepId: string): boolean {
    const ctxId = this.activeContextId();
    if (!ctxId) return true;
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    return step?.contextLinks.some((cl) => cl.contextId === ctxId) ?? false;
  }

  // --- Resolve context object by id ---
  getContextObject(id: string): ContextObject | undefined {
    return this._contextObjects().find((c) => c.id === id);
  }

  // --- Resolve context links for a step (searches entire tree) ---
  getContextsForStep(stepId: string): ContextObject[] {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return [];
    return step.contextLinks
      .map((cl) => this.getContextObject(cl.contextId))
      .filter((c): c is ContextObject => !!c);
  }

  readonly selectedStep = computed(() => {
    const id = this.selectedStepId();
    if (!id) return null;
    return this.findStepInTree(this.activeProcess()?.steps ?? [], id) ?? null;
  });

  // Dossier linked to the currently active process (by processId === activeProcess.id)
  readonly linkedDossier = computed(() =>
    this._dossiers().find((d) => d.processId === this.activeProcess()?.id) ?? null
  );

  readonly progress = computed(() => {
    const s = this.allStepsFlat();
    const done = s.filter((x) => x.status === 'completed').length;
    return { done, total: s.length };
  });

  readonly contextProgress = computed(() => {
    const s = this.stepsForActiveContext();
    const done = s.filter((x) => x.status === 'completed').length;
    return { done, total: s.length };
  });

  readonly allDocuments = computed<LinkedDocument[]>(() =>
    this.allStepsFlat().flatMap((step) =>
      step.inputs
        .filter((i) => i.type === 'document')
        .map((input) => ({ input, stepId: step.id, stepNumber: step.number, stepTitle: step.title }))
    )
  );

  readonly allTasks = computed<LinkedTask[]>(() =>
    this.allStepsFlat().flatMap((step) =>
      step.tasks.map((task) => ({ task, stepId: step.id, stepNumber: step.number, stepTitle: step.title }))
    )
  );

  readonly allFields = computed<LinkedField[]>(() =>
    this.allStepsFlat().flatMap((step) =>
      step.inputs
        .filter((i) => i.type === 'field')
        .map((input) => ({ input, stepId: step.id, stepNumber: step.number, stepTitle: step.title }))
    )
  );

  readonly notes = computed<Note[]>(() => this.dossier$().notes);
  readonly participants = computed<Participant[]>(() => this.dossier$().participants);

  // --- Template vs. Instance views ---
  readonly allTemplates = computed(() =>
    this._processes().filter((p) => p.kind !== 'instance')
  );
  readonly allInstances = computed(() =>
    this._processes().filter((p) => p.kind === 'instance')
  );
  // True when the active prozess-tab shows a Vorlage (not a running instance)
  readonly isTemplateMode = computed(() =>
    this.activeProcess()?.kind !== 'instance'
  );

  // --- Events of the active process (for instance audit log) ---
  readonly activeProcessEvents = computed<WorkflowEvent[]>(() =>
    this.activeProcess()?.events ?? []
  );

  // --- Tab management ---

  openTab(type: TabType, referenceId: string) {
    this._showDashboard.set(false);
    const existing = this._tabs().find((t) => t.type === type && t.referenceId === referenceId);
    if (existing) {
      this._activeTabId.set(existing.id);
      this._activeMenu.set(type === 'prozess' ? 'process' : type === 'sitzung' ? 'traktanden' : 'overview');
      this.selectedStepId.set(null);
      return;
    }
    const tab = this.buildTab(type, referenceId);
    if (!tab) return;
    this._tabs.update((tabs) => [...tabs, tab]);
    this._activeTabId.set(tab.id);
    this._activeMenu.set(type === 'prozess' ? 'process' : type === 'sitzung' ? 'traktanden' : 'overview');
    this.selectedStepId.set(null);
  }

  closeTab(tabId: string) {
    const tabs = this._tabs();
    const idx = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    this._tabs.set(newTabs);
    if (this._activeTabId() === tabId) {
      if (newTabs.length === 0) {
        this._activeTabId.set('');
      } else {
        const newIdx = Math.min(idx, newTabs.length - 1);
        this._activeTabId.set(newTabs[newIdx].id);
      }
    }
  }

  readonly isDashboard = computed(() => this._tabs().length === 0 || this._showDashboard());

  goToDashboard() {
    this._showDashboard.set(true);
  }

  switchTab(tabId: string) {
    this._showDashboard.set(false);
    this._activeTabId.set(tabId);
    const tab = this._tabs().find((t) => t.id === tabId);
    if (tab) {
      this._activeMenu.set(tab.type === 'prozess' ? 'process' : tab.type === 'sitzung' ? 'traktanden' : 'overview');
    }
    this.selectedStepId.set(null);
  }

  private buildTab(type: TabType, referenceId: string): AppTab | null {
    if (type === 'prozess') {
      const proc = this._processes().find((p) => p.id === referenceId);
      if (!proc) return null;
      return { id: `tab-proc-${referenceId}`, type, referenceId, label: proc.title };
    }
    if (type === 'geschaeft') {
      const d = this._dossiers().find((x) => x.id === referenceId);
      if (!d) return null;
      return { id: `tab-dos-${referenceId}`, type, referenceId, label: d.title, number: d.number };
    }
    if (type === 'sitzung') {
      const s = this._sitzungen().find((x) => x.id === referenceId);
      if (!s) return null;
      return { id: `tab-sitz-${referenceId}`, type, referenceId, label: s.title, number: s.number };
    }
    return null;
  }

  // --- Mutations ---

  addNote(subject: string, text: string, visibility: 'intern' | 'extern') {
    const ds = structuredClone(this._dossiers());
    const d = ds.find((x) => x.id === this.dossier$().id)!;
    d.notes.unshift({
      id: crypto.randomUUID(),
      date: new Date().toLocaleDateString('de-CH') + ' ' + new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }),
      author: 'Sachbearbeiter:in',
      subject: subject || undefined,
      text,
      visibility,
    });
    this._dossiers.set(ds);
  }

  switchDossier(id: string) {
    this.openTab('geschaeft', id);
  }

  setActiveMenu(id: string) {
    this._activeMenu.set(id);
  }

  selectStep(id: string) {
    this.selectedStepId.set(id);
  }

  navigateToStep(stepId: string) {
    this._activeMenu.set('process');
    this.selectedStepId.set(stepId);
  }

  private updateProcess(updatedProcess: Process) {
    const ps = structuredClone(this._processes());
    const idx = ps.findIndex((p) => p.id === updatedProcess.id);
    if (idx !== -1) {
      ps[idx] = updatedProcess;
      this._processes.set(ps);
    }
  }

  // --- Recursive tree helpers ---

  private findStepInTree(steps: ProcessStep[], id: string): ProcessStep | null {
    for (const s of steps) {
      if (s.id === id) return s;
      for (const b of s.branches ?? []) {
        const f = this.findStepInTree(b.steps, id); if (f) return f;
      }
      for (const p of s.parallelPaths ?? []) {
        const f = this.findStepInTree(p, id); if (f) return f;
      }
      if (s.loopBody) { const f = this.findStepInTree(s.loopBody, id); if (f) return f; }
      if (s.subSteps) { const f = this.findStepInTree(s.subSteps, id); if (f) return f; }
    }
    return null;
  }

  private updateStepInTree(steps: ProcessStep[], updated: ProcessStep): ProcessStep[] {
    return steps.map(s => {
      if (s.id === updated.id) return updated;
      return { ...s,
        branches:      s.branches?.map(b => ({ ...b, steps: this.updateStepInTree(b.steps, updated) })),
        parallelPaths: s.parallelPaths?.map(p => this.updateStepInTree(p, updated)),
        loopBody:      s.loopBody ? this.updateStepInTree(s.loopBody, updated) : undefined,
        subSteps:      s.subSteps ? this.updateStepInTree(s.subSteps, updated) : undefined,
      };
    });
  }

  private deleteStepFromTree(steps: ProcessStep[], id: string): ProcessStep[] {
    return steps.filter(s => s.id !== id).map(s => ({ ...s,
      branches:      s.branches?.map(b => ({ ...b, steps: this.deleteStepFromTree(b.steps, id) })),
      parallelPaths: s.parallelPaths?.map(p => this.deleteStepFromTree(p, id)),
      loopBody:      s.loopBody ? this.deleteStepFromTree(s.loopBody, id) : undefined,
      subSteps:      s.subSteps ? this.deleteStepFromTree(s.subSteps, id) : undefined,
    }));
  }

  private flattenSteps(steps: ProcessStep[]): ProcessStep[] {
    const result: ProcessStep[] = [];
    for (const s of steps) {
      if (s.kind !== 'gateway') result.push(s);
      for (const b of s.branches ?? []) result.push(...this.flattenSteps(b.steps));
      for (const p of s.parallelPaths ?? []) result.push(...this.flattenSteps(p));
      if (s.loopBody) result.push(...this.flattenSteps(s.loopBody));
      if (s.subSteps) result.push(...this.flattenSteps(s.subSteps));
    }
    return result;
  }

  private makeBlankStep(nodeType?: string): ProcessStep {
    const isGateway = nodeType === 'decision' || nodeType === 'parallel' || nodeType === 'loop';
    return {
      id: crypto.randomUUID(),
      number: 'NEU',
      title: nodeType === 'decision'   ? 'Entscheidung'
           : nodeType === 'parallel'   ? 'Parallele Ausführung'
           : nodeType === 'loop'       ? 'Schleife'
           : nodeType === 'activity'   ? 'Neue Aktivität'
           : nodeType === 'subprocess' ? 'Neuer Sub-Prozess'
           : 'Neue Aufgabe',
      status: 'pending',
      kind: isGateway ? 'gateway' : 'step',
      gatewayType: isGateway ? (nodeType as GatewayType) : undefined,
      stepType: !isGateway ? (nodeType === 'activity' ? 'activity' : nodeType === 'subprocess' ? 'subprocess' : 'task') : undefined,
      responsible: '', category: 'Allgemein',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
      branches: nodeType === 'decision' ? [
        { id: crypto.randomUUID(), label: 'Ja',   condition: '', steps: [] },
        { id: crypto.randomUUID(), label: 'Nein', condition: '', steps: [] },
      ] : undefined,
      parallelPaths: nodeType === 'parallel' ? [
        [{ id: crypto.randomUUID(), number: 'NEU', title: 'Neuer Schritt', status: 'pending', responsible: '', category: 'Allgemein', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: crypto.randomUUID(), number: 'NEU', title: 'Neuer Schritt', status: 'pending', responsible: '', category: 'Allgemein', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
      ] : undefined,
      parallelPathLabels: nodeType === 'parallel' ? ['Pfad 1', 'Pfad 2'] : undefined,
      loopBody:      nodeType === 'loop' ? [] : undefined,
      loopCondition: nodeType === 'loop' ? '' : undefined,
    };
  }

  insertStepAfter(afterId: string) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    const idx = p.steps.findIndex((s) => s.id === afterId);
    if (idx === -1) return;
    const newStep: ProcessStep = {
      id: crypto.randomUUID(),
      number: 'NEU',
      title: 'Neue Aufgabe',
      status: 'pending',
      kind: 'step',
      stepType: 'task',
      responsible: '',
      category: p.steps[0]?.category || 'Allgemein',
      contextLinks: [],
      tasks: [],
      inputs: [],
      actions: [],
      completionCriteria: [],
      conditionals: [],
    };
    p.steps.splice(idx + 1, 0, newStep);
    this.updateProcess(p);
    this.selectedStepId.set(newStep.id);
  }

  insertStepAt(index: number, nodeType?: string) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    const isGateway = nodeType === 'decision' || nodeType === 'parallel' || nodeType === 'loop';
    const newStep: ProcessStep = {
      id: crypto.randomUUID(),
      number: 'NEU',
      title: nodeType === 'decision' ? 'Entscheidung' : nodeType === 'parallel' ? 'Parallele Ausführung' : nodeType === 'loop' ? 'Schleife' : nodeType === 'subprocess' ? 'Neuer Sub-Prozess' : nodeType === 'activity' ? 'Neue Aktivität' : 'Neue Aufgabe',
      status: 'pending',
      kind: isGateway ? 'gateway' : 'step',
      gatewayType: isGateway ? (nodeType as GatewayType) : undefined,
      stepType: !isGateway ? (nodeType === 'subprocess' ? 'subprocess' : nodeType === 'activity' ? 'activity' : 'task') : undefined,
      responsible: '',
      category: p.steps[0]?.category || 'Allgemein',
      contextLinks: [],
      tasks: [],
      inputs: [],
      actions: [],
      completionCriteria: [],
      conditionals: [],
      // Initialize gateway containers
      branches: nodeType === 'decision' ? [
        { id: crypto.randomUUID(), label: 'Ja',   condition: '', steps: [] },
        { id: crypto.randomUUID(), label: 'Nein', condition: '', steps: [] },
      ] : undefined,
      parallelPaths: nodeType === 'parallel' ? [
        [{ id: crypto.randomUUID(), number: 'NEU', title: 'Neuer Schritt', status: 'pending', responsible: '', category: 'Allgemein', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: crypto.randomUUID(), number: 'NEU', title: 'Neuer Schritt', status: 'pending', responsible: '', category: 'Allgemein', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
      ] : undefined,
      parallelPathLabels: nodeType === 'parallel' ? ['Pfad 1', 'Pfad 2'] : undefined,
      loopBody:      nodeType === 'loop' ? [] : undefined,
      loopCondition: nodeType === 'loop' ? '' : undefined,
    };
    p.steps.splice(index, 0, newStep);
    this.updateProcess(p);
    this.selectedStepId.set(newStep.id);
  }

  moveStep(fromIndex: number, toIndex: number) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    const [moved] = p.steps.splice(fromIndex, 1);
    const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
    p.steps.splice(adjustedTo, 0, moved);
    this.updateProcess(p);
  }

  replaceAllSteps(newSteps: ProcessStep[]) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    p.steps = newSteps;
    this.updateProcess(p);
    this.selectedStepId.set(null);
  }

  deleteStep(stepId: string) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    p.steps = this.deleteStepFromTree(p.steps, stepId);
    this.updateProcess(p);
    if (this.selectedStepId() === stepId) {
      this.selectedStepId.set(null);
    }
  }

  updateStep(updated: ProcessStep) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    p.steps = this.updateStepInTree(p.steps, updated);
    this.updateProcess(p);
  }

  addTaskToStep(stepId: string, title: string, assignee: string) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.tasks.push({ id: crypto.randomUUID(), title, assignee, status: 'open' });
    this.updateStep(updated);
  }

  removeTaskFromStep(stepId: string, taskId: string) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.tasks = updated.tasks.filter((t) => t.id !== taskId);
    this.updateStep(updated);
  }

  addCriterionToStep(stepId: string, description: string, suggestedNextStep?: string) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.completionCriteria.push({
      id: crypto.randomUUID(),
      description,
      met: false,
      suggestedNextStep,
    });
    this.updateStep(updated);
  }

  removeCriterionFromStep(stepId: string, criterionId: string) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.completionCriteria = updated.completionCriteria.filter((c) => c.id !== criterionId);
    this.updateStep(updated);
  }

  toggleTaskStatus(stepId: string, taskId: string) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step || step.status === 'completed') return;
    const updated = structuredClone(step);
    const task = updated.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const cycle: Record<string, 'open' | 'in-progress' | 'done'> = {
      open: 'in-progress',
      'in-progress': 'done',
      done: 'open',
    };
    task.status = cycle[task.status];
    if (updated.status === 'pending' && updated.tasks.some((t) => t.status !== 'open')) {
      updated.status = 'in-progress';
    }
    this.updateStep(updated);
  }

  toggleCriterionMet(stepId: string, criterionId: string) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step || step.status === 'completed') return;
    const updated = structuredClone(step);
    const c = updated.completionCriteria.find((x) => x.id === criterionId);
    if (!c) return;
    c.met = !c.met;
    this.updateStep(updated);
  }

  canCompleteStep(stepId: string): boolean {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step || step.status !== 'in-progress') return false;
    // Activities are automated — tasks/criteria sections are hidden in UI, so skip the check
    if (step.stepType === 'activity') return true;
    const allCriteriaMet = step.completionCriteria.length === 0 || step.completionCriteria.every((c) => c.met);
    const allTasksDone = step.tasks.length === 0 || step.tasks.every((t) => t.status === 'done');
    return allCriteriaMet && allTasksDone;
  }

  completeStep(stepId: string) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    const step = this.findStepInTree(p.steps, stepId);
    if (!step) return;
    step.status = 'completed';
    step.completedDate = new Date().toLocaleDateString('de-CH');
    // Advance next top-level step (best-effort for top-level spine)
    const idx = p.steps.findIndex((s) => s.id === stepId);
    if (idx !== -1 && idx + 1 < p.steps.length && p.steps[idx + 1].status === 'pending') {
      p.steps[idx + 1].status = 'in-progress';
    }
    p.steps = this.updateStepInTree(p.steps, step);
    // Write audit event if this is an instance
    if (p.kind === 'instance') {
      if (!p.events) p.events = [];
      p.events.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'step_completed',
        description: `Schritt «${step.title}» abgeschlossen`,
        actor: 'Sachbearbeiter:in',
        stepId: step.id,
        stepTitle: step.title,
      });
    }
    this.updateProcess(p);
    if (idx !== -1 && idx + 1 < p.steps.length) {
      this.selectedStepId.set(p.steps[idx + 1].id);
    }
  }

  canInsertAfter(stepId: string): boolean {
    const steps = this.steps();
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx === -1) return false;
    const inProgressIdx = steps.findIndex((s) => s.status === 'in-progress');
    return inProgressIdx !== -1 && idx >= inProgressIdx;
  }

  updateStepField(stepId: string, field: Partial<ProcessStep>) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return;
    if (this.activeProcess()?.kind === 'instance' && step.status === 'completed') return;
    const updated = { ...structuredClone(step), ...field };
    this.updateStep(updated);
  }

  getNextStepSuggestions(stepId: string): string[] {
    const steps = this.steps();
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx === -1) return [];
    return steps.filter((_, i) => i > idx).map((s) => s.title);
  }

  getCategories(): string[] {
    const cats = new Set(this.steps().map((s) => s.category));
    return ['Alle', ...cats];
  }

  addContextLinkToStep(stepId: string, link: ContextLink) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return;
    const updated = structuredClone(step);
    if (!updated.contextLinks.some((cl) => cl.contextId === link.contextId)) {
      updated.contextLinks.push(link);
      this.updateStep(updated);
    }
  }

  removeContextLinkFromStep(stepId: string, contextId: string) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.contextLinks = updated.contextLinks.filter((cl) => cl.contextId !== contextId);
    this.updateStep(updated);
  }

  // --- Insert steps into gateway containers ---

  insertStepIntoBranch(gatewayId: string, branchId: string, atIndex: number, nodeType?: string) {
    const proc = this.activeProcess(); if (!proc) return;
    const p = structuredClone(proc);
    const gw = this.findStepInTree(p.steps, gatewayId); if (!gw) return;
    const branch = gw.branches?.find(b => b.id === branchId); if (!branch) return;
    const newStep = this.makeBlankStep(nodeType);
    branch.steps.splice(Math.min(atIndex, branch.steps.length), 0, newStep);
    p.steps = this.updateStepInTree(p.steps, gw);
    this.updateProcess(p);
    this.selectedStepId.set(newStep.id);
  }

  insertStepIntoParallelPath(gatewayId: string, pathIndex: number, atIndex: number, nodeType?: string) {
    const proc = this.activeProcess(); if (!proc) return;
    const p = structuredClone(proc);
    const gw = this.findStepInTree(p.steps, gatewayId); if (!gw) return;
    if (!gw.parallelPaths || pathIndex >= gw.parallelPaths.length) return;
    const newStep = this.makeBlankStep(nodeType);
    gw.parallelPaths[pathIndex].splice(Math.min(atIndex, gw.parallelPaths[pathIndex].length), 0, newStep);
    p.steps = this.updateStepInTree(p.steps, gw);
    this.updateProcess(p);
    this.selectedStepId.set(newStep.id);
  }

  insertStepIntoLoopBody(gatewayId: string, atIndex: number, nodeType?: string) {
    const proc = this.activeProcess(); if (!proc) return;
    const p = structuredClone(proc);
    const gw = this.findStepInTree(p.steps, gatewayId); if (!gw) return;
    if (!gw.loopBody) gw.loopBody = [];
    const newStep = this.makeBlankStep(nodeType);
    gw.loopBody.splice(Math.min(atIndex, gw.loopBody.length), 0, newStep);
    p.steps = this.updateStepInTree(p.steps, gw);
    this.updateProcess(p);
    this.selectedStepId.set(newStep.id);
  }

  // --- Workflow Template / Instance methods ---

  /** Creates a new instance from a template. Returns the new instance id. */
  startWorkflow(templateId: string, params: { startedBy: string; title?: string }): string {
    const template = this._processes().find((p) => p.id === templateId);
    if (!template) return '';
    const instance: Process = structuredClone(template);
    instance.id = `inst-${templateId}-${crypto.randomUUID().slice(0, 8)}`;
    instance.title = params.title || template.title;
    instance.kind = 'instance';
    instance.templateId = templateId;
    instance.startedAt = new Date().toLocaleDateString('de-CH');
    instance.startedBy = params.startedBy;
    instance.instanceState = 'running';
    instance.events = [{
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'started',
      description: `Workflow «${instance.title}» gestartet von ${params.startedBy}`,
      actor: params.startedBy,
    }];
    // Reset all steps to a clean initial state — templates may have completed steps as demo data
    instance.steps = this.resetStepsForInstance(instance.steps);
    // Activate the first work step (kind='step'), not gateways
    const firstWorkStep = instance.steps.find((s) => s.kind !== 'gateway');
    if (firstWorkStep) firstWorkStep.status = 'in-progress';
    this._processes.update((ps) => [...ps, instance]);
    return instance.id;
  }

  /** Adds a newly imported or AI-generated process and opens it in a new tab. */
  addProcess(process: Process): void {
    this._processes.update((ps) => [...ps, process]);
    this.openTab('prozess', process.id);
  }

  /** Recursively resets all steps/tasks/criteria to their initial state for a fresh instance. */
  private resetStepsForInstance(steps: ProcessStep[]): ProcessStep[] {
    return steps.map((s) => ({
      ...s,
      status: 'pending' as const,
      completedDate: undefined,
      chosenBranchId: undefined,
      tasks: s.tasks?.map((t) => ({ ...t, status: 'open' as const, resultValue: undefined })) ?? [],
      completionCriteria: s.completionCriteria?.map((c) => ({ ...c, met: false })) ?? [],
      branches: s.branches?.map((b) => ({ ...b, steps: this.resetStepsForInstance(b.steps) })),
      parallelPaths: s.parallelPaths?.map((p) => this.resetStepsForInstance(p)),
      loopBody: s.loopBody ? this.resetStepsForInstance(s.loopBody) : undefined,
      subSteps: s.subSteps ? this.resetStepsForInstance(s.subSteps) : undefined,
    }));
  }

  /** Sets the chosen branch on a decision gateway and records an audit event. */
  chooseBranch(processId: string, gatewayStepId: string, branchId: string, actor: string) {
    const ps = structuredClone(this._processes());
    const proc = ps.find((p) => p.id === processId);
    if (!proc) return;
    const gw = this.findStepInTree(proc.steps, gatewayStepId);
    if (!gw || gw.gatewayType !== 'decision') return;
    const branch = gw.branches?.find((b) => b.id === branchId);
    if (!branch) return;
    gw.chosenBranchId = branchId;
    proc.steps = this.updateStepInTree(proc.steps, gw);
    if (proc.kind === 'instance') {
      if (!proc.events) proc.events = [];
      proc.events.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'branch_chosen',
        description: `Entscheidungspfad «${branch.label}» gewählt`,
        actor,
        stepId: gw.id,
        stepTitle: gw.title,
      });
    }
    this._processes.set(ps);
  }

  /** Sets a result value on a task and records an audit event. */
  setTaskResult(stepId: string, taskId: string, value: string) {
    const step = this.findStepInTree(this.activeProcess()?.steps ?? [], stepId);
    if (!step) return;
    const updated = structuredClone(step);
    const task = updated.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.resultValue = value;
    this.updateStep(updated);
    // Write event if instance
    const proc = this.activeProcess();
    if (proc?.kind === 'instance') {
      const ps = structuredClone(this._processes());
      const p = ps.find((x) => x.id === proc.id);
      if (p) {
        if (!p.events) p.events = [];
        p.events.unshift({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: 'task_added',
          description: `Aufgabe «${task.title}» — Ergebnis: ${value}`,
          actor: 'Sachbearbeiter:in',
          stepId: step.id,
          stepTitle: step.title,
        });
        this._processes.set(ps);
      }
    }
  }

  // --- Schnittstellen-Aktionen (ContactSync, Klapp) ---
  // Simulated: nothing leaves the browser. Runs are deterministic so a demo can be
  // repeated and the counters always match the underlying registration list.

  /** Timers for simulated interface runs, keyed by `${processId}:${actionId}`. */
  private syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** True if this interface action has a registered (simulatable) run. */
  isSyncAction(actionId: string): boolean {
    return actionId in SYNC_ACTIONS;
  }

  private patchSyncResult(processId: string, stepId: string, actionId: string, result: SyncRun): void {
    const ps = structuredClone(this._processes());
    const proc = ps.find((p) => p.id === processId);
    if (!proc) return;
    const step = this.findStepInTree(proc.steps, stepId);
    const action = step?.actions.find((a) => a.id === actionId);
    if (!action) return;
    action.syncResult = result;
    this._processes.set(ps);
  }

  /** Reads the current run off the active process (not off a stale clone). */
  private currentSyncResult(stepId: string, actionId: string): SyncRun | undefined {
    const proc = this.activeProcess();
    if (!proc) return undefined;
    const step = this.findStepInTree(proc.steps, stepId);
    return step?.actions.find((a) => a.id === actionId)?.syncResult;
  }

  /**
   * Re-runs an interface. A registration channel (Klapp) is polled, so the run is
   * NON-destructive: the per-child list survives and at most one further family is
   * reported as registered. Any other interface is simply rebuilt.
   */
  runSyncAction(stepId: string, actionId: string): void {
    const proc = this.activeProcess();
    if (!proc) return;
    const step = this.findStepInTree(proc.steps, stepId);
    const action = step?.actions.find((a) => a.id === actionId);
    if (!step || !action || action.type !== 'interface') return;
    const def = SYNC_ACTIONS[actionId];
    if (!def) return; // plain interface action, no simulated run configured

    const previous = action.syncResult;
    this.patchSyncResult(proc.id, stepId, actionId, {
      ...(previous ?? def.build()),
      status: 'running',
    });

    const procId = proc.id;
    const timerKey = `${procId}:${actionId}`;
    const existing = this.syncTimers.get(timerKey);
    if (existing) clearTimeout(existing);
    this.syncTimers.set(timerKey, setTimeout(() => {
      this.syncTimers.delete(timerKey);
      const next = previous?.registrations
        ? this.pollRegistrations(previous)
        : { ...def.build(), status: 'done' as const };
      this.patchSyncResult(procId, stepId, actionId, next);
      // A run does not only fill the panel: it writes its results into the step
      // and ticks off the tasks the machine actually did.
      const writes = [...(def.writesInputs ?? [])];
      if (next.registrations) {
        const angemeldet = next.registrations.filter((r) => r.status === 'angemeldet').length;
        writes.push({ label: 'Anmeldung abgeschlossen', value: `${angemeldet} von ${next.registrations.length}` });
      }
      this.applyActionEffects(procId, stepId, writes, def.completesTasks, undefined);
    }, 900));
  }

  /**
   * Writes the results of an automated action back onto the step: field values,
   * machine tasks done, documents present. Anything a person has to confirm stays
   * open on purpose, so a demo shows where the human decision sits.
   */
  private applyActionEffects(
    processId: string,
    stepId: string,
    writesInputs?: { label: string; value: string }[],
    completesTasks?: string[],
    uploadsDocuments?: string[],
  ): void {
    if (!writesInputs?.length && !completesTasks?.length && !uploadsDocuments?.length) return;
    const ps = structuredClone(this._processes());
    const proc = ps.find((p) => p.id === processId);
    if (!proc) return;
    const step = this.findStepInTree(proc.steps, stepId);
    if (!step) return;

    for (const w of writesInputs ?? []) {
      const input = step.inputs.find((i) => i.label === w.label);
      if (input) input.value = w.value;
    }
    for (const taskId of completesTasks ?? []) {
      const task = step.tasks.find((t) => t.id === taskId);
      if (task) task.status = 'done';
    }
    for (const label of uploadsDocuments ?? []) {
      const input = step.inputs.find((i) => i.label === label && i.type === 'document');
      if (input) input.uploaded = true;
    }
    this._processes.set(ps);
  }

  // --- Dokument-Aktionen: erzeugen eine echte Datei für Word bzw. Excel ---

  /** True if this action produces a downloadable file. */
  isDocumentAction(actionId: string): boolean {
    return actionId in DOCUMENT_ACTIONS;
  }

  /** Which document action produces this file, so an uploaded document can be reopened. */
  documentActionForFile(fileName: string): string | undefined {
    if (!fileName) return undefined;
    return Object.keys(DOCUMENT_ACTIONS).find((id) => DOCUMENT_ACTIONS[id].fileName === fileName);
  }

  /** Label for the button, so the user sees what will open. */
  documentActionLabel(actionId: string): string {
    const def = DOCUMENT_ACTIONS[actionId];
    if (!def) return 'Ausführen';
    return def.mime.startsWith('text/csv') ? 'In Excel öffnen' : 'In Word öffnen';
  }

  /**
   * Builds the file for a document action and applies its side effects.
   * Returns the payload; the actual download is triggered by the component,
   * because that is a DOM concern.
   */
  buildDocumentAction(stepId: string, actionId: string): { fileName: string; mime: string; content: string } | undefined {
    const proc = this.activeProcess();
    if (!proc) return undefined;
    const step = this.findStepInTree(proc.steps, stepId);
    const action = step?.actions.find((a) => a.id === actionId);
    const def = DOCUMENT_ACTIONS[actionId];
    if (!step || !action || !def) return undefined;

    // The reminder letter only goes to families whose registration is still open,
    // and it has to know the current Mahnstufe. Both live on the Klapp run.
    let content: string;
    if (actionId === 'sei-a6') {
      const klapp = this.findKlappRun(proc);
      const offen = (klapp?.registrations ?? []).filter((r) => r.status === 'offen').map((r) => r.name);
      content = erinnerungsbrief(offen, (klapp?.mahnstufe ?? 0) + 1);
    } else {
      content = def.build();
    }

    this.applyActionEffects(proc.id, stepId, undefined, def.completesTasks, def.uploadsDocuments);
    return { fileName: def.fileName, mime: def.mime, content };
  }

  /**
   * The reminder letters for the families whose registration is still open.
   *
   * Fachlich gehört diese Aktion in den Schleifenrumpf (Schritt 8005), dort ist
   * sie in der Instanzansicht aber nicht erreichbar: der Rumpf wird nur als
   * Struktur gezeichnet. Darum wird sie zusätzlich direkt aus dem Klapp-Panel
   * angeboten, wo auch der Mahnlauf sitzt.
   */
  buildReminderLetters(): { fileName: string; mime: string; content: string; empfaenger: number } | undefined {
    const proc = this.activeProcess();
    if (!proc) return undefined;
    const klapp = this.findKlappRun(proc);
    if (!klapp?.registrations) return undefined;
    const offen = klapp.registrations.filter((r) => r.status === 'offen').map((r) => r.name);
    if (!offen.length) return undefined;
    const def = DOCUMENT_ACTIONS['sei-a6'];
    return {
      fileName: def.fileName,
      mime: def.mime,
      content: erinnerungsbrief(offen, (klapp.mahnstufe ?? 0) + 1),
      empfaenger: offen.length,
    };
  }

  /** The Klapp registration run of this process, wherever its step sits. */
  private findKlappRun(proc: Process): SyncRun | undefined {
    for (const s of this.flattenSteps(proc.steps)) {
      const hit = s.actions?.find((a) => a.syncResult?.registrations?.length);
      if (hit) return hit.syncResult;
    }
    return undefined;
  }

  /** One poll of the Klapp registration channel: at most one more family registers. */
  private pollRegistrations(run: SyncRun): SyncRun {
    const regs: KlappRegistration[] = (run.registrations ?? []).map((r) => ({ ...r }));
    const next = regs.find((r) => r.status === 'offen');
    if (next) {
      next.status = 'angemeldet';
      next.registeredAt = SYNC_POLL_DATE;
    }
    const mahnstufe = run.mahnstufe ?? 0;
    const maxMahnstufe = run.maxMahnstufe ?? MAHNLAUF_RUECKLAUF.length;
    return {
      ...run,
      status: 'done',
      lastRun: SYNC_POLL_TIMESTAMP,
      registrations: regs,
      metrics: klappMetrics(regs, mahnstufe, maxMahnstufe),
      outcome: regs.some((r) => r.status === 'offen') ? 'warnung' : 'ok',
    };
  }

  /**
   * The loop body of the Schuleinschreibung: send the reminder letter to every family
   * whose registration is still open, then report back who responded. Bounded by
   * `maxMahnstufe`; after that the remaining cases need a phone call, not another letter.
   */
  runKlappMahnlauf(stepId: string, actionId: string): void {
    const proc = this.activeProcess();
    if (!proc) return;
    const run = this.currentSyncResult(stepId, actionId);
    if (!run?.registrations) return;
    const maxMahnstufe = run.maxMahnstufe ?? MAHNLAUF_RUECKLAUF.length;
    const mahnstufe = (run.mahnstufe ?? 0) + 1;
    if (mahnstufe > maxMahnstufe) return;

    const regs: KlappRegistration[] = run.registrations.map((r) => ({ ...r }));
    // The letter goes to everyone still open.
    regs.forEach((r) => {
      if (r.status === 'offen') r.reminders += 1;
    });
    // A deterministic share of them answers.
    const antworten = MAHNLAUF_RUECKLAUF[mahnstufe - 1] ?? 0;
    const datum = MAHNLAUF_DATUM[mahnstufe - 1] ?? SYNC_POLL_DATE;
    let done = 0;
    for (const r of regs) {
      if (done >= antworten) break;
      if (r.status === 'offen') {
        r.status = 'angemeldet';
        r.registeredAt = datum;
        done += 1;
      }
    }

    const offen = regs.filter((r) => r.status === 'offen').length;
    this.patchSyncResult(proc.id, stepId, actionId, {
      ...run,
      status: 'done',
      lastRun: `${datum} 08:00`,
      registrations: regs,
      mahnstufe,
      metrics: klappMetrics(regs, mahnstufe, maxMahnstufe),
      outcome: offen === 0 ? 'ok' : 'warnung',
      warnings: offen === 0
        ? ['Alle Anmeldungen liegen vor. Der Jahrgang kann für die Klassenbildung freigegeben werden.']
        : mahnstufe >= maxMahnstufe
          ? [`Mahnstufe ${maxMahnstufe} erreicht, ${offen === 1 ? 'eine Anmeldung ist' : `${offen} Anmeldungen sind`} weiterhin offen. `
             + `Ein weiterer Brief ist nicht vorgesehen, ${offen === 1 ? 'dieser Fall ist' : 'diese Fälle sind'} telefonisch nachzufassen.`]
          : [`${offen === 1 ? 'Eine Anmeldung ist' : `${offen} Anmeldungen sind`} offen. `
             + `Nächster Erinnerungsbrief möglich, Mahnstufe ${mahnstufe} von ${maxMahnstufe}.`],
    });

    // Keep the step field in sync with the panel, so both never disagree.
    this.applyActionEffects(proc.id, stepId, [
      { label: 'Anmeldung abgeschlossen', value: `${regs.length - offen} von ${regs.length}` },
    ]);
  }

  // --- KI+ AI action (background assistant) ---

  /** Timers for simulated background KI+ runs, keyed by `${processId}:${actionId}`. */
  private aiTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private patchActionResult(processId: string, stepId: string, actionId: string, result: AiAssessment): void {
    const ps = structuredClone(this._processes());
    const proc = ps.find((p) => p.id === processId);
    if (!proc) return;
    const step = this.findStepInTree(proc.steps, stepId);
    const action = step?.actions.find((a) => a.id === actionId);
    if (!action) return;
    action.aiResult = result;
    this._processes.set(ps);
  }

  /** True if this AI action is a registered KI+ assessment (recommendation + decision),
   *  as opposed to a plain document-/text-generating AI action. */
  isAssessmentAction(actionId: string): boolean {
    return actionId in ASSESSMENT_ACTIONS;
  }

  /** The decision field (select-input label) the user fills after this assessment. */
  assessmentDecisionLabel(actionId: string): string | undefined {
    return ASSESSMENT_ACTIONS[actionId]?.decisionLabel;
  }

  /** Triggers the configured KI+ assistant for an assessment action. Runs "in the
   *  background" (short delay) and writes the resulting assessment back onto the action. */
  runAiAction(stepId: string, actionId: string): void {
    const proc = this.activeProcess();
    if (!proc || proc.kind !== 'instance') return;
    const step = this.findStepInTree(proc.steps, stepId);
    const action = step?.actions.find((a) => a.id === actionId);
    if (!step || !action || action.type !== 'ai' || step.status !== 'in-progress') return;
    const config = ASSESSMENT_ACTIONS[actionId];
    if (!config) return; // not an assessment action

    const assistantName = config.assistantName;
    this.patchActionResult(proc.id, stepId, actionId, {
      status: 'running', assistantName, recommendedLevel: '', summary: '', detail: '',
    });

    const procId = proc.id;
    const timerKey = `${procId}:${actionId}`;
    const existing = this.aiTimers.get(timerKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.aiTimers.delete(timerKey);
      const current = this._processes().find((p) => p.id === procId);
      if (!current) return;
      const a = config.generate(current);
      this.patchActionResult(procId, stepId, actionId, {
        status: 'done', assistantName,
        recommendedLevel: a.recommendedLevel, summary: a.summary, detail: a.detail,
        generatedAt: new Date().toISOString(),
      });
      const ps = structuredClone(this._processes());
      const p = ps.find((x) => x.id === procId);
      if (p) {
        if (!p.events) p.events = [];
        p.events.unshift({
          id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'note_added',
          description: `${assistantName} ausgeführt, Empfehlung: ${a.recommendedLevel}`,
          actor: assistantName, stepId, stepTitle: step.title,
        });
        this._processes.set(ps);
      }
    }, 1500);
    this.aiTimers.set(timerKey, timer);
  }

  /** Persists an edit to the KI+ summary text (the inline editable field). */
  updateAiSummary(stepId: string, actionId: string, text: string): void {
    const proc = this.activeProcess();
    if (!proc) return;
    const ps = structuredClone(this._processes());
    const p = ps.find((x) => x.id === proc.id);
    const step = p ? this.findStepInTree(p.steps, stepId) : null;
    const action = step?.actions.find((a) => a.id === actionId);
    if (action?.aiResult) {
      action.aiResult.summary = text;
      this._processes.set(ps);
    }
  }

  /** The user sets the definitive decision (the value the KI+ only recommended).
   *  This closes the assessment step and starts the next step. */
  setDecisionAndAdvance(stepId: string, label: string, value: string): void {
    const proc = this.activeProcess();
    if (!proc) return;
    const ps = structuredClone(this._processes());
    const p = ps.find((x) => x.id === proc.id);
    if (!p) return;
    const step = this.findStepInTree(p.steps, stepId);
    if (!step || step.status !== 'in-progress') return;

    const decisionInput = step.inputs.find((i) => i.label === label);
    if (decisionInput) decisionInput.value = value;
    step.status = 'completed';
    step.completedDate = new Date().toLocaleDateString('de-CH');
    step.completionCriteria = step.completionCriteria.map((c) => ({ ...c, met: true }));

    // Activate the next top-level step.
    const idx = p.steps.findIndex((s) => s.id === stepId);
    const next = idx !== -1 ? p.steps[idx + 1] : undefined;
    if (next && next.status === 'pending') {
      next.status = 'in-progress';
      // If the next step fans out in parallel, kick off each path.
      next.parallelPaths?.forEach((path) => {
        const first = path[0];
        if (first && first.status === 'pending') first.status = 'in-progress';
      });
    }

    if (!p.events) p.events = [];
    if (next) {
      p.events.unshift({
        id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'note_added',
        description: `Schritt «${next.title}» gestartet`, actor: 'Sachbearbeiter:in',
        stepId: next.id, stepTitle: next.title,
      });
    }
    p.events.unshift({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'step_completed',
      description: `${label} «${value}» gesetzt, Schritt «${step.title}» abgeschlossen`,
      actor: 'Sachbearbeiter:in', stepId: step.id, stepTitle: step.title,
    });
    this._processes.set(ps);
    if (next) this.selectedStepId.set(next.id);
  }

  // --- Serviceanfrage / Portal methods ---

  addPortalMessage(text: string, isRequest: boolean) {
    const ds = structuredClone(this._dossiers());
    const d = ds.find((x) => x.id === this.dossier$().id)!;
    if (!d.serviceRequest) return;
    const msg: PortalMessage = {
      id: crypto.randomUUID(),
      date: new Date().toLocaleDateString('de-CH') + ' ' + new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }),
      author: 'Sachbearbeiter:in',
      direction: 'to-citizen',
      text,
      read: true,
    };
    d.serviceRequest.messages.push(msg);
    if (isRequest) {
      d.serviceRequest.status = 'rueckfrage';
      d.serviceRequest.portalStatus = 'Rückfrage offen — bitte prüfen Sie Ihr Portal';
    }
    this._dossiers.set(ds);
  }

  addPortalDocument(name: string, description: string | undefined, direction: 'to-citizen' | 'from-citizen') {
    const ds = structuredClone(this._dossiers());
    const d = ds.find((x) => x.id === this.dossier$().id)!;
    if (!d.serviceRequest) return;
    const doc: PortalDocument = {
      id: crypto.randomUUID(),
      name,
      fileName: name.toLowerCase().replace(/\s+/g, '_') + '.pdf',
      direction,
      uploadDate: new Date().toLocaleDateString('de-CH'),
      description,
    };
    d.serviceRequest.portalDocuments.push(doc);
    this._dossiers.set(ds);
  }
}

// ============================================================
// CONTEXT OBJECTS
// ============================================================

const CTX_BAUGESUCH: ContextObject = { id: '1', type: 'geschaeft', number: '2026-0009', title: 'Umbau Gebäude (Heizungsänderung und Dachstockausbau)' };
const CTX_AKTENEINSICHT: ContextObject = { id: '2', type: 'geschaeft', number: '2026-0042', title: 'Akteneinsicht Verkehrsplanung Dorfzentrum' };
const CTX_EINBUERGERUNG: ContextObject = { id: '3', type: 'geschaeft', number: '2026-0018', title: 'Einbürgerungsgesuch Rossi Marco' };
const CTX_GEMEINDERAT: ContextObject = { id: '4', type: 'geschaeft', number: '2026-0055', title: 'Anfrage Tempo-30-Zone Schulweg Birkenstrasse' };
const CTX_VERANSTALTUNG: ContextObject = { id: '5', type: 'geschaeft', number: '2026-0071', title: 'Dorffest Sommer 2027' };
const CTX_KESB: ContextObject = { id: '6', type: 'geschaeft', number: '2026-KES-0012', title: 'KESB-Gefahrenmeldung Fam. Schneider' };
const CTX_SONDERPAED: ContextObject = { id: '8', type: 'geschaeft', number: '2026-0094', title: 'Sonderpädagogische Massnahme Bucher Tim (3. Klasse)' };
const CTX_SCHULSTART: ContextObject = { id: '9', type: 'geschaeft', number: '2026-0101', title: 'Schulstart 2027/28: Einschreibung Kindergarten' };

// Sitzungen — steps from different processes can link here
const CTX_SITZUNG_GR: ContextObject = { id: 'sitz-gr-1', type: 'sitzung', number: 'GR-2026-10', title: 'Gemeinderatssitzung 15.10.2026', icon: 'event' };
const CTX_SITZUNG_GV: ContextObject = { id: 'sitz-gv-1', type: 'sitzung', number: 'GV-2027-06', title: 'Gemeindeversammlung 18.06.2027', icon: 'event' };
const CTX_SITZUNG_KESB: ContextObject = { id: 'sitz-kesb-1', type: 'sitzung', number: 'KESB-2026-16', title: 'KESB-Sitzung 17.11.2026', icon: 'event' };
const CTX_SITZUNG_BK: ContextObject = { id: 'sitz-bk-1', type: 'sitzung', number: 'BK-2026-05', title: 'Bildungskommission 21.10.2026', icon: 'event' };

const ALL_CONTEXT_OBJECTS: ContextObject[] = [
  CTX_BAUGESUCH, CTX_AKTENEINSICHT, CTX_EINBUERGERUNG, CTX_GEMEINDERAT, CTX_VERANSTALTUNG, CTX_KESB,
  CTX_SONDERPAED, CTX_SCHULSTART,
  CTX_SITZUNG_GR, CTX_SITZUNG_GV, CTX_SITZUNG_KESB, CTX_SITZUNG_BK,
];

// ============================================================
// PROCESSES — standalone, with contextLinks per step
// ============================================================

// Helper: shorthand for context links
const G = (id: string): ContextLink => ({ contextId: id, contextType: 'geschaeft' });
const S = (id: string): ContextLink => ({ contextId: id, contextType: 'sitzung' });

const PROCESS_BAUGESUCH: Process = {
  id: 'proc-bau',
  title: 'Baugesuchsverfahren',
  processOwner: { name: 'Oberholzer Martin', role: 'Bauverwalter', email: 'm.oberholzer@gemeinde.ch' },
  steps: [
    {
      id: '1', number: '6701', title: 'Baugesuch beantragt', status: 'completed', completedDate: '21.06.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Müller Sarah, Gesuchsteller', category: 'Baugesuch',
      contextLinks: [G('1')],
      tasks: [
        { id: 't1', title: 'Gesuchsformular ausfüllen', assignee: 'Müller Sarah', status: 'done' },
        { id: 't2', title: 'Pläne einreichen', assignee: 'Müller Sarah', status: 'done' },
        { id: 't3', title: 'Gebühr bezahlen', assignee: 'Müller Sarah', status: 'done' },
      ],
      inputs: [
        { id: 'i1', type: 'field', label: 'Gesuchsteller', value: 'Müller Sarah', required: true, fieldType: 'text', thematicGroup: 'Beteiligte' },
        { id: 'i2', type: 'field', label: 'Parzelle', value: '1234', required: true, fieldType: 'text', thematicGroup: 'Grundstück' },
        { id: 'i3', type: 'document', label: 'Baugesuchsformular', required: true, documentName: 'Baugesuch_2026.pdf', uploaded: true },
        { id: 'i4', type: 'document', label: 'Situationsplan', required: true, documentName: 'Situationsplan.pdf', uploaded: true },
      ],
      actions: [{ id: 'a1', label: 'Eingangsbestätigung senden', type: 'standard', description: 'Automatische E-Mail an Gesuchsteller' }],
      completionCriteria: [
        { id: 'c1', description: 'Alle Pflichtdokumente eingereicht', met: true },
        { id: 'c2', description: 'Gebühr bezahlt', met: true },
      ],
      conditionals: [],
    },
    {
      id: '2', number: '6811', title: 'Vollständigkeitsprüfung', status: 'completed', completedDate: '28.06.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Baugesuch',
      contextLinks: [G('1')],
      tasks: [
        { id: 't4', title: 'Unterlagen auf Vollständigkeit prüfen', assignee: 'Oberholzer Martin', status: 'done' },
        { id: 't5', title: 'Formelle Prüfung', assignee: 'Oberholzer Martin', status: 'done' },
      ],
      inputs: [
        { id: 'i5', type: 'field', label: 'Prüfresultat', value: 'Vollständig', required: true, fieldType: 'select', options: ['Vollständig', 'Unvollständig', 'Nachforderung'], thematicGroup: 'Prüfung' },
      ],
      actions: [{ id: 'a2', label: 'Nachforderung erstellen', type: 'script', description: 'Erstellt Nachforderungsschreiben bei unvollständigen Unterlagen' }],
      completionCriteria: [{ id: 'c3', description: 'Alle Unterlagen vollständig', met: true }],
      conditionals: [{ id: 'co1', condition: 'Prüfresultat == "Unvollständig"', thenAction: 'Schritt "Nachforderung" einfügen', elseAction: 'Weiter zu Öffentliche Auflage' }],
    },
    {
      id: '3', number: '6855', title: 'Öffentliche Auflage', status: 'completed', completedDate: '15.07.2026',
      kind: 'step', stepType: 'subprocess',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bewilligungsverfahren',
      subSteps: [
        { id: '3a', number: '6855.1', title: 'Publikation im Amtsblatt', status: 'completed', completedDate: '15.07.2026', responsible: 'Oberholzer Martin', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: '3b', number: '6855.2', title: 'Auflage durchführen (30 Tage)', status: 'completed', completedDate: '14.08.2026', responsible: 'Oberholzer Martin', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: '3c', number: '6855.3', title: 'Einsprachen sammeln & prüfen', status: 'completed', completedDate: '15.08.2026', responsible: 'Oberholzer Martin', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
      ],
      contextLinks: [G('1')],
      tasks: [
        { id: 't6', title: 'Publikation im Amtsblatt', assignee: 'Oberholzer Martin', status: 'done' },
        { id: 't7', title: 'Auflage durchführen (30 Tage)', assignee: 'Oberholzer Martin', status: 'done' },
        { id: 't8', title: 'Einsprachen sammeln', assignee: 'Oberholzer Martin', status: 'done' },
      ],
      inputs: [
        { id: 'i6', type: 'field', label: 'Publikationsdatum', value: '15.07.2026', required: true, fieldType: 'date', thematicGroup: 'Verfahren' },
        { id: 'i7', type: 'field', label: 'Anzahl Einsprachen', value: '0', required: false, fieldType: 'number', thematicGroup: 'Verfahren' },
      ],
      actions: [],
      completionCriteria: [{ id: 'c4', description: 'Auflagefrist abgelaufen', met: true }],
      conditionals: [{ id: 'co2', condition: 'Anzahl Einsprachen > 0', thenAction: 'Schritt "Einspracheverfahren" einfügen' }],
    },
    {
      id: '4', number: '6900', title: 'Fachberichte einholen', status: 'completed', completedDate: '20.08.2026',
      kind: 'gateway', gatewayType: 'parallel',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bewilligungsverfahren',
      parallelPaths: [
        [{ id: '4a', number: '6900.1', title: 'Brandschutz-Bericht', status: 'completed', completedDate: '10.08.2026', responsible: 'Feuerpolizei', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: '4b', number: '6900.2', title: 'Statik-Bericht', status: 'completed', completedDate: '15.08.2026', responsible: 'Muster Ingenieure AG', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: '4c', number: '6900.3', title: 'Energienachweis', status: 'completed', completedDate: '18.08.2026', responsible: 'Energieberatung', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
      ],
      contextLinks: [G('1')],
      tasks: [
        { id: 't9', title: 'Brandschutz-Bericht anfordern', assignee: 'Oberholzer Martin', status: 'done' },
        { id: 't10', title: 'Statik-Bericht anfordern', assignee: 'Oberholzer Martin', status: 'done' },
        { id: 't11', title: 'Energienachweis prüfen', assignee: 'Oberholzer Martin', status: 'done' },
      ],
      inputs: [
        { id: 'i8', type: 'document', label: 'Brandschutzbericht', required: true, documentName: 'Brandschutz.pdf', uploaded: true },
        { id: 'i9', type: 'document', label: 'Statikbericht', required: true, documentName: 'Statik.pdf', uploaded: true },
        { id: 'i10', type: 'document', label: 'Energienachweis', required: true, documentName: 'Energie.pdf', uploaded: true },
      ],
      actions: [
        { id: 'a3', label: 'Fachstellen benachrichtigen', type: 'standard', description: 'E-Mail an alle involvierten Fachstellen' },
        { id: 'a3b', label: 'Fachberichte zusammenfassen', type: 'ai', description: 'Erstellt eine KI-gestützte Zusammenfassung aller eingereichten Fachberichte' },
      ],
      completionCriteria: [
        { id: 'c5', description: 'Alle Fachberichte eingetroffen', met: true },
        { id: 'c6', description: 'Keine offenen Auflagen', met: true },
      ],
      conditionals: [],
    },
    {
      id: '5', number: '6781', title: 'Baubewilligung prüfen', status: 'in-progress', dueDate: '30.09.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bewilligungsverfahren',
      contextLinks: [G('1')],
      tasks: [
        { id: 't12', title: 'Bewilligungsentscheid verfassen', assignee: 'Oberholzer Martin', status: 'in-progress' },
        { id: 't13', title: 'Auflagen formulieren', assignee: 'Oberholzer Martin', status: 'open' },
        { id: 't14', title: 'Bewilligung unterzeichnen', assignee: 'Gemeinderat', status: 'open' },
      ],
      inputs: [
        { id: 'i11', type: 'field', label: 'Entscheid', required: true, fieldType: 'select', options: ['Bewilligt', 'Bewilligt mit Auflagen', 'Abgelehnt'], thematicGroup: 'Entscheid' },
        { id: 'i12', type: 'field', label: 'Auflagen', required: false, fieldType: 'textarea', thematicGroup: 'Entscheid' },
      ],
      actions: [
        { id: 'a4', label: 'Bewilligung generieren', type: 'script', description: 'Generiert das Bewilligungsdokument als PDF' },
        { id: 'a5', label: 'Gebührenrechnung erstellen', type: 'standard', description: 'Erstellt Rechnung im Finanzsystem' },
        { id: 'a5b', label: 'Entscheid-Zusammenfassung erstellen', type: 'ai', description: 'Erstellt eine KI-gestützte Zusammenfassung des Entscheids für den Gesuchsteller' },
      ],
      completionCriteria: [
        { id: 'c7', description: 'Entscheid gefällt', met: false },
        { id: 'c8', description: 'Dokument unterzeichnet', met: false },
      ],
      conditionals: [{ id: 'co3', condition: 'Entscheid == "Abgelehnt"', thenAction: 'Prozess beenden, Ablehnungsschreiben senden' }],
    },
    {
      id: '5-gw', number: '', title: 'Entscheid Baubewilligung', status: 'pending',
      kind: 'gateway', gatewayType: 'decision',
      responsible: '', category: 'Bewilligungsverfahren',
      branches: [
        { id: 'b5-1', label: 'Bewilligt', condition: 'Entscheid == "Bewilligt"', steps: [], isDefault: true },
        { id: 'b5-2', label: 'Mit Auflagen', condition: 'Entscheid == "Bewilligt mit Auflagen"', steps: [] },
        { id: 'b5-3', label: 'Abgelehnt', condition: 'Entscheid == "Abgelehnt"', steps: [] },
      ],
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: '6', number: '7010', title: 'Bewilligung versenden', status: 'pending', dueDate: '30.09.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bewilligungsverfahren',
      contextLinks: [G('1')],
      tasks: [
        { id: 't15', title: 'Bewilligung per Post versenden', assignee: 'Sekretariat', status: 'open' },
        { id: 't16', title: 'Rechtsmittelbelehrung beilegen', assignee: 'Sekretariat', status: 'open' },
      ],
      inputs: [],
      actions: [{ id: 'a6', label: 'Versandbestätigung', type: 'standard', description: 'Interne Bestätigung nach Versand' }],
      completionCriteria: [{ id: 'c9', description: 'Bewilligung versandt', met: false }],
      conditionals: [],
    },
    {
      id: '7', number: '7100', title: 'Baubeginn melden', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Müller Sarah, Gesuchsteller', category: 'Bauetappe',
      contextLinks: [G('1')],
      tasks: [{ id: 't17', title: 'Baubeginn-Meldung einreichen', assignee: 'Müller Sarah', status: 'open' }],
      inputs: [
        { id: 'i13', type: 'field', label: 'Geplanter Baubeginn', required: true, fieldType: 'date', thematicGroup: 'Bauausführung' },
        { id: 'i14', type: 'field', label: 'Bauleiter', required: true, fieldType: 'text', thematicGroup: 'Beteiligte' },
      ],
      actions: [],
      completionCriteria: [{ id: 'c10', description: 'Baubeginn-Meldung eingegangen', met: false }],
      conditionals: [],
    },
    {
      id: '8', number: '7200', title: 'Rohbaukontrolle', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bauetappe',
      contextLinks: [G('1')],
      tasks: [
        { id: 't18', title: 'Rohbaukontrolle durchführen', assignee: 'Oberholzer Martin', status: 'open' },
        { id: 't19', title: 'Kontrollbericht erstellen', assignee: 'Oberholzer Martin', status: 'open' },
      ],
      inputs: [
        { id: 'i15', type: 'document', label: 'Kontrollbericht', required: true, uploaded: false },
        { id: 'i16', type: 'field', label: 'Resultat', required: true, fieldType: 'select', options: ['In Ordnung', 'Mängel festgestellt'], thematicGroup: 'Prüfung' },
      ],
      actions: [],
      completionCriteria: [{ id: 'c11', description: 'Kontrolle durchgeführt', met: false }],
      conditionals: [{ id: 'co4', condition: 'Resultat == "Mängel festgestellt"', thenAction: 'Schritt "Mängelbehebung" einfügen' }],
    },
    {
      id: '8-gw', number: '', title: 'Mängel?', status: 'pending',
      kind: 'gateway', gatewayType: 'loop',
      loopCondition: 'Resultat == "Mängel festgestellt"',
      loopBody: [],
      responsible: '', category: 'Bauetappe',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: '9', number: '7300', title: 'Schlusskontrolle', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bauetappe',
      contextLinks: [G('1')],
      tasks: [{ id: 't20', title: 'Schlusskontrolle vor Ort', assignee: 'Oberholzer Martin', status: 'open' }],
      inputs: [{ id: 'i17', type: 'document', label: 'Schluss-Kontrollbericht', required: true, uploaded: false }],
      actions: [],
      completionCriteria: [{ id: 'c12', description: 'Schlusskontrolle bestanden', met: false }],
      conditionals: [],
    },
    {
      id: '10', number: '7400', title: 'Bezugsbewilligung ausstellen', status: 'pending',
      kind: 'step', stepType: 'activity', activityKind: 'object-creation',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bauetappe',
      contextLinks: [G('1')],
      tasks: [{ id: 't21', title: 'Bezugsbewilligung ausstellen', assignee: 'Oberholzer Martin', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'c13', description: 'Bezugsbewilligung erteilt', met: false }],
      conditionals: [],
    },
    {
      id: '11', number: '7500', title: 'Verfahren abgeschlossen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bauetappe',
      contextLinks: [G('1')],
      tasks: [{ id: 't22', title: 'Dossier archivieren', assignee: 'Sekretariat', status: 'open' }],
      inputs: [],
      actions: [{ id: 'a7', label: 'Archivierung', type: 'script', description: 'Verschiebt Dossier ins Archiv' }],
      completionCriteria: [{ id: 'c14', description: 'Alle Unterlagen archiviert', met: false }],
      conditionals: [],
    },
  ],
};

const PROCESS_AKTENEINSICHT: Process = {
  id: 'proc-ae',
  title: 'Akteneinsichtsverfahren',
  processOwner: { name: 'Weber Claudia', role: 'Kanzlei', email: 'c.weber@gemeinde.ch' },
  steps: [
    {
      id: 'ae-1', number: '1001', title: 'Antrag eingegangen', status: 'completed', completedDate: '10.08.2026',
      kind: 'step', stepType: 'activity', activityKind: 'notification',
      responsible: 'System (Portal)', category: 'Akteneinsicht',
      contextLinks: [G('2')],
      tasks: [
        { id: 'ae-t1', title: 'Portal-Formular validieren', assignee: 'System', status: 'done' },
        { id: 'ae-t2', title: 'Eingangsbestätigung senden', assignee: 'System', status: 'done' },
      ],
      inputs: [
        { id: 'ae-i1', type: 'field', label: 'Antragsteller', value: 'Keller Thomas', required: true, fieldType: 'text', thematicGroup: 'Antragsteller' },
        { id: 'ae-i2', type: 'field', label: 'Betroffenes Dossier', value: 'Verkehrsplanung Dorfzentrum 2025', required: true, fieldType: 'text', thematicGroup: 'Gegenstand' },
      ],
      actions: [{ id: 'ae-a1', label: 'Eingangsbestätigung via Portal', type: 'standard', description: 'Automatische Bestätigung im CMI Portal' }],
      completionCriteria: [{ id: 'ae-c1', description: 'Antrag registriert', met: true }],
      conditionals: [],
    },
    {
      id: 'ae-2', number: '1002', title: 'Vorprüfung des Antrags', status: 'completed', completedDate: '11.08.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Weber Claudia, Kanzlei', category: 'Akteneinsicht',
      contextLinks: [G('2')],
      tasks: [
        { id: 'ae-t3', title: 'Berechtigung prüfen', assignee: 'Weber Claudia', status: 'done' },
        { id: 'ae-t4', title: 'Datenschutz-Relevanz prüfen', assignee: 'Weber Claudia', status: 'done' },
      ],
      inputs: [
        { id: 'ae-i3', type: 'field', label: 'Berechtigungsstatus', value: 'Berechtigt (persönliche Betroffenheit)', required: true, fieldType: 'select', options: ['Berechtigt (persönliche Betroffenheit)', 'Berechtigt (öffentliches Interesse)', 'Nicht berechtigt'], thematicGroup: 'Prüfung' },
      ],
      actions: [{ id: 'ae-a2', label: 'Datenschutz-Check', type: 'ai', description: 'KI-gestützte Prüfung auf schützenswerte Personendaten' }],
      completionCriteria: [{ id: 'ae-c2', description: 'Berechtigung geprüft', met: true }],
      conditionals: [{ id: 'ae-co1', condition: 'Berechtigungsstatus == "Nicht berechtigt"', thenAction: 'Antrag ablehnen und Bescheid senden' }],
    },
    {
      id: 'ae-3', number: '1003', title: 'Identitätsprüfung', status: 'in-progress', dueDate: '15.09.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Weber Claudia, Kanzlei', category: 'Akteneinsicht',
      contextLinks: [G('2')],
      tasks: [
        { id: 'ae-t5', title: 'Identitätsnachweis anfordern', assignee: 'Weber Claudia', status: 'done' },
        { id: 'ae-t6', title: 'Ausweis prüfen', assignee: 'Weber Claudia', status: 'in-progress' },
      ],
      inputs: [
        { id: 'ae-i4', type: 'document', label: 'Identitätsnachweis', required: true, documentName: 'Ausweis_Keller.pdf', uploaded: true },
      ],
      actions: [],
      completionCriteria: [{ id: 'ae-c3', description: 'Identität verifiziert', met: false }],
      conditionals: [],
    },
    {
      id: 'ae-4', number: '1004', title: 'Akten zusammenstellen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Weber Claudia, Kanzlei', category: 'Akteneinsicht',
      contextLinks: [G('2')],
      tasks: [
        { id: 'ae-t7', title: 'Relevante Akten identifizieren', assignee: 'Weber Claudia', status: 'open' },
        { id: 'ae-t8', title: 'Personendaten schwärzen', assignee: 'Weber Claudia', status: 'open' },
        { id: 'ae-t9', title: 'Akten digitalisieren', assignee: 'Sekretariat', status: 'open' },
      ],
      inputs: [
        { id: 'ae-i5', type: 'document', label: 'Geschwärzte Akten', required: true, uploaded: false },
      ],
      actions: [{ id: 'ae-a3', label: 'Personendaten erkennen', type: 'ai', description: 'KI erkennt automatisch schützenswerte Personendaten in Dokumenten' }],
      completionCriteria: [
        { id: 'ae-c4', description: 'Akten zusammengestellt', met: false },
        { id: 'ae-c5', description: 'Datenschutz-Schwärzung geprüft', met: false },
      ],
      conditionals: [],
    },
    {
      id: 'ae-5', number: '1005', title: 'Akteneinsicht gewähren', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Weber Claudia, Kanzlei', category: 'Akteneinsicht',
      contextLinks: [G('2')],
      tasks: [
        { id: 'ae-t10', title: 'Akten im Portal bereitstellen', assignee: 'Weber Claudia', status: 'open' },
        { id: 'ae-t11', title: 'Antragsteller benachrichtigen', assignee: 'System', status: 'open' },
      ],
      inputs: [],
      actions: [{ id: 'ae-a4', label: 'Dokumente im Portal freigeben', type: 'standard', description: 'Stellt Akten im CMI Portal bereit' }],
      completionCriteria: [{ id: 'ae-c6', description: 'Akten bereitgestellt', met: false }],
      conditionals: [],
    },
    {
      id: 'ae-6', number: '1006', title: 'Protokoll erstellen', status: 'pending',
      kind: 'step', stepType: 'activity', activityKind: 'document',
      responsible: 'Weber Claudia, Kanzlei', category: 'Akteneinsicht',
      contextLinks: [G('2')],
      tasks: [{ id: 'ae-t12', title: 'Einsichtsprotokoll erstellen', assignee: 'Weber Claudia', status: 'open' }],
      inputs: [{ id: 'ae-i6', type: 'document', label: 'Einsichtsprotokoll', required: true, uploaded: false }],
      actions: [{ id: 'ae-a5', label: 'Protokoll generieren', type: 'script', description: 'Generiert Einsichtsprotokoll automatisch' }],
      completionCriteria: [{ id: 'ae-c7', description: 'Protokoll archiviert', met: false }],
      conditionals: [],
    },
    {
      id: 'ae-7', number: '1007', title: 'Verfahren abgeschlossen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Weber Claudia, Kanzlei', category: 'Akteneinsicht',
      contextLinks: [G('2')],
      tasks: [{ id: 'ae-t13', title: 'Dossier abschliessen', assignee: 'Weber Claudia', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'ae-c8', description: 'Dossier archiviert', met: false }],
      conditionals: [],
    },
  ],
};

const PROCESS_EINBUERGERUNG: Process = {
  id: 'proc-eb',
  title: 'Einbürgerungsverfahren',
  processOwner: { name: 'Huber Peter', role: 'Einwohnerdienste', email: 'p.huber@gemeinde.ch' },
  steps: [
    {
      id: 'eb-1', number: '2001', title: 'Gesuch eingegangen', status: 'completed', completedDate: '15.06.2026',
      kind: 'step', stepType: 'activity', activityKind: 'notification',
      responsible: 'System (Portal)', category: 'Einbürgerung',
      contextLinks: [G('3')],
      tasks: [
        { id: 'eb-t1', title: 'Gesuchsformular validieren', assignee: 'System', status: 'done' },
        { id: 'eb-t2', title: 'Eingangsbestätigung senden', assignee: 'System', status: 'done' },
      ],
      inputs: [
        { id: 'eb-i1', type: 'field', label: 'Gesuchsteller', value: 'Rossi Marco', required: true, fieldType: 'text', thematicGroup: 'Person' },
        { id: 'eb-i2', type: 'field', label: 'Nationalität', value: 'Italienisch', required: true, fieldType: 'text', thematicGroup: 'Person' },
      ],
      actions: [{ id: 'eb-a1', label: 'Eingangsbestätigung', type: 'standard', description: 'Automatische Portal-Bestätigung' }],
      completionCriteria: [{ id: 'eb-c1', description: 'Gesuch registriert', met: true }],
      conditionals: [],
    },
    {
      id: 'eb-2', number: '2002', title: 'Vollständigkeitsprüfung', status: 'completed', completedDate: '18.06.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Huber Peter, Einwohnerdienste', category: 'Einbürgerung',
      contextLinks: [G('3')],
      tasks: [
        { id: 'eb-t3', title: 'Unterlagen auf Vollständigkeit prüfen', assignee: 'Huber Peter', status: 'done' },
        { id: 'eb-t4', title: 'Strafregisterauszug prüfen', assignee: 'Huber Peter', status: 'done' },
        { id: 'eb-t5', title: 'Betreibungsauszug prüfen', assignee: 'Huber Peter', status: 'done' },
      ],
      inputs: [
        { id: 'eb-i3', type: 'document', label: 'Strafregisterauszug', required: true, documentName: 'Strafregister_Rossi.pdf', uploaded: true },
        { id: 'eb-i4', type: 'document', label: 'Betreibungsauszug', required: true, documentName: 'Betreibung_Rossi.pdf', uploaded: true },
      ],
      actions: [],
      completionCriteria: [{ id: 'eb-c2', description: 'Alle Unterlagen vorhanden', met: true }],
      conditionals: [],
    },
    {
      id: 'eb-3', number: '2003', title: 'Abklärung Wohnsitzdauer', status: 'completed', completedDate: '20.06.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Huber Peter, Einwohnerdienste', category: 'Einbürgerung',
      contextLinks: [G('3')],
      tasks: [{ id: 'eb-t6', title: 'Wohnsitzdauer im Einwohnerregister prüfen', assignee: 'Huber Peter', status: 'done' }],
      inputs: [
        { id: 'eb-i5', type: 'field', label: 'Wohnsitzdauer (Jahre)', value: '10', required: true, fieldType: 'number', thematicGroup: 'Wohnsitz' },
        { id: 'eb-i6', type: 'field', label: 'Mindestdauer erfüllt', value: 'Ja', required: true, fieldType: 'select', options: ['Ja', 'Nein'], thematicGroup: 'Wohnsitz' },
      ],
      actions: [],
      completionCriteria: [{ id: 'eb-c3', description: 'Wohnsitzdauer bestätigt', met: true }],
      conditionals: [{ id: 'eb-co1', condition: 'Mindestdauer erfüllt == "Nein"', thenAction: 'Gesuch ablehnen' }],
    },
    {
      id: 'eb-4', number: '2004', title: 'Sprachprüfung / Integration', status: 'in-progress', dueDate: '18.09.2026',
      kind: 'gateway', gatewayType: 'parallel',
      responsible: 'Huber Peter, Einwohnerdienste', category: 'Einbürgerung',
      parallelPaths: [
        [{ id: 'eb-4a', number: '2004.1', title: 'Sprachprüfung durchführen', status: 'in-progress', responsible: 'Sprachschule', category: 'Einbürgerung', contextLinks: [G('3')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'eb-4b', number: '2004.2', title: 'Integrationsabklärung', status: 'pending', responsible: 'Huber Peter', category: 'Einbürgerung', contextLinks: [G('3')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
      ],
      contextLinks: [G('3')],
      tasks: [
        { id: 'eb-t7', title: 'Sprachprüfung durchführen', assignee: 'Sprachschule', status: 'in-progress' },
        { id: 'eb-t8', title: 'Integrationsabklärung', assignee: 'Huber Peter', status: 'open' },
      ],
      inputs: [
        { id: 'eb-i7', type: 'field', label: 'Sprachniveau', required: true, fieldType: 'select', options: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], thematicGroup: 'Integration' },
        { id: 'eb-i8', type: 'document', label: 'Sprachzertifikat', required: true, uploaded: false },
        { id: 'eb-i9', type: 'field', label: 'Integrationsbericht', required: true, fieldType: 'textarea', thematicGroup: 'Integration' },
      ],
      actions: [{ id: 'eb-a2', label: 'Integrationsbericht verfassen', type: 'ai', description: 'KI-Entwurf des Integrationsberichts basierend auf Unterlagen' }],
      completionCriteria: [
        { id: 'eb-c4', description: 'Sprachprüfung bestanden (min. B1)', met: false },
        { id: 'eb-c5', description: 'Integrationsabklärung positiv', met: false },
      ],
      conditionals: [],
    },
    {
      id: 'eb-5', number: '2005', title: 'Einbürgerungskommission', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Einbürgerungskommission', category: 'Einbürgerung',
      contextLinks: [G('3')],
      tasks: [
        { id: 'eb-t9', title: 'Einbürgerungsgespräch führen', assignee: 'Einbürgerungskommission', status: 'open' },
        { id: 'eb-t10', title: 'Empfehlung formulieren', assignee: 'Einbürgerungskommission', status: 'open' },
      ],
      inputs: [
        { id: 'eb-i10', type: 'field', label: 'Empfehlung', required: true, fieldType: 'select', options: ['Empfohlen', 'Nicht empfohlen', 'Zurückgestellt'], thematicGroup: 'Entscheid' },
      ],
      actions: [],
      completionCriteria: [{ id: 'eb-c6', description: 'Empfehlung abgegeben', met: false }],
      conditionals: [{ id: 'eb-co2', condition: 'Empfehlung == "Nicht empfohlen"', thenAction: 'Ablehnungsbescheid erstellen' }],
    },
    {
      id: 'eb-5-gw', number: '', title: 'Empfehlung', status: 'pending',
      kind: 'gateway', gatewayType: 'decision',
      responsible: '', category: 'Einbürgerung',
      branches: [
        { id: 'beb-1', label: 'Empfohlen', condition: 'Empfehlung == "Empfohlen"', steps: [], isDefault: true },
        { id: 'beb-2', label: 'Nicht empfohlen', condition: 'Empfehlung == "Nicht empfohlen"', steps: [] },
        { id: 'beb-3', label: 'Zurückgestellt', condition: 'Empfehlung == "Zurückgestellt"', steps: [] },
      ],
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'eb-6', number: '2006', title: 'Gemeindeversammlungsbeschluss', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Gemeinderat', category: 'Einbürgerung',
      contextLinks: [G('3'), S('sitz-gv-1')],  // linked to Geschäft AND Sitzung!
      tasks: [
        { id: 'eb-t11', title: 'Traktandierung Gemeindeversammlung', assignee: 'Sekretariat', status: 'open' },
        { id: 'eb-t12', title: 'Abstimmung durchführen', assignee: 'Gemeinderat', status: 'open' },
      ],
      inputs: [
        { id: 'eb-i11', type: 'field', label: 'Beschluss', required: true, fieldType: 'select', options: ['Angenommen', 'Abgelehnt'], thematicGroup: 'Entscheid' },
      ],
      actions: [],
      completionCriteria: [{ id: 'eb-c7', description: 'Gemeindeversammlung hat entschieden', met: false }],
      conditionals: [],
    },
    {
      id: 'eb-7', number: '2007', title: 'Kantonale Bewilligung', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Kanton', category: 'Einbürgerung',
      contextLinks: [G('3')],
      tasks: [
        { id: 'eb-t13', title: 'Gesuch an Kanton weiterleiten', assignee: 'Huber Peter', status: 'open' },
        { id: 'eb-t14', title: 'Kantonale Bewilligung abwarten', assignee: 'Kanton', status: 'open' },
      ],
      inputs: [{ id: 'eb-i12', type: 'document', label: 'Kantonale Verfügung', required: true, uploaded: false }],
      actions: [],
      completionCriteria: [{ id: 'eb-c8', description: 'Kantonale Bewilligung erteilt', met: false }],
      conditionals: [],
    },
    {
      id: 'eb-8', number: '2008', title: 'Einbürgerungsurkunde ausstellen', status: 'pending',
      kind: 'step', stepType: 'activity', activityKind: 'document',
      responsible: 'Huber Peter, Einwohnerdienste', category: 'Einbürgerung',
      contextLinks: [G('3')],
      tasks: [
        { id: 'eb-t15', title: 'Urkunde erstellen', assignee: 'Huber Peter', status: 'open' },
        { id: 'eb-t16', title: 'Feierliche Übergabe organisieren', assignee: 'Sekretariat', status: 'open' },
      ],
      inputs: [],
      actions: [{ id: 'eb-a3', label: 'Urkunde generieren', type: 'script', description: 'Generiert Einbürgerungsurkunde als PDF' }],
      completionCriteria: [{ id: 'eb-c9', description: 'Urkunde übergeben', met: false }],
      conditionals: [],
    },
    {
      id: 'eb-9', number: '2009', title: 'Verfahren abgeschlossen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Huber Peter, Einwohnerdienste', category: 'Einbürgerung',
      contextLinks: [G('3')],
      tasks: [{ id: 'eb-t17', title: 'Dossier archivieren', assignee: 'Sekretariat', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'eb-c10', description: 'Dossier archiviert', met: false }],
      conditionals: [],
    },
  ],
};

const PROCESS_GEMEINDERAT: Process = {
  id: 'proc-gr',
  title: 'Gemeinderatsanfrage-Verfahren',
  processOwner: { name: 'Schmid Andrea', role: 'Gemeindeschreiberin', email: 'a.schmid@gemeinde.ch' },
  steps: [
    {
      id: 'gr-1', number: '3001', title: 'Anfrage eingegangen', status: 'completed', completedDate: '01.08.2026',
      kind: 'step', stepType: 'activity', activityKind: 'notification',
      responsible: 'System (Portal)', category: 'Gemeinderat',
      contextLinks: [G('4')],
      tasks: [
        { id: 'gr-t1', title: 'Portal-Formular validieren', assignee: 'System', status: 'done' },
        { id: 'gr-t2', title: 'Eingangsbestätigung senden', assignee: 'System', status: 'done' },
      ],
      inputs: [
        { id: 'gr-i1', type: 'field', label: 'Antragsteller:in', value: 'Brunner Lisa', required: true, fieldType: 'text', thematicGroup: 'Antragsteller' },
        { id: 'gr-i2', type: 'field', label: 'Betreff', value: 'Tempo-30-Zone Schulweg Birkenstrasse', required: true, fieldType: 'text', thematicGroup: 'Anfrage' },
      ],
      actions: [{ id: 'gr-a1', label: 'Eingangsbestätigung', type: 'standard', description: 'Portal-Bestätigung' }],
      completionCriteria: [{ id: 'gr-c1', description: 'Anfrage registriert', met: true }],
      conditionals: [],
    },
    {
      id: 'gr-2', number: '3002', title: 'Vorprüfung & Triage', status: 'completed', completedDate: '03.08.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Schmid Andrea, Gemeindeschreiberin', category: 'Gemeinderat',
      contextLinks: [G('4')],
      tasks: [
        { id: 'gr-t3', title: 'Anfrage sichten und kategorisieren', assignee: 'Schmid Andrea', status: 'done' },
        { id: 'gr-t4', title: 'Zuständiges Ressort bestimmen', assignee: 'Schmid Andrea', status: 'done' },
      ],
      inputs: [
        { id: 'gr-i3', type: 'field', label: 'Zuständiges Ressort', value: 'Verkehr & Infrastruktur', required: true, fieldType: 'select', options: ['Bau & Planung', 'Verkehr & Infrastruktur', 'Bildung', 'Finanzen', 'Soziales'], thematicGroup: 'Triage' },
      ],
      actions: [{ id: 'gr-a2', label: 'Triage-Vorschlag', type: 'ai', description: 'KI schlägt zuständiges Ressort basierend auf Inhalt vor' }],
      completionCriteria: [{ id: 'gr-c2', description: 'Triage abgeschlossen', met: true }],
      conditionals: [],
    },
    {
      id: 'gr-3', number: '3003', title: 'Zuständiges Ressort zuweisen', status: 'in-progress', dueDate: '10.09.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Meier Hans, Gemeinderat Verkehr', category: 'Gemeinderat',
      contextLinks: [G('4')],
      tasks: [
        { id: 'gr-t5', title: 'Anfrage an Ressortleiter weiterleiten', assignee: 'Schmid Andrea', status: 'done' },
        { id: 'gr-t6', title: 'Erstsichtung durch Ressort', assignee: 'Meier Hans', status: 'in-progress' },
      ],
      inputs: [],
      actions: [],
      completionCriteria: [{ id: 'gr-c3', description: 'Ressort hat Anfrage übernommen', met: false }],
      conditionals: [],
    },
    {
      id: 'gr-4', number: '3004', title: 'Stellungnahme erarbeiten', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Meier Hans, Gemeinderat Verkehr', category: 'Gemeinderat',
      contextLinks: [G('4')],
      tasks: [
        { id: 'gr-t7', title: 'Verkehrszählung auswerten', assignee: 'Tiefbauamt', status: 'open' },
        { id: 'gr-t8', title: 'Stellungnahme Polizei einholen', assignee: 'Meier Hans', status: 'open' },
        { id: 'gr-t9', title: 'Stellungnahme verfassen', assignee: 'Meier Hans', status: 'open' },
      ],
      inputs: [
        { id: 'gr-i4', type: 'document', label: 'Verkehrszählung', required: true, uploaded: false },
        { id: 'gr-i5', type: 'field', label: 'Empfehlung Ressort', required: true, fieldType: 'select', options: ['Befürwortet', 'Teilweise befürwortet', 'Abgelehnt'], thematicGroup: 'Entscheid' },
      ],
      actions: [{ id: 'gr-a3', label: 'Stellungnahme-Entwurf', type: 'ai', description: 'KI-Entwurf der Stellungnahme basierend auf Verkehrsdaten' }],
      completionCriteria: [{ id: 'gr-c4', description: 'Stellungnahme erstellt', met: false }],
      conditionals: [],
    },
    {
      id: 'gr-5', number: '3005', title: 'Traktandierung Gemeinderatssitzung', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Schmid Andrea, Gemeindeschreiberin', category: 'Gemeinderat',
      contextLinks: [G('4'), S('sitz-gr-1')],  // linked to Geschäft AND Sitzung!
      tasks: [
        { id: 'gr-t10', title: 'Traktandum erstellen', assignee: 'Schmid Andrea', status: 'open' },
        { id: 'gr-t11', title: 'Unterlagen für Sitzung vorbereiten', assignee: 'Schmid Andrea', status: 'open' },
      ],
      inputs: [
        { id: 'gr-i6', type: 'field', label: 'Sitzungsdatum', required: true, fieldType: 'date', thematicGroup: 'Sitzung' },
      ],
      actions: [],
      completionCriteria: [{ id: 'gr-c5', description: 'Traktandiert', met: false }],
      conditionals: [],
    },
    {
      id: 'gr-6', number: '3006', title: 'Beschlussfassung', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Gemeinderat', category: 'Gemeinderat',
      contextLinks: [G('4'), S('sitz-gr-1')],
      tasks: [
        { id: 'gr-t12', title: 'Beratung im Gemeinderat', assignee: 'Gemeinderat', status: 'open' },
        { id: 'gr-t13', title: 'Beschluss fassen', assignee: 'Gemeinderat', status: 'open' },
      ],
      inputs: [
        { id: 'gr-i7', type: 'field', label: 'Beschluss', required: true, fieldType: 'select', options: ['Angenommen', 'Abgelehnt', 'Zurückgestellt', 'Weiterleitung an Kanton'], thematicGroup: 'Entscheid' },
      ],
      actions: [],
      completionCriteria: [{ id: 'gr-c6', description: 'Beschluss gefasst', met: false }],
      conditionals: [{ id: 'gr-co1', condition: 'Beschluss == "Zurückgestellt"', thenAction: 'Zurück an Ressort für weitere Abklärungen' }],
    },
    {
      id: 'gr-6-gw', number: '', title: 'Beschluss', status: 'pending',
      kind: 'gateway', gatewayType: 'decision',
      responsible: '', category: 'Gemeinderat',
      branches: [
        { id: 'bgr-1', label: 'Angenommen', condition: 'Beschluss == "Angenommen"', steps: [], isDefault: true },
        { id: 'bgr-2', label: 'Abgelehnt', condition: 'Beschluss == "Abgelehnt"', steps: [] },
        { id: 'bgr-3', label: 'Zurückgestellt', condition: 'Beschluss == "Zurückgestellt"', steps: [] },
      ],
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'gr-7', number: '3007', title: 'Antwort an Antragsteller:in', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Schmid Andrea, Gemeindeschreiberin', category: 'Gemeinderat',
      contextLinks: [G('4')],
      tasks: [
        { id: 'gr-t14', title: 'Antwortschreiben verfassen', assignee: 'Schmid Andrea', status: 'open' },
        { id: 'gr-t15', title: 'Antwort über Portal zustellen', assignee: 'Schmid Andrea', status: 'open' },
      ],
      inputs: [],
      actions: [
        { id: 'gr-a4', label: 'Antwortschreiben generieren', type: 'script', description: 'Generiert offizielles Antwortschreiben als PDF' },
        { id: 'gr-a5', label: 'Im Portal bereitstellen', type: 'standard', description: 'Stellt Antwort im CMI Portal für Bürger:in bereit' },
      ],
      completionCriteria: [{ id: 'gr-c7', description: 'Antwort zugestellt', met: false }],
      conditionals: [],
    },
    {
      id: 'gr-8', number: '3008', title: 'Verfahren abgeschlossen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Schmid Andrea, Gemeindeschreiberin', category: 'Gemeinderat',
      contextLinks: [G('4')],
      tasks: [{ id: 'gr-t16', title: 'Dossier archivieren', assignee: 'Sekretariat', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'gr-c8', description: 'Dossier archiviert', met: false }],
      conditionals: [],
    },
  ],
};

const PROCESS_VERANSTALTUNG: Process = {
  id: 'proc-va',
  title: 'Veranstaltungsbewilligungsverfahren',
  processOwner: { name: 'Frei Barbara', role: 'Gemeindekanzlei', email: 'b.frei@gemeinde.ch' },
  steps: [
    {
      id: 'va-1', number: '4001', title: 'Gesuch eingegangen', status: 'completed', completedDate: '20.07.2026',
      kind: 'step', stepType: 'activity', activityKind: 'notification',
      responsible: 'System (Portal)', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [
        { id: 'va-t1', title: 'Portal-Formular validieren', assignee: 'System', status: 'done' },
        { id: 'va-t2', title: 'Eingangsbestätigung senden', assignee: 'System', status: 'done' },
      ],
      inputs: [
        { id: 'va-i1', type: 'field', label: 'Veranstalter', value: 'Turnverein Dorfname', required: true, fieldType: 'text', thematicGroup: 'Veranstalter' },
        { id: 'va-i2', type: 'field', label: 'Veranstaltung', value: 'Dorffest Sommer 2027', required: true, fieldType: 'text', thematicGroup: 'Veranstaltung' },
        { id: 'va-i3', type: 'field', label: 'Datum', value: '19.06.2027 bis 20.06.2027', required: true, fieldType: 'text', thematicGroup: 'Veranstaltung' },
        { id: 'va-i-besucher', type: 'field', label: 'Erwartete Besucherzahl', value: "2'500", required: true, fieldType: 'text', thematicGroup: 'Veranstaltung' },
      ],
      actions: [{ id: 'va-a1', label: 'Eingangsbestätigung', type: 'standard', description: 'Portal-Bestätigung' }],
      completionCriteria: [{ id: 'va-c1', description: 'Gesuch registriert', met: true }],
      conditionals: [],
    },
    {
      id: 'va-2', number: '4002', title: 'Vollständigkeitsprüfung', status: 'completed', completedDate: '22.07.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Frei Barbara, Gemeindekanzlei', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [
        { id: 'va-t3', title: 'Unterlagen prüfen', assignee: 'Frei Barbara', status: 'done' },
        { id: 'va-t4', title: 'Sicherheitskonzept nachfordern', assignee: 'Frei Barbara', status: 'done' },
      ],
      inputs: [
        { id: 'va-i4', type: 'document', label: 'Veranstaltungskonzept', required: true, documentName: 'Konzept_Dorffest.pdf', uploaded: true },
        { id: 'va-i5', type: 'document', label: 'Sicherheitskonzept', required: true, documentName: 'Sicherheit_Dorffest.pdf', uploaded: true },
        { id: 'va-i6', type: 'document', label: 'Lageplan', required: true, documentName: 'Lageplan_Dorffest.pdf', uploaded: true },
      ],
      actions: [],
      completionCriteria: [{ id: 'va-c2', description: 'Alle Unterlagen vollständig', met: true }],
      conditionals: [],
    },
    {
      id: 'va-3', number: '4003', title: 'Risikobeurteilung', status: 'completed', completedDate: '28.07.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Frei Barbara, Gemeindekanzlei', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [
        { id: 'va-t5', title: 'Risikostufe bestimmen', assignee: 'Frei Barbara', status: 'done' },
        { id: 'va-t6', title: 'Notwendige Fachstellen identifizieren', assignee: 'Frei Barbara', status: 'done' },
      ],
      inputs: [
        { id: 'va-i7', type: 'field', label: 'Risikostufe', value: 'Mittel', required: true, fieldType: 'select', options: ['Tief', 'Mittel', 'Hoch'], thematicGroup: 'Risiko' },
      ],
      actions: [{ id: 'va-a2', label: 'Risikobewertung', type: 'ai', description: 'KI-gestützte Risikobewertung basierend auf Konzept und Besucherzahl' }],
      completionCriteria: [{ id: 'va-c3', description: 'Risikobeurteilung abgeschlossen', met: true }],
      conditionals: [{ id: 'va-co1', condition: 'Risikostufe == "Hoch"', thenAction: 'Zusätzliche Sicherheitsauflagen und Polizeieinsatz' }],
    },
    {
      id: 'va-4', number: '4004', title: 'Fachstellen-Vernehmlassung', status: 'in-progress', dueDate: '22.09.2026',
      kind: 'gateway', gatewayType: 'parallel',
      responsible: 'Frei Barbara, Gemeindekanzlei', category: 'Veranstaltung',
      parallelPathLabels: ['Feuerpolizei', 'Kantonspolizei', 'Lebensmittelkontrolle', 'Lärmschutz'],
      parallelPaths: [
        [{ id: 'va-4a', number: '4004.1', title: 'Feuerpolizei', status: 'completed', completedDate: '05.08.2026', responsible: 'Feuerpolizei', category: 'Veranstaltung', contextLinks: [G('5')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'va-4b', number: '4004.2', title: 'Kantonspolizei', status: 'in-progress', responsible: 'Kantonspolizei', category: 'Veranstaltung', contextLinks: [G('5')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'va-4c', number: '4004.3', title: 'Lebensmittelkontrolle', status: 'pending', responsible: 'Lebensmittelbehörde', category: 'Veranstaltung', contextLinks: [G('5')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'va-4d', number: '4004.4', title: 'Lärmschutz', status: 'pending', responsible: 'Umweltamt', category: 'Veranstaltung', contextLinks: [G('5')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
      ],
      contextLinks: [G('5')],
      tasks: [
        { id: 'va-t7', title: 'Stellungnahme Feuerpolizei', assignee: 'Feuerpolizei', status: 'done' },
        { id: 'va-t8', title: 'Stellungnahme Kantonspolizei', assignee: 'Kantonspolizei', status: 'in-progress' },
        { id: 'va-t9', title: 'Stellungnahme Lebensmittelkontrolle', assignee: 'Lebensmittelbehörde', status: 'open' },
        { id: 'va-t10', title: 'Stellungnahme Lärmschutz', assignee: 'Umweltamt', status: 'open' },
      ],
      inputs: [
        { id: 'va-i8', type: 'document', label: 'Stellungnahme Feuerpolizei', required: true, documentName: 'Feuerpolizei_OK.pdf', uploaded: true },
        { id: 'va-i9', type: 'document', label: 'Stellungnahme Kantonspolizei', required: true, uploaded: false },
        { id: 'va-i10', type: 'document', label: 'Stellungnahme Lebensmittelkontrolle', required: true, uploaded: false },
      ],
      actions: [{ id: 'va-a3', label: 'Fachstellen erinnern', type: 'standard', description: 'Erinnerung an ausstehende Stellungnahmen' }],
      completionCriteria: [{ id: 'va-c4', description: 'Alle Fachstellen haben Stellung genommen', met: false }],
      conditionals: [],
    },
    {
      id: 'va-5', number: '4005', title: 'Auflagen festlegen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Frei Barbara, Gemeindekanzlei', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [
        { id: 'va-t11', title: 'Auflagen aus Fachberichten zusammenstellen', assignee: 'Frei Barbara', status: 'open' },
        { id: 'va-t12', title: 'Auflagenkatalog erstellen', assignee: 'Frei Barbara', status: 'open' },
      ],
      inputs: [
        { id: 'va-i11', type: 'field', label: 'Auflagen', required: true, fieldType: 'textarea', thematicGroup: 'Bewilligung' },
      ],
      actions: [{ id: 'va-a4', label: 'Auflagen zusammenfassen', type: 'ai', description: 'KI fasst Auflagen aus allen Fachberichten zusammen' }],
      completionCriteria: [{ id: 'va-c5', description: 'Auflagenkatalog erstellt', met: false }],
      conditionals: [],
    },
    {
      id: 'va-6', number: '4006', title: 'Bewilligung erteilen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Gemeinderat', category: 'Veranstaltung',
      contextLinks: [G('5'), S('sitz-gr-1')],  // linked to Geschäft AND Sitzung!
      tasks: [
        { id: 'va-t13', title: 'Bewilligungsentscheid fällen', assignee: 'Gemeinderat', status: 'open' },
        { id: 'va-t14', title: 'Bewilligungsdokument erstellen', assignee: 'Frei Barbara', status: 'open' },
        { id: 'va-t15', title: 'Bewilligung über Portal zustellen', assignee: 'Frei Barbara', status: 'open' },
      ],
      inputs: [
        { id: 'va-i12', type: 'field', label: 'Entscheid', required: true, fieldType: 'select', options: ['Bewilligt', 'Bewilligt mit Auflagen', 'Abgelehnt'], thematicGroup: 'Bewilligung' },
      ],
      actions: [
        { id: 'va-a5', label: 'Bewilligung generieren', type: 'script', description: 'Erstellt Bewilligungsdokument als PDF' },
        { id: 'va-a6', label: 'Im Portal bereitstellen', type: 'standard', description: 'Stellt Bewilligung im CMI Portal bereit' },
      ],
      completionCriteria: [{ id: 'va-c6', description: 'Bewilligung erteilt und zugestellt', met: false }],
      conditionals: [{ id: 'va-co2', condition: 'Entscheid == "Abgelehnt"', thenAction: 'Ablehnungsbescheid senden' }],
    },
    {
      id: 'va-7', number: '4007', title: 'Veranstaltung durchführen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Steiner Anna, Veranstalter', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [{ id: 'va-t16', title: 'Auflagen-Checkliste vor Ort prüfen', assignee: 'Frei Barbara', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'va-c7', description: 'Veranstaltung durchgeführt', met: false }],
      conditionals: [],
    },
    {
      id: 'va-8', number: '4008', title: 'Nachbearbeitung', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Frei Barbara, Gemeindekanzlei', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [
        { id: 'va-t17', title: 'Feedback/Beschwerden erfassen', assignee: 'Frei Barbara', status: 'open' },
        { id: 'va-t18', title: 'Schlussrechnung prüfen', assignee: 'Finanzverwaltung', status: 'open' },
      ],
      inputs: [
        { id: 'va-i13', type: 'field', label: 'Beschwerden', value: '', required: false, fieldType: 'textarea', thematicGroup: 'Nachbearbeitung' },
      ],
      actions: [],
      completionCriteria: [{ id: 'va-c8', description: 'Nachbearbeitung abgeschlossen', met: false }],
      conditionals: [],
    },
    {
      id: 'va-9', number: '4009', title: 'Verfahren abgeschlossen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Frei Barbara, Gemeindekanzlei', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [{ id: 'va-t19', title: 'Dossier archivieren', assignee: 'Sekretariat', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'va-c9', description: 'Dossier archiviert', met: false }],
      conditionals: [],
    },
  ],
};

const PROCESS_KESB: Process = {
  id: 'proc-kesb',
  title: 'KESB-Gefahrenmeldungsverfahren',
  processOwner: { name: 'Dr. Gerber Nicole', role: 'KESB-Präsidentin', email: 'n.gerber@kesb.ch' },
  steps: [
    {
      id: 'kes-1', number: '5001', title: 'Gefahrenmeldung eingegangen', status: 'completed', completedDate: '05.08.2026',
      kind: 'step', stepType: 'activity', activityKind: 'notification',
      responsible: 'System (Portal)', category: 'KESB',
      contextLinks: [G('6')],
      tasks: [
        { id: 'kes-t1', title: 'Meldung vertraulich registrieren', assignee: 'System', status: 'done' },
        { id: 'kes-t2', title: 'Eingangsbestätigung senden', assignee: 'System', status: 'done' },
      ],
      inputs: [
        { id: 'kes-i1', type: 'field', label: 'Meldende Person', value: 'Widmer Ruth', required: true, fieldType: 'text', thematicGroup: 'Meldung' },
        { id: 'kes-i2', type: 'field', label: 'Betroffene Person(en)', value: 'Kind S. (8 Jahre), Fam. Schneider', required: true, fieldType: 'text', thematicGroup: 'Meldung' },
        { id: 'kes-i3', type: 'field', label: 'Art der Gefährdung', value: 'Verdacht auf Vernachlässigung', required: true, fieldType: 'text', thematicGroup: 'Meldung' },
      ],
      actions: [{ id: 'kes-a1', label: 'Vertrauliche Bestätigung', type: 'standard', description: 'Portal-Bestätigung mit Vertraulichkeitshinweis' }],
      completionCriteria: [{ id: 'kes-c1', description: 'Meldung registriert', met: true }],
      conditionals: [],
    },
    {
      id: 'kes-2', number: '5002', title: 'Dringlichkeitsprüfung', status: 'completed', completedDate: '05.08.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Dr. Gerber Nicole, KESB-Präsidentin', category: 'KESB',
      contextLinks: [G('6')],
      tasks: [
        { id: 'kes-t3', title: 'Dringlichkeit beurteilen', assignee: 'Dr. Gerber Nicole', status: 'done' },
        { id: 'kes-t4', title: 'Sofortmassnahmen prüfen', assignee: 'Dr. Gerber Nicole', status: 'done' },
      ],
      inputs: [
        { id: 'kes-i4', type: 'field', label: 'Dringlichkeitsstufe', value: 'Hoch', required: true, fieldType: 'select', options: ['Tief', 'Mittel', 'Hoch', 'Sofort'], thematicGroup: 'Beurteilung' },
        { id: 'kes-i5', type: 'field', label: 'Sofortmassnahmen nötig', value: 'Nein', required: true, fieldType: 'select', options: ['Ja', 'Nein'], thematicGroup: 'Beurteilung' },
      ],
      actions: [{ id: 'kes-a2', label: 'Risiko-Screening', type: 'ai', description: 'KI-gestütztes Screening basierend auf Meldungsinhalten und historischen Daten' }],
      completionCriteria: [{ id: 'kes-c2', description: 'Dringlichkeit beurteilt', met: true }],
      conditionals: [{ id: 'kes-co1', condition: 'Dringlichkeitsstufe == "Sofort"', thenAction: 'Superprovisorische Massnahme einleiten' }],
    },
    {
      id: 'kes-3', number: '5003', title: 'Abklärungsauftrag erteilen', status: 'in-progress', dueDate: '08.09.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Dr. Gerber Nicole, KESB-Präsidentin', category: 'KESB',
      contextLinks: [G('6')],
      tasks: [
        { id: 'kes-t5', title: 'Abklärungsperson bestimmen', assignee: 'Dr. Gerber Nicole', status: 'done' },
        { id: 'kes-t6', title: 'Abklärungsauftrag formulieren', assignee: 'Dr. Gerber Nicole', status: 'in-progress' },
        { id: 'kes-t7', title: 'Beistand/Abklärer:in mandatieren', assignee: 'Dr. Gerber Nicole', status: 'open' },
      ],
      inputs: [
        { id: 'kes-i6', type: 'field', label: 'Mandatierte Person', required: true, fieldType: 'text', thematicGroup: 'Abklärung' },
        { id: 'kes-i7', type: 'field', label: 'Abklärungsfokus', required: true, fieldType: 'textarea', thematicGroup: 'Abklärung' },
      ],
      actions: [],
      completionCriteria: [
        { id: 'kes-c3', description: 'Abklärungsperson bestimmt', met: true },
        { id: 'kes-c4', description: 'Auftrag erteilt', met: false },
      ],
      conditionals: [],
    },
    {
      id: 'kes-4', number: '5004', title: 'Abklärung durchführen', status: 'pending',
      kind: 'step', stepType: 'subprocess',
      responsible: 'Abklärungsperson (mandatiert)', category: 'KESB',
      subSteps: [
        { id: 'kes-4a', number: '5004.1', title: 'Hausbesuch durchführen', status: 'pending', responsible: 'Abklärungsperson', category: 'KESB', contextLinks: [G('6')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: 'kes-4b', number: '5004.2', title: 'Gespräch mit Eltern', status: 'pending', responsible: 'Abklärungsperson', category: 'KESB', contextLinks: [G('6')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: 'kes-4c', number: '5004.3', title: 'Gespräch mit Kind', status: 'pending', responsible: 'Abklärungsperson', category: 'KESB', contextLinks: [G('6')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: 'kes-4d', number: '5004.4', title: 'Umfeld-Abklärungen', status: 'pending', responsible: 'Abklärungsperson', category: 'KESB', contextLinks: [G('6')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
      ],
      contextLinks: [G('6')],
      tasks: [
        { id: 'kes-t8', title: 'Hausbesuch durchführen', assignee: 'Abklärungsperson', status: 'open' },
        { id: 'kes-t9', title: 'Gespräch mit Eltern', assignee: 'Abklärungsperson', status: 'open' },
        { id: 'kes-t10', title: 'Gespräch mit Kind (altersgerecht)', assignee: 'Abklärungsperson', status: 'open' },
        { id: 'kes-t11', title: 'Umfeld-Abklärungen (Schule, Nachbarn)', assignee: 'Abklärungsperson', status: 'open' },
      ],
      inputs: [{ id: 'kes-i8', type: 'document', label: 'Gesprächsprotokolle', required: true, uploaded: false }],
      actions: [],
      completionCriteria: [{ id: 'kes-c5', description: 'Abklärung abgeschlossen', met: false }],
      conditionals: [],
    },
    {
      id: 'kes-5', number: '5005', title: 'Bericht erstellen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Abklärungsperson (mandatiert)', category: 'KESB',
      contextLinks: [G('6')],
      tasks: [
        { id: 'kes-t12', title: 'Abklärungsbericht verfassen', assignee: 'Abklärungsperson', status: 'open' },
        { id: 'kes-t13', title: 'Massnahmenempfehlung formulieren', assignee: 'Abklärungsperson', status: 'open' },
      ],
      inputs: [
        { id: 'kes-i9', type: 'document', label: 'Abklärungsbericht', required: true, uploaded: false },
        { id: 'kes-i10', type: 'field', label: 'Empfehlung', required: true, fieldType: 'select', options: ['Keine Massnahme', 'Freiwillige Massnahme', 'Beistandschaft', 'Obhutsentzug'], thematicGroup: 'Massnahme' },
      ],
      actions: [{ id: 'kes-a3', label: 'Berichtsentwurf', type: 'ai', description: 'KI-Entwurf des Abklärungsberichts basierend auf Protokollen' }],
      completionCriteria: [{ id: 'kes-c6', description: 'Bericht eingereicht', met: false }],
      conditionals: [],
    },
    {
      id: 'kes-6', number: '5006', title: 'KESB-Sitzung / Entscheid', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'KESB-Spruchkörper', category: 'KESB',
      contextLinks: [G('6'), S('sitz-kesb-1')],
      tasks: [
        { id: 'kes-t14', title: 'Fall traktandieren', assignee: 'Sekretariat KESB', status: 'open' },
        { id: 'kes-t15', title: 'Anhörung Familie', assignee: 'KESB-Spruchkörper', status: 'open' },
        { id: 'kes-t16', title: 'Entscheid fällen', assignee: 'KESB-Spruchkörper', status: 'open' },
      ],
      inputs: [
        { id: 'kes-i11', type: 'field', label: 'Entscheid', required: true, fieldType: 'select', options: ['Keine Massnahme', 'Erziehungsbeistandschaft', 'Beistandschaft', 'Obhutsentzug', 'Freiwillige Massnahme vereinbart'], thematicGroup: 'Entscheid' },
      ],
      actions: [],
      completionCriteria: [{ id: 'kes-c7', description: 'Entscheid gefällt', met: false }],
      conditionals: [{ id: 'kes-co2', condition: 'Entscheid == "Obhutsentzug"', thenAction: 'Sofortige Platzierung einleiten' }],
    },
    {
      id: 'kes-6-gw', number: '', title: 'Massnahme', status: 'pending',
      kind: 'gateway', gatewayType: 'decision',
      responsible: '', category: 'KESB',
      branches: [
        { id: 'bkes-1', label: 'Keine Massnahme', condition: 'Entscheid == "Keine Massnahme"', steps: [] },
        { id: 'bkes-2', label: 'Beistandschaft', condition: 'Entscheid == "Beistandschaft"', steps: [] },
        { id: 'bkes-3', label: 'Obhutsentzug', condition: 'Entscheid == "Obhutsentzug"', steps: [] },
        { id: 'bkes-4', label: 'Freiwillig', condition: 'Entscheid == "Freiwillige Massnahme"', steps: [] },
      ],
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'kes-7', number: '5007', title: 'Massnahme anordnen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Dr. Gerber Nicole, KESB-Präsidentin', category: 'KESB',
      contextLinks: [G('6')],
      tasks: [
        { id: 'kes-t17', title: 'Verfügung erstellen', assignee: 'Dr. Gerber Nicole', status: 'open' },
        { id: 'kes-t18', title: 'Verfügung eröffnen', assignee: 'Sekretariat KESB', status: 'open' },
        { id: 'kes-t19', title: 'Beistand/Massnahmenträger mandatieren', assignee: 'Dr. Gerber Nicole', status: 'open' },
      ],
      inputs: [{ id: 'kes-i12', type: 'document', label: 'Verfügung', required: true, uploaded: false }],
      actions: [{ id: 'kes-a4', label: 'Verfügung generieren', type: 'script', description: 'Erstellt KESB-Verfügung als PDF' }],
      completionCriteria: [{ id: 'kes-c8', description: 'Verfügung eröffnet', met: false }],
      conditionals: [],
    },
    {
      id: 'kes-8', number: '5008', title: 'Massnahme umsetzen & überwachen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Mandatierte Beistandsperson', category: 'KESB',
      contextLinks: [G('6')],
      tasks: [
        { id: 'kes-t20', title: 'Erste Kontaktaufnahme Familie', assignee: 'Beistandsperson', status: 'open' },
        { id: 'kes-t21', title: 'Regelmässige Berichterstattung', assignee: 'Beistandsperson', status: 'open' },
      ],
      inputs: [{ id: 'kes-i13', type: 'document', label: 'Periodischer Bericht', required: true, uploaded: false }],
      actions: [],
      completionCriteria: [{ id: 'kes-c9', description: 'Massnahme läuft, nächster Review festgelegt', met: false }],
      conditionals: [],
    },
    {
      id: 'kes-9', number: '5009', title: 'Verfahren abgeschlossen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Dr. Gerber Nicole, KESB-Präsidentin', category: 'KESB',
      contextLinks: [G('6')],
      tasks: [{ id: 'kes-t22', title: 'Dossier archivieren', assignee: 'Sekretariat KESB', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'kes-c10', description: 'Dossier archiviert', met: false }],
      conditionals: [],
    },
  ],
};

// ============================================================
// WORKFLOW INSTANCES — demo instances for stakeholder presentation
// ============================================================

// Schulverwaltung 2: sonderpädagogische Massnahme nach ICF-Logik. Abklärung als
// Subprozess, Fachberichte parallel, Entscheid in der Bildungskommission,
// danach jährliche Überprüfung mit Schleife zurück in die Massnahmenplanung.
const PROCESS_SONDERPAED: Process = {
  id: 'proc-sp',
  title: 'Sonderpädagogisches Massnahmenverfahren',
  processOwner: { name: 'Vogt Daniel', role: 'Schulleiter', email: 'd.vogt@schule-dorf.ch' },
  steps: [
    {
      id: 'sp-1', number: '7001', title: 'Antrag auf sonderpädagogische Massnahme', status: 'completed', completedDate: '29.06.2026',
      kind: 'step', stepType: 'activity', activityKind: 'notification',
      responsible: 'System (Portal)', category: 'Sonderpädagogik',
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t1', title: 'Portal-Formular validieren', assignee: 'System', status: 'done' },
        { id: 'sp-t2', title: 'Einverständnis der Erziehungsberechtigten prüfen', assignee: 'System', status: 'done' },
        { id: 'sp-t3', title: 'Geschäft eröffnen', assignee: 'System', status: 'done' },
      ],
      inputs: [
        { id: 'sp-i1', type: 'field', label: 'Kind', value: 'Bucher Tim', required: true, fieldType: 'text', thematicGroup: 'Kind' },
        { id: 'sp-i2', type: 'field', label: 'Geburtsdatum', value: '02.09.2017', required: true, fieldType: 'date', thematicGroup: 'Kind' },
        { id: 'sp-i3', type: 'field', label: 'Klasse', value: '3a, Primarschule Dorf-Ost', required: true, fieldType: 'text', thematicGroup: 'Kind' },
        { id: 'sp-i4', type: 'field', label: 'Antragstellende Person', value: 'Widmer Ruth, Klassenlehrperson', required: true, fieldType: 'text', thematicGroup: 'Beteiligte' },
        { id: 'sp-i5', type: 'field', label: 'Einverständnis Erziehungsberechtigte', value: 'Liegt vor', required: true, fieldType: 'select', options: ['Liegt vor', 'Ausstehend', 'Verweigert'], thematicGroup: 'Beteiligte' },
        { id: 'sp-i6', type: 'field', label: 'Beobachteter Förderbedarf', value: 'Anhaltende Schwierigkeiten im Lesen und Schreiben, Hinweise auf eine Sprachentwicklungsstörung', required: true, fieldType: 'textarea', thematicGroup: 'Förderbedarf' },
        { id: 'sp-i7', type: 'document', label: 'Antragsformular', required: true, documentName: 'Antrag_SPM_Bucher.pdf', uploaded: true },
      ],
      actions: [{ id: 'sp-a1', label: 'Eingangsbestätigung senden', type: 'standard', description: 'Stellt die Bestätigung im CMI Portal bereit' }],
      completionCriteria: [{ id: 'sp-c1', description: 'Antrag erfasst, Einverständnis geprüft', met: true }],
      conditionals: [{ id: 'sp-co1', condition: 'Einverständnis Erziehungsberechtigte == "Verweigert"', thenAction: 'Verfahren nicht eröffnen, Eltern schriftlich informieren' }],
    },
    {
      id: 'sp-2', number: '7002', title: 'Triage und Zuständigkeitsprüfung', status: 'completed', completedDate: '08.07.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Vogt Daniel, Schulleitung', category: 'Sonderpädagogik',
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t4', title: 'Bisherige Fördermassnahmen erheben', assignee: 'Vogt Daniel', status: 'done' },
        { id: 'sp-t5', title: 'Zuständige Fachstelle klären', assignee: 'Vogt Daniel', status: 'done' },
        { id: 'sp-t6', title: 'Abklärungsbedarf festlegen', assignee: 'Vogt Daniel', status: 'done' },
      ],
      inputs: [
        { id: 'sp-i8', type: 'field', label: 'Bisherige Massnahmen', value: 'Klasseninterne Förderung seit Schuljahr 2025/26, kein formeller Anspruch', required: true, fieldType: 'textarea', thematicGroup: 'Vorgeschichte' },
        { id: 'sp-i9', type: 'field', label: 'Empfohlene Massnahmenstufe', value: 'Integrative Förderung (IF)', required: true, fieldType: 'select', options: ['Niederschwellige Förderung (schulintern)', 'Integrative Förderung (IF)', 'Logopädische Therapie', 'Verstärkte Massnahme (Sonderschulung)'], thematicGroup: 'Triage' },
        { id: 'sp-i10', type: 'field', label: 'Abklärung erforderlich', value: 'Ja', required: true, fieldType: 'select', options: ['Ja', 'Nein'], thematicGroup: 'Triage' },
      ],
      actions: [{ id: 'sp-a2', label: 'Förderbedarf-Screening', type: 'ai', description: 'KI-gestützte Vorbeurteilung von Förderbedarf, Massnahmenstufe und zuständiger Fachstelle' }],
      completionCriteria: [{ id: 'sp-c2', description: 'Triage abgeschlossen', met: true }],
      conditionals: [{ id: 'sp-co2', condition: 'Abklärung erforderlich == "Nein"', thenAction: 'Niederschwellige Förderung ohne Kommissionsentscheid vereinbaren' }],
    },
    {
      id: 'sp-3', number: '7003', title: 'Schulische Abklärung', status: 'completed', completedDate: '07.08.2026',
      kind: 'step', stepType: 'subprocess',
      responsible: 'Schulpsychologischer Dienst', category: 'Sonderpädagogik',
      subSteps: [
        { id: 'sp-3a', number: '7003.1', title: 'Aktenstudium und Auftragsklärung', status: 'completed', completedDate: '13.07.2026', responsible: 'Dr. Lang Miriam', category: 'Sonderpädagogik', contextLinks: [G('8')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: 'sp-3b', number: '7003.2', title: 'Unterrichtsbeobachtung', status: 'completed', completedDate: '21.07.2026', responsible: 'Dr. Lang Miriam', category: 'Sonderpädagogik', contextLinks: [G('8')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: 'sp-3c', number: '7003.3', title: 'Testdiagnostik mit dem Kind', status: 'completed', completedDate: '29.07.2026', responsible: 'Dr. Lang Miriam', category: 'Sonderpädagogik', contextLinks: [G('8')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: 'sp-3d', number: '7003.4', title: 'Gespräch mit Eltern und Lehrperson', status: 'completed', completedDate: '07.08.2026', responsible: 'Dr. Lang Miriam', category: 'Sonderpädagogik', contextLinks: [G('8')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
      ],
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t7', title: 'Abklärungsauftrag erteilen', assignee: 'Vogt Daniel', status: 'done' },
        { id: 'sp-t8', title: 'Termine mit Eltern und Schule koordinieren', assignee: 'Dr. Lang Miriam', status: 'done' },
        { id: 'sp-t9', title: 'Abklärung durchführen', assignee: 'Dr. Lang Miriam', status: 'done' },
      ],
      inputs: [
        { id: 'sp-i11', type: 'document', label: 'Abklärungsauftrag', required: true, documentName: 'Abklaerungsauftrag_Bucher.pdf', uploaded: true },
        { id: 'sp-i12', type: 'field', label: 'Abklärungszeitraum', value: '13.07.2026 bis 07.08.2026', required: false, fieldType: 'text', thematicGroup: 'Abklärung' },
      ],
      actions: [],
      completionCriteria: [{ id: 'sp-c3', description: 'Abklärung durchgeführt', met: true }],
      conditionals: [],
    },
    {
      id: 'sp-4', number: '7004', title: 'Fachberichte einholen', status: 'in-progress', dueDate: '17.09.2026',
      kind: 'gateway', gatewayType: 'parallel',
      responsible: 'Vogt Daniel, Schulleitung', category: 'Sonderpädagogik',
      parallelPathLabels: ['Schulpsychologie', 'Logopädie', 'Kinder- und Jugendpsychiatrie'],
      parallelPaths: [
        [{ id: 'sp-4a', number: '7004.1', title: 'SPD-Bericht mit Massnahmenempfehlung', status: 'completed', completedDate: '21.08.2026', responsible: 'Schulpsychologischer Dienst', category: 'Sonderpädagogik', contextLinks: [G('8')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'sp-4b', number: '7004.2', title: 'Logopädischer Abklärungsbericht', status: 'in-progress', responsible: 'Logopädischer Dienst', category: 'Sonderpädagogik', contextLinks: [G('8')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'sp-4c', number: '7004.3', title: 'Kinderärztliche Stellungnahme', status: 'pending', responsible: 'KJPD Region', category: 'Sonderpädagogik', contextLinks: [G('8')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
      ],
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t10', title: 'SPD-Bericht entgegennehmen', assignee: 'Vogt Daniel', status: 'done' },
        { id: 'sp-t11', title: 'Logopädischen Bericht nachfassen', assignee: 'Vogt Daniel', status: 'in-progress' },
        { id: 'sp-t12', title: 'Kinderärztliche Stellungnahme anfordern', assignee: 'Meier Sandra', status: 'open' },
      ],
      inputs: [
        { id: 'sp-i13', type: 'document', label: 'SPD-Bericht', required: true, documentName: 'SPD_Bericht_Bucher.pdf', uploaded: true },
        { id: 'sp-i14', type: 'document', label: 'Logopädischer Bericht', required: true, uploaded: false },
        { id: 'sp-i15', type: 'document', label: 'Kinderärztliche Stellungnahme', required: false, uploaded: false },
      ],
      actions: [{ id: 'sp-a3', label: 'Fachstellen erinnern', type: 'standard', description: 'Erinnerung an ausstehende Berichte' }],
      completionCriteria: [{ id: 'sp-c4', description: 'Alle erforderlichen Fachberichte liegen vor', met: false }],
      conditionals: [],
    },
    {
      id: 'sp-5', number: '7005', title: 'Schulisches Standortgespräch (SSG)', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Vogt Daniel, Schulleitung', category: 'Sonderpädagogik',
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t13', title: 'SSG einberufen (Eltern, Lehrperson, Fachstellen)', assignee: 'Vogt Daniel', status: 'open' },
        { id: 'sp-t14', title: 'Förderziele nach ICF festlegen', assignee: 'Vogt Daniel', status: 'open' },
        { id: 'sp-t15', title: 'Protokoll erstellen und unterzeichnen lassen', assignee: 'Meier Sandra', status: 'open' },
      ],
      inputs: [
        { id: 'sp-i16', type: 'document', label: 'SSG-Protokoll', required: true, uploaded: false },
        { id: 'sp-i17', type: 'field', label: 'Vereinbarte Förderziele', required: true, fieldType: 'textarea', thematicGroup: 'Förderplanung' },
        { id: 'sp-i18', type: 'field', label: 'Konsens erreicht', required: true, fieldType: 'select', options: ['Ja', 'Nein, abweichende Haltung der Eltern'], thematicGroup: 'Förderplanung' },
      ],
      actions: [],
      completionCriteria: [{ id: 'sp-c5', description: 'SSG durchgeführt, Förderziele vereinbart', met: false }],
      conditionals: [{ id: 'sp-co3', condition: 'Konsens erreicht == "Nein, abweichende Haltung der Eltern"', thenAction: 'Abweichende Haltung im Antrag an die Kommission dokumentieren' }],
    },
    {
      id: 'sp-6', number: '7006', title: 'Massnahmenantrag erstellen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Vogt Daniel, Schulleitung', category: 'Sonderpädagogik',
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t16', title: 'Antrag mit Fachberichten zusammenstellen', assignee: 'Vogt Daniel', status: 'open' },
        { id: 'sp-t17', title: 'Kostenfolgen ausweisen', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sp-t18', title: 'Antrag der Schulverwaltung zustellen', assignee: 'Vogt Daniel', status: 'open' },
      ],
      inputs: [
        { id: 'sp-i19', type: 'document', label: 'Massnahmenantrag', required: true, uploaded: false },
        { id: 'sp-i20', type: 'field', label: 'Beantragte Massnahme', required: true, fieldType: 'select', options: ['Integrative Förderung (IF)', 'Logopädische Therapie', 'Integrative Förderung und Logopädie', 'Verstärkte Massnahme (Sonderschulung)'], thematicGroup: 'Antrag' },
        { id: 'sp-i21', type: 'field', label: 'Kostenfolge pro Schuljahr', required: false, fieldType: 'text', thematicGroup: 'Antrag' },
      ],
      actions: [{ id: 'sp-a4', label: 'Antrag aus Fachberichten entwerfen', type: 'ai', description: 'KI-Entwurf des Massnahmenantrags aus den vorliegenden Fachberichten' }],
      completionCriteria: [{ id: 'sp-c6', description: 'Antrag erstellt und eingereicht', met: false }],
      conditionals: [],
    },
    {
      id: 'sp-7', number: '7007', title: 'Entscheid Bildungskommission', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Bildungskommission', category: 'Sonderpädagogik',
      contextLinks: [G('8'), S('sitz-bk-1')],  // Geschäft UND Sitzung der Bildungskommission
      tasks: [
        { id: 'sp-t19', title: 'Geschäft traktandieren', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sp-t20', title: 'Antrag beraten', assignee: 'Bildungskommission', status: 'open' },
        { id: 'sp-t21', title: 'Entscheid fällen und protokollieren', assignee: 'Bildungskommission', status: 'open' },
      ],
      inputs: [
        { id: 'sp-i22', type: 'field', label: 'Entscheid', required: true, fieldType: 'select', options: ['Integrative Förderung (IF)', 'Logopädische Therapie', 'Integrative Förderung und Logopädie', 'Verstärkte Massnahme (Sonderschulung)', 'Kein Anspruch'], thematicGroup: 'Entscheid' },
        { id: 'sp-i23', type: 'field', label: 'Befristung', required: true, fieldType: 'select', options: ['1 Schuljahr', '2 Schuljahre', 'unbefristet mit jährlicher Überprüfung'], thematicGroup: 'Entscheid' },
      ],
      actions: [{ id: 'sp-a5', label: 'Traktandum anmelden', type: 'standard', description: 'Meldet das Geschäft für die nächste Sitzung der Bildungskommission an' }],
      completionCriteria: [{ id: 'sp-c7', description: 'Entscheid gefällt und protokolliert', met: false }],
      conditionals: [{ id: 'sp-co4', condition: 'Entscheid == "Verstärkte Massnahme (Sonderschulung)"', thenAction: 'Kostengutsprache beim Kanton einholen' }],
    },
    {
      id: 'sp-7-gw', number: '', title: 'Massnahmenentscheid', status: 'pending',
      kind: 'gateway', gatewayType: 'decision',
      responsible: '', category: 'Sonderpädagogik',
      branches: [
        { id: 'bsp-1', label: 'Integrative Förderung', condition: 'Entscheid == "Integrative Förderung (IF)"', steps: [] },
        { id: 'bsp-2', label: 'Logopädische Therapie', condition: 'Entscheid == "Logopädische Therapie"', steps: [] },
        { id: 'bsp-3', label: 'Verstärkte Massnahme', condition: 'Entscheid == "Verstärkte Massnahme (Sonderschulung)"', steps: [] },
        { id: 'bsp-4', label: 'Kein Anspruch', condition: 'Entscheid == "Kein Anspruch"', steps: [] },
      ],
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'sp-8', number: '7008', title: 'Verfügung eröffnen und Massnahme starten', status: 'pending',
      kind: 'step', stepType: 'activity', activityKind: 'object-creation',
      responsible: 'Meier Sandra, Schulverwaltung', category: 'Sonderpädagogik',
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t22', title: 'Verfügung mit Rechtsmittelbelehrung erstellen', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sp-t23', title: 'Verfügung den Erziehungsberechtigten eröffnen', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sp-t24', title: 'Fachperson zuweisen und Massnahme im Stundenplan verankern', assignee: 'Vogt Daniel', status: 'open' },
      ],
      inputs: [
        { id: 'sp-i24', type: 'document', label: 'Verfügung sonderpädagogische Massnahme', required: true, uploaded: false },
        { id: 'sp-i25', type: 'field', label: 'Zugewiesene Fachperson', required: false, fieldType: 'text', thematicGroup: 'Umsetzung' },
        { id: 'sp-i26', type: 'field', label: 'Start der Massnahme', required: false, fieldType: 'date', thematicGroup: 'Umsetzung' },
      ],
      actions: [
        { id: 'sp-a6', label: 'Verfügung generieren', type: 'script', description: 'Erstellt die Verfügung als PDF' },
        { id: 'sp-a7', label: 'Im Portal bereitstellen', type: 'standard', description: 'Stellt die Verfügung im CMI Portal bereit' },
      ],
      completionCriteria: [{ id: 'sp-c8', description: 'Verfügung eröffnet, Massnahme gestartet', met: false }],
      conditionals: [],
    },
    {
      id: 'sp-9', number: '7009', title: 'Überprüfung nach einem Schuljahr', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Vogt Daniel, Schulleitung', category: 'Sonderpädagogik',
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t25', title: 'SSG zur Überprüfung einberufen', assignee: 'Vogt Daniel', status: 'open' },
        { id: 'sp-t26', title: 'Wirkung der Massnahme beurteilen', assignee: 'Vogt Daniel', status: 'open' },
        { id: 'sp-t27', title: 'Weiterführung oder Abschluss beantragen', assignee: 'Vogt Daniel', status: 'open' },
      ],
      inputs: [
        { id: 'sp-i27', type: 'document', label: 'Überprüfungsbericht', required: true, uploaded: false },
        { id: 'sp-i28', type: 'field', label: 'Resultat der Überprüfung', required: true, fieldType: 'select', options: ['Massnahme weiterführen', 'Massnahme anpassen', 'Massnahme abschliessen'], thematicGroup: 'Überprüfung' },
      ],
      actions: [],
      completionCriteria: [{ id: 'sp-c9', description: 'Überprüfung durchgeführt', met: false }],
      conditionals: [{ id: 'sp-co5', condition: 'Resultat der Überprüfung == "Massnahme weiterführen"', thenAction: 'Neuen Massnahmenantrag an die Bildungskommission stellen' }],
    },
    {
      id: 'sp-9-gw', number: '', title: 'Weiterführung nötig?', status: 'pending',
      kind: 'gateway', gatewayType: 'loop',
      loopCondition: 'Resultat der Überprüfung != "Massnahme abschliessen"',
      loopBody: [],
      responsible: '', category: 'Sonderpädagogik',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'sp-10', number: '7010', title: 'Massnahme abgeschlossen, Verfahren beendet', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Meier Sandra, Schulverwaltung', category: 'Sonderpädagogik',
      contextLinks: [G('8')],
      tasks: [
        { id: 'sp-t28', title: 'Abschluss den Eltern mitteilen', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sp-t29', title: 'Dossier archivieren', assignee: 'Sekretariat Schulverwaltung', status: 'open' },
      ],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'sp-c10', description: 'Dossier archiviert', met: false }],
      conditionals: [],
    },
  ],
};

// Schulverwaltung 3: Schuleinschreibung als Jahrgangs- bzw. Massenverfahren.
// Anders als die uebrigen Verfahren laeuft dieses nicht pro Fall, sondern einmal
// pro Schuljahr ueber einen ganzen Jahrgang. Es zeigt drei Dinge, die die
// Einzelfallverfahren nicht zeigen koennen: eine eingehende Schnittstelle als
// zeitgesteuerten Trigger, eine Warte-Aktivitaet auf ein Fremdsystem und eine
// Schleife mit gefuelltem Rumpf (Mahnlauf), die an einer Mahnstufe endet.
// Der Uebergang zurueck auf die Einzelfallebene passiert in Schritt 8006.
const PROCESS_SCHULEINSCHREIBUNG: Process = {
  id: 'proc-sei',
  title: 'Schuleinschreibungsverfahren',
  processOwner: { name: 'Meier Sandra', role: 'Leiterin Schulverwaltung', email: 's.meier@schule-dorf.ch' },
  steps: [
    {
      id: 'sei-1', number: '8001', title: 'Jahrgang aus ContactSync beziehen', status: 'in-progress', dueDate: '05.09.2026',
      kind: 'step', stepType: 'activity', activityKind: 'interface',
      responsible: 'Geplanter Task (ContactSync)', category: 'Schuleinschreibung',
      contextLinks: [G('9')],
      tasks: [
        { id: 'sei-t1', title: 'Geplanten Task auslösen', assignee: 'System', status: 'open' },
        { id: 'sei-t2', title: 'Kinder inkl. Beziehungen und Haushalte beziehen', assignee: 'System', status: 'open' },
        { id: 'sei-t3', title: 'Jahrgang 2027/28 abgrenzen', assignee: 'Meier Sandra', status: 'open' },
      ],
      inputs: [
        { id: 'sei-i1', type: 'field', label: 'Schuljahr', value: '2027/28', required: true, fieldType: 'text', thematicGroup: 'Jahrgang' },
        { id: 'sei-i2', type: 'field', label: 'Stufe', value: 'Kindergarten', required: true, fieldType: 'select', options: ['Kindergarten', '1. Primarklasse', 'Oberstufe'], thematicGroup: 'Jahrgang' },
        { id: 'sei-i3', type: 'field', label: 'Bezogene Kinder', required: true, fieldType: 'number', thematicGroup: 'Jahrgang' },
        { id: 'sei-i4', type: 'field', label: 'Datenquelle', required: true, fieldType: 'text', thematicGroup: 'Schnittstelle' },
        { id: 'sei-i5', type: 'field', label: 'Selektions-ID', required: true, fieldType: 'text', thematicGroup: 'Schnittstelle' },
      ],
      actions: [
        { id: 'sei-a1', label: 'ContactSync-Lauf auslösen', type: 'interface', description: 'Bezieht die Schulkinder des Jahrgangs samt Eltern und Haushalt aus der Einwohnerkontrolle' },
      ],
      completionCriteria: [{ id: 'sei-c1', description: 'Jahrgang vollständig bezogen und abgegrenzt', met: false }],
      conditionals: [],
    },
    {
      id: 'sei-2', number: '8002', title: 'Datenqualität prüfen', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Meier Sandra, Schulverwaltung', category: 'Schuleinschreibung',
      contextLinks: [G('9')],
      tasks: [
        { id: 'sei-t4', title: 'Beziehungen auf beide Elternteile prüfen', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sei-t5', title: 'Sorgerecht plausibilisieren', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sei-t6', title: 'Klapp-taugliche Kontaktdaten prüfen (Mobilnummer)', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sei-t7', title: 'Nacherfassung bei der Einwohnerkontrolle auslösen', assignee: 'Meier Sandra', status: 'open' },
      ],
      inputs: [
        { id: 'sei-i6', type: 'field', label: 'Vollständige Datensätze', value: '18 von 24', required: true, fieldType: 'text', thematicGroup: 'Datenqualität' },
        { id: 'sei-i7', type: 'field', label: 'Fehlender zweiter Elternteil', value: '3', required: true, fieldType: 'number', thematicGroup: 'Datenqualität' },
        { id: 'sei-i8', type: 'field', label: 'Sorgerecht unbestätigt', value: '2', required: true, fieldType: 'number', thematicGroup: 'Datenqualität' },
        { id: 'sei-i9', type: 'field', label: 'Keine Mobilnummer für Klapp', value: '3', required: true, fieldType: 'number', thematicGroup: 'Datenqualität' },
        { id: 'sei-i10', type: 'field', label: 'Einschreibung trotz Lücken starten', value: 'Ja, Lücken werden parallel bereinigt', required: true, fieldType: 'select', options: ['Ja, Lücken werden parallel bereinigt', 'Nein, zuerst bereinigen'], thematicGroup: 'Entscheid' },
      ],
      actions: [
        { id: 'sei-a2', label: 'Lückenliste exportieren', type: 'script', description: 'Erstellt die Liste der unvollständigen Datensätze für die Einwohnerkontrolle, öffnet in Excel' },
      ],
      completionCriteria: [
        { id: 'sei-c2', description: 'Datenqualität geprüft', met: false },
        { id: 'sei-c3', description: 'Nacherfassung ausgelöst', met: false },
      ],
      conditionals: [{ id: 'sei-co1', condition: 'Sorgerecht unbestätigt > 0', thenAction: 'Belegdokument bei den Erziehungsberechtigten einfordern, Anmeldung nur durch sorgeberechtigten Elternteil zulassen' }],
    },
    {
      id: 'sei-3', number: '8003', title: 'Klapp-Registrationsbrief erstellen und versenden', status: 'pending',
      kind: 'step', stepType: 'activity', activityKind: 'document',
      responsible: 'Meier Sandra, Schulverwaltung', category: 'Schuleinschreibung',
      contextLinks: [G('9')],
      tasks: [
        { id: 'sei-t8', title: 'Einschulungs-Angebot in Klapp publizieren', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sei-t9', title: 'Serienbrief mit Zugangscodes erzeugen', assignee: 'System', status: 'open' },
        { id: 'sei-t10', title: 'Druckauftrag auslösen', assignee: 'System', status: 'open' },
        { id: 'sei-t11', title: 'Couvertierung und Postversand', assignee: 'Sekretariat Schulverwaltung', status: 'open' },
      ],
      inputs: [
        { id: 'sei-i11', type: 'field', label: 'Briefvorlage', value: 'Registrationsbrief Kindergarten (Klapp)', required: true, fieldType: 'text', thematicGroup: 'Versand' },
        { id: 'sei-i12', type: 'field', label: 'Anzahl Briefe', value: '24', required: true, fieldType: 'number', thematicGroup: 'Versand' },
        { id: 'sei-i13', type: 'field', label: 'Versanddatum', value: '31.08.2026', required: true, fieldType: 'date', thematicGroup: 'Versand' },
        { id: 'sei-i14', type: 'field', label: 'Anmeldefrist', value: '30.09.2026', required: true, fieldType: 'date', thematicGroup: 'Versand' },
        { id: 'sei-i15', type: 'document', label: 'Serienbrief (Druckstapel)', required: true, documentName: 'Registrationsbriefe_KG_2027-28.doc', uploaded: false },
      ],
      actions: [
        { id: 'sei-a3', label: 'Einschulungs-Angebot an Klapp senden', type: 'interface', description: 'Publiziert die Einschulung als Klapp-Angebot mit Angebotsoptionsgruppen' },
        { id: 'sei-a4', label: 'Serienbrief generieren', type: 'script', description: 'Ein Brief je Familie mit persönlichem Klapp-Zugangscode, öffnet in Word' },
      ],
      completionCriteria: [
        { id: 'sei-c4', description: 'Angebot in Klapp publiziert', met: false },
        { id: 'sei-c5', description: 'Registrationsbriefe versendet', met: false },
      ],
      conditionals: [],
    },
    {
      id: 'sei-4', number: '8004', title: 'Anmeldungen in Klapp überwachen', status: 'pending', dueDate: '30.09.2026',
      kind: 'step', stepType: 'activity', activityKind: 'interface',
      responsible: 'Meier Sandra, Schulverwaltung', category: 'Schuleinschreibung',
      contextLinks: [G('9')],
      tasks: [
        { id: 'sei-t12', title: 'Anmeldestand aus Klapp abgleichen', assignee: 'System', status: 'open' },
        { id: 'sei-t13', title: 'Unvollständige Anmeldungen sichten', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sei-t14', title: 'Familien ohne Klapp-Konto separat kontaktieren', assignee: 'Meier Sandra', status: 'open' },
      ],
      inputs: [
        { id: 'sei-i16', type: 'field', label: 'Anmeldefrist', value: '30.09.2026', required: true, fieldType: 'date', thematicGroup: 'Rücklauf' },
        { id: 'sei-i17', type: 'field', label: 'Anmeldung abgeschlossen', required: true, fieldType: 'text', thematicGroup: 'Rücklauf' },
        { id: 'sei-i18', type: 'field', label: 'Maximale Mahnstufe', value: '3', required: true, fieldType: 'number', thematicGroup: 'Rücklauf' },
      ],
      actions: [
        { id: 'sei-a5', label: 'Anmeldestand aus Klapp abgleichen', type: 'interface', description: 'Liest zurück, welche Familie die Schulanmeldung in Klapp abgeschlossen hat' },
      ],
      completionCriteria: [{ id: 'sei-c6', description: 'Alle Anmeldungen liegen vor oder sind abschliessend nachgefasst', met: false }],
      conditionals: [
        { id: 'sei-co2', condition: 'Offene Anmeldungen > 0 am Tag der Frist', thenAction: 'Erinnerungsbrief auslösen, ab Mahnstufe 3 telefonisch nachfassen' },
      ],
    },
    {
      id: 'sei-4-gw', number: '', title: 'Anmeldungen noch offen?', status: 'pending',
      kind: 'gateway', gatewayType: 'loop',
      loopCondition: 'Offene Anmeldungen > 0 und Mahnstufe < 3',
      loopBody: [
        {
          id: 'sei-5', number: '8005', title: 'Erinnerungsbrief an die Ausstehenden', status: 'pending',
          kind: 'step', stepType: 'activity', activityKind: 'document',
          responsible: 'Meier Sandra, Schulverwaltung', category: 'Schuleinschreibung',
          contextLinks: [G('9')],
          tasks: [
            { id: 'sei-t15', title: 'Offene Fälle aus Klapp selektieren', assignee: 'System', status: 'open' },
            { id: 'sei-t16', title: 'Erinnerungsbrief drucken und versenden', assignee: 'Sekretariat Schulverwaltung', status: 'open' },
            { id: 'sei-t17', title: 'Mahnstufe erhöhen', assignee: 'System', status: 'open' },
          ],
          inputs: [
            { id: 'sei-i19', type: 'field', label: 'Empfänger', value: 'nur Familien mit offener Anmeldung', required: true, fieldType: 'text', thematicGroup: 'Mahnlauf' },
            { id: 'sei-i20', type: 'document', label: 'Erinnerungsbrief (Druckstapel)', required: true, uploaded: false },
          ],
          actions: [
            { id: 'sei-a6', label: 'Erinnerungsbrief generieren', type: 'script', description: 'Brief nur an die Familien mit offener Anmeldung, öffnet in Word' },
          ],
          completionCriteria: [{ id: 'sei-c7', description: 'Erinnerungsbrief versendet', met: false }],
          conditionals: [],
        },
      ],
      responsible: '', category: 'Schuleinschreibung',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'sei-6', number: '8006', title: 'Einzelfälle eröffnen', status: 'pending',
      kind: 'step', stepType: 'activity', activityKind: 'object-creation',
      responsible: 'Meier Sandra, Schulverwaltung', category: 'Schuleinschreibung',
      contextLinks: [G('9')],
      tasks: [
        { id: 'sei-t18', title: 'Lernendendossier je Kind anlegen', assignee: 'System', status: 'open' },
        { id: 'sei-t19', title: 'Stamm- und Anmeldedaten auf das Lernendendossier übernehmen', assignee: 'System', status: 'open' },
        { id: 'sei-t20', title: 'Abweichende Anträge (Rückstellung, vorzeitiger Eintritt) markieren', assignee: 'Meier Sandra', status: 'open' },
      ],
      inputs: [
        { id: 'sei-i21', type: 'field', label: 'Zu eröffnende Lernendendossiers', value: '24', required: true, fieldType: 'number', thematicGroup: 'Ausleitung' },
        { id: 'sei-i22', type: 'field', label: 'Davon mit abweichendem Antrag', value: '2', required: false, fieldType: 'number', thematicGroup: 'Ausleitung' },
        { id: 'sei-i23', type: 'field', label: 'Zielobjekt je Kind', value: 'Lernendendossier', required: true, fieldType: 'text', thematicGroup: 'Ausleitung' },
      ],
      actions: [
        { id: 'sei-a7', label: 'Lernendendossiers anlegen', type: 'script', description: 'Legt je Kind ein Lernendendossier an und übernimmt Stammdaten, Beziehungen und Anmeldedaten' },
      ],
      completionCriteria: [{ id: 'sei-c8', description: 'Alle Einzelfälle eröffnet', met: false }],
      conditionals: [{ id: 'sei-co3', condition: 'Antrag der Eltern != "Regeleintritt"', thenAction: 'Fall der Bildungskommission zum Entscheid vorlegen (Rückstellung oder vorzeitiger Eintritt)' }],
    },
    {
      id: 'sei-7', number: '8007', title: 'Jahrgang abschliessen und Klassenbildung freigeben', status: 'pending',
      kind: 'step', stepType: 'task',
      responsible: 'Meier Sandra, Schulverwaltung', category: 'Schuleinschreibung',
      contextLinks: [G('9')],
      tasks: [
        { id: 'sei-t21', title: 'Jahrgang für die Klassenbildung freigeben', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sei-t22', title: 'Zwischenbericht an die Bildungskommission', assignee: 'Meier Sandra', status: 'open' },
        { id: 'sei-t23', title: 'Sammelgeschäft archivieren', assignee: 'Sekretariat Schulverwaltung', status: 'open' },
      ],
      inputs: [
        { id: 'sei-i24', type: 'field', label: 'Bestätigte Eintritte', required: false, fieldType: 'number', thematicGroup: 'Abschluss' },
      ],
      actions: [],
      completionCriteria: [{ id: 'sei-c9', description: 'Jahrgang abgeschlossen und Klassenbildung freigegeben', met: false }],
      conditionals: [],
    },
  ],
};

const INSTANCE_BAUGESUCH_1: Process = {
  id: 'inst-proc-bau-demo1',
  title: 'Baugesuch Sonnenweg 12, Neubau EFH',
  kind: 'instance',
  templateId: 'proc-bau',
  startedAt: '15.07.2026',
  startedBy: 'Weber Petra',
  instanceState: 'running',
  processOwner: { name: 'Oberholzer Martin', role: 'Bauverwalter', email: 'm.oberholzer@gemeinde.ch' },
  events: [
    { id: 'e4', timestamp: '2026-08-05T10:00:00Z', type: 'step_completed', description: 'Schritt «Öffentliche Auflage» abgeschlossen', actor: 'Oberholzer Martin', stepId: 'ib1-3', stepTitle: 'Öffentliche Auflage' },
    { id: 'e3', timestamp: '2026-07-20T14:30:00Z', type: 'step_completed', description: 'Schritt «Vollständigkeitsprüfung» abgeschlossen', actor: 'Weber Petra', stepId: 'ib1-2', stepTitle: 'Vollständigkeitsprüfung' },
    { id: 'e2', timestamp: '2026-07-15T09:15:00Z', type: 'step_completed', description: 'Schritt «Baugesuch beantragt» abgeschlossen', actor: 'Weber Petra', stepId: 'ib1-1', stepTitle: 'Baugesuch beantragt' },
    { id: 'e1', timestamp: '2026-07-15T09:00:00Z', type: 'started', description: 'Workflow «Baugesuch Sonnenweg 12» gestartet von Weber Petra', actor: 'Weber Petra' },
  ],
  steps: [
    {
      id: 'ib1-1', number: '6701', title: 'Baugesuch beantragt', status: 'completed', completedDate: '15.07.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Weber Petra, Gesuchstellerin', category: 'Baugesuch',
      contextLinks: [], tasks: [
        { id: 'ib1-t1', title: 'Gesuchsformular ausfüllen', assignee: 'Weber Petra', status: 'done' },
        { id: 'ib1-t2', title: 'Pläne einreichen', assignee: 'Weber Petra', status: 'done' },
      ], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'ib1-2', number: '6811', title: 'Vollständigkeitsprüfung', status: 'completed', completedDate: '20.07.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Baugesuch',
      contextLinks: [], tasks: [
        { id: 'ib1-t3', title: 'Unterlagen prüfen', assignee: 'Oberholzer Martin', status: 'done' },
      ], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'ib1-3', number: '6855', title: 'Öffentliche Auflage', status: 'completed', completedDate: '05.08.2026',
      kind: 'step', stepType: 'subprocess',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bewilligungsverfahren',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
      subSteps: [
        { id: 'ib1-3a', number: '6855.1', title: 'Publikation im Amtsblatt', status: 'completed', completedDate: '20.07.2026', responsible: 'Oberholzer Martin', category: 'Bewilligungsverfahren', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: 'ib1-3b', number: '6855.2', title: 'Auflage (30 Tage)', status: 'completed', completedDate: '05.08.2026', responsible: 'Oberholzer Martin', category: 'Bewilligungsverfahren', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
      ],
    },
    {
      id: 'ib1-gw-parallel', number: '', title: 'Fachstellenberichte', status: 'in-progress',
      kind: 'gateway', gatewayType: 'parallel',
      responsible: '', category: 'Fachberichte',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
      parallelPathLabels: ['Tiefbauamt', 'Umweltamt', 'Denkmalpflege'],
      parallelPaths: [
        [{ id: 'ib1-p1-1', number: '6901', title: 'Bericht Tiefbauamt', status: 'in-progress', responsible: 'Keller Beat', category: 'Fachberichte', contextLinks: [], tasks: [{ id: 'ib1-p1-t1', title: 'Situationsplan prüfen', assignee: 'Keller Beat', status: 'in-progress' }], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'ib1-p2-1', number: '6902', title: 'Bericht Umweltamt', status: 'pending', responsible: 'Müller Claudia', category: 'Fachberichte', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'ib1-p3-1', number: '6903', title: 'Bericht Denkmalpflege', status: 'pending', responsible: 'Huber Ernst', category: 'Fachberichte', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
      ],
    },
    {
      id: 'ib1-gw-decision', number: '', title: 'Entscheid', status: 'pending',
      kind: 'gateway', gatewayType: 'decision',
      responsible: '', category: 'Entscheid',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
      branches: [
        { id: 'ib1-br-bewilligt', label: 'Bewilligt', condition: 'Alle Fachberichte positiv', isDefault: true, steps: [
          { id: 'ib1-br1-1', number: '7001', title: 'Baubewilligung ausstellen', status: 'pending', responsible: 'Oberholzer Martin', category: 'Entscheid', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }
        ]},
        { id: 'ib1-br-auflagen', label: 'Bewilligt mit Auflagen', condition: 'Korrekturen erforderlich', steps: [] },
        { id: 'ib1-br-abgelehnt', label: 'Abgelehnt', condition: 'Wesentliche Mängel', steps: [] },
      ],
    },
  ],
};

const INSTANCE_EINBUERGERUNG_1: Process = {
  id: 'inst-proc-eb-demo1',
  title: 'Einbürgerung Nguyen Van An',
  kind: 'instance',
  templateId: 'proc-eb',
  startedAt: '01.06.2026',
  startedBy: 'Schmid Klaus',
  instanceState: 'running',
  processOwner: { name: 'Frei Barbara', role: 'Gemeindeschreiberin', email: 'b.frei@gemeinde.ch' },
  events: [
    { id: 'ee6', timestamp: '2026-08-01T10:00:00Z', type: 'step_completed', description: 'Schritt «Vorbereitung Gemeinderatssitzung» abgeschlossen', actor: 'Schmid Klaus', stepId: 'ie1-6', stepTitle: 'Vorbereitung GR-Sitzung' },
    { id: 'ee5', timestamp: '2026-07-15T11:00:00Z', type: 'branch_chosen', description: 'Entscheidungspfad «Empfohlen» gewählt', actor: 'Schmid Klaus', stepId: 'ie1-gw-dec', stepTitle: 'Empfehlung Einbürgerungskommission' },
    { id: 'ee4', timestamp: '2026-07-10T16:00:00Z', type: 'step_completed', description: 'Schritt «Prüfung Sprache & Integration» abgeschlossen', actor: 'Schmid Klaus', stepId: 'ie1-gw-par', stepTitle: 'Prüfung Sprache & Integration' },
    { id: 'ee3', timestamp: '2026-06-20T09:00:00Z', type: 'step_completed', description: 'Schritt «Vorprüfung Aufenthalt & Kriterien» abgeschlossen', actor: 'Schmid Klaus', stepId: 'ie1-3', stepTitle: 'Vorprüfung Aufenthalt & Kriterien' },
    { id: 'ee2', timestamp: '2026-06-10T14:00:00Z', type: 'step_completed', description: 'Schritt «Vollständigkeitsprüfung» abgeschlossen', actor: 'Schmid Klaus', stepId: 'ie1-2', stepTitle: 'Vollständigkeitsprüfung' },
    { id: 'ee1', timestamp: '2026-06-01T08:30:00Z', type: 'started', description: 'Workflow «Einbürgerung Nguyen Van An» gestartet von Schmid Klaus', actor: 'Schmid Klaus' },
  ],
  steps: [
    {
      id: 'ie1-1', number: '1', title: 'Gesuch eingereicht', status: 'completed', completedDate: '01.06.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Nguyen Van An, Gesuchsteller', category: 'Einbürgerung',
      contextLinks: [], tasks: [
        { id: 'ie1-t1', title: 'Gesuchsformular einreichen', assignee: 'Nguyen Van An', status: 'done' },
        { id: 'ie1-t2', title: 'Dokumente beilegen', assignee: 'Nguyen Van An', status: 'done' },
      ], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'ie1-2', number: '2', title: 'Vollständigkeitsprüfung', status: 'completed', completedDate: '10.06.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Schmid Klaus, Sachbearbeiter', category: 'Einbürgerung',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'ie1-3', number: '3', title: 'Vorprüfung Aufenthalt & Kriterien', status: 'completed', completedDate: '20.06.2026',
      kind: 'step', stepType: 'task',
      responsible: 'Schmid Klaus, Sachbearbeiter', category: 'Einbürgerung',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
    },
    {
      id: 'ie1-gw-par', number: '', title: 'Prüfung Sprache & Integration', status: 'completed', completedDate: '10.07.2026',
      kind: 'gateway', gatewayType: 'parallel',
      responsible: '', category: 'Einbürgerung',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
      parallelPathLabels: ['Sprachnachweis', 'Integrationsnachweis'],
      parallelPaths: [
        [{ id: 'ie1-p1-1', number: '4a', title: 'Sprachkenntnisse prüfen (B1)', status: 'completed', completedDate: '05.07.2026', responsible: 'Schmid Klaus', category: 'Einbürgerung', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: 'ie1-p2-1', number: '4b', title: 'Integrationsgrad prüfen', status: 'completed', completedDate: '08.07.2026', responsible: 'Schmid Klaus', category: 'Einbürgerung', contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
      ],
    },
    {
      id: 'ie1-gw-dec', number: '', title: 'Empfehlung Einbürgerungskommission', status: 'completed', completedDate: '15.07.2026',
      kind: 'gateway', gatewayType: 'decision',
      chosenBranchId: 'ie1-br-empfohlen',
      responsible: '', category: 'Einbürgerung',
      contextLinks: [], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [],
      branches: [
        { id: 'ie1-br-empfohlen', label: 'Empfohlen', condition: 'Alle Kriterien erfüllt', steps: [
          { id: 'ie1-br1-1', number: '6', title: 'Vorbereitung GR-Sitzung', status: 'in-progress', responsible: 'Schmid Klaus', category: 'Einbürgerung', contextLinks: [], tasks: [
            { id: 'ie1-br1-t1', title: 'Traktandum vorbereiten', assignee: 'Schmid Klaus', status: 'in-progress' },
            { id: 'ie1-br1-t2', title: 'Unterlagen versenden', assignee: 'Schmid Klaus', status: 'open' },
          ], inputs: [], actions: [], completionCriteria: [], conditionals: [] }
        ]},
        { id: 'ie1-br-nicht', label: 'Nicht empfohlen', condition: 'Kriterien nicht erfüllt', steps: [] },
        { id: 'ie1-br-zurueck', label: 'Zurückgestellt', condition: 'Weitere Prüfung nötig', steps: [] },
      ],
    },
  ],
};

// Dossier-linked instances — spread from templates, add instance fields, preserve step statuses
const INSTANCE_DOSSIER_BAU: Process = {
  ...PROCESS_BAUGESUCH,
  id: 'inst-dossier-bau', kind: 'instance', templateId: 'proc-bau',
  startedAt: '20.06.2026', startedBy: 'Maria Muster', instanceState: 'running', events: [],
};
const INSTANCE_DOSSIER_AE: Process = {
  ...PROCESS_AKTENEINSICHT,
  id: 'inst-dossier-ae', kind: 'instance', templateId: 'proc-ae',
  startedAt: '10.08.2026', startedBy: 'Hans Berger', instanceState: 'running', events: [],
};
const INSTANCE_DOSSIER_EB: Process = {
  ...PROCESS_EINBUERGERUNG,
  id: 'inst-dossier-eb', kind: 'instance', templateId: 'proc-eb',
  startedAt: '15.06.2026', startedBy: 'Maria Muster', instanceState: 'running', events: [],
};
const INSTANCE_DOSSIER_GR: Process = {
  ...PROCESS_GEMEINDERAT,
  id: 'inst-dossier-gr', kind: 'instance', templateId: 'proc-gr',
  startedAt: '01.08.2026', startedBy: 'Hans Berger', instanceState: 'running', events: [],
};
const INSTANCE_DOSSIER_VA: Process = {
  ...PROCESS_VERANSTALTUNG,
  id: 'inst-dossier-va', kind: 'instance', templateId: 'proc-va',
  startedAt: '20.07.2026', startedBy: 'Maria Muster', instanceState: 'running', events: [],
};
// Second Veranstaltung instance: a large-scale event, so the KI+ risk
// assessment differs markedly from the Dorffest. Per-instance field values
// and step positioning are applied post-build in seedVeranstaltungDemo().
const INSTANCE_DOSSIER_VA_2: Process = {
  ...PROCESS_VERANSTALTUNG,
  id: 'inst-dossier-va2', kind: 'instance', templateId: 'proc-va',
  startedAt: '12.07.2026', startedBy: 'Hans Berger', instanceState: 'running', events: [],
};
const INSTANCE_DOSSIER_KESB: Process = {
  ...PROCESS_KESB,
  id: 'inst-dossier-kesb', kind: 'instance', templateId: 'proc-kesb',
  startedAt: '04.08.2026', startedBy: 'Hans Berger', instanceState: 'running', events: [],
};

const INSTANCE_DOSSIER_SP: Process = {
  ...PROCESS_SONDERPAED,
  id: 'inst-dossier-sp', kind: 'instance', templateId: 'proc-sp',
  startedAt: '29.06.2026', startedBy: 'Vogt Daniel', instanceState: 'running', events: [],
};

const INSTANCE_DOSSIER_SEI: Process = {
  ...PROCESS_SCHULEINSCHREIBUNG,
  id: 'inst-dossier-sei', kind: 'instance', templateId: 'proc-sei',
  startedAt: '01.09.2026', startedBy: 'Meier Sandra', instanceState: 'running', events: [
    { id: 'sei-e1', timestamp: '2026-09-01T08:00:00Z', type: 'started', description: 'Workflow «Schuleinschreibung Kindergarten 2027/28» gestartet von Meier Sandra', actor: 'Meier Sandra' },
  ],
};

const ALL_PROCESSES: Process[] = [
  PROCESS_BAUGESUCH,
  PROCESS_AKTENEINSICHT,
  PROCESS_EINBUERGERUNG,
  PROCESS_GEMEINDERAT,
  PROCESS_VERANSTALTUNG,
  PROCESS_KESB,
  PROCESS_SONDERPAED,
  PROCESS_SCHULEINSCHREIBUNG,
  INSTANCE_BAUGESUCH_1,
  INSTANCE_EINBUERGERUNG_1,
  INSTANCE_DOSSIER_BAU,
  INSTANCE_DOSSIER_AE,
  INSTANCE_DOSSIER_EB,
  INSTANCE_DOSSIER_GR,
  INSTANCE_DOSSIER_VA,
  INSTANCE_DOSSIER_VA_2,
  INSTANCE_DOSSIER_KESB,
  INSTANCE_DOSSIER_SP,
  INSTANCE_DOSSIER_SEI,
];

// ============================================================
// DOSSIERS — now reference processes via processId
// ============================================================

const DOSSIER_BAUGESUCH: Dossier = {
  id: '1', number: '2026-0009', title: 'Umbau Gebäude (Heizungsänderung und Dachstockausbau)',
  processId: 'inst-dossier-bau',
  serviceRequest: {
    id: 'sr-1', portalFormTitle: 'Baugesuch einreichen', submittedDate: '20.06.2026', submittedBy: 'Müller Sarah', email: 's.mueller@example.ch',
    status: 'in-bearbeitung', portalStatus: 'Ihr Baugesuch wird aktuell geprüft',
    messages: [
      { id: 'm1', date: '21.06.2026 09:15', author: 'System', direction: 'to-citizen', text: 'Ihr Baugesuch wurde erfolgreich eingereicht und wird nun geprüft.', read: true },
      { id: 'm2', date: '28.06.2026 14:30', author: 'Oberholzer Martin', direction: 'to-citizen', text: 'Guten Tag Frau Müller, die Vollständigkeitsprüfung Ihres Baugesuchs ist abgeschlossen. Alle Unterlagen sind vollständig. Das Verfahren wird fortgesetzt.', read: true },
      { id: 'm3', date: '01.07.2026 10:00', author: 'Müller Sarah', direction: 'from-citizen', text: 'Vielen Dank für die Rückmeldung. Wie lange dauert das Verfahren voraussichtlich?', read: true },
      { id: 'm4', date: '01.07.2026 15:45', author: 'Oberholzer Martin', direction: 'to-citizen', text: 'Das Verfahren dauert in der Regel 3-6 Monate. Sie werden über jeden Schritt informiert.', read: true },
    ],
    portalDocuments: [
      { id: 'pd1', name: 'Eingangsbestätigung', fileName: 'Eingangsbestaetigung_2026-0009.pdf', direction: 'to-citizen', uploadDate: '21.06.2026', description: 'Offizielle Eingangsbestätigung' },
      { id: 'pd2', name: 'Baugesuchsformular', fileName: 'Baugesuch_2026.pdf', direction: 'from-citizen', uploadDate: '20.06.2026' },
      { id: 'pd3', name: 'Situationsplan', fileName: 'Situationsplan.pdf', direction: 'from-citizen', uploadDate: '20.06.2026' },
    ],
    formData: [
      { label: 'Gesuchsteller', value: 'Müller Sarah' },
      { label: 'Adresse', value: 'Dorfstrasse 15, 8000 Zürich' },
      { label: 'Parzelle', value: '1234' },
      { label: 'Vorhaben', value: 'Umbau Gebäude (Heizungsänderung und Dachstockausbau)' },
      { label: 'Geschätzte Kosten', value: "CHF 180'000" },
      { label: 'Geplanter Baubeginn', value: '02.11.2026' },
    ],
  },
  notes: [
    { id: 'n1', date: '21.06.2026 09:30', author: 'Oberholzer Martin', subject: 'Eingang Baugesuch', text: 'Baugesuch für Umbau Gebäude ist eingegangen. Unterlagen vollständig, Verfahren wird eingeleitet.', visibility: 'intern' },
    { id: 'n2', date: '28.06.2026 15:00', author: 'Oberholzer Martin', subject: 'Vollständigkeitsprüfung OK', text: 'Alle Unterlagen geprüft und für vollständig befunden. Weiter mit öffentlicher Auflage.', visibility: 'intern' },
    { id: 'n3', date: '20.08.2026 11:00', author: 'Oberholzer Martin', text: 'Fachberichte von Brandschutz, Statik und Energie sind alle positiv eingetroffen. Keine offenen Auflagen.', visibility: 'intern' },
    { id: 'n4', date: '15.07.2026 08:00', author: 'System', subject: 'Öffentliche Auflage abgeschlossen', text: 'Auflagefrist ohne Einsprachen abgelaufen.', visibility: 'extern' },
  ],
  participants: [
    { id: 'p1', role: 'Gesuchsteller:in', roleType: 'primary', name: 'Müller Sarah', email: 's.mueller@example.ch', phone: '079 123 45 67', since: '21.06.2026' },
    { id: 'p2', role: 'Bauverwalter', roleType: 'internal', name: 'Oberholzer Martin', organization: 'Gemeinde Dorfname', email: 'm.oberholzer@gemeinde.ch', phone: '044 987 65 43', since: '21.06.2026' },
    { id: 'p3', role: 'Architekt', roleType: 'external', name: 'Schmid Roland', organization: 'Schmid Architekten AG', email: 'r.schmid@architekten.ch', since: '21.06.2026' },
    { id: 'p4', role: 'Brandschutz', roleType: 'authority', name: 'Feuerpolizei Kanton', organization: 'Gebäudeversicherung', since: '15.07.2026' },
    { id: 'p5', role: 'Statik', roleType: 'authority', name: 'Muster Ingenieure AG', organization: 'Muster Ingenieure AG', email: 'info@muster-ing.ch', since: '15.07.2026' },
    { id: 'p6', role: 'Sekretariat', roleType: 'internal', name: 'Sekretariat Gemeinde', organization: 'Gemeinde Dorfname', since: '21.06.2026' },
  ],
};

const DOSSIER_AKTENEINSICHT: Dossier = {
  id: '2', number: '2026-0042', title: 'Akteneinsicht Verkehrsplanung Dorfzentrum',
  processId: 'inst-dossier-ae',
  serviceRequest: {
    id: 'sr-2', portalFormTitle: 'Akteneinsicht beantragen', submittedDate: '10.08.2026', submittedBy: 'Keller Thomas', email: 't.keller@example.ch',
    status: 'in-bearbeitung', portalStatus: 'Ihr Antrag wird geprüft — Identitätsnachweis ausstehend',
    messages: [
      { id: 'm10', date: '10.08.2026 10:00', author: 'System', direction: 'to-citizen', text: 'Ihr Antrag auf Akteneinsicht wurde eingereicht.', read: true },
      { id: 'm11', date: '11.08.2026 09:00', author: 'Weber Claudia', direction: 'to-citizen', text: 'Guten Tag Herr Keller, wir benötigen einen gültigen Identitätsnachweis, um Ihren Antrag weiter bearbeiten zu können. Bitte laden Sie eine Kopie Ihres Ausweises hoch.', read: true },
      { id: 'm12', date: '12.08.2026 14:20', author: 'Keller Thomas', direction: 'from-citizen', text: 'Ich habe meinen Ausweis hochgeladen. Bitte prüfen Sie.', read: false },
    ],
    portalDocuments: [
      { id: 'pd10', name: 'Antragsbestätigung', fileName: 'Bestaetigung_AE_2026-0042.pdf', direction: 'to-citizen', uploadDate: '10.08.2026' },
      { id: 'pd11', name: 'Identitätsnachweis', fileName: 'Ausweis_Keller.pdf', direction: 'from-citizen', uploadDate: '12.08.2026', description: 'Kopie Personalausweis' },
    ],
    formData: [
      { label: 'Antragsteller', value: 'Keller Thomas' },
      { label: 'Adresse', value: 'Hauptstrasse 42, 8001 Zürich' },
      { label: 'Betroffenes Dossier', value: 'Verkehrsplanung Dorfzentrum 2025' },
      { label: 'Begründung', value: 'Persönliche Betroffenheit als Anlieger' },
      { label: 'Gewünschter Umfang', value: 'Gesamtes Dossier inkl. Gutachten' },
    ],
  },
  notes: [
    { id: 'ae-n1', date: '10.08.2026 10:15', author: 'Weber Claudia', subject: 'Antrag eingegangen', text: 'Antrag auf Akteneinsicht von Keller Thomas eingegangen. Persönliche Betroffenheit als Anlieger geltend gemacht.', visibility: 'intern' },
    { id: 'ae-n2', date: '11.08.2026 09:30', author: 'Weber Claudia', text: 'Identitätsnachweis per Portal angefordert.', visibility: 'intern' },
  ],
  participants: [
    { id: 'ae-p1', role: 'Antragsteller', roleType: 'primary', name: 'Keller Thomas', email: 't.keller@example.ch', since: '10.08.2026' },
    { id: 'ae-p2', role: 'Sachbearbeiterin', roleType: 'internal', name: 'Weber Claudia', organization: 'Gemeindekanzlei', email: 'c.weber@gemeinde.ch', phone: '044 111 22 33', since: '10.08.2026' },
  ],
};

const DOSSIER_EINBUERGERUNG: Dossier = {
  id: '3', number: '2026-0018', title: 'Einbürgerungsgesuch Rossi Marco',
  processId: 'inst-dossier-eb',
  serviceRequest: {
    id: 'sr-3', portalFormTitle: 'Einbürgerungsgesuch stellen', submittedDate: '15.06.2026', submittedBy: 'Rossi Marco', email: 'm.rossi@example.ch',
    status: 'in-bearbeitung', portalStatus: 'Sprachprüfung ausstehend',
    messages: [
      { id: 'm20', date: '15.06.2026 08:30', author: 'System', direction: 'to-citizen', text: 'Ihr Einbürgerungsgesuch wurde erfolgreich eingereicht.', read: true },
      { id: 'm21', date: '20.06.2026 10:00', author: 'Huber Peter', direction: 'to-citizen', text: 'Guten Tag Herr Rossi, bitte vereinbaren Sie einen Termin für die Sprachprüfung unter Tel. 044 123 45 67.', read: true },
      { id: 'm22', date: '22.06.2026 16:00', author: 'Rossi Marco', direction: 'from-citizen', text: 'Termin vereinbart für 10.09.2026. Gibt es Vorbereitungsmaterial?', read: true },
      { id: 'm23', date: '23.06.2026 09:00', author: 'Huber Peter', direction: 'to-citizen', text: 'Ja, ich stelle Ihnen das Informationsblatt im Portal bereit.', read: true },
    ],
    portalDocuments: [
      { id: 'pd20', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_EB_2026-0018.pdf', direction: 'to-citizen', uploadDate: '15.06.2026' },
      { id: 'pd21', name: 'Informationsblatt Sprachprüfung', fileName: 'Info_Sprachpruefung.pdf', direction: 'to-citizen', uploadDate: '23.06.2026', description: 'Vorbereitung auf die Sprachprüfung' },
      { id: 'pd22', name: 'Strafregisterauszug', fileName: 'Strafregister_Rossi.pdf', direction: 'from-citizen', uploadDate: '16.06.2026' },
      { id: 'pd23', name: 'Betreibungsauszug', fileName: 'Betreibung_Rossi.pdf', direction: 'from-citizen', uploadDate: '16.06.2026' },
    ],
    formData: [
      { label: 'Gesuchsteller', value: 'Rossi Marco' },
      { label: 'Geburtsdatum', value: '12.10.1986' },
      { label: 'Nationalität', value: 'Italienisch' },
      { label: 'Wohnhaft in Gemeinde seit', value: '01.08.2016' },
      { label: 'Wohnadresse', value: 'Bahnhofstrasse 88, 8001 Zürich' },
      { label: 'Beruf', value: 'Software-Entwickler' },
      { label: 'Familienstand', value: 'Verheiratet, 2 Kinder' },
    ],
  },
  notes: [
    { id: 'eb-n1', date: '15.06.2026 09:00', author: 'Huber Peter', subject: 'Einbürgerungsgesuch Rossi', text: 'Gesuch von Marco Rossi eingegangen. Wohnsitzdauer erfüllt (10 Jahre). Sprachprüfung muss noch absolviert werden.', visibility: 'intern' },
    { id: 'eb-n2', date: '20.06.2026 10:30', author: 'Huber Peter', text: 'Termin für Sprachprüfung am 10.09.2026 vereinbart. Informationsblatt via Portal zugestellt.', visibility: 'intern' },
    { id: 'eb-n3', date: '22.06.2026 16:30', author: 'System', subject: 'Portal-Nachricht', text: 'Herr Rossi fragt nach Vorbereitungsmaterial für die Sprachprüfung.', visibility: 'extern' },
  ],
  participants: [
    { id: 'eb-p1', role: 'Gesuchsteller', roleType: 'primary', name: 'Rossi Marco', email: 'm.rossi@example.ch', phone: '079 456 78 90', since: '15.06.2026' },
    { id: 'eb-p2', role: 'Sachbearbeiter', roleType: 'internal', name: 'Huber Peter', organization: 'Einwohnerdienste', email: 'p.huber@gemeinde.ch', phone: '044 333 44 55', since: '15.06.2026' },
    { id: 'eb-p3', role: 'Sprachschule', roleType: 'external', name: 'Sprachschule Dorfname', organization: 'Sprachschule Dorfname GmbH', email: 'info@sprachschule.ch', since: '20.06.2026' },
    { id: 'eb-p4', role: 'Einbürgerungskommission', roleType: 'authority', name: 'Einbürgerungskommission', organization: 'Gemeinde Dorfname', since: '15.06.2026' },
  ],
};

const DOSSIER_GEMEINDERAT: Dossier = {
  id: '4', number: '2026-0055', title: 'Anfrage Tempo-30-Zone Schulweg Birkenstrasse',
  processId: 'inst-dossier-gr',
  serviceRequest: {
    id: 'sr-4', portalFormTitle: 'Anfrage an den Gemeinderat', submittedDate: '01.08.2026', submittedBy: 'Brunner Lisa', email: 'l.brunner@example.ch',
    status: 'in-bearbeitung', portalStatus: 'Ihre Anfrage wird dem zuständigen Ressort zugewiesen',
    messages: [
      { id: 'm30', date: '01.08.2026 12:00', author: 'System', direction: 'to-citizen', text: 'Ihre Anfrage an den Gemeinderat wurde erfolgreich eingereicht.', read: true },
      { id: 'm31', date: '03.08.2026 08:30', author: 'Schmid Andrea', direction: 'to-citizen', text: 'Guten Tag Frau Brunner, Ihre Anfrage wurde registriert und wird dem Ressort Verkehr zugewiesen.', read: true },
    ],
    portalDocuments: [
      { id: 'pd30', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_GR_2026-0055.pdf', direction: 'to-citizen', uploadDate: '01.08.2026' },
      { id: 'pd31', name: 'Unterschriftensammlung', fileName: 'Unterschriften_Tempo30.pdf', direction: 'from-citizen', uploadDate: '01.08.2026', description: '45 Unterschriften Anwohner Birkenstrasse' },
    ],
    formData: [
      { label: 'Antragsteller:in', value: 'Brunner Lisa' },
      { label: 'Betreff', value: 'Tempo-30-Zone Schulweg Birkenstrasse' },
      { label: 'Kategorie', value: 'Verkehr & Sicherheit' },
      { label: 'Anliegen', value: 'Einführung einer Tempo-30-Zone auf der Birkenstrasse zum Schutz der Schulkinder' },
      { label: 'Anzahl Unterstützende', value: '45 Unterschriften' },
    ],
  },
  notes: [
    { id: 'gr-n1', date: '01.08.2026 12:15', author: 'Schmid Andrea', subject: 'Anfrage eingegangen', text: 'Anfrage von Brunner Lisa betreffend Tempo-30-Zone Birkenstrasse. 45 Unterschriften beigelegt.', visibility: 'intern' },
    { id: 'gr-n2', date: '03.08.2026 09:00', author: 'Schmid Andrea', text: 'Triage: Zuständig ist Ressort Verkehr & Infrastruktur (Meier Hans).', visibility: 'intern' },
  ],
  participants: [
    { id: 'gr-p1', role: 'Antragstellerin', roleType: 'primary', name: 'Brunner Lisa', email: 'l.brunner@example.ch', since: '01.08.2026' },
    { id: 'gr-p2', role: 'Gemeindeschreiberin', roleType: 'internal', name: 'Schmid Andrea', organization: 'Gemeindekanzlei', email: 'a.schmid@gemeinde.ch', phone: '044 555 66 77', since: '01.08.2026' },
    { id: 'gr-p3', role: 'Ressort Verkehr', roleType: 'internal', name: 'Meier Hans', organization: 'Gemeinderat', email: 'h.meier@gemeinde.ch', since: '03.08.2026' },
    { id: 'gr-p4', role: 'Tiefbauamt', roleType: 'authority', name: 'Tiefbauamt Gemeinde', organization: 'Tiefbauamt', since: '03.08.2026' },
  ],
};

const DOSSIER_VERANSTALTUNG: Dossier = {
  id: '5', number: '2026-0071', title: 'Dorffest Sommer 2027',
  processId: 'inst-dossier-va',
  serviceRequest: {
    id: 'sr-5', portalFormTitle: 'Veranstaltungsbewilligung beantragen', submittedDate: '20.07.2026', submittedBy: 'Steiner Anna', email: 'a.steiner@turnverein.ch',
    status: 'in-bearbeitung', portalStatus: 'Fachstellen werden konsultiert',
    messages: [
      { id: 'm40', date: '20.07.2026 14:00', author: 'System', direction: 'to-citizen', text: 'Ihr Antrag auf Veranstaltungsbewilligung wurde eingereicht.', read: true },
      { id: 'm41', date: '22.07.2026 09:00', author: 'Frei Barbara', direction: 'to-citizen', text: 'Guten Tag Frau Steiner, könnten Sie bitte noch ein detailliertes Sicherheitskonzept nachreichen? Dieses benötigen wir für die Fachstellen-Vernehmlassung.', read: true },
      { id: 'm42', date: '25.07.2026 11:30', author: 'Steiner Anna', direction: 'from-citizen', text: 'Das Sicherheitskonzept habe ich hochgeladen. Bei Fragen stehe ich gerne zur Verfügung.', read: true },
    ],
    portalDocuments: [
      { id: 'pd40', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_VA_2026-0071.pdf', direction: 'to-citizen', uploadDate: '20.07.2026' },
      { id: 'pd41', name: 'Veranstaltungskonzept', fileName: 'Konzept_Dorffest.pdf', direction: 'from-citizen', uploadDate: '20.07.2026' },
      { id: 'pd42', name: 'Sicherheitskonzept', fileName: 'Sicherheit_Dorffest.pdf', direction: 'from-citizen', uploadDate: '25.07.2026', description: 'Nachreichung auf Anfrage' },
      { id: 'pd43', name: 'Lageplan', fileName: 'Lageplan_Dorffest.pdf', direction: 'from-citizen', uploadDate: '20.07.2026' },
    ],
    formData: [
      { label: 'Veranstalter', value: 'Turnverein Dorfname' },
      { label: 'Kontaktperson', value: 'Steiner Anna' },
      { label: 'Veranstaltung', value: 'Dorffest Sommer 2027' },
      { label: 'Datum', value: '19.06.2027 bis 20.06.2027' },
      { label: 'Ort', value: 'Dorfplatz & Gemeindewiese' },
      { label: 'Erwartete Besucherzahl', value: 'ca. 500' },
      { label: 'Alkoholausschank', value: 'Ja (Festwirtschaft)' },
      { label: 'Musik/Lärm', value: 'Live-Band bis 23:00, DJ bis 01:00' },
    ],
  },
  notes: [
    { id: 'va-n1', date: '20.07.2026 14:30', author: 'Frei Barbara', subject: 'Gesuch Dorffest', text: 'Gesuch für Dorffest Sommer 2027 eingegangen. Turnverein Dorfname, ca. 500 Besucher erwartet. Sicherheitskonzept fehlt noch.', visibility: 'intern' },
    { id: 'va-n2', date: '22.07.2026 09:15', author: 'Frei Barbara', text: 'Sicherheitskonzept per Portal nachgefordert.', visibility: 'intern' },
    { id: 'va-n3', date: '28.07.2026 16:00', author: 'Frei Barbara', subject: 'Risikostufe Mittel', text: 'Risikobeurteilung abgeschlossen: Stufe Mittel. Fachstellen Feuerpolizei, Kantonspolizei, Lebensmittelkontrolle und Lärmschutz werden konsultiert.', visibility: 'intern' },
  ],
  participants: [
    { id: 'va-p1', role: 'Veranstalter', roleType: 'primary', name: 'Steiner Anna', organization: 'Turnverein Dorfname', email: 'a.steiner@turnverein.ch', phone: '079 888 99 00', since: '20.07.2026' },
    { id: 'va-p2', role: 'Sachbearbeiterin', roleType: 'internal', name: 'Frei Barbara', organization: 'Gemeindekanzlei', email: 'b.frei@gemeinde.ch', phone: '044 777 88 99', since: '20.07.2026' },
    { id: 'va-p3', role: 'Feuerpolizei', roleType: 'authority', name: 'Feuerpolizei Kanton', organization: 'Gebäudeversicherung', since: '28.07.2026' },
    { id: 'va-p4', role: 'Kantonspolizei', roleType: 'authority', name: 'Kantonspolizei', organization: 'Kantonspolizei', since: '28.07.2026' },
    { id: 'va-p5', role: 'Lebensmittelkontrolle', roleType: 'authority', name: 'Lebensmittelbehörde', organization: 'Kantonales Labor', since: '28.07.2026' },
    { id: 'va-p6', role: 'Lärmschutz', roleType: 'authority', name: 'Umweltamt', organization: 'Umweltamt Kanton', since: '28.07.2026' },
  ],
};

const DOSSIER_KESB: Dossier = {
  id: '6', number: '2026-KES-0012', title: 'KESB-Gefahrenmeldung Fam. Schneider',
  processId: 'inst-dossier-kesb',
  serviceRequest: {
    id: 'sr-6', portalFormTitle: 'KESB-Gefahrenmeldung einreichen', submittedDate: '05.08.2026', submittedBy: 'Widmer Ruth (Schule Dorfname)', email: 'r.widmer@schule-dorf.ch',
    status: 'in-bearbeitung', portalStatus: 'Abklärung eingeleitet',
    messages: [
      { id: 'm50', date: '05.08.2026 08:00', author: 'System', direction: 'to-citizen', text: 'Ihre Gefahrenmeldung wurde vertraulich entgegengenommen.', read: true },
      { id: 'm51', date: '05.08.2026 10:30', author: 'Dr. Gerber Nicole', direction: 'to-citizen', text: 'Frau Widmer, vielen Dank für Ihre Meldung. Die Dringlichkeit wurde als hoch eingestuft. Wir haben umgehend eine Abklärung eingeleitet. Für Rückfragen erreichen Sie mich unter 044 987 65 43.', read: true },
      { id: 'm52', date: '06.08.2026 14:00', author: 'Widmer Ruth', direction: 'from-citizen', text: 'Ich habe noch einen ergänzenden Bericht der Schulleitung hochgeladen.', read: true },
    ],
    portalDocuments: [
      { id: 'pd50', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_KES_2026-0012.pdf', direction: 'to-citizen', uploadDate: '05.08.2026', description: 'Vertrauliche Bestätigung' },
      { id: 'pd51', name: 'Gefahrenmeldung (Formular)', fileName: 'Gefahrenmeldung_anonym.pdf', direction: 'from-citizen', uploadDate: '05.08.2026' },
      { id: 'pd52', name: 'Ergänzungsbericht Schule', fileName: 'Bericht_Schulleitung.pdf', direction: 'from-citizen', uploadDate: '06.08.2026', description: 'Bericht der Schulleitung mit Beobachtungen' },
    ],
    formData: [
      { label: 'Meldende Person', value: 'Widmer Ruth, Klassenlehrerin' },
      { label: 'Institution', value: 'Primarschule Dorfname' },
      { label: 'Betroffene Person(en)', value: 'Kind S. (8 Jahre), Fam. Schneider' },
      { label: 'Art der Gefährdung', value: 'Verdacht auf Vernachlässigung' },
      { label: 'Beobachtungen', value: 'Häufiges Fehlen, mangelhafte Kleidung, Rückzugsverhalten' },
      { label: 'Dringlichkeit (Einschätzung)', value: 'Hoch' },
    ],
  },
  notes: [
    { id: 'kes-n1', date: '05.08.2026 08:30', author: 'Dr. Gerber Nicole', subject: 'Gefahrenmeldung eingegangen', text: 'Gefahrenmeldung von Klassenlehrerin Widmer Ruth (Primarschule Dorfname). Verdacht auf Vernachlässigung Kind S. (8 Jahre). Dringlichkeit: Hoch.', visibility: 'intern' },
    { id: 'kes-n2', date: '05.08.2026 11:00', author: 'Dr. Gerber Nicole', text: 'Sofortmassnahmen nicht nötig gemäss Ersteinschätzung. Abklärungsauftrag wird erteilt.', visibility: 'intern' },
    { id: 'kes-n3', date: '06.08.2026 14:15', author: 'Dr. Gerber Nicole', text: 'Ergänzungsbericht der Schulleitung via Portal eingegangen. Bestätigt regelmässiges Fehlen und Rückzugsverhalten.', visibility: 'intern' },
  ],
  participants: [
    { id: 'kes-p1', role: 'Meldende Person', roleType: 'external', name: 'Widmer Ruth', organization: 'Primarschule Dorfname', email: 'r.widmer@schule-dorf.ch', since: '05.08.2026' },
    { id: 'kes-p2', role: 'KESB-Präsidentin', roleType: 'internal', name: 'Dr. Gerber Nicole', organization: 'KESB Region', email: 'n.gerber@kesb.ch', phone: '044 987 65 43', since: '05.08.2026' },
    { id: 'kes-p3', role: 'Betroffene Familie', roleType: 'primary', name: 'Fam. Schneider', since: '05.08.2026' },
    { id: 'kes-p4', role: 'Sekretariat KESB', roleType: 'internal', name: 'Sekretariat KESB', organization: 'KESB Region', since: '05.08.2026' },
  ],
};

const DOSSIER_SONDERPAED: Dossier = {
  id: '8', number: '2026-0094', title: 'Sonderpädagogische Massnahme Bucher Tim (3. Klasse)',
  processId: 'inst-dossier-sp',
  serviceRequest: {
    id: 'sr-8', portalFormTitle: 'Sonderpädagogische Massnahme beantragen', submittedDate: '29.06.2026', submittedBy: 'Widmer Ruth (Primarschule Dorf-Ost)', email: 'r.widmer@schule-dorf.ch',
    status: 'in-bearbeitung', portalStatus: 'Fachberichte ausstehend',
    messages: [
      { id: 'm70', date: '29.06.2026 08:15', author: 'System', direction: 'to-citizen', text: 'Ihr Antrag auf eine sonderpädagogische Massnahme ist eingegangen.', read: true },
      { id: 'm71', date: '08.07.2026 14:00', author: 'Vogt Daniel', direction: 'to-citizen', text: 'Guten Tag Frau Widmer, die Triage ist abgeschlossen. Der Schulpsychologische Dienst führt eine Abklärung durch, das Einverständnis der Eltern liegt vor.', read: true },
      { id: 'm72', date: '07.08.2026 17:20', author: 'Widmer Ruth', direction: 'from-citizen', text: 'Die Abklärung ist erfolgt. Ich habe meine Unterrichtsbeobachtungen ergänzend hochgeladen.', read: true },
      { id: 'm73', date: '21.08.2026 09:40', author: 'Vogt Daniel', direction: 'to-citizen', text: 'Der SPD-Bericht liegt vor und empfiehlt integrative Förderung mit logopädischer Therapie. Der logopädische Bericht fehlt noch. Der Entscheid fällt an der Bildungskommission vom 21.10.2026.', read: false },
    ],
    portalDocuments: [
      { id: 'pd70', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_SPM_2026-0094.pdf', direction: 'to-citizen', uploadDate: '29.06.2026' },
      { id: 'pd71', name: 'Antragsformular', fileName: 'Antrag_SPM_Bucher.pdf', direction: 'from-citizen', uploadDate: '29.06.2026' },
      { id: 'pd72', name: 'Einverständnis Erziehungsberechtigte', fileName: 'Einverstaendnis_Eltern_Bucher.pdf', direction: 'from-citizen', uploadDate: '29.06.2026' },
      { id: 'pd73', name: 'Unterrichtsbeobachtungen', fileName: 'Beobachtungen_Widmer.pdf', direction: 'from-citizen', uploadDate: '07.08.2026', description: 'Ergänzung der Klassenlehrperson' },
      { id: 'pd74', name: 'SPD-Bericht', fileName: 'SPD_Bericht_Bucher.pdf', direction: 'to-citizen', uploadDate: '21.08.2026', description: 'Schulpsychologischer Abklärungsbericht mit Empfehlung' },
    ],
    formData: [
      { label: 'Kind', value: 'Bucher Tim' },
      { label: 'Geburtsdatum', value: '02.09.2017' },
      { label: 'Klasse', value: '3a, Primarschule Dorf-Ost' },
      { label: 'Antragstellende Person', value: 'Widmer Ruth, Klassenlehrperson' },
      { label: 'Beobachteter Förderbedarf', value: 'Lesen und Schreiben, Hinweise auf eine Sprachentwicklungsstörung' },
      { label: 'Einverständnis Erziehungsberechtigte', value: 'Liegt vor' },
    ],
  },
  notes: [
    { id: 'sp-n1', date: '29.06.2026 08:45', author: 'Vogt Daniel', subject: 'Antrag der Klassenlehrperson', text: 'Antrag der Klassenlehrperson für Tim Bucher (3a). Das schriftliche Einverständnis der Eltern liegt bei. Die klasseninterne Förderung läuft seit dem Schuljahr 2025/26 ohne ausreichende Wirkung.', visibility: 'intern' },
    { id: 'sp-n2', date: '08.07.2026 14:15', author: 'Vogt Daniel', text: 'Triage: Abklärung durch den Schulpsychologischen Dienst, zusätzlich eine logopädische Abklärung. Zuständig ist die Bildungskommission, weil eine verstärkte Massnahme im Raum steht.', visibility: 'intern' },
    { id: 'sp-n3', date: '21.08.2026 10:00', author: 'Vogt Daniel', subject: 'SPD-Bericht eingegangen', text: 'Der SPD empfiehlt integrative Förderung (2 Lektionen) plus logopädische Therapie, befristet auf ein Schuljahr mit Überprüfung. Kostenfolge rund CHF 12000 pro Schuljahr. Der logopädische Bericht ist ausstehend.', visibility: 'intern' },
    { id: 'sp-n4', date: '24.08.2026 09:00', author: 'Meier Sandra', text: 'Geschäft für die Bildungskommission vom 21.10.2026 traktandiert. Der logopädische Bericht muss bis 17.09.2026 vorliegen, sonst fällt das Geschäft auf die Dezembersitzung.', visibility: 'intern' },
  ],
  participants: [
    { id: 'sp-p1', role: 'Betroffenes Kind', roleType: 'primary', name: 'Bucher Tim', organization: 'Primarschule Dorf-Ost, Klasse 3a', since: '29.06.2026' },
    { id: 'sp-p2', role: 'Erziehungsberechtigte', roleType: 'external', name: 'Bucher Andrea und Bucher Marc', email: 'a.bucher@example.ch', phone: '079 345 67 89', since: '29.06.2026' },
    { id: 'sp-p3', role: 'Klassenlehrperson', roleType: 'internal', name: 'Widmer Ruth', organization: 'Primarschule Dorf-Ost', email: 'r.widmer@schule-dorf.ch', since: '29.06.2026' },
    { id: 'sp-p4', role: 'Schulleitung', roleType: 'internal', name: 'Vogt Daniel', organization: 'Primarschule Dorf-Ost', email: 'd.vogt@schule-dorf.ch', phone: '044 222 33 55', since: '29.06.2026' },
    { id: 'sp-p5', role: 'Schulpsychologischer Dienst', roleType: 'authority', name: 'Dr. Lang Miriam', organization: 'SPD Region', email: 'm.lang@spd-region.ch', since: '08.07.2026' },
    { id: 'sp-p6', role: 'Logopädischer Dienst', roleType: 'authority', name: 'Logopädischer Dienst', organization: 'Logopädie Region', since: '08.07.2026' },
    { id: 'sp-p7', role: 'Bildungskommission', roleType: 'authority', name: 'Bildungskommission', organization: 'Gemeinde Dorfname', since: '24.08.2026' },
  ],
};

// Sammelgeschaeft: laeuft einmal pro Schuljahr ueber den ganzen Jahrgang und hat
// deshalb bewusst KEINE Portal-Serviceanfrage. Es ist kein Anliegen einer
// Einwohnerin, sondern ein wiederkehrender Verwaltungsauftrag.
const DOSSIER_SCHULSTART: Dossier = {
  id: '9', number: '2026-0101', title: 'Schulstart 2027/28: Einschreibung Kindergarten',
  processId: 'inst-dossier-sei',
  notes: [
    { id: 'sei-n1', date: '01.09.2026 07:45', author: 'Meier Sandra', subject: 'Jahrgang 2027/28 eröffnet', text: 'Sammelgeschäft für die Einschreibung des Kindergarten-Jahrgangs 2027/28 eröffnet. Der ContactSync-Lauf gegen die Innosolv-EWK ist ausgelöst, danach folgen Datenqualitätsprüfung und Registrationsbriefe. Ziel: Anmeldefrist 30.09.2026.', visibility: 'intern' },
    { id: 'sei-n2', date: '01.09.2026 07:50', author: 'Vogt Daniel', subject: 'Hinweis Sorgerecht', text: 'Beim Sorgerecht nicht auf den EWK-Wert abstützen. Dort steht oft «ja», ohne dass es belegt ist. Wir brauchen das Belegdokument, sonst ist die Anmeldung angreifbar.', visibility: 'intern' },
    { id: 'sei-n3', date: '01.09.2026 07:55', author: 'Meier Sandra', text: 'Familien ohne Klapp-Konto brauchen einen separaten Weg. Letztes Jahr waren es drei, die Anmeldung haben wir dort persönlich aufgenommen.', visibility: 'intern' }
  ],
  participants: [
    { id: 'sei-p1', role: 'Leiterin Schulverwaltung', roleType: 'internal', name: 'Meier Sandra', organization: 'Schulverwaltung Dorfname', email: 's.meier@schule-dorf.ch', phone: '044 222 33 44', since: '24.08.2026' },
    { id: 'sei-p2', role: 'Schulleitung', roleType: 'internal', name: 'Vogt Daniel', organization: 'Primarschule Dorf-Ost', email: 'd.vogt@schule-dorf.ch', since: '24.08.2026' },
    { id: 'sei-p3', role: 'Vertretung Kindergarten', roleType: 'internal', name: 'Brunner Silvia', organization: 'Kindergarten Dorf-Ost', since: '27.08.2026' },
    { id: 'sei-p4', role: 'Datenlieferant Einwohnerkontrolle', roleType: 'authority', name: 'Einwohnerkontrolle Dorfname', organization: 'Gemeinde Dorfname', since: '24.08.2026' },
    { id: 'sei-p5', role: 'Fremdsystem Elternkommunikation', roleType: 'external', name: 'Klapp', organization: 'Klapp AG', since: '31.08.2026' },
    { id: 'sei-p6', role: 'Bildungskommission', roleType: 'authority', name: 'Bildungskommission', organization: 'Gemeinde Dorfname', since: '01.09.2026' },
  ],
};

const ALL_DOSSIERS: Dossier[] = [
  DOSSIER_BAUGESUCH,
  DOSSIER_AKTENEINSICHT,
  DOSSIER_EINBUERGERUNG,
  DOSSIER_GEMEINDERAT,
  DOSSIER_VERANSTALTUNG,
  DOSSIER_KESB,
  DOSSIER_SONDERPAED,
  DOSSIER_SCHULSTART,
];

// ============================================================
// SITZUNGEN
// ============================================================

const SITZUNG_GR: Sitzung = {
  id: 'sitz-gr-1',
  number: 'GR-2026-10',
  title: '10. Gemeinderatssitzung 2026',
  date: '15.10.2026',
  location: 'Gemeindehaus, Sitzungszimmer 1. OG',
  chairperson: 'Gemeindepräsident Müller Kurt',
  organization: 'Gemeinderat Dorfname',
  frequency: 'Monatlich',
  status: 'geplant',
  traktanden: [
    {
      id: 'trakt-1', number: '1', title: 'Protokoll der letzten Sitzung',
      category: 'Formelles',
      contextLinks: [],
      status: 'offen',
    },
    {
      id: 'trakt-2', number: '2', title: 'Mitteilungen des Gemeindepräsidenten',
      category: 'Formelles',
      contextLinks: [],
      status: 'offen',
    },
    {
      id: 'trakt-3', number: '3', title: 'Tempo-30-Zone Schulweg Birkenstrasse: Stellungnahme & Beschluss',
      category: 'Verkehr & Infrastruktur',
      contextLinks: [G('4')],
      status: 'offen',
      processStepIds: [{ processId: 'proc-gr', stepId: 'gr-5' }, { processId: 'proc-gr', stepId: 'gr-6' }],
    },
    {
      id: 'trakt-4', number: '4', title: 'Dorffest Sommer 2027: Veranstaltungsbewilligung',
      category: 'Bewilligungen',
      contextLinks: [G('5')],
      status: 'offen',
      processStepIds: [{ processId: 'proc-va', stepId: 'va-6' }],
    },
    {
      id: 'trakt-5', number: '5', title: 'Verschiedenes',
      category: 'Diverses',
      contextLinks: [],
      status: 'offen',
    },
  ],
  participants: [
    { id: 'sp-1', name: 'Müller Kurt', role: 'Gemeindepräsident', organization: 'Gemeinde Dorfname', status: 'zugesagt' },
    { id: 'sp-2', name: 'Schmid Andrea', role: 'Gemeindeschreiberin', organization: 'Gemeindekanzlei', status: 'zugesagt' },
    { id: 'sp-3', name: 'Meier Hans', role: 'Ressort Verkehr', organization: 'Gemeinderat', status: 'zugesagt' },
    { id: 'sp-4', name: 'Bauer Werner', role: 'Ressort Finanzen', organization: 'Gemeinderat', status: 'zugesagt' },
    { id: 'sp-5', name: 'Fischer Elisabeth', role: 'Ressort Bildung', organization: 'Gemeinderat', status: 'eingeladen' },
  ],
  documents: [
    { id: 'sd-1', name: 'Einladung GR-Sitzung 15.10.2026', fileName: 'Einladung_GR_2026-10.pdf', type: 'einladung', uploadDate: '08.10.2026' },
    { id: 'sd-2', name: 'Protokoll 9. Sitzung', fileName: 'Protokoll_GR_2026-09.pdf', type: 'protokoll', uploadDate: '25.09.2026' },
    { id: 'sd-3', name: 'Stellungnahme Tempo-30 Birkenstrasse', fileName: 'Stellungnahme_T30.pdf', type: 'traktandum', uploadDate: '10.10.2026' },
    { id: 'sd-4', name: 'Gesuch Dorffest inkl. Fachberichte', fileName: 'Dorffest_Unterlagen.pdf', type: 'traktandum', uploadDate: '10.10.2026' },
  ],
};

const SITZUNG_GV: Sitzung = {
  id: 'sitz-gv-1',
  number: 'GV-2027-06',
  title: 'Gemeindeversammlung Sommer 2027',
  date: '18.06.2027',
  location: 'Mehrzweckhalle Dorfname',
  chairperson: 'Gemeindepräsident Müller Kurt',
  organization: 'Gemeinde Dorfname',
  frequency: 'Halbjährlich',
  status: 'geplant',
  traktanden: [
    {
      id: 'trakt-gv-1', number: '1', title: 'Begrüssung und Wahl der Stimmenzähler',
      category: 'Formelles',
      contextLinks: [],
      status: 'offen',
    },
    {
      id: 'trakt-gv-2', number: '2', title: 'Protokoll der letzten Gemeindeversammlung',
      category: 'Formelles',
      contextLinks: [],
      status: 'offen',
    },
    {
      id: 'trakt-gv-3', number: '3', title: 'Einbürgerungsgesuch Rossi Marco',
      category: 'Einbürgerungen',
      contextLinks: [G('3')],
      status: 'offen',
      processStepIds: [{ processId: 'proc-eb', stepId: 'eb-6' }],
    },
    {
      id: 'trakt-gv-4', number: '4', title: 'Verschiedenes',
      category: 'Diverses',
      contextLinks: [],
      status: 'offen',
    },
  ],
  participants: [
    { id: 'sp-gv-1', name: 'Müller Kurt', role: 'Gemeindepräsident', organization: 'Gemeinde Dorfname', status: 'zugesagt' },
    { id: 'sp-gv-2', name: 'Schmid Andrea', role: 'Gemeindeschreiberin', organization: 'Gemeindekanzlei', status: 'zugesagt' },
  ],
  documents: [
    { id: 'sd-gv-1', name: 'Einladung Gemeindeversammlung', fileName: 'Einladung_GV_2027-06.pdf', type: 'einladung', uploadDate: '28.05.2027' },
  ],
};

const SITZUNG_KESB: Sitzung = {
  id: 'sitz-kesb-1',
  number: 'KESB-2026-16',
  title: 'KESB-Spruchkörpersitzung',
  date: '17.11.2026',
  location: 'KESB-Geschäftsstelle, Raum 3',
  chairperson: 'Dr. Gerber Nicole',
  organization: 'KESB Region',
  frequency: 'Wöchentlich',
  status: 'geplant',
  traktanden: [
    {
      id: 'trakt-k-1', number: '1', title: 'Pendenzen aus letzter Sitzung',
      category: 'Formelles',
      contextLinks: [],
      status: 'offen',
    },
    {
      id: 'trakt-k-2', number: '2', title: 'Gefahrenmeldung Fam. Schneider: Entscheid',
      category: 'Kindesschutz',
      contextLinks: [G('6')],
      status: 'offen',
      processStepIds: [{ processId: 'proc-kesb', stepId: 'kes-6' }],
    },
    {
      id: 'trakt-k-3', number: '3', title: 'Verschiedenes',
      category: 'Diverses',
      contextLinks: [],
      status: 'offen',
    },
  ],
  participants: [
    { id: 'sp-k-1', name: 'Dr. Gerber Nicole', role: 'Präsidentin', organization: 'KESB Region', status: 'zugesagt' },
    { id: 'sp-k-2', name: 'Lic. iur. Hofer Daniel', role: 'Mitglied', organization: 'KESB Region', status: 'zugesagt' },
    { id: 'sp-k-3', name: 'Dr. Roth Sandra', role: 'Mitglied', organization: 'KESB Region', status: 'zugesagt' },
  ],
  documents: [
    { id: 'sd-k-1', name: 'Traktandenliste KESB-2026-16', fileName: 'Traktanden_KESB_16.pdf', type: 'einladung', uploadDate: '12.11.2026' },
    { id: 'sd-k-2', name: 'Abklärungsbericht Schneider (Entwurf)', fileName: 'Abklaerung_Schneider.pdf', type: 'traktandum', uploadDate: '13.11.2026' },
  ],
};

const SITZUNG_BK: Sitzung = {
  id: 'sitz-bk-1',
  number: 'BK-2026-05',
  title: '5. Sitzung Bildungskommission 2026',
  date: '21.10.2026',
  location: 'Primarschule Dorf-Ost, Sitzungszimmer',
  chairperson: 'Fischer Elisabeth, Ressort Bildung',
  organization: 'Bildungskommission Dorfname',
  frequency: 'Sechsmal jährlich',
  status: 'geplant',
  traktanden: [
    {
      id: 'trakt-bk-1', number: '1', title: 'Protokoll der letzten Sitzung',
      category: 'Formelles',
      contextLinks: [],
      status: 'offen',
    },
    {
      id: 'trakt-bk-2', number: '2', title: 'Mitteilungen der Schulleitung',
      category: 'Formelles',
      contextLinks: [],
      status: 'offen',
    },
    {
      id: 'trakt-bk-3', number: '3', title: 'Sonderpädagogische Massnahme Bucher Tim: Antrag integrative Förderung und Logopädie',
      category: 'Sonderpädagogik',
      contextLinks: [G('8')],
      status: 'offen',
      processStepIds: [{ processId: 'proc-sp', stepId: 'sp-7' }],
    },
    {
      id: 'trakt-bk-4', number: '4', title: 'Schulraumplanung 2027 bis 2032: Zwischenbericht',
      category: 'Schulraum',
      contextLinks: [],
      status: 'zur-kenntnis',
    },
    {
      id: 'trakt-bk-5', number: '5', title: 'Schulstart 2027/28: Zwischenbericht Einschreibung Kindergarten',
      category: 'Schulstart',
      contextLinks: [G('9')],
      status: 'zur-kenntnis',
      processStepIds: [{ processId: 'proc-sei', stepId: 'sei-7' }],
    },
    {
      id: 'trakt-bk-6', number: '6', title: 'Verschiedenes',
      category: 'Diverses',
      contextLinks: [],
      status: 'offen',
    },
  ],
  participants: [
    { id: 'bp-1', name: 'Fischer Elisabeth', role: 'Präsidentin, Ressort Bildung', organization: 'Gemeinderat', status: 'zugesagt' },
    { id: 'bp-2', name: 'Vogt Daniel', role: 'Schulleiter', organization: 'Primarschule Dorf-Ost', status: 'zugesagt' },
    { id: 'bp-3', name: 'Meier Sandra', role: 'Leiterin Schulverwaltung, Aktuarin', organization: 'Schulverwaltung Dorfname', status: 'zugesagt' },
    { id: 'bp-4', name: 'Brunner Silvia', role: 'Vertretung Kindergarten', organization: 'Kindergarten Dorf-Ost', status: 'zugesagt' },
    { id: 'bp-5', name: 'Dr. Lang Miriam', role: 'Schulpsychologischer Dienst', organization: 'SPD Region', status: 'eingeladen' },
    { id: 'bp-6', name: 'Keller Andreas', role: 'Elternvertretung', organization: 'Elternrat Dorfname', status: 'eingeladen' },
  ],
  documents: [
    { id: 'sd-bk-1', name: 'Einladung Bildungskommission 21.10.2026', fileName: 'Einladung_BK_2026-05.pdf', type: 'einladung', uploadDate: '14.10.2026' },
    { id: 'sd-bk-2', name: 'Protokoll 4. Sitzung', fileName: 'Protokoll_BK_2026-04.pdf', type: 'protokoll', uploadDate: '08.09.2026' },
    { id: 'sd-bk-4', name: 'Antrag sonderpädagogische Massnahme Bucher', fileName: 'Antrag_SPM_Bucher_BK.pdf', type: 'traktandum', uploadDate: '15.10.2026' },
    { id: 'sd-bk-5', name: 'Zwischenbericht Schulraumplanung 2027 bis 2032', fileName: 'Schulraumplanung_Zwischenbericht.pdf', type: 'beilage', uploadDate: '12.10.2026' },
  ],
};

const ALL_SITZUNGEN: Sitzung[] = [SITZUNG_GR, SITZUNG_GV, SITZUNG_KESB, SITZUNG_BK];

// ============================================================
// INITIAL TABS
// ============================================================

const INITIAL_TABS: AppTab[] = [
  { id: 'tab-proc-bau', type: 'prozess', referenceId: 'proc-bau', label: 'Baugesuchsverfahren' },
  { id: 'tab-dos-1', type: 'geschaeft', referenceId: '1', label: 'Umbau Gebäude (Heizungsänderung und Dachstockausbau)', number: '2026-0009' },
  { id: 'tab-sitz-gr-1', type: 'sitzung', referenceId: 'sitz-gr-1', label: '10. Gemeinderatssitzung 2026', number: 'GR-2026-10' },
];
