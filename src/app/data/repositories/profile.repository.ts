import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '@core/database/database.service';
import {
  UserProfile,
  legacyGoal,
  legacyActivityLevel,
} from '@domain/models/user-profile.model';
import { ProfileRow, rowToProfile } from '../mappers/profile.mapper';

/**
 * Persistence for the single user profile row. Isolates SQLite from the rest
 * of the app (Repository pattern) so storage can change without touching state.
 */
@Injectable({ providedIn: 'root' })
export class ProfileRepository {
  private db = inject(DatabaseService);

  async get(): Promise<UserProfile | null> {
    const rows = await this.db.query<ProfileRow>(
      'SELECT * FROM user_profile ORDER BY id LIMIT 1;',
    );
    return rows.length ? rowToProfile(rows[0]) : null;
  }

  /** Upsert the profile (there is always at most one row). */
  async save(profile: Omit<UserProfile, 'id' | 'updated_at'>): Promise<void> {
    const existing = await this.get();
    const now = new Date().toISOString();
    const values = [
      profile.sex,
      profile.age,
      profile.weight_kg,
      profile.height_cm,
      profile.daily_activity,
      profile.training_days,
      profile.training_minutes,
      // legacy activity_level kept in sync with the new axes
      legacyActivityLevel(
        profile.daily_activity,
        profile.training_days,
        profile.training_minutes,
      ),
      profile.objective,
      profile.pace,
      profile.target_weight_kg,
      legacyGoal(profile.objective),
      profile.calories,
      profile.protein_g,
      profile.fat_g,
      profile.carbs_g,
      profile.targets_overridden ? 1 : 0,
      now,
    ];

    if (existing) {
      await this.db.run(
        `UPDATE user_profile SET sex=?, age=?, weight_kg=?, height_cm=?,
           daily_activity=?, training_days=?, training_minutes=?, activity_level=?,
           objective=?, pace=?, target_weight_kg=?, goal=?, target_calories=?,
           target_protein_g=?, target_fat_g=?, target_carbs_g=?,
           targets_overridden=?, updated_at=?
         WHERE id=?;`,
        [...values, existing.id],
      );
    } else {
      await this.db.run(
        `INSERT INTO user_profile
           (sex, age, weight_kg, height_cm, daily_activity, training_days,
            training_minutes, activity_level, objective, pace, target_weight_kg,
            goal, target_calories, target_protein_g, target_fat_g, target_carbs_g,
            targets_overridden, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
        values,
      );
    }
  }
}
