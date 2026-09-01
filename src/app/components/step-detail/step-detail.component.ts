import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProcessService } from '../../services/process.service';
import { ContextObject, TabType, ProcessStep, StepType, GatewayType, ActivityKind, TaskMode, AiAssessment, SyncRun, Input as StepInput } from '../../models/process.model';

@Component({
  selector: 'app-step-detail',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (svc.selectedStep(); as step) {
      <div class="detail">
        <!-- Header -->
        <div class="detail-header">
          @if (isInstance()) {
            <div class="detail-status" [class]="step.status">{{ statusLabel(step.status) }}</div>
          }
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
            @if (isInstance() && step.completedDate) { <p class="detail-date completed">&#9989; Abgeschlossen: {{ step.completedDate }}</p> }
          }
        </div>

        <!-- Schritttyp / Gateway-Typ -->
        @if (!isInstance()) {
          <section class="section">
            @if (step.kind === 'gateway') {
              <h3>Gateway-Typ</h3>
              <div class="type-selector">
                <button class="type-btn decision" [class.active]="step.gatewayType === 'decision'"
                        (click)="setGatewayType(step.id, 'decision')">
                  <i class="material-icons">call_split</i> Entscheidung
                </button>
                <button class="type-btn parallel" [class.active]="step.gatewayType === 'parallel'"
                        (click)="setGatewayType(step.id, 'parallel')">
                  <i class="material-icons">fork_right</i> Parallel
                </button>
                <button class="type-btn loop" [class.active]="step.gatewayType === 'loop'"
                        (click)="setGatewayType(step.id, 'loop')">
                  <i class="material-icons">replay</i> Schleife
                </button>
              </div>
            } @else {
              <h3>Schritttyp</h3>
              <div class="type-selector">
                <button class="type-btn task" [class.active]="!step.stepType || step.stepType === 'task'"
                        (click)="setStepType(step.id, 'task')">
                  <i class="material-icons">assignment</i> Aufgabe
                </button>
                <button class="type-btn activity" [class.active]="step.stepType === 'activity'"
                        (click)="setStepType(step.id, 'activity')">
                  <i class="material-icons">bolt</i> Aktivität
                </button>
                <button class="type-btn subprocess" [class.active]="step.stepType === 'subprocess'"
                        (click)="setStepType(step.id, 'subprocess')">
                  <i class="material-icons">layers</i> Sub-Prozess
                </button>
              </div>
              @if (!step.stepType || step.stepType === 'task') {
                <div class="subtype-row">
                  <label class="subtype-label">Modus</label>
                  <div class="toggle-group">
                    <button class="toggle-tab" [class.active]="!step.taskMode || step.taskMode === 'description'"
                            (click)="setTaskMode(step.id, 'description')">
                      <i class="material-icons">description</i> Beschreibung
                    </button>
                    <button class="toggle-tab" [class.active]="step.taskMode === 'wizard'"
                            (click)="setTaskMode(step.id, 'wizard')">
                      <i class="material-icons">smart_button</i> Assistent
                    </button>
                  </div>
                </div>
              }
              @if (step.stepType === 'activity') {
                <div class="subtype-row">
                  <label class="subtype-label">Art der Automatisierung</label>
                  <div class="activity-grid">
                    <button class="activity-kind-btn" [class.active]="step.activityKind === 'object-creation'"
                            (click)="setActivityKind(step.id, 'object-creation')">
                      <i class="material-icons">add_box</i> Objekt
                    </button>
                    <button class="activity-kind-btn" [class.active]="step.activityKind === 'interface'"
                            (click)="setActivityKind(step.id, 'interface')">
                      <i class="material-icons">cable</i> Schnittstelle
                    </button>
                    <button class="activity-kind-btn" [class.active]="step.activityKind === 'ai'"
                            (click)="setActivityKind(step.id, 'ai')">
                      <i class="material-icons">psychology</i> KI
                    </button>
                    <button class="activity-kind-btn" [class.active]="step.activityKind === 'notification'"
                            (click)="setActivityKind(step.id, 'notification')">
                      <i class="material-icons">notifications</i> Nachricht
                    </button>
                    <button class="activity-kind-btn" [class.active]="step.activityKind === 'document'"
                            (click)="setActivityKind(step.id, 'document')">
                      <i class="material-icons">picture_as_pdf</i> Dokument
                    </button>
                  </div>
                </div>
              }
            }
          </section>
        } @else if (step.kind === 'gateway') {
          <div class="type-badge-display" [class]="step.gatewayType">
            @if (step.gatewayType === 'decision') { <i class="material-icons">call_split</i> Entscheidung }
            @else if (step.gatewayType === 'parallel') { <i class="material-icons">fork_right</i> Parallel }
            @else if (step.gatewayType === 'loop') { <i class="material-icons">replay</i> Schleife }
          </div>
        } @else if (step.stepType && step.stepType !== 'task') {
          <div class="type-badge-display" [class]="step.stepType">
            @if (step.stepType === 'activity') { <i class="material-icons">bolt</i> Aktivität }
            @else if (step.stepType === 'subprocess') { <i class="material-icons">layers</i> Sub-Prozess }
          </div>
        }

        <!-- Decision: Branches -->
        @if (step.gatewayType === 'decision') {
          <section class="section">
            <h3>
              @if (isInstance()) { Entscheidung } @else { Verzweigungen }
              <span class="count">{{ step.branches?.length || 0 }}</span>
              @if (!isInstance()) {
                <button class="add-btn" (click)="addBranch(step.id)">+ Pfad</button>
              }
            </h3>

            @if (isInstance()) {
              <!-- Instance mode: branch chooser -->
              @if (step.chosenBranchId) {
                <div class="branch-chosen-info">
                  <i class="material-icons">check_circle</i>
                  Entscheidung getroffen — Pfad wird im Diagramm hervorgehoben.
                </div>
              } @else {
                <div class="branch-choose-hint">
                  <i class="material-icons">info_outline</i>
                  Pfad wählen, um die Entscheidung im Workflow festzuhalten:
                </div>
              }
              <div class="branch-chooser-list">
                @for (branch of step.branches || []; track branch.id) {
                  <div class="branch-choose-item"
                    [class.chosen]="step.chosenBranchId === branch.id"
                    [class.unchosen]="step.chosenBranchId && step.chosenBranchId !== branch.id"
                    (click)="step.chosenBranchId ? null : chooseBranch(step.id, branch.id)">
                    <div class="branch-choose-radio">
                      @if (step.chosenBranchId === branch.id) {
                        <i class="material-icons chosen-icon">check_circle</i>
                      } @else {
                        <i class="material-icons">radio_button_unchecked</i>
                      }
                    </div>
                    <div class="branch-choose-info">
                      <span class="branch-choose-label">{{ branch.label }}</span>
                      @if (branch.condition) {
                        <span class="branch-choose-cond">{{ branch.condition }}</span>
                      }
                      <span class="branch-step-count">{{ branch.steps.length }} Folgeschritt(e)</span>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <!-- Template mode: branch editing -->
              @for (branch of step.branches || []; track branch.id) {
                <div class="branch-edit-item">
                  <div class="branch-edit-color"></div>
                  <div class="branch-edit-fields">
                    <input type="text" [value]="branch.label" (change)="updateBranch(step.id, branch.id, 'label', $event)" placeholder="Label (z.B. Bewilligt)" class="branch-input" />
                    <input type="text" [value]="branch.condition" (change)="updateBranch(step.id, branch.id, 'condition', $event)" placeholder="Bedingung" class="branch-input small" />
                    <span class="branch-step-count">{{ branch.steps.length }} Schritt(e) — im Diagramm bearbeiten</span>
                  </div>
                  @if (step.status !== 'completed') {
                    <button class="remove-btn" (click)="removeBranch(step.id, branch.id)">&#10005;</button>
                  }
                </div>
              }
            }
          </section>
        }

        <!-- Parallel: Paths -->
        @if (step.gatewayType === 'parallel') {
          <section class="section">
            <h3>
              Parallele Pfade
              <span class="count">{{ step.parallelPaths?.length || 0 }}</span>
              @if (!isInstance()) {
                <button class="add-btn" (click)="addParallelPath(step.id)">+ Pfad</button>
              }
            </h3>
            @for (path of step.parallelPaths || []; track $index; let pi = $index) {
              <div class="parallel-edit-item">
                <div class="ps-dot" [class]="path[0]?.status || 'pending'"></div>
                @if (!isInstance()) {
                  <input type="text" [value]="step.parallelPathLabels?.[pi] || 'Pfad ' + (pi + 1)"
                         (change)="updateParallelPathLabel(step.id, pi, $event)"
                         class="branch-input" [placeholder]="'Pfad ' + (pi + 1)" />
                  <span class="branch-step-count">{{ path.length }} Schritt(e)</span>
                  <button class="remove-btn" (click)="removeParallelPath(step.id, pi)">&#10005;</button>
                } @else {
                  <span class="branch-input-readonly">{{ parallelLabel(step, pi, path) }}</span>
                  <span class="task-status-badge" [class]="path[0]?.status || 'pending'">{{ statusLabel(path[0]?.status || 'pending') }}</span>
                }
              </div>
            }
          </section>
        }

        <!-- Loop: Configuration -->
        @if (step.gatewayType === 'loop') {
          <section class="section">
            <h3>Schleife</h3>
            <div class="edit-row">
              <label>Bedingung</label>
              @if (!isInstance()) {
                <input type="text" [ngModel]="step.loopCondition || ''"
                       (ngModelChange)="svc.updateStepField(step.id, { loopCondition: $event })"
                       placeholder="Bedingung für Wiederholung" />
              } @else {
                <span class="branch-input-readonly">{{ step.loopCondition || '—' }}</span>
              }
            </div>
            <div class="edit-row" style="margin-top:8px">
              <label>Schleifenkörper</label>
              <span class="branch-step-count">
                @if (step.loopBody?.length) {
                  {{ step.loopBody!.length }} Schritt(e): {{ loopBodyTitles(step) }}
                } @else {
                  0 Schritt(e) — im Diagramm bearbeiten
                }
              </span>
            </div>

            <!-- Schleife durchlaufen: nur in der Instanz und nur solange das Gateway aktiv ist -->
            @if (isInstance() && step.status === 'in-progress') {
              @if (svc.loopStatus(); as ls) {
                <div class="loop-run">
                  <div class="loop-run-head">
                    <span class="loop-round">
                      @if (svc.canRunLoopRound()) {
                        Nächste Runde: {{ ls.mahnstufe + 1 }} von {{ ls.maxMahnstufe }}
                      } @else {
                        Mahnstufe {{ ls.mahnstufe }} von {{ ls.maxMahnstufe }}
                      }
                    </span>
                    <span class="loop-state">{{ ls.offen }} von {{ ls.gesamt }} noch offen</span>
                  </div>
                  <div class="loop-bar">
                    <div class="loop-bar-fill" [style.width.%]="(ls.gesamt - ls.offen) / ls.gesamt * 100"></div>
                  </div>
                  <p class="loop-explain">
                    @if (svc.canRunLoopRound()) {
                      Eine Runde erzeugt den Erinnerungsbrief für die {{ ls.offen }} offenen Familien
                      als Word-Datei und erfasst danach den Rücklauf. Die Bedingung oben wird nach
                      jeder Runde neu geprüft.
                    } @else if (ls.offen === 0) {
                      Alle Anmeldungen liegen vor, die Bedingung ist nicht mehr erfüllt.
                      Die Schleife kann verlassen werden.
                    } @else {
                      Mahnstufe {{ ls.maxMahnstufe }} ist erreicht. Ein weiterer Brief ist nicht
                      vorgesehen,
                      @if (ls.offen === 1) {
                        der letzte Fall ist telefonisch nachzufassen.
                      } @else {
                        die restlichen {{ ls.offen }} Fälle sind telefonisch nachzufassen.
                      }
                      Die Schleife kann verlassen werden.
                    }
                  </p>
                  <div class="loop-run-actions">
                    <button class="loop-round-btn" (click)="runLoopRound()" [disabled]="!svc.canRunLoopRound()">
                      &#8635; Runde durchlaufen
                    </button>
                    <button class="loop-exit-btn" (click)="svc.exitLoop(step.id)">
                      Schleife verlassen &amp; weiter
                    </button>
                  </div>
                </div>
              }
            } @else if (isInstance() && step.status === 'pending') {
              <p class="loop-explain">
                Die Schleife wird geprüft, sobald der vorherige Schritt abgeschlossen ist.
              </p>
            }
          </section>
        }

        <!-- Subprocess: Sub-Steps -->
        @if (step.stepType === 'subprocess') {
          <section class="section">
            <h3>
              Sub-Schritte
              <span class="count">{{ step.subSteps?.length || 0 }}</span>
              @if (!isInstance()) {
                <button class="add-btn" (click)="addSubStep(step.id)">+ Sub-Schritt</button>
              }
            </h3>
            @for (sub of step.subSteps || []; track sub.id; let si = $index) {
              <div class="substep-edit-item">
                <span class="substep-edit-num">{{ si + 1 }}.</span>
                @if (!isInstance()) {
                  <input type="text" [value]="sub.title" (change)="updateSubStepTitle(step.id, si, $event)" class="branch-input" />
                  <input type="text" [value]="sub.responsible" (change)="updateSubStepResp(step.id, si, $event)" placeholder="Verantwortlich" class="branch-input small" />
                } @else {
                  <span class="branch-input-readonly">{{ sub.title }}</span>
                  @if (sub.responsible) { <span class="branch-input-readonly small-text">{{ sub.responsible }}</span> }
                }
                @if (!isInstance()) {
                  <button class="remove-btn" (click)="removeSubStep(step.id, si)">&#10005;</button>
                }
              </div>
            }
          </section>
        }

        @if (step.kind !== 'gateway') {

        <!-- Kontextobjekte -->
        @if (svc.getContextsForStep(step.id).length) {
          <section class="section">
            <h3>Verknüpfte Objekte <span class="count">{{ svc.getContextsForStep(step.id).length }}</span></h3>
            @for (ctx of svc.getContextsForStep(step.id); track ctx.id) {
              <div class="context-item clickable" (click)="openContext(ctx)">
                <div class="ctx-type-badge" [class]="ctx.type">
                  @if (ctx.type === 'sitzung') { Sitzung } @else if (ctx.type === 'geschaeft') { Geschäft } @else if (ctx.type === 'projekt') { Projekt } @else { Andere }
                </div>
                <div class="ctx-info">
                  <span class="ctx-title">{{ ctx.title }}</span>
                  <span class="ctx-number">{{ ctx.number }}</span>
                </div>
                <i class="material-icons ctx-arrow">open_in_new</i>
              </div>
            }
          </section>
        }

        <!-- Aufgaben — hidden for automated activities -->
        @if (step.stepType !== 'activity') {
        <section class="section">
          <h3>
            Aufgaben
            <span class="count">{{ doneTaskCount(step) }}/{{ step.tasks.length }}</span>
            @if (!isInstance()) {
              <button class="add-btn" (click)="showAddTask.set(true)">+ Aufgabe</button>
            }
          </h3>

          @if (showAddTask() && !isInstance()) {
            <div class="add-form">
              <input type="text" [(ngModel)]="newTaskTitle" placeholder="Aufgabentitel" class="add-input" />
              <input type="text" [(ngModel)]="newTaskAssignee" placeholder="Zuständig" class="add-input small" />
              <button class="save-btn" (click)="addTask(step.id)" [disabled]="!newTaskTitle()">Hinzufügen</button>
              <button class="cancel-btn" (click)="showAddTask.set(false)">Abbrechen</button>
            </div>
          }

          @for (task of step.tasks; track task.id) {
            <div class="task-item" [class.done]="isInstance() && task.status === 'done'">
              @if (isInstance()) {
                <!-- Instance: interactive status toggle -->
                <button class="task-check-btn" (click)="svc.toggleTaskStatus(step.id, task.id)" [disabled]="step.status === 'completed'">
                  @if (task.status === 'done') {
                    <svg width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="3" fill="#3f971a"/><path d="M5 9l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
                  } @else if (task.status === 'in-progress') {
                    <svg width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="3" fill="none" stroke="#009fe3" stroke-width="1.5"/><circle cx="9" cy="9" r="3.5" fill="#009fe3"/></svg>
                  } @else {
                    <svg width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="3" fill="none" stroke="#bdbdbd" stroke-width="1.5"/></svg>
                  }
                </button>
              } @else {
                <!-- Template: neutral checkbox (no state) -->
                <span class="task-check-template">
                  <svg width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18" rx="3" fill="none" stroke="#bdbdbd" stroke-width="1.5"/></svg>
                </span>
              }
              <div class="task-info">
                <span class="task-title">{{ task.title }}</span>
                <span class="task-assignee">{{ task.assignee }}</span>
              </div>
              @if (isInstance()) {
                <span class="task-status-badge" [class]="task.status">{{ taskStatusLabel(task.status) }}</span>
              }
              @if (!isInstance()) {
                <button class="remove-btn" title="Entfernen" (click)="svc.removeTaskFromStep(step.id, task.id)">&#10005;</button>
              }
            </div>
          }
        </section>
        } <!-- end @if stepType !== 'activity' -->

        <!-- Inputs -->
        @if (step.inputs.length) {
          <section class="section">
            <h3>Inputs <span class="count">{{ step.inputs.length }}</span></h3>
            @for (input of step.inputs; track input.id) {
              @if (!hideInput(step, input)) {
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
                    <button class="doc-btn" (click)="openDocument(step.id, input)"
                            [title]="docOpensInWord(input) ? 'Öffnet das Dokument in Word' : ''">
                      {{ input.uploaded ? (docOpensInWord(input) ? 'In Word öffnen' : 'Öffnen') : 'Hochladen' }}
                    </button>
                  </div>
                }
              </div>
              }
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
                @if (isInstance() && action.type === 'ai' && isAssessmentAction(action.id) && step.status === 'in-progress') {
                  <button class="action-btn ai" (click)="runAi(step.id, action.id)" [disabled]="action.aiResult?.status === 'running'">
                    @if (action.aiResult?.status === 'running') {
                      <span class="ai-spinner"></span> KI+ analysiert…
                    } @else if (action.aiResult?.status === 'done') {
                      Erneut ausführen
                    } @else {
                      Ausführen
                    }
                  </button>
                } @else if (isInstance() && action.type === 'interface' && svc.isSyncAction(action.id) && step.status === 'in-progress') {
                  <button class="action-btn interface" (click)="runSync(step.id, action.id)" [disabled]="action.syncResult?.status === 'running'">
                    @if (action.syncResult?.status === 'running') {
                      <span class="ai-spinner"></span> Abgleich läuft…
                    } @else if (action.syncResult?.status === 'done') {
                      Erneut abgleichen
                    } @else {
                      Abgleich auslösen
                    }
                  </button>
                } @else if (isInstance() && svc.isDocumentAction(action.id) && step.status === 'in-progress') {
                  <button class="action-btn document" (click)="runDocument(step.id, action.id)">
                    {{ svc.documentActionLabel(action.id) }}
                  </button>
                } @else {
                  <button class="action-btn" [class]="action.type">Ausführen</button>
                }
              </div>

              <!-- Schnittstellen-Lauf: Konfiguration, Zähler, Warnungen, Rückkanal -->
              @if (action.syncResult; as sync) {
                @if (sync.status !== 'running') {
                  <div class="sync-result" [class]="sync.outcome">
                    <div class="sync-head">
                      <span class="sync-badge">Schnittstelle</span>
                      <span class="sync-system">{{ sync.systemName }}</span>
                      <span class="sync-direction">{{ sync.direction }}</span>
                      <span class="sync-outcome" [class]="sync.outcome">{{ syncOutcomeLabel(sync.outcome) }}</span>
                    </div>
                    <div class="sync-endpoint"><code>{{ sync.endpoint }}</code></div>

                    @if (sync.config?.length) {
                      <dl class="sync-config">
                        @for (c of sync.config; track c.label) {
                          <dt>{{ c.label }}</dt><dd>{{ c.value }}</dd>
                        }
                      </dl>
                    }

                    <div class="sync-metrics">
                      @for (m of sync.metrics; track m.label) {
                        <div class="sync-metric">
                          <span class="sync-metric-value">{{ m.value }}</span>
                          <span class="sync-metric-label">{{ m.label }}</span>
                        </div>
                      }
                    </div>
                    @if (sync.lastRun) {
                      <p class="sync-lastrun">Letzter Lauf: {{ sync.lastRun }}</p>
                    }

                    @if (sync.warnings.length) {
                      <!-- track by index: the warning texts are rebuilt on every run -->
                      <ul class="sync-warnings">
                        @for (w of sync.warnings; track $index) { <li>{{ w }}</li> }
                      </ul>
                    }

                    <!-- Rückkanal: Anmeldestand je Kind -->
                    @if (sync.registrations?.length) {
                      <div class="sync-reg">
                        <div class="sync-reg-head">
                          <span>Anmeldestand je Kind</span>
                          @if (sync.deadline) { <span class="sync-reg-deadline">Frist {{ sync.deadline }}</span> }
                        </div>
                        <div class="sync-bar">
                          <div class="sync-bar-fill" [style.width.%]="syncRegPercent(sync)"></div>
                        </div>
                        <ul class="sync-reg-list">
                          @for (r of sync.registrations; track r.name) {
                            <li [class]="r.status">
                              <span class="sync-reg-name">{{ r.name }}</span>
                              @if (r.status === 'angemeldet') {
                                <span class="sync-reg-state ok">angemeldet {{ r.registeredAt }}</span>
                              } @else {
                                <span class="sync-reg-state open">
                                  offen@if (r.reminders) { , {{ r.reminders }}. Erinnerung }
                                </span>
                              }
                            </li>
                          }
                        </ul>
                        @if (offeneAnmeldungen(sync); as offen) {
                          <span class="ai-hint">
                            @if (offen === 1) { Eine Anmeldung ist } @else { {{ offen }} Anmeldungen sind }
                            noch offen. Das Nachfassen läuft über die Schleife
                            «{{ loopGatewayTitle() }}» im nächsten Schritt.
                          </span>
                        }
                      </div>
                    }

                    <span class="ai-hint">Simulierter Lauf. Es verlässt kein Request den Browser.</span>
                  </div>
                }
              }

              <!-- KI+ result card (inline, below the action that produced it) -->
              @if (action.aiResult?.status === 'done'; as _r) {
                <div class="ai-result">
                  <div class="ai-result-head">
                    <span class="ai-badge">KI+</span>
                    <span class="ai-assistant">{{ action.aiResult!.assistantName }}</span>
                    <span class="ai-reco" [class]="recoClass(action.aiResult!.recommendedLevel)">
                      Empfehlung: {{ action.aiResult!.recommendedLevel }}
                    </span>
                  </div>
                  <label class="ai-field-label">Einschätzung (editierbar)</label>
                  <div class="ai-summary" contenteditable="true"
                       [innerHTML]="action.aiResult!.summary"
                       (blur)="onSummaryEdit(step.id, action.id, $event)"></div>
                  <div class="ai-result-actions">
                    <button class="ai-detail-btn" (click)="openAiDetail(action.aiResult!)">
                      <i class="material-icons">article</i> Detailanalyse anzeigen
                    </button>
                    <span class="ai-hint">Vorschlag der KI+. Die definitive Entscheidung trifft die sachbearbeitende Person unten.</span>
                  </div>
                </div>
              }
            }
          </section>
        }

        <!-- Entscheid festlegen: gated on a completed KI+ assessment -->
        @if (showDecisionSetter(step)) {
          <section class="section risk-setter">
            <h3>{{ decisionLabelOf(step) }} festlegen</h3>
            <p class="risk-setter-hint">
              Die definitive Beurteilung trifft die sachbearbeitende Person. Erst mit dem Setzen
              wird der nächste Schritt gestartet.
            </p>
            <div class="risk-options">
              @for (opt of decisionOptions(step); track opt) {
                <button class="risk-opt" [class.selected]="decisionDraft() === opt"
                        [class]="recoClass(opt)" (click)="decisionDraft.set(opt)">{{ opt }}</button>
              }
            </div>
            <button class="risk-confirm" [disabled]="!decisionDraft()" (click)="confirmDecision(step)">
              {{ decisionLabelOf(step) }} setzen &amp; nächsten Schritt starten
            </button>
          </section>
        }

        <!-- Abschlusskriterien — hidden for automated activities -->
        @if (step.stepType !== 'activity') {
        <section class="section">
          <h3>
            Abschlusskriterien
            <span class="count">{{ metCriteriaCount(step) }}/{{ step.completionCriteria.length }}</span>
            @if (!isInstance()) {
              <button class="add-btn" (click)="showAddCriterion.set(true)">+ Kriterium</button>
            }
          </h3>

          @if (showAddCriterion() && !isInstance()) {
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
              @if (!isInstance()) {
                <button class="remove-btn" title="Entfernen" (click)="svc.removeCriterionFromStep(step.id, c.id)">&#10005;</button>
              }
            </div>
          }
        </section>
        } <!-- end @if stepType !== 'activity' -->

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

        <!-- Schritt abschliessen (nur in Instanz-Modus) -->
        @if (isInstance()) {
          @if (step.status === 'in-progress' && !hasAssessment(step)) {
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
        }

        } <!-- end @if kind !== gateway -->
      </div>
    } @else {
      <div class="empty-state">
        <div class="empty-icon">&#128072;</div>
        <h3>Prozessschritt auswählen</h3>
        <p>Klicke links auf einen Schritt, um die Details anzuzeigen.</p>
      </div>
    }

    <!-- KI+ Detailanalyse-Dialog -->
    @if (aiDetail(); as detail) {
      <div class="ai-overlay" (click)="closeAiDetail()">
        <div class="ai-dialog" (click)="$event.stopPropagation()">
          <div class="ai-dialog-head">
            <span class="ai-badge">KI+</span>
            <h3>Detailanalyse</h3>
            <button class="ai-dialog-close" (click)="closeAiDetail()" title="Schliessen">
              <i class="material-icons">close</i>
            </button>
          </div>
          <div class="ai-dialog-body" [innerHTML]="detail.detail"></div>
          @if (detail.generatedAt) {
            <div class="ai-dialog-foot">Erstellt durch {{ detail.assistantName }}</div>
          }
        </div>
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

    .branch-input-readonly {
      font-size: 13px; color: #353c46; padding: 2px 0; flex: 1;
    }
    .branch-input-readonly.small-text { font-size: 12px; color: #6c7e93; flex: 0.5; }

    .remove-btn {
      background: none; border: none; color: #bdbdbd; cursor: pointer; font-size: 14px;
      padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
    }
    .remove-btn:hover { color: #8c0909; background: #fce8e8; }

    .task-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #ebebed; transition: opacity 0.2s; }
    .task-item.done { opacity: 0.7; }
    .task-check-btn { background: none; border: none; cursor: pointer; padding: 0; flex-shrink: 0; }
    .task-check-btn:disabled { cursor: default; }
    .task-check-template { display: flex; flex-shrink: 0; opacity: 0.5; }
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
    .action-type-badge.interface { background: #e8f5e9; color: #2e7d32; }
    .action-btn.interface { background: #2e7d32; }
    .action-btn.document { background: #1b5e9e; }
    .doc-btn { cursor: pointer; }

    /* Schleifensteuerung am Loop-Gateway */
    .loop-run {
      margin-top: 12px; padding: 12px 14px; border-radius: 6px;
      background: #fdf9f2; border: 1px solid #ecdcc0; border-left: 3px solid #f59e0b;
    }
    .loop-run-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
    .loop-round { font-size: 14px; color: #353c46; }
    .loop-state { font-size: 12px; color: #92400e; margin-left: auto; }
    .loop-bar { height: 6px; background: #f1e6d3; border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
    .loop-bar-fill { height: 100%; background: #f59e0b; transition: width .3s ease; }
    .loop-explain { margin: 0 0 10px; font-size: 12px; color: #6c7e93; line-height: 1.5; }
    .loop-run-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .loop-round-btn {
      padding: 6px 14px; background: #f59e0b; color: #3d2c05; border: none;
      border-radius: 4px; font-size: 13px; cursor: pointer; font-family: inherit; white-space: nowrap;
    }
    .loop-round-btn:disabled { background: #e2ddd4; color: #97918a; cursor: not-allowed; }
    .loop-exit-btn {
      padding: 6px 14px; background: white; color: #353c46; border: 1px solid #c9cfd6;
      border-radius: 4px; font-size: 13px; cursor: pointer; font-family: inherit; white-space: nowrap;
    }

    /* Schnittstellen-Lauf (ContactSync, Klapp) */
    .sync-result {
      margin: 4px 0 12px; padding: 12px 14px; border-radius: 6px;
      background: #f7faf8; border: 1px solid #d9e6dc; border-left: 3px solid #2e7d32;
    }
    .sync-result.warnung { border-left-color: #f59e0b; }
    .sync-result.fehler { border-left-color: #8c0909; }
    .sync-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .sync-badge {
      font-size: 10px; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;
      background: #e8f5e9; color: #2e7d32; white-space: nowrap;
    }
    .sync-system { font-size: 14px; color: #353c46; font-weight: 500; }
    .sync-direction { font-size: 12px; color: #6c7e93; }
    .sync-outcome { font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: auto; white-space: nowrap; }
    .sync-outcome.ok { background: #e8f5e9; color: #2e7d32; }
    .sync-outcome.warnung { background: #fef3c7; color: #92400e; }
    .sync-outcome.fehler { background: #fde8e8; color: #8c0909; }
    .sync-endpoint { margin-bottom: 8px; }
    .sync-endpoint code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px; color: #353c46; background: #eef3ef; padding: 2px 6px; border-radius: 3px;
      word-break: break-all;
    }
    .sync-config {
      display: grid; grid-template-columns: auto 1fr; gap: 2px 12px;
      margin: 0 0 10px; font-size: 12px;
    }
    .sync-config dt { color: #6c7e93; }
    .sync-config dd { margin: 0; color: #353c46; }
    .sync-metrics { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .sync-metric {
      display: flex; flex-direction: column; min-width: 96px; padding: 6px 10px;
      background: white; border: 1px solid #e3e9e5; border-radius: 4px;
    }
    .sync-metric-value { font-size: 16px; color: #353c46; }
    .sync-metric-label { font-size: 11px; color: #6c7e93; }
    .sync-lastrun { margin: 0 0 8px; font-size: 12px; color: #6c7e93; }
    .sync-warnings { margin: 0 0 10px; padding-left: 18px; }
    .sync-warnings li { font-size: 12px; color: #92400e; margin-bottom: 3px; }

    /* Rückkanal: Anmeldestand je Kind */
    .sync-reg {
      margin-bottom: 10px; padding: 10px; background: white;
      border: 1px solid #e3e9e5; border-radius: 4px;
    }
    .sync-reg-head {
      display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px;
      font-size: 13px; color: #353c46;
    }
    .sync-reg-deadline { font-size: 11px; color: #6c7e93; margin-left: auto; }
    .sync-bar { height: 6px; background: #eef3ef; border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
    .sync-bar-fill { height: 100%; background: #3f971a; transition: width .3s ease; }
    .sync-reg-list { list-style: none; margin: 0 0 8px; padding: 0; max-height: 220px; overflow-y: auto; }
    .sync-reg-list li {
      display: flex; gap: 8px; align-items: baseline; padding: 3px 0;
      border-bottom: 1px solid #f1f4f2; font-size: 12px;
    }
    .sync-reg-list li:last-child { border-bottom: none; }
    .sync-reg-name { color: #353c46; flex: 1; }
    .sync-reg-state { white-space: nowrap; }
    .sync-reg-state.ok { color: #3f971a; }
    .sync-reg-state.open { color: #92400e; }
    .sync-reg-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .action-info { flex: 1; display: flex; flex-direction: column; }
    .action-label { font-size: 14px; color: #353c46; }
    .action-desc { font-size: 12px; color: #6c7e93; }
    .action-btn {
      padding: 4px 12px; background: #009fe3; color: white; border: none;
      border-radius: 4px; font-size: 12px; cursor: pointer; white-space: nowrap; font-family: inherit;
    }
    .action-btn:hover { background: #007ab8; }
    .action-btn.ai { background: linear-gradient(135deg, #7c3aed, #009fe3); display: inline-flex; align-items: center; gap: 6px; }
    .action-btn.ai:hover { background: linear-gradient(135deg, #6d28d9, #007ab8); }
    .action-btn:disabled { opacity: 0.75; cursor: default; }
    .ai-spinner {
      width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.5);
      border-top-color: #fff; border-radius: 50%; display: inline-block;
      animation: ai-spin 0.7s linear infinite;
    }
    @keyframes ai-spin { to { transform: rotate(360deg); } }

    /* KI+ result card */
    .ai-result {
      margin: 4px 0 14px; padding: 14px 16px; border-radius: 8px;
      background: linear-gradient(180deg, #faf5ff, #f4f9fe);
      border: 1px solid #e3d4f7;
    }
    .ai-result-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    .ai-badge {
      font-size: 11px; font-weight: 600; color: #fff; padding: 2px 8px; border-radius: 10px;
      background: linear-gradient(135deg, #7c3aed, #009fe3); letter-spacing: 0.3px;
    }
    .ai-assistant { font-size: 13px; color: #586475; flex: 1; }
    .ai-reco {
      font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 12px; white-space: nowrap;
    }
    .ai-reco.risk-low { background: #eef7ea; color: #3f971a; }
    .ai-reco.risk-medium { background: #fdf3e2; color: #b9760a; }
    .ai-reco.risk-high { background: #fbeaea; color: #8c0909; }
    .ai-reco.risk-neutral { background: #e6f4fd; color: #009fe3; }
    .ai-field-label { font-size: 12px; color: #586475; display: block; margin-bottom: 4px; }
    .ai-summary {
      width: 100%; box-sizing: border-box; padding: 12px 14px; border: 1px solid #cbb6e6;
      border-radius: 6px; font-size: 13px; font-family: inherit; line-height: 1.55; color: #353c46;
      background: #fff; min-height: 120px;
    }
    .ai-summary:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 2px rgba(124,58,237,0.15); }
    .ai-summary p { margin: 0 0 8px; }
    .ai-summary p:last-child { margin-bottom: 0; }
    .ai-summary ul { margin: 4px 0 10px; padding-left: 20px; }
    .ai-summary li { margin: 2px 0; }
    .ai-summary strong { color: #2a2f37; }
    .ai-result-actions { display: flex; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
    .ai-detail-btn {
      display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #7c3aed;
      border: 1px solid #cbb6e6; border-radius: 6px; padding: 6px 12px; font-size: 13px;
      cursor: pointer; font-family: inherit;
    }
    .ai-detail-btn:hover { background: #f3e8ff; }
    .ai-detail-btn .material-icons { font-size: 16px; }
    .ai-hint { font-size: 11px; color: #6c7e93; flex: 1; min-width: 180px; }

    /* Risikostufe setter */
    .risk-setter { margin-top: 8px; }
    .risk-setter-hint { font-size: 13px; color: #586475; margin: 0 0 12px; line-height: 1.5; }
    .risk-options { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
    .risk-opt {
      padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;
      background: #fff; border: 2px solid #d4d8de; color: #586475; font-family: inherit; transition: all 0.15s;
    }
    .risk-opt:hover { border-color: #9aa3ae; }
    .risk-opt.selected.risk-low { border-color: #3f971a; background: #eef7ea; color: #2f7211; }
    .risk-opt.selected.risk-medium { border-color: #d98a0b; background: #fdf3e2; color: #92710c; }
    .risk-opt.selected.risk-high { border-color: #8c0909; background: #fbeaea; color: #8c0909; }
    .risk-opt.selected.risk-neutral { border-color: #009fe3; background: #e6f4fd; color: #007ab8; }
    .risk-confirm {
      padding: 12px 18px; background: #009fe3; color: #fff; border: none; border-radius: 6px;
      font-size: 14px; cursor: pointer; font-family: inherit;
    }
    .risk-confirm:hover:not(:disabled) { background: #007ab8; }
    .risk-confirm:disabled { background: #c3ccd6; cursor: default; }

    /* KI+ detail dialog */
    .ai-overlay {
      position: fixed; inset: 0; background: rgba(20,28,40,0.5); z-index: 1000;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .ai-dialog {
      background: #fff; border-radius: 12px; width: min(760px, 100%); max-height: 84vh;
      display: flex; flex-direction: column; box-shadow: 0 18px 50px rgba(0,0,0,0.3); overflow: hidden;
    }
    .ai-dialog-head {
      display: flex; align-items: center; gap: 12px; padding: 18px 22px;
      border-bottom: 1px solid #ebebed; background: linear-gradient(135deg, #faf5ff, #f4f9fe);
    }
    .ai-dialog-head h3 { margin: 0; flex: 1; font-size: 18px; font-weight: 500; color: #353c46; }
    .ai-dialog-close { background: none; border: none; cursor: pointer; color: #6c7e93; padding: 2px; display: flex; }
    .ai-dialog-close:hover { color: #353c46; }
    .ai-dialog-body {
      padding: 20px 22px; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #353c46;
    }
    .ai-dialog-body h4 {
      margin: 16px 0 6px; font-size: 14px; font-weight: 600; color: #7c3aed;
    }
    .ai-dialog-body h4:first-child { margin-top: 0; }
    .ai-dialog-body p { margin: 0 0 8px; }
    .ai-dialog-body ul { margin: 4px 0 10px; padding-left: 22px; }
    .ai-dialog-body li { margin: 3px 0; }
    .ai-dialog-body .ai-meta {
      background: #f4f5f6; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #586475;
    }
    .ai-dialog-body strong { color: #2a2f37; }
    .ai-dialog-foot { padding: 12px 22px; border-top: 1px solid #ebebed; font-size: 12px; color: #6c7e93; }

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

    .context-item {
      display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #ebebed;
    }
    .ctx-type-badge {
      font-size: 10px; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; font-weight: 400; white-space: nowrap;
    }
    .ctx-type-badge.geschaeft { background: #e6f4fd; color: #009fe3; }
    .ctx-type-badge.sitzung { background: #f3e8ff; color: #7c3aed; }
    .ctx-type-badge.projekt { background: #eef7ea; color: #3f971a; }
    .ctx-type-badge.andere { background: #f4f5f6; color: #6c7e93; }
    /* Step / gateway type selector */
    .type-selector { display: flex; gap: 6px; flex-wrap: wrap; }
    .type-btn {
      display: flex; align-items: center; gap: 4px; padding: 6px 12px;
      background: white; border: 1px solid #bdbdbd; border-radius: 6px;
      font-size: 12px; color: #586475; cursor: pointer; font-family: inherit;
      transition: all 0.15s;
    }
    .type-btn .material-icons { font-size: 16px; }
    .type-btn:hover { border-color: #009fe3; background: #f4f5f6; }
    .type-btn.active { border-width: 2px; font-weight: 500; }
    .type-btn.task.active { background: #f4f5f6; border-color: #586475; color: #353c46; }
    .type-btn.activity.active { background: #e6f4fd; border-color: #009fe3; color: #009fe3; }
    .type-btn.subprocess.active { background: #e6f4fd; border-color: #009fe3; color: #009fe3; }
    .type-btn.decision.active { background: #fef9e7; border-color: #f59e0b; color: #f59e0b; }
    .type-btn.parallel.active { background: #f9f5ff; border-color: #7c3aed; color: #7c3aed; }
    .type-btn.loop.active { background: #fff7ed; border-color: #f97316; color: #f97316; }
    .type-badge-display {
      display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px;
      border-radius: 6px; font-size: 12px; margin-bottom: 12px;
    }
    .type-badge-display .material-icons { font-size: 16px; }
    .type-badge-display.decision { background: #fef9e7; color: #f59e0b; }
    .type-badge-display.parallel { background: #f9f5ff; color: #7c3aed; }
    .type-badge-display.loop { background: #fff7ed; color: #f97316; }
    .type-badge-display.subprocess { background: #e6f4fd; color: #009fe3; }
    .type-badge-display.activity { background: #e6f4fd; color: #009fe3; }

    /* Subtype selectors (taskMode, activityKind) */
    .subtype-row { margin-top: 10px; }
    .subtype-label { display: block; font-size: 11px; color: #6c7e93; margin-bottom: 6px; }
    .toggle-group { display: flex; border: 1px solid #bdbdbd; border-radius: 6px; overflow: hidden; width: fit-content; }
    .toggle-tab {
      display: flex; align-items: center; gap: 4px; padding: 5px 12px;
      background: white; border: none; font-size: 12px; color: #586475;
      cursor: pointer; font-family: inherit; transition: all 0.15s;
    }
    .toggle-tab .material-icons { font-size: 15px; }
    .toggle-tab:not(:last-child) { border-right: 1px solid #bdbdbd; }
    .toggle-tab.active { background: #009fe3; color: white; font-weight: 500; }
    .activity-grid { display: flex; gap: 6px; flex-wrap: wrap; }
    .activity-kind-btn {
      display: flex; align-items: center; gap: 4px; padding: 5px 10px;
      background: white; border: 1px solid #bdbdbd; border-radius: 6px;
      font-size: 11px; color: #586475; cursor: pointer; font-family: inherit;
      transition: all 0.15s;
    }
    .activity-kind-btn .material-icons { font-size: 15px; }
    .activity-kind-btn:hover { border-color: #009fe3; background: #e6f4fd; }
    .activity-kind-btn.active { background: #e6f4fd; border-color: #009fe3; border-width: 2px; color: #009fe3; font-weight: 500; }

    /* Branch chooser (instance mode) */
    .branch-chosen-info {
      display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 8px;
      background: #f0fdf4; border-radius: 4px; font-size: 12px; color: #3f971a;
    }
    .branch-chosen-info .material-icons { font-size: 16px; }
    .branch-choose-hint {
      display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 8px;
      background: #f0f9ff; border-radius: 4px; font-size: 12px; color: #009fe3;
    }
    .branch-choose-hint .material-icons { font-size: 15px; }
    .branch-chooser-list { display: flex; flex-direction: column; gap: 6px; }
    .branch-choose-item {
      display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
      border: 1px solid #dde2e7; border-radius: 6px; cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .branch-choose-item:not(.chosen):not(.unchosen):hover { background: #f0f9ff; border-color: #009fe3; }
    .branch-choose-item.chosen { background: #f0fdf4; border-color: #3f971a; border-width: 2px; cursor: default; }
    .branch-choose-item.unchosen { opacity: 0.45; cursor: default; }
    .branch-choose-radio .material-icons { font-size: 20px; color: #bdbdbd; }
    .branch-choose-radio .chosen-icon { color: #3f971a; }
    .branch-choose-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .branch-choose-label { font-size: 13px; font-weight: 500; color: #353c46; }
    .branch-choose-cond { font-size: 11px; color: #6c7e93; font-style: italic; }

    /* Branch editing */
    .branch-edit-item {
      display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #ebebed;
    }
    .branch-edit-color { width: 4px; height: 32px; background: #f59e0b; border-radius: 2px; flex-shrink: 0; }
    .branch-edit-fields { flex: 1; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .branch-input {
      padding: 5px 8px; border: 1px solid #bdbdbd; border-radius: 4px;
      font-size: 13px; font-family: inherit; flex: 1; min-width: 100px;
    }
    .branch-input.small { flex: 0.6; min-width: 80px; }
    .branch-input:focus { outline: none; border-color: #009fe3; }
    .branch-step-count { font-size: 12px; color: #6c7e93; font-style: italic; }
    .branch-edit-fields select {
      padding: 5px 8px; border: 1px solid #bdbdbd; border-radius: 4px;
      font-size: 13px; font-family: inherit; flex: 1; min-width: 140px;
    }

    /* Parallel editing */
    .parallel-edit-item {
      display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #ebebed;
    }
    .ps-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .ps-dot.completed { background: #3f971a; } .ps-dot.in-progress { background: #009fe3; } .ps-dot.pending { background: #bdbdbd; }

    /* Substep editing */
    .substep-edit-item {
      display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #ebebed;
    }
    .substep-edit-num { font-size: 13px; font-weight: 500; color: #586475; min-width: 20px; }

    .context-item.clickable { cursor: pointer; transition: background 0.15s; }
    .context-item.clickable:hover { background: #f4f5f6; }
    .ctx-info { flex: 1; display: flex; flex-direction: column; }
    .ctx-title { font-size: 14px; color: #353c46; }
    .ctx-number { font-size: 12px; color: #6c7e93; }
    .ctx-arrow { font-size: 18px; color: #bdbdbd; }
    .context-item.clickable:hover .ctx-arrow { color: #009fe3; }
  `,
})
export class StepDetailComponent {
  svc = inject(ProcessService);

  isInstance = computed(() => this.svc.activeProcess()?.kind === 'instance');

  // --- KI+ assessment (recommendation + user decision) ---
  aiDetail = signal<AiAssessment | null>(null);
  decisionDraft = signal('');

  runAi(stepId: string, actionId: string) {
    this.svc.runAiAction(stepId, actionId);
  }

  // --- Schnittstellen-Aktionen (simuliert) ---

  runSync(stepId: string, actionId: string) {
    this.svc.runSyncAction(stepId, actionId);
  }

  /** Title of the loop gateway, so the monitoring step can point at it. */
  loopGatewayTitle(): string {
    const gw = this.svc.steps().find((s) => s.kind === 'gateway' && s.gatewayType === 'loop');
    return gw?.title ?? 'Schleife';
  }

  // --- Dokument-Aktionen: echte Datei erzeugen und dem Browser übergeben ---

  runDocument(stepId: string, actionId: string) {
    const doc = this.svc.buildDocumentAction(stepId, actionId);
    if (doc) this.download(doc.fileName, doc.mime, doc.content);
  }

  /** One loop round: the reminder letter goes out, then the response is recorded. */
  runLoopRound() {
    const doc = this.svc.runLoopRound();
    if (doc) this.download(doc.fileName, doc.mime, doc.content);
  }

  loopBodyTitles(step: ProcessStep): string {
    return (step.loopBody ?? []).map((s) => s.title).join(', ');
  }

  offeneAnmeldungen(sync: SyncRun): number {
    return (sync.registrations ?? []).filter((r) => r.status === 'offen').length;
  }

  /** True when this document field points at a file Word can open. */
  docOpensInWord(input: StepInput): boolean {
    return !!input.uploaded && /\.docx?$/i.test(input.documentName ?? '');
  }

  /** Opening an uploaded Serienbrief rebuilds it, so the file is always current. */
  openDocument(stepId: string, input: StepInput) {
    if (!input.uploaded) return;   // "Hochladen" is not modelled in this prototype
    const actionId = this.svc.documentActionForFile(input.documentName ?? '');
    if (!actionId) return;
    const doc = this.svc.buildDocumentAction(stepId, actionId);
    if (doc) this.download(doc.fileName, doc.mime, doc.content);
  }

  /** A BOM makes Word and Excel read the file as UTF-8 instead of guessing. */
  private download(fileName: string, mime: string, content: string) {
    const blob = new Blob(['﻿' + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke late: some browsers still read the blob while the download starts.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  syncOutcomeLabel(outcome: string) {
    return { ok: 'OK', warnung: 'mit Warnungen', fehler: 'Fehler' }[outcome] ?? outcome;
  }

  /** Share of the cohort that has completed its registration. */
  syncRegPercent(sync: SyncRun): number {
    const regs = sync.registrations ?? [];
    if (!regs.length) return 0;
    return (regs.filter((r) => r.status === 'angemeldet').length / regs.length) * 100;
  }


  openAiDetail(result: AiAssessment) { this.aiDetail.set(result); }
  closeAiDetail() { this.aiDetail.set(null); }

  /** Persist edits made to the rich-text (contenteditable) summary on blur. */
  onSummaryEdit(stepId: string, actionId: string, event: Event) {
    const html = (event.target as HTMLElement).innerHTML;
    this.svc.updateAiSummary(stepId, actionId, html);
  }

  /** Whether this AI action runs as a KI+ assessment (vs. a plain document action). */
  isAssessmentAction(actionId: string): boolean {
    return this.svc.isAssessmentAction(actionId);
  }

  /** The completed KI+ assessment action on this step, if any. */
  private assessmentActionOf(step: ProcessStep): { id: string; label: string } | undefined {
    return step.actions.find(
      (a) => a.type === 'ai' && this.svc.isAssessmentAction(a.id) && a.aiResult?.status === 'done',
    );
  }

  /** The decision label (e.g. "Risikostufe", "Zuständiges Ressort") for this step's assessment. */
  decisionLabelOf(step: ProcessStep): string {
    const action = step.actions.find((a) => a.type === 'ai' && this.svc.isAssessmentAction(a.id));
    return (action && this.svc.assessmentDecisionLabel(action.id)) ?? '';
  }

  private decisionInputOf(step: ProcessStep): StepInput | undefined {
    const label = this.decisionLabelOf(step);
    return label ? step.inputs.find((i) => i.label === label) : undefined;
  }

  /** Hide the decision input from the generic Inputs list while the step is active,
   *  since the dedicated setter below replaces it. */
  hideInput(step: ProcessStep, input: StepInput): boolean {
    return this.isInstance() && step.status === 'in-progress'
      && input.label === this.decisionLabelOf(step) && !!this.decisionLabelOf(step);
  }

  decisionOptions(step: ProcessStep): string[] {
    return this.decisionInputOf(step)?.options ?? [];
  }

  /** Show the user-driven decision setter only after the KI+ run is complete. */
  showDecisionSetter(step: ProcessStep): boolean {
    return this.isInstance()
      && step.status === 'in-progress'
      && !!this.assessmentActionOf(step)
      && !!this.decisionInputOf(step);
  }

  /** True if the step carries any KI+ assessment action (used to gate the generic
   *  "Schritt abschliessen" button, since advancing happens via the decision setter). */
  hasAssessment(step: ProcessStep): boolean {
    return step.actions.some((a) => a.type === 'ai' && this.svc.isAssessmentAction(a.id));
  }

  confirmDecision(step: ProcessStep) {
    if (!this.decisionDraft()) return;
    this.svc.setDecisionAndAdvance(step.id, this.decisionLabelOf(step), this.decisionDraft());
    this.decisionDraft.set('');
  }

  /** Maps a recommendation value to a colour class (green=low/positive,
   *  amber=medium, red=high/negative, blue=neutral classification). */
  recoClass(level: string): string {
    const l = level.toLowerCase();
    if (/sofort|hoch|nicht berechtigt|abgelehnt|obhutsentzug/.test(l)) return 'risk-high';
    if (/mittel|erhöht|teilweise|beistandschaft/.test(l)) return 'risk-medium';
    if (/tief|gering|^berechtigt|\(berechtigt|befürwortet|keine massnahme/.test(l)) return 'risk-low';
    return 'risk-neutral';
  }

  chooseBranch(gatewayStepId: string, branchId: string) {
    const procId = this.svc.activeProcess()?.id;
    if (!procId) return;
    this.svc.chooseBranch(procId, gatewayStepId, branchId, 'Sachbearbeiter:in');
  }

  /** Readable label for a parallel path: the configured label, or (when that is a
   *  technical fallback like "path0") the first step's title. */
  parallelLabel(step: ProcessStep, pi: number, path: ProcessStep[]): string {
    const raw = step.parallelPathLabels?.[pi];
    if (raw && !/^path\d+$/i.test(raw)) return raw;
    return path[0]?.title || `Pfad ${pi + 1}`;
  }

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
    return { standard: 'Standard', script: 'Skript', ai: 'KI+', interface: 'Schnittstelle' }[type] ?? type;
  }

  openContext(ctx: ContextObject) {
    this.svc.openTab(ctx.type as TabType, ctx.id);
  }

  // --- Step / gateway type ---
  setStepType(stepId: string, type: StepType) {
    this.svc.updateStepField(stepId, { stepType: type } as Partial<ProcessStep>);
  }

  setGatewayType(stepId: string, type: GatewayType) {
    this.svc.updateStepField(stepId, { gatewayType: type } as Partial<ProcessStep>);
  }

  setTaskMode(stepId: string, mode: TaskMode) {
    this.svc.updateStepField(stepId, { taskMode: mode } as Partial<ProcessStep>);
  }

  setActivityKind(stepId: string, kind: ActivityKind) {
    this.svc.updateStepField(stepId, { activityKind: kind } as Partial<ProcessStep>);
  }

  // --- Branches (Decision) ---
  addBranch(stepId: string) {
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    if (!updated.branches) updated.branches = [];
    updated.branches.push({ id: crypto.randomUUID(), label: '', condition: '', steps: [] });
    this.svc.updateStep(updated);
  }

  removeBranch(stepId: string, branchId: string) {
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    updated.branches = updated.branches?.filter(b => b.id !== branchId);
    this.svc.updateStep(updated);
  }

  updateBranch(stepId: string, branchId: string, field: 'label' | 'condition', event: Event) {
    const val = (event.target as HTMLInputElement).value;
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    const branch = updated.branches?.find(b => b.id === branchId);
    if (branch) { branch[field] = val; this.svc.updateStep(updated); }
  }

  // --- Parallel Paths ---
  addParallelPath(stepId: string) {
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    if (!updated.parallelPaths) updated.parallelPaths = [];
    if (!updated.parallelPathLabels) {
      updated.parallelPathLabels = updated.parallelPaths.map((_, i) => 'Pfad ' + (i + 1));
    }
    const newIdx = updated.parallelPaths.length + 1;
    updated.parallelPaths.push([{
      id: crypto.randomUUID(), number: 'NEU', title: 'Neuer Schritt', status: 'pending',
      responsible: '', category: '', contextLinks: [], tasks: [], inputs: [], actions: [],
      completionCriteria: [], conditionals: [],
    }]);
    updated.parallelPathLabels.push('Pfad ' + newIdx);
    this.svc.updateStep(updated);
  }

  removeParallelPath(stepId: string, pathIndex: number) {
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    updated.parallelPaths?.splice(pathIndex, 1);
    updated.parallelPathLabels?.splice(pathIndex, 1);
    this.svc.updateStep(updated);
  }

  updateParallelPathLabel(stepId: string, pi: number, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    if (!updated.parallelPathLabels) {
      updated.parallelPathLabels = (updated.parallelPaths ?? []).map((_, i) => 'Pfad ' + (i + 1));
    }
    updated.parallelPathLabels[pi] = val;
    this.svc.updateStep(updated);
  }

  updateParallelStepResp(stepId: string, pi: number, psId: string, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    const ps = updated.parallelPaths?.[pi]?.find(p => p.id === psId);
    if (ps) { ps.responsible = val; this.svc.updateStep(updated); }
  }

  // --- Sub-Steps (Subprocess) ---
  addSubStep(stepId: string) {
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    if (!updated.subSteps) updated.subSteps = [];
    updated.subSteps.push({
      id: crypto.randomUUID(), number: 'NEU', title: 'Neuer Sub-Schritt', status: 'pending',
      responsible: '', category: '', contextLinks: [], tasks: [], inputs: [], actions: [],
      completionCriteria: [], conditionals: [],
    });
    this.svc.updateStep(updated);
  }

  removeSubStep(stepId: string, index: number) {
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    updated.subSteps?.splice(index, 1);
    this.svc.updateStep(updated);
  }

  updateSubStepTitle(stepId: string, index: number, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    if (updated.subSteps?.[index]) { updated.subSteps[index].title = val; this.svc.updateStep(updated); }
  }

  updateSubStepResp(stepId: string, index: number, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    const step = this.svc.selectedStep();
    if (!step || step.id !== stepId) return;
    const updated = structuredClone(step);
    if (updated.subSteps?.[index]) { updated.subSteps[index].responsible = val; this.svc.updateStep(updated); }
  }
}
