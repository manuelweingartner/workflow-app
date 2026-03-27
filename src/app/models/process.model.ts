export interface Dossier {
  id: string;
  number: string;
  title: string;
  process: Process;
  serviceRequest?: ServiceRequest;
  notes: Note[];
  participants: Participant[];
}

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

export interface Process {
  steps: ProcessStep[];
}

export interface ProcessStep {
  id: string;
  number: string;
  title: string;
  status: 'completed' | 'in-progress' | 'pending';
  dueDate?: string;
  completedDate?: string;
  responsible: string;
  category: string;
  tasks: Task[];
  inputs: Input[];
  actions: Action[];
  completionCriteria: CompletionCriterion[];
  conditionals: Conditional[];
}

export interface Task {
  id: string;
  title: string;
  assignee: string;
  status: 'open' | 'in-progress' | 'done';
  dueDate?: string;
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
  type: 'standard' | 'script' | 'ai';
  description?: string;
  script?: string;
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
