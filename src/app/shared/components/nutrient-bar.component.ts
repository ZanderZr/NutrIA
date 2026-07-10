import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/** Labeled macro progress bar (consumed / target with a colored fill). */
@Component({
  selector: 'app-nutrient-bar',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <span class="name">
        <span class="dot" [style.background]="color"></span>
        {{ label }}
      </span>
      <span class="nums num">
        <strong>{{ consumed | number: '1.0-0' }}</strong>
        <span class="sep text-muted">/ {{ target | number: '1.0-0' }} {{ unit }}</span>
      </span>
    </div>
    <div class="track">
      <div
        class="fill"
        [style.width.%]="percent()"
        [style.background]="color"
      ></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      :host + :host {
        margin-top: var(--sp-4);
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: var(--app-text-sm);
        margin-bottom: var(--sp-2);
      }
      .name {
        display: inline-flex;
        align-items: center;
        gap: var(--sp-2);
        font-weight: var(--app-weight-semibold);
        color: var(--app-text);
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: var(--r-full);
        flex: 0 0 auto;
      }
      .nums strong {
        font-weight: var(--app-weight-bold);
        color: var(--app-text);
      }
      .nums .sep {
        font-weight: var(--app-weight-medium);
        margin-left: 2px;
      }
      .track {
        height: 8px;
        border-radius: var(--r-full);
        background: var(--app-track);
        overflow: hidden;
      }
      .fill {
        height: 100%;
        border-radius: var(--r-full);
        transition: width var(--app-dur-slow) var(--app-ease-out);
      }
    `,
  ],
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
