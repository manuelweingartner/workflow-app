import { Component, inject, signal } from '@angular/core';
import { ProcessService } from '../../services/process.service';
import { ProcessStep, StepType } from '../../models/process.model';

@Component({
  selector: 'app-process-overview',
  standalone: true,
  template: `
    <div class="overview">
      <div class="overview-header">
        <div class="overview-title-row">
          <h2>Prozessübersicht</h2>
          <div class="view-toggle">
            <button class="toggle-btn" [class.active]="viewMode() === 'sequence'" (click)="viewMode.set('sequence')" title="Sequenz">
              <i class="material-icons">view_list</i>
            </button>
            <button class="toggle-btn" [class.active]="viewMode() === 'flowchart'" (click)="viewMode.set('flowchart')" title="Flowchart">
              <i class="material-icons">account_tree</i>
            </button>
          </div>
        </div>
        @if (svc.activeProcess(); as proc) {
          <p class="overview-sub">{{ proc.title }} &mdash; &#128100; {{ proc.processOwner.name }}</p>
        }
      </div>

      <div class="progress-section">
        <div class="progress-label">
          <span>Gesamtprozess</span>
          <span>{{ svc.progress().done }} von {{ svc.progress().total }} Schritten</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="(svc.progress().done / svc.progress().total) * 100"></div>
        </div>
        @if (svc.contextProgress().total < svc.progress().total) {
          <div class="progress-label context-progress-label">
            <span>Dieses Geschäft</span>
            <span>{{ svc.contextProgress().done }} von {{ svc.contextProgress().total }} Schritten</span>
          </div>
          <div class="progress-bar context-bar">
            <div class="progress-fill context-fill" [style.width.%]="svc.contextProgress().total > 0 ? (svc.contextProgress().done / svc.contextProgress().total) * 100 : 0"></div>
          </div>
        }
        <div class="progress-legend">
          <span class="legend-item"><span class="dot completed"></span> Abgeschlossen</span>
          <span class="legend-item"><span class="dot in-progress"></span> In Bearbeitung</span>
          <span class="legend-item"><span class="dot pending"></span> Ausstehend</span>
          <span class="legend-item"><span class="dot-icon"><i class="material-icons" style="font-size:10px;color:#f59e0b">call_split</i></span> Entscheidung</span>
          <span class="legend-item"><span class="dot-icon"><i class="material-icons" style="font-size:10px;color:#7c3aed">sync</i></span> Parallel</span>
        </div>
      </div>

      @if (viewMode() === 'sequence') {
        <!-- SEQUENCE VIEW -->
        <div class="steps-list">
          @for (step of svc.steps(); track step.id; let last = $last) {
            <ng-container>
              <!-- Step type badge -->
              @if (step.stepType === 'decision' || step.stepType === 'parallel' || step.stepType === 'subprocess') {
                <div class="step-type-indicator" [class]="step.stepType">
                  <button class="collapse-btn" (click)="toggleCollapse($event, step)">
                    <i class="material-icons">{{ step.collapsed ? 'add' : 'remove' }}</i>
                  </button>
                  @if (step.stepType === 'decision') { <i class="material-icons">call_split</i> Entscheidung }
                  @else if (step.stepType === 'parallel') { <i class="material-icons">sync</i> Parallel }
                  @else if (step.stepType === 'subprocess') { <i class="material-icons">layers</i> Sub-Prozess }
                </div>
              }

              <!-- Main step row -->
              <div class="step-row" [class.selected]="step.id === svc.selectedStep()?.id" [class.not-in-context]="!svc.isStepLinkedToContext(step.id)"
                   [class.decision]="step.stepType === 'decision'" [class.parallel-step]="step.stepType === 'parallel'" [class.subprocess-step]="step.stepType === 'subprocess'"
                   (click)="svc.selectStep(step.id)">
                <div class="step-status-col">
                  <div class="status-icon" [class]="step.status">
                    @if (step.stepType === 'decision') {
                      <svg width="20" height="20" viewBox="0 0 20 20"><polygon points="10,1 19,10 10,19 1,10" fill="none" stroke="#f59e0b" stroke-width="1.5"/><text x="10" y="14" text-anchor="middle" font-size="10" fill="#f59e0b">?</text></svg>
                    } @else if (step.status === 'completed') {
                      <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#3f971a"/><path d="M6 10l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
                    } @else if (step.status === 'in-progress') {
                      <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#009fe3" stroke-width="2"/><circle cx="10" cy="10" r="4" fill="#009fe3"/></svg>
                    } @else {
                      <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#bdbdbd" stroke-width="2"/></svg>
                    }
                  </div>
                  @if (!last) {
                    <div class="connector-line" [class]="step.status"></div>
                  }
                </div>
                <div class="step-content">
                  <div class="step-title-row">
                    <span class="step-number">{{ step.number }}</span>
                    <span class="step-title">{{ step.title }}</span>
                  </div>
                  <div class="step-meta">
                    @if (step.completedDate) {
                      <span class="meta-item">&#128197; {{ step.completedDate }}</span>
                    } @else if (step.dueDate) {
                      <span class="meta-item due">&#128197; Fällig {{ step.dueDate }}</span>
                    }
                    <span class="meta-item">&#128100; {{ step.responsible }}</span>
                  </div>
                  @if (svc.getContextsForStep(step.id).length > 1 || !svc.isStepLinkedToContext(step.id)) {
                    <div class="step-contexts">
                      @for (ctx of svc.getContextsForStep(step.id); track ctx.id) {
                        <span class="context-badge" [class]="ctx.type">
                          @if (ctx.type === 'sitzung') { &#128197; } @else { &#128193; }
                          {{ ctx.number }}
                        </span>
                      }
                    </div>
                  }
                </div>
                <div class="step-status-label" [class]="step.status">
                  {{ statusLabel(step.status) }}
                </div>
              </div>

              <!-- Branches (for decision steps) -->
              @if (step.stepType === 'decision' && step.branches?.length && !step.collapsed) {
                <div class="branches-container">
                  @for (branch of step.branches; track branch.id) {
                    <div class="branch-line">
                      <div class="branch-connector"></div>
                      <span class="branch-label" [class.loop-back]="isLoopBack(step, branch)">
                        @if (isLoopBack(step, branch)) { &#8634; }
                        {{ branch.label }}
                      </span>
                      <span class="branch-target">&#8594; {{ getStepTitle(branch.targetStepIds[0]) }}</span>
                    </div>
                  }
                </div>
              }

              <!-- Parallel paths -->
              @if (step.stepType === 'parallel' && step.parallelPaths?.length && !step.collapsed) {
                <div class="parallel-container">
                  <div class="parallel-bar start">&#9552; parallel start</div>
                  <div class="parallel-paths">
                    @for (path of step.parallelPaths; track $index) {
                      <div class="parallel-path">
                        @for (ps of path; track ps.id) {
                          <div class="parallel-step-card" [class]="ps.status" (click)="svc.selectStep(step.id)">
                            <div class="ps-status-dot" [class]="ps.status"></div>
                            <div class="ps-info">
                              <span class="ps-title">{{ ps.title }}</span>
                              <span class="ps-responsible">{{ ps.responsible }}</span>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                  <div class="parallel-bar end">&#9552; parallel ende</div>
                </div>
              }

              <!-- Sub-steps (for subprocess) -->
              @if (step.stepType === 'subprocess' && step.subSteps?.length && !step.collapsed) {
                <div class="substeps-container">
                  @for (sub of step.subSteps; track sub.id; let subLast = $last) {
                    <div class="substep-row" [class]="sub.status">
                      <div class="substep-connector">
                        <div class="substep-dot" [class]="sub.status"></div>
                        @if (!subLast) { <div class="substep-line"></div> }
                      </div>
                      <div class="substep-info">
                        <span class="substep-title">{{ sub.title }}</span>
                        <span class="substep-responsible">{{ sub.responsible }}</span>
                      </div>
                      <span class="substep-status" [class]="sub.status">{{ statusLabel(sub.status) }}</span>
                    </div>
                  }
                </div>
              }

              <!-- Loop indicator -->
              @if (step.loopBackToStepId && !step.collapsed) {
                <div class="loop-indicator">
                  <span class="loop-arrow">&#8634;</span>
                  <span class="loop-text">Schleife: {{ step.loopCondition }}</span>
                </div>
              }

              <!-- Insert button -->
              @if (svc.canInsertAfter(step.id)) {
                <div class="insert-row">
                  <button class="insert-btn" title="Schritt einfügen" (click)="onInsert($event, step.id)">
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="#009fe3" stroke-width="1.5"/><path d="M8 4v8M4 8h8" stroke="#009fe3" stroke-width="1.5"/></svg>
                  </button>
                </div>
              }
            </ng-container>
          }
        </div>
      } @else {
        <!-- FLOWCHART DESIGNER -->
        <div class="fc-toolbar">
          <span class="fc-toolbar-label">Einfügen:</span>
          <button class="fc-tool-btn" draggable="true" (dragstart)="onToolDragStart($event, 'standard')">
            <i class="material-icons">radio_button_checked</i> Schritt
          </button>
          <button class="fc-tool-btn decision" draggable="true" (dragstart)="onToolDragStart($event, 'decision')">
            <i class="material-icons">call_split</i> Entscheidung
          </button>
          <button class="fc-tool-btn parallel" draggable="true" (dragstart)="onToolDragStart($event, 'parallel')">
            <i class="material-icons">sync</i> Parallel
          </button>
          <button class="fc-tool-btn subprocess" draggable="true" (dragstart)="onToolDragStart($event, 'subprocess')">
            <i class="material-icons">layers</i> Sub-Prozess
          </button>
        </div>

        <div class="flowchart">
          @for (step of svc.steps(); track step.id; let idx = $index; let last = $last) {
            <!-- Drop zone before each node -->
            <div class="fc-drop-zone" [class.drag-over]="dragOverIndex() === idx"
                 (dragover)="onDragOver($event, idx)" (dragleave)="onDragLeave()" (drop)="onDrop($event, idx)">
              <div class="fc-drop-indicator">
                <i class="material-icons">add_circle_outline</i> Hier einfügen
              </div>
            </div>

            <div class="fc-node-wrapper" draggable="true"
                 (dragstart)="onNodeDragStart($event, idx)" (dragend)="onNodeDragEnd()">
              <!-- Node -->
              <div class="fc-node" [class]="(step.stepType || 'standard') + ' ' + step.status"
                   [class.selected]="step.id === svc.selectedStep()?.id"
                   [class.not-in-context]="!svc.isStepLinkedToContext(step.id)"
                   (click)="svc.selectStep(step.id)">
                <div class="fc-node-icon" (click)="cycleStepType($event, step)">
                  @if (step.stepType === 'decision') { <i class="material-icons">call_split</i> }
                  @else if (step.stepType === 'parallel') { <i class="material-icons">sync</i> }
                  @else if (step.stepType === 'subprocess') { <i class="material-icons">layers</i> }
                  @else { <i class="material-icons">radio_button_checked</i> }
                </div>
                <div class="fc-node-body">
                  <span class="fc-node-number">{{ step.number }}</span>
                  <span class="fc-node-title">{{ step.title }}</span>
                </div>
                <div class="fc-node-status" [class]="step.status"></div>
                <button class="fc-node-delete" title="Schritt entfernen" (click)="deleteStep($event, step.id)">
                  <i class="material-icons">close</i>
                </button>
                <div class="fc-drag-handle" title="Verschieben">
                  <i class="material-icons">drag_indicator</i>
                </div>
              </div>

              <!-- Parallel expansion -->
              @if (step.stepType === 'parallel' && step.parallelPaths?.length) {
                <div class="fc-parallel">
                  @for (path of step.parallelPaths; track $index) {
                    @for (ps of path; track ps.id) {
                      <div class="fc-parallel-node" [class]="ps.status">
                        <span class="fc-pn-title">{{ ps.title }}</span>
                        <span class="fc-pn-status" [class]="ps.status"></span>
                      </div>
                    }
                  }
                </div>
              }

              <!-- Branches -->
              @if (step.stepType === 'decision' && step.branches?.length) {
                <div class="fc-branches">
                  @for (branch of step.branches; track branch.id) {
                    <div class="fc-branch" [class.loop-back]="isLoopBack(step, branch)">
                      <span class="fc-branch-label">{{ branch.label }}</span>
                      <i class="material-icons fc-branch-arrow">{{ isLoopBack(step, branch) ? 'undo' : 'arrow_forward' }}</i>
                      <span class="fc-branch-target">{{ getStepTitle(branch.targetStepIds[0]) }}</span>
                    </div>
                  }
                </div>
              }

              <!-- Sub-steps -->
              @if (step.stepType === 'subprocess' && step.subSteps?.length) {
                <div class="fc-substeps">
                  @for (sub of step.subSteps; track sub.id) {
                    <div class="fc-subnode" [class]="sub.status">{{ sub.title }}</div>
                  }
                </div>
              }

              <!-- Loop -->
              @if (step.loopBackToStepId) {
                <div class="fc-loop">
                  <i class="material-icons">replay</i> {{ step.loopCondition }}
                </div>
              }

              <!-- Arrow down -->
              @if (!last) {
                <div class="fc-arrow">
                  <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 4v14M6 14l6 6 6-6" stroke="#bdbdbd" stroke-width="1.5" fill="none"/></svg>
                </div>
              }
            </div>
          }

          <!-- Drop zone at end -->
          <div class="fc-drop-zone" [class.drag-over]="dragOverIndex() === svc.steps().length"
               (dragover)="onDragOver($event, svc.steps().length)" (dragleave)="onDragLeave()" (drop)="onDrop($event, svc.steps().length)">
            <div class="fc-drop-indicator">
              <i class="material-icons">add_circle_outline</i> Am Ende einfügen
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .overview {
      display: flex; flex-direction: column; height: 100%; overflow-y: auto;
      padding: 24px; min-width: 380px; max-width: 520px;
      border-right: 1px solid rgba(0,0,0,0.12); background: #ffffff;
    }
    .overview-title-row { display: flex; align-items: center; justify-content: space-between; }
    .overview-title-row h2 { margin: 0 0 4px; font-size: 1.375rem; font-weight: 400; color: #353c46; }
    .overview-sub { margin: 0 0 20px; font-size: 0.75rem; color: #6c7e93; }

    /* Toggle */
    .view-toggle { display: flex; border: 1px solid #bdbdbd; border-radius: 4px; overflow: hidden; }
    .toggle-btn {
      background: white; border: none; padding: 4px 8px; cursor: pointer; display: flex; align-items: center;
    }
    .toggle-btn .material-icons { font-size: 18px; color: #6c7e93; }
    .toggle-btn.active { background: #009fe3; }
    .toggle-btn.active .material-icons { color: white; }
    .toggle-btn:not(:last-child) { border-right: 1px solid #bdbdbd; }

    /* Progress */
    .progress-section { margin-bottom: 16px; }
    .progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; color: #586475; margin-bottom: 6px; }
    .progress-bar { height: 8px; background: #ebebed; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: #3f971a; border-radius: 4px; transition: width 0.3s; }
    .progress-legend { display: flex; gap: 12px; margin-top: 8px; font-size: 0.6875rem; color: #6c7e93; flex-wrap: wrap; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
    .dot.completed { background: #3f971a; } .dot.in-progress { background: #009fe3; } .dot.pending { background: #bdbdbd; }
    .dot-icon { margin-right: 2px; vertical-align: middle; }
    .context-progress-label { margin-top: 8px; } .context-bar { margin-top: 2px; } .context-fill { background: #009fe3; }

    /* Step type indicator */
    .step-type-indicator {
      display: flex; align-items: center; gap: 4px; font-size: 10px; text-transform: uppercase;
      font-weight: 500; padding: 2px 12px 2px 34px; color: #6c7e93;
    }
    .step-type-indicator .material-icons { font-size: 14px; }
    .step-type-indicator.decision { color: #f59e0b; }
    .step-type-indicator.parallel { color: #7c3aed; }
    .step-type-indicator.subprocess { color: #009fe3; }
    .collapse-btn {
      background: none; border: 1px solid currentColor; border-radius: 3px; padding: 0;
      cursor: pointer; color: inherit; display: flex; align-items: center;
    }
    .collapse-btn .material-icons { font-size: 14px; }

    /* Steps list */
    .steps-list { flex: 1; }
    .step-row {
      display: flex; align-items: flex-start; gap: 12px; padding: 10px 12px;
      cursor: pointer; border-radius: 8px; transition: background 0.15s;
    }
    .step-row:hover { background: #f4f5f6; }
    .step-row.selected { background: #e6f4fd; }
    .step-row.decision { border-left: 3px solid #f59e0b; }
    .step-row.parallel-step { border-left: 3px solid #7c3aed; }
    .step-row.subprocess-step { border-left: 3px solid #009fe3; }
    .step-row.not-in-context { opacity: 0.5; }
    .step-row.not-in-context:hover { opacity: 0.8; }
    .step-row.not-in-context.selected { opacity: 1; }

    .step-status-col { display: flex; flex-direction: column; align-items: center; min-width: 20px; }
    .connector-line { width: 2px; flex: 1; min-height: 20px; background: #bdbdbd; }
    .connector-line.completed { background: #3f971a; } .connector-line.in-progress { background: #009fe3; }

    .step-content { flex: 1; min-width: 0; }
    .step-title-row { display: flex; align-items: center; gap: 8px; }
    .step-number { font-size: 0.6875rem; background: #ebebed; color: #586475; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
    .step-title { font-size: 0.875rem; font-weight: 400; color: #353c46; }
    .step-meta { display: flex; gap: 12px; margin-top: 4px; font-size: 0.75rem; color: #6c7e93; flex-wrap: wrap; }
    .meta-item.due { color: #8c0909; }

    .step-status-label { font-size: 0.6875rem; white-space: nowrap; padding: 2px 10px; border-radius: 12px; margin-top: 2px; }
    .step-status-label.completed { color: #3f971a; background: #eef7ea; }
    .step-status-label.in-progress { color: #009fe3; background: #e6f4fd; }
    .step-status-label.pending { color: #6c7e93; background: #f4f5f6; }

    .step-contexts { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
    .context-badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; white-space: nowrap; }
    .context-badge.geschaeft { background: #e6f4fd; color: #009fe3; }
    .context-badge.sitzung { background: #f3e8ff; color: #7c3aed; }

    /* Branches */
    .branches-container { padding: 4px 0 8px 34px; }
    .branch-line { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 12px; }
    .branch-connector { width: 16px; height: 2px; background: #f59e0b; }
    .branch-label {
      background: #fef9e7; color: #92710c; padding: 1px 8px; border-radius: 8px;
      font-size: 11px; font-weight: 500; white-space: nowrap;
    }
    .branch-label.loop-back { background: #fce8e8; color: #8c0909; }
    .branch-target { color: #6c7e93; font-size: 11px; }

    /* Parallel */
    .parallel-container { padding: 4px 0 8px 20px; }
    .parallel-bar {
      font-size: 10px; color: #7c3aed; text-transform: uppercase; padding: 2px 0;
      border-top: 2px dashed #7c3aed; margin: 4px 0;
    }
    .parallel-bar.end { border-top: none; border-bottom: 2px dashed #7c3aed; }
    .parallel-paths { display: flex; gap: 8px; flex-wrap: wrap; }
    .parallel-path { flex: 1; min-width: 100px; }
    .parallel-step-card {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px;
      background: #f9f5ff; border: 1px solid #e0d4f5; border-radius: 6px; margin: 4px 0;
    }
    .ps-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .ps-status-dot.completed { background: #3f971a; }
    .ps-status-dot.in-progress { background: #009fe3; }
    .ps-status-dot.pending { background: #bdbdbd; }
    .ps-info { display: flex; flex-direction: column; }
    .ps-title { font-size: 12px; color: #353c46; }
    .ps-responsible { font-size: 10px; color: #6c7e93; }

    /* Sub-steps */
    .substeps-container { padding: 4px 0 8px 40px; border-left: 2px solid #009fe3; margin-left: 30px; }
    .substep-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; }
    .substep-connector { display: flex; flex-direction: column; align-items: center; min-width: 12px; }
    .substep-dot { width: 8px; height: 8px; border-radius: 50%; }
    .substep-dot.completed { background: #3f971a; } .substep-dot.in-progress { background: #009fe3; } .substep-dot.pending { background: #bdbdbd; }
    .substep-line { width: 2px; height: 12px; background: #e0e0e0; }
    .substep-info { flex: 1; }
    .substep-title { font-size: 12px; color: #353c46; display: block; }
    .substep-responsible { font-size: 10px; color: #6c7e93; }
    .substep-status { font-size: 10px; padding: 1px 6px; border-radius: 8px; }
    .substep-status.completed { background: #eef7ea; color: #3f971a; }
    .substep-status.in-progress { background: #e6f4fd; color: #009fe3; }
    .substep-status.pending { background: #f4f5f6; color: #6c7e93; }

    /* Loop */
    .loop-indicator {
      display: flex; align-items: center; gap: 6px; padding: 4px 12px 8px 34px;
    }
    .loop-arrow { font-size: 18px; color: #8c0909; }
    .loop-text { font-size: 11px; color: #8c0909; background: #fce8e8; padding: 2px 8px; border-radius: 8px; }

    .insert-row { display: flex; justify-content: flex-start; padding-left: 22px; height: 14px; }
    .insert-btn { background: none; border: none; cursor: pointer; opacity: 0; transition: opacity 0.2s; padding: 0; }
    .step-row:hover + .insert-row .insert-btn, .insert-row:hover .insert-btn { opacity: 1; }

    /* ===== FLOWCHART VIEW ===== */
    .flowchart { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 8px 0; }
    .fc-node-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; }
    .fc-node {
      display: flex; align-items: center; gap: 10px; padding: 10px 16px; min-width: 280px; max-width: 400px;
      background: white; border: 2px solid #bdbdbd; border-radius: 8px; cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .fc-node:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
    .fc-node.selected { border-color: #009fe3; box-shadow: 0 0 0 3px rgba(0,159,227,0.2); }
    .fc-node.not-in-context { opacity: 0.5; }
    .fc-node.decision { border-color: #f59e0b; border-radius: 4px; transform: none; }
    .fc-node.parallel { border-color: #7c3aed; border-style: dashed; }
    .fc-node.subprocess { border-color: #009fe3; border-width: 3px; }
    .fc-node.completed { border-color: #3f971a; }
    .fc-node.in-progress { border-color: #009fe3; }
    .fc-node-icon .material-icons { font-size: 20px; color: #6c7e93; }
    .fc-node.decision .fc-node-icon .material-icons { color: #f59e0b; }
    .fc-node.parallel .fc-node-icon .material-icons { color: #7c3aed; }
    .fc-node.subprocess .fc-node-icon .material-icons { color: #009fe3; }
    .fc-node-body { flex: 1; }
    .fc-node-number { font-size: 10px; color: #6c7e93; display: block; }
    .fc-node-title { font-size: 13px; color: #353c46; }
    .fc-node-status { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .fc-node-status.completed { background: #3f971a; }
    .fc-node-status.in-progress { background: #009fe3; }
    .fc-node-status.pending { background: #bdbdbd; }

    .fc-arrow { padding: 4px 0; }

    .fc-parallel {
      display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; padding: 4px 0;
    }
    .fc-parallel-node {
      padding: 6px 12px; background: #f9f5ff; border: 1px solid #e0d4f5;
      border-radius: 6px; font-size: 12px; text-align: center;
    }
    .fc-pn-title { color: #353c46; } .fc-pn-status { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-left: 4px; vertical-align: middle; }
    .fc-pn-status.completed { background: #3f971a; } .fc-pn-status.in-progress { background: #009fe3; } .fc-pn-status.pending { background: #bdbdbd; }

    .fc-branches { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; padding: 4px 0; }
    .fc-branch {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px;
      background: #fef9e7; border: 1px solid #dfbe28; border-radius: 6px; font-size: 11px;
    }
    .fc-branch.loop-back { background: #fce8e8; border-color: #e88; }
    .fc-branch-label { font-weight: 500; color: #92710c; }
    .fc-branch-arrow { font-size: 14px; color: #92710c; }
    .fc-branch-target { color: #6c7e93; }

    .fc-substeps {
      display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; padding: 4px 0;
    }
    .fc-subnode {
      padding: 4px 10px; background: #e6f4fd; border: 1px solid #b3dcf5;
      border-radius: 4px; font-size: 11px; color: #353c46;
    }
    .fc-subnode.completed { border-color: #3f971a; background: #eef7ea; }

    .fc-loop {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px;
      background: #fce8e8; border-radius: 6px; font-size: 11px; color: #8c0909;
    }
    .fc-loop .material-icons { font-size: 14px; }

    /* Designer toolbar */
    .fc-toolbar {
      display: flex; align-items: center; gap: 6px; padding: 8px 0 12px;
      border-bottom: 1px solid #ebebed; margin-bottom: 12px; flex-wrap: wrap;
    }
    .fc-toolbar-label { font-size: 11px; color: #6c7e93; text-transform: uppercase; }
    .fc-tool-btn {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px;
      background: white; border: 1px dashed #bdbdbd; border-radius: 6px;
      font-size: 11px; color: #586475; cursor: grab; font-family: inherit;
      transition: border-color 0.15s, background 0.15s;
    }
    .fc-tool-btn:hover { border-color: #009fe3; background: #e6f4fd; }
    .fc-tool-btn.decision { border-color: #f59e0b; }
    .fc-tool-btn.decision:hover { background: #fef9e7; }
    .fc-tool-btn.parallel { border-color: #7c3aed; }
    .fc-tool-btn.parallel:hover { background: #f9f5ff; }
    .fc-tool-btn.subprocess { border-color: #009fe3; }
    .fc-tool-btn .material-icons { font-size: 16px; }

    /* Drop zones */
    .fc-drop-zone {
      min-height: 4px; transition: min-height 0.2s, padding 0.2s;
      border-radius: 6px; display: flex; justify-content: center;
    }
    .fc-drop-zone.drag-over {
      min-height: 44px; background: #e6f4fd; border: 2px dashed #009fe3; padding: 8px;
    }
    .fc-drop-indicator {
      display: none; align-items: center; gap: 4px; font-size: 12px; color: #009fe3;
    }
    .fc-drop-zone.drag-over .fc-drop-indicator { display: flex; }
    .fc-drop-indicator .material-icons { font-size: 18px; }

    /* Node enhancements for designer */
    .fc-node { position: relative; }
    .fc-node-delete {
      position: absolute; top: -8px; right: -8px; width: 20px; height: 20px;
      background: #8c0909; color: white; border: 2px solid white; border-radius: 50%;
      display: none; align-items: center; justify-content: center; cursor: pointer; padding: 0;
    }
    .fc-node-delete .material-icons { font-size: 12px; }
    .fc-node:hover .fc-node-delete { display: flex; }
    .fc-drag-handle {
      position: absolute; left: -24px; top: 50%; transform: translateY(-50%);
      color: #bdbdbd; cursor: grab; display: none;
    }
    .fc-node:hover .fc-drag-handle { display: block; }
    .fc-drag-handle .material-icons { font-size: 18px; }
    .fc-node-icon { cursor: pointer; }
    .fc-node-icon:hover { opacity: 0.7; }
    .fc-node-wrapper { cursor: default; }
    .fc-node-wrapper[draggable="true"] { cursor: grab; }
  `,
})
export class ProcessOverviewComponent {
  svc = inject(ProcessService);
  viewMode = signal<'sequence' | 'flowchart'>('sequence');

  statusLabel(status: ProcessStep['status']): string {
    return { completed: 'Abgeschlossen', 'in-progress': 'In Bearbeitung', pending: 'Ausstehend' }[status];
  }

  onInsert(event: Event, afterId: string) {
    event.stopPropagation();
    this.svc.insertStepAfter(afterId);
  }

  toggleCollapse(event: Event, step: ProcessStep) {
    event.stopPropagation();
    step.collapsed = !step.collapsed;
  }

  getStepTitle(stepId: string): string {
    return this.svc.steps().find((s) => s.id === stepId)?.title ?? stepId;
  }

  isLoopBack(step: ProcessStep, branch: { targetStepIds: string[] }): boolean {
    const steps = this.svc.steps();
    const currentIdx = steps.findIndex((s) => s.id === step.id);
    const targetIdx = steps.findIndex((s) => s.id === branch.targetStepIds[0]);
    return targetIdx >= 0 && targetIdx <= currentIdx;
  }

  // --- Designer: Drag & Drop ---
  dragOverIndex = signal<number | null>(null);
  private dragSourceType: 'tool' | 'node' = 'tool';
  private dragStepType: StepType = 'standard';
  private dragNodeIndex = -1;

  onToolDragStart(event: DragEvent, type: StepType) {
    this.dragSourceType = 'tool';
    this.dragStepType = type;
    event.dataTransfer!.effectAllowed = 'copy';
  }

  onNodeDragStart(event: DragEvent, index: number) {
    this.dragSourceType = 'node';
    this.dragNodeIndex = index;
    event.dataTransfer!.effectAllowed = 'move';
  }

  onNodeDragEnd() {
    this.dragOverIndex.set(null);
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = this.dragSourceType === 'tool' ? 'copy' : 'move';
    this.dragOverIndex.set(index);
  }

  onDragLeave() {
    this.dragOverIndex.set(null);
  }

  onDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    this.dragOverIndex.set(null);

    if (this.dragSourceType === 'tool') {
      this.svc.insertStepAt(targetIndex, this.dragStepType);
    } else if (this.dragSourceType === 'node') {
      if (this.dragNodeIndex !== targetIndex && this.dragNodeIndex !== targetIndex - 1) {
        this.svc.moveStep(this.dragNodeIndex, targetIndex);
      }
    }
  }

  deleteStep(event: Event, stepId: string) {
    event.stopPropagation();
    this.svc.deleteStep(stepId);
  }

  cycleStepType(event: Event, step: ProcessStep) {
    event.stopPropagation();
    const types: (StepType | undefined)[] = [undefined, 'decision', 'parallel', 'subprocess'];
    const currentIdx = types.indexOf(step.stepType);
    const nextType = types[(currentIdx + 1) % types.length];
    this.svc.updateStepField(step.id, { stepType: nextType } as Partial<ProcessStep>);
  }
}
