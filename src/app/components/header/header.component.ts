import { Component, inject } from '@angular/core';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    <!-- App Bar (cmi-app-bar) -->
    <div class="app-bar">
      <div class="cmi-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 7 17 10" width="50" height="30"><path fill="#ffffff" d="M19.78,15.42a.67.67,0,0,1-1.34,0V8.66a.67.67,0,1,1,1.34,0Zm-3.38,0a.67.67,0,0,1-1.34,0V11.2l-1,2.26a.74.74,0,0,1-1.36,0l-1-2.26v4.22a.67.67,0,0,1-1.33,0V8.66A.68.68,0,0,1,11.06,8h.18c.43,0,.59.27.73.58l1.43,3.22,1.43-3.22c.14-.31.3-.58.73-.58h.17a.68.68,0,0,1,.67.67Zm-9.95-.66h.1a.93.93,0,0,0,1-.78.67.67,0,0,1,1.33.07v.13a2.28,2.28,0,0,1-2.3,1.9h-.1a2.26,2.26,0,0,1-2.31-2.25V10.24A2.27,2.27,0,0,1,6.45,8h.1A2.25,2.25,0,0,1,8.84,9.91a.38.38,0,0,1,0,.12.66.66,0,0,1-.68.65.63.63,0,0,1-.65-.58.93.93,0,0,0-1-.78h-.1a.94.94,0,0,0-1,.92v3.59a.94.94,0,0,0,1,.93"/></svg>
      </div>
      <div class="tab-bar">
        @for (d of svc.dossiers(); track d.id; let i = $index) {
          @if (i > 0) {
            <div class="tab-separator"></div>
          }
          <div class="tab" [class.active]="d.id === svc.activeDossierIdReadonly()" (click)="svc.switchDossier(d.id)">
            <i class="material-icons tab-icon">folder</i>
            <span class="tab-text">{{ d.number }}: {{ truncate(d.title, 20) }}</span>
            <i class="material-icons tab-close">close</i>
          </div>
        }
      </div>
      <div class="bar-spacer"></div>
      <div class="static-actions">
        <div class="action-separator"></div>
        <i class="material-icons bar-action">grid_view</i>
        <i class="material-icons bar-action">more_vert</i>
      </div>
    </div>
    <!-- App Header (cmi-app-header) -->
    <div class="app-header">
      <div class="header-title-row">
        <i class="material-icons header-icon">folder</i>
        <span class="header-title">{{ svc.dossier$().number }} - {{ svc.dossier$().title }}</span>
      </div>
      <div class="header-breadcrumb">
        Geschäft <i class="material-icons breadcrumb-arrow">chevron_right</i> {{ breadcrumbLabel() }}
      </div>
    </div>
  `,
  styles: `
    /* ===== APP BAR ===== */
    .app-bar {
      display: flex;
      align-items: center;
      height: 50px;
      background-color: #009fe3;
      color: #ffffff;
      flex-shrink: 0;
      padding: 0;
    }

    .cmi-logo {
      width: 82px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .tab-bar {
      display: flex;
      align-items: center;
      height: 100%;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tab-bar::-webkit-scrollbar { display: none; }

    .tab-separator {
      width: 1px;
      height: 30px;
      background: rgba(255, 255, 255, 0.4);
      flex-shrink: 0;
    }

    .tab {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 12px;
      gap: 8px;
      cursor: pointer;
      color: rgba(255, 255, 255, 0.85);
      white-space: nowrap;
      flex-shrink: 0;
      transition: background-color 0.15s, color 0.15s;
      font-size: 0.875rem;
      font-weight: 400;
      font-family: "Roboto", "Helvetica", "Arial", sans-serif;
    }
    .tab:hover {
      background-color: rgba(0, 0, 0, 0.08);
    }
    .tab.active {
      background-color: #586475;
      color: #ffffff;
    }

    .tab-icon {
      font-size: 20px;
      flex-shrink: 0;
      opacity: 0.85;
    }
    .tab.active .tab-icon { opacity: 1; }

    .tab-text {
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }

    .tab-close {
      font-size: 18px;
      cursor: pointer;
      opacity: 0;
      flex-shrink: 0;
      border-radius: 50%;
      padding: 2px;
      transition: opacity 0.15s, background-color 0.15s;
    }
    .tab:hover .tab-close,
    .tab.active .tab-close { opacity: 0.6; }
    .tab-close:hover {
      opacity: 1 !important;
      background-color: rgba(255, 255, 255, 0.15);
    }

    .bar-spacer { flex: 1; }

    .static-actions {
      display: flex;
      align-items: center;
      height: 100%;
      flex-shrink: 0;
    }
    .action-separator {
      width: 1px;
      height: 30px;
      background: rgba(255, 255, 255, 0.4);
    }
    .bar-action {
      padding: 0 12px;
      height: 100%;
      display: flex;
      align-items: center;
      cursor: pointer;
      font-size: 22px;
      opacity: 0.7;
      transition: opacity 0.15s;
    }
    .bar-action:hover { opacity: 1; }

    /* ===== APP HEADER ===== */
    .app-header {
      background-color: #586475;
      color: #ffffff;
      flex-shrink: 0;
      padding: 16px 24px 12px;
    }

    .header-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .header-icon {
      font-size: 24px;
      opacity: 0.7;
    }
    .header-title {
      font-family: "Roboto", "Helvetica", "Arial", sans-serif;
      font-size: 1.375rem;
      font-weight: 400;
      line-height: 1.75rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-breadcrumb {
      display: flex;
      align-items: center;
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.6);
      padding-left: 34px;
      gap: 2px;
    }
    .breadcrumb-arrow {
      font-size: 18px;
    }
  `,
})
export class HeaderComponent {
  svc = inject(ProcessService);

  truncate(text: string, max: number): string {
    return text.length > max ? text.substring(0, max) + '...' : text;
  }

  breadcrumbLabel(): string {
    const labels: Record<string, string> = {
      overview: 'Dossierübersicht',
      details: 'Dossierdetails',
      process: 'Prozessübersicht',
      documents: 'Dokumente',
      tasks: 'Aufgaben',
      notes: 'Notizen',
      participants: 'Beteiligungen',
      servicerequest: 'Serviceanfrage',
    };
    return labels[this.svc.activeMenu()] ?? '';
  }
}
