import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonSearchbar,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { TranslocoModule } from '@jsverse/transloco';

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
    IonSearchbar,
    IonRefresher,
    IonRefresherContent,
    TranslocoModule,
  ],
  templateUrl: './history.page.html',
  styleUrl: './history.page.scss',
})
export class HistoryPage {
  private repo = inject(MealRepository);
  private dashboard = inject(DashboardFacade);
  private router = inject(Router);

  private readonly allDays = signal<DailySummary[]>([]);
  readonly query = signal('');
  /** Dates matching the current food search, or null when not searching. */
  private readonly matches = signal<Set<string> | null>(null);

  /** Whether there is any logged day at all (controls the searchbar). */
  readonly hasAny = computed(() => this.allDays().length > 0);

  /** Days to show: all, or filtered to the food-search matches. */
  readonly days = computed(() => {
    const m = this.matches();
    const all = this.allDays();
    return m ? all.filter((d) => m.has(d.date)) : all;
  });

  async ionViewWillEnter(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const dates = await this.repo.getLoggedDates();
    const summaries = await Promise.all(
      dates.map((d) => this.repo.getDailySummary(d)),
    );
    this.allDays.set(summaries);
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.load();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  /** Filter the day list by a food name typed in the searchbar. */
  async onSearch(ev: CustomEvent): Promise<void> {
    const term = ((ev.detail.value as string) || '').trim();
    this.query.set(term);
    if (!term) {
      this.matches.set(null);
      return;
    }
    const dates = await this.repo.searchLoggedDates(term);
    this.matches.set(new Set(dates));
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
