import { Component, computed, inject, signal } from '@angular/core';
import {
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

import { WorkoutFacade } from '@core/state/workout.facade';
import {
  ExerciseMetric,
  ExercisePoint,
  ExerciseUnit,
  metricValue,
  metricsFor,
} from '@domain/models/training.model';

/**
 * Per-exercise progress chart. The selectable metrics depend on the exercise's
 * unit, so a plank charts seconds and a bench press charts volume / top weight
 * / estimated 1RM instead of a flat zero.
 */
@Component({
  selector: 'app-exercise-progress-card',
  standalone: true,
  imports: [
    FormsModule,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    BaseChartDirective,
    TranslocoModule,
  ],
  templateUrl: './exercise-progress-card.component.html',
  styleUrl: './exercise-progress-card.component.scss',
})
export class ExerciseProgressCardComponent {
  private workouts = inject(WorkoutFacade);

  readonly exercises = signal<{ key: string; name: string; unit: string }[]>([]);
  readonly selectedKey = signal('');
  readonly metric = signal<ExerciseMetric>('volume');
  readonly points = signal<ExercisePoint[]>([]);

  readonly selected = computed(() =>
    this.exercises().find((e) => e.key === this.selectedKey()),
  );
  readonly metrics = computed(() =>
    metricsFor((this.selected()?.unit ?? 'kg') as ExerciseUnit),
  );
  readonly hasChart = computed(() => this.points().length >= 2);

  readonly chartData = signal<ChartConfiguration<'line'>['data']>({
    labels: [],
    datasets: [],
  });
  chartOptions: ChartConfiguration<'line'>['options'] = this.buildOptions();

  /** Called by the page on view enter, so a theme change is picked up too. */
  async reload(): Promise<void> {
    this.chartOptions = this.buildOptions();
    const exercises = await this.workouts.loggedExercises();
    this.exercises.set(exercises);

    const stillThere = exercises.some((e) => e.key === this.selectedKey());
    const key = stillThere ? this.selectedKey() : (exercises[0]?.key ?? '');
    this.selectedKey.set(key);
    this.ensureMetric();
    await this.loadPoints();
  }

  async onExerciseChange(key: string): Promise<void> {
    this.selectedKey.set(key);
    this.ensureMetric();
    await this.loadPoints();
  }

  onMetricChange(metric: string): void {
    this.metric.set(metric as ExerciseMetric);
    this.renderChart();
  }

  metricLabel(metric: ExerciseMetric): string {
    return `deporte.metric.${metric}`;
  }

  private ensureMetric(): void {
    const allowed = this.metrics();
    if (!allowed.includes(this.metric())) this.metric.set(allowed[0]);
  }

  private async loadPoints(): Promise<void> {
    const key = this.selectedKey();
    this.points.set(key ? await this.workouts.history(key) : []);
    this.renderChart();
  }

  private renderChart(): void {
    const points = this.points();
    const accent = this.cssVar('--app-accent') || '#0ea5e9';
    this.chartData.set({
      labels: points.map((p) => p.date.slice(5)),
      datasets: [
        {
          data: points.map((p) => metricValue(p, this.metric())),
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

  /** Read a design token so canvas charts match the active light/dark theme. */
  private cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  private buildOptions(): ChartConfiguration<'line'>['options'] {
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
          beginAtZero: false,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 5 },
        },
      },
    } as unknown as ChartConfiguration<'line'>['options'];
  }
}
