// ============================================================
// Phase 2: Classify each activity by role.
// ============================================================

import { ElsaActivity } from './elsa-workflow.types';
import { StepType, GatewayType } from '../models/process.model';

export type ActivityRole =
  | { kind: 'step'; stepType: StepType }
  | { kind: 'gateway'; gatewayType: GatewayType }
  | { kind: 'marker' }                         // Elsa.Join — ignored visually, used for pairing
  | { kind: 'technical'; shown: boolean };

export function classifyActivity(activity: ElsaActivity): ActivityRole {
  const type = activity.type;
  const sv = activity.customProperties?.simpleView;

  switch (type) {
    case 'Cmi.TaskActivity':
      return { kind: 'step', stepType: 'task' };
    case 'Cmi.ServiceActivity':
      return { kind: 'step', stepType: 'activity' };
    case 'Cmi.SubprocessActivity':
      return { kind: 'step', stepType: 'subprocess' };

    case 'Elsa.If':
    case 'Elsa.Switch':
      return { kind: 'gateway', gatewayType: 'decision' };

    case 'Elsa.Fork':
      return { kind: 'gateway', gatewayType: 'parallel' };
    case 'Elsa.Join':
      return { kind: 'marker' };

    case 'Elsa.While':
    case 'Elsa.For':
    case 'Elsa.ForEach':
      return { kind: 'gateway', gatewayType: 'loop' };

    default:
      // Technical (HTTP, SendEmail, etc.) — hidden unless opted-in
      return { kind: 'technical', shown: sv?.show === true };
  }
}
