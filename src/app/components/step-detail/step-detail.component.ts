import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProcessService } from '../../services/process.service';

@Component({
  selector: 'app-step-detail',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (svc.selectedStep(); as step) {
      <div class="detail">
        <!-- Header -->
        <div class="detail-header">
          <div class="detail-status" [class]="step.status">{{ statusLabel(step.status) }}</div>
          @if (step.number === 'NEU' && step.status !== 'completed') {
            <div class="edit-header">
              <div class="edit-row">
                <label>Titel</label>
                <input type="text" [ngModel]="step.title" (ngModelChange)="svc.updateStepField(step.id, { title: $event })" placeholder="Schritttitel eingeben" />
              </div>
              <div class="edit-row">
                <label>Verantwortlich</label>
                <input type="text" [ngModel]="step.responsible" (ngModelChange)="svc.updateStepField(step.id, { responsible: $event })" placeholder="Verantwortliche Person" />
              </div>
              <div class="edit-row-inline">
                <div class="edit-row">
                  <label>Kategorie</label>
                  <select [ngModel]="step.category" (ngModelChange)="svc.updateStepField(step.id, { category: $event })">
                    @for (cat of svc.getCategories().slice(1); track cat) {
                      <option [value]="cat">{{ cat }}</option>
                    }
                  </select>
                </div>
                <div class="edit-row">
                  <label>Fällig am</label>
                  <input type="text" [ngModel]="step.dueDate || ''" (ngModelChange)="svc.updateStepField(step.id, { dueDate: $event })" placeholder="TT.MM.JJJJ" />
                </div>
              </div>
            </div>
          } @else {
            <h2>{{ step.number }} &mdash; {{ step.title }}</h2>
            <p class="detail-responsible">&#128100; {{ step.responsible }}</p>
            @if (step.dueDate) { <p class="detail-date">&#128197; Fällig: {{ step.dueDate }}</p> }
            @if (step.completedDate) { <p class="detail-date completed">&#9989; Abgeschlossen: {{ step.completedDate }}</p> }
          }
        </div>

        <!-- Aufgaben -->
        <section class="section">
          <h3>
            Aufgaben
            <span class="count">{{ doneTaskCount(step) }}/{{ step.tasks.length }}</span>
            @if (step.status !== 'completed') {
              <button class="add-btn" (click)="showAddTask.set(true)">+ Aufgabe</button>
            }
          </h3>

          @if (showAddTask() && step.status !== 'completed') {
            <div class="add-form">
              <input type="text" [(ngModel)]="newTaskTitle" placeholder="Aufgabentitel" class="add-input" />
              <input type="text" [(ngModel)]="newTaskAssignee" placeholder="Zuständig" class="add-input small" />
              <button class="save-btn" (click)="addTask(step.id)" [disabled]="!newTaskTitle()">Hinzufügen</button>
              <button class="cancel-btn" (click)="showAddTask.set(false)">Abbrechen</button>
            </div>
          }

          @for (task of step.tasks; track task.id) {
            <div class="task-item" [class.done]="task.status === 'done'">
              <button class="task-check-btn" (click)="svc.toggleTaskStatus(step.id, task.id)" [disabled]="step.status === 'completed'">
                @if (task.status === 'done') {
                  <svg width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="3" fill="#3f971a"/><path d="M5 9l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
                } @else if (task.status === 'in-progress') {
                  <svg width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="3" fill="none" stroke="#009fe3" stroke-width="1.5"/><circle cx="9" cy="9" r="3.5" fill="#009fe3"/></svg>
                } @else {
                  <svg width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="3" fill="none" stroke="#bdbdbd" stroke-width="1.5"/></svg>
                }
              </button>
              <div class="task-info">
                <span class="task-title" [class.task-done-text]="task.status === 'done'">{{ task.title }}</span>
                <span class="task-assignee">{{ task.assignee }}</span>
              </div>
              <span class="task-status-badge" [class]="task.status">{{ taskStatusLabel(task.status) }}</span>
              @if (step.status !== 'completed') {
                <button class="remove-btn" title="Entfernen" (click)="svc.removeTaskFromStep(step.id, task.id)">&#10005;</button>
              }
            </div>
          }
        </section>

        <!-- Inputs -->
        @if (step.inputs.length) {
          <section class="section">
            <h3>Inputs <span class="count">{{ step.inputs.length }}</span></h3>
            @for (input of step.inputs; track input.id) {
              <div class="input-item">
                @if (input.type === 'field') {
                  <div class="input-field">
                    <label>{{ input.label }} @if (input.required) { <span class="required">*</span> }</label>
                    @if (input.fieldType === 'select') {
                      <select [value]="input.value || ''" [disabled]="step.status === 'completed'">
                        <option value="">-- Auswahl --</option>
                        @for (opt of input.options || []; track opt) {
                          <option [value]="opt" [selected]="opt === input.value">{{ opt }}</option>
                        }
                      </select>
                    } @else if (input.fieldType === 'textarea') {
                      <textarea rows="3" [readonly]="step.status === 'completed'">{{ input.value || '' }}</textarea>
                    } @else {
                      <input [type]="input.fieldType || 'text'" [value]="input.value || ''" [readonly]="step.status === 'completed'" />
                    }
                  </div>
                } @else {
                  <div class="input-document">
                    <div class="doc-icon">&#128196;</div>
                    <div class="doc-info">
                      <span class="doc-label">{{ input.label }} @if (input.required) { <span class="required">*</span> }</span>
                      @if (input.uploaded && input.documentName) {
                        <span class="doc-name uploaded">{{ input.documentName }}</span>
                      } @else {
                        <span class="doc-name pending">Noch nicht hochgeladen</span>
                      }
                    </div>
                    <button class="doc-btn">{{ input.uploaded ? 'Öffnen' : 'Hochladen' }}</button>
                  </div>
                }
              </div>
            }
          </section>
        }

        <!-- Aktionen -->
        @if (step.actions.length) {
          <section class="section">
            <h3>Aktionen <span class="count">{{ step.actions.length }}</span></h3>
            @for (action of step.actions; track action.id) {
              <div class="action-item">
                <div class="action-type-badge" [class]="action.type">{{ actionTypeLabel(action.type) }}</div>
                <div class="action-info">
                  <span class="action-label">{{ action.label }}</span>
                  @if (action.description) { <span class="action-desc">{{ action.description }}</span> }
                </div>
                <button class="action-btn" [class]="action.type">Ausführen</button>
              </div>
            }
          </section>
        }

        <!-- Abschlusskriterien -->
        <section class="section">
          <h3>
            Abschlusskriterien
            <span class="count">{{ metCriteriaCount(step) }}/{{ step.completionCriteria.length }}</span>
            @if (step.status !== 'completed') {
              <button class="add-btn" (click)="showAddCriterion.set(true)">+ Kriterium</button>
            }
          </h3>

          @if (showAddCriterion() && step.status !== 'completed') {
            <div class="add-form criterion-form">
              <input type="text" [(ngModel)]="newCriterionDesc" placeholder="Abschlusskriterium beschreiben" class="add-input" />
              <div class="next-step-row">
                <label>Vorschlag nächster Schritt</label>
                <select [(ngModel)]="newCriterionNextStep">
                  <option value="">-- Kein Vorschlag --</option>
                  @for (s of svc.getNextStepSuggestions(step.id); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                  <option value="__new__">+ Neuer Schritt...</option>
                </select>
                @if (newCriterionNextStep() === '__new__') {
                  <input type="text" [(ngModel)]="newCriterionCustomNext" placeholder="Name des neuen Schritts" class="add-input" />
                }
              </div>
              <div class="form-actions">
                <button class="save-btn" (click)="addCriterion(step.id)" [disabled]="!newCriterionDesc()">Hinzufügen</button>
                <button class="cancel-btn" (click)="showAddCriterion.set(false)">Abbrechen</button>
              </div>
            </div>
          }

          @for (c of step.completionCriteria; track c.id) {
            <div class="criterion-item">
              <button class="criterion-check-btn" (click)="svc.toggleCriterionMet(step.id, c.id)" [disabled]="step.status === 'completed'">
                @if (c.met) {
                  <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#3f971a"/><path d="M5 8l2 2 4-4" stroke="white" stroke-width="1.5" fill="none"/></svg>
                } @else {
                  <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="#bdbdbd" stroke-width="1.5"/></svg>
                }
              </button>
              <div class="criterion-info">
                <span [class.met-text]="c.met">{{ c.description }}</span>
                @if (c.suggestedNextStep) {
                  <span class="next-step-hint">&#8594; Nächster Schritt: {{ c.suggestedNextStep }}</span>
                }
              </div>
              @if (step.status !== 'completed') {
                <button class="remove-btn" title="Entfernen" (click)="svc.removeCriterionFromStep(step.id, c.id)">&#10005;</button>
              }
            </div>
          }
        </section>

        <!-- Conditionals -->
        @if (step.conditionals.length) {
          <section class="section">
            <h3>Conditionals <span class="count">{{ step.conditionals.length }}</span></h3>
            @for (cond of step.conditionals; track cond.id) {
              <div class="conditional-item">
                <div class="cond-if"><strong>WENN</strong> {{ cond.condition }}</div>
                <div class="cond-then"><strong>DANN</strong> {{ cond.thenAction }}</div>
                @if (cond.elseAction) {
                  <div class="cond-else"><strong>SONST</strong> {{ cond.elseAction }}</div>
                }
              </div>
            }
          </section>
        }

        <!-- Schritt abschliessen -->
        @if (step.status === 'in-progress') {
          <div class="complete-section">
            @if (svc.canCompleteStep(step.id)) {
              <button class="complete-btn" (click)="svc.completeStep(step.id)">
                &#9989; Schritt abschliessen &amp; nächsten Schritt starten
              </button>
            } @else {
              <div class="complete-hint">
                @if (step.tasks.length > 0 && !allTasksDone(step)) {
                  <span>&#9888; {{ step.tasks.length - doneTaskCount(step) }} Aufgabe(n) noch offen</span>
                }
                @if (step.completionCriteria.length > 0 && !allCriteriaMet(step)) {
                  <span>&#9888; {{ step.completionCriteria.length - metCriteriaCount(step) }} Kriterium/en noch nicht erfüllt</span>
                }
              </div>
            }
          </div>
        } @else if (step.status === 'pending') {
          <div class="complete-section">
            <div class="pending-hint">Dieser Schritt ist noch nicht aktiv. Er wird gestartet, sobald der vorherige Schritt abgeschlossen ist.</div>
          </div>
        }
      </div>
    } @else {
      <div class="empty-state">
        <div class="empty-icon">&#128073;</div>
        <h3>Prozessschritt auswählen</h3>
        <p>Klicke links auf einen Schritt, um die Details anzuzeigen.</p>
      </div>
    }
  `,
  styles: `
    .detail { padding: 24px 30px; overflow-y: auto; height: 100%; }
    .detail-header { margin-bottom: 24px; border-bottom: 1px solid rgba(0,0,0,0.12); padding-bottom: 16px; }
    .detail-header h2 { margin: 8px 0 8px; font-size: 1.375rem; font-weight: 400; color: #353c46; line-height: 1.75rem; }
    .detail-status {
      display: inline-block; font-size: 0.75rem; padding: 3px 12px; border-radius: 12px; font-weight: 400;
    }
    .detail-status.completed { background: #eef7ea; color: #3f971a; }
    .detail-status.in-progress { background: #e6f4fd; color: #009fe3; }
    .detail-status.pending { background: #f4f5f6; color: #6c7e93; }
    .detail-responsible, .detail-date { margin: 4px 0; font-size: 0.875rem; color: #6c7e93; }
    .detail-date.completed { color: #3f971a; }

    .edit-header { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
    .edit-row { display: flex; flex-direction: column; gap: 4px; }
    .edit-row label { font-size: 12px; font-weight: 400; color: #586475; }
    .edit-row input, .edit-row select {
      padding: 8px 12px; border: 1px solid #bdbdbd; border-radius: 4px; font-size: 14px; font-family: inherit;
    }
    .edit-row input:focus, .edit-row select:focus { outline: none; border-color: #009fe3; box-shadow: 0 0 0 2px rgba(0,159,227,0.15); }
    .edit-row-inline { display: flex; gap: 12px; }
    .edit-row-inline .edit-row { flex: 1; }

    .section { margin-bottom: 24px; }
    .section h3 { font-size: 1rem; font-weight: 500; color: #353c46; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; line-height: 1.5rem; }
    .count { background: #ebebed; color: #6c7e93; font-size: 0.6875rem; padding: 2px 8px; border-radius: 10px; font-weight: 400; }

    .add-btn {
      margin-left: auto; padding: 3px 10px; background: none; border: 1px dashed #009fe3;
      color: #009fe3; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 400; font-family: inherit;
    }
    .add-btn:hover { background: #e6f4fd; }

    .add-form {
      background: #f4f5f6; border: 1px solid #bdbdbd; border-radius: 6px;
      padding: 12px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end;
    }
    .add-input {
      padding: 6px 10px; border: 1px solid #bdbdbd; border-radius: 4px; font-size: 14px;
      font-family: inherit; flex: 1; min-width: 150px;
    }
    .add-input.small { flex: 0.5; min-width: 120px; }
    .add-input:focus { outline: none; border-color: #009fe3; }
    .save-btn {
      padding: 6px 14px; background: #009fe3; color: white; border: none;
      border-radius: 4px; font-size: 12px; cursor: pointer; font-family: inherit;
    }
    .save-btn:hover { background: #007ab8; }
    .save-btn:disabled { background: #bdbdbd; cursor: not-allowed; }
    .cancel-btn {
      padding: 6px 14px; background: white; color: #6c7e93; border: 1px solid #bdbdbd;
      border-radius: 4px; font-size: 12px; cursor: pointer; font-family: inherit;
    }
    .cancel-btn:hover { background: #f4f5f6; }

    .criterion-form { flex-direction: column; align-items: stretch; }
    .next-step-row { display: flex; flex-direction: column; gap: 4px; }
    .next-step-row label { font-size: 11px; color: #6c7e93; font-weight: 400; }
    .next-step-row select {
      padding: 6px 10px; border: 1px solid #bdbdbd; border-radius: 4px; font-size: 14px; font-family: inherit;
    }
    .next-step-row select:focus { outline: none; border-color: #009fe3; }
    .form-actions { display: flex; gap: 8px; }

    .remove-btn {
      background: none; border: none; color: #bdbdbd; cursor: pointer; font-size: 14px;
      padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
    }
    .remove-btn:hover { color: #8c0909; background: #fce8e8; }

    .task-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #ebebed; transition: opacity 0.2s; }
    .task-item.done { opacity: 0.7; }
    .task-check-btn { background: none; border: none; cursor: pointer; padding: 0; flex-shrink: 0; }
    .task-check-btn:disabled { cursor: default; }
    .task-info { flex: 1; display: flex; flex-direction: column; }
    .task-title { font-size: 14px; color: #353c46; }
    .task-done-text { text-decoration: line-through; color: #6c7e93; }
    .task-assignee { font-size: 12px; color: #6c7e93; }
    .task-status-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
    .task-status-badge.done { background: #eef7ea; color: #3f971a; }
    .task-status-badge.in-progress { background: #e6f4fd; color: #009fe3; }
    .task-status-badge.open { background: #f4f5f6; color: #6c7e93; }

    .input-item { margin-bottom: 12px; }
    .input-field { display: flex; flex-direction: column; gap: 4px; }
    .input-field label { font-size: 12px; color: #586475; font-weight: 400; }
    .required { color: #8c0909; }
    .input-field input, .input-field select, .input-field textarea {
      padding: 6px 10px; border: 1px solid #bdbdbd; border-radius: 4px; font-size: 14px; font-family: inherit;
    }
    .input-field input:focus, .input-field select:focus, .input-field textarea:focus { outline: none; border-color: #009fe3; }
    .input-field input:read-only, .input-field textarea:read-only { background: #f4f5f6; color: #6c7e93; }
    .input-field select:disabled { background: #f4f5f6; color: #6c7e93; }
    .input-document {
      display: flex; align-items: center; gap: 10px; padding: 10px; background: #f4f5f6;
      border-radius: 6px; border: 1px solid #bdbdbd;
    }
    .doc-icon { font-size: 24px; }
    .doc-info { flex: 1; display: flex; flex-direction: column; }
    .doc-label { font-size: 12px; font-weight: 400; color: #586475; }
    .doc-name { font-size: 11px; }
    .doc-name.uploaded { color: #3f971a; }
    .doc-name.pending { color: #8c0909; }
    .doc-btn {
      padding: 4px 12px; border: 1px solid #009fe3; background: white; color: #009fe3;
      border-radius: 4px; font-size: 12px; cursor: pointer; font-family: inherit;
    }
    .doc-btn:hover { background: #e6f4fd; }

    .action-item {
      display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #ebebed;
    }
    .action-type-badge {
      font-size: 10px; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; font-weight: 400; white-space: nowrap;
    }
    .action-type-badge.standard { background: #e6f4fd; color: #009fe3; }
    .action-type-badge.script { background: #f3e8ff; color: #7c3aed; }
    .action-type-badge.ai { background: linear-gradient(135deg, #f3e8ff, #e6f4fd); color: #7c3aed; }
    .action-info { flex: 1; display: flex; flex-direction: column; }
    .action-label { font-size: 14px; color: #353c46; }
    .action-desc { font-size: 12px; color: #6c7e93; }
    .action-btn {
      padding: 4px 12px; background: #009fe3; color: white; border: none;
      border-radius: 4px; font-size: 12px; cursor: pointer; white-space: nowrap; font-family: inherit;
    }
    .action-btn:hover { background: #007ab8; }
    .action-btn.ai { background: linear-gradient(135deg, #7c3aed, #009fe3); }
    .action-btn.ai:hover { background: linear-gradient(135deg, #6d28d9, #007ab8); }

    .criterion-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-bottom: 1px solid #ebebed; }
    .criterion-check-btn { background: none; border: none; cursor: pointer; padding: 0; flex-shrink: 0; margin-top: 1px; }
    .criterion-check-btn:disabled { cursor: default; }
    .criterion-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .met-text { color: #3f971a; text-decoration: line-through; }
    .next-step-hint {
      font-size: 11px; color: #009fe3; background: #e6f4fd; padding: 2px 8px;
      border-radius: 4px; display: inline-block; margin-top: 2px;
    }

    .conditional-item {
      background: #fef9e7; border: 1px solid #dfbe28; border-radius: 6px;
      padding: 12px; margin-bottom: 8px; font-size: 12px;
    }
    .cond-if { color: #92710c; margin-bottom: 4px; }
    .cond-then { color: #3f971a; margin-bottom: 2px; }
    .cond-else { color: #8c0909; }

    .complete-section {
      margin-top: 8px; padding-top: 20px; border-top: 2px solid #bdbdbd;
    }
    .complete-btn {
      width: 100%; padding: 12px; background: #3f971a; color: white; border: none;
      border-radius: 6px; font-size: 14px; font-weight: 400; cursor: pointer;
      transition: background 0.2s; font-family: inherit;
    }
    .complete-btn:hover { background: #358014; }
    .complete-hint {
      display: flex; flex-direction: column; gap: 4px; padding: 12px;
      background: #fef9e7; border: 1px solid #dfbe28; border-radius: 6px;
      font-size: 12px; color: #92710c;
    }
    .pending-hint {
      padding: 12px; background: #f4f5f6; border: 1px solid #bdbdbd; border-radius: 6px;
      font-size: 12px; color: #6c7e93; text-align: center;
    }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; color: #6c7e93; text-align: center;
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; }
    .empty-state h3 { color: #586475; margin: 0 0 8px; }
    .empty-state p { font-size: 13px; }
  `,
})
export class StepDetailComponent {
  svc = inject(ProcessService);

  showAddTask = signal(false);
  newTaskTitle = signal('');
  newTaskAssignee = signal('');

  showAddCriterion = signal(false);
  newCriterionDesc = signal('');
  newCriterionNextStep = signal('');
  newCriterionCustomNext = signal('');

  doneTaskCount(step: { tasks: { status: string }[] }) {
    return step.tasks.filter((t) => t.status === 'done').length;
  }

  allTasksDone(step: { tasks: { status: string }[] }) {
    return step.tasks.length === 0 || step.tasks.every((t) => t.status === 'done');
  }

  metCriteriaCount(step: { completionCriteria: { met: boolean }[] }) {
    return step.completionCriteria.filter((c) => c.met).length;
  }

  allCriteriaMet(step: { completionCriteria: { met: boolean }[] }) {
    return step.completionCriteria.length === 0 || step.completionCriteria.every((c) => c.met);
  }

  addTask(stepId: string) {
    if (!this.newTaskTitle()) return;
    this.svc.addTaskToStep(stepId, this.newTaskTitle(), this.newTaskAssignee() || 'Nicht zugewiesen');
    this.newTaskTitle.set('');
    this.newTaskAssignee.set('');
    this.showAddTask.set(false);
  }

  addCriterion(stepId: string) {
    if (!this.newCriterionDesc()) return;
    let nextStep = this.newCriterionNextStep();
    if (nextStep === '__new__') {
      nextStep = this.newCriterionCustomNext() || '';
    }
    this.svc.addCriterionToStep(stepId, this.newCriterionDesc(), nextStep || undefined);
    this.newCriterionDesc.set('');
    this.newCriterionNextStep.set('');
    this.newCriterionCustomNext.set('');
    this.showAddCriterion.set(false);
  }

  statusLabel(status: string) {
    return { completed: 'Abgeschlossen', 'in-progress': 'In Bearbeitung', pending: 'Ausstehend' }[status] ?? status;
  }

  taskStatusLabel(status: string) {
    return { done: 'Erledigt', 'in-progress': 'In Arbeit', open: 'Offen' }[status] ?? status;
  }

  actionTypeLabel(type: string) {
    return { standard: 'Standard', script: 'Skript', ai: 'KI+' }[type] ?? type;
  }
}
