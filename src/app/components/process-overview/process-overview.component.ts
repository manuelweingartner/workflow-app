import { Component, inject, signal, viewChild, ElementRef, HostListener } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ProcessService } from '../../services/process.service';
import { ProcessStep, GatewayType, StepType } from '../../models/process.model';

@Component({
  selector: 'app-process-overview',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div class="overview" [class.fullscreen]="fullscreen()" [class.template-mode]="svc.isTemplateMode()">
      <div class="overview-header">
        <div class="overview-title-row">
          <h2>Prozessübersicht</h2>
          <div class="header-controls">
            <div class="view-toggle">
              <button class="toggle-btn" [class.active]="viewMode() === 'simple'" (click)="viewMode.set('simple')" title="Einfache Ansicht">
                <i class="material-icons">format_list_bulleted</i>
              </button>
              <button class="toggle-btn" [class.active]="viewMode() === 'sequence'" (click)="viewMode.set('sequence')" title="Sequenz">
                <i class="material-icons">view_list</i>
              </button>
              <button class="toggle-btn" [class.active]="viewMode() === 'flowchart'" (click)="viewMode.set('flowchart')" title="Flowchart">
                <i class="material-icons">account_tree</i>
              </button>
            </div>
            <button class="fs-btn" (click)="fullscreen.set(!fullscreen())" [title]="fullscreen() ? 'Vollbild beenden' : 'Vollbild'">
              <i class="material-icons">{{ fullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</i>
            </button>
          </div>
        </div>
        @if (svc.activeProcess(); as proc) {
          <p class="overview-sub">{{ proc.title }} &mdash; &#128100; {{ proc.processOwner.name }}</p>
        }
      </div>

      <div class="progress-section">
        @if (svc.isTemplateMode()) {
          <!-- Template mode: no progress, just step count -->
          <div class="template-step-count">
            <i class="material-icons">account_tree</i>
            {{ svc.progress().total }} Schritte definiert
          </div>
          <div class="progress-legend">
            <span class="legend-item"><span class="dot-icon"><i class="material-icons" style="font-size:10px;color:#009fe3">bolt</i></span> Aktivität</span>
            <span class="legend-item"><span class="gw-dot decision"></span> Entscheidung</span>
            <span class="legend-item"><span class="gw-dot parallel"></span> Parallel</span>
            <span class="legend-item"><span class="gw-dot loop"></span> Schleife</span>
          </div>
        } @else {
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
            <span class="legend-item"><span class="dot-icon"><i class="material-icons" style="font-size:10px;color:#009fe3">bolt</i></span> Aktivität</span>
            <span class="legend-item"><span class="gw-dot decision"></span> Entscheidung</span>
            <span class="legend-item"><span class="gw-dot parallel"></span> Parallel</span>
            <span class="legend-item"><span class="gw-dot loop"></span> Schleife</span>
          </div>
        }
      </div>

    <!-- ===== RECURSIVE TEMPLATE: sequence lane steps ===== -->
    <ng-template #seqLaneSteps let-steps="steps" let-gwId="gwId" let-branchId="branchId" let-pathIdx="pathIdx" let-isLoop="isLoop">
      @for (bs of steps; track bs.id) {
        @if (bs.kind === 'gateway') {
          <!-- Nested gateway — same gw-section look as top-level, fills lane width -->
          <div class="gw-section nested" [class]="bs.gatewayType">
            <div class="gw-header" [class.selected]="bs.id === svc.selectedStep()?.id"
                 (click)="svc.selectStep(bs.id); $event.stopPropagation()">
              <span class="gw-type-tag" [class]="bs.gatewayType">
                @if (bs.gatewayType === 'decision') {
                  <svg width="10" height="10" viewBox="0 0 20 20"><polygon points="10,1 19,10 10,19 1,10" fill="currentColor"/></svg>
                  Entscheidung
                } @else if (bs.gatewayType === 'parallel') {
                  <i class="material-icons" style="font-size:10px;vertical-align:middle">fork_right</i> Parallel
                } @else {
                  <i class="material-icons" style="font-size:10px;vertical-align:middle">replay</i> Schleife
                }
              </span>
              @if (bs.title) { <span class="gw-title">{{ bs.title }}</span> }
              <button class="gw-collapse-btn" (click)="toggleCollapse($event, bs)">
                <i class="material-icons">{{ bs.collapsed ? 'expand_more' : 'expand_less' }}</i>
              </button>
            </div>
            @if (!bs.collapsed) {
              @if (bs.gatewayType === 'decision' && bs.branches?.length) {
                <div class="gw-lanes">
                  @for (sub of bs.branches; track sub.id) {
                    <div class="gw-lane decision"
                      [class.branch-chosen]="bs.chosenBranchId === sub.id"
                      [class.branch-unchosen]="bs.chosenBranchId && bs.chosenBranchId !== sub.id">
                      <div class="gw-lane-hdr">
                        <span class="gw-lane-label">{{ sub.label }}</span>
                        @if (bs.chosenBranchId === sub.id) {
                          <span class="chosen-badge"><i class="material-icons">check_circle</i> Gewählt</span>
                        }
                        @if (!bs.chosenBranchId) {
                          <button class="lane-add-btn" (click)="addNodeToBranch($event, bs.id, sub.id)" title="Hinzufügen">
                            <i class="material-icons">add</i>
                          </button>
                        }
                      </div>
                      @if (!sub.steps.length) { <div class="lane-empty">Kein Schritt</div> }
                      <ng-template [ngTemplateOutlet]="seqLaneSteps"
                        [ngTemplateOutletContext]="{ steps: sub.steps, gwId: bs.id, branchId: sub.id, pathIdx: null, isLoop: false }">
                      </ng-template>
                    </div>
                  }
                </div>
                <div class="gw-join-bar decision"></div>
              }
              @if (bs.gatewayType === 'parallel' && bs.parallelPaths?.length) {
                <div class="gw-lanes">
                  @for (sub of bs.parallelPaths; track $index; let pi = $index) {
                    <div class="gw-lane parallel">
                      <div class="gw-lane-hdr">
                        <span class="gw-lane-label">{{ bs.parallelPathLabels?.[pi] || 'Pfad ' + (pi + 1) }}</span>
                        <button class="lane-add-btn" (click)="addNodeToParallelPath($event, bs.id, pi)" title="Hinzufügen">
                          <i class="material-icons">add</i>
                        </button>
                      </div>
                      @if (!sub.length) { <div class="lane-empty">Kein Schritt</div> }
                      <ng-template [ngTemplateOutlet]="seqLaneSteps"
                        [ngTemplateOutletContext]="{ steps: sub, gwId: bs.id, branchId: null, pathIdx: pi, isLoop: false }">
                      </ng-template>
                    </div>
                  }
                </div>
                <div class="gw-join-bar parallel"></div>
              }
              @if (bs.gatewayType === 'loop') {
                <div class="loop-body-container">
                  <div class="loop-body-header">
                    <i class="material-icons">replay</i>
                    <span>{{ bs.loopCondition || 'Schleife' }}</span>
                    <button class="lane-add-btn" (click)="addNodeToLoopBody($event, bs.id)" title="Hinzufügen">
                      <i class="material-icons">add</i>
                    </button>
                  </div>
                  @if (!bs.loopBody?.length) { <div class="lane-empty">Schleifenkörper leer</div> }
                  <ng-template [ngTemplateOutlet]="seqLaneSteps"
                    [ngTemplateOutletContext]="{ steps: bs.loopBody ?? [], gwId: bs.id, branchId: null, pathIdx: null, isLoop: true }">
                  </ng-template>
                </div>
              }
            }
          </div>
        } @else {
          <!-- Full step-row style inside the lane -->
          <div class="swim-step" [class.selected]="bs.id === svc.selectedStep()?.id"
               [class.activity-step]="bs.stepType === 'activity'"
               (click)="svc.selectStep(bs.id); $event.stopPropagation()">
            <div class="swim-step-icon">
              @if (bs.stepType === 'activity') {
                <svg width="16" height="16" viewBox="0 0 20 20">
                  @if (!svc.isTemplateMode() && bs.status === 'completed') {
                    <circle cx="10" cy="10" r="9" fill="#3f971a"/><path d="M6 10l3 3 5-5" stroke="white" stroke-width="2" fill="none"/>
                  } @else if (!svc.isTemplateMode() && bs.status === 'in-progress') {
                    <circle cx="10" cy="10" r="9" fill="none" stroke="#009fe3" stroke-width="2" stroke-dasharray="4 2"/><circle cx="10" cy="10" r="4" fill="#009fe3"/>
                  } @else {
                    <circle cx="10" cy="10" r="9" fill="none" stroke="#bdbdbd" stroke-width="2" stroke-dasharray="4 2"/>
                  }
                </svg>
              } @else if (!svc.isTemplateMode() && bs.status === 'completed') {
                <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#3f971a"/><path d="M6 10l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
              } @else if (!svc.isTemplateMode() && bs.status === 'in-progress') {
                <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#009fe3" stroke-width="2"/><circle cx="10" cy="10" r="4" fill="#009fe3"/></svg>
              } @else {
                <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#bdbdbd" stroke-width="2"/></svg>
              }
            </div>
            <div class="swim-step-body">
              <div class="swim-step-title-row">
                @if (bs.number) { <span class="step-number">{{ bs.number }}</span> }
                <span class="swim-step-title">{{ bs.title }}</span>
                @if (bs.stepType === 'activity') {
                  <span class="step-type-chip activity"><i class="material-icons" style="font-size:9px">bolt</i></span>
                }
              </div>
              @if (bs.responsible) {
                <div class="swim-step-meta">&#128100; {{ bs.responsible }}</div>
              }
            </div>
            <span class="swim-step-status" [class]="bs.status">{{ statusLabel(bs.status) }}</span>
          </div>
        }
      }
    </ng-template>

    <!-- ===== RECURSIVE TEMPLATE: flowchart lane content ===== -->
    <ng-template #fcLaneContent let-steps="steps" let-gwId="gwId" let-branchId="branchId" let-pathIdx="pathIdx" let-isLoop="isLoop">
      <div class="fc-inner-drop" [class.active]="selectedTool()"
           (click)="onInnerSlotClick(0, gwId, branchId, pathIdx, isLoop)">
        <div class="fc-drop-line"></div>
        @if (selectedTool()) { <i class="material-icons fc-drop-plus">add</i> }
      </div>
      @for (bs of steps; track bs.id; let bsIdx = $index) {
        <div class="fc-inner-node" [class.selected]="bs.id === svc.selectedStep()?.id"
             [class.gateway]="bs.kind === 'gateway'"
             [class.decision]="bs.gatewayType === 'decision'"
             [class.parallel]="bs.gatewayType === 'parallel'"
             [class.loop]="bs.gatewayType === 'loop'"
             [class.activity]="bs.stepType === 'activity'"
             [class.completed]="bs.status === 'completed'"
             (click)="svc.selectStep(bs.id); $event.stopPropagation()">
          <div class="fc-inner-icon">
            @if (bs.kind === 'gateway') {
              @if (bs.gatewayType === 'decision') { <i class="material-icons">call_split</i> }
              @else if (bs.gatewayType === 'parallel') { <i class="material-icons">fork_right</i> }
              @else { <i class="material-icons">replay</i> }
            } @else {
              @if (bs.stepType === 'activity') { <i class="material-icons">bolt</i> }
              @else if (bs.stepType === 'subprocess') { <i class="material-icons">layers</i> }
              @else { <i class="material-icons">assignment</i> }
            }
          </div>
          <span class="fc-inner-title">{{ bs.title }}</span>
          @if (bs.kind === 'gateway') {
            <button class="gateway-collapse-btn" (click)="toggleCollapse($event, bs)">
              <i class="material-icons">{{ bs.collapsed ? 'expand_more' : 'expand_less' }}</i>
            </button>
          }
          <div class="fc-inner-status" [class]="bs.status"></div>
          <button class="fc-node-delete" title="Löschen" (click)="deleteStep($event, bs.id)">
            <i class="material-icons">close</i>
          </button>
        </div>
        @if (bs.kind === 'gateway' && !bs.collapsed) {
          @if (bs.gatewayType === 'decision' && bs.branches?.length) {
            <div class="fc-inner-lanes">
              @for (sub of bs.branches; track sub.id) {
                <div class="fc-inner-lane decision"
                  [class.branch-chosen]="bs.chosenBranchId === sub.id"
                  [class.branch-unchosen]="bs.chosenBranchId && bs.chosenBranchId !== sub.id">
                  <div class="fc-inner-lane-hdr">
                    <span>{{ sub.label }}</span>
                    @if (bs.chosenBranchId === sub.id) {
                      <span class="chosen-badge-fc"><i class="material-icons">check_circle</i></span>
                    }
                    @if (!bs.chosenBranchId) {
                      <button class="lane-add-btn" (click)="addNodeToBranch($event, bs.id, sub.id)" title="Hinzufügen">
                        <i class="material-icons">add</i>
                      </button>
                    }
                  </div>
                  <ng-template [ngTemplateOutlet]="fcLaneContent"
                    [ngTemplateOutletContext]="{ steps: sub.steps, gwId: bs.id, branchId: sub.id, pathIdx: null, isLoop: false }">
                  </ng-template>
                </div>
              }
            </div>
          }
          @if (bs.gatewayType === 'parallel' && bs.parallelPaths?.length) {
            <div class="fc-inner-lanes">
              @for (sub of bs.parallelPaths; track $index; let pi = $index) {
                <div class="fc-inner-lane parallel">
                  <div class="fc-inner-lane-hdr">
                    <span>{{ bs.parallelPathLabels?.[pi] || 'Pfad ' + (pi + 1) }}</span>
                    <button class="lane-add-btn" (click)="addNodeToParallelPath($event, bs.id, pi)" title="Hinzufügen">
                      <i class="material-icons">add</i>
                    </button>
                  </div>
                  <ng-template [ngTemplateOutlet]="fcLaneContent"
                    [ngTemplateOutletContext]="{ steps: sub, gwId: bs.id, branchId: null, pathIdx: pi, isLoop: false }">
                  </ng-template>
                </div>
              }
            </div>
          }
          @if (bs.gatewayType === 'loop') {
            <div class="fc-inner-loop-body">
              <div class="fc-inner-lane-hdr loop">
                <i class="material-icons">replay</i>
                <span>{{ bs.loopCondition || 'Schleife' }}</span>
                <button class="lane-add-btn" (click)="addNodeToLoopBody($event, bs.id)" title="Hinzufügen">
                  <i class="material-icons">add</i>
                </button>
              </div>
              <ng-template [ngTemplateOutlet]="fcLaneContent"
                [ngTemplateOutletContext]="{ steps: bs.loopBody ?? [], gwId: bs.id, branchId: null, pathIdx: null, isLoop: true }">
              </ng-template>
            </div>
          }
        }
        <div class="fc-inner-drop" [class.active]="selectedTool()"
             (click)="onInnerSlotClick(bsIdx + 1, gwId, branchId, pathIdx, isLoop)">
          <div class="fc-drop-line"></div>
          @if (selectedTool()) { <i class="material-icons fc-drop-plus">add</i> }
        </div>
      }
    </ng-template>

      @if (viewMode() === 'simple') {
        <!-- SIMPLE VIEW: flat step list, no control flow -->
        <div class="steps-list">
          @for (step of svc.allStepsFlat(); track step.id; let last = $last) {
            <div class="step-row"
                 [class.selected]="step.id === svc.selectedStep()?.id"
                 [class.not-in-context]="!svc.isStepLinkedToContext(step.id)"
                 [class.activity-step]="step.stepType === 'activity'"
                 (click)="svc.selectStep(step.id)">
              <div class="step-status-col">
                <div class="status-icon" [class]="step.status">
                  @if (step.stepType === 'activity') {
                    <svg width="20" height="20" viewBox="0 0 20 20">
                      @if (!svc.isTemplateMode() && step.status === 'completed') {
                        <circle cx="10" cy="10" r="9" fill="#3f971a"/>
                        <path d="M6 10l3 3 5-5" stroke="white" stroke-width="2" fill="none"/>
                      } @else if (!svc.isTemplateMode() && step.status === 'in-progress') {
                        <circle cx="10" cy="10" r="9" fill="none" stroke="#009fe3" stroke-width="2" stroke-dasharray="4 2"/>
                        <circle cx="10" cy="10" r="4" fill="#009fe3"/>
                      } @else {
                        <circle cx="10" cy="10" r="9" fill="none" stroke="#bdbdbd" stroke-width="2" stroke-dasharray="4 2"/>
                      }
                    </svg>
                  } @else if (!svc.isTemplateMode() && step.status === 'completed') {
                    <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#3f971a"/><path d="M6 10l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
                  } @else if (!svc.isTemplateMode() && step.status === 'in-progress') {
                    <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#009fe3" stroke-width="2"/><circle cx="10" cy="10" r="4" fill="#009fe3"/></svg>
                  } @else {
                    <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#bdbdbd" stroke-width="2"/></svg>
                  }
                </div>
                @if (!last) { <div class="connector-line" [class]="step.status"></div> }
              </div>
              <div class="step-content">
                <div class="step-title-row">
                  @if (step.number) { <span class="step-number">{{ step.number }}</span> }
                  <span class="step-title">{{ step.title }}</span>
                  @if (step.stepType === 'activity') {
                    <span class="step-type-chip activity">
                      <i class="material-icons" style="font-size:11px">bolt</i>
                      @if (step.activityKind === 'ai') { KI }
                      @else if (step.activityKind === 'object-creation') { Objekt }
                      @else if (step.activityKind === 'interface') { Schnittstelle }
                      @else if (step.activityKind === 'notification') { Benachrichtigung }
                      @else if (step.activityKind === 'document') { Dokument }
                      @else { Automatisch }
                    </span>
                  }
                </div>
                <div class="step-meta">
                  @if (step.completedDate) {
                    <span class="meta-item">&#128197; {{ step.completedDate }}</span>
                  } @else if (step.dueDate) {
                    <span class="meta-item due">&#128197; Fällig {{ step.dueDate }}</span>
                  }
                  @if (step.responsible) {
                    <span class="meta-item">&#128100; {{ step.responsible }}</span>
                  }
                </div>
              </div>
              <div class="step-status-label" [class]="step.status">
                {{ statusLabel(step.status) }}
              </div>
            </div>
          }
        </div>
      } @else if (viewMode() === 'sequence') {
        <!-- SEQUENCE VIEW -->
        <div class="steps-list">
          <!-- Start node -->
          <div class="se-node">
            <div class="step-status-col">
              <svg width="20" height="20" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="8" fill="none" stroke="#3f971a" stroke-width="2"/>
              </svg>
              <div class="connector-line completed"></div>
            </div>
            <span class="se-label">Start</span>
          </div>

          @for (step of svc.steps(); track step.id; let last = $last) {
            <ng-container>

              @if (step.kind === 'gateway') {
                <!-- ===== GATEWAY SECTION (branch-first, no box) ===== -->
                <div class="gw-section" [class]="step.gatewayType">
                  <!-- Thin header: type pill + title + collapse — not a hoverable box -->
                  <div class="gw-header" [class.selected]="step.id === svc.selectedStep()?.id"
                       (click)="svc.selectStep(step.id)">
                    <span class="gw-type-tag" [class]="step.gatewayType">
                      @if (step.gatewayType === 'decision') {
                        <svg width="12" height="12" viewBox="0 0 20 20" style="vertical-align:middle"><polygon points="10,1 19,10 10,19 1,10" fill="currentColor"/></svg>
                        Entscheidung
                      } @else if (step.gatewayType === 'parallel') {
                        <i class="material-icons" style="font-size:12px;vertical-align:middle">fork_right</i> Parallel
                      } @else {
                        <i class="material-icons" style="font-size:12px;vertical-align:middle">replay</i> Schleife
                      }
                    </span>
                    @if (step.title) { <span class="gw-title">{{ step.title }}</span> }
                    <button class="gw-collapse-btn" (click)="toggleCollapse($event, step)">
                      <i class="material-icons">{{ step.collapsed ? 'expand_more' : 'expand_less' }}</i>
                    </button>
                  </div>
                  @if (!step.collapsed) {
                    @if (step.gatewayType === 'decision' && step.branches?.length) {
                      <div class="gw-lanes">
                        @for (branch of step.branches; track branch.id) {
                          <div class="gw-lane decision"
                            [class.branch-chosen]="step.chosenBranchId === branch.id"
                            [class.branch-unchosen]="step.chosenBranchId && step.chosenBranchId !== branch.id">
                            <div class="gw-lane-hdr">
                              <span class="gw-lane-label">{{ branch.label }}</span>
                              @if (step.chosenBranchId === branch.id) {
                                <span class="chosen-badge"><i class="material-icons">check_circle</i> Gewählt</span>
                              }
                              @if (branch.condition) { <span class="gw-lane-cond">{{ branch.condition }}</span> }
                              @if (!step.chosenBranchId) {
                                <button class="lane-add-btn" (click)="addNodeToBranch($event, step.id, branch.id)" title="Hinzufügen">
                                  <i class="material-icons">add</i>
                                </button>
                              }
                            </div>
                            @if (!branch.steps.length) { <div class="lane-empty">Kein Schritt</div> }
                            <ng-template [ngTemplateOutlet]="seqLaneSteps"
                              [ngTemplateOutletContext]="{ steps: branch.steps, gwId: step.id, branchId: branch.id, pathIdx: null, isLoop: false }">
                            </ng-template>
                          </div>
                        }
                      </div>
                      <div class="gw-join-bar decision"></div>
                    }
                    @if (step.gatewayType === 'parallel' && step.parallelPaths?.length) {
                      <div class="gw-lanes">
                        @for (path of step.parallelPaths; track $index; let pi = $index) {
                          <div class="gw-lane parallel">
                            <div class="gw-lane-hdr">
                              <span class="gw-lane-label">{{ step.parallelPathLabels?.[pi] || 'Pfad ' + (pi + 1) }}</span>
                              <button class="lane-add-btn" (click)="addNodeToParallelPath($event, step.id, pi)" title="Hinzufügen">
                                <i class="material-icons">add</i>
                              </button>
                            </div>
                            @if (!path.length) { <div class="lane-empty">Kein Schritt</div> }
                            <ng-template [ngTemplateOutlet]="seqLaneSteps"
                              [ngTemplateOutletContext]="{ steps: path, gwId: step.id, branchId: null, pathIdx: pi, isLoop: false }">
                            </ng-template>
                          </div>
                        }
                      </div>
                      <div class="gw-join-bar parallel"></div>
                    }
                    @if (step.gatewayType === 'loop') {
                      <div class="loop-body-container">
                        <div class="loop-body-header">
                          <i class="material-icons">replay</i>
                          <span>{{ step.loopCondition || 'Schleife' }}</span>
                          <button class="lane-add-btn" (click)="addNodeToLoopBody($event, step.id)" title="Hinzufügen">
                            <i class="material-icons">add</i>
                          </button>
                        </div>
                        @if (!step.loopBody?.length) { <div class="lane-empty">Schleifenkörper leer</div> }
                        <ng-template [ngTemplateOutlet]="seqLaneSteps"
                          [ngTemplateOutletContext]="{ steps: step.loopBody ?? [], gwId: step.id, branchId: null, pathIdx: null, isLoop: true }">
                        </ng-template>
                        <div class="loop-back-arrow">&#8634; zurück zum Anfang</div>
                      </div>
                    }
                  }
                </div>

              } @else {
                <!-- ===== STEP NODE (actual work) ===== -->

                <!-- Sub-process header (collapsed sub-steps toggle) -->
                @if (step.stepType === 'subprocess') {
                  <div class="step-type-indicator subprocess">
                    <button class="collapse-btn" (click)="toggleCollapse($event, step)">
                      <i class="material-icons">{{ step.collapsed ? 'add' : 'remove' }}</i>
                    </button>
                    <i class="material-icons">layers</i> Sub-Prozess
                  </div>
                }

                <!-- Main step row -->
                <div class="step-row"
                     [class.selected]="step.id === svc.selectedStep()?.id"
                     [class.not-in-context]="!svc.isStepLinkedToContext(step.id)"
                     [class.subprocess-step]="step.stepType === 'subprocess'"
                     [class.activity-step]="step.stepType === 'activity'"
                     (click)="svc.selectStep(step.id)">
                  <div class="step-status-col">
                    <div class="status-icon" [class]="step.status">
                      @if (step.stepType === 'activity') {
                        <svg width="20" height="20" viewBox="0 0 20 20">
                          @if (!svc.isTemplateMode() && step.status === 'completed') {
                            <circle cx="10" cy="10" r="9" fill="#3f971a"/>
                            <path d="M6 10l3 3 5-5" stroke="white" stroke-width="2" fill="none"/>
                          } @else if (!svc.isTemplateMode() && step.status === 'in-progress') {
                            <circle cx="10" cy="10" r="9" fill="none" stroke="#009fe3" stroke-width="2" stroke-dasharray="4 2"/>
                            <circle cx="10" cy="10" r="4" fill="#009fe3"/>
                          } @else {
                            <circle cx="10" cy="10" r="9" fill="none" stroke="#bdbdbd" stroke-width="2" stroke-dasharray="4 2"/>
                          }
                        </svg>
                      } @else if (!svc.isTemplateMode() && step.status === 'completed') {
                        <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#3f971a"/><path d="M6 10l3 3 5-5" stroke="white" stroke-width="2" fill="none"/></svg>
                      } @else if (!svc.isTemplateMode() && step.status === 'in-progress') {
                        <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#009fe3" stroke-width="2"/><circle cx="10" cy="10" r="4" fill="#009fe3"/></svg>
                      } @else {
                        <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#bdbdbd" stroke-width="2"/></svg>
                      }
                    </div>
                    <div class="connector-line" [class]="step.status"></div>
                  </div>
                  <div class="step-content">
                    <div class="step-title-row">
                      @if (step.number) { <span class="step-number">{{ step.number }}</span> }
                      <span class="step-title">{{ step.title }}</span>
                      @if (step.stepType === 'activity') {
                        <span class="step-type-chip activity">
                          <i class="material-icons" style="font-size:11px">bolt</i>
                          @if (step.activityKind === 'ai') { KI }
                          @else if (step.activityKind === 'object-creation') { Objekt }
                          @else if (step.activityKind === 'interface') { Schnittstelle }
                          @else if (step.activityKind === 'notification') { Benachrichtigung }
                          @else if (step.activityKind === 'document') { Dokument }
                          @else { Automatisch }
                        </span>
                      }
                    </div>
                    <div class="step-meta">
                      @if (step.completedDate) {
                        <span class="meta-item">&#128197; {{ step.completedDate }}</span>
                      } @else if (step.dueDate) {
                        <span class="meta-item due">&#128197; Fällig {{ step.dueDate }}</span>
                      }
                      @if (step.responsible) {
                        <span class="meta-item">&#128100; {{ step.responsible }}</span>
                      }
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

                <!-- Sub-steps expansion (for subprocess) -->
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

                <!-- Insert button -->
                @if (svc.canInsertAfter(step.id)) {
                  <div class="insert-row">
                    <button class="insert-btn" title="Schritt einfügen" (click)="onInsert($event, step.id)">
                      <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="#009fe3" stroke-width="1.5"/><path d="M8 4v8M4 8h8" stroke="#009fe3" stroke-width="1.5"/></svg>
                    </button>
                  </div>
                }
              }
            </ng-container>
          }

          <!-- End node -->
          <div class="se-node">
            <div class="step-status-col">
              <svg width="20" height="20" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="9" fill="none" stroke="#353c46" stroke-width="3"/>
              </svg>
            </div>
            <span class="se-label">Ende</span>
          </div>
        </div>
      } @else {
        <!-- FLOWCHART DESIGNER -->
        <div class="fc-toolbar">
          <span class="fc-toolbar-label">Schritte:</span>
          <button class="fc-tool-btn task" [class.active]="selectedTool() === 'task'" (click)="selectTool('task')">
            <i class="material-icons">assignment</i> Aufgabe
          </button>
          <button class="fc-tool-btn activity" [class.active]="selectedTool() === 'activity'" (click)="selectTool('activity')">
            <i class="material-icons">bolt</i> Aktivität
          </button>
          <button class="fc-tool-btn subprocess" [class.active]="selectedTool() === 'subprocess'" (click)="selectTool('subprocess')">
            <i class="material-icons">layers</i> Sub-Prozess
          </button>
          <span class="fc-toolbar-divider"></span>
          <span class="fc-toolbar-label">Gateways:</span>
          <button class="fc-tool-btn decision" [class.active]="selectedTool() === 'decision'" (click)="selectTool('decision')">
            <i class="material-icons">call_split</i> Entscheidung
          </button>
          <button class="fc-tool-btn parallel" [class.active]="selectedTool() === 'parallel'" (click)="selectTool('parallel')">
            <i class="material-icons">fork_right</i> Parallel
          </button>
          <button class="fc-tool-btn loop" [class.active]="selectedTool() === 'loop'" (click)="selectTool('loop')">
            <i class="material-icons">replay</i> Schleife
          </button>
          @if (selectedTool()) {
            <button class="fc-tool-btn cancel" (click)="cancelTool()">
              <i class="material-icons">close</i> Abbrechen
            </button>
          }
        </div>

        @if (selectedTool()) {
          <div class="fc-mode-hint">
            <i class="material-icons">touch_app</i> Klicke auf <strong>+</strong> wo der neue Schritt eingefügt werden soll
          </div>
        }

        <div class="flowchart" #flowchartEl>
          <!-- Start node -->
          <div class="fc-se-node start">
            <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="#3f971a" stroke-width="2"/></svg>
            Start
          </div>
          <div class="fc-arrow-row">
            <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 4v14M6 14l6 6 6-6" stroke="#bdbdbd" stroke-width="1.5" fill="none"/></svg>
          </div>

          <!-- Drop zone at top -->
          <div class="fc-drop-zone" [class.active]="isDragging() || selectedTool()" [class.highlight]="dropTargetIndex() === 0"
               (mouseenter)="onDropZoneEnter(0)" (mouseleave)="onDropZoneLeave()" (click)="onSlotClick(0)">
            @if (selectedTool() && !isDragging()) { <i class="material-icons fc-drop-plus">add_circle</i> }
            <div class="fc-drop-line"></div>
          </div>

          @for (step of svc.steps(); track step.id; let idx = $index; let last = $last) {
            <div class="fc-node-wrapper" [class.dragging]="dragSourceIndex() === idx">
              <div class="fc-node"
                   [class.gateway]="step.kind === 'gateway'"
                   [class.decision]="step.gatewayType === 'decision'"
                   [class.parallel]="step.gatewayType === 'parallel'"
                   [class.loop-gw]="step.gatewayType === 'loop'"
                   [class.task]="step.stepType === 'task'"
                   [class.activity]="step.stepType === 'activity'"
                   [class.subprocess]="step.stepType === 'subprocess'"
                   [class.completed]="step.status === 'completed'"
                   [class.in-progress]="step.status === 'in-progress'"
                   [class.selected]="step.id === svc.selectedStep()?.id"
                   [class.not-in-context]="!svc.isStepLinkedToContext(step.id)"
                   (click)="svc.selectStep(step.id)">
                <!-- Drag handle -->
                <div class="fc-drag-handle" (mousedown)="onDragStart($event, idx)">
                  <i class="material-icons">drag_indicator</i>
                </div>
                <div class="fc-node-icon" title="Typ wechseln" (click)="cycleNodeType($event, step)">
                  @if (step.kind === 'gateway') {
                    @if (step.gatewayType === 'decision') { <i class="material-icons">call_split</i> }
                    @else if (step.gatewayType === 'parallel') { <i class="material-icons">fork_right</i> }
                    @else if (step.gatewayType === 'loop') { <i class="material-icons">replay</i> }
                  } @else {
                    @if (step.stepType === 'activity') { <i class="material-icons">bolt</i> }
                    @else if (step.stepType === 'subprocess') { <i class="material-icons">layers</i> }
                    @else { <i class="material-icons">assignment</i> }
                  }
                </div>
                <div class="fc-node-body">
                  <span class="fc-node-number">{{ step.number }}</span>
                  <span class="fc-node-title">{{ step.title }}</span>
                </div>
                <div class="fc-node-status" [class]="step.status"></div>
                @if (step.kind === 'gateway') {
                  <button class="fc-node-collapse" title="Auf-/Zuklappen" (click)="toggleCollapse($event, step)">
                    <i class="material-icons">{{ step.collapsed ? 'expand_more' : 'expand_less' }}</i>
                  </button>
                }
                <button class="fc-node-delete" title="Löschen" (click)="deleteStep($event, step.id)">
                  <i class="material-icons">close</i>
                </button>
              </div>

              <!-- Gateway expansion — lane columns -->
              @if (step.kind === 'gateway' && !step.collapsed) {
                @if (step.gatewayType === 'decision' && step.branches?.length) {
                  <div class="fc-gw-body">
                    <div class="fc-branch-lanes decision">
                      <div class="fc-lanes-row">
                        @for (branch of step.branches; track branch.id) {
                          <div class="fc-branch-lane decision">
                            <div class="fc-lane-hdr">
                              <div class="fc-lane-title-row">
                                <span class="fc-lane-label">{{ branch.label }}</span>
                                <button class="lane-add-btn" (click)="addNodeToBranch($event, step.id, branch.id)" title="Hinzufügen">
                                  <i class="material-icons">add</i>
                                </button>
                              </div>
                              @if (branch.condition) { <span class="fc-lane-cond">{{ branch.condition }}</span> }
                            </div>
                            <ng-template [ngTemplateOutlet]="fcLaneContent"
                              [ngTemplateOutletContext]="{ steps: branch.steps, gwId: step.id, branchId: branch.id, pathIdx: null, isLoop: false }">
                            </ng-template>
                          </div>
                        }
                      </div>
                      <div class="fc-lane-join decision"></div>
                    </div>
                  </div>
                }
                @if (step.gatewayType === 'parallel' && step.parallelPaths?.length) {
                  <div class="fc-gw-body">
                    <div class="fc-branch-lanes parallel">
                      <div class="fc-lanes-row">
                        @for (path of step.parallelPaths; track $index; let pi = $index) {
                          <div class="fc-branch-lane parallel">
                            <div class="fc-lane-hdr">
                              <div class="fc-lane-title-row">
                                <span class="fc-lane-label">{{ step.parallelPathLabels?.[pi] || 'Pfad ' + (pi + 1) }}</span>
                                <button class="lane-add-btn" (click)="addNodeToParallelPath($event, step.id, pi)" title="Hinzufügen">
                                  <i class="material-icons">add</i>
                                </button>
                              </div>
                            </div>
                            <ng-template [ngTemplateOutlet]="fcLaneContent"
                              [ngTemplateOutletContext]="{ steps: path, gwId: step.id, branchId: null, pathIdx: pi, isLoop: false }">
                            </ng-template>
                          </div>
                        }
                      </div>
                      <div class="fc-lane-join parallel"></div>
                    </div>
                  </div>
                }
                @if (step.gatewayType === 'loop') {
                  <div class="fc-loop-lane">
                    <div class="fc-lane-hdr loop">
                      <i class="material-icons">replay</i>
                      <span>{{ step.loopCondition || 'Schleife' }}</span>
                      <button class="lane-add-btn" (click)="addNodeToLoopBody($event, step.id)" title="Hinzufügen">
                        <i class="material-icons">add</i>
                      </button>
                    </div>
                    <ng-template [ngTemplateOutlet]="fcLaneContent"
                      [ngTemplateOutletContext]="{ steps: step.loopBody ?? [], gwId: step.id, branchId: null, pathIdx: null, isLoop: true }">
                    </ng-template>
                  </div>
                }
              }
              @if (step.stepType === 'subprocess' && step.subSteps?.length) {
                <div class="fc-substeps">
                  @for (sub of step.subSteps; track sub.id) {
                    <div class="fc-subnode" [class]="sub.status">{{ sub.title }}</div>
                  }
                </div>
              }

              <!-- Arrow + drop zone -->
              <div class="fc-arrow-row">
                <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 4v14M6 14l6 6 6-6" stroke="#bdbdbd" stroke-width="1.5" fill="none"/></svg>
              </div>
              <div class="fc-drop-zone" [class.active]="isDragging() || selectedTool()" [class.highlight]="dropTargetIndex() === idx + 1"
                   (mouseenter)="onDropZoneEnter(idx + 1)" (mouseleave)="onDropZoneLeave()" (click)="onSlotClick(idx + 1)">
                @if (selectedTool() && !isDragging()) { <i class="material-icons fc-drop-plus">add_circle</i> }
                <div class="fc-drop-line"></div>
              </div>
            </div>
          }

          <!-- End node -->
          <div class="fc-se-node end">
            <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#353c46" stroke-width="3"/></svg>
            Ende
          </div>
        </div>

        <!-- Drag ghost -->
        @if (isDragging()) {
          <div class="fc-ghost" [style.top.px]="ghostY()" [style.left.px]="ghostX()">
            <i class="material-icons">drag_indicator</i>
            {{ svc.steps()[dragSourceIndex()!].title }}
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; flex-shrink: 0; }
    .overview {
      display: flex; flex-direction: column; height: 100%; overflow-y: auto;
      padding: 24px; min-width: 0; width: 100%;
      border-right: 1px solid rgba(0,0,0,0.12); background: #ffffff;
    }
    .overview-title-row { display: flex; align-items: center; justify-content: space-between; }
    .overview-title-row h2 { margin: 0 0 4px; font-size: 1.375rem; font-weight: 400; color: #353c46; }
    .overview-sub { margin: 0 0 20px; font-size: 0.75rem; color: #6c7e93; }

    /* Fullscreen */
    .overview.fullscreen {
      position: fixed; inset: 0; z-index: 999;
      width: 100vw !important; height: 100vh;
      border-right: none; border-radius: 0;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.12);
    }

    /* Header controls row */
    .header-controls { display: flex; align-items: center; gap: 6px; }
    .fs-btn {
      background: none; border: 1px solid #bdbdbd; border-radius: 4px;
      padding: 4px 5px; cursor: pointer; display: flex; align-items: center;
    }
    .fs-btn:hover { background: #f4f5f6; }
    .fs-btn .material-icons { font-size: 18px; color: #6c7e93; }

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

    /* Start / End nodes — sequence view */
    .se-node { display: flex; align-items: flex-start; gap: 12px; padding: 4px 12px; }
    .se-label {
      font-size: 11px; font-weight: 600; color: #6c7e93;
      text-transform: uppercase; letter-spacing: 0.06em; padding-top: 2px;
    }
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

    /* ===== Gateway sections — Swimlane design ===== */

    /* Outer wrapper: full width, minimal margin */
    .gw-section { margin: 2px 0; }

    /* Thin header: type pill + title + collapse — NOT a box, just a labeled separator */
    .gw-header {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 12px; cursor: pointer;
    }
    .gw-header:hover { background: rgba(0,0,0,0.02); }
    .gw-header.selected { background: #e6f4fd; }

    /* Nested gateway header: even more compact */
    .gw-section.nested .gw-header { padding: 3px 6px; }

    /* Colored type pill */
    .gw-type-tag {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; padding: 2px 8px; border-radius: 10px; white-space: nowrap;
    }
    .gw-type-tag.decision { background: #fef3c7; color: #92710c; }
    .gw-type-tag.parallel { background: #ede9fe; color: #6d28d9; }
    .gw-type-tag.loop { background: #ffedd5; color: #c2410c; }

    /* Optional title */
    .gw-title { font-size: 0.8125rem; color: #586475; flex: 1; }

    /* Collapse button */
    .gw-collapse-btn {
      background: none; border: none; cursor: pointer; padding: 0;
      display: flex; align-items: center; color: #bdbdbd; margin-left: auto;
    }
    .gw-collapse-btn:hover { color: #586475; }
    .gw-collapse-btn .material-icons { font-size: 18px; }
    .gw-section.nested .gw-collapse-btn .material-icons { font-size: 14px; }

    /* Swimlane table: column headers + content side by side, no gap between columns */
    .gw-lanes {
      display: flex; border: 1px solid #e0e0e0; border-radius: 6px;
      overflow-x: auto; margin: 0 12px 4px;
    }
    .gw-section.nested .gw-lanes { margin: 0 0 3px; }

    /* Individual lane column */
    .gw-lane {
      flex: 1; min-width: 160px; display: flex; flex-direction: column;
      border-right: 1px solid #e0e0e0;
    }
    .gw-lane:last-child { border-right: none; }
    .gw-lane.decision { background: #fffdf5; }
    .gw-lane.parallel { background: #fdfbff; }
    /* Nested lanes: smaller min-width so deep nesting stays usable */
    .gw-section.nested .gw-lane { min-width: 130px; }

    /* Column header (branch label row) */
    .gw-lane-hdr {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 8px; border-bottom: 1px solid #e0e0e0; font-size: 11px;
    }
    .gw-lane.decision .gw-lane-hdr { background: #fef9e7; }
    .gw-lane.parallel .gw-lane-hdr { background: #f5f0ff; }
    .gw-lane-label { font-weight: 600; flex: 1; }
    .gw-lane-cond { font-size: 10px; color: #6c7e93; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Join bar */
    .gw-join-bar { height: 2px; margin: 0 12px 4px; }
    .gw-join-bar.decision { background: #f59e0b; }
    .gw-join-bar.parallel { background: #7c3aed; }
    .gw-section.nested .gw-join-bar { margin: 0 0 2px; }

    /* Branch chosen/unchosen highlighting */
    .gw-lane.branch-chosen { background: #f0fdf4 !important; border-left: 3px solid #3f971a; }
    .gw-lane.branch-chosen .gw-lane-hdr { background: #dcfce7 !important; }
    .gw-lane.branch-unchosen { opacity: 0.38; pointer-events: none; }
    .chosen-badge {
      display: inline-flex; align-items: center; gap: 2px;
      font-size: 10px; color: #3f971a; font-weight: 600;
      background: #dcfce7; border-radius: 10px; padding: 1px 6px;
    }
    .chosen-badge .material-icons { font-size: 12px; }
    .fc-inner-lane.branch-chosen { background: #f0fdf4 !important; border-left: 3px solid #3f971a; }
    .fc-inner-lane.branch-chosen .fc-inner-lane-hdr { background: #dcfce7 !important; color: #3f971a !important; }
    .fc-inner-lane.branch-unchosen { opacity: 0.38; pointer-events: none; }
    .chosen-badge-fc {
      display: inline-flex; align-items: center; color: #3f971a;
    }
    .chosen-badge-fc .material-icons { font-size: 14px; }

    /* Shared helpers */
    .lane-add-btn { background: none; border: 1px dashed currentColor; border-radius: 4px; cursor: pointer; padding: 1px 3px; line-height: 1; margin-left: auto; flex-shrink: 0; opacity: 0.6; }
    .lane-add-btn:hover { opacity: 1; }
    .lane-add-btn .material-icons { font-size: 13px; }
    .lane-empty { font-size: 11px; color: #bdbdbd; text-align: center; padding: 8px; }

    /* Steps inside swimlane columns — full step-row look */
    .swim-step {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px 8px; cursor: pointer;
      border-bottom: 1px solid rgba(0,0,0,0.05);
    }
    .swim-step:last-child { border-bottom: none; }
    .swim-step:hover { background: rgba(0,159,227,0.04); }
    .swim-step.selected { background: #e6f4fd; }
    .swim-step.activity-step { border-left: 2px solid #009fe3; }
    .swim-step-icon { flex-shrink: 0; margin-top: 1px; }
    .swim-step-body { flex: 1; min-width: 0; }
    .swim-step-title-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .swim-step-title { font-size: 12px; color: #353c46; word-break: break-word; }
    .swim-step-meta { font-size: 10px; color: #6c7e93; margin-top: 2px; }
    .swim-step-status {
      font-size: 10px; white-space: nowrap; padding: 2px 6px; border-radius: 8px;
      flex-shrink: 0; align-self: flex-start; margin-top: 2px;
    }
    .swim-step-status.completed { background: #eef7ea; color: #3f971a; }
    .swim-step-status.in-progress { background: #e6f4fd; color: #009fe3; }
    .swim-step-status.pending { background: #f4f5f6; color: #6c7e93; }

    /* Loop body */
    .loop-body-container { margin: 4px 12px; border-left: 3px solid #f97316; padding: 6px 10px; background: #fff7ed; border-radius: 0 6px 6px 0; }
    .gw-section.nested .loop-body-container { margin: 4px 0; }
    .loop-body-header { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #f97316; font-weight: 500; margin-bottom: 6px; }
    .loop-body-header .material-icons { font-size: 15px; }
    .loop-step-row { border-color: #fed7aa; }
    .loop-step-row:hover { border-color: #f97316; }
    .loop-back-arrow { font-size: 11px; color: #f97316; text-align: right; padding-top: 4px; font-style: italic; }

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
    .fc-node.completed { border-color: #3f971a; }
    .fc-node.in-progress { border-color: #009fe3; }
    .fc-node-icon .material-icons { font-size: 20px; color: #6c7e93; }
    .fc-node-body { flex: 1; }
    .fc-node-number { font-size: 10px; color: #6c7e93; display: block; }
    .fc-node-title { font-size: 13px; color: #353c46; }
    .fc-node-status { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .fc-node-status.completed { background: #3f971a; }
    .fc-node-status.in-progress { background: #009fe3; }
    .fc-node-status.pending { background: #bdbdbd; }

    .fc-arrow-row { display: flex; justify-content: center; padding: 2px 0; }
    .fc-arrow { padding: 4px 0; }

    /* Start / End nodes — flowchart view */
    .fc-se-node {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      border-radius: 20px; padding: 5px 18px; align-self: center;
      font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    }
    .fc-se-node.start { border: 2px solid #3f971a; color: #3f971a; background: #f0faf0; }
    .fc-se-node.end   { border: 3px solid #353c46; color: #353c46; background: #f4f5f6; }

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

    /* Legend gateway dots */
    .gw-dot {
      display: inline-block; width: 10px; height: 10px; border-radius: 2px;
      margin-right: 4px; vertical-align: middle; transform: rotate(45deg);
    }
    .gw-dot.decision { background: #f59e0b; }
    .gw-dot.parallel { background: #7c3aed; border-radius: 50%; transform: none; }
    .gw-dot.loop { background: #f97316; border-radius: 50%; transform: none; }

    /* Activity step row */
    .step-row.activity-step { border-left: 3px solid #009fe3; }
    .step-type-chip {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 10px; padding: 1px 6px; border-radius: 8px; white-space: nowrap;
    }
    .step-type-chip.activity { background: #e6f4fd; color: #009fe3; }

    /* Designer toolbar */
    .fc-toolbar {
      display: flex; align-items: center; gap: 6px; padding: 8px 0 12px;
      border-bottom: 1px solid #ebebed; margin-bottom: 8px; flex-wrap: wrap;
    }
    .fc-toolbar-label { font-size: 11px; color: #6c7e93; text-transform: uppercase; }
    .fc-toolbar-divider { width: 1px; height: 20px; background: #e0e0e0; margin: 0 4px; }
    .fc-tool-btn {
      display: flex; align-items: center; gap: 4px; padding: 5px 12px;
      background: white; border: 1px dashed #bdbdbd; border-radius: 6px;
      font-size: 11px; color: #586475; cursor: pointer; font-family: inherit;
      transition: all 0.15s;
    }
    .fc-tool-btn:hover { border-color: #009fe3; background: #e6f4fd; }
    .fc-tool-btn.active { border-style: solid; border-width: 2px; background: #e6f4fd; font-weight: 500; }
    .fc-tool-btn.task { border-color: #586475; }
    .fc-tool-btn.task.active { background: #f4f5f6; }
    .fc-tool-btn.activity { border-color: #009fe3; }
    .fc-tool-btn.activity.active { background: #e6f4fd; }
    .fc-tool-btn.decision { border-color: #f59e0b; }
    .fc-tool-btn.decision.active { background: #fef9e7; }
    .fc-tool-btn.parallel { border-color: #7c3aed; }
    .fc-tool-btn.parallel.active { background: #f9f5ff; }
    .fc-tool-btn.loop { border-color: #f97316; }
    .fc-tool-btn.loop.active { background: #fff7ed; }
    .fc-tool-btn.subprocess { border-color: #009fe3; }
    .fc-tool-btn.cancel { border-color: #8c0909; color: #8c0909; border-style: solid; }
    .fc-tool-btn .material-icons { font-size: 16px; }

    /* Flowchart node type variants */
    .fc-node.gateway { border-style: dashed; border-radius: 4px; }
    .fc-node.decision { border-color: #f59e0b; }
    .fc-node.decision .fc-node-icon .material-icons { color: #f59e0b; }
    .fc-node.parallel { border-color: #7c3aed; }
    .fc-node.parallel .fc-node-icon .material-icons { color: #7c3aed; }
    .fc-node.loop-gw { border-color: #f97316; }
    .fc-node.loop-gw .fc-node-icon .material-icons { color: #f97316; }
    .fc-node.activity { border-color: #009fe3; border-style: dashed; }
    .fc-node.activity .fc-node-icon .material-icons { color: #009fe3; }
    .fc-node.subprocess { border-color: #009fe3; border-width: 3px; }
    .fc-node.subprocess .fc-node-icon .material-icons { color: #009fe3; }

    /* Mode hint */
    .fc-mode-hint {
      display: flex; align-items: center; gap: 6px; padding: 6px 12px; margin-bottom: 8px;
      background: #e6f4fd; border-radius: 6px; font-size: 12px; color: #009fe3;
    }
    .fc-mode-hint .material-icons { font-size: 16px; }

    /* Drop zones between nodes */
    .fc-drop-zone {
      height: 8px; display: flex; align-items: center; justify-content: center;
      border-radius: 4px; transition: all 0.2s; cursor: default;
    }
    .fc-drop-zone.active { height: 24px; cursor: pointer; }
    .fc-drop-zone.active:hover, .fc-drop-zone.highlight {
      background: #e6f4fd;
    }
    .fc-drop-line {
      width: 80%; height: 3px; border-radius: 2px; background: transparent; transition: background 0.2s;
    }
    .fc-drop-plus { font-size: 20px; color: #bdbdbd; transition: color 0.15s; }
    .fc-drop-zone.active:hover .fc-drop-plus { color: #009fe3; }
    .fc-drop-zone.active:hover .fc-drop-line,
    .fc-drop-zone.highlight .fc-drop-line {
      background: #009fe3;
    }

    /* Node */
    .fc-node { position: relative; }
    .fc-node-wrapper.dragging { opacity: 0.3; }
    .fc-drag-handle {
      color: #bdbdbd; cursor: grab; display: flex; align-items: center;
      padding: 0 2px; transition: color 0.15s;
    }
    .fc-drag-handle:hover { color: #009fe3; }
    .fc-drag-handle:active { cursor: grabbing; }
    .fc-drag-handle .material-icons { font-size: 20px; }
    .fc-node-delete {
      position: absolute; top: -8px; right: -8px; width: 20px; height: 20px;
      background: #8c0909; color: white; border: 2px solid white; border-radius: 50%;
      display: none; align-items: center; justify-content: center; cursor: pointer; padding: 0;
    }
    .fc-node-delete .material-icons { font-size: 12px; }
    .fc-node:hover .fc-node-delete { display: flex; }
    .fc-node-icon { cursor: pointer; }
    .fc-node-icon:hover { opacity: 0.7; }

    /* Drag ghost */
    .fc-ghost {
      position: fixed; z-index: 9999; pointer-events: none;
      display: flex; align-items: center; gap: 6px;
      background: white; border: 2px solid #009fe3; border-radius: 8px;
      padding: 8px 14px; font-size: 13px; color: #353c46;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2); transform: translate(-50%, -50%);
    }
    .fc-ghost .material-icons { font-size: 16px; color: #009fe3; }

    /* ===== Flowchart branch lane columns — free-branch layout ===== */

    /* Scroll wrapper — full width, scrolls when branches overflow */
    .fc-gw-body { width: 100%; overflow-x: auto; }

    /* Top bar: flex column so join bar (child) always matches its width.
       min-width: 100% fills the panel; width: max-content grows for many branches. */
    .fc-branch-lanes {
      display: flex; flex-direction: column;
      min-width: 100%; width: max-content;
      border-top: 2px solid #e0e0e0;
      background: transparent;
    }
    .fc-branch-lanes.decision { border-top-color: #f59e0b; }
    .fc-branch-lanes.parallel { border-top-color: #7c3aed; }

    /* Row of branch columns inside the lanes container */
    .fc-lanes-row { display: flex; align-items: flex-start; }

    /* Branch column */
    .fc-branch-lane {
      flex: 1; min-width: 150px; display: flex; flex-direction: column;
      align-items: stretch; padding: 0 8px; position: relative;
      background: transparent; border: none;
    }

    /* Vertical leg from top bar down to branch header pill */
    .fc-branch-lane::before {
      content: ''; position: absolute;
      top: -2px; left: 50%; transform: translateX(-50%);
      width: 2px; height: 16px; background: #e0e0e0;
    }
    .fc-branch-lanes.decision .fc-branch-lane::before { background: #f59e0b; }
    .fc-branch-lanes.parallel .fc-branch-lane::before { background: #7c3aed; }

    /* Loop lane — keep bordered container (loop is conceptually different) */
    .fc-loop-lane {
      width: 100%; border: 1px solid #f97316; border-radius: 0 0 6px 6px;
      background: #fff7ed; overflow: hidden;
    }

    /* Branch header pill — column layout: title row on top, condition below */
    .fc-lane-hdr {
      display: flex; flex-direction: column; align-items: stretch;
      overflow: hidden;
      margin-top: 16px; margin-bottom: 8px;
      padding: 4px 10px; border-radius: 10px;
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .fc-branch-lane.decision .fc-lane-hdr {
      background: #fef3c7; color: #92710c; border: 1px solid rgba(245,158,11,0.4);
    }
    .fc-branch-lane.parallel .fc-lane-hdr {
      background: #ede9fe; color: #6d28d9; border: 1px solid rgba(124,58,237,0.3);
    }
    /* Loop header stays horizontal */
    .fc-lane-hdr.loop {
      flex-direction: row; align-items: center; gap: 4px;
      background: #fff7ed; color: #f97316; border-bottom: 1px solid #fed7aa;
    }
    /* Title row: label + add button side by side */
    .fc-lane-title-row { display: flex; align-items: center; gap: 4px; }
    .fc-lane-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* Condition — sits below the title, smaller and non-bold */
    .fc-lane-cond {
      display: block; margin-top: 2px;
      font-size: 9px; font-weight: 400; font-style: italic;
      text-transform: none; letter-spacing: 0;
      color: inherit; opacity: 0.7;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Bottom merge bar — flex column child of fc-branch-lanes, stretches to match width automatically */
    .fc-lane-join { height: 2px; margin-top: 4px; }
    .fc-lane-join.decision { background: #f59e0b; }
    .fc-lane-join.parallel { background: #7c3aed; }

    /* Inner nodes inside flowchart lane columns */
    .fc-inner-node {
      display: flex; align-items: center; gap: 5px; padding: 5px 8px;
      background: white; border: 1px solid #e0e0e0; border-radius: 6px;
      margin: 2px 6px; cursor: pointer; position: relative; font-size: 11px;
    }
    .fc-inner-node:hover { border-color: #009fe3; }
    .fc-inner-node.selected { border-color: #009fe3; background: #e6f4fd; }
    .fc-inner-node.gateway { border-style: dashed; }
    .fc-inner-node.decision { border-color: #f59e0b; }
    .fc-inner-node.parallel { border-color: #7c3aed; }
    .fc-inner-node.loop { border-color: #f97316; }
    .fc-inner-node.activity { border-color: #009fe3; }
    .fc-inner-node.completed { border-color: #3f971a; }
    .fc-inner-icon .material-icons { font-size: 13px; color: #6c7e93; }
    .fc-inner-node.decision .fc-inner-icon .material-icons { color: #f59e0b; }
    .fc-inner-node.parallel .fc-inner-icon .material-icons { color: #7c3aed; }
    .fc-inner-node.loop .fc-inner-icon .material-icons { color: #f97316; }
    .fc-inner-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fc-inner-status { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .fc-inner-status.completed { background: #3f971a; }
    .fc-inner-status.in-progress { background: #009fe3; }
    .fc-inner-status.pending { background: #bdbdbd; }
    .fc-inner-node .fc-node-delete { top: -6px; right: -6px; width: 16px; height: 16px; }
    .fc-inner-node .fc-node-delete .material-icons { font-size: 10px; }

    /* Inner drop zones within lane columns */
    .fc-inner-drop {
      height: 6px; display: flex; align-items: center; justify-content: center;
      cursor: default; margin: 0 4px; position: relative;
    }
    .fc-inner-drop.active { height: 18px; cursor: pointer; }
    .fc-inner-drop .fc-drop-line {
      flex: 1; height: 2px; background: transparent; transition: background 0.15s; border-radius: 1px;
    }
    .fc-inner-drop.active:hover .fc-drop-line { background: #009fe3; }
    .fc-inner-drop .fc-drop-plus { position: absolute; font-size: 12px; color: #009fe3; opacity: 0; }
    .fc-inner-drop.active:hover .fc-drop-plus { opacity: 1; }

    /* Nested lanes within flowchart inner lanes */
    .fc-inner-lanes {
      display: flex; margin: 2px 4px 4px; border: 1px solid #e0e0e0;
      border-radius: 4px; overflow: hidden;
    }
    .fc-inner-lane {
      flex: 1; min-width: 70px; display: flex; flex-direction: column;
      border-right: 1px solid #e0e0e0;
    }
    .fc-inner-lane:last-child { border-right: none; }
    .fc-inner-lane.decision { background: #fffbf0; }
    .fc-inner-lane.parallel { background: #faf8ff; }
    .fc-inner-lane-hdr {
      display: flex; align-items: center; gap: 3px; padding: 3px 5px;
      font-size: 10px; font-weight: 600; border-bottom: 1px solid #e0e0e0;
    }
    .fc-inner-lane.decision .fc-inner-lane-hdr { background: #fef9e7; color: #f59e0b; }
    .fc-inner-lane.parallel .fc-inner-lane-hdr { background: #f9f5ff; color: #7c3aed; }
    .fc-inner-lane-hdr.loop { color: #f97316; background: #fff7ed; border-bottom-color: #fed7aa; }
    .fc-inner-lane-hdr .material-icons { font-size: 11px; }
    .fc-inner-loop-body {
      margin: 2px 4px 4px; border-left: 2px solid #f97316; padding: 2px 4px;
      background: #fff7ed; border-radius: 0 3px 3px 0;
    }

    /* Gateway collapse button in flowchart node */
    .fc-node-collapse {
      background: none; border: none; cursor: pointer; padding: 1px;
      display: flex; align-items: center; color: #bdbdbd;
    }
    .fc-node-collapse:hover { color: #586475; }
    .fc-node-collapse .material-icons { font-size: 16px; }

    /* Template-step-count (header) */
    .template-step-count {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: #6c7e93; padding: 4px 0 8px;
    }
    .template-step-count .material-icons { font-size: 16px; }

    /* ============================================================
       TEMPLATE MODE — no execution state, only structure
       ============================================================ */
    /* Reset all step status dots to a neutral grey */
    /* Connector lines: no colour */
    .template-mode .connector-line.completed,
    .template-mode .connector-line.in-progress {
      background: #bdbdbd !important;
    }
    /* Status label: hide or neutral */
    .template-mode .step-status-label { display: none; }
    /* Flowchart node status dot: neutral */
    .template-mode .fc-node-status.completed,
    .template-mode .fc-node-status.in-progress { background: #bdbdbd !important; }
    /* Flowchart node: no completed highlight */
    .template-mode .fc-node.completed { border-color: #bdbdbd !important; background: #fff !important; }
    .template-mode .fc-node.in-progress { border-color: #bdbdbd !important; }
    /* Inner status dot */
    .template-mode .fc-inner-status.completed,
    .template-mode .fc-inner-status.in-progress { background: #bdbdbd !important; }
    /* Swimlane step status chip */
    .template-mode .swim-step-status { display: none; }
    /* Sub-step dots */
    .template-mode .substep-dot.completed,
    .template-mode .substep-dot.in-progress { background: #bdbdbd !important; }
    .template-mode .substep-status { display: none; }
  `,
})
export class ProcessOverviewComponent {
  svc = inject(ProcessService);
  viewMode = signal<'simple' | 'sequence' | 'flowchart'>('simple');
  fullscreen = signal(false);

  @HostListener('document:keydown.escape')
  onEscape() { if (this.fullscreen()) this.fullscreen.set(false); }

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

  // --- Lane add buttons (tool-aware) ---
  addNodeToBranch(event: Event, gatewayId: string, branchId: string) {
    event.stopPropagation();
    this.svc.insertStepIntoBranch(gatewayId, branchId, 999, this.selectedTool() ?? 'task');
    this.selectedTool.set(null);
  }

  addNodeToParallelPath(event: Event, gatewayId: string, pathIndex: number) {
    event.stopPropagation();
    this.svc.insertStepIntoParallelPath(gatewayId, pathIndex, 999, this.selectedTool() ?? 'task');
    this.selectedTool.set(null);
  }

  addNodeToLoopBody(event: Event, gatewayId: string) {
    event.stopPropagation();
    this.svc.insertStepIntoLoopBody(gatewayId, 999, this.selectedTool() ?? 'task');
    this.selectedTool.set(null);
  }

  onInnerSlotClick(atIndex: number, gwId: string | null, branchId: string | null, pathIdx: number | null, isLoop: boolean) {
    if (this.isDragging() || !gwId) return;
    const tool = this.selectedTool() ?? 'task';
    if (branchId) {
      this.svc.insertStepIntoBranch(gwId, branchId, atIndex, tool);
    } else if (pathIdx !== null) {
      this.svc.insertStepIntoParallelPath(gwId, pathIdx, atIndex, tool);
    } else if (isLoop) {
      this.svc.insertStepIntoLoopBody(gwId, atIndex, tool);
    }
    this.selectedTool.set(null);
  }

  // --- Designer: Toolbar (click to select, click + to place) ---
  selectedTool = signal<string | null>(null);

  selectTool(type: string) {
    this.selectedTool.set(this.selectedTool() === type ? null : type);
  }

  cancelTool() {
    this.selectedTool.set(null);
  }

  onSlotClick(targetIndex: number) {
    if (this.isDragging()) return;
    if (this.selectedTool()) {
      this.svc.insertStepAt(targetIndex, this.selectedTool()!);
      this.selectedTool.set(null);
    } else {
      this.svc.insertStepAt(targetIndex);
    }
  }

  deleteStep(event: Event, stepId: string) {
    event.stopPropagation();
    this.svc.deleteStep(stepId);
  }

  // --- Drag & Drop via pointer events + position-based drop detection ---
  isDragging = signal(false);
  dragSourceIndex = signal<number | null>(null);
  dropTargetIndex = signal<number | null>(null);
  ghostX = signal(0);
  ghostY = signal(0);
  flowchartEl = viewChild<ElementRef<HTMLElement>>('flowchartEl');
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: ((e: MouseEvent) => void) | null = null;

  onDragStart(event: MouseEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    this.dragSourceIndex.set(index);
    this.ghostX.set(event.clientX);
    this.ghostY.set(event.clientY);

    const startX = event.clientX;
    const startY = event.clientY;

    this.boundMouseMove = (e: MouseEvent) => {
      if (!this.isDragging()) {
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 5) {
          this.isDragging.set(true);
        }
        return;
      }
      this.ghostX.set(e.clientX);
      this.ghostY.set(e.clientY);
      this.detectDropTarget(e.clientY);
    };

    this.boundMouseUp = () => {
      document.removeEventListener('mousemove', this.boundMouseMove!);
      document.removeEventListener('mouseup', this.boundMouseUp!);

      if (this.isDragging() && this.dropTargetIndex() !== null) {
        const from = this.dragSourceIndex()!;
        const to = this.dropTargetIndex()!;
        if (from !== to && from !== to - 1) {
          this.svc.moveStep(from, to);
        }
      }

      this.isDragging.set(false);
      this.dragSourceIndex.set(null);
      this.dropTargetIndex.set(null);
    };

    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  private detectDropTarget(mouseY: number) {
    const el = this.flowchartEl()?.nativeElement;
    if (!el) return;
    const nodes = el.querySelectorAll('.fc-node-wrapper');
    let bestIndex = 0;

    for (let i = 0; i < nodes.length; i++) {
      const rect = nodes[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (mouseY > midY) bestIndex = i + 1;
    }
    this.dropTargetIndex.set(bestIndex);
  }

  onDropZoneEnter(_index: number) {}
  onDropZoneLeave() {}

  cycleNodeType(event: Event, step: ProcessStep) {
    event.stopPropagation();
    if (step.kind === 'gateway') {
      const types: GatewayType[] = ['decision', 'parallel', 'loop'];
      const currentIdx = types.indexOf(step.gatewayType ?? 'decision');
      const nextType = types[(currentIdx + 1) % types.length];
      this.svc.updateStepField(step.id, { gatewayType: nextType } as Partial<ProcessStep>);
    } else {
      const types: StepType[] = ['task', 'activity', 'subprocess'];
      const currentIdx = types.indexOf(step.stepType ?? 'task');
      const nextType = types[(currentIdx + 1) % types.length];
      this.svc.updateStepField(step.id, { stepType: nextType } as Partial<ProcessStep>);
    }
  }
}
