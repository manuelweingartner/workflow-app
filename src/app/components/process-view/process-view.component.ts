import { Component, inject, signal, computed } from '@angular/core';
import { SidebarComponent, MenuItem } from '../sidebar/sidebar.component';
import { ProcessOverviewComponent } from '../process-overview/process-overview.component';
import { StepDetailComponent } from '../step-detail/step-detail.component';
import { DocumentsViewComponent } from '../documents-view/documents-view.component';
import { TasksViewComponent } from '../tasks-view/tasks-view.component';
import { WorkflowStartDialogComponent } from '../workflow-start-dialog/workflow-start-dialog.component';
import { WorkflowVerlaufComponent } from '../workflow-verlauf/workflow-verlauf.component';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-process-view',
  standalone: true,
  imports: [
    SidebarComponent, ProcessOverviewComponent, StepDetailComponent,
    DocumentsViewComponent, TasksViewComponent,
    WorkflowStartDialogComponent, WorkflowVerlaufComponent,
  ],
  template: `
    <!-- Template / Instance banner -->
    <div class="process-kind-banner" [class.instance-banner]="isInstance()">
      <div class="banner-left">
        @if (isInstance()) {
          <span class="kind-badge instance">
            <i class="material-icons">play_circle</i>
            Instanz
          </span>
          <span class="kind-state-badge" [class]="activeProcess()?.instanceState ?? 'running'">
            {{ stateLabel(activeProcess()?.instanceState ?? 'running') }}
          </span>
          <span class="kind-meta">
            Gestartet am {{ activeProcess()?.startedAt }} von {{ activeProcess()?.startedBy }}
          </span>
        } @else {
          <span class="kind-badge template">
            <i class="material-icons">account_tree</i>
            Vorlage
          </span>
          <span class="kind-meta">Workflow-Vorlage — schreibgeschützt für laufende Instanzen</span>
        }
      </div>
      <div class="banner-right">
        @if (isInstance()) {
          <button class="btn-template-link" (click)="goToTemplate()">
            <i class="material-icons">account_tree</i>
            Zur Vorlage
          </button>
        } @else {
          <button class="btn-start" (click)="showStartDialog.set(true)">
            <i class="material-icons">play_arrow</i>
            Workflow starten
          </button>
        }
      </div>
    </div>

    <!-- Main content area (sidebar + view) -->
    <div class="view-body">
      <app-sidebar [items]="menuItems()" [activeId]="svc.activeMenu()" (itemClick)="svc.setActiveMenu($event)" />
      @switch (svc.activeMenu()) {
        @case ('process') {
          <app-process-overview [style.width.px]="overviewWidth()" />
          <div class="resize-handle" (mousedown)="onResizeStart($event)" title="Breite anpassen">
            <div class="resize-grip"></div>
          </div>
          <div class="detail-panel">
            <app-step-detail />
          </div>
        }
        @case ('documents') {
          <div class="content-panel">
            <app-documents-view />
          </div>
        }
        @case ('tasks') {
          <div class="content-panel">
            <app-tasks-view />
          </div>
        }
        @case ('verlauf') {
          <div class="content-panel">
            <app-workflow-verlauf />
          </div>
        }
        @default {
          <div class="placeholder-content">
            <h2>{{ getMenuLabel(svc.activeMenu()) }}</h2>
            <p>Dieser Bereich ist noch nicht implementiert.</p>
          </div>
        }
      }
    </div>

    <!-- Start workflow dialog (shown when button clicked) -->
    @if (showStartDialog()) {
      <app-workflow-start-dialog
        [preselectedTemplateId]="activeProcess()?.id ?? ''"
        (cancelled)="showStartDialog.set(false)"
        (started)="onWorkflowStarted($event)"
      />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

    /* Banner */
    .process-kind-banner {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 16px; background: #f9fafb; border-bottom: 1px solid #e0e4e8;
      flex-shrink: 0; gap: 12px; min-height: 38px;
    }
    .instance-banner { background: #f0f9ff; border-bottom-color: #b3d9f5; }
    .banner-left { display: flex; align-items: center; gap: 8px; }
    .banner-right { display: flex; align-items: center; gap: 8px; }

    .kind-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 12px;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .kind-badge.template { background: #f4f5f6; color: #586475; border: 1px solid #dde2e7; }
    .kind-badge.instance { background: #e6f4fd; color: #009fe3; border: 1px solid #b3d9f5; }
    .kind-badge .material-icons { font-size: 13px; }

    .kind-state-badge {
      font-size: 11px; padding: 2px 8px; border-radius: 12px;
    }
    .kind-state-badge.running { background: #e6f4fd; color: #009fe3; }
    .kind-state-badge.completed { background: #eef7ea; color: #3f971a; }
    .kind-state-badge.paused { background: #fff8e1; color: #f59e0b; }
    .kind-state-badge.cancelled { background: #fdecea; color: #8c0909; }

    .kind-meta { font-size: 12px; color: #6c7e93; }

    .btn-start {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 14px; background: #009fe3; border: none;
      border-radius: 4px; font-size: 12px; font-family: inherit; color: #fff;
      cursor: pointer; transition: background 0.15s;
    }
    .btn-start:hover { background: #0080c0; }
    .btn-start .material-icons { font-size: 16px; }

    .btn-template-link {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 14px; background: #f4f5f6; border: 1px solid #dde2e7;
      border-radius: 4px; font-size: 12px; font-family: inherit; color: #353c46;
      cursor: pointer; transition: background 0.15s;
    }
    .btn-template-link:hover { background: #e6f4fd; border-color: #009fe3; color: #009fe3; }
    .btn-template-link .material-icons { font-size: 15px; }

    /* View body */
    .view-body { display: flex; flex: 1; overflow: hidden; }
    .detail-panel { flex: 1; overflow-y: auto; min-width: 0; }
    .content-panel { flex: 1; overflow-y: auto; }
    .placeholder-content {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; color: #6c7e93;
    }
    .placeholder-content h2 { color: #586475; }

    /* Resize handle */
    .resize-handle {
      width: 6px; flex-shrink: 0; cursor: col-resize;
      display: flex; align-items: center; justify-content: center;
      background: transparent; transition: background 0.15s;
      border-left: 1px solid rgba(0,0,0,0.08);
    }
    .resize-handle:hover { background: rgba(0,159,227,0.08); }
    .resize-handle:active { background: rgba(0,159,227,0.15); }
    .resize-grip {
      width: 3px; height: 48px; border-radius: 2px;
      background: #d4d8de; transition: background 0.15s;
    }
    .resize-handle:hover .resize-grip { background: #009fe3; }
  `,
})
export class ProcessViewComponent {
  svc = inject(ProcessService);
  overviewWidth = signal(560);
  showStartDialog = signal(false);

  activeProcess = this.svc.activeProcess;

  isInstance = computed(() => this.svc.activeProcess()?.kind === 'instance');

  menuItems = computed<MenuItem[]>(() => {
    const docs = this.svc.allDocuments().length;
    const tasks = this.svc.allTasks().length;
    const events = this.svc.activeProcessEvents().length;
    const items: MenuItem[] = [
      { id: 'process', label: 'Prozessübersicht', icon: '<i class="material-icons">account_tree</i>' },
      { id: 'documents', label: 'Alle Dokumente', icon: '<i class="material-icons">insert_drive_file</i>', badge: docs },
      { id: 'tasks', label: 'Alle Aufgaben', icon: '<i class="material-icons">check_box</i>', badge: tasks },
    ];
    if (this.isInstance()) {
      items.push({ id: 'verlauf', label: 'Verlauf', icon: '<i class="material-icons">history</i>', badge: events });
    }
    return items;
  });

  stateLabel(state: string): string {
    return { running: 'Laufend', completed: 'Abgeschlossen', paused: 'Pausiert', cancelled: 'Abgebrochen' }[state] ?? state;
  }

  goToTemplate() {
    const templateId = this.svc.activeProcess()?.templateId;
    if (templateId) this.svc.openTab('prozess', templateId);
  }

  onWorkflowStarted(instanceId: string) {
    this.showStartDialog.set(false);
    if (instanceId) this.svc.openTab('prozess', instanceId);
  }

  getMenuLabel(id: string): string {
    return this.menuItems().find((m) => m.id === id)?.label ?? '';
  }

  onResizeStart(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = this.overviewWidth();

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.max(300, Math.min(900, startW + delta));
      this.overviewWidth.set(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
