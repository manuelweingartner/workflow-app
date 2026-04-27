// ============================================================
// Elsa 3 Workflow JSON — type-level contract
// ============================================================
// We model only the subset of Elsa we consume. Anything Elsa knows
// but we don't care about lives in `unknown` / index-signature land.

import {
  Task, Input, Action, CompletionCriterion, Conditional,
  TaskMode, ActivityKind, ContextLink,
} from '../models/process.model';

// --- Workflow root --------------------------------------------------------

export interface ElsaWorkflow {
  id: string;
  name: string;
  version?: number;
  metadata?: ElsaWorkflowMetadata;
  root: ElsaFlowchart;
}

export interface ElsaWorkflowMetadata {
  simpleView?: SimpleViewWorkflowMeta;
  [key: string]: unknown;
}

export interface SimpleViewWorkflowMeta {
  title: string;
  processOwner: { name: string; role?: string; email?: string };
  kind?: 'template' | 'instance';
}

// --- Flowchart (the only workflow shape we support) ----------------------

export interface ElsaFlowchart {
  type: 'Elsa.Flowchart';
  activities: ElsaActivity[];
  connections: ElsaConnection[];
  start?: string;
}

// --- Activities -----------------------------------------------------------
// Activity types we recognize — others fall through to 'technical'.

export type ActivityType =
  | 'Cmi.TaskActivity'
  | 'Cmi.ServiceActivity'
  | 'Cmi.SubprocessActivity'
  | 'Elsa.If'
  | 'Elsa.Switch'
  | 'Elsa.Fork'
  | 'Elsa.Join'
  | 'Elsa.While'
  | 'Elsa.For'
  | 'Elsa.ForEach'
  | string; // anything else is technical

export interface ElsaActivity {
  id: string;
  type: ActivityType;
  metadata?: ActivityMetadata;
  customProperties?: ActivityCustomProperties;
  // Subprocess composite activities embed a child flowchart
  body?: ElsaFlowchart;
}

export interface ActivityMetadata {
  displayText?: string;
  [key: string]: unknown;
}

export interface ActivityCustomProperties {
  simpleView?: SimpleViewActivityMeta;
  [key: string]: unknown;
}

// --- simpleView annotation on activities ---------------------------------

export interface SimpleViewActivityMeta {
  // Common (all Cmi.* steps)
  number?: string;
  title?: string;
  responsible?: string;
  category?: string;
  hide?: boolean;
  show?: boolean;            // for technical activities to opt-in
  contextLinks?: ContextLink[];
  dueDate?: string;
  collapsed?: boolean;

  // TaskActivity
  taskMode?: TaskMode;
  tasks?: Task[];
  inputs?: Input[];
  actions?: Action[];
  completionCriteria?: CompletionCriterion[];
  conditionals?: Conditional[];

  // ServiceActivity
  activityKind?: ActivityKind;

  // Gateway labels
  branchLabels?: { [outcomeKey: string]: string };
  parallelPathLabels?: string[];
}

// --- Connections (Flowchart edges) ----------------------------------------

export interface ElsaConnection {
  source: string;
  target: string;
  sourcePort?: string;       // outcome key, e.g. "True", "False", "case1"
  targetPort?: string;
  metadata?: ConnectionMetadata;
}

export interface ConnectionMetadata {
  simpleView?: SimpleViewConnectionMeta;
  [key: string]: unknown;
}

export interface SimpleViewConnectionMeta {
  defaultPath?: boolean;
  branchLabel?: string;
}

// ============================================================
// Instance State JSON — one per running/completed workflow
// ============================================================

export interface ElsaInstanceState {
  instanceId: string;
  workflowId: string;
  startedAt?: string;
  startedBy?: string;
  state: 'running' | 'completed' | 'cancelled' | 'paused';
  activityExecutions: ActivityExecution[];
  decisions?: DecisionRecord[];
  events?: import('../models/process.model').WorkflowEvent[];
}

export interface ActivityExecution {
  activityId: string;
  status: 'completed' | 'running' | 'pending';
  startedAt?: string;
  completedAt?: string;
}

export interface DecisionRecord {
  gatewayActivityId: string;
  // Either the sourcePort of the connection that was followed, or the branch label
  chosenBranch: string;
}

// ============================================================
// Internal graph representation (output of Phase 1: Parse)
// ============================================================

export interface ElsaGraph {
  nodes: Map<string, ElsaActivity>;
  outEdges: Map<string, ElsaConnection[]>;   // by source id
  inEdges: Map<string, ElsaConnection[]>;    // by target id
  entryNodeId: string;
}
