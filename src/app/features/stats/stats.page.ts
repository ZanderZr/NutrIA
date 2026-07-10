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
  AlertController,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

import { MealRepository } from '@data/repositories/meal.repository';
import { ProfileFacade } from '@core/state/profile.facade';
import { WeightFacade } from '@core/state/weight.facade';
import {
  OBJECTIVE_LABELS,
  objectiveNeedsTargetWeight,
} from '@domain/models/user-profile.model';
import {
  GoalProgress,
  computeGoalProgress,
} from '@domain/nutrition/goal-progress';
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
    BaseChartDirective,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Progreso</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="content-wrap">
        <ion-segment [(ngModel)]="range" (ionChange)="reload()">
          <ion-segment-button value="7"><ion-label>Semana</ion-label></ion-segment-button>
          <ion-segment-button value="30"><ion-label>Mes</ion-label></ion-segment-button>
        </ion-segment>

        <div class="kpis">
          <div class="app-card kpi">
            <span class="num">{{ avgCalories() }}</span>
            <small>kcal/día media</small>
          </div>
          <div class="app-card kpi">
            <span class="num">{{ adherence() }}%</span>
            <small>adherencia</small>
          </div>
          <div class="app-card kpi">
            <span class="num">{{ loggedDays() }}</span>
            <small>días</small>
          </div>
        </div>

        <div class="app-card chart-card">
          <div class="card-head">
            <span class="card-title">Calorías por día</span>
            <ion-icon name="flame-outline"></ion-icon>
          </div>
          <div class="chart">
            <canvas
              baseChart
              type="bar"
              [data]="chartData()"
              [options]="chartOptions"
            ></canvas>
          </div>
        </div>

        <div class="app-card weight-card">
          <div class="weight-head">
            <div>
              <div class="weight-value num">
                {{ weight.latest() ? weight.latest()!.weight_kg : '—' }}
                <small>kg</small>
              </div>
              @if (weight.entries().length > 1) {
                <div class="weight-change" [class.down]="weight.change() < 0">
                  <ion-icon [name]="weight.change() < 0 ? 'trending-up-outline' : 'trending-up-outline'"></ion-icon>
                  {{ weight.change() > 0 ? '+' : '' }}{{ weight.change() | number: '1.0-1' }} kg
                  desde el inicio
                </div>
              } @else {
                <div class="text-muted weight-hint">
                  Registra tu peso para ver la evolución
                </div>
              }
            </div>
            <ion-button size="small" fill="outline" (click)="addWeight()">
              <ion-icon slot="start" name="add-outline"></ion-icon>
              Añadir
            </ion-button>
          </div>

          @if (weight.entries().length > 1) {
            <div class="chart weight-chart">
              <canvas
                baseChart
                type="line"
                [data]="weightData()"
                [options]="weightOptions"
              ></canvas>
            </div>
          }
        </div>

        @if (goalInfo(); as g) {
          <div class="app-card goal-card">
            <div class="card-head">
              <span class="card-title">{{ g.label }}</span>
              <ion-icon name="flag-outline"></ion-icon>
            </div>
            <div class="goal-row">
              <span class="num">{{ g.current | number: '1.0-1' }} kg</span>
              <ion-icon name="arrow-forward"></ion-icon>
              <span class="num goal-target">{{ g.target | number: '1.0-1' }} kg</span>
            </div>
            <div class="goal-bar">
              <div class="goal-fill" [style.width.%]="g.progress.percent"></div>
            </div>
            <div class="goal-meta text-muted">
              {{ g.progress.percent | number: '1.0-0' }}% ·
              {{ absRate(g.progress.ratePerWeekKg) }} kg/sem
              @if (g.progress.etaDate) {
                · llegada estimada {{ etaLabel(g.progress.etaDate) }}
              }
            </div>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      ion-segment { margin: var(--sp-2) 0 var(--sp-5); }
      .kpis {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--sp-3);
        margin-bottom: var(--sp-4);
      }
      .kpi {
        text-align: center;
        padding: var(--sp-4) var(--sp-2);
      }
      .kpi span { display: block; font-size: var(--app-text-xl); font-weight: var(--app-weight-bold); color: var(--app-text); }
      .kpi small { color: var(--app-text-3); font-size: var(--app-text-2xs); font-weight: var(--app-weight-medium); }

      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--sp-3);
      }
      .card-title { font-size: var(--app-text-base); font-weight: var(--app-weight-semibold); }
      .card-head ion-icon { color: var(--app-text-3); font-size: 1.15rem; }

      .chart-card { padding: var(--sp-5); margin-bottom: var(--sp-4); }
      .chart { height: 260px; }

      .weight-card { padding: var(--sp-5); }
      .weight-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .weight-value { font-size: var(--app-text-2xl); font-weight: var(--app-weight-bold); color: var(--app-text); }
      .weight-value small { font-size: var(--app-text-md); color: var(--app-text-3); font-weight: var(--app-weight-medium); }
      .weight-change {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--app-text-xs);
        font-weight: var(--app-weight-semibold);
        color: var(--app-danger);
        margin-top: 2px;
      }
      .weight-change ion-icon { font-size: 0.95rem; }
      .weight-change.down { color: var(--app-success); }
      .weight-change.down ion-icon { transform: scaleY(-1); }
      .weight-hint { font-size: var(--app-text-sm); margin-top: 4px; }
      .weight-chart { height: 200px; margin-top: var(--sp-4); }

      .goal-card { padding: var(--sp-5); margin-top: var(--sp-4); }
      .goal-row {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        font-size: var(--app-text-xl);
        font-weight: var(--app-weight-bold);
        margin-bottom: var(--sp-3);
      }
      .goal-row ion-icon { color: var(--app-text-3); font-size: 1.1rem; }
      .goal-target { color: var(--app-primary); }
      .goal-bar {
        height: 8px;
        border-radius: var(--r-full);
        background: var(--app-track);
        overflow: hidden;
      }
      .goal-fill {
        height: 100%;
        border-radius: var(--r-full);
        background: var(--app-primary);
        transition: width var(--app-dur-slow) var(--app-ease-out);
      }
      .goal-meta { margin: var(--sp-3) 0 0; font-size: var(--app-text-sm); }
    `,
  ],
})
export class StatsPage {
  private repo = inject(MealRepository);
  private profile = inject(ProfileFacade);
  weight = inject(WeightFacade);
  private alerts = inject(AlertController);

  range = '7';

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
    await Promise.all([this.reload(), this.loadWeight()]);
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
      header: 'Añadir peso',
      message: 'Registra tu peso de hoy (kg).',
      inputs: [
        {
          name: 'weight',
          type: 'number',
          value: current,
          placeholder: 'Ej: 78.5',
          min: 20,
          max: 400,
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
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
    label: string;
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
      label: OBJECTIVE_LABELS[p.objective],
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
