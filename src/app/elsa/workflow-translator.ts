// ============================================================
// Phase 1 (Parse) + Phase 3 (Build Tree)
// ============================================================
// translateWorkflow(wf): turns an Elsa workflow JSON into a Process tree.
// Status fields default to 'pending' — use instance-state-merger.ts to apply
// instance state, and future-pruner.ts to handle unknown-future.

import {
  ElsaWorkflow, ElsaFlowchart, ElsaActivity, ElsaConnection,
  ElsaGraph, SimpleViewActivityMeta,
} from './elsa-workflow.types';
import { classifyActivity, ActivityRole } from './activity-classifier';
import { postDominator, findMatchingJoin, followSingleOut } from './post-dominator';
import {
  Process, ProcessStep, Branch,
} from '../models/process.model';

// --- Phase 1: Parse -------------------------------------------------------

export function parseFlowchart(flowchart: ElsaFlowchart): ElsaGraph {
  const nodes = new Map<string, ElsaActivity>();
  const outEdges = new Map<string, ElsaConnection[]>();
  const inEdges = new Map<string, ElsaConnection[]>();

  for (const a of flowchart.activities) nodes.set(a.id, a);
  for (const c of flowchart.connections) {
    if (!outEdges.has(c.source)) outEdges.set(c.source, []);
    outEdges.get(c.source)!.push(c);
    if (!inEdges.has(c.target)) inEdges.set(c.target, []);
    inEdges.get(c.target)!.push(c);
  }

  const entryNodeId = flowchart.start
    ?? flowchart.activities.find(a => !inEdges.has(a.id))?.id
    ?? flowchart.activities[0]?.id
    ?? '';

  return { nodes, outEdges, inEdges, entryNodeId };
}

// --- Phase 3: Build Tree --------------------------------------------------

export function translateWorkflow(wf: ElsaWorkflow): Process {
  const sv = wf.metadata?.simpleView;
  if (!sv) throw new Error(`workflow ${wf.id} missing metadata.simpleView`);

  const graph = parseFlowchart(wf.root);
  const steps = buildSequence(graph, graph.entryNodeId, null);

  return {
    id: wf.id,
    title: sv.title,
    processOwner: sv.processOwner,
    kind: sv.kind ?? 'template',
    steps,
  };
}

// --- Recursive walker -----------------------------------------------------

export function buildSequence(
  graph: ElsaGraph,
  startId: string | null,
  stopId: string | null,
  visited: Set<string> = new Set(),
): ProcessStep[] {
  const result: ProcessStep[] = [];
  let current: string | null = startId;

  while (current !== null && current !== stopId) {
    // Cycle guard — should only fire on unmodeled back-edges.
    if (visited.has(current)) {
      console.warn(`[elsa-translator] cycle detected at ${current} — stopping`);
      break;
    }
    visited.add(current);

    const node = graph.nodes.get(current);
    if (!node) break;

    const role = classifyActivity(node);

    if (role.kind === 'marker') {
      // Elsa.Join — should normally be a stopId, but if we hit it here, just step over.
      current = followSingleOut(graph, current);
      continue;
    }

    if (role.kind === 'technical' && !role.shown) {
      current = followSingleOut(graph, current);
      continue;
    }

    if (role.kind === 'step') {
      result.push(buildStep(graph, node, role.stepType, visited));
      current = followSingleOut(graph, current);
      continue;
    }

    if (role.kind === 'gateway') {
      switch (role.gatewayType) {
        case 'decision': {
          const after = postDominator(graph, current);
          result.push(buildDecisionGateway(graph, node, after, visited));
          current = after;
          break;
        }
        case 'parallel': {
          const join = findMatchingJoin(graph, current);
          if (!join) throw new Error(`Fork ${current} has no matching Join`);
          result.push(buildParallelGateway(graph, node, join, visited));
          current = followSingleOut(graph, join);
          break;
        }
        case 'loop': {
          result.push(buildLoopGateway(graph, node, visited));
          current = followSingleOut(graph, current);
          break;
        }
      }
      // Technical also shown — render as a generic activity step
    } else if (role.kind === 'technical' && role.shown) {
      result.push(buildStep(graph, node, 'activity', visited));
      current = followSingleOut(graph, current);
    }
  }

  return result;
}

// --- Step builders --------------------------------------------------------

function buildStep(
  graph: ElsaGraph,
  node: ElsaActivity,
  stepType: 'task' | 'activity' | 'subprocess',
  visited: Set<string>,
): ProcessStep {
  const sv: SimpleViewActivityMeta = node.customProperties?.simpleView ?? {};
  const title = sv.title ?? node.metadata?.displayText ?? node.id;

  const base: ProcessStep = {
    kind: 'step',
    id: node.id,
    number: sv.number ?? '',
    title,
    status: 'pending',
    stepType,
    responsible: sv.responsible ?? '',
    category: sv.category ?? '',
    contextLinks: sv.contextLinks ?? [],
    tasks: sv.tasks ?? [],
    inputs: sv.inputs ?? [],
    actions: sv.actions ?? [],
    completionCriteria: sv.completionCriteria ?? [],
    conditionals: sv.conditionals ?? [],
    dueDate: sv.dueDate,
    collapsed: sv.collapsed,
  };

  if (stepType === 'task') {
    base.taskMode = sv.taskMode ?? 'description';
  }
  if (stepType === 'activity') {
    base.activityKind = sv.activityKind ?? 'object-creation';
  }
  if (stepType === 'subprocess' && node.body) {
    const innerGraph = parseFlowchart(node.body);
    base.subSteps = buildSequence(innerGraph, innerGraph.entryNodeId, null, new Set());
  }

  return base;
}

// --- Gateway builders -----------------------------------------------------

function buildDecisionGateway(
  graph: ElsaGraph,
  node: ElsaActivity,
  stopId: string | null,
  visited: Set<string>,
): ProcessStep {
  const sv = node.customProperties?.simpleView ?? {};
  const outs = graph.outEdges.get(node.id) ?? [];

  const branches: Branch[] = outs.map((edge, idx) => {
    const port = edge.sourcePort ?? '';
    const label = edge.metadata?.simpleView?.branchLabel
      ?? sv.branchLabels?.[port]
      ?? port
      ?? 'Branch';
    return {
      id: `${node.id}-${port || idx}`,
      label,
      condition: port,
      isDefault: edge.metadata?.simpleView?.defaultPath === true,
      // Each branch walks until convergence; carry visited fresh per branch
      // so siblings don't block each other (but include the gateway to prevent cycle back).
      steps: buildSequence(
        graph, edge.target, stopId,
        new Set([...visited, node.id]),
      ),
    };
  });

  return {
    kind: 'gateway',
    id: node.id,
    number: sv.number ?? '',
    title: sv.title ?? node.metadata?.displayText ?? 'Entscheid',
    status: 'pending',
    gatewayType: 'decision',
    branches,
    responsible: sv.responsible ?? '',
    category: sv.category ?? '',
    contextLinks: sv.contextLinks ?? [],
    tasks: [], inputs: [], actions: [],
    completionCriteria: [], conditionals: [],
    collapsed: sv.collapsed,
  };
}

function buildParallelGateway(
  graph: ElsaGraph,
  node: ElsaActivity,
  joinId: string,
  visited: Set<string>,
): ProcessStep {
  const sv = node.customProperties?.simpleView ?? {};
  const outs = graph.outEdges.get(node.id) ?? [];

  const parallelPaths = outs.map(edge =>
    buildSequence(graph, edge.target, joinId, new Set([...visited, node.id]))
  );
  const parallelPathLabels = sv.parallelPathLabels
    ?? outs.map((edge, i) => edge.sourcePort ?? `Pfad ${i + 1}`);

  return {
    kind: 'gateway',
    id: node.id,
    number: sv.number ?? '',
    title: sv.title ?? node.metadata?.displayText ?? 'Parallel',
    status: 'pending',
    gatewayType: 'parallel',
    parallelPaths,
    parallelPathLabels,
    responsible: sv.responsible ?? '',
    category: sv.category ?? '',
    contextLinks: sv.contextLinks ?? [],
    tasks: [], inputs: [], actions: [],
    completionCriteria: [], conditionals: [],
    collapsed: sv.collapsed,
  };
}

function buildLoopGateway(
  graph: ElsaGraph,
  node: ElsaActivity,
  visited: Set<string>,
): ProcessStep {
  const sv = node.customProperties?.simpleView ?? {};
  // Loop body: prefer node.body (composite activity) if present, otherwise
  // fall back to "next activity" but stop on second visit.
  let loopBody: ProcessStep[] = [];
  if (node.body) {
    const inner = parseFlowchart(node.body);
    loopBody = buildSequence(inner, inner.entryNodeId, null, new Set());
  } else {
    // Heuristic: walk forward, but stop when we'd revisit the loop node.
    const next = followSingleOut(graph, node.id);
    if (next) {
      loopBody = buildSequence(graph, next, node.id, new Set([...visited]));
    }
  }

  return {
    kind: 'gateway',
    id: node.id,
    number: sv.number ?? '',
    title: sv.title ?? node.metadata?.displayText ?? 'Schleife',
    status: 'pending',
    gatewayType: 'loop',
    loopBody,
    // Vorher stand hier sv.title: die Bedingung ging beim Roundtrip verloren
    // und im Schrittdetail erschien der Titel als Bedingung.
    loopCondition: sv.loopCondition ?? node.metadata?.displayText ?? sv.title,
    responsible: sv.responsible ?? '',
    category: sv.category ?? '',
    contextLinks: sv.contextLinks ?? [],
    tasks: [], inputs: [], actions: [],
    completionCriteria: [], conditionals: [],
    collapsed: sv.collapsed,
  };
}
