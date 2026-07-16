import { Component, inject, signal } from '@angular/core';
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
  IonSkeletonText,
  ActionSheetController,
  AlertController,
  ToastController,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

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
import { HapticsService } from '@core/haptics/haptics.service';
import { EditMealModalComponent } from './edit-meal-modal.component';
import {
  MEAL_TYPE_LABELS,
  MealType,
  Meal,
  recommendedFiber,
} from '@domain/models/meal.model';
import { friendlyDate, toLocalTime, toLocalDateKey, addDays } from '@shared/utils/date.util';

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
    IonSkeletonText,
    MacroRingComponent,
    NutrientBarComponent,
    TranslocoModule,
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
  private t = inject(TranslocoService);
  private haptics = inject(HapticsService);

  readonly mealLabels = MEAL_TYPE_LABELS;
  private mealLabel(type: MealType): string {
    return this.t.translate('meal.' + type);
  }

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
    if (r >= 0) return this.t.translate('dashboard.remainingLeft', { kcal: Math.round(r) });
    return this.t.translate('dashboard.remainingOver', { kcal: Math.abs(Math.round(r)) });
  }

  mealItemsText(items: { name: string }[]): string {
    return items.map((i) => i.name).join(', ');
  }

  /** Local 'HH:MM' the meal was logged at, for the card. */
  mealTime(meal: Meal): string {
    return toLocalTime(new Date(meal.logged_at));
  }

  readonly waterGlass = WATER_GLASS_ML;
  readonly waterBottle = WATER_BOTTLE_ML;
  /** Placeholder rows shown while the day's meals load. */
  readonly skeletonRows = [0, 1, 2];

  /** Show "copy yesterday" only when today is empty and yesterday has meals. */
  readonly canCopyYesterday = signal(false);
  /** Briefly true when a streak milestone is reached, to play the celebration. */
  readonly celebrating = signal(false);

  async ionViewWillEnter(): Promise<void> {
    await this.dashboard.refresh();
    await this.water.load(this.dashboard.activeDate());
    await this.maybeCelebrateStreak(this.dashboard.streak());
    await this.refreshCopyYesterday();
  }

  private async refreshCopyYesterday(): Promise<void> {
    const today = toLocalDateKey();
    const onToday = this.dashboard.activeDate() === today;
    const empty = this.dashboard.meals().length === 0;
    const yCount = onToday && empty
      ? await this.dashboard.mealCountOn(addDays(today, -1))
      : 0;
    this.canCopyYesterday.set(yCount > 0);
  }

  /** Copy all of yesterday's meals into today (for people who eat similarly). */
  async copyYesterday(): Promise<void> {
    const today = toLocalDateKey();
    const n = await this.dashboard.copyDay(addDays(today, -1), today);
    void this.haptics.success();
    this.canCopyYesterday.set(false);
    await this.notify(this.t.translate('dashboard.copiedToast', { count: n }));
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
      void this.haptics.success();
      this.celebrating.set(true);
      setTimeout(() => this.celebrating.set(false), 2600);
      const t = await this.toast.create({
        message: this.t.translate('dashboard.streakToast', { count: reached }),
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
    void this.haptics.tap();
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.dashboard.refresh();
    await this.water.load(this.dashboard.activeDate());
    (ev.target as HTMLIonRefresherElement).complete();
  }

  /** Delete instantly and offer an "undo" — less friction than a confirm dialog. */
  async remove(meal: Meal): Promise<void> {
    await this.dashboard.deleteMeal(meal.id!);
    void this.haptics.warning();
    const toast = await this.toast.create({
      message: this.t.translate('dashboard.deletedToast'),
      duration: 5000,
      position: 'bottom',
      buttons: [
        {
          text: this.t.translate('common.undo'),
          handler: () => {
            void this.dashboard.restoreMeal(meal).then(() => this.haptics.success());
          },
        },
      ],
    });
    await toast.present();
  }

  /** Open the per-meal actions menu (visible, discoverable — no swipe needed). */
  async openActions(meal: Meal): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: this.mealLabel(meal.meal_type),
      buttons: [
        {
          text: this.t.translate('dashboard.actionEdit'),
          icon: 'create-outline',
          handler: () => void this.openEdit(meal),
        },
        {
          text: this.t.translate('dashboard.actionRepeat'),
          icon: 'repeat-outline',
          handler: () => void this.repeat(meal),
        },
        {
          text: this.t.translate('dashboard.actionSaveFav'),
          icon: 'star-outline',
          handler: () => void this.saveFavorite(meal),
        },
        {
          text: this.t.translate('common.delete'),
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => void this.remove(meal),
        },
        { text: this.t.translate('common.cancel'), role: 'cancel' },
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
    await this.notify(this.t.translate('dashboard.repeatedToast'));
  }

  /** Prompt for a name and save the meal as a reusable favorite. */
  async saveFavorite(meal: Meal): Promise<void> {
    const alert = await this.alerts.create({
      header: this.t.translate('dashboard.saveFavTitle'),
      message: this.t.translate('dashboard.saveFavMsg'),
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: this.mealLabel(meal.meal_type),
          placeholder: this.t.translate('dashboard.saveFavPlaceholder'),
        },
      ],
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.save'),
          handler: (data: { name: string }) => {
            const name = (data.name || '').trim();
            if (!name) return false;
            this.favorites
              .saveFromMeal(name, meal)
              .then(() => {
                void this.haptics.success();
                return this.notify(this.t.translate('dashboard.savedToast', { name }));
              });
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
