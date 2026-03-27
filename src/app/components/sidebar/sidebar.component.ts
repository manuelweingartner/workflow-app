import { Component, input, output } from '@angular/core';

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  template: `
    <nav class="drawer">
      <header>
        <span class="drawer-title">MENU</span>
        <i class="material-icons drawer-hamburger">menu</i>
      </header>
      <div class="drawer-nav">
        @for (item of items(); track item.id; let i = $index) {
          @if (item.id === 'documents') {
            <div class="divider"></div>
          }
          <button
            class="drawer-item"
            [class.cmi-active]="item.id === activeId()"
            (click)="itemClick.emit(item.id)"
          >
            <span class="drawer-icon" [innerHTML]="item.icon"></span>
            <span class="drawer-label">{{ item.label }}@if (item.badge !== undefined && item.badge > 0) {&nbsp;({{ item.badge }})}</span>
          </button>
        }
      </div>
    </nav>
  `,
  styles: `
    .drawer {
      width: 300px;
      background-color: #ebebed;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #586475 #ebebed;
    }

    header {
      display: flex;
      align-items: center;
      padding: 14px 24px;
      margin: 0;
      border-bottom: 1px solid rgba(108, 126, 147, 0.3);
      color: #6c7e93;
    }
    .drawer-title {
      flex: 1;
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      overflow: hidden;
    }
    .drawer-hamburger {
      cursor: pointer;
      font-size: 24px;
    }
    .drawer-hamburger:hover { color: #009fe3; }

    .drawer-nav {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .divider {
      height: 1px;
      background: rgba(108, 126, 147, 0.2);
      margin: 4px 24px;
    }

    .drawer-item {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      height: 44px;
      padding: 0 24px;
      border: none;
      border-left: 3px solid transparent;
      background: none;
      cursor: pointer;
      font-size: 0.875rem;
      font-family: "Roboto", "Helvetica", "Arial", sans-serif;
      font-weight: 400;
      color: #586475;
      text-align: left;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s, background-color 0.15s;
    }
    .drawer-item:hover {
      color: #009fe3;
    }
    .drawer-item.cmi-active {
      color: #009fe3;
      background-color: #ffffff;
      border-left-color: #009fe3;
    }

    .drawer-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: inherit;
    }

    .drawer-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }

  `,
})
export class SidebarComponent {
  items = input.required<MenuItem[]>();
  activeId = input<string>('');
  itemClick = output<string>();
}
