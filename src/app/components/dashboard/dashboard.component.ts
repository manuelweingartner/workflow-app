import { Component, inject, computed, Output, EventEmitter } from '@angular/core';
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
        <div class="header-actions">
          <button class="btn-new-template" (click)="openNewTemplate.emit()">
            <i class="material-icons">add_circle_outline</i>
            Neue Vorlage
          </button>
          <button class="btn-import-ki" (click)="openImport.emit()">
            <span class="ki-badge">KI+</span>
            <i class="material-icons">cloud_upload</i>
            Prozess importieren
          </button>
        </div>
      </div>

      <!-- Greeting + stats row -->
      <div class="cards-row">
        <div class="card greeting-card">
          <span class="greeting-title">Guten Tag</span>
          <span class="greeting-sub">Willkommen bei CMI Workflow</span>
        </div>
        <div class="card stat-card">
          <span class="stat-label">Heute fällige und abgelaufene Aufgaben</span>
          <span class="stat-value">{{ overdueTaskCount() }}</span>
        </div>
        <div class="card stat-card">
          <span class="stat-label">Laufende Instanzen</span>
          <span class="stat-value stat-running">{{ svc.allInstances().length }}</span>
        </div>
      </div>

      <!-- Laufende Instanzen -->
      @if (svc.allInstances().length > 0) {
        <div class="section">
          <h2>
            <i class="material-icons section-icon">play_circle</i>
            Laufende Workflow-Instanzen
          </h2>
          <div class="instance-grid">
            @for (inst of svc.allInstances(); track inst.id) {
              <div class="card instance-card" (click)="svc.openTab('prozess', inst.id)">
                <div class="inst-header">
                  <div class="inst-title-row">
                    <span class="inst-title">{{ inst.title }}</span>
                    <span class="inst-state-badge" [class]="inst.instanceState ?? 'running'">
                      {{ stateLabel(inst.instanceState ?? 'running') }}
                    </span>
                  </div>
                  <span class="inst-template">
                    <i class="material-icons">account_tree</i>
                    {{ templateName(inst.templateId) }}
                  </span>
                </div>
                <div class="inst-meta">
                  <span class="inst-meta-item">
                    <i class="material-icons">person</i>{{ inst.startedBy }}
                  </span>
                  <span class="inst-meta-item">
                    <i class="material-icons">calendar_today</i>Gestartet: {{ inst.startedAt }}
                  </span>
                </div>
                @if (currentStepTitle(inst); as stepTitle) {
                  <div class="inst-current-step">
                    <i class="material-icons">radio_button_checked</i>
                    <span>{{ stepTitle }}</span>
                  </div>
                }
                <div class="inst-progress">
                  <div class="inst-progress-bar">
                    <div class="inst-progress-fill" [style.width.%]="instanceProgressPercent(inst)"></div>
                  </div>
                  <span class="inst-progress-text">{{ instanceDoneSteps(inst) }}/{{ instanceTotalSteps(inst) }} Schritte</span>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Workflow-Vorlagen -->
      <div class="section">
        <h2>
          <i class="material-icons section-icon">account_tree</i>
          Workflow-Vorlagen
        </h2>
        <div class="process-grid">
          @for (proc of svc.allTemplates(); track proc.id) {
            <div class="card process-card">
              <div class="proc-header">
                <i class="material-icons proc-icon">account_tree</i>
                <div class="proc-title-col">
                  <span class="proc-title">{{ proc.title }}</span>
                  <span class="proc-owner">&#128100; {{ proc.processOwner.name }}</span>
                </div>
              </div>
              <div class="proc-actions">
                <button class="btn-open" (click)="svc.openTab('prozess', proc.id)">
                  <i class="material-icons">visibility</i> Öffnen
                </button>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Meine Geschäfte -->
      <div class="section">
        <h2>
          <i class="material-icons section-icon">folder</i>
          Meine Geschäfte
        </h2>
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
        <h2>
          <i class="material-icons section-icon">event</i>
          Nächste Sitzungen
        </h2>
        <div class="geschaeft-grid">
          @for (s of upcomingSitzungen(); track s.id) {
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
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .btn-import-ki {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 16px; border: none; border-radius: 20px;
      background: linear-gradient(135deg, #7c3aed, #009fe3);
      color: white; font-size: 13px; font-family: inherit;
      cursor: pointer; box-shadow: 0 2px 8px rgba(124,58,237,0.3);
      transition: box-shadow 0.2s, transform 0.15s;
    }
    .btn-import-ki:hover { box-shadow: 0 4px 14px rgba(124,58,237,0.45); transform: translateY(-1px); }
    .btn-import-ki .material-icons { font-size: 17px; }
    .btn-new-template {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 16px; border: 1.5px solid #009fe3; border-radius: 20px;
      background: white; color: #009fe3; font-size: 13px; font-family: inherit;
      cursor: pointer; transition: background 0.15s, box-shadow 0.2s, transform 0.15s;
    }
    .btn-new-template:hover { background: #e8f5fb; box-shadow: 0 2px 8px rgba(0,159,227,0.2); transform: translateY(-1px); }
    .btn-new-template .material-icons { font-size: 17px; }
    .ki-badge {
      font-size: 10px; font-weight: 700; background: rgba(255,255,255,0.25);
      border-radius: 4px; padding: 1px 5px; letter-spacing: 0.05em;
    }

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
    .stat-running { color: #009fe3; }

    .section { margin-bottom: 28px; }
    .section h2 {
      font-size: 1rem; font-weight: 500; color: #353c46; margin: 0 0 12px;
      display: flex; align-items: center; gap: 6px;
    }
    .section-icon { font-size: 18px; color: #6c7e93; }

    /* Instance cards */
    .instance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; }
    .instance-card { padding: 16px 20px; cursor: pointer; transition: box-shadow 0.15s; border-left: 4px solid #009fe3; }
    .instance-card:hover { box-shadow: 0 3px 8px rgba(0,0,0,0.18); }

    .inst-header { margin-bottom: 8px; }
    .inst-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .inst-title { font-size: 14px; font-weight: 500; color: #353c46; flex: 1; }
    .inst-state-badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; white-space: nowrap; flex-shrink: 0; }
    .inst-state-badge.running { background: #e6f4fd; color: #009fe3; }
    .inst-state-badge.completed { background: #eef7ea; color: #3f971a; }
    .inst-state-badge.paused { background: #fff8e1; color: #f59e0b; }
    .inst-state-badge.cancelled { background: #fdecea; color: #8c0909; }

    .inst-template { font-size: 12px; color: #6c7e93; display: flex; align-items: center; gap: 4px; }
    .inst-template .material-icons { font-size: 14px; }

    .inst-meta { display: flex; gap: 16px; margin-bottom: 10px; flex-wrap: wrap; }
    .inst-meta-item { font-size: 12px; color: #6c7e93; display: flex; align-items: center; gap: 3px; }
    .inst-meta-item .material-icons { font-size: 14px; }

    .inst-current-step {
      display: flex; align-items: center; gap: 6px; margin-bottom: 10px;
      font-size: 12px; color: #009fe3; background: #f0f9ff; padding: 4px 8px; border-radius: 4px;
    }
    .inst-current-step .material-icons { font-size: 14px; }

    .inst-progress { display: flex; align-items: center; gap: 8px; }
    .inst-progress-bar { flex: 1; height: 5px; background: #ebebed; border-radius: 3px; overflow: hidden; }
    .inst-progress-fill { height: 100%; background: #009fe3; border-radius: 3px; transition: width 0.3s; }
    .inst-progress-text { font-size: 11px; color: #6c7e93; white-space: nowrap; }

    /* Process (template) cards */
    .process-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .process-card { padding: 16px 20px; }
    .proc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .proc-icon { font-size: 28px; color: #6c7e93; }
    .proc-title-col { display: flex; flex-direction: column; flex: 1; }
    .proc-title { font-size: 14px; color: #353c46; font-weight: 400; }
    .proc-owner { font-size: 12px; color: #6c7e93; }
    .proc-actions { display: flex; gap: 8px; }
    .btn-open {
      display: flex; align-items: center; gap: 4px; padding: 5px 12px;
      background: #f4f5f6; border: 1px solid #dde2e7; border-radius: 4px;
      font-size: 12px; color: #353c46; cursor: pointer; font-family: inherit;
      transition: background 0.15s;
    }
    .btn-open:hover { background: #e6f4fd; border-color: #009fe3; color: #009fe3; }
    .btn-open .material-icons { font-size: 15px; }

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
  @Output() openImport = new EventEmitter<void>();
  @Output() openNewTemplate = new EventEmitter<void>();
  svc = inject(ProcessService);

  // "Nächste Sitzungen" has to read chronologically. The mock data is grouped by
  // body (Gemeinderat, GV, KESB, Bildungskommission), not by date, so sort here.
  upcomingSitzungen = computed(() =>
    this.svc.sitzungen().slice().sort((a, b) => this.sitzungSortKey(a.date) - this.sitzungSortKey(b.date)),
  );

  // 'TT.MM.JJJJ' -> sortable number. Unparseable dates sort last.
  private sitzungSortKey(date: string): number {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date.trim());
    if (!m) return Number.MAX_SAFE_INTEGER;
    return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  }

  templateName(templateId: string | undefined): string {
    if (!templateId) return '—';
    return this.svc.allTemplates().find((p) => p.id === templateId)?.title ?? templateId;
  }

  currentStepTitle(proc: Process): string {
    const flat = this.flattenSteps(proc.steps);
    return flat.find((s) => s.status === 'in-progress')?.title ?? '';
  }

  instanceDoneSteps(proc: Process): number {
    return this.flattenSteps(proc.steps).filter((s) => s.status === 'completed').length;
  }

  instanceTotalSteps(proc: Process): number {
    return this.flattenSteps(proc.steps).length;
  }

  instanceProgressPercent(proc: Process): number {
    const total = this.instanceTotalSteps(proc);
    return total > 0 ? (this.instanceDoneSteps(proc) / total) * 100 : 0;
  }

  stateLabel(state: string): string {
    return { running: 'Laufend', completed: 'Abgeschlossen', paused: 'Pausiert', cancelled: 'Abgebrochen' }[state] ?? state;
  }

  // Shallow flatten: only work steps (no gateways), includes branch/path/loop steps
  private flattenSteps(steps: any[]): any[] {
    const result: any[] = [];
    for (const s of steps) {
      if (s.kind !== 'gateway') result.push(s);
      for (const b of s.branches ?? []) result.push(...this.flattenSteps(b.steps));
      for (const p of s.parallelPaths ?? []) result.push(...this.flattenSteps(p));
      if (s.loopBody) result.push(...this.flattenSteps(s.loopBody));
      if (s.subSteps) result.push(...this.flattenSteps(s.subSteps));
    }
    return result;
  }

  overdueTaskCount = computed(() => {
    return this.svc.allInstances().reduce((count, proc) =>
      count + this.flattenSteps(proc.steps).reduce((c: number, step: any) =>
        c + step.tasks.filter((t: any) => t.status !== 'done' && t.dueDate).length, 0), 0);
  });
}
