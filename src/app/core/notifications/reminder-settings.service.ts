import { Injectable, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { MealReminderService, MealTimes } from './meal-reminder.service';
import { WeighInNotificationService } from './weigh-in-notification.service';
import { BackupReminderService } from './backup-reminder.service';

const KEY = 'reminder_settings';

interface StoredSettings {
  mealsEnabled: boolean;
  mealTimes: MealTimes;
  weighInEnabled: boolean;
  backupReminderEnabled: boolean;
  /** Silent daily on-device auto-backup (a data feature, not a notification). */
  autoBackupEnabled: boolean;
}

const DEFAULTS: StoredSettings = {
  mealsEnabled: false,
  mealTimes: { breakfast: '09:00', lunch: '14:00', dinner: '21:00' },
  weighInEnabled: true,
  backupReminderEnabled: false,
  autoBackupEnabled: true,
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
  private backupReminder = inject(BackupReminderService);

  readonly mealsEnabled = signal(DEFAULTS.mealsEnabled);
  readonly mealTimes = signal<MealTimes>(DEFAULTS.mealTimes);
  readonly weighInEnabled = signal(DEFAULTS.weighInEnabled);
  readonly backupReminderEnabled = signal(DEFAULTS.backupReminderEnabled);
  readonly autoBackupEnabled = signal(DEFAULTS.autoBackupEnabled);

  /** Load saved preferences and (re)apply all scheduled notifications. */
  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      try {
        const s = { ...DEFAULTS, ...(JSON.parse(value) as StoredSettings) };
        this.mealsEnabled.set(s.mealsEnabled);
        this.mealTimes.set(s.mealTimes);
        this.weighInEnabled.set(s.weighInEnabled);
        this.backupReminderEnabled.set(s.backupReminderEnabled);
        this.autoBackupEnabled.set(s.autoBackupEnabled);
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

  async setBackupReminderEnabled(on: boolean): Promise<void> {
    this.backupReminderEnabled.set(on);
    await this.persist();
    if (on) await this.backupReminder.schedule();
    else await this.backupReminder.cancel();
  }

  async setAutoBackupEnabled(on: boolean): Promise<void> {
    this.autoBackupEnabled.set(on);
    await this.persist();
  }

  /** (Re)apply every reminder from the current settings. */
  private async apply(): Promise<void> {
    await this.applyMeals();
    if (this.weighInEnabled()) await this.weighIn.schedule();
    else await this.weighIn.cancel();
    if (this.backupReminderEnabled()) await this.backupReminder.schedule();
    else await this.backupReminder.cancel();
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
      backupReminderEnabled: this.backupReminderEnabled(),
      autoBackupEnabled: this.autoBackupEnabled(),
    };
    await Preferences.set({ key: KEY, value: JSON.stringify(data) });
  }
}
