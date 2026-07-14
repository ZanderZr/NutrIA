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
  templateUrl: './history.page.html',
  styleUrl: './history.page.scss',
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
