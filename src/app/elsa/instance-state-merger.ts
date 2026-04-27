// ============================================================
// Phase 4: Overlay an instance state onto a translated Process.
// ============================================================

import { Process, ProcessStep } from '../models/process.model';
import { ElsaInstanceState, ActivityExecution } from './elsa-workflow.types';

export function mergeInstanceState(template: Process, instance: ElsaInstanceState): Process {
  const execMap = new Map<string, ActivityExecution>();
  for (const e of instance.activityExecutions) execMap.set(e.activityId, e);

  const decisionMap = new Map<string, string>();
  for (const d of instance.decisions ?? []) {
    decisionMap.set(d.gatewayActivityId, d.chosenBranch);
  }

  const steps = template.steps.map(s => applyStateToStep(s, execMap, decisionMap));

  return {
    ...template,
    id: instance.instanceId,
    kind: 'instance',
    templateId: template.id,
    startedAt: instance.startedAt,
    startedBy: instance.startedBy,
    instanceState: instance.state,
    events: instance.events ?? [],
    steps,
  };
}

function applyStateToStep(
  step: ProcessStep,
  execMap: Map<string, ActivityExecution>,
  decisionMap: Map<string, string>,
): ProcessStep {
  const exec = execMap.get(step.id);
  const status: ProcessStep['status'] =
    exec?.status === 'completed' ? 'completed'
    : exec?.status === 'running' ? 'in-progress'
    : 'pending';

  const updated: ProcessStep = {
    ...step,
    status,
    completedDate: exec?.completedAt ?? step.completedDate,
  };

  // Recurse into branches / parallel paths / loop body / sub-steps
  if (step.kind === 'gateway') {
    if (step.gatewayType === 'decision' && step.branches) {
      updated.branches = step.branches.map(b => ({
        ...b,
        steps: b.steps.map(s => applyStateToStep(s, execMap, decisionMap)),
      }));
      // Find branch chosen for this decision (matches by branch.id suffix or condition)
      const chosen = decisionMap.get(step.id);
      if (chosen) {
        const match = step.branches.find(b =>
          b.condition === chosen
          || b.id.endsWith(`-${chosen}`)
          || b.label === chosen
        );
        if (match) updated.chosenBranchId = match.id;
      }
    }
    if (step.gatewayType === 'parallel' && step.parallelPaths) {
      updated.parallelPaths = step.parallelPaths.map(p =>
        p.map(s => applyStateToStep(s, execMap, decisionMap))
      );
    }
    if (step.gatewayType === 'loop' && step.loopBody) {
      updated.loopBody = step.loopBody.map(s => applyStateToStep(s, execMap, decisionMap));
    }
  }

  if (step.subSteps) {
    updated.subSteps = step.subSteps.map(s => applyStateToStep(s, execMap, decisionMap));
  }

  return updated;
}
