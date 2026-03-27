import { Component, inject } from '@angular/core';
import { ProcessService, LinkedField } from '../../services/process.service';

interface ThematicGroup {
  name: string;
  fields: LinkedField[];
}

@Component({
  selector: 'app-dossier-details',
  standalone: true,
  template: `
    <div class="view">
      <h2 class="page-title">Dossierdetails</h2>

      <!-- Dossier card -->
      <div class="card">
        <h3 class="section-title">Dossier</h3>
        <div class="fields-row">
          <div class="mat-field full">
            <label class="mat-label">Nummer</label>
            <div class="mat-value">{{ svc.dossier$().number }}</div>
          </div>
        </div>
        <div class="fields-row">
          <div class="mat-field full">
            <label class="mat-label">Titel</label>
            <div class="mat-value">{{ svc.dossier$().title }}</div>
          </div>
        </div>
        <div class="fields-row">
          <div class="mat-field full">
            <label class="mat-label">Fortschritt</label>
            <div class="mat-value">{{ svc.progress().done }} / {{ svc.progress().total }} Schritte abgeschlossen</div>
          </div>
        </div>
      </div>

      @for (group of thematicGroups(); track group.name) {
        <div class="card">
          <h3 class="section-title">{{ group.name }}</h3>
          <div class="fields-row">
            @for (field of group.fields; track field.input.id) {
              <div class="outlined-field" [class.half]="field.input.fieldType !== 'textarea'">
                <div class="outlined-border" [class.has-value]="!!field.input.value" [class.focused]="false">
                  <label class="outlined-label">{{ field.input.label }}@if (field.input.required) { *}</label>
                  @if (field.input.fieldType === 'select') {
                    <select class="outlined-input" [value]="field.input.value || ''">
                      <option value="">-</option>
                      @for (opt of field.input.options || []; track opt) {
                        <option [value]="opt" [selected]="opt === field.input.value">{{ opt }}</option>
                      }
                    </select>
                  } @else if (field.input.fieldType === 'textarea') {
                    <textarea class="outlined-input" rows="2">{{ field.input.value || '' }}</textarea>
                  } @else {
                    <input class="outlined-input" [type]="field.input.fieldType || 'text'" [value]="field.input.value || ''" />
                  }
                </div>
                <span class="field-source">
                  <button class="step-link" (click)="svc.navigateToStep(field.stepId)">{{ field.stepNumber }} &mdash; {{ field.stepTitle }}</button>
                </span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .view { padding: 0 30px 30px; overflow-y: auto; height: 100%; }
    .page-title { font-size: 1.375rem; font-weight: 400; color: #353c46; margin: 0; padding: 24px 0 16px; }

    .card {
      background: #ffffff;
      border-radius: 4px;
      box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
      padding: 24px 30px;
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 1.125rem;
      font-weight: 500;
      color: #353c46;
      margin: 0 0 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e0e0e0;
    }

    .fields-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 4px;
    }

    .mat-field {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 0;
    }
    .mat-field.full { flex: 1; min-width: 100%; }
    .mat-label { font-size: 12px; color: #6c7e93; }
    .mat-value { font-size: 14px; color: #353c46; }

    .outlined-field {
      flex: 1;
      min-width: 200px;
      margin-bottom: 12px;
    }
    .outlined-field.half {
      flex: 1;
      min-width: 200px;
      max-width: 50%;
    }
    .outlined-border {
      position: relative;
      border: 1px solid #bdbdbd;
      border-radius: 4px;
      padding: 0;
      transition: border-color 0.15s;
    }
    .outlined-border:focus-within {
      border-color: #009fe3;
      border-width: 2px;
    }
    .outlined-border:focus-within .outlined-label {
      color: #009fe3;
    }
    .outlined-label {
      position: absolute;
      top: -8px;
      left: 10px;
      background: white;
      padding: 0 4px;
      font-size: 12px;
      color: #6c7e93;
      line-height: 1;
      pointer-events: none;
    }
    .outlined-input {
      width: 100%;
      border: none;
      outline: none;
      padding: 14px 12px 10px;
      font-size: 14px;
      font-family: inherit;
      color: #353c46;
      background: transparent;
      box-sizing: border-box;
    }
    select.outlined-input {
      appearance: none;
      cursor: pointer;
    }
    textarea.outlined-input {
      resize: vertical;
      min-height: 48px;
    }

    .field-source { display: block; margin-top: 2px; }
    .step-link {
      background: none; border: none; color: #6c7e93; cursor: pointer;
      font-size: 11px; padding: 0; text-decoration: none; font-family: inherit;
    }
    .step-link:hover { color: #009fe3; text-decoration: underline; }
  `,
})
export class DossierDetailsComponent {
  svc = inject(ProcessService);

  thematicGroups(): ThematicGroup[] {
    const fields = this.svc.allFields();
    const groupMap = new Map<string, LinkedField[]>();
    const order: string[] = [];

    for (const f of fields) {
      const name = f.input.thematicGroup || 'Allgemein';
      if (!groupMap.has(name)) {
        groupMap.set(name, []);
        order.push(name);
      }
      groupMap.get(name)!.push(f);
    }

    return order.map((name) => ({ name, fields: groupMap.get(name)! }));
  }
}
