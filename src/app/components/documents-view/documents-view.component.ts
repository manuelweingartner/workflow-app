import { Component, inject } from '@angular/core';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-documents-view',
  standalone: true,
  template: `
    <div class="view">
      <h2 class="page-title">Dokumente</h2>

      <div class="stats">
        <div class="stat">
          <span class="stat-value">{{ svc.allDocuments().length }}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat uploaded">
          <span class="stat-value">{{ uploadedCount() }}</span>
          <span class="stat-label">Hochgeladen</span>
        </div>
        <div class="stat pending">
          <span class="stat-value">{{ svc.allDocuments().length - uploadedCount() }}</span>
          <span class="stat-label">Ausstehend</span>
        </div>
      </div>

      <div class="card">
      <table class="doc-table">
        <thead>
          <tr>
            <th>Dokument</th>
            <th>Dateiname</th>
            <th>Status</th>
            <th>Pflicht</th>
            <th>Prozessschritt</th>
          </tr>
        </thead>
        <tbody>
          @for (doc of svc.allDocuments(); track doc.input.id) {
            <tr>
              <td class="doc-label">{{ doc.input.label }}</td>
              <td class="doc-file">
                @if (doc.input.documentName) {
                  {{ doc.input.documentName }}
                } @else {
                  <span class="no-file">--</span>
                }
              </td>
              <td>
                <span class="status-badge" [class]="doc.input.uploaded ? 'uploaded' : 'missing'">
                  {{ doc.input.uploaded ? 'Hochgeladen' : 'Ausstehend' }}
                </span>
              </td>
              <td>
                @if (doc.input.required) {
                  <span class="required-badge">Pflicht</span>
                } @else {
                  <span class="optional-badge">Optional</span>
                }
              </td>
              <td>
                <button class="step-link" (click)="svc.navigateToStep(doc.stepId)">
                  {{ doc.stepNumber }} &mdash; {{ doc.stepTitle }}
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

    .stats { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat {
      background: #ffffff; border: 1px solid #bdbdbd; border-radius: 6px;
      padding: 12px 20px; text-align: center; min-width: 100px;
      box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }
    .stat-value { display: block; font-size: 24px; font-weight: 700; color: #353c46; }
    .stat-label { font-size: 11px; color: #6c7e93; }
    .stat.uploaded .stat-value { color: #3f971a; }
    .stat.pending .stat-value { color: #8c0909; }

    .doc-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .doc-table th {
      text-align: left; padding: 8px 12px; border-bottom: 2px solid #bdbdbd;
      font-size: 12px; text-transform: uppercase; color: #6c7e93; font-weight: 400;
    }
    .doc-table td { padding: 10px 12px; border-bottom: 1px solid #ebebed; }
    .doc-label { font-weight: 400; color: #353c46; }
    .doc-file { color: #586475; }
    .no-file { color: #bdbdbd; }

    .status-badge {
      font-size: 11px; padding: 2px 8px; border-radius: 10px; white-space: nowrap;
    }
    .status-badge.uploaded { background: #eef7ea; color: #3f971a; }
    .status-badge.missing { background: #fce8e8; color: #8c0909; }

    .required-badge { font-size: 11px; color: #8c0909; background: #fce8e8; padding: 2px 8px; border-radius: 10px; }
    .optional-badge { font-size: 11px; color: #6c7e93; background: #f4f5f6; padding: 2px 8px; border-radius: 10px; }

    .step-link {
      background: none; border: none; color: #009fe3; cursor: pointer;
      font-size: 12px; padding: 0; text-decoration: underline; font-family: inherit;
    }
    .step-link:hover { color: #007ab8; }
  `,
})
export class DocumentsViewComponent {
  svc = inject(ProcessService);

  uploadedCount() {
    return this.svc.allDocuments().filter((d) => d.input.uploaded).length;
  }
}
