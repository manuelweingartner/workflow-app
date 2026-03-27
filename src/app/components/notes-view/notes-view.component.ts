import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-notes-view',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="view">
      <div class="page-header">
        <h2 class="page-title">Notizen</h2>
        <button class="add-btn" (click)="showAdd.set(!showAdd())">
          <i class="material-icons">add</i> Neue Notiz
        </button>
      </div>

      @if (showAdd()) {
        <div class="card add-card">
          <div class="add-row">
            <div class="add-field">
              <label>Betreff</label>
              <input type="text" [(ngModel)]="newSubject" placeholder="Betreff eingeben" />
            </div>
            <div class="add-field narrow">
              <label>Sichtbarkeit</label>
              <select [(ngModel)]="newVisibility">
                <option value="intern">Intern</option>
                <option value="extern">Extern (Portal)</option>
              </select>
            </div>
          </div>
          <div class="add-field">
            <label>Notiz</label>
            <textarea [(ngModel)]="newText" rows="3" placeholder="Notiztext eingeben..."></textarea>
          </div>
          <div class="add-actions">
            <button class="save-btn" (click)="addNote()" [disabled]="!newText()">Speichern</button>
            <button class="cancel-btn" (click)="showAdd.set(false)">Abbrechen</button>
          </div>
        </div>
      }

      <div class="notes-list">
        @for (note of svc.notes(); track note.id) {
          <div class="card note-card">
            <div class="note-header">
              <div class="note-meta">
                <i class="material-icons note-icon">chat_bubble_outline</i>
                <span class="note-author">{{ note.author }}</span>
                <span class="note-date">{{ note.date }}</span>
              </div>
              <div class="note-badges">
                @if (note.visibility === 'extern') {
                  <span class="visibility-badge extern">
                    <i class="material-icons badge-icon">public</i> Portal
                  </span>
                } @else {
                  <span class="visibility-badge intern">
                    <i class="material-icons badge-icon">lock</i> Intern
                  </span>
                }
              </div>
            </div>
            @if (note.subject) {
              <div class="note-subject">{{ note.subject }}</div>
            }
            <div class="note-text">{{ note.text }}</div>
          </div>
        } @empty {
          <div class="empty-hint">Noch keine Notizen vorhanden.</div>
        }
      </div>
    </div>
  `,
  styles: `
    .view { padding: 0 30px 30px; overflow-y: auto; height: 100%; }

    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 0 12px;
    }
    .page-title { font-size: 1.375rem; font-weight: 400; color: #353c46; margin: 0; }

    .add-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 16px; background: #009fe3; color: white;
      border: none; border-radius: 4px; font-size: 0.8125rem;
      cursor: pointer; font-family: inherit;
    }
    .add-btn:hover { background: #007ab8; }
    .add-btn .material-icons { font-size: 18px; }

    .card {
      background: #ffffff; border-radius: 4px;
      box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
      margin-bottom: 12px;
    }

    .add-card {
      padding: 16px 20px;
    }
    .add-row { display: flex; gap: 12px; margin-bottom: 10px; }
    .add-field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .add-field.narrow { flex: 0 0 180px; }
    .add-field label { font-size: 0.75rem; color: #6c7e93; font-weight: 500; }
    .add-field input, .add-field select, .add-field textarea {
      padding: 8px 12px; border: 1px solid #bdbdbd; border-radius: 4px;
      font-size: 0.875rem; font-family: inherit;
    }
    .add-field input:focus, .add-field select:focus, .add-field textarea:focus {
      outline: none; border-color: #009fe3;
    }
    .add-field textarea { resize: vertical; }
    .add-actions { display: flex; gap: 8px; margin-top: 4px; }
    .save-btn {
      padding: 6px 16px; background: #009fe3; color: white;
      border: none; border-radius: 4px; font-size: 0.8125rem;
      cursor: pointer; font-family: inherit;
    }
    .save-btn:hover { background: #007ab8; }
    .save-btn:disabled { background: #bdbdbd; cursor: not-allowed; }
    .cancel-btn {
      padding: 6px 16px; background: white; color: #586475;
      border: 1px solid #bdbdbd; border-radius: 4px; font-size: 0.8125rem;
      cursor: pointer; font-family: inherit;
    }
    .cancel-btn:hover { background: #f4f5f6; }

    .note-card { padding: 16px 20px; }
    .note-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 6px;
    }
    .note-meta { display: flex; align-items: center; gap: 8px; }
    .note-icon { font-size: 18px; color: #6c7e93; }
    .note-author { font-size: 0.8125rem; font-weight: 500; color: #353c46; }
    .note-date { font-size: 0.75rem; color: #6c7e93; }

    .visibility-badge {
      display: flex; align-items: center; gap: 3px;
      font-size: 0.6875rem; padding: 2px 8px; border-radius: 10px;
    }
    .visibility-badge.intern { background: #f4f5f6; color: #6c7e93; }
    .visibility-badge.extern { background: #e6f4fd; color: #009fe3; }
    .badge-icon { font-size: 13px; }

    .note-subject {
      font-size: 0.875rem; font-weight: 500; color: #353c46;
      margin-bottom: 4px;
    }
    .note-text {
      font-size: 0.8125rem; color: #586475; line-height: 1.5;
      white-space: pre-wrap;
    }

    .empty-hint {
      text-align: center; padding: 40px; color: #6c7e93;
      font-size: 0.875rem;
    }
  `,
})
export class NotesViewComponent {
  svc = inject(ProcessService);
  showAdd = signal(false);
  newSubject = signal('');
  newText = signal('');
  newVisibility = signal<'intern' | 'extern'>('intern');

  addNote() {
    if (!this.newText()) return;
    this.svc.addNote(this.newSubject(), this.newText(), this.newVisibility());
    this.newSubject.set('');
    this.newText.set('');
    this.newVisibility.set('intern');
    this.showAdd.set(false);
  }
}
