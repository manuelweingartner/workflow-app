import { Injectable, signal, computed } from '@angular/core';
import {
  Process, ProcessStep, Dossier, ContextObject, ContextLink,
  Input, Task, CompletionCriterion, PortalMessage, PortalDocument, Note, Participant,
  AppTab, TabType, Sitzung,
} from '../models/process.model';

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
  private _processes = signal<Process[]>(ALL_PROCESSES);
  private _contextObjects = signal<ContextObject[]>(ALL_CONTEXT_OBJECTS);
  private _dossiers = signal<Dossier[]>(ALL_DOSSIERS);
  private _sitzungen = signal<Sitzung[]>(ALL_SITZUNGEN);

  // --- Tab system ---
  private _tabs = signal<AppTab[]>(INITIAL_TABS);
  private _activeTabId = signal<string>('tab-proc-bau');
  private selectedStepId = signal<string | null>(null);
  private _activeMenu = signal('process');

  readonly tabs = this._tabs.asReadonly();
  readonly activeTabId = this._activeTabId.asReadonly();
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

  // --- All steps of the active process ---
  readonly steps = computed(() => this.activeProcess()?.steps ?? []);

  // --- Context: in Geschäft-view the dossier is the active context ---
  readonly activeContextId = computed(() => {
    const tab = this.activeTab();
    return tab.type === 'geschaeft' ? tab.referenceId : null;
  });

  // --- Steps linked to the active context (dossier/geschäft) ---
  readonly stepsForActiveContext = computed(() => {
    const ctxId = this.activeContextId();
    if (!ctxId) return this.steps();
    return this.steps().filter((s) =>
      s.contextLinks.some((cl) => cl.contextId === ctxId)
    );
  });

  // --- Check if a step is linked to the active context ---
  isStepLinkedToContext(stepId: string): boolean {
    const ctxId = this.activeContextId();
    if (!ctxId) return true; // in Prozess-view all steps belong
    const step = this.steps().find((s) => s.id === stepId);
    return step?.contextLinks.some((cl) => cl.contextId === ctxId) ?? false;
  }

  // --- Resolve context object by id ---
  getContextObject(id: string): ContextObject | undefined {
    return this._contextObjects().find((c) => c.id === id);
  }

  // --- Resolve context links for a step ---
  getContextsForStep(stepId: string): ContextObject[] {
    const step = this.steps().find((s) => s.id === stepId);
    if (!step) return [];
    return step.contextLinks
      .map((cl) => this.getContextObject(cl.contextId))
      .filter((c): c is ContextObject => !!c);
  }

  readonly selectedStep = computed(() => {
    const id = this.selectedStepId();
    return id ? this.steps().find((s) => s.id === id) ?? null : null;
  });

  readonly progress = computed(() => {
    const s = this.steps();
    const done = s.filter((x) => x.status === 'completed').length;
    return { done, total: s.length };
  });

  readonly contextProgress = computed(() => {
    const s = this.stepsForActiveContext();
    const done = s.filter((x) => x.status === 'completed').length;
    return { done, total: s.length };
  });

  readonly allDocuments = computed<LinkedDocument[]>(() =>
    this.steps().flatMap((step) =>
      step.inputs
        .filter((i) => i.type === 'document')
        .map((input) => ({ input, stepId: step.id, stepNumber: step.number, stepTitle: step.title }))
    )
  );

  readonly allTasks = computed<LinkedTask[]>(() =>
    this.steps().flatMap((step) =>
      step.tasks.map((task) => ({ task, stepId: step.id, stepNumber: step.number, stepTitle: step.title }))
    )
  );

  readonly allFields = computed<LinkedField[]>(() =>
    this.steps().flatMap((step) =>
      step.inputs
        .filter((i) => i.type === 'field')
        .map((input) => ({ input, stepId: step.id, stepNumber: step.number, stepTitle: step.title }))
    )
  );

  readonly notes = computed<Note[]>(() => this.dossier$().notes);
  readonly participants = computed<Participant[]>(() => this.dossier$().participants);

  // --- Tab management ---

  openTab(type: TabType, referenceId: string) {
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

  readonly isDashboard = computed(() => this._tabs().length === 0);

  switchTab(tabId: string) {
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

  insertStepAfter(afterId: string) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    const idx = p.steps.findIndex((s) => s.id === afterId);
    if (idx === -1) return;
    const newStep: ProcessStep = {
      id: crypto.randomUUID(),
      number: 'NEU',
      title: 'Neuer Prozessschritt',
      status: 'pending',
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

  updateStep(updated: ProcessStep) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    const idx = p.steps.findIndex((s) => s.id === updated.id);
    if (idx !== -1) {
      p.steps[idx] = updated;
      this.updateProcess(p);
    }
  }

  addTaskToStep(stepId: string, title: string, assignee: string) {
    const step = this.steps().find((s) => s.id === stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.tasks.push({ id: crypto.randomUUID(), title, assignee, status: 'open' });
    this.updateStep(updated);
  }

  removeTaskFromStep(stepId: string, taskId: string) {
    const step = this.steps().find((s) => s.id === stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.tasks = updated.tasks.filter((t) => t.id !== taskId);
    this.updateStep(updated);
  }

  addCriterionToStep(stepId: string, description: string, suggestedNextStep?: string) {
    const step = this.steps().find((s) => s.id === stepId);
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
    const step = this.steps().find((s) => s.id === stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.completionCriteria = updated.completionCriteria.filter((c) => c.id !== criterionId);
    this.updateStep(updated);
  }

  toggleTaskStatus(stepId: string, taskId: string) {
    const step = this.steps().find((s) => s.id === stepId);
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
    const step = this.steps().find((s) => s.id === stepId);
    if (!step || step.status === 'completed') return;
    const updated = structuredClone(step);
    const c = updated.completionCriteria.find((x) => x.id === criterionId);
    if (!c) return;
    c.met = !c.met;
    this.updateStep(updated);
  }

  canCompleteStep(stepId: string): boolean {
    const step = this.steps().find((s) => s.id === stepId);
    if (!step || step.status !== 'in-progress') return false;
    const allCriteriaMet = step.completionCriteria.length === 0 || step.completionCriteria.every((c) => c.met);
    const allTasksDone = step.tasks.length === 0 || step.tasks.every((t) => t.status === 'done');
    return allCriteriaMet && allTasksDone;
  }

  completeStep(stepId: string) {
    const proc = this.activeProcess();
    if (!proc) return;
    const p = structuredClone(proc);
    const idx = p.steps.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    p.steps[idx].status = 'completed';
    p.steps[idx].completedDate = new Date().toLocaleDateString('de-CH');
    if (idx + 1 < p.steps.length && p.steps[idx + 1].status === 'pending') {
      p.steps[idx + 1].status = 'in-progress';
    }
    this.updateProcess(p);
    if (idx + 1 < p.steps.length) {
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
    const step = this.steps().find((s) => s.id === stepId);
    if (!step || step.status === 'completed') return;
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
    const step = this.steps().find((s) => s.id === stepId);
    if (!step) return;
    const updated = structuredClone(step);
    if (!updated.contextLinks.some((cl) => cl.contextId === link.contextId)) {
      updated.contextLinks.push(link);
      this.updateStep(updated);
    }
  }

  removeContextLinkFromStep(stepId: string, contextId: string) {
    const step = this.steps().find((s) => s.id === stepId);
    if (!step) return;
    const updated = structuredClone(step);
    updated.contextLinks = updated.contextLinks.filter((cl) => cl.contextId !== contextId);
    this.updateStep(updated);
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

const CTX_BAUGESUCH: ContextObject = { id: '1', type: 'geschaeft', number: '2024-0009', title: 'Umbau Gebäude (Heizungsänderung und Dachstockausbau)' };
const CTX_AKTENEINSICHT: ContextObject = { id: '2', type: 'geschaeft', number: '2025-0042', title: 'Akteneinsicht Verkehrsplanung Dorfzentrum' };
const CTX_EINBUERGERUNG: ContextObject = { id: '3', type: 'geschaeft', number: '2025-0018', title: 'Einbürgerungsgesuch Rossi Marco' };
const CTX_GEMEINDERAT: ContextObject = { id: '4', type: 'geschaeft', number: '2025-0055', title: 'Anfrage Tempo-30-Zone Schulweg Birkenstrasse' };
const CTX_VERANSTALTUNG: ContextObject = { id: '5', type: 'geschaeft', number: '2025-0071', title: 'Dorffest Sommer 2025' };
const CTX_KESB: ContextObject = { id: '6', type: 'geschaeft', number: '2025-KES-0012', title: 'KESB-Gefahrenmeldung Fam. Schneider' };

// Sitzungen — steps from different processes can link here
const CTX_SITZUNG_GR: ContextObject = { id: 'sitz-gr-1', type: 'sitzung', number: 'GR-2025-04', title: 'Gemeinderatssitzung 15.04.2025', icon: 'event' };
const CTX_SITZUNG_GV: ContextObject = { id: 'sitz-gv-1', type: 'sitzung', number: 'GV-2025-06', title: 'Gemeindeversammlung 20.06.2025', icon: 'event' };
const CTX_SITZUNG_KESB: ContextObject = { id: 'sitz-kesb-1', type: 'sitzung', number: 'KESB-2025-12', title: 'KESB-Sitzung 28.03.2025', icon: 'event' };

const ALL_CONTEXT_OBJECTS: ContextObject[] = [
  CTX_BAUGESUCH, CTX_AKTENEINSICHT, CTX_EINBUERGERUNG, CTX_GEMEINDERAT, CTX_VERANSTALTUNG, CTX_KESB,
  CTX_SITZUNG_GR, CTX_SITZUNG_GV, CTX_SITZUNG_KESB,
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
      id: '1', number: '6701', title: 'Baugesuch beantragt', status: 'completed', completedDate: '21.02.2024',
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
        { id: 'i3', type: 'document', label: 'Baugesuchsformular', required: true, documentName: 'Baugesuch_2024.pdf', uploaded: true },
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
      id: '2', number: '6811', title: 'Vollständigkeitsprüfung', status: 'completed', completedDate: '28.02.2024',
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
      id: '3', number: '6855', title: 'Öffentliche Auflage', status: 'completed', completedDate: '15.03.2024',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bewilligungsverfahren',
      stepType: 'subprocess',
      subSteps: [
        { id: '3a', number: '6855.1', title: 'Publikation im Amtsblatt', status: 'completed', completedDate: '15.03.2024', responsible: 'Oberholzer Martin', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: '3b', number: '6855.2', title: 'Auflage durchführen (30 Tage)', status: 'completed', completedDate: '14.04.2024', responsible: 'Oberholzer Martin', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
        { id: '3c', number: '6855.3', title: 'Einsprachen sammeln & prüfen', status: 'completed', completedDate: '15.04.2024', responsible: 'Oberholzer Martin', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] },
      ],
      contextLinks: [G('1')],
      tasks: [
        { id: 't6', title: 'Publikation im Amtsblatt', assignee: 'Oberholzer Martin', status: 'done' },
        { id: 't7', title: 'Auflage durchführen (30 Tage)', assignee: 'Oberholzer Martin', status: 'done' },
        { id: 't8', title: 'Einsprachen sammeln', assignee: 'Oberholzer Martin', status: 'done' },
      ],
      inputs: [
        { id: 'i6', type: 'field', label: 'Publikationsdatum', value: '15.03.2024', required: true, fieldType: 'date', thematicGroup: 'Verfahren' },
        { id: 'i7', type: 'field', label: 'Anzahl Einsprachen', value: '0', required: false, fieldType: 'number', thematicGroup: 'Verfahren' },
      ],
      actions: [],
      completionCriteria: [{ id: 'c4', description: 'Auflagefrist abgelaufen', met: true }],
      conditionals: [{ id: 'co2', condition: 'Anzahl Einsprachen > 0', thenAction: 'Schritt "Einspracheverfahren" einfügen' }],
    },
    {
      id: '4', number: '6900', title: 'Fachberichte einholen', status: 'completed', completedDate: '20.04.2024',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bewilligungsverfahren',
      stepType: 'parallel',
      parallelPaths: [
        [{ id: '4a', number: '6900.1', title: 'Brandschutz-Bericht', status: 'completed', completedDate: '10.04.2024', responsible: 'Feuerpolizei', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: '4b', number: '6900.2', title: 'Statik-Bericht', status: 'completed', completedDate: '15.04.2024', responsible: 'Muster Ingenieure AG', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
        [{ id: '4c', number: '6900.3', title: 'Energienachweis', status: 'completed', completedDate: '18.04.2024', responsible: 'Energieberatung', category: 'Bewilligungsverfahren', contextLinks: [G('1')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
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
      id: '5', number: '6781', title: 'Baubewilligung prüfen', status: 'in-progress', dueDate: '15.08.2025',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bewilligungsverfahren',
      stepType: 'decision',
      branches: [
        { id: 'b5-1', label: 'Bewilligt', condition: 'Entscheid == "Bewilligt"', targetStepIds: ['6'] },
        { id: 'b5-2', label: 'Mit Auflagen', condition: 'Entscheid == "Bewilligt mit Auflagen"', targetStepIds: ['6'] },
        { id: 'b5-3', label: 'Abgelehnt', condition: 'Entscheid == "Abgelehnt"', targetStepIds: ['11'] },
      ],
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
      id: '6', number: '7010', title: 'Bewilligung versenden', status: 'pending', dueDate: '15.08.2025',
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
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bauetappe',
      loopBackToStepId: '8',
      loopCondition: 'Resultat == "Mängel festgestellt"',
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
      id: '9', number: '7300', title: 'Schlusskontrolle', status: 'pending',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bauetappe',
      contextLinks: [G('1')],
      tasks: [{ id: 't20', title: 'Schlusskontrolle vor Ort', assignee: 'Oberholzer Martin', status: 'open' }],
      inputs: [{ id: 'i17', type: 'document', label: 'Schluss-Kontrollbericht', required: true, uploaded: false }],
      actions: [],
      completionCriteria: [{ id: 'c12', description: 'Schlusskontrolle bestanden', met: false }],
      conditionals: [],
    },
    {
      id: '10', number: '7400', title: 'Bezugsbewilligung', status: 'pending',
      responsible: 'Oberholzer Martin, Bauverwalter', category: 'Bauetappe',
      contextLinks: [G('1')],
      tasks: [{ id: 't21', title: 'Bezugsbewilligung ausstellen', assignee: 'Oberholzer Martin', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'c13', description: 'Bezugsbewilligung erteilt', met: false }],
      conditionals: [],
    },
    {
      id: '11', number: '7500', title: 'Verfahren abgeschlossen', status: 'pending',
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
      id: 'ae-1', number: '1001', title: 'Antrag eingegangen', status: 'completed', completedDate: '10.03.2025',
      responsible: 'System (Portal)', category: 'Akteneinsicht',
      contextLinks: [G('2')],
      tasks: [
        { id: 'ae-t1', title: 'Portal-Formular validieren', assignee: 'System', status: 'done' },
        { id: 'ae-t2', title: 'Eingangsbestätigung senden', assignee: 'System', status: 'done' },
      ],
      inputs: [
        { id: 'ae-i1', type: 'field', label: 'Antragsteller', value: 'Keller Thomas', required: true, fieldType: 'text', thematicGroup: 'Antragsteller' },
        { id: 'ae-i2', type: 'field', label: 'Betroffenes Dossier', value: 'Verkehrsplanung Dorfzentrum 2024', required: true, fieldType: 'text', thematicGroup: 'Gegenstand' },
      ],
      actions: [{ id: 'ae-a1', label: 'Eingangsbestätigung via Portal', type: 'standard', description: 'Automatische Bestätigung im CMI Portal' }],
      completionCriteria: [{ id: 'ae-c1', description: 'Antrag registriert', met: true }],
      conditionals: [],
    },
    {
      id: 'ae-2', number: '1002', title: 'Vorprüfung des Antrags', status: 'completed', completedDate: '11.03.2025',
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
      id: 'ae-3', number: '1003', title: 'Identitätsprüfung', status: 'in-progress', dueDate: '20.03.2025',
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
      id: 'eb-1', number: '2001', title: 'Gesuch eingegangen', status: 'completed', completedDate: '15.01.2025',
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
      id: 'eb-2', number: '2002', title: 'Vollständigkeitsprüfung', status: 'completed', completedDate: '18.01.2025',
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
      id: 'eb-3', number: '2003', title: 'Abklärung Wohnsitzdauer', status: 'completed', completedDate: '20.01.2025',
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
      id: 'eb-4', number: '2004', title: 'Sprachprüfung / Integration', status: 'in-progress', dueDate: '28.02.2025',
      responsible: 'Huber Peter, Einwohnerdienste', category: 'Einbürgerung',
      stepType: 'parallel',
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
      responsible: 'Einbürgerungskommission', category: 'Einbürgerung',
      stepType: 'decision',
      branches: [
        { id: 'beb-1', label: 'Empfohlen', condition: 'Empfehlung == "Empfohlen"', targetStepIds: ['eb-6'] },
        { id: 'beb-2', label: 'Nicht empfohlen', condition: 'Empfehlung == "Nicht empfohlen"', targetStepIds: ['eb-9'] },
        { id: 'beb-3', label: 'Zurückgestellt', condition: 'Empfehlung == "Zurückgestellt"', targetStepIds: ['eb-4'] },
      ],
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
      id: 'eb-6', number: '2006', title: 'Gemeindeversammlungsbeschluss', status: 'pending',
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
      id: 'gr-1', number: '3001', title: 'Anfrage eingegangen', status: 'completed', completedDate: '01.03.2025',
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
      id: 'gr-2', number: '3002', title: 'Vorprüfung & Triage', status: 'completed', completedDate: '03.03.2025',
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
      id: 'gr-3', number: '3003', title: 'Zuständiges Ressort zuweisen', status: 'in-progress', dueDate: '15.03.2025',
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
      responsible: 'Gemeinderat', category: 'Gemeinderat',
      stepType: 'decision',
      branches: [
        { id: 'bgr-1', label: 'Angenommen', condition: 'Beschluss == "Angenommen"', targetStepIds: ['gr-7'] },
        { id: 'bgr-2', label: 'Abgelehnt', condition: 'Beschluss == "Abgelehnt"', targetStepIds: ['gr-7'] },
        { id: 'bgr-3', label: 'Zurückgestellt', condition: 'Beschluss == "Zurückgestellt"', targetStepIds: ['gr-4'] },
      ],
      contextLinks: [G('4'), S('sitz-gr-1')],  // linked to Geschäft AND Sitzung!
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
      id: 'gr-7', number: '3007', title: 'Antwort an Antragsteller:in', status: 'pending',
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
      id: 'va-1', number: '4001', title: 'Gesuch eingegangen', status: 'completed', completedDate: '20.02.2025',
      responsible: 'System (Portal)', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [
        { id: 'va-t1', title: 'Portal-Formular validieren', assignee: 'System', status: 'done' },
        { id: 'va-t2', title: 'Eingangsbestätigung senden', assignee: 'System', status: 'done' },
      ],
      inputs: [
        { id: 'va-i1', type: 'field', label: 'Veranstalter', value: 'Turnverein Dorfname', required: true, fieldType: 'text', thematicGroup: 'Veranstalter' },
        { id: 'va-i2', type: 'field', label: 'Veranstaltung', value: 'Dorffest Sommer 2025', required: true, fieldType: 'text', thematicGroup: 'Veranstaltung' },
        { id: 'va-i3', type: 'field', label: 'Datum', value: '21.06.2025 – 22.06.2025', required: true, fieldType: 'text', thematicGroup: 'Veranstaltung' },
      ],
      actions: [{ id: 'va-a1', label: 'Eingangsbestätigung', type: 'standard', description: 'Portal-Bestätigung' }],
      completionCriteria: [{ id: 'va-c1', description: 'Gesuch registriert', met: true }],
      conditionals: [],
    },
    {
      id: 'va-2', number: '4002', title: 'Vollständigkeitsprüfung', status: 'completed', completedDate: '22.02.2025',
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
      id: 'va-3', number: '4003', title: 'Risikobeurteilung', status: 'completed', completedDate: '28.02.2025',
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
      id: 'va-4', number: '4004', title: 'Fachstellen-Vernehmlassung', status: 'in-progress', dueDate: '20.03.2025',
      responsible: 'Frei Barbara, Gemeindekanzlei', category: 'Veranstaltung',
      stepType: 'parallel',
      parallelPaths: [
        [{ id: 'va-4a', number: '4004.1', title: 'Feuerpolizei', status: 'completed', completedDate: '05.03.2025', responsible: 'Feuerpolizei', category: 'Veranstaltung', contextLinks: [G('5')], tasks: [], inputs: [], actions: [], completionCriteria: [], conditionals: [] }],
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
      responsible: 'Steiner Anna, Veranstalter', category: 'Veranstaltung',
      contextLinks: [G('5')],
      tasks: [{ id: 'va-t16', title: 'Auflagen-Checkliste vor Ort prüfen', assignee: 'Frei Barbara', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'va-c7', description: 'Veranstaltung durchgeführt', met: false }],
      conditionals: [],
    },
    {
      id: 'va-8', number: '4008', title: 'Nachbearbeitung', status: 'pending',
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
      id: 'kes-1', number: '5001', title: 'Gefahrenmeldung eingegangen', status: 'completed', completedDate: '05.03.2025',
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
      id: 'kes-2', number: '5002', title: 'Dringlichkeitsprüfung', status: 'completed', completedDate: '05.03.2025',
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
      id: 'kes-3', number: '5003', title: 'Abklärungsauftrag erteilen', status: 'in-progress', dueDate: '15.03.2025',
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
      responsible: 'Abklärungsperson (mandatiert)', category: 'KESB',
      stepType: 'subprocess',
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
      responsible: 'KESB-Spruchkörper', category: 'KESB',
      stepType: 'decision',
      branches: [
        { id: 'bkes-1', label: 'Keine Massnahme', condition: 'Entscheid == "Keine Massnahme"', targetStepIds: ['kes-9'] },
        { id: 'bkes-2', label: 'Beistandschaft', condition: 'Entscheid == "Beistandschaft"', targetStepIds: ['kes-7'] },
        { id: 'bkes-3', label: 'Obhutsentzug', condition: 'Entscheid == "Obhutsentzug"', targetStepIds: ['kes-7'] },
        { id: 'bkes-4', label: 'Freiwillig', condition: 'Entscheid == "Freiwillige Massnahme"', targetStepIds: ['kes-7'] },
      ],
      contextLinks: [G('6'), S('sitz-kesb-1')],  // linked to Geschäft AND Sitzung!
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
      id: 'kes-7', number: '5007', title: 'Massnahme anordnen', status: 'pending',
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
      responsible: 'Dr. Gerber Nicole, KESB-Präsidentin', category: 'KESB',
      contextLinks: [G('6')],
      tasks: [{ id: 'kes-t22', title: 'Dossier archivieren', assignee: 'Sekretariat KESB', status: 'open' }],
      inputs: [], actions: [],
      completionCriteria: [{ id: 'kes-c10', description: 'Dossier archiviert', met: false }],
      conditionals: [],
    },
  ],
};

const ALL_PROCESSES: Process[] = [
  PROCESS_BAUGESUCH,
  PROCESS_AKTENEINSICHT,
  PROCESS_EINBUERGERUNG,
  PROCESS_GEMEINDERAT,
  PROCESS_VERANSTALTUNG,
  PROCESS_KESB,
];

// ============================================================
// DOSSIERS — now reference processes via processId
// ============================================================

const DOSSIER_BAUGESUCH: Dossier = {
  id: '1', number: '2024-0009', title: 'Umbau Gebäude (Heizungsänderung und Dachstockausbau)',
  processId: 'proc-bau',
  serviceRequest: {
    id: 'sr-1', portalFormTitle: 'Baugesuch einreichen', submittedDate: '20.02.2024', submittedBy: 'Müller Sarah', email: 's.mueller@example.ch',
    status: 'in-bearbeitung', portalStatus: 'Ihr Baugesuch wird aktuell geprüft',
    messages: [
      { id: 'm1', date: '21.02.2024 09:15', author: 'System', direction: 'to-citizen', text: 'Ihr Baugesuch wurde erfolgreich eingereicht und wird nun geprüft.', read: true },
      { id: 'm2', date: '28.02.2024 14:30', author: 'Oberholzer Martin', direction: 'to-citizen', text: 'Guten Tag Frau Müller, die Vollständigkeitsprüfung Ihres Baugesuchs ist abgeschlossen. Alle Unterlagen sind vollständig. Das Verfahren wird fortgesetzt.', read: true },
      { id: 'm3', date: '01.03.2024 10:00', author: 'Müller Sarah', direction: 'from-citizen', text: 'Vielen Dank für die Rückmeldung. Wie lange dauert das Verfahren voraussichtlich?', read: true },
      { id: 'm4', date: '01.03.2024 15:45', author: 'Oberholzer Martin', direction: 'to-citizen', text: 'Das Verfahren dauert in der Regel 3-6 Monate. Sie werden über jeden Schritt informiert.', read: true },
    ],
    portalDocuments: [
      { id: 'pd1', name: 'Eingangsbestätigung', fileName: 'Eingangsbestaetigung_2024-0009.pdf', direction: 'to-citizen', uploadDate: '21.02.2024', description: 'Offizielle Eingangsbestätigung' },
      { id: 'pd2', name: 'Baugesuchsformular', fileName: 'Baugesuch_2024.pdf', direction: 'from-citizen', uploadDate: '20.02.2024' },
      { id: 'pd3', name: 'Situationsplan', fileName: 'Situationsplan.pdf', direction: 'from-citizen', uploadDate: '20.02.2024' },
    ],
    formData: [
      { label: 'Gesuchsteller', value: 'Müller Sarah' },
      { label: 'Adresse', value: 'Dorfstrasse 15, 8000 Zürich' },
      { label: 'Parzelle', value: '1234' },
      { label: 'Vorhaben', value: 'Umbau Gebäude (Heizungsänderung und Dachstockausbau)' },
      { label: 'Geschätzte Kosten', value: "CHF 180'000" },
      { label: 'Geplanter Baubeginn', value: '01.09.2025' },
    ],
  },
  notes: [
    { id: 'n1', date: '21.02.2024 09:30', author: 'Oberholzer Martin', subject: 'Eingang Baugesuch', text: 'Baugesuch für Umbau Gebäude ist eingegangen. Unterlagen vollständig, Verfahren wird eingeleitet.', visibility: 'intern' },
    { id: 'n2', date: '28.02.2024 15:00', author: 'Oberholzer Martin', subject: 'Vollständigkeitsprüfung OK', text: 'Alle Unterlagen geprüft und für vollständig befunden. Weiter mit öffentlicher Auflage.', visibility: 'intern' },
    { id: 'n3', date: '20.04.2024 11:00', author: 'Oberholzer Martin', text: 'Fachberichte von Brandschutz, Statik und Energie sind alle positiv eingetroffen. Keine offenen Auflagen.', visibility: 'intern' },
    { id: 'n4', date: '15.03.2024 08:00', author: 'System', subject: 'Öffentliche Auflage abgeschlossen', text: 'Auflagefrist ohne Einsprachen abgelaufen.', visibility: 'extern' },
  ],
  participants: [
    { id: 'p1', role: 'Gesuchsteller:in', roleType: 'primary', name: 'Müller Sarah', email: 's.mueller@example.ch', phone: '079 123 45 67', since: '21.02.2024' },
    { id: 'p2', role: 'Bauverwalter', roleType: 'internal', name: 'Oberholzer Martin', organization: 'Gemeinde Dorfname', email: 'm.oberholzer@gemeinde.ch', phone: '044 987 65 43', since: '21.02.2024' },
    { id: 'p3', role: 'Architekt', roleType: 'external', name: 'Schmid Roland', organization: 'Schmid Architekten AG', email: 'r.schmid@architekten.ch', since: '21.02.2024' },
    { id: 'p4', role: 'Brandschutz', roleType: 'authority', name: 'Feuerpolizei Kanton', organization: 'Gebäudeversicherung', since: '15.03.2024' },
    { id: 'p5', role: 'Statik', roleType: 'authority', name: 'Muster Ingenieure AG', organization: 'Muster Ingenieure AG', email: 'info@muster-ing.ch', since: '15.03.2024' },
    { id: 'p6', role: 'Sekretariat', roleType: 'internal', name: 'Sekretariat Gemeinde', organization: 'Gemeinde Dorfname', since: '21.02.2024' },
  ],
};

const DOSSIER_AKTENEINSICHT: Dossier = {
  id: '2', number: '2025-0042', title: 'Akteneinsicht Verkehrsplanung Dorfzentrum',
  processId: 'proc-ae',
  serviceRequest: {
    id: 'sr-2', portalFormTitle: 'Akteneinsicht beantragen', submittedDate: '10.03.2025', submittedBy: 'Keller Thomas', email: 't.keller@example.ch',
    status: 'in-bearbeitung', portalStatus: 'Ihr Antrag wird geprüft — Identitätsnachweis ausstehend',
    messages: [
      { id: 'm10', date: '10.03.2025 10:00', author: 'System', direction: 'to-citizen', text: 'Ihr Antrag auf Akteneinsicht wurde eingereicht.', read: true },
      { id: 'm11', date: '11.03.2025 09:00', author: 'Weber Claudia', direction: 'to-citizen', text: 'Guten Tag Herr Keller, wir benötigen einen gültigen Identitätsnachweis, um Ihren Antrag weiter bearbeiten zu können. Bitte laden Sie eine Kopie Ihres Ausweises hoch.', read: true },
      { id: 'm12', date: '12.03.2025 14:20', author: 'Keller Thomas', direction: 'from-citizen', text: 'Ich habe meinen Ausweis hochgeladen. Bitte prüfen Sie.', read: false },
    ],
    portalDocuments: [
      { id: 'pd10', name: 'Antragsbestätigung', fileName: 'Bestaetigung_AE_2025-0042.pdf', direction: 'to-citizen', uploadDate: '10.03.2025' },
      { id: 'pd11', name: 'Identitätsnachweis', fileName: 'Ausweis_Keller.pdf', direction: 'from-citizen', uploadDate: '12.03.2025', description: 'Kopie Personalausweis' },
    ],
    formData: [
      { label: 'Antragsteller', value: 'Keller Thomas' },
      { label: 'Adresse', value: 'Hauptstrasse 42, 8001 Zürich' },
      { label: 'Betroffenes Dossier', value: 'Verkehrsplanung Dorfzentrum 2024' },
      { label: 'Begründung', value: 'Persönliche Betroffenheit als Anlieger' },
      { label: 'Gewünschter Umfang', value: 'Gesamtes Dossier inkl. Gutachten' },
    ],
  },
  notes: [
    { id: 'ae-n1', date: '10.03.2025 10:15', author: 'Weber Claudia', subject: 'Antrag eingegangen', text: 'Antrag auf Akteneinsicht von Keller Thomas eingegangen. Persönliche Betroffenheit als Anlieger geltend gemacht.', visibility: 'intern' },
    { id: 'ae-n2', date: '11.03.2025 09:30', author: 'Weber Claudia', text: 'Identitätsnachweis per Portal angefordert.', visibility: 'intern' },
  ],
  participants: [
    { id: 'ae-p1', role: 'Antragsteller', roleType: 'primary', name: 'Keller Thomas', email: 't.keller@example.ch', since: '10.03.2025' },
    { id: 'ae-p2', role: 'Sachbearbeiterin', roleType: 'internal', name: 'Weber Claudia', organization: 'Gemeindekanzlei', email: 'c.weber@gemeinde.ch', phone: '044 111 22 33', since: '10.03.2025' },
  ],
};

const DOSSIER_EINBUERGERUNG: Dossier = {
  id: '3', number: '2025-0018', title: 'Einbürgerungsgesuch Rossi Marco',
  processId: 'proc-eb',
  serviceRequest: {
    id: 'sr-3', portalFormTitle: 'Einbürgerungsgesuch stellen', submittedDate: '15.01.2025', submittedBy: 'Rossi Marco', email: 'm.rossi@example.ch',
    status: 'in-bearbeitung', portalStatus: 'Sprachprüfung ausstehend',
    messages: [
      { id: 'm20', date: '15.01.2025 08:30', author: 'System', direction: 'to-citizen', text: 'Ihr Einbürgerungsgesuch wurde erfolgreich eingereicht.', read: true },
      { id: 'm21', date: '20.01.2025 10:00', author: 'Huber Peter', direction: 'to-citizen', text: 'Guten Tag Herr Rossi, bitte vereinbaren Sie einen Termin für die Sprachprüfung unter Tel. 044 123 45 67.', read: true },
      { id: 'm22', date: '22.01.2025 16:00', author: 'Rossi Marco', direction: 'from-citizen', text: 'Termin vereinbart für 15.02.2025. Gibt es Vorbereitungsmaterial?', read: true },
      { id: 'm23', date: '23.01.2025 09:00', author: 'Huber Peter', direction: 'to-citizen', text: 'Ja, ich stelle Ihnen das Informationsblatt im Portal bereit.', read: true },
    ],
    portalDocuments: [
      { id: 'pd20', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_EB_2025-0018.pdf', direction: 'to-citizen', uploadDate: '15.01.2025' },
      { id: 'pd21', name: 'Informationsblatt Sprachprüfung', fileName: 'Info_Sprachpruefung.pdf', direction: 'to-citizen', uploadDate: '23.01.2025', description: 'Vorbereitung auf die Sprachprüfung' },
      { id: 'pd22', name: 'Strafregisterauszug', fileName: 'Strafregister_Rossi.pdf', direction: 'from-citizen', uploadDate: '16.01.2025' },
      { id: 'pd23', name: 'Betreibungsauszug', fileName: 'Betreibung_Rossi.pdf', direction: 'from-citizen', uploadDate: '16.01.2025' },
    ],
    formData: [
      { label: 'Gesuchsteller', value: 'Rossi Marco' },
      { label: 'Geburtsdatum', value: '12.05.1985' },
      { label: 'Nationalität', value: 'Italienisch' },
      { label: 'Wohnhaft in Gemeinde seit', value: '01.03.2015' },
      { label: 'Wohnadresse', value: 'Bahnhofstrasse 88, 8001 Zürich' },
      { label: 'Beruf', value: 'Software-Entwickler' },
      { label: 'Familienstand', value: 'Verheiratet, 2 Kinder' },
    ],
  },
  notes: [
    { id: 'eb-n1', date: '15.01.2025 09:00', author: 'Huber Peter', subject: 'Einbürgerungsgesuch Rossi', text: 'Gesuch von Marco Rossi eingegangen. Wohnsitzdauer erfüllt (10 Jahre). Sprachprüfung muss noch absolviert werden.', visibility: 'intern' },
    { id: 'eb-n2', date: '20.01.2025 10:30', author: 'Huber Peter', text: 'Termin für Sprachprüfung am 15.02.2025 vereinbart. Informationsblatt via Portal zugestellt.', visibility: 'intern' },
    { id: 'eb-n3', date: '22.01.2025 16:30', author: 'System', subject: 'Portal-Nachricht', text: 'Herr Rossi fragt nach Vorbereitungsmaterial für die Sprachprüfung.', visibility: 'extern' },
  ],
  participants: [
    { id: 'eb-p1', role: 'Gesuchsteller', roleType: 'primary', name: 'Rossi Marco', email: 'm.rossi@example.ch', phone: '079 456 78 90', since: '15.01.2025' },
    { id: 'eb-p2', role: 'Sachbearbeiter', roleType: 'internal', name: 'Huber Peter', organization: 'Einwohnerdienste', email: 'p.huber@gemeinde.ch', phone: '044 333 44 55', since: '15.01.2025' },
    { id: 'eb-p3', role: 'Sprachschule', roleType: 'external', name: 'Sprachschule Dorfname', organization: 'Sprachschule Dorfname GmbH', email: 'info@sprachschule.ch', since: '20.01.2025' },
    { id: 'eb-p4', role: 'Einbürgerungskommission', roleType: 'authority', name: 'Einbürgerungskommission', organization: 'Gemeinde Dorfname', since: '15.01.2025' },
  ],
};

const DOSSIER_GEMEINDERAT: Dossier = {
  id: '4', number: '2025-0055', title: 'Anfrage Tempo-30-Zone Schulweg Birkenstrasse',
  processId: 'proc-gr',
  serviceRequest: {
    id: 'sr-4', portalFormTitle: 'Anfrage an den Gemeinderat', submittedDate: '01.03.2025', submittedBy: 'Brunner Lisa', email: 'l.brunner@example.ch',
    status: 'in-bearbeitung', portalStatus: 'Ihre Anfrage wird dem zuständigen Ressort zugewiesen',
    messages: [
      { id: 'm30', date: '01.03.2025 12:00', author: 'System', direction: 'to-citizen', text: 'Ihre Anfrage an den Gemeinderat wurde erfolgreich eingereicht.', read: true },
      { id: 'm31', date: '03.03.2025 08:30', author: 'Schmid Andrea', direction: 'to-citizen', text: 'Guten Tag Frau Brunner, Ihre Anfrage wurde registriert und wird dem Ressort Verkehr zugewiesen.', read: true },
    ],
    portalDocuments: [
      { id: 'pd30', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_GR_2025-0055.pdf', direction: 'to-citizen', uploadDate: '01.03.2025' },
      { id: 'pd31', name: 'Unterschriftensammlung', fileName: 'Unterschriften_Tempo30.pdf', direction: 'from-citizen', uploadDate: '01.03.2025', description: '45 Unterschriften Anwohner Birkenstrasse' },
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
    { id: 'gr-n1', date: '01.03.2025 12:15', author: 'Schmid Andrea', subject: 'Anfrage eingegangen', text: 'Anfrage von Brunner Lisa betreffend Tempo-30-Zone Birkenstrasse. 45 Unterschriften beigelegt.', visibility: 'intern' },
    { id: 'gr-n2', date: '03.03.2025 09:00', author: 'Schmid Andrea', text: 'Triage: Zuständig ist Ressort Verkehr & Infrastruktur (Meier Hans).', visibility: 'intern' },
  ],
  participants: [
    { id: 'gr-p1', role: 'Antragstellerin', roleType: 'primary', name: 'Brunner Lisa', email: 'l.brunner@example.ch', since: '01.03.2025' },
    { id: 'gr-p2', role: 'Gemeindeschreiberin', roleType: 'internal', name: 'Schmid Andrea', organization: 'Gemeindekanzlei', email: 'a.schmid@gemeinde.ch', phone: '044 555 66 77', since: '01.03.2025' },
    { id: 'gr-p3', role: 'Ressort Verkehr', roleType: 'internal', name: 'Meier Hans', organization: 'Gemeinderat', email: 'h.meier@gemeinde.ch', since: '03.03.2025' },
    { id: 'gr-p4', role: 'Tiefbauamt', roleType: 'authority', name: 'Tiefbauamt Gemeinde', organization: 'Tiefbauamt', since: '03.03.2025' },
  ],
};

const DOSSIER_VERANSTALTUNG: Dossier = {
  id: '5', number: '2025-0071', title: 'Dorffest Sommer 2025',
  processId: 'proc-va',
  serviceRequest: {
    id: 'sr-5', portalFormTitle: 'Veranstaltungsbewilligung beantragen', submittedDate: '20.02.2025', submittedBy: 'Steiner Anna', email: 'a.steiner@turnverein.ch',
    status: 'in-bearbeitung', portalStatus: 'Fachstellen werden konsultiert',
    messages: [
      { id: 'm40', date: '20.02.2025 14:00', author: 'System', direction: 'to-citizen', text: 'Ihr Antrag auf Veranstaltungsbewilligung wurde eingereicht.', read: true },
      { id: 'm41', date: '22.02.2025 09:00', author: 'Frei Barbara', direction: 'to-citizen', text: 'Guten Tag Frau Steiner, könnten Sie bitte noch ein detailliertes Sicherheitskonzept nachreichen? Dieses benötigen wir für die Fachstellen-Vernehmlassung.', read: true },
      { id: 'm42', date: '25.02.2025 11:30', author: 'Steiner Anna', direction: 'from-citizen', text: 'Das Sicherheitskonzept habe ich hochgeladen. Bei Fragen stehe ich gerne zur Verfügung.', read: true },
    ],
    portalDocuments: [
      { id: 'pd40', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_VA_2025-0071.pdf', direction: 'to-citizen', uploadDate: '20.02.2025' },
      { id: 'pd41', name: 'Veranstaltungskonzept', fileName: 'Konzept_Dorffest.pdf', direction: 'from-citizen', uploadDate: '20.02.2025' },
      { id: 'pd42', name: 'Sicherheitskonzept', fileName: 'Sicherheit_Dorffest.pdf', direction: 'from-citizen', uploadDate: '25.02.2025', description: 'Nachreichung auf Anfrage' },
      { id: 'pd43', name: 'Lageplan', fileName: 'Lageplan_Dorffest.pdf', direction: 'from-citizen', uploadDate: '20.02.2025' },
    ],
    formData: [
      { label: 'Veranstalter', value: 'Turnverein Dorfname' },
      { label: 'Kontaktperson', value: 'Steiner Anna' },
      { label: 'Veranstaltung', value: 'Dorffest Sommer 2025' },
      { label: 'Datum', value: '21.06.2025 – 22.06.2025' },
      { label: 'Ort', value: 'Dorfplatz & Gemeindewiese' },
      { label: 'Erwartete Besucherzahl', value: 'ca. 500' },
      { label: 'Alkoholausschank', value: 'Ja (Festwirtschaft)' },
      { label: 'Musik/Lärm', value: 'Live-Band bis 23:00, DJ bis 01:00' },
    ],
  },
  notes: [
    { id: 'va-n1', date: '20.02.2025 14:30', author: 'Frei Barbara', subject: 'Gesuch Dorffest', text: 'Gesuch für Dorffest Sommer 2025 eingegangen. Turnverein Dorfname, ca. 500 Besucher erwartet. Sicherheitskonzept fehlt noch.', visibility: 'intern' },
    { id: 'va-n2', date: '22.02.2025 09:15', author: 'Frei Barbara', text: 'Sicherheitskonzept per Portal nachgefordert.', visibility: 'intern' },
    { id: 'va-n3', date: '28.02.2025 16:00', author: 'Frei Barbara', subject: 'Risikostufe Mittel', text: 'Risikobeurteilung abgeschlossen: Stufe Mittel. Fachstellen Feuerpolizei, Kantonspolizei, Lebensmittelkontrolle und Lärmschutz werden konsultiert.', visibility: 'intern' },
  ],
  participants: [
    { id: 'va-p1', role: 'Veranstalter', roleType: 'primary', name: 'Steiner Anna', organization: 'Turnverein Dorfname', email: 'a.steiner@turnverein.ch', phone: '079 888 99 00', since: '20.02.2025' },
    { id: 'va-p2', role: 'Sachbearbeiterin', roleType: 'internal', name: 'Frei Barbara', organization: 'Gemeindekanzlei', email: 'b.frei@gemeinde.ch', phone: '044 777 88 99', since: '20.02.2025' },
    { id: 'va-p3', role: 'Feuerpolizei', roleType: 'authority', name: 'Feuerpolizei Kanton', organization: 'Gebäudeversicherung', since: '28.02.2025' },
    { id: 'va-p4', role: 'Kantonspolizei', roleType: 'authority', name: 'Kantonspolizei', organization: 'Kantonspolizei', since: '28.02.2025' },
    { id: 'va-p5', role: 'Lebensmittelkontrolle', roleType: 'authority', name: 'Lebensmittelbehörde', organization: 'Kantonales Labor', since: '28.02.2025' },
    { id: 'va-p6', role: 'Lärmschutz', roleType: 'authority', name: 'Umweltamt', organization: 'Umweltamt Kanton', since: '28.02.2025' },
  ],
};

const DOSSIER_KESB: Dossier = {
  id: '6', number: '2025-KES-0012', title: 'KESB-Gefahrenmeldung Fam. Schneider',
  processId: 'proc-kesb',
  serviceRequest: {
    id: 'sr-6', portalFormTitle: 'KESB-Gefahrenmeldung einreichen', submittedDate: '05.03.2025', submittedBy: 'Widmer Ruth (Schule Dorfname)', email: 'r.widmer@schule-dorf.ch',
    status: 'in-bearbeitung', portalStatus: 'Abklärung eingeleitet',
    messages: [
      { id: 'm50', date: '05.03.2025 08:00', author: 'System', direction: 'to-citizen', text: 'Ihre Gefahrenmeldung wurde vertraulich entgegengenommen.', read: true },
      { id: 'm51', date: '05.03.2025 10:30', author: 'Dr. Gerber Nicole', direction: 'to-citizen', text: 'Frau Widmer, vielen Dank für Ihre Meldung. Die Dringlichkeit wurde als hoch eingestuft. Wir haben umgehend eine Abklärung eingeleitet. Für Rückfragen erreichen Sie mich unter 044 987 65 43.', read: true },
      { id: 'm52', date: '06.03.2025 14:00', author: 'Widmer Ruth', direction: 'from-citizen', text: 'Ich habe noch einen ergänzenden Bericht der Schulleitung hochgeladen.', read: true },
    ],
    portalDocuments: [
      { id: 'pd50', name: 'Eingangsbestätigung', fileName: 'Bestaetigung_KES_2025-0012.pdf', direction: 'to-citizen', uploadDate: '05.03.2025', description: 'Vertrauliche Bestätigung' },
      { id: 'pd51', name: 'Gefahrenmeldung (Formular)', fileName: 'Gefahrenmeldung_anonym.pdf', direction: 'from-citizen', uploadDate: '05.03.2025' },
      { id: 'pd52', name: 'Ergänzungsbericht Schule', fileName: 'Bericht_Schulleitung.pdf', direction: 'from-citizen', uploadDate: '06.03.2025', description: 'Bericht der Schulleitung mit Beobachtungen' },
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
    { id: 'kes-n1', date: '05.03.2025 08:30', author: 'Dr. Gerber Nicole', subject: 'Gefahrenmeldung eingegangen', text: 'Gefahrenmeldung von Klassenlehrerin Widmer Ruth (Primarschule Dorfname). Verdacht auf Vernachlässigung Kind S. (8 Jahre). Dringlichkeit: Hoch.', visibility: 'intern' },
    { id: 'kes-n2', date: '05.03.2025 11:00', author: 'Dr. Gerber Nicole', text: 'Sofortmassnahmen nicht nötig gemäss Ersteinschätzung. Abklärungsauftrag wird erteilt.', visibility: 'intern' },
    { id: 'kes-n3', date: '06.03.2025 14:15', author: 'Dr. Gerber Nicole', text: 'Ergänzungsbericht der Schulleitung via Portal eingegangen. Bestätigt regelmässiges Fehlen und Rückzugsverhalten.', visibility: 'intern' },
  ],
  participants: [
    { id: 'kes-p1', role: 'Meldende Person', roleType: 'external', name: 'Widmer Ruth', organization: 'Primarschule Dorfname', email: 'r.widmer@schule-dorf.ch', since: '05.03.2025' },
    { id: 'kes-p2', role: 'KESB-Präsidentin', roleType: 'internal', name: 'Dr. Gerber Nicole', organization: 'KESB Region', email: 'n.gerber@kesb.ch', phone: '044 987 65 43', since: '05.03.2025' },
    { id: 'kes-p3', role: 'Betroffene Familie', roleType: 'primary', name: 'Fam. Schneider', since: '05.03.2025' },
    { id: 'kes-p4', role: 'Sekretariat KESB', roleType: 'internal', name: 'Sekretariat KESB', organization: 'KESB Region', since: '05.03.2025' },
  ],
};

const ALL_DOSSIERS: Dossier[] = [
  DOSSIER_BAUGESUCH,
  DOSSIER_AKTENEINSICHT,
  DOSSIER_EINBUERGERUNG,
  DOSSIER_GEMEINDERAT,
  DOSSIER_VERANSTALTUNG,
  DOSSIER_KESB,
];

// ============================================================
// SITZUNGEN
// ============================================================

const SITZUNG_GR: Sitzung = {
  id: 'sitz-gr-1',
  number: 'GR-2025-04',
  title: '5. Gemeinderatssitzung 2025',
  date: '15.04.2025',
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
      id: 'trakt-3', number: '3', title: 'Tempo-30-Zone Schulweg Birkenstrasse — Stellungnahme & Beschluss',
      category: 'Verkehr & Infrastruktur',
      contextLinks: [G('4')],
      status: 'offen',
      processStepIds: [{ processId: 'proc-gr', stepId: 'gr-5' }, { processId: 'proc-gr', stepId: 'gr-6' }],
    },
    {
      id: 'trakt-4', number: '4', title: 'Dorffest Sommer 2025 — Veranstaltungsbewilligung',
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
    { id: 'sd-1', name: 'Einladung GR-Sitzung 15.04.2025', fileName: 'Einladung_GR_2025-04.pdf', type: 'einladung', uploadDate: '08.04.2025' },
    { id: 'sd-2', name: 'Protokoll 4. Sitzung', fileName: 'Protokoll_GR_2025-03.pdf', type: 'protokoll', uploadDate: '25.03.2025' },
    { id: 'sd-3', name: 'Stellungnahme Tempo-30 Birkenstrasse', fileName: 'Stellungnahme_T30.pdf', type: 'traktandum', uploadDate: '10.04.2025' },
    { id: 'sd-4', name: 'Gesuch Dorffest inkl. Fachberichte', fileName: 'Dorffest_Unterlagen.pdf', type: 'traktandum', uploadDate: '10.04.2025' },
  ],
};

const SITZUNG_GV: Sitzung = {
  id: 'sitz-gv-1',
  number: 'GV-2025-06',
  title: 'Gemeindeversammlung Sommer 2025',
  date: '20.06.2025',
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
    { id: 'sd-gv-1', name: 'Einladung Gemeindeversammlung', fileName: 'Einladung_GV_2025-06.pdf', type: 'einladung', uploadDate: '01.06.2025' },
  ],
};

const SITZUNG_KESB: Sitzung = {
  id: 'sitz-kesb-1',
  number: 'KESB-2025-12',
  title: 'KESB-Spruchkörpersitzung',
  date: '28.03.2025',
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
      id: 'trakt-k-2', number: '2', title: 'Gefahrenmeldung Fam. Schneider — Entscheid',
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
    { id: 'sd-k-1', name: 'Traktandenliste KESB-2025-12', fileName: 'Traktanden_KESB_12.pdf', type: 'einladung', uploadDate: '25.03.2025' },
    { id: 'sd-k-2', name: 'Abklärungsbericht Schneider (Entwurf)', fileName: 'Abklaerung_Schneider.pdf', type: 'traktandum', uploadDate: '26.03.2025' },
  ],
};

const ALL_SITZUNGEN: Sitzung[] = [SITZUNG_GR, SITZUNG_GV, SITZUNG_KESB];

// ============================================================
// INITIAL TABS
// ============================================================

const INITIAL_TABS: AppTab[] = [
  { id: 'tab-proc-bau', type: 'prozess', referenceId: 'proc-bau', label: 'Baugesuchsverfahren' },
  { id: 'tab-dos-1', type: 'geschaeft', referenceId: '1', label: 'Umbau Gebäude (Heizungsänderung und Dachstockausbau)', number: '2024-0009' },
  { id: 'tab-sitz-gr-1', type: 'sitzung', referenceId: 'sitz-gr-1', label: '5. Gemeinderatssitzung 2025', number: 'GR-2025-04' },
];
