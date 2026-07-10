import { Component, inject } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  ActionSheetController,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';

import { DashboardFacade } from '@core/state/dashboard.facade';
import { ProfileFacade } from '@core/state/profile.facade';
import { FavoritesFacade } from '@core/state/favorites.facade';
import { MacroRingComponent } from '@shared/components/macro-ring.component';
import { NutrientBarComponent } from '@shared/components/nutrient-bar.component';
import {
  MEAL_TYPE_LABELS,
  MealType,
  Meal,
  recommendedFiber,
} from '@domain/models/meal.model';
import { friendlyDate } from '@shared/utils/date.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    MacroRingComponent,
    NutrientBarComponent,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Hoy</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="content-wrap">
        <p class="day-label text-secondary">{{ title() }}</p>

        <!-- Calorie hero -->
        <section class="hero animate-rise">
          <app-macro-ring
            [size]="196"
            [stroke]="15"
            [consumed]="dashboard.summary().calories"
            [target]="profile.targets().calories"
            [progress]="dashboard.calorieProgress()"
          ></app-macro-ring>
          <div class="remaining-pill" [class.over]="remaining() < 0">
            <ion-icon [name]="remaining() >= 0 ? 'flame' : 'flame-outline'"></ion-icon>
            {{ remainingLabel() }}
          </div>
        </section>

        <!-- Macro breakdown -->
        <section class="app-card macros animate-rise" style="animation-delay:60ms">
          <app-nutrient-bar
            label="Proteína"
            color="var(--macro-protein)"
            [consumed]="dashboard.summary().protein_g"
            [target]="profile.targets().protein_g"
          ></app-nutrient-bar>
          <app-nutrient-bar
            label="Hidratos"
            color="var(--macro-carbs)"
            [consumed]="dashboard.summary().carbs_g"
            [target]="profile.targets().carbs_g"
          ></app-nutrient-bar>
          <app-nutrient-bar
            label="Grasas"
            color="var(--macro-fat)"
            [consumed]="dashboard.summary().fat_g"
            [target]="profile.targets().fat_g"
          ></app-nutrient-bar>
          <app-nutrient-bar
            label="Fibra"
            color="var(--macro-fiber)"
            [consumed]="dashboard.summary().fiber_g"
            [target]="fiberTarget()"
          ></app-nutrient-bar>
        </section>

        <!-- Meals -->
        <h2 class="section-title">Comidas de hoy</h2>
        @if (!dashboard.meals().length) {
          <div class="app-card empty-state">
            <ion-icon name="restaurant-outline"></ion-icon>
            <p>Aún no has registrado nada.<br />Ve a “Registrar” para empezar.</p>
          </div>
        } @else {
          <div class="meal-list stagger">
            @for (meal of dashboard.meals(); track meal.id) {
              <div class="app-card meal-card app-pressable stagger-item" (click)="openActions(meal)">
                <div class="meal-icon" [style.background]="mealTint[meal.meal_type]">
                  <ion-icon [name]="mealIcons[meal.meal_type]"></ion-icon>
                </div>
                <div class="meal-body">
                  <h3>{{ mealLabels[meal.meal_type] }}</h3>
                  <p class="text-muted">{{ mealItemsText(meal.items) }}</p>
                </div>
                <div class="meal-kcal num">
                  {{ meal.total_calories }}<small>kcal</small>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .day-label {
        text-align: center;
        margin: var(--sp-1) 0 var(--sp-2);
        font-size: var(--app-text-sm);
        font-weight: var(--app-weight-medium);
      }
      .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--sp-4);
        padding: var(--sp-4) 0 var(--sp-6);
      }
      .remaining-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--sp-2);
        padding: var(--sp-2) var(--sp-4);
        border-radius: var(--r-full);
        background: var(--app-primary-soft);
        color: var(--app-primary);
        font-size: var(--app-text-sm);
        font-weight: var(--app-weight-semibold);
      }
      .remaining-pill.over {
        background: var(--app-warning-soft);
        color: var(--app-warning);
      }
      .remaining-pill ion-icon { font-size: 1rem; }

      .macros {
        padding: var(--sp-5);
      }

      .meal-list {
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
      }
      .meal-card {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        padding: var(--sp-3) var(--sp-4);
      }
      .meal-icon {
        flex: 0 0 auto;
        width: 42px;
        height: 42px;
        border-radius: var(--r-sm);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .meal-icon ion-icon { font-size: 1.35rem; color: #fff; }
      .meal-body { flex: 1 1 auto; min-width: 0; }
      .meal-body h3 {
        margin: 0 0 2px;
        font-size: var(--app-text-md);
        font-weight: var(--app-weight-semibold);
      }
      .meal-body p {
        margin: 0;
        font-size: var(--app-text-sm);
        line-height: var(--app-leading-snug);
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .meal-kcal {
        flex: 0 0 auto;
        font-weight: var(--app-weight-bold);
        font-size: var(--app-text-lg);
        color: var(--app-text);
      }
      .meal-kcal small {
        color: var(--app-text-3);
        font-size: var(--app-text-2xs);
        font-weight: var(--app-weight-medium);
        margin-left: 3px;
      }
    `,
  ],
})
export class DashboardPage {
  dashboard = inject(DashboardFacade);
  profile = inject(ProfileFacade);
  private favorites = inject(FavoritesFacade);
  private actionSheet = inject(ActionSheetController);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);

  readonly mealLabels = MEAL_TYPE_LABELS;

  /** Icon + soft tint per meal type, keeping the list scannable. */
  readonly mealIcons: Record<MealType, string> = {
    breakfast: 'sunny-outline',
    lunch: 'restaurant-outline',
    dinner: 'moon-outline',
    snack: 'nutrition-outline',
  };
  readonly mealTint: Record<MealType, string> = {
    breakfast: 'var(--macro-carbs)',
    lunch: 'var(--macro-calories)',
    dinner: 'var(--macro-fat)',
    snack: 'var(--macro-fiber)',
  };

  title(): string {
    return friendlyDate(this.dashboard.activeDate());
  }

  /** Remaining calories today (can go negative when over target). */
  remaining(): number {
    return this.dashboard.remaining().calories;
  }

  /** Recommended daily fiber, derived from the calorie target. */
  fiberTarget(): number {
    return recommendedFiber(this.profile.targets().calories);
  }

  remainingLabel(): string {
    const r = this.remaining();
    if (r >= 0) return `Te quedan ${Math.round(r)} kcal`;
    return `Has superado el objetivo en ${Math.abs(Math.round(r))} kcal`;
  }

  mealItemsText(items: { name: string }[]): string {
    return items.map((i) => i.name).join(', ');
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.dashboard.refresh();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  async remove(id: number): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Eliminar comida',
      message: '¿Seguro que quieres eliminar este registro?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => this.dashboard.deleteMeal(id),
        },
      ],
    });
    await alert.present();
  }

  /** Open the per-meal actions menu (visible, discoverable — no swipe needed). */
  async openActions(meal: Meal): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: this.mealLabels[meal.meal_type],
      buttons: [
        {
          text: 'Repetir hoy',
          icon: 'repeat-outline',
          handler: () => void this.repeat(meal),
        },
        {
          text: 'Guardar como favorito',
          icon: 'star-outline',
          handler: () => void this.saveFavorite(meal),
        },
        {
          text: 'Eliminar',
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => void this.remove(meal.id!),
        },
        { text: 'Cancelar', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async repeat(meal: Meal): Promise<void> {
    await this.dashboard.repeatMeal(meal);
    await this.notify('Comida repetida en el día de hoy.');
  }

  /** Prompt for a name and save the meal as a reusable favorite. */
  async saveFavorite(meal: Meal): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Guardar como favorito',
      message: 'Ponle un nombre para reutilizarlo con un toque.',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: this.mealLabels[meal.meal_type],
          placeholder: 'Ej: Mi desayuno de siempre',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: (data: { name: string }) => {
            const name = (data.name || '').trim();
            if (!name) return false;
            this.favorites
              .saveFromMeal(name, meal)
              .then(() => this.notify(`Guardado «${name}» en favoritos.`));
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 1600, position: 'bottom' });
    await t.present();
  }
}
