import { Component, Output, EventEmitter, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProcessService } from '../../services/process.service';
import { Process, ProcessStep, Branch } from '../../models/process.model';

@Component({
  selector: 'app-ki-import-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="closed.emit()"></div>

    <div class="dialog">
      <!-- Header -->
      <div class="dialog-header">
        <div class="dialog-title">
          <img src="ki-plus-logo.webp" class="ki-logo" alt="KI+" />
          KI+ Workflow Import
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
          <span class="step-label">Eingabe</span>
        </div>
        <div class="step-line" [class.done]="currentStep() > 1"></div>
        <div class="step-item" [class.active]="currentStep() === 2" [class.done]="currentStep() > 2">
          <div class="step-circle">
            @if (currentStep() > 2) { <i class="material-icons">check</i> } @else { 2 }
          </div>
          <span class="step-label">Vorschau</span>
        </div>
        <div class="step-line" [class.done]="currentStep() > 2"></div>
        <div class="step-item" [class.active]="currentStep() === 3">
          <div class="step-circle">3</div>
          <span class="step-label">Konfigurieren</span>
        </div>
      </div>

      <!-- Body -->
      <div class="dialog-body">

        <!-- STEP 1: Eingabe -->
        @if (currentStep() === 1) {
          <div class="input-tabs">
            <button class="input-tab" [class.active]="activeInputTab() === 'text'" (click)="activeInputTab.set('text')">
              <i class="material-icons">description</i> Text / Beschreibung
            </button>
            <button class="input-tab" [class.active]="activeInputTab() === 'bpmn'" (click)="activeInputTab.set('bpmn')">
              <i class="material-icons">code</i> BPMN / XML
            </button>
          </div>

          @if (activeInputTab() === 'text') {
            <textarea
              class="main-textarea"
              [(ngModel)]="textInput"
              placeholder="Beschreibe deinen Prozess in natürlicher Sprache...&#10;&#10;Beispiel: «Baugesuchsprozess mit Vollständigkeitsprüfung, fachlicher Prüfung durch Fachstellen, öffentliche Auflage, Entscheid und Versand der Bewilligung»"
              rows="9"
            ></textarea>
            <p class="hint-text">
              <i class="material-icons" style="font-size:14px;vertical-align:middle">info_outline</i>
              Unterstützte Domänen: Baugesuch, Beschwerde, Rekrutierung, Rechnung, Vertrag — oder beliebige Freitextbeschreibung.
            </p>
          }

          @if (activeInputTab() === 'bpmn') {
            <div
              class="file-zone"
              [class.has-file]="fileName"
              (click)="fileInputEl.click()"
              (drop)="onDrop($event)"
              (dragover)="$event.preventDefault()"
              (dragenter)="$event.preventDefault()"
            >
              <i class="material-icons">{{ fileName ? 'insert_drive_file' : 'upload_file' }}</i>
              <span>{{ fileName || 'BPMN-Datei hierher ziehen oder klicken (.bpmn, .xml)' }}</span>
              <input #fileInputEl type="file" accept=".bpmn,.xml" style="display:none" (change)="onFileChange($event)" />
            </div>
            <textarea
              class="main-textarea bpmn-textarea"
              [(ngModel)]="bpmnInput"
              placeholder="...oder BPMN/XML hier direkt einfügen"
              rows="6"
            ></textarea>
          }
        }

        <!-- STEP 2: Vorschau -->
        @if (currentStep() === 2) {
          <div class="preview-header">
            <div class="preview-badge">
              <img src="ki-plus-logo.webp" class="ki-logo-sm" alt="KI+" />
              <span>KI+ hat <strong>{{ generatedSteps().length }} Schritte</strong> erkannt</span>
            </div>
            <span class="preview-source">aus: {{ activeInputTab() === 'bpmn' ? 'BPMN/XML' : 'Textbeschreibung' }}</span>
          </div>
          <div class="steps-preview-list">
            @for (step of generatedSteps(); track step.id) {
              <div class="preview-step-card" [class]="stepCardClass(step)">
                <div class="step-num">{{ $index + 1 }}</div>
                <i class="material-icons step-icon">{{ stepIcon(step) }}</i>
                <div class="step-info">
                  <span class="step-title">{{ step.title }}</span>
                  <span class="step-meta">{{ stepTypeLabel(step) }}</span>
                </div>
              </div>
            }
          </div>
          <p class="hint-text">
            <i class="material-icons" style="font-size:14px;vertical-align:middle">info_outline</i>
            Du kannst den Prozess nach dem Import in der Prozessübersicht weiter anpassen.
          </p>
        }

        <!-- STEP 3: Konfigurieren -->
        @if (currentStep() === 3) {
          <div class="field-group">
            <label class="field-label">Prozessname <span class="req">*</span></label>
            <input class="field-input" type="text" [(ngModel)]="configTitle" placeholder="z.B. Baugesuchsprozess Gemeinde Musterbach" />
          </div>
          <div class="field-row">
            <div class="field-group flex-1">
              <label class="field-label">Prozessverantwortliche:r</label>
              <input class="field-input" type="text" [(ngModel)]="configOwnerName" placeholder="Name" />
            </div>
            <div class="field-group flex-1">
              <label class="field-label">Rolle</label>
              <input class="field-input" type="text" [(ngModel)]="configOwnerRole" placeholder="z.B. Sachbearbeiterin" />
            </div>
          </div>
          <div class="field-group">
            <label class="field-label">Art des Prozesses</label>
            <div class="radio-row">
              <label class="radio-opt" [class.selected]="configKind === 'template'">
                <input type="radio" name="kind" value="template" [(ngModel)]="configKind" />
                <i class="material-icons">account_tree</i>
                <div>
                  <strong>Vorlage</strong>
                  <span>Wiederverwendbares Template</span>
                </div>
              </label>
              <label class="radio-opt" [class.selected]="configKind === 'instance'">
                <input type="radio" name="kind" value="instance" [(ngModel)]="configKind" />
                <i class="material-icons">play_circle</i>
                <div>
                  <strong>Instanz</strong>
                  <span>Laufender Prozessfall</span>
                </div>
              </label>
            </div>
          </div>
          <div class="import-summary">
            <i class="material-icons">summarize</i>
            <span>
              <strong>{{ generatedSteps().length }} Schritte</strong> werden als
              <strong>{{ configKind === 'template' ? 'Vorlage' : 'Instanz' }}</strong> importiert.
            </span>
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        @if (currentStep() > 1) {
          <button class="btn-back" (click)="prevStep()">
            <i class="material-icons">arrow_back</i> Zurück
          </button>
        }
        <button class="btn-cancel" (click)="closed.emit()">Abbrechen</button>
        <div class="footer-spacer"></div>

        @if (currentStep() < 3) {
          <button
            class="btn-primary"
            [disabled]="(currentStep() === 1 && !canProceedToStep2()) || isGenerating()"
            (click)="nextStep()"
          >
            @if (isGenerating()) {
              <span class="spinner"></span> KI analysiert...
            } @else if (currentStep() === 1) {
              <i class="material-icons">auto_awesome</i> KI analysieren
            } @else {
              <i class="material-icons">settings</i> Konfigurieren
            }
          </button>
        } @else {
          <button class="btn-primary" [disabled]="!canConfirm()" (click)="onImport()">
            <i class="material-icons">cloud_upload</i> Importieren
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000;
    }
    .dialog {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 1001; width: 640px; max-width: 96vw; max-height: 92vh;
      background: #fff; border-radius: 10px; box-shadow: 0 8px 40px rgba(0,0,0,0.22);
      display: flex; flex-direction: column; overflow: hidden;
    }

    /* Header */
    .dialog-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px;
      background: linear-gradient(135deg, #7c3aed, #009fe3);
      flex-shrink: 0;
    }
    .dialog-title {
      display: flex; align-items: center; gap: 10px;
      color: white; font-size: 15px; font-weight: 600;
    }
    .ki-logo { height: 22px; width: auto; }
    .ki-logo-sm { height: 16px; width: auto; }
    .close-btn {
      background: rgba(255,255,255,0.2); border: none; border-radius: 50%;
      width: 30px; height: 30px; cursor: pointer; color: white;
      display: flex; align-items: center; justify-content: center; transition: background 0.15s;
    }
    .close-btn:hover { background: rgba(255,255,255,0.35); }
    .close-btn .material-icons { font-size: 18px; }

    /* Step indicator */
    .step-indicator {
      display: flex; align-items: center; padding: 14px 24px;
      border-bottom: 1px solid #ebebed; flex-shrink: 0; background: #fafafa;
    }
    .step-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .step-circle {
      width: 30px; height: 30px; border-radius: 50%;
      background: #e8eaed; color: #6c7e93;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600; transition: all 0.2s;
    }
    .step-circle .material-icons { font-size: 16px; }
    .step-item.active .step-circle {
      background: linear-gradient(135deg, #7c3aed, #009fe3); color: white;
    }
    .step-item.done .step-circle { background: #3f971a; color: white; }
    .step-label { font-size: 11px; color: #6c7e93; white-space: nowrap; }
    .step-item.active .step-label { color: #7c3aed; font-weight: 500; }
    .step-item.done .step-label { color: #3f971a; }
    .step-line {
      flex: 1; height: 2px; background: #e0e0e0; margin: 0 8px; margin-bottom: 16px; transition: background 0.2s;
    }
    .step-line.done { background: #3f971a; }

    /* Body */
    .dialog-body {
      padding: 20px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 14px;
    }

    /* Input tabs */
    .input-tabs {
      display: flex; gap: 4px; border-bottom: 2px solid #ebebed; padding-bottom: 0;
    }
    .input-tab {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; border: none; background: none; cursor: pointer;
      font-size: 13px; color: #6c7e93; font-family: inherit;
      border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s;
    }
    .input-tab:hover { color: #7c3aed; background: #f4f0ff; border-radius: 6px 6px 0 0; }
    .input-tab.active { color: #7c3aed; font-weight: 500; border-bottom-color: #7c3aed; }
    .input-tab .material-icons { font-size: 16px; }

    /* Textarea */
    .main-textarea {
      width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px;
      font-size: 13px; font-family: inherit; resize: vertical; outline: none;
      line-height: 1.55; color: #353c46; box-sizing: border-box; transition: border-color 0.15s;
    }
    .main-textarea:focus { border-color: #7c3aed; box-shadow: 0 0 0 2px rgba(124,58,237,0.1); }
    .bpmn-textarea { margin-top: 8px; }

    /* File zone */
    .file-zone {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 20px; border: 2px dashed #d1d5db; border-radius: 8px;
      cursor: pointer; transition: all 0.2s; color: #6c7e93;
      background: #fafafa; text-align: center; font-size: 13px;
    }
    .file-zone:hover, .file-zone.has-file { border-color: #7c3aed; color: #7c3aed; background: #f9f5ff; }
    .file-zone .material-icons { font-size: 32px; }

    .hint-text {
      margin: 0; font-size: 12px; color: #8c96a3; display: flex; align-items: center; gap: 4px;
    }
    .hint-text .material-icons { color: #009fe3; }

    /* Preview */
    .preview-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; background: #f4f0ff; border-radius: 8px;
      border-left: 3px solid #7c3aed;
    }
    .preview-badge { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #353c46; }
    .preview-source { font-size: 11px; color: #8c96a3; }

    .steps-preview-list {
      display: flex; flex-direction: column; gap: 4px;
      max-height: 300px; overflow-y: auto;
    }
    .preview-step-card {
      display: flex; align-items: center; gap: 10px; padding: 8px 12px;
      background: white; border: 1px solid #e8eaed; border-radius: 6px;
      border-left: 3px solid #009fe3; font-size: 13px;
    }
    .preview-step-card.task { border-left-color: #009fe3; }
    .preview-step-card.activity { border-left-color: #f59e0b; }
    .preview-step-card.subprocess { border-left-color: #7c3aed; }
    .preview-step-card.decision { border-left-color: #f59e0b; }
    .preview-step-card.parallel { border-left-color: #7c3aed; }
    .preview-step-card.loop { border-left-color: #6c7e93; }
    .step-num {
      width: 22px; height: 22px; border-radius: 50%; background: #f0f0f0;
      font-size: 11px; font-weight: 600; color: #6c7e93;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .step-icon { font-size: 18px; color: #6c7e93; flex-shrink: 0; }
    .step-info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
    .step-title { font-weight: 500; color: #353c46; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .step-meta { font-size: 11px; color: #8c96a3; }

    /* Config fields */
    .field-group { display: flex; flex-direction: column; gap: 5px; }
    .field-row { display: flex; gap: 12px; }
    .flex-1 { flex: 1; }
    .field-label { font-size: 12px; font-weight: 500; color: #586475; }
    .req { color: #c0392b; }
    .field-input {
      padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px;
      font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.15s;
    }
    .field-input:focus { border-color: #009fe3; box-shadow: 0 0 0 2px rgba(0,159,227,0.12); }

    .radio-row { display: flex; gap: 10px; }
    .radio-opt {
      flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      border: 2px solid #e8eaed; border-radius: 8px; cursor: pointer;
      transition: all 0.15s;
    }
    .radio-opt:hover { border-color: #009fe3; background: #f0faff; }
    .radio-opt.selected { border-color: #009fe3; background: #f0faff; }
    .radio-opt input[type=radio] { display: none; }
    .radio-opt .material-icons { font-size: 22px; color: #6c7e93; flex-shrink: 0; }
    .radio-opt.selected .material-icons { color: #009fe3; }
    .radio-opt div { display: flex; flex-direction: column; gap: 1px; }
    .radio-opt strong { font-size: 13px; color: #353c46; }
    .radio-opt span { font-size: 11px; color: #8c96a3; }

    .import-summary {
      display: flex; align-items: center; gap: 8px; padding: 10px 14px;
      background: #f0fff4; border-left: 3px solid #3f971a; border-radius: 6px;
      font-size: 13px; color: #353c46;
    }
    .import-summary .material-icons { color: #3f971a; font-size: 20px; }

    /* Footer */
    .dialog-footer {
      display: flex; align-items: center; gap: 8px; padding: 14px 20px;
      border-top: 1px solid #ebebed; flex-shrink: 0; background: #fafafa;
    }
    .footer-spacer { flex: 1; }

    .btn-back {
      display: flex; align-items: center; gap: 4px; padding: 7px 14px;
      border: 1px solid #d1d5db; background: white; border-radius: 6px;
      font-size: 13px; color: #586475; cursor: pointer; font-family: inherit; transition: all 0.15s;
    }
    .btn-back:hover { background: #f4f5f6; }
    .btn-back .material-icons { font-size: 16px; }

    .btn-cancel {
      padding: 7px 16px; border: 1px solid #d1d5db; background: white;
      border-radius: 6px; font-size: 13px; color: #586475; cursor: pointer;
      font-family: inherit; transition: all 0.15s;
    }
    .btn-cancel:hover { background: #f4f5f6; }

    .btn-primary {
      display: flex; align-items: center; gap: 6px; padding: 8px 18px;
      background: linear-gradient(135deg, #7c3aed, #009fe3); color: white;
      border: none; border-radius: 6px; font-size: 13px; font-weight: 500;
      cursor: pointer; font-family: inherit; transition: opacity 0.15s, transform 0.15s;
    }
    .btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-primary .material-icons { font-size: 17px; }

    .spinner {
      width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4);
      border-top-color: white; border-radius: 50%;
      animation: spin 0.7s linear infinite; flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class KiImportDialogComponent {
  private svc = inject(ProcessService);

  @Output() closed = new EventEmitter<void>();
  @Output() imported = new EventEmitter<string>();

  // Wizard navigation
  currentStep = signal<1 | 2 | 3>(1);
  activeInputTab = signal<'text' | 'bpmn'>('text');
  isGenerating = signal(false);

  // Step 1 - plain properties for [(ngModel)]
  textInput = '';
  bpmnInput = '';
  fileName = '';

  // Step 2 - generated result
  generatedSteps = signal<ProcessStep[]>([]);
  generatedTitle = signal('');

  // Step 3 - configuration
  configTitle = '';
  configOwnerName = '';
  configOwnerRole = '';
  configKind: 'template' | 'instance' = 'template';

  canProceedToStep2(): boolean {
    return this.activeInputTab() === 'text'
      ? this.textInput.trim().length > 0
      : (this.bpmnInput.trim().length > 0 || this.fileName.length > 0);
  }
  canConfirm(): boolean { return this.configTitle.trim().length > 0; }

  // ---- Wizard navigation ----

  nextStep() {
    if (this.currentStep() === 1) {
      this.runAiGeneration();
    } else if (this.currentStep() === 2) {
      this.configTitle = this.configTitle || this.generatedTitle();
      this.currentStep.set(3);
    }
  }

  prevStep() {
    this.currentStep.update(s => (s - 1) as 1 | 2 | 3);
  }

  // ---- AI generation (simulated) ----

  private runAiGeneration() {
    this.isGenerating.set(true);
    const delay = 1400 + Math.random() * 800;
    setTimeout(() => {
      const content = this.activeInputTab() === 'bpmn' ? this.bpmnInput : this.textInput;
      const result = this.activeInputTab() === 'bpmn' && content.trim().startsWith('<')
        ? this.parseBpmn(content)
        : this.parseTextDescription(content);
      this.generatedSteps.set(result.steps);
      this.generatedTitle.set(result.title);
      this.isGenerating.set(false);
      this.currentStep.set(2);
    }, delay);
  }

  // ---- BPMN XML parsing ----

  private parseBpmn(xml: string): { steps: ProcessStep[]; title: string } {
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('parse error');
    } catch {
      return this.parseTextDescription(xml);
    }

    // Extract process title from <process name="...">
    const processEl = Array.from(doc.getElementsByTagName('*')).find(
      el => el.localName === 'process'
    );
    const title = processEl?.getAttribute('name') || 'Importierter Prozess';

    const steps: ProcessStep[] = [];
    let num = 1;
    const seen = new Set<string>();

    for (const el of Array.from(doc.getElementsByTagName('*'))) {
      const id = el.getAttribute('id') || '';
      if (seen.has(id)) continue;
      seen.add(id);
      const name = el.getAttribute('name') || el.getAttribute('id') || 'Unbenannt';

      switch (el.localName) {
        case 'startEvent':
          steps.push(this.makeBpmnStep(name || 'Start', num++, 'task', 'completed'));
          break;
        case 'endEvent':
          steps.push(this.makeBpmnStep(name || 'Ende', num++, 'task', 'pending'));
          break;
        case 'userTask':
        case 'manualTask':
          steps.push(this.makeBpmnStep(name, num++, 'task', 'pending'));
          break;
        case 'serviceTask':
        case 'scriptTask':
        case 'sendTask':
        case 'receiveTask':
        case 'businessRuleTask':
          steps.push(this.makeBpmnStep(name, num++, 'activity', 'pending'));
          break;
        case 'subProcess':
        case 'callActivity':
          steps.push(this.makeBpmnStep(name, num++, 'subprocess', 'pending'));
          break;
        case 'exclusiveGateway':
        case 'inclusiveGateway':
        case 'eventBasedGateway':
          steps.push(this.makeBpmnGateway(name || 'Entscheidung', num++, 'decision'));
          break;
        case 'parallelGateway':
          steps.push(this.makeBpmnGateway(name || 'Parallele Ausführung', num++, 'parallel'));
          break;
      }
    }

    return steps.length > 0 ? { steps, title } : this.parseTextDescription(xml);
  }

  // ---- Text / NLP parsing ----

  private parseTextDescription(text: string): { steps: ProcessStep[]; title: string } {
    const lower = text.toLowerCase();

    type StepDef = [string, string, ProcessStep['status']];
    const domains: Array<{ keywords: string[]; title: string; steps: StepDef[] }> = [
      {
        keywords: ['bau', 'baugesuch', 'baubewilligung', 'bewilligung'],
        title: 'Baugesuchsprozess',
        steps: [
          ['Gesuch eingegangen', 'task', 'completed'],
          ['Vollständigkeitsprüfung', 'task', 'in-progress'],
          ['Fachliche Prüfung', 'parallel', 'pending'],
          ['Öffentliche Auflage', 'task', 'pending'],
          ['Entscheid', 'decision', 'pending'],
          ['Bewilligung ausstellen', 'task', 'pending'],
          ['Versand & Archivierung', 'task', 'pending'],
        ],
      },
      {
        keywords: ['beschwerde', 'rekurs', 'einsprache'],
        title: 'Beschwerdeverfahren',
        steps: [
          ['Beschwerde erfassen', 'task', 'completed'],
          ['Triage & Zuweisung', 'task', 'completed'],
          ['Sachverhalt abklären', 'subprocess', 'in-progress'],
          ['Stellungnahme verfassen', 'task', 'pending'],
          ['Entscheid', 'decision', 'pending'],
          ['Antwort an Beschwerdeführer:in', 'task', 'pending'],
          ['Abschluss & Archivierung', 'task', 'pending'],
        ],
      },
      {
        keywords: ['anstellung', 'rekrutierung', 'stellen', 'personal', 'bewerbung'],
        title: 'Rekrutierungsprozess',
        steps: [
          ['Stellenausschreibung', 'task', 'completed'],
          ['Bewerbungen sichten', 'task', 'completed'],
          ['Interviews durchführen', 'parallel', 'pending'],
          ['Referenzen einholen', 'task', 'pending'],
          ['Entscheid', 'decision', 'pending'],
          ['Vertrag erstellen', 'task', 'pending'],
          ['Onboarding', 'subprocess', 'pending'],
        ],
      },
      {
        keywords: ['rechnung', 'zahlung', 'faktur', 'buchung', 'kredit'],
        title: 'Rechnungsverarbeitung',
        steps: [
          ['Rechnung eingegangen', 'task', 'completed'],
          ['Rechnungsprüfung', 'task', 'in-progress'],
          ['Freigabe', 'decision', 'pending'],
          ['Zahlung auslösen', 'activity', 'pending'],
          ['Buchung & Archivierung', 'task', 'pending'],
        ],
      },
      {
        keywords: ['vertrag', 'vertragsabschluss', 'beschaffung', 'offerte'],
        title: 'Vertragsprozess',
        steps: [
          ['Bedarfsermittlung', 'task', 'completed'],
          ['Offerten einholen', 'parallel', 'pending'],
          ['Angebotsprüfung', 'task', 'pending'],
          ['Entscheid', 'decision', 'pending'],
          ['Vertrag erstellen', 'task', 'pending'],
          ['Unterzeichnung', 'task', 'pending'],
          ['Archivierung', 'task', 'pending'],
        ],
      },
      {
        keywords: ['einbürgerung', 'einbürger', 'bürgerrecht'],
        title: 'Einbürgerungsverfahren',
        steps: [
          ['Gesuch eingereicht', 'task', 'completed'],
          ['Unterlagen prüfen', 'task', 'in-progress'],
          ['Sprach- & Integrationsnachweis', 'parallel', 'pending'],
          ['Anhörung', 'task', 'pending'],
          ['Entscheid Gemeinderat', 'decision', 'pending'],
          ['Kanton / Bund weiterleiten', 'task', 'pending'],
          ['Abschluss', 'task', 'pending'],
        ],
      },
    ];

    const matched = domains.find(d => d.keywords.some(k => lower.includes(k)));
    const guessedTitle = matched?.title ?? (text.split(/[.\n]/)[0]?.trim().slice(0, 60) || 'Importierter Prozess');

    const baseSteps: StepDef[] = matched?.steps ?? [
      ['Auslöser / Antrag', 'task', 'completed'],
      ['Prüfung', 'task', 'in-progress'],
      ['Bearbeitung', 'task', 'pending'],
      ['Entscheid', 'decision', 'pending'],
      ['Umsetzung', 'task', 'pending'],
      ['Abschluss', 'task', 'pending'],
    ];

    // Extra keywords that can augment any template
    const extras: Record<string, string> = {
      'benachrichtig': 'Benachrichtigung senden',
      'freigabe': 'Freigabe einholen',
      'qualitätsprüf': 'Qualitätsprüfung',
      'unterschrift': 'Unterschrift einholen',
      'stellungnahme': 'Stellungnahme einholen',
      'anhörung': 'Anhörung durchführen',
      'abnahme': 'Abnahme durchführen',
      'konsultation': 'Konsultation',
      'vernehmlassung': 'Vernehmlassung',
    };
    const extraDefs: StepDef[] = [];
    for (const [kw, title] of Object.entries(extras)) {
      if (lower.includes(kw) && !baseSteps.some(s => s[0].toLowerCase().includes(kw))) {
        extraDefs.push([title, 'task', 'pending']);
      }
    }
    // Insert extras before the last step
    const allDefs: StepDef[] = [...baseSteps];
    if (extraDefs.length > 0) allDefs.splice(allDefs.length - 1, 0, ...extraDefs);

    const steps: ProcessStep[] = allDefs.map((def, i) => {
      const [title, typeRaw, status] = def;
      if (typeRaw === 'decision' || typeRaw === 'parallel' || typeRaw === 'loop') {
        return this.makeBpmnGateway(title, i + 1, typeRaw as 'decision' | 'parallel');
      }
      return this.makeBpmnStep(title, i + 1, typeRaw as 'task' | 'activity' | 'subprocess', status);
    });

    return { steps, title: guessedTitle };
  }

  // ---- Step builder helpers ----

  private makeBpmnStep(
    title: string, num: number,
    stepType: 'task' | 'activity' | 'subprocess',
    status: ProcessStep['status']
  ): ProcessStep {
    return {
      id: crypto.randomUUID(), number: String(num), title,
      kind: 'step', stepType, status,
      responsible: '', category: 'Importiert',
      contextLinks: [], tasks: [], inputs: [], actions: [],
      completionCriteria: [], conditionals: [],
    };
  }

  private makeBpmnGateway(title: string, num: number, gatewayType: 'decision' | 'parallel'): ProcessStep {
    return {
      id: crypto.randomUUID(), number: String(num), title,
      kind: 'gateway', gatewayType, status: 'pending',
      responsible: '', category: 'Importiert',
      contextLinks: [], tasks: [], inputs: [], actions: [],
      completionCriteria: [], conditionals: [],
      ...(gatewayType === 'decision' ? {
        branches: [
          { id: crypto.randomUUID(), label: 'Ja', condition: '', steps: [] } as Branch,
          { id: crypto.randomUUID(), label: 'Nein', condition: '', steps: [] } as Branch,
        ],
      } : {
        parallelPaths: [[], []],
        parallelPathLabels: ['Pfad 1', 'Pfad 2'],
      }),
    };
  }

  // ---- File upload ----

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => { this.bpmnInput = (e.target?.result as string) ?? ''; };
    reader.readAsText(file);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => { this.bpmnInput = (e.target?.result as string) ?? ''; };
    reader.readAsText(file);
  }

  // ---- Import ----

  onImport() {
    if (!this.canConfirm()) return;
    const newProcess: Process = {
      id: `imported-${crypto.randomUUID().slice(0, 8)}`,
      title: this.configTitle.trim(),
      processOwner: {
        name: this.configOwnerName.trim() || 'Sachbearbeiter:in',
        ...(this.configOwnerRole.trim() ? { role: this.configOwnerRole.trim() } : {}),
      },
      steps: this.generatedSteps(),
      kind: this.configKind,
    };
    this.svc.addProcess(newProcess);
    this.imported.emit(newProcess.id);
    this.closed.emit();
  }

  // ---- Display helpers ----

  stepCardClass(step: ProcessStep): string {
    if (step.kind === 'gateway') return step.gatewayType ?? 'decision';
    return step.stepType ?? 'task';
  }

  stepIcon(step: ProcessStep): string {
    if (step.kind === 'gateway') {
      return { decision: 'call_split', parallel: 'sync', loop: 'loop' }[step.gatewayType!] ?? 'device_hub';
    }
    return { task: 'radio_button_checked', activity: 'bolt', subprocess: 'layers' }[step.stepType!] ?? 'radio_button_checked';
  }

  stepTypeLabel(step: ProcessStep): string {
    if (step.kind === 'gateway') {
      return { decision: 'Entscheidung', parallel: 'Parallel', loop: 'Schleife' }[step.gatewayType!] ?? 'Gateway';
    }
    return { task: 'Aufgabe', activity: 'Aktivität', subprocess: 'Sub-Prozess' }[step.stepType!] ?? 'Schritt';
  }
}
