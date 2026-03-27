import { Component, inject } from '@angular/core';
import { ProcessService } from '../../services/process.service';
import { ProcessStep } from '../../models/process.model';

@Component({
  selector: 'app-process-overview',
  standalone: true,
  template: `
    <div class="overview">
      <div class="overview-header">
        <h2>Prozessübersicht</h2>
        <p class="overview-sub">Übersicht aller Schritte des Baudossiers mit Status, Verantwortlichkeiten und Zeitverlauf.</p>
      </div>


      <div class="progress-section">
        <div class="progress-label">
          <span>Gesamtfortschritt</span>
          <span>{{ svc.progress().done }} von {{ svc.progress().total }} Schritten abgeschlossen</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="(svc.progress().done / svc.progress().total) * 100"></div>
        </div>
        <div class="progress-legend">
          <span class="legend-item"><span class="dot completed"></span> Abgeschlossen</span>
          <span class="legend-item"><span class="dot in-progress"></span> In Bearbeitung</span>
          <span class="legend-item"><span class="dot pending"></span> Ausstehend</span>
        </div>
      </div>

      <div class="steps-list">
        @for (step of svc.steps(); track step.id) {
          <div class="step-row" [class.selected]="step.id === svc.selectedStep()?.id" (click)="svc.selectStep(step.id)">
            <div class="step-status-col">
              <div class="status-icon" [class]="step.status">
                @if (step.status === 'completed') {
                  <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#3f971a"/><path d="M6 10l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
                } @else if (step.status === 'in-progress') {
                  <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#009fe3" stroke-width="2"/><circle cx="10" cy="10" r="4" fill="#009fe3"/></svg>
                } @else {
                  <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#bdbdbd" stroke-width="2"/></svg>
                }
              </div>
              @if (!$last) {
                <div class="connector-line" [class]="step.status"></div>
              }
            </div>
            <div class="step-content">
              <div class="step-title-row">
                <span class="step-number">{{ step.number }}</span>
                <span class="step-title">{{ step.title }}</span>
              </div>
              <div class="step-meta">
                @if (step.completedDate) {
                  <span class="meta-item">&#128197; {{ step.completedDate }}</span>
                } @else if (step.dueDate) {
                  <span class="meta-item due">&#128197; Fällig {{ step.dueDate }}</span>
                }
                <span class="meta-item">&#128100; {{ step.responsible }}</span>
              </div>
            </div>
            <div class="step-status-label" [class]="step.status">
              {{ statusLabel(step.status) }}
            </div>
          </div>
          @if (svc.canInsertAfter(step.id)) {
            <div class="insert-row">
              <button class="insert-btn" title="Schritt einfügen" (click)="onInsert($event, step.id)">
                <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="#009fe3" stroke-width="1.5"/><path d="M8 4v8M4 8h8" stroke="#009fe3" stroke-width="1.5"/></svg>
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .overview {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      padding: 24px;
      min-width: 380px;
      max-width: 480px;
      border-right: 1px solid rgba(0, 0, 0, 0.12);
      background: #ffffff;
    }
    .overview-header h2 { margin: 0 0 4px; font-size: 1.375rem; font-weight: 400; color: #353c46; line-height: 1.75rem; }
    .overview-sub { margin: 0 0 20px; font-size: 0.75rem; color: #6c7e93; }

    .progress-section { margin-bottom: 16px; }
    .progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; color: #586475; margin-bottom: 6px; }
    .progress-bar { height: 8px; background: #ebebed; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: #3f971a; border-radius: 4px; transition: width 0.3s; }
    .progress-legend { display: flex; gap: 16px; margin-top: 8px; font-size: 0.6875rem; color: #6c7e93; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
    .dot.completed { background: #3f971a; }
    .dot.in-progress { background: #009fe3; }
    .dot.pending { background: #bdbdbd; }

    .steps-list { flex: 1; }
    .step-row {
      display: flex; align-items: flex-start; gap: 12px; padding: 10px 12px;
      cursor: pointer; border-radius: 8px; transition: background 0.15s;
    }
    .step-row:hover { background: #f4f5f6; }
    .step-row.selected { background: #e6f4fd; }

    .step-status-col { display: flex; flex-direction: column; align-items: center; min-width: 20px; }
    .connector-line { width: 2px; flex: 1; min-height: 20px; background: #bdbdbd; }
    .connector-line.completed { background: #3f971a; }
    .connector-line.in-progress { background: #009fe3; }

    .step-content { flex: 1; min-width: 0; }
    .step-title-row { display: flex; align-items: center; gap: 8px; }
    .step-number {
      font-size: 0.6875rem; background: #ebebed; color: #586475;
      padding: 2px 8px; border-radius: 10px; white-space: nowrap;
    }
    .step-title { font-size: 0.875rem; font-weight: 400; color: #353c46; }
    .step-meta { display: flex; gap: 12px; margin-top: 4px; font-size: 0.75rem; color: #6c7e93; flex-wrap: wrap; }
    .meta-item.due { color: #8c0909; }

    .step-status-label {
      font-size: 0.6875rem; white-space: nowrap; padding: 2px 10px; border-radius: 12px; margin-top: 2px;
    }
    .step-status-label.completed { color: #3f971a; background: #eef7ea; }
    .step-status-label.in-progress { color: #009fe3; background: #e6f4fd; }
    .step-status-label.pending { color: #6c7e93; background: #f4f5f6; }

    .insert-row { display: flex; justify-content: flex-start; padding-left: 22px; height: 14px; }
    .insert-btn {
      background: none; border: none; cursor: pointer; opacity: 0; transition: opacity 0.2s; padding: 0;
    }
    .step-row:hover + .insert-row .insert-btn,
    .insert-row:hover .insert-btn { opacity: 1; }
  `,
})
export class ProcessOverviewComponent {
  svc = inject(ProcessService);

  statusLabel(status: ProcessStep['status']): string {
    return { completed: 'Abgeschlossen', 'in-progress': 'In Bearbeitung', pending: 'Ausstehend' }[status];
  }

  onInsert(event: Event, afterId: string) {
    event.stopPropagation();
    this.svc.insertStepAfter(afterId);
  }
}
