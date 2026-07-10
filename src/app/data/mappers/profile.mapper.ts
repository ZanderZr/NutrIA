import { UserProfile } from '@domain/models/user-profile.model';

/** SQLite row shape for user_profile (snake_case, integer booleans). */
export interface ProfileRow {
  id: number;
  sex: string;
  age: number;
  weight_kg: number;
  height_cm: number;
  activity_level: string;
  daily_activity: string;
  training_days: number;
  training_minutes: number;
  objective: string;
  pace: string;
  target_weight_kg: number | null;
  target_calories: number;
  target_protein_g: number;
  target_fat_g: number;
  target_carbs_g: number;
  targets_overridden: number;
  updated_at: string;
}

export function rowToProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    sex: row.sex as UserProfile['sex'],
    age: row.age,
    weight_kg: row.weight_kg,
    height_cm: row.height_cm,
    daily_activity: row.daily_activity as UserProfile['daily_activity'],
    training_days: row.training_days,
    training_minutes: row.training_minutes,
    objective: row.objective as UserProfile['objective'],
    pace: row.pace as UserProfile['pace'],
    target_weight_kg: row.target_weight_kg,
    calories: row.target_calories,
    protein_g: row.target_protein_g,
    fat_g: row.target_fat_g,
    carbs_g: row.target_carbs_g,
    targets_overridden: row.targets_overridden === 1,
    updated_at: row.updated_at,
  };
}
