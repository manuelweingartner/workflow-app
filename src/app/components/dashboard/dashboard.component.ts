import { Component, inject, computed } from '@angular/core';
import { ProcessService } from '../../services/process.service';
import { Process } from '../../models/process.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <!-- Search bar -->
    <div class="search-bar">
      <div class="search-type">
        <span>Geschäft</span>
        <i class="material-icons">arrow_drop_down</i>
      </div>
      <div class="search-input">
        <i class="material-icons search-icon">search</i>
        <input type="text" placeholder="Suche nach Geschäft, Prozess, Sitzung..." />
      </div>
    </div>

    <!-- Dashboard content -->
    <div class="dashboard">
      <div class="dashboard-header">
        <h1>Mein Dashboard</h1>
      </div>

      <!-- Greeting + stats row -->
      <div class="cards-row">
        <div class="card greeting-card">
          <span class="greeting-title">Guten Tag</span>
          <span class="greeting-sub">Willkommen bei CMI Workflow</span>
        </div>
        <div class="card stat-card" (click)="svc.openTab('geschaeft', '1')">
          <span class="stat-label">Heute fällige und abgelaufene Aufgaben</span>
          <span class="stat-value">{{ overdueTaskCount() }}</span>
        </div>
        <div class="card stat-card">
          <span class="stat-label">Laufende Prozesse</span>
          <span class="stat-value">{{ runningProcessCount() }}</span>
        </div>
      </div>

      <!-- Meine Prozesse -->
      <div class="section">
        <h2>Meine Prozesse</h2>
        <div class="process-grid">
          @for (proc of svc.processes(); track proc.id) {
            <div class="card process-card" (click)="svc.openTab('prozess', proc.id)">
              <div class="proc-header">
                <i class="material-icons proc-icon">account_tree</i>
                <div class="proc-title-col">
                  <span class="proc-title">{{ proc.title }}</span>
                  <span class="proc-owner">&#128100; {{ proc.processOwner.name }}</span>
                </div>
              </div>
              <div class="proc-progress">
                <div class="proc-progress-bar">
                  <div class="proc-progress-fill" [style.width.%]="progressPercent(proc)"></div>
                </div>
                <span class="proc-progress-text">{{ doneSteps(proc) }}/{{ proc.steps.length }} Schritte</span>
              </div>
              <div class="proc-status">
                <span class="proc-status-badge" [class]="currentStatus(proc)">{{ statusLabel(currentStatus(proc)) }}</span>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Meine Geschäfte -->
      <div class="section">
        <h2>Meine Geschäfte</h2>
        <div class="geschaeft-grid">
          @for (d of svc.dossiers(); track d.id) {
            <div class="card geschaeft-card" (click)="svc.openTab('geschaeft', d.id)">
              <div class="ges-icon-col">
                <i class="material-icons">folder</i>
              </div>
              <div class="ges-info">
                <span class="ges-number">{{ d.number }}</span>
                <span class="ges-title">{{ d.title }}</span>
              </div>
              <i class="material-icons ges-arrow">chevron_right</i>
            </div>
          }
        </div>
      </div>

      <!-- Meine Sitzungen -->
      <div class="section">
        <h2>Nächste Sitzungen</h2>
        <div class="geschaeft-grid">
          @for (s of svc.sitzungen(); track s.id) {
            <div class="card geschaeft-card sitzung" (click)="svc.openTab('sitzung', s.id)">
              <div class="ges-icon-col sitzung-icon">
                <i class="material-icons">event</i>
              </div>
              <div class="ges-info">
                <span class="ges-number">{{ s.date }} &mdash; {{ s.number }}</span>
                <span class="ges-title">{{ s.title }}</span>
                <span class="ges-sub">{{ s.organization }} &mdash; {{ s.traktanden.length }} Traktanden</span>
              </div>
              <i class="material-icons ges-arrow">chevron_right</i>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

    /* Search bar */
    .search-bar {
      display: flex; align-items: center; background: #586475; padding: 10px 24px; flex-shrink: 0;
    }
    .search-type {
      display: flex; align-items: center; gap: 4px; background: #ffffff; padding: 8px 12px;
      border-radius: 4px 0 0 4px; font-size: 14px; color: #353c46; cursor: pointer; min-width: 120px;
    }
    .search-type .material-icons { font-size: 20px; color: #6c7e93; }
    .search-input {
      flex: 1; display: flex; align-items: center; background: #ffffff; padding: 0 12px;
      border-radius: 0 4px 4px 0; border-left: 1px solid #ebebed;
    }
    .search-icon { font-size: 20px; color: #6c7e93; margin-right: 8px; }
    .search-input input {
      flex: 1; border: none; outline: none; padding: 8px 0; font-size: 14px;
      font-family: inherit; color: #353c46;
    }

    /* Dashboard */
    .dashboard { flex: 1; overflow-y: auto; padding: 24px 30px 40px; }
    .dashboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .dashboard-header h1 { font-size: 1.25rem; font-weight: 400; color: #353c46; margin: 0; }

    .cards-row { display: flex; gap: 16px; margin-bottom: 28px; }
    .card {
      background: #ffffff; border-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
    }
    .greeting-card {
      flex: 2; padding: 24px; display: flex; flex-direction: column; justify-content: center;
      border-left: 4px solid #009fe3;
    }
    .greeting-title { font-size: 18px; color: #009fe3; font-weight: 400; margin-bottom: 4px; }
    .greeting-sub { font-size: 13px; color: #6c7e93; }
    .stat-card {
      flex: 1; padding: 20px; text-align: center; cursor: pointer; transition: box-shadow 0.15s;
    }
    .stat-card:hover { box-shadow: 0 3px 8px rgba(0,0,0,0.18); }
    .stat-label { display: block; font-size: 13px; color: #6c7e93; margin-bottom: 8px; }
    .stat-value { display: block; font-size: 36px; font-weight: 300; color: #353c46; }

    .section { margin-bottom: 28px; }
    .section h2 { font-size: 1rem; font-weight: 500; color: #353c46; margin: 0 0 12px; }

    /* Process cards */
    .process-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
    .process-card { padding: 16px 20px; cursor: pointer; transition: box-shadow 0.15s; }
    .process-card:hover { box-shadow: 0 3px 8px rgba(0,0,0,0.18); }
    .proc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .proc-icon { font-size: 28px; color: #009fe3; }
    .proc-title-col { display: flex; flex-direction: column; }
    .proc-title { font-size: 14px; color: #353c46; font-weight: 400; }
    .proc-owner { font-size: 12px; color: #6c7e93; }
    .proc-progress { margin-bottom: 8px; }
    .proc-progress-bar { height: 6px; background: #ebebed; border-radius: 3px; overflow: hidden; }
    .proc-progress-fill { height: 100%; background: #3f971a; border-radius: 3px; transition: width 0.3s; }
    .proc-progress-text { font-size: 11px; color: #6c7e93; }
    .proc-status-badge { font-size: 11px; padding: 2px 10px; border-radius: 12px; }
    .proc-status-badge.in-progress { background: #e6f4fd; color: #009fe3; }
    .proc-status-badge.completed { background: #eef7ea; color: #3f971a; }
    .proc-status-badge.pending { background: #f4f5f6; color: #6c7e93; }

    /* Geschäft / Sitzung list */
    .geschaeft-grid { display: flex; flex-direction: column; gap: 8px; }
    .geschaeft-card {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      cursor: pointer; transition: box-shadow 0.15s;
    }
    .geschaeft-card:hover { box-shadow: 0 3px 8px rgba(0,0,0,0.18); }
    .ges-icon-col { width: 36px; height: 36px; border-radius: 4px; background: #e6f4fd; color: #009fe3;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .ges-icon-col .material-icons { font-size: 20px; }
    .sitzung-icon { background: #f3e8ff; color: #7c3aed; }
    .ges-info { flex: 1; display: flex; flex-direction: column; }
    .ges-number { font-size: 11px; color: #6c7e93; }
    .ges-title { font-size: 14px; color: #353c46; }
    .ges-sub { font-size: 12px; color: #6c7e93; }
    .ges-arrow { font-size: 20px; color: #bdbdbd; }
    .geschaeft-card:hover .ges-arrow { color: #009fe3; }
  `,
})
export class DashboardComponent {
  svc = inject(ProcessService);

  doneSteps(proc: Process): number {
    return proc.steps.filter((s) => s.status === 'completed').length;
  }

  progressPercent(proc: Process): number {
    return proc.steps.length > 0 ? (this.doneSteps(proc) / proc.steps.length) * 100 : 0;
  }

  currentStatus(proc: Process): string {
    if (proc.steps.every((s) => s.status === 'completed')) return 'completed';
    if (proc.steps.some((s) => s.status === 'in-progress')) return 'in-progress';
    return 'pending';
  }

  statusLabel(s: string): string {
    return { completed: 'Abgeschlossen', 'in-progress': 'In Bearbeitung', pending: 'Ausstehend' }[s] ?? s;
  }

  overdueTaskCount = computed(() => {
    return this.svc.processes().reduce((count, proc) =>
      count + proc.steps.reduce((c, step) =>
        c + step.tasks.filter((t) => t.status !== 'done' && t.dueDate).length, 0), 0);
  });

  runningProcessCount = computed(() => {
    return this.svc.processes().filter((p) => p.steps.some((s) => s.status === 'in-progress')).length;
  });
}
