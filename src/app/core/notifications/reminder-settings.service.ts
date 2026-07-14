import { Injectable, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { MealReminderService, MealTimes } from './meal-reminder.service';
import { WeighInNotificationService } from './weigh-in-notification.service';

const KEY = 'reminder_settings';

interface StoredSettings {
  mealsEnabled: boolean;
  mealTimes: MealTimes;
  weighInEnabled: boolean;
}

const DEFAULTS: StoredSettings = {
  mealsEnabled: false,
  mealTimes: { breakfast: '09:00', lunch: '14:00', dinner: '21:00' },
  weighInEnabled: true,
};

/**
 * Owns the user's reminder preferences (persisted with Preferences, like
 * ThemeService) and keeps the scheduled notifications in sync. Meal reminders
 * fire at fixed daily times; the weekly weigh-in reminder can be toggled off.
 */
@Injectable({ providedIn: 'root' })
export class ReminderSettingsService {
  private meals = inject(MealReminderService);
  private weighIn = inject(WeighInNotificationService);

  readonly mealsEnabled = signal(DEFAULTS.mealsEnabled);
  readonly mealTimes = signal<MealTimes>(DEFAULTS.mealTimes);
  readonly weighInEnabled = signal(DEFAULTS.weighInEnabled);

  /** Load saved preferences and (re)apply all scheduled notifications. */
  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      try {
        const s = { ...DEFAULTS, ...(JSON.parse(value) as StoredSettings) };
        this.mealsEnabled.set(s.mealsEnabled);
        this.mealTimes.set(s.mealTimes);
        this.weighInEnabled.set(s.weighInEnabled);
      } catch {
        /* keep defaults on corrupt data */
      }
    }
    await this.apply();
  }

  async setMealsEnabled(on: boolean): Promise<void> {
    this.mealsEnabled.set(on);
    await this.persist();
    await this.applyMeals();
  }

  async setMealTime(meal: keyof MealTimes, hhmm: string): Promise<void> {
    this.mealTimes.update((t) => ({ ...t, [meal]: hhmm }));
    await this.persist();
    await this.applyMeals();
  }

  async setWeighInEnabled(on: boolean): Promise<void> {
    this.weighInEnabled.set(on);
    await this.persist();
    if (on) await this.weighIn.schedule();
    else await this.weighIn.cancel();
  }

  /** (Re)apply every reminder from the current settings. */
  private async apply(): Promise<void> {
    await this.applyMeals();
    if (this.weighInEnabled()) await this.weighIn.schedule();
    else await this.weighIn.cancel();
  }

  private async applyMeals(): Promise<void> {
    if (this.mealsEnabled()) await this.meals.schedule(this.mealTimes());
    else await this.meals.cancelAll();
  }

  private async persist(): Promise<void> {
    const data: StoredSettings = {
      mealsEnabled: this.mealsEnabled(),
      mealTimes: this.mealTimes(),
      weighInEnabled: this.weighInEnabled(),
    };
    await Preferences.set({ key: KEY, value: JSON.stringify(data) });
  }
}
