import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type Diet = 'omnivore' | 'vegetarian' | 'vegan';
export const DIETS: Diet[] = ['omnivore', 'vegetarian', 'vegan'];

const STORAGE_KEY = 'app_diet';

/**
 * The user's dietary preference, used to constrain AI meal recommendations.
 * Device-level setting persisted with Capacitor Preferences (like the theme
 * and language), independent of the profile/backup data.
 */
@Injectable({ providedIn: 'root' })
export class DietService {
  readonly diet = signal<Diet>('omnivore');

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value === 'vegetarian' || value === 'vegan' || value === 'omnivore') {
      this.diet.set(value);
    }
  }

  async set(diet: Diet): Promise<void> {
    this.diet.set(diet);
    await Preferences.set({ key: STORAGE_KEY, value: diet });
  }
}
