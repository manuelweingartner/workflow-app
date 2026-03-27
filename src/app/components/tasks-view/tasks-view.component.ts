import { Component, inject, signal } from '@angular/core';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-tasks-view',
  standalone: true,
  template: `
    <div class="view">
      <h2 class="page-title">Aufgaben</h2>

      <div class="stats">
        <div class="stat">
          <span class="stat-value">{{ svc.allTasks().length }}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat done">
          <span class="stat-value">{{ countByStatus('done') }}</span>
          <span class="stat-label">Erledigt</span>
        </div>
        <div class="stat in-progress">
          <span class="stat-value">{{ countByStatus('in-progress') }}</span>
          <span class="stat-label">In Arbeit</span>
        </div>
        <div class="stat open">
          <span class="stat-value">{{ countByStatus('open') }}</span>
          <span class="stat-label">Offen</span>
        </div>
      </div>

      <div class="filter-tabs">
        @for (f of filters; track f.value) {
          <button class="filter-tab" [class.active]="f.value === activeFilter()" (click)="activeFilter.set(f.value)">
            {{ f.label }}
          </button>
        }
      </div>

      <div class="card">
      <table class="task-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Aufgabe</th>
            <th>Zuständig</th>
            <th>Prozessschritt</th>
          </tr>
        </thead>
        <tbody>
          @for (item of filteredTasks(); track item.task.id) {
            <tr>
              <td>
                <button class="status-badge-btn" [class]="item.task.status" (click)="svc.toggleTaskStatus(item.stepId, item.task.id)">
                  {{ statusLabel(item.task.status) }}
                </button>
              </td>
              <td class="task-title">{{ item.task.title }}</td>
              <td class="task-assignee">{{ item.task.assignee }}</td>
              <td>
                <button class="step-link" (click)="svc.navigateToStep(item.stepId)">
                  {{ item.stepNumber }} &mdash; {{ item.stepTitle }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      </div>
    </div>
  `,
  styles: `
    .view { padding: 0 30px 30px; overflow-y: auto; height: 100%; }
    .page-title { font-size: 1.375rem; font-weight: 400; color: #353c46; margin: 0; padding: 24px 0 16px; }
    .card {
      background: #ffffff; border-radius: 4px;
      box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
      padding: 24px 30px; margin-bottom: 20px;
    }

    .stats { display: flex; gap: 16px; margin-bottom: 20px; }
    .stat {
      background: #ffffff; border: 1px solid #bdbdbd; border-radius: 6px;
      padding: 12px 20px; text-align: center; min-width: 90px;
      box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }
    .stat-value { display: block; font-size: 24px; font-weight: 700; color: #353c46; }
    .stat-label { font-size: 11px; color: #6c7e93; }
    .stat.done .stat-value { color: #3f971a; }
    .stat.in-progress .stat-value { color: #009fe3; }
    .stat.open .stat-value { color: #6c7e93; }

    .filter-tabs { display: flex; gap: 6px; margin-bottom: 16px; }
    .filter-tab {
      padding: 4px 14px; border: 1px solid #bdbdbd; border-radius: 16px;
      background: white; font-size: 12px; cursor: pointer; color: #586475; font-family: inherit;
    }
    .filter-tab.active { background: #009fe3; color: white; border-color: #009fe3; }

    .task-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .task-table th {
      text-align: left; padding: 8px 12px; border-bottom: 2px solid #bdbdbd;
      font-size: 12px; text-transform: uppercase; color: #6c7e93; font-weight: 400;
    }
    .task-table td { padding: 10px 12px; border-bottom: 1px solid #ebebed; }
    .task-title { font-weight: 400; color: #353c46; }
    .task-assignee { color: #6c7e93; }

    .status-badge-btn {
      font-size: 11px; padding: 2px 8px; border-radius: 10px; white-space: nowrap;
      border: none; cursor: pointer; font-family: inherit;
    }
    .status-badge-btn.done { background: #eef7ea; color: #3f971a; }
    .status-badge-btn.in-progress { background: #e6f4fd; color: #009fe3; }
    .status-badge-btn.open { background: #f4f5f6; color: #6c7e93; }
    .status-badge-btn:hover { opacity: 0.8; }

    .step-link {
      background: none; border: none; color: #009fe3; cursor: pointer;
      font-size: 12px; padding: 0; text-decoration: underline; font-family: inherit;
    }
    .step-link:hover { color: #007ab8; }
  `,
})
export class TasksViewComponent {
  svc = inject(ProcessService);
  activeFilter = signal('all');

  filters = [
    { value: 'all', label: 'Alle' },
    { value: 'open', label: 'Offen' },
    { value: 'in-progress', label: 'In Arbeit' },
    { value: 'done', label: 'Erledigt' },
  ];

  filteredTasks() {
    const f = this.activeFilter();
    return f === 'all' ? this.svc.allTasks() : this.svc.allTasks().filter((t) => t.task.status === f);
  }

  countByStatus(status: string) {
    return this.svc.allTasks().filter((t) => t.task.status === status).length;
  }

  statusLabel(status: string) {
    return { done: 'Erledigt', 'in-progress': 'In Arbeit', open: 'Offen' }[status] ?? status;
  }
}
