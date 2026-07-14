import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/** Labeled macro progress bar (consumed / target with a colored fill). */
@Component({
  selector: 'app-nutrient-bar',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nutrient-bar.component.html',
  styleUrl: './nutrient-bar.component.scss',
})
export class NutrientBarComponent {
  @Input() label = '';
  @Input() unit = 'g';
  @Input() color = 'var(--app-primary)';

  private readonly _consumed = signal(0);
  private readonly _target = signal(0);

  @Input() set consumed(v: number) {
    this._consumed.set(v);
  }
  get consumed(): number {
    return this._consumed();
  }

  @Input() set target(v: number) {
    this._target.set(v);
  }
  get target(): number {
    return this._target();
  }

  readonly percent = computed(() => {
    if (this._target() <= 0) return 0;
    return Math.min(100, (this._consumed() / this._target()) * 100);
  });
}
