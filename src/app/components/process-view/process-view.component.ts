import { Component, inject, signal, computed } from '@angular/core';
import { SidebarComponent, MenuItem } from '../sidebar/sidebar.component';
import { ProcessOverviewComponent } from '../process-overview/process-overview.component';
import { StepDetailComponent } from '../step-detail/step-detail.component';
import { DocumentsViewComponent } from '../documents-view/documents-view.component';
import { TasksViewComponent } from '../tasks-view/tasks-view.component';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-process-view',
  standalone: true,
  imports: [SidebarComponent, ProcessOverviewComponent, StepDetailComponent, DocumentsViewComponent, TasksViewComponent],
  template: `
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
      @default {
        <div class="placeholder-content">
          <h2>{{ getMenuLabel(svc.activeMenu()) }}</h2>
          <p>Dieser Bereich ist noch nicht implementiert.</p>
        </div>
      }
    }
  `,
  styles: `
    :host { display: flex; flex: 1; overflow: hidden; }
    .detail-panel { flex: 1; overflow-y: auto; min-width: 0; }
    .content-panel { flex: 1; overflow-y: auto; }
    .placeholder-content {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; color: #6c7e93;
    }
    .placeholder-content h2 { color: #586475; }

    /* Resize handle between overview and detail panels */
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

  menuItems = computed<MenuItem[]>(() => {
    const docs = this.svc.allDocuments().length;
    const tasks = this.svc.allTasks().length;
    return [
      { id: 'process', label: 'Prozessübersicht', icon: '<i class="material-icons">account_tree</i>' },
      { id: 'documents', label: 'Alle Dokumente', icon: '<i class="material-icons">insert_drive_file</i>', badge: docs },
      { id: 'tasks', label: 'Alle Aufgaben', icon: '<i class="material-icons">check_box</i>', badge: tasks },
    ];
  });

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
