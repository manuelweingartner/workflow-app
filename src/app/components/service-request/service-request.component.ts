import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-service-request',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (svc.dossier$().serviceRequest; as sr) {
      <div class="view">
        <h2 class="page-title">Serviceanfrage</h2>
        <p class="page-sub">CMI Portal-Kommunikation mit Bürger:in oder Unternehmen</p>

        <!-- Status & Info -->
        <div class="info-row">
          <div class="card info-card">
            <div class="info-header">
              <i class="material-icons info-icon">assignment</i>
              <span>Formular</span>
            </div>
            <div class="info-value">{{ sr.portalFormTitle }}</div>
            <div class="info-meta">Eingereicht am {{ sr.submittedDate }}</div>
          </div>
          <div class="card info-card">
            <div class="info-header">
              <i class="material-icons info-icon">person</i>
              <span>Antragsteller:in</span>
            </div>
            <div class="info-value">{{ sr.submittedBy }}</div>
            <div class="info-meta">{{ sr.email }}</div>
          </div>
          <div class="card info-card">
            <div class="info-header">
              <i class="material-icons info-icon">sync</i>
              <span>Portal-Status</span>
            </div>
            <div class="info-value">
              <span class="portal-status" [class]="sr.status">{{ portalStatusLabel(sr.status) }}</span>
            </div>
            <div class="info-meta">{{ sr.portalStatus }}</div>
          </div>
        </div>

        <!-- Formulardaten -->
        <div class="card compact">
          <h3 class="section-title">
            <i class="material-icons section-icon">list_alt</i>
            Eingereichte Formulardaten
          </h3>
          <div class="form-data-grid">
            @for (field of sr.formData; track field.label) {
              <div class="form-field">
                <label>{{ field.label }}</label>
                <span>{{ field.value }}</span>
              </div>
            }
          </div>
        </div>

        <div class="two-col">
          <!-- Nachrichten / Kommunikation -->
          <div class="card compact messages-card">
            <h3 class="section-title">
              <i class="material-icons section-icon">forum</i>
              Nachrichten
              <span class="msg-count">{{ sr.messages.length }}</span>
            </h3>
            <div class="messages-list">
              @for (msg of sr.messages; track msg.id) {
                <div class="message" [class]="msg.direction">
                  <div class="msg-header">
                    <span class="msg-author">
                      @if (msg.direction === 'to-citizen') {
                        <i class="material-icons msg-dir-icon">arrow_forward</i>
                      } @else {
                        <i class="material-icons msg-dir-icon">arrow_back</i>
                      }
                      {{ msg.author }}
                    </span>
                    <span class="msg-date">{{ msg.date }}</span>
                  </div>
                  <div class="msg-text">{{ msg.text }}</div>
                  @if (msg.direction === 'from-citizen' && !msg.read) {
                    <span class="msg-unread">Neu</span>
                  }
                </div>
              }
            </div>
            <div class="new-message">
              <textarea [(ngModel)]="newMessage" placeholder="Nachricht an Bürger:in schreiben..." rows="2"></textarea>
              <div class="msg-actions">
                <button class="send-btn" (click)="sendMessage()" [disabled]="!newMessage()">
                  <i class="material-icons">send</i> Senden
                </button>
                <button class="send-btn secondary" (click)="requestInfo()" [disabled]="!newMessage()">
                  <i class="material-icons">help_outline</i> Rückfrage
                </button>
              </div>
            </div>
          </div>

          <!-- Dokumente Portal -->
          <div class="card compact docs-card">
            <h3 class="section-title">
              <i class="material-icons section-icon">cloud_upload</i>
              Portal-Dokumente
              <span class="msg-count">{{ sr.portalDocuments.length }}</span>
            </h3>
            <div class="docs-list">
              @for (doc of sr.portalDocuments; track doc.id) {
                <div class="doc-item">
                  <div class="doc-dir">
                    @if (doc.direction === 'to-citizen') {
                      <i class="material-icons doc-dir-icon to">arrow_upward</i>
                    } @else {
                      <i class="material-icons doc-dir-icon from">arrow_downward</i>
                    }
                  </div>
                  <div class="doc-info">
                    <span class="doc-name">{{ doc.name }}</span>
                    @if (doc.fileName) {
                      <span class="doc-file">{{ doc.fileName }}</span>
                    }
                  </div>
                  <span class="doc-date">{{ doc.uploadDate }}</span>
                </div>
              }
            </div>
            <div class="upload-section">
              <div class="upload-form">
                <input type="text" [(ngModel)]="newDocName" placeholder="Dokumentbezeichnung" class="upload-input" />
                <button class="upload-btn" (click)="uploadDoc()" [disabled]="!newDocName()">
                  <i class="material-icons">cloud_upload</i> Bereitstellen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div class="empty-state">
        <i class="material-icons empty-icon">public_off</i>
        <h3>Keine Serviceanfrage</h3>
        <p>Dieses Geschäft hat keine zugeordnete Portal-Serviceanfrage.</p>
      </div>
    }
  `,
  styles: `
    .view { padding: 0 24px 16px; overflow-y: auto; height: 100%; }
    .page-title { font-size: 1.375rem; font-weight: 400; color: #353c46; margin: 0; padding: 16px 0 2px; }
    .page-sub { margin: 0 0 12px; font-size: 0.75rem; color: #6c7e93; }

    .card {
      background: #ffffff; border-radius: 4px;
      box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
      padding: 16px 20px; margin-bottom: 12px;
    }
    .card.compact { padding: 12px 16px; }

    .info-row { display: flex; gap: 12px; margin-bottom: 0; }
    .info-card { flex: 1; padding: 12px 16px; }
    .info-header { display: flex; align-items: center; gap: 6px; font-size: 0.6875rem; color: #6c7e93; text-transform: uppercase; margin-bottom: 4px; }
    .info-icon { font-size: 16px; }
    .info-value { font-size: 0.875rem; color: #353c46; font-weight: 400; margin-bottom: 2px; }
    .info-meta { font-size: 0.6875rem; color: #6c7e93; }

    .portal-status {
      font-size: 0.6875rem; padding: 2px 10px; border-radius: 12px; font-weight: 400;
    }
    .portal-status.eingegangen { background: #e6f4fd; color: #009fe3; }
    .portal-status.in-bearbeitung { background: #fff3cd; color: #856404; }
    .portal-status.rueckfrage { background: #f3e8ff; color: #7c3aed; }
    .portal-status.abgeschlossen { background: #eef7ea; color: #3f971a; }

    .section-title {
      font-size: 0.875rem; font-weight: 500; color: #353c46; margin: 0 0 8px;
      display: flex; align-items: center; gap: 6px;
      padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    .section-icon { font-size: 18px; color: #6c7e93; }
    .msg-count {
      background: #ebebed; color: #6c7e93; font-size: 0.6875rem;
      padding: 1px 7px; border-radius: 10px; font-weight: 400;
    }

    .form-data-grid {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 12px;
    }
    .form-field {
      display: flex; flex-direction: column; gap: 1px;
      padding: 5px 10px; background: #f4f5f6; border-radius: 3px;
    }
    .form-field label { font-size: 0.625rem; color: #6c7e93; }
    .form-field span { font-size: 0.8125rem; color: #353c46; }

    .two-col { display: flex; gap: 12px; align-items: flex-start; }
    .messages-card { flex: 1; min-width: 0; }
    .docs-card { flex: 1; min-width: 0; }

    .messages-list { max-height: 220px; overflow-y: auto; margin-bottom: 8px; }
    .message {
      padding: 8px 10px; margin-bottom: 4px; border-radius: 6px;
      border: 1px solid #ebebed;
    }
    .message.to-citizen { background: #f0f9ff; border-color: #bde3f8; }
    .message.from-citizen { background: #f8f4ff; border-color: #ddd0f7; }
    .msg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
    .msg-author { font-size: 0.6875rem; font-weight: 400; color: #586475; display: flex; align-items: center; gap: 3px; }
    .msg-dir-icon { font-size: 13px; }
    .to-citizen .msg-dir-icon { color: #009fe3; }
    .from-citizen .msg-dir-icon { color: #7c3aed; }
    .msg-date { font-size: 0.625rem; color: #6c7e93; }
    .msg-text { font-size: 0.75rem; color: #353c46; line-height: 1.4; }
    .msg-unread {
      display: inline-block; margin-top: 3px; font-size: 0.5625rem;
      background: #7c3aed; color: white; padding: 1px 6px; border-radius: 10px;
    }

    .new-message { border-top: 1px solid rgba(0,0,0,0.08); padding-top: 8px; }
    .new-message textarea {
      width: 100%; border: 1px solid #bdbdbd; border-radius: 4px;
      padding: 6px 10px; font-size: 0.75rem; font-family: inherit;
      resize: none; box-sizing: border-box;
    }
    .new-message textarea:focus { outline: none; border-color: #009fe3; }
    .msg-actions { display: flex; gap: 6px; margin-top: 6px; }
    .send-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px; background: #009fe3; color: white;
      border: none; border-radius: 4px; font-size: 0.6875rem;
      cursor: pointer; font-family: inherit;
    }
    .send-btn:hover { background: #007ab8; }
    .send-btn:disabled { background: #bdbdbd; cursor: not-allowed; }
    .send-btn.secondary { background: #7c3aed; }
    .send-btn.secondary:hover { background: #6d28d9; }
    .send-btn.secondary:disabled { background: #bdbdbd; }
    .send-btn .material-icons { font-size: 14px; }

    .docs-list { margin-bottom: 8px; }
    .doc-item {
      display: flex; align-items: center; gap: 8px; padding: 6px 8px;
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .doc-dir { display: flex; align-items: center; flex-shrink: 0; }
    .doc-dir-icon { font-size: 18px; }
    .doc-dir-icon.to { color: #009fe3; }
    .doc-dir-icon.from { color: #7c3aed; }
    .doc-info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .doc-name { font-size: 0.75rem; color: #353c46; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .doc-file { font-size: 0.625rem; color: #009fe3; }
    .doc-date { font-size: 0.625rem; color: #6c7e93; white-space: nowrap; }

    .upload-section { border-top: 1px solid rgba(0,0,0,0.08); padding-top: 8px; }
    .upload-form { display: flex; gap: 6px; }
    .upload-input {
      flex: 1; min-width: 0; padding: 4px 8px;
      border: 1px solid #bdbdbd; border-radius: 4px;
      font-size: 0.75rem; font-family: inherit;
    }
    .upload-input:focus { outline: none; border-color: #009fe3; }
    .upload-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px; background: #009fe3; color: white;
      border: none; border-radius: 4px; font-size: 0.6875rem;
      cursor: pointer; font-family: inherit; white-space: nowrap;
    }
    .upload-btn:hover { background: #007ab8; }
    .upload-btn:disabled { background: #bdbdbd; cursor: not-allowed; }
    .upload-btn .material-icons { font-size: 14px; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; color: #6c7e93; text-align: center;
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; color: #bdbdbd; }
    .empty-state h3 { color: #586475; margin: 0 0 8px; }
    .empty-state p { font-size: 0.8125rem; }
  `,
})
export class ServiceRequestComponent {
  svc = inject(ProcessService);
  newMessage = signal('');
  newDocName = signal('');
  newDocDesc = signal('');

  portalStatusLabel(status: string): string {
    return {
      eingegangen: 'Eingegangen',
      'in-bearbeitung': 'In Bearbeitung',
      rueckfrage: 'Rückfrage offen',
      abgeschlossen: 'Abgeschlossen',
    }[status] ?? status;
  }

  sendMessage() {
    if (!this.newMessage()) return;
    this.svc.addPortalMessage(this.newMessage(), false);
    this.newMessage.set('');
  }

  requestInfo() {
    if (!this.newMessage()) return;
    this.svc.addPortalMessage(this.newMessage(), true);
    this.newMessage.set('');
  }

  uploadDoc() {
    if (!this.newDocName()) return;
    this.svc.addPortalDocument(this.newDocName(), this.newDocDesc() || undefined, 'to-citizen');
    this.newDocName.set('');
    this.newDocDesc.set('');
  }

  requestDoc() {
    this.svc.addPortalMessage('Bitte laden Sie die angeforderten Dokumente im Portal hoch.', true);
  }
}
