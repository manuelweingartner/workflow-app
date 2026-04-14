import { Component, inject } from '@angular/core';
import { ProcessService } from '../../services/process.service';
import { WorkflowEventType } from '../../models/process.model';

@Component({
  selector: 'app-workflow-verlauf',
  standalone: true,
  template: `
    <div class="verlauf-view">
      <div class="verlauf-header">
        <h2>Verlauf</h2>
        <span class="verlauf-count">{{ svc.activeProcessEvents().length }} Einträge</span>
      </div>

      @if (svc.activeProcessEvents().length === 0) {
        <div class="verlauf-empty">
          <i class="material-icons">history</i>
          <span>Noch keine Ereignisse aufgezeichnet.</span>
        </div>
      } @else {
        <div class="verlauf-timeline">
          @for (event of svc.activeProcessEvents(); track event.id) {
            <div class="event-row">
              <!-- Timeline line + icon -->
              <div class="event-line">
                <div class="event-icon" [class]="event.type">
                  <i class="material-icons">{{ eventIcon(event.type) }}</i>
                </div>
                <div class="event-connector"></div>
              </div>

              <!-- Event content -->
              <div class="event-content">
                <div class="event-description">{{ event.description }}</div>
                <div class="event-meta">
                  <span class="event-actor">
                    <i class="material-icons">person</i>{{ event.actor }}
                  </span>
                  <span class="event-time">{{ formatTimestamp(event.timestamp) }}</span>
                  @if (event.stepTitle) {
                    <span class="event-step">
                      <i class="material-icons">radio_button_checked</i>{{ event.stepTitle }}
                    </span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .verlauf-view { padding: 24px 28px; max-width: 700px; }

    .verlauf-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px;
    }
    .verlauf-header h2 { font-size: 1rem; font-weight: 500; color: #353c46; margin: 0; }
    .verlauf-count {
      font-size: 12px; color: #6c7e93; background: #f4f5f6;
      padding: 2px 10px; border-radius: 12px;
    }

    .verlauf-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; padding: 60px 0; color: #6c7e93;
    }
    .verlauf-empty .material-icons { font-size: 48px; opacity: 0.4; }

    /* Timeline */
    .verlauf-timeline { display: flex; flex-direction: column; }

    .event-row {
      display: flex; gap: 0; align-items: flex-start;
    }

    .event-line {
      display: flex; flex-direction: column; align-items: center;
      flex-shrink: 0; width: 36px;
    }

    .event-icon {
      width: 30px; height: 30px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; z-index: 1;
    }
    .event-icon .material-icons { font-size: 15px; }
    .event-icon.started { background: #e6f4fd; color: #009fe3; }
    .event-icon.step_completed { background: #eef7ea; color: #3f971a; }
    .event-icon.branch_chosen { background: #fef3c7; color: #f59e0b; }
    .event-icon.task_added { background: #f3e8ff; color: #7c3aed; }
    .event-icon.note_added { background: #f4f5f6; color: #6c7e93; }

    .event-connector {
      flex: 1; width: 2px; background: #e0e4e8; min-height: 16px;
    }
    .event-row:last-child .event-connector { display: none; }

    .event-content {
      flex: 1; padding: 4px 0 20px 12px;
    }
    .event-description { font-size: 14px; color: #353c46; margin-bottom: 5px; }
    .event-meta {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    }
    .event-actor, .event-time, .event-step {
      font-size: 12px; color: #6c7e93; display: flex; align-items: center; gap: 3px;
    }
    .event-actor .material-icons,
    .event-time .material-icons,
    .event-step .material-icons { font-size: 13px; }
  `,
})
export class WorkflowVerlaufComponent {
  svc = inject(ProcessService);

  eventIcon(type: WorkflowEventType): string {
    const icons: Record<WorkflowEventType, string> = {
      started: 'play_arrow',
      step_completed: 'check_circle',
      branch_chosen: 'call_split',
      task_added: 'add_task',
      note_added: 'note_add',
    };
    return icons[type] ?? 'circle';
  }

  formatTimestamp(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('de-CH') + ' ' + d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }
}
