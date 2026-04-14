import { Component, Input, Output, EventEmitter, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProcessService } from '../../services/process.service';

export interface StartWorkflowParams {
  templateId: string;
  title: string;
  startedBy: string;
}

@Component({
  selector: 'app-workflow-start-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <!-- Overlay backdrop -->
    <div class="overlay" (click)="onCancel()"></div>

    <!-- Dialog -->
    <div class="dialog">
      <div class="dialog-header">
        <div class="dialog-title">
          <i class="material-icons">play_circle</i>
          Workflow starten
        </div>
        <button class="close-btn" (click)="onCancel()">
          <i class="material-icons">close</i>
        </button>
      </div>

      <div class="dialog-body">
        <!-- Template selection -->
        <div class="field-group">
          <label class="field-label">Workflow-Vorlage</label>
          <select class="field-select" [(ngModel)]="selectedTemplateId">
            <option value="">— Vorlage wählen —</option>
            @for (tpl of svc.allTemplates(); track tpl.id) {
              <option [value]="tpl.id">{{ tpl.title }}</option>
            }
          </select>
        </div>

        <!-- Instance title -->
        <div class="field-group">
          <label class="field-label">Titel der Instanz <span class="req">*</span></label>
          <input
            class="field-input"
            type="text"
            placeholder="z.B. Baugesuch Sonnenweg 12"
            [(ngModel)]="instanceTitle"
          />
        </div>

        <!-- Started by -->
        <div class="field-group">
          <label class="field-label">Sachbearbeiter:in <span class="req">*</span></label>
          <input
            class="field-input"
            type="text"
            placeholder="Name der verantwortlichen Person"
            [(ngModel)]="startedBy"
          />
        </div>

        @if (selectedTemplateId) {
          <div class="template-preview">
            <i class="material-icons">info_outline</i>
            <span>
              Vorlage hat {{ templateStepCount() }} Schritte.
              Der erste Schritt wird nach dem Start aktiviert.
            </span>
          </div>
        }
      </div>

      <div class="dialog-footer">
        <button class="btn-cancel" (click)="onCancel()">Abbrechen</button>
        <button
          class="btn-start"
          [disabled]="!canStart()"
          (click)="onConfirm()"
        >
          <i class="material-icons">play_arrow</i>
          Workflow starten
        </button>
      </div>
    </div>
  `,
  styles: `
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000;
    }
    .dialog {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 1001; background: #fff; border-radius: 6px; width: 480px; max-width: 95vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.22);
    }
    .dialog-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid #ebebed;
    }
    .dialog-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 15px; font-weight: 500; color: #353c46;
    }
    .dialog-title .material-icons { color: #009fe3; font-size: 22px; }
    .close-btn {
      background: none; border: none; cursor: pointer; color: #6c7e93; padding: 4px;
      display: flex; align-items: center; border-radius: 4px;
    }
    .close-btn:hover { background: #f4f5f6; color: #353c46; }

    .dialog-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

    .field-group { display: flex; flex-direction: column; gap: 5px; }
    .field-label { font-size: 12px; font-weight: 500; color: #6c7e93; text-transform: uppercase; letter-spacing: 0.04em; }
    .req { color: #8c0909; }
    .field-select, .field-input {
      padding: 8px 10px; border: 1px solid #dde2e7; border-radius: 4px;
      font-size: 14px; font-family: inherit; color: #353c46; outline: none;
      transition: border-color 0.15s;
    }
    .field-select:focus, .field-input:focus { border-color: #009fe3; }

    .template-preview {
      display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px;
      background: #f0f9ff; border-radius: 4px; font-size: 13px; color: #009fe3;
    }
    .template-preview .material-icons { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

    .dialog-footer {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 14px 20px; border-top: 1px solid #ebebed;
    }
    .btn-cancel {
      padding: 7px 16px; background: #f4f5f6; border: 1px solid #dde2e7;
      border-radius: 4px; font-size: 13px; font-family: inherit; color: #353c46;
      cursor: pointer; transition: background 0.15s;
    }
    .btn-cancel:hover { background: #ebebed; }
    .btn-start {
      display: flex; align-items: center; gap: 5px;
      padding: 7px 18px; background: #009fe3; border: none;
      border-radius: 4px; font-size: 13px; font-family: inherit; color: #fff;
      cursor: pointer; transition: background 0.15s;
    }
    .btn-start:hover:not(:disabled) { background: #0080c0; }
    .btn-start:disabled { background: #bdbdbd; cursor: not-allowed; }
    .btn-start .material-icons { font-size: 17px; }
  `,
})
export class WorkflowStartDialogComponent implements OnInit {
  @Input() preselectedTemplateId = '';
  @Output() cancelled = new EventEmitter<void>();
  @Output() started = new EventEmitter<string>(); // emits the new instance id

  svc = inject(ProcessService);

  selectedTemplateId = '';
  instanceTitle = '';
  startedBy = 'Weber Petra';

  ngOnInit() {
    if (this.preselectedTemplateId) {
      this.selectedTemplateId = this.preselectedTemplateId;
      const tpl = this.svc.allTemplates().find((p) => p.id === this.preselectedTemplateId);
      if (tpl) this.instanceTitle = tpl.title;
    }
  }

  templateStepCount(): number {
    const tpl = this.svc.allTemplates().find((p) => p.id === this.selectedTemplateId);
    return tpl?.steps?.length ?? 0;
  }

  canStart(): boolean {
    return !!this.selectedTemplateId && !!this.instanceTitle.trim() && !!this.startedBy.trim();
  }

  onConfirm() {
    if (!this.canStart()) return;
    const id = this.svc.startWorkflow(this.selectedTemplateId, {
      startedBy: this.startedBy,
      title: this.instanceTitle,
    });
    this.started.emit(id);
  }

  onCancel() {
    this.cancelled.emit();
  }
}
