// ============================================================
// App Tab — multi-type tab system
// ============================================================

export type TabType = 'prozess' | 'geschaeft' | 'sitzung';

export interface AppTab {
  id: string;
  type: TabType;
  referenceId: string;
  label: string;
  number?: string;
}

// ============================================================
// Context Objects — things that process steps can link to
// ============================================================

export type ContextObjectType = 'geschaeft' | 'sitzung' | 'projekt' | 'andere';

export interface ContextObject {
  id: string;
  type: ContextObjectType;
  number: string;
  title: string;
  icon?: string;
}

export interface ContextLink {
  contextId: string;
  contextType: ContextObjectType;
  label?: string;  // optional display override
}

// ============================================================
// Workflow Event — audit log entry for a process instance
// ============================================================

export type WorkflowEventType = 'started' | 'step_completed' | 'branch_chosen' | 'task_added' | 'note_added';

export interface WorkflowEvent {
  id: string;
  timestamp: string;         // ISO-DateTime
  type: WorkflowEventType;
  description: string;       // human-readable text for audit log
  actor: string;             // name of the user who triggered the event
  stepId?: string;
  stepTitle?: string;
}

// ============================================================
// Process — now a standalone top-level entity
// ============================================================

export interface Process {
  id: string;
  title: string;
  processOwner: ProcessOwner;
  steps: ProcessStep[];
  // Template vs. Instance
  kind?: 'template' | 'instance';
  templateId?: string;           // for instances: references the template process id
  startedAt?: string;            // ISO-Date, set when instance is created
  startedBy?: string;            // name of the user who started this instance
  instanceState?: 'running' | 'completed' | 'cancelled' | 'paused';
  events?: WorkflowEvent[];      // audit log (only on instances)
}

export interface ProcessOwner {
  name: string;
  role?: string;
  email?: string;
}

// Step types — actual work items
export type StepType = 'task' | 'activity' | 'subprocess';

// Task sub-modes
export type TaskMode = 'description' | 'wizard';

// Activity automation kinds
export type ActivityKind = 'object-creation' | 'interface' | 'ai' | 'notification' | 'document';

// Control flow gateway types (NOT steps — these route execution between steps)
export type GatewayType = 'decision' | 'parallel' | 'loop';

export interface Branch {
  id: string;
  label: string;
  condition: string;
  steps: ProcessStep[];   // each branch owns its own step sequence
  isDefault?: boolean;    // marks the happy-path branch (from connection.metadata.simpleView.defaultPath)
}

export interface ProcessStep {
  // Discriminator: 'step' = actual work, 'gateway' = control flow routing,
  // 'unknown-future' = render a "weiterer Verlauf hängt von Entscheid ab" marker
  kind?: 'step' | 'gateway' | 'unknown-future';

  id: string;
  number: string;
  title: string;
  status: 'completed' | 'in-progress' | 'pending';

  // For kind='step': what type of work?
  stepType?: StepType;            // 'task' | 'activity' | 'subprocess'
  taskMode?: TaskMode;            // for stepType='task': description vs wizard
  activityKind?: ActivityKind;    // for stepType='activity': what automation

  // For kind='gateway': what type of control flow?
  gatewayType?: GatewayType;      // 'decision' | 'parallel' | 'loop'
  chosenBranchId?: string;        // for gatewayType='decision' on instances: which branch was taken

  // True when this step lies downstream of an unresolved decision-with-default-path.
  // The UI renders such steps with dashed lines to signal that execution is predicted, not certain.
  predicted?: boolean;

  // Gateway data (populated when kind='gateway')
  branches?: Branch[];             // for gatewayType='decision' — each branch owns its steps
  parallelPaths?: ProcessStep[][];   // for gatewayType='parallel' — each path is a step sequence
  parallelPathLabels?: string[];     // display names for parallel paths
  loopBody?: ProcessStep[];         // for gatewayType='loop' — steps inside the loop iteration
  loopCondition?: string;

  // Step data (populated when kind='step')
  subSteps?: ProcessStep[];       // for stepType='subprocess'
  collapsed?: boolean;
  dueDate?: string;
  completedDate?: string;
  responsible: string;
  category: string;
  contextLinks: ContextLink[];
  tasks: Task[];
  inputs: Input[];
  actions: Action[];
  completionCriteria: CompletionCriterion[];
  conditionals: Conditional[];
}

// ============================================================
// Dossier — a context object that can view linked process steps
// ============================================================

export interface Dossier {
  id: string;
  number: string;
  title: string;
  processId: string;                // reference to the process
  serviceRequest?: ServiceRequest;
  notes: Note[];
  participants: Participant[];
}

// ============================================================
// Sub-types (unchanged)
// ============================================================

export interface Note {
  id: string;
  date: string;
  author: string;
  subject?: string;
  text: string;
  visibility: 'intern' | 'extern';
}

export interface Participant {
  id: string;
  role: string;
  roleType: 'primary' | 'internal' | 'external' | 'authority';
  name: string;
  organization?: string;
  email?: string;
  phone?: string;
  since: string;
}

export interface ServiceRequest {
  id: string;
  portalFormTitle: string;
  submittedDate: string;
  submittedBy: string;
  email: string;
  status: 'eingegangen' | 'in-bearbeitung' | 'rueckfrage' | 'abgeschlossen';
  portalStatus: string;
  messages: PortalMessage[];
  portalDocuments: PortalDocument[];
  formData: { label: string; value: string }[];
}

export interface PortalMessage {
  id: string;
  date: string;
  author: string;
  direction: 'to-citizen' | 'from-citizen';
  text: string;
  read: boolean;
}

export interface PortalDocument {
  id: string;
  name: string;
  fileName?: string;
  direction: 'to-citizen' | 'from-citizen';
  uploadDate: string;
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  assignee: string;
  status: 'open' | 'in-progress' | 'done';
  dueDate?: string;
  // Optional task result (captured when completing the task)
  resultType?: 'boolean' | 'choice' | 'text';
  resultOptions?: string[];   // for resultType='choice'
  resultValue?: string;       // stored result value
}

export interface Input {
  id: string;
  type: 'field' | 'document';
  label: string;
  value?: string;
  required: boolean;
  fieldType?: 'text' | 'date' | 'number' | 'select' | 'textarea';
  options?: string[];
  documentName?: string;
  uploaded?: boolean;
  thematicGroup?: string;
}

export interface Action {
  id: string;
  label: string;
  type: 'standard' | 'script' | 'ai' | 'interface';
  description?: string;
  script?: string;
  // Result of a KI+ assistant run (only populated for type='ai' after execution)
  aiResult?: AiAssessment;
  // Result of an external-system interface run (only for type='interface')
  syncResult?: SyncRun;
}

// One run of an interface to an external system (ContactSync to the EWK, Klapp).
// Simulated in this prototype: no request leaves the browser.
export interface SyncRun {
  status: 'idle' | 'running' | 'done';
  systemName: string;              // 'CMI ContactSync', 'Klapp'
  direction: string;               // 'CMI <- Innosolv EWK'
  endpoint: string;                // 'FindSchulkinder', 'POST /process/klapp/OfferRequest/register'
  config?: { label: string; value: string }[];   // Selektions-ID, Provider, Mandant
  lastRun?: string;                // 'TT.MM.JJJJ HH:MM'
  outcome: 'ok' | 'warnung' | 'fehler';
  metrics: { label: string; value: string }[];
  warnings: string[];

  // Klapp registration channel: per-child state behind the counters.
  registrations?: KlappRegistration[];
  deadline?: string;               // Anmeldefrist, 'TT.MM.JJJJ'
  mahnstufe?: number;
  maxMahnstufe?: number;
}

// Registration state of one child in Klapp, as reported back to CMI.
export interface KlappRegistration {
  name: string;
  status: 'angemeldet' | 'offen';
  registeredAt?: string;           // 'TT.MM.JJJJ' when status='angemeldet'
  reminders: number;               // how many Registrationsbriefe went out
}

// Result produced by a background KI+ assistant attached to an AI action.
export interface AiAssessment {
  status: 'idle' | 'running' | 'done';
  assistantName: string;        // name of the configured KI+ assistant
  recommendedLevel: string;     // KI+ recommendation (e.g. 'Tief' | 'Mittel' | 'Hoch'), advisory only
  summary: string;              // editable short summary shown inline
  detail: string;               // full analysis shown in a dialog
  generatedAt?: string;         // ISO-DateTime when the run finished
}

export interface CompletionCriterion {
  id: string;
  description: string;
  met: boolean;
  suggestedNextStep?: string;
}

export interface Conditional {
  id: string;
  condition: string;
  thenAction: string;
  elseAction?: string;
}

// ============================================================
// Sitzung — meeting with Traktanden
// ============================================================

export interface Sitzung {
  id: string;
  number: string;
  title: string;
  date: string;
  endDate?: string;
  location?: string;
  chairperson: string;
  organization: string;
  frequency?: string;
  status: 'geplant' | 'eingeladen' | 'durchgeführt' | 'protokolliert';
  traktanden: Traktandum[];
  participants: SitzungParticipant[];
  documents: SitzungDocument[];
}

export interface Traktandum {
  id: string;
  number: string;
  title: string;
  category?: string;
  contextLinks: ContextLink[];
  beschlusstext?: string;
  status: 'offen' | 'beschlossen' | 'vertagt' | 'zur-kenntnis';
  processStepIds?: { processId: string; stepId: string }[];
}

export interface SitzungParticipant {
  id: string;
  name: string;
  role: string;
  organization?: string;
  status: 'eingeladen' | 'zugesagt' | 'abgesagt' | 'teilgenommen';
}

export interface SitzungDocument {
  id: string;
  name: string;
  fileName?: string;
  type: 'einladung' | 'traktandum' | 'protokoll' | 'beilage';
  uploadDate: string;
}
