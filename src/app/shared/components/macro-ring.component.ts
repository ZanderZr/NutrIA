import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  signal,
} from '@angular/core';

/**
 * Circular calorie-progress ring drawn with SVG (no chart dependency).
 * Uses a soft track plus a gradient progress arc, and turns amber/red when the
 * target is exceeded so the state reads at a glance.
 */
@Component({
  selector: 'app-macro-ring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './macro-ring.component.html',
  styleUrl: './macro-ring.component.scss',
})
export class MacroRingComponent {
  @Input() size = 180;
  @Input() stroke = 14;
  @Input() consumed = 0;
  @Input() target = 0;

  /** Unique gradient id so multiple rings on one screen don't clash. */
  readonly gradId = `ring-grad-${Math.random().toString(36).slice(2, 8)}`;

  private readonly _progress = signal(0);

  @Input() set progress(v: number) {
    this._progress.set(Math.max(0, v));
  }

  readonly over = computed(() => this._progress() > 1.001);

  arcStart = () => 'var(--app-primary)';
  arcEnd = () => (this.over() ? 'var(--app-warning)' : 'var(--app-primary-strong)');

  get half(): number {
    return this.size / 2;
  }
  get radius(): number {
    return this.size / 2 - this.stroke;
  }
  get circumference(): number {
    return 2 * Math.PI * this.radius;
  }

  /** Clamp the drawn arc to one full turn even when the goal is exceeded. */
  readonly dashOffset = computed(
    () => this.circumference * (1 - Math.min(1, this._progress())),
  );
}
