import { Component, inject, computed } from '@angular/core';
import { SidebarComponent, MenuItem } from '../sidebar/sidebar.component';
import { ProcessService } from '../../services/process.service';
import { Traktandum } from '../../models/process.model';

interface TraktandumGroup {
  category: string;
  items: Traktandum[];
}

@Component({
  selector: 'app-sitzung-view',
  standalone: true,
  imports: [SidebarComponent],
  template: `
    <app-sidebar [items]="menuItems()" [activeId]="svc.activeMenu()" (itemClick)="svc.setActiveMenu($event)" />
    <div class="sitzung-content">
      @if (svc.activeSitzung(); as sitzung) {
        @switch (svc.activeMenu()) {
          @case ('traktanden') {
            <!-- Sitzungs-Header -->
            <div class="sitzung-header">
              <h2>{{ sitzung.title }}</h2>
              <div class="sitzung-meta">
                <span>&#128197; {{ sitzung.date }}</span>
                @if (sitzung.location) { <span>&#128205; {{ sitzung.location }}</span> }
                <span>&#128100; {{ sitzung.chairperson }}</span>
                @if (sitzung.frequency) { <span class="frequency-badge">{{ sitzung.frequency }}</span> }
              </div>
              <div class="sitzung-org">{{ sitzung.organization }}</div>
              <div class="sitzung-status">
                <span class="status-badge" [class]="sitzung.status">{{ statusLabel(sitzung.status) }}</span>
              </div>
            </div>

            <!-- Traktanden -->
            <div class="traktanden-section">
              <h3>Traktanden</h3>
              @for (group of traktandumGroups(); track group.category) {
                <div class="trakt-group">
                  <div class="trakt-group-header">{{ group.category }}</div>
                  @for (trakt of group.items; track trakt.id) {
                    <div class="trakt-card" [class.has-geschaeft]="trakt.contextLinks.length > 0">
                      <div class="trakt-number">{{ trakt.number }}.</div>
                      <div class="trakt-body">
                        <div class="trakt-title">{{ trakt.title }}</div>
                        @if (trakt.contextLinks.length > 0) {
                          <div class="trakt-links">
                            @for (cl of trakt.contextLinks; track cl.contextId) {
                              @if (svc.getContextObject(cl.contextId); as ctx) {
                                <button class="trakt-link-btn" (click)="svc.openTab('geschaeft', ctx.id)">
                                  <i class="material-icons">folder_open</i>
                                  <span>{{ ctx.number }} — {{ ctx.title }}</span>
                                </button>
                              }
                            }
                          </div>
                        }
                        @if (trakt.beschlusstext) {
                          <div class="trakt-beschluss">
                            <span class="beschluss-label">Beschluss:</span> {{ trakt.beschlusstext }}
                          </div>
                        }
                      </div>
                      <div class="trakt-status">
                        <span class="trakt-status-badge" [class]="trakt.status">{{ traktStatusLabel(trakt.status) }}</span>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
          @case ('sitzungsdokumente') {
            <div class="doc-section">
              <h2>Sitzungsdokumente</h2>
              @for (doc of sitzung.documents; track doc.id) {
                <div class="doc-card">
                  <div class="doc-icon">
                    @if (doc.type === 'protokoll') { &#128196; }
                    @else if (doc.type === 'einladung') { &#9993; }
                    @else { &#128206; }
                  </div>
                  <div class="doc-info">
                    <span class="doc-name">{{ doc.name }}</span>
                    <span class="doc-meta">{{ doc.uploadDate }} &mdash; {{ docTypeLabel(doc.type) }}</span>
                  </div>
                  <button class="doc-btn">Öffnen</button>
                </div>
              }
            </div>
          }
          @case ('teilnehmende') {
            <div class="teiln-section">
              <h2>Teilnehmende</h2>
              <div class="teiln-list">
                @for (p of sitzung.participants; track p.id) {
                  <div class="teiln-card">
                    <div class="teiln-avatar">{{ p.name.charAt(0) }}</div>
                    <div class="teiln-info">
                      <span class="teiln-name">{{ p.name }}</span>
                      <span class="teiln-role">{{ p.role }}@if (p.organization) {, {{ p.organization }}}</span>
                    </div>
                    <span class="teiln-status" [class]="p.status">{{ participantStatusLabel(p.status) }}</span>
                  </div>
                }
              </div>
            </div>
          }
          @default {
            <div class="placeholder-content">
              <p>Dieser Bereich ist noch nicht implementiert.</p>
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex: 1; overflow: hidden; }
    .sitzung-content { flex: 1; overflow-y: auto; padding: 24px 30px 30px; }

    .sitzung-header { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
    .sitzung-header h2 { margin: 0 0 8px; font-size: 1.375rem; font-weight: 400; color: #353c46; }
    .sitzung-meta { display: flex; gap: 16px; font-size: 13px; color: #6c7e93; flex-wrap: wrap; margin-bottom: 4px; }
    .frequency-badge { background: #f3e8ff; color: #7c3aed; padding: 1px 8px; border-radius: 8px; font-size: 11px; }
    .sitzung-org { font-size: 13px; color: #586475; margin-bottom: 8px; }
    .status-badge { font-size: 11px; padding: 2px 10px; border-radius: 12px; }
    .status-badge.geplant { background: #e6f4fd; color: #009fe3; }
    .status-badge.eingeladen { background: #f3e8ff; color: #7c3aed; }
    .status-badge.durchgeführt { background: #eef7ea; color: #3f971a; }
    .status-badge.protokolliert { background: #f4f5f6; color: #6c7e93; }

    .traktanden-section h3 { font-size: 1rem; font-weight: 500; color: #353c46; margin: 0 0 16px; }
    .trakt-group { margin-bottom: 20px; }
    .trakt-group-header {
      font-size: 12px; font-weight: 500; color: #6c7e93; text-transform: uppercase;
      padding: 6px 0; margin-bottom: 8px; border-bottom: 1px solid #ebebed;
    }
    .trakt-card {
      display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px;
      background: #ffffff; border-radius: 4px; margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
      transition: box-shadow 0.15s;
    }
    .trakt-card:hover { box-shadow: 0 3px 6px rgba(0,0,0,0.16); }
    .trakt-card.has-geschaeft { border-left: 3px solid #009fe3; }
    .trakt-number { font-size: 16px; font-weight: 500; color: #586475; min-width: 28px; }
    .trakt-body { flex: 1; }
    .trakt-title { font-size: 14px; color: #353c46; margin-bottom: 4px; }
    .trakt-links { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
    .trakt-link-btn {
      display: inline-flex; align-items: center; gap: 6px; background: none; border: 1px solid #e0e0e0;
      padding: 4px 10px; border-radius: 4px; font-size: 12px; color: #009fe3; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
    }
    .trakt-link-btn:hover { background: #e6f4fd; }
    .trakt-link-btn .material-icons { font-size: 16px; }
    .trakt-beschluss { margin-top: 6px; font-size: 12px; color: #586475; font-style: italic; }
    .beschluss-label { font-weight: 500; font-style: normal; }
    .trakt-status-badge { font-size: 11px; padding: 2px 10px; border-radius: 12px; white-space: nowrap; }
    .trakt-status-badge.offen { background: #e6f4fd; color: #009fe3; }
    .trakt-status-badge.beschlossen { background: #eef7ea; color: #3f971a; }
    .trakt-status-badge.vertagt { background: #fef9e7; color: #92710c; }
    .trakt-status-badge.zur-kenntnis { background: #f4f5f6; color: #6c7e93; }

    .doc-section h2, .teiln-section h2 { font-size: 1.375rem; font-weight: 400; color: #353c46; margin: 0 0 16px; }
    .doc-card {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      background: #ffffff; border-radius: 4px; margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .doc-icon { font-size: 24px; }
    .doc-info { flex: 1; display: flex; flex-direction: column; }
    .doc-name { font-size: 14px; color: #353c46; }
    .doc-meta { font-size: 12px; color: #6c7e93; }
    .doc-btn {
      padding: 4px 12px; border: 1px solid #009fe3; background: white; color: #009fe3;
      border-radius: 4px; font-size: 12px; cursor: pointer; font-family: inherit;
    }
    .doc-btn:hover { background: #e6f4fd; }

    .teiln-card {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      background: #ffffff; border-radius: 4px; margin-bottom: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .teiln-avatar {
      width: 36px; height: 36px; border-radius: 50%; background: #009fe3; color: white;
      display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 500;
    }
    .teiln-info { flex: 1; display: flex; flex-direction: column; }
    .teiln-name { font-size: 14px; color: #353c46; }
    .teiln-role { font-size: 12px; color: #6c7e93; }
    .teiln-status { font-size: 11px; padding: 2px 10px; border-radius: 12px; }
    .teiln-status.zugesagt { background: #eef7ea; color: #3f971a; }
    .teiln-status.eingeladen { background: #e6f4fd; color: #009fe3; }
    .teiln-status.abgesagt { background: #fce8e8; color: #8c0909; }
    .teiln-status.teilgenommen { background: #f4f5f6; color: #6c7e93; }

    .placeholder-content { flex: 1; display: flex; align-items: center; justify-content: center; color: #6c7e93; }
  `,
})
export class SitzungViewComponent {
  svc = inject(ProcessService);

  menuItems = computed<MenuItem[]>(() => {
    const sitzung = this.svc.activeSitzung();
    const trakt = sitzung?.traktanden.length ?? 0;
    const docs = sitzung?.documents.length ?? 0;
    const teiln = sitzung?.participants.length ?? 0;
    return [
      { id: 'traktanden', label: 'Traktanden', icon: '<i class="material-icons">list</i>', badge: trakt },
      { id: 'sitzungsdokumente', label: 'Sitzungsdokumente', icon: '<i class="material-icons">insert_drive_file</i>', badge: docs },
      { id: 'teilnehmende', label: 'Teilnehmende', icon: '<i class="material-icons">people</i>', badge: teiln },
    ];
  });

  traktandumGroups = computed<TraktandumGroup[]>(() => {
    const sitzung = this.svc.activeSitzung();
    if (!sitzung) return [];
    const groupMap = new Map<string, Traktandum[]>();
    const order: string[] = [];
    for (const t of sitzung.traktanden) {
      const cat = t.category || 'Allgemein';
      if (!groupMap.has(cat)) { groupMap.set(cat, []); order.push(cat); }
      groupMap.get(cat)!.push(t);
    }
    return order.map((cat) => ({ category: cat, items: groupMap.get(cat)! }));
  });

  statusLabel(s: string) {
    return { geplant: 'Geplant', eingeladen: 'Eingeladen', durchgeführt: 'Durchgeführt', protokolliert: 'Protokolliert' }[s] ?? s;
  }
  traktStatusLabel(s: string) {
    return { offen: 'Offen', beschlossen: 'Beschlossen', vertagt: 'Vertagt', 'zur-kenntnis': 'Zur Kenntnis' }[s] ?? s;
  }
  docTypeLabel(s: string) {
    return { einladung: 'Einladung', traktandum: 'Traktandum', protokoll: 'Protokoll', beilage: 'Beilage' }[s] ?? s;
  }
  participantStatusLabel(s: string) {
    return { eingeladen: 'Eingeladen', zugesagt: 'Zugesagt', abgesagt: 'Abgesagt', teilgenommen: 'Teilgenommen' }[s] ?? s;
  }
}
