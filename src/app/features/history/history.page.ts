import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
} from '@ionic/angular/standalone';

import { MealRepository } from '@data/repositories/meal.repository';
import { DashboardFacade } from '@core/state/dashboard.facade';
import { DailySummary } from '@domain/models/meal.model';
import { friendlyDate } from '@shared/utils/date.util';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Historial</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="content-wrap">
        @if (!days().length) {
          <div class="app-card empty-state">
            <ion-icon name="calendar-outline"></ion-icon>
            <p>Todavía no hay días registrados.<br />Registra tu primera comida para verla aquí.</p>
          </div>
        } @else {
          <div class="day-list stagger">
            @for (day of days(); track day.date) {
              <div class="app-card day-card app-pressable stagger-item" (click)="open(day.date)">
                <div class="day-main">
                  <h2>{{ label(day.date) }}</h2>
                  <div class="day-macros">
                    <span><i style="background:var(--macro-protein)"></i>{{ round(day.protein_g) }}g</span>
                    <span><i style="background:var(--macro-carbs)"></i>{{ round(day.carbs_g) }}g</span>
                    <span><i style="background:var(--macro-fat)"></i>{{ round(day.fat_g) }}g</span>
                    <span class="meals text-muted">· {{ day.meal_count }} comidas</span>
                  </div>
                </div>
                <div class="day-cal">
                  <span class="num">{{ day.calories }}</span><small>kcal</small>
                </div>
                <ion-icon class="chev" name="chevron-forward"></ion-icon>
              </div>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .day-list { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-2); }
      .day-card {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        padding: var(--sp-4);
      }
      .day-main { flex: 1 1 auto; min-width: 0; }
      .day-main h2 {
        margin: 0 0 var(--sp-2);
        font-size: var(--app-text-md);
        font-weight: var(--app-weight-semibold);
        text-transform: capitalize;
      }
      .day-macros { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); }
      .day-macros span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: var(--app-text-xs);
        font-weight: var(--app-weight-semibold);
        color: var(--app-text-2);
      }
      .day-macros i { width: 7px; height: 7px; border-radius: var(--r-full); display: inline-block; }
      .day-macros .meals { font-weight: var(--app-weight-regular); }
      .day-cal { text-align: right; }
      .day-cal span { font-size: var(--app-text-lg); font-weight: var(--app-weight-bold); color: var(--app-text); }
      .day-cal small { display: block; font-size: var(--app-text-2xs); color: var(--app-text-3); }
      .chev { color: var(--app-text-3); font-size: 1.1rem; flex: 0 0 auto; }
    `,
  ],
})
export class HistoryPage {
  private repo = inject(MealRepository);
  private dashboard = inject(DashboardFacade);
  private router = inject(Router);

  readonly days = signal<DailySummary[]>([]);

  async ionViewWillEnter(): Promise<void> {
    const dates = await this.repo.getLoggedDates();
    const summaries = await Promise.all(
      dates.map((d) => this.repo.getDailySummary(d)),
    );
    this.days.set(summaries);
  }

  label(date: string): string {
    return friendlyDate(date);
  }

  round(v: number): number {
    return Math.round(v);
  }

  async open(date: string): Promise<void> {
    await this.dashboard.loadDate(date);
    await this.router.navigateByUrl('/tabs/dashboard');
  }
}
