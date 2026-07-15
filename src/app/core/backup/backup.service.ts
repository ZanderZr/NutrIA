import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Preferences } from '@capacitor/preferences';

import { DatabaseService } from '@core/database/database.service';
import { MealRepository } from '@data/repositories/meal.repository';
import { WeightRepository } from '@data/repositories/weight.repository';
import { FavoriteRepository } from '@data/repositories/favorite.repository';
import { ProfileRepository } from '@data/repositories/profile.repository';
import { WaterRepository } from '@data/repositories/water.repository';
import { Meal } from '@domain/models/meal.model';
import { Favorite } from '@domain/models/favorite.model';
import { WeightEntry } from '@domain/models/weight.model';
import { UserProfile } from '@domain/models/user-profile.model';
import { toLocalDateKey } from '@shared/utils/date.util';

/** Everything needed to fully restore the app on another device. */
export interface BackupData {
  app: 'nutricontrol';
  version: 1;
  exportedAt: string;
  profile: UserProfile | null;
  meals: Meal[];
  weights: WeightEntry[];
  favorites: Favorite[];
  water?: { date: string; ml: number }[];
}

export interface RestoreResult {
  meals: number;
  weights: number;
  favorites: number;
}

/** Preferences keys for the last time a copy was made. */
const LAST_MANUAL = 'backup_last_manual';
const LAST_AUTO = 'backup_last_auto';

/**
 * Export/import of all app data as a single JSON file. On native it writes the
 * file and opens the share sheet; on web it downloads it. Import wipes the
 * current data and restores the backup (a full replace, not a merge).
 */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private db = inject(DatabaseService);
  private meals = inject(MealRepository);
  private weights = inject(WeightRepository);
  private favorites = inject(FavoriteRepository);
  private profiles = inject(ProfileRepository);
  private water = inject(WaterRepository);

  /** Gather all data into a portable JSON string. */
  async buildJson(): Promise<string> {
    const [profile, meals, weights, favorites, water] = await Promise.all([
      this.profiles.get(),
      this.meals.getAll(),
      this.weights.list(100000),
      this.favorites.list(),
      this.water.list(),
    ]);
    const data: BackupData = {
      app: 'nutricontrol',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
      meals,
      weights,
      favorites,
      water,
    };
    return JSON.stringify(data, null, 2);
  }

  /** Export the backup: share sheet on native, file download on web. */
  async exportData(): Promise<void> {
    const json = await this.buildJson();
    const filename = `nutricontrol-backup-${toLocalDateKey()}.json`;

    if (Capacitor.isNativePlatform()) {
      const { uri } = await Filesystem.writeFile({
        path: filename,
        data: json,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: 'Copia de seguridad de NutriControl',
        url: uri,
        dialogTitle: 'Guardar o compartir tu copia',
      });
      await this.markManualBackup();
      return;
    }

    // Web: trigger a download.
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    await this.markManualBackup();
  }

  /** Record that the user made (shared/downloaded) a copy just now. */
  async markManualBackup(): Promise<void> {
    await Preferences.set({ key: LAST_MANUAL, value: new Date().toISOString() });
  }

  /** Record that an automatic on-device copy was written just now. */
  async markAutoBackup(): Promise<void> {
    await Preferences.set({ key: LAST_AUTO, value: new Date().toISOString() });
  }

  /** ISO timestamp of the most recent copy (manual or auto), or null if none. */
  async lastBackupAt(): Promise<string | null> {
    const [m, a] = await Promise.all([
      Preferences.get({ key: LAST_MANUAL }),
      Preferences.get({ key: LAST_AUTO }),
    ]);
    const times = [m.value, a.value].filter(Boolean) as string[];
    if (!times.length) return null;
    return times.sort().at(-1) ?? null;
  }

  /** ISO of the last *manual* (off-device / shared) copy, or null. */
  async lastManualBackupAt(): Promise<string | null> {
    const { value } = await Preferences.get({ key: LAST_MANUAL });
    return value ?? null;
  }

  /** ISO of the last automatic on-device copy, or null. */
  async lastAutoBackupAt(): Promise<string | null> {
    const { value } = await Preferences.get({ key: LAST_AUTO });
    return value ?? null;
  }

  /** Parse a backup file's text; throws a friendly error if it's not valid. */
  parse(text: string): BackupData {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('El archivo no es un JSON válido.');
    }
    const d = data as Partial<BackupData>;
    if (!d || d.app !== 'nutricontrol' || !Array.isArray(d.meals)) {
      throw new Error('Este archivo no es una copia de NutriControl.');
    }
    return d as BackupData;
  }

  /** Replace all current data with the backup's contents. */
  async restore(data: BackupData): Promise<RestoreResult> {
    await this.wipe();

    if (data.profile) {
      const { id: _id, updated_at: _u, ...rest } = data.profile;
      await this.profiles.save(rest);
    }

    for (const meal of data.meals) {
      await this.meals.add({
        date: meal.date,
        logged_at: meal.logged_at,
        meal_type: meal.meal_type,
        raw_text: meal.raw_text,
        total_calories: 0,
        total_protein_g: 0,
        total_fat_g: 0,
        total_carbs_g: 0,
        total_fiber_g: 0,
        items: meal.items,
      });
    }

    for (const w of data.weights) {
      await this.weights.upsert(w.date, w.weight_kg);
    }

    for (const fav of data.favorites) {
      await this.favorites.add(fav.name, fav.meal_type, fav.items);
    }

    for (const w of data.water ?? []) {
      await this.water.setForDate(w.date, w.ml);
    }

    return {
      meals: data.meals.length,
      weights: data.weights.length,
      favorites: data.favorites.length,
    };
  }

  /** Remove all rows (child rows go via ON DELETE CASCADE). */
  private async wipe(): Promise<void> {
    await this.db.run('DELETE FROM meals;', []);
    await this.db.run('DELETE FROM favorites;', []);
    await this.db.run('DELETE FROM weight_logs;', []);
    await this.db.run('DELETE FROM water_logs;', []);
    await this.db.run('DELETE FROM user_profile;', []);
  }
}
