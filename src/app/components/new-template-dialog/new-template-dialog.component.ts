import { Component, Output, EventEmitter, inject, signal, computed } from '@angular/core';
import { ProcessService } from '../../services/process.service';
import { Process, ProcessStep, GatewayType } from '../../models/process.model';

type ToolType = 'task' | 'activity' | 'subprocess' | 'decision' | 'parallel' | 'loop';

@Component({
  selector: 'app-new-template-dialog',
  standalone: true,
  template: `
    <div class="overlay" (click)="closed.emit()"></div>

    <div class="dialog">
      <!-- Header -->
      <div class="dialog-header">
        <div class="dialog-title">
          <i class="material-icons header-icon">account_tree</i>
          Neue Prozess-Vorlage erstellen
        </div>
        <button class="close-btn" (click)="closed.emit()">
          <i class="material-icons">close</i>
        </button>
      </div>

      <!-- Step indicator -->
      <div class="step-indicator">
        <div class="step-item" [class.active]="currentStep() === 1" [class.done]="currentStep() > 1">
          <div class="step-circle">
            @if (currentStep() > 1) { <i class="material-icons">check</i> } @else { 1 }
          </div>
          <span class="step-label">Grunddaten</span>
        </div>
        <div class="step-line" [class.done]="currentStep() > 1"></div>
        <div class="step-item" [class.active]="currentStep() === 2">
          <div class="step-circle">2</div>
          <span class="step-label">Ablauf gestalten</span>
        </div>
      </div>

      <!-- Body -->
      <div class="dialog-body">

        <!-- STEP 1: Grunddaten -->
        @if (currentStep() === 1) {
          <div class="form-section">
            <label class="field-label">
              Prozess-Titel <span class="required">*</span>
            </label>
            <input
              class="field-input"
              type="text"
              [value]="title()"
              (input)="title.set($any($event.target).value)"
              placeholder="z.B. Baubewilligungsverfahren, Einbürgerung, ..."
              autofocus
            />
          </div>
          <div class="form-row">
            <div class="form-section">
              <label class="field-label">Verantwortliche Person</label>
              <input
                class="field-input"
                type="text"
                [value]="ownerName()"
                (input)="ownerName.set($any($event.target).value)"
                placeholder="Name"
              />
            </div>
            <div class="form-section">
              <label class="field-label">Rolle / Funktion</label>
              <input
                class="field-input"
                type="text"
                [value]="ownerRole()"
                (input)="ownerRole.set($any($event.target).value)"
                placeholder="z.B. Sachbearbeiterin"
              />
            </div>
          </div>
          <p class="hint-text">
            <i class="material-icons" style="font-size:14px;vertical-align:middle">info_outline</i>
            Im nächsten Schritt gestaltest du den Ablauf mit Schritten und Verzweigungen.
          </p>
        }

        <!-- STEP 2: Ablauf gestalten -->
        @if (currentStep() === 2) {
          <!-- Toolbar -->
          <div class="fc-toolbar">
            <span class="toolbar-label">Schritt-Typ:</span>
            @for (tool of tools; track tool.type) {
              <button
                class="tool-btn"
                [class.selected]="selectedTool() === tool.type"
                [style.--tool-color]="tool.color"
                (click)="selectedTool.set(tool.type)"
                [title]="tool.label"
              >
                <i class="material-icons">{{ tool.icon }}</i>
                <span>{{ tool.label }}</span>
              </button>
            }
          </div>
          <p class="hint-text" style="margin-bottom:8px">
            <i class="material-icons" style="font-size:14px;vertical-align:middle">touch_app</i>
            Typ wählen, dann <strong>+</strong> klicken zum Einfügen. Titel anklicken zum Umbenennen.
          </p>

          <!-- Canvas -->
          <div class="fc-canvas">
            <!-- Drop zone before first step -->
            <div class="drop-zone" (click)="insertStep(0)">
              <button class="drop-btn" title="Schritt einfügen">
                <i class="material-icons">add</i>
              </button>
            </div>

            @for (step of draftSteps(); track step.id; let i = $index) {
              <!-- Step card -->
              <div class="fc-node" [class.gateway-node]="step.kind === 'gateway'">
                <div
                  class="fc-step-card"
                  [style.border-color]="stepColor(step)"
                  [style.--step-color]="stepColor(step)"
                >
                  <div class="step-icon" [style.background]="stepColor(step)">
                    <i class="material-icons">{{ stepIcon(step) }}</i>
                  </div>
                  <div class="step-body">
                    <div class="step-type-label" [style.color]="stepColor(step)">
                      {{ stepTypeLabel(step) }}
                    </div>
                    @if (editingStepId() === step.id) {
                      <input
                        class="step-title-input"
                        type="text"
                        [value]="editingTitle()"
                        (input)="editingTitle.set($any($event.target).value)"
                        (blur)="commitEdit(step.id)"
                        (keydown.enter)="commitEdit(step.id)"
                        (keydown.escape)="editingStepId.set(null)"
                        #titleInput
                      />
                    } @else {
                      <div
                        class="step-title"
                        (click)="startEdit(step)"
                        title="Klicken zum Umbenennen"
                      >{{ step.title }}</div>
                    }
                    @if (step.kind === 'gateway' && step.branches) {
                      <div class="branch-labels">
                        @for (b of step.branches; track b.id) {
                          <span class="branch-chip">{{ b.label }}</span>
                        }
                      </div>
                    }
                    @if (step.kind === 'gateway' && step.parallelPathLabels) {
                      <div class="branch-labels">
                        @for (lbl of step.parallelPathLabels; track lbl) {
                          <span class="branch-chip">{{ lbl }}</span>
                        }
                      </div>
                    }
                    @if (step.kind === 'gateway' && step.gatewayType === 'loop') {
                      <div class="branch-labels">
                        <span class="branch-chip">Schleifenkörper</span>
                      </div>
                    }
                  </div>
                  <button
                    class="delete-btn"
                    (click)="deleteStep(step.id)"
                    title="Schritt entfernen"
                    [disabled]="draftSteps().length <= 1"
                  >
                    <i class="material-icons">close</i>
                  </button>
                </div>
              </div>

              <!-- Drop zone after each step -->
              <div class="drop-zone" (click)="insertStep(i + 1)">
                <button class="drop-btn" title="Schritt einfügen">
                  <i class="material-icons">add</i>
                </button>
              </div>
            }

            @if (draftSteps().length === 0) {
              <div class="empty-canvas">
                <i class="material-icons">add_circle_outline</i>
                <p>Klicke auf <strong>+</strong> oben, um den ersten Schritt hinzuzufügen</p>
              </div>
            }
          </div>
        }

      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        @if (currentStep() === 1) {
          <button class="btn-secondary" (click)="closed.emit()">Abbrechen</button>
          <button class="btn-primary" [disabled]="!canGoNext()" (click)="currentStep.set(2)">
            Weiter <i class="material-icons">arrow_forward</i>
          </button>
        } @else {
          <button class="btn-secondary" (click)="currentStep.set(1)">
            <i class="material-icons">arrow_back</i> Zurück
          </button>
          <button class="btn-primary" [disabled]="draftSteps().length === 0" (click)="createTemplate()">
            <i class="material-icons">check_circle_outline</i>
            Vorlage erstellen
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      z-index: 1000; backdrop-filter: blur(2px);
    }
    .dialog {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 1001; background: white; border-radius: 12px;
      width: 680px; max-width: 95vw; max-height: 90vh;
      display: flex; flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      overflow: hidden;
    }

    /* Header */
    .dialog-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 24px 14px; border-bottom: 1px solid #e8ecf0;
      background: #f8f9fb;
    }
    .dialog-title {
      display: flex; align-items: center; gap: 10px;
      font-size: 16px; font-weight: 500; color: #353c46;
    }
    .header-icon { color: #009fe3; font-size: 22px; }
    .close-btn {
      background: none; border: none; cursor: pointer; color: #8a9ab0;
      padding: 4px; border-radius: 4px; display: flex; align-items: center;
    }
    .close-btn:hover { background: #e8ecf0; color: #353c46; }

    /* Step indicator */
    .step-indicator {
      display: flex; align-items: center; padding: 14px 24px;
      border-bottom: 1px solid #e8ecf0; background: white;
    }
    .step-item { display: flex; align-items: center; gap: 8px; }
    .step-circle {
      width: 26px; height: 26px; border-radius: 50%;
      border: 2px solid #c8d4de; background: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; color: #8a9ab0;
      transition: all 0.2s;
    }
    .step-circle .material-icons { font-size: 14px; }
    .step-item.active .step-circle { border-color: #009fe3; background: #009fe3; color: white; }
    .step-item.done .step-circle { border-color: #3f971a; background: #3f971a; color: white; }
    .step-label { font-size: 13px; color: #8a9ab0; }
    .step-item.active .step-label { color: #009fe3; font-weight: 500; }
    .step-item.done .step-label { color: #3f971a; }
    .step-line {
      flex: 1; height: 2px; background: #e8ecf0; margin: 0 12px;
      transition: background 0.2s;
    }
    .step-line.done { background: #3f971a; }

    /* Body */
    .dialog-body {
      flex: 1; overflow-y: auto; padding: 20px 24px;
    }

    /* Step 1 form */
    .form-section { margin-bottom: 16px; }
    .form-row { display: flex; gap: 16px; }
    .form-row .form-section { flex: 1; }
    .field-label {
      display: block; font-size: 12px; font-weight: 500;
      color: #586475; margin-bottom: 5px; letter-spacing: 0.02em;
    }
    .required { color: #8c0909; }
    .field-input {
      width: 100%; box-sizing: border-box;
      padding: 9px 12px; border: 1.5px solid #d0d8e4;
      border-radius: 6px; font-size: 14px; font-family: inherit; color: #353c46;
      outline: none; transition: border-color 0.15s;
    }
    .field-input:focus { border-color: #009fe3; }

    /* Hint text */
    .hint-text {
      font-size: 12px; color: #8a9ab0; margin: 4px 0 0;
      display: flex; align-items: center; gap: 4px;
    }
    .hint-text .material-icons { flex-shrink: 0; }

    /* Toolbar */
    .fc-toolbar {
      display: flex; align-items: center; gap: 6px;
      margin-bottom: 10px; flex-wrap: wrap;
    }
    .toolbar-label { font-size: 12px; color: #8a9ab0; margin-right: 4px; white-space: nowrap; }
    .tool-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 10px; border-radius: 6px;
      border: 1.5px solid #d0d8e4; background: white;
      font-size: 12px; color: #586475; font-family: inherit;
      cursor: pointer; transition: all 0.15s;
    }
    .tool-btn .material-icons { font-size: 15px; }
    .tool-btn:hover { border-color: var(--tool-color); color: var(--tool-color); background: color-mix(in srgb, var(--tool-color) 6%, white); }
    .tool-btn.selected {
      border-color: var(--tool-color); background: color-mix(in srgb, var(--tool-color) 12%, white);
      color: var(--tool-color); font-weight: 500;
    }

    /* Canvas */
    .fc-canvas {
      display: flex; flex-direction: column; align-items: center;
      padding: 8px 0 4px; min-height: 120px;
    }

    /* Drop zone */
    .drop-zone {
      width: 100%; display: flex; justify-content: center;
      height: 28px; align-items: center;
      cursor: pointer;
    }
    .drop-btn {
      width: 24px; height: 24px; border-radius: 50%;
      border: 1.5px dashed #c8d4de; background: white;
      color: #c8d4de; display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.15s; padding: 0;
    }
    .drop-btn .material-icons { font-size: 16px; }
    .drop-zone:hover .drop-btn {
      border-color: #009fe3; color: #009fe3;
      background: #e8f5fb; transform: scale(1.15);
    }

    /* Flow nodes */
    .fc-node { width: 100%; display: flex; justify-content: center; }

    .fc-step-card {
      display: flex; align-items: center; gap: 0;
      border: 2px solid #009fe3; border-radius: 8px;
      background: white; width: 340px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.07);
      overflow: hidden;
      transition: box-shadow 0.15s;
    }
    .fc-step-card:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.12); }

    .gateway-node .fc-step-card {
      border-radius: 8px;
    }

    .step-icon {
      width: 40px; min-height: 44px; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .step-icon .material-icons { font-size: 18px; color: white; }

    .step-body {
      flex: 1; padding: 8px 10px; min-width: 0;
    }
    .step-type-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; margin-bottom: 2px;
    }
    .step-title {
      font-size: 13px; color: #353c46; cursor: text;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      padding: 2px 4px; border-radius: 3px; margin: -2px -4px;
      transition: background 0.1s;
    }
    .step-title:hover { background: #f0f4f8; }
    .step-title-input {
      font-size: 13px; color: #353c46; font-family: inherit;
      border: 1.5px solid #009fe3; border-radius: 3px;
      padding: 1px 4px; outline: none; width: 100%; box-sizing: border-box;
    }

    .branch-labels {
      display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;
    }
    .branch-chip {
      font-size: 10px; padding: 1px 6px; border-radius: 10px;
      background: #f0f4f8; color: #586475; border: 1px solid #d0d8e4;
    }

    .delete-btn {
      background: none; border: none; cursor: pointer;
      color: #c8d4de; padding: 8px 10px; display: flex; align-items: center;
      transition: color 0.15s; flex-shrink: 0;
    }
    .delete-btn:hover:not(:disabled) { color: #8c0909; }
    .delete-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .delete-btn .material-icons { font-size: 16px; }

    /* Empty canvas */
    .empty-canvas {
      display: flex; flex-direction: column; align-items: center;
      color: #c8d4de; padding: 24px; gap: 8px;
    }
    .empty-canvas .material-icons { font-size: 36px; }
    .empty-canvas p { font-size: 13px; text-align: center; margin: 0; }

    /* Footer */
    .dialog-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 24px; border-top: 1px solid #e8ecf0;
      background: #f8f9fb;
    }
    .btn-secondary {
      display: flex; align-items: center; gap: 4px;
      padding: 8px 16px; border-radius: 6px;
      border: 1.5px solid #d0d8e4; background: white;
      color: #586475; font-size: 13px; font-family: inherit;
      cursor: pointer; transition: background 0.15s;
    }
    .btn-secondary:hover { background: #f0f4f8; }
    .btn-primary {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 18px; border-radius: 6px;
      border: none; background: #009fe3;
      color: white; font-size: 13px; font-family: inherit;
      cursor: pointer; transition: background 0.15s, opacity 0.15s;
    }
    .btn-primary:hover:not(:disabled) { background: #0088c5; }
    .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary .material-icons, .btn-secondary .material-icons { font-size: 16px; }
  `],
})
export class NewTemplateDialogComponent {
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  svc = inject(ProcessService);

  currentStep = signal(1);

  title = signal('');
  ownerName = signal('');
  ownerRole = signal('');

  // Step 2 draft state
  draftSteps = signal<ProcessStep[]>([this.makeBlankStep('task')]);
  selectedTool = signal<ToolType>('task');
  editingStepId = signal<string | null>(null);
  editingTitle = signal('');

  canGoNext = computed(() => this.title().trim().length > 0);

  readonly tools: { type: ToolType; label: string; icon: string; color: string }[] = [
    { type: 'task',       label: 'Aufgabe',      icon: 'assignment',   color: '#009fe3' },
    { type: 'activity',   label: 'Aktivität',    icon: 'bolt',         color: '#0077b6' },
    { type: 'subprocess', label: 'Sub-Prozess',  icon: 'layers',       color: '#586475' },
    { type: 'decision',   label: 'Entscheidung', icon: 'call_split',   color: '#f59e0b' },
    { type: 'parallel',   label: 'Parallel',     icon: 'fork_right',   color: '#7c3aed' },
    { type: 'loop',       label: 'Schleife',     icon: 'replay',       color: '#7c3aed' },
  ];

  insertStep(index: number): void {
    const steps = [...this.draftSteps()];
    steps.splice(index, 0, this.makeBlankStep(this.selectedTool()));
    this.draftSteps.set(steps);
  }

  deleteStep(id: string): void {
    this.draftSteps.update((steps) => steps.filter((s) => s.id !== id));
  }

  startEdit(step: ProcessStep): void {
    this.editingStepId.set(step.id);
    this.editingTitle.set(step.title);
  }

  commitEdit(id: string): void {
    const newTitle = this.editingTitle().trim();
    this.draftSteps.update((steps) =>
      steps.map((s) => (s.id === id ? { ...s, title: newTitle || s.title } : s))
    );
    this.editingStepId.set(null);
  }

  createTemplate(): void {
    const newProcess: Process = {
      id: crypto.randomUUID(),
      title: this.title(),
      kind: 'template',
      processOwner: {
        name: this.ownerName() || 'Nicht zugewiesen',
        role: this.ownerRole(),
        email: '',
      },
      steps: this.draftSteps(),
    };
    this.svc.addProcess(newProcess);
    this.created.emit();
  }

  stepIcon(step: ProcessStep): string {
    if (step.kind === 'gateway') {
      return step.gatewayType === 'decision' ? 'call_split'
           : step.gatewayType === 'parallel' ? 'fork_right'
           : 'replay';
    }
    return step.stepType === 'activity'   ? 'bolt'
         : step.stepType === 'subprocess' ? 'layers'
         : 'assignment';
  }

  stepColor(step: ProcessStep): string {
    if (step.kind === 'gateway') {
      return step.gatewayType === 'decision' ? '#f59e0b' : '#7c3aed';
    }
    return step.stepType === 'subprocess' ? '#586475' : '#009fe3';
  }

  stepTypeLabel(step: ProcessStep): string {
    if (step.kind === 'gateway') {
      return step.gatewayType === 'decision' ? 'Entscheidung'
           : step.gatewayType === 'parallel' ? 'Parallele Ausführung'
           : 'Schleife';
    }
    return step.stepType === 'activity'   ? 'Aktivität'
         : step.stepType === 'subprocess' ? 'Sub-Prozess'
         : 'Aufgabe';
  }

  private makeBlankStep(toolType: ToolType): ProcessStep {
    const isGateway = toolType === 'decision' || toolType === 'parallel' || toolType === 'loop';
    return {
      id: crypto.randomUUID(),
      number: 'NEU',
      title: toolType === 'decision'   ? 'Entscheidung'
           : toolType === 'parallel'   ? 'Parallele Ausführung'
           : toolType === 'loop'       ? 'Schleife'
           : toolType === 'activity'   ? 'Neue Aktivität'
           : toolType === 'subprocess' ? 'Neuer Sub-Prozess'
           : 'Neue Aufgabe',
      status: 'pending',
      kind: isGateway ? 'gateway' : 'step',
      gatewayType: isGateway ? (toolType as GatewayType) : undefined,
      stepType: !isGateway
        ? (toolType === 'activity' ? 'activity' : toolType === 'subprocess' ? 'subprocess' : 'task')
        : undefined,
      responsible: '',
      category: 'Allgemein',
      contextLinks: [],
      tasks: [],
      inputs: [],
      actions: [],
      completionCriteria: [],
      conditionals: [],
      branches: toolType === 'decision' ? [
        { id: crypto.randomUUID(), label: 'Ja',   condition: '', steps: [] },
        { id: crypto.randomUUID(), label: 'Nein', condition: '', steps: [] },
      ] : undefined,
      parallelPaths: toolType === 'parallel' ? [[], []] : undefined,
      parallelPathLabels: toolType === 'parallel' ? ['Pfad 1', 'Pfad 2'] : undefined,
      loopBody:      toolType === 'loop' ? [] : undefined,
      loopCondition: toolType === 'loop' ? '' : undefined,
    };
  }
}
