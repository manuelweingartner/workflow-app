// ============================================================
// Phase 5: Replace post-decision sequences with an unknown-future
// marker when the decision is still pending and no defaultPath
// branch is annotated. Cascades a `predicted` flag onto all steps
// downstream of an unresolved decision-with-default so the UI can
// render them with dashed lines.
// ============================================================

import { Process, ProcessStep } from '../models/process.model';

export function pruneFuture(process: Process): Process {
  return { ...process, steps: pruneSequence(process.steps, false) };
}

function pruneSequence(steps: ProcessStep[], predicted: boolean): ProcessStep[] {
  const out: ProcessStep[] = [];
  let pred = predicted;

  for (let i = 0; i < steps.length; i++) {
    out.push(pruneStep(steps[i], pred));

    const step = steps[i];
    const isPendingDecision =
      step.kind === 'gateway'
      && step.gatewayType === 'decision'
      && step.status === 'pending';

    if (isPendingDecision) {
      const hasDefault = (step.branches ?? []).some(b => b.isDefault);
      if (!hasDefault && i < steps.length - 1) {
        out.push(unknownFutureMarker(`${step.id}-future`));
        break;
      }
      if (hasDefault) {
        // Subsequent siblings depend on this unresolved decision → predicted.
        pred = true;
      }
    }
  }
  return out;
}

function pruneStep(step: ProcessStep, predicted: boolean): ProcessStep {
  const updated: ProcessStep = predicted ? { ...step, predicted: true } : { ...step };

  if (step.kind === 'gateway') {
    if (step.gatewayType === 'decision' && step.branches) {
      // Branch contents of a pending decision are speculative even when the
      // outer scope itself isn't yet predicted.
      const innerPred = predicted || step.status === 'pending';
      updated.branches = step.branches.map(b => ({
        ...b, steps: pruneSequence(b.steps, innerPred),
      }));
    }
    if (step.gatewayType === 'parallel' && step.parallelPaths) {
      updated.parallelPaths = step.parallelPaths.map(p => pruneSequence(p, predicted));
    }
    if (step.gatewayType === 'loop' && step.loopBody) {
      updated.loopBody = pruneSequence(step.loopBody, predicted);
    }
  }
  if (step.subSteps) {
    updated.subSteps = pruneSequence(step.subSteps, predicted);
  }
  return updated;
}

function unknownFutureMarker(id: string): ProcessStep {
  return {
    kind: 'unknown-future',
    id,
    number: '',
    title: 'Weiterer Verlauf hängt vom Entscheid ab',
    status: 'pending',
    responsible: '',
    category: '',
    contextLinks: [],
    tasks: [], inputs: [], actions: [],
    completionCriteria: [], conditionals: [],
  };
}
