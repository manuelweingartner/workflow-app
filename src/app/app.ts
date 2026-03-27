import { Component, inject, computed } from '@angular/core';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent, MenuItem } from './components/sidebar/sidebar.component';
import { ProcessOverviewComponent } from './components/process-overview/process-overview.component';
import { StepDetailComponent } from './components/step-detail/step-detail.component';
import { DocumentsViewComponent } from './components/documents-view/documents-view.component';
import { TasksViewComponent } from './components/tasks-view/tasks-view.component';
import { DossierDetailsComponent } from './components/dossier-details/dossier-details.component';
import { DossierOverviewComponent } from './components/dossier-overview/dossier-overview.component';
import { ServiceRequestComponent } from './components/service-request/service-request.component';
import { ProcessService } from './services/process.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    HeaderComponent, SidebarComponent, ProcessOverviewComponent, StepDetailComponent,
    DocumentsViewComponent, TasksViewComponent, DossierDetailsComponent, DossierOverviewComponent,
    ServiceRequestComponent,
  ],
  template: `
    <app-header />
    <div class="main-layout">
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
        @case ('details') {
          <div class="content-panel">
            <app-dossier-details />
          </div>
        }
        @case ('overview') {
          <div class="content-panel">
            <app-dossier-overview />
          </div>
        }
        @case ('servicerequest') {
          <div class="content-panel">
            <app-service-request />
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
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
      background: #f4f5f6;
    }
    .detail-panel {
      flex: 1;
      overflow-y: auto;
    }
    .content-panel {
      flex: 1;
      overflow-y: auto;
    }
    .placeholder-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #6c7e93;
    }
    .placeholder-content h2 { color: #586475; }
  `,
})
export class App {
  svc = inject(ProcessService);

  menuItems = computed<MenuItem[]>(() => {
    const docs = this.svc.allDocuments().length;
    const tasks = this.svc.allTasks().length;
    const hasServiceRequest = !!this.svc.dossier$().serviceRequest;
    const srMessages = this.svc.dossier$().serviceRequest?.messages.filter(m => !m.read).length ?? 0;

    const items: MenuItem[] = [
      { id: 'overview', label: 'Dossierübersicht', icon: '<i class="material-icons">dashboard</i>' },
      { id: 'details', label: 'Dossierdetails', icon: '<i class="material-icons">description</i>' },
      { id: 'process', label: 'Prozessübersicht', icon: '<i class="material-icons">list_alt</i>' },
    ];

    if (hasServiceRequest) {
      items.push({ id: 'servicerequest', label: 'Serviceanfrage', icon: '<i class="material-icons">public</i>', badge: srMessages || undefined });
    }

    items.push(
      { id: 'documents', label: 'Dokumente', icon: '<i class="material-icons">insert_drive_file</i>', badge: docs },
      { id: 'tasks', label: 'Aufgaben', icon: '<i class="material-icons">check_box</i>', badge: tasks },
      { id: 'notes', label: 'Notizen', icon: '<i class="material-icons">chat_bubble_outline</i>', badge: 0 },
      { id: 'participants', label: 'Beteiligungen', icon: '<i class="material-icons">people_outline</i>', badge: 0 },
    );

    return items;
  });

  getMenuLabel(id: string): string {
    return this.menuItems().find((m) => m.id === id)?.label ?? '';
  }
}
