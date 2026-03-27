import { Component, inject } from '@angular/core';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-participants-view',
  standalone: true,
  template: `
    <div class="view">
      <h2 class="page-title">Beteiligungen</h2>

      <div class="card">
        <table class="participants-table">
          <thead>
            <tr>
              <th class="col-role">Rolle</th>
              <th class="col-name">Name</th>
              <th class="col-org">Organisation</th>
              <th class="col-contact">Kontakt</th>
              <th class="col-since">Seit</th>
            </tr>
          </thead>
          <tbody>
            @for (p of svc.participants(); track p.id) {
              <tr>
                <td>
                  <span class="role-badge" [class]="p.roleType">{{ p.role }}</span>
                </td>
                <td class="name-cell">
                  <i class="material-icons person-icon">person</i>
                  <span>{{ p.name }}</span>
                </td>
                <td class="org-cell">{{ p.organization || '—' }}</td>
                <td class="contact-cell">
                  @if (p.email) {
                    <span class="contact-line">
                      <i class="material-icons contact-icon">email</i> {{ p.email }}
                    </span>
                  }
                  @if (p.phone) {
                    <span class="contact-line">
                      <i class="material-icons contact-icon">phone</i> {{ p.phone }}
                    </span>
                  }
                </td>
                <td class="since-cell">{{ p.since }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="empty-row">Keine Beteiligungen vorhanden.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: `
    .view { padding: 0 30px 30px; overflow-y: auto; height: 100%; }
    .page-title { font-size: 1.375rem; font-weight: 400; color: #353c46; margin: 0; padding: 16px 0 12px; }

    .card {
      background: #ffffff; border-radius: 4px;
      box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
      padding: 0; overflow: hidden;
    }

    .participants-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .participants-table th {
      text-align: left; padding: 12px 16px; border-bottom: 2px solid rgba(0,0,0,0.12);
      font-size: 0.75rem; text-transform: uppercase; color: #6c7e93; font-weight: 500;
      letter-spacing: 0.03em; background: #f8f9fa;
    }
    .participants-table td {
      padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.06);
      vertical-align: middle;
    }
    .participants-table tr:last-child td { border-bottom: none; }
    .participants-table tr:hover td { background: #f8f9fa; }

    .col-role { width: 160px; }
    .col-name { width: auto; }
    .col-org { width: 200px; }
    .col-contact { width: 240px; }
    .col-since { width: 100px; }

    .role-badge {
      display: inline-block; font-size: 0.6875rem; padding: 3px 10px;
      border-radius: 12px; font-weight: 400; white-space: nowrap;
    }
    .role-badge.primary { background: #e6f4fd; color: #009fe3; }
    .role-badge.internal { background: #ebebed; color: #586475; }
    .role-badge.external { background: #eef7ea; color: #3f971a; }
    .role-badge.authority { background: #f3e8ff; color: #7c3aed; }

    .name-cell {
      display: flex; align-items: center; gap: 8px;
      font-weight: 400; color: #353c46;
    }
    .person-icon { font-size: 20px; color: #6c7e93; }

    .org-cell { color: #586475; }

    .contact-cell { display: flex; flex-direction: column; gap: 2px; }
    .contact-line {
      display: flex; align-items: center; gap: 4px;
      font-size: 0.75rem; color: #6c7e93;
    }
    .contact-icon { font-size: 14px; }

    .since-cell { font-size: 0.75rem; color: #6c7e93; }

    .empty-row {
      text-align: center; color: #6c7e93; padding: 40px 16px !important;
    }
  `,
})
export class ParticipantsViewComponent {
  svc = inject(ProcessService);
}
