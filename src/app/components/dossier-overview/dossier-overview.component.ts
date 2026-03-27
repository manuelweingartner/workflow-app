import { Component, inject } from '@angular/core';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-dossier-overview',
  standalone: true,
  template: `
    <div class="view">
      <h2 class="page-title">Dossierübersicht</h2>
      <p class="page-sub">{{ svc.dossier$().number }} &mdash; {{ svc.dossier$().title }}</p>

      <!-- Horizontale Prozess-Mini-Ansicht -->
      <div class="card process-strip">
        <div class="strip-label">Prozessfortschritt</div>
        <div class="strip-track">
          @for (step of svc.steps(); track step.id; let i = $index) {
            <div class="strip-step" [class]="step.status" (click)="svc.navigateToStep(step.id)">
              <div class="strip-dot">
                @if (step.status === 'completed') {
                  <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#3f971a"/><path d="M4 7l2 2 4-4" stroke="white" stroke-width="1.5" fill="none"/></svg>
                } @else if (step.status === 'in-progress') {
                  <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#009fe3"/><circle cx="7" cy="7" r="2.5" fill="white"/></svg>
                } @else {
                  <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="#bdbdbd" stroke-width="1.5"/></svg>
                }
              </div>
              @if (step.status === 'in-progress') {
                <span class="strip-name active">{{ step.title }}</span>
              }
            </div>
            @if (i < svc.steps().length - 1) {
              <div class="strip-connector" [class]="step.status"></div>
            }
          }
        </div>
        <div class="strip-info">
          {{ svc.progress().done }} von {{ svc.progress().total }} Schritten abgeschlossen
        </div>
      </div>

      <!-- Aktuelle Schritte -->
      <div class="current-section">
        <h3>Aktueller Schritt</h3>
        @if (currentStep(); as step) {
          <div class="card current-card" (click)="svc.navigateToStep(step.id)">
            <div class="current-status">In Bearbeitung</div>
            <div class="current-title">{{ step.number }} &mdash; {{ step.title }}</div>
            <div class="current-meta">
              <span>&#128100; {{ step.responsible }}</span>
              @if (step.dueDate) { <span>&#128197; Fällig: {{ step.dueDate }}</span> }
            </div>
            <div class="current-progress">
              <span>Aufgaben: {{ doneCount(step) }}/{{ step.tasks.length }}</span>
              <span>Kriterien: {{ metCount(step) }}/{{ step.completionCriteria.length }}</span>
            </div>
          </div>
        }
      </div>

      <!-- Kurzübersicht -->
      <div class="stats-row">
        <div class="stat-card" (click)="svc.setActiveMenu('tasks')">
          <span class="stat-value">{{ openTaskCount() }}</span>
          <span class="stat-label">Offene Aufgaben</span>
        </div>
        <div class="stat-card" (click)="svc.setActiveMenu('documents')">
          <span class="stat-value">{{ missingDocCount() }}</span>
          <span class="stat-label">Fehlende Dokumente</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ svc.progress().done }}</span>
          <span class="stat-label">Schritte erledigt</span>
        </div>
      </div>
    </div>
  `,
  styles: `
    .view { padding: 0 30px 30px; overflow-y: auto; height: 100%; }
    .page-title { font-size: 1.375rem; font-weight: 400; color: #353c46; margin: 0; padding: 24px 0 4px; }
    .page-sub { margin: 0 0 20px; font-size: 14px; color: #6c7e93; }
    .card {
      background: #ffffff; border-radius: 4px;
      box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
      margin-bottom: 20px;
    }
    .process-strip {
      padding: 16px 24px;
    }
    .strip-label { font-size: 11px; font-weight: 400; color: #6c7e93; text-transform: uppercase; margin-bottom: 12px; }
    .strip-track { display: flex; align-items: center; overflow-x: auto; padding: 4px 0; }
    .strip-step { display: flex; flex-direction: column; align-items: center; cursor: pointer; flex-shrink: 0; position: relative; }
    .strip-step:hover .strip-dot { transform: scale(1.2); }
    .strip-dot { transition: transform 0.15s; }
    .strip-name {
      position: absolute; top: 20px; font-size: 10px; white-space: nowrap;
      color: #6c7e93; max-width: 120px; overflow: hidden; text-overflow: ellipsis;
    }
    .strip-name.active { color: #009fe3; font-weight: 700; font-size: 11px; }
    .strip-connector { width: 20px; height: 2px; flex-shrink: 0; background: #bdbdbd; }
    .strip-connector.completed { background: #3f971a; }
    .strip-connector.in-progress { background: #009fe3; }
    .strip-info { margin-top: 20px; font-size: 12px; color: #6c7e93; }

    .current-section { margin-bottom: 24px; }
    .current-section h3 { font-size: 16px; font-weight: 400; color: #353c46; margin: 0 0 12px; line-height: 1.5rem; }
    .current-card {
      border-left: 4px solid #009fe3;
      padding: 20px 24px; cursor: pointer; transition: box-shadow 0.15s;
    }
    .current-card:hover { box-shadow: 0 3px 6px rgba(0,0,0,.16); }
    .current-status {
      font-size: 11px; color: #009fe3; background: #e6f4fd;
      display: inline-block; padding: 2px 8px; border-radius: 10px; font-weight: 400; margin-bottom: 8px;
    }
    .current-title { font-size: 16px; font-weight: 400; color: #353c46; margin-bottom: 8px; line-height: 1.25rem; }
    .current-meta { display: flex; gap: 16px; font-size: 12px; color: #6c7e93; margin-bottom: 8px; }
    .current-progress { display: flex; gap: 16px; font-size: 12px; color: #586475; }

    .stats-row { display: flex; gap: 16px; }
    .stat-card {
      flex: 1; background: #ffffff; border-radius: 4px;
      box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
      padding: 16px; text-align: center; cursor: pointer; transition: box-shadow 0.15s;
    }
    .stat-card:hover { box-shadow: 0 3px 6px rgba(0,0,0,.16); }
    .stat-value { display: block; font-size: 28px; font-weight: 700; color: #353c46; }
    .stat-label { font-size: 11px; color: #6c7e93; }
  `,
})
export class DossierOverviewComponent {
  svc = inject(ProcessService);

  currentStep() {
    return this.svc.steps().find((s) => s.status === 'in-progress') ?? null;
  }

  doneCount(step: { tasks: { status: string }[] }) {
    return step.tasks.filter((t) => t.status === 'done').length;
  }

  metCount(step: { completionCriteria: { met: boolean }[] }) {
    return step.completionCriteria.filter((c) => c.met).length;
  }

  openTaskCount() {
    return this.svc.allTasks().filter((t) => t.task.status !== 'done').length;
  }

  missingDocCount() {
    return this.svc.allDocuments().filter((d) => !d.input.uploaded).length;
  }
}
