// ============================================================
// Scaffolding adapter — converts existing Process / ProcessStep mock
// data into Elsa-shaped ElsaWorkflow + ElsaInstanceState objects.
//
// This exists to bootstrap the prototype without hand-authoring 3000
// lines of Elsa JSON. The real architecture (translator, merger,
// pruner) is then exercised against real Elsa shapes.
//
// Replace this adapter file-by-file with hand-authored *.elsa.json
// once a real Elsa designer is available.
// ============================================================

import { Process, ProcessStep, Branch } from '../models/process.model';
import {
  ElsaWorkflow, ElsaActivity, ElsaConnection, ElsaFlowchart,
  ElsaInstanceState, ActivityExecution, DecisionRecord,
  SimpleViewActivityMeta,
} from './elsa-workflow.types';

// --- Public entry points --------------------------------------------------

export function processToElsa(p: Process): { workflow: ElsaWorkflow; instance: ElsaInstanceState } {
  const ctx = new BuildContext();
  const flowchart = buildFlowchart(p.steps, ctx);

  const workflow: ElsaWorkflow = {
    id: workflowIdFor(p),
    name: p.title,
    version: 1,
    metadata: {
      simpleView: { title: p.title, processOwner: p.processOwner },
    },
    root: flowchart,
  };

  const instance: ElsaInstanceState = {
    instanceId: p.id,
    workflowId: workflow.id,
    startedAt: p.startedAt,
    startedBy: p.startedBy,
    state: p.instanceState ?? 'running',
    activityExecutions: ctx.executions,
    decisions: ctx.decisions,
    events: p.events ?? [],
  };

  return { workflow, instance };
}

// Workflow id: for templates use the process id directly; for instances
// route to the template's id (so all instances of the same template
// share one workflow definition).
function workflowIdFor(p: Process): string {
  if (p.kind === 'instance' && p.templateId) return p.templateId;
  return p.id;
}

// --- Internal builder -----------------------------------------------------

class BuildContext {
  activities: ElsaActivity[] = [];
  connections: ElsaConnection[] = [];
  executions: ActivityExecution[] = [];
  decisions: DecisionRecord[] = [];
  private uid = 0;
  newId(prefix: string) { return `${prefix}_${++this.uid}`; }
}

interface BuiltFragment {
  entry: string;        // first activity id
  exits: string[];      // last activity ids needing outgoing edges
}

// Build a Flowchart from a sequence of ProcessSteps.
// Returns the Flowchart with all activities/connections wired up.
function buildFlowchart(steps: ProcessStep[], ctx: BuildContext): ElsaFlowchart {
  const fragments = steps.map(s => buildStep(s, ctx));

  // Wire fragments sequentially: each fragment's exits → next fragment's entry
  for (let i = 0; i < fragments.length - 1; i++) {
    for (const exit of fragments[i].exits) {
      ctx.connections.push({ source: exit, target: fragments[i + 1].entry });
    }
  }

  return {
    type: 'Elsa.Flowchart',
    activities: ctx.activities,
    connections: ctx.connections,
    start: fragments[0]?.entry,
  };
}

// Recursive: a step might itself be a gateway (decision/parallel/loop) or a subprocess.
function buildStep(step: ProcessStep, ctx: BuildContext): BuiltFragment {
  if (step.kind === 'gateway') {
    if (step.gatewayType === 'decision') return buildDecision(step, ctx);
    if (step.gatewayType === 'parallel') return buildParallel(step, ctx);
    if (step.gatewayType === 'loop') return buildLoop(step, ctx);
  }
  return buildAtomicStep(step, ctx);
}

function buildAtomicStep(step: ProcessStep, ctx: BuildContext): BuiltFragment {
  const sv = stepToSimpleView(step);

  const activity: ElsaActivity = {
    id: step.id,
    type: stepActivityType(step),
    metadata: { displayText: step.title },
    customProperties: { simpleView: sv },
  };

  // Subprocess: embed the inner flowchart as activity.body
  if (step.stepType === 'subprocess' && step.subSteps?.length) {
    const innerCtx = new BuildContext();
    activity.body = buildFlowchart(step.subSteps, innerCtx);
    // Forward the inner activities' executions/decisions to outer context
    ctx.executions.push(...innerCtx.executions);
    ctx.decisions.push(...innerCtx.decisions);
  }

  ctx.activities.push(activity);
  ctx.executions.push(stepToExecution(step));

  return { entry: step.id, exits: [step.id] };
}

function buildDecision(step: ProcessStep, ctx: BuildContext): BuiltFragment {
  const branches = step.branches ?? [];
  const sv: SimpleViewActivityMeta = {
    number: step.number,
    title: step.title,
    branchLabels: Object.fromEntries(branches.map(b => [b.condition || b.id, b.label])),
  };

  const switchActivity: ElsaActivity = {
    id: step.id,
    type: 'Elsa.Switch',
    metadata: { displayText: step.title },
    customProperties: { simpleView: sv },
  };
  ctx.activities.push(switchActivity);
  ctx.executions.push({ activityId: step.id, status: mapStatus(step.status) });

  // Record the chosen branch (if any)
  if (step.chosenBranchId) {
    const chosen = branches.find(b => b.id === step.chosenBranchId);
    if (chosen) ctx.decisions.push({
      gatewayActivityId: step.id, chosenBranch: chosen.condition || chosen.id,
    });
  }

  // Build each branch as a sub-flowchart inline; the first activity becomes the
  // connection target. Branch exits become the gateway's collective exits.
  const allExits: string[] = [];
  for (const branch of branches) {
    const port = branch.condition || branch.id;
    if (!branch.steps.length) {
      // Empty branch — synthesize a passthrough so the connection still has a target
      const passId = ctx.newId('pass');
      ctx.activities.push({ id: passId, type: 'Elsa.Noop', metadata: { displayText: branch.label } });
      ctx.connections.push({
        source: step.id, target: passId, sourcePort: port,
        metadata: { simpleView: { branchLabel: branch.label, defaultPath: branch.isDefault } },
      });
      allExits.push(passId);
      continue;
    }
    const branchFragments = branch.steps.map(s => buildStep(s, ctx));
    // Wire branch internally
    for (let i = 0; i < branchFragments.length - 1; i++) {
      for (const exit of branchFragments[i].exits) {
        ctx.connections.push({ source: exit, target: branchFragments[i + 1].entry });
      }
    }
    // Connection from gateway → branch entry
    ctx.connections.push({
      source: step.id, target: branchFragments[0].entry, sourcePort: port,
      metadata: { simpleView: { branchLabel: branch.label, defaultPath: branch.isDefault } },
    });
    allExits.push(...branchFragments[branchFragments.length - 1].exits);
  }

  return { entry: step.id, exits: allExits };
}

function buildParallel(step: ProcessStep, ctx: BuildContext): BuiltFragment {
  const paths = step.parallelPaths ?? [];
  const sv: SimpleViewActivityMeta = {
    number: step.number,
    title: step.title,
    parallelPathLabels: step.parallelPathLabels,
  };

  const forkActivity: ElsaActivity = {
    id: step.id,
    type: 'Elsa.Fork',
    metadata: { displayText: step.title },
    customProperties: { simpleView: sv },
  };
  ctx.activities.push(forkActivity);
  ctx.executions.push({ activityId: step.id, status: mapStatus(step.status) });

  const joinId = ctx.newId('join');
  const joinActivity: ElsaActivity = {
    id: joinId, type: 'Elsa.Join',
    metadata: { displayText: 'Join' },
  };
  ctx.activities.push(joinActivity);

  // Build each parallel path
  paths.forEach((path, idx) => {
    if (!path.length) {
      ctx.connections.push({ source: step.id, target: joinId, sourcePort: `path${idx}` });
      return;
    }
    const fragments = path.map(s => buildStep(s, ctx));
    for (let i = 0; i < fragments.length - 1; i++) {
      for (const exit of fragments[i].exits) {
        ctx.connections.push({ source: exit, target: fragments[i + 1].entry });
      }
    }
    ctx.connections.push({ source: step.id, target: fragments[0].entry, sourcePort: `path${idx}` });
    for (const exit of fragments[fragments.length - 1].exits) {
      ctx.connections.push({ source: exit, target: joinId });
    }
  });

  return { entry: step.id, exits: [joinId] };
}

function buildLoop(step: ProcessStep, ctx: BuildContext): BuiltFragment {
  const sv: SimpleViewActivityMeta = { number: step.number, title: step.title };

  const loopActivity: ElsaActivity = {
    id: step.id,
    type: 'Elsa.While',
    metadata: { displayText: step.loopCondition ?? step.title },
    customProperties: { simpleView: sv },
  };

  // Embed body as a child flowchart on the activity
  if (step.loopBody?.length) {
    const innerCtx = new BuildContext();
    loopActivity.body = buildFlowchart(step.loopBody, innerCtx);
    ctx.executions.push(...innerCtx.executions);
    ctx.decisions.push(...innerCtx.decisions);
  }

  ctx.activities.push(loopActivity);
  ctx.executions.push({ activityId: step.id, status: mapStatus(step.status) });

  return { entry: step.id, exits: [step.id] };
}

// --- Mappers --------------------------------------------------------------

function stepActivityType(step: ProcessStep): string {
  if (step.stepType === 'task') return 'Cmi.TaskActivity';
  if (step.stepType === 'activity') return 'Cmi.ServiceActivity';
  if (step.stepType === 'subprocess') return 'Cmi.SubprocessActivity';
  return 'Cmi.TaskActivity';
}

function stepToSimpleView(step: ProcessStep): SimpleViewActivityMeta {
  return {
    number: step.number,
    title: step.title,
    responsible: step.responsible,
    category: step.category,
    contextLinks: step.contextLinks,
    dueDate: step.dueDate,
    collapsed: step.collapsed,
    taskMode: step.taskMode,
    activityKind: step.activityKind,
    tasks: step.tasks,
    inputs: step.inputs,
    actions: step.actions,
    completionCriteria: step.completionCriteria,
    conditionals: step.conditionals,
  };
}

function stepToExecution(step: ProcessStep): ActivityExecution {
  return {
    activityId: step.id,
    status: mapStatus(step.status),
    completedAt: step.completedDate,
  };
}

function mapStatus(s: ProcessStep['status']): ActivityExecution['status'] {
  if (s === 'completed') return 'completed';
  if (s === 'in-progress') return 'running';
  return 'pending';
}
