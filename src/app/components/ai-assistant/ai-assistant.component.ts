import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProcessService } from '../../services/process.service';
import { Process, ProcessStep } from '../../models/process.model';

interface AiMessage {
  role: 'user' | 'ai';
  text: string;
  steps?: ProcessStep[];
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [FormsModule],
  template: `
    <!-- Toggle button -->
    <button class="ai-toggle" [class.open]="isOpen()" (click)="isOpen.set(!isOpen())">
      @if (isOpen()) { <i class="material-icons">close</i> } @else { <img src="ki-plus-logo.webp" class="ki-logo" alt="KI+" /> }
    </button>

    @if (isOpen()) {
      <div class="ai-panel">
        <div class="ai-header">
          <img src="ki-plus-logo.webp" class="ki-logo" alt="KI+" />
          <span>KI+ Workflow-Assistent</span>
        </div>

        <!-- Quick actions -->
        <div class="ai-actions">
          <button class="ai-action-btn" (click)="explainProcess()">
            <i class="material-icons">description</i> Prozess erklären
          </button>
          <button class="ai-action-btn" (click)="suggestNextStep()">
            <i class="material-icons">lightbulb</i> Schritt vorschlagen
          </button>
          <button class="ai-action-btn" (click)="analyzeProcess()">
            <i class="material-icons">analytics</i> Prozess analysieren
          </button>
        </div>

        <!-- Chat messages -->
        <div class="ai-messages">
          @for (msg of messages(); track $index) {
            <div class="ai-msg" [class]="msg.role">
              @if (msg.role === 'ai') {
                <div class="ai-avatar"><img src="ki-plus-logo.webp" class="ki-logo" alt="KI+" /></div>
              }
              <div class="ai-msg-content">
                <div class="ai-msg-text" [innerHTML]="msg.text"></div>
                @if (msg.steps?.length) {
                  <div class="ai-steps-preview">
                    @for (step of msg.steps; track step.id) {
                      <div class="ai-step-card" [class]="step.stepType || 'standard'">
                        <i class="material-icons">{{ stepIcon(step) }}</i>
                        <span>{{ step.title }}</span>
                      </div>
                    }
                    <button class="ai-apply-btn" (click)="applyGeneratedSteps(msg.steps!)">
                      <i class="material-icons">check</i> Prozess übernehmen
                    </button>
                  </div>
                }
              </div>
            </div>
          }
          @if (isTyping()) {
            <div class="ai-msg ai">
              <div class="ai-avatar"><img src="ki-plus-logo.webp" class="ki-logo" alt="KI+" /></div>
              <div class="ai-msg-content">
                <div class="ai-typing"><span></span><span></span><span></span></div>
              </div>
            </div>
          }
        </div>

        <!-- Input -->
        <div class="ai-input-row">
          <input type="text" [(ngModel)]="userInput" placeholder="Beschreibe einen Prozess oder stelle eine Frage..."
                 (keydown.enter)="sendMessage()" />
          <button class="ai-send-btn" (click)="sendMessage()" [disabled]="!userInput()">
            <i class="material-icons">send</i>
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host { position: fixed; bottom: 20px; right: 20px; z-index: 1000; }

    .ai-toggle {
      display: flex; align-items: center; gap: 6px; padding: 10px 16px;
      background: linear-gradient(135deg, #7c3aed, #009fe3); color: white; border: none;
      border-radius: 24px; cursor: pointer; font-size: 14px; font-family: inherit;
      box-shadow: 0 4px 16px rgba(124,58,237,0.4); transition: transform 0.2s, box-shadow 0.2s;
    }
    .ai-toggle:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(124,58,237,0.5); }
    .ai-toggle.open { border-radius: 50%; padding: 10px; }
    .ai-toggle .material-icons { font-size: 22px; }
    .ai-toggle .ki-logo { height: 22px; width: auto; }

    .ai-panel {
      position: absolute; bottom: 56px; right: 0; width: 420px; max-height: 600px;
      background: #ffffff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      display: flex; flex-direction: column; overflow: hidden;
    }

    .ai-header {
      display: flex; align-items: center; gap: 8px; padding: 14px 16px;
      background: linear-gradient(135deg, #7c3aed, #009fe3); color: white;
      font-size: 14px; font-weight: 500;
    }
    .ai-header-icon { font-size: 20px; }
    .ai-header .ki-logo { height: 20px; width: auto; }

    .ai-actions { display: flex; gap: 6px; padding: 10px 12px; border-bottom: 1px solid #ebebed; flex-wrap: wrap; }
    .ai-action-btn {
      display: flex; align-items: center; gap: 4px; padding: 5px 10px;
      background: #f9f5ff; border: 1px solid #e0d4f5; border-radius: 16px;
      font-size: 11px; color: #7c3aed; cursor: pointer; font-family: inherit;
      transition: background 0.15s;
    }
    .ai-action-btn:hover { background: #ede5ff; }
    .ai-action-btn .material-icons { font-size: 14px; }

    .ai-messages {
      flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px;
      min-height: 200px; max-height: 360px;
    }
    .ai-msg { display: flex; gap: 8px; }
    .ai-msg.user { justify-content: flex-end; }
    .ai-avatar {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #7c3aed, #009fe3); color: white;
      display: flex; align-items: center; justify-content: center;
    }
    .ai-avatar .material-icons { font-size: 16px; }
    .ai-avatar .ki-logo { height: 16px; width: auto; }
    .ai-msg-content { max-width: 85%; }
    .ai-msg-text {
      padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5;
    }
    .ai-msg.ai .ai-msg-text { background: #f4f5f6; color: #353c46; border-bottom-left-radius: 4px; }
    .ai-msg.user .ai-msg-text { background: #009fe3; color: white; border-bottom-right-radius: 4px; }

    .ai-steps-preview { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
    .ai-step-card {
      display: flex; align-items: center; gap: 6px; padding: 6px 10px;
      background: white; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 12px; color: #353c46;
    }
    .ai-step-card.decision { border-left: 3px solid #f59e0b; }
    .ai-step-card.parallel { border-left: 3px solid #7c3aed; }
    .ai-step-card.subprocess { border-left: 3px solid #009fe3; }
    .ai-step-card .material-icons { font-size: 16px; color: #6c7e93; }
    .ai-apply-btn {
      display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px;
      background: linear-gradient(135deg, #7c3aed, #009fe3); color: white; border: none;
      border-radius: 6px; font-size: 12px; cursor: pointer; font-family: inherit; margin-top: 4px;
    }
    .ai-apply-btn:hover { opacity: 0.9; }

    .ai-typing { display: flex; gap: 4px; padding: 8px 12px; }
    .ai-typing span {
      width: 6px; height: 6px; background: #7c3aed; border-radius: 50%;
      animation: typing 1.2s infinite;
    }
    .ai-typing span:nth-child(2) { animation-delay: 0.2s; }
    .ai-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing { 0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1); } }

    .ai-input-row { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #ebebed; }
    .ai-input-row input {
      flex: 1; padding: 8px 12px; border: 1px solid #bdbdbd; border-radius: 20px;
      font-size: 13px; font-family: inherit; outline: none;
    }
    .ai-input-row input:focus { border-color: #7c3aed; }
    .ai-send-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: linear-gradient(135deg, #7c3aed, #009fe3); color: white;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .ai-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .ai-send-btn .material-icons { font-size: 18px; }
  `,
})
export class AiAssistantComponent {
  svc = inject(ProcessService);
  isOpen = signal(false);
  isTyping = signal(false);
  messages = signal<AiMessage[]>([
    { role: 'ai', text: 'Hallo! Ich bin der <strong>KI+ Workflow-Assistent</strong>. Ich kann dir helfen Prozesse zu erstellen, zu erklären oder zu optimieren. Beschreibe einfach was du brauchst!' },
  ]);
  userInput = signal('');

  stepIcon(step: ProcessStep): string {
    const icons: Record<string, string> = { decision: 'call_split', parallel: 'sync', subprocess: 'layers' };
    return icons[step.stepType || ''] ?? 'radio_button_checked';
  }

  sendMessage() {
    const text = this.userInput().trim();
    if (!text) return;
    this.addMessage('user', text);
    this.userInput.set('');
    this.simulateAiResponse(text);
  }

  explainProcess() {
    const proc = this.svc.activeProcess();
    if (!proc) return;
    this.addMessage('user', 'Erkläre mir diesen Prozess');
    this.simulateTyping(() => {
      const steps = proc.steps;
      const done = steps.filter(s => s.status === 'completed').length;
      const current = steps.find(s => s.status === 'in-progress');
      const decisions = steps.filter(s => s.stepType === 'decision').length;
      const parallels = steps.filter(s => s.stepType === 'parallel').length;

      let text = `<strong>${proc.title}</strong> ist ein Prozess mit <strong>${steps.length} Schritten</strong>, `;
      text += `verantwortet von <strong>${proc.processOwner.name}</strong> (${proc.processOwner.role}).<br><br>`;
      text += `<strong>Fortschritt:</strong> ${done} von ${steps.length} Schritten abgeschlossen. `;
      if (current) text += `Aktuell wird an "<strong>${current.title}</strong>" gearbeitet (${current.responsible}).<br><br>`;
      if (decisions > 0) text += `Der Prozess enthält <strong>${decisions} Entscheidungspunkt${decisions > 1 ? 'e' : ''}</strong>, `;
      if (parallels > 0) text += `<strong>${parallels} parallele${parallels > 1 ? ' Abschnitte' : 'n Abschnitt'}</strong>, `;
      text += `was auf einen gut strukturierten Workflow hinweist.`;

      this.addMessage('ai', text);
    });
  }

  suggestNextStep() {
    const proc = this.svc.activeProcess();
    if (!proc) return;
    this.addMessage('user', 'Schlage einen nächsten Schritt vor');
    this.simulateTyping(() => {
      const current = proc.steps.find(s => s.status === 'in-progress');
      if (current) {
        this.addMessage('ai', `Basierend auf dem aktuellen Schritt "<strong>${current.title}</strong>" schlage ich vor:<br><br>` +
          `&#128161; <strong>Qualitätsprüfung</strong> — Ergebnisse des aktuellen Schritts reviewen lassen<br>` +
          `&#128161; <strong>Freigabe einholen</strong> — Genehmigung durch Vorgesetzte:n<br>` +
          `&#128161; <strong>Benachrichtigung senden</strong> — Stakeholder über Fortschritt informieren<br><br>` +
          `Soll ich einen davon als Schritt einfügen?`);
      } else {
        this.addMessage('ai', 'Es ist aktuell kein Schritt in Bearbeitung. Soll ich einen neuen Prozess-Startschritt vorschlagen?');
      }
    });
  }

  analyzeProcess() {
    const proc = this.svc.activeProcess();
    if (!proc) return;
    this.addMessage('user', 'Analysiere diesen Prozess');
    this.simulateTyping(() => {
      const steps = proc.steps;
      const noTasks = steps.filter(s => s.tasks.length === 0 && s.status !== 'completed');
      const noCriteria = steps.filter(s => s.completionCriteria.length === 0 && s.status !== 'completed');
      const overdue = steps.filter(s => s.dueDate && s.status !== 'completed');

      let text = `<strong>Prozessanalyse: ${proc.title}</strong><br><br>`;
      if (noTasks.length > 0) {
        text += `&#9888; <strong>${noTasks.length} Schritt${noTasks.length > 1 ? 'e' : ''} ohne Aufgaben:</strong> ${noTasks.map(s => s.title).join(', ')}<br>`;
      }
      if (noCriteria.length > 0) {
        text += `&#9888; <strong>${noCriteria.length} Schritt${noCriteria.length > 1 ? 'e' : ''} ohne Abschlusskriterien:</strong> ${noCriteria.map(s => s.title).join(', ')}<br>`;
      }
      if (overdue.length > 0) {
        text += `&#128308; <strong>${overdue.length} Schritt${overdue.length > 1 ? 'e' : ''} mit Frist:</strong> ${overdue.map(s => `${s.title} (${s.dueDate})`).join(', ')}<br>`;
      }
      if (noTasks.length === 0 && noCriteria.length === 0) {
        text += `&#9989; Alle offenen Schritte haben Aufgaben und Abschlusskriterien.<br>`;
      }
      text += `<br><strong>Empfehlung:</strong> Ergänze fehlende Aufgaben und Kriterien für bessere Nachvollziehbarkeit.`;
      this.addMessage('ai', text);
    });
  }

  applyGeneratedSteps(steps: ProcessStep[]) {
    this.svc.replaceAllSteps(steps);
    this.addMessage('ai', `&#9989; <strong>${steps.length} Schritte</strong> wurden in den Prozess übernommen. Du kannst sie jetzt in der Prozessübersicht sehen und anpassen.`);
  }

  private simulateAiResponse(text: string) {
    const lower = text.toLowerCase();
    if (lower.includes('erstell') || lower.includes('generier') || lower.includes('baue') || lower.includes('prozess für') || lower.includes('workflow für')) {
      this.simulateTyping(() => {
        const steps = this.generateProcessFromPrompt(text);
        this.addMessage('ai',
          `Basierend auf deiner Beschreibung habe ich einen Prozess mit <strong>${steps.length} Schritten</strong> generiert:`,
          steps);
      });
    } else if (lower.includes('erklär')) {
      this.explainProcess();
    } else if (lower.includes('vorschlag') || lower.includes('suggest')) {
      this.suggestNextStep();
    } else if (lower.includes('analys') || lower.includes('optimi')) {
      this.analyzeProcess();
    } else {
      this.simulateTyping(() => {
        this.addMessage('ai',
          'Ich kann dir helfen mit:<br><br>' +
          '&#128295; <strong>"Erstelle einen Prozess für [Beschreibung]"</strong><br>' +
          '&#128161; <strong>"Schlage einen Schritt vor"</strong><br>' +
          '&#128200; <strong>"Analysiere diesen Prozess"</strong><br>' +
          '&#128196; <strong>"Erkläre diesen Prozess"</strong><br><br>' +
          'Probiere es aus!');
      });
    }
  }

  private generateProcessFromPrompt(prompt: string): ProcessStep[] {
    const templates: Record<string, ProcessStep[]> = {
      'bewilligung': [
        this.makeStep('Antrag eingegangen', 'completed'),
        this.makeStep('Vollständigkeitsprüfung', 'completed'),
        this.makeStep('Fachliche Prüfung', 'in-progress', 'parallel'),
        this.makeStep('Entscheid', 'pending', 'decision'),
        this.makeStep('Bewilligung ausstellen', 'pending'),
        this.makeStep('Versand & Archivierung', 'pending'),
      ],
      'beschwerde': [
        this.makeStep('Beschwerde erfassen', 'completed'),
        this.makeStep('Triage & Zuweisung', 'completed'),
        this.makeStep('Sachverhalt abklären', 'in-progress', 'subprocess'),
        this.makeStep('Stellungnahme verfassen', 'pending'),
        this.makeStep('Entscheid', 'pending', 'decision'),
        this.makeStep('Antwort an Beschwerdeführer:in', 'pending'),
        this.makeStep('Abschluss', 'pending'),
      ],
      'anstellung': [
        this.makeStep('Stellenausschreibung', 'completed'),
        this.makeStep('Bewerbungen sichten', 'completed'),
        this.makeStep('Interviews durchführen', 'in-progress', 'parallel'),
        this.makeStep('Referenzen einholen', 'pending'),
        this.makeStep('Entscheid', 'pending', 'decision'),
        this.makeStep('Vertrag erstellen', 'pending'),
        this.makeStep('Onboarding', 'pending', 'subprocess'),
      ],
      'default': [
        this.makeStep('Antrag / Auslöser', 'completed'),
        this.makeStep('Prüfung', 'in-progress'),
        this.makeStep('Bearbeitung', 'pending'),
        this.makeStep('Entscheid', 'pending', 'decision'),
        this.makeStep('Umsetzung', 'pending'),
        this.makeStep('Abschluss', 'pending'),
      ],
    };

    const lower = prompt.toLowerCase();
    for (const [key, steps] of Object.entries(templates)) {
      if (key !== 'default' && lower.includes(key)) return steps;
    }
    return templates['default'];
  }

  private makeStep(title: string, status: ProcessStep['status'], stepType?: string): ProcessStep {
    return {
      id: crypto.randomUUID(), number: 'NEU', title, status,
      responsible: '', category: 'Generiert',
      stepType: (stepType as ProcessStep['stepType']) || undefined,
      contextLinks: [], tasks: [], inputs: [], actions: [],
      completionCriteria: [], conditionals: [],
    };
  }

  private simulateTyping(callback: () => void) {
    this.isTyping.set(true);
    setTimeout(() => {
      this.isTyping.set(false);
      callback();
    }, 1200 + Math.random() * 800);
  }

  private addMessage(role: AiMessage['role'], text: string, steps?: ProcessStep[]) {
    this.messages.update(msgs => [...msgs, { role, text, steps }]);
  }
}
