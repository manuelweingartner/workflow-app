import { Component, inject, computed } from '@angular/core';
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
        <app-process-overview />
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
    .detail-panel { flex: 1; overflow-y: auto; }
    .content-panel { flex: 1; overflow-y: auto; }
    .placeholder-content {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; color: #6c7e93;
    }
    .placeholder-content h2 { color: #586475; }
  `,
})
export class ProcessViewComponent {
  svc = inject(ProcessService);

  menuItems = computed<MenuItem[]>(() => {
    const docs = this.svc.allDocuments().length;
    const tasks = this.svc.allTasks().length;
    const proc = this.svc.activeProcess();
    return [
      { id: 'process', label: 'Prozessübersicht', icon: '<i class="material-icons">account_tree</i>' },
      { id: 'documents', label: 'Alle Dokumente', icon: '<i class="material-icons">insert_drive_file</i>', badge: docs },
      { id: 'tasks', label: 'Alle Aufgaben', icon: '<i class="material-icons">check_box</i>', badge: tasks },
    ];
  });

  getMenuLabel(id: string): string {
    return this.menuItems().find((m) => m.id === id)?.label ?? '';
  }
}
