import { Component, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonButton,
  IonRefresher,
  IonRefresherContent,
  ActionSheetController,
  AlertController,
  ToastController,
  ModalController,
} from '@ionic/angular/standalone';

import { DashboardFacade } from '@core/state/dashboard.facade';
import { ProfileFacade } from '@core/state/profile.facade';
import { FavoritesFacade } from '@core/state/favorites.facade';
import {
  WaterFacade,
  WATER_GLASS_ML,
  WATER_BOTTLE_ML,
} from '@core/state/water.facade';
import { MacroRingComponent } from '@shared/components/macro-ring.component';
import { NutrientBarComponent } from '@shared/components/nutrient-bar.component';
import { EditMealModalComponent } from './edit-meal-modal.component';
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
    IonButton,
    IonRefresher,
    IonRefresherContent,
    MacroRingComponent,
    NutrientBarComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  dashboard = inject(DashboardFacade);
  profile = inject(ProfileFacade);
  water = inject(WaterFacade);
  private favorites = inject(FavoritesFacade);
  private actionSheet = inject(ActionSheetController);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);
  private modalCtrl = inject(ModalController);

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

  readonly waterGlass = WATER_GLASS_ML;
  readonly waterBottle = WATER_BOTTLE_ML;

  async ionViewWillEnter(): Promise<void> {
    await this.water.load(this.dashboard.activeDate());
    await this.maybeCelebrateStreak(this.dashboard.streak());
  }

  /** Celebrate reaching a streak milestone (3/7/30/…) once each. */
  private async maybeCelebrateStreak(streak: number): Promise<void> {
    const milestones = [3, 7, 30, 60, 100, 365];
    const reached = milestones.filter((m) => streak >= m).pop() ?? 0;
    const { value } = await Preferences.get({ key: 'streak_celebrated' });
    const celebrated = value ? Number(value) : 0;
    if (reached === celebrated) return;
    await Preferences.set({ key: 'streak_celebrated', value: String(reached) });
    if (reached > celebrated) {
      const t = await this.toast.create({
        message: `🔥 ¡Racha de ${reached} días! Sigue así.`,
        duration: 2600,
        position: 'top',
      });
      await t.present();
    }
  }

  /** Litres, one decimal, for compact display (e.g. "1.2"). */
  litres(ml: number): string {
    return (ml / 1000).toFixed(1);
  }

  async addWater(ml: number): Promise<void> {
    await this.water.add(ml);
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.dashboard.refresh();
    await this.water.load(this.dashboard.activeDate());
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
          text: 'Editar',
          icon: 'create-outline',
          handler: () => void this.openEdit(meal),
        },
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

  /** Open the editor for a logged meal's items. */
  async openEdit(meal: Meal): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: EditMealModalComponent,
      componentProps: { meal },
      presentingElement:
        (document.querySelector('ion-router-outlet') as HTMLElement) ?? undefined,
    });
    await modal.present();
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
