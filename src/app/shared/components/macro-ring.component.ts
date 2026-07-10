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
  template: `
    <div
      class="ring"
      [style.width.px]="size"
      [style.height.px]="size"
      [style.--ring-size]="size"
      [class.over]="over()"
    >
      <svg [attr.viewBox]="'0 0 ' + size + ' ' + size" aria-hidden="true">
        <defs>
          <linearGradient [attr.id]="gradId" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" [attr.stop-color]="arcStart()" />
            <stop offset="100%" [attr.stop-color]="arcEnd()" />
          </linearGradient>
        </defs>
        <circle
          [attr.cx]="half"
          [attr.cy]="half"
          [attr.r]="radius"
          fill="none"
          stroke="var(--app-track)"
          [attr.stroke-width]="stroke"
        />
        <circle
          class="arc"
          [attr.cx]="half"
          [attr.cy]="half"
          [attr.r]="radius"
          fill="none"
          [attr.stroke]="'url(#' + gradId + ')'"
          [attr.stroke-width]="stroke"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="dashOffset()"
          [attr.transform]="'rotate(-90 ' + half + ' ' + half + ')'"
        />
      </svg>
      <div class="center">
        <div class="value num">{{ consumed }}</div>
        <div class="label">/ {{ target }} kcal</div>
      </div>
    </div>
  `,
  styles: [
    `
      .ring {
        position: relative;
        display: inline-block;
      }
      svg {
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .arc {
        transition: stroke-dashoffset var(--app-dur-slow) var(--app-ease-out);
        filter: drop-shadow(0 2px 6px rgba(var(--app-primary-rgb), 0.35));
      }
      .center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }
      .value {
        font-size: calc(var(--ring-size, 180) * 0.19px);
        font-weight: var(--app-weight-bold);
        line-height: 1;
        letter-spacing: var(--app-tracking-tight);
        color: var(--app-text);
      }
      .label {
        font-size: calc(var(--ring-size, 180) * 0.072px);
        font-weight: var(--app-weight-medium);
        color: var(--app-text-3);
      }
      .ring.over .value {
        color: var(--app-warning);
      }
    `,
  ],
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
