// ============================================================
// Graph helpers: post-dominator + matching-join + reachability
// ============================================================

import { ElsaGraph } from './elsa-workflow.types';

// Returns the set of nodes reachable from `start` by following outEdges,
// stopping when `barriers` are hit (barriers are NOT included).
function reachableFrom(
  graph: ElsaGraph, start: string, barriers: Set<string> = new Set()
): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || barriers.has(id)) continue;
    seen.add(id);
    for (const edge of graph.outEdges.get(id) ?? []) {
      if (!seen.has(edge.target)) stack.push(edge.target);
    }
  }
  return seen;
}

// First node reachable from ALL outgoing branches of `decisionId`.
// Returns null if no common convergence exists.
export function postDominator(graph: ElsaGraph, decisionId: string): string | null {
  const outs = graph.outEdges.get(decisionId) ?? [];
  if (outs.length === 0) return null;

  // For each outgoing branch, compute the set of nodes reachable WITHOUT
  // going back through the decision itself.
  const barriers = new Set([decisionId]);
  const reachableSets = outs.map(o => reachableFrom(graph, o.target, barriers));

  // Intersect them all
  let common = new Set(reachableSets[0]);
  for (let i = 1; i < reachableSets.length; i++) {
    common = new Set([...common].filter(id => reachableSets[i].has(id)));
  }
  if (common.size === 0) return null;

  // Pick the node closest to the decision (BFS from decision, first hit in `common`).
  const queue: string[] = [decisionId];
  const visited = new Set<string>([decisionId]);
  while (queue.length) {
    const id = queue.shift()!;
    if (common.has(id) && id !== decisionId) return id;
    for (const edge of graph.outEdges.get(id) ?? []) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return null;
}

// Find the Elsa.Join that closes a Fork. Convention: join is the first
// node reachable from ALL fork branches that has type === 'Elsa.Join'.
export function findMatchingJoin(graph: ElsaGraph, forkId: string): string | null {
  const outs = graph.outEdges.get(forkId) ?? [];
  if (outs.length === 0) return null;

  const barriers = new Set([forkId]);
  const reachableSets = outs.map(o => reachableFrom(graph, o.target, barriers));

  let common = new Set(reachableSets[0]);
  for (let i = 1; i < reachableSets.length; i++) {
    common = new Set([...common].filter(id => reachableSets[i].has(id)));
  }

  for (const id of common) {
    if (graph.nodes.get(id)?.type === 'Elsa.Join') return id;
  }
  return null;
}

// Find the back-edge target for an Elsa loop activity (if modeled with explicit
// loop containers, this is just the activity's `body` start; for flat flowcharts
// with cycles, this would detect back-edges — out of scope for the prototype).
export function followSingleOut(graph: ElsaGraph, id: string): string | null {
  const out = graph.outEdges.get(id) ?? [];
  return out.length > 0 ? out[0].target : null;
}
