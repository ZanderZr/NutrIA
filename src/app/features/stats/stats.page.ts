import { Component, inject, signal } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

import { MealRepository } from '@data/repositories/meal.repository';
import { ProfileFacade } from '@core/state/profile.facade';
import { WeightFacade } from '@core/state/weight.facade';
import {
  Objective,
  ProfileInput,
  objectiveNeedsTargetWeight,
} from '@domain/models/user-profile.model';
import {
  GoalProgress,
  computeGoalProgress,
} from '@domain/nutrition/goal-progress';
import {
  AdaptiveEstimate,
  estimateAdaptive,
} from '@domain/nutrition/adaptive-tdee';
import {
  WeeklyInsights,
  computeWeeklyInsights,
} from '@domain/insights/weekly-insights';
import { addDays, friendlyDate, toLocalDateKey } from '@shared/utils/date.util';

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonButton,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    BaseChartDirective,
    TranslocoModule,
  ],
  templateUrl: './stats.page.html',
  styleUrl: './stats.page.scss',
})
export class StatsPage {
  private repo = inject(MealRepository);
  private profile = inject(ProfileFacade);
  weight = inject(WeightFacade);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);
  private t = inject(TranslocoService);

  range = '7';

  /** Data-driven maintenance/target suggestion, when there's enough history. */
  readonly adaptive = signal<AdaptiveEstimate | null>(null);

  /** This week's summary, when there's anything logged. */
  readonly insights = signal<WeeklyInsights | null>(null);

  readonly avgCalories = signal(0);
  readonly adherence = signal(0);
  readonly loggedDays = signal(0);
  readonly chartData = signal<ChartConfiguration<'bar'>['data']>({
    labels: [],
    datasets: [],
  });

  chartOptions: ChartConfiguration<'bar'>['options'] = this.buildOptions<'bar'>(true);
  weightOptions: ChartConfiguration<'line'>['options'] = this.buildOptions<'line'>(false);

  readonly weightData = signal<ChartConfiguration<'line'>['data']>({
    labels: [],
    datasets: [],
  });

  /** Read a design token so canvas charts match the active light/dark theme. */
  private cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Chart.js options themed from the design tokens (grid + ticks). */
  private buildOptions<T extends 'bar' | 'line'>(
    beginAtZero: boolean,
  ): ChartConfiguration<T>['options'] {
    const tick = this.cssVar('--app-text-3') || '#8b93a1';
    const grid = this.cssVar('--app-border') || 'rgba(0,0,0,0.08)';
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: tick, font: { size: 10 } },
        },
        y: {
          beginAtZero,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 5 },
        },
      },
    } as unknown as ChartConfiguration<T>['options'];
  }

  async ionViewWillEnter(): Promise<void> {
    // Rebuild theme-dependent options each time the view opens (theme may have changed).
    this.chartOptions = this.buildOptions<'bar'>(true);
    this.weightOptions = this.buildOptions<'line'>(false);
    await this.loadAll();
  }

  private async loadAll(): Promise<void> {
    await Promise.all([this.reload(), this.loadWeight()]);
    await this.computeInsights();
    await this.computeAdaptive();
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.loadAll();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  /** Current calorie target (for comparing against the suggestion). */
  currentCalories(): number {
    return this.profile.targets().calories;
  }

  /** Friendly label for an insights date key. */
  dayLabel(dateKey: string): string {
    return friendlyDate(dateKey);
  }

  /** Compute this week's summary from the last 7 days. */
  private async computeInsights(): Promise<void> {
    const today = toLocalDateKey();
    const summaries = await this.repo.getRangeSummaries(addDays(today, -6), today);
    this.insights.set(computeWeeklyInsights(summaries, this.profile.targets()));
  }

  /**
   * Estimate real maintenance from the last 21 days of intake + weight, and
   * surface a target suggestion only when it differs meaningfully (≥40 kcal).
   */
  private async computeAdaptive(): Promise<void> {
    const p = this.profile.profile();
    if (!p) {
      this.adaptive.set(null);
      return;
    }
    const input: ProfileInput = {
      sex: p.sex,
      age: p.age,
      weight_kg: p.weight_kg,
      height_cm: p.height_cm,
      daily_activity: p.daily_activity,
      training_days: p.training_days,
      training_minutes: p.training_minutes,
      objective: p.objective,
      pace: p.pace,
      target_weight_kg: p.target_weight_kg,
    };

    const today = toLocalDateKey();
    const summaries = await this.repo.getRangeSummaries(addDays(today, -20), today);
    const dailyCalories = summaries.map((s) => ({ date: s.date, calories: s.calories }));
    const weights = this.weight
      .entries()
      .map((e) => ({ date: e.date, weight_kg: e.weight_kg }));

    const est = estimateAdaptive(input, dailyCalories, weights, 21);
    const meaningful =
      est && Math.abs(est.suggested.calories - this.currentCalories()) >= 40;
    this.adaptive.set(meaningful ? est : null);
  }

  /** Adopt the suggested targets, then hide the card. */
  async applyAdaptive(): Promise<void> {
    const est = this.adaptive();
    if (!est) return;
    await this.profile.applyAdaptiveTargets(est.suggested);
    this.adaptive.set(null);
    const toast = await this.toast.create({
      message: this.t.translate('stats.goalUpdated', {
        kcal: est.suggested.calories,
      }),
      duration: 1800,
      position: 'bottom',
    });
    await toast.present();
  }

  private async loadWeight(): Promise<void> {
    await this.weight.load();
    const entries = this.weight.entries();
    const accent = this.cssVar('--app-accent') || '#0ea5e9';
    this.weightData.set({
      labels: entries.map((e) => e.date.slice(5)),
      datasets: [
        {
          data: entries.map((e) => e.weight_kg),
          borderColor: accent,
          backgroundColor: this.cssVar('--app-accent-soft') || 'rgba(14,165,233,0.15)',
          tension: 0.35,
          fill: true,
          pointRadius: 2,
          pointBackgroundColor: accent,
          borderWidth: 2,
        },
      ],
    });
  }

  /** Prompt for today's weight; logging it also recalculates targets. */
  async addWeight(): Promise<void> {
    const current = this.weight.latest()?.weight_kg ?? this.profile.profile()?.weight_kg;
    const alert = await this.alerts.create({
      header: this.t.translate('stats.addWeightTitle'),
      message: this.t.translate('stats.addWeightMsg'),
      inputs: [
        {
          name: 'weight',
          type: 'number',
          value: current,
          placeholder: this.t.translate('stats.addWeightPlaceholder'),
          min: 20,
          max: 400,
        },
      ],
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.save'),
          handler: (data: { weight: string }) => {
            const w = parseFloat(data.weight);
            if (!w || w < 20 || w > 400) return false;
            this.weight.logWeight(w).then(() => this.loadWeight());
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** Goal-progress card data, or null when the objective has no target weight. */
  goalInfo(): {
    objective: Objective;
    current: number;
    target: number;
    progress: GoalProgress;
  } | null {
    const p = this.profile.profile();
    if (!p || !objectiveNeedsTargetWeight(p.objective) || p.target_weight_kg == null) {
      return null;
    }
    const current = this.weight.latest()?.weight_kg ?? p.weight_kg;
    const start = this.weight.startWeight() ?? current;
    const progress = computeGoalProgress({
      objective: p.objective,
      pace: p.pace,
      targetWeightKg: p.target_weight_kg,
      currentWeightKg: current,
      startWeightKg: start,
    });
    if (!progress) return null;
    return {
      objective: p.objective,
      current,
      target: p.target_weight_kg,
      progress,
    };
  }

  absRate(rate: number): string {
    return Math.abs(rate).toFixed(2);
  }

  etaLabel(date: string): string {
    return friendlyDate(date);
  }

  async reload(): Promise<void> {
    const n = Number(this.range);
    const today = toLocalDateKey();
    const from = addDays(today, -(n - 1));
    const summaries = await this.repo.getRangeSummaries(from, today);

    const target = this.profile.targets().calories;
    const byDate = new Map(summaries.map((s) => [s.date, s.calories]));

    const labels: string[] = [];
    const values: number[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const date = addDays(today, -i);
      labels.push(date.slice(5)); // MM-DD
      values.push(byDate.get(date) ?? 0);
    }

    const logged = summaries.length;
    const totalCalories = summaries.reduce((a, s) => a + s.calories, 0);
    const avg = logged ? Math.round(totalCalories / logged) : 0;

    this.loggedDays.set(logged);
    this.avgCalories.set(avg);
    this.adherence.set(
      target > 0 && avg > 0
        ? Math.max(0, Math.round(100 - (Math.abs(avg - target) / target) * 100))
        : 0,
    );

    this.chartData.set({
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: this.cssVar('--macro-calories') || '#12a150',
          borderRadius: 7,
          maxBarThickness: 30,
        },
      ],
    });
  }
}
