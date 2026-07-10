import { AfterViewChecked, Component, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonFooter,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  ModalController,
} from '@ionic/angular/standalone';

import { ChatFacade, DayProgress } from '@core/state/chat.facade';
import { DashboardFacade } from '@core/state/dashboard.facade';
import { FavoritesFacade } from '@core/state/favorites.facade';
import { MacroRingComponent } from '@shared/components/macro-ring.component';
import { FavoritesModalComponent } from './favorites-modal.component';
import { AddFoodModalComponent } from './add-food-modal.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonFooter,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
    MacroRingComponent,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Registrar</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" (click)="openFavorites()" aria-label="Favoritos">
            <ion-icon slot="icon-only" name="star-outline"></ion-icon>
          </ion-button>
          <ion-button fill="clear" (click)="openAddFood()" aria-label="Añadir alimento">
            <ion-icon slot="icon-only" name="add-circle-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content #content>
      <div class="content-wrap chat-wrap">
        <!-- Remaining-today summary -->
        <div class="mini-summary app-card">
          <app-macro-ring
            [size]="76"
            [stroke]="8"
            [consumed]="dashboard.summary().calories"
            [target]="dashboard.summary().calories + max0(dashboard.remaining().calories)"
            [progress]="dashboard.calorieProgress()"
          ></app-macro-ring>
          <div class="rem">
            <span class="rem-label text-muted">Te quedan hoy</span>
            <strong class="rem-kcal num">{{ max0(dashboard.remaining().calories) | number: '1.0-0' }} kcal</strong>
            <div class="rem-macros">
              <span class="rem-tag"><i style="background:var(--macro-protein)"></i>{{ max0(dashboard.remaining().protein_g) }}g</span>
              <span class="rem-tag"><i style="background:var(--macro-carbs)"></i>{{ max0(dashboard.remaining().carbs_g) }}g</span>
              <span class="rem-tag"><i style="background:var(--macro-fat)"></i>{{ max0(dashboard.remaining().fat_g) }}g</span>
            </div>
          </div>
        </div>

        @if (!chat.messages().length) {
          <div class="empty-state chat-empty">
            <div class="empty-badge"><ion-icon name="restaurant-outline"></ion-icon></div>
            <p>
              Escribe lo que has comido con tus palabras.<br />
              <span class="text-muted">Ej: “dos huevos, una tostada con aguacate y un café con leche”.</span>
            </p>
            @if (favorites.favorites().length) {
              <p class="text-muted small">
                O pulsa <ion-icon name="star-outline"></ion-icon> arriba para añadir un favorito.
              </p>
            }
          </div>
        } @else {
          <div class="day-sep"><span>Hoy</span></div>
        }

        @for (m of chat.messages(); track m.id) {
          <div
            class="row"
            [class.mine]="m.role === 'user'"
          >
            <div
              class="bubble"
              [class.user]="m.role === 'user'"
              [class.err]="m.error"
              [class.wide]="m.progress || m.recommendation"
            >
              <p class="bubble-text">{{ m.text }}</p>

              @if (m.meal) {
                <div class="nutri-card">
                  <div class="items">
                    @for (it of m.meal.items; track $index) {
                      <span class="food-chip" [class.low]="it.confidence < 0.5">
                        {{ it.name }} <b class="num">{{ it.calories }}</b>
                      </span>
                    }
                  </div>
                  <div class="nutri-totals">
                    <div class="tot cal"><span class="num">{{ m.meal.total_calories }}</span><small>kcal</small></div>
                    <div class="tot"><span class="num">{{ m.meal.total_protein_g | number: '1.0-0' }}</span><small>P</small></div>
                    <div class="tot"><span class="num">{{ m.meal.total_carbs_g | number: '1.0-0' }}</span><small>C</small></div>
                    <div class="tot"><span class="num">{{ m.meal.total_fat_g | number: '1.0-0' }}</span><small>G</small></div>
                  </div>
                </div>
              }

              @if (m.progress) {
                <div class="progress-card">
                  @for (row of progressRows(m.progress); track row.label) {
                    <div class="prow">
                      <span class="prow-label">{{ row.label }}</span>
                      <span class="prow-vals num">
                        {{ row.consumed | number: '1.0-0' }}<span class="text-muted">/{{ row.target | number: '1.0-0' }}{{ row.unit }}</span>
                      </span>
                      <span
                        class="prow-diff"
                        [class.over]="row.diff < 0 && row.overIsBad"
                        [class.good]="row.diff < 0 && !row.overIsBad"
                      >
                        @if (row.diff >= 0) {
                          faltan {{ row.diff | number: '1.0-0' }}{{ row.unit }}
                        } @else if (row.overIsBad) {
                          +{{ -row.diff | number: '1.0-0' }}{{ row.unit }}
                        } @else {
                          ✓
                        }
                      </span>
                    </div>
                  }
                </div>

                <ion-button
                  expand="block"
                  size="small"
                  fill="outline"
                  (click)="chat.askRecommendation()"
                  [disabled]="chat.busy()"
                >
                  <ion-icon slot="start" name="bulb-outline"></ion-icon>
                  Sugerir siguiente comida
                </ion-button>
              }

              @if (m.recommendation) {
                <div class="options">
                  @for (opt of m.recommendation.options; track $index) {
                    <div class="option">
                      <div class="option-head">
                        <span class="option-idx num">{{ $index + 1 }}</span>
                        <span class="option-name">{{ opt.suggestion }}</span>
                      </div>
                      <div class="option-macros num">
                        ~{{ opt.approx.calories }} kcal · P
                        {{ opt.approx.protein_g | number: '1.0-0' }} · C
                        {{ opt.approx.carbs_g | number: '1.0-0' }} · G
                        {{ opt.approx.fat_g | number: '1.0-0' }}
                      </div>
                      <div class="option-why">{{ opt.rationale }}</div>
                      <ion-button
                        size="small"
                        fill="clear"
                        (click)="pick(opt.suggestion)"
                        [disabled]="chat.busy()"
                      >
                        <ion-icon slot="start" name="add-outline"></ion-icon>
                        Registrar esta
                      </ion-button>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (chat.busy()) {
          <div class="row">
            <div class="bubble typing"><ion-spinner name="dots"></ion-spinner></div>
          </div>
        }
      </div>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <div class="composer content-wrap">
          <ion-button
            fill="clear"
            class="composer-icon"
            (click)="chat.askRecommendation()"
            [disabled]="chat.busy()"
            title="Sugerencia"
            aria-label="Pedir sugerencia"
          >
            <ion-icon slot="icon-only" name="bulb-outline"></ion-icon>
          </ion-button>
          <ion-input
            class="composer-input"
            [(ngModel)]="draft"
            placeholder="¿Qué has comido?"
            (keyup.enter)="send()"
            [disabled]="chat.busy()"
          ></ion-input>
          <ion-button
            class="composer-send"
            (click)="send()"
            [disabled]="chat.busy() || !draft.trim()"
            aria-label="Enviar"
          >
            <ion-icon slot="icon-only" name="send"></ion-icon>
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [
    `
      .chat-wrap { padding-bottom: var(--sp-2); }

      /* Remaining-today summary card */
      .mini-summary {
        display: flex;
        align-items: center;
        gap: var(--sp-4);
        padding: var(--sp-3) var(--sp-4);
        margin: var(--sp-3) 0 var(--sp-4);
        position: sticky;
        top: 0;
        z-index: 5;
      }
      .rem { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .rem-label { font-size: var(--app-text-xs); font-weight: var(--app-weight-medium); }
      .rem-kcal { font-size: var(--app-text-lg); color: var(--app-text); }
      .rem-macros { display: flex; gap: var(--sp-3); margin-top: 2px; }
      .rem-tag {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: var(--app-text-xs);
        font-weight: var(--app-weight-semibold);
        color: var(--app-text-2);
      }
      .rem-tag i { width: 7px; height: 7px; border-radius: var(--r-full); display: inline-block; }

      /* Empty state */
      .chat-empty { margin-top: 10vh; }
      .chat-empty .empty-badge {
        width: 68px;
        height: 68px;
        border-radius: var(--r-lg);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--app-primary-soft);
      }
      .chat-empty .empty-badge ion-icon { font-size: 2rem; color: var(--app-primary); opacity: 1; }
      .chat-empty p { line-height: var(--app-leading-normal); }
      .chat-empty .small { font-size: var(--app-text-sm); }
      .chat-empty .small ion-icon { vertical-align: -2px; font-size: 1rem; }

      /* Date separator */
      .day-sep {
        display: flex;
        justify-content: center;
        margin: var(--sp-3) 0 var(--sp-4);
      }
      .day-sep span {
        font-size: var(--app-text-2xs);
        font-weight: var(--app-weight-bold);
        letter-spacing: var(--app-tracking-wide);
        text-transform: uppercase;
        color: var(--app-text-3);
        background: var(--app-surface-2);
        padding: 4px var(--sp-3);
        border-radius: var(--r-full);
      }

      /* Message rows & bubbles */
      .row { display: flex; margin: var(--sp-2) 0; }
      .row.mine { justify-content: flex-end; }
      .bubble {
        max-width: 84%;
        padding: var(--sp-3) var(--sp-4);
        border-radius: var(--r-lg);
        border-bottom-left-radius: var(--r-xs);
        background: var(--app-surface);
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-xs);
        animation: app-rise var(--app-dur) var(--app-ease-out) both;
      }
      .bubble.user {
        background: var(--app-primary);
        color: var(--app-on-primary);
        border-color: transparent;
        border-radius: var(--r-lg);
        border-bottom-right-radius: var(--r-xs);
        box-shadow: var(--app-shadow-primary);
      }
      .bubble.err { border-color: var(--app-danger); background: var(--app-danger-soft); }
      .bubble.wide { max-width: 94%; }
      .bubble-text { margin: 0; font-size: var(--app-text-base); line-height: var(--app-leading-snug); }

      /* Nutrition card inside a message */
      .nutri-card {
        margin-top: var(--sp-3);
        padding: var(--sp-3);
        background: var(--app-surface-2);
        border-radius: var(--r-sm);
      }
      .items { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
      .food-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px var(--sp-2) 4px var(--sp-3);
        background: var(--app-surface);
        border: 1px solid var(--app-border);
        border-radius: var(--r-full);
        font-size: var(--app-text-xs);
        font-weight: var(--app-weight-medium);
        color: var(--app-text);
      }
      .food-chip b {
        background: var(--app-primary-soft);
        color: var(--app-primary);
        padding: 1px 6px;
        border-radius: var(--r-full);
        font-size: var(--app-text-2xs);
      }
      .food-chip.low { border-style: dashed; border-color: var(--app-warning); opacity: 0.85; }
      .nutri-totals {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--sp-2);
        margin-top: var(--sp-3);
        text-align: center;
      }
      .nutri-totals .tot { display: flex; flex-direction: column; }
      .nutri-totals .tot span { font-size: var(--app-text-md); font-weight: var(--app-weight-bold); color: var(--app-text); }
      .nutri-totals .tot small { font-size: var(--app-text-2xs); color: var(--app-text-3); font-weight: var(--app-weight-medium); }
      .nutri-totals .tot.cal span { color: var(--app-primary); }

      /* "What's left today" card */
      .progress-card {
        margin: var(--sp-3) 0;
        border-radius: var(--r-sm);
        overflow: hidden;
      }
      .prow {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: var(--sp-3);
        padding: var(--sp-2) 0;
        border-bottom: 1px solid var(--app-border);
        font-size: var(--app-text-sm);
      }
      .prow:last-child { border-bottom: 0; }
      .prow-label { font-weight: var(--app-weight-semibold); }
      .prow-vals { color: var(--app-text); font-weight: var(--app-weight-semibold); }
      .prow-vals .text-muted { font-weight: var(--app-weight-regular); }
      .prow-diff {
        justify-self: end;
        font-size: var(--app-text-xs);
        font-weight: var(--app-weight-semibold);
        color: var(--app-text-3);
        white-space: nowrap;
      }
      .prow-diff.over { color: var(--app-danger); }
      .prow-diff.good { color: var(--app-success); }

      /* Recommendations */
      .options { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-3); }
      .option {
        border: 1px solid var(--app-border);
        border-radius: var(--r-sm);
        padding: var(--sp-3);
        background: var(--app-surface-2);
      }
      .option-head { display: flex; align-items: center; gap: var(--sp-2); }
      .option-idx {
        flex: 0 0 24px;
        width: 24px;
        height: 24px;
        border-radius: var(--r-full);
        background: var(--app-primary);
        color: var(--app-on-primary);
        font-size: var(--app-text-xs);
        font-weight: var(--app-weight-bold);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .option-name { font-weight: var(--app-weight-semibold); font-size: var(--app-text-base); }
      .option-macros { font-size: var(--app-text-xs); color: var(--app-text-3); margin: var(--sp-2) 0 4px; }
      .option-why { font-size: var(--app-text-sm); line-height: var(--app-leading-snug); margin-bottom: var(--sp-1); }

      /* Typing indicator */
      .typing { width: auto; padding: var(--sp-3) var(--sp-4); }
      .typing ion-spinner { width: 34px; height: 18px; }

      /* Composer */
      .composer {
        display: flex;
        align-items: center;
        gap: var(--sp-1);
        padding: var(--sp-2) var(--sp-2);
      }
      .composer-icon { --color: var(--app-text-3); margin: 0; }
      .composer-input {
        --background: var(--app-surface-2);
        --padding-start: var(--sp-4);
        --padding-end: var(--sp-4);
        border: 1px solid var(--app-border);
        border-radius: var(--r-full);
        min-height: 44px;
      }
      .composer-send {
        --padding-start: 0;
        --padding-end: 0;
        --border-radius: var(--r-full);
        width: 44px;
        height: 44px;
        margin: 0;
      }
    `,
  ],
})
export class ChatPage implements AfterViewChecked {
  chat = inject(ChatFacade);
  dashboard = inject(DashboardFacade);
  favorites = inject(FavoritesFacade);
  private modalCtrl = inject(ModalController);

  @ViewChild('content') private content?: IonContent;

  draft = '';
  private lastCount = 0;

  async ionViewWillEnter(): Promise<void> {
    await this.favorites.load();
  }

  /** Open the favorites picker modal (choose one to log, or delete). */
  async openFavorites(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: FavoritesModalComponent,
    });
    await modal.present();
  }

  /** Open the structured "add food" form (manual entry or AI auto-calc). */
  async openAddFood(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddFoodModalComponent,
    });
    await modal.present();
  }

  async send(): Promise<void> {
    const text = this.draft;
    this.draft = '';
    await this.chat.logMeal(text);
  }

  /** Log one of the recommended options straight through the parse pipeline. */
  async pick(suggestion: string): Promise<void> {
    await this.chat.logMeal(suggestion);
  }

  /** Build the "what's left today" table rows. diff > 0 = falta, < 0 = exceso. */
  progressRows(p: DayProgress): {
    label: string;
    unit: string;
    target: number;
    consumed: number;
    diff: number;
    /** True when exceeding the target is a concern (energy macros). */
    overIsBad: boolean;
  }[] {
    const t = p.targets;
    const c = p.consumed;
    return [
      { label: 'Calorías', unit: '', target: t.calories, consumed: c.calories, diff: t.calories - c.calories, overIsBad: true },
      { label: 'Proteína', unit: 'g', target: t.protein_g, consumed: c.protein_g, diff: t.protein_g - c.protein_g, overIsBad: false },
      { label: 'Hidratos', unit: 'g', target: t.carbs_g, consumed: c.carbs_g, diff: t.carbs_g - c.carbs_g, overIsBad: true },
      { label: 'Grasa', unit: 'g', target: t.fat_g, consumed: c.fat_g, diff: t.fat_g - c.fat_g, overIsBad: true },
      { label: 'Fibra', unit: 'g', target: p.fiber.target, consumed: p.fiber.consumed, diff: p.fiber.target - p.fiber.consumed, overIsBad: false },
    ];
  }

  max0(v: number): number {
    return Math.max(0, v);
  }

  ngAfterViewChecked(): void {
    const count = this.chat.messages().length;
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.content?.scrollToBottom(300);
    }
  }
}
